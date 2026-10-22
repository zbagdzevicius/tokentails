/**
 * Wave C (C3): combat VFX juice, render only. Damage-scaled hit sparks and impact flashes, a big-hit pop, melee slash
 * arcs, element-coloured projectile and dash trails, ground debris themed by where it lands (grass, lane dirt, river
 * water, bridge wood, plaza stone), bigger ultimates, lightning for the Electric hero, level spikes at 4, 7 and 10
 * with a level aura underfoot, and casts that grow with the ability's C2 rank.
 *
 * Rules:
 * - Never a sim input. The sim and the backend verifier never import this file; it reads only snapshot data and
 *   events. Card skins have nothing to do with it: colours come from the hero's own element (data/heroes), never from
 *   a card, and nothing here changes a stat, a cooldown or a hitbox.
 * - Pooled: everything goes through the two particle pools (render/fx/Particles.js) and the shockwave and crack pools;
 *   the level aura is one 6-slot instanced decal layer. Option objects and scratch vectors are preallocated, so the
 *   per-frame paths (trails, auras, motes) allocate nothing.
 * - Budgets per quality tier (VFX_TIERS): a particle cap and a count scale. Reduce motion (render/fx/vfxPrefs.ts) cuts
 *   counts and drops the moving extras. Shake goes through Juice.kick, so the Screen shake setting applies.
 * - Never hide an enemy telegraph: wind-up telegraphs draw after every particle and shockwave layer (gameView), and
 *   the aura layer sits under them (renderOrder 1).
 */
import * as THREE from 'three';
import { HEROES } from '../../data/heroes';
import { LANE_WAYPOINTS, MAP, PLAYFIELD, RAT_CAMP } from '../../data/map';
import { BuffFlag, type HeroId } from '../../sim/api';
import { abilityRank, maxRank } from '../../sim/heroes/talents';
import { ELEMENT_COLOR } from '../cosmetics';
import type { ViewEntity } from '../interp';
import { toX, toZ } from '../coords';
import type { QualityTier } from '../quality';
import { mixHex } from '../skins/classify';
import { isGoldFamily } from '../skins/registry';
import { DecalLayer, ringTexture } from '../views/decals';
import { HERO_RING } from '../views/models';
import { FADE, GROW, SHAPE, type Particles } from './Particles.js';
import type { Shockwaves } from './Shockwaves.js';
import { REDUCED_COUNT } from './vfxPrefs';

// ------------------------------------------------------------------------------------------------ budgets

export interface VfxTier {
  /** Particle cap across both pools (Particles.setBudget). */
  particles: number;
  /** Burst count multiplier (Particles.setTier). */
  countScale: number;
  /** Projectile trail puffs per second. */
  trailHz: number;
  /** Ground debris count multiplier (0 = none). */
  debris: number;
  /** Projectile embers and level-aura motes. */
  extras: boolean;
  /** Lightning bolt segments. */
  lightning: number;
  /** Ground cracks under ultimates and max-rank slams. */
  cracks: number;
}

export const VFX_TIERS: Readonly<Record<QualityTier, Readonly<VfxTier>>> = Object.freeze({
  low: Object.freeze({ particles: 800, countScale: 0.6, trailHz: 15, debris: 0.45, extras: false, lightning: 5, cracks: 0 }),
  med: Object.freeze({ particles: 1600, countScale: 1, trailHz: 30, debris: 0.8, extras: true, lightning: 8, cracks: 2 }),
  high: Object.freeze({ particles: 2000, countScale: 1, trailHz: 45, debris: 1, extras: true, lightning: 12, cracks: 4 }),
});

/** Levels with a power spike (the level-up burst grows and the level aura steps up). */
export const SPIKE_LEVELS: readonly number[] = Object.freeze([4, 7, 10]);

/** Level aura step for a level: 0 below 4, then 1, 2, 3 at 4, 7 and 10. */
export function auraStep(level: number): number {
  let s = 0;
  for (const l of SPIKE_LEVELS) if (level >= l) s++;
  return s;
}

/**
 * VFX size multiplier for an ability at a level (C2 ranks): 1 at rank 1, +18% a rank, so a maxed Q (rank 4) is 1.54
 * and a maxed R (rank 3) 1.36. Visual only.
 */
export function rankScale(level: number, slot: number): number {
  if (slot < 0 || slot > 3) return 1;
  return 1 + 0.18 * Math.max(0, abilityRank(level, slot) - 1);
}

/** The ability is at its top rank (the cast gets a sparkle flourish). */
export const maxedRank = (level: number, slot: number): boolean => slot >= 0 && slot <= 3 && abilityRank(level, slot) >= maxRank(slot);

/** Damage → impact strength: √(amount / 120), clamped to 0.5..2.4. */
export function impactScale(amount: number): number {
  return Math.min(2.4, Math.max(0.5, Math.sqrt(Math.max(0, amount) / 120)));
}

/**
 * A big hit (the crit pop; the sim has no crits): a hero or ability hit on a hero for at least 16% of its max HP and
 * at least 150, or 260 or more outright.
 */
export function isBigHit(amount: number, maxHp: number, heroTarget: boolean): boolean {
  if (!heroTarget) return false;
  return amount >= 260 || (amount >= 150 && maxHp > 0 && amount * 100 >= maxHp * 16);
}

/** A hero's own element colour (never a card's). */
export const elementColor = (h: HeroId): number => ELEMENT_COLOR[HEROES[h].element];

/** Melee heroes (basic range ≤ 2 m) get the slash arc on their basic attacks. */
export const isMelee = (h: HeroId): boolean => HEROES[h].base.range <= 2000;

/** Ground marks under another player's hero never take the gold "you" family (yellow means you). */
export function auraColor(h: HeroId, self: boolean): number {
  const c = elementColor(h);
  return !self && isGoldFamily(c) ? mixHex(c, 0xffffff, 0.7) : c;
}

// ------------------------------------------------------------------------------------------------ biomes

export type Biome = 'grass' | 'dirt' | 'water' | 'wood' | 'stone';
const BIOMES: readonly Biome[] = ['grass', 'dirt', 'water', 'wood', 'stone'];

interface Debris {
  chip: number;
  shape: number;
  dust: number;
  dustAlpha: number;
}

/** Chips and dust per biome: blades of grass, lane pebbles, river droplets, bridge splinters, plaza stone. */
export const DEBRIS: Readonly<Record<Biome, Readonly<Debris>>> = Object.freeze({
  grass: Object.freeze({ chip: 0x6fbf55, shape: SHAPE.FEATHER, dust: 0xc4e6a6, dustAlpha: 0.45 }),
  dirt: Object.freeze({ chip: 0xc29a5c, shape: SHAPE.SHARD, dust: 0xead3a0, dustAlpha: 0.6 }),
  water: Object.freeze({ chip: 0x9fdcff, shape: SHAPE.DROPLET, dust: 0xf2fbff, dustAlpha: 0.6 }),
  wood: Object.freeze({ chip: 0x9a6a3e, shape: SHAPE.SHARD, dust: 0xd9b98a, dustAlpha: 0.5 }),
  stone: Object.freeze({ chip: 0xb3aca2, shape: SHAPE.SHARD, dust: 0xe8e2d6, dustAlpha: 0.55 }),
});

const GW = Math.round(MAP.width / 1000);
const GH = Math.round(MAP.height / 1000);
let biomeGrid: Uint8Array | null = null;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** 1 m biome cells, built once from data/map.ts (the same shapes mapView paints). */
function buildBiomes(): Uint8Array {
  const g = new Uint8Array(GW * GH);
  const W = MAP.width / 1000;
  const lanes: number[][] = [];
  for (const lane of ['sunny', 'puddle'] as const) {
    const pts = LANE_WAYPOINTS[lane].map(([x, y]) => [x / 1000, y / 1000]);
    const all = [...pts, ...pts.map(([x, y]) => [W - x, y]).reverse().slice(1)];
    lanes.push(all.flat());
  }
  const half = MAP.laneWidth / 2000;
  const [r0, r1] = [MAP.riverX[0] / 1000, MAP.riverX[1] / 1000];
  const [b0, b1, b2, b3] = PLAYFIELD.base.map((v) => v / 1000);
  const camp = [RAT_CAMP.x / 1000, RAT_CAMP.y / 1000];
  for (let cy = 0; cy < GH; cy++) {
    for (let cx = 0; cx < GW; cx++) {
      const x = cx + 0.5;
      const y = cy + 0.5;
      let lane = false;
      for (const pl of lanes) {
        for (let i = 0; i + 3 < pl.length && !lane; i += 2) if (segDist(x, y, pl[i], pl[i + 1], pl[i + 2], pl[i + 3]) <= half) lane = true;
        if (lane) break;
      }
      let b: Biome = 'grass';
      if (x >= r0 && x <= r1) b = lane ? 'wood' : 'water';
      else if ((x >= b0 && x <= b2 && y >= b1 && y <= b3) || (W - x >= b0 && W - x <= b2 && y >= b1 && y <= b3)) b = 'stone';
      else if (lane || Math.hypot(x - camp[0], y - camp[1]) <= 5.5 || Math.hypot(W - x - camp[0], y - camp[1]) <= 5.5) b = 'dirt';
      g[cy * GW + cx] = BIOMES.indexOf(b);
    }
  }
  return g;
}

/** The biome at a three.js ground point (m; z = −sim y). Off the map is grass (the forest ring). */
export function biomeAt(x: number, z: number): Biome {
  biomeGrid ??= buildBiomes();
  const cx = Math.floor(x);
  const cy = Math.floor(-z);
  if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return 'grass';
  return BIOMES[biomeGrid[cy * GW + cx]];
}

// ------------------------------------------------------------------------------------------------ option pools

/** A reusable burst/ring option bag (Particles.burst and .ring read these by name). */
class Burst {
  additive = false;
  n = 6;
  exact = false;
  shape: number = SHAPE.SOFT;
  color = 0xffffff;
  intensity = 1;
  readonly size = [0.1, 0.2];
  sizeEnd = 1;
  readonly life = [0.3, 0.5];
  readonly speed = [1, 2];
  dir: THREE.Vector3 | undefined = undefined;
  spread = Math.PI;
  gravity = 0;
  drag = 0;
  spin = 0;
  stretch = 1;
  fade: number = FADE.LINEAR;
  grow: number = GROW.LINEAR;
  jitter = 0;
  up = 0;
  floor = false;
  alpha = 1;
  tint = 0;
  bounce = 0.3;
  r0 = 0.2;
  y = 0.05;

  reset(): this {
    this.additive = false;
    this.n = 6;
    this.exact = false;
    this.shape = SHAPE.SOFT;
    this.color = 0xffffff;
    this.intensity = 1;
    this.sizes(0.1, 0.2);
    this.sizeEnd = 1;
    this.lives(0.3, 0.5);
    this.speeds(1, 2);
    this.dir = undefined;
    this.spread = Math.PI;
    this.gravity = 0;
    this.drag = 0;
    this.spin = 0;
    this.stretch = 1;
    this.fade = FADE.LINEAR;
    this.grow = GROW.LINEAR;
    this.jitter = 0;
    this.up = 0;
    this.floor = false;
    this.alpha = 1;
    this.tint = 0;
    this.bounce = 0.3;
    this.r0 = 0.2;
    this.y = 0.05;
    return this;
  }

  sizes(a: number, b: number): this {
    this.size[0] = a;
    this.size[1] = b;
    return this;
  }

  lives(a: number, b: number): this {
    this.life[0] = a;
    this.life[1] = b;
    return this;
  }

  speeds(a: number, b: number): this {
    this.speed[0] = a;
    this.speed[1] = b;
    return this;
  }
}

/** A reusable single-sprite option bag (Particles.single). */
class Single {
  shape: number = SHAPE.SOFT;
  color = 0xffffff;
  intensity = 1;
  size0 = 0.5;
  size1 = 0.5;
  life = 0.2;
  grow: number = GROW.OUT;
  fade: number = FADE.LINEAR;
  rot = 0;
  spin = 0;
  alpha = 1;
  vx = 0;
  vy = 0;
  vz = 0;
  additive = true;

  reset(): this {
    this.shape = SHAPE.SOFT;
    this.color = 0xffffff;
    this.intensity = 1;
    this.size0 = this.size1 = 0.5;
    this.life = 0.2;
    this.grow = GROW.OUT;
    this.fade = FADE.LINEAR;
    this.rot = this.spin = 0;
    this.alpha = 1;
    this.vx = this.vy = this.vz = 0;
    this.additive = true;
    return this;
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HEX: Record<number, string> = {};
/** '#rrggbb' for a colour, cached (Shockwaves take CSS colours). */
const css = (c: number): string => (HEX[c] ??= '#' + c.toString(16).padStart(6, '0'));

const AURA_SLOTS = 6;

export class CombatVfx {
  tier: Readonly<VfxTier> = VFX_TIERS.med;
  tierName: QualityTier = 'med';
  /** Reduce motion is on (fewer particles, no sweeps, flickers or motes). */
  reduced = false;
  /** Level auras: one ring layer under the telegraphs (renderOrder 1); up to two rings per hero (level 7+). */
  readonly auras = new DecalLayer(ringTexture(), AURA_SLOTS * 2, { additive: true, y: 0.042, renderOrder: 1, name: 'level-aura' });
  /** Most live particles seen (perf checks). */
  peak = 0;
  private time = 0;
  private readonly moteT = new Float32Array(AURA_SLOTS);
  private readonly o = new Burst();
  private readonly s = new Single();

  constructor(
    private readonly particles: Particles,
    private readonly shock: Shockwaves,
  ) {}

  /** Apply a quality tier and the reduce-motion switch to the particle pools. */
  setTier(t: QualityTier, reduced = this.reduced): void {
    this.tier = VFX_TIERS[t];
    this.tierName = t;
    this.reduced = reduced;
    this.particles.setBudget(this.tier.particles);
    this.particles.setTier({ countScale: this.tier.countScale * (reduced ? REDUCED_COUNT : 1), flat: t === 'low' || reduced });
  }

  /** Count multiplier for loops of single sprites (bursts are scaled by the pools themselves). */
  private get scale(): number {
    return this.tier.countScale * (this.reduced ? REDUCED_COUNT : 1);
  }

  private rnd(): number {
    return (this.particles as unknown as { rng: () => number }).rng();
  }

  // ---------------------------------------------------------------------------------------------- hits

  /**
   * Hit sparks and an impact flash sized by the damage. `ability` hits add a ring in the element colour; `big` adds
   * the crit pop (a star flash and a radial spray).
   */
  impact(pos: THREE.Vector3, amount: number, color: number, ability: boolean, big: boolean): void {
    const k = impactScale(amount);
    const o = this.o.reset();
    o.additive = true;
    o.n = Math.round(4 + 6 * k);
    o.shape = SHAPE.SPARK;
    o.color = color;
    o.intensity = 1.8 + 0.2 * k;
    o.sizes(0.07, 0.12 + 0.04 * k);
    o.lives(0.16, 0.26 + 0.05 * k);
    o.speeds(2.5 + k, 5 + 2.5 * k);
    o.stretch = 2.6;
    o.drag = 4;
    o.gravity = 6;
    this.particles.burst(pos, o);
    const s = this.s.reset();
    s.shape = SHAPE.STAR4;
    s.color = 0xfff6da;
    s.intensity = 2;
    s.size0 = 0.45 + 0.35 * k;
    s.size1 = 0.1;
    s.life = 0.12 + 0.02 * k;
    s.rot = this.rnd() * 3;
    this.particles.single(pos, s);
    if (ability || k > 1.3) {
      const r = this.s.reset();
      r.shape = SHAPE.RING;
      r.color = color;
      r.intensity = 1.5;
      r.size0 = 0.3;
      r.size1 = 1.1 + 0.6 * k;
      r.life = 0.22;
      r.alpha = 0.85;
      this.particles.single(pos, r);
    }
    if (big) this.bigHit(pos, color);
  }

  /** The crit pop: a big white star, a coloured STAR8 behind it and a ring of stars thrown out flat. */
  bigHit(pos: THREE.Vector3, color: number): void {
    const s = this.s.reset();
    s.shape = SHAPE.STAR8;
    s.color = color;
    s.intensity = 2.2;
    s.size0 = 2.2;
    s.size1 = 0.4;
    s.life = 0.2;
    s.rot = this.rnd() * 6;
    s.spin = this.reduced ? 0 : 4;
    this.particles.single(pos, s);
    const w = this.s.reset();
    w.shape = SHAPE.STAR4;
    w.color = 0xffffff;
    w.intensity = 2.6;
    w.size0 = 1.5;
    w.size1 = 0.2;
    w.life = 0.14;
    this.particles.single(pos, w);
    const o = this.o.reset();
    o.additive = true;
    o.n = 10;
    o.shape = SHAPE.STAR4;
    o.color = color;
    o.intensity = 2;
    o.sizes(0.16, 0.26);
    o.lives(0.25, 0.4);
    o.speeds(4, 7);
    o.drag = 5;
    o.up = 0.5;
    this.particles.burst(pos, o);
  }

  // ---------------------------------------------------------------------------------------------- melee

  /**
   * A slash crescent in front of a hero: a bright leading edge over a soft wide glow, swept from one side to the other
   * (`side` ±1 alternates swings), with a sparkle at the tip. `k` scales it (ability casts, ranks).
   */
  slash(x: number, z: number, yaw: number, r: number, arc: number, color: number, side: number, k = 1, y = 1.1): void {
    const n = Math.max(5, Math.round(9 * k * this.scale));
    const edge = mixHex(color, 0xffffff, 0.55);
    const sweep = this.reduced ? 0 : 3 * k;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = yaw + side * (t - 0.5) * arc;
      const ca = Math.cos(a);
      const sa = -Math.sin(a);
      // crescent: thickest in the middle of the swing
      const thick = Math.sin(t * Math.PI);
      _a.set(x + ca * r, y + t * 0.3, z + sa * r);
      const g = this.s.reset();
      g.shape = SHAPE.SOFT;
      g.color = color;
      g.intensity = 1.3;
      g.size0 = (0.6 + 0.5 * thick) * k;
      g.size1 = 0.1;
      g.life = 0.12 + t * 0.12;
      g.alpha = 0.55;
      g.vx = -sa * side * sweep;
      g.vz = ca * side * sweep;
      this.particles.single(_a, g);
      _a.set(x + ca * (r + 0.15 * k), y + t * 0.3, z + sa * (r + 0.15 * k));
      const e = this.s.reset();
      e.shape = SHAPE.SOFT;
      e.color = edge;
      e.intensity = 2;
      e.size0 = (0.28 + 0.22 * thick) * k;
      e.size1 = 0.05;
      e.life = 0.1 + t * 0.1;
      e.alpha = 0.95;
      e.vx = g.vx;
      e.vz = g.vz;
      this.particles.single(_a, e);
    }
    const tipA = yaw + side * 0.5 * arc;
    _a.set(x + Math.cos(tipA) * r, y + 0.3, z - Math.sin(tipA) * r);
    const tip = this.s.reset();
    tip.shape = SHAPE.STAR4;
    tip.color = 0xffffff;
    tip.intensity = 2;
    tip.size0 = 0.5 * k;
    tip.size1 = 0.05;
    tip.life = 0.16;
    tip.rot = this.rnd() * 3;
    this.particles.single(_a, tip);
  }

  // ---------------------------------------------------------------------------------------------- trails

  /**
   * One trail puff behind a projectile at `pos` (the caller paces it at `tier.trailHz`): a soft glow in `color` and,
   * on Med and High every other puff, a falling ember.
   */
  trail(pos: THREE.Vector3, color: number, size: number, ember: boolean): void {
    const o = this.o.reset();
    o.additive = true;
    o.n = 1;
    o.exact = true;
    o.shape = SHAPE.SOFT;
    o.color = color;
    o.intensity = 1.5;
    o.sizes(size, size * 1.4);
    o.sizeEnd = 0.2;
    o.lives(0.18, 0.3);
    o.speeds(0.1, 0.4);
    this.particles.burst(pos, o);
    if (!ember || !this.tier.extras || this.reduced) return;
    o.shape = SHAPE.SPARK;
    o.color = mixHex(color, 0xffffff, 0.4);
    o.intensity = 2;
    o.sizes(0.05, 0.09);
    o.sizeEnd = 1;
    o.lives(0.25, 0.4);
    o.speeds(0.6, 1.4);
    o.gravity = 4;
    o.stretch = 2;
    this.particles.burst(pos, o);
  }

  /** A dash: element-coloured streaks along the path, after-image glows, and debris kicked up at the start. */
  dash(x0: number, z0: number, x1: number, z1: number, color: number, k = 1): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (!(len > 0.05)) return;
    _d.set((x1 - x0) / len, 0, (z1 - z0) / len);
    const n = Math.max(4, Math.round(10 * this.scale));
    const o = this.o.reset();
    o.additive = true;
    o.n = 1;
    o.exact = true;
    o.shape = SHAPE.SPARK;
    o.color = color;
    o.intensity = 2;
    o.sizes(0.1 * k, 0.16 * k);
    o.lives(0.2, 0.3);
    o.speeds(this.reduced ? 1 : 7, this.reduced ? 2 : 10);
    o.dir = _d;
    o.spread = 0.06;
    o.stretch = 3.5;
    o.drag = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      _a.set(x0 + (x1 - x0) * t, 0.6 + this.rnd() * 0.6, z0 + (z1 - z0) * t);
      this.particles.burst(_a, o);
      const g = this.s.reset();
      g.shape = SHAPE.SOFT;
      g.color = color;
      g.intensity = 1.2;
      g.size0 = 1.1 * k;
      g.size1 = 0.2;
      g.life = 0.2 + t * 0.15;
      g.alpha = 0.5;
      _a.y = 0.9;
      this.particles.single(_a, g);
    }
    this.debris(x0, z0, 0.7 * k);
  }

  // ---------------------------------------------------------------------------------------------- ground

  /** Debris themed by the biome at (x, z): chips that bounce on the ground and a puff of dust (or a splash). */
  debris(x: number, z: number, k = 1): void {
    if (this.tier.debris <= 0) return;
    const b = biomeAt(x, z);
    const d = DEBRIS[b];
    _a.set(x, 0.15, z);
    const o = this.o.reset();
    o.n = Math.max(1, Math.round((3 + 5 * k) * this.tier.debris));
    o.shape = d.shape;
    o.color = d.chip;
    o.tint = 0.2;
    o.sizes(0.07 + 0.02 * k, 0.13 + 0.04 * k);
    o.lives(0.5, 0.85);
    o.speeds(1.4, 2.6 + 1.4 * k);
    o.dir = UP;
    o.spread = 1.2;
    o.up = 1.5 + k;
    o.gravity = b === 'water' ? 10 : 13;
    o.drag = 0.4;
    o.spin = b === 'grass' ? 6 : 10;
    o.fade = FADE.HOLD;
    o.floor = true;
    o.bounce = b === 'water' ? 0 : 0.35;
    o.jitter = 0.25;
    this.particles.burst(_a, o);
    const p = this.o.reset();
    p.n = Math.max(1, Math.round((2 + 3 * k) * this.tier.debris));
    p.shape = SHAPE.PUFF;
    p.color = d.dust;
    p.alpha = d.dustAlpha;
    p.sizes(0.3, 0.5);
    p.sizeEnd = 2;
    p.lives(0.35, 0.6);
    p.speeds(0.6, 1.6);
    p.up = 0.4;
    p.drag = 3;
    p.jitter = 0.3;
    _a.y = 0.2;
    this.particles.burst(_a, p);
    if (b === 'water') {
      const r = this.s.reset();
      r.shape = SHAPE.RING;
      r.color = 0xeaf8ff;
      r.intensity = 1.2;
      r.size0 = 0.4;
      r.size1 = 1.8 + k;
      r.life = 0.35;
      r.alpha = 0.7;
      _a.y = 0.08;
      this.particles.single(_a, r);
    }
  }

  // ---------------------------------------------------------------------------------------------- big moments

  /** A column of light at (x, z): rising glows and a star crown (ultimates and level spikes). */
  pillar(x: number, z: number, color: number, k = 1): void {
    _a.set(x, 0.2, z);
    const o = this.o.reset();
    o.additive = true;
    o.n = Math.round(14 * k);
    o.shape = SHAPE.SOFT;
    o.color = color;
    o.intensity = 1.8;
    o.sizes(0.5 * k, 0.9 * k);
    o.sizeEnd = 0.3;
    o.lives(0.45, 0.75);
    o.speeds(this.reduced ? 2 : 5, this.reduced ? 3 : 9);
    o.dir = UP;
    o.spread = 0.12;
    o.drag = 2.2;
    o.jitter = 0.35;
    this.particles.burst(_a, o);
    _a.y = 3.6 * k;
    const s = this.s.reset();
    s.shape = SHAPE.STAR8;
    s.color = mixHex(color, 0xffffff, 0.4);
    s.intensity = 2.2;
    s.size0 = 0.4;
    s.size1 = 2.2 * k;
    s.life = 0.4;
    s.fade = FADE.POP;
    s.spin = this.reduced ? 0 : 2;
    this.particles.single(_a, s);
  }

  /**
   * An ultimate: a ground wave in the relation colour (an enemy ultimate reads red as a threat, ours rose, yours
   * gold), a pillar in the element colour, a ring of sparks, and ground cracks on Med and High. `k` grows with the rank.
   */
  /**
   * The ult's "who" mark only (a hero whose own skill FX draws the ult): one relation-coloured ring at the caster and a
   * star burst, no pillar, cracks or debris that would compete with (or misplace) the hero's own shape.
   */
  ultimateMark(x: number, z: number, color: number, relation: number): void {
    _a.set(x, 0, z);
    this.shock.start(_a, { r1: 3.2, dur: 0.38, color: css(relation), height: 0.8, intensity: 1.4 });
    _a.set(x, 0.15, z);
    const o = this.o.reset();
    o.additive = true;
    o.n = 14;
    o.shape = SHAPE.STAR4;
    o.color = color;
    o.intensity = 1.6;
    o.sizes(0.25, 0.4);
    o.sizeEnd = 1;
    o.lives(0.35, 0.55);
    o.speeds(3, 5);
    o.up = 1.2;
    o.drag = 3;
    o.r0 = 0.5;
    o.alpha = 0.9;
    this.particles.ring(_a, o);
  }

  ultimate(x: number, z: number, color: number, relation: number, radius: number, k = 1): void {
    _a.set(x, 0, z);
    const r1 = Math.min(9, Math.max(3.5, radius)) * (0.85 + 0.15 * k);
    this.shock.start(_a, { r1, dur: 0.45, color: css(relation), height: 1.1, intensity: 1.6 });
    this.shock.start(_a, { r1: r1 * 0.6, dur: 0.3, color: css(color), height: 0.6 });
    this.pillar(x, z, color, 1 + 0.25 * (k - 1));
    _a.set(x, 0.15, z);
    const o = this.o.reset();
    o.additive = true;
    o.n = Math.round(24 * k);
    o.shape = SHAPE.STAR4;
    o.color = color;
    o.intensity = 1.8;
    o.sizes(0.3, 0.5);
    o.sizeEnd = 1;
    o.lives(0.45, 0.7);
    o.speeds(4, 7);
    o.up = 1.4;
    o.drag = 3;
    o.r0 = 0.6;
    o.alpha = 0.95;
    this.particles.ring(_a, o);
    const cracks = this.reduced ? 0 : this.tier.cracks;
    for (let i = 0; i < cracks; i++) {
      const a = (i / cracks) * Math.PI * 2 + this.rnd() * 0.6;
      _d.set(Math.cos(a), 0, Math.sin(a));
      this.shock.crack(_a, _d, { length: r1 * 0.55, width: 0.7, color: css(color), travel: 0.14, life: 0.5 });
    }
    this.debris(x, z, 1.6);
  }

  /**
   * A jagged lightning bolt from a to b (m): bright dots along random kinks with a white core, and a flash where it
   * lands. Segments per tier.
   */
  lightning(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number): void {
    const segs = this.tier.lightning;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (!(len > 0.1)) return;
    // a sideways axis for the kinks (perpendicular to the bolt, roughly screen-facing)
    _d.set(bz - az, 0, -(bx - ax));
    if (_d.lengthSq() < 1e-6) _d.set(1, 0, 0);
    _d.normalize();
    const kink = Math.min(0.9, len * 0.12);
    let px = ax;
    let py = ay;
    let pz = az;
    const life = this.reduced ? 0.22 : 0.14;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const off = i === segs ? 0 : (this.rnd() * 2 - 1) * kink;
      const nx = ax + (bx - ax) * t + _d.x * off;
      const ny = ay + (by - ay) * t + (this.rnd() - 0.5) * kink * 0.5;
      const nz = az + (bz - az) * t + _d.z * off;
      for (let j = 0; j < 3; j++) {
        const u = (j + 0.5) / 3;
        _a.set(px + (nx - px) * u, py + (ny - py) * u, pz + (nz - pz) * u);
        const g = this.s.reset();
        g.shape = SHAPE.SOFT;
        g.color = color;
        g.intensity = 2.2;
        g.size0 = 0.42;
        g.size1 = 0.12;
        g.life = life + this.rnd() * 0.05;
        g.fade = this.reduced ? FADE.LINEAR : FADE.TWINKLE;
        this.particles.single(_a, g);
        const c = this.s.reset();
        c.shape = SHAPE.SOFT;
        c.color = 0xffffff;
        c.intensity = 2.6;
        c.size0 = 0.16;
        c.size1 = 0.05;
        c.life = life;
        this.particles.single(_a, c);
      }
      px = nx;
      py = ny;
      pz = nz;
    }
    _b.set(bx, by, bz);
    const f = this.s.reset();
    f.shape = SHAPE.STAR8;
    f.color = color;
    f.intensity = 2.4;
    f.size0 = 1.4;
    f.size1 = 0.2;
    f.life = 0.18;
    this.particles.single(_b, f);
  }

  /**
   * A level-up burst for any hero: the small gold ring every level (Effects), and at 4, 7 and 10 a power spike that
   * enemies can read too: a pillar, a wave and a star fountain in the element colour, bigger each step.
   */
  levelSpike(x: number, z: number, level: number, color: number): void {
    const step = auraStep(level);
    if (step === 0 || !SPIKE_LEVELS.includes(level)) return;
    const k = 0.8 + 0.2 * step;
    _a.set(x, 0, z);
    this.shock.start(_a, { r1: 3 + step, dur: 0.45, color: css(color), height: 0.5 + 0.2 * step });
    this.pillar(x, z, color, k);
    _a.set(x, 0.4, z);
    const o = this.o.reset();
    o.additive = true;
    o.n = 10 + 6 * step;
    o.shape = SHAPE.STAR5;
    o.color = color;
    o.intensity = 2;
    o.sizes(0.2, 0.34);
    o.lives(0.6, 1);
    o.speeds(2, 4);
    o.up = 4.5;
    o.gravity = 6;
    this.particles.burst(_a, o);
  }

  /** A sparkle ring at a maxed ability's cast (the top C2 rank). */
  rankFlourish(x: number, z: number, color: number): void {
    _a.set(x, 0.3, z);
    const o = this.o.reset();
    o.additive = true;
    o.n = 12;
    o.shape = SHAPE.STAR4;
    o.color = mixHex(color, 0xffffff, 0.35);
    o.intensity = 2;
    o.sizes(0.16, 0.26);
    o.sizeEnd = 0.4;
    o.lives(0.35, 0.55);
    o.speeds(1.6, 2.6);
    o.up = 1.6;
    o.drag = 2;
    o.r0 = 0.5;
    o.alpha = 1;
    this.particles.ring(_a, o);
  }

  // ---------------------------------------------------------------------------------------------- per frame

  /**
   * Level auras under every visible living hero at level 4+: one ring at 4, a brighter pulsing ring at 7, a bright
   * double pulse at 10, with rising motes from 7 on Med and High (not under reduce motion). A stealthed hero shows
   * nothing. No allocation.
   */
  update(dt: number, heroes: readonly ViewEntity[], mySlot: number): void {
    this.time += dt;
    const live = (this.particles as unknown as { live: number }).live;
    if (live > this.peak) this.peak = live;
    const L = this.auras;
    L.begin();
    for (let i = 0; i < heroes.length; i++) {
      const e = heroes[i];
      if (e.kind !== 'hero' || !e.hero || e.state === 'dead' || (e.buffs & BuffFlag.Stealth) !== 0) continue;
      const step = auraStep(e.level ?? 1);
      if (step === 0) continue;
      const x = toX(e.fx);
      const z = toZ(e.fy);
      const c = auraColor(e.hero, e.id === mySlot);
      const base = HERO_RING[e.hero] * 1.32;
      const pulse = this.reduced ? 0 : Math.sin(this.time * (2 + step) + e.id);
      L.add(x, z, base * (1 + 0.03 * pulse), c, 0.22 + 0.12 * step + 0.05 * pulse);
      if (step >= 2) L.add(x, z, base * (1.12 + (this.reduced ? 0 : ((this.time * 0.6 + e.id * 0.17) % 1) * 0.25)), c, 0.18 + 0.06 * step);
      if (!this.tier.extras || this.reduced || step < 2 || e.id < 0 || e.id >= AURA_SLOTS) continue;
      this.moteT[e.id] -= dt;
      if (this.moteT[e.id] > 0) continue;
      this.moteT[e.id] = step >= 3 ? 0.18 : 0.32;
      const a = this.rnd() * Math.PI * 2;
      _a.set(x + Math.cos(a) * base * 0.5, 0.2, z + Math.sin(a) * base * 0.5);
      const m = this.s.reset();
      m.shape = SHAPE.STAR4;
      m.color = c;
      m.intensity = 1.6;
      m.size0 = 0.16;
      m.size1 = 0.06;
      m.life = 0.7;
      m.vy = 1.6;
      m.fade = FADE.IN_OUT;
      this.particles.single(_a, m);
    }
    L.end();
  }

  dispose(): void {
    this.auras.dispose();
  }
}

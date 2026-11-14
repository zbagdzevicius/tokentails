/**
 * Coat signature effects (gaps3 coat-fx; Wild Rift / Mobile Legends "skins in a match"): every Epic and Legendary coat
 * (the six with model parts, render/chars/coatParts.ts) has its own ultimate, recall and takedown effect in its theme,
 * and every Rare coat gets the shared Rare set, recoloured in the coat's colours and drawn in its element motif.
 *
 * | Coat (rung)              | Ultimate                        | Recall (nap, then landing)        | Takedown                  |
 * |--------------------------|---------------------------------|-----------------------------------|---------------------------|
 * | Thunderpaw (Legendary)   | three bolts strike the ring     | crackle, a bolt brings him home   | a bolt hits the fallen    |
 * | Sunforged (Legendary)    | a sun rises, rays sweep out     | a sun halo, a sunrise on landing  | a sunburst                |
 * | Bloomtail (Legendary)    | a petal storm round a bloom     | petals drift, a bloom on landing  | a flower opens            |
 * | Eclipse (Epic)           | a violet corona, a gold ring    | an orb circles, the eclipse ring  | a dark ring, gold motes   |
 * | Moonwhisker (Epic)       | a star shower under a moon      | stars twinkle, stars fall         | stars fall on the fallen  |
 * | Frostbell (Epic)         | ice shards, snow and a bell     | snow falls, a frost ring          | shards burst, the bell    |
 * | every Rare coat          | a motif ring in the coat colour | (the kit's motif nap) a motif ring| a 3-motif stamp           |
 *
 * Rules (as render/skins/cardFx.ts and tierFx.ts; CARD-SKINS.md §4):
 * - render only: nothing here is sim input; the sim, the replay and the backend verifier never import it;
 * - no draw call of its own: every sprite goes through the two pooled particle meshes, the bolts through CombatVfx's
 *   lightning (particles too) and at most one pooled shockwave per Legendary ultimate (it replaces the card paw wave's);
 * - the threat stays readable: nothing passes the ultimate's own wave radius, colours come from the hero's profile
 *   (team-safe on another player's hero: never gold, never the opposing team's hue);
 * - tiers: Low draws about half (no shockwave; bolts on the player's own hero only); another player's hero only with
 *   `extras` (Med / High, outside a team fight, not stealthed, the Skin effects setting);
 * - budget: COAT_MAX live sprites in all and the per-hero rung cap (effectKit HERO_FX_CAP), skipped while either
 *   particle pool is over 80 %; preallocated: no allocation per call.
 */
import * as THREE from 'three';
import { FADE, GROW, SHAPE } from '../fx/Particles.js';
import { mixHex } from './classify';
import { HERO_FX_CAP, LiveBudget, MotifEmitter, safe, type KitParticles, type SkinFxProfile } from './effectKit';
import { coatTheme, type CoatTheme } from './coatThemes';

export { COAT_THEMES, RARE_SET, coatFxWords, coatTheme, type CoatFxKind, type CoatTheme, type CoatThemeDef } from './coatThemes';

/** Live coat-effect sprites at most, all heroes together. */
export const COAT_MAX = 48;
/** Skip while a pool is over this share of its limit (as cardFx / tierFx). */
export const COAT_POOL_SKIP = 0.8;
/** A lightning bolt counts this many sprites against the budgets (CombatVfx.lightning draws a few per segment). */
export const BOLT_COST = 3;
/** A strike: the bolt, its falling streak and the flash where it hits. */
export const STRIKE_COST = BOLT_COST + 2;


/** The particle API (render/fx/Particles.js). */
export interface CoatParticles extends KitParticles {
  burst(pos: THREE.Vector3, o: Record<string, unknown>): void;
}
export interface CoatShock {
  start(pos: THREE.Vector3, o: Record<string, unknown>): unknown;
}
/** A lightning bolt from a to b (render/fx/combatVfx.ts `lightning`). */
export type CoatBolt = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number) => void;

/**
 * The sprites each effect costs (full detail, Low), per theme and for the Rare set. Inside the per-hero rung cap
 * (Legendary 24, Epic 16, Rare 8) so one effect never has to be cut short by another of the same hero's.
 */
export const COAT_COST: Readonly<Record<CoatTheme | 'rare', Readonly<Record<'ult' | 'nap' | 'land' | 'takedown', readonly [number, number]>>>> = Object.freeze({
  thunder: { ult: [8 + 3 * STRIKE_COST, 5 + STRIKE_COST], nap: [3, 2], land: [9 + STRIKE_COST, 5 + STRIKE_COST], takedown: [7 + STRIKE_COST, 4 + STRIKE_COST] },
  sun: { ult: [18, 9], nap: [6, 3], land: [12, 6], takedown: [8, 5] },
  bloom: { ult: [19, 10], nap: [5, 3], land: [13, 7], takedown: [9, 5] },
  eclipse: { ult: [11, 6], nap: [3, 2], land: [8, 5], takedown: [6, 4] },
  moon: { ult: [12, 6], nap: [3, 2], land: [8, 5], takedown: [6, 4] },
  frost: { ult: [14, 7], nap: [3, 2], land: [10, 5], takedown: [7, 4] },
  rare: { ult: [7, 4], nap: [0, 0], land: [6, 4], takedown: [3, 2] },
});

const hexCss = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const GOLDEN = 2.39996;

export class CoatVfx {
  /** Sprites started so far (tests). */
  emitted = 0;
  /** Effects drawn so far by kind (tests, e2e). */
  readonly drawn = { ult: 0, nap: 0, land: 0, takedown: 0 };
  /** CombatVfx.lightning, set by the GameView (null: no bolts, e.g. in tests). */
  bolt: CoatBolt | null = null;
  private time = 0;
  private readonly live = new LiveBudget(COAT_MAX);
  private readonly kit = new MotifEmitter();
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  /** One sprite (Particles.single). */
  private readonly one: Record<string, unknown> = { shape: SHAPE.STAR8, color: 0xffffff, intensity: 1.8, size0: 0.3, size1: 0.2, life: 0.5, grow: GROW.OUT, fade: FADE.LINEAR, rot: 0, spin: 0, alpha: 0.95, vx: 0, vy: 0, vz: 0, additive: true };
  /** A directed burst (the sun's rays). */
  private readonly ray: Record<string, unknown> = { additive: true, n: 1, exact: true, dir: null, spread: 0.04, shape: SHAPE.SPARK, color: 0xffffff, intensity: 2.2, size: [0.2, 0.26], sizeEnd: 0.6, life: [0.42, 0.5], speed: [7, 8], stretch: 4, drag: 4, alpha: 0.95 };
  private readonly wave: Record<string, unknown> = { r1: 3, dur: 0.5, color: '#ffffff', height: 0.35, intensity: 1.1 };

  constructor(
    private readonly particles: CoatParticles,
    private readonly shock: CoatShock | null,
  ) {
    this.ray.dir = this.dir;
  }

  tick(dt: number): void {
    this.time += dt;
  }

  /** Living coat sprites (all heroes, or hero slot `id`). */
  alive(id = -1): number {
    return this.live.alive(this.time, id);
  }

  /** The theme a profile draws (null: a card skin, below Rare, or no extras). 'rare': the shared Rare set. */
  themeOf(p: SkinFxProfile | null | undefined): CoatTheme | 'rare' | null {
    if (!p || p.source !== 'coat' || !p.extras) return null;
    if (p.rung === 'COMMON') return null;
    if (p.rung === 'RARE') return 'rare';
    return coatTheme(p.coatId)?.theme ?? 'rare';
  }

  private room(n: number, p: SkinFxProfile): boolean {
    const q = this.particles;
    if (q.add.count > q.add.limit * COAT_POOL_SKIP || q.alpha.count > q.alpha.limit * COAT_POOL_SKIP) return false;
    if (this.live.alive(this.time) + n > COAT_MAX) return false;
    return this.live.alive(this.time, p.id) + n <= HERO_FX_CAP[p.rung];
  }

  private claim(n: number, life: number, p: SkinFxProfile): void {
    this.live.claim(this.time, n, life, p.id);
    this.emitted += n;
  }

  /** Gate + budget for one effect; returns the cost to claim, or -1 to skip. */
  private gate(p: SkinFxProfile | null | undefined, kind: 'ult' | 'nap' | 'land' | 'takedown'): { theme: CoatTheme | 'rare'; n: number } | null {
    const theme = this.themeOf(p);
    if (!theme || !p) return null;
    const n = COAT_COST[theme][kind][p.low ? 1 : 0];
    if (n <= 0 || !this.room(n, p)) return null;
    return { theme, n };
  }

  // ------------------------------------------------------------------------------------------------ primitives

  private sprite(x: number, y: number, z: number, shape: number, color: number, size: number, life: number, vx = 0, vy = 0, vz = 0, grow: number = GROW.OUT, fade: number = FADE.LINEAR, sizeEnd = 0.5, spin = 0, additive = true): void {
    const s = this.one;
    s.shape = shape;
    s.color = color;
    s.intensity = additive ? 1.9 : 1;
    s.alpha = 0.95;
    s.size0 = size;
    s.size1 = size * sizeEnd;
    s.life = life;
    s.grow = grow;
    s.fade = fade;
    s.rot = 0;
    s.spin = spin;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.additive = additive;
    this.at.set(x, y, z);
    this.particles.single(this.at, s);
  }

  /** `n` sprites round a circle of radius r at height y, moving out at `out` m/s and up at `up` (tangential `swirl`). */
  private circle(x: number, y: number, z: number, n: number, r: number, shape: number, c0: number, c1: number, size: number, life: number, out: number, up: number, swirl = 0, phase = 0.3, additive = true): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      this.sprite(x + ca * r, y, z + sa * r, shape, i % 2 ? c1 : c0, size, life, ca * out - sa * swirl, up, sa * out + ca * swirl, GROW.OUT, FADE.LINEAR, 0.5, 2, additive);
    }
  }

  /** `n` sprites falling from height `h` onto a disc of radius r (golden-angle spread: the same every time). */
  private fall(x: number, z: number, n: number, r: number, h: number, shape: number, c0: number, c1: number, size: number, life: number, speed: number, fade: number = FADE.LINEAR): void {
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN;
      const k = r * Math.sqrt((i + 0.5) / n);
      this.sprite(x + Math.cos(a) * k, h + (i % 3) * 0.35, z + Math.sin(a) * k, shape, i % 2 ? c1 : c0, size, life, 0, -speed, 0, GROW.LINEAR, fade, 0.7, 1.5);
    }
  }

  /** `n` stretched rays out from (x, y, z) in the ground plane. */
  private rays(x: number, y: number, z: number, n: number, c0: number, c1: number, reach: number, phase = 0): void {
    const o = this.ray;
    o.speed = [reach * 2.4, reach * 2.7];
    this.at.set(x, y, z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      this.dir.set(Math.cos(a), 0.06, Math.sin(a));
      o.color = i % 2 ? c1 : c0;
      this.particles.burst(this.at, o);
    }
  }

  /** A bolt from above the frame to (x, z), with a falling light streak along it and a flash where it hits. */
  private strike(x: number, z: number, color: number, flash: number, h = 5): void {
    this.bolt?.(x + 0.35, h, z - 0.25, x, 0.1, z, color);
    this.streak(x, h, z, color, -1);
    this.sprite(x, 0.5, z, SHAPE.STAR8, color, flash, 0.32, 0, 0.4, 0, GROW.OUT, FADE.POP, 0.4, 3);
  }

  /** One stretched streak of light from height y (dir -1: falling to the ground, 1: rising). */
  private streak(x: number, y: number, z: number, color: number, dir: 1 | -1, size = 0.5): void {
    const o = this.ray;
    o.speed = [y * 5.5, y * 6];
    o.size = [size, size];
    o.color = color;
    o.life = [0.18, 0.2];
    o.stretch = 9;
    this.dir.set(0, dir, 0);
    this.at.set(x, y, z);
    this.particles.burst(this.at, o);
    o.size = [0.2, 0.26];
    o.life = [0.42, 0.5];
    o.stretch = 4;
  }

  private ring(x: number, z: number, r: number, color: number): void {
    if (!this.shock) return;
    this.at.set(x, 0, z);
    this.wave.r1 = r;
    this.wave.color = hexCss(color);
    this.shock.start(this.at, this.wave);
  }

  // ------------------------------------------------------------------------------------------------ the effects

  /**
   * The ultimate (`r1`: the ultimate's own wave radius, render/effects.ts ultWaveRadius). True when drawn (the caller
   * then skips the card paw wave, which this replaces for a coat).
   */
  ult(x: number, z: number, r1: number, p: SkinFxProfile | null | undefined): boolean {
    const g = this.gate(p, 'ult');
    if (!g || !p) return false;
    const low = p.low;
    const r = Math.max(1.2, r1 * 0.7);
    const t = p.tint;
    const a = p.accent;
    const cr = p.cream;
    const legendary = p.rung === 'LEGENDARY';
    switch (g.theme) {
      case 'thunder': {
        // the bolts strike round the ring (Low: one, on the player's own hero), sparks run out along the ground, a
        // storm ring grows from the caster
        const bolts = low ? (p.self ? 1 : 0) : 3;
        for (let i = 0; i < bolts; i++) {
          const ang = (i / 3) * Math.PI * 2 + 0.5;
          const k = bolts === 1 ? 0 : r * 0.6;
          this.strike(x + Math.cos(ang) * k, z + Math.sin(ang) * k, i % 2 ? a : t, 1.2);
        }
        this.circle(x, 0.35, z, low ? 4 : 6, 0.5, SHAPE.STAR4, t, a, 0.5, 0.5, r * 1.6, 0.6);
        this.sprite(x, 1.1, z, SHAPE.STAR8, t, low ? 1.3 : 1.8, 0.35, 0, 0.6, 0, GROW.OUT, FADE.POP, 0.3, 4);
        if (!low) this.sprite(x, 0.5, z, SHAPE.RING, a, 0.8, 0.45, 0, 0, 0, GROW.OUT, FADE.LINEAR, 7);
        break;
      }
      case 'sun': {
        // a sun rises over the caster; its rays sweep out across the ground, magenta embers drift up
        this.sprite(x, 1.4, z, SHAPE.SOFT, t, low ? 2.2 : 3, 0.8, 0, 1.2, 0, GROW.BACK, FADE.IN_OUT, 1.2);
        this.sprite(x, 1.4, z, SHAPE.RING, cr, 0.9, 0.6, 0, 1.2, 0, GROW.OUT, FADE.LINEAR, 5.5);
        this.rays(x, 0.5, z, low ? 5 : 10, t, cr, r, 0.2);
        if (!low) this.circle(x, 0.4, z, 4, 0.6, SHAPE.SPARK, a, a, 0.34, 0.8, 1, 2.2, 1.5);
        else this.sprite(x, 0.5, z, SHAPE.SPARK, a, 0.34, 0.7, 0, 2, 0);
        break;
      }
      case 'bloom': {
        // petals swirl out from an opening bloom, leaves ride with them (normal blending: pink stays pink on grass)
        this.circle(x, 0.45, z, low ? 6 : 12, 0.6, SHAPE.HEART, t, safe(mixHex(t, cr, 0.4), p.self, p.team, p.mate), 0.44, 0.8, r * 1.2, 0.5, 3.5, 0.3, false);
        this.circle(x, 0.55, z, low ? 3 : 5, 0.4, SHAPE.FEATHER, a, a, 0.46, 0.8, r * 0.9, 0.8, -2.5, 1.1, false);
        this.sprite(x, 0.7, z, SHAPE.STAR5, cr, 0.6, 0.7, 0, 0.5, 0, GROW.BACK, FADE.HOLD, 4, 1);
        if (!low) this.sprite(x, 0.7, z, SHAPE.STAR5, t, 0.45, 0.6, 0, 0.5, 0, GROW.BACK, FADE.HOLD, 6, -1);
        break;
      }
      case 'eclipse': {
        // the corona grows round a dark heart; the gold ring flares inside it; gold motes rise round the edge
        this.sprite(x, 1.5, z, SHAPE.RING, t, 0.9, 0.75, 0, 0.3, 0, GROW.OUT, FADE.IN_OUT, 5.5);
        this.sprite(x, 1.5, z, SHAPE.RING, a, 0.6, 0.6, 0, 0.3, 0, GROW.BACK, FADE.LINEAR, 4);
        this.circle(x, 0.3, z, low ? 4 : 8, r * 0.6, SHAPE.STAR8, a, t, 0.38, 0.75, 0.4, 1.8, 1.2);
        if (!low) this.sprite(x, 1.5, z, SHAPE.SOFT, t, 2, 0.5, 0, 0.3, 0, GROW.OUT, FADE.POP, 0.6);
        break;
      }
      case 'moon': {
        // a pale moon hangs over the caster while stars shower down inside the ring
        this.sprite(x, 2.8, z, SHAPE.RING, a, 1.6, 0.9, 0, 0, 0, GROW.BACK, FADE.IN_OUT, 1.4);
        this.sprite(x, 2.8, z, SHAPE.SOFT, cr, 1.5, 0.9, 0, 0, 0, GROW.OUT, FADE.IN_OUT, 1.2);
        this.fall(x, z, low ? 4 : 10, r * 0.75, 4.5, SHAPE.STAR5, t, a, 0.48, 0.75, 6, FADE.HOLD);
        break;
      }
      case 'frost': {
        // ice shards shoot out along the ground, snow falls, and the frost bell rings over the caster
        this.circle(x, 0.3, z, low ? 4 : 8, 0.5, SHAPE.SHARD, t, cr, 0.5, 0.5, r * 1.7, 0.4);
        this.fall(x, z, low ? 2 : 4, r * 0.6, 3.5, SHAPE.STAR8, cr, t, 0.36, 0.9, 3);
        this.sprite(x, 2.5, z, SHAPE.NOTE, a, 0.85, 0.8, 0, 0.8, 0, GROW.BACK, FADE.HOLD, 1, 0);
        if (!low) this.sprite(x, 2.5, z, SHAPE.RING, t, 0.6, 0.5, 0, 0.8, 0, GROW.OUT, FADE.LINEAR, 4);
        break;
      }
      default: {
        // Rare: a ring of the element motif in the coat colours, flat on the ground inside the ultimate's wave
        this.kit.emit(this.particles, p, x, 0.15, z, low ? 3 : 6, r * 0.6, 0.6, true, 0.8);
        this.sprite(x, 0.4, z, SHAPE.RING, t, 0.6, 0.45, 0, 0, 0, GROW.OUT, FADE.LINEAR, Math.min(8, r * 1.6));
      }
    }
    // a Legendary's wave in the coat colour, inside the ultimate's own (it replaces the card paw wave's shockwave)
    if (legendary && !low) this.ring(x, z, r1 * 0.8, t);
    this.claim(g.n, 0.9, p);
    this.drawn.ult++;
    return true;
  }

  /** One recall-nap beat (tierFx calls it once a NAP_GAP while the hero naps). True when drawn. */
  nap(x: number, z: number, p: SkinFxProfile | null | undefined): boolean {
    const g = this.gate(p, 'nap');
    if (!g || !p || g.theme === 'rare') return false;
    const low = p.low;
    const t = p.tint;
    const a = p.accent;
    const cr = p.cream;
    const ph = this.time * 1.7;
    switch (g.theme) {
      case 'thunder':
        this.circle(x, 0.9, z, low ? 2 : 3, 0.7, SHAPE.STAR4, t, a, 0.32, 0.6, 0.2, 0.8, 2, ph);
        break;
      case 'sun':
        // a halo of flame over the sleeping head
        this.circle(x, 1.9, z, low ? 3 : 6, 0.6, SHAPE.SPARK, t, cr, 0.3, 0.95, 0, 0.1, 1.4, ph);
        break;
      case 'bloom':
        this.fall(x, z, low ? 3 : 5, 1.1, 2.2, SHAPE.HEART, t, a, 0.32, 0.95, 1.2);
        break;
      case 'eclipse':
        this.sprite(x + Math.cos(ph) * 0.8, 1.3, z + Math.sin(ph) * 0.8, SHAPE.SOFT, t, 0.65, 0.95, -Math.sin(ph) * 1.2, 0.1, Math.cos(ph) * 1.2, GROW.OUT, FADE.IN_OUT, 1);
        this.circle(x, 1.3, z, low ? 1 : 2, 0.8, SHAPE.STAR8, a, a, 0.26, 0.8, 0, 0.3, 1, ph + 2);
        break;
      case 'moon':
        this.circle(x, 1.7, z, low ? 2 : 3, 0.75, SHAPE.STAR5, a, t, 0.34, 0.95, 0, 0.15, 0.6, ph);
        break;
      case 'frost':
        this.fall(x, z, low ? 2 : 3, 1, 2.4, SHAPE.STAR8, cr, t, 0.3, 0.95, 1);
        break;
    }
    this.claim(g.n, 0.95, p);
    this.drawn.nap++;
    return true;
  }

  /** The recall lands (the hero is home). True when drawn. */
  land(x: number, z: number, p: SkinFxProfile | null | undefined): boolean {
    const g = this.gate(p, 'land');
    if (!g || !p) return false;
    const low = p.low;
    const t = p.tint;
    const a = p.accent;
    const cr = p.cream;
    switch (g.theme) {
      case 'thunder':
        // a bolt brings him home: the strike, a storm ring and sparks along the ground
        if (!low || p.self) this.strike(x, z, t, 1.8);
        this.sprite(x, 0.5, z, SHAPE.RING, a, 0.8, 0.5, 0, 0, 0, GROW.OUT, FADE.LINEAR, 7);
        this.circle(x, 0.3, z, low ? 4 : 8, 0.4, SHAPE.STAR4, t, a, 0.45, 0.55, 4, 0.8);
        break;
      case 'sun':
        // a sunrise where she lands
        this.sprite(x, 0.6, z, SHAPE.SOFT, t, low ? 2 : 2.8, 0.9, 0, 1.4, 0, GROW.BACK, FADE.IN_OUT, 1.1);
        this.rays(x, 0.4, z, low ? 4 : 8, t, cr, 2.2);
        if (!low) this.sprite(x, 0.5, z, SHAPE.RING, a, 0.8, 0.6, 0, 0.6, 0, GROW.OUT, FADE.LINEAR, 5);
        if (!low) this.streak(x, 0.3, z, a, 1, 0.6);
        break;
      case 'bloom':
        this.sprite(x, 0.35, z, SHAPE.STAR5, t, 0.6, 0.8, 0, 0.4, 0, GROW.BACK, FADE.HOLD, 4.2, 1);
        this.circle(x, 0.4, z, low ? 4 : 8, 0.4, SHAPE.HEART, t, cr, 0.42, 0.75, 3, 1, 2.5, 0.3, false);
        this.circle(x, 0.5, z, low ? 2 : 4, 0.3, SHAPE.FEATHER, a, a, 0.44, 0.75, 2.4, 1.2, -2, 0.9, false);
        break;
      case 'eclipse':
        this.sprite(x, 1, z, SHAPE.RING, t, 0.8, 0.7, 0, 0.2, 0, GROW.OUT, FADE.IN_OUT, 5);
        this.sprite(x, 1, z, SHAPE.RING, a, 0.5, 0.55, 0, 0.2, 0, GROW.BACK, FADE.LINEAR, 3.5);
        this.circle(x, 0.3, z, low ? 3 : 6, 0.6, SHAPE.STAR8, a, t, 0.34, 0.7, 1.4, 1.4);
        break;
      case 'moon':
        this.fall(x, z, low ? 4 : 6, 1.4, 3.6, SHAPE.STAR5, a, t, 0.44, 0.6, 6, FADE.HOLD);
        this.sprite(x, 0.4, z, SHAPE.RING, a, 0.7, 0.6, 0, 0, 0, GROW.OUT, FADE.LINEAR, 5);
        if (!low) this.sprite(x, 2.4, z, SHAPE.SOFT, cr, 1.2, 0.6, 0, 0, 0, GROW.OUT, FADE.IN_OUT, 1);
        break;
      case 'frost':
        this.circle(x, 0.25, z, low ? 4 : 8, 0.4, SHAPE.SHARD, t, cr, 0.46, 0.5, 4.5, 0.3);
        this.sprite(x, 2.3, z, SHAPE.NOTE, a, 0.75, 0.8, 0, 0.6, 0, GROW.BACK, FADE.HOLD, 1);
        if (!low) this.sprite(x, 0.4, z, SHAPE.RING, t, 0.7, 0.5, 0, 0, 0, GROW.OUT, FADE.LINEAR, 5);
        break;
      default:
        this.kit.emit(this.particles, p, x, 0.15, z, low ? 3 : 5, 1.3, 0.7, true, 0.9);
        this.sprite(x, 0.4, z, SHAPE.RING, t, 0.6, 0.5, 0, 0, 0, GROW.OUT, FADE.LINEAR, 5);
    }
    this.claim(g.n, 0.9, p);
    this.drawn.land++;
    return true;
  }

  /** The killer's coat over the fallen hero. True when drawn (the caller then skips the card stamp). */
  takedown(x: number, z: number, p: SkinFxProfile | null | undefined): boolean {
    const g = this.gate(p, 'takedown');
    if (!g || !p) return false;
    const low = p.low;
    const t = p.tint;
    const a = p.accent;
    const cr = p.cream;
    switch (g.theme) {
      case 'thunder':
        if (!low || p.self) this.strike(x, z, t, 1.5);
        this.circle(x, 1, z, low ? 4 : 6, 0.3, SHAPE.STAR4, t, a, 0.4, 0.55, 2, 2.4);
        if (!low) this.sprite(x, 0.5, z, SHAPE.RING, a, 0.6, 0.45, 0, 0, 0, GROW.OUT, FADE.LINEAR, 5);
        break;
      case 'sun':
        this.sprite(x, 2, z, SHAPE.STAR8, t, low ? 1.2 : 1.6, 0.6, 0, 0.5, 0, GROW.BACK, FADE.HOLD, 1.2, 2);
        this.rays(x, 1.8, z, low ? 4 : 6, t, cr, 1.6, 0.4);
        if (!low) this.sprite(x, 2, z, SHAPE.SOFT, a, 1.4, 0.5, 0, 0.5, 0, GROW.OUT, FADE.POP, 1.4);
        break;
      case 'bloom':
        this.sprite(x, 2, z, SHAPE.STAR5, t, 0.45, 0.8, 0, 0.4, 0, GROW.BACK, FADE.HOLD, 3.4, 1.2);
        this.circle(x, 1.9, z, low ? 3 : 5, 0.35, SHAPE.HEART, t, cr, 0.36, 0.75, 1.4, 0.8, 1.5, 0.3, false);
        if (!low) this.fall(x, z, 3, 0.8, 2.6, SHAPE.FEATHER, a, a, 0.4, 0.8, 1.2);
        break;
      case 'eclipse':
        this.sprite(x, 1.8, z, SHAPE.RING, t, 0.6, 0.65, 0, 0.4, 0, GROW.OUT, FADE.IN_OUT, 3.5);
        this.fall(x, z, low ? 3 : 5, 0.9, 2.8, SHAPE.STAR8, a, a, 0.3, 0.6, 2.5);
        break;
      case 'moon':
        this.fall(x, z, low ? 3 : 5, 0.9, 3.4, SHAPE.STAR5, a, t, 0.4, 0.55, 5, FADE.HOLD);
        this.sprite(x, 2.2, z, SHAPE.STAR8, cr, 1.1, 0.5, 0, 0.3, 0, GROW.OUT, FADE.POP, 0.5);
        break;
      case 'frost':
        this.circle(x, 1, z, low ? 3 : 5, 0.25, SHAPE.SHARD, t, cr, 0.44, 0.55, 2.4, 2.4);
        this.sprite(x, 2.3, z, SHAPE.NOTE, a, 0.65, 0.7, 0, 0.6, 0, GROW.BACK, FADE.HOLD, 1);
        if (!low) this.sprite(x, 1.4, z, SHAPE.STAR8, cr, 0.9, 0.45, 0, 0.4, 0, GROW.OUT, FADE.POP, 0.5);
        break;
      default:
        this.kit.emit(this.particles, p, x, 1.6, z, low ? 2 : 3, 0.8, 0.7);
    }
    this.claim(g.n, 0.85, p);
    this.drawn.takedown++;
    return true;
  }
}

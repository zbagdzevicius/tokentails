/**
 * Living pass (P4): heavy hits leave weight on the ground, and the light breathes. Render only: never a sim input.
 *
 * - Scuffs: a heavy ground impact (ability and big hits on ground units, dashes, slams, area casts, ultimates, tower
 *   shots landing; everything that already throws CombatVfx.debris) leaves a short-lived ink-brown crack or scratch
 *   mark that fades over 1.6–2.8 s. Drawn in the existing lingering-glyph pool (anim/fxkit/linger.ts, renderOrder 1,
 *   under every telegraph), so it costs 0 draws. Never a ring, a disc or a filled zone (the glyph shapes are thin
 *   lines), never above alpha SCUFF.alpha, at most SCUFF.maxAlive alive and SCUFF.perSec per second, and it always
 *   leaves the authored skill glyphs SCUFF.headroom free slots in the pool.
 * - Sparks and grit (High): 2–4 additive sparks in the hit's colour and a few dark grit specks skittering on the
 *   ground, through the particle pools' ambient guard (`Particles.claim`), so combat VFX keep the pool's last 20 %.
 * - Cast glow (High): a big cast (an ultimate, a slam) warms the ground under the caster for 0.25 s through the
 *   existing additive glow card (anim/fxkit/meshFx.ts 'glow'). No new lights: the light count and programs stay fixed.
 * - Light drift (High, off under reduce motion): `driftAt` gives the sun and sky a ±3 % colour-temperature and
 *   intensity drift over about 120 s (renderer.ts applies it). The sun never moves, so shadows and readability hold.
 *
 * Tiers come from the shared Ambient level (render/ambient.ts): Low off (0 cost), Med scuffs only, High everything.
 * Reduce motion: scuffs only, at 0.6 of the count and rate; no sparks, grit, glow or drift.
 */
import * as THREE from 'three';
import { ambientFor, type Ambient } from '../ambient';
export { DRIFT, driftAt } from '../ambient';
import { FX_KIND } from '../anim/fxkit/fxMaterial';
import { LINGER_TIER } from '../anim/fxkit/linger';
import type { FxPool } from '../anim/fxkit/meshFx';
import type { MeshFxLike } from '../anim/types';
import { FADE, SHAPE, type Particles } from './Particles.js';

/** Scuff look and caps. `ink` is also the pool's marker for our instances (no authored glyph uses it). */
export const SCUFF = Object.freeze({
  ink: 0x4b2d1f,
  /** Peak alpha on screen (the glyph shader multiplies by 0.8; we write aAlpha = alpha / 0.8). */
  alpha: 0.32,
  maxAlive: 8,
  perSec: 3,
  life: Object.freeze([1.6, 2.8] as const),
  /** Pool slots always left for the authored skill glyphs. */
  headroom: 4,
  /** Impacts farther than this from the camera focus (m) leave no scuff (off screen, no budget spent). */
  near: 30,
});

/** The glyphs a scuff may use: thin lines only (never 'scorch', 'crater' or 'petals', which read as filled zones). */
export const SCUFF_GLYPHS = Object.freeze(['crackStar', 'crackLine', 'scratches'] as const);
export type ScuffGlyph = (typeof SCUFF_GLYPHS)[number];

/** Warm ground glow under a big cast (cream-amber: never team rose, team sky or the bolt yellow). */
export const CAST_GLOW = Object.freeze({ color: 0xffc58f, life: 0.25 });

export interface ImpactBudget {
  /** Most scuffs alive at once (0 = off). */
  maxAlive: number;
  /** Scuffs per second (token bucket rate and burst). */
  perSec: number;
  sparks: boolean;
  grit: boolean;
  glow: boolean;
  drift: boolean;
}

/** What the impact life may do at an ambient level (pure). */
export function impactBudget(a: Ambient): ImpactBudget {
  if (a.level === 0) return { maxAlive: 0, perSec: 0, sparks: false, grit: false, glow: false, drift: false };
  const k = a.reduced ? 0.6 : 1;
  const full = a.level === 2 && !a.reduced;
  return { maxAlive: Math.round(SCUFF.maxAlive * k), perSec: SCUFF.perSec * k, sparks: full, grit: full, glow: full, drift: full };
}

/** A small seeded hash in [0, 1) of a world point and a counter (cosmetic variety, reproducible in tests). */
export function hash01(x: number, z: number, n: number): number {
  let h = Math.imul((Math.round(x * 64) | 0) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul((Math.round(z * 64) | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(n | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface ScuffLook {
  glyph: ScuffGlyph;
  /** Half-size (m). */
  size: number;
  yaw: number;
  life: number;
}

/** The scuff for an impact of weight `k` at (x, z); `dir` (rad) aims scratches along a dash (pure, seeded). */
export function scuffLook(x: number, z: number, k: number, n: number, dir = NaN): ScuffLook {
  const r0 = hash01(x, z, n);
  const r1 = hash01(z, x, n + 7);
  const glyph: ScuffGlyph = Number.isFinite(dir) ? 'scratches' : k >= 0.9 ? 'crackStar' : r0 < 0.5 ? 'crackLine' : 'crackStar';
  const size = Math.min(1.1, 0.38 + 0.32 * Math.max(0, k)) * (0.85 + 0.3 * r1);
  const yaw = Number.isFinite(dir) ? dir : r0 * Math.PI * 2;
  const life = SCUFF.life[0] + (SCUFF.life[1] - SCUFF.life[0]) * r1;
  return { glyph, size, yaw, life };
}

/** Rate gate (at most `perSec` starts in any 1 s window) plus an alive cap (own state only; times in s). */
export class ScuffGate {
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];

  constructor(public budget: Pick<ImpactBudget, 'maxAlive' | 'perSec'>) {}

  alive(now: number): number {
    const e = this.ends;
    for (let i = e.length - 1; i >= 0; i--) if (e[i] <= now) e.splice(i, 1);
    return e.length;
  }

  /**
   * True when a scuff living `life` s may start now (and books it). `reserve` slots of the second's budget stay free
   * for heavier impacts (a light hit passes 1, so a dash, slam or ultimate right after it still marks the ground).
   */
  take(now: number, life: number, reserve = 0): boolean {
    const b = this.budget;
    if (b.maxAlive <= 0 || b.perSec <= 0) return false;
    const st = this.starts;
    while (st.length && st[0] <= now - 1) st.shift();
    if (st.length + reserve >= b.perSec || this.alive(now) + reserve >= b.maxAlive) return false;
    st.push(now);
    this.ends.push(now + life);
    return true;
  }

  reset(): void {
    this.starts.length = 0;
    this.ends.length = 0;
  }
}

/** The lingering-glyph pool the scuffs draw into (anim/fxkit/linger.ts Linger). */
export interface ScuffPoolHost {
  readonly pool: FxPool;
  tier: 'low' | 'med' | 'high';
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const GRIT_DIR = new THREE.Vector3(0, 1, 0);
const set2 = (v: [number, number], a: number, b: number): void => {
  v[0] = a;
  v[1] = b;
};

export class ImpactLife {
  amb: Ambient = ambientFor({ tier: 'low', phone: false }, false);
  budget: ImpactBudget = impactBudget(this.amb);
  readonly gate = new ScuffGate(this.budget);
  /** The camera focus (m), for the near test (gameView keeps it current). */
  readonly focus = { x: 0, z: 0 };
  /** Scuffs started (tests, e2e). */
  scuffs = 0;
  private n = 0;
  private now = 0;
  private readonly inkRgb: [number, number, number];
  private readonly spawnOpts = { x: 0, z: 0, sx: 1, life: 1, color: SCUFF.ink, rim: SCUFF.ink, rel: 'own' as const, p3: 1 };
  private readonly glowOpts = { x: 0, z: 0, y: 0.05, sx: 1, life: CAST_GLOW.life, color: CAST_GLOW.color, rim: CAST_GLOW.color, rel: 'own' as const, p3: 0.4 };
  private readonly burst = {
    additive: true,
    exact: true,
    n: 0,
    shape: SHAPE.SPARK as number,
    color: 0xffffff,
    intensity: 1.7,
    size: [0.06, 0.1] as [number, number],
    life: [0.18, 0.3] as [number, number],
    speed: [2.2, 4] as [number, number],
    dir: GRIT_DIR,
    spread: 1.15,
    stretch: 2.4,
    drag: 4,
    gravity: 9,
    up: 0.8,
    alpha: 1,
    fade: FADE.LINEAR as number,
    floor: false,
    jitter: 0.12,
    sizeEnd: 1,
  };

  constructor(
    private readonly linger: ScuffPoolHost | null,
    private readonly particles: Particles | null,
    private readonly meshFx: MeshFxLike | null,
  ) {
    _c.setHex(SCUFF.ink);
    this.inkRgb = [_c.r, _c.g, _c.b];
  }

  setAmbient(a: Ambient): void {
    this.amb = a;
    this.budget = impactBudget(a);
    this.gate.budget = this.budget;
    this.gate.reset();
  }

  /**
   * A heavy ground impact of weight `k` (CombatVfx.debris scale: 0.4 a tower shot on a minion .. 1.6 an ultimate) at
   * (x, z) on `biome`, `color` the hit's colour (sparks), `dir` the travel direction (rad) for a dash, else NaN.
   */
  impact(x: number, z: number, k: number, biome: string, color: number, dir = NaN): void {
    const b = this.budget;
    if (b.maxAlive <= 0) return;
    if (Math.hypot(x - this.focus.x, z - this.focus.z) > SCUFF.near) return;
    const ground = biome !== 'water';
    if (ground) this.scuff(x, z, k, dir);
    const P = this.particles;
    if (!P) return;
    if (b.sparks && k >= 0.5) {
      const n = P.claim(true, 2 + Math.min(2, Math.floor(k * 1.5)));
      if (n > 0) {
        const o = this.burst;
        o.additive = true;
        o.n = n;
        o.shape = SHAPE.SPARK;
        o.color = color;
        o.intensity = 1.7;
        set2(o.size, 0.06, 0.1);
        set2(o.life, 0.18, 0.3);
        set2(o.speed, 2.2, 4 + k);
        o.spread = 1.15;
        o.stretch = 2.4;
        o.gravity = 9;
        o.up = 0.8;
        o.alpha = 1;
        o.floor = false;
        _p.set(x, 0.25, z);
        P.burst(_p, o);
      }
    }
    if (b.grit && ground) {
      const n = P.claim(false, 3 + Math.min(2, Math.round(k)));
      if (n > 0) {
        const o = this.burst;
        o.additive = false;
        o.n = n;
        o.shape = SHAPE.SOFT;
        o.color = SCUFF.ink;
        o.intensity = 1;
        set2(o.size, 0.05, 0.09);
        set2(o.life, 0.35, 0.6);
        set2(o.speed, 1.2, 2.4 + k);
        o.spread = 1.35;
        o.stretch = 1;
        o.gravity = 12;
        o.up = 0.6;
        o.alpha = 0.55;
        o.floor = true;
        _p.set(x, 0.12, z);
        P.burst(_p, o);
      }
    }
  }

  /** A big cast (an ultimate, a slam): a brief warm glow on the ground under the caster (High). */
  castGlow(x: number, z: number, k = 1): void {
    if (!this.budget.glow || !this.meshFx) return;
    if (Math.hypot(x - this.focus.x, z - this.focus.z) > SCUFF.near) return;
    const o = this.glowOpts;
    o.x = x;
    o.z = z;
    o.sx = Math.min(2.4, 1.3 + 0.5 * k);
    this.meshFx.spawn('glow', o);
  }

  private scuff(x: number, z: number, k: number, dir: number): void {
    const L = this.linger;
    if (!L) return;
    const look = scuffLook(x, z, k, this.n++, dir);
    if (L.pool.n >= LINGER_TIER[L.tier].n - SCUFF.headroom) return;
    if (!this.gate.take(this.now, look.life, k < 0.9 ? 1 : 0)) return;
    _q.setFromAxisAngle(_up, look.yaw);
    // a hair under the authored glyphs (0.035), so a skill's own mark wins where both land
    _p.set(x, 0.032, z);
    _s.set(look.size * 2, 1, look.size * 2);
    _m.compose(_p, _q, _s);
    const o = this.spawnOpts;
    o.life = look.life;
    o.p3 = look.life;
    if (L.pool.spawn(FX_KIND[look.glyph], _m, o, 0) >= 0) this.scuffs++;
  }

  /**
   * Per frame, after the glyph pool's own update: the clock, and our scuffs' alpha held at SCUFF.alpha (the pool
   * writes 1 for every live glyph; ours are found by their ink colour).
   */
  update(now: number): void {
    this.now = now;
    const L = this.linger;
    if (!L || L.pool.n === 0) return;
    const g = L.pool.mesh.geometry;
    const col = g.getAttribute('aColor') as THREE.BufferAttribute | undefined;
    const al = g.getAttribute('aAlpha') as THREE.BufferAttribute | undefined;
    if (!col || !al) return;
    const c = col.array as Float32Array;
    const a = al.array as Float32Array;
    const [r, gg, bb] = this.inkRgb;
    const v = SCUFF.alpha / 0.8;
    for (let i = 0; i < L.pool.n; i++) {
      if (Math.abs(c[i * 3] - r) < 1e-4 && Math.abs(c[i * 3 + 1] - gg) < 1e-4 && Math.abs(c[i * 3 + 2] - bb) < 1e-4 && a[i] > v) a[i] = v;
    }
  }

  reset(): void {
    this.gate.reset();
  }
}

/**
 * Fun kit (render only, shared by the skill-FX lanes): cat / dog "stickers" (pooled billboard sprites in the existing
 * Particles pools, no new draw calls), comic text pops (DamageNumbers.pop, rate limited), speed lines, replay-safe
 * cosmetic randomness and a few cat / dog sound variants. Every call is decoration: gameplay shapes stay the sim's.
 *
 * Wiring, all optional (each part degrades to nothing when its piece is missing, so tests and stubs keep working):
 * - Stickers draw into the CombatVfx's particle pools (FxCtx.particles is the runtime's CombatVfx), or into the sink's
 *   `particles` when one is set. If the shared FxCtx later grows `particles.sticker(...)` (audit B), it is used first.
 * - Pops prefer `fx.words.pop(...)` (audit C) when the FxCtx has it; otherwise the sink's `pop` set by gameView.
 * - New SDF sticker shapes (PAW, NOTE, YARN … audit A) are used as soon as `SHAPE` lists them; until then each sticker
 *   is composed from the shapes that exist (a paw = a pad and four toes).
 *
 * API is additive: add new helpers, never change these signatures. Nothing allocates per call.
 */
import * as THREE from 'three';
import { FADE, GROW, SHAPE } from '../Particles.js';
import { setColor } from '../../ppk/fx/util.js';
import { PL_SFX, sfx, type SfxName } from '../../../audio/sfx';
import { CUE_SFX } from '../../anim/fxctx';
import type { FxCtx, HeroStatus } from '../../anim/types';
import type { HeroId } from '../../../data/heroes/types';
import { heroChestY, heroHeadY, heroTop } from '../../chars/visualSize';
import { isBigHit, maxedRank, rankScale } from '../combatVfx';

// ------------------------------------------------------------------------------------------------ randomness

/**
 * Replay-safe cosmetic randomness: an integer hash of the sim event's tick, its source id and a salt, in [0, 1).
 * Pick variants with `(funRand(e.tick, e.src, slot) * N) | 0` so a replay draws the same variant.
 */
export function funRand(tick: number, src: number, salt: number): number {
  let h = (Math.imul(tick | 0, 0x9e3779b1) ^ Math.imul((src | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((salt | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------------------------------------ sink

/** Minimal Particles surface the kit uses (src/render/fx/Particles.js). */
export interface ParticlesLike {
  begin(): Spec;
  emit(additive: boolean): number;
  scaled(n: number): number;
}
interface Spec {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size0: number; size1: number;
  grow: number; fade: number; rot: number; spin: number; gravity: number; drag: number; r: number; g: number; b: number;
  a: number; intensity: number; shape: number; stretch: number;
  /** Ground height the sprite bounces on (Particles.begin resets it to -Infinity). */
  floor: number;
  bounce: number;
}

export interface FunSink {
  /** DamageNumbers.pop(text, pos): a comic pop over a point. */
  pop?(text: string, pos: THREE.Vector3): boolean;
  /** The scene's Particles (else the kit reads it off FxCtx.particles). */
  particles?: unknown;
  /**
   * The game camera: stickers are nudged NUDGE m toward it so a sticker anchored inside a body (a victim's chest, the
   * can at Lambo's paw) draws in front of the mesh instead of being depth-hidden by it.
   */
  camera?: { position: { x: number; y: number; z: number } };
}

/**
 * Every sticker size is multiplied by this: callers author sizes in "body" metres, and a sprite under ~0.35 m is a
 * few pixels at the game camera's distance (the Med capture at 640×360 lost them entirely). Low and reduced effects
 * use SIZE_K_LOW (readability QA: a 1.28 m cut-out paw at body height covered the target).
 */
const SIZE_K_FULL = 1.7;
const SIZE_K_LOW = 1.2;
let SIZE_K = SIZE_K_FULL;
/** Stickers are decoration: none while the pool they draw into is more than this full (gameplay sparks keep room). */
const BUSY = 0.6;
/** Set the sticker scale for this call (tier and reduced effects). */
function tierK(fx: FxCtx): void {
  SIZE_K = fx.tier === 'low' || fx.reduced ? SIZE_K_LOW : SIZE_K_FULL;
}
type PoolCount = { count: number; limit: number };
/** The pool (alpha or additive) is over BUSY: skip the decoration. */
function busy(p: ParticlesLike, additive: boolean): boolean {
  const q = (p as unknown as { add?: PoolCount; alpha?: PoolCount })[additive ? 'add' : 'alpha'];
  return !!q && q.limit > 0 && q.count > q.limit * BUSY;
}
/** How far (m) a sticker is pulled toward the camera. */
const NUDGE = 0.6;
const NV = { x: 0, y: 0, z: 0 };
/** (x, y, z) pulled toward the camera into NV (unchanged without a camera). */
function nudge(x: number, y: number, z: number): void {
  const c = sink.camera?.position;
  NV.x = x;
  NV.y = y;
  NV.z = z;
  if (!c) return;
  const dx = c.x - x;
  const dy = c.y - y;
  const dz = c.z - z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (l < 1e-3) return;
  const k = Math.min(NUDGE, l * 0.5) / l;
  NV.x += dx * k;
  NV.y += dy * k;
  NV.z += dz * k;
}
let sink: FunSink = {};
/** gameView registers the pop target once (and clears it on dispose with `setFunSink({})`). */
export function setFunSink(s: FunSink): void {
  sink = s;
}
/** Clear the sink only when it is still `particles`' (a disposed view never clears a newer view's sink). */
export function clearFunSink(particles: unknown): void {
  if (sink.particles === particles) sink = {};
}

type Shared = FxCtx & {
  words?: { pop(id: string, x: number, y: number, z: number, src: number): void };
};

function poolOf(fx: FxCtx): ParticlesLike | null {
  const p = (sink.particles ?? (fx.particles as unknown as { particles?: unknown }).particles) as ParticlesLike | undefined;
  return p && typeof p.begin === 'function' ? p : null;
}

// ------------------------------------------------------------------------------------------------ stickers

/** Sticker names. Shapes not in SHAPE yet are composed from the ones that exist (see `sticker`). */
export type StickerName =
  | 'PAW' | 'BONE' | 'NOTE' | 'YARN' | 'HAIRBALL' | 'ANGER' | 'SWEAT' | 'EXCLAIM' | 'FISHBONE' | 'DOT' | 'MOON'
  | 'HEART' | 'FISH' | 'STAR' | 'STAR4' | 'PUFF' | 'DROPLET' | 'SPARK' | 'CONFETTI' | 'FEATHER' | 'RING' | 'PLUS' | 'SOFT' | 'BULB';

const SH = SHAPE as unknown as Record<string, number | undefined>;
/** Fallback shape per sticker when SHAPE has no SDF for it yet. */
const FALLBACK: Readonly<Record<StickerName, number>> = Object.freeze({
  PAW: -1, // composed
  BONE: -2, // composed
  NOTE: -3, // composed
  YARN: -4, // composed
  HAIRBALL: SHAPE.PUFF,
  ANGER: SHAPE.PLUS,
  SWEAT: SHAPE.DROPLET,
  EXCLAIM: -5, // composed
  FISHBONE: SHAPE.FISH,
  DOT: SHAPE.SOFT,
  MOON: -6, // composed
  HEART: SHAPE.HEART,
  FISH: SHAPE.FISH,
  STAR: SHAPE.STAR5,
  STAR4: SHAPE.STAR4,
  PUFF: SHAPE.PUFF,
  DROPLET: SHAPE.DROPLET,
  SPARK: SHAPE.SPARK,
  CONFETTI: SHAPE.CONFETTI,
  FEATHER: SHAPE.FEATHER,
  RING: SHAPE.RING,
  PLUS: SHAPE.PLUS,
  SOFT: SHAPE.SOFT,
  BULB: SHAPE.SOFT,
});
/** Additive (glowing) stickers; the rest draw in the alpha pool so they read as cut-out stickers. */
const GLOW: ReadonlySet<StickerName> = new Set<StickerName>(['DOT', 'SPARK', 'STAR', 'STAR4', 'BULB', 'RING']);

const shapeOf = (n: StickerName): number => SH[n] ?? FALLBACK[n];

/** The composite sticker being built (module state, so building one allocates nothing). */
const K = { p: null as ParticlesLike | null, x: 0, y: 0, z: 0, s: 1, cr: 1, sr: 0, add: false, life: 1, vy: 0 };
/** One part of a composite sticker: offset (ox, oy) in sticker units (rotated by its roll), size share k. */
function at(ox: number, oy: number, k: number, shape: number): void {
  const s = K.s * SIZE_K;
  one(K.p as ParticlesLike, K.x + (ox * K.cr - oy * K.sr) * s, K.y + (ox * K.sr + oy * K.cr) * s, K.z, shape, K.add, K.s * k, K.life, 0, K.vy, 0, 0, 0, 0, FADE.HOLD, GROW.BACK, 1);
}

const C = new THREE.Color();
let spinOk = true;

/** One sprite (the raw building block). Returns false when the pool is full. */
function one(p: ParticlesLike, x: number, y: number, z: number, shape: number, additive: boolean, size: number, life: number, vx: number, vy: number, vz: number, rot: number, spin: number, grav: number, fade: number, grow: number, endMul: number, alpha = 1): boolean {
  const s = p.begin();
  nudge(x, y, z);
  s.x = NV.x; s.y = NV.y; s.z = NV.z;
  s.vx = vx; s.vy = vy; s.vz = vz;
  s.life = life;
  s.size0 = size * SIZE_K; s.size1 = size * SIZE_K * endMul;
  s.grow = grow; s.fade = fade;
  s.rot = rot; s.spin = spinOk ? spin : 0;
  s.gravity = grav; s.drag = 1.2;
  s.r = C.r; s.g = C.g; s.b = C.b; s.a = alpha; s.intensity = additive ? 1.6 : 1;
  s.shape = shape; s.stretch = 1;
  return p.emit(additive) >= 0;
}

/**
 * One sticker at (x, y, z), billboarded. `vy` drifts it up (m/s), `spin` rad/s (zeroed on Low and with reduced
 * effects). `rot` is the sticker's starting roll (rad). Composite stickers (paw, bone, note, yarn, "!", moon) use 2–5
 * sprites from the same pools.
 */
export function sticker(fx: FxCtx, x: number, y: number, z: number, name: StickerName, color: number, size: number, life: number, vy = 0, spin = 0, rot = 0): void {
  const p = poolOf(fx);
  if (!p) return;
  const add = GLOW.has(name);
  if (busy(p, add)) return;
  spinOk = fx.tier !== 'low' && !fx.reduced;
  tierK(fx);
  setColor(C, color);
  const sh = shapeOf(name);
  if (sh >= 0) {
    one(p, x, y, z, sh, add, size, life, 0, vy, 0, rot, spin, 0, FADE.HOLD, GROW.BACK, 1);
    return;
  }
  // Low and reduced effects: a composite draws its main part only (one sprite, readability QA)
  if (fx.tier === 'low' || fx.reduced) {
    one(p, x, y, z, sh === -4 || sh === -6 ? SHAPE.PUFF : SHAPE.SOFT, add, size * 0.8, life, 0, vy, 0, rot, 0, 0, FADE.HOLD, GROW.BACK, 1);
    return;
  }
  K.p = p;
  K.x = x;
  K.y = y;
  K.z = z;
  K.s = size;
  K.cr = Math.cos(rot);
  K.sr = Math.sin(rot);
  K.add = add;
  K.life = life;
  K.vy = vy;
  switch (sh) {
    case -1: // paw: a bean pad and four toe beans (crisp cotton balls)
      at(0, -0.14, 0.72, SHAPE.PUFF);
      at(-0.36, 0.2, 0.34, SHAPE.PUFF);
      at(-0.12, 0.38, 0.34, SHAPE.PUFF);
      at(0.12, 0.38, 0.34, SHAPE.PUFF);
      at(0.36, 0.2, 0.34, SHAPE.PUFF);
      return;
    case -2: // bone: a bar with two knobs each end
      at(-0.16, 0, 0.4, SHAPE.PUFF);
      at(0.16, 0, 0.4, SHAPE.PUFF);
      at(-0.38, 0.12, 0.32, SHAPE.PUFF);
      at(-0.38, -0.12, 0.32, SHAPE.PUFF);
      at(0.38, 0.12, 0.32, SHAPE.PUFF);
      at(0.38, -0.12, 0.32, SHAPE.PUFF);
      return;
    case -3: // music note: a round head, a kite stem and a little flag
      at(-0.14, -0.28, 0.5, SHAPE.PUFF);
      at(0.06, 0.1, 0.62, SHAPE.SHARD);
      at(0.22, 0.34, 0.24, SHAPE.PUFF);
      return;
    case -4: // yarn ball: a ball, a ring for the wound strand and a loose end
      at(0, 0, 0.9, SHAPE.PUFF);
      at(0, 0, 1, SHAPE.RING);
      at(0.4, -0.36, 0.22, SHAPE.PUFF);
      return;
    case -5: // "!": a kite and a dot
      at(0, 0.16, 0.66, SHAPE.SHARD);
      at(0, -0.36, 0.24, SHAPE.PUFF);
      return;
    case -6: // crescent moon stand-in: a pale disc with a twinkle
      at(0, 0, 0.8, SHAPE.PUFF);
      at(0.22, 0.18, 0.4, SHAPE.STAR4);
      return;
    default:
  }
}

/**
 * `n` stickers bursting from (x, y, z): random directions in a ring (`speed` m/s outward, `up` m/s), `grav` the
 * vertical acceleration (m/s², negative = falling; Particles' own gravity is the opposite sign).
 * Counts follow the quality tier (Particles.scaled; reduced effects halve them again).
 */
export function stickerBurst(fx: FxCtx, x: number, y: number, z: number, name: StickerName, color: number, size: number, life: number, n: number, speed = 2, up = 2, grav = -6, seed = 0): void {
  const p = poolOf(fx);
  if (!p) return;
  const add = GLOW.has(name);
  if (busy(p, add)) return;
  spinOk = fx.tier !== 'low' && !fx.reduced;
  tierK(fx);
  let k = p.scaled(n);
  if (fx.reduced) k = Math.max(1, k >> 1);
  setColor(C, color);
  const sh = shapeOf(name);
  for (let i = 0; i < k; i++) {
    const a = ((i + 0.5) / k) * Math.PI * 2 + seed * 6.283;
    const j = 0.75 + 0.5 * frac(seed * 13.7 + i * 0.618);
    const vx = Math.cos(a) * speed * j;
    const vz = Math.sin(a) * speed * j;
    if (sh >= 0) one(p, x, y, z, sh, add, size * (0.8 + 0.4 * frac(i * 0.37 + seed)), life, vx, up * j, vz, a, 4 * (i & 1 ? 1 : -1), -grav, FADE.HOLD, GROW.BACK, 0.9);
    else {
      // composites fly as a single cut-out of their main part, then the composite lands as one sticker at the end
      one(p, x, y, z, SHAPE.SOFT, add, size * 0.6, life, vx, up * j, vz, a, 0, -grav, FADE.HOLD, GROW.BACK, 0.9);
    }
  }
}

/** Seeded fractional part (no Math.random; stable between calls with the same seed). */
const frac = (v: number): number => v - Math.floor(v);

/** A trail of `n` paw prints from (x0, z0) to (x1, z1) at height y, alternating left / right of the line. */
export function pawTrail(fx: FxCtx, x0: number, z0: number, x1: number, z1: number, y: number, n: number, color: number, size: number, life: number, startLeft = true): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l = Math.hypot(dx, dz) || 1;
  const px = -dz / l;
  const pz = dx / l;
  const k = fx.tier === 'low' ? Math.max(1, (n + 1) >> 1) : n;
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k;
    const side = ((i & 1) === 0) === startLeft ? 1 : -1;
    sticker(fx, x0 + dx * t + px * side * 0.18, y, z0 + dz * t + pz * side * 0.18, 'PAW', color, size, life + t * 0.25);
  }
}

/**
 * Speed lines: `n` stretched sparks streaming backward from (x, y, z) along the ground direction (dx, dz) (unit),
 * spread across `w` m. Additive, short-lived.
 */
export function speedLines(fx: FxCtx, x: number, y: number, z: number, dx: number, dz: number, n: number, color: number, w = 0.8, speed = 7): void {
  const p = poolOf(fx);
  if (!p) return;
  let k = p.scaled(n);
  if (fx.reduced) k = Math.max(1, k >> 1);
  setColor(C, color);
  const px = -dz;
  const pz = dx;
  for (let i = 0; i < k; i++) {
    const o = ((i + 0.5) / k - 0.5) * w;
    const h = (i & 1 ? 0.25 : -0.15) + y;
    const s = p.begin();
    s.x = x + px * o; s.y = h; s.z = z + pz * o;
    s.vx = -dx * speed; s.vy = 0; s.vz = -dz * speed;
    s.life = 0.18 + (i % 3) * 0.04;
    s.size0 = 0.07; s.size1 = 0.03;
    s.grow = GROW.LINEAR; s.fade = FADE.LINEAR;
    s.rot = 0; s.spin = 0; s.gravity = 0; s.drag = 2;
    s.r = C.r; s.g = C.g; s.b = C.b; s.a = 0.85; s.intensity = 1.4;
    s.shape = SHAPE.SPARK; s.stretch = 5;
    p.emit(true);
  }
}

/**
 * `n` small sprites orbiting nothing in particular: a ring of `n` stickers around (x, y, z) at radius r that drift
 * round once (dizzy stars, a coil of fairy-light bulbs). Implemented as tangential velocity with a short life.
 */
export function orbit(fx: FxCtx, x: number, y: number, z: number, name: StickerName, color: number, n: number, r: number, size: number, life: number, phase = 0): void {
  const p = poolOf(fx);
  if (!p) return;
  const add = GLOW.has(name);
  if (busy(p, add)) return;
  tierK(fx);
  let k = p.scaled(n);
  if (fx.reduced) k = Math.max(1, k >> 1);
  setColor(C, color);
  const sh = shapeOf(name) >= 0 ? shapeOf(name) : SHAPE.STAR5;
  spinOk = fx.tier !== 'low' && !fx.reduced;
  const w = 3.2;
  for (let i = 0; i < k; i++) {
    const a = phase + (i / k) * Math.PI * 2;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    one(p, x + cx * r, y, z + sz * r, sh, add, size, life, -sz * r * w, 0, cx * r * w, a, 3, 0, FADE.HOLD, GROW.BACK, 1);
  }
}

// ------------------------------------------------------------------------------------------------ comic pops

const POP_GAP = 0.6;
const lastPop = new Float64Array(32).fill(-9);
const popAt = new Float64Array(2).fill(-9);
const PV = new THREE.Vector3();
const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/**
 * A comic word ("POW!", "MEOW!") over (x, y, z), credited to caster `src`: at most one per caster per 0.6 s and one
 * fun pop on screen at once, in its own slot: it never pushes a gameplay word or pop ("CLANK!" on a shield,
 * "Purr-ified!") off the screen (readability QA). None with reduced effects or while a team fight is on (the fight
 * camera's flag). Use only on ult contacts, landed stuns / knock-ups and big hits. Returns true when it showed.
 */
export function funPop(fx: FxCtx, src: number, text: string, x: number, y: number, z: number): boolean {
  if (fx.reduced || (fx.cam as { fight?: boolean } | undefined)?.fight === true) return false;
  const w = (fx as Shared).words;
  if (w && typeof w.pop === 'function') {
    w.pop(text, x, y, z, src);
    return true;
  }
  if (!sink.pop) return false;
  const t = clock();
  const i = src & 31;
  if (t - lastPop[i] < POP_GAP) return false;
  if (t - popAt[0] < 0.9) return false;
  lastPop[i] = t;
  popAt[0] = t;
  PV.set(x, y, z);
  return sink.pop(text, PV) !== false;
}

/** Test hook: forget pop rate-limit history. */
export function resetFunKit(): void {
  lastPop.fill(-9);
  popAt.fill(-9);
}

// ------------------------------------------------------------------------------------------------ sounds

/**
 * Cat / dog sound names → [synth sound, rate, volume] from the existing set, used until audio/sfx.ts gets real ones
 * (when PL_SFX gains a sound with the same name, that sound plays instead).
 */
const FUN_SFX: Readonly<Record<string, readonly [SfxName, number, number]>> = Object.freeze({
  meow: ['ooh', 2.3, 0.5],
  mew: ['ooh', 2.9, 0.4],
  purr: ['roar', 2.6, 0.22],
  hiss: ['poof', 0.55, 0.45],
  boing: ['shieldUp', 1.3, 0.5],
  squeakToy: ['squeak', 1, 0.5],
  sparkle: ['coin', 1.9, 0.35],
  splat: ['slam', 2.2, 0.4],
  pop: ['poof', 1.4, 0.45],
  zip: ['dash', 2.1, 0.4],
  bonk: ['hit', 0.75, 0.55],
  chime: ['levelup', 1.6, 0.35],
  blip: ['blip', 1, 0.4],
});
const sfxWin = { w: -1, n: 0 };
const PL = PL_SFX as unknown as Record<string, unknown>;

/** Play a fun sound at a world point: a CUE_SFX cue, a PL_SFX sound with that name, or the FUN_SFX stand-in. */
export function funSfx(fx: FxCtx, name: string, at?: { x: number; z: number }, vol = 1): void {
  if (CUE_SFX[name]) {
    fx.sfx.cue(name, at, vol);
    return;
  }
  const w = Math.floor(clock() * 10);
  if (w !== sfxWin.w) (sfxWin.w = w), (sfxWin.n = 0);
  if (sfxWin.n >= 3) return;
  sfxWin.n++;
  if (PL[name]) {
    sfx.play(name as SfxName, { vol: 0.5 * vol, at });
    return;
  }
  const d = FUN_SFX[name];
  if (d) sfx.play(d[0], { rate: d[1], vol: d[2] * vol, at });
}

/** Hero level from the FxCtx when it provides one (audit E), else NaN. */
export function funLevel(fx: FxCtx, id: number): number {
  const l = (fx as FxCtx & { level?(id: number): number }).level?.(id);
  return typeof l === 'number' ? l : NaN;
}

// ------------------------------------------------------------------------------------------------ lookups

type WithHeroLookup = FxCtx & { lookup?: { heroOf?(id: number): HeroId | null } };

/** The hero drawn for entity `id` (null for minions, towers, camps). Uses the runtime lookup when present. */
export function funHeroOf(fx: FxCtx, id: number): HeroId | null {
  return (fx as WithHeroLookup).lookup?.heroOf?.(id) ?? null;
}

/** Height (m) just above a unit's drawn head: the hero's visual top, or 1.6 m for anything else. */
export function funOverY(fx: FxCtx, id: number, lift = 0.35): number {
  const h = funHeroOf(fx, id);
  return h ? heroTop(h) + lift : 1.6 + lift;
}

/**
 * Head height (m) of a unit's drawn body plus `lift`: where stickers that "belong to the head" go (dizzy stars, an
 * anger mark, a "!"): beside the head, under the overhead plate, so the nameplate never covers them.
 */
export function funHeadY(fx: FxCtx, id: number, lift = 0): number {
  const h = funHeroOf(fx, id);
  return (h ? heroHeadY(h) : 1.2) + lift;
}

/** Chest height (m) of a unit's drawn body (visual size, never the sim radius). */
export function funChestY(fx: FxCtx, id: number): number {
  const h = funHeroOf(fx, id);
  return h ? heroChestY(h) : 0.8;
}

const HS: HeroStatus = { buffs: 0, shield: 0, hp: 0, maxHp: 0 };
/** A big hit on a hero (combatVfx.isBigHit on the snapshot's max HP). Never true on minions. */
export function funBigHit(fx: FxCtx, dst: number, amount: number): boolean {
  if (!funHeroOf(fx, dst)) return false;
  const max = fx.status?.(dst, HS) ? HS.maxHp ?? 0 : 0;
  return isBigHit(amount, max, true);
}

/** Rank scale 1..~1.3 for slot effects from the hero level (FxCtx.level when present, else the talent count). */
export function funRank(fx: FxCtx, id: number, slot: number, talents?: readonly string[]): number {
  const l = funLevel(fx, id);
  const level = l === l ? l : 1 + (talents?.length ?? 0) * 3;
  return rankScale(level, slot);
}

/** The slot is maxed (FxCtx.level when present, else three talents chosen). */
export function funMaxed(fx: FxCtx, id: number, slot: number, talents?: readonly string[]): boolean {
  const l = funLevel(fx, id);
  return l === l ? maxedRank(l, slot) : (talents?.length ?? 0) >= 3;
}

/**
 * One sticker flying in a straight line (no drag, no gravity): a fish riding an arrow, a can tossed along its path.
 * Velocity in m/s; `spin` rad/s (zeroed on Low / reduced). Single sprites only (composites draw their main part).
 */
export function flying(fx: FxCtx, x: number, y: number, z: number, vx: number, vy: number, vz: number, name: StickerName, color: number, size: number, life: number, rot = 0, spin = 0): void {
  const p = poolOf(fx);
  if (!p) return;
  if (busy(p, GLOW.has(name))) return;
  spinOk = fx.tier !== 'low' && !fx.reduced;
  tierK(fx);
  setColor(C, color);
  const sh = shapeOf(name);
  const s = p.begin();
  nudge(x, y, z);
  s.x = NV.x; s.y = NV.y; s.z = NV.z;
  s.vx = vx; s.vy = vy; s.vz = vz;
  s.life = life;
  s.size0 = size * SIZE_K; s.size1 = size * SIZE_K;
  s.grow = GROW.LINEAR; s.fade = FADE.HOLD;
  s.rot = rot; s.spin = spinOk ? spin : 0;
  s.gravity = 0; s.drag = 0;
  s.r = C.r; s.g = C.g; s.b = C.b; s.a = 1; s.intensity = 1;
  s.shape = sh >= 0 ? sh : SHAPE.SOFT; s.stretch = 1;
  p.emit(GLOW.has(name));
}

/**
 * The particle pools stickers draw into (the sink's, else the runtime's CombatVfx pools), or null in unit-test stubs.
 * For lane helpers that build their own sprites (skills2Fun.ts): one lookup, so every sticker shares the same pools.
 */
export function funPool(fx: FxCtx): ParticlesLike | null {
  return poolOf(fx);
}

/** A sticker count under the tier: Low and reduced effects get half (at least 1). */
export function funCount(fx: FxCtx, n: number): number {
  return fx.tier === 'low' || fx.reduced ? Math.max(1, n >> 1) : n;
}

/**
 * A synth sound played directly by name with its own rate and volume (lifted PPK voices with no cue alias yet, such
 * as hyenaLaugh and squeak), under the same 3-per-100-ms cap as funSfx.
 */
export function funSound(name: SfxName, at: { x: number; z: number } | undefined, rate = 1, vol = 0.5): void {
  const w = Math.floor(clock() * 10);
  if (w !== sfxWin.w) (sfxWin.w = w), (sfxWin.n = 0);
  if (sfxWin.n >= 3) return;
  sfxWin.n++;
  try {
    sfx.play(name, { rate, vol, at });
  } catch {
    /* audio not unlocked yet (tests, before the first gesture) */
  }
}

/** Debug / tests: live sprites in the sink's pools (alpha, additive), or null when no sink is set. */
export function funStats(): { alpha: number; add: number } | null {
  const p = sink.particles as { alpha?: { count: number }; add?: { count: number } } | undefined;
  return p?.alpha && p.add ? { alpha: p.alpha.count, add: p.add.count } : null;
}

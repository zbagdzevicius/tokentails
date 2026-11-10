/**
 * Hit feel bank (audio pass 2, Nov 10: "improve VFX sounds of regular hits"). Wild Rift / MLBB style combat sounds:
 * each sound is a transient (the contact), a body (the weight) and a tail (the room), mixed OFFLINE at bake time into
 * one buffer per variant, so a hit starts ONE BufferSource instead of the 4–6 layered plays it used before (fewer audio
 * nodes a second, PERF-IOS §8.14). Four variants per sound (each layer's pitch shifted a little, seeded) plus a small
 * pitch and volume jitter per play keep a fight from machine-gunning. Category voice caps (swing, hit, hurt, ping)
 * bound how many play at once; the player's own sounds steal the oldest of someone else's.
 *
 * Pure (no AudioContext): audio/sfx.ts bakes HIT_BANK with renderBankSound and asks HitVoices / HitVariation per play.
 * Procedural only (zzfx synthesis, no samples). Render side; never feeds the sim.
 */
import { PCM_RATE, zzfxSamples } from './sfxDefs.js';
import { HEROES } from '../data/heroes';
import type { HeroId } from '../data/heroes/types';
import type { Nature } from '../render/identity';

export type HitCat = 'swing' | 'hit' | 'hurt' | 'ping';

/** Most of one category playing at once (a teamfight stays readable; the player's own sounds always get through). */
export const HIT_CAT_MAX: Readonly<Record<HitCat, number>> = Object.freeze({ swing: 3, hit: 6, hurt: 2, ping: 2 });

/** Baked variants per bank sound (round-robin, never the same one twice in a row). */
export const HIT_VARIANTS = 4;
/** Per-play jitter on top of the variant: playback rate ± this, volume down to 1 − this. */
export const RATE_JITTER = 0.05;
export const VOL_JITTER = 0.12;

/** One zzfx layer of a bank sound: its gain in the mix, its start offset (s) and playback rate. */
export interface BankLayer {
  z: readonly number[];
  gain: number;
  at?: number;
  rate?: number;
}

export interface BankSound {
  cat: HitCat;
  layers: readonly BankLayer[];
  /** Each variant shifts each layer's pitch by up to ± this fraction. */
  jitter: number;
  /** Peak level after mixing (the bake normalises to it). */
  peak: number;
}

// zzfx 1.4 order: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//   pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
// filter > 0 is a high-pass, < 0 a low-pass.
/** Transient: high-passed noise crack, ~45 ms. */
const CRACK = [0.7, 0, 1800, 0, 0.003, 0.035, 4, 1, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0.5, 0.008, 0, 2600];
/** Transient: a brighter, shorter claw snap. */
const SNAP = [0.6, 0, 2600, 0, 0.002, 0.026, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.006, 0, 4200];
/** Body: a sine that drops fast (the punch). */
const THUMP = [0.85, 0, 160, 0, 0.018, 0.09, 0, 1.8, -10, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.015, 0, 0];
/** Body: a low-passed noisy saw, the flesh of a hit. */
const FLESH = [0.8, 0, 220, 0, 0.02, 0.07, 2, 2.2, -8, 0, 0, 0, 0, 0.9, 0, 0.05, 0, 0.6, 0.02, 0, -1600];
/** Body: a deep punch for heavy hits. */
const DEEP = [1, 0, 85, 0, 0.05, 0.22, 0, 2.2, -3, 0, 0, 0, 0, 0.35, 0, 0.06, 0, 0.6, 0.04, 0, -1100];
/** Tail: a short low-passed noise decay with one echo (the room). */
const TAIL = [0.3, 0, 400, 0.004, 0.02, 0.16, 4, 1, -1, 0, 0, 0, 0, 1.5, 0, 0, 0.045, 0.4, 0.03, 0, -1800];
/** Crit: a short bright ring and a sparkle on top. */
const RING = [0.4, 0, 1560, 0, 0.02, 0.18, 1, 1, 0, 0, 520, 0.025, 0, 0, 14, 0, 0, 0.5, 0.02, 0, 0];
const SPARKLE = [0.3, 0, 2400, 0, 0.02, 0.14, 0, 1, 0, 0, 600, 0.03, 0, 0, 0, 0, 0.04, 0.5, 0.01, 0, 0];
/** Structures: an inharmonic metal/stone clank (FM) over a low knock. */
const CLANK = [0.45, 0, 620, 0, 0.01, 0.2, 1, 1, 0, 0, 0, 0, 0, 0, 37, 0, 0, 0.5, 0.02, 0.2, 0];
/** Magic skill bodies: a falling zap and a sub boom. */
const ZAP = [0.45, 0, 900, 0, 0.02, 0.11, 2, 1, -20, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.5, 0.02, 0, -3000];
const SUB = [0.8, 0, 70, 0, 0.04, 0.2, 0, 1, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.03, 0, -600];
/** The player hurt: a muffled thud and a short grunt. */
const THUD = [0.85, 0, 120, 0, 0.035, 0.15, 0, 2, -5, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.6, 0.03, 0, -900];
const GRUNT = [0.8, 0, 220, 0, 0.03, 0.12, 1, 1.5, -8, 0, 0, 0, 0, 0.6, 0, 0.05, 0, 0.6, 0.02, 0, -1800];
/** Melee swing: a rising high-passed whoosh, ~95 ms. */
const WHOOSH = [0.5, 0, 500, 0.012, 0.025, 0.055, 4, 1, 14, 0, 0, 0, 0, 1.4, 0, 0, 0, 0.5, 0.015, 0, 3200];
/** Ranged launch: a falling "thwip" and a low string twang. */
const THWIP = [0.5, 0, 1300, 0.002, 0.015, 0.055, 1, 1, -30, 0, 0, 0, 0, 0.1, 0, 0, 0, 0.6, 0.01, 0, 0];
const TWANG = [0.3, 0, 260, 0, 0.02, 0.11, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.02, 0, -2000];
/** Magic launch: a rising zip with a vibrato. */
const ZIP = [0.4, 0, 700, 0.004, 0.03, 0.09, 0, 1, 14, 0, 350, 0.03, 0, 0, 8, 0, 0, 0.6, 0.02, 0, 0];
/** Last-hit Fish: two bright pings and a shimmer. */
const PING1 = [0.5, 0, 1568, 0, 0.02, 0.11, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0];
const PING2 = [0.5, 0, 2093, 0, 0.03, 0.16, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01, 0, 0];
const SHIMMER = [0.2, 0, 3136, 0.01, 0.04, 0.22, 0, 1, 0, 0, 0, 0, 0.03, 0, 0, 0, 0, 0.5, 0.02, 0.6, 0];

const L = (z: readonly number[], gain: number, at = 0, rate = 1): BankLayer => ({ z, gain, at, rate });

/** The bank: names are baked as `hb:<name>:<variant>`. */
export const HIT_BANK = Object.freeze({
  // the attacker's side of a basic attack
  swing: { cat: 'swing', jitter: 0.08, peak: 0.7, layers: [L(WHOOSH, 1), L(SNAP, 0.25, 0.05)] },
  swingHeavy: { cat: 'swing', jitter: 0.06, peak: 0.75, layers: [L(WHOOSH, 1, 0, 0.62), L(THUMP, 0.35, 0.06, 0.8)] },
  launch: { cat: 'swing', jitter: 0.06, peak: 0.65, layers: [L(THWIP, 1), L(TWANG, 0.7)] },
  launchMagic: { cat: 'swing', jitter: 0.06, peak: 0.6, layers: [L(ZIP, 1), L(SPARKLE, 0.35, 0.02, 0.8)] },
  // the target's side: the player's own hits (full stack) by target and weight
  hitHero: { cat: 'hit', jitter: 0.06, peak: 0.9, layers: [L(CRACK, 0.8), L(THUMP, 1, 0.003, 0.9), L(FLESH, 0.55, 0.004), L(TAIL, 0.35, 0.01)] },
  hitHeavy: { cat: 'hit', jitter: 0.05, peak: 0.95, layers: [L(CRACK, 0.85, 0, 0.85), L(THUMP, 1, 0.003, 0.8), L(DEEP, 0.9, 0.006), L(FLESH, 0.5, 0.004), L(TAIL, 0.45, 0.012)] },
  hitCrit: { cat: 'hit', jitter: 0.04, peak: 0.98, layers: [L(SNAP, 0.8), L(CRACK, 0.7, 0.002, 0.9), L(DEEP, 1, 0.005), L(THUMP, 0.8, 0.003, 0.75), L(RING, 0.6, 0.01), L(SPARKLE, 0.4, 0.03), L(TAIL, 0.5, 0.015)] },
  hitUnit: { cat: 'hit', jitter: 0.08, peak: 0.75, layers: [L(CRACK, 0.7, 0, 1.15), L(THUMP, 0.75, 0.003, 1.2), L(FLESH, 0.35, 0.004, 1.2), L(TAIL, 0.2, 0.01, 1.2)] },
  hitStructure: { cat: 'hit', jitter: 0.05, peak: 0.8, layers: [L(CRACK, 0.75, 0, 0.7), L(CLANK, 0.8, 0.003), L(THUMP, 0.6, 0.004, 0.65), L(TAIL, 0.35, 0.012, 0.8)] },
  hitMagic: { cat: 'hit', jitter: 0.06, peak: 0.85, layers: [L(SNAP, 0.45), L(ZAP, 0.8, 0.002), L(SUB, 0.9, 0.004), L(SPARKLE, 0.25, 0.02), L(TAIL, 0.4, 0.01)] },
  // others' fights: a light crack and thump (quieter at the call site)
  hitOther: { cat: 'hit', jitter: 0.1, peak: 0.6, layers: [L(CRACK, 0.6, 0, 1.1), L(THUMP, 0.7, 0.003, 1.1)] },
  // the player being hit
  hurt: { cat: 'hurt', jitter: 0.06, peak: 0.85, layers: [L(THUD, 1), L(GRUNT, 0.6, 0.01), L(TAIL, 0.25, 0.02, 0.7)] },
  hurtHeavy: { cat: 'hurt', jitter: 0.05, peak: 0.95, layers: [L(THUD, 1, 0, 0.85), L(DEEP, 0.8, 0.004), L(GRUNT, 0.6, 0.012, 0.9), L(TAIL, 0.35, 0.02, 0.6)] },
  // a last hit's Fish
  fish: { cat: 'ping', jitter: 0.02, peak: 0.6, layers: [L(PING1, 0.9), L(PING2, 1, 0.055), L(SHIMMER, 0.6, 0.06)] },
} satisfies Record<string, BankSound>) as Readonly<Record<string, BankSound>>;

export type HitKind = keyof typeof HIT_BANK & string;

export const bankName = (kind: string, v: number): string => `hb:${kind}:${v}`;

/** Longest a bank sound may be (s): a hit never smears into the next. */
export const BANK_MAX_SECONDS = 0.45;

/** mulberry32: the bake's variant seed (deterministic, so every device hears the same four variants). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Mix one variant of a bank sound to mono PCM (peak-normalised, short fade out). Pure and deterministic. */
export function renderBankSound(kind: string, variant: number, rate = PCM_RATE): Float32Array {
  const s = HIT_BANK[kind];
  if (!s) return new Float32Array(0);
  const rnd = seeded(hash(kind) + variant * 7919);
  const parts: { pcm: Float32Array; gain: number; off: number; step: number }[] = [];
  let len = 0;
  for (const l of s.layers) {
    const z = [...l.z];
    // variant 0 is the design itself; the others shift each layer's pitch (and its filter) a little
    const shift = variant === 0 ? 1 : 1 + s.jitter * (rnd() * 2 - 1);
    z[2] *= shift;
    if (z[20]) z[20] *= shift;
    const pcm = zzfxSamples(z, rate);
    const step = l.rate ?? 1;
    const off = Math.round((l.at ?? 0) * rate);
    const n = off + Math.floor(pcm.length / step);
    if (n > len) len = n;
    parts.push({ pcm, gain: l.gain, off, step });
  }
  len = Math.min(len, Math.round(BANK_MAX_SECONDS * rate));
  const out = new Float32Array(len);
  for (const p of parts) {
    const n = Math.min(len - p.off, Math.floor(p.pcm.length / p.step));
    for (let i = 0; i < n; i++) {
      // linear resample for the layer's rate
      const x = i * p.step;
      const i0 = x | 0;
      const f = x - i0;
      const a = p.pcm[i0] ?? 0;
      const b = p.pcm[i0 + 1] ?? a;
      out[p.off + i] += (a + (b - a) * f) * p.gain;
    }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? s.peak / peak : 0;
  const fade = Math.min(len, Math.round(0.004 * rate));
  for (let i = 0; i < len; i++) {
    const tail = len - i <= fade ? (len - i) / fade : 1;
    out[i] *= k * tail;
  }
  return out;
}

/**
 * Per-play variation: the next variant (round-robin with a random skip, never the one that just played) and a small
 * pitch and volume jitter. Writes into one reused object (no per-hit allocation). `rng` is injectable for tests.
 */
export class HitVariation {
  private readonly last = new Map<string, number>();
  readonly pick = { variant: 0, rate: 1, vol: 1 };
  constructor(private readonly rng: () => number = Math.random) {}

  next(kind: string): { variant: number; rate: number; vol: number } {
    const prev = this.last.get(kind) ?? -1;
    const v = prev < 0 ? Math.floor(this.rng() * HIT_VARIANTS) % HIT_VARIANTS : (prev + 1 + Math.floor(this.rng() * (HIT_VARIANTS - 1))) % HIT_VARIANTS;
    this.last.set(kind, v);
    this.pick.variant = v;
    this.pick.rate = 1 + (this.rng() * 2 - 1) * RATE_JITTER;
    this.pick.vol = 1 - this.rng() * VOL_JITTER;
    return this.pick;
  }
}

/** Something that can be stopped (a playing BufferSource). */
export interface Stoppable {
  stop(): void;
}

interface VoiceSlot {
  end: number;
  start: number;
  mine: boolean;
  src: Stoppable | null;
}

/**
 * Category voice caps. `admit` finds a free slot (its voice ended by `now`), else steals: the player's own sound
 * takes the oldest other sound (or, all being the player's, the oldest of those); someone else's sound is dropped.
 * Fixed slot arrays, no allocation per play.
 */
export class HitVoices {
  private readonly slots: Record<HitCat, VoiceSlot[]>;
  /** Plays dropped for a full category, and voices stolen (tests, debugging). */
  dropped = 0;
  stolen = 0;
  constructor(max: Readonly<Record<HitCat, number>> = HIT_CAT_MAX) {
    const mk = (n: number): VoiceSlot[] => Array.from({ length: n }, () => ({ end: -1, start: -1, mine: false, src: null }));
    this.slots = { swing: mk(max.swing), hit: mk(max.hit), hurt: mk(max.hurt), ping: mk(max.ping) };
  }

  /** A slot index to play in, or -1 (dropped). A stolen voice is stopped here. */
  admit(cat: HitCat, now: number, mine: boolean): number {
    const list = this.slots[cat];
    for (let i = 0; i < list.length; i++) if (list[i].end <= now) return i;
    // full: someone else's sound is dropped; the player's own takes the oldest other sound, else its own oldest
    if (!mine) {
      this.dropped++;
      return -1;
    }
    let victim = 0;
    for (let i = 1; i < list.length; i++) {
      const s = list[i];
      const v = list[victim];
      if ((v.mine && !s.mine) || (v.mine === s.mine && s.start < v.start)) victim = i;
    }
    const v = list[victim];
    try {
      v.src?.stop();
    } catch {
      /* already ended */
    }
    v.end = -1;
    v.src = null;
    this.stolen++;
    return victim;
  }

  /** Hold a slot for a started voice. */
  set(cat: HitCat, i: number, now: number, dur: number, mine: boolean, src: Stoppable | null): void {
    const s = this.slots[cat][i];
    s.start = now;
    s.end = now + Math.max(0.01, dur);
    s.mine = mine;
    s.src = src;
  }

  /** Voices of a category still playing at `now`. */
  live(cat: HitCat, now: number): number {
    let n = 0;
    for (const s of this.slots[cat]) if (s.end > now) n++;
    return n;
  }

  clear(): void {
    for (const k of Object.keys(this.slots) as HitCat[]) for (const s of this.slots[k]) {
      s.end = -1;
      s.src = null;
    }
  }
}

/** How a skill nature lands: a sharp cut, a blunt weight or a magic burst (picks the player's impact body). */
export type HitBody = 'sharp' | 'blunt' | 'magic';
const BODY: Readonly<Record<Nature, HitBody>> = Object.freeze({
  slash: 'sharp',
  impact: 'blunt',
  projectile: 'sharp',
  fire: 'magic',
  frost: 'magic',
  splash: 'magic',
  arcane: 'magic',
  shadow: 'magic',
  electric: 'magic',
  sonic: 'blunt',
  heal: 'sharp',
  guard: 'blunt',
  mobility: 'sharp',
  empower: 'sharp',
} as Record<Nature, HitBody>);
export const natureBody = (n: Nature | undefined): HitBody => (n && BODY[n]) || 'sharp';

/** A hero's basic attack: melee claw (swing), melee bonk (tanks), a shot (marksmen) or a magic bolt (mages, supports). */
export type AttackStyle = 'claw' | 'bonk' | 'shot' | 'bolt';
/** Basic range (sim units, mm) at or under which a hero is melee. */
export const MELEE_RANGE = 2000;

export function attackStyle(hero: HeroId): AttackStyle {
  const h = HEROES[hero];
  if (!h) return 'claw';
  if (h.base.range <= MELEE_RANGE) return h.role === 'tank' ? 'bonk' : 'claw';
  return h.role === 'mage' || h.role === 'support' ? 'bolt' : 'shot';
}

export const STYLE_SOUND: Readonly<Record<AttackStyle, HitKind>> = Object.freeze({ claw: 'swing', bonk: 'swingHeavy', shot: 'launch', bolt: 'launchMagic' });

/** Each hero's own swing pitch (within ±8%, stable per hero): two claw heroes never sound identical. */
export function heroSwingRate(hero: HeroId): number {
  return 0.92 + ((hash(hero) % 1000) / 1000) * 0.16;
}

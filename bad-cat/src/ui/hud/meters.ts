/**
 * Meter and anchor maths for the v5 HUD (pure; tested): the Sunday noise meter, which meter shows, which human the
 * suspicion eye floats above, the per-human state pips, and the eye's screen anchor with its corner fallback.
 */
import { HumanSt, NOISE, SUSPICION_MAX, type SimState } from '../../types';

/** Noise milli-units → 0..100 % (NOISE.max = 100). */
export function noisePct(noise: number | undefined): number {
  const n = Number.isFinite(noise) ? (noise as number) : 0;
  return Math.max(0, Math.min(100, Math.round((n / NOISE.max) * 100)));
}

/** Suspicion milli-units → 0..100 %. */
export function suspicionPct(susp: number): number {
  return Math.max(0, Math.min(100, Math.round((susp / SUSPICION_MAX) * 100)));
}

/** Percent at which the Zzz bar pulses and the wake warning shows. */
export const NOISE_PULSE_PCT = 75;

export interface NoiseView {
  /** 0..100 */
  pct: number;
  /** >= NOISE_PULSE_PCT: the bar pulses. */
  pulse: boolean;
  /** Wake warning: about to wake (>= 75 %) or yawning (TELEGRAPH after a wake). */
  warn: boolean;
  /** The room event froze the meter (alarm, courier...). */
  frozen: boolean;
  /** Human index of the napper. */
  human: number;
}

/** Index of the napper, -1 none (v4 runs never have one). */
export function napperOf(s: SimState): number {
  const n = s.napper;
  return typeof n === 'number' && n >= 0 && n < s.humans.length ? n : -1;
}

/**
 * The Zzz meter while the napper sleeps (or yawns, or the room event froze it); null when there is no napper or she
 * is up and looking (then the suspicion eye speaks).
 */
export function noiseView(s: SimState): NoiseView | null {
  const i = napperOf(s);
  if (i < 0) return null;
  const st = s.humans[i].state;
  if (st === HumanSt.LOOK || st === HumanSt.FAKEOUT) return null;
  const pct = noisePct(s.noise);
  const yawn = st === HumanSt.TELEGRAPH;
  return { pct, pulse: pct >= NOISE_PULSE_PCT, warn: pct >= NOISE_PULSE_PCT || yawn, frozen: st === HumanSt.EVENT, human: i };
}

/** The suspicion eye shows unless every human is a sleeping napper (Sunday: the Zzz bar replaces it). */
export function eyeVisible(s: SimState): boolean {
  const nap = napperOf(s);
  for (let i = 0; i < s.humans.length; i++) {
    if (i === nap && (s.humans[i].state === HumanSt.NAP || s.humans[i].state === HumanSt.EVENT)) continue;
    return true;
  }
  return s.humans.length === 0;
}

const ALARM: Record<number, number> = {
  [HumanSt.LOOK]: 4,
  [HumanSt.TELEGRAPH]: 3,
  [HumanSt.FAKEOUT]: 2,
  [HumanSt.BUSY]: 1,
  [HumanSt.EVENT]: 0,
  [HumanSt.NAP]: 0,
};

/** The human the eye floats above: the most alarming one (LOOK > TELEGRAPH > FAKEOUT > BUSY), ties to the lower index. */
export function watchedHuman(s: SimState): number {
  let best = 0;
  let bv = -1;
  const nap = napperOf(s);
  for (let i = 0; i < s.humans.length; i++) {
    let v = ALARM[s.humans[i].state] ?? 0;
    if (i === nap && s.humans[i].state === HumanSt.NAP) v = -0.5;
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

/** Tiny per-human state pip for two-human rooms: '?' turning, '!' looking, 'z' asleep, '' busy/away. */
export function humanPip(state: number): '' | '?' | '!' | 'z' {
  if (state === HumanSt.TELEGRAPH) return '?';
  if (state === HumanSt.LOOK) return '!';
  if (state === HumanSt.NAP) return 'z';
  return '';
}

export interface ScreenPoint {
  x: number;
  y: number;
  onScreen?: boolean;
}

/** Eye height above the head (0..1 of the stage height) and the clamp band (under the top HUD, above the controls). */
export const EYE_LIFT = 0.075;
export const EYE_MIN_Y = 0.17;
export const EYE_MAX_Y = 0.78;

/**
 * Where the eye floats (0..1, y down) above a projected head, or null to fall back to the HUD corner: no projection,
 * off screen or a broken number.
 */
export function eyeAnchor(p: ScreenPoint | null | undefined): { x: number; y: number } | null {
  if (!p || p.onScreen === false) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null;
  return { x: Math.max(0.1, Math.min(0.9, p.x)), y: Math.max(EYE_MIN_Y, Math.min(EYE_MAX_Y, p.y - EYE_LIFT)) };
}

// STYLE lane, pure: the style rank S/A/B/C from style points per 100 u of distance, plus the slow-motion curve and
// the finish camera swing path (both pure so they are unit tested).

export type Rank = 'S' | 'A' | 'B' | 'C';
/** style points per 100 u needed for each rank (meadow: a casual run is about 300, a trick-heavy one about 2000) */
export const RANK_AT: Readonly<Record<'S' | 'A' | 'B', number>> = { S: 1200, A: 600, B: 250 };
/** short runs (dev jumps, early quits) count as this long, so one lucky trick is not an S */
export const RANK_MIN_DIST = 200;

export function stylePer100(stylePoints: number, distance: number): number {
  const d = Math.max(RANK_MIN_DIST, Number.isFinite(distance) ? distance : 0);
  return (Math.max(0, stylePoints) / d) * 100;
}

export function rankFor(stylePoints: number, distance: number): Rank {
  const per = stylePer100(stylePoints, distance);
  if (per >= RANK_AT.S) return 'S';
  if (per >= RANK_AT.A) return 'A';
  if (per >= RANK_AT.B) return 'B';
  return 'C';
}

// ---------------------------------------------------------------- slow motion
export interface SlowMo {
  /** time scale while held */
  k: number;
  /** real ms at k */
  hold: number;
  /** real ms easing back to 1 */
  ease: number;
}
export const NEAR_MISS_SLOWMO: SlowMo = { k: 0.35, hold: 280, ease: 180 };
export const FINISH_SLOWMO: SlowMo = { k: 0.45, hold: 600, ease: 160 };
export const SLOWMO_COOLDOWN_MS = 3500;

/** the time scale `ms` real milliseconds into a slow-mo (1 once it is over) */
export function slowmoScale(s: SlowMo, ms: number): number {
  if (!(ms >= 0)) return 1;
  if (ms <= s.hold) return s.k;
  const u = (ms - s.hold) / Math.max(1, s.ease);
  if (u >= 1) return 1;
  const e = u * u * (3 - 2 * u);
  return s.k + (1 - s.k) * e;
}
/** total real ms of a slow-mo */
export const slowmoLength = (s: SlowMo): number => s.hold + s.ease;

// ---------------------------------------------------------------- finish camera swing
/** sim seconds the swing owns the camera (the run-out is 2.2 s; the camera goes back just before it ends) */
export const SWING_TIME = 2.15;
/** sim seconds until the swing reaches the 3/4 front, which it then holds until SWING_TIME */
export const SWING_ARRIVE = 1.0;

export interface SwingPose {
  /** degrees around Mochi from straight behind (+ = to the swing's side) */
  angle: number;
  /** distance from her (u) */
  dist: number;
  /** height above the track (u) */
  height: number;
  /** look height on her (u) */
  look: number;
  /** 0..1 how much of the path (vs the camera's start offset) applies */
  blend: number;
}

const smooth = (u: number) => {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
};

/**
 * The swing at sim time t (seconds from the finish line): out to her side while she brakes (72 deg at 0.45 s), then
 * onto a close 3/4 front of her victory pose (she turns round to face back down the track, see cat/mochi.ts) by
 * SWING_ARRIVE, dollying in and down, and held there until SWING_TIME.
 */
export function swingPose(t: number, out: SwingPose): SwingPose {
  const tt = Math.max(0, Math.min(SWING_TIME, t));
  const up = smooth(tt / 0.45);
  const down = smooth((tt - 0.45) / (SWING_ARRIVE - 0.45));
  const arrive = smooth(tt / SWING_ARRIVE);
  out.angle = 72 * up - 34 * down;
  out.dist = 6.4 - 2.2 * arrive;
  out.height = 2.4 - 0.95 * arrive;
  out.look = 0.75 - 0.15 * arrive;
  out.blend = smooth(tt / 0.5);
  return out;
}

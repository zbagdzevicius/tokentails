// Pure formatting and tween helpers for the menus and HUD (node-importable). META-UI lane.

/** 14206 -> "14,206" (en-US grouping, rounds, never NaN) */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(n);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `-${s}` : s;
}

/** 102.4 -> "1:42" */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 1234.5 u -> "1,235 m" */
export const fmtDist = (u: number) => `${fmtInt(u)} m`;

/** ease-out cubic count-up: value at time t of a dur-second tween from 0 to target */
export function countUp(target: number, t: number, dur: number): number {
  if (dur <= 0 || t >= dur) return target;
  if (t <= 0) return 0;
  const k = 1 - Math.pow(1 - t / dur, 3);
  return target * k;
}

/** number of true stars */
export const starCount = (s: readonly boolean[]) => s.reduce((n, b) => n + (b ? 1 : 0), 0);

/** total stars across stage progress records */
export function totalStars(stages: Record<string, { stars: readonly boolean[] } | undefined>): number {
  let n = 0;
  for (const k of Object.keys(stages)) n += starCount(stages[k]?.stars ?? []);
  return n;
}

/** The results title for a run. */
export function resultTitle(finished: boolean, ending: boolean, endless: boolean, stars: number): string {
  if (endless) return 'Run over!';
  if (!finished) return 'Out of hearts!';
  if (ending) return 'Home for dinner!';
  return stars >= 3 ? 'PURRFECT!' : stars === 2 ? 'Great run!' : 'Stage clear!';
}

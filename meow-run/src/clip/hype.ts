// Pure: the clip's hype timeline data (what the HUD showed, on the capture clock) and the queries the render makes
// for one video frame: the score counter, the combo pill, the stamp, the newest popups, a core callout, and the crop
// focus for 9:16 (Mochi, or Mochi and a chaser). Node-importable (no DOM).

export type MarkKind = 'stamp' | 'rank' | 'pop' | 'combo' | 'callout';
export interface Mark {
  t: number;
  kind: MarkKind;
  text: string;
  sub: string;
  tier: number;
  n: number;
  tone: string;
}
export interface Timeline {
  marks: Mark[];
  /** samples: capture time, score, Mochi's and the chaser's screen x (0..1; NaN = none) */
  st: number[];
  score: number[];
  mx: number[];
  cx: number[];
}

/** a new timeline, or clear one in place */
export function newTimeline(into?: Timeline): Timeline {
  if (into) {
    into.marks.length = 0;
    into.st.length = into.score.length = into.mx.length = into.cx.length = 0;
    return into;
  }
  return { marks: [], st: [], score: [], mx: [], cx: [] };
}

export function pushMark(tl: Timeline, t: number, kind: MarkKind, text: string, sub: string, tier: number, n: number, tone: string): void {
  tl.marks.push({ t, kind, text, sub, tier, n, tone });
}
export function pushSample(tl: Timeline, t: number, score: number, mx: number, cx: number): void {
  tl.st.push(t);
  tl.score.push(score);
  tl.mx.push(mx);
  tl.cx.push(cx);
}
/** drop everything before `before` (the newest combo mark before it is kept: it is still the shown count) */
export function prune(tl: Timeline, before: number): void {
  let k = 0;
  while (k < tl.st.length - 1 && tl.st[k + 1] < before) k++;
  if (k > 0) {
    tl.st.splice(0, k);
    tl.score.splice(0, k);
    tl.mx.splice(0, k);
    tl.cx.splice(0, k);
  }
  let m = 0;
  while (m < tl.marks.length && tl.marks[m].t < before - 2) m++;
  if (m > 0) {
    let lastCombo: Mark | null = null;
    for (let i = 0; i < m; i++) if (tl.marks[i].kind === 'combo') lastCombo = tl.marks[i];
    tl.marks.splice(0, m);
    if (lastCombo) tl.marks.unshift(lastCombo);
  }
}

/** last index i with arr[i] <= t (-1 = none); arr ascending */
function floorIdx(arr: readonly number[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || arr[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** the score shown at t (linear between samples; NaN before the first) */
export function scoreAt(tl: Timeline, t: number): number {
  const i = floorIdx(tl.st, t);
  if (i < 0) return tl.score.length ? tl.score[0] : NaN;
  if (i >= tl.st.length - 1) return tl.score[i];
  const u = (t - tl.st[i]) / Math.max(1e-6, tl.st[i + 1] - tl.st[i]);
  return tl.score[i] + (tl.score[i + 1] - tl.score[i]) * Math.max(0, Math.min(1, u));
}

/** where to centre a 9:16 crop at t (0..1 of the width; NaN = no data): Mochi, or between her and a chaser when
 *  both fit in `span` (the crop's width as a fraction of the source) */
export function focusAt(tl: Timeline, t: number, span: number): number {
  const i = floorIdx(tl.st, t);
  if (i < 0) return NaN;
  const j = Math.min(tl.st.length - 1, i + 1);
  const u = j > i ? Math.max(0, Math.min(1, (t - tl.st[i]) / Math.max(1e-6, tl.st[j] - tl.st[i]))) : 0;
  const lerp = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * u : Number.isFinite(a) ? a : b);
  const m = lerp(tl.mx[i], tl.mx[j]);
  const c = lerp(tl.cx[i], tl.cx[j]);
  if (!Number.isFinite(m)) return NaN;
  if (Number.isFinite(c) && Math.abs(c - m) < span * 0.8) return (m + c) / 2;
  return m;
}

export interface HypeFrame {
  /** the combo pill (n < 2 = hidden) */
  combo: number;
  comboTier: number;
  /** the stamp (null = none) and seconds since it began */
  stamp: Mark | null;
  stampAge: number;
  /** up to 3 newest popups within POP_LIFE, newest first, with their ages */
  pops: Mark[];
  popAges: number[];
  /** a core callout (null = none) and its age */
  callout: Mark | null;
  calloutAge: number;
}
export const STAMP_LIFE = 1.15;
export const RANK_LIFE = 1.9;
export const POP_LIFE = 1.5;
export const CALLOUT_LIFE = 1.25;

export const newFrame = (): HypeFrame => ({ combo: 0, comboTier: 0, stamp: null, stampAge: 0, pops: [], popAges: [], callout: null, calloutAge: 0 });

/** what the HUD showed at t (reuses `out`) */
export function hypeAt(tl: Timeline, t: number, out: HypeFrame): HypeFrame {
  out.combo = 0;
  out.comboTier = 0;
  out.stamp = null;
  out.callout = null;
  out.pops.length = 0;
  out.popAges.length = 0;
  const marks = tl.marks;
  let comboFound = false;
  // newest first, back to the oldest that can still be on screen
  for (let i = marks.length - 1; i >= 0; i--) {
    const mk = marks[i];
    const age = t - mk.t;
    if (age < 0) continue;
    if (mk.kind === 'combo') {
      if (!comboFound) {
        comboFound = true;
        out.combo = mk.n;
        out.comboTier = mk.tier;
      }
    } else if (mk.kind === 'stamp' || mk.kind === 'rank') {
      if (!out.stamp && age < (mk.kind === 'rank' ? RANK_LIFE : STAMP_LIFE)) {
        out.stamp = mk;
        out.stampAge = age;
      }
    } else if (mk.kind === 'pop') {
      if (out.pops.length < 3 && age < POP_LIFE) {
        out.pops.push(mk);
        out.popAges.push(age);
      }
    } else if (!out.callout && age < CALLOUT_LIFE) {
      out.callout = mk;
      out.calloutAge = age;
    }
    if (comboFound && age > RANK_LIFE + 0.5) break;
  }
  return out;
}

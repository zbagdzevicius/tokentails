/**
 * Track Doodle geometry (GDD 6.4 step 1). Pure, no DOM: a finger stroke in world metres becomes 16–24 control points
 * on the 4 m grid, smoothed until the tightest turn is at least 9 m, plus starter stickers (start on the straightest
 * 40 m, two item rows, a boost pad), so a first doodle is drivable straight away.
 */
import type { TrackDef, TrackPoint } from '../../types';
import { TRACK } from '../../tuning';
import { buildTrack, type BuiltTrack } from '../../core/track/build';
import { LIMITS, lapsFor } from './validate';

export interface P2 {
  x: number;
  z: number;
}

export type DoodleResult = { ok: true; points: TrackPoint[] } | { ok: false; reason: 'tiny' | 'open' };

/** Ends further apart than this do not close on their own (GDD: 40 m). */
export const CLOSE_DIST = 40;
const TARGET_MIN_LEN = 340;
const FIT = 120;

function perimeter(p: P2[]): number {
  let L = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    L += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return L;
}

/** Even arc-length resample of a closed polyline. */
export function resampleLoop(p: P2[], count: number): P2[] {
  const L = perimeter(p);
  const step = L / count;
  const out: P2[] = [];
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(p[1 % p.length].x - p[0].x, p[1 % p.length].z - p[0].z);
  for (let k = 0; k < count; k++) {
    const s = k * step;
    while (segStart + segLen < s && seg < p.length - 1) {
      segStart += segLen;
      seg++;
      const a = p[seg];
      const b = p[(seg + 1) % p.length];
      segLen = Math.hypot(b.x - a.x, b.z - a.z);
    }
    const a = p[seg];
    const b = p[(seg + 1) % p.length];
    const f = segLen > 1e-9 ? (s - segStart) / segLen : 0;
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return out;
}

const snap = (v: number): number => Math.max(LIMITS.coordMin, Math.min(LIMITS.coordMax, Math.round(v / TRACK.grid) * TRACK.grid)) || 0;

function snapLoop(p: P2[], w: TrackPoint['w']): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const q of p) {
    const pt: TrackPoint = { x: snap(q.x), z: snap(q.z), h: 0, w };
    const last = out[out.length - 1];
    if (last && last.x === pt.x && last.z === pt.z) continue;
    out.push(pt);
  }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].z === out[out.length - 1].z) out.pop();
  return out;
}

function minRadiusOf(points: TrackPoint[]): number {
  try {
    return buildTrack({ v: 1, id: 'doodle', name: '', theme: 0, timeOfDay: 0, laps: 3, points, features: [] }).minRadius;
  } catch {
    return 0;
  }
}

/** Centre the stroke, scale it into ±120 m and up to a raceable length. */
function fitLoop(p: P2[]): P2[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const q of p) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const half = Math.max(maxX - minX, maxZ - minZ, 1) / 2;
  const L = perimeter(p);
  let k = 1;
  if (L < TARGET_MIN_LEN) k = TARGET_MIN_LEN / L;
  if (half * k > FIT) k = FIT / half;
  return p.map((q) => ({ x: (q.x - cx) * k, z: (q.z - cz) * k }));
}

/**
 * Stroke (world metres, in drawing order) → control points. `open` when the ends are more than 40 m apart,
 * `tiny` when the stroke is a scribble.
 */
export function doodleToPoints(stroke: readonly P2[], width: TrackPoint['w'] = 2): DoodleResult {
  const raw = stroke.filter((q, i) => i === 0 || Math.hypot(q.x - stroke[i - 1].x, q.z - stroke[i - 1].z) > 0.5);
  if (raw.length < 8) return { ok: false, reason: 'tiny' };
  const a = raw[0];
  const b = raw[raw.length - 1];
  if (Math.hypot(a.x - b.x, a.z - b.z) > CLOSE_DIST) return { ok: false, reason: 'open' };
  if (perimeter(raw) < 60) return { ok: false, reason: 'tiny' };
  let loop = fitLoop(raw);
  const count = Math.max(16, Math.min(24, Math.round(perimeter(loop) / 24)));
  loop = resampleLoop(loop, count);
  let pts = snapLoop(loop, width);
  // smooth (Laplacian, perimeter kept) until the tightest turn reaches 9 m (plus a little margin)
  for (let it = 0; it < 14 && (pts.length < 8 || minRadiusOf(pts) < LIMITS.minRadius + 1); it++) {
    const L0 = perimeter(loop);
    const n = loop.length;
    loop = loop.map((q, i) => {
      const p0 = loop[(i - 1 + n) % n];
      const p1 = loop[(i + 1) % n];
      return { x: q.x + 0.5 * ((p0.x + p1.x) / 2 - q.x), z: q.z + 0.5 * ((p0.z + p1.z) / 2 - q.z) };
    });
    const L1 = perimeter(loop);
    if (L1 > 1) loop = fitLoop(loop.map((q) => ({ x: (q.x * L0) / L1, z: (q.z * L0) / L1 })));
    pts = snapLoop(loop, width);
  }
  if (pts.length < 8) return { ok: false, reason: 'tiny' };
  return { ok: true, points: pts };
}

// ------------------------------------------------------------------------------------------------
// Sticker positions: feature `s` (0..255 of the lap from point 0) ↔ built-track sample index
// ------------------------------------------------------------------------------------------------

/** Sample index of the start line in the un-rotated spline (buildTrack rotates so the start is sample 0). */
function startOffset(def: TrackDef, n: number): number {
  const f = def.features.find((x) => x.kind === 'start');
  return f ? Math.round((f.s / 256) * n) % n : 0;
}

/** Built sample index → feature `s`. */
export function sampleToS(def: TrackDef, t: BuiltTrack, i: number): number {
  const u = (i + startOffset(def, t.n)) % t.n;
  return Math.round((u / t.n) * 256) % 256;
}

/** Feature `s` → built sample index (same rounding as buildTrack). */
export function sToSample(def: TrackDef, t: BuiltTrack, s: number): number {
  return (((Math.round((s / 256) * t.n) - startOffset(def, t.n)) % t.n) + t.n) % t.n;
}

/** Nearest built sample to a world point, with the lateral offset (+ = right of travel). */
export function nearestOnTrack(t: BuiltTrack, x: number, z: number): { i: number; d: number; dist: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < t.n; i += 2) {
    const dx = t.px[i] - x;
    const dz = t.pz[i] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  for (let k = -2; k <= 2; k++) {
    const i = (best + k + t.n) % t.n;
    const d2 = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  const d = (x - t.px[best]) * -t.tz[best] + (z - t.pz[best]) * t.tx[best];
  return { i: best, d, dist: Math.sqrt(bestD) };
}

/** World position of a sticker drawn on the map. */
export function featurePos(t: BuiltTrack, i: number, side: number): P2 {
  const off = side * t.halfW[i] * 0.5;
  return { x: t.px[i] - t.tz[i] * off, z: t.pz[i] + t.tx[i] * off };
}

/** The straightest window of `len` metres: returns its centre sample (built indices). */
export function straightestSample(t: BuiltTrack, len = 40, avoid: number[] = [], avoidM = 80): number {
  const w = Math.max(2, Math.round(len / t.step));
  let best = 0;
  let bestScore = Infinity;
  const n = t.n;
  for (let i = 0; i < n; i += 4) {
    let near = false;
    for (const a of avoid) {
      const sep = Math.min(Math.abs(i - a), n - Math.abs(i - a)) * t.step;
      if (sep < avoidM) near = true;
    }
    if (near) continue;
    let s = 0;
    for (let k = -w; k <= w; k += 2) s += Math.abs(t.curv[(i + k + n) % n]);
    if (s < bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

/**
 * Starter stickers for a fresh doodle: the start on the straightest stretch (shifted forward so the grid sits on the
 * straight too), item rows at about 25 % and 65 % of the lap, a boost pad on the best remaining straight.
 */
export function starterFeatures(points: TrackPoint[], theme: TrackDef['theme']): TrackDef {
  const base: TrackDef = { v: 1, id: 'draft', name: '', theme, timeOfDay: theme === 1 ? 2 : 0, laps: 3, points, features: [{ s: 0, kind: 'start' }] };
  const t0 = buildTrack(base);
  const n = t0.n;
  const centre = straightestSample(t0, 50);
  const startI = (centre + Math.round(18 / t0.step)) % n;
  const startS = sampleToS(base, t0, startI);
  const def: TrackDef = { ...base, features: [{ s: startS, kind: 'start' }] };
  const t = buildTrack(def);
  const at = (frac: number) => sampleToS(def, t, Math.round(frac * t.n) % t.n);
  def.features.push({ s: at(0.25), kind: 'items' }, { s: at(0.65), kind: 'items' });
  const padI = straightestSample(t, 30, [0, Math.round(0.25 * t.n), Math.round(0.65 * t.n)], 60);
  def.features.push({ s: sampleToS(def, t, padI), kind: 'pad', side: 0 });
  def.laps = lapsFor(t.length);
  return def;
}

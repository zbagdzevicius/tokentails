/**
 * Alternative routes (iteration 2, tracks lane): `TrackDef.branches` → `BuiltBranch`. A branch is an open spline that
 * leaves the main loop at lap fraction `from` and rejoins at `to`, with its own width, walls, surface and racing line.
 *
 * How it plugs into the sim without a kart physics change (LANES.md "Track query"):
 * - `queryTrack` reports a point on a branch with the branch's walls, surface, height and `branch` id, and a lap
 *   position `s` that maps linearly onto the main loop's `from..to` range (laps, places and the watchdog keep working).
 * - The `i` it reports (the kart's `si`) is `mapI[j]`: the main sample near the linear map whose direction best matches
 *   the branch there, so everything that reads the main tangent at `si` (wall normals, wrong way, the respawn hand)
 *   sees the right direction.
 * - Where the branch and the main road overlap (the fork and the merge), both get "union" walls: the wall on that side
 *   is the far edge of the contiguous drivable area, so a kart drives from one road onto the other freely.
 *
 * Sim-safe math only (GDD 3.1): this runs inside `buildTrack`.
 */
import { Surface, type TrackBranch } from '../../types';
import { AI, CLASSES, PHYS, TRACK } from '../../tuning';
import { atan2L, clamp, wrapAngle } from '../sim/fixed';
import { densePolylineOpen, resampleOpen, type Vec3 } from './spline';

/** The main-loop arrays a branch needs (a BuiltTrack before its branches are attached). */
export interface MainArrays {
  n: number;
  step: number;
  length: number;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  curv: Float64Array;
  bank: Float64Array;
  halfW: Float64Array;
  wallL: Float64Array;
  wallR: Float64Array;
}

export interface BuiltBranch {
  id: number;
  label: string;
  /** main sample indices of the fork and the merge, and how many main samples the branch replaces */
  from: number;
  to: number;
  span: number;
  /** samples 0..m-1, both ends included (0 sits on the main centre line at the fork, m-1 at the merge) */
  m: number;
  step: number;
  length: number;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  curv: Float64Array;
  bank: Float64Array;
  halfW: Float64Array;
  /** walls (union with the main road where the two overlap) and the branch's own walls */
  wallL: Float64Array;
  wallR: Float64Array;
  ownL: Float64Array;
  ownR: Float64Array;
  line: Float64Array;
  /** main index each sample reports as `si` (direction-matched, near the linear map) */
  mapI: Int32Array;
  /** lap position of sample j: s0 + j × sk (wrapped by the caller) */
  s0: number;
  sk: number;
  surface: Surface;
  /** bounding box including the walls */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** expected seconds through the branch and through the main stretch it replaces (100cc, no items) */
  tBranch: number;
  tMain: number;
  /** boost pads on the branch (sample, half length in samples, half width) */
  pads: Array<{ j: number; halfLen: number; halfW: number }>;
  /** a missing stretch of deck (samples j0..j1-1); the far side starts at height y1 */
  gap: { j0: number; j1: number; y1: number } | null;
  /** worst angle (radians) between the branch and the main tangent at its mapped `si` (walls push along that) */
  mapMis: number;
  /** metres from the fork (and before the merge) over which the branch still overlaps the main road */
  overlap: number;
  overlapEnd: number;
  /** which side of the main road the branch leaves from and rejoins on (+1 right, -1 left) */
  sideA: number;
  sideB: number;
}

const PHANTOM = 10; // m of main loop before the fork / after the merge that set the end tangents
const BLEND = 10; // m over which the main road's banking fades out of the branch
/** m the branch runs straight along the main road's tangent at the fork and the merge */
const LEAD = 14;

/** Main sample index `k` samples from `i` (closed loop). */
const wrap = (i: number, n: number): number => ((i % n) + n) % n;

/** Main samples from `a` forward to `b` (0..n-1). */
export const fwd = (a: number, b: number, n: number): number => wrap(b - a, n);

/** A branch ready to build: main sample indices and the interior control points in world space (mirror applied). */
export interface BranchSpec {
  from: number;
  to: number;
  pts: Vec3[];
  /** half width at each interior point */
  halfW: number[];
  surface: Surface;
  label: string;
}

/** `TrackDef.branches[k]` → BranchSpec (`idx` maps a 0..255 lap fraction to a main sample, like features). */
export function specOf(def: TrackBranch, mirror: boolean, idx: (s: number) => number): BranchSpec {
  return {
    from: idx(def.from),
    to: idx(def.to),
    pts: def.points.map((p) => ({ x: mirror ? -p.x : p.x, y: p.h * TRACK.heightStep, z: p.z })),
    halfW: def.points.map((p) => (TRACK.widths[p.w] ?? 12) / 2),
    surface: def.surface === 'offroad' ? Surface.Offroad : def.surface === 'lowgrip' ? Surface.LowGrip : Surface.Road,
    label: def.label ?? '',
  };
}

export function buildBranch(t: MainArrays, spec: BranchSpec, id: number): BuiltBranch | null {
  const n = t.n;
  const { from, to } = spec;
  const span = fwd(from, to, n);
  if (span * t.step < 20 || span > n * 0.6 || spec.pts.length < 1) return null;
  const main = (i: number): Vec3 => {
    const j = wrap(i, n);
    return { x: t.px[j], y: t.py[j], z: t.pz[j] };
  };
  const ph = Math.round(PHANTOM / t.step);
  // lead-out / lead-in points straight along the main road's tangent, so the branch leaves and rejoins without a kink
  // (at most 40 % of the way to the nearest interior point, so a tight branch still has room to turn)
  const lead = (i: number, sgn: number, p: Vec3): Vec3 => {
    const dx = p.x - t.px[i];
    const dz = p.z - t.pz[i];
    const l = Math.min(LEAD, 0.4 * Math.sqrt(dx * dx + dz * dz));
    return { x: t.px[i] + t.tx[i] * l * sgn, y: t.py[i], z: t.pz[i] + t.tz[i] * l * sgn };
  };
  const ctrl: Vec3[] = [main(from - ph), main(from), lead(from, 1, spec.pts[0]), ...spec.pts, lead(to, -1, spec.pts[spec.pts.length - 1]), main(to), main(to + ph)];
  const dense = densePolylineOpen(ctrl);
  const m = Math.max(16, Math.round(dense.total / TRACK.sample) + 1);
  const rs = resampleOpen(dense, m);
  const step = rs.step;
  const length = step * (m - 1);

  // width: the main road's at both ends, the control points' in between
  const halfW = new Float64Array(m);
  {
    const wc = [t.halfW[from], t.halfW[from], ...spec.halfW, t.halfW[to], t.halfW[to]];
    const pa = dense.pointAt.map((k) => dense.len[k]);
    let k = 0;
    for (let j = 0; j < m; j++) {
      const s = j * step;
      while (k < pa.length - 2 && pa[k + 1] <= s) k++;
      const a = pa[k];
      const b = pa[k + 1];
      const f = b > a ? clamp((s - a) / (b - a), 0, 1) : 0;
      halfW[j] = wc[k] + (wc[k + 1] - wc[k]) * f;
    }
  }

  // frames: central differences; the ends take the main road's tangent exactly
  const tx = new Float64Array(m);
  const tz = new Float64Array(m);
  const hd = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const a = Math.max(0, j - 1);
    const b = Math.min(m - 1, j + 1);
    const dx = rs.x[b] - rs.x[a];
    const dz = rs.z[b] - rs.z[a];
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    tx[j] = dx / l;
    tz[j] = dz / l;
  }
  tx[0] = t.tx[from];
  tz[0] = t.tz[from];
  tx[m - 1] = t.tx[to];
  tz[m - 1] = t.tz[to];
  for (let j = 0; j < m; j++) hd[j] = atan2L(tx[j], tz[j]);

  // curvature over ±4 samples (clamped at the ends), smoothed
  const curv = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    const a = Math.max(0, j - 4);
    const b = Math.min(m - 1, j + 4);
    curv[j] = b > a ? wrapAngle(hd[b] - hd[a]) / ((b - a) * step) : 0;
  }
  smoothOpen(curv, 3, 2);

  // surface: where the branch still overlaps the main road (the fork and the merge) it IS the main road's surface,
  // height and banking included, so a kart crossing from one to the other never meets a step; past the overlap the
  // difference fades out over BLEND metres into the branch's own (flat) deck
  const bank = new Float64Array(m);
  const py = rs.y;
  let overlap = 0;
  let overlapEnd = 0;
  let sideA = 1;
  let sideB = 1;
  {
    const f: Foot = { j: 0, along: 0, d: 0 };
    const ym = new Float64Array(m);
    const bm = new Float64Array(m);
    const over = new Uint8Array(m);
    for (let j = 0; j < m; j++) {
      const lin = from + Math.round((j / (m - 1)) * span);
      mainFootWindow(t, rs.x[j], rs.z[j], lin - 90, lin + 90, f);
      ym[j] = t.py[f.j] + f.d * t.bank[f.j];
      bm[j] = t.bank[f.j];
      over[j] = Math.abs(f.d) < t.halfW[f.j] + halfW[j] + PHYS.wallMargin && Math.abs(f.along) <= t.step * 2 ? 1 : 0;
    }
    let ja = 0;
    while (ja < m - 1 && over[ja + 1]) ja++;
    let jb = m - 1;
    while (jb > 0 && over[jb - 1]) jb--;
    if (ja >= jb) {
      ja = Math.floor((m - 1) / 2);
      jb = ja + 1;
    }
    overlap = ja * step;
    overlapEnd = (m - 1 - jb) * step;
    // the side of the main road the branch peels off to (and comes in from): its centre just past the overlap
    const sideAt = (j: number): number => {
      const lin = from + Math.round((j / (m - 1)) * span);
      mainFootWindow(t, rs.x[j], rs.z[j], lin - 90, lin + 90, f);
      return f.d >= 0 ? 1 : -1;
    };
    sideA = sideAt(Math.min(m - 1, ja + Math.round(6 / step)));
    sideB = sideAt(Math.max(0, jb - Math.round(6 / step)));
    const offA = ym[ja] - py[ja];
    const offB = ym[jb] - py[jb];
    const blend = Math.max(2, Math.round(BLEND / step));
    for (let j = 0; j < m; j++) {
      let wa = j <= ja ? 1 : Math.max(0, 1 - (j - ja) / blend);
      let wb = j >= jb ? 1 : Math.max(0, 1 - (jb - j) / blend);
      if (wa + wb > 1) {
        const k = 1 / (wa + wb);
        wa *= k;
        wb *= k;
      }
      if (j <= ja) py[j] = ym[j];
      else if (j >= jb) py[j] = ym[j];
      else py[j] += offA * wa + offB * wb;
      bank[j] = j <= ja || j >= jb ? bm[j] : bm[ja] * wa + bm[jb] * wb;
    }
  }

  const ownL = new Float64Array(m);
  const ownR = new Float64Array(m);
  for (let j = 0; j < m; j++) ownL[j] = ownR[j] = halfW[j] + PHYS.wallMargin;

  const surface = spec.surface;
  const line = openRacingLine(curv, halfW, step, overlap, overlapEnd);

  // si per sample: the main sample (within the replaced stretch) whose heading matches best, staying near the linear map
  const mapI = new Int32Array(m);
  let mapMis = 0;
  {
    const lo = from - Math.round(4 / t.step);
    const hi = from + span + Math.round(4 / t.step);
    const mh = new Float64Array(hi - lo + 1);
    for (let k = lo; k <= hi; k++) {
      const i = wrap(k, n);
      mh[k - lo] = atan2L(t.tx[i], t.tz[i]);
    }
    for (let j = 0; j < m; j++) {
      const lin = from + Math.round((j / (m - 1)) * span);
      let best = lin;
      let bestC = Infinity;
      for (let k = lo; k <= hi; k++) {
        const c = Math.abs(wrapAngle(hd[j] - mh[k - lo])) + 0.003 * Math.abs(k - lin);
        if (c < bestC) {
          bestC = c;
          best = k;
        }
      }
      mapI[j] = wrap(best, n);
      if (j > 0 && j < m - 1) mapMis = Math.max(mapMis, Math.abs(wrapAngle(hd[j] - mh[best - lo])));
    }
    mapI[0] = from;
    mapI[m - 1] = to;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let j = 0; j < m; j++) {
    const r = halfW[j] + PHYS.wallMargin + 2;
    minX = Math.min(minX, rs.x[j] - r);
    maxX = Math.max(maxX, rs.x[j] + r);
    minZ = Math.min(minZ, rs.z[j] - r);
    maxZ = Math.max(maxZ, rs.z[j] + r);
  }

  const f = surface === Surface.Offroad ? PHYS.offroadTop : surface === Surface.LowGrip ? 0.97 : 1;
  // (a branch's boost pads are credited once they are placed: build.ts takes PAD_GAIN off per pad)
  const tBranch = expectedTime(curv, step, m, f);
  const mc = new Float64Array(span + 1);
  for (let k = 0; k <= span; k++) mc[k] = t.curv[wrap(from + k, n)];
  const tMain = expectedTime(mc, t.step, span + 1, 1);

  return {
    id,
    label: spec.label,
    from,
    to,
    span,
    m,
    step,
    length,
    px: rs.x,
    py,
    pz: rs.z,
    tx,
    tz,
    curv,
    bank,
    halfW,
    wallL: ownL.slice(),
    wallR: ownR.slice(),
    ownL,
    ownR,
    line,
    mapI,
    s0: from * t.step,
    sk: (span * t.step) / length,
    surface,
    minX,
    maxX,
    minZ,
    maxZ,
    tBranch,
    tMain,
    pads: [],
    gap: null,
    mapMis,
    overlap,
    overlapEnd,
    sideA,
    sideB,
  };
}

/**
 * UGC "shortcut" sticker (GDD 6.4): a short off-road branch straight across the inside of the bend at main sample
 * `i` (the chord of the road `reach` metres either side of it), so it pays only with a boost. Null when the bend is too gentle for
 * the chord to clear the road (the build then falls back to v1's off-road verge on the sticker's side).
 */
export function shortcutSpec(t: MainArrays, i: number, side: -1 | 0 | 1, reach = 40): BranchSpec | null {
  const n = t.n;
  const a = Math.round(reach / t.step);
  const i0 = wrap(i - a, n);
  const i1 = wrap(i + a, n);
  const hw = 4.5;
  const mx = (t.px[i0] + t.px[i1]) / 2;
  const mz = (t.pz[i0] + t.pz[i1]) / 2;
  // the chord's middle must sit well off the road it cuts across, on the side the sticker names (if any)
  const dx = mx - t.px[i];
  const dz = mz - t.pz[i];
  const lat = dx * -t.tz[i] + dz * t.tx[i];
  if (Math.sqrt(dx * dx + dz * dz) < t.halfW[i] + hw + 2 * PHYS.wallMargin + 2) return null;
  if (side !== 0 && Math.sign(lat) !== side) return null;
  return {
    from: i0,
    to: i1,
    pts: [{ x: mx, y: (t.py[i0] + t.py[i1]) / 2, z: mz }],
    halfW: [hw],
    surface: Surface.Offroad,
    label: 'shortcut',
  };
}

/**
 * True when the branch keeps clear of every part of the main loop it does not join: its walls stay `gap` metres from
 * the main walls of samples more than 30 m outside the replaced stretch.
 */
export function branchClear(t: MainArrays, b: BuiltBranch, gap = 2): boolean {
  const n = t.n;
  const pad = Math.round(30 / t.step);
  for (let i = 0; i < n; i += 2) {
    if (fwd(b.from - pad, i, n) <= b.span + 2 * pad) continue;
    const wi = Math.max(t.wallL[i], t.wallR[i]);
    for (let j = 0; j < b.m; j += 2) {
      const dx = b.px[j] - t.px[i];
      const dz = b.pz[j] - t.pz[i];
      const reach = wi + Math.max(b.ownL[j], b.ownR[j]) + gap;
      if (dx * dx + dz * dz < reach * reach) return false;
    }
  }
  return true;
}

/** Seconds to drive a stretch at the 100cc top speed (× surface factor), lifting for every bend the AI would lift for. */
function expectedTime(curv: Float64Array, step: number, count: number, f: number): number {
  const top = CLASSES[1].topSpeed * f;
  let s = 0;
  for (let j = 0; j < count; j++) {
    const c = Math.abs(curv[j]);
    const v = c > 1e-4 ? Math.min(top, Math.sqrt(AI.cornerAccel / c)) : top;
    s += step / v;
  }
  return s;
}

/** Box blur of an open array (the ends are clamped, nothing wraps). */
export function smoothOpen(a: Float64Array, r: number, passes: number): void {
  const n = a.length;
  const tmp = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let k = -r; k <= r; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        s += a[j];
        c++;
      }
      tmp[i] = s / c;
    }
    a.set(tmp);
  }
}

/** The racing line of an open chain (racing-line.ts without the wrap): hug the inside, swing out before and after. */
function openRacingLine(curv: Float64Array, halfW: Float64Array, step: number, fadeA: number, fadeB: number): Float64Array {
  const n = curv.length;
  const line = new Float64Array(n);
  for (let i = 0; i < n; i++) line[i] = -clamp(curv[i] / 0.045, -1, 1) * Math.max(0, halfW[i] - 1.6);
  smoothOpen(line, Math.max(2, Math.round(14 / step)), 3);
  for (let i = 0; i < n; i++) {
    const lim = Math.max(0, halfW[i] - 1.6);
    // where the branch still overlaps the main road the line keeps to its centre (so a kart taking it clearly leaves
    // the main road), then fades in over 12 m
    const fade = clamp(Math.min(i * step - fadeA, (n - 1 - i) * step - fadeB) / 12, 0, 1);
    line[i] = clamp(line[i] * 1.6 * fade, -lim, lim);
  }
  return line;
}

// ------------------------------------------------------------------------------------------------
// nearest points (shared by the build, the query and the AI)
// ------------------------------------------------------------------------------------------------

export interface Foot {
  /** sample index, along-track offset from it, lateral offset (+ = right) */
  j: number;
  along: number;
  d: number;
}

/** Nearest branch sample to (x, z): a coarse scan then a local refine. Returns false when (x, z) is beyond either end. */
export function branchFoot(b: BuiltBranch, x: number, z: number, out: Foot): boolean {
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  const m = b.m;
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < m; j += 4) {
    const dx = b.px[j] - x;
    const dz = b.pz[j] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = j;
    }
  }
  const lo = Math.max(0, best - 4);
  const hi = Math.min(m - 1, best + 4);
  for (let j = lo; j <= hi; j++) {
    const dx = b.px[j] - x;
    const dz = b.pz[j] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = j;
    }
  }
  const ox = x - b.px[best];
  const oz = z - b.pz[best];
  const along = ox * b.tx[best] + oz * b.tz[best];
  if ((best === 0 && along < 0) || (best === m - 1 && along > 0)) return false;
  out.j = best;
  out.along = along;
  out.d = ox * -b.tz[best] + oz * b.tx[best];
  return true;
}

/** Nearest main sample in the window [lo, hi] (indices may run past n; they wrap): stride-2 scan and a refine. */
export function mainFootWindow(t: MainArrays, x: number, z: number, lo: number, hi: number, out: Foot): void {
  const n = t.n;
  let best = wrap(lo, n);
  let bestD = Infinity;
  for (let k = lo; k <= hi; k += 2) {
    const i = wrap(k, n);
    const dx = t.px[i] - x;
    const dz = t.pz[i] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  for (const k of [-1, 1]) {
    const i = wrap(best + k, n);
    const dx = t.px[i] - x;
    const dz = t.pz[i] - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  const ox = x - t.px[best];
  const oz = z - t.pz[best];
  out.j = best;
  out.along = ox * t.tx[best] + oz * t.tz[best];
  out.d = ox * -t.tz[best] + oz * t.tx[best];
}

/** Main samples on both sides of a branch that may overlap it (the window the query and the walls look in). */
export function branchWindow(t: MainArrays, b: BuiltBranch): [number, number] {
  const pad = Math.round(40 / t.step);
  return [b.from - pad, b.from + b.span + pad];
}

/** Is main sample `i` inside branch `b`'s window? */
export function inWindow(t: MainArrays, b: BuiltBranch, i: number): boolean {
  const pad = Math.round(40 / t.step);
  return fwd(b.from - pad, i, t.n) <= b.span + 2 * pad;
}

// ------------------------------------------------------------------------------------------------
// union walls where a branch and the main road overlap
// ------------------------------------------------------------------------------------------------

const MARCH = 0.5;
const MARCH_MAX = 48;

/**
 * Widen the walls of the main road and of every branch where the two overlap, out to the far edge of the contiguous
 * drivable area. `junction[i]` marks main samples whose wall was moved (bit 1 left, bit 2 right): the mesh draws
 * no kerb or barrier on that side there.
 */
export function joinWalls(t: MainArrays, branches: BuiltBranch[], junction: Uint8Array): void {
  const foot: Foot = { j: 0, along: 0, d: 0 };
  const n = t.n;
  for (const b of branches) {
    // main side: march out from each main sample's own wall while the point is on the branch's road (its walls)
    const [lo, hi] = branchWindow(t, b);
    for (let k = lo; k <= hi; k++) {
      const i = wrap(k, n);
      const rx = -t.tz[i];
      const rz = t.tx[i];
      for (const s of [-1, 1] as const) {
        const own = s > 0 ? t.wallR[i] : t.wallL[i];
        let u = own;
        for (let step = 1; u < MARCH_MAX; step++) {
          const v = own + step * MARCH;
          const x = t.px[i] + rx * s * v;
          const z = t.pz[i] + rz * s * v;
          if (!branchFoot(b, x, z, foot)) break;
          if (Math.abs(foot.d) > (foot.d > 0 ? b.ownR[foot.j] : b.ownL[foot.j]) || Math.abs(foot.along) > b.step * 2) break;
          u = v;
        }
        if (u > own + 0.01) {
          if (s > 0) t.wallR[i] = Math.max(t.wallR[i], u);
          else t.wallL[i] = Math.max(t.wallL[i], u);
          junction[i] |= s > 0 ? 2 : 1;
        }
      }
    }
    // branch side: march out from the branch's own wall while the point is on the main road (its own walls)
    for (let j = 0; j < b.m; j++) {
      const rx = -b.tz[j];
      const rz = b.tx[j];
      const hint = b.from + Math.round((j / (b.m - 1)) * b.span);
      for (const s of [-1, 1] as const) {
        const own = s > 0 ? b.ownR[j] : b.ownL[j];
        let u = own;
        for (let step = 1; u < MARCH_MAX; step++) {
          const v = own + step * MARCH;
          const x = b.px[j] + rx * s * v;
          const z = b.pz[j] + rz * s * v;
          mainFootWindow(t, x, z, hint - 90, hint + 90, foot);
          if (Math.abs(foot.along) > t.step * 2) break;
          const wall = foot.d > 0 ? t.wallR[foot.j] : t.wallL[foot.j];
          // the main road's own band only (a wall already widened toward this branch does not count)
          const ownMain = Math.min(wall, t.halfW[foot.j] + PHYS.wallMargin);
          if (Math.abs(foot.d) > ownMain) break;
          u = v;
        }
        if (u > own + 0.01) {
          if (s > 0) b.wallR[j] = Math.max(b.wallR[j], u);
          else b.wallL[j] = Math.max(b.wallL[j], u);
        }
      }
    }
  }
}

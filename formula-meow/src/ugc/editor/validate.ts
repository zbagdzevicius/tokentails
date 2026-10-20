/**
 * Track validator (GDD 6.4). Pure, no DOM. The editor runs it on every change and the share-code decoder runs it
 * too, so a hand-made link can never load an undrivable track. Each failure has one plain sentence and, where it
 * applies, the sample range of the built track to paint red.
 *
 * Rules: 8–32 points on the 4 m grid within ±128 m; lap 300–1200 m; no part of the road touches another part
 * (bridges are not drawn by the mesh yet, so every crossing fails); turn radius ≥ 9 m; climbs ≤ 25 %; exactly one
 * start, on a straight with room for the grid; at least one item row; ramps on a straight run; ≤ 24 stickers.
 */
import { FEATURE_KINDS, type TrackDef } from '../../types';
import { TRACK } from '../../tuning';
import { buildTrack, outerWall, type BuiltTrack } from '../../core/track/build';

export type IssueCode =
  | 'points'
  | 'grid'
  | 'short'
  | 'long'
  | 'overlap'
  | 'tight'
  | 'steep'
  | 'start'
  | 'startBend'
  | 'items'
  | 'rampBend'
  | 'stickers'
  | 'build'
  // SIM_VERSION 8 set pieces: the build could not place one (validateSetPieces; the ai-ugc lane adds the detailed codes)
  | 'pieces';

export interface Issue {
  code: IssueCode;
  message: string;
  /** built-track sample range to highlight (inclusive, may wrap past n) */
  from?: number;
  to?: number;
}

export interface Validation {
  ok: boolean;
  issues: Issue[];
  /** null when the points could not be built at all */
  built: BuiltTrack | null;
  length: number;
}

export const LIMITS = {
  minPoints: 8,
  maxPoints: 32,
  minLength: 300,
  maxLength: 1200,
  minRadius: 9,
  maxClimb: 0.25,
  /** clear ground between two parts of the loop, beyond both walls */
  minGap: 2,
  /** parts of the loop closer than this along the road are neighbours, not a crossing */
  neighbour: 60,
  /** start: radius over the grid (30 m behind) and the first 10 m */
  startRadius: 20,
  rampRadius: 15,
  maxStickers: 24,
  maxItemRows: 8,
  coordMin: -128,
  coordMax: 124,
} as const;

/** Laps rule for UGC tracks (GDD 6.2): 5 if the loop is under 450 m. */
export function lapsFor(length: number): 3 | 5 {
  return length < 450 ? 5 : 3;
}

function pointsOnGrid(def: TrackDef): boolean {
  for (const p of def.points) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.z) || p.x % TRACK.grid !== 0 || p.z % TRACK.grid !== 0) return false;
    if (p.x < LIMITS.coordMin || p.x > LIMITS.coordMax || p.z < LIMITS.coordMin || p.z > LIMITS.coordMax) return false;
    if (!Number.isInteger(p.h) || p.h < 0 || p.h > 7) return false;
    if (!(p.w === 0 || p.w === 1 || p.w === 2 || p.w === 3)) return false;
  }
  for (let i = 0; i < def.points.length; i++) {
    const a = def.points[i];
    const b = def.points[(i + 1) % def.points.length];
    if (a.x === b.x && a.z === b.z) return false; // a zero-length segment breaks the spline knots
  }
  return true;
}

/** Longest run of samples (wrapping) where `bad(i)` holds, as [from, to]. */
function worstRun(n: number, bad: (i: number) => boolean): [number, number] | null {
  let first = -1;
  for (let i = 0; i < n; i++) if (!bad(i)) {
    first = i;
    break;
  }
  if (first < 0) return [0, n - 1];
  let best: [number, number] | null = null;
  let start = -1;
  for (let k = 1; k <= n; k++) {
    const i = (first + k) % n;
    if (bad(i)) {
      if (start < 0) start = first + k;
    } else if (start >= 0) {
      const len = first + k - start;
      if (!best || len > best[1] - best[0] + 1) best = [start % n, (start + len - 1) % n];
      start = -1;
    }
  }
  return best;
}

export function validateTrack(def: TrackDef): Validation {
  const issues: Issue[] = [];
  const np = def.points.length;
  if (np < LIMITS.minPoints) issues.push({ code: 'points', message: `A loop needs at least ${LIMITS.minPoints} points. Draw a bigger loop.` });
  if (np > LIMITS.maxPoints) issues.push({ code: 'points', message: `Too many points (${LIMITS.maxPoints} at most). Long-press a point to remove it.` });
  if (!pointsOnGrid(def)) issues.push({ code: 'grid', message: 'Some points are off the map. Drag them back inside.' });
  const kinds = new Set<string>(FEATURE_KINDS);
  if (def.features.some((f) => !kinds.has(f.kind) || !Number.isInteger(f.s) || f.s < 0 || f.s > 255)) issues.push({ code: 'stickers', message: 'A sticker is broken. Remove it and place it again.' });
  if (def.features.length > LIMITS.maxStickers) issues.push({ code: 'stickers', message: `Too many stickers (${LIMITS.maxStickers} at most).` });
  if (issues.length || np < 3) return { ok: false, issues, built: null, length: 0 };

  let t: BuiltTrack;
  try {
    t = buildTrack(def);
  } catch {
    return { ok: false, issues: [{ code: 'build', message: 'This shape cannot be built. Try drawing it again.' }], built: null, length: 0 };
  }
  const n = t.n;
  const len = t.length;
  if (!(len >= LIMITS.minLength)) issues.push({ code: 'short', message: `Too short: ${Math.round(len)} m. Make the loop at least ${LIMITS.minLength} m.` });
  if (!(len <= LIMITS.maxLength)) issues.push({ code: 'long', message: `Too long: ${Math.round(len)} m. Keep the loop under ${LIMITS.maxLength} m.` });

  // overlap: any two samples further apart than `neighbour` along the road must keep their walls apart
  {
    const stride = 2;
    const sepMin = Math.round(LIMITS.neighbour / t.step);
    let hitI = -1;
    let hitJ = -1;
    let worst = Infinity;
    for (let i = 0; i < n; i += stride) {
      const ri = outerWall(t, i);
      for (let j = i + sepMin; j < n; j += stride) {
        if (n - (j - i) < sepMin) break;
        const dx = t.px[i] - t.px[j];
        const dz = t.pz[i] - t.pz[j];
        const reach = ri + outerWall(t, j) + LIMITS.minGap;
        if (dx * dx + dz * dz >= reach * reach) continue;
        const gap = Math.sqrt(dx * dx + dz * dz) - reach;
        if (gap < worst) {
          worst = gap;
          hitI = i;
          hitJ = j;
        }
      }
    }
    if (hitI >= 0) {
      const r = Math.round(12 / t.step);
      issues.push({ code: 'overlap', message: 'Two parts of the road touch. Pull them apart.', from: (hitI - r + n) % n, to: (hitI + r) % n });
      issues.push({ code: 'overlap', message: '', from: (hitJ - r + n) % n, to: (hitJ + r) % n });
    }
  }

  if (t.minRadius < LIMITS.minRadius) {
    const run = worstRun(n, (i) => Math.abs(t.curv[i]) > 1 / LIMITS.minRadius);
    issues.push({ code: 'tight', message: 'This corner is too tight. Drag the points further apart.', from: run?.[0], to: run?.[1] });
  }
  if (t.maxClimb > LIMITS.maxClimb) {
    const run = worstRun(n, (i) => Math.abs(t.py[(i + 1) % n] - t.py[i]) / t.step > LIMITS.maxClimb);
    issues.push({ code: 'steep', message: 'Too steep here. Make the height change smaller or longer.', from: run?.[0], to: run?.[1] });
  }

  const starts = def.features.filter((f) => f.kind === 'start').length;
  if (starts !== 1) issues.push({ code: 'start', message: starts === 0 ? 'Place the start flag 🏁 on the road.' : 'Only one start flag, please.' });
  else {
    // sample 0 of the built track is the start line; the grid sits up to ~28 m behind it
    const back = Math.round(30 / t.step);
    const ahead = Math.round(10 / t.step);
    for (let k = -back; k <= ahead; k++) {
      const i = (k + n) % n;
      if (Math.abs(t.curv[i]) > 1 / LIMITS.startRadius) {
        issues.push({ code: 'startBend', message: 'Move the start 🏁 onto a straighter part, the grid needs room.', from: (n - back) % n, to: ahead });
        break;
      }
    }
  }
  const rows = def.features.filter((f) => f.kind === 'items').length;
  if (rows < 1) issues.push({ code: 'items', message: 'Add at least one item row 🎁.' });
  if (rows > LIMITS.maxItemRows) issues.push({ code: 'items', message: `Too many item rows (${LIMITS.maxItemRows} at most).` });

  for (const r of t.ramps) {
    const reach = Math.round(6 / t.step);
    for (let k = -r.len; k <= reach; k++) {
      const i = (r.i + k + n) % n;
      if (Math.abs(t.curv[i]) > 1 / LIMITS.rampRadius) {
        issues.push({ code: 'rampBend', message: 'Ramps need a straight run. Move this ramp off the corner.', from: (r.i - r.len + n) % n, to: (r.i + reach) % n });
        break;
      }
    }
  }

  return { ok: issues.length === 0, issues, built: t, length: len };
}

/** The first issue with a sentence (the editor's status line). */
export function firstMessage(v: Validation): string | null {
  return v.issues.find((i) => i.message)?.message ?? null;
}

/**
 * Set pieces (SIM_VERSION 8, SETPIECES.md section 10). Engine-step stub with the final signature, so the track lanes'
 * tests compile before the ai-ugc lane fills in the full rules (loopBend, loopClear, wallBend, jumpLine, tunnelLen,
 * pieceSpacing, pieceCount, the drive check). Today it reports what `buildTrack` had to skip (`BuiltTrack.pieceIssues`:
 * the start line, fork and merge windows, overlaps, a loop on a bend, an arena piece).
 */
export function validateSetPieces(def: TrackDef, built?: BuiltTrack): Issue[] {
  if (!def.setPieces?.length) return [];
  const t = built ?? buildTrack(def);
  return t.pieceIssues.map((m) => ({ code: 'pieces' as const, message: `A set piece cannot go there (${m}).` }));
}

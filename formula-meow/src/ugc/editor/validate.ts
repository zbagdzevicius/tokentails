/**
 * Track validator (GDD 6.4). Pure, no DOM. The editor runs it on every change and the share-code decoder runs it
 * too, so a hand-made link can never load an undrivable track. Each failure has one plain sentence and, where it
 * applies, the sample range of the built track to paint red.
 *
 * Rules: 8–32 points on the 4 m grid within ±128 m; lap 300–1200 m; no part of the road touches another part
 * (bridges are not drawn by the mesh yet, so every crossing fails); turn radius ≥ 9 m; climbs ≤ 25 %; exactly one
 * start, on a straight with room for the grid; at least one item row; ramps on a straight run; ≤ 24 stickers.
 *
 * Set pieces (SIM_VERSION 8, ai-ugc lane, SETPIECES.md section 10): `validateSetPieces` checks loops, wall rides, jump
 * gaps and tunnels (one sentence each, the piece painted red), and for a doodled track a headless drive check
 * (drive-check.ts): the phone bot at 50cc with auto-gas laps it once with no respawn, no net and no stall.
 */
import { FEATURE_KINDS, SET_PIECE_KINDS, type SetPiece, type SetPieceKind, type TrackDef } from '../../types';
import { STUNT, TRACK } from '../../tuning';
import { buildTrack, outerWall, type BuiltTrack } from '../../core/track/build';
import type { BuiltPiece } from '../../core/track/stunt';
import { driveCheck } from './drive-check';

export type IssueCode =
  | 'points'
  | 'grid'
  | 'stacked'
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
  // SIM_VERSION 8 set pieces (validateSetPieces): the build could not place one, and the section 10 rules
  | 'pieces'
  | 'loopBend'
  | 'loopClear'
  | 'wallBend'
  | 'jumpLine'
  | 'tunnelLen'
  | 'pieceSpacing'
  | 'pieceCount'
  | 'drive';

export interface Issue {
  code: IssueCode;
  message: string;
  /** built-track sample range to highlight (inclusive, may wrap past n) */
  from?: number;
  to?: number;
  /** a point to ring in red (an issue found before the track can be built, e.g. two points on one spot) */
  point?: number;
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

/** A world position snapped to the 4 m grid and clamped inside the map (a dragged or a double-tap inserted point). */
export function snapToMap(x: number, z: number): { x: number; z: number } {
  const g = TRACK.grid;
  const snap = (v: number) => Math.max(LIMITS.coordMin, Math.min(LIMITS.coordMax, Math.round(v / g) * g)) || 0;
  return { x: snap(x), z: snap(z) };
}

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
  return true;
}

/** Index of the first point that sits on the same spot as the next one (a zero-length segment breaks the spline knots), or -1. */
export function stackedPoint(points: TrackDef['points']): number {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a.x === b.x && a.z === b.z) return i;
  }
  return -1;
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

/** True when `v` (validated with `drive: false`) passed everything but still owes the set-piece drive check. */
export function needsDrive(def: TrackDef, v: Validation): boolean {
  return v.ok && !!v.built && !!def.setPieces?.length;
}

/**
 * `pieces`: which set-piece rules apply. Doodled tracks and share codes use 'ugc' (the default); the authored tracks
 * use 'authored' (the build's own spacing, free in count, no drive check: `tracks.test.ts` and the harness drive them).
 */
export function validateTrack(def: TrackDef, opts: { pieces?: 'ugc' | 'authored'; drive?: boolean } = {}): Validation {
  const issues: Issue[] = [];
  const np = def.points.length;
  if (np < LIMITS.minPoints) issues.push({ code: 'points', message: `A loop needs at least ${LIMITS.minPoints} points. Draw a bigger loop.` });
  if (np > LIMITS.maxPoints) issues.push({ code: 'points', message: `Too many points (${LIMITS.maxPoints} at most). Long-press a point to remove it.` });
  if (!pointsOnGrid(def)) issues.push({ code: 'grid', message: 'Some points are off the map. Drag them back inside.' });
  else if (np > 1) {
    const st = stackedPoint(def.points);
    if (st >= 0) issues.push({ code: 'stacked', message: 'Two points sit on top of each other. Drag one away.', point: (st + 1) % np });
  }
  const kinds = new Set<string>(FEATURE_KINDS);
  if (def.features.some((f) => !kinds.has(f.kind) || !Number.isInteger(f.s) || f.s < 0 || f.s > 255)) issues.push({ code: 'stickers', message: 'A sticker is broken. Remove it and place it again.' });
  const nPieces = def.setPieces?.length ?? 0;
  if (def.features.length + nPieces > LIMITS.maxStickers) issues.push({ code: 'stickers', message: `Too many stickers (${LIMITS.maxStickers} at most).` });
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

  // set pieces: the section 10 rules, then (only when everything else is fine) the drive check
  if (nPieces) {
    const ugc = opts.pieces !== 'authored';
    issues.push(...validateSetPieces(def, t, { ugc }));
    // `drive: false`: the editor runs the drive check itself a moment later (it is the slow part), see `needsDrive`
    if (ugc && !issues.length && opts.drive !== false) issues.push(...driveCheck(def, t));
  }

  return { ok: issues.length === 0, issues, built: t, length: len };
}

/** The first issue with a sentence (the editor's status line). */
export function firstMessage(v: Validation): string | null {
  return v.issues.find((i) => i.message)?.message ?? null;
}

// ---------------------------------------------------------------------------------------------
// set pieces (SIM_VERSION 8, SETPIECES.md section 10)
// ---------------------------------------------------------------------------------------------

/** Per-track limits for doodled tracks (the stickers tray enforces them too). */
export const PIECE_LIMITS: Readonly<Record<SetPieceKind, number>> & { readonly total: number } = { loop: 2, wall: 3, jump: 3, tunnel: 3, total: 6 };

/** Section 10 numbers (m): spacing, bends and lengths. Authored tracks keep the build's own spacing (30 m, 10 m). */
export const PIECE_RULES = {
  /** doodled tracks: the start line and other pieces this far away */
  startClear: 40,
  apart: 40,
  /** loop: R ≥ 60 m and grade ≤ 5 % from 15 m before the zone to 55 m after its start; nothing within 12 m in plan
   * unless 18 m above or below */
  loopBefore: 15,
  loopAfter: 55,
  loopR: 60,
  loopGrade: 0.05,
  loopClear: 12,
  loopClearUp: 18,
  /** authored tracks (integration, iteration 3): every piece is proven by the phone-bot, zero-steer and noisy-thumb
   * drives (src/tracks/setpieces-*.test.ts), so the geometry rules only catch a piece dropped somewhere absurd */
  loopRAuthored: 25,
  /** wall: a bend of 10–40 m radius (side 0, a half-pipe: a straight, R ≥ 60 m); its ends this far from a junction */
  wallRmin: 10,
  wallRmax: 40,
  wallJunction: 40,
  wallRminAuthored: 8,
  wallRmaxAuthored: 120,
  /** jump: R ≥ 40 m (authored 10 m) and grade ≤ 10 % over the run-up and the landing; gap 6–12 m, drop 0–2.5 m;
   * nothing else on them (authored: item rows and pads may sit on the run-up) */
  jumpR: 40,
  jumpRAuthored: 10,
  jumpGrade: 0.1,
  gapMin: 6,
  gapMax: 12,
  dropMax: 2.5,
  /** tunnel: 40–90 m long (authored 30–100), R ≥ 15 m, no ramp inside it or within 10 m of its exit */
  tunnelMin: 40,
  tunnelMax: 90,
  tunnelR: 15,
  tunnelExit: 10,
  /** a ramp lip keeps this far before a loop's strip */
  rampBeforeLoop: 30,
} as const;

const KIND_NAME: Record<SetPieceKind, string> = { loop: 'loop', wall: 'wall ride', jump: 'jump gap', tunnel: 'tunnel' };

const wrapN = (i: number, n: number): number => ((i % n) + n) % n;
const fwdN = (a: number, b: number, n: number): number => wrapN(b - a, n);

/** Feature `s` → built sample (the build's own rounding; sample 0 is the start line). */
export function pieceSample(def: TrackDef, n: number, s: number): number {
  const st = def.features.find((f) => f.kind === 'start');
  const startI = st ? Math.round((st.s / 256) * n) % n : 0;
  return wrapN(Math.round((s / 256) * n) - startI, n);
}

/** The built piece for def piece p (same kind and start sample), or null when the build skipped it. */
export function builtPieceOf(def: TrackDef, t: BuiltTrack, p: SetPiece): BuiltPiece | null {
  const i0 = pieceSample(def, t.n, p.s);
  return t.pieces.find((b) => b.kind === p.kind && b.i0 === i0) ?? null;
}

/** Footprint of a built piece: [first sample, length in samples] (a jump from its run-up, a loop from its strip). */
export function pieceSpan(t: BuiltTrack, bp: BuiltPiece): [number, number] {
  const from = bp.kind === 'jump' ? wrapN(bp.i0 - Math.round(STUNT.jump.runUp / t.step), t.n) : bp.strip;
  return [from, fwdN(from, bp.end, t.n)];
}

function maxCurv(t: BuiltTrack, from: number, len: number): number {
  let c = 0;
  for (let k = 0; k <= len; k++) c = Math.max(c, Math.abs(t.curv[wrapN(from + k, t.n)]));
  return c;
}

function maxGrade(t: BuiltTrack, from: number, len: number): number {
  let g = 0;
  for (let k = 0; k < len; k++) {
    const i = wrapN(from + k, t.n);
    g = Math.max(g, Math.abs(t.py[(i + 1) % t.n] - t.py[i]) / t.step);
  }
  return g;
}

/** Friendly sentence for a reason the build gave when it skipped a piece. */
function buildReason(kind: SetPieceKind, reason: string): { code: IssueCode; message: string } {
  const name = KIND_NAME[kind];
  if (reason.includes('start line')) return { code: 'pieceSpacing', message: `Move the ${name} away from the start 🏁.` };
  if (reason.includes('fork or merge')) return { code: 'pieceSpacing', message: `The ${name} can't go where a shortcut leaves or joins the road.` };
  if (reason.includes('overlaps')) return { code: 'pieceSpacing', message: 'Two stunts are too close. Spread them out.' };
  if (reason.includes('bends')) return { code: 'loopBend', message: 'Loops need a long, flat straight. Move the loop onto one.' };
  if (reason.includes('arena')) return { code: 'pieces', message: 'An arena takes only kickers.' };
  return { code: 'pieces', message: `The ${name} cannot go there.` };
}

/**
 * Set-piece rules (SETPIECES.md section 10). `built` is the BuiltTrack of `def` (built again when absent). Doodled
 * tracks (`ugc: true`, run by `validateTrack`) also get the stricter spacing (40 m from the start and from each other)
 * and the per-kind limits; an authored track keeps the build's own spacing and is free in count. One sentence per
 * piece (its first problem), with the piece's footprint to paint red. [] when every piece is fine. The drive check is
 * separate (`driveCheck`, run by `validateTrack` for doodled tracks once everything else passes).
 */
export function validateSetPieces(def: TrackDef, built?: BuiltTrack, opts: { ugc?: boolean } = {}): Issue[] {
  const pieces = def.setPieces ?? [];
  if (!pieces.length) return [];
  const t = built ?? buildTrack(def);
  const R = PIECE_RULES;
  const ugc = !!opts.ugc;
  const issues: Issue[] = [];
  const n = t.n;
  const m = (metres: number): number => Math.max(1, Math.round(metres / t.step));
  const add = (code: IssueCode, message: string, from?: number, len?: number): void => {
    issues.push(from == null ? { code, message } : { code, message, from: wrapN(from, n), to: wrapN(from + (len ?? 0), n) });
  };

  if (ugc) {
    const count: Partial<Record<SetPieceKind, number>> = {};
    for (const p of pieces) count[p.kind] = (count[p.kind] ?? 0) + 1;
    for (const k of SET_PIECE_KINDS) if ((count[k] ?? 0) > PIECE_LIMITS[k]) add('pieceCount', `${PIECE_LIMITS[k]} ${KIND_NAME[k]}${PIECE_LIMITS[k] > 1 ? 's' : ''} at most on one track.`);
    if (pieces.length > PIECE_LIMITS.total) add('pieceCount', `${PIECE_LIMITS.total} stunts at most on one track.`);
  }

  const placed: Array<{ bp: BuiltPiece; from: number; len: number }> = [];
  for (const p of pieces) {
    if (SET_PIECE_KINDS.indexOf(p.kind) < 0 || !Number.isInteger(p.s) || p.s < 0 || p.s > 255) {
      add('pieces', 'A stunt sticker is broken. Remove it and place it again.');
      continue;
    }
    const at = pieceSample(def, n, p.s);
    const bp = builtPieceOf(def, t, p);
    if (!bp) {
      const why = t.pieceIssues.find((x) => x.startsWith(`${p.kind}@${p.s}:`)) ?? '';
      const r = buildReason(p.kind, why.slice(why.indexOf(':') + 1));
      add(r.code, r.message, at - m(10), 2 * m(10));
      continue;
    }
    const [from, len] = pieceSpan(t, bp);
    placed.push({ bp, from, len });
    const before = issues.length;
    const name = KIND_NAME[bp.kind];
    const body = fwdN(bp.i0, bp.i1, n);

    if (bp.kind === 'loop') {
      const a = ugc ? bp.i0 - m(R.loopBefore) : bp.strip;
      const l = ugc ? m(R.loopBefore) + m(R.loopAfter) : fwdN(bp.strip, bp.i1, n);
      if (maxCurv(t, a, l) > 1 / (ugc ? R.loopR : R.loopRAuthored) || maxGrade(t, a, l) > R.loopGrade) add('loopBend', 'Loops need a long, flat straight. Move the loop onto one.', from, len);
      else if (!loopClear(t, bp)) add('loopClear', 'The loop is too close to another part of the road. Give it more room.', from, len);
      // a kart on the loop's rail rides above its shadow and cannot reach a box there (core/sim/world.ts stepBoxes)
      else if (featureOn(t, from, len, ['items'], 0)) add('loopClear', 'Keep item boxes off the loop. Move the item row before or after it.', from, len);
    } else if (bp.kind === 'wall') {
      // the lane's full-width part decides the bend
      const tap = m(STUNT.wall.taper);
      const c = maxCurv(t, bp.i0 + tap, Math.max(0, body - 2 * tap));
      let sum = 0;
      for (let k = 0; k <= body; k++) sum += t.curv[wrapN(bp.i0 + k, n)];
      const outer = sum >= 0 ? 1 : -1;
      const rMin = ugc ? R.wallRmin : R.wallRminAuthored;
      const rMax = ugc ? R.wallRmax : R.wallRmaxAuthored;
      if (bp.side === 0 ? c > 1 / 60 : c < 1 / rMax || c > 1 / rMin) {
        add('wallBend', bp.side === 0 ? 'A half-pipe wall ride needs a straight.' : 'Wall rides go on a corner, not too tight and not too gentle. Move it onto a bend.', from, len);
      } else if (bp.side !== 0 && bp.side !== outer) {
        add('wallBend', 'Wall rides go on the outside of the bend. Tap it to flip its side.', from, len);
      } else if (!laneClear(t, bp)) {
        add('wallBend', 'The wall ride needs room beside the road. Pull the roads apart.', from, len);
      } else if (featureOn(t, from, len, ['lowgrip', 'offroad', 'hazard', 'shortcut'], bp.side) || hazardOn(t, from, len)) {
        add('wallBend', 'Keep puddles, rough ground and hazards off the wall ride.', from, len);
      } else if (ugc && junctionNear(t, bp.i0, body, m(R.wallJunction))) {
        add('wallBend', 'The wall ride is too close to a shortcut.', from, len);
      }
    } else if (bp.kind === 'jump') {
      const g = p.gap ?? STUNT.jump.gap;
      const drop = p.drop ?? 0;
      const landLen = fwdN(bp.land0, bp.land1, n);
      if (bp.gap > 0 && (g < R.gapMin || g > R.gapMax || drop < 0 || drop > R.dropMax)) {
        add('jumpLine', `Jump gaps are ${R.gapMin}–${R.gapMax} m long and drop ${R.dropMax} m at most.`, from, len);
      } else if (maxCurv(t, from, len) > 1 / (ugc ? R.jumpR : R.jumpRAuthored) || maxGrade(t, from, fwdN(from, bp.i0, n)) > R.jumpGrade || maxGrade(t, bp.land0, landLen) > R.jumpGrade) {
        add('jumpLine', 'Jumps need a straight, flat run-up and landing. Move it onto a straight.', from, len);
      } else if (bp.gap > 0 && fwdN(bp.i1, bp.land1, n) * t.step < 43 * STUNT.jump.tMin - bp.gap + 3) {
        add('jumpLine', 'The landing is too short. Make the gap shorter.', from, len);
      } else if (featureOn(t, from, len, ugc ? ['ramp', 'items', 'hazard', 'lowgrip', 'offroad', 'pad', 'shortcut'] : ['ramp', 'hazard', 'lowgrip', 'offroad'], 0) || hazardOn(t, from, len) || rampOn(t, from, len)) {
        add('jumpLine', "Keep the jump's run-up and landing clear of other stickers.", from, len);
      }
    } else {
      const lenM = body * t.step;
      const lo = ugc ? R.tunnelMin : 30;
      const hi = ugc ? R.tunnelMax : 100;
      const exit = body + m(R.tunnelExit);
      if (lenM < lo - 0.5 || lenM > hi + 0.5) add('tunnelLen', `Tunnels are ${lo}–${hi} m long.`, from, len);
      else if (maxCurv(t, bp.i0, body) > 1 / R.tunnelR) add('tunnelLen', 'This corner is too tight for a tunnel.', from, len);
      else if (rampOn(t, bp.i0, exit) || featureOn(t, bp.i0, exit, ['ramp'], 0)) add('tunnelLen', 'No ramps inside a tunnel or just after it.', from, len);
    }

    // a ramp keeps 30 m before a loop's strip (a flying kart reaching the loop)
    if (issues.length === before && bp.kind === 'loop' && rampOn(t, bp.strip - m(R.rampBeforeLoop), m(R.rampBeforeLoop) + fwdN(bp.strip, bp.i1, n))) add('pieceSpacing', 'Keep ramps at least 30 m before a loop.', from, len);
    if (issues.length === before && ugc) {
      const toStart = Math.min(fwdN(bp.end, 0, n), fwdN(0, from, n)) * t.step;
      if (fwdN(from, 0, n) <= len || toStart < R.startClear) add('pieceSpacing', `Move the ${name} away from the start 🏁.`, from, len);
    }
  }

  // doodled tracks: pieces 40 m apart (authored: the build's 10 m)
  if (ugc) {
    for (const A of placed)
      for (const B of placed) {
        if (A === B) continue;
        const ahead = fwdN(A.from, B.from, n);
        if (ahead > n / 2) continue;
        const gap = (ahead - A.len) * t.step;
        if (gap < R.apart && !issues.some((x) => x.code === 'pieceSpacing' && x.from === B.from)) add('pieceSpacing', 'Two stunts are too close. Spread them out.', B.from, B.len);
      }
  }
  return issues;
}

/** Nothing else within 12 m of the loop in plan (unless 18 m above or below), beyond its own stretch of road. */
function loopClear(t: BuiltTrack, bp: BuiltPiece): boolean {
  const n = t.n;
  const R = PIECE_RULES;
  const nb = Math.round(LIMITS.neighbour / t.step);
  const len = fwdN(bp.strip, bp.i1, n);
  for (let q = 0; q <= len; q += 2) {
    const i = (bp.strip + q) % n;
    for (let j = 0; j < n; j += 2) {
      if (Math.min(fwdN(i, j, n), fwdN(j, i, n)) < nb) continue;
      const dx = t.px[i] - t.px[j];
      const dz = t.pz[i] - t.pz[j];
      const reach = R.loopClear + outerWall(t, j);
      if (dx * dx + dz * dz < reach * reach && Math.abs(t.py[i] - t.py[j]) < R.loopClearUp) return false;
    }
  }
  return true;
}

/** The wall lane's outer rail keeps `minGap` from every other part of the road. */
function laneClear(t: BuiltTrack, bp: BuiltPiece): boolean {
  const n = t.n;
  const nb = Math.round(LIMITS.neighbour / t.step);
  const len = fwdN(bp.i0, bp.i1, n);
  for (let q = 0; q <= len; q += 2) {
    const i = (bp.i0 + q) % n;
    for (const side of [-1, 1] as const) {
      const lane = side > 0 ? t.laneR[i] : t.laneL[i];
      if (lane < 0.5) continue;
      const off = side * (t.halfW[i] + lane + STUNT.wall.rail);
      const x = t.px[i] - t.tz[i] * off;
      const z = t.pz[i] + t.tx[i] * off;
      for (let j = 0; j < n; j += 2) {
        if (Math.min(fwdN(i, j, n), fwdN(j, i, n)) < nb) continue;
        const reach = outerWall(t, j) + LIMITS.minGap;
        if ((t.px[j] - x) ** 2 + (t.pz[j] - z) ** 2 < reach * reach) return false;
      }
    }
  }
  return true;
}

/** A built feature of one of `kinds` on samples [from, from + len] (sided ones only on `side`; 0 = any side). */
function featureOn(t: BuiltTrack, from: number, len: number, kinds: readonly string[], side: number): boolean {
  return t.features.some((f) => kinds.includes(f.kind) && fwdN(wrapN(from, t.n), f.i, t.n) <= len && (side === 0 || f.side === 0 || f.side === side));
}

/** A ramp lip (not a set-piece kicker) on samples [from, from + len]. */
function rampOn(t: BuiltTrack, from: number, len: number): boolean {
  return t.ramps.some((r) => r.piece == null && fwdN(wrapN(from, t.n), r.i, t.n) <= len);
}

/** A hazard on the main road on samples [from, from + len]. */
function hazardOn(t: BuiltTrack, from: number, len: number): boolean {
  return t.hazards.some((h) => h.branch < 0 && fwdN(wrapN(from, t.n), h.i, t.n) <= len);
}

/** A branch fork or merge within `w` samples of [i0, i0 + len]. */
function junctionNear(t: BuiltTrack, i0: number, len: number, w: number): boolean {
  const a = wrapN(i0 - w, t.n);
  return t.branches.some((b) => fwdN(a, b.from, t.n) <= len + 2 * w || fwdN(a, b.to, t.n) <= len + 2 * w);
}

/**
 * Set-piece stickers for Track Doodle (iteration 3, ai-ugc lane, SETPIECES.md section 10). Pure, no DOM: the tray
 * entries, a new piece's defaults where it is dropped (a wall ride takes the outside of the bend, or both sides on a
 * straight), the limits, and the snap that nudges a dropped piece by up to ±8 lap units to the nearest spot the
 * validator accepts ("auto-validation": a phone player should not have to hunt for a spot by trial and error).
 */
import type { SetPiece, SetPieceKind, TrackDef } from '../../types';
import { STUNT } from '../../tuning';
import { buildTrack, type BuiltTrack } from '../../core/track/build';
import type { BuiltPiece } from '../../core/track/stunt';
import { LIMITS, PIECE_LIMITS, PIECE_RULES, builtPieceOf, pieceSample, validateSetPieces } from './validate';

export const PIECE_STICKERS: ReadonlyArray<{ kind: SetPieceKind; icon: string }> = [
  { kind: 'loop', icon: '➰' },
  { kind: 'wall', icon: '🛹' },
  { kind: 'jump', icon: '🦘' },
  { kind: 'tunnel', icon: '🚇' },
];
export const PIECE_ICON: Record<SetPieceKind, string> = { loop: '➰', wall: '🛹', jump: '🦘', tunnel: '🚇' };

/** Editor defaults and steppers (metres): a jump's gap and drop, a tunnel's length; a wall ride is 50 m. */
export const PIECE_EDIT = {
  gapDefault: 10,
  gapStep: 1,
  dropStep: 0.5,
  tunnelDefault: 60,
  tunnelStep: 10,
  wallLen: 50,
  /** the snap searches this many lap units each way */
  snapReach: 8,
  /**
   * then, when nothing close by is valid, every `farStride` units round the lap, nearest first (the iteration 3 fuzz:
   * 25 of 46 single drops were still invalid after the ±8 search)
   */
  farStride: 10,
} as const;

const wrapN = (i: number, n: number): number => ((i % n) + n) % n;

/** Metres → lap units (`len` of a wall or tunnel) on this track, within the build's 4–40. */
export function metresToUnits(t: BuiltTrack, metres: number): number {
  return Math.max(4, Math.min(40, Math.round((metres * 256) / t.length)));
}

/** A piece's length in metres as the build lays it out (wall, tunnel), from its lap units. */
export function unitsToMetres(t: BuiltTrack, units: number): number {
  return Math.round((units / 256) * t.length);
}

/** Why a piece of `kind` cannot be added (a sentence key and its count), or null. */
export function pieceLimit(def: TrackDef, kind: SetPieceKind): { key: 'editor.piece.limit' | 'editor.piece.kindLimit'; n: number } | null {
  const pcs = def.setPieces ?? [];
  if (pcs.length >= PIECE_LIMITS.total) return { key: 'editor.piece.limit', n: PIECE_LIMITS.total };
  if (pcs.filter((p) => p.kind === kind).length >= PIECE_LIMITS[kind]) return { key: 'editor.piece.kindLimit', n: PIECE_LIMITS[kind] };
  if (def.features.length + pcs.length >= LIMITS.maxStickers) return { key: 'editor.piece.limit', n: LIMITS.maxStickers - def.features.length };
  return null;
}

/** The sticker's spot on the built track (its start: a loop's zone, a jump's lip, a wall's or tunnel's first sample). */
export function pieceAnchor(def: TrackDef, t: BuiltTrack, p: SetPiece): number {
  return pieceSample(def, t.n, p.s);
}

/** A new piece of `kind` starting at lap unit `s` with the editor defaults. */
export function newPiece(def: TrackDef, t: BuiltTrack, kind: SetPieceKind, s: number): SetPiece {
  if (kind === 'loop') return { kind, s };
  if (kind === 'jump') return { kind, s, gap: PIECE_EDIT.gapDefault };
  if (kind === 'tunnel') return { kind, s, len: metresToUnits(t, PIECE_EDIT.tunnelDefault) };
  const len = metresToUnits(t, PIECE_EDIT.wallLen);
  return { kind, s, len, ...wallSide(def, t, s, len) };
}

/** A wall ride on a straight (R ≥ 60 m over its whole length) is a half-pipe (side 0); on a bend the build picks the outside. */
export function wallSide(def: TrackDef, t: BuiltTrack, s: number, len: number): { side?: 0 } {
  const i0 = pieceSample(def, t.n, s);
  const span = Math.round((len / 256) * t.n);
  let c = 0;
  for (let k = 0; k <= span; k++) c = Math.max(c, Math.abs(t.curv[wrapN(i0 + k, t.n)]));
  return c < 1 / 60 ? { side: 0 } : {};
}

/** Issues the set-piece rules raise for `def` (no drive check: that runs once, in validateTrack). */
export function pieceIssueCount(def: TrackDef): number {
  try {
    return validateSetPieces(def, buildTrack(def), { ugc: true }).length;
  } catch {
    return 99;
  }
}

/**
 * Nudge piece `idx` of `def` by up to ±`snapReach` lap units to the spot with the fewest set-piece issues (none, when
 * there is one), preferring the smallest move; when none of those is valid, the nearest valid spot round the lap. A wall ride's side is re-picked at every spot. Returns the piece to keep
 * (unchanged when nothing does better).
 */
export function snapPiece(def: TrackDef, t: BuiltTrack, idx: number): SetPiece {
  const pcs = def.setPieces ?? [];
  const p0 = pcs[idx];
  const at = (ds: number): SetPiece => {
    const s = (((p0.s + ds) % 256) + 256) % 256;
    if (p0.kind !== 'wall' || p0.side === 1 || p0.side === -1) return { ...p0, s };
    const { side: _old, ...rest } = p0;
    void _old;
    return { ...rest, s, ...wallSide(def, t, s, p0.len ?? metresToUnits(t, PIECE_EDIT.wallLen)) };
  };
  const tryAt = (p: SetPiece): number => pieceIssueCount({ ...def, setPieces: pcs.map((q, j) => (j === idx ? p : q)) });
  let best = p0;
  let bestN = tryAt(p0);
  // one unit at a time close by, then every other unit (each try is a track build: keep it under ~10 on a phone)
  for (let r = 1; r <= PIECE_EDIT.snapReach && bestN > 0; r += r < 2 ? 1 : 2) {
    for (const ds of [r, -r]) {
      const p = at(ds);
      const k = tryAt(p);
      if (k < bestN) {
        best = p;
        bestN = k;
        if (!k) break;
      }
    }
  }
  // nothing valid close by: the nearest valid spot round the lap (coarse, nearest first; stops at the first one), then
  // the ±2 refine around it toward the drop
  if (bestN > 0) {
    for (let r = PIECE_EDIT.snapReach + PIECE_EDIT.farStride; r <= 128 && bestN > 0; r += PIECE_EDIT.farStride) {
      for (const ds of [r, -r]) {
        const p = at(ds);
        const k = tryAt(p);
        if (k < bestN) {
          best = p;
          bestN = k;
        }
        if (!k) {
          const toward = ds > 0 ? -1 : 1;
          for (let q = 1; q <= 4; q++) {
            const pq = at(ds + toward * q * 2);
            if (tryAt(pq) === 0) best = pq;
            else break;
          }
          break;
        }
      }
    }
  }
  return best;
}

/**
 * The set pieces of `def` that a doodled track may keep (a remix of an authored track: authored pieces follow the
 * authored spacing, 10 m apart and 30 m from the start, and the doodle rules want 40 m): each piece in turn, snapped
 * when needed, kept only when the doodle rules still pass with it. A remix therefore always opens drivable.
 */
export function ugcPieces(def: TrackDef): SetPiece[] | undefined {
  const all = def.setPieces ?? [];
  if (!all.length) return undefined;
  const keep: SetPiece[] = [];
  const base: TrackDef = { ...def, setPieces: [] };
  let t: BuiltTrack;
  try {
    t = buildTrack(base);
  } catch {
    return undefined;
  }
  for (const p of all) {
    if (keep.length >= PIECE_LIMITS.total || keep.filter((q) => q.kind === p.kind).length >= PIECE_LIMITS[p.kind]) continue;
    const trial: TrackDef = { ...base, setPieces: [...keep, p] };
    const snapped = snapPiece(trial, t, keep.length);
    if (pieceIssueCount({ ...base, setPieces: [...keep, snapped] }) === 0) keep.push(snapped);
  }
  return keep.length ? keep : undefined;
}

/** The placed piece for a def piece, or null when the build skipped it. */
export function placed(def: TrackDef, t: BuiltTrack, p: SetPiece): BuiltPiece | null {
  return builtPieceOf(def, t, p);
}

/** Tunnel length limits for the stepper (metres). */
export const TUNNEL_M = { min: PIECE_RULES.tunnelMin, max: PIECE_RULES.tunnelMax } as const;
/** The tunnel length the stepper shows (metres, to its 10 m step) for `len` lap units. */
export function tunnelMetres(t: BuiltTrack, len: number): number {
  return Math.round(unitsToMetres(t, len) / PIECE_EDIT.tunnelStep) * PIECE_EDIT.tunnelStep;
}

/**
 * The tunnel's `len` after one stepper press (`dir` −1 or +1), or null when the press cannot change it: past the
 * metre limits, or past the build's 4–40 lap units (on a short track 40 units is under 90 m, so + stops early).
 */
export function tunnelLenStep(t: BuiltTrack, len: number, dir: -1 | 1): number | null {
  const target = tunnelMetres(t, len) + dir * PIECE_EDIT.tunnelStep;
  if (target < TUNNEL_M.min || target > TUNNEL_M.max) return null;
  const next = metresToUnits(t, target);
  return next !== len ? next : null;
}

/** Jump gap and drop limits for the steppers (metres). */
export const JUMP_M = { gapMin: PIECE_RULES.gapMin, gapMax: PIECE_RULES.gapMax, dropMax: PIECE_RULES.dropMax } as const;
/** The loop's footprint (metres), for the map. */
export const LOOP_M = STUNT.loop.zone + STUNT.loop.strip;

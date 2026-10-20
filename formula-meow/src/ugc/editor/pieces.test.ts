/**
 * Track Doodle stunt stickers (iteration 3, pieces.ts): defaults where a sticker lands, the limits, and the snap to a
 * spot the validator accepts. The test oval: ≈ 612 m, straights s 0–60 and s 128–188, bends between.
 */
import { describe, expect, it } from 'vitest';
import type { SetPiece, TrackDef } from '../../types';
import { ovalTrack } from '../../test/fixtures';
import { buildTrack } from '../../core/track/build';
import { PIECE_LIMITS, validateSetPieces, validateTrack } from './validate';
import { metresToUnits, newPiece, pieceLimit, snapPiece, ugcPieces, unitsToMetres, wallSide } from './pieces';
import { ALL_TRACKS } from '../../core/track/tracks';

const oval = (setPieces?: SetPiece[]): TrackDef => ({ ...ovalTrack([{ s: 140, kind: 'items' }]), ...(setPieces ? { setPieces } : {}) });

describe('stunt stickers', () => {
  const t = buildTrack(oval());

  it('defaults: a jump 10 m, a tunnel ≈ 60 m, a wall ride 50 m (outer side on a bend, both sides on a straight)', () => {
    expect(newPiece(oval(), t, 'jump', 30)).toEqual({ kind: 'jump', s: 30, gap: 10 });
    expect(newPiece(oval(), t, 'loop', 150)).toEqual({ kind: 'loop', s: 150 });
    const tun = newPiece(oval(), t, 'tunnel', 30);
    expect(Math.abs(unitsToMetres(t, tun.len!) - 60)).toBeLessThanOrEqual(3);
    const bend = newPiece(oval(), t, 'wall', 88);
    expect(bend.side).toBeUndefined();
    expect(Math.abs(unitsToMetres(t, bend.len!) - 50)).toBeLessThanOrEqual(3);
    expect(newPiece(oval(), t, 'wall', 10).side).toBe(0);
    expect(wallSide(oval(), t, 92, 18)).toEqual({});
    expect(metresToUnits(t, 1000)).toBe(40);
    expect(metresToUnits(t, 1)).toBe(4);
  });

  it('limits: per kind and in total', () => {
    expect(pieceLimit(oval(), 'loop')).toBeNull();
    expect(pieceLimit(oval([{ kind: 'loop', s: 20 }, { kind: 'loop', s: 150 }]), 'loop')).toEqual({ key: 'editor.piece.kindLimit', n: PIECE_LIMITS.loop });
    expect(pieceLimit(oval([{ kind: 'loop', s: 20 }, { kind: 'loop', s: 150 }]), 'jump')).toBeNull();
    const six = Array.from({ length: 6 }, (_, k): SetPiece => ({ kind: k < 3 ? 'jump' : 'tunnel', s: k * 40 }));
    expect(pieceLimit(oval(six), 'loop')).toEqual({ key: 'editor.piece.limit', n: PIECE_LIMITS.total });
  });

  it('snap: a loop dropped half on a bend moves onto the straight; a good spot is kept', () => {
    // s 64: its zone runs into the first bend; a few units back it fits
    const def = oval([{ kind: 'loop', s: 64 }]);
    expect(validateSetPieces(def, undefined, { ugc: true }).length).toBeGreaterThan(0);
    const p = snapPiece(def, buildTrack(def), 0);
    expect(p.s).not.toBe(64);
    expect(Math.abs(p.s - 64)).toBeLessThanOrEqual(8);
    expect(validateSetPieces({ ...def, setPieces: [p] }, undefined, { ugc: true })).toEqual([]);
    const good = oval([{ kind: 'loop', s: 150 }]);
    expect(snapPiece(good, buildTrack(good), 0)).toEqual({ kind: 'loop', s: 150 });
  });

  it('a remix keeps only the authored pieces the doodle rules accept, so it opens drivable', () => {
    for (const def of ALL_TRACKS) {
      if (def.kind === 'arena' || !def.setPieces?.length) continue;
      const kept = ugcPieces(def) ?? [];
      expect(kept.length, def.id).toBeLessThanOrEqual(def.setPieces.length);
      expect(validateSetPieces({ ...def, setPieces: kept }, undefined, { ugc: true }), def.id).toEqual([]);
    }
    // a doodle whose pieces already pass keeps them all
    const lab = oval([{ kind: 'jump', s: 30, gap: 10, drop: 1.5 }, { kind: 'wall', s: 92, len: 18 }, { kind: 'loop', s: 150 }]);
    expect(ugcPieces(lab)).toEqual(lab.setPieces);
    expect(ugcPieces(oval())).toBeUndefined();
  });

  it('a doodled track with one of each stunt from the stickers passes, drive check included', () => {
    const def = oval();
    const pcs: SetPiece[] = [newPiece(def, t, 'jump', 26), newPiece(def, t, 'wall', 92), newPiece(def, t, 'loop', 150)];
    let d: TrackDef = { ...def, setPieces: pcs };
    for (let i = 0; i < pcs.length; i++) {
      const s = snapPiece(d, buildTrack(d), i);
      d = { ...d, setPieces: d.setPieces!.map((q, j) => (j === i ? s : q)) };
    }
    expect(validateTrack(d).issues).toEqual([]);
  });
});

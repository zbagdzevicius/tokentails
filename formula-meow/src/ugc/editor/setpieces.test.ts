/**
 * Set-piece validation (SIM_VERSION 8, ai-ugc lane, SETPIECES.md section 10): every rule code with a passing and a
 * failing case on the test oval (≈ 612 m, 2.39 m per lap unit: straights s 0–60 and s 128–188, bends between), the
 * drive check, and the authored tracks under the authored rules.
 */
import { describe, expect, it } from 'vitest';
import type { SetPiece, TrackDef } from '../../types';
import { ovalTrack } from '../../test/fixtures';
import { ALL_TRACKS } from '../../core/track/tracks';
import { buildTrack } from '../../core/track/build';
import { PIECE_LIMITS, validateSetPieces, validateTrack, type IssueCode } from './validate';
import { driveCheck, driveLap } from './drive-check';

const oval = (setPieces: SetPiece[], extra: TrackDef['features'] = []): TrackDef => ({ ...ovalTrack([{ s: 140, kind: 'items' }, ...extra]), setPieces });

function codes(def: TrackDef): IssueCode[] {
  return validateTrack(def).issues.map((i) => i.code);
}

describe('set-piece validator (doodled tracks)', () => {
  it('one of each piece in a good spot passes, drive check included', () => {
    const def = oval([{ kind: 'jump', s: 30, gap: 10, drop: 1.5 }, { kind: 'wall', s: 92, len: 18 }, { kind: 'loop', s: 150 }]);
    expect(validateTrack(def).issues).toEqual([]);
    expect(validateTrack(oval([{ kind: 'tunnel', s: 30, len: 24 }])).issues).toEqual([]);
  });

  it('loopBend: a loop on a bend', () => {
    expect(codes(oval([{ kind: 'loop', s: 24 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'loop', s: 100 }]))).toContain('loopBend');
  });

  it('loopClear: another road within 12 m of the loop', () => {
    // a narrow oval: the two straights 16 m apart, centre to centre
    const narrow: TrackDef = { ...oval([{ kind: 'loop', s: 24 }]), points: ovalTrack().points.map((p) => ({ ...p, x: Math.sign(p.x) * Math.min(Math.abs(p.x), 8), w: 0 })) };
    const plain = { ...narrow, setPieces: [] };
    const shape = (d: TrackDef) => validateTrack(d).issues.filter((i) => i.code !== 'tight' && i.code !== 'startBend').map((i) => i.code);
    expect(shape(plain)).toEqual([]);
    expect(shape(narrow)).toContain('loopClear');
    expect(codes(oval([{ kind: 'loop', s: 24 }]))).not.toContain('loopClear');
  });

  it('wallBend: on the outside of a 10–40 m bend only; a half-pipe on a straight', () => {
    expect(codes(oval([{ kind: 'wall', s: 92, len: 18 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'wall', s: 92, len: 18, side: 1 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'wall', s: 92, len: 18, side: -1 }]))).toContain('wallBend');
    expect(codes(oval([{ kind: 'wall', s: 30, len: 18, side: 1 }]))).toContain('wallBend');
    expect(codes(oval([{ kind: 'wall', s: 30, len: 18, side: 0 }]))).toEqual([]);
    // a puddle on the lane
    expect(codes(oval([{ kind: 'wall', s: 92, len: 18 }], [{ s: 98, kind: 'offroad', side: 1 }]))).toContain('wallBend');
  });

  it('jumpLine: gap 6–12 m, drop ≤ 2.5 m, a straight run-up and landing clear of stickers', () => {
    expect(codes(oval([{ kind: 'jump', s: 30, gap: 6 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'jump', s: 30, gap: 12, drop: 2.5 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'jump', s: 30, gap: 13 }]))).toContain('jumpLine');
    expect(codes(oval([{ kind: 'jump', s: 30, gap: 10, drop: 3 }]))).toContain('jumpLine');
    expect(codes(oval([{ kind: 'jump', s: 100, gap: 10 }]))).toContain('jumpLine');
    expect(codes(oval([{ kind: 'jump', s: 30, gap: 10 }], [{ s: 36, kind: 'items' }]))).toContain('jumpLine');
  });

  it('tunnelLen: 40–90 m, no ramp inside or just after', () => {
    expect(codes(oval([{ kind: 'tunnel', s: 30, len: 24 }]))).toEqual([]);
    expect(codes(oval([{ kind: 'tunnel', s: 30, len: 10 }]))).toContain('tunnelLen');
    expect(codes(oval([{ kind: 'tunnel', s: 30, len: 40 }]))).toContain('tunnelLen');
    expect(codes(oval([{ kind: 'tunnel', s: 30, len: 24 }], [{ s: 44, kind: 'ramp', side: 0 }]))).toContain('tunnelLen');
  });

  it('loopClear: no item row inside the loop (a railed kart cannot reach its boxes), doodled and authored rules', () => {
    expect(codes(oval([{ kind: 'loop', s: 150 }]))).not.toContain('loopClear');
    expect(codes(oval([{ kind: 'loop', s: 150 }], [{ s: 158, kind: 'items' }]))).toContain('loopClear');
    const lab = { ...oval([{ kind: 'loop', s: 160 }], [{ s: 168, kind: 'items' }]) };
    expect(validateSetPieces(lab).map((i) => i.code)).toContain('loopClear');
    expect(validateSetPieces(lab, undefined, { ugc: true }).map((i) => i.code)).toContain('loopClear');
  });

  it('pieceSpacing: 40 m from the start and from each other; ramps 30 m before a loop', () => {
    expect(codes(oval([{ kind: 'tunnel', s: 6, len: 20 }]))).toContain('pieceSpacing');
    expect(codes(oval([{ kind: 'tunnel', s: 30, len: 20 }, { kind: 'jump', s: 62 }]))).toContain('pieceSpacing');
    expect(codes(oval([{ kind: 'loop', s: 150 }], [{ s: 140 - 4, kind: 'ramp', side: 0 }]))).toContain('pieceSpacing');
  });

  it('pieceCount: per-kind and total limits', () => {
    expect(PIECE_LIMITS).toMatchObject({ loop: 2, wall: 3, jump: 3, tunnel: 3, total: 6 });
    const loops = oval([{ kind: 'loop', s: 20 }, { kind: 'loop', s: 40 }, { kind: 'loop', s: 150 }]);
    expect(validateSetPieces(loops, undefined, { ugc: true }).map((i) => i.code)).toContain('pieceCount');
    const many = oval(Array.from({ length: 7 }, (_, k) => ({ kind: 'tunnel' as const, s: 10 + k * 34, len: 8 })));
    expect(validateSetPieces(many, undefined, { ugc: true }).map((i) => i.code)).toContain('pieceCount');
  });

  it('every issue paints the piece (a sample range on the built track)', () => {
    const def = oval([{ kind: 'loop', s: 100 }]);
    const v = validateTrack(def);
    const is = v.issues.find((i) => i.code === 'loopBend')!;
    expect(is.from).toBeTypeOf('number');
    expect(is.to).toBeTypeOf('number');
    expect(is.message.length).toBeGreaterThan(10);
  });
});

describe('drive check', () => {
  it('the phone bot laps a track with one of each piece cleanly', () => {
    const def = oval([{ kind: 'jump', s: 30, gap: 12, drop: 2.5 }, { kind: 'wall', s: 92, len: 18 }, { kind: 'loop', s: 150 }, { kind: 'tunnel', s: 210, len: 20 }]);
    expect(driveLap(def)).toBeNull();
  });

  it('a failure becomes one "drive" issue painting the piece it happened on', () => {
    const def = oval([{ kind: 'jump', s: 30, gap: 10 }]);
    const t = buildTrack(def);
    const pc = t.pieces[0];
    // fake a net catch in the gap (the sim never lets the phone bot fail a valid jump)
    const issues = driveCheck(def, t, () => ({ why: 'net', i: (pc.i0 + 4) % t.n }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('drive');
    expect(issues[0].from).toBe(pc.strip);
    expect(issues[0].to).toBe(pc.end);
    expect(issues[0].message).toMatch(/net/);
  });
});

describe('authored tracks under the authored rules', () => {
  it('every authored track places all of its pieces and passes', () => {
    for (const def of ALL_TRACKS) {
      if (def.kind === 'arena') continue;
      const t = buildTrack(def);
      expect(t.pieces.length, def.id).toBe(def.setPieces?.length ?? 0);
      expect(validateSetPieces(def, t), def.id).toEqual([]);
    }
  });
});

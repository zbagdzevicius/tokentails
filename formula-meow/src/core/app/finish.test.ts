import { describe, expect, it } from 'vitest';
import type { RaceResult } from '../../types';
import { finishMargin, isPhotoFinish } from './finish';

type Row = RaceResult['places'][number];
const row = (kart: number, place: number, time: number | null, gap?: number | null): Row => ({ kart, name: `c${kart}`, place, time, bestLap: null, ...(time == null ? { gap } : {}) });
const res = (...places: Row[]) => ({ places });

describe('finishMargin (iteration 4, F4)', () => {
  it('won: the margin to the cat behind, from sub-tick times', () => {
    const m = finishMargin(res(row(5, 1, 80.1234), row(2, 2, 80.1934), row(3, 3, 82)), 5)!;
    expect(m.other).toBe(2);
    expect(m.won).toBe(true);
    expect(m.margin).toBeCloseTo(0.07, 9);
    expect(isPhotoFinish(m)).toBe(true);
  });

  it('lost: the nearest cat may be ahead; the nearest of ahead and behind wins', () => {
    const m = finishMargin(res(row(1, 1, 80), row(5, 2, 80.2), row(3, 3, 81.5)), 5)!;
    expect(m).toEqual({ margin: expect.closeTo(0.2, 9), other: 1, won: false });
    const n = finishMargin(res(row(1, 1, 79), row(5, 2, 80.2), row(3, 3, 80.3)), 5)!;
    expect(n.other).toBe(3);
    expect(n.won).toBe(true);
  });

  it('no one within 0.3 s is not a photo finish', () => {
    const m = finishMargin(res(row(5, 1, 80), row(2, 2, 81.8)), 5)!;
    expect(m.margin).toBeCloseTo(1.8, 9);
    expect(isPhotoFinish(m)).toBe(false);
  });

  it('never against a lapped kart; a kart still racing on the lead lap only by its projection', () => {
    // the winner alone over the line: 2nd is projected 1.8 s back, the lapped kart (gap −1) is ignored
    const m = finishMargin(res(row(5, 1, 80), row(2, 2, null, 1.8), row(3, 3, null, -1)), 5)!;
    expect(m).toEqual({ margin: expect.closeTo(1.8, 9), other: 2, won: true, projected: true });
    expect(isPhotoFinish({ ...m, margin: 0.1 })).toBe(false);
    // only lapped karts and karts with no projection: nothing to compare with
    expect(finishMargin(res(row(5, 1, 80), row(3, 2, null, -2), row(4, 3, null, null)), 5)).toBeNull();
    // a finished kart is kept unless a projection is strictly closer
    const f = finishMargin(res(row(1, 1, 79.9), row(5, 2, 80), row(2, 3, null, 0.2)), 5)!;
    expect(f).toEqual({ margin: expect.closeTo(0.1, 9), other: 1, won: false });
    const g = finishMargin(res(row(1, 1, 79.9), row(5, 2, 80), row(2, 3, null, 0.15)), 5)!;
    expect(g.other).toBe(2);
    expect(g.projected).toBe(true);
  });

  it('null without a player finish time (battle, DNF) or alone (time trial)', () => {
    expect(finishMargin(res(row(5, 1, null, 0)), 5)).toBeNull();
    expect(finishMargin(res(row(5, 1, 70)), 5)).toBeNull();
    expect(finishMargin(res(row(1, 1, 70)), 5)).toBeNull();
  });

  it('a dead heat: the race order decides who won', () => {
    expect(finishMargin(res(row(5, 1, 80), row(2, 2, 80)), 5)).toEqual({ margin: 0, other: 2, won: true });
    expect(finishMargin(res(row(2, 1, 80), row(5, 2, 80)), 5)).toEqual({ margin: 0, other: 2, won: false });
  });
});

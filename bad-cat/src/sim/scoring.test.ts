import { describe, expect, it } from 'vitest';
import { BONUS, COMBO_MAX, SUSPICION } from '../types';
import { currentCombo, finalizeScore, nextCombo, propPoints, rankFor, stackPoints, stampId, stashBonus } from './scoring';

describe('scoring formula (LANES.md)', () => {
  it('base × height × combo × event × last call / 8', () => {
    expect(propPoints(150, 2, 1, 0, 0)).toBe(225); // L2 ×1.5
    expect(propPoints(150, 0, 1, 0, 0)).toBe(150); // floor counts as L1
    expect(propPoints(150, 3, 1, 0, 0)).toBe(375); // L3 ×2.5
    expect(propPoints(100, 1, 3, 0, 0)).toBe(300); // combo ×3
    expect(propPoints(100, 1, 1, 1, 0)).toBe(125); // event ×1.25
    expect(propPoints(100, 1, 1, 0, 1)).toBe(200); // last call ×2
    expect(propPoints(150, 2, 2, 1, 1)).toBe(1125);
    expect(propPoints(101, 2, 1, 0, 0)).toBe(151); // floor(151.5)
  });
  it('clamps out-of-range levels', () => {
    expect(propPoints(100, -1, 1, 0, 0)).toBe(100);
    expect(propPoints(100, 9, 1, 0, 0)).toBe(250);
  });
  it('combo rises inside the window, caps, resets outside', () => {
    expect(nextCombo(1, 0)).toBe(1);
    expect(nextCombo(1, 10)).toBe(2);
    expect(nextCombo(COMBO_MAX, 10)).toBe(COMBO_MAX);
    expect(currentCombo(5, 3)).toBe(5);
    expect(currentCombo(5, 0)).toBe(1);
  });
  it('stash bonus stops at the max', () => {
    expect(stashBonus(0)).toBe(BONUS.stash);
    expect(stashBonus(BONUS.stashMax)).toBe(0);
  });
  it('end modifiers: caught, perfect, clean', () => {
    expect(finalizeScore(1001, true, 100_000)).toEqual({ finalScore: 500, stamp: 3 });
    expect(finalizeScore(1001, false, SUSPICION.perfectLimit)).toEqual({ finalScore: 1251, stamp: 1 });
    expect(finalizeScore(1001, false, SUSPICION.perfectLimit + 1)).toEqual({ finalScore: 1001, stamp: 2 });
    // Zero chaos is never a perfect crime.
    expect(finalizeScore(0, false, 0)).toEqual({ finalScore: 0, stamp: 2 });
    expect(finalizeScore(0, false, 0, { looks: 3, breaks: 0, targets: 0 })).toEqual({ finalScore: 0, stamp: 2 });
  });
  it('perfect crime needs a survived look and real chaos (SIM_VERSION 3)', () => {
    const lim = SUSPICION.perfectLimit;
    // two swats (one break) then idling: not perfect
    expect(finalizeScore(450, false, 0, { looks: 2, breaks: 1, targets: 0 }).stamp).toBe(2);
    // no look survived: not perfect
    expect(finalizeScore(2000, false, 0, { looks: 0, breaks: 3, targets: 1 }).stamp).toBe(2);
    expect(finalizeScore(2000, false, lim, { looks: 1, breaks: 2, targets: 0 }).stamp).toBe(1);
    expect(finalizeScore(1450, false, lim, { looks: 1, breaks: 1, targets: 1 }).stamp).toBe(1);
  });
  it('ranks and stamp ids', () => {
    expect(rankFor(0)).toBe('Nap Champion');
    expect(rankFor(1)).toBe('Mildly Naughty');
    expect(rankFor(799)).toBe('Mildly Naughty');
    expect(rankFor(800)).toBe('Troublemaker');
    expect(rankFor(1999)).toBe('Troublemaker');
    expect(rankFor(2000)).toBe('Menace');
    expect(rankFor(9000)).toBe('Agent of Chaos');
    expect(rankFor(99999)).toBe('Legendary Bad Cat');
    expect(rankFor(0, true)).toBe('Cuddled');
    expect(rankFor(5000, true)).toBe('Cuddled');
    expect([stampId(1), stampId(2), stampId(3)]).toEqual(['perfect', 'clean', 'caught']);
  });
  it('v5 stack: each item at its own combo, capped (every branch)', () => {
    // plate stack (4 x 80) from L2, chain starting at x1: 120 + 240 + 360 + 480
    expect(stackPoints(80, 4, 2, 1, 0, 0)).toBe(1200);
    // starting at x6: 6, 7, 8, 8 (capped)
    expect(stackPoints(80, 4, 2, 6, 0, 0)).toBe(120 * (6 + 7 + 8 + 8));
    // event and last call apply per item
    expect(stackPoints(40, 2, 1, 1, 1, 1)).toBe(propPoints(40, 1, 1, 1, 1) + propPoints(40, 1, 2, 1, 1));
    expect(stackPoints(80, 0, 2, 1, 0, 0)).toBe(0);
    expect(stackPoints(80, 1, 2, COMBO_MAX + 3, 0, 0)).toBe(propPoints(80, 2, COMBO_MAX, 0, 0));
  });
  it('default crime tally (callers without a tally)', () => {
    expect(finalizeScore(10, false, 0)).toEqual({ finalScore: 12, stamp: 1 });
    expect(finalizeScore(0, false, 0).stamp).toBe(2);
  });
});

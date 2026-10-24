import { describe, expect, it } from 'vitest';
import { bankPoints, setPiecePoints, TIER_AT, TIER_MUL, TIER_NAMES, tierFor, tierMul, TRICK_IDS, TRICK_POINTS, trickPoints, trickWeight } from './points';

describe('style points', () => {
  it('tiers start at 5, 10, 20, 35, 50, 75', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 34, 35, 49, 50, 74, 75, 500].map(tierFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(TIER_NAMES.slice(1)).toEqual(['NICE!', 'PAWSOME!', 'CLAW-SOME!', 'FUR-OCIOUS!', 'NINE LIVES!', 'CAT-ASTROPHIC!']);
    expect(TIER_AT.length).toBe(6);
    expect(TIER_MUL).toEqual([1, 1, 1.25, 1.5, 2, 2.5, 3]);
  });
  it('trick values match the spec and scale with the tier', () => {
    expect(TRICK_POINTS).toEqual({ SPIN: 250, DOUBLE: 600, TRIPLE: 1200, FLIP: 200, CORKSCREW: 700, 'PAW-DIVE': 300 });
    expect(trickPoints('DOUBLE', 0)).toBe(600);
    expect(trickPoints('DOUBLE', 5)).toBe(1500);
    expect(trickPoints('TRIPLE', 6)).toBe(3600);
    expect(setPiecePoints(0)).toBe(400);
    expect(setPiecePoints(3)).toBe(600);
  });
  it('bank = round(15 x n x tierMul of the chain)', () => {
    expect(bankPoints(0)).toBe(0);
    expect(bankPoints(4)).toBe(60);
    expect(bankPoints(10)).toBe(Math.round(15 * 10 * 1.25));
    expect(bankPoints(60)).toBe(2250);
    expect(bankPoints(80)).toBe(3600);
  });
  it('weights: tricks 2, double 3, triple 4; tier multiplier clamps', () => {
    expect(TRICK_IDS.map(trickWeight)).toEqual([2, 3, 4, 2, 2, 2]);
    expect(tierMul(-3)).toBe(1);
    expect(tierMul(99)).toBe(3);
    expect(tierMul(Number.NaN)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { comboMult, money, rankOf, scoredValue, segValueMul, ultraGain } from './scoring';

describe('scoring', () => {
  it('combo multiplier steps every 8 hits and caps at x5', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(7)).toBe(1);
    expect(comboMult(8)).toBe(2);
    expect(comboMult(100)).toBe(5);
  });
  it('frenzy doubles and value multiplier applies', () => {
    expect(scoredValue(2, 8, true, 1.5)).toBe(2 * 2 * 2 * 1.5);
  });
  it('wanted landmark pays 3x and value grows over time', () => {
    expect(segValueMul(0, false)).toBe(1);
    expect(segValueMul(45, true)).toBe(6);
  });
  it('ultra gain caps big hits', () => {
    expect(ultraGain(10)).toBe(3);
    expect(ultraGain(1, 2)).toBe(2);
  });
  it('formats money', () => {
    expect(money(0)).toBe('$0');
    expect(money(0.25)).toBe('$250K');
    expect(money(3.44)).toBe('$3.4M');
    expect(money(1250)).toBe('$1.25B');
  });
  it('ranks', () => {
    expect(rankOf(0)).toBe(0);
    expect(rankOf(650)).toBe(3);
    expect(rankOf(99999)).toBe(5);
  });
});

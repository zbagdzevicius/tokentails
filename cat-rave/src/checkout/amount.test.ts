import { describe, expect, it } from 'vitest';
import { DEFAULT_FEE, DEFAULT_PRICES, catsLabel, clampCustom, formatCents, isValidCats, parseCustom, quote } from './amount';

describe('isValidCats', () => {
  it('accepts $1, $5 and custom from $10 to max', () => {
    for (const n of [1, 5, 10, 11, 99, 500]) expect(isValidCats(n)).toBe(true);
  });
  it('refuses the gap, zero, fractions and above max', () => {
    for (const n of [0, -1, 2, 3, 4, 6, 9, 501, 1.5, NaN, Infinity]) expect(isValidCats(n)).toBe(false);
  });
  it('respects a lower max from the daily cap', () => {
    const rules = { ...DEFAULT_PRICES, max: 7 };
    expect(isValidCats(5, rules)).toBe(true);
    expect(isValidCats(10, rules)).toBe(false);
  });
});

describe('parseCustom', () => {
  it('takes whole dollars in friendly spellings', () => {
    expect(parseCustom('25')).toEqual({ ok: true, cats: 25 });
    expect(parseCustom(' $ 10 ')).toEqual({ ok: true, cats: 10 });
    expect(parseCustom('$500')).toEqual({ ok: true, cats: 500 });
  });
  it('refuses cents, empty, junk, below min and above max', () => {
    for (const s of ['', '10.50', '1e3', '-5', 'ten', '9', '501', '0x10']) expect(parseCustom(s).ok).toBe(false);
    expect(parseCustom('9')).toMatchObject({ ok: false, message: 'Custom starts at $10.' });
    expect(parseCustom('10.5')).toMatchObject({ ok: false, message: 'Whole dollars only (1 dollar = 1 cat).' });
  });
  it('clamps the stepper', () => {
    expect(clampCustom(3)).toBe(10);
    expect(clampCustom(9999)).toBe(500);
    expect(clampCustom(NaN)).toBe(10);
  });
});

describe('quote (spec section 8 table)', () => {
  const table: Array<[number, number]> = [
    [1, 134],
    [5, 546],
    [10, 1061],
    [50, 5181],
    [100, 10330],
  ];
  for (const [cats, amount] of table) {
    it(`$${cats} with the fee covered is ${formatCents(amount)}`, () => {
      const q = quote(cats, true, DEFAULT_FEE);
      expect(q).toEqual({ donationCents: cats * 100, amountCents: amount, feeCents: amount - cats * 100 });
    });
  }
  it('the gross-up always covers the fee', () => {
    for (let cats = 1; cats <= 500; cats += 1) {
      const q = quote(cats, true);
      const stripeFee = Math.round((q.amountCents * DEFAULT_FEE.percentBps) / 10000) + DEFAULT_FEE.fixedCents;
      expect(q.amountCents - stripeFee).toBeGreaterThanOrEqual(q.donationCents);
    }
  });
  it('no fee when not covered or for USDC', () => {
    expect(quote(5, false)).toEqual({ donationCents: 500, feeCents: 0, amountCents: 500 });
    expect(quote(5, true, DEFAULT_FEE, 'usdc')).toEqual({ donationCents: 500, feeCents: 0, amountCents: 500 });
  });
  it('uses the server fee numbers', () => {
    expect(quote(5, true, { percentBps: 150, fixedCents: 25 }).amountCents).toBe(533);
  });
});

describe('formatting', () => {
  it('formats cents and cats', () => {
    expect(formatCents(46)).toBe('$0.46');
    expect(formatCents(500)).toBe('$5');
    expect(formatCents(123450)).toBe('$1,234.50');
    expect(catsLabel(1)).toBe('1 cat');
    expect(catsLabel(1000)).toBe('1,000 cats');
  });
});

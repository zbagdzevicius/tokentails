import { describe, expect, it } from 'vitest';
import { cleanCountry, flagDesign } from './countries';
import { buildSnapshot, demoCountry } from './index';

describe('DEMO cat flags', () => {
  it('gives demo cats a stable, mixed sample of countries (some with none)', () => {
    const s = buildSnapshot({ asOf: 'x', events: [] }, { origin: 'live', demoCats: 400 });
    const again = buildSnapshot({ asOf: 'x', events: [] }, { origin: 'live', demoCats: 400 });
    expect(s.catList.map((c) => c.country)).toEqual(again.catList.map((c) => c.country));
    const codes = s.catList.map((c) => c.country);
    const none = codes.filter((c) => c === null).length;
    expect(none).toBeGreaterThan(40);
    expect(none).toBeLessThan(200);
    const set = new Set(codes.filter((c): c is string => !!c));
    expect(set.size).toBeGreaterThanOrEqual(12);
    for (const c of set) {
      expect(cleanCountry(c)).toBe(c);
      expect(flagDesign(c)).not.toBeNull(); // every sample country has a drawn flag
    }
  });

  it('never puts a sample country on a real cat', () => {
    const event = { chainId: 5042, txHash: `0x${'1'.padStart(64, '0')}`, logIndex: 0, timestamp: 1_001, symbol: 'USDC', amount18: (3n * 10n ** 18n).toString(), source: 'treat' };
    const s = buildSnapshot({ asOf: 'x', events: [event] } as Parameters<typeof buildSnapshot>[0], { origin: 'live', demoCats: 10 });
    expect(s.realCats).toBe(3);
    expect(s.catList.slice(0, 3).every((c) => !c.demo && c.country === undefined)).toBe(true);
    expect(s.catList.slice(3).every((c) => c.demo)).toBe(true);
    expect([0, 0.1, 0.5, 0.99].map(demoCountry).every((c) => c === null || /^[A-Z]{2}$/.test(c))).toBe(true);
  });
});

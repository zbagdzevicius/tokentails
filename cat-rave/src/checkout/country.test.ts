import { describe, expect, it } from 'vitest';
import { parseStatus } from './api';
import { COUNTRY_PICK_KEY, NO_FLAG, countryForRequest, pickerVisible, rememberCountry, rememberedCountry } from './country';

const mem = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('country picker logic', () => {
  it('shows the picker only once the server answered without a country', () => {
    expect(pickerVisible(undefined)).toBe(false); // still asking
    expect(pickerVisible('LT')).toBe(false); // detected: hidden field only
    expect(pickerVisible(null)).toBe(true);
  });

  it('sends the IP country when known, else the pick, else nothing', () => {
    expect(countryForRequest('LT', 'DE')).toBe('LT');
    expect(countryForRequest(null, 'de')).toBe('DE');
    expect(countryForRequest(undefined, 'DE')).toBe('DE');
    expect(countryForRequest(null, '')).toBeNull();
    expect(countryForRequest('XX', 'T1')).toBeNull();
    expect(countryForRequest('XX', 'FR')).toBe('FR');
  });

  it('"Show my flag" off sends "none" (the server then stores no country, even from the IP)', () => {
    expect(countryForRequest('LT', null, true)).toBe(NO_FLAG);
    expect(NO_FLAG).toBe('none');
  });

  it('remembers the last pick and survives broken storage', () => {
    const s = mem();
    expect(rememberedCountry(s)).toBeNull();
    rememberCountry(s, 'PL');
    expect(s.m.get(COUNTRY_PICK_KEY)).toBe('PL');
    expect(rememberedCountry(s)).toBe('PL');
    s.m.set(COUNTRY_PICK_KEY, 'not a country');
    expect(rememberedCountry(s)).toBeNull();
    rememberCountry(s, null);
    expect(s.m.has(COUNTRY_PICK_KEY)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(rememberedCountry(broken)).toBeNull();
    expect(() => rememberCountry(broken, 'PL')).not.toThrow();
    expect(rememberedCountry(null)).toBeNull();
  });
});

describe('parseStatus country', () => {
  const on = { enabled: true, publishableKey: 'pk_test_abc', prices: { fixed: [1, 5], customMin: 10, max: 100 } };
  it('keeps a detected country, maps junk to null (picker), and leaves it out when absent', () => {
    expect(parseStatus({ ...on, country: 'lt' })).toMatchObject({ enabled: true, country: 'LT' });
    expect(parseStatus({ ...on, country: 'XX' })).toMatchObject({ enabled: true, country: null });
    expect(parseStatus({ ...on, country: null })).toMatchObject({ enabled: true, country: null });
    expect('country' in parseStatus(on)).toBe(false);
  });
});

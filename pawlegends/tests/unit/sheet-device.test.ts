import { describe, expect, it } from 'vitest';
import { SHEET_QUERY, sheetDevice } from '../../src/social/sheetDevice';

const win = (o: { mq?: boolean; touch?: string; ua?: string; tp?: number; mobile?: boolean } = {}) => ({
  matchMedia: (q: string) => ({ matches: q === SHEET_QUERY && !!o.mq }),
  navigator: { userAgent: o.ua ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131 Safari/537.36', maxTouchPoints: o.tp ?? 0, ...(o.mobile !== undefined ? { userAgentData: { mobile: o.mobile } } : {}) },
  document: { documentElement: { dataset: o.touch ? { touch: o.touch } : {} } },
});
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

describe('sheetDevice: a phone-like device gets bottom sheets (Nov 19)', () => {
  it('a desktop with a mouse on a wide screen keeps the popover', () => {
    expect(sheetDevice(win(), null)).toBe(false);
    expect(sheetDevice(win({ mobile: false }), null)).toBe(false);
  });
  it('touch, no hover, a narrow or short screen', () => {
    expect(sheetDevice(win({ mq: true }), null)).toBe(true);
    expect(SHEET_QUERY).toContain('(max-width: 900px)');
    expect(SHEET_QUERY).toContain('(max-height: 500px)');
    expect(SHEET_QUERY).toContain('(any-pointer: coarse)');
  });
  it('an Android phone that reports a fine pointer and no touch (the founder case)', () => {
    expect(sheetDevice(win({ ua: ANDROID }), null)).toBe(true);
    expect(sheetDevice(win({ ua: ANDROID, tp: 5 }), null)).toBe(true);
    expect(sheetDevice(win({ mobile: true }), null)).toBe(true);
  });
  it('the game touch flag', () => {
    expect(sheetDevice(win({ touch: '1' }), null)).toBe(true);
  });
  it('the app WebView on a phone or tablet, not the Mac app', () => {
    expect(sheetDevice(win(), 'android')).toBe(true);
    expect(sheetDevice(win(), 'ios')).toBe(true);
    expect(sheetDevice(win(), 'mac')).toBe(false);
  });
  it('a touch laptop with a desktop user agent keeps the popover; no window is not a sheet', () => {
    expect(sheetDevice(win({ tp: 10 }), null)).toBe(false);
    expect(sheetDevice(null, null)).toBe(false);
  });
});

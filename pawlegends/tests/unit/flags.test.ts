// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_FLAGS, botFlag, ccHtml, cleanCc, flagEmoji, flagHidden, matchFlagsFor, myFlag, refreshMyFlag, setFlagHidden } from '../../src/social/flags';

describe('country flags (FLAGS.md)', () => {
  beforeEach(() => localStorage.clear());

  it('turns an ISO code into its flag emoji and refuses anything else', () => {
    expect(flagEmoji('LT')).toBe('🇱🇹');
    expect(cleanCc('LT')).toBe('LT');
    for (const bad of ['lt', 'LTU', 'XX', '', null, 3, undefined]) expect(cleanCc(bad)).toBeNull();
  });

  it('gives each bot seat a stable flag from the list, spread over many countries', () => {
    expect(botFlag(42, 3)).toBe(botFlag(42, 3));
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) for (let slot = 0; slot < 10; slot++) {
      const f = botFlag(seed, slot);
      expect(BOT_FLAGS).toContain(f);
      seen.add(f);
    }
    expect(seen.size).toBeGreaterThan(BOT_FLAGS.length * 0.9);
  });

  it('never gives two bots of one match the same flag (10 seats, 2,000 seeds)', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const flags = Array.from({ length: 10 }, (_, slot) => botFlag(seed * 7919 + 1, slot));
      expect(new Set(flags).size).toBe(10);
    }
  });

  it('builds a match: own flag, relay flags for humans (paw when hidden), seeded flags for bots', () => {
    const solo = matchFlagsFor({ seed: 7, slots: 6, mySlot: 0, mine: 'LT', isHuman: (s) => s === 0 });
    expect(solo[0]).toBe('LT');
    for (let s = 1; s < 6; s++) expect(solo[s]).toBe(botFlag(7, s));
    const party = matchFlagsFor({ seed: 7, slots: 6, mySlot: 1, mine: 'LT', isHuman: (s) => s < 2, relay: ['DE', null, null, null, null, null] });
    expect(party[0]).toBe('DE');
    // the relay's own copy wins for the player too (it already applied the hide choice)
    expect(party[1]).toBeNull();
    expect(party[2]).toBe(botFlag(7, 2));
  });

  it('draws a paw for a hidden or unknown flag, never an empty chip', () => {
    expect(ccHtml(null)).toContain('🐾');
    expect(ccHtml('ZZZ')).toContain('🐾');
    const html = ccHtml('FR');
    expect(html).toContain('data-cc="FR"');
    expect(html).toContain('🇫🇷');
  });

  it('keeps the hide choice locally and sends it to the backend', async () => {
    const api = vi.fn(async () => ({ ok: true, body: {} }));
    await setFlagHidden(true, api);
    expect(flagHidden()).toBe(true);
    expect(api).toHaveBeenCalledWith('flag.set', { hideFlag: true });
    await setFlagHidden(false, null);
    expect(flagHidden()).toBe(false);
  });

  it('a device that never chose adopts the account\'s hide choice', async () => {
    const api = vi.fn(async () => ({ ok: true, body: { cc: 'LT', hideFlag: true } }));
    expect(await refreshMyFlag(api, 1000)).toBeNull();
    expect(flagHidden()).toBe(true);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('caches the country, hides it when the player chose so, and pushes a differing hide choice', async () => {
    await setFlagHidden(false, null);
    const api = vi.fn(async (op: string) => (op === 'flag.get' ? { ok: true, body: { cc: 'LT', hideFlag: true } } : { ok: true, body: {} }));
    expect(await refreshMyFlag(api, 1000)).toBe('LT');
    expect(api).toHaveBeenCalledWith('flag.set', { hideFlag: false });
    // cached: no second call within the window
    await refreshMyFlag(api, 2000);
    expect(api.mock.calls.filter((c) => c[0] === 'flag.get')).toHaveLength(1);
    await setFlagHidden(true, null);
    expect(myFlag()).toBeNull();
  });

  it('asks once while a read is in flight (Home redraws while it boots)', async () => {
    let answer: (v: { ok: boolean; body?: unknown }) => void = () => undefined;
    const api = vi.fn(() => new Promise<{ ok: boolean; body?: unknown }>((r) => (answer = r)));
    const all = Promise.all(Array.from({ length: 5 }, () => refreshMyFlag(api, 5000)));
    answer({ ok: true, body: { cc: 'DE' } });
    expect(await all).toEqual(['DE', 'DE', 'DE', 'DE', 'DE']);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('an older host without the op leaves the flag unknown', async () => {
    expect(await refreshMyFlag(async () => ({ ok: false }), 1)).toBeNull();
  });
});

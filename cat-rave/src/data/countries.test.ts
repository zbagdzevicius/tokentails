import { describe, expect, it, vi } from 'vitest';
import {
  cleanCountry,
  COUNTRY_CODES,
  countryLeaderboard,
  countryName,
  countryOptions,
  drawFlag,
  fetchGeoCountry,
  flagDesign,
  flagEmoji,
  FLAG_DESIGNS,
  guessCountryFromLocale,
  type FlagCtx,
} from './countries';

function mockCtx() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '' as unknown,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    rect: () => calls.push('rect'),
    clip: () => calls.push('clip'),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect ${String(ctx.fillStyle)} ${[x, y, w, h].map((n) => Math.round(n * 10) / 10).join(',')}`),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    arc: () => calls.push(`arc ${String(ctx.fillStyle)}`),
    fill: () => calls.push('fill'),
    fillText: (t: string) => calls.push(`text ${t}`),
  };
  return { ctx: ctx as unknown as FlagCtx, calls };
}

describe('country codes', () => {
  it('has every ISO code once plus XK', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRY_CODES.length).toBe(250);
    expect(COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
  });
  it('cleans codes and rejects Cloudflare unknown / Tor and junk', () => {
    expect(cleanCountry(' lt ')).toBe('LT');
    expect(cleanCountry('XK')).toBe('XK');
    for (const bad of ['XX', 'T1', 'EU', 'ZZ', '', 'LTU', 1, null, undefined, {}]) expect(cleanCountry(bad)).toBeNull();
  });
  it('names, emoji', () => {
    expect(countryName('LT')).toBe('Lithuania');
    expect(countryName('us')).toBe('United States');
    expect(countryName('XK')).toBe('Kosovo');
    expect(countryName(null)).toBe('');
    expect(countryName('XX')).toBe('');
    expect(flagEmoji('LT')).toBe('\u{1F1F1}\u{1F1F9}');
    expect(flagEmoji('XX')).toBe('');
  });
  it('picker options: sorted by name, guesses first, no uninhabited territories', () => {
    const opts = countryOptions(['lt', 'XX', 'LT']);
    expect(opts[0]).toEqual({ code: 'LT', name: 'Lithuania', flag: flagEmoji('LT') });
    expect(opts.filter((o) => o.code === 'LT')).toHaveLength(1);
    expect(opts.some((o) => o.code === 'AQ')).toBe(false);
    const rest = opts.slice(1).map((o) => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')));
  });
  it('guesses a default from browser languages', () => {
    expect(guessCountryFromLocale(['en', 'lt-LT'])).toBe('LT');
    expect(guessCountryFromLocale(['en-GB'])).toBe('GB');
    expect(guessCountryFromLocale(['zh-Hant-TW'])).toBe('TW');
    expect(guessCountryFromLocale(['en', 'fr'])).toBeNull();
    expect(guessCountryFromLocale(['es-419'])).toBeNull();
    expect(guessCountryFromLocale(undefined)).toBeNull();
  });
});

describe('countryLeaderboard', () => {
  it('sums cats per country, ranks with ties, keeps unknown apart', () => {
    const b = countryLeaderboard([
      { country: 'LT', cats: 5, landed: true },
      { country: 'lt', cats: 1 },
      { country: 'DE', cats: 6, landed: true },
      { country: 'FR', cats: 2 },
      { country: 'XX', cats: 3 },
      { country: null, cats: 1 },
      { country: 'US', cats: 0 },
      { country: 'US', cats: -2 },
    ]);
    expect(b.rows.map((r) => [r.code, r.cats, r.orders, r.landed, r.rank])).toEqual([
      ['LT', 6, 2, 5, 1],
      ['DE', 6, 1, 6, 1],
      ['FR', 2, 1, 0, 3],
    ]);
    expect(b.countries).toBe(3);
    expect(b.totalCats).toBe(14);
    expect(b.unknownCats).toBe(4);
    expect(b.rows[0].name).toBe('Lithuania');
  });
  it('shares a rank on equal cats; more orders, then name, decides the order', () => {
    const b = countryLeaderboard([
      { country: 'DE', cats: 1 },
      { country: 'FR', cats: 1 },
      { country: 'FR', cats: 0 },
      { country: 'LT', cats: 3 },
    ]);
    expect(b.rows.map((r) => [r.code, r.rank])).toEqual([
      ['LT', 1],
      ['FR', 2],
      ['DE', 2],
    ]);
  });
  it('empty', () => {
    expect(countryLeaderboard([])).toEqual({ rows: [], countries: 0, totalCats: 0, unknownCats: 0 });
  });
});

describe('flags', () => {
  it('every design uses valid codes, hex colours and matching weights', () => {
    for (const [code, d] of Object.entries(FLAG_DESIGNS)) {
      expect(cleanCountry(code)).toBe(code);
      expect(d.colors.length).toBeGreaterThan(0);
      if (d.weights) expect(d.weights.length).toBe(d.colors.length);
      const cols = [...d.colors, d.band?.color, d.triangle?.color, d.canton?.color, d.cross?.color, d.cross?.inner, d.plus?.color, d.plus?.inner, d.diamond?.color, d.disc?.color];
      for (const c of cols) if (c !== undefined) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(flagDesign('lt')?.colors).toEqual(['#FDB913', '#006A44', '#C1272D']);
    expect(flagDesign('XK')).toBeNull();
    expect(flagDesign(null)).toBeNull();
  });
  it('draws stripes in order, sized by weight', () => {
    const { ctx, calls } = mockCtx();
    expect(drawFlag(ctx, 'LV', 0, 0, 30, 20)).toBe('design');
    expect(calls.filter((c) => c.startsWith('fillRect'))).toEqual(['fillRect #9E3039 0,0,30,8.5', 'fillRect #FFFFFF 0,8,30,4.5', 'fillRect #9E3039 0,12,30,8.5']);
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });
  it('vertical stripes and extras', () => {
    const fr = mockCtx();
    drawFlag(fr.ctx, 'FR', 10, 0, 30, 20);
    expect(fr.calls.filter((c) => c.startsWith('fillRect'))[0]).toBe('fillRect #002395 10,0,10.5,20');
    const jp = mockCtx();
    drawFlag(jp.ctx, 'JP', 0, 0, 30, 20);
    expect(jp.calls).toContain('arc #BC002D');
    const cz = mockCtx();
    drawFlag(cz.ctx, 'CZ', 0, 0, 30, 20);
    expect(cz.calls.filter((c) => c === 'lineTo')).toHaveLength(2);
    const se = mockCtx();
    drawFlag(se.ctx, 'SE', 0, 0, 30, 20);
    expect(se.calls.filter((c) => c.startsWith('fillRect #FECC00'))).toHaveLength(2);
    for (const code of Object.keys(FLAG_DESIGNS)) expect(drawFlag(mockCtx().ctx, code, 0, 0, 24, 16)).toBe('design');
  });
  it('neutral code tag without a design, nothing for unknown', () => {
    const { ctx, calls } = mockCtx();
    expect(drawFlag(ctx, 'XK', 0, 0, 30, 20)).toBe('code');
    expect(calls).toContain('text XK');
    const none = mockCtx();
    expect(drawFlag(none.ctx, 'XX', 0, 0, 30, 20)).toBe('none');
    expect(none.calls).toEqual([]);
  });
});

describe('fetchGeoCountry', () => {
  const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
  it('reads the IP country', async () => {
    const f = vi.fn(async (_url: string) => res(200, { country: 'lt' }));
    expect(await fetchGeoCountry('https://api.example/', f)).toBe('LT');
    expect(f.mock.calls[0][0]).toBe('https://api.example/rave/geo');
  });
  it('null on unknown, error, no API', async () => {
    expect(await fetchGeoCountry('https://a', async () => res(200, { country: 'XX' }))).toBeNull();
    expect(await fetchGeoCountry('https://a', async () => res(200, { country: null }))).toBeNull();
    expect(await fetchGeoCountry('https://a', async () => res(404, {}))).toBeNull();
    expect(await fetchGeoCountry('https://a', async () => Promise.reject(new Error('net')))).toBeNull();
    expect(await fetchGeoCountry(null)).toBeNull();
  });
});

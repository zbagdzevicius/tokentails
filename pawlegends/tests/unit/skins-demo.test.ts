import { describe, expect, it } from 'vitest';
import { DEMO_ROSTER, skinDemoOn } from '../../src/app/skinDemo';
import { parseRoster } from '../../src/meta/roster';
import { tierRungOf } from '../../src/render/skins/registry';

const base = { search: '?skins=demo', protocol: 'http:', hostname: '127.0.0.1', framed: false, isApp: false };

describe('?skins=demo (local standalone preview)', () => {
  it('runs only on a local, unframed, non-app page with the query', () => {
    expect(skinDemoOn(base)).toBe(true);
    expect(skinDemoOn({ ...base, hostname: 'localhost' })).toBe(true);
    expect(skinDemoOn({ ...base, protocol: 'file:', hostname: '' })).toBe(true);
    expect(skinDemoOn({ ...base, hostname: 'tokentails.com' })).toBe(false);
    expect(skinDemoOn({ ...base, hostname: '127.0.0.1.evil.example' })).toBe(false);
    expect(skinDemoOn({ ...base, framed: true })).toBe(false);
    expect(skinDemoOn({ ...base, isApp: true })).toBe(false);
    expect(skinDemoOn({ ...base, search: '' })).toBe(false);
    expect(skinDemoOn({ ...base, search: '?skins=legendary' })).toBe(false);
  });

  it('the demo roster parses whole and covers every rung, with the pack cat at Common', () => {
    const cats = parseRoster(DEMO_ROSTER, { isApp: false });
    expect(cats).toHaveLength(DEMO_ROSTER.length);
    expect(new Set(cats.map((c) => tierRungOf(c)))).toEqual(new Set(['COMMON', 'RARE', 'EPIC', 'LEGENDARY']));
    expect(tierRungOf(cats.find((c) => c.origin === 'pack')!)).toBe('COMMON');
    expect(cats.every((c) => !!c.family)).toBe(true);
  });
});

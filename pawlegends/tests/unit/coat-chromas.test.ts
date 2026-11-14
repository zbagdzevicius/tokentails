/**
 * gaps4 coats-tests: coat chromas (render/skins/coatChromas.ts) and the two food coats. Four recolours per coat with a
 * palette, earned by finished matches in the coat (1, 3, 6, 10), kept in the local profile, worn through the look
 * (its own geometry key), never on a coat the player does not own; and Club Sandwich and Kebab King have model parts,
 * their own effects and their words.
 */
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { CHROMAS, chromaPalette, chromasEarned, dye, nextChroma } from '../../src/render/skins/coatChromas';
import { EMPTY_ROSTER } from '../../src/meta/roster';
import { FREE_COATS, PAID_COATS, coatDyes, hasChromas, lookCoat, lookKey, resolveLook, type Owned } from '../../src/render/cosmetics';
import { COAT_PLAYS_MAX, freshProfile, loadProfile, noteCoatMatch, parseProfile, resetProfileCache } from '../../src/meta/profile';
import { COAT_PARTS } from '../../src/render/chars/coatParts';
import { COAT_THEMES, COAT_COST, CoatVfx } from '../../src/render/skins/coatFx';
import { EFFECT_COATS } from '../../src/money/catalog';
import { openChampBrowser } from '../../src/ui/champBrowser/champBrowser';

beforeEach(() => {
  localStorage.clear();
  resetProfileCache();
});

const CALICO = 'coat.clem.store_calico';
const owned = (plays: Record<string, number>, items: string[] = [CALICO]): Owned => ({ items: new Set(items), unlocks: new Set(), roster: EMPTY_ROSTER, coatPlays: plays });

describe('chromas', () => {
  it('four chromas, unlocked at 1, 3, 6 and 10 matches in the coat', () => {
    expect(CHROMAS.map((c) => c.plays)).toEqual([1, 3, 6, 10]);
    expect(chromasEarned(0)).toEqual([]);
    expect(chromasEarned(3)).toEqual(['rose', 'jade']);
    expect(chromasEarned(99)).toHaveLength(4);
    expect(nextChroma(4)).toMatchObject({ def: { key: 'amethyst' }, left: 2 });
    expect(nextChroma(10)).toBeNull();
  });
  it('every coat with a palette has chromas; each chroma is a visibly different palette, even on white and black coats', () => {
    const ids = [...Object.keys(PAID_COATS), ...Object.keys(FREE_COATS)];
    expect(ids.length).toBeGreaterThan(80);
    for (const id of ids) expect(hasChromas(id), id).toBe(true);
    expect(hasChromas(null)).toBe(false);
    expect(hasChromas('cat.abc')).toBe(false);
    const dist = (a: number, b: number): number => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
    for (const id of ['coat.marshmallow.store_tuxedo', 'coat.duchess.pearl', CALICO]) {
      const c = PAID_COATS[id]?.coat ?? FREE_COATS[id].coat;
      const bases = CHROMAS.map((d) => chromaPalette(c, d.key).base);
      for (const b of bases) expect(dist(b, c.base), id).toBeGreaterThan(40);
      expect(new Set(bases).size).toBe(4);
    }
    // the pattern and its patch survive; an unknown key changes nothing
    const cal = PAID_COATS[CALICO].coat;
    expect(chromaPalette(cal, 'jade')).toMatchObject({ pattern: 'calico' });
    expect(chromaPalette(cal, 'jade').patch).not.toBe(cal.patch);
    expect(chromaPalette(cal, 'nope')).toBe(cal);
    expect(dye(0x000000, 0xff0000)).not.toBe(0);
  });
  it('the look wears an earned chroma on an owned coat only, and a chroma changes the geometry key', () => {
    expect(resolveLook('clem', owned({ [CALICO]: 3 }), { coat: CALICO, dye: 'jade' })).toEqual({ coat: CALICO, chroma: null, dye: 'jade' });
    // not earned yet, another coat's chroma, or a coat not owned: the coat's own colours
    expect(resolveLook('clem', owned({ [CALICO]: 2 }), { coat: CALICO, dye: 'jade' }).dye).toBeUndefined();
    expect(resolveLook('clem', owned({ [CALICO]: 9 }, []), { coat: CALICO, dye: 'rose' })).toEqual({ coat: null, chroma: null });
    expect(coatDyes(CALICO, owned({ [CALICO]: 6 }))).toEqual(['rose', 'jade', 'amethyst']);
    const a = { coat: CALICO, chroma: null };
    expect(lookKey({ ...a, dye: 'rose' })).not.toBe(lookKey(a));
    expect(lookKey(a)).toBe(`${CALICO}|-`);
    expect(lookCoat('clem', { ...a, dye: 'rose' })!.base).toBe(chromaPalette(PAID_COATS[CALICO].coat, 'rose').base);
    expect(lookCoat('sage', { ...a, dye: 'rose' })).toBeNull();
  });
  it('the profile counts matches per coat, keeps the chroma on the look, and drops junk', () => {
    expect(freshProfile().coatPlays).toEqual({});
    expect(noteCoatMatch(CALICO)).toBe(1);
    expect(noteCoatMatch(CALICO)).toBe(2);
    expect(noteCoatMatch(null)).toBe(0);
    expect(noteCoatMatch('cat.x')).toBe(0);
    expect(loadProfile().coatPlays).toEqual({ [CALICO]: 2 });
    const p = parseProfile(JSON.stringify({ coatPlays: { [CALICO]: 4, 'x y': 3, 'coat.a': -1, 'coat.b': 'z' }, looks: { clem: { coat: CALICO, chroma: null, dye: 'rose' }, sage: { coat: null, chroma: null, dye: '<b>' } } }));
    expect(p.coatPlays).toEqual({ [CALICO]: 4 });
    expect(p.looks.clem).toEqual({ coat: CALICO, chroma: null, dye: 'rose' });
    expect(p.looks.sage).toEqual({ coat: null, chroma: null });
    const many = Object.fromEntries(Array.from({ length: COAT_PLAYS_MAX + 20 }, (_, i) => [`coat.c${i}`, i + 1]));
    expect(Object.keys(parseProfile(JSON.stringify({ coatPlays: many })).coatPlays)).toHaveLength(COAT_PLAYS_MAX);
  });
});

describe('Heroes → Coats: chroma swatches', () => {
  it('previews any chroma, wears an earned one, and says how many matches a locked one needs', () => {
    const worn: Record<string, { coat: string | null; chroma: null; dye?: string | null }> = {};
    const b = openChampBrowser({
      hero: 'clem',
      coat: CALICO,
      clips: null,
      coatWear: {
        owns: (_h, c) => c === CALICO,
        dyes: () => ['rose'],
        plays: () => 2,
        worn: (h) => (worn[h] as never) ?? { coat: null, chroma: null },
        wear: (h, l) => void (worn[h] = l as never),
      },
    });
    const root = b.root;
    const sw = [...root.querySelectorAll<HTMLElement>('.cb-dye')];
    expect(sw).toHaveLength(5);
    expect(sw.filter((s) => s.classList.contains('locked'))).toHaveLength(3);
    root.querySelector<HTMLElement>('[data-dye="jade"]')!.click();
    expect(root.querySelector('.cb-dye-note')!.textContent).toContain('1 more match');
    expect(root.querySelector('[data-a="wear"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-dye="rose"]')!.click();
    root.querySelector<HTMLElement>('[data-a="wear"]')!.click();
    expect(worn.clem).toEqual({ coat: CALICO, chroma: null, dye: 'rose' });
    expect(root.querySelector('[data-a="wear"]')!.textContent).toBe('Wearing');
    b.close();
  });
});

describe('the food coats (Club Sandwich, Kebab King)', () => {
  const NEW = ['coat.clem.store_club_sandwich', 'coat.frankie.store_kebab_king'];
  it('are Epic store coats with model parts, their own themes and effects inside the Epic budget', () => {
    for (const id of NEW) {
      expect(EFFECT_COATS.find((c) => c.id === id)?.rung).toBe('EPIC');
      expect(PAID_COATS[id].rung).toBe('EPIC');
      expect(COAT_PARTS[id]?.hero).toBe(PAID_COATS[id].hero);
      expect(COAT_THEMES[id]).toBeTruthy();
    }
    expect(COAT_THEMES[NEW[0]].theme).toBe('deli');
    expect(COAT_THEMES[NEW[1]].theme).toBe('grill');
    for (const t of ['deli', 'grill'] as const) for (const [k, [full, low]] of Object.entries(COAT_COST[t])) {
      expect(full, `${t} ${k}`).toBeLessThanOrEqual(16);
      expect(low).toBeLessThanOrEqual(full);
    }
  });
  it('draw exactly the sprites they claim (full and Low)', () => {
    for (const [id, theme] of [[NEW[0], 'deli'], [NEW[1], 'grill']] as const) {
      for (const low of [false, true]) {
        let n = 0;
        const particles = {
          add: { count: 0, limit: 999 },
          alpha: { count: 0, limit: 999 },
          single: () => void n++,
          burst: (_p: unknown, o: { n?: number }) => void (n += o.n ?? 1),
        };
        const fx = new CoatVfx(particles as never, null);
        const p = { source: 'coat', extras: true, rung: 'EPIC', coatId: id, id: 1, self: true, team: 0, mate: null, low, tint: 0xffcf3a, accent: 0x7ccf4a, cream: 0xfff6e0 } as never;
        const kinds = [['ult', () => fx.ult(0, 0, 3, p)], ['nap', () => fx.nap(0, 0, p)], ['land', () => fx.land(0, 0, p)], ['takedown', () => fx.takedown(0, 0, p)]] as const;
        for (const [k, run] of kinds) {
          n = 0;
          fx.tick(5);
          expect(run(), `${theme} ${k}`).toBe(true);
          expect(n, `${theme} ${k} low=${low}`).toBe(COAT_COST[theme][k][low ? 1 : 0]);
        }
      }
    }
  });
});

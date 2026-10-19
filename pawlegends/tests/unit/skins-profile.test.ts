/**
 * Card skins in the local profile (GDD §7.2, meta/profile.ts): 64-character skin ids, junk rejected, the fallback
 * when the cat is gone, Bond counting and its cap, the skin effects setting and the preview cap.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BOND_MAX, capBond, freshProfile, loadProfile, noteBond, notePreview, parseProfile, previewAllowed, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { rosterCosmetics } from '../../src/meta/roster';
import { resolveLook, type Owned } from '../../src/render/cosmetics';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  resetProfileCache();
});

describe('profile: card skins', () => {
  it('accepts a card skin id with a 64-character cat id; rejects junk', () => {
    const id = `cat.${'a'.repeat(64)}`;
    const p = parseProfile(JSON.stringify({ looks: { clem: { coat: id, chroma: null }, sage: { coat: '<img onerror=x>', chroma: 'FIRE' }, lambo: { coat: `cat.${'b'.repeat(90)}`, chroma: null } } }));
    expect(p.looks.clem?.coat).toBe(id);
    expect(p.looks.sage?.coat).toBeNull();
    expect(p.looks.lambo?.coat).toBeNull();
  });
  it('new fields default and parse: skinFx, previewsSeen, bond (positive integers only), skinAuto', () => {
    const f = freshProfile();
    expect(f.skinFx).toBe('all');
    expect(f.bond).toEqual({});
    const p = parseProfile(JSON.stringify({ skinFx: 'mine', previewsSeen: { session: 4, n: 2 }, bond: { a: 3, b: -1, 'c d': 5, e: 2.7, f: 'x' }, skinAuto: '65a1b2c3d4e5f6a7b8c9d0e1' }));
    expect(p.skinFx).toBe('mine');
    expect(p.previewsSeen).toEqual({ session: 4, n: 2 });
    expect(p.bond).toEqual({ a: 3, e: 2 });
    expect(p.skinAuto).toBe('65a1b2c3d4e5f6a7b8c9d0e1');
    expect(parseProfile(JSON.stringify({ skinFx: 'loud' })).skinFx).toBe('all');
  });
  it('a profile from before card skins never auto-equips its old newCat (skinAuto migrates to it once)', () => {
    expect(parseProfile(JSON.stringify({ newCat: 'old-cat' })).skinAuto).toBe('old-cat');
    expect(parseProfile(JSON.stringify({ newCat: 'new-cat', skinAuto: null })).skinAuto).toBeNull();
    expect(parseProfile(JSON.stringify({ newCat: 'new-cat', skinAuto: 'old-cat' })).skinAuto).toBe('old-cat');
  });
  it('a stored skin whose cat left the roster falls back to Classic', () => {
    const owned: Owned = { items: new Set(), unlocks: new Set(), roster: rosterCosmetics([]) };
    expect(resolveLook('clem', owned, { coat: 'cat.gone', chroma: null })).toEqual({ coat: null, chroma: null });
  });
  it(`Bond counts finished matches per cat and keeps at most ${BOND_MAX} entries (the lowest outside the roster go first)`, () => {
    expect(noteBond('mochi')).toBe(1);
    expect(noteBond('mochi')).toBe(2);
    expect(loadProfile().bond.mochi).toBe(2);
    const big: Record<string, number> = {};
    for (let i = 0; i < BOND_MAX + 5; i++) big[`k${i}`] = i + 1;
    const capped = capBond(big, ['k0', 'k1']);
    expect(Object.keys(capped).length).toBe(BOND_MAX);
    expect(capped.k0).toBe(1);
    expect(capped.k1).toBe(2);
    expect(capped.k2).toBeUndefined();
    const p = loadProfile();
    p.bond = big;
    saveProfile(p);
    noteBond('k0', ['k0']);
    expect(Object.keys(loadProfile().bond).length).toBe(BOND_MAX);
    expect(loadProfile().bond.k0).toBe(2);
  });
  it('previews: a guest sees 1 a page session, a signed-in player 3; a new session resets the count', () => {
    const p = loadProfile();
    p.sessions = 5;
    saveProfile(p);
    expect(previewAllowed(loadProfile(), false)).toBe(true);
    notePreview();
    expect(previewAllowed(loadProfile(), false)).toBe(false);
    expect(previewAllowed(loadProfile(), true)).toBe(true);
    notePreview();
    notePreview();
    expect(previewAllowed(loadProfile(), true)).toBe(false);
    const q = loadProfile();
    q.sessions = 6;
    saveProfile(q);
    expect(previewAllowed(loadProfile(), false)).toBe(true);
  });
});

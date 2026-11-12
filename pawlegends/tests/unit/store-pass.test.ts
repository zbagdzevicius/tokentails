// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as game from '../../src/money/catalog';
import * as server from '../../../backend/src/pawlegends/pawlegends-catalog';
import { FREE_COATS, PAID_COATS, STORE_FRAME_NAME, bestFrame, lookCoat, lookItems, resolveLook, titleOf, wardrobe, type Owned } from '../../src/render/cosmetics';
import { Entitlements } from '../../src/money/entitlements';
import { CheckoutBridge } from '../../src/money/checkoutBridge';
import { parseSaveResult, parseStoreState, type HostMessage } from '../../src/embed/bridge';
import { currentSeason, matchesToNextText, xpToNext } from '../../src/meta/pass';
import { itemState, tabSkus } from '../../src/ui/store';
import { resetAppBuild, setAppBuild } from '../../src/meta/roster';
import { LOOP_PALETTES } from '../../src/meta/treats';
import { ELEMENTS } from '../../src/meta/roster';

/*
 * STORE-PASS.md: the catalogue mirror against the backend, the store and pass cosmetics (visual only), the host's
 * `store` message, the native-app rules, and that nothing of it reaches the sim.
 */

const roster = { breedCoats: [], chromas: [], frames: [], companions: [], cardSkins: [] } as unknown as Owned['roster'];
const owned = (items: string[], unlocks: string[] = []): Owned => ({ items: new Set(items), unlocks: new Set(unlocks), roster });

describe('catalogue mirror', () => {
  it('equals the backend catalogue (SKUs, prices, items, the season table and XP rules)', () => {
    expect(game.CATALOG_SKUS).toEqual(server.CATALOG_SKUS);
    expect(game.STORE_COATS).toEqual(server.STORE_COATS);
    expect(game.EFFECT_COATS).toEqual(server.EFFECT_COATS);
    expect(game.EFFECT_COAT_CENTS).toEqual(server.EFFECT_COAT_CENTS);
    expect(game.STORE_FRAMES).toEqual(server.STORE_FRAMES);
    expect(game.SEASONS).toEqual(server.SEASONS);
    expect(game.SEASON_XP).toEqual(server.SEASON_XP);
    expect(game.STORE_TERMS_VERSION).toBe(server.STORE_TERMS_VERSION);
    expect(game.seasonXpFor({ won: true, forfeit: false, takedowns: 99, firstWinToday: true })).toBe(server.seasonXpFor({ won: true, forfeit: false, takedowns: 99, firstWinToday: true }));
    // sim v22: a Blitz match pays per minute, a draw the loss plus half the win bonus
    expect(game.seasonXpFor({ won: true, forfeit: false, takedowns: 4, firstWinToday: false, ticks: 5200 })).toBe(server.seasonXpFor({ won: true, forfeit: false, takedowns: 4, firstWinToday: false, ticks: 5200 }));
    expect(game.seasonXpFor({ won: false, forfeit: false, takedowns: 0, firstWinToday: false, draw: true })).toBe(80);
  });
});

describe('store and pass cosmetics', () => {
  it('every paid coat has a palette with a pattern on store coats, and no id or name collides with a free coat', () => {
    for (const c of game.STORE_COATS) expect(PAID_COATS[c.id]?.coat.pattern, c.id).toBeTruthy();
    const freeNames = new Set([...Object.values(FREE_COATS).map((f) => `${f.hero}:${f.name}`), ...LOOP_PALETTES.map((p) => p.name)]);
    for (const [id, c] of Object.entries(PAID_COATS)) {
      expect(FREE_COATS[id], id).toBeUndefined();
      expect(freeNames.has(`${c.hero}:${c.name}`), id).toBe(false);
    }
    const passCoats = game.SEASONS.flatMap((s) => [...s.free, ...s.premium]).filter((r) => r.item.startsWith('coat.'));
    for (const r of passCoats) expect(PAID_COATS[r.item], r.item).toBeTruthy();
    expect(PAID_COATS[game.S1_PLUS_COAT]).toBeTruthy();
  });
  it('CARD-SKINS.md: every paid coat has an effect rung and an element; effect coats are priced by rung and in no set', () => {
    for (const [id, c] of Object.entries(PAID_COATS)) {
      expect(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'], id).toContain(c.rung);
      expect(ELEMENTS, id).toContain(c.element);
    }
    for (const c of game.EFFECT_COATS) {
      expect(PAID_COATS[c.id]?.rung, c.id).toBe(c.rung);
      expect(PAID_COATS[c.id]?.coat.pattern, c.id).toBeTruthy();
      const def = game.catalogSku(game.coatSkuOf(c))!;
      expect(def.cents.usd, c.id).toBe(c.rung === 'EPIC' ? 799 : 1499);
      for (const set of game.CATALOG_SKUS.filter((d) => d.kind === 'bundle')) expect(set.items, set.sku).not.toContain(c.id);
    }
    expect(game.coatSkuOf(game.EFFECT_COATS[2])).toBe('pl_coat_brutus_thunderpaw');
  });
  it('the wardrobe offers owned store and pass coats; the look is the store palette with its pattern', () => {
    const o = owned(['coat.clem.store_calico', 'coat.clem.s1_honey_tabby']);
    const ids = wardrobe('clem', o).map((c) => c.id);
    expect(ids).toContain('coat.clem.store_calico');
    expect(ids).toContain('coat.clem.s1_honey_tabby');
    expect(wardrobe('sage', o).map((c) => c.id)).not.toContain('coat.clem.store_calico');
    expect(resolveLook('clem', o, { coat: 'coat.clem.store_calico' }).coat).toBe('coat.clem.store_calico');
    expect(lookCoat('clem', { coat: 'coat.clem.store_calico', chroma: null })?.pattern).toBe('calico');
    expect(lookCoat('sage', { coat: 'coat.clem.store_calico', chroma: null })).toBeNull();
    expect(lookItems({ coat: 'coat.clem.store_calico', chroma: null })).toEqual(['coat.clem.store_calico']);
    // a champion wears its card's coat only
    expect(wardrobe('lambo', owned(['coat.clem.store_calico'])).length).toBe(1);
  });
  it('store and pass frames and titles are worn only when owned', () => {
    expect(STORE_FRAME_NAME['frame.store.goldpaw']).toBe('Gold Paw frame');
    expect(bestFrame(owned(['frame.store.goldpaw']), 'frame.store.goldpaw')).toBe('frame.store.goldpaw');
    expect(bestFrame(owned([]), 'frame.store.goldpaw')).toBeNull();
    expect(titleOf(owned(['title.store.bone']), 'title.store.bone')).toBe('Good Dog');
    expect(titleOf(owned(['title.s1.rookie']), 'title.s1.rookie')).toBe('Rookie Legend');
    expect(titleOf(owned([]), 'title.store.bone')).toBeNull();
  });
});

describe('the sim never reads cosmetics', () => {
  it('no sim file imports the cosmetics, the catalogue or the pass', () => {
    const root = resolve(__dirname, '../../src/sim');
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(root);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/render\/cosmetics|money\/catalog|meta\/pass|money\/entitlements/);
  });
});

const store = (items: string[], season: Record<string, unknown> | null = null): HostMessage => ({ type: 'store', items, season }) as HostMessage;

describe('host store state', () => {
  afterEach(() => resetAppBuild());
  it('keeps known store and pass items and a clean pass row', () => {
    const v = parseStoreState({ items: ['coat.clem.store_calico', 'evil<script>', 'frame.s1.sprout'], season: { id: 's1', xp: 820, tier: 2, premium: 'pass', skips: 0, claimed: ['f:3', 'x'], endsAt: '2027-01-05T00:00:00.000Z' } });
    expect(v?.items).toEqual(['coat.clem.store_calico', 'frame.s1.sprout']);
    expect(v?.season).toMatchObject({ xp: 820, premium: 'pass', claimed: ['f:3'] });
    expect(parseSaveResult({ matchId: 'abc', status: 'saved', catnipPaid: 0, season: { gained: 310, xp: 310, tier: 0, prevTier: 0 } })?.season?.gained).toBe(310);
  });
  it('web: the store opens with the host checkout and every owned item is drawn', () => {
    const e = new Entitlements();
    e.apply({ type: 'app', isApp: false, store: true });
    e.apply(store(['coat.clem.store_calico', 'coat.clem.s1_honey_tabby']));
    const s = e.snapshot();
    expect(s.storeOpen).toBe(true);
    expect([...s.items].sort()).toEqual(['coat.clem.s1_honey_tabby', 'coat.clem.store_calico']);
  });
  it('app build: no store, no purchased items; pass free-row rewards still drawn', () => {
    setAppBuild(true);
    const e = new Entitlements();
    e.apply({ type: 'app', isApp: true, store: true });
    e.apply(store(['coat.clem.store_calico', 'coat.clem.s1_honey_tabby', 'coat.meatball.s1_caramel', 'coat.brutus.store_thunderpaw']));
    const s = e.snapshot();
    expect(s.storeOpen).toBe(false);
    expect([...s.items]).toEqual(['coat.clem.s1_honey_tabby']);
  });
  it('buy posts purchase-intent for catalogue SKUs only, and only while the store is open', () => {
    const posts: [string, Record<string, unknown> | undefined][] = [];
    const bridge = { post: (t: string, p?: Record<string, unknown>) => (posts.push([t, p]), true), on: () => undefined };
    const e = new Entitlements();
    const c = new CheckoutBridge(bridge as never, e);
    expect(c.buy('pl_coat_clem_calico')).toBe(false);
    e.apply({ type: 'app', isApp: false, store: true });
    expect(c.buy('pl_founder')).toBe(false);
    expect(c.buy('pl_coat_clem_calico')).toBe(true);
    expect(posts).toEqual([['purchase-intent', { sku: 'pl_coat_clem_calico' }]]);
  });
});

describe('store states and the pass', () => {
  it('a set with an owned item is not sold (singles instead); the upgrade needs the pass', () => {
    const cats = game.catalogSku('pl_set_cats_s1')!;
    expect(itemState(cats, { items: new Set(), season: null })).toBe('buy');
    expect(itemState(cats, { items: new Set(['coat.sage.store_silver_tabby']), season: null })).toBe('partly');
    expect(itemState(cats, { items: new Set(cats.items), season: null })).toBe('owned');
    const up = game.catalogSku(game.PASS_UPGRADE_SKU)!;
    const s = { id: 's1', xp: 0, tier: 0, skips: 0, claimed: [], endsAt: '' };
    expect(itemState(up, { items: new Set(), season: { ...s, premium: 'none' } })).toBe('locked');
    expect(itemState(up, { items: new Set(), season: { ...s, premium: 'pass' } })).toBe('buy');
    expect(tabSkus('coats')).toHaveLength(20);
    expect(tabSkus('coats').slice(0, 4).map((d) => d.cents.usd)).toEqual([799, 799, 1499, 1499]);
    expect(tabSkus('frames')).toHaveLength(4);
  });
  it('tier math and the "matches to go" line', () => {
    const def = currentSeason();
    expect(xpToNext(def, { xp: 0, skips: 0 })).toBe(400);
    expect(matchesToNextText(def, { xp: 0, skips: 0 })).toBe('about 4 matches to tier 1');
    expect(matchesToNextText(def, { xp: 12000, skips: 0 })).toBeNull();
  });
});

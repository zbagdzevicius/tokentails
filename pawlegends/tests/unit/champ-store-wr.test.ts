// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROTATION_EPOCH, STARTERS, champSkuOf } from '../../src/money/catalog';
import { HERO_IDS } from '../../src/data/heroes';
import { parseChampionsState, type ChampionsState } from '../../src/meta/champions';
import { DEFAULT_FILTER, allCards, champCard, loadSort, newestHeroes, saveSort, splashAttrs, visibleCards } from '../../src/ui/champStore/model';
import { storePanel, type StoreOpts } from '../../src/ui/store';
import type { CheckoutBridge } from '../../src/money/checkoutBridge';
import type { StoreSnapshot } from '../../src/money/entitlements';
import fs from 'node:fs';
import path from 'node:path';

/*
 * The Wild Rift style store (CHAMPION-STORE.md §10, ui/store.ts + ui/champStore): the card data, the filters and the
 * sort, the splash files, and the panel: tabs, cards, the detail's Yarn unlock and web purchase, Esc, and the app
 * build that shows no money at all.
 */

const WEEK0 = Date.parse(ROTATION_EPOCH) + 3600_000;
const state = (over: Record<string, unknown> = {}): ChampionsState =>
  parseChampionsState({ owned: [], founders: false, rotation: { week: 0 }, yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 }, bundles: [], ...over }, WEEK0)!;

describe('card data', () => {
  it('every champion has a card; starters, free, owned and locked states with Yarn to go', () => {
    const s = state({ owned: [{ hero: 'pixel', source: 'yarn' }], yarn: { balance: 3000, matches: 9, picksLeft: 1, nextPickAt: 15 } });
    const cards = allCards(s, false);
    expect(cards.map((c) => c.hero).sort()).toEqual([...HERO_IDS].sort());
    for (const h of STARTERS) expect(cards.find((c) => c.hero === h)!.status).toBe('starter');
    expect(champCard('pixel', s, false)!.status).toBe('owned');
    expect(champCard('pixel', s, false)!.unlockable).toBe(false);
    for (const h of s.rotation.heroes.filter((h) => h !== 'pixel')) expect(champCard(h as never, s, false)!.status).toBe('free');
    const duchess = champCard('duchess', s, false)!; // T2, 3,500 Yarn
    expect(duchess.yarn).toBe(3500);
    expect(duchess.toGo).toBe(500);
    expect(duchess.pick).toBe(true);
    expect(duchess.cents).toEqual({ usd: 399, eur: 399 });
  });

  it('app build: a web-bought champion is Locked with nothing to unlock', () => {
    const s = state({ owned: [{ hero: 'stilts', source: 'purchase' }] });
    const web = champCard('stilts', s, false)!;
    const app = champCard('stilts', s, true)!;
    expect(web.status).toBe('owned');
    expect(app.hidden).toBe(true);
    expect(app.unlockable).toBe(false);
  });
});

describe('filters and sort', () => {
  const s = state({ owned: [{ hero: 'pixel', source: 'yarn' }] });
  const cards = allCards(s, false);
  it('side, role and Unowned', () => {
    expect(visibleCards(cards, { ...DEFAULT_FILTER, side: 'dog' })).toHaveLength(10);
    expect(visibleCards(cards, { ...DEFAULT_FILTER, side: 'cat', role: 'tank' }).map((c) => c.hero)).toEqual(['lambo', 'meatball']);
    const un = visibleCards(cards, { ...DEFAULT_FILTER, unowned: true });
    expect(un).toHaveLength(13); // 14 non-starters minus Pixel
    expect(un.some((c) => STARTERS.includes(c.hero) || c.hero === 'pixel')).toBe(false);
  });
  it('Default is catalogue order; Price cheapest first with starters last; Name A to Z; Newest by release', () => {
    expect(visibleCards(cards, DEFAULT_FILTER)[0].hero).toBe('clem');
    const price = visibleCards(cards, { ...DEFAULT_FILTER, sort: 'price' });
    expect(price[0].yarn).toBe(2500);
    expect(price.at(-1)!.yarn).toBeNull();
    const ys = price.map((c) => c.yarn ?? Infinity);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const names = visibleCards(cards, { ...DEFAULT_FILTER, sort: 'name' }).map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(visibleCards(cards, { ...DEFAULT_FILTER, sort: 'newest' })[0].hero).toBe(HERO_IDS.at(-1));
    expect(newestHeroes(3)).toEqual([...HERO_IDS].reverse().slice(0, 3));
  });
  it('the sort is remembered; broken or throwing storage falls back to Default', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveSort('name', store);
    expect(loadSort(store)).toBe('name');
    mem.set([...mem.keys()][0], 'bogus');
    expect(loadSort(store)).toBe('default');
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSort(bad)).toBe('default');
    expect(() => saveSort('price', bad)).not.toThrow();
  });
});

describe('splash art', () => {
  it('every hero has a 360 and a 720 splash; Low quality loads the 360 only', () => {
    const dir = path.resolve(__dirname, '../../public/assets/splash');
    for (const h of HERO_IDS) for (const w of [360, 720]) expect(fs.existsSync(path.join(dir, `${h}-${w}.webp`)), `${h}-${w}`).toBe(true);
    for (const f of ['backdrop-1600.webp', 'yarn.svg', 'roles/fighter.svg', 'roles/marksman.svg', 'roles/tank.svg', 'roles/assassin.svg', 'roles/mage.svg', 'roles/support.svg'])
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
    expect(splashAttrs('/', 'clem', true, '160px')).toBe('src="/assets/splash/clem-360.webp"');
    expect(splashAttrs('/', 'clem', false, '160px')).toContain('clem-720.webp 720w');
  });
});

// ------------------------------------------------------------------------------------------------- the panel
const fakeCheckout = (): CheckoutBridge & { bought: string[] } => {
  const bought: string[] = [];
  return { bought, buy: (sku: string) => (bought.push(sku), true), waitingSku: () => null, onResult: () => () => undefined } as unknown as CheckoutBridge & { bought: string[] };
};
const snap = (c: ChampionsState, isApp = false): StoreSnapshot =>
  ({ embedded: true, isApp, storeOpen: !isApp, catCheckout: false, notifyOpen: false, signedIn: true, items: new Set(), skus: new Set(), season: null, champions: c }) as StoreSnapshot;

function open(c: ChampionsState, extra: Partial<StoreOpts> = {}, isApp = false) {
  const checkout = fakeCheckout();
  const unlocks: string[] = [];
  const onClose = vi.fn();
  const p = storePanel(document.body, { snapshot: () => snap(c, isApp), checkout, onClose, onUnlock: (h, via) => void unlocks.push(`${h}:${via}`), ...extra });
  return { p, el: p.el, checkout, unlocks, onClose };
}
const click = (el: Element | null): void => (el as HTMLElement).click();

describe('store panel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
  });

  it('opens on Champions: 4 bottom tabs, 20 tall cards with lazy splash art, a Yarn chip', () => {
    const { el } = open(state({ yarn: { balance: 1234, matches: 3, picksLeft: 0, nextPickAt: 5 } }));
    expect([...el.querySelectorAll('.cst-tabs [data-tab]')].map((b) => b.textContent)).toEqual(['Featured', 'Champions', 'Coats', 'Frames & Titles']);
    expect(el.querySelector('.cst-tab.on')!.getAttribute('data-tab')).toBe('champions');
    expect(el.querySelectorAll('.cst-card[data-hero]')).toHaveLength(20);
    const img = el.querySelector('.cst-card img.cst-art') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('srcset')).toContain('720w');
    expect(el.querySelector('.cst-chip')!.textContent).toContain('1,234');
  });

  it('filters: Dogs, a role toggled on and off, Unowned, and the sort (remembered)', () => {
    const { el } = open(state());
    click(el.querySelector('[data-side="dog"]'));
    expect(el.querySelectorAll('.cst-card[data-hero]')).toHaveLength(10);
    click(el.querySelector('[data-role="tank"]'));
    expect([...el.querySelectorAll('.cst-card[data-hero]')].map((c) => c.getAttribute('data-hero'))).toEqual(['brutus', 'bravo']);
    click(el.querySelector('[data-role="tank"]'));
    expect(el.querySelectorAll('.cst-card[data-hero]')).toHaveLength(10);
    const un = el.querySelector('[data-a="unowned"]') as HTMLInputElement;
    un.checked = true;
    un.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.querySelectorAll('.cst-card[data-hero]')).toHaveLength(7);
    const sel = el.querySelector('[data-a="sort"]') as HTMLSelectElement;
    sel.value = 'name';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(loadSort()).toBe('name');
  });

  it('a card opens the detail: Yarn unlock asks the host, the web price opens checkout, Esc closes the detail then the store', () => {
    const c = state({ yarn: { balance: 5000, matches: 50, picksLeft: 1, nextPickAt: 15 } });
    const { el, unlocks, checkout, onClose } = open(c);
    click(el.querySelector('.cst-card[data-hero="duchess"]'));
    const d = el.querySelector('.cst-detail')!;
    expect(d.textContent).toContain('Duchess');
    expect(d.querySelectorAll('.cst-skills li')).toHaveLength(5);
    click(d.querySelector('[data-unlock="yarn"]'));
    expect(unlocks).toEqual(['duchess:yarn']);
    click(el.querySelector('.cst-detail [data-unlock="pick"]'));
    expect(unlocks).toEqual(['duchess:yarn', 'duchess:pick']);
    click(el.querySelector(`.cst-detail [data-buy="${champSkuOf('duchess')}"]`));
    expect(checkout.bought).toEqual(['pl_champ_duchess']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.querySelector('.cst-detail')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(el.isConnected).toBe(false);
  });

  it('short of Yarn: "to go" and no Yarn button; owned and starter cards have no unlock', () => {
    const { el } = open(state({ owned: [{ hero: 'stilts', source: 'yarn' }] }));
    click(el.querySelector('.cst-card[data-hero="duchess"]'));
    expect(el.querySelector('[data-testid="store-togo"]')!.textContent).toContain('3,500 Yarn to go');
    expect(el.querySelector('[data-unlock="yarn"]')).toBeNull();
    click(el.querySelector('[data-a="detail-close"]'));
    click(el.querySelector('.cst-card[data-hero="stilts"]'));
    expect(el.querySelector('.cst-detail [data-unlock], .cst-detail [data-buy]')).toBeNull();
    expect(el.querySelector('.cst-detail')!.textContent).toContain('Owned');
  });

  it('Featured: the week\'s free champions, the bundles, the new ones and the pass; Coats keeps the cosmetics shelf', () => {
    const { el } = open(state());
    click(el.querySelector('.cst-tabs [data-tab="featured"]'));
    expect(el.querySelectorAll('[data-sec="free"] .cst-card')).toHaveLength(6);
    expect(el.querySelectorAll('[data-sec="bundles"] [data-bundle]')).toHaveLength(3);
    expect(el.querySelectorAll('[data-sec="new"] .cst-card')).toHaveLength(3);
    expect(el.querySelector('[data-sec="pass"] [data-tab="pass"]')).not.toBeNull();
    click(el.querySelector('[data-bundle="pl_champs_all_s1"]'));
    expect(el.querySelector('.cst-detail [data-buy="pl_champs_all_s1"]')).not.toBeNull();
    click(el.querySelector('[data-a="detail-close"]'));
    click(el.querySelector('.cst-tabs [data-tab="coats"]'));
    expect(el.querySelectorAll('.cst-card[data-sel]')).toHaveLength(20);
    // Coats / Sets sit in the top bar; Sets keeps the Coats tab lit
    click(el.querySelector('.cst-top [data-tab="sets"]'));
    expect(el.querySelector('.cst-top [data-tab="sets"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.cst-tab.on')!.getAttribute('data-tab')).toBe('coats');
  });

  it('every tab is one vertical grid of the same cards (no sideways shelf, no old preview and buy bar)', () => {
    const { el } = open(state());
    for (const [tab, n] of [['champions', 20], ['featured', 13], ['coats', 20], ['frames', 4]] as const) {
      click(el.querySelector(`.cst-tabs [data-tab="${tab}"]`));
      const grids = el.querySelectorAll('[data-scroll]');
      expect(grids, tab).toHaveLength(1);
      expect(grids[0].getAttribute('data-scroll')).toBe('grid');
      expect(el.querySelectorAll('[data-scroll="grid"] .cst-card').length, tab).toBe(n);
      expect(el.querySelector('.shop-preview, .shop-bar, .shop-grid, .cst-strip'), tab).toBeNull();
    }
    click(el.querySelector('.cst-tabs [data-tab="coats"]'));
    click(el.querySelector('.cst-top [data-tab="sets"]'));
    expect(el.querySelectorAll('[data-scroll="grid"] .cst-card.cst-cos[data-tier="bundle"]')).toHaveLength(2);
  });

  it('coat cards: the coat on its hero, the rung and price; a tap opens the detail with Buy; the grid keeps its scroll', () => {
    const looks: string[] = [];
    const warmed: number[] = [];
    const { el, checkout } = open(state(), {
      preview: (h, c) => (looks.push(`${h}:${c}`), `data:image/png;base64,${h}`),
      warm: (l) => void warmed.push(l.length),
    });
    click(el.querySelector('.cst-tabs [data-tab="coats"]'));
    expect(warmed).toEqual([20]); // one bake pass for the whole grid
    const legendary = el.querySelector('.cst-card[data-sel="pl_coat_brutus_thunderpaw"]')!;
    expect(legendary.getAttribute('data-rung')).toBe('LEGENDARY');
    expect(legendary.textContent).toMatch(/Legendary · (\$|€)14\.99/);
    expect((legendary.querySelector('img.cst-pic') as HTMLImageElement).getAttribute('src')).toContain('brutus');
    expect(looks).toContain('brutus:coat.brutus.store_thunderpaw');
    click(el.querySelector('.cst-card[data-sel="pl_coat_clem_calico"]'));
    const d = el.querySelector('.cst-detail')!;
    expect(d.textContent).toContain('Calico');
    click(d.querySelector('[data-buy="pl_coat_clem_calico"]'));
    expect(checkout.bought).toEqual(['pl_coat_clem_calico']);
    click(el.querySelector('[data-a="detail-close"]'));
    expect(el.querySelector('.cst-detail')).toBeNull();
    expect(document.activeElement?.getAttribute('data-sel')).toBe('pl_coat_clem_calico');
  });

  it('with ready(): the coat grid draws the splash first, then bakes two portraits per frame and swaps them in', async () => {
    vi.useFakeTimers();
    try {
      const baked = new Set<string>();
      const batches: number[] = [];
      const { el } = open(state(), {
        ready: (h, c) => (baked.has(`${c}`) ? `data:image/png;base64,${h}` : null),
        warm: (l) => {
          batches.push(l.length);
          for (const [, c] of l) baked.add(`${c}`);
        },
        tab: 'coats',
      });
      expect(el.querySelectorAll('img.cst-pic')).toHaveLength(0);
      expect(el.querySelectorAll('img[data-coat]')).toHaveLength(20);
      await vi.advanceTimersByTimeAsync(2000);
      expect(Math.max(...batches)).toBeLessThanOrEqual(2);
      expect(batches.reduce((a, b) => a + b, 0)).toBe(20);
      expect(el.querySelectorAll('img.cst-pic')).toHaveLength(20);
      expect(el.querySelectorAll('img[data-coat]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('owned and equipped: Owned · Equip, then Equipped after the equip; frames show the ring and their title', () => {
    const worn = new Set<string>();
    const equips: string[] = [];
    const checkout = fakeCheckout();
    const s = { ...snap(state()), items: new Set(['coat.clem.store_calico', 'frame.store.moonlit', 'title.store.moonlit']) } as StoreSnapshot;
    const p = storePanel(document.body, {
      snapshot: () => s,
      checkout,
      onClose: () => undefined,
      equipped: () => worn,
      onEquip: (def) => {
        equips.push(def.sku);
        for (const i of def.items) worn.add(i);
      },
      tab: 'coats',
    });
    const el = p.el;
    const card = (sku: string) => el.querySelector(`.cst-card[data-sel="${sku}"]`)!;
    expect(card('pl_coat_clem_calico').className).toContain('st-owned');
    expect(card('pl_coat_clem_calico').textContent).toContain('Owned');
    click(card('pl_coat_clem_calico'));
    expect(el.querySelector('.cst-detail [data-buy]')).toBeNull();
    click(el.querySelector('.cst-detail [data-equip="pl_coat_clem_calico"]'));
    expect(equips).toEqual(['pl_coat_clem_calico']);
    expect(el.querySelector('.cst-detail [data-equip]')!.textContent).toContain('Equipped');
    click(el.querySelector('[data-a="detail-close"]'));
    expect(card('pl_coat_clem_calico').className).toContain('st-equipped');
    click(el.querySelector('.cst-tabs [data-tab="frames"]'));
    const moon = card('pl_frame_moonlit');
    expect(moon.querySelector('.cst-frameart[data-frame="frame.store.moonlit"] .cst-ring')).not.toBeNull();
    expect(moon.querySelector('.cst-plate')!.textContent).toBe('Night Prowler');
    expect(moon.textContent).toContain('Owned');
    expect(card('pl_frame_goldpaw').textContent).toMatch(/(\$|€)1\.99/);
  });

  it('app build: Featured and Champions only, no price, no buy, no bundle, no pass; Yarn unlocks still work', () => {
    const c = state({ yarn: { balance: 9000, matches: 90, picksLeft: 0, nextPickAt: null } });
    const { el, unlocks } = open(c, {}, true);
    expect([...el.querySelectorAll('.cst-tabs [data-tab]')].map((b) => b.getAttribute('data-tab'))).toEqual(['featured', 'champions']);
    expect(el.textContent).not.toMatch(/\$|€|Buy|web/);
    click(el.querySelector('.cst-card[data-hero="duchess"]'));
    expect(el.querySelector('[data-buy]')).toBeNull();
    expect(el.textContent).not.toMatch(/\$|€|Buy|web/);
    click(el.querySelector('[data-unlock="yarn"]'));
    expect(unlocks).toEqual(['duchess:yarn']);
    click(el.querySelector('[data-a="detail-close"]'));
    click(el.querySelector('.cst-tabs [data-tab="featured"]'));
    expect(el.querySelector('[data-bundle], [data-sec="pass"]')).toBeNull();
    expect(el.textContent).not.toMatch(/\$|€|Buy|web/);
  });
});

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Analytics, cleanProps, posthogBodies } from '../../src/analytics/posthog';
import { HumanFilter, isHeadlessAgent } from '../../src/analytics/human';
import { parseRoster, rosterCosmetics, stableIndex } from '../../src/meta/roster';
import { CheckoutBridge } from '../../src/money/checkoutBridge';
import { Entitlements, decodeToken } from '../../src/money/entitlements';
import { FOUNDER_GAP_MS, STARTER_WINDOW_MS, markShown, offerOf, pickOffer, type OfferInput } from '../../src/money/offer';
import { SKUS, SKU_IDS, buyable, currencyFor, priceText, type SkuId } from '../../src/money/skus';
import { bestFrame, resolveLook, wardrobe, type Owned } from '../../src/render/cosmetics';
import { heroBuilt, makeKitten } from '../../src/render/chars';
import type { HostMessage } from '../../src/embed/bridge';

const b64url = (s: string): string => Buffer.from(s).toString('base64url');
const token = (payload: object): string => `${b64url(JSON.stringify(payload))}.${'s'.repeat(43)}`;
const FUTURE = Date.now() + 3600_000;

describe('SKU display mirror', () => {
  it('matches the backend table (ids, prices, items)', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/src/pawlegends/pawlegends.contracts.ts'), 'utf8');
    for (const id of SKU_IDS) {
      const block = src.slice(src.indexOf(`${id}: {`));
      const cents = /cents: \{ usd: (\d+), eur: (\d+) \}/.exec(block);
      expect(cents, id).not.toBeNull();
      expect(SKUS[id].cents).toEqual({ usd: Number(cents![1]), eur: Number(cents![2]) });
    }
    for (const item of ['skin.clem.pink_bow', 'emote.starter', 'coat.founder.clem', 'frame.founder', 'title.founder', 'skin.clem.dawnblade', 'frame.legend']) {
      expect(src).toContain(`'${item}'`);
    }
  });
  it('formats prices and picks the currency from the time zone', () => {
    expect(priceText('pl_starter', 'usd')).toBe('$0.99');
    expect(priceText('pl_founder_legend', 'eur')).toBe('€29.99');
    expect(currencyFor('Europe/Vilnius')).toBe('eur');
    expect(currencyFor('America/New_York')).toBe('usd');
    expect(currencyFor(undefined)).toBe('usd');
  });
  it('offers the upgrade instead of Founder Legend to Founder owners', () => {
    expect(buyable(new Set())).toEqual(['pl_starter', 'pl_founder', 'pl_founder_legend']);
    expect(buyable(new Set<SkuId>(['pl_founder']))).toEqual(['pl_starter', 'pl_founder_legend_upgrade']);
    expect(buyable(new Set<SkuId>(['pl_starter', 'pl_founder_legend']))).toEqual([]);
  });
});

describe('entitlement token', () => {
  it('reads known items only and refuses junk or expired tokens', () => {
    const t = token({ items: ['skin.clem.pink_bow', 'evil.item', 3], skus: ['pl_starter', 'pl_free'], expiresAt: FUTURE });
    expect(decodeToken(t)).toEqual({ items: ['skin.clem.pink_bow'], skus: ['pl_starter'], expiresAt: FUTURE });
    expect(decodeToken(token({ items: [], skus: [], expiresAt: 1 }))).toBeNull();
    expect(decodeToken('nope')).toBeNull();
    expect(decodeToken(`${b64url('{bad')}.${'s'.repeat(20)}`)).toBeNull();
    expect(decodeToken(null)).toBeNull();
  });
  it('hides the store and purchased items in app builds and without a ready store', () => {
    const e = new Entitlements();
    expect(e.snapshot().storeOpen).toBe(false);
    e.apply({ type: 'entitlements', token: token({ items: ['frame.founder'], skus: ['pl_founder'], expiresAt: FUTURE }) });
    e.apply({ type: 'app', isApp: false });
    expect(e.snapshot()).toMatchObject({ embedded: true, storeOpen: false });
    expect([...e.snapshot().items]).toEqual(['frame.founder']);
    e.apply({ type: 'app', isApp: false, store: true });
    expect(e.snapshot().storeOpen).toBe(true);
    e.apply({ type: 'app', isApp: true, store: true, notify: true });
    expect(e.snapshot()).toMatchObject({ isApp: true, storeOpen: false, notifyOpen: false });
    expect(e.snapshot().items.size).toBe(0);
  });
});

function fakeBridge() {
  const posted: { type: string; payload?: Record<string, unknown> }[] = [];
  const handlers: ((m: HostMessage) => void)[] = [];
  return {
    posted,
    post: (type: string, payload?: Record<string, unknown>) => (posted.push({ type, payload }), true),
    on: (h: (m: HostMessage) => void) => void handlers.push(h),
    emit: (m: HostMessage) => handlers.forEach((h) => h(m)),
  };
}

describe('checkout bridge', () => {
  it('asks the host only when the store is open and the SKU is buyable', () => {
    const br = fakeBridge();
    const ent = new Entitlements();
    let now = 0;
    const co = new CheckoutBridge(br as never, ent, () => now);
    expect(co.buy('pl_starter')).toBe(false);
    ent.apply({ type: 'app', isApp: false, store: true });
    expect(co.buy('pl_founder_legend_upgrade')).toBe(false);
    expect(co.buy('pl_starter')).toBe(true);
    expect(br.posted).toEqual([{ type: 'purchase-intent', payload: { sku: 'pl_starter' } }]);
    expect(co.buy('pl_founder')).toBe(false); // one at a time
    const results: [string, boolean][] = [];
    co.onResult((s, ok) => results.push([s, ok]));
    br.emit({ type: 'purchase-result', sku: 'pl_starter', ok: true });
    expect(results).toEqual([['pl_starter', true]]);
    expect(co.waiting()).toBeNull();
    ent.apply({ type: 'entitlements', token: token({ items: [], skus: ['pl_starter'], expiresAt: FUTURE }) });
    expect(co.buy('pl_starter')).toBe(false);
    expect(co.buy('pl_founder')).toBe(true);
    now = 10_000;
    expect(co.waiting()).toBeNull();
  });
});

describe('offer rules (POC.md §8.4)', () => {
  const base = (o: Partial<OfferInput> = {}): OfferInput => ({
    session: 2,
    matches: 1,
    firstWin: true,
    store: { storeOpen: true, isApp: false, skus: new Set() },
    history: {},
    screen: 'lobby',
    shownThisSession: false,
    now: 1_000_000_000,
    ...o,
  });
  it('never in session 1, app builds, pick or match, or twice in a session', () => {
    expect(pickOffer(base({ session: 1 }))).toBeNull();
    expect(pickOffer(base({ store: { storeOpen: false, isApp: true, skus: new Set() } }))).toBeNull();
    expect(pickOffer(base({ screen: 'pick' }))).toBeNull();
    expect(pickOffer(base({ screen: 'match' }))).toBeNull();
    expect(pickOffer(base({ shownThisSession: true }))).toBeNull();
  });
  it('rule 1: starter with a genuine 48 h window', () => {
    const o = pickOffer(base());
    expect(o).toMatchObject({ kind: 'starter', skus: ['pl_starter'], endsAt: 1_000_000_000 + STARTER_WINDOW_MS });
    const h = markShown({}, o!, 1_000_000_000);
    expect(pickOffer(base({ history: h, now: 1_000_000_000 + STARTER_WINDOW_MS - 1 }))?.kind).toBe('starter');
    expect(pickOffer(base({ history: h, now: 1_000_000_000 + STARTER_WINDOW_MS }))).toBeNull();
    expect(pickOffer(base({ store: { storeOpen: true, isApp: false, skus: new Set(['pl_starter']) } }))).toBeNull();
  });
  it('rule 2: founder pair after 3 matches, at most every 7 days', () => {
    const o = pickOffer(base({ firstWin: false, matches: 3 }));
    expect(o).toMatchObject({ kind: 'founder', skus: ['pl_founder', 'pl_founder_legend'] });
    const h = markShown({}, o!, 5);
    expect(pickOffer(base({ firstWin: false, matches: 4, history: h, now: 5 + FOUNDER_GAP_MS - 1 }))).toBeNull();
    expect(pickOffer(base({ firstWin: false, matches: 4, history: h, now: 5 + FOUNDER_GAP_MS }))?.kind).toBe('founder');
    expect(pickOffer(base({ firstWin: false, matches: 2 }))).toBeNull();
  });
  it('a host answer picks the card, the never rules still hold', () => {
    expect(pickOffer(base({ hostOffer: null }))).toBeNull();
    expect(pickOffer(base({ firstWin: false, hostOffer: offerOf({ kind: 'founder' }) }))?.kind).toBe('founder');
    expect(pickOffer(base({ session: 1, hostOffer: offerOf({ kind: 'founder' }) }))).toBeNull();
    expect(offerOf({ kind: 'x' })).toBeUndefined();
  });
});

describe('roster → cosmetics', () => {
  const cats = parseRoster([
    { id: 'c1', name: 'Mochi <b>', type: 'FIRE', tier: 'EPIC', isStarter: true, starterBreed: 'PINKIE', origin: 'starter' },
    { id: 'c2', name: 'Biscuit', type: 'STELLAR', tier: 'RARE', isStarter: false, origin: 'pack' },
    { id: 'c2', name: 'dupe', type: 'FIRE', tier: 'RARE', isStarter: false },
    { id: 'bad id!', name: 'x', type: 'FIRE', tier: 'RARE' },
    { id: 'c3', name: 'x', type: 'PLASMA', tier: 'RARE' },
    { id: 'c4', name: 'Legend', type: 'ICE', tier: 'LEGENDARY', isStarter: false },
    'junk',
  ]);
  it('keeps valid cats only, with clean names', () => {
    expect(cats.map((c) => c.id)).toEqual(['c1', 'c2', 'c4']);
    expect(cats[0].name).toBe('Mochi b');
  });
  it('maps elements to chromas, tiers to frames, starters to breed coats, the first two to kittens', () => {
    const r = rosterCosmetics(cats);
    expect(r.chromas).toEqual(['ICE', 'FIRE', 'STELLAR']);
    expect(r.frames).toEqual(['frame.rare', 'frame.epic', 'frame.legendary']);
    expect(r.breedCoats).toEqual(['PINKIE']);
    expect(r.companions.map((c) => [c.id, c.coat])).toEqual([
      ['c1', 'PINKIE'],
      ['c2', stableIndex('c2', 8)],
    ]);
    expect(stableIndex('c2', 8)).toBe(stableIndex('c2', 8));
  });
  it('resolves looks and frames from everything owned', () => {
    const owned: Owned = { items: new Set(['skin.clem.pink_bow', 'coat.founder.clem', 'frame.founder']), unlocks: new Set(['coat.brutus.biscuit']), roster: rosterCosmetics(cats) };
    expect(wardrobe('clem', owned).map((c) => c.id)).toEqual([null, 'skin.clem.pink_bow', 'coat.founder.clem', 'coat.breed.PINKIE']);
    expect(wardrobe('brutus', owned).map((c) => c.id)).toEqual([null, 'coat.brutus.biscuit']);
    expect(resolveLook('clem', owned)).toEqual({ coat: 'skin.clem.pink_bow', chroma: 'ICE' });
    expect(resolveLook('clem', owned, { coat: 'coat.breed.PINKIE', chroma: null })).toEqual({ coat: 'coat.breed.PINKIE', chroma: null });
    expect(resolveLook('clem', owned, { coat: 'skin.clem.dawnblade' }).coat).toBe('skin.clem.pink_bow');
    expect(bestFrame(owned)).toBe('frame.founder');
    expect(bestFrame({ ...owned, items: new Set() })).toBe('frame.legendary');
  });
  it('dressed heroes are still one merged geometry with more parts', () => {
    const plain = heroBuilt('clem', 0).geometry.getAttribute('position').count;
    const dressed = heroBuilt('clem', 0, { coat: 'skin.clem.dawnblade', chroma: 'FIRE' }).geometry.getAttribute('position').count;
    expect(dressed).toBeGreaterThan(plain);
    // a Companion Kitten is one skinned mesh on its own skeleton
    const k = makeKitten({ base: 1, light: 2, dark: 3, accent: 4 }, 0xff0000);
    expect(k.mesh.isSkinnedMesh).toBe(true);
    expect(k.mesh.geometry.getAttribute('skinIndex')).toBeTruthy();
    k.dispose();
  });
});

describe('analytics (POC.md §13)', () => {
  const kv = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it('sends nothing without consent, flushes after it, drops the queue on denial', () => {
    const calls: string[] = [];
    const store = kv();
    const a = new Analytics({ key: 'phc_test', fetch: async (_u, init) => void calls.push(String(init.body)), kv: store, setTimer: () => 0 });
    a.track('match_start', { hero: 'clem', email: 'x@y.z' as unknown as string });
    expect(calls).toHaveLength(0);
    a.setConsent(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('"match_start"');
    expect(store.m.get('tt-analytics-consent')).toBe('granted');
    a.setConsent(false);
    a.track('title_view');
    expect(a.pending()).toHaveLength(0);
  });
  it('is inert without a key', () => {
    const a = new Analytics({ key: '', fetch: async () => undefined, kv: kv() });
    expect(a.configured).toBe(false);
    a.setConsent(true);
    a.track('title_view');
    expect(a.sent).toBe(0);
  });
  it('cleans props and splits bodies', () => {
    expect(cleanProps({ ok: 1, Bad: 2, nested: { a: 1 }, s: 'x'.repeat(100) })).toEqual({ ok: 1, s: 'x'.repeat(64) });
    const bodies = posthogBodies('k', 'id', Array.from({ length: 3 }, () => ({ event: 'title_view' as const, props: {}, at: 0 })));
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]).batch).toHaveLength(3);
  });
  it('human filter: 20 real inputs, a 60 s match, not headless', () => {
    expect(isHeadlessAgent('Mozilla/5.0 HeadlessChrome/140', false)).toBe(true);
    expect(isHeadlessAgent('Mozilla/5.0 Chrome/140', true)).toBe(true);
    const h = new HumanFilter('Mozilla/5.0 Safari/605', false);
    h.input(20);
    expect(h.human).toBe(false);
    h.match(61);
    expect(h.human).toBe(true);
  });
});

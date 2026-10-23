// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Analytics, askConsent, cleanProps, posthogBodies } from '../../src/analytics/posthog';
import { HumanFilter, isHeadlessAgent } from '../../src/analytics/human';
import { parseRoster, rosterCosmetics, stableIndex } from '../../src/meta/roster';
import { CheckoutBridge } from '../../src/money/checkoutBridge';
import { Entitlements, decodeToken } from '../../src/money/entitlements';
import { MEET_SNOOZE, offerOf, pickMeet, pickOffer, type MeetInput } from '../../src/money/offer';
import { playSession } from '../../src/meta/profile';
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
  it('retires the pl_* store, opens the cat checkout on the web only, keeps restored items', () => {
    const e = new Entitlements();
    expect(e.snapshot()).toMatchObject({ storeOpen: false, catCheckout: false });
    e.apply({ type: 'entitlements', token: token({ items: ['frame.founder'], skus: ['pl_founder'], expiresAt: FUTURE }) });
    e.apply({ type: 'app', isApp: false });
    expect(e.snapshot()).toMatchObject({ embedded: true, storeOpen: false, catCheckout: false });
    expect([...e.snapshot().items]).toEqual(['frame.founder']);
    e.apply({ type: 'app', isApp: false, store: true });
    expect(e.snapshot()).toMatchObject({ storeOpen: false, catCheckout: true });
    e.apply({ type: 'app', isApp: true, store: true, notify: true });
    expect(e.snapshot()).toMatchObject({ isApp: true, storeOpen: false, catCheckout: false, notifyOpen: false });
    expect(e.snapshot().items.size).toBe(0);
    // the new message types are not entitlement state
    expect(e.apply({ type: 'featured', cats: [] })).toBe(false);
    expect(e.apply({ type: 'save-result', matchId: 'a', status: 'saved' })).toBe(false);
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

const CAT_A = '65a1b2c3d4e5f6a7b8c9d0e1';
const CAT_B = '65a1b2c3d4e5f6a7b8c9d0e2';

describe('checkout bridge (open-cat)', () => {
  it('asks the host only for a featured cat with the checkout open, one at a time; never purchase-intent', () => {
    const br = fakeBridge();
    const ent = new Entitlements();
    let now = 0;
    const co = new CheckoutBridge(br as never, ent, () => now);
    expect(co.openCat(CAT_A, [CAT_A])).toBe(false); // no host checkout yet
    ent.apply({ type: 'app', isApp: false, store: true });
    expect(co.openCat(CAT_A, [CAT_B])).toBe(false); // not featured
    expect(co.openCat('../packs', ['../packs'])).toBe(false); // not a catalog id
    expect(co.buy('pl_starter')).toBe(false); // retired
    expect(co.openCat(CAT_A, [CAT_A, CAT_B])).toBe(true);
    expect(br.posted).toEqual([{ type: 'open-cat', payload: { catalogId: CAT_A } }]);
    expect(co.openCat(CAT_B, [CAT_A, CAT_B])).toBe(false); // one at a time
    const results: [string, boolean][] = [];
    co.onCatResult((c, ok) => results.push([c, ok]));
    br.emit({ type: 'purchase-result', sku: 'pl_starter', ok: true }); // the retired shape is ignored
    br.emit({ type: 'purchase-result', catalogId: CAT_A, ok: true });
    expect(results).toEqual([[CAT_A, true]]);
    expect(co.waiting()).toBeNull();
    expect(co.openCat(CAT_B, [CAT_B])).toBe(true);
    now = 10_000;
    expect(co.waiting()).toBeNull();
    ent.apply({ type: 'app', isApp: true, store: true });
    expect(co.openCat(CAT_B, [CAT_B])).toBe(false); // app builds: never
    expect(br.posted.some((m) => m.type === 'purchase-intent')).toBe(false);
  });
});

describe('offer rules: the single Meet card', () => {
  const base = (o: Partial<MeetInput> = {}): MeetInput => ({
    session: 2,
    screen: 'lobby',
    store: { catCheckout: true, isApp: false },
    shownThisSession: false,
    hostOffer: { kind: 'meet', catalogId: CAT_A },
    featured: [CAT_A, CAT_B],
    owned: [],
    ...o,
  });
  it('shows the host Meet offer on lobby or results from session 2', () => {
    expect(pickMeet(base())).toEqual({ kind: 'meet', catalogId: CAT_A });
    expect(pickMeet(base({ screen: 'results' }))).toEqual({ kind: 'meet', catalogId: CAT_A });
  });
  it('never in session 1, app builds, without the checkout, on pick/match/loading, twice, or without a host answer', () => {
    expect(pickMeet(base({ session: 1 }))).toBeNull();
    expect(pickMeet(base({ store: { catCheckout: true, isApp: true } }))).toBeNull();
    expect(pickMeet(base({ store: { catCheckout: false, isApp: false } }))).toBeNull();
    for (const screen of ['pick', 'match', 'loading'] as const) expect(pickMeet(base({ screen }))).toBeNull();
    expect(pickMeet(base({ shownThisSession: true }))).toBeNull();
    expect(pickMeet(base({ hostOffer: undefined }))).toBeNull();
    expect(pickMeet(base({ hostOffer: null }))).toBeNull();
  });
  it('round 2: a closed card stays away for MEET_SNOOZE (sessions and time)', () => {
    const closed = { id: CAT_A, session: 4, at: 1_000 };
    expect(pickMeet(base({ closed, pageSession: 5, now: 1_000 + MEET_SNOOZE.ms }))).toBeNull();
    expect(pickMeet(base({ closed, pageSession: 4 + MEET_SNOOZE.sessions + 1, now: 2_000 }))).toBeNull();
    expect(pickMeet(base({ closed, pageSession: 4 + MEET_SNOOZE.sessions + 1, now: 1_000 + MEET_SNOOZE.ms }))).toEqual({ kind: 'meet', catalogId: CAT_A });
    expect(pickMeet(base({ closed: { ...closed, id: CAT_B }, pageSession: 5, now: 2_000 }))).toEqual({ kind: 'meet', catalogId: CAT_A });
  });
  it('round 2: sessions count from the first finished match, not page loads', () => {
    // four page loads, no match: never "session 2"
    expect(playSession({ sessions: 4, firstPlaySession: 0, matches: 0 })).toBe(0);
    expect(pickMeet(base({ session: playSession({ sessions: 4, firstPlaySession: 0, matches: 0 }) }))).toBeNull();
    // first match in page load 3: that load is play session 1, the next one is 2
    expect(playSession({ sessions: 3, firstPlaySession: 3, matches: 1 })).toBe(1);
    expect(playSession({ sessions: 4, firstPlaySession: 3, matches: 1 })).toBe(2);
    // older profiles without the field
    expect(playSession({ sessions: 2, firstPlaySession: 0, matches: 1 })).toBe(2);
  });
  it('never a cat the host did not feature or the player owns', () => {
    expect(pickMeet(base({ featured: [CAT_B] }))).toBeNull();
    expect(pickMeet(base({ owned: [CAT_A] }))).toBeNull();
  });
  it('the retired starter/founder engine never produces a card', () => {
    const legacy = { session: 5, matches: 9, firstWin: true, store: { storeOpen: true, isApp: false, skus: new Set<SkuId>() }, history: {}, screen: 'lobby' as const, shownThisSession: false, now: 1 };
    expect(pickOffer(legacy)).toBeNull();
    expect(pickOffer({ ...legacy, hostOffer: { kind: 'founder', skus: ['pl_founder'], endsAt: null } })).toBeNull();
    expect(offerOf({ kind: 'starter' })).toBeNull();
    expect(offerOf({ kind: 'meet', catalogId: CAT_A })).toBeNull();
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
    // c2 is RARE but from a pack: no Rare frame (decision #19); c4 is one named cat: the Buddy frame
    expect(r.frames).toEqual(['frame.buddy', 'frame.epic', 'frame.legendary']);
    expect(r.breedCoats).toEqual(['PINKIE']);
    // round 1: with no saved choice the highest tier walks first (c4 LEGENDARY), then c1 (EPIC, the starter)
    expect(r.companions.map((c) => [c.id, c.coat])).toEqual([
      ['c4', stableIndex('c4', 8)],
      ['c1', 'PINKIE'],
    ]);
    expect(stableIndex('c2', 8)).toBe(stableIndex('c2', 8));
  });
  it('resolves looks and frames from everything owned', () => {
    const owned: Owned = { items: new Set(['skin.clem.pink_bow', 'coat.founder.clem', 'frame.founder']), unlocks: new Set(['coat.brutus.biscuit']), roster: rosterCosmetics(cats) };
    expect(wardrobe('clem', owned).map((c) => c.id)).toEqual([null, 'skin.clem.pink_bow', 'coat.founder.clem', 'coat.breed.PINKIE']);
    expect(wardrobe('brutus', owned).map((c) => c.id)).toEqual([null, 'coat.brutus.biscuit']);
    // round 0: the default chroma is the first squad mate's element, not the first in ELEMENTS order
    expect(resolveLook('clem', owned)).toEqual({ coat: 'skin.clem.pink_bow', chroma: owned.roster.companions[0].element });
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
  it('asks for consent standalone from the second session, never embedded (PUB-02: the host decides there)', () => {
    const o = { configured: true, consent: 'unset' as const, embedded: false, sessionNo: 2 };
    expect(askConsent(o)).toBe(true);
    expect(askConsent({ ...o, sessionNo: 1 })).toBe(false);
    expect(askConsent({ ...o, embedded: true })).toBe(false);
    expect(askConsent({ ...o, embedded: true, sessionNo: 5 })).toBe(false);
    expect(askConsent({ ...o, configured: false })).toBe(false);
    expect(askConsent({ ...o, consent: 'granted' })).toBe(false);
    expect(askConsent({ ...o, consent: 'denied' })).toBe(false);
  });
  it('embedded, relays every event to the host without a key or a yes, holds them until the host can take them (PUB-02)', () => {
    const relayed: [string, Record<string, unknown>][] = [];
    const fetched: string[] = [];
    let hostReady = false;
    const a = new Analytics({
      key: null,
      fetch: async (_u, init) => void fetched.push(String(init.body)),
      kv: kv(),
      setTimer: () => 0,
      common: () => ({ human: true, embed: true }),
      relay: (event, props) => (hostReady ? (relayed.push([event, props]), true) : false),
    });
    expect(a.configured).toBe(true);
    expect(a.relayed).toBe(true);
    expect(a.live).toBe(true);
    a.track('quality_tier', { tier: 'high' });
    a.track('app_error', { msg: 'x' });
    a.track('title_view', { first_time: true, email: { a: 1 } as unknown as string });
    expect(relayed).toHaveLength(0);
    expect(a.pending()).toHaveLength(3);
    hostReady = true;
    a.flush();
    expect(relayed).toEqual([
      ['quality_tier', { human: true, embed: true, tier: 'high' }],
      ['title_view', { human: true, embed: true, first_time: true }],
    ]);
    expect(a.pending()).toHaveLength(0);
    a.track('match_start', { hero: 'clem' });
    expect(relayed).toHaveLength(3);
    expect(fetched).toHaveLength(0);
    // the Settings stats row turned off: nothing more goes to the host
    a.setConsent(false);
    expect(a.live).toBe(false);
    a.track('match_end', { hero: 'clem' });
    a.flush();
    expect(relayed).toHaveLength(3);
    a.setConsent(true);
    a.track('match_end', { hero: 'clem' });
    expect(relayed).toHaveLength(4);
  });
  it('sends events queued before a late yes (the prompt can come after title_view)', () => {
    const calls: string[] = [];
    const a = new Analytics({ key: 'phc_test', fetch: async (_u, init) => void calls.push(String(init.body)), kv: kv(), setTimer: () => 0 });
    a.track('title_view');
    a.track('match_start', { hero: 'clem' });
    expect(calls).toHaveLength(0);
    a.setConsent(true);
    expect(calls.join('')).toContain('"title_view"');
    expect(calls.join('')).toContain('"match_start"');
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

import { describe, expect, it, vi } from 'vitest';
import { BADCAT_SKUS, CAMEO_SHUFFLES, type PaywallContext, type PaywallTrigger } from '../types';
import { getEntitlements, FREE_ENTITLEMENTS, CLUB_ENTITLEMENTS, loadCameos, cameosEnabled } from '../platform';
import { decodeEntitlementToken, ownsCosmetic } from '../platform/entitlements';
import { createMoney, decidePaywall, fnv1a, shuffleFor, offlineBundle, sanitizeApiBase, money } from './index';
import { ALL_ON, fakeFetch, harness, makeToken } from './test-util';

const FUTURE = 1_900_000_000_000;

describe('offline mode', () => {
  it('makes zero network requests without an API URL', async () => {
    const spy = vi.fn();
    const h = harness({ fetch: spy as never }, { apiUrl: null });
    const m = createMoney(h.deps);
    expect(m.online).toBe(false);
    expect(await m.status()).toMatchObject({ enabled: false, checkout: false, cameos: false });
    expect(await m.checkout({ sku: 'club_monthly', meta: { trigger: 'home', from_in_app: false } })).toEqual({ ok: false, error: 'offline' });
    expect(await m.completeCheckout('cs_test_123')).toMatchObject({ ok: false });
    expect(await m.restore('a@b.co')).toMatchObject({ ok: false });
    expect(await m.verifyRestore('abcdefghij')).toBeNull();
    expect(await m.portal()).toEqual({ error: 'offline' });
    expect(await m.redeem({ code: 'GIFT1234', email: 'a@b.co' })).toMatchObject({ ok: false });
    expect(await m.setClubCat('AAAAAAAAAAAAAAAAAA', 'Mochi')).toBe(false);
    expect(await m.uploadFace('cam1', new Blob([new Uint8Array(10)], { type: 'image/png' }))).toBe(false);
    expect(await m.requestCreatorCode('mochi', 'a@b.co')).toMatchObject({ ok: false });
    expect(await m.seen('AAAAAAAAAAAAAAAAAA')).toBeNull();
    const b = await m.cameos(5, { spectators: 4 });
    expect(b.source).toBe('offline');
    expect(await m.refreshEntitlements()).toMatchObject({ club: false });
    expect(spy).not.toHaveBeenCalled();
    expect(h.assigned).toEqual([]);
  });

  it('an invalid API URL is offline too (no game-side switch)', async () => {
    const spy = vi.fn();
    const h = harness({ fetch: spy as never }, { apiUrl: 'http://evil.example' });
    const m = createMoney(h.deps);
    expect(m.online).toBe(false);
    await m.status();
    await m.cameos(1, { spectators: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('the lazy default instance builds without touching the network', async () => {
    expect(typeof money.paywall).toBe('function');
    expect(money.entitlements().club).toBe(false);
  });

  it('api base must be https (http only for localhost)', () => {
    expect(sanitizeApiBase('http://evil.test')).toBeNull();
    expect(sanitizeApiBase('https://api.tokentails.com/')).toBe('https://api.tokentails.com');
    expect(sanitizeApiBase('http://localhost:3005')).toBe('http://localhost:3005');
    expect(sanitizeApiBase('')).toBeNull();
  });
});

describe('status', () => {
  it('is cached per session and sanitised', async () => {
    const f = fakeFetch((p) => (p === '/badcat/status' ? { json: { ...ALL_ON, gifts: 'yes', enabled: true } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    const s1 = await m.status();
    const s2 = await m.status();
    expect(s1).toBe(s2);
    expect(s1.gifts).toBe(false);
    expect(s1.checkout).toBe(true);
    expect(f.calls.filter((c) => c.url.endsWith('/badcat/status'))).toHaveLength(1);
  });
  it('a server that is off answers all false', async () => {
    const f = fakeFetch((p) => (p === '/badcat/status' ? { json: { enabled: false, checkout: true } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    expect((await m.status()).checkout).toBe(false);
  });
});

describe('entitlement cache', () => {
  it('decodes the token payload and trusts it until expiresAt', () => {
    const h = harness();
    const token = makeToken({ club: true, plan: 'annual', expiresAt: FUTURE, maxCats: 5, freezesPerWeek: 3, archiveDays: 9999, seasonTiers: 30, skus: ['cosmetic_bundle', 'collar_pinkpaw'] });
    h.store.set('entitlements', { token });
    const e = getEntitlements(h.store, FUTURE - 1);
    expect(e).toMatchObject({ club: true, plan: 'annual', maxCats: 5, source: 'cache' });
    // bundle -> bandana (collar 5), crown (hat 5); charity collar 2
    expect(e.cosmetics).toEqual([2, 5]);
    expect(ownsCosmetic(e, 'trail', 3)).toBe(true);
    expect(ownsCosmetic(e, 'collar', 1)).toBe(true); // Club collar
    expect(getEntitlements(h.store, FUTURE + 1)).toMatchObject({ club: false, source: 'free' });
    const m = createMoney({ ...h.deps, now: () => FUTURE + 1 });
    expect(m.needsRefresh()).toBe(true);
  });

  it('falls back to FREE on garbage, and the constants keep their shape', () => {
    const h = harness();
    h.store.set('entitlements', { token: '!!!.x' });
    expect(getEntitlements(h.store)).toMatchObject({ club: false, maxCats: 1 });
    expect(decodeEntitlementToken('e30.x')).toBeNull(); // {} has no club flag
    expect(getEntitlements()).toMatchObject({ club: false, maxCats: 1, freezesPerWeek: 1 });
    expect(FREE_ENTITLEMENTS.archiveDays).toBe(14);
    expect(CLUB_ENTITLEMENTS.maxCats).toBe(5);
  });

  it('refreshes via POST /badcat/entitlement {token} and stores the new token', async () => {
    const old = makeToken({ club: true, expiresAt: 1 });
    const fresh = makeToken({ club: true, expiresAt: FUTURE, plan: 'monthly' });
    const f = fakeFetch((p, body) => (p === '/badcat/entitlement' ? { json: { token: fresh, entitlements: { club: true }, echo: body } } : undefined));
    const h = harness({ fetch: f.fetch });
    h.store.set('entitlements', { token: old });
    const m = createMoney(h.deps);
    const e = await m.refreshEntitlements();
    expect(e.club).toBe(true);
    expect(e.plan).toBe('monthly');
    const call = f.calls.find((c) => c.url.endsWith('/badcat/entitlement'))!;
    expect(call.body).toEqual({ token: old });
    expect(m.entitlements().club).toBe(true);
  });
});

describe('checkout', () => {
  it('posts a CheckoutRequest, never sends accesstoken, navigates in the same tab', async () => {
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_a1', sessionId: 'cs_test_a1' } } : undefined));
    const h = harness({ fetch: f.fetch, abArm: () => 'B' }, { inApp: 'tiktok' });
    h.store.set('via', 'mochifan');
    const m = createMoney(h.deps);
    const r = await m.checkout({ sku: 'club_annual', email: ' a@b.co ', catName: 'Mochi', meta: { trigger: 'perfect_crime', from_in_app: false } });
    expect(r).toEqual({ ok: true });
    const call = f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!;
    expect(call.method).toBe('POST');
    expect(call.credentials).toBe('omit');
    for (const c of f.calls) expect(Object.keys(c.headers)).not.toContain('accesstoken');
    expect(call.body).toEqual({
      sku: 'club_annual',
      email: 'a@b.co',
      catName: 'Mochi',
      meta: { trigger: 'perfect_crime', via: 'mochifan', from_in_app: true, ab_arm: 'B', session_index: 3 },
      returnBase: 'https://tokentails.com/badcat',
    });
    expect(h.assigned).toEqual(['https://checkout.stripe.com/c/pay/cs_test_a1']);
    expect(h.events.find((e) => e.e === 'bc_checkout_start')?.p).toEqual({ sku: 'club_annual', price: 39.99, from_in_app: true });
  });

  it('uses the standalone base outside /badcat and refuses non-https checkout URLs', async () => {
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'javascript:alert(1)', sessionId: 'x' } } : undefined));
    const h = harness({ fetch: f.fetch, location: () => ({ origin: 'http://localhost:5174', pathname: '/', assign: (u) => h.assigned.push(u) }), baseUrl: '/' });
    const m = createMoney(h.deps);
    const r = await m.checkout({ sku: 'cameo', catCode: 'AAAAAAAAAAAAAAAAAA', dayNo: 9, meta: { trigger: 'cameo_flow', from_in_app: false } });
    expect(r.ok).toBe(false);
    expect((f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!.body as { returnBase: string }).returnBase).toBe('http://localhost:5174');
    expect(h.assigned).toEqual([]);
  });

  it('gift and brand SKUs need the server to report them ready', async () => {
    const f = fakeFetch((p) => (p === '/badcat/status' ? { json: { ...ALL_ON, gifts: false, brand: false } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    expect(await m.checkout({ sku: 'gift_cameo', meta: { trigger: 'gift_flow', from_in_app: false } })).toEqual({ ok: false, error: 'unavailable' });
    expect(await m.checkout({ sku: 'sponsor_day', dayNo: 3, meta: { trigger: 'brand', from_in_app: false } })).toEqual({ ok: false, error: 'unavailable' });
    expect(f.calls.some((c) => c.url.endsWith('/badcat/checkout'))).toBe(false);
  });

  it('completeCheckout polls while pending, then stores the token and tracks once', async () => {
    const token = makeToken({ club: true, plan: 'monthly', expiresAt: FUTURE });
    let n = 0;
    const f = fakeFetch((p, body) => {
      if (p !== '/badcat/entitlement') return undefined;
      expect(body).toEqual({ sessionId: 'cs_test_42' });
      n++;
      return n < 3 ? { json: { ok: false, pending: true } } : { json: { ok: true, sku: 'club_monthly', token, entitlements: { club: true, plan: 'monthly', expiresAt: FUTURE } } };
    });
    const h = harness({ fetch: f.fetch });
    const m = createMoney(h.deps);
    const c = await m.completeCheckout('cs_test_42');
    expect(c.ok).toBe(true);
    expect(n).toBe(3);
    expect(m.entitlements().club).toBe(true);
    expect(h.events.filter((e) => e.e === 'bc_checkout_complete')).toEqual([
      { e: 'bc_checkout_complete', p: { sku: 'club_monthly', price: 4.99, plan: 'monthly', revenue_bearing: true, from_in_app: false } },
    ]);
    await m.completeCheckout('cs_test_42');
    expect(h.events.filter((e) => e.e === 'bc_checkout_complete')).toHaveLength(1);
  });

  it('completeCheckout gives up after ~20 s of pending', async () => {
    const f = fakeFetch((p) => (p === '/badcat/entitlement' ? { json: { ok: false, pending: true } } : undefined));
    const h = harness({ fetch: f.fetch });
    const t0 = h.clock.t;
    const c = await createMoney(h.deps).completeCheckout('cs_test_slow');
    expect(c).toMatchObject({ ok: false, pending: true });
    expect(h.clock.t - t0).toBeLessThanOrEqual(20000);
    expect(f.calls.filter((x) => x.url.endsWith('/badcat/entitlement')).length).toBeGreaterThan(5);
  });

  it('a scoped token from checkout or redeem never replaces a verified Club token (perks merge)', async () => {
    const verified = makeToken({ club: true, plan: 'annual', expiresAt: FUTURE, email: 'a@ex.com', ev: 1 } as never);
    const scopedGift = makeToken({ club: false, skus: ['gift_club_3m'], expiresAt: FUTURE, email: 'b@ex.com', sids: ['cs_test_gift1'] } as never);
    const scopedCollar = makeToken({ club: false, skus: ['cosmetic_collar'], expiresAt: FUTURE, email: 'b@ex.com', sids: ['cs_test_other'] } as never);
    const f = fakeFetch((p, body) => {
      if (p === '/badcat/entitlement' && (body as { sessionId?: string }).sessionId === 'cs_test_gift1') return { json: { ok: true, sku: 'gift_club_3m', token: scopedGift } };
      if (p === '/badcat/entitlement' && (body as { sessionId?: string }).sessionId === 'cs_test_other') return { json: { ok: true, sku: 'cosmetic_collar', token: scopedCollar } };
      if (p === '/badcat/redeem') return { json: { ok: true, kind: 'cameo', token: scopedGift } };
      return undefined;
    });
    const h = harness({ fetch: f.fetch });
    h.store.set('entitlements', { token: verified, savedAt: h.clock.t });
    const m = createMoney(h.deps);
    expect(m.entitlements().club).toBe(true);
    await m.completeCheckout('cs_test_gift1');
    expect(m.entitlements().club).toBe(true);
    expect(h.store.get<{ token: string; scoped?: string[] }>('entitlements', { token: '' }).token).toBe(verified);
    // A /thanks link someone else sent: their scoped token only adds what it names.
    await m.completeCheckout('cs_test_other');
    const e = m.entitlements();
    expect(e.club).toBe(true);
    expect(e.skus).toContain('cosmetic_collar');
    await m.redeem({ code: 'GIFT-1234', email: 'b@ex.com' });
    expect(m.entitlements().club).toBe(true);
    expect(new Set(h.store.get<{ scoped?: string[] }>('entitlements', {}).scoped)).toEqual(new Set([scopedGift, scopedCollar]));
  });

  it('the Pink Paw collar is tracked as not revenue bearing', async () => {
    const f = fakeFetch((p) => (p === '/badcat/entitlement' ? { json: { ok: true, sku: 'collar_pinkpaw' } } : undefined));
    const h = harness({ fetch: f.fetch });
    await createMoney(h.deps).completeCheckout('cs_test_collar');
    expect(h.events.find((e) => e.e === 'bc_checkout_complete')?.p).toMatchObject({ sku: 'collar_pinkpaw', revenue_bearing: false, plan: 'one_off' });
  });
});

describe('restore, redeem, portal, club cat, face, creator code', () => {
  it('restore + verifyRestore', async () => {
    const token = makeToken({ club: true, expiresAt: FUTURE });
    const f = fakeFetch((p, b) => {
      if (p === '/badcat/restore') return { json: { ok: true, devLink: 'http://localhost:5174/restore?t=abc' } };
      if (p === '/badcat/restore/verify') return (b as { t: string }).t === 'good-token-123' ? { json: { token, entitlements: { club: true } } } : { status: 400, json: { error: 'expired' } };
      return undefined;
    });
    const h = harness({ fetch: f.fetch });
    const m = createMoney(h.deps);
    expect(await m.restore('nope')).toEqual({ ok: false, error: 'email' });
    expect(await m.restore('a@b.co')).toEqual({ ok: true, devLink: 'http://localhost:5174/restore?t=abc' });
    expect(await m.verifyRestore('bad-token-123')).toBeNull();
    expect((await m.verifyRestore('good-token-123'))?.club).toBe(true);
    expect(h.events.filter((e) => e.e === 'bc_restore').map((e) => e.p)).toEqual([{ ok: false }, { ok: true }]);
  });

  it('redeem posts a RedeemRequest and stores the token', async () => {
    const token = makeToken({ club: true, plan: 'gift', expiresAt: FUTURE });
    const f = fakeFetch((p) => (p === '/badcat/redeem' ? { json: { ok: true, kind: 'club', token, entitlements: { club: true } } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    const r = await m.redeem({ code: 'GIFT-1234', email: 'a@b.co', catCode: 'AAAAAAAAAAAAAAAAAA', catName: 'Mochi the magnificent', dayNo: 12 });
    expect(r).toMatchObject({ ok: true, kind: 'club' });
    expect(f.calls.find((c) => c.url.endsWith('/badcat/redeem'))!.body).toEqual({ code: 'GIFT-1234', email: 'a@b.co', catCode: 'AAAAAAAAAAAAAAAAAA', catName: 'Mochi the ma', dayNo: 12 });
    expect(m.entitlements().plan).toBe('gift');
  });

  it('portal, setClubCat and uploadFace need the cached token; face PNG <= 64 KB', async () => {
    const token = makeToken({ club: true, expiresAt: FUTURE });
    const f = fakeFetch((p) => {
      if (p === '/badcat/portal') return { json: { url: 'https://billing.stripe.com/p/session/test_1' } };
      if (p === '/badcat/club/cat') return { json: { ok: true } };
      if (p.startsWith('/badcat/face/')) return { json: { ok: true } };
      if (p === '/badcat/creator-code') return { json: { ok: true } };
      return undefined;
    });
    const h = harness({ fetch: f.fetch });
    const m = createMoney(h.deps);
    expect(await m.portal()).toEqual({ error: 'no_purchase' });
    h.store.set('entitlements', { token });
    expect(await m.portal()).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });
    expect(await m.setClubCat('AAAAAAAAAAAAAAAAAA', 'Mochi')).toBe(true);
    expect(f.calls.find((c) => c.url.endsWith('/badcat/club/cat'))!.body).toEqual({ token, catCode: 'AAAAAAAAAAAAAAAAAA', name: 'Mochi' });
    expect(await m.uploadFace('cam_1', new Blob([new Uint8Array(70 * 1024)], { type: 'image/png' }))).toBe(false);
    expect(await m.uploadFace('cam_1', new Blob([new Uint8Array(10)], { type: 'image/jpeg' }))).toBe(false);
    expect(await m.uploadFace('cam_1', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))).toBe(true);
    const face = f.calls.find((c) => c.url.endsWith('/badcat/face/cam_1'))!;
    expect(face.body).toMatchObject({ token, png: 'iVBORw==' });
    // Same rule as the server (CREATOR_CODE_PATTERN): 6-12 of [a-z0-9_].
    expect(await m.requestCreatorCode('Mochi', 'a@b.co')).toEqual({ ok: false, error: 'code' });
    expect(await m.requestCreatorCode('mochi_cat_long1', 'a@b.co')).toEqual({ ok: false, error: 'code' });
    expect(await m.requestCreatorCode('Mochi_99', 'a@b.co')).toEqual({ ok: true });
    expect(f.calls.find((c) => c.url.endsWith('/badcat/creator-code'))!.body).toEqual({ code: 'mochi_99', email: 'a@b.co' });
    for (const c of f.calls) expect(Object.keys(c.headers)).not.toContain('accesstoken');
  });
});

// ------------------------------------------------------------------------------------------------
// Paywall engine
// ------------------------------------------------------------------------------------------------

const NOV = new Date(2026, 10, 20, 18); // S0
const DEC = new Date(2026, 11, 5, 18); // S1
function ctx(over: Partial<PaywallContext> & { breaksTonight?: boolean } = {}): PaywallContext {
  return {
    trigger: 'post_share',
    sessionIndex: 3,
    shownThisSession: false,
    afterShare: true,
    abArm: 'A',
    club: false,
    now: NOV,
    catName: 'Mochi',
    nextDayLabel: 'Kitchen #19',
    serverCheckout: true,
    ...over,
  };
}

describe('paywall engine', () => {
  const table: [string, Partial<PaywallContext> & { breaksTonight?: boolean }, string | null][] = [
    ['post_share arm A', {}, 'cameo'],
    ['post_share arm B', { abArm: 'B' }, null],
    ['perfect_crime arm B', { trigger: 'perfect_crime', abArm: 'B', stamp: 'perfect' }, 'club'],
    ['perfect_crime arm A', { trigger: 'perfect_crime', abArm: 'A' }, null],
    ['post_share before the share', { afterShare: false }, null],
    ['perfect_crime before the share', { trigger: 'perfect_crime', abArm: 'B', afterShare: false }, null],
    ['session 1', { sessionIndex: 1 }, null],
    ['session 1 catmaker', { trigger: 'catmaker_saved', sessionIndex: 1 }, null],
    ['catmaker session 2', { trigger: 'catmaker_saved', sessionIndex: 2, afterShare: false }, 'club'],
    ['shown this session', { shownThisSession: true }, null],
    ['no server checkout', { serverCheckout: false }, null],
    ['club member', { club: true }, null],
    ['club member archive', { club: true, trigger: 'archive_old' }, null],
    ['streak break, no freeze', { trigger: 'streak_break', streak: 12, freezesLeft: 0, breaksTonight: true }, 'club'],
    ['streak break, freeze left', { trigger: 'streak_break', streak: 12, freezesLeft: 1, breaksTonight: true }, null],
    ['streak break, not tonight', { trigger: 'streak_break', streak: 12, freezesLeft: 0, breaksTonight: false }, null],
    ['archive_old', { trigger: 'archive_old', afterShare: false }, 'club'],
    ['gift_s1 outside S1', { trigger: 'gift_s1' }, null],
    ['gift_s1 in S1', { trigger: 'gift_s1', now: DEC }, 'gift'],
    ['gift_s1 in S1 for club', { trigger: 'gift_s1', now: DEC, club: true }, 'gift'],
    ['S1 even session replaces the Club card', { now: DEC, sessionIndex: 4 }, 'gift'],
    ['S1 odd session keeps the cameo card', { now: DEC, sessionIndex: 3 }, 'cameo'],
    ['S1 even session, arm B', { now: DEC, sessionIndex: 4, trigger: 'perfect_crime', abArm: 'B' }, 'gift'],
  ];
  it.each(table)('%s', (_n, over, want) => {
    const o = decidePaywall(ctx(over));
    expect(o?.offer ?? null).toBe(want);
  });

  it('copy names the cat and the next room', () => {
    const o = decidePaywall(ctx())!;
    expect(o.body).toBe('Put Mochi in Kitchen #19 for everyone: $4.99, or every week with Club.');
    expect(o.secondary?.sku).toBe('club_monthly');
    expect(decidePaywall(ctx({ trigger: 'streak_break', streak: 12, freezesLeft: 0 }))!.body).toBe('Keep the 12-day streak: Club gives 3 Nine Lives a week.');
    expect(decidePaywall(ctx({ trigger: 'perfect_crime', abArm: 'B' }))!.body).toBe('Mochi belongs on the Most Wanted list. Join Club.');
  });

  it('every trigger has an offer with a real SKU', () => {
    for (const t of ['post_share', 'perfect_crime', 'catmaker_saved', 'streak_break', 'archive_old', 'gift_s1'] as PaywallTrigger[]) {
      const o = decidePaywall(ctx({ trigger: t, abArm: t === 'perfect_crime' ? 'B' : 'A', now: t === 'gift_s1' ? DEC : NOV, streak: 3, freezesLeft: 0 }));
      expect(o, t).not.toBeNull();
      expect(BADCAT_SKUS[o!.sku]).toBeDefined();
    }
  });

  it('markPaywallShown persists once per session and tracks bc_paywall_view', () => {
    const h = harness();
    const m = createMoney(h.deps);
    const o = m.paywall(ctx())!;
    m.markPaywallShown(o);
    m.markPaywallShown(o);
    expect(h.events.filter((e) => e.e === 'bc_paywall_view')).toEqual([{ e: 'bc_paywall_view', p: { trigger: 'post_share', offer: 'cameo', ab_arm: 'A', session_index: 3 } }]);
    expect(m.paywall(ctx({ trigger: 'archive_old' }))).toBeNull();
    const next = createMoney({ ...h.deps, sessionId: () => 'sess-2' });
    expect(next.paywall(ctx({ trigger: 'archive_old' }))).not.toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------
// Cameos
// ------------------------------------------------------------------------------------------------

describe('cameos', () => {
  it('shuffle is deterministic and in range', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    for (let d = -3; d < 60; d++) {
      const s = shuffleFor('abc', d);
      expect(s).toBe(shuffleFor('abc', d));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(CAMEO_SHUFFLES);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(shuffleFor(`s${i}`, 7));
    expect(seen.size).toBe(CAMEO_SHUFFLES);
  });

  it('offline bundle = Pink Paw cats, empty fridge', () => {
    const b = offlineBundle(3, 2, 4);
    expect(b).toMatchObject({ dayNo: 3, shuffle: 2, source: 'offline', fridge: [], guestStars: [] });
    expect(b.spectators).toHaveLength(4);
    for (const e of b.spectators) {
      expect(e.kind).toBe('pinkpaw');
      expect(e.catCode).toMatch(/^[A-Za-z0-9_-]{18}$/);
    }
    expect(offlineBundle(3, 2, 0).spectators).toHaveLength(0);
  });

  it('server bundle: one GET per day per session with day and shuffle; seen tracks once', async () => {
    const f = fakeFetch((p) => {
      if (p.startsWith('/badcat/cameos')) return { json: { spectators: [{ id: 'c1', name: 'Mochi', catCode: 'AAAAAAAAAAAAAAAAAA', kind: 'paid', faceUrl: 'javascript:x' }, { id: 'bad' }], fridge: [], guestStars: [] } };
      if (p.startsWith('/badcat/seen')) return { json: { week: 3214, total: 9000 } };
      return undefined;
    });
    const h = harness({ fetch: f.fetch });
    const m = createMoney(h.deps);
    const b = await m.cameos(18, { spectators: 12 });
    await m.cameos(18, { spectators: 12 });
    expect(b.source).toBe('server');
    expect(b.spectators).toEqual([{ id: 'c1', name: 'Mochi', catCode: 'AAAAAAAAAAAAAAAAAA', kind: 'paid', faceUrl: null }]);
    const gets = f.calls.filter((c) => c.url.includes('/badcat/cameos'));
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toBe(`https://api.test/badcat/cameos?day=18&s=${shuffleFor('sess-1', 18)}`);
    expect(await m.seen('AAAAAAAAAAAAAAAAAA')).toEqual({ week: 3214, total: 9000 });
    await m.seen('AAAAAAAAAAAAAAAAAA');
    expect(h.events.filter((e) => e.e === 'bc_cameo_seen')).toEqual([{ e: 'bc_cameo_seen', p: { loads: 3214 } }]);
  });

  it('platform/cameos stays offline and self-contained', async () => {
    expect(cameosEnabled()).toBe(false);
    const list = await loadCameos(2, 3);
    expect(list.length).toBe(3);
    expect(list[0].cat.name.length).toBeGreaterThan(0);
  });
});

describe('never sells power', () => {
  it('the SKU list is exactly the catalogue of identity, spotlight, gifts, brand and charity', () => {
    expect(Object.keys(BADCAT_SKUS).sort()).toEqual(
      [
        'brand_shelf',
        'cameo',
        'club_annual',
        'club_monthly',
        'collar_pinkpaw',
        'cosmetic_bundle',
        'cosmetic_collar',
        'cosmetic_hat',
        'cosmetic_trail',
        // Phase 2 full store (looks only)
        'cosmetic_collar_spiked',
        'cosmetic_hat_wizard',
        'cosmetic_trail_bubbles',
        'cosmetic_stamp_neon',
        'cosmetic_bundle2',
        'founding',
        'gift_cameo',
        'gift_club_3m',
        'guest_star',
        'sponsor_day',
        'sponsor_week',
      ].sort(),
    );
    for (const k of Object.keys(BADCAT_SKUS)) expect(k).not.toMatch(/boost|score|attempt|life|power|watermark|loot|random/i);
  });
});

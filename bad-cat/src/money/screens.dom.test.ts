// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAT, type BadcatServerStatus, type CatSpec, type Entitlements, type PaywallOffer } from '../types';
import { FREE_ENTITLEMENTS } from '../platform';
import { createMoney, OFFLINE_STATUS, upcomingDays, isFriday, type MoneyApiX } from './index';
import { ALL_ON, fakeFetch, harness, makeToken } from './test-util';

const STATUS: BadcatServerStatus = { ...ALL_ON };
const cat: CatSpec = { ...DEFAULT_CAT, name: 'Mochi' };
const free = (): Entitlements => ({ ...FREE_ENTITLEMENTS, skus: [], cosmetics: [] });
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const q = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-bm="${id}"]`);
const click = (host: HTMLElement, id: string) => {
  const el = q(host, id);
  expect(el, id).not.toBeNull();
  el!.click();
};

let host: HTMLElement;
afterEach(() => {
  host?.remove();
});
function setup(online = true, env = {}): { m: MoneyApiX; assigned: string[]; fetchCalls: unknown[] } {
  host = document.createElement('div');
  document.body.appendChild(host);
  const f = fakeFetch((p) => {
    if (p === '/badcat/checkout') return { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_1', sessionId: 'cs_test_1' } };
    return undefined;
  });
  const h = harness({ fetch: f.fetch }, online ? env : { apiUrl: null, ...env });
  const m = createMoney(h.deps);
  return { m, assigned: h.assigned, fetchCalls: f.calls };
}

describe('offline: every mount shows Coming soon and never throws', () => {
  it('all nine screens', () => {
    const { m, fetchCalls } = setup(false);
    const noop = () => undefined;
    const mounts: (() => () => void)[] = [
      () => m.mount.club(host, { trigger: 'home', catName: 'Mochi', entitlements: free(), status: { ...OFFLINE_STATUS }, inApp: false, onClose: noop }),
      () => m.mount.thanks(host, { sessionId: 'cs_test_1', cat, onDone: noop }),
      () => m.mount.redeem(host, { code: 'X', cats: [cat], onDone: noop }),
      () => m.mount.restore(host, { onDone: noop, onBack: noop }),
      () => m.mount.cameo(host, { cat, todayNo: 3, dayLabel: (d) => `Day ${d}`, guestStar: false, status: { ...OFFLINE_STATUS }, onClose: noop }),
      () => m.mount.gift(host, { status: { ...OFFLINE_STATUS }, onClose: noop }),
      () => m.mount.shop(host, { entitlements: free(), status: { ...OFFLINE_STATUS }, onClose: noop }),
      () => m.mount.brand(host, { status: { ...OFFLINE_STATUS }, todayNo: 3, onClose: noop }),
      () => m.mount.offerCard(host, { offer: null as unknown as PaywallOffer, onAccept: noop, onDismiss: noop }),
    ];
    for (const mount of mounts) {
      const un = mount();
      expect(q(host, 'coming-soon')).not.toBeNull();
      expect(host.textContent).toContain('Coming soon');
      un();
      expect(host.children.length).toBe(0);
    }
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('screens online', () => {
  it('Club sheet: lines, toggle, renewal terms, founding badge, checkout on CTA', async () => {
    const { m, assigned } = setup();
    const onClose = vi.fn();
    const un = m.mount.club(host, { trigger: 'perfect_crime', catName: 'Mochi', entitlements: free(), status: STATUS, inApp: false, onClose });
    expect(host.textContent).toContain('Your cat, featured: in other players’ rooms every week.');
    expect(host.textContent).toContain('Keep all your cats: up to 5.');
    expect(host.textContent).toContain('$39.99/yr');
    expect(host.textContent).toContain('$3.33/mo, save 33%');
    expect(q(host, 'founding')?.textContent).toContain('37 of 200');
    expect(host.textContent).toContain('Renews every month until you cancel');
    (host.querySelector('[data-value="club_annual"]') as HTMLElement).click();
    expect(host.textContent).toContain('Renews every year until you cancel');
    expect(q(host, 'safari')).toBeNull();
    click(host, 'checkout');
    await flush();
    expect(assigned).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1']);
    click(host, 'close');
    expect(onClose).toHaveBeenCalled();
    un();
  });

  it('Club sheet sends club_annual to /badcat/checkout', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_9', sessionId: 'cs_test_9' } } : undefined));
    const h = harness({ fetch: f.fetch }, { inApp: 'instagram', isIOS: true });
    const m = createMoney(h.deps);
    m.mount.club(host, { trigger: 'home', catName: 'Mochi', entitlements: free(), status: STATUS, inApp: true, onClose: () => undefined });
    expect(q(host, 'safari')).not.toBeNull();
    (host.querySelector('[data-value="club_annual"]') as HTMLElement).click();
    click(host, 'checkout');
    await flush();
    const call = f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!;
    expect(call.body).toMatchObject({ sku: 'club_annual', catName: 'Mochi', meta: { trigger: 'home', from_in_app: true } });
    expect(h.assigned).toEqual(['https://checkout.stripe.com/c/pay/cs_test_9']);
  });

  it('Club member sees Manage or cancel (portal)', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/portal' ? { json: { url: 'https://billing.stripe.com/p/session/test_2' } } : undefined));
    const h = harness({ fetch: f.fetch });
    h.store.set('entitlements', { token: makeToken({ club: true, expiresAt: 1_900_000_000_000 }) });
    const m = createMoney(h.deps);
    m.mount.club(host, { trigger: 'settings', catName: 'Mochi', entitlements: m.entitlements(), status: STATUS, inApp: false, onClose: () => undefined });
    click(host, 'portal');
    await flush();
    expect(h.assigned).toEqual(['https://billing.stripe.com/p/session/test_2']);
  });

  it('Thanks: pending spinner, then gift link; Done calls onDone', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    let n = 0;
    const f = fakeFetch((p) => (p === '/badcat/entitlement' ? (++n < 2 ? { json: { pending: true } } : { json: { ok: true, sku: 'gift_cameo', gift: { code: 'GIFTCODE1', sku: 'gift_cameo' } } }) : undefined));
    const h = harness({ fetch: f.fetch, sleep: async () => undefined });
    const m = createMoney(h.deps);
    const onDone = vi.fn();
    m.mount.thanks(host, { sessionId: 'cs_test_gift', cat, onDone });
    expect(q(host, 'pending')).not.toBeNull();
    await flush(10);
    expect((q(host, 'gift-link') as HTMLInputElement).value).toBe('https://tokentails.com/badcat/redeem?code=GIFTCODE1');
    click(host, 'done');
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sku: 'gift_cameo' }));
  });

  it('Thanks for a cameo: face upload + weekly Club line', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => {
      if (p === '/badcat/entitlement') return { json: { ok: true, sku: 'cameo', cameoId: 'cam_7', dayNo: 18 } };
      if (p.startsWith('/badcat/face/')) return { json: { ok: true } };
      return undefined;
    });
    const h = harness({ fetch: f.fetch });
    const m = createMoney(h.deps);
    const face = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    m.mount.thanks(host, { sessionId: 'cs_test_cam', cat, onDone: () => undefined, face });
    await flush(10);
    expect(host.textContent).toContain('Mochi is in Day #18');
    expect(q(host, 'club-upsell')?.textContent).toBe('Weekly cameo with Club, $4.99/mo');
    click(host, 'face');
    await flush(10);
    expect(face).toHaveBeenCalled();
    expect(f.calls.some((c) => c.url.endsWith('/badcat/face/cam_7'))).toBe(true);
  });

  it('Redeem: code, email, cat picker -> POST /badcat/redeem', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/redeem' ? { json: { ok: true, kind: 'cameo' } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    const onDone = vi.fn();
    m.mount.redeem(host, { code: 'GIFTCODE1', cats: [cat, { ...cat, name: 'Tofu' }], onDone, todayNo: 5 } as never);
    (q(host, 'email') as HTMLInputElement).value = 'me@cat.co';
    (host.querySelector('[data-bm="cat"] [data-value="1"]') as HTMLElement).click();
    (host.querySelector('[data-bm="day"] [data-value="9"]') as HTMLElement).click();
    click(host, 'redeem');
    await flush();
    expect(f.calls.find((c) => c.url.endsWith('/badcat/redeem'))!.body).toMatchObject({ code: 'GIFTCODE1', email: 'me@cat.co', catName: 'Tofu', dayNo: 9 });
    expect(onDone).toHaveBeenCalled();
  });

  it('Restore: email -> Check your inbox + dev link; ?t= auto-verifies', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const token = makeToken({ club: true, expiresAt: 1_900_000_000_000 });
    const f = fakeFetch((p) => {
      if (p === '/badcat/restore') return { json: { ok: true, devLink: 'http://localhost:5174/restore?t=dev' } };
      if (p === '/badcat/restore/verify') return { json: { token, entitlements: { club: true } } };
      return undefined;
    });
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    const onBack = vi.fn();
    const un = m.mount.restore(host, { onDone: () => undefined, onBack });
    (q(host, 'email') as HTMLInputElement).value = 'me@cat.co';
    click(host, 'restore');
    await flush();
    expect(q(host, 'inbox')?.textContent).toContain('Check your inbox');
    expect(q(host, 'dev-link')).not.toBeNull();
    click(host, 'close');
    expect(onBack).toHaveBeenCalled();
    un();
    const onDone = vi.fn();
    m.mount.restore(host, { token: 'magic-token-1', onDone, onBack });
    await flush();
    click(host, 'done');
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ club: true }));
  });

  it('Cameo flow: 14 days; guest star = Fridays only; checkout with cat + day', async () => {
    expect(upcomingDays(1, 14)).toHaveLength(14);
    expect(upcomingDays(1, 14, true)).toEqual([5, 12]); // Day #1 is Monday Nov 16, 2026
    expect(isFriday(5)).toBe(true);
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_3', sessionId: 'cs_test_3' } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    m.mount.cameo(host, { cat, todayNo: 1, dayLabel: (d) => `Kitchen #${d}`, guestStar: true, status: STATUS, onClose: () => undefined });
    expect(host.querySelectorAll('[data-bm="day"] .bm-opt')).toHaveLength(2);
    (host.querySelector('[data-bm="day"] [data-value="12"]') as HTMLElement).click();
    click(host, 'checkout');
    await flush();
    expect(f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!.body).toMatchObject({ sku: 'guest_star', dayNo: 12, catName: 'Mochi', meta: { trigger: 'cameo_flow' } });
  });

  it('Gift flow: gift Club 3 months', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_4', sessionId: 'cs_test_4' } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    m.mount.gift(host, { status: STATUS, onClose: () => undefined });
    expect(host.textContent).toContain('A cameo, $4.99');
    (host.querySelector('[data-value="gift_club_3m"]') as HTMLElement).click();
    (q(host, 'gift-for') as HTMLInputElement).value = 'Auntie';
    click(host, 'checkout');
    await flush();
    expect(f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!.body).toMatchObject({ sku: 'gift_club_3m', giftFor: 'Auntie', meta: { trigger: 'gift_flow' } });
  });

  it('Shop: 3 items + bundle, the Phase 2 store (4 items + bundle) and the Pink Paw collar; owned is disabled', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_5', sessionId: 'cs_test_5' } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    const e = { ...free(), skus: ['cosmetic_hat'] };
    m.mount.shop(host, { entitlements: e, status: STATUS, onClose: () => undefined });
    expect(host.querySelectorAll('.bm-item')).toHaveLength(10);
    expect(q(host, 'pinkpaw-label')?.textContent).toBe('100% to Pink Paw');
    expect((q(host, 'buy-cosmetic_hat') as HTMLButtonElement).disabled).toBe(true);
    click(host, 'buy-collar_pinkpaw');
    await flush();
    expect(f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!.body).toMatchObject({ sku: 'collar_pinkpaw', meta: { trigger: 'shop' } });
  });

  it('Brand page: needs a brand name, then sponsor_day checkout with the brief', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = fakeFetch((p) => (p === '/badcat/checkout' ? { json: { url: 'https://checkout.stripe.com/c/pay/cs_test_6', sessionId: 'cs_test_6' } } : undefined));
    const m = createMoney(harness({ fetch: f.fetch }).deps);
    m.mount.brand(host, { status: STATUS, todayNo: 1, onClose: () => undefined });
    expect(host.textContent).toContain('Brand Shelf, $199/mo');
    click(host, 'checkout');
    await flush();
    expect(q(host, 'error')?.textContent).toContain('brand name');
    (host.querySelector('[data-value="sponsor_day"]') as HTMLElement).click();
    (q(host, 'brand-name') as HTMLInputElement).value = 'Purrfect Treats';
    (q(host, 'brand-note') as HTMLTextAreaElement).value = 'Crunchy salmon bites';
    click(host, 'checkout');
    await flush();
    expect(f.calls.find((c) => c.url.endsWith('/badcat/checkout'))!.body).toMatchObject({ sku: 'sponsor_day', dayNo: 2, brand: { name: 'Purrfect Treats', note: 'Crunchy salmon bites' }, meta: { trigger: 'brand' } });
  });

  it('Offer card: small, dismissable, marks the paywall shown once, CTA calls onAccept', () => {
    setup();
    const h2 = harness();
    const m2 = createMoney(h2.deps);
    const offer: PaywallOffer = { trigger: 'post_share', offer: 'cameo', sku: 'cameo', title: 'Clip posted.', body: 'Put Mochi in Kitchen #19', cta: 'Cameo, $4.99', secondary: { label: 'Club', sku: 'club_monthly' }, abArm: 'A' };
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    const onSecondary = vi.fn();
    const un = m2.mount.offerCard(host, { offer, onAccept, onDismiss, onSecondary } as never);
    expect(host.querySelector('.bm-offer')).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(h2.events.filter((e) => e.e === 'bc_paywall_view')).toHaveLength(1);
    click(host, 'accept');
    click(host, 'secondary');
    click(host, 'dismiss');
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledWith('club_monthly');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    un();
    expect(host.children.length).toBe(0);
  });
});

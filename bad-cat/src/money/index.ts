/**
 * src/money (W1-MONEY): the client side of every paid feature (GDD 6.5, 8, 9, 10, 14).
 *
 * Online whenever the game has an API origin (VITE_BADCAT_API_URL, else the production API on tokentails.com); each
 * feature then follows the backend's readiness (GET /badcat/status). Without an origin every call answers locally
 * with zero network requests and every screen shows "Coming soon". This module never charges anything itself.
 * Never sells power: no SKU touches the sim, ranked runs or scores.
 */
import type { AnalyticsEvent, AnalyticsProps, Entitlements, EnvInfo, MoneyApi, Store } from '../types';
import { createStore, detectEnv, track as platformTrack } from '../platform';
import { createMoneyCore, type MoneyCore, type MoneyDeps } from './core';
import { mountBrand, mountCameo, mountClub, mountGift, mountOfferCard, mountRedeem, mountRestore, mountShop, mountThanks } from './screens';

export { createApi, sanitizeApiBase, API_TIMEOUT_MS, type ApiClient, type ApiResult, type FetchLike } from './api';
export { decidePaywall, offerFor, seasonAt, inS1, PAYWALL_TRIGGERS, type PaywallCtx } from './paywall';
export { fnv1a, shuffleFor, offlineBundle, sanitizeBundle } from './cameos';
export {
  createMoneyCore,
  OFFLINE_STATUS,
  KEY_PAYWALL,
  KEY_CHECKOUT_PENDING,
  KEY_CHECKOUT_DONE,
  MAX_FACE_BYTES,
  COMPLETE_TIMEOUT_MS,
  priceLabel,
  validEmail,
  safeUrl,
  type MoneyDeps,
  type MoneyCore,
  type LocationLike,
} from './core';
export {
  CLUB_PERKS,
  SHOP_SKUS,
  renewalTerms,
  errorText,
  upcomingDays,
  isFriday,
  weekdayOf,
  type RedeemPropsX,
  type OfferCardPropsX,
  type ThanksPropsX,
} from './screens';

/** MoneyApi plus a few extras the shell may use (all optional for callers that only know MoneyApi). */
export interface MoneyApiX extends MoneyApi {
  /** Same-tab link that reopens the Club sheet in Safari (`<base>/club?sku=`). */
  safariPayLink(sku: Parameters<MoneyCore['safariPayLink']>[0]): string;
  /** The cached token expired: call refreshEntitlements() when online. */
  needsRefresh(): boolean;
  /** True when an API URL is set (the server's per-feature readiness still applies). */
  readonly online: boolean;
  /** Phase 2: caches a token from POST /badcat/account/claim (local only, no request). */
  adoptToken(res: { token?: unknown; entitlements?: Entitlements | null } | null): Entitlements | null;
}

export function createMoney(deps: MoneyDeps): MoneyApiX {
  const core = createMoneyCore(deps);
  return {
    online: core.online,
    status: core.status,
    entitlements: core.entitlements,
    refreshEntitlements: core.refreshEntitlements,
    checkout: core.checkout,
    completeCheckout: core.completeCheckout,
    setClubCat: core.setClubCat,
    restore: core.restore,
    verifyRestore: core.verifyRestore,
    portal: core.portal,
    redeem: core.redeem,
    cameos: core.cameos,
    seen: core.seen,
    uploadFace: core.uploadFace,
    requestCreatorCode: core.requestCreatorCode,
    paywall: core.paywall,
    markPaywallShown: core.markPaywallShown,
    safariPayLink: core.safariPayLink,
    needsRefresh: core.needsRefresh,
    adoptToken: core.adoptToken,
    mount: {
      club: (host, p) => mountClub(core, host, p),
      thanks: (host, p) => mountThanks(core, host, p),
      redeem: (host, p) => mountRedeem(core, host, p),
      restore: (host, p) => mountRestore(core, host, p),
      cameo: (host, p) => mountCameo(core, host, p),
      gift: (host, p) => mountGift(core, host, p),
      shop: (host, p) => mountShop(core, host, p),
      brand: (host, p) => mountBrand(core, host, p),
      offerCard: (host, p) => mountOfferCard(core, host, p),
    },
  };
}

function randomId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint32Array(4)), (n) => n.toString(36)).join('');
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Default dependencies for the browser build (main.ts may pass its own: platform.sessionId / abArm). */
export function defaultMoneyDeps(over: Partial<MoneyDeps> & { env?: EnvInfo; store?: Store } = {}): MoneyDeps {
  const store = over.store ?? createStore();
  const env = over.env ?? detectEnv();
  const sessionId = randomId();
  return {
    env,
    store,
    track: (e: AnalyticsEvent, p?: AnalyticsProps) => platformTrack(e, p),
    sessionId: () => sessionId,
    abArm: () => {
      const p = store.get<{ abArm?: 'A' | 'B' } | null>('profile', null);
      if (p?.abArm === 'A' || p?.abArm === 'B') return p.abArm;
      // Stable per device fallback (the profile owner, W1-PLATFORM, normally sets it).
      let arm = store.get<string | null>('ab_arm', null);
      if (arm !== 'A' && arm !== 'B') {
        arm = (parseInt(randomId().replace(/[^0-9a-f]/gi, '').slice(-1) || '0', 16) & 1) === 0 ? 'A' : 'B';
        store.set('ab_arm', arm);
      }
      return arm as 'A' | 'B';
    },
    now: () => Date.now(),
    baseUrl: (() => {
      try {
        return (import.meta.env?.BASE_URL as string | undefined) ?? '/';
      } catch {
        return '/';
      }
    })(),
    ...over,
  };
}

let lazy: MoneyApiX | null = null;
function instance(): MoneyApiX {
  if (!lazy) lazy = createMoney(defaultMoneyDeps());
  return lazy;
}

/** Lazily built default instance (nothing touches window, storage or the network until first use). */
export const money: MoneyApiX = {
  get online() {
    return instance().online;
  },
  status: () => instance().status(),
  entitlements: () => instance().entitlements(),
  refreshEntitlements: () => instance().refreshEntitlements(),
  checkout: (r) => instance().checkout(r),
  completeCheckout: (s) => instance().completeCheckout(s),
  setClubCat: (c, n) => instance().setClubCat(c, n),
  restore: (e) => instance().restore(e),
  verifyRestore: (t) => instance().verifyRestore(t),
  portal: () => instance().portal(),
  redeem: (r) => instance().redeem(r),
  cameos: (d, s) => instance().cameos(d, s),
  seen: (c) => instance().seen(c),
  uploadFace: (id, b) => instance().uploadFace(id, b),
  requestCreatorCode: (c, e) => instance().requestCreatorCode(c, e),
  paywall: (c) => instance().paywall(c),
  markPaywallShown: (o) => instance().markPaywallShown(o),
  safariPayLink: (s) => instance().safariPayLink(s),
  needsRefresh: () => instance().needsRefresh(),
  adoptToken: (r) => instance().adoptToken(r),
  mount: {
    club: (h, p) => instance().mount.club(h, p),
    thanks: (h, p) => instance().mount.thanks(h, p),
    redeem: (h, p) => instance().mount.redeem(h, p),
    restore: (h, p) => instance().mount.restore(h, p),
    cameo: (h, p) => instance().mount.cameo(h, p),
    gift: (h, p) => instance().mount.gift(h, p),
    shop: (h, p) => instance().mount.shop(h, p),
    brand: (h, p) => instance().mount.brand(h, p),
    offerCard: (h, p) => instance().mount.offerCard(h, p),
  },
};

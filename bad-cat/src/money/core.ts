/**
 * The non-UI half of MoneyApi: status, entitlement cache, checkout, thanks polling, restore, portal, redeem, Club
 * cat, face upload, creator codes, cameos, seen counter and the paywall engine. Never throws; offline (no
 * VITE_BADCAT_API_URL, or VITE_BADCAT_CLUB unset) every call answers locally with zero network requests.
 */
import {
  BADCAT_ROUTES,
  BADCAT_SKUS,
  type AnalyticsEvent,
  type AnalyticsProps,
  type BadcatServerStatus,
  type BadcatSku,
  type CameoBundle,
  type CheckoutCompletion,
  type CheckoutMeta,
  type CheckoutRequest,
  type CheckoutResponse,
  type EntitlementResponse,
  type Entitlements,
  type EnvInfo,
  type PaywallContext,
  type PaywallOffer,
  type RedeemRequest,
  type RedeemResponse,
  type SeenResponse,
  type Store,
} from '../types';
// Own file of this package (W1-MONEY owns platform/entitlements.ts); the helpers are not re-exported by
// platform/index.ts (change request filed), so they are imported directly.
import {
  KEY_ENTITLEMENTS,
  cachedEntitlementToken,
  cachedEntitlementTokens,
  cachedTokenFor,
  entitlementsExpired,
  mergeTokenIntoCache,
  getEntitlements,
  sanitizeEntitlements,
  type CachedEntitlements,
} from '../platform/entitlements';
import { createApi, type ApiClient, type FetchLike } from './api';
import { creatorCode } from '../codec/creator-code';
import { decidePaywall, type PaywallCtx } from './paywall';
import { offlineBundle, sanitizeBundle, shuffleFor } from './cameos';

export const KEY_PAYWALL = 'paywall';
export const KEY_CHECKOUT_PENDING = 'checkout_pending';
export const KEY_CHECKOUT_DONE = 'checkout_done';
export const MAX_FACE_BYTES = 64 * 1024;
export const COMPLETE_TIMEOUT_MS = 20000;
export const COMPLETE_INTERVAL_MS = 1500;

export interface LocationLike {
  origin: string;
  pathname: string;
  assign(url: string): void;
}

export interface MoneyDeps {
  env: EnvInfo;
  store: Store;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
  /** Random id per page load (never stored). */
  sessionId(): string;
  /** Stable paywall A/B arm. */
  abArm(): 'A' | 'B';
  /** ms clock. */
  now(): number;
  // ----- optional (tests and the composition root) -----
  fetch?: FetchLike;
  sleep?(ms: number): Promise<void>;
  location?(): LocationLike | null;
  /** 1 = first session; default: Profile.sessions from the store. */
  sessionIndex?(): number;
  /** Vite BASE_URL of the standalone build ('/' in dev). */
  baseUrl?: string;
}

export const OFFLINE_STATUS: Readonly<BadcatServerStatus> = Object.freeze({
  enabled: false,
  checkout: false,
  cameos: false,
  gifts: false,
  restoreEmail: false,
  faceUploads: false,
  creatorCodes: false,
  brand: false,
  testMode: false,
});

function sanitizeStatus(raw: unknown): BadcatServerStatus {
  if (!raw || typeof raw !== 'object') return { ...OFFLINE_STATUS };
  const r = raw as Record<string, unknown>;
  const b = (k: string): boolean => r[k] === true;
  const enabled = b('enabled');
  const s: BadcatServerStatus = {
    enabled,
    checkout: enabled && b('checkout'),
    cameos: enabled && b('cameos'),
    gifts: enabled && b('gifts'),
    restoreEmail: enabled && b('restoreEmail'),
    faceUploads: enabled && b('faceUploads'),
    creatorCodes: enabled && b('creatorCodes'),
    brand: enabled && b('brand'),
    testMode: b('testMode'),
  };
  if (typeof r.foundingLeft === 'number' && Number.isFinite(r.foundingLeft)) s.foundingLeft = Math.max(0, Math.floor(r.foundingLeft));
  return s;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export function validEmail(e: unknown): e is string {
  return typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e.trim());
}
const SESSION_RE = /^[A-Za-z0-9_-]{4,255}$/;
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CAT_CODE_RE = /^[A-Za-z0-9_-]{8,40}$/;

/** https URLs only (http for localhost in dev). */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string' || u.length > 2048) return null;
  try {
    const x = new URL(u);
    const local = x.hostname === 'localhost' || x.hostname === '127.0.0.1';
    if (x.protocol === 'https:' || (local && x.protocol === 'http:')) return x.toString();
    return null;
  } catch {
    return null;
  }
}

function dropUndefined<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  return out;
}

export function priceLabel(sku: BadcatSku): string {
  const d = BADCAT_SKUS[sku];
  const p = `$${(d.cents / 100).toFixed(2)}`;
  return d.recurring === 'month' ? `${p}/mo` : d.recurring === 'year' ? `${p}/yr` : p;
}

function planFor(sku: BadcatSku | undefined, e: Entitlements | null | undefined): string {
  if (!sku) return 'one_off';
  if (sku === 'club_monthly') return 'monthly';
  if (sku === 'club_annual') return 'annual';
  if (sku === 'founding') return 'founding';
  if (sku === 'gift_cameo' || sku === 'gift_club_3m') return 'gift';
  if (sku === 'brand_shelf') return 'monthly';
  return e?.plan ?? 'one_off';
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const g = globalThis as { btoa?: (s: string) => string; Buffer?: { from(x: Uint8Array): { toString(enc: string): string } } };
  if (typeof g.btoa === 'function') return g.btoa(bin);
  if (g.Buffer) return g.Buffer.from(buf).toString('base64');
  throw new Error('no base64');
}

export type MoneyCore = ReturnType<typeof createMoneyCore>;

export function createMoneyCore(deps: MoneyDeps) {
  const env = deps.env;
  const store = deps.store;
  const clubUi = env.clubUi === true;
  const api: ApiClient = createApi(env.apiUrl ?? null, { fetch: deps.fetch, enabled: clubUi });
  const fromInApp = env.inApp !== 'none';
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let statusP: Promise<BadcatServerStatus> | null = null;
  const cameoMemo = new Map<string, Promise<CameoBundle>>();
  const seenTracked = new Set<string>();

  const track = (e: AnalyticsEvent, p?: AnalyticsProps): void => {
    try {
      deps.track(e, p);
    } catch {
      /* analytics never breaks money */
    }
  };
  const sid = (): string => {
    try {
      return String(deps.sessionId() || 'nosession');
    } catch {
      return 'nosession';
    }
  };
  const sessionIndex = (): number => {
    try {
      if (deps.sessionIndex) return Math.max(1, Math.floor(deps.sessionIndex()));
      const p = store.get<{ sessions?: number } | null>('profile', null);
      return Math.max(1, Math.floor(p?.sessions ?? 1));
    } catch {
      return 1;
    }
  };
  const loc = (): LocationLike | null => {
    try {
      if (deps.location) return deps.location();
      const l = (globalThis as { location?: Location }).location;
      if (!l || !l.origin || l.origin === 'null') return null;
      return { origin: l.origin, pathname: l.pathname, assign: (u: string) => l.assign(u) };
    } catch {
      return null;
    }
  };

  /** Origin + '/badcat' on tokentails.com, else the standalone base (e.g. http://localhost:5174). */
  function returnBase(): string {
    const l = loc();
    if (!l) return 'https://tokentails.com/badcat';
    if (/^\/badcat(\/|$)/.test(l.pathname)) return `${l.origin}/badcat`;
    const base = (deps.baseUrl ?? '/').replace(/\/+$/, '');
    return `${l.origin}${base}`;
  }

  /**
   * Adds a newly issued token to the cache. A scoped token (thanks page, gift redeem) never replaces a verified
   * one: it is kept beside it and the perks merge, so a purchase under another email (or a /thanks link someone
   * else sent) can only add, never drop Club. Returns the merged entitlements.
   */
  function saveToken(token: unknown, ents?: Entitlements | null): Entitlements | null {
    if (typeof token !== 'string' || !token) return null;
    const prev = store.get<CachedEntitlements | null>(KEY_ENTITLEMENTS, null);
    const rec = mergeTokenIntoCache(prev, token, deps.now(), ents ? sanitizeEntitlements(ents, 'server') : null);
    store.set(KEY_ENTITLEMENTS, rec);
    const e = getEntitlements(store, deps.now());
    return { ...e, source: 'server' };
  }

  /** Replaces one cached token by its refreshed copy (same kind), or drops it when the server refused it. */
  function replaceToken(old: string, next: string | null): void {
    const c = store.get<CachedEntitlements | null>(KEY_ENTITLEMENTS, null);
    if (!c || typeof c.token !== 'string') return;
    const scoped = (c.scoped ?? []).filter((t) => t !== old);
    if (c.token === old) {
      if (next) store.set(KEY_ENTITLEMENTS, { ...c, token: next, savedAt: deps.now(), scoped });
      else if (scoped.length) store.set(KEY_ENTITLEMENTS, { token: scoped[scoped.length - 1], entitlements: null, savedAt: deps.now(), scoped: scoped.slice(0, -1) });
      else store.set(KEY_ENTITLEMENTS, null);
      return;
    }
    store.set(KEY_ENTITLEMENTS, { ...c, scoped: next ? [...scoped, next] : scoped });
  }

  function status(): Promise<BadcatServerStatus> {
    if (!api.online) return Promise.resolve({ ...OFFLINE_STATUS });
    if (!statusP) {
      statusP = api.get<unknown>(BADCAT_ROUTES.status).then((r) => (r.ok ? sanitizeStatus(r.data) : { ...OFFLINE_STATUS }));
    }
    return statusP;
  }

  function entitlements(): Entitlements {
    return getEntitlements(store, deps.now());
  }

  async function refreshEntitlements(): Promise<Entitlements> {
    const tokens = cachedEntitlementTokens(store);
    if (!api.online || !tokens.length) return entitlements();
    let fresh = false;
    for (const token of tokens) {
      const r = await api.post<EntitlementResponse>(BADCAT_ROUTES.entitlement, { token });
      if (r.ok && r.data && typeof r.data.token === 'string') {
        replaceToken(token, r.data.token);
        fresh = true;
      } else if (r.status === 401 && token !== tokens[0]) {
        replaceToken(token, null); // a scoped token the server no longer accepts
      }
      // Anything else: keep the cache until it expires (offline-friendly).
    }
    const e = entitlements();
    return fresh ? { ...e, source: 'server' } : e;
  }

  async function checkout(req: Omit<CheckoutRequest, 'returnBase'>): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!api.online) return { ok: false, error: 'offline' };
      if (!req || !BADCAT_SKUS[req.sku]) return { ok: false, error: 'unknown_item' };
      const st = await status();
      if (!st.checkout) return { ok: false, error: 'unavailable' };
      if ((req.sku === 'gift_cameo' || req.sku === 'gift_club_3m') && !st.gifts) return { ok: false, error: 'unavailable' };
      if ((req.sku === 'brand_shelf' || req.sku === 'sponsor_day' || req.sku === 'sponsor_week') && !st.brand) return { ok: false, error: 'unavailable' };
      if (req.email !== undefined && req.email !== '' && !validEmail(req.email)) return { ok: false, error: 'email' };
      const meta: CheckoutMeta = dropUndefined({
        trigger: req.meta?.trigger ?? 'home',
        via: req.meta?.via ?? (store.get<string | null>('via', null) || undefined),
        entry: req.meta?.entry,
        from_in_app: fromInApp,
        ab_arm: req.meta?.ab_arm ?? safeArm(),
        session_index: req.meta?.session_index ?? sessionIndex(),
      });
      const body: CheckoutRequest = dropUndefined({
        sku: req.sku,
        email: req.email ? req.email.trim() : undefined,
        catCode: req.catCode && CAT_CODE_RE.test(req.catCode) ? req.catCode : undefined,
        catName: req.catName ? req.catName.slice(0, 12) : undefined,
        dayNo: Number.isInteger(req.dayNo) ? req.dayNo : undefined,
        giftFor: req.giftFor ? req.giftFor.slice(0, 40) : undefined,
        brand: req.brand
          ? dropUndefined({ name: String(req.brand.name || '').slice(0, 80), url: req.brand.url ? String(req.brand.url).slice(0, 200) : undefined, note: req.brand.note ? String(req.brand.note).slice(0, 1000) : undefined })
          : undefined,
        faceOptIn: req.faceOptIn ? true : undefined,
        meta,
        returnBase: returnBase(),
      });
      track('bc_checkout_start', { sku: req.sku, price: BADCAT_SKUS[req.sku].cents / 100, from_in_app: fromInApp });
      const r = await api.post<CheckoutResponse>(BADCAT_ROUTES.checkout, body);
      const url = r.ok && r.data ? safeUrl(r.data.url) : null;
      if (!url) {
        const err = r.data && typeof (r.data as { error?: unknown }).error === 'string' ? (r.data as unknown as { error: string }).error : r.status === 0 ? 'network' : 'server';
        return { ok: false, error: err };
      }
      store.set(KEY_CHECKOUT_PENDING, { sessionId: r.data?.sessionId ?? '', sku: req.sku, fromInApp, at: deps.now() });
      const l = loc();
      if (!l) return { ok: false, error: 'navigation' };
      l.assign(url); // same tab: works inside TikTok / Instagram webviews
      return { ok: true };
    } catch {
      return { ok: false, error: 'unexpected' };
    }
  }

  function safeArm(): 'A' | 'B' {
    try {
      return deps.abArm() === 'B' ? 'B' : 'A';
    } catch {
      return 'A';
    }
  }

  /** Link that reopens the Club sheet in Safari (Apple Pay is often missing in webviews). */
  function safariPayLink(sku: BadcatSku): string {
    return `${returnBase()}/club?sku=${encodeURIComponent(sku)}`;
  }

  async function completeCheckout(sessionId: string): Promise<CheckoutCompletion> {
    try {
      if (!api.online) return { ok: false, error: 'offline' };
      if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) return { ok: false, error: 'session' };
      const deadline = deps.now() + COMPLETE_TIMEOUT_MS;
      let last: CheckoutCompletion = { ok: false, pending: true };
      for (let attempt = 0; attempt < 40; attempt++) {
        // The device's current token rides along so the new purchase adds to its scope instead of replacing it.
        const r = await api.post<CheckoutCompletion>(BADCAT_ROUTES.entitlement, dropUndefined({ sessionId, token: cachedEntitlementToken(store) ?? undefined }));
        const d = r.data && typeof r.data === 'object' ? r.data : null;
        if (d && d.pending) {
          last = { ok: false, pending: true };
        } else if (r.ok && d && d.ok) {
          last = { ...d, ok: true, pending: false };
          break;
        } else {
          last = { ok: false, error: (d && typeof d.error === 'string' && d.error) || (r.status === 0 ? 'network' : 'server') };
          if (r.status !== 0) break; // a real answer: stop; a network blip: retry until the deadline
        }
        if (deps.now() + COMPLETE_INTERVAL_MS > deadline) break;
        await sleep(COMPLETE_INTERVAL_MS);
      }
      if (!last.ok) return last.pending ? { ok: false, pending: true, error: 'pending' } : last;
      if (last.token) {
        const e = saveToken(last.token, last.entitlements ?? null);
        if (e) last.entitlements = e;
      }
      const done = store.get<string[]>(KEY_CHECKOUT_DONE, []);
      if (!done.includes(sessionId)) {
        const pending = store.get<{ sessionId?: string; fromInApp?: boolean } | null>(KEY_CHECKOUT_PENDING, null);
        const sku = last.sku && BADCAT_SKUS[last.sku] ? last.sku : undefined;
        track('bc_checkout_complete', {
          sku: sku ?? 'unknown',
          price: sku ? BADCAT_SKUS[sku].cents / 100 : 0,
          plan: planFor(sku, last.entitlements),
          revenue_bearing: sku ? BADCAT_SKUS[sku].revenueBearing : true,
          from_in_app: pending && pending.sessionId === sessionId && typeof pending.fromInApp === 'boolean' ? pending.fromInApp : fromInApp,
        });
        store.set(KEY_CHECKOUT_DONE, [...done, sessionId].slice(-20));
        store.set('checkout_last', { sessionId, cameoId: last.cameoId ?? null });
      }
      return last;
    } catch {
      return { ok: false, error: 'unexpected' };
    }
  }

  async function restore(email: string): Promise<{ ok: boolean; devLink?: string; error?: string }> {
    if (!api.online) return { ok: false, error: 'offline' };
    if (!validEmail(email)) return { ok: false, error: 'email' };
    const r = await api.post<{ ok?: boolean; devLink?: string; error?: string }>(BADCAT_ROUTES.restore, { email: email.trim() });
    if (!r.ok || !r.data) return { ok: false, error: r.data?.error ?? (r.status === 0 ? 'network' : 'server') };
    const out: { ok: boolean; devLink?: string } = { ok: r.data.ok !== false };
    const dev = safeUrl(r.data.devLink);
    if (dev) out.devLink = dev;
    return out;
  }

  async function verifyRestore(token: string): Promise<Entitlements | null> {
    if (!api.online) return null;
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{8,4096}$/.test(token)) {
      track('bc_restore', { ok: false });
      return null;
    }
    const r = await api.post<EntitlementResponse>(BADCAT_ROUTES.restoreVerify, { t: token });
    const e = r.ok && r.data ? saveToken(r.data.token, r.data.entitlements) : null;
    track('bc_restore', { ok: !!e });
    return e;
  }

  async function portal(): Promise<{ url?: string; error?: string }> {
    if (!api.online) return { error: 'offline' };
    const token = cachedEntitlementToken(store);
    if (!token) return { error: 'no_purchase' };
    const r = await api.post<{ url?: string; error?: string }>(BADCAT_ROUTES.portal, { token });
    const url = r.ok && r.data ? safeUrl(r.data.url) : null;
    return url ? { url } : { error: r.data?.error ?? (r.status === 0 ? 'network' : 'server') };
  }

  async function redeem(req: RedeemRequest): Promise<RedeemResponse> {
    if (!api.online) return { ok: false, error: 'offline' };
    const code = String(req?.code ?? '').trim();
    if (!CODE_RE.test(code)) return { ok: false, error: 'code' };
    if (!validEmail(req.email)) return { ok: false, error: 'email' };
    const body: RedeemRequest = dropUndefined({
      code,
      email: req.email.trim(),
      catCode: req.catCode && CAT_CODE_RE.test(req.catCode) ? req.catCode : undefined,
      catName: req.catName ? req.catName.slice(0, 12) : undefined,
      dayNo: Number.isInteger(req.dayNo) ? req.dayNo : undefined,
      token: cachedEntitlementToken(store) ?? undefined,
    });
    const r = await api.post<RedeemResponse>(BADCAT_ROUTES.redeem, body);
    if (!r.ok || !r.data || !r.data.ok) return { ok: false, error: r.data?.error ?? (r.status === 0 ? 'network' : 'server') };
    const out: RedeemResponse = { ok: true };
    if (r.data.kind === 'cameo' || r.data.kind === 'club') out.kind = r.data.kind;
    if (r.data.token) {
      out.token = r.data.token;
      const e = saveToken(r.data.token, r.data.entitlements ?? null);
      if (e) out.entitlements = e;
    }
    return out;
  }

  async function setClubCat(catCode: string, name: string): Promise<boolean> {
    if (!api.online) return false;
    const token = cachedEntitlementToken(store);
    if (!token || !CAT_CODE_RE.test(String(catCode))) return false;
    const r = await api.post<{ ok?: boolean }>(BADCAT_ROUTES.clubCat, { token, catCode, name: String(name ?? '').slice(0, 12) });
    return r.ok && r.data?.ok !== false;
  }

  async function uploadFace(cameoId: string, png: Blob): Promise<boolean> {
    try {
      if (!api.online) return false;
      if (!/^[A-Za-z0-9_-]{4,64}$/.test(String(cameoId))) return false;
      if (!png || png.type !== 'image/png' || !(png.size > 0) || png.size > MAX_FACE_BYTES) return false;
      const st = await status();
      if (!st.faceUploads) return false;
      const last = store.get<{ sessionId?: string } | null>('checkout_last', null);
      const body = dropUndefined({
        token: cachedTokenFor(store, last?.sessionId) ?? undefined,
        sessionId: last?.sessionId || undefined,
        png: await blobToBase64(png),
      });
      const r = await api.post<{ ok?: boolean }>(`${BADCAT_ROUTES.face}/${encodeURIComponent(cameoId)}`, body);
      return r.ok && r.data?.ok !== false;
    } catch {
      return false;
    }
  }

  async function requestCreatorCode(code: string, email: string): Promise<{ ok: boolean; error?: string }> {
    if (!api.online) return { ok: false, error: 'offline' };
    const c = String(code ?? '').trim().toLowerCase();
    if (!creatorCode(c)) return { ok: false, error: 'code' }; // the server's CREATOR_CODE_PATTERN: [a-z0-9_]{6,12}
    if (!validEmail(email)) return { ok: false, error: 'email' };
    const st = await status();
    if (!st.creatorCodes) return { ok: false, error: 'unavailable' };
    const r = await api.post<{ ok?: boolean; error?: string }>(BADCAT_ROUTES.creatorCode, { code: c, email: email.trim() });
    return r.ok && r.data?.ok !== false ? { ok: true } : { ok: false, error: r.data?.error ?? (r.status === 0 ? 'network' : 'server') };
  }

  function cameos(dayNo: number, shells: { spectators: number }): Promise<CameoBundle> {
    const d = Math.trunc(Number.isFinite(dayNo) ? dayNo : 0);
    const slots = Math.max(0, Math.min(15, Math.floor(shells?.spectators ?? 0)));
    const shuffle = shuffleFor(sid(), d);
    const key = `${d}:${slots}`;
    const hit = cameoMemo.get(key);
    if (hit) return hit;
    const p = (async (): Promise<CameoBundle> => {
      try {
        if (api.online) {
          const st = await status();
          if (st.cameos) {
            const r = await api.get<unknown>(BADCAT_ROUTES.cameos, { day: d, s: shuffle });
            const b = r.ok ? sanitizeBundle(r.data, d, shuffle, slots) : null;
            if (b) return b;
          }
        }
      } catch {
        /* fall back */
      }
      return offlineBundle(d, shuffle, slots);
    })();
    cameoMemo.set(key, p);
    return p;
  }

  async function seen(catCode: string): Promise<SeenResponse | null> {
    if (!api.online || !CAT_CODE_RE.test(String(catCode))) return null;
    const st = await status();
    if (!st.cameos) return null;
    const r = await api.get<SeenResponse>(BADCAT_ROUTES.seen, { cat: catCode });
    if (!r.ok || !r.data) return null;
    const week = Math.max(0, Math.floor(Number(r.data.week) || 0));
    const total = Math.max(0, Math.floor(Number(r.data.total) || 0));
    if (!seenTracked.has(catCode)) {
      seenTracked.add(catCode);
      track('bc_cameo_seen', { loads: week });
    }
    return { week, total };
  }

  function persistedPaywall(): { sessionId?: string; trigger?: string } | null {
    try {
      return store.get<{ sessionId?: string; trigger?: string } | null>(KEY_PAYWALL, null);
    } catch {
      return null;
    }
  }

  function paywall(ctx: PaywallContext): PaywallOffer | null {
    const p = persistedPaywall();
    return decidePaywall(ctx as PaywallCtx, !!p && p.sessionId === sid());
  }

  function markPaywallShown(offer: PaywallOffer): void {
    try {
      const p = persistedPaywall();
      if (p && p.sessionId === sid()) return; // once per session (mount + shell may both call it)
      store.set(KEY_PAYWALL, { sessionId: sid(), trigger: offer.trigger, offer: offer.offer, at: deps.now() });
      track('bc_paywall_view', { trigger: offer.trigger, offer: offer.offer, ab_arm: offer.abArm, session_index: sessionIndex() });
    } catch {
      /* ignore */
    }
  }

  return {
    env,
    api,
    online: api.online,
    fromInApp,
    status,
    entitlements,
    refreshEntitlements,
    needsRefresh: () => entitlementsExpired(store, deps.now()),
    checkout,
    safariPayLink,
    returnBase,
    completeCheckout,
    restore,
    verifyRestore,
    /** Phase 2: a token issued elsewhere (POST /badcat/account/claim) joins the cache like a restore. */
    adoptToken(res: { token?: unknown; entitlements?: Entitlements | null } | null): Entitlements | null {
      return res ? saveToken(res.token, res.entitlements ?? null) : null;
    },
    portal,
    redeem,
    setClubCat,
    uploadFace,
    requestCreatorCode,
    cameos,
    seen,
    paywall,
    markPaywallShown,
    track,
    navigate(url: string): boolean {
      const u = safeUrl(url);
      const l = loc();
      if (!u || !l) return false;
      try {
        l.assign(u);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Moon Rave ad space API (backend/src/rave/ads). Guest routes, no auth header, every call with its own
 * timeout. Every answer is checked before use: image URLs must be https, links are re-validated, handles
 * re-checked; nothing here trusts HTML from the server.
 */
import { AD_SLOT_IDS, type AdKind } from './slots';
import { normalizeAdUrl } from './form';

export const ADS_PATHS = Object.freeze({
  status: '/rave/ads/status',
  list: '/rave/ads',
  checkout: '/rave/ads/checkout',
  ad: '/rave/ads/',
});

export const AD_ID_RE = /^ad_[0-9a-f]{16}$/;
const X_RE = /^[A-Za-z0-9_]{1,15}$/;
const PK_RE = /^pk_(live|test)_[A-Za-z0-9]+$/;
const SECRET_RE = /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/;

export class AdApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldCode: string | null;
  constructor(status: number, code: string, message: string, fieldCode: string | null = null) {
    super(message);
    this.name = 'AdApiError';
    this.status = status;
    this.code = code;
    this.fieldCode = fieldCode;
  }
}

export interface AdSlotState {
  slotId: string;
  kind: AdKind;
  free: boolean;
  heldUntil?: string;
}

export type AdsStatus =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      livemode: boolean;
      publishableKey: string;
      priceCents: number;
      fee: { percentBps: number; fixedCents: number };
      holdMinutes: number;
      days: number;
      shelterBps: number;
      slots: AdSlotState[];
    };
export type AdsStatusOn = Extract<AdsStatus, { enabled: true }>;

export interface LiveAd {
  adId: string;
  slotId: string;
  name: string;
  url: string;
  x: string | null;
  imageUrl: string;
  liveUntil: string;
}

export type AdStatus = 'held' | 'review' | 'live' | 'ended' | 'expired' | 'rejected' | 'refunded' | 'canceled';

export interface AdOrder {
  adId: string;
  slotId: string;
  status: AdStatus;
  name: string;
  url: string;
  x: string | null;
  imageUrl: string | null;
  priceCents: number;
  feeCents: number;
  amountCents: number;
  holdUntil: string | null;
  liveUntil: string | null;
  clientSecret?: string | null;
}

export interface AdCheckoutInput {
  slotId: string;
  name: string;
  url: string;
  x: string;
  coverFee: boolean;
  clientKey: string;
  image: Blob;
}

export interface AdsApi {
  status(): Promise<AdsStatus>;
  list(): Promise<LiveAd[]>;
  checkout(input: AdCheckoutInput): Promise<AdOrder>;
  ad(adId: string): Promise<AdOrder | null>;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);
const STATUSES: readonly AdStatus[] = ['held', 'review', 'live', 'ended', 'expired', 'rejected', 'refunded', 'canceled'];

/** An https image URL, or null. */
export function safeImageUrl(v: unknown): string | null {
  const s = str(v);
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

export function parseAdsStatus(body: unknown): AdsStatus {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.enabled !== true) return { enabled: false, reason: str(b.reason) ?? 'off' };
  const key = str(b.publishableKey);
  if (!key || !PK_RE.test(key)) return { enabled: false, reason: 'stripe' };
  const fee = (b.fee && typeof b.fee === 'object' ? b.fee : {}) as Record<string, unknown>;
  const raw = Array.isArray(b.slots) ? b.slots : [];
  const byId = new Map<string, AdSlotState>();
  for (const r of raw as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = str(o.slotId);
    if (!id || !AD_SLOT_IDS.includes(id)) continue;
    byId.set(id, { slotId: id, kind: id.split('-')[0] as AdKind, free: o.free === true, ...(str(o.heldUntil) ? { heldUntil: str(o.heldUntil)! } : {}) });
  }
  return {
    enabled: true,
    livemode: b.livemode === true,
    publishableKey: key,
    priceCents: Math.max(1, int(b.priceCents, 10000)),
    fee: { percentBps: Math.min(2000, Math.max(0, int(fee.percentBps, 290))), fixedCents: Math.min(500, Math.max(0, int(fee.fixedCents, 30))) },
    holdMinutes: Math.max(1, int(b.holdMinutes, 15)),
    days: Math.max(1, int(b.days, 30)),
    shelterBps: Math.min(10000, Math.max(0, int(b.shelterBps, 0))),
    // A slot the server did not mention is not for sale.
    slots: AD_SLOT_IDS.map((id) => byId.get(id) ?? { slotId: id, kind: id.split('-')[0] as AdKind, free: false }),
  };
}

export function parseLiveAds(body: unknown): LiveAd[] {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: LiveAd[] = [];
  const seen = new Set<string>();
  for (const r of (Array.isArray(b.ads) ? b.ads : []) as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const adId = str(o.adId);
    const slotId = str(o.slotId);
    const name = str(o.name)?.trim() ?? '';
    const url = normalizeAdUrl(str(o.url) ?? '');
    const imageUrl = safeImageUrl(o.imageUrl);
    const x = str(o.x);
    if (!adId || !AD_ID_RE.test(adId) || !slotId || !AD_SLOT_IDS.includes(slotId) || seen.has(slotId)) continue;
    if (!name || name.length > 40 || !url.ok || !imageUrl) continue;
    seen.add(slotId);
    out.push({ adId, slotId, name, url: url.url, x: x && X_RE.test(x) ? x : null, imageUrl, liveUntil: str(o.liveUntil) ?? '' });
  }
  return out;
}

export function parseAdOrder(body: unknown): AdOrder | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const adId = str(b.adId);
  const status = str(b.status) as AdStatus | null;
  const slotId = str(b.slotId);
  if (!adId || !AD_ID_RE.test(adId) || !status || !STATUSES.includes(status) || !slotId || !AD_SLOT_IDS.includes(slotId)) return null;
  const secret = str(b.clientSecret);
  const x = str(b.x);
  return {
    adId,
    slotId,
    status,
    name: str(b.name) ?? '',
    url: str(b.url) ?? '',
    x: x && X_RE.test(x) ? x : null,
    imageUrl: safeImageUrl(b.imageUrl),
    priceCents: int(b.priceCents),
    feeCents: int(b.feeCents),
    amountCents: int(b.amountCents),
    holdUntil: str(b.holdUntil),
    liveUntil: str(b.liveUntil),
    ...(b.clientSecret !== undefined ? { clientSecret: secret && SECRET_RE.test(secret) ? secret : null } : {}),
  };
}

/** Short buyer-facing text per error code. */
export function adErrorMessage(code: string, status: number, server?: string | null): string {
  switch (code) {
    case 'RAVE_AD_SLOT_TAKEN':
      return 'Someone just took that slot. Pick another one.';
    case 'RAVE_AD_OFF':
      return 'Ad checkout is paused right now. Try again later.';
    case 'RAVE_AD_KEY_REUSED':
      return 'Your ad changed. Tap continue again.';
    case 'RAVE_AD_STORAGE':
      return 'The image could not be saved. Try again.';
    case 'THROTTLED':
      return 'Too many tries. Wait a few minutes and try again.';
    default:
      if (status === 429) return 'Too many tries. Wait a few minutes and try again.';
      if (status >= 500) return 'Something went wrong on our side. Try again.';
      return server && server.length < 140 ? server : 'Something went wrong. Try again.';
  }
}

type FetchFn = typeof fetch;

async function call(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: ctl.signal, credentials: 'omit' });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new AdApiError(0, aborted ? 'TIMEOUT' : 'NETWORK', aborted ? 'The server took too long. Try again.' : 'Could not reach Token Tails. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const code = str(b.code) ?? (res.status === 429 ? 'THROTTLED' : `HTTP_${res.status}`);
    throw new AdApiError(res.status, code, adErrorMessage(code, res.status, str(b.message)), str(b.fieldCode));
  }
  return body;
}

export function createAdsApi(opts: { base: string; fetchFn?: FetchFn; timeoutMs?: number }): AdsApi {
  const base = opts.base.replace(/\/+$/, '');
  const fetchFn: FetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  const timeout = opts.timeoutMs ?? 20_000;
  return {
    async status() {
      try {
        return parseAdsStatus(await call(fetchFn, base + ADS_PATHS.status, { method: 'GET' }, 3_000));
      } catch {
        return { enabled: false, reason: 'unreachable' };
      }
    },
    async list() {
      try {
        return parseLiveAds(await call(fetchFn, base + ADS_PATHS.list, { method: 'GET' }, 6_000));
      } catch {
        return [];
      }
    },
    async checkout(input) {
      const form = new FormData();
      form.append('slotId', input.slotId);
      form.append('name', input.name);
      form.append('url', input.url);
      form.append('x', input.x);
      form.append('coverFee', input.coverFee ? 'true' : 'false');
      form.append('clientKey', input.clientKey);
      form.append('image', input.image, 'ad.png');
      const order = parseAdOrder(await call(fetchFn, base + ADS_PATHS.checkout, { method: 'POST', body: form }, timeout));
      if (!order) throw new AdApiError(502, 'BAD_ANSWER', 'Something went wrong on our side. Try again.');
      return order;
    },
    async ad(adId) {
      if (!AD_ID_RE.test(adId)) return null;
      try {
        return parseAdOrder(await call(fetchFn, base + ADS_PATHS.ad + adId, { method: 'GET' }, timeout));
      } catch (err) {
        if (err instanceof AdApiError && err.status === 404) return null;
        throw err;
      }
    },
  };
}

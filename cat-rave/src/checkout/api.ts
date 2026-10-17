/**
 * F-CHECKOUT: the rave checkout API (CHECKOUT-SPEC.md section 4). Guest routes, no auth header.
 * Every call has its own AbortController timeout. Answers are checked before use; nothing here
 * trusts a URL or HTML from the server.
 */
import { cleanCountry } from '../data/countries';
import type { CheckoutAnswer, CheckoutRequest, RaveFieldError, RaveOrderRow, RaveOrderStatus, RaveStatus } from './types';

export const RAVE_API_PATHS = Object.freeze({
  status: '/rave/status',
  checkout: '/rave/checkout',
  cats: '/rave/cats',
  order: '/rave/orders/',
});

export const ORDER_ID_RE = /^rv_[0-9a-f]{16}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const STATUSES: readonly RaveOrderStatus[] = ['created', 'pending', 'paid', 'review', 'onchain', 'canceled', 'refunded', 'disputed', 'expired'];

export class RaveApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: RaveFieldError[];
  /** Sub-code of a single-field error (backend `RAVE_X_HANDLE` → `fieldCode: X_HANDLE_INVALID | X_HANDLE_BLOCKED`). */
  readonly fieldCode: string | null;
  constructor(status: number, code: string, message: string, fields: RaveFieldError[] = [], fieldCode: string | null = null) {
    super(message);
    this.name = 'RaveApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.fieldCode = fieldCode;
  }
}

type FetchFn = typeof fetch;

export interface RaveApi {
  status(): Promise<RaveStatus>;
  checkout(body: CheckoutRequest): Promise<CheckoutAnswer>;
  order(orderId: string): Promise<RaveOrderRow | null>;
  usdcTx(orderId: string, chainId: number, txHash: string): Promise<RaveOrderRow | null>;
}

const trimBase = (base: string) => base.replace(/\/+$/, '');
const int = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

async function request(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: ctl.signal, credentials: 'omit' });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError';
    throw new RaveApiError(0, aborted ? 'TIMEOUT' : 'NETWORK', aborted ? 'The server took too long. Try again.' : 'Could not reach Token Tails. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw toApiError(res.status, body);
  return body;
}

/** Nest error body `{ statusCode, code, message, fields? }` (also tolerates `message: {code, …}`). */
export function toApiError(status: number, body: unknown): RaveApiError {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const inner = b.message && typeof b.message === 'object' && !Array.isArray(b.message) ? (b.message as Record<string, unknown>) : {};
  const code = str(b.code) ?? str(inner.code) ?? str(b.error) ?? (status === 429 ? 'THROTTLED' : `HTTP_${status}`);
  const rawFields = Array.isArray(b.fields) ? b.fields : Array.isArray(inner.fields) ? inner.fields : [];
  const fields: RaveFieldError[] = [];
  for (const f of rawFields as unknown[]) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const index = r.index === 'rest' ? 'rest' : typeof r.index === 'number' && Number.isInteger(r.index) ? r.index : null;
    if (index !== null && typeof r.code === 'string') fields.push({ index, code: r.code });
  }
  const fieldCode = str(b.fieldCode) ?? str(inner.fieldCode);
  return new RaveApiError(status, code, friendlyMessage(code, status, str(b.message) ?? str(inner.message)), fields, fieldCode);
}

/** Short buyer-facing text per error code. */
export function friendlyMessage(code: string, status: number, serverMessage?: string | null): string {
  switch (code) {
    case 'RAVE_AMOUNT':
      return 'That amount is not available. Pick $1, $5, or $10 and up.';
    case 'RAVE_NAME':
      return 'One of the names needs a change.';
    case 'RAVE_X_HANDLE':
      return 'Check your X account.';
    case 'RAVE_KEY_REUSED':
      return 'Your order changed. Tap pay again.';
    case 'RAVE_OFF':
      return 'Card checkout is paused right now. Try again later.';
    case 'RAVE_CAP':
      return 'Today’s cat quota is full (the shelter wallet refills tomorrow). Try a smaller amount or come back tomorrow.';
    case 'RAVE_BUSY':
      return 'The rave is very busy. Try again in a few minutes.';
    case 'RAVE_TX_MISMATCH':
      return 'That transaction is not a gift for this order.';
    case 'THROTTLED':
      return 'Too many tries. Wait a few minutes and try again.';
    default:
      if (status === 429) return 'Too many tries. Wait a few minutes and try again.';
      if (status >= 500) return 'Something went wrong on our side. Try again.';
      return serverMessage && serverMessage.length < 140 ? serverMessage : 'Something went wrong. Try again.';
  }
}

/** Defensive parse of GET /rave/status. Anything odd → `{ enabled: false }`. */
export function parseStatus(body: unknown): RaveStatus {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.enabled !== true) return { enabled: false, reason: str(b.reason) ?? 'unknown' };
  const key = str(b.publishableKey);
  if (!key || !/^pk_(live|test)_[A-Za-z0-9]+$/.test(key)) return { enabled: false, reason: 'stripe' };
  const prices = (b.prices && typeof b.prices === 'object' ? b.prices : {}) as Record<string, unknown>;
  const fee = (b.fee && typeof b.fee === 'object' ? b.fee : {}) as Record<string, unknown>;
  const usdc = (b.usdc && typeof b.usdc === 'object' ? b.usdc : {}) as Record<string, unknown>;
  const max = int(prices.max, 0);
  if (max < 1) return { enabled: false, reason: 'cap' };
  const fixed = Array.isArray(prices.fixed) ? prices.fixed.filter((n): n is number => Number.isInteger(n) && n > 0) : [1, 5];
  const chains = Array.isArray(usdc.chains) ? usdc.chains.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
  return {
    enabled: true,
    livemode: b.livemode === true,
    publishableKey: key,
    card: b.card !== false,
    usdc: { enabled: usdc.enabled === true && chains.length > 0, chains },
    prices: { fixed: fixed.length ? fixed : [1, 5], customMin: Math.max(2, int(prices.customMin, 10)), max },
    fee: { percentBps: Math.min(2000, Math.max(0, int(fee.percentBps, 290))), fixedCents: Math.min(500, Math.max(0, int(fee.fixedCents, 30))) },
    payoutsDelayed: b.payoutsDelayed === true,
    ...('country' in b ? { country: cleanCountry(b.country) } : {}),
  };
}

/** Defensive parse of an order row (GET /rave/orders/:id, GET /rave/cats rows). */
export function parseOrder(body: unknown): RaveOrderRow | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const orderId = str(b.orderId);
  const status = str(b.status) as RaveOrderStatus | null;
  if (!orderId || !ORDER_ID_RE.test(orderId) || !status || !STATUSES.includes(status)) return null;
  const tx = str(b.payoutTx);
  return {
    orderId,
    cats: Math.max(0, int(b.cats)),
    names: strArr(b.names).slice(0, 10),
    restName: str(b.restName),
    x: str(b.x),
    status,
    chainId: typeof b.chainId === 'number' ? b.chainId : null,
    payoutTx: tx && TX_RE.test(tx) ? tx : null,
    method: b.method === 'usdc' ? 'usdc' : b.method === 'card' ? 'card' : undefined,
    createdAt: str(b.createdAt) ?? undefined,
    amountCents: typeof b.amountCents === 'number' ? b.amountCents : undefined,
    feeCents: typeof b.feeCents === 'number' ? b.feeCents : undefined,
  };
}

export function parseCheckout(body: unknown): CheckoutAnswer {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const orderId = str(b.orderId);
  if (!orderId || !ORDER_ID_RE.test(orderId)) throw new RaveApiError(502, 'BAD_ANSWER', 'Something went wrong on our side. Try again.');
  const secret = str(b.clientSecret);
  const usdc = b.usdc && typeof b.usdc === 'object' ? (b.usdc as Record<string, unknown>) : null;
  const memo = str(b.memo);
  return {
    orderId,
    clientSecret: secret && /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(secret) ? secret : null,
    amountCents: int(b.amountCents),
    donationCents: int(b.donationCents),
    feeCents: int(b.feeCents),
    cats: int(b.cats),
    names: strArr(b.names).slice(0, 10),
    restName: str(b.restName),
    x: str(b.x),
    memo: memo && /^tt:rave:[0-9a-f]{16}$/.test(memo) ? memo : undefined,
    usdc: usdc
      ? {
          chains: Array.isArray(usdc.chains) ? usdc.chains.filter((n): n is number => Number.isInteger(n)) : [],
          amountUnits6: typeof usdc.amountUnits6 === 'string' && /^\d+$/.test(usdc.amountUnits6) ? usdc.amountUnits6 : '0',
        }
      : undefined,
  };
}

export interface RaveApiOptions {
  /** API base, e.g. https://api.tokentails.com (the page resolves it from API_BY_HOST). */
  base: string;
  fetchFn?: FetchFn;
  statusTimeoutMs?: number;
  timeoutMs?: number;
}

export function createRaveApi(opts: RaveApiOptions): RaveApi {
  const base = trimBase(opts.base);
  const fetchFn: FetchFn = opts.fetchFn ?? ((...a) => fetch(...a));
  const timeout = opts.timeoutMs ?? 15_000;
  const json = { 'content-type': 'application/json' };
  return {
    async status() {
      try {
        const body = await request(fetchFn, base + RAVE_API_PATHS.status, { method: 'GET' }, opts.statusTimeoutMs ?? 2_000);
        return parseStatus(body);
      } catch {
        return { enabled: false, reason: 'unreachable' };
      }
    },
    async checkout(body) {
      return parseCheckout(await request(fetchFn, base + RAVE_API_PATHS.checkout, { method: 'POST', headers: json, body: JSON.stringify(body) }, timeout));
    },
    async order(orderId) {
      if (!ORDER_ID_RE.test(orderId)) return null;
      try {
        return parseOrder(await request(fetchFn, base + RAVE_API_PATHS.order + orderId, { method: 'GET' }, timeout));
      } catch (err) {
        if (err instanceof RaveApiError && err.status === 404) return null;
        throw err;
      }
    },
    async usdcTx(orderId, chainId, txHash) {
      if (!ORDER_ID_RE.test(orderId) || !TX_RE.test(txHash)) throw new RaveApiError(400, 'BAD_INPUT', 'That transaction hash does not look right.');
      const body = await request(
        fetchFn,
        `${base}${RAVE_API_PATHS.order}${orderId}/usdc-tx`,
        { method: 'POST', headers: json, body: JSON.stringify({ chainId, txHash }) },
        timeout,
      );
      return parseOrder(body);
    },
  };
}

/** One clientKey per sheet open (a UUID); falls back when crypto.randomUUID is missing. */
export function newClientKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

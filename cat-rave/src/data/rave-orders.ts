/**
 * F-DATA: Moon Rave orders → named cats, "arriving" holograms and name shout-outs.
 * CHECKOUT-SPEC.md sections 3, 4 (`GET /rave/cats`, `GET /rave/orders/:id`), 6 and 11 (F-DATA).
 *
 * The $1 = 1 cat rule: a paid order's cats dance from the moment it is paid (`aheadCats`, added to
 * the floor by `data/floor.ts`) and its payout in the feed (`GET /shelter/payouts`) later takes their
 * place one for one. Besides that, this module:
 *  - names real cats whose payout memo was `tt:rave:<16 hex>` (`namesForCat`), by position among
 *    that order's cats in feed order;
 *  - lists paid orders whose payout the feed does not hold yet (`arriving`: hologram cats, never
 *    counted);
 *  - emits a shout-out (`onLanded`) the first time an order's payout shows up in the feed.
 *
 * Names and handles come from the server already filtered (section 7). They are re-checked here for
 * display safety only (length, no control characters, handle charset) and must be rendered as text
 * (`textContent` / canvas). `xUrl` is built here from the checked handle, never taken from a response.
 */
import { CHAINS, explorerTx, POLL_MS } from '../config';
import type { PayoutDiff, PayoutSnapshot, RaveCat } from '../types';
import { countryLeaderboard, cleanCountry, type CountryBoard } from './countries';
import { cleanRaveOrderId, pollDelay, raveOrderIdOf } from './index';

// =============================================================================================
// Tunables
// =============================================================================================

export const RAVE_CATS_PATH = '/rave/cats';
export const RAVE_ORDER_PATH = '/rave/orders/';
/** Fast poll after the viewer pays (section 11: 5 s for 2 min). */
export const ORDERS_FAST_MS = 5_000;
export const ORDERS_FAST_FOR_MS = 2 * 60_000;
/** `GET /rave/cats?limit=` (server max 500). */
export const ORDERS_PAGE_LIMIT = 500;
/** Safety cap on pages for one full read (500 orders each). */
export const MAX_ORDER_PAGES = 40;
/** Polls read only the newest page; a full read (moderation changes on older orders) this often. */
export const FULL_REREAD_MS = 10 * 60_000;
/** Own orders checked per poll (`GET /rave/orders/:id` is limited to 30/min per address). */
export const MAX_OWN_PER_POLL = 4;
/** A payout older than this (block time) is only shouted out when we saw it arriving live, or it is the viewer's. */
export const LANDED_RECENT_S = 15 * 60;
/** A landed payout whose order is still unknown is retried for names this long, then dropped. */
export const AWAIT_NAMES_MS = 2 * 60_000;
/** After an order turns `onchain` but is not in the feed yet, re-read the feed at these delays. */
export const FEED_REFRESH_AFTER_ONCHAIN_MS = [30_000, 150_000] as const;
/** Named fields per order (section 3); cats beyond this are `${restName} ${i + 1}`. */
export const NAMED_FIELDS = 10;
/** Display cap on one order's cats (server default max is 500). */
export const MAX_ORDER_CATS = 100_000;
export const NAME_MAX = 16;
export const FETCH_TIMEOUT_MS = 10_000;

// =============================================================================================
// Shapes
// =============================================================================================

/** 'created' is internal (own orders not paid yet): never shown, never arriving. */
export type RaveOrderStatus = 'created' | 'pending' | 'paid' | 'onchain';

export interface RaveOrder {
  orderId: string;
  cats: number;
  /** ≤ 10 display names (server defaults filled in). */
  names: string[];
  /** Base of "Name 11", "Name 12", … when cats > 10. */
  restName: string | null;
  /** Bare X handle (`^[A-Za-z0-9_]{1,15}$`), or null. */
  x: string | null;
  /** Buyer country, ISO 3166-1 alpha-2 upper case (from IP, else the buyer's pick), or null. */
  country: string | null;
  status: RaveOrderStatus;
  chainId: number | null;
  payoutTx: string | null;
  method: 'card' | 'usdc' | null;
  createdAt: string | null;
  /** This viewer's own order (from `myOrders()` or `track()`). */
  mine: boolean;
}

export interface CatName {
  orderId: string;
  /** 0-based position of this cat within its order. */
  position: number;
  /** Display name, or null when the order is not known yet. Render as text only. */
  name: string | null;
  x: string | null;
  /** `https://x.com/<handle>`, built here from the checked handle. */
  xUrl: string | null;
  /** The buyer's country (the cat holds this flag), or null: no flag. */
  country: string | null;
}

export interface RaveOrderView extends RaveOrder {
  /** 'landed' = dancing: paid (its cats dance right away) or its payout is in the feed. */
  phase: 'arriving' | 'landed';
  /** Explorer link of the payout (mainnet chains only), else null. */
  payoutUrl: string | null;
  xUrl: string | null;
  /** First names of the order (≤ 10, plus the next rest name when cats > 10). */
  previewNames: string[];
}

export interface Arriving {
  /** Hologram cats: sum of `cats` over orders still confirming (`pending`). Never part of the counter. */
  count: number;
  /** Newest first. */
  orders: RaveOrderView[];
}

/** The DJ shout-out payload: an order just joined the floor (paid, or its payout reached the feed first). */
export interface NameShoutout {
  order: RaveOrder;
  /** The order's payout cats in the current snapshot; empty while it dances ahead of its payout. */
  cats: RaveCat[];
  names: string[];
  x: string | null;
  xUrl: string | null;
  /** "Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!" (plain text). */
  text: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The parts of the payout feed this module uses (RavePayoutFeed satisfies it). */
export interface FeedLike {
  readonly current: PayoutSnapshot | null;
  subscribe(cb: (snapshot: PayoutSnapshot, diff: PayoutDiff) => void): () => void;
  refresh(): Promise<PayoutSnapshot>;
}

type Visibility = {
  readonly hidden: boolean;
  addEventListener(t: 'visibilitychange', cb: () => void): void;
  removeEventListener(t: 'visibilitychange', cb: () => void): void;
};

export interface RaveOrdersOptions {
  /** API base (https://api.tokentails.com), or null (no orders: nothing is named or arriving). */
  api: string | null;
  feed: FeedLike;
  /** The viewer's own order ids (checkout `myorders.ts`, localStorage). Read on every poll. */
  myOrders?: () => readonly string[];
  /** An own order the server says is gone (404, canceled, refunded, disputed, expired). */
  onOrderGone?: (orderId: string, reason: string) => void;
  fetch?: FetchLike;
  now?: () => number;
  visibility?: Visibility | null;
}

export interface RaveOrders {
  /** First full read of `/rave/cats` (and own orders); never rejects. Call after `feed.load()`. */
  load(): Promise<void>;
  startPolling(): void;
  stopPolling(): void;
  refresh(): Promise<void>;
  /**
   * The viewer just paid: show the order as arriving right away (checkout answer: orderId, cats,
   * names, restName, x) and poll every 5 s for 2 min. The server's answer overrides it on the next poll.
   */
  track(order: unknown, status?: 'pending' | 'paid'): RaveOrder | null;
  /** Poll fast (5 s) for the next 2 min. */
  boost(): void;
  /** Name + X of a Moon Rave cat (a payout cat, or a paid order's cat dancing ahead of it), else null. */
  namesForCat(cat: RaveCat | null | undefined): CatName | null;
  /**
   * Cats of paid orders whose payout is not in the feed yet, oldest order first, indexed from
   * `start`. They dance right away; the payout later replaces them one for one (no second drop-in).
   */
  aheadCats(start: number): RaveCat[];
  /** Orders still confirming (`pending`: a USDC tx being checked, a bank confirming): holograms. */
  arriving(): Arriving;
  /** Up to `limit` names of arriving cats, newest order first (hologram labels). */
  arrivingNames(limit?: number): CatName[];
  /** Arriving orders plus orders that landed in this session, newest first (the arrivals list). */
  recent(limit?: number): RaveOrderView[];
  order(orderId: string): RaveOrder | null;
  /**
   * Countries leaderboard: cats per buyer country over the public orders (the rows GET /rave/countries
   * counts) plus the viewer's own paid ones. Never the viewer's unpaid orders.
   * `landed` = cats whose payout is in the feed. Orders without a country add to `unknownCats`.
   */
  countries(): CountryBoard;
  /** Shout-out once per order, when it joins the floor (paid, or first seen in the feed). */
  onLanded(cb: (e: NameShoutout) => void): () => void;
  /** Any change to orders, arriving or landed. */
  subscribe(cb: () => void): () => void;
  readonly lastError: string | null;
  dispose(): void;
}

// =============================================================================================
// Pure helpers
// =============================================================================================

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/** A bare X handle, re-checked; anything else → null. */
export function cleanXHandle(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const h = v.trim();
  return X_HANDLE_RE.test(h) ? h : null;
}

/** `https://x.com/<handle>` from a checked handle, else null. */
export function xUrlOf(handle: string | null | undefined): string | null {
  const h = cleanXHandle(handle);
  return h ? `https://x.com/${h}` : null;
}

/** Display check of a server name: NFC, trimmed, 1–16 code points, no control/format characters. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s || /\p{C}/u.test(s)) return null;
  return [...s].length <= NAME_MAX ? s : null;
}

/** Name of cat `i` (0-based) of an order: `names[i]`, else `${restName} ${i + 1}` (section 4). */
export function catNameAt(order: Pick<RaveOrder, 'cats' | 'names' | 'restName'>, i: number): string | null {
  if (!Number.isInteger(i) || i < 0 || i >= order.cats) return null;
  if (i < order.names.length) return order.names[i];
  const base = order.restName ?? order.names[order.names.length - 1] ?? 'Cat';
  return `${base} ${i + 1}`;
}

/** The first `limit` names of an order. */
export function orderNames(order: Pick<RaveOrder, 'cats' | 'names' | 'restName'>, limit = order.cats): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(order.cats, limit); i++) out.push(catNameAt(order, i)!);
  return out;
}

/** "Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!" (plain text; the canvas bubble shows it as is). */
export function shoutoutText(names: readonly string[], total: number, x: string | null): string {
  const n = Math.max(total, names.length);
  let who: string;
  if (n <= 0 || names.length === 0) who = n === 1 ? 'a new cat' : `${n} new cats`;
  else if (n === 1) who = names[0];
  else if (n === 2 && names.length >= 2) who = `${names[0]} and ${names[1]}`;
  else if (n === 3 && names.length >= 3) who = `${names[0]}, ${names[1]} and ${names[2]}`;
  else if (names.length >= 2) who = `${names[0]}, ${names[1]} and ${n - 2} more`;
  else who = `${names[0]} and ${n - 1} more`;
  const h = cleanXHandle(x);
  return `Shout-out to ${who}!${h ? ` Shout-out to @${h}!` : ''}`;
}

/** Server status → this module's status; null = not shown (gone: canceled, refunded, disputed, expired). */
export function mapStatus(s: unknown): RaveOrderStatus | null {
  switch (s) {
    case 'created':
      return 'created';
    case 'pending':
      return 'pending';
    case 'paid':
    case 'review': // held for a person: still paid and arriving for the buyer
      return 'paid';
    case 'onchain':
      return 'onchain';
    default:
      return null;
  }
}

/** One order from `/rave/cats` or `/rave/orders/:id`, checked. null when malformed or gone. */
export function parseOrder(raw: unknown, mine = false): RaveOrder | null {
  const b = obj(raw);
  if (!b) return null;
  const orderId = cleanRaveOrderId(b.orderId);
  if (!orderId) return null;
  const status = mapStatus(b.status);
  if (!status) return null;
  const cats = Number(b.cats);
  if (!Number.isInteger(cats) || cats < 1 || cats > MAX_ORDER_CATS) return null;
  const rawNames = Array.isArray(b.names) ? b.names.slice(0, Math.min(cats, NAMED_FIELDS)) : [];
  const names = rawNames.map((n, i) => cleanName(n) ?? `Cat ${i + 1}`);
  const restName = cats > names.length ? cleanName(b.restName) : null;
  const chainId = Number.isInteger(b.chainId) ? (b.chainId as number) : null;
  const payoutTx = typeof b.payoutTx === 'string' && TX_RE.test(b.payoutTx) ? b.payoutTx.toLowerCase() : null;
  return {
    orderId,
    cats,
    names,
    restName,
    x: cleanXHandle(b.x),
    country: cleanCountry(b.country),
    status,
    chainId,
    payoutTx,
    method: b.method === 'card' || b.method === 'usdc' ? b.method : null,
    createdAt: typeof b.createdAt === 'string' && Number.isFinite(Date.parse(b.createdAt)) ? b.createdAt : null,
    mine,
  };
}

/** Which rave order (and position in it) each shown cat belongs to, in feed order. */
export interface RaveCatIndex {
  byCat: Map<number, { orderId: string; position: number }>;
  catsByOrder: Map<string, RaveCat[]>;
  /** Orders with any payout in the snapshot (also payouts that crossed no dollar). */
  inFeed: Set<string>;
  /** Latest block time of each order's payouts. */
  landedAt: Map<string, number>;
}

/**
 * Builds the cat → order map. A payout's order comes from its memo (`raveOrderId`), or, when the
 * memo was lost (bundled snapshot), from an order whose `payoutTx` is that payout's tx.
 */
export function indexRaveCats(snapshot: PayoutSnapshot | null, orderByTx: ReadonlyMap<string, string> = new Map()): RaveCatIndex {
  const out: RaveCatIndex = { byCat: new Map(), catsByOrder: new Map(), inFeed: new Set(), landedAt: new Map() };
  if (!snapshot) return out;
  const idOf = (p: RaveCat['payout']) => (p ? (raveOrderIdOf(p) ?? orderByTx.get(p.txHash) ?? null) : null);
  for (const p of snapshot.payouts) {
    const id = idOf(p);
    if (!id) continue;
    out.inFeed.add(id);
    out.landedAt.set(id, Math.max(out.landedAt.get(id) ?? 0, p.timestamp));
  }
  for (const cat of snapshot.catList) {
    if (cat.demo) continue;
    const id = idOf(cat.payout);
    if (!id) continue;
    const list = out.catsByOrder.get(id) ?? [];
    out.byCat.set(cat.index, { orderId: id, position: list.length });
    list.push(cat);
    out.catsByOrder.set(id, list);
  }
  return out;
}

// =============================================================================================
// Network
// =============================================================================================

async function fetchJson(fetchImpl: FetchLike, url: string): Promise<{ status: number; body: unknown }> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, { signal: ctrl?.signal, headers: { accept: 'application/json' } });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Reads `GET /rave/cats` newest first; `full` follows `nextBefore` up to MAX_ORDER_PAGES. Throws on HTTP errors. */
export async function fetchRaveOrders(api: string, fetchImpl: FetchLike, full: boolean): Promise<{ orders: RaveOrder[]; complete: boolean }> {
  const base = api.replace(/\/+$/, '');
  const orders: RaveOrder[] = [];
  const seen = new Set<string>();
  let before: string | null = null;
  for (let page = 0; page < (full ? MAX_ORDER_PAGES : 1); page++) {
    const url = `${base}${RAVE_CATS_PATH}?limit=${ORDERS_PAGE_LIMIT}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const { status, body } = await fetchJson(fetchImpl, url);
    const b = obj(body);
    if (status < 200 || status >= 300 || !b || !Array.isArray(b.orders)) throw new Error(`rave/cats HTTP ${status}`);
    for (const raw of b.orders) {
      const o = parseOrder(raw);
      if (o && !seen.has(o.orderId)) {
        seen.add(o.orderId);
        orders.push(o);
      }
    }
    const next: string | null = typeof b.nextBefore === 'string' && b.nextBefore && b.nextBefore !== before ? b.nextBefore : null;
    if (!next) return { orders, complete: true };
    before = next;
  }
  return { orders, complete: false };
}

/** `GET /rave/orders/:id`: the order, `'gone'` (404 or a dead status), or throws on other errors. */
export async function fetchOwnOrder(api: string, fetchImpl: FetchLike, orderId: string): Promise<RaveOrder | { gone: string }> {
  const id = cleanRaveOrderId(orderId);
  if (!id) return { gone: 'invalid' };
  const { status, body } = await fetchJson(fetchImpl, `${api.replace(/\/+$/, '')}${RAVE_ORDER_PATH}${encodeURIComponent(id)}`);
  if (status === 404) return { gone: 'missing' };
  if (status < 200 || status >= 300) throw new Error(`rave/orders HTTP ${status}`);
  const b = obj(body);
  const o = parseOrder(body, true);
  if (o) return o;
  if (b && typeof b.status === 'string' && !mapStatus(b.status)) return { gone: b.status };
  throw new Error('rave/orders: malformed order');
}

// =============================================================================================
// Store
// =============================================================================================

export function createRaveOrders(opts: RaveOrdersOptions): RaveOrders {
  const api = opts.api ? opts.api.replace(/\/+$/, '') : null;
  const fetchImpl: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const now = opts.now ?? (() => Date.now());
  const vis = opts.visibility !== undefined ? opts.visibility : typeof document !== 'undefined' ? document : null;
  const feed = opts.feed;

  const orders = new Map<string, RaveOrder>();
  /** Own ids from `track()` (myOrders() adds the stored ones). */
  const tracked = new Set<string>();
  const gone = new Set<string>();
  /** Landed orders already handled (shouted, or in the feed before we looked). */
  const shouted = new Set<string>();
  /** Orders seen arriving against a live feed (their landing is shouted even if the block is old). */
  const seenArriving = new Set<string>();
  /** In the feed but not known yet: first seen (ms). */
  const awaitingNames = new Map<string, number>();
  /** Landed this session, ms (for `recent`). */
  const landedThisSession = new Map<string, number>();
  /** Orders whose onchain → feed refresh is scheduled. */
  const refreshScheduled = new Set<string>();
  const firstSeen = new Map<string, number>();
  /** Orders the public list (GET /rave/cats) carried: the server counts them, so the board does too. */
  const publicIds = new Set<string>();

  const landedListeners = new Set<(e: NameShoutout) => void>();
  const changeListeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  let index: RaveCatIndex = indexRaveCats(null);
  let indexedSnap: PayoutSnapshot | null = null;
  let indexDirty = true;
  let baselined = false;
  /** The first orders read is done: paid orders it brings are history unless fresh (15 min). */
  let ordersBaselined = false;
  let lastError: string | null = null;
  let failures = 0;
  let lastFullAt = 0;
  let lastFetchAt = 0;
  let fastUntil = 0;
  let polling = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let loadPromise: Promise<void> | null = null;

  const isMine = (id: string) => tracked.has(id) || (opts.myOrders?.() ?? []).includes(id);

  function orderByTx(): Map<string, string> {
    const m = new Map<string, string>();
    for (const o of orders.values()) if (o.payoutTx) m.set(o.payoutTx, o.orderId);
    return m;
  }

  function currentIndex(): RaveCatIndex {
    const snap = feed.current;
    if (indexDirty || snap !== indexedSnap) {
      index = indexRaveCats(snap, orderByTx());
      indexedSnap = snap;
      indexDirty = false;
    }
    return index;
  }

  function notify() {
    for (const cb of [...changeListeners]) {
      try {
        cb();
      } catch (err) {
        console.error('[cat-rave] rave orders subscriber failed', err);
      }
    }
  }

  /** `own`: the buyer's own GET, which is authoritative (it asks Stripe when the webhook is slow). */
  function upsert(o: RaveOrder, own = false) {
    if (gone.has(o.orderId)) return;
    const prev = orders.get(o.orderId);
    const mine = o.mine || prev?.mine || isMine(o.orderId);
    // A public row (cached 15 s) never downgrades a fresher status.
    const status = !own && prev && rank(prev.status) > rank(o.status) ? prev.status : o.status;
    // The checkout answer may lack the country the server set from the IP: keep a known one.
    const country = o.country ?? prev?.country ?? null;
    orders.set(o.orderId, { ...o, mine, status, country, payoutTx: o.payoutTx ?? prev?.payoutTx ?? null, chainId: o.chainId ?? prev?.chainId ?? null });
    if (!firstSeen.has(o.orderId)) firstSeen.set(o.orderId, now());
    indexDirty = true;
  }

  function forget(id: string, reason: string) {
    if (gone.has(id)) return;
    gone.add(id);
    orders.delete(id);
    tracked.delete(id);
    indexDirty = true;
    try {
      opts.onOrderGone?.(id, reason);
    } catch (err) {
      console.error('[cat-rave] onOrderGone failed', err);
    }
  }

  function scheduleFeedRefresh(id: string) {
    if (refreshScheduled.has(id)) return;
    refreshScheduled.add(id);
    for (const ms of FEED_REFRESH_AFTER_ONCHAIN_MS) {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!disposed && !currentIndex().inFeed.has(id)) void feed.refresh();
      }, ms);
      timers.add(t);
    }
  }

  /** Paid or on-chain: its cats dance (from the feed once the payout is there, else ahead of it). */
  function isDancing(o: RaveOrder, idx: RaveCatIndex) {
    return o.status === 'paid' || o.status === 'onchain' || idx.inFeed.has(o.orderId);
  }

  function isAhead(o: RaveOrder, idx: RaveCatIndex) {
    return (o.status === 'paid' || o.status === 'onchain') && !idx.inFeed.has(o.orderId);
  }

  function isArriving(o: RaveOrder, idx: RaveCatIndex) {
    return o.status === 'pending' && !idx.inFeed.has(o.orderId);
  }

  function emitJoined(order: RaveOrder, cats: RaveCat[]) {
    const names = orderNames(order, Math.min(order.cats, 3));
    const e: NameShoutout = { order, cats, names, x: order.x, xUrl: xUrlOf(order.x), text: shoutoutText(names, order.cats, order.x) };
    for (const cb of [...landedListeners]) {
      try {
        cb(e);
      } catch (err) {
        console.error('[cat-rave] landed subscriber failed', err);
      }
    }
  }

  /** Landed / arriving bookkeeping. Emits shout-outs. Returns true when something changed. */
  function evaluate(): boolean {
    const snap = feed.current;
    if (!snap) return false;
    const idx = currentIndex();
    let changed = false;
    if (!baselined) {
      // Everything already in the feed when we first look is history: no shout-outs for it.
      for (const id of idx.inFeed) shouted.add(id);
      baselined = true;
    }
    const nowMs = now();
    const live = snap.origin === 'live';
    for (const o of orders.values()) {
      if (live && isArriving(o, idx)) seenArriving.add(o.orderId);
      if (o.status === 'onchain' && !idx.inFeed.has(o.orderId)) scheduleFeedRefresh(o.orderId);
    }
    // Paid orders join the floor now, ahead of their payout: one shout-out each, never again when
    // the payout lands. Older paid orders seen on the first look are history (no shout-out).
    const recentS = Math.floor(nowMs / 1000) - LANDED_RECENT_S;
    for (const o of orders.values()) {
      if (shouted.has(o.orderId) || !isAhead(o, idx)) continue;
      shouted.add(o.orderId);
      changed = true;
      const created = o.createdAt ? Math.floor(Date.parse(o.createdAt) / 1000) : Math.floor((firstSeen.get(o.orderId) ?? nowMs) / 1000);
      const fresh = ordersBaselined ? created >= recentS : false;
      if (!(fresh || tracked.has(o.orderId) || seenArriving.has(o.orderId))) continue;
      landedThisSession.set(o.orderId, nowMs);
      emitJoined(o, []);
    }
    let needNames = false;
    for (const id of idx.inFeed) {
      if (shouted.has(id)) continue;
      const order = orders.get(id);
      const recent = (idx.landedAt.get(id) ?? 0) >= recentS;
      if (!order) {
        const since = awaitingNames.get(id);
        if (since === undefined) {
          awaitingNames.set(id, nowMs);
          needNames = true;
        } else if (nowMs - since > AWAIT_NAMES_MS) {
          awaitingNames.delete(id);
          shouted.add(id); // give up: the DJ still greets the cats through the normal landing
        }
        continue;
      }
      awaitingNames.delete(id);
      shouted.add(id);
      changed = true;
      if (!(recent || order.mine || seenArriving.has(id))) continue;
      landedThisSession.set(id, nowMs);
      emitJoined(order, idx.catsByOrder.get(id) ?? []);
    }
    if (needNames) void store.refresh();
    return changed;
  }

  async function pollOnce(full: boolean): Promise<void> {
    if (!api) return;
    let ok = true;
    try {
      const { orders: list, complete } = await fetchRaveOrders(api, fetchImpl, full);
      if (full && complete) {
        // A full read is the public truth: drop orders that left it (refunded before payout,
        // canceled), unless they are the viewer's own (checked below) or already in the feed.
        const listed = new Set(list.map((o) => o.orderId));
        const idx = currentIndex();
        for (const id of [...orders.keys()]) {
          if (!listed.has(id) && !isMine(id) && !idx.inFeed.has(id)) orders.delete(id);
        }
        indexDirty = true;
      }
      for (const o of list) {
        publicIds.add(o.orderId);
        upsert(o);
      }
      if (full) lastFullAt = now();
    } catch (err) {
      ok = false;
      lastError = err instanceof Error ? err.message : String(err);
    }
    // Own orders not in the feed yet, newest tracked first.
    const idx = currentIndex();
    const mineIds = [...new Set([...tracked, ...(opts.myOrders?.() ?? [])])]
      .map((id) => cleanRaveOrderId(id))
      .filter((id): id is string => !!id && !gone.has(id) && !idx.inFeed.has(id))
      .slice(-MAX_OWN_PER_POLL);
    for (const id of mineIds) {
      try {
        const r = await fetchOwnOrder(api, fetchImpl, id);
        if ('gone' in r) forget(id, r.gone);
        else upsert(r, true);
      } catch (err) {
        ok = false;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    lastFetchAt = now();
    if (!ordersBaselined && feed.current) {
      // History: every paid order of the first read joined the floor before we looked, except the
      // viewer's tracked purchase and fresh ones (paid in the last 15 min still get their shout-out).
      const idx0 = currentIndex();
      const recent0 = Math.floor(now() / 1000) - LANDED_RECENT_S;
      for (const o of orders.values()) {
        if (!isAhead(o, idx0) || tracked.has(o.orderId)) continue;
        const created = o.createdAt ? Math.floor(Date.parse(o.createdAt) / 1000) : 0;
        if (created < recent0) shouted.add(o.orderId);
      }
      ordersBaselined = true;
    }
    if (ok) {
      failures = 0;
      lastError = null;
    } else failures += 1;
    evaluate();
    notify();
  }

  function fetchNow(full = false): Promise<void> {
    if (inflight) return inflight;
    inflight = pollOnce(full || now() - lastFullAt >= FULL_REREAD_MS).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function nextDelay() {
    if (now() < fastUntil) return ORDERS_FAST_MS;
    return failures ? pollDelay(failures) : POLL_MS;
  }

  function schedule(delay: number) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!polling || disposed || !api || vis?.hidden) return;
    timer = setTimeout(async () => {
      timer = null;
      await fetchNow();
      schedule(nextDelay());
    }, delay);
  }

  const onVisibility = () => {
    if (!polling) return;
    if (vis?.hidden) {
      if (timer) clearTimeout(timer);
      timer = null;
      return;
    }
    schedule(Math.max(nextDelay() - (now() - lastFetchAt), 0));
  };
  vis?.addEventListener('visibilitychange', onVisibility);

  const unsubFeed = feed.subscribe(() => {
    indexDirty = true;
    evaluate();
    notify();
  });

  function view(o: RaveOrder, idx: RaveCatIndex): RaveOrderView {
    const chain = o.chainId !== null ? CHAINS[o.chainId] : undefined;
    return {
      ...o,
      phase: isDancing(o, idx) ? 'landed' : 'arriving',
      payoutUrl: chain && o.payoutTx ? explorerTx(chain.explorer, o.payoutTx) : null,
      xUrl: xUrlOf(o.x),
      previewNames: orderNames(o, NAMED_FIELDS + (o.cats > NAMED_FIELDS ? 1 : 0)),
    };
  }

  const newestFirst = (a: RaveOrder, b: RaveOrder) =>
    (Date.parse(b.createdAt ?? '') || firstSeen.get(b.orderId) || 0) - (Date.parse(a.createdAt ?? '') || firstSeen.get(a.orderId) || 0);

  const store: RaveOrders = {
    load() {
      if (loadPromise) return loadPromise;
      loadPromise = (async () => {
        if (api) await fetchNow(true);
        else {
          evaluate();
          notify();
        }
      })();
      return loadPromise;
    },
    startPolling() {
      if (polling || !api) return;
      polling = true;
      schedule(lastFetchAt ? Math.max(nextDelay() - (now() - lastFetchAt), 0) : nextDelay());
    },
    stopPolling() {
      polling = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    async refresh() {
      await fetchNow();
      if (polling) schedule(nextDelay());
    },
    track(raw, status = 'paid') {
      const b = obj(raw);
      if (!b) return null;
      const o = parseOrder({ ...b, status: b.status ?? status }, true);
      if (!o) return null;
      tracked.add(o.orderId);
      gone.delete(o.orderId);
      upsert(o);
      evaluate();
      notify();
      store.boost();
      return orders.get(o.orderId) ?? null;
    },
    boost() {
      fastUntil = now() + ORDERS_FAST_FOR_MS;
      if (polling) schedule(ORDERS_FAST_MS);
    },
    namesForCat(cat) {
      if (!cat || cat.demo) return null;
      if (cat.order) {
        const o = orders.get(cat.order.id);
        if (!o) return null;
        return { orderId: o.orderId, position: cat.order.position, name: catNameAt(o, cat.order.position), x: o.x, xUrl: xUrlOf(o.x), country: o.country };
      }
      if (!cat.payout) return null;
      const hit = currentIndex().byCat.get(cat.index);
      if (!hit) return null;
      const o = orders.get(hit.orderId);
      const x = o?.x ?? null;
      return { orderId: hit.orderId, position: hit.position, name: o ? catNameAt(o, hit.position) : null, x, xUrl: xUrlOf(x), country: o?.country ?? null };
    },
    aheadCats(start) {
      const idx = currentIndex();
      const list = [...orders.values()].filter((o) => isAhead(o, idx)).sort((a, b) => newestFirst(b, a));
      const out: RaveCat[] = [];
      for (const o of list) {
        const created = o.createdAt ? Math.floor(Date.parse(o.createdAt) / 1000) : Math.floor((firstSeen.get(o.orderId) ?? now()) / 1000);
        for (let i = 0; i < o.cats; i++) {
          out.push({ index: start + out.length, payout: null, contributors: 0, completedAt: created, demo: false, seed: seedOf(`${o.orderId}:${i}`), country: o.country, order: { id: o.orderId, position: i } });
        }
      }
      return out;
    },
    arriving() {
      const idx = currentIndex();
      const list = [...orders.values()].filter((o) => isArriving(o, idx)).sort(newestFirst);
      return { count: list.reduce((s, o) => s + o.cats, 0), orders: list.map((o) => view(o, idx)) };
    },
    arrivingNames(limit = 64) {
      const out: CatName[] = [];
      for (const o of store.arriving().orders) {
        for (let i = 0; i < o.cats && out.length < limit; i++) {
          out.push({ orderId: o.orderId, position: i, name: catNameAt(o, i), x: o.x, xUrl: o.xUrl, country: o.country });
        }
        if (out.length >= limit) break;
      }
      return out;
    },
    recent(limit = 20) {
      const idx = currentIndex();
      return [...orders.values()]
        .filter((o) => isArriving(o, idx) || landedThisSession.has(o.orderId))
        .sort(newestFirst)
        .slice(0, limit)
        .map((o) => view(o, idx));
    },
    countries() {
      const idx = currentIndex();
      const entries = [...orders.values()]
        // Same rows as GET /rave/countries: what the public list carries, plus the viewer's own orders
        // once paid. The viewer's unpaid USDC order (tracked as pending) is not a cat yet.
        .filter((o) => publicIds.has(o.orderId) || o.status === 'paid' || o.status === 'onchain')
        .map((o) => ({ country: o.country, cats: o.cats, landed: isDancing(o, idx) }));
      return countryLeaderboard(entries);
    },
    order(orderId) {
      const id = cleanRaveOrderId(orderId);
      return id ? (orders.get(id) ?? null) : null;
    },
    onLanded(cb) {
      landedListeners.add(cb);
      return () => landedListeners.delete(cb);
    },
    subscribe(cb) {
      changeListeners.add(cb);
      return () => changeListeners.delete(cb);
    },
    get lastError() {
      return lastError;
    },
    dispose() {
      disposed = true;
      store.stopPolling();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      unsubFeed();
      landedListeners.clear();
      changeListeners.clear();
      vis?.removeEventListener('visibilitychange', onVisibility);
    },
  };
  return store;
}

/** Stable 0..1 look seed (FNV-1a) for a cat dancing ahead of its payout. */
function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

function rank(s: RaveOrderStatus): number {
  return s === 'created' ? 0 : s === 'pending' ? 1 : s === 'paid' ? 2 : 3;
}

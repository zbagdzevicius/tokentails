/**
 * L-DATA: public payouts → dollars → cats. SPEC.md §2–§5.
 *
 * Source of truth: GET {api}/shelter/payouts?network=mainnet&limit=2000 (public on-chain
 * ShelterSplit Disbursed / NativeDisbursed events to Pink Paw; `Access-Control-Allow-Origin: *`;
 * 30 s cache; index job every 2 min). Events come newest first; we page with `cursor`.
 * Fallback: ./snapshot.json (bundled by `npm run snapshot`, with its asOf date).
 *
 * Conversion (one rule, here): amount18 (18-decimal integer string) → integer micro-USD, truncated.
 * USDC, USDC.e, USDG, pathUSD = 1:1. EURC = EURC_USD (fixed 1.00: EUR trades above USD, so this
 * undercounts and never inflates). Gas coins, unknown tokens and non-mainnet chains are not counted.
 *
 * Count rule: oldest first (timestamp, chainId, logIndex); running integer total; each whole dollar
 * crossed is one cat, named by the payout that crossed it. `?cats=N` is a DEMO override only.
 */
import { CHAINS, EURC_USD, EURC_USD_SOURCE, explorerTx, LINKS, MICRO, PAYOUTS_PATH, POLL_MAX_MS, POLL_MS, USD_SYMBOLS } from '../config';
import type { Payout, PayoutDiff, PayoutFeed, PayoutSnapshot, PayoutSource, RaveCat } from '../types';
import bundled from './snapshot.json';

// =============================================================================================
// Shapes
// =============================================================================================

/** One payout as the index (or the bundled snapshot) lists it. `source` replaces the raw memo. */
export interface RawPayoutEvent {
  chainId: number;
  txHash: string;
  logIndex: number;
  timestamp: number;
  symbol: string;
  /** Integer string, 18 decimals. */
  amount18: string;
  memo?: string | null;
  source?: string;
  /**
   * Moon Rave order id (`rv_<16 hex>`) parsed from a `tt:rave:<16 hex>` memo. The only memo content
   * kept after stripMemo: the rave order id is public (CHECKOUT-SPEC.md section 1).
   */
  raveOrderId?: string;
}

/** How far the index has read one split (from `contracts[]`). */
export interface IndexedContract {
  chainId: number;
  symbol: string;
  indexedThrough?: { block?: number; time?: number; at?: string } | null;
  lastRunFailed?: boolean;
  count?: number;
}

export interface SnapshotFile {
  asOf: string;
  events: RawPayoutEvent[];
  contracts?: IndexedContract[];
  /**
   * Live reads only: the page cap (MAX_PAGES) stopped the read early, or fewer events came back than
   * the index's own `count`. The snapshot is then marked stale (it may undercount).
   */
  truncated?: boolean;
}

/** A split whose index is behind (failed last run, or last run older than STALE_AFTER_MS). */
export interface StaleChain {
  chainId: number;
  name: string;
  symbol: string;
  /** ISO time of the index's last successful read of this split, or null if unknown. */
  indexedAt: string | null;
  lastRunFailed: boolean;
}

// =============================================================================================
// Tunables (lane-local; config.ts is frozen)
// =============================================================================================

/** A split is stale when its index run is older than this (SPEC.md §13, same as the other readers). */
export const STALE_AFTER_MS = 15 * 60_000;
/** load() waits this long for live data before it answers with the bundled snapshot. */
export const LOAD_WAIT_MS = 1_200;
/** Per-request timeout. */
export const FETCH_TIMEOUT_MS = 10_000;
/**
 * Safety cap on index pages for one read (2,000 events each, so 1M events): far above anything the
 * treat caps can reach for years. Polls read only the newest pages (see fetchPayouts), so the cap
 * only bounds a full re-read. scripts/snapshot.mjs reads without a lower cap either.
 */
export const MAX_PAGES = 500;
/** Never drop more than this many cats from the sky in one update; the rest just appear. */
export const MAX_DROP_INS = 24;
/** On the bundled → live swap, only cats completed this recently count as "just landed". */
export const RECENT_CAT_S = 15 * 60;
/** After a treat: re-read the index at these delays (index runs every 2 min, 30 s cache). */
export const TREAT_REFRESH_MS = [30_000, 150_000] as const;
/** An unconfirmed treat stops counting as "on its way" after this. */
export const PENDING_TTL_MS = 10 * 60_000;

// =============================================================================================
// Normalization
// =============================================================================================

/**
 * Sources this lane emits: the shared `PayoutSource` plus 'rave' (a Moon Rave checkout payout,
 * memo `tt:rave:<16 hex>`). types.ts is frozen for lanes; the integrator adds 'rave' to
 * `PayoutSource` there (and to ui/format.ts SOURCE_LABEL, which indexes by source).
 */
export type DataPayoutSource = PayoutSource | 'rave';

/** A payout as this lane builds it: the shared shape plus the rave order id when its memo carried one. */
export type RavePayout = Payout & { raveOrderId?: string };

const RAVE_MEMO_RE = /^tt:rave:([0-9a-f]{16})$/;
const RAVE_ORDER_RE = /^rv_[0-9a-f]{16}$/;

/** `tt:rave:<16 hex>` (Tempo: trailing NULs of the decoded bytes32 tolerated) → `rv_<16 hex>`, else null. */
export function raveOrderIdFromMemo(memo: string | null | undefined): string | null {
  const m = RAVE_MEMO_RE.exec(String(memo || '').replace(/\u0000+$/, '').trim().toLowerCase());
  return m ? `rv_${m[1]}` : null;
}

/** A checked rave order id (`rv_<16 hex>`, lower case), or null. */
export function cleanRaveOrderId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const v = id.trim().toLowerCase();
  return RAVE_ORDER_RE.test(v) ? v : null;
}

/** The rave order a payout paid for, or null (not a Moon Rave payout). */
export function raveOrderIdOf(p: Payout | null | undefined): string | null {
  return (p as RavePayout | null | undefined)?.raveOrderId ?? null;
}

/** Memo → public source label (same rule as scripts/snapshot.mjs). Raw memos are never displayed. */
export function sourceOf(memo: string | null | undefined): DataPayoutSource {
  const m = String(memo || '').trim();
  if (m.startsWith('tt:rave:')) return 'rave';
  if (m.startsWith('tt:page:') || m.startsWith('tt:treat:')) return 'treat';
  if (m.startsWith('tt:heist:')) return 'heist';
  if (m.startsWith('tt:wallet')) return 'wallet';
  if (m.startsWith('tt:cat:')) return 'adoption';
  if (m.startsWith('tt:match:')) return 'match';
  if (m.startsWith('tt:paws:')) return 'paws';
  if (m.startsWith('motored:')) return 'partner';
  if (/first payout/i.test(m)) return 'proof';
  if (/campaign/i.test(m)) return 'campaign';
  return 'gift';
}

const SOURCES: readonly DataPayoutSource[] = ['rave', 'treat', 'heist', 'wallet', 'adoption', 'match', 'paws', 'partner', 'proof', 'campaign', 'gift'];

/** Human label for a source (cat card, shout-outs). */
export const SOURCE_LABEL: Readonly<Record<DataPayoutSource, string>> = Object.freeze({
  rave: 'Moon Rave cat',
  treat: 'free treat',
  heist: 'Catnip Heist treat',
  wallet: 'wallet gift',
  adoption: 'shelter-cat adoption',
  match: 'sponsor match',
  paws: 'paw settlement',
  partner: 'partner campaign',
  proof: 'first payout',
  campaign: 'campaign gift',
  gift: 'gift',
});

/** amount18 → integer micro-USD, or null for a symbol that is not a dollar or euro stablecoin. */
export function toUsdMicro(symbol: string, amount18: string): number | null {
  let v: bigint;
  try {
    v = BigInt(amount18);
  } catch {
    return null;
  }
  if (v < 0n) return null;
  const micro = v / 10n ** 12n; // 18 → 6 decimals, truncating (never rounds up)
  if (USD_SYMBOLS.includes(symbol)) return Number(micro);
  if (symbol === 'EURC') return Math.floor(Number(micro) * EURC_USD);
  return null; // gas coins and unknown tokens are not counted
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** "10000000000000000" → "0.01" (6 decimals max, trailing zeros trimmed). */
export function amountText(amount18: string): string {
  const v = BigInt(amount18);
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** USD text for micro-USD: 9_970_000 → "$9.97", 30_000 → "3¢". */
export function formatUsd(micro: number, opts: { cents?: boolean } = {}): string {
  if (opts.cents && micro < MICRO) {
    const c = Math.ceil(micro / 10_000);
    return `${c}¢`;
  }
  const cents = Math.floor(micro / 10_000);
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}

const TX_RE = /^0x[0-9a-fA-F]{64}$/;

/** `url` if it is an absolute https: URL, else null (links shown to viewers go through this). */
export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function normalizeEvent(e: RawPayoutEvent): RavePayout | null {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.txHash !== 'string' || !TX_RE.test(e.txHash)) return null;
  if (!Number.isFinite(e.timestamp) || !Number.isInteger(e.logIndex)) return null;
  const usdMicro = toUsdMicro(e.symbol, e.amount18);
  if (usdMicro === null || usdMicro <= 0) return null;
  const chain = CHAINS[e.chainId];
  if (!chain) return null; // only the mainnet Pink Paw splits
  const raveOrderId = cleanRaveOrderId(e.raveOrderId) ?? raveOrderIdFromMemo(e.memo);
  const src: DataPayoutSource = raveOrderId
    ? 'rave'
    : e.source && (SOURCES as readonly string[]).includes(e.source)
      ? (e.source as DataPayoutSource)
      : sourceOf(e.memo);
  const tx = e.txHash.toLowerCase();
  return {
    id: `${e.chainId}:${tx}:${e.logIndex}`,
    chainId: e.chainId,
    chainName: chain.name,
    txHash: tx,
    logIndex: e.logIndex,
    timestamp: e.timestamp,
    symbol: e.symbol,
    amountText: amountText(e.amount18),
    usdMicro,
    // 'rave' is not in the frozen PayoutSource union yet (see DataPayoutSource).
    source: src as PayoutSource,
    explorerTxUrl: explorerTx(chain.explorer, tx),
    ...(raveOrderId ? { raveOrderId } : {}),
  };
}

/** Index event (with raw memo) → bundle/feed event (memo reduced to a source label). */
export function stripMemo(e: RawPayoutEvent): RawPayoutEvent {
  return {
    chainId: Number(e.chainId),
    txHash: String(e.txHash),
    logIndex: Number(e.logIndex),
    timestamp: Number(e.timestamp),
    symbol: String(e.symbol),
    amount18: String(e.amount18),
    ...stripSource(e),
  };
}

function stripSource(e: RawPayoutEvent): { source: string; raveOrderId?: string } {
  const raveOrderId = cleanRaveOrderId(e.raveOrderId) ?? raveOrderIdFromMemo(e.memo);
  if (raveOrderId) return { source: 'rave', raveOrderId };
  return { source: e.source && (SOURCES as readonly string[]).includes(e.source) ? e.source : sourceOf(e.memo) };
}

// =============================================================================================
// Staleness
// =============================================================================================

/** Splits whose index is behind `asOf` by more than STALE_AFTER_MS, or whose last run failed. */
export function staleChainsOf(contracts: readonly IndexedContract[] | undefined, asOfMs: number): StaleChain[] {
  const out: StaleChain[] = [];
  for (const c of contracts ?? []) {
    const chain = CHAINS[c.chainId];
    if (!chain) continue;
    const at = c.indexedThrough?.at ?? (c.indexedThrough?.time ? new Date(c.indexedThrough.time * 1000).toISOString() : null);
    const atMs = at ? Date.parse(at) : NaN;
    const behind = !Number.isFinite(atMs) || asOfMs - atMs > STALE_AFTER_MS;
    if (behind || c.lastRunFailed) out.push({ chainId: c.chainId, name: chain.name, symbol: c.symbol, indexedAt: at, lastRunFailed: !!c.lastRunFailed });
  }
  return out;
}

/** Short chain names of stale splits, deduped (Arc's USDC and EURC splits are one "Arc"). */
export function delayedNames(stale: readonly StaleChain[]): string[] {
  const out: string[] = [];
  for (const c of stale) {
    const n = CHAINS[c.chainId]?.short ?? c.name;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// =============================================================================================
// The count rule
// =============================================================================================

/** DEMO flags: a weighted mix so a `?cats=` crowd shows a leaderboard; about 1 cat in 4 holds none. */
const DEMO_COUNTRIES = ['LT', 'LT', 'LT', 'US', 'US', 'DE', 'GB', 'FR', 'PL', 'UA', 'BR', 'JP', 'IT', 'ES', 'NL', 'SE', 'CA', 'IN', 'KR', 'MX', 'LV', 'EE'];
export function demoCountry(seed: number): string | null {
  const r = (seed * 7919) % 1;
  if (r < 0.25) return null;
  return DEMO_COUNTRIES[Math.floor(((r - 0.25) / 0.75) * DEMO_COUNTRIES.length) % DEMO_COUNTRIES.length];
}

/**
 * The count rule: payouts oldest first (timestamp, chainId, logIndex); the running total in
 * micro-USD; each whole dollar crossed is one cat, named by the payout that crossed it. Totals are
 * summed as integers, so 100 treats of $0.01 make exactly one cat.
 */
export function buildSnapshot(
  file: SnapshotFile,
  opts: { origin: 'live' | 'snapshot'; demoCats?: number | null; stale?: boolean; delayedChains?: readonly string[] },
): PayoutSnapshot {
  const seen = new Set<string>();
  const payouts: Payout[] = [];
  for (const e of file.events) {
    const p = normalizeEvent(e);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      payouts.push(p);
    }
  }
  payouts.sort((a, b) => a.timestamp - b.timestamp || a.chainId - b.chainId || a.logIndex - b.logIndex);

  const catList: RaveCat[] = [];
  const byChain = new Map<number, { chainId: number; name: string; usdMicro: number; count: number }>();
  let total = 0;
  let contributors = 0;
  for (const p of payouts) {
    p.fedCat = Math.floor(total / MICRO);
    total += p.usdMicro;
    contributors += 1;
    const row = byChain.get(p.chainId) ?? { chainId: p.chainId, name: p.chainName, usdMicro: 0, count: 0 };
    row.usdMicro += p.usdMicro;
    row.count += 1;
    byChain.set(p.chainId, row);
    while (Math.floor(total / MICRO) > catList.length) {
      const index = catList.length;
      catList.push({ index, payout: p, contributors, completedAt: p.timestamp, demo: false, seed: hashSeed(`${p.id}#${index}`) });
      contributors = 0; // the rest of a big payout starts the next dollar
    }
  }
  const realCats = catList.length;
  const remainder = total - realCats * MICRO;
  const demoCats = opts.demoCats ?? null;
  const cats = demoCats !== null ? Math.max(0, Math.min(100_000, Math.floor(demoCats))) : realCats;
  // DEMO: real cats keep their payouts; extra cats are clearly demo. A demo count below the real
  // count shows fewer cats (for testing the lonely floor).
  const shown = catList.slice(0, cats);
  for (let i = shown.length; i < cats; i++) {
    const seed = hashSeed(`demo#${i}`);
    shown.push({ index: i, payout: null, contributors: 0, completedAt: 0, demo: true, seed, country: demoCountry(seed) });
  }
  return {
    asOf: file.asOf,
    origin: opts.origin,
    demo: demoCats !== null,
    totalUsdMicro: total,
    realCats,
    cats,
    progressToNext: remainder / MICRO,
    microToNext: MICRO - remainder,
    payouts,
    catList: shown,
    byChain: [...byChain.values()].sort((a, b) => b.usdMicro - a.usdMicro),
    fx: { EURC: EURC_USD, source: EURC_USD_SOURCE },
    stale: opts.stale ?? false,
    ...(opts.delayedChains && opts.delayedChains.length ? { delayedChains: [...opts.delayedChains] } : {}),
  };
}

// =============================================================================================
// Diff, find
// =============================================================================================

/**
 * What changed between two snapshots. `newCats` are cats that did not exist before (drop these
 * in), never demo cats, at most MAX_DROP_INS (the latest). With `recentSince` (unix s), only cats
 * completed at or after it count (used on the bundled → live swap, so a stale bundle does not rain
 * a week of cats).
 */
export function diffSnapshots(prev: PayoutSnapshot | null, next: PayoutSnapshot, opts: { recentSince?: number } = {}): PayoutDiff {
  const had = new Set(prev?.payouts.map((p) => p.id) ?? []);
  const newPayouts = prev ? next.payouts.filter((p) => !had.has(p.id)) : [];
  const prevShown = prev?.catList.length ?? next.catList.length;
  let newCats = next.catList.filter((c) => c.index >= prevShown && !c.demo && c.payout !== null);
  if (opts.recentSince !== undefined) newCats = newCats.filter((c) => c.completedAt >= opts.recentSince!);
  if (newCats.length > MAX_DROP_INS) newCats = newCats.slice(-MAX_DROP_INS);
  return { newPayouts, newCats };
}

/** A tx hash query (full, or ≥8 hex chars with or without 0x) → its lower-case `0x…` prefix, else null. */
function txPrefix(query: string): string | null {
  const hex = String(query || '').trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{8,64}$/.test(hex) ? `0x${hex}` : null;
}

/** What a tx fed: the payout, the cat number it fed, and whether that cat is complete yet. */
export interface TxMatch {
  payout: Payout;
  /** 0-based index of the cat this payout fed (its first one, if it crossed several dollars). */
  catIndex: number;
  /** False while that cat is still forming (the payout is part of the next, unfinished dollar). */
  complete: boolean;
  /** 0..1 how formed the fed cat is (1 when complete). */
  progress: number;
}

/** Any payout's tx (not only the one that crossed a dollar) → the cat it fed. Newest match first. */
export function findTxIn(snapshot: PayoutSnapshot | null, query: string): TxMatch | null {
  const prefix = txPrefix(query);
  if (!snapshot || !prefix) return null;
  let hit: Payout | null = null;
  for (const p of snapshot.payouts) if (p.txHash.startsWith(prefix)) hit = p;
  if (!hit || hit.fedCat === undefined) return null;
  const complete = hit.fedCat < snapshot.realCats;
  return { payout: hit, catIndex: hit.fedCat, complete, progress: complete ? 1 : snapshot.progressToNext };
}

/**
 * "#12" / "12" / "cat 12" / "cat #12" → cat 12; a full tx hash or ≥8 hex chars of one (with or
 * without 0x) → the first completed cat that payout fed (any payout, not only dollar-crossers).
 */
export function findCatIn(snapshot: PayoutSnapshot | null, query: string): RaveCat | null {
  if (!snapshot) return null;
  const q = String(query || '').trim().toLowerCase().replace(/^cat\s*/, '').replace(/^#\s*/, '');
  if (/^\d{1,7}$/.test(q)) {
    const n = Number(q);
    return n >= 1 ? (snapshot.catList[n - 1] ?? null) : null;
  }
  const prefix = txPrefix(q);
  if (!prefix) return null;
  const crossed = snapshot.catList.find((c) => c.payout?.txHash.startsWith(prefix));
  if (crossed) return crossed;
  const m = findTxIn(snapshot, prefix);
  return m?.complete ? (snapshot.catList[m.catIndex] ?? null) : null;
}

/**
 * All shown cats a tx produced (a $5 gift = 5 cats); for a payout that crossed no dollar, the one
 * completed cat it fed. Accepts a full hash or a ≥8-hex prefix.
 */
export function catsForTxIn(snapshot: PayoutSnapshot | null, txHash: string): RaveCat[] {
  const prefix = txPrefix(txHash);
  if (!snapshot || !prefix) return [];
  const first = snapshot.catList.find((c) => c.payout?.txHash.startsWith(prefix));
  if (first?.payout) {
    const tx = first.payout.txHash;
    return snapshot.catList.filter((c) => c.payout?.txHash === tx);
  }
  const m = findTxIn(snapshot, prefix);
  const cat = m?.complete ? snapshot.catList[m.catIndex] : undefined;
  return cat ? [cat] : [];
}

/** Card text for a cat: "Cat #12 · $0.10 USDC on Arc · Oct 16, 2026 · wallet gift". */
export function describeCat(cat: RaveCat): { title: string; line: string; extra: string | null; url: string | null } {
  const title = `Cat #${cat.index + 1}`;
  if (!cat.payout) return { title, line: 'DEMO cat (no payout)', extra: null, url: null };
  const p = cat.payout;
  const date = new Date(p.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return {
    title,
    line: `${p.amountText} ${p.symbol} on ${p.chainName} · ${date} · ${SOURCE_LABEL[p.source]}`,
    extra: cat.contributors > 1 ? `made of ${cat.contributors} payouts` : null,
    url: p.explorerTxUrl,
  };
}

// =============================================================================================
// Network
// =============================================================================================

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PayoutFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'PayoutFetchError';
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ status: number; body: unknown }> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl?.signal, headers: { accept: 'application/json', ...(init.headers as Record<string, string> | undefined) } });
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

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Dedupe key of an index event (same as Payout.id). */
export function eventKey(e: Pick<RawPayoutEvent, 'chainId' | 'txHash' | 'logIndex'>): string {
  return `${Number(e.chainId)}:${String(e.txHash).toLowerCase()}:${Number(e.logIndex)}`;
}

/**
 * Reads the mainnet index. Memos are reduced to source labels here, so a raw memo never leaves this
 * function. Throws PayoutFetchError on HTTP errors (409 not indexed, 424 index unavailable, 429
 * throttled) or a malformed body.
 *
 * With `known` (the events of the last good read, already stripped): reads the newest pages only,
 * until a page holds an event it already has, then merges (events are deduped by
 * chainId:tx:logIndex, so the overlap is safe). If the merged list does not match the index's
 * `count` (a lagging chain caught up with older events, or the index dropped one), it falls back to
 * one full read. Without `known`: reads every page.
 */
export async function fetchPayouts(api: string, fetchImpl: FetchLike = fetch, known?: readonly RawPayoutEvent[] | null): Promise<SnapshotFile> {
  const base = api.replace(/\/+$/, '');
  const knownKeys = known && known.length ? new Set(known.map(eventKey)) : null;
  const events: RawPayoutEvent[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let asOf: string | null = null;
  let contracts: IndexedContract[] = [];
  let expected: number | null = null;
  let reachedKnown = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${base}${PAYOUTS_PATH}?network=mainnet&limit=2000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { status, body } = await fetchJson(fetchImpl, url);
    const b = obj(body);
    if (status < 200 || status >= 300 || !b) {
      const code = b && typeof b.code === 'string' ? b.code : null;
      throw new PayoutFetchError(`payouts HTTP ${status}${code ? ` ${code}` : ''}`, status, code);
    }
    if (!Array.isArray(b.events)) throw new PayoutFetchError('payouts: no events array', status, null);
    if (page === 0) {
      asOf = typeof b.generatedAt === 'string' ? b.generatedAt : new Date().toISOString();
      expected = typeof b.count === 'number' && Number.isFinite(b.count) ? b.count : null;
      contracts = Array.isArray(b.contracts)
        ? (b.contracts as unknown[]).map(obj).filter((c): c is Record<string, unknown> => !!c).map((c) => ({
            chainId: Number(c.chainId),
            symbol: String(c.symbol ?? ''),
            indexedThrough: (obj(c.indexedThrough) as IndexedContract['indexedThrough']) ?? null,
            lastRunFailed: !!c.lastRunFailed,
            count: Number(c.count ?? 0),
          }))
        : [];
    }
    for (const e of b.events as RawPayoutEvent[]) {
      if (!obj(e)) continue;
      const k = eventKey(e);
      if (knownKeys?.has(k)) {
        reachedKnown = true;
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      events.push(stripMemo(e));
    }
    cursor = typeof b.nextCursor === 'string' && b.nextCursor ? b.nextCursor : null;
    // Newest first: once a page reaches events we already hold, every older page is known too.
    if (!cursor || reachedKnown) break;
  }
  if (knownKeys && known && reachedKnown) {
    const merged = [...events];
    for (const e of known) {
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(e);
    }
    // Counts disagree: something older than our newest known event changed. Read it all once.
    if (expected !== null && merged.length !== expected) return fetchPayouts(api, fetchImpl, null);
    return { asOf: asOf ?? new Date().toISOString(), events: merged, contracts };
  }
  // Still a cursor after MAX_PAGES, or fewer events than the index says it has: cut short.
  const truncated = cursor !== null || (expected !== null && events.length < expected);
  return { asOf: asOf ?? new Date().toISOString(), events, contracts, ...(truncated ? { truncated: true } : {}) };
}

/** Free-treat rail state (`GET {api}/shelter/donate/status`). */
export interface TreatStatus {
  /** Show the in-page button: enabled, railState 'live', treats left today. */
  live: boolean;
  railState: string;
  treatsLeftToday: number;
  resetsAt: string | null;
  chainId: number | null;
  /** What one treat pays the shelter, micro-USD (10_000 = $0.01). */
  amountUsdMicro: number;
}

export async function treatStatus(api: string, fetchImpl: FetchLike = fetch): Promise<TreatStatus | null> {
  try {
    const { status, body } = await fetchJson(fetchImpl, `${api.replace(/\/+$/, '')}${LINKS.treatStatusPath}`);
    const b = obj(body);
    if (status !== 200 || !b) return null;
    const railState = String(b.railState ?? 'unknown');
    const left = Math.max(0, Math.floor(Number(b.treatsLeftToday) || 0));
    let amount = 10_000;
    try {
      if (typeof b.amountWei === 'string') amount = Number(BigInt(b.amountWei) / 10n ** 12n);
    } catch {
      /* keep the default */
    }
    return {
      live: b.enabled === true && railState === 'live' && left > 0,
      railState,
      treatsLeftToday: left,
      resetsAt: typeof b.resetsAt === 'string' ? b.resetsAt : null,
      chainId: typeof b.chainId === 'number' ? b.chainId : null,
      amountUsdMicro: amount,
    };
  } catch {
    return null;
  }
}

/** Hosts where the guest treat endpoint answers (its CORS allow-list). Elsewhere link to LINKS.give. */
export function treatAllowedHere(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h === 'tokentails.com' || h === 'www.tokentails.com';
}

export type TreatResult =
  | { ok: true; txHash: string; chainId: number; explorerUrl: string; amountUsdMicro: number }
  | {
      ok: false;
      /** already-today: one per visitor per UTC day; blocked: CORS/network (use LINKS.give). */
      reason: 'already-today' | 'paused' | 'budget-spent' | 'throttled' | 'blocked' | 'failed';
      message: string;
    };

/** Sends the free treat: Token Tails pays $0.01 to the shelter split. Never throws. */
export async function sendTreat(api: string, fetchImpl: FetchLike = fetch): Promise<TreatResult> {
  let res: { status: number; body: unknown };
  try {
    res = await fetchJson(fetchImpl, `${api.replace(/\/+$/, '')}${LINKS.treatPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'page' }),
    }, 20_000);
  } catch {
    return { ok: false, reason: 'blocked', message: 'Could not reach the treat rail from this page.' };
  }
  const b = obj(res.body);
  if (res.status >= 200 && res.status < 300 && b && typeof b.txHash === 'string') {
    const chainId = Number(b.chainId);
    const chain = CHAINS[chainId];
    let amount = 10_000;
    try {
      if (typeof b.amountWei === 'string') amount = Number(BigInt(b.amountWei) / 10n ** 12n);
    } catch {
      /* default */
    }
    // Never trust a link from the response: rebuild it from our own explorer table and a checked hash.
    const tx = TX_RE.test(b.txHash) ? b.txHash.toLowerCase() : null;
    const explorerUrl = chain && tx ? explorerTx(chain.explorer, tx) : LINKS.payouts;
    return { ok: true, txHash: tx ?? '', chainId, explorerUrl, amountUsdMicro: amount };
  }
  const code = b && typeof b.code === 'string' ? b.code : '';
  const message = b && typeof b.message === 'string' ? b.message : `Treat failed (HTTP ${res.status}).`;
  if (code === 'DONATE_ALREADY_TODAY') return { ok: false, reason: 'already-today', message };
  if (code === 'DONATE_PAUSED') return { ok: false, reason: 'paused', message };
  if (code === 'DONATE_BUDGET_SPENT') return { ok: false, reason: 'budget-spent', message };
  if (res.status === 429) return { ok: false, reason: 'throttled', message };
  return { ok: false, reason: 'failed', message };
}

// =============================================================================================
// Feed
// =============================================================================================

export const BUNDLED: SnapshotFile = bundled as unknown as SnapshotFile;

export interface PayoutFeedOptions {
  /** API base (https://api.tokentails.com), or null for the bundled snapshot only. */
  api: string | null;
  demoCats: number | null;
  /** Test seams. */
  fetch?: FetchLike;
  now?: () => number;
  /** Visibility source; defaults to `document` in the browser. */
  visibility?: { readonly hidden: boolean; addEventListener(t: 'visibilitychange', cb: () => void): void; removeEventListener(t: 'visibilitychange', cb: () => void): void } | null;
  bundle?: SnapshotFile;
  loadWaitMs?: number;
}

export interface PendingTreat {
  txHash: string;
  usdMicro: number;
  explorerUrl: string;
  sentAt: number;
}

/** PayoutFeed plus lane extras the HUD may use (all optional to consumers). */
export interface RavePayoutFeed extends PayoutFeed {
  /** Any payout's tx → the cat it fed, complete or still forming. */
  findTx(query: string): TxMatch | null;
  /** Splits the index is behind on (why `stale` is true). */
  readonly staleChains: StaleChain[];
  /** Last fetch error text, or null. */
  readonly lastError: string | null;
  /** Treats sent from this page not yet in the index ("on its way"; never in the count). */
  readonly pending: PendingTreat[];
  /** micro-USD on its way (sum of `pending`). The HUD may draw the progress paw this much ahead, labelled. */
  readonly pendingUsdMicro: number;
  /** Ms until the next scheduled poll (debug). */
  readonly nextPollInMs: number | null;
  /** Free-treat helpers bound to this feed's API (null API → status null, send 'blocked'). */
  treatStatus(): Promise<TreatStatus | null>;
  /** Sends the treat; on success records it as pending and re-reads the index at 30 s and 2.5 min. */
  sendTreat(): Promise<TreatResult>;
  dispose(): void;
}

/** Poll delay after `failures` consecutive failures: 60 s, 120 s, 240 s, then 5 min. */
export function pollDelay(failures: number): number {
  return Math.min(POLL_MAX_MS, POLL_MS * 2 ** Math.max(0, failures));
}

export function createPayoutFeed(opts: PayoutFeedOptions): RavePayoutFeed {
  const api = opts.api ? opts.api.replace(/\/+$/, '') : null;
  const fetchImpl: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const now = opts.now ?? (() => Date.now());
  const vis = opts.visibility !== undefined ? opts.visibility : typeof document !== 'undefined' ? document : null;
  const bundle = opts.bundle ?? BUNDLED;
  const loadWait = opts.loadWaitMs ?? LOAD_WAIT_MS;

  const listeners = new Set<(s: PayoutSnapshot, d: PayoutDiff) => void>();
  let current: PayoutSnapshot | null = null;
  let staleChains: StaleChain[] = [];
  let lastError: string | null = null;
  let failures = 0;
  let lastFetchAt = 0;
  let inflight: Promise<PayoutSnapshot> | null = null;
  let loadPromise: Promise<PayoutSnapshot> | null = null;
  let loaded = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let nextAt: number | null = null;
  const treatTimers = new Set<ReturnType<typeof setTimeout>>();
  let pending: PendingTreat[] = [];
  let disposed = false;
  /** Events of the last complete live read: later polls fetch only the newer pages and merge. */
  let knownEvents: readonly RawPayoutEvent[] | null = null;

  const build = (file: SnapshotFile, origin: 'live' | 'snapshot', stale: boolean, delayedChains?: readonly string[]) =>
    buildSnapshot(file, { origin, demoCats: opts.demoCats, stale, delayedChains });

  function prunePending(snap: PayoutSnapshot | null) {
    const t = now();
    const have = new Set(snap?.payouts.map((p) => p.txHash) ?? []);
    pending = pending.filter((p) => !have.has(p.txHash) && t - p.sentAt < PENDING_TTL_MS);
  }

  function emit(next: PayoutSnapshot, diff: PayoutDiff) {
    for (const cb of [...listeners]) {
      try {
        cb(next, diff);
      } catch (err) {
        console.error('[cat-rave] payout subscriber failed', err);
      }
    }
  }

  /** Swap in a new snapshot; notify after the first load when anything visible changed. */
  function apply(next: PayoutSnapshot, recentSince?: number) {
    const prev = current;
    current = next;
    prunePending(next);
    if (!loaded || !prev) return;
    const diff = diffSnapshots(prev, next, recentSince !== undefined ? { recentSince } : {});
    const changed =
      diff.newPayouts.length > 0 ||
      prev.totalUsdMicro !== next.totalUsdMicro ||
      prev.payouts.length !== next.payouts.length ||
      prev.stale !== next.stale ||
      !!prev.fetchFailed !== !!next.fetchFailed ||
      (prev.delayedChains ?? []).join() !== (next.delayedChains ?? []).join() ||
      prev.origin !== next.origin;
    if (changed) emit(next, diff);
  }

  function markFailed(err: unknown) {
    failures += 1;
    lastError = err instanceof Error ? err.message : String(err);
    // A live snapshot whose latest read failed must stop saying "live" (sourceLine shows "as of").
    if (current && (!current.stale || (current.origin === 'live' && !current.fetchFailed))) {
      apply({ ...current, stale: true, ...(current.origin === 'live' ? { fetchFailed: true } : {}) });
    }
  }

  /** One live read; never rejects (falls back to the current snapshot marked stale). */
  function fetchLive(): Promise<PayoutSnapshot> {
    if (!api) return Promise.resolve(current ?? build(bundle, 'snapshot', false));
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const file = await fetchPayouts(api, fetchImpl, knownEvents);
        if (!file.truncated) knownEvents = file.events;
        lastFetchAt = now();
        const asOfMs = Date.parse(file.asOf);
        staleChains = staleChainsOf(file.contracts, Number.isFinite(asOfMs) ? asOfMs : now());
        failures = 0;
        lastError = file.truncated ? 'payouts: read cut short (page cap or count mismatch)' : null;
        const next = build(file, 'live', staleChains.length > 0 || !!file.truncated, delayedNames(staleChains));
        const fromBundle = current?.origin === 'snapshot';
        apply(next, fromBundle ? Math.floor(now() / 1000) - RECENT_CAT_S : undefined);
        return current!;
      } catch (err) {
        lastFetchAt = now();
        markFailed(err);
        return current ?? build(bundle, 'snapshot', true);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function schedule(delay: number) {
    if (timer) clearTimeout(timer);
    timer = null;
    nextAt = null;
    if (!polling || disposed || !api) return;
    if (vis?.hidden) return; // resumes on visibilitychange
    nextAt = now() + delay;
    timer = setTimeout(async () => {
      timer = null;
      nextAt = null;
      await fetchLive();
      schedule(pollDelay(failures));
    }, delay);
  }

  const onVisibility = () => {
    if (!polling) return;
    if (vis?.hidden) {
      if (timer) clearTimeout(timer);
      timer = null;
      nextAt = null;
      return;
    }
    // Coming back to the tab keeps the failure back-off (a 429/5xx streak stays at up to 5 min).
    const since = now() - lastFetchAt;
    schedule(Math.max(pollDelay(failures) - since, 0));
  };
  vis?.addEventListener('visibilitychange', onVisibility);

  const feed: RavePayoutFeed = {
    load() {
      if (loadPromise) return loadPromise;
      current = build(bundle, 'snapshot', false);
      staleChains = staleChainsOf(bundle.contracts, Date.parse(bundle.asOf) || now());
      loadPromise = (async () => {
        if (api) {
          const live = fetchLive();
          let timeout: ReturnType<typeof setTimeout> | null = null;
          await Promise.race([live, new Promise<void>((r) => (timeout = setTimeout(r, loadWait)))]);
          if (timeout) clearTimeout(timeout);
          // If live is still running it will notify subscribers when it lands.
        }
        loaded = true;
        return current!;
      })();
      return loadPromise;
    },
    get current() {
      return current;
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    startPolling() {
      if (polling || !api) return;
      polling = true;
      const since = now() - lastFetchAt;
      schedule(lastFetchAt && since < POLL_MS ? POLL_MS - since : lastFetchAt ? 0 : POLL_MS);
    },
    stopPolling() {
      polling = false;
      if (timer) clearTimeout(timer);
      timer = null;
      nextAt = null;
    },
    async refresh() {
      if (!loadPromise) await feed.load();
      const s = await fetchLive();
      if (polling) schedule(pollDelay(failures));
      return s;
    },
    findCat: (query) => findCatIn(current, query),
    findTx: (query) => findTxIn(current, query),
    catsForTx: (tx) => catsForTxIn(current, tx),
    get staleChains() {
      return staleChains;
    },
    get lastError() {
      return lastError;
    },
    get pending() {
      prunePending(current);
      return pending;
    },
    get pendingUsdMicro() {
      prunePending(current);
      return pending.reduce((s, p) => s + p.usdMicro, 0);
    },
    get nextPollInMs() {
      return nextAt === null ? null : Math.max(0, nextAt - now());
    },
    treatStatus: () => (api ? treatStatus(api, fetchImpl) : Promise.resolve(null)),
    async sendTreat() {
      if (!api) return { ok: false, reason: 'blocked', message: 'No API on this page.' };
      const r = await sendTreat(api, fetchImpl);
      if (r.ok) {
        pending.push({ txHash: r.txHash, usdMicro: r.amountUsdMicro, explorerUrl: r.explorerUrl, sentAt: now() });
        for (const ms of TREAT_REFRESH_MS) {
          const t = setTimeout(() => {
            treatTimers.delete(t);
            void feed.refresh();
          }, ms);
          treatTimers.add(t);
        }
      }
      return r;
    },
    dispose() {
      disposed = true;
      feed.stopPolling();
      for (const t of treatTimers) clearTimeout(t);
      treatTimers.clear();
      listeners.clear();
      vis?.removeEventListener('visibilitychange', onVisibility);
    },
  };
  return feed;
}

// copy-lint: web-only data helper; the copy that names the index renders only on the web payouts page
// The backend's index of ShelterSplit payouts (GET /shelter/payouts): the same public Disbursed and
// NativeDisbursed events the page used to read from every chain's public RPC, read once by the
// backend and served with their block times. The page reads the index first, then reads only the
// blocks after the index's `indexedThrough` from the chain itself, so nothing newer is missed. A
// contract the index has not read recently (or an unreachable backend) falls back to the full chain
// scan. Every payout still links to its transaction on the chain's explorer.
import { Disbursement } from "./logs";

export type PayoutNetwork = "mainnet" | "testnet";

export interface IndexedThrough {
  block: number | null;
  /** Block time, unix seconds. */
  time: number | null;
  at: string | null;
}

export interface IndexedContract {
  chainId: number;
  contract: string;
  indexedThrough: IndexedThrough;
  count: number;
}

export interface IndexedEvent {
  chainId: number;
  contract: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: number;
  shelter: string;
  kind: "token" | "native";
  amount: string;
  decimals: number;
  symbol: string;
  amount18: string;
  /** Display text: the backend decodes a Tempo bytes32 memo (0x-hex) to text; `memoRaw` is as emitted. */
  memo: string;
  /** Older backends omit it. */
  memoRaw?: string;
}

export interface PayoutIndex {
  network: PayoutNetwork;
  contracts: IndexedContract[];
  events: IndexedEvent[];
}

/** A contract whose index lags the chain by more than this is read from the chain instead. */
export const INDEX_STALE_MS = 15 * 60_000;
/** Rows per request, and the most pages one page view follows. */
export const INDEX_PAGE_LIMIT = 2000;
export const INDEX_MAX_PAGES = 10;
/** One index read per network is shared by every card for this long. */
export const INDEX_REUSE_MS = 60_000;
/** The index request gives up after this long; the chain scan then runs as before. */
export const INDEX_TIMEOUT_MS = 6_000;

const ADDRESS = /^0x[0-9a-f]{40}$/;
const HASH = /^0x[0-9a-f]{64}$/;
const UINT = /^\d{1,78}$/;

function validEvent(e: unknown): e is IndexedEvent {
  const v = e as IndexedEvent;
  return (
    !!v &&
    Number.isSafeInteger(v.chainId) &&
    ADDRESS.test(String(v.contract)) &&
    HASH.test(String(v.txHash)) &&
    Number.isSafeInteger(v.logIndex) &&
    Number.isSafeInteger(v.blockNumber) &&
    Number.isSafeInteger(v.timestamp) &&
    ADDRESS.test(String(v.shelter)) &&
    (v.kind === "token" || v.kind === "native") &&
    UINT.test(String(v.amount)) &&
    typeof v.memo === "string"
  );
}

function validContract(c: unknown): c is IndexedContract {
  const v = c as IndexedContract;
  return !!v && Number.isSafeInteger(v.chainId) && ADDRESS.test(String(v.contract)) && !!v.indexedThrough;
}

/**
 * Every indexed payout of `network`, following the page cursor. Null when the backend is not
 * configured, unreachable, refuses (409: nothing indexed, 424: index unreadable) or answers garbage.
 */
export async function fetchPayoutIndex(
  network: PayoutNetwork,
  base: string | undefined,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = INDEX_TIMEOUT_MS
): Promise<PayoutIndex | null> {
  const root = (base || "").trim().replace(/\/+$/, "");
  if (!root) return null;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    let contracts: IndexedContract[] | null = null;
    const events: IndexedEvent[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < INDEX_MAX_PAGES; page++) {
      const q = new URLSearchParams({ network, limit: String(INDEX_PAGE_LIMIT) });
      if (cursor) q.set("cursor", cursor);
      const res = await fetchFn(`${root}/shelter/payouts?${q.toString()}`, {
        signal: ctl?.signal,
        credentials: "omit",
      } as RequestInit);
      if (!res.ok) return null;
      const body = await res.json();
      if (!body || !Array.isArray(body.contracts) || !Array.isArray(body.events)) return null;
      contracts ??= body.contracts.filter(validContract);
      for (const e of body.events) if (validEvent(e)) events.push(e);
      cursor = typeof body.nextCursor === "string" ? body.nextCursor : null;
      if (!cursor) return { network, contracts: contracts || [], events };
    }
    // More pages than one view follows: the list would be cut short, so the chains are read instead.
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const shared = new Map<string, { at: number; value: Promise<PayoutIndex | null> }>();

/** fetchPayoutIndex, shared by every card of one page view (and reused for INDEX_REUSE_MS). */
export function loadPayoutIndex(
  network: PayoutNetwork,
  base: string | undefined,
  fetchFn: typeof fetch = fetch,
  now: number = Date.now()
): Promise<PayoutIndex | null> {
  const key = `${network}|${base || ""}`;
  const hit = shared.get(key);
  if (hit && now - hit.at < INDEX_REUSE_MS) return hit.value;
  const value = fetchPayoutIndex(network, base, fetchFn);
  shared.set(key, { at: now, value });
  return value;
}

/** Test hook. */
export function resetPayoutIndexCache() {
  shared.clear();
}

/**
 * The indexed payouts of one contract and the last block the index has read, or null when the index
 * does not list the contract or has not read it within INDEX_STALE_MS (its block time lags).
 */
export function indexedPayoutsFor(
  index: PayoutIndex | null,
  chainId: number,
  address: string,
  now: number = Date.now(),
  staleMs: number = INDEX_STALE_MS
): { through: number; time: number; items: Disbursement[] } | null {
  if (!index) return null;
  const contract = address.toLowerCase();
  const entry = index.contracts.find((c) => c.chainId === chainId && c.contract === contract);
  const through = entry?.indexedThrough;
  if (!entry || typeof through?.block !== "number" || typeof through.time !== "number") return null;
  if (now - through.time * 1000 > staleMs) return null;
  const items: Disbursement[] = index.events
    .filter((e) => e.chainId === chainId && e.contract === contract && e.blockNumber <= through.block!)
    .map((e) => ({
      kind: e.kind,
      contract: e.contract,
      shelter: e.shelter,
      amount: BigInt(e.amount),
      memo: e.memo,
      txHash: e.txHash,
      blockNumber: e.blockNumber,
      logIndex: e.logIndex,
      timestamp: e.timestamp,
    }));
  // The index says how many it holds; a list cut short would understate the totals.
  if (items.length !== entry.count) return null;
  return { through: through.block, time: through.time, items };
}

/**
 * The index's last-known payouts of one contract, however far behind it is: what the page keeps
 * showing (labelled "updating") when the chain cannot be read right now. Null when the index does
 * not list the contract or its list is cut short.
 */
export function lastKnownPayoutsFor(
  index: PayoutIndex | null,
  chainId: number,
  address: string
): { through: number; time: number; items: Disbursement[] } | null {
  return indexedPayoutsFor(index, chainId, address, 0, Number.POSITIVE_INFINITY);
}

/** Indexed items plus the chain's newer ones, without duplicates, newest first. */
export function mergeDisbursements(indexed: Disbursement[], fresh: Disbursement[]): Disbursement[] {
  const seen = new Set<string>();
  const out: Disbursement[] = [];
  for (const d of [...fresh, ...indexed]) {
    const key = `${d.txHash.toLowerCase()}:${d.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

import { apiUrl } from "@/api/api";
import { ChainInfo, SHELTER_CHAINS } from "./chains";
import { Disbursement, PAYOUT_TOPICS, RpcLog, decodeDisbursedLog } from "./logs";
import { indexedPayoutsFor, lastKnownPayoutsFor, loadPayoutIndex, mergeDisbursements } from "./payoutIndex";

// One entry of public/shelter-payouts/deployments.json. The file is a copy of
// funding/framework/tracks/a-build/deployments.json (written by `fund a:ingest`),
// so only chainId and address are required. The optional fields let a human
// pin the scan start block or override the built-in chain settings.
export interface ShelterDeployment {
  contract?: string;
  chain?: string;
  network?: string;
  chainId: number;
  address: string;
  tx?: string;
  // The payout token `fund a:ingest` recorded ("USDC", or "EURC" for a second instance). Only a
  // non-USDC value changes the label: USDC deployments keep the chain's own symbol (USDC.e on Tempo).
  token?: string;
  verified?: boolean;
  proofTxs?: string[];
  fromBlock?: number;
  rpc?: string;
  explorer?: string;
  decimals?: number;
  symbol?: string;
}

export const DEPLOYMENTS_URL = "/shelter-payouts/deployments.json";

// Public RPCs cap eth_getLogs ranges, so a failed full-range query falls back to
// windows. The window starts at LOG_WINDOW blocks (or the chain's maxLogRange) and, on each
// rejected request, drops to the cap the RPC names in its error ("limited to a 1,000 range") or
// halves, down to MIN_LOG_WINDOW (rate-limit errors are retried in rpcCall, never halved); the
// scan stops after MAX_LOG_REQUESTS calls. A cap the chain config or the RPC names is exact, so it
// is used even under MIN_LOG_WINDOW (Monad's public RPCs: "limited to a 100 range").
export const LOG_WINDOW = 10_000;
export const MIN_LOG_WINDOW = 500;
export const MAX_LOG_REQUESTS = 400;

/** A deployment's non-USDC payout token symbol (e.g. "EURC"), or null for a USDC instance. */
export function deploymentToken(d: Pick<ShelterDeployment, "token">): string | null {
  // Keep a mixed-case spelling ("pathUSD", "mUSDC"); an all-lowercase one is upper-cased ("eurc").
  const raw = typeof d.token === "string" ? d.token.trim() : "";
  const t = raw === raw.toLowerCase() ? raw.toUpperCase() : raw;
  return t && t.toUpperCase() !== "USDC" ? t : null;
}

export function resolveChain(d: ShelterDeployment): ChainInfo | null {
  const known = SHELTER_CHAINS[d.chainId];
  const rpc = d.rpc || known?.rpc;
  const explorer = d.explorer || known?.explorer;
  if (!rpc || !explorer) return null;
  return {
    name: known?.name || d.chain || `Chain ${d.chainId}`,
    rpc,
    explorer: explorer.replace(/\/+$/, ""),
    decimals: d.decimals ?? known?.decimals ?? 6,
    symbol: d.symbol || deploymentToken(d) || known?.symbol || "USDC",
    nativeDecimals: known?.nativeDecimals,
    nativeSymbol: known?.nativeSymbol,
    balanceToken: known?.balanceToken,
    testnet: d.network === "testnet" || !!known?.testnet,
    maxLogRange: d.rpc ? undefined : known?.maxLogRange,
    logRpc: d.rpc ? undefined : known?.logRpc,
  };
}

/** A testnet entry: by its recorded network, or by a chain id the built-in list marks as a testnet. */
export const isTestnetDeployment = (d: Pick<ShelterDeployment, "network" | "chainId">): boolean =>
  d.network === "testnet" || (d.network !== "mainnet" && !!SHELTER_CHAINS[d.chainId]?.testnet);

/** The block cap an RPC names in a range error ("limited to a 1,000 range", "maximum 1000 blocks"). */
export function rangeLimitFrom(err: unknown): number | null {
  const m = /(?:limited to a|maximum(?: of)?|max(?:imum)?(?: block)? range(?: of)?|up to(?: a)?|ranges over)\s*([\d,]+)\s*(?:range|blocks?|$)/i.exec(
    (err as Error)?.message || ""
  );
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

let rpcId = 0;

// Public RPCs (Arc testnet especially) answer bursts with HTTP 429 or JSON-RPC -32005 for a few
// seconds. A rate-limited call is retried with exponential backoff instead of failing the card.
export const RATE_LIMIT_RETRIES = 5;
export const RATE_LIMIT_BACKOFF_MS = 500;
const RATE_LIMIT_MAX_BACKOFF_MS = 8_000;

export class RpcRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcRateLimitError";
    // Keeps instanceof working when TypeScript compiles classes to ES5 (as the Jest transform does).
    Object.setPrototypeOf(this, RpcRateLimitError.prototype);
  }
}

let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Test hook: replace the backoff timer. */
export function setRpcSleep(fn: (ms: number) => Promise<void>) {
  sleep = fn;
}

async function rpcOnce<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (res.status === 429) throw new RpcRateLimitError(`${method}: HTTP 429`);
  if (!res.ok) {
    // Keep the RPC's own message (Base answers a too-wide eth_getLogs with HTTP 413 and
    // "eth_getLogs is limited to a 1,000 range"): the log scan reads the cap from it.
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {
      /* no JSON body */
    }
    throw new Error(`${method}: HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const body = await res.json();
  if (body.error) {
    const msg = `${method}: ${body.error.message || "RPC error"}`;
    if (body.error.code === -32005 || /rate limit/i.test(body.error.message || "")) throw new RpcRateLimitError(msg);
    throw new Error(msg);
  }
  return body.result as T;
}

// One request in flight per RPC URL: the page reads balances, receipts and log windows for every
// deployment at once, and a burst is what earns the HTTP 429s. Calls to the same URL queue up.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(url: string, run: () => Promise<T>): Promise<T> {
  const prev = queues.get(url) || Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.catch(() => undefined);
  queues.set(url, tail);
  void tail.then(() => {
    if (queues.get(url) === tail) queues.delete(url);
  });
  return next;
}

export function rpcCall<T>(url: string, method: string, params: unknown[]): Promise<T> {
  return serial(url, () => rpcRetrying<T>(url, method, params));
}

// RPCs that 429 small bursts (a chain's minCallGapMs, e.g. Arc mainnet): each call, retries included,
// waits until that long after the previous call to the same URL. The scan then stays under the limit
// instead of burning its retries on 429s.
const CALL_GAPS = new Map<string, number>();
for (const c of Object.values(SHELTER_CHAINS)) {
  if (!c.minCallGapMs) continue;
  for (const u of [c.rpc, c.logRpc]) if (u) CALL_GAPS.set(u, c.minCallGapMs);
}
const lastCallAt = new Map<string, number>();
let now = () => Date.now();
/** Test hook: replace the clock used to space out calls. */
export function setRpcClock(fn: () => number) {
  now = fn;
}

// The slot is reserved before waiting, so calls stay one gap apart even if a caller ever bypasses the
// per-URL queue above.
async function paced(url: string) {
  const gap = CALL_GAPS.get(url);
  if (!gap) return;
  const t = now();
  const last = lastCallAt.get(url);
  const at = last === undefined ? t : Math.max(t, last + gap);
  lastCallAt.set(url, at);
  if (at > t) await sleep(at - t);
}

async function rpcRetrying<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let backoff = RATE_LIMIT_BACKOFF_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      await paced(url);
      return await rpcOnce<T>(url, method, params);
    } catch (err) {
      if (!(err instanceof RpcRateLimitError) || attempt >= RATE_LIMIT_RETRIES) throw err;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, RATE_LIMIT_MAX_BACKOFF_MS);
    }
  }
}

const hex = (n: number) => "0x" + n.toString(16);

async function startBlock(rpc: string, d: ShelterDeployment): Promise<number> {
  if (typeof d.fromBlock === "number") return d.fromBlock;
  if (d.tx) {
    const receipt = await rpcCall<{ blockNumber: string } | null>(rpc, "eth_getTransactionReceipt", [d.tx]);
    if (receipt?.blockNumber) return parseInt(receipt.blockNumber, 16);
  }
  return 0;
}

function getLogs(rpc: string, address: string, from: number, to: number | "latest") {
  return rpcCall<RpcLog[]>(rpc, "eth_getLogs", [
    {
      address,
      topics: [PAYOUT_TOPICS], // either event
      fromBlock: hex(from),
      toBlock: to === "latest" ? "latest" : hex(to),
    },
  ]);
}

/**
 * Scans [from, latest] in windows. A rejected window is retried at half the size, down to
 * MIN_LOG_WINDOW, so RPCs with small range caps still work. The total number of requests is
 * bounded by MAX_LOG_REQUESTS; past that the caller is told to pin "fromBlock".
 */
export async function getLogsWindowed(
  rpc: string,
  address: string,
  from: number,
  latest: number,
  get: (rpc: string, address: string, from: number, to: number) => Promise<RpcLog[]> = getLogs,
  firstWindow: number = LOG_WINDOW
): Promise<RpcLog[]> {
  const logs: RpcLog[] = [];
  // The smallest window: MIN_LOG_WINDOW, or a smaller cap named by the config or the RPC.
  let floor = Math.min(MIN_LOG_WINDOW, firstWindow);
  let window = Math.max(floor, firstWindow);
  let requests = 0;
  let start = from;
  while (start <= latest) {
    if (++requests > MAX_LOG_REQUESTS) {
      throw new Error(
        `eth_getLogs: stopped after ${MAX_LOG_REQUESTS} requests at block ${start} of ${latest}; set "fromBlock" in the entry`
      );
    }
    const end = Math.min(start + window - 1, latest);
    try {
      logs.push(...(await get(rpc, address, start, end)));
      start = end + 1;
    } catch (err) {
      // A smaller window does not help against a rate limit (rpcCall already backed off), it only
      // burns requests, so rethrow it instead of halving.
      if (err instanceof RpcRateLimitError) throw err;
      const cap = rangeLimitFrom(err);
      if (cap !== null && cap < window) {
        // The RPC named its cap: exact, so it may go under MIN_LOG_WINDOW.
        floor = Math.min(floor, cap);
        window = cap;
        continue;
      }
      if (window <= floor) throw err;
      window = Math.max(floor, Math.floor(window / 2));
    }
  }
  return logs;
}

/** Plain-language text for a failed chain read; the raw RPC message stays out of the page. */
export function readErrorText(err: unknown): string {
  return err instanceof RpcRateLimitError
    ? "The chain's public RPC is busy right now. Reload in a minute."
    : "Could not reach the chain right now. Reload in a minute.";
}

// Payouts read in the last few minutes come from sessionStorage, so a reload or a back-navigation
// does not fire the whole scan at the public RPCs again. Best effort: storage may be unavailable.
export const PAYOUTS_CACHE_MS = 5 * 60_000;
const cacheKey = (d: ShelterDeployment) => `tt-payouts:${d.chainId}:${d.address.toLowerCase()}`;

function readCache(d: ShelterDeployment, now: number): Disbursement[] | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(d));
    if (!raw) return null;
    const v = JSON.parse(raw) as { at: number; items: (Omit<Disbursement, "amount"> & { amount: string })[] };
    if (typeof v?.at !== "number" || now - v.at > PAYOUTS_CACHE_MS || !Array.isArray(v.items)) return null;
    return v.items.map((i) => ({ ...i, amount: BigInt(i.amount) }));
  } catch {
    return null;
  }
}

function writeCache(d: ShelterDeployment, items: Disbursement[], now: number) {
  try {
    const plain = items.map((i) => ({ ...i, amount: i.amount.toString() }));
    window.sessionStorage.setItem(cacheKey(d), JSON.stringify({ at: now, items: plain }));
  } catch {
    /* storage full or blocked: no cache */
  }
}

/** Where the page's payouts came from: the backend index plus the newest blocks, or the chain alone. */
export type PayoutSource = "index" | "chain";
const sources = new Map<string, PayoutSource>();
/** How the last read of `d` was made (for the card's small print), or undefined before one. */
export const payoutSourceOf = (d: ShelterDeployment): PayoutSource | undefined => sources.get(cacheKey(d));

/**
 * The figures of a contract the chain could not be read for right now: the index's last-known
 * payouts through `block` (block time `time`, unix seconds). The page shows them labelled
 * "updating" instead of dropping the contract.
 */
export interface PayoutsUpdating {
  block: number;
  time: number;
}

/** One contract's payouts, newest first, and `updating` when they stop at the index's last block. */
export interface PayoutRead {
  items: Disbursement[];
  updating?: PayoutsUpdating;
}

/**
 * Every payout of `d`, newest first. Reads the backend's payout index first (GET /shelter/payouts,
 * public on-chain events with block times) and then only the blocks after the index's
 * `indexedThrough` from the chain's RPC, so nothing newer is missed. When the backend is not
 * configured, unreachable or has not read this contract within INDEX_STALE_MS, the whole range is
 * read from the chain as before. A deployment with its own "rpc" is always read from that RPC.
 *
 * Indexed payouts are never dropped because a chain read failed: when the tail after the index (or
 * the full scan of a stale contract) fails, the index's last-known payouts stand and `updating`
 * says through which block. Only an unlisted contract with an unreadable chain throws.
 */
export async function readPayouts(
  d: ShelterDeployment,
  opts: { indexBase?: string; fetchFn?: typeof fetch; now?: number } = {}
): Promise<PayoutRead> {
  const cached = typeof window !== "undefined" ? readCache(d, Date.now()) : null;
  if (cached) return { items: cached };
  const base = "indexBase" in opts ? opts.indexBase : apiUrl;
  let read: PayoutRead | null = null;
  let lastKnown: ReturnType<typeof lastKnownPayoutsFor> = null;
  if (base && !d.rpc) {
    const network = isTestnetDeployment(d) ? "testnet" : "mainnet";
    const index = await loadPayoutIndex(network, base, opts.fetchFn ?? fetch, opts.now ?? Date.now());
    const indexed = indexedPayoutsFor(index, d.chainId, d.address, opts.now ?? Date.now());
    if (indexed) {
      try {
        const fresh = await scanDisbursements(d, indexed.through + 1);
        read = { items: mergeDisbursements(indexed.items, fresh) };
      } catch {
        // The chain is busy right now: the index stands, labelled with its last block.
        read = { items: mergeDisbursements(indexed.items, []), updating: { block: indexed.through, time: indexed.time } };
      }
      sources.set(cacheKey(d), "index");
    } else {
      lastKnown = lastKnownPayoutsFor(index, d.chainId, d.address);
    }
  }
  if (!read) {
    try {
      read = { items: await scanDisbursements(d) };
      sources.set(cacheKey(d), "chain");
    } catch (err) {
      // A stale index still knows every payout up to its last block: show those, never nothing.
      if (!lastKnown) throw err;
      read = { items: mergeDisbursements(lastKnown.items, []), updating: { block: lastKnown.through, time: lastKnown.time } };
      sources.set(cacheKey(d), "index");
    }
  }
  // Only a complete read is cached: an "updating" one is tried again on the next view.
  if (!read.updating && typeof window !== "undefined") writeCache(d, read.items, Date.now());
  return read;
}

/** readPayouts without the freshness: every payout of `d` that could be read, newest first. */
export async function fetchDisbursements(
  d: ShelterDeployment,
  opts: { indexBase?: string; fetchFn?: typeof fetch; now?: number } = {}
): Promise<Disbursement[]> {
  return (await readPayouts(d, opts)).items;
}

async function scanDisbursements(d: ShelterDeployment, fromBlock?: number): Promise<Disbursement[]> {
  const chain = resolveChain(d);
  if (!chain) throw new Error(`no public RPC known for chain ${d.chainId}; add "rpc" and "explorer" to the entry`);
  const from = fromBlock ?? (await startBlock(chain.rpc, d));

  let logs: RpcLog[];
  const logRpc = chain.logRpc || chain.rpc;
  const windowed = async () => {
    const latest = parseInt(await rpcCall<string>(logRpc, "eth_blockNumber", []), 16);
    return getLogsWindowed(logRpc, d.address, from, latest, getLogs, chain.maxLogRange ?? LOG_WINDOW);
  };
  if (chain.maxLogRange) {
    // A known cap: a full-range call would only be refused.
    logs = await windowed();
  } else {
    try {
      logs = await getLogs(logRpc, d.address, from, "latest");
    } catch {
      logs = await windowed();
    }
  }

  return logs
    .map(decodeDisbursedLog)
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

// The testnet contracts (network "testnet"): the proof that ShelterSplit runs on every target chain
// before the mainnet wave. Kept in their own file and their own section of the page, so test money
// never adds up with real payouts. A copy of the testnet entries of
// funding/framework/tracks/a-build/deployments.json (public fields only).
export const TESTNET_DEPLOYMENTS_URL = "/shelter-payouts/testnet-deployments.json";

/** The testnet list, or [] when it is missing or broken: it is an extra, never a page error. */
export async function fetchTestnetDeployments(): Promise<ShelterDeployment[]> {
  try {
    return (await fetchDeployments(TESTNET_DEPLOYMENTS_URL)).filter(isTestnetDeployment);
  } catch {
    return [];
  }
}

export async function fetchDeployments(url: string = DEPLOYMENTS_URL): Promise<ShelterDeployment[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url.split("/").pop()}: HTTP ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error(`${url.split("/").pop()} must be a JSON array`);
  return list.filter(
    (d): d is ShelterDeployment =>
      d && typeof d.chainId === "number" && /^0x[0-9a-fA-F]{40}$/.test(d.address || "")
  );
}

// The contract forwards every donation in the same call, so its native balance should stay 0.
export async function fetchNativeBalance(d: ShelterDeployment): Promise<bigint> {
  const chain = resolveChain(d);
  if (!chain) throw new Error(`no public RPC known for chain ${d.chainId}`);
  if (chain.balanceToken) {
    // balanceOf(address): selector 0x70a08231, address left-padded to 32 bytes.
    const data = "0x70a08231" + d.address.slice(2).toLowerCase().padStart(64, "0");
    return BigInt(await rpcCall<string>(chain.rpc, "eth_call", [{ to: chain.balanceToken, data }, "latest"]));
  }
  return BigInt(await rpcCall<string>(chain.rpc, "eth_getBalance", [d.address, "latest"]));
}

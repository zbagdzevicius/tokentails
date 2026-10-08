// copy-lint: web-only the total renders only on the web host (ui.ts shelterTotal returns null in app builds)
// Read-only "sent to shelters" total for the win screen. It reads ShelterSplit's payout events from
// the backend's index of those public events (GET /shelter/payouts) plus the newest blocks straight
// from public chain RPCs, or from the RPCs alone when the index is unreachable or stale (plain
// eth_getLogs, no wallet, no web3 dependency), so a player or judge sees real on-chain payouts
// without connecting anything.
//
// The deployment list is a copy of funding/framework/tracks/a-build/deployments.json that
// `fund a:ingest` writes to public/payouts/deployments.json. The chain table mirrors
// client/components/shelter-payouts/chains.ts (this package imports nothing from client/).

import { heistRuntimeConfig } from './rail';
import { PAYOUT_CHAIN_META, TESTNET_CHAIN_IDS } from './shelter-payouts-chains';

export interface PayoutDeployment {
  chainId: number;
  address: string;
  tx?: string;
  fromBlock?: number;
  rpc?: string;
  /** Payout token recorded by `fund a:ingest` ("USDC", or "EURC" for a second instance). */
  token?: string;
  /** "mainnet" or "testnet", as `fund a:ingest` records it. */
  network?: string;
  /** The deploy wave's proof payouts: links that stay useful when the chain cannot be read. */
  proofTxs?: string[];
}

interface ChainUnits {
  rpc: string;
  decimals: number;
  symbol: string;
  nativeDecimals?: number;
  nativeSymbol?: string;
  /** The public RPC's eth_getLogs block-range cap, when it is small: the scan starts in windows of this size. */
  maxLogRange?: number;
  /**
   * A keyless Blockscout-style explorer API (`?module=logs&action=getLogs`) that returns any block
   * range in one request. Tried first; the RPC scan is the fallback. Arc testnet caps eth_getLogs
   * under 10,000 blocks at ~0.5 s per block and rate-limits bursts, and Base caps it at 1,000 or
   * 2,000, so a window scan from the deploy block outgrows the modal's time budget within days.
   */
  logsApi?: string;
  /** The shortest gap between two calls to `rpc`, when it rate-limits small bursts: calls are spaced out instead of retried. */
  minCallGapMs?: number;
}

// Arc mainnet: rpc.mainnet.arc.io refuses eth_getLogs over 10,000 blocks (the refused full-range call
// falls back to LOG_WINDOW = 10,000) and answers about two calls a second sustained (500 ms apart: 60 of 60; checked 2026-10-08), so its
// calls are spaced out; no keyless endpoint takes wider ranges. Mirrors client/components/shelter-payouts/chains.ts.
export const PAYOUT_CHAINS: Record<number, ChainUnits> = {
  5042: { rpc: 'https://rpc.mainnet.arc.io', minCallGapMs: 500, decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
  5042002: { rpc: 'https://rpc.testnet.arc.io', logsApi: 'https://explorer.testnet.arc.io/api', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
  4217: { rpc: 'https://rpc.tempo.xyz', maxLogRange: 99_999, decimals: 6, symbol: 'USDC' },
  42431: { rpc: 'https://rpc.moderato.tempo.xyz', decimals: 6, symbol: 'pathUSD' },
  42161: { rpc: 'https://arb1.arbitrum.io/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  421614: { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  43114: { rpc: 'https://api.avax.network/ext/bc/C/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'AVAX' },
  43113: { rpc: 'https://api.avax-test.network/ext/bc/C/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'AVAX' },
  // Base's public RPCs refuse eth_getLogs over more than 2,000 (mainnet) or 1,000 (Sepolia) blocks.
  8453: { rpc: 'https://mainnet.base.org', maxLogRange: 500, logsApi: 'https://base.blockscout.com/api', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  84532: { rpc: 'https://sepolia.base.org', maxLogRange: 1_000, logsApi: 'https://base-sepolia.blockscout.com/api', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  // Robinhood Chain pays USDG (Paxos), never USDC: totals are kept per symbol, so it is never summed as USDC.
  4663: { rpc: 'https://rpc.mainnet.chain.robinhood.com', decimals: 6, symbol: 'USDG', nativeDecimals: 18, nativeSymbol: 'ETH' },
  // Robinhood testnet has no stablecoin: the wave deploys a mock (mUSDC), never summed with real dollars.
  46630: { rpc: 'https://rpc.testnet.chain.robinhood.com', decimals: 6, symbol: 'mUSDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  // Monad's main public RPCs (rpc.monad.xyz, testnet-rpc.monad.xyz) cap eth_getLogs at 100 blocks, under
  // MIN_LOG_WINDOW, so the modal reads keyless endpoints that take wide ranges: rpc1.monad.xyz on mainnet,
  // OnFinality's public testnet endpoint (10,000-block windows). Checked 2026-10-04.
  143: { rpc: 'https://rpc1.monad.xyz', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'MON' },
  10143: { rpc: 'https://monad-testnet.api.onfinality.io/public', maxLogRange: 10_000, decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'MON' },
};

/** A deployment's chain units with its own payout token: an EURC instance is never summed as USDC. */
export function deploymentUnits(d: Pick<PayoutDeployment, 'token'>, chain: ChainUnits): ChainUnits {
  // Keep a mixed-case spelling ("pathUSD", "mUSDC"); an all-lowercase one is upper-cased ("eurc").
  // Mirrors client/components/shelter-payouts/rpc.ts deploymentToken.
  const raw = typeof d.token === 'string' ? d.token.trim() : '';
  const t = raw === raw.toLowerCase() ? raw.toUpperCase() : raw;
  return t && t.toUpperCase() !== 'USDC' ? { ...chain, symbol: t } : chain;
}

/** keccak256("Disbursed(address,uint256,string)"): ERC-20 payouts (disburse, disburseWithMemo). */
export const DISBURSED_TOPIC = '0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a';
/** keccak256("NativeDisbursed(address,uint256,string)"): native payouts (donate, receive). */
export const NATIVE_DISBURSED_TOPIC = '0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef';

export interface PayoutLog { topics: string[]; data: string }

/** Amount (18-decimal units) and symbol of one payout log, or null for any other event. */
export function payoutOf(log: PayoutLog, chain: ChainUnits): { symbol: string; amount18: bigint } | null {
  const topic = log.topics?.[0]?.toLowerCase();
  const native = topic === NATIVE_DISBURSED_TOPIC;
  if (!native && topic !== DISBURSED_TOPIC) return null;
  const word = log.data?.slice(2, 66);
  if (!word || word.length !== 64) return null;
  const decimals = native ? chain.nativeDecimals ?? 18 : chain.decimals;
  const symbol = native ? chain.nativeSymbol ?? 'native' : chain.symbol;
  if (decimals > 18) return null;
  return { symbol, amount18: BigInt('0x' + word) * 10n ** BigInt(18 - decimals) };
}

/** "3.5 USDC" style, trimmed to at most 2 decimals; under 0.01, two significant digits ("0.0021 ETH"). */
export function formatAmount(amount18: bigint, symbol: string): string {
  if (amount18 > 0n && amount18 < 5n * 10n ** 15n) {
    const f = amount18.toString().padStart(18, '0');
    const lead = f.search(/[1-9]/);
    if (lead >= 6) return `<0.000001 ${symbol}`;
    return `0.${f.slice(0, lead + 2).replace(/0+$/, '')} ${symbol}`;
  }
  const cents = (amount18 + 5n * 10n ** 15n) / 10n ** 16n; // round to 0.01
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''} ${symbol}`;
}

/** Totals per symbol -> one line, or '' when nothing has been paid yet. Web host only (R10). */
export function totalText(totals: Map<string, bigint>): string {
  const parts = [...totals].filter(([, v]) => v > 0n).map(([s, v]) => formatAmount(v, s));
  // claim: L-disbursed (the indexed ShelterSplit payouts, read from the chain)
  return parts.length ? `Token Tails has sent ${parts.join(' + ')} to shelters so far, on-chain` : '';
}

type Fetch = typeof fetch;

/** A rate-limited RPC answer (HTTP 429 or JSON-RPC -32005): retried with backoff, never treated as a range cap. */
class RateLimited extends Error {}

/**
 * Rate-limit retries per call and the first backoff; doubles each time up to 8 s (0.5, 1, 2, 4, 8 s).
 * Mirrors client/components/shelter-payouts/rpc.ts (Arc testnet answers bursts with 429 for seconds).
 */
export const RATE_LIMIT_RETRIES = 5;
export const RATE_LIMIT_BACKOFF_MS = 500;
const RATE_LIMIT_MAX_BACKOFF_MS = 8_000;

let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Test hook: replace the backoff timer. */
export function setPayoutsSleep(fn: (ms: number) => Promise<void>): void {
  sleep = fn;
}

// Calls to an RPC with a minCallGapMs (Arc mainnet), retries included, wait until that long after the
// previous call to the same URL, so the scan stays under the limit instead of burning retries on 429s.
const CALL_GAPS = new Map<string, number>();
for (const c of Object.values(PAYOUT_CHAINS)) if (c.minCallGapMs) CALL_GAPS.set(c.rpc, c.minCallGapMs);
const lastCallAt = new Map<string, number>();
let now = () => Date.now();
/** Test hook: replace the clock used to space out calls. */
export function setPayoutsClock(fn: () => number): void {
  now = fn;
}

// The slot is reserved before waiting, so calls stay one gap apart even if a caller ever bypasses the
// per-URL queue below.
async function paced(url: string): Promise<void> {
  const gap = CALL_GAPS.get(url);
  if (!gap) return;
  const t = now();
  const last = lastCallAt.get(url);
  const at = last === undefined ? t : Math.max(t, last + gap);
  lastCallAt.set(url, at);
  if (at > t) await sleep(at - t);
}

async function rpcOnce<T>(f: Fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
  await paced(url);
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
  if (res.status === 429) throw new RateLimited(`${method}: HTTP 429`);
  if (!res.ok) {
    // Base answers an over-long eth_getLogs with HTTP 413 and the cap in the body: keep the message.
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* no body */
    }
    throw new Error(`${method}: HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  }
  const body = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
  if (body.error) {
    const msg = `${method}: ${body.error.message ?? 'RPC error'}`;
    if (body.error.code === -32005 || /rate limit|too many requests/i.test(body.error.message ?? '')) throw new RateLimited(msg);
    throw new Error(msg);
  }
  return body.result as T;
}

async function retrying<T>(call: () => Promise<T>, signal: AbortSignal, retries = RATE_LIMIT_RETRIES): Promise<T> {
  let backoff = RATE_LIMIT_BACKOFF_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof RateLimited) || attempt >= retries || signal.aborted) throw err;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, RATE_LIMIT_MAX_BACKOFF_MS);
    }
  }
}

// One request in flight per RPC URL: two deployments on one chain (Arc USDC and EURC) read their
// receipts, log windows and block times at the same moment, and that burst is what earns the 429s.
const queues = new Map<string, Promise<unknown>>();

function serial<T>(url: string, run: () => Promise<T>): Promise<T> {
  const prev = queues.get(url) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.catch(() => undefined);
  queues.set(url, tail);
  void tail.then(() => {
    if (queues.get(url) === tail) queues.delete(url);
  });
  return next;
}

function rpc<T>(f: Fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
  return serial(url, () => retrying(() => rpcOnce<T>(f, url, method, params, signal), signal));
}

/** True for a rate-limited RPC answer: HTTP 429, JSON-RPC -32005 or a "rate limit" message. */
export function isRateLimitAnswer(status: number | undefined, error?: { code?: number; message?: string } | null): boolean {
  return status === 429 || error?.code === -32005 || /rate limit|too many requests/i.test(error?.message ?? '');
}

/**
 * Runs `call`, retrying with the payout reads' backoff while it reports a rate limit (`rateLimited()`
 * builds that error). For other readers of a payouts RPC (the Pink Paw goal meter): the modal reads
 * the payouts and the goal on the same RPC at once, and one 429 must not blank the meter. Not queued
 * behind the payout reads, which can take many log windows.
 */
export function retryRateLimited<T>(call: (rateLimited: (msg: string) => Error) => Promise<T>, signal: AbortSignal, retries = 3): Promise<T> {
  return retrying(() => call((msg) => new RateLimited(msg)), signal, retries);
}

/**
 * Public RPCs cap eth_getLogs ranges (Tempo: 100,000 blocks; Arc: "requested range too large"
 * well below that; Base: 2,000, Base Sepolia: 1,000), so a full-range query that is refused is
 * re-read in windows, one at a time. The window starts at LOG_WINDOW (or the chain's maxLogRange)
 * and, on each refused window, drops to the cap the RPC names in its error ("limited to a 1,000
 * range") or halves, down to MIN_LOG_WINDOW. Mirrors client/components/shelter-payouts/rpc.ts.
 */
export const LOG_WINDOW = 10_000;
export const MIN_LOG_WINDOW = 500;
/** Upper bound on window requests per deployment; past it the chain is marked unreadable. */
export const MAX_LOG_REQUESTS = 400;

/** The block-range cap an RPC names in its refusal ("limited to a 1,000 range", "max block range 100000"), or null. */
export function rangeLimitFrom(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const m = /(?:limited to a|block range(?: is)?(?: limited to)?:?|range(?: limit)?(?: of| is)?:?)\s*([\d,]+)/i.exec(msg);
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

type LogFilter = { address: string; topics: string[][] };

/** eth_getLogs over [from, latest]: one call when the RPC allows it, else sequential windows. */
export async function getLogsRange<T>(f: Fetch, url: string, filter: LogFilter, from: number, signal: AbortSignal, maxLogRange?: number): Promise<T[]> {
  const hex = (n: number) => '0x' + n.toString(16);
  let window = maxLogRange ?? LOG_WINDOW;
  // A known small cap: a full-range call would only be refused.
  if (!maxLogRange) {
    try {
      return (await rpc<T[]>(f, url, 'eth_getLogs', [{ ...filter, fromBlock: hex(from), toBlock: 'latest' }], signal)) ?? [];
    } catch (err) {
      // A rate limit already used its retries; windows would only make it worse.
      if (err instanceof RateLimited || signal.aborted) throw err;
      const cap = rangeLimitFrom(err);
      if (cap !== null && cap < window) window = cap;
    }
  }
  window = Math.max(MIN_LOG_WINDOW, window);
  const latest = parseInt(await rpc<string>(f, url, 'eth_blockNumber', [], signal), 16);
  if (!Number.isFinite(latest)) throw new Error('eth_blockNumber: bad answer');
  const out: T[] = [];
  let requests = 0;
  let start = from;
  while (start <= latest) {
    if (++requests > MAX_LOG_REQUESTS) throw new Error(`eth_getLogs: more than ${MAX_LOG_REQUESTS} windows; pin "fromBlock"`);
    const end = Math.min(start + window - 1, latest);
    try {
      out.push(...((await rpc<T[]>(f, url, 'eth_getLogs', [{ ...filter, fromBlock: hex(start), toBlock: hex(end) }], signal)) ?? []));
      start = end + 1;
    } catch (err) {
      if (err instanceof RateLimited || signal.aborted || window <= MIN_LOG_WINDOW) throw err;
      const cap = rangeLimitFrom(err);
      window = Math.max(MIN_LOG_WINDOW, cap !== null && cap < window ? cap : Math.floor(window / 2));
    }
  }
  return out;
}

/** Most logs one explorer API answer carries; a full page may be cut short, so the RPC scan reads it instead. */
const LOGS_API_PAGE = 1000;

/**
 * Explorer APIs that told us they are out of keyless requests (Blockscout: `x-ratelimit-remaining: 0`
 * with a reset many minutes away), until when: skipped straight to the RPC scan until then.
 */
const apiBlockedUntil = new Map<string, number>();

/** Every log of `address` from block `from` on, through a Blockscout-style explorer API (one request). */
export async function getLogsFromApi(f: Fetch, api: string, address: string, from: number, signal: AbortSignal): Promise<RpcLog[]> {
  const q = new URLSearchParams({ module: 'logs', action: 'getLogs', address, fromBlock: String(from), toBlock: 'latest' });
  // Same queue and backoff as the RPCs: two contracts on one chain ask the explorer one at a time.
  const body = await serial(api, () =>
    retrying(async () => {
      if ((apiBlockedUntil.get(api) ?? 0) > Date.now()) throw new Error('logs API: out of requests');
      const res = await f(`${api}?${q.toString()}`, { signal });
      if (res.status === 429) {
        const resetMs = Number(res.headers.get('x-ratelimit-reset'));
        if (res.headers.get('x-ratelimit-remaining') === '0' && resetMs > 10_000) {
          // Waiting would not help: use the RPC now, and for the rest of the reset window.
          apiBlockedUntil.set(api, Date.now() + Math.min(resetMs, 60 * 60_000));
          throw new Error('logs API: out of requests');
        }
        throw new RateLimited('logs API: HTTP 429');
      }
      if (!res.ok) throw new Error(`logs API: HTTP ${res.status}`);
      return (await res.json()) as { status?: string; message?: string; result?: unknown };
      // Two quick retries (0.5 s, 1 s): past that the RPC scan is the better use of the time budget.
    }, signal, 2),
  );
  if (!Array.isArray(body.result)) {
    if (body.status === '0' && /no (logs|records)/i.test(body.message ?? '')) return [];
    throw new Error(`logs API: ${body.message ?? 'bad answer'}`);
  }
  if (body.result.length >= LOGS_API_PAGE) throw new Error('logs API: page full');
  // A third-party API is not the chain: keep only logs it says came from the contract asked about, so a
  // misbehaving explorer cannot add another contract's events to the shelters' total.
  const want = address.toLowerCase();
  return (body.result as { address?: string; topics?: (string | null)[]; data?: string; blockNumber?: string; transactionHash?: string; timeStamp?: string }[])
    .filter((l) => typeof l?.address === 'string' && l.address.toLowerCase() === want)
    .map((l) => ({
    topics: (l.topics ?? []).filter((t): t is string => typeof t === 'string'),
    data: l.data ?? '0x',
    blockNumber: l.blockNumber,
    transactionHash: l.transactionHash,
    timeStamp: l.timeStamp,
  }));
}

/** One deployment as the payouts modal lists it. `ok` is false when its RPC could not be read. */
export interface ChainRow {
  chainId: number;
  name: string;
  explorer: string;
  address: string;
  /** The deployment's payout token ("USDC", "EURC", "USDG"…): every row names it, paid or not. */
  symbol?: string;
  totals: Map<string, bigint>;
  count: number;
  ok: boolean;
  /**
   * Set when the chain could not be read right now and the row shows the index's last-known payouts
   * (through this block, block time `time` in unix seconds). Those still count in the totals.
   */
  updating?: { block: number; time: number };
  /** True when the row's payouts came from the backend's index (plus any newer blocks), not a full chain scan. */
  indexed?: boolean;
  /** The deployment's recorded proof payouts (tx hashes), when the list has any. */
  proofTxs?: string[];
}

/** One payout event, newest first in `ShelterPayouts.payouts`. */
export interface PayoutRow {
  chainId: number;
  chainName: string;
  explorer: string;
  symbol: string;
  amount18: bigint;
  /** The shelter wallet (indexed topic 1), lowercased, or '' when the log has none. */
  shelter: string;
  memo: string;
  tx: string;
  block: number;
  /** Block time in unix seconds, when it was looked up. */
  time?: number;
}

export interface ShelterPayouts {
  /** `empty`: nothing deployed yet. `error`: the list or every chain could not be read. */
  status: 'ok' | 'empty' | 'error';
  totals: Map<string, bigint>;
  chains: ChainRow[];
  payouts: PayoutRow[];
  /**
   * An early read from the backend's index alone (fetchShelterPayouts `onIndexed`): every contract is
   * covered, but the blocks after its `indexedThrough` (at most INDEX_STALE_MS) are still being read.
   */
  partial?: boolean;
}

/** The memo string of a payout log (ABI: amount, offset, then length and bytes), or ''. */
export function memoOf(data: string): string {
  try {
    const hex = data.slice(2);
    const word = (i: number) => hex.slice(i * 64, i * 64 + 64);
    if (word(1).length !== 64) return '';
    const offset = Number(BigInt('0x' + word(1)));
    if (offset % 32 !== 0 || offset > hex.length) return '';
    const lenWord = word(offset / 32);
    if (lenWord.length !== 64) return '';
    const len = Number(BigInt('0x' + lenWord));
    const start = offset * 2 + 64;
    const body = hex.slice(start, start + len * 2);
    if (body.length !== len * 2 || len > 1024) return '';
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
    return displayMemo(new TextDecoder().decode(bytes).replace(/[\u0000-\u001f\u007f]/g, '').trim());
  } catch {
    return '';
  }
}

/**
 * A memo that is itself a bytes32 hex string (Tempo's disburseWithMemo passes a TIP-20 memo, so the
 * log carries '0x4361746e6970…00') reads as its UTF-8 text with the trailing zero bytes dropped.
 * Anything else, or hex that is not printable text, is returned unchanged. Same rule as the client's
 * displayMemo (client/components/shelter-payouts/logs.ts).
 */
export function displayMemo(memo: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(memo)) return memo;
  const hex = memo.slice(2).replace(/(00)+$/, '');
  if (!hex.length || hex.length % 2) return memo;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const text = new TextDecoder().decode(bytes);
  return /^[\x20-\x7E\u00A0-\uFFFF]+$/.test(text) && !text.includes('\uFFFD') ? text : memo;
}

interface RpcLog extends PayoutLog { blockNumber?: string; transactionHash?: string; /** Explorer API only: block time, hex seconds. */ timeStamp?: string }

/** How many of each chain's newest payouts get a block time (one eth_getBlockByNumber each). */
const TIMED_PER_CHAIN = 6;

/**
 * The backend's payout index (GET /shelter/payouts): the same public payout events, read once by the
 * backend and served with their block times. Mirrors client/components/shelter-payouts/payoutIndex.ts.
 * A contract whose index lags the chain by more than INDEX_STALE_MS is read from the chain instead;
 * a fresh one is read from the index plus only the blocks after its `indexedThrough`.
 */
export const INDEX_STALE_MS = 15 * 60_000;
const INDEX_PAGE_LIMIT = 2000;
const INDEX_MAX_PAGES = 5;

interface IndexedContract { chainId: number; contract: string; count: number; indexedThrough: { block: number | null; time: number | null } }
interface IndexedEvent { chainId: number; contract: string; txHash: string; logIndex: number; blockNumber: number; timestamp: number; shelter: string; kind: 'token' | 'native'; amount18: string; memo: string }
export interface PayoutIndex { contracts: IndexedContract[]; events: IndexedEvent[] }

const HEX_ADDRESS = /^0x[0-9a-f]{40}$/;
const isIndexedEvent = (e: IndexedEvent): boolean =>
  !!e && Number.isSafeInteger(e.chainId) && HEX_ADDRESS.test(String(e.contract)) && /^0x[0-9a-f]{64}$/.test(String(e.txHash)) &&
  Number.isSafeInteger(e.blockNumber) && Number.isSafeInteger(e.timestamp) && (e.kind === 'token' || e.kind === 'native') &&
  /^\d{1,78}$/.test(String(e.amount18)) && typeof e.memo === 'string' && typeof e.shelter === 'string';

/** Every indexed payout of `network`, or null (no backend, refused, unreachable, malformed or too long). */
export async function fetchPayoutIndex(f: Fetch, apiUrl: string, network: 'mainnet' | 'testnet', signal: AbortSignal): Promise<PayoutIndex | null> {
  const base = apiUrl.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    let contracts: IndexedContract[] | null = null;
    const events: IndexedEvent[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < INDEX_MAX_PAGES; page++) {
      const q = new URLSearchParams({ network, limit: String(INDEX_PAGE_LIMIT) });
      if (cursor) q.set('cursor', cursor);
      const res = await f(`${base}/shelter/payouts?${q.toString()}`, { signal, credentials: 'omit' });
      if (!res.ok) return null;
      const body = (await res.json()) as { contracts?: unknown; events?: unknown; nextCursor?: unknown };
      if (!Array.isArray(body?.contracts) || !Array.isArray(body?.events)) return null;
      contracts ??= (body.contracts as IndexedContract[]).filter((c) => !!c && Number.isSafeInteger(c.chainId) && HEX_ADDRESS.test(String(c.contract)) && !!c.indexedThrough);
      for (const e of body.events as IndexedEvent[]) if (isIndexedEvent(e)) events.push(e);
      cursor = typeof body.nextCursor === 'string' ? body.nextCursor : null;
      if (!cursor) return { contracts: contracts ?? [], events };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * One contract's indexed payouts and the last block read (and its time), or null when it is not
 * listed or is stale. `staleMs` Infinity gives the last-known payouts however far behind they are.
 */
export function indexedFor(index: PayoutIndex | null, chainId: number, address: string, nowMs: number, staleMs: number = INDEX_STALE_MS): { through: number; time: number; events: IndexedEvent[] } | null {
  if (!index) return null;
  const contract = address.toLowerCase();
  const c = index.contracts.find((x) => x.chainId === chainId && x.contract === contract);
  const block = c?.indexedThrough?.block;
  const time = c?.indexedThrough?.time;
  if (!c || typeof block !== 'number' || typeof time !== 'number' || nowMs - time * 1000 > staleMs) return null;
  const events = index.events.filter((e) => e.chainId === chainId && e.contract === contract && e.blockNumber <= block);
  // A list cut short would understate the total: read the chain instead.
  return events.length === c.count ? { through: block, time, events } : null;
}

const networkOf = (d: PayoutDeployment): 'mainnet' | 'testnet' => (isTestnetDeployment(d) ? 'testnet' : 'mainnet');

/** Newest first: by block time when both have one, else by block within a chain. */
const newestFirst = (a: PayoutRow, b: PayoutRow): number =>
  a.time !== undefined && b.time !== undefined ? b.time - a.time : a.chainId === b.chainId ? b.block - a.block : (b.time ?? 0) - (a.time ?? 0);

/**
 * The early read from the index alone: every listed contract with its indexed payouts (they carry
 * their block times), marked `partial` because the blocks after each `indexedThrough` are not read yet.
 */
function earlyFromIndex(usable: PayoutDeployment[], covered: { events: IndexedEvent[] }[]): ShelterPayouts {
  const early: ShelterPayouts = { status: 'ok', totals: new Map(), chains: [], payouts: [], partial: true };
  usable.forEach((d, i) => {
    const chain = deploymentUnits(d, PAYOUT_CHAINS[d.chainId]);
    const meta = PAYOUT_CHAIN_META[d.chainId];
    const row: ChainRow = { chainId: d.chainId, name: meta?.name ?? `Chain ${d.chainId}`, explorer: meta?.explorer ?? '', address: d.address, symbol: chain.symbol, totals: new Map(), count: 0, ok: true, indexed: true };
    const proofs = Array.isArray(d.proofTxs) ? d.proofTxs.filter((t) => typeof t === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t)) : [];
    if (proofs.length) row.proofTxs = proofs;
    // Newest first within the chain, as the full read orders it.
    for (const e of [...covered[i].events].sort((a, b) => b.blockNumber - a.blockNumber)) {
      const symbol = e.kind === 'native' ? chain.nativeSymbol ?? 'native' : chain.symbol;
      const amount18 = BigInt(e.amount18);
      row.totals.set(symbol, (row.totals.get(symbol) ?? 0n) + amount18);
      row.count++;
      early.payouts.push({
        chainId: d.chainId, chainName: row.name, explorer: row.explorer, symbol, amount18,
        shelter: e.shelter.toLowerCase(), memo: displayMemo(e.memo.replace(/[\u0000-\u001f\u007f]/g, '').trim()),
        tx: e.txHash, block: e.blockNumber, time: e.timestamp,
      });
    }
    early.chains.push(row);
  });
  for (const c of early.chains) for (const [s, v] of c.totals) early.totals.set(s, (early.totals.get(s) ?? 0n) + v);
  early.payouts.sort(newestFirst);
  return early;
}

/**
 * Reads every payout across the listed deployments: totals, a row per deployment and the payout
 * events (newest first). Best effort: a chain whose RPC fails or times out is marked `ok: false`
 * and skipped. With `times`, the newest payouts per chain also get their block time.
 *
 * `network` asks for that network's index alongside the list instead of after it. `onIndexed` gets
 * an early `partial` read as soon as the index freshly covers every listed contract (before the
 * newest blocks and block times come back from the chains); it is never called after this resolves.
 */
export async function fetchShelterPayouts(
  deploymentsUrl: string,
  f: Fetch = fetch,
  timeoutMs = 8000,
  opts: {
    times?: boolean;
    only?: (d: PayoutDeployment) => boolean;
    apiUrl?: string;
    nowMs?: number;
    network?: 'mainnet' | 'testnet';
    onIndexed?: (early: ShelterPayouts) => void;
  } = {},
): Promise<ShelterPayouts> {
  const ctl = new AbortController();
  // Two budgets of `timeoutMs`: the list, then the chain reads. A busy main thread at boot (shader
  // compiles while the list loads) must not eat the RPCs' time.
  let timer = setTimeout(() => ctl.abort(), timeoutMs);
  const out: ShelterPayouts = { status: 'ok', totals: new Map(), chains: [], payouts: [] };
  let settled = false;
  // The backend's index first (one request per network, its own few seconds of the budget); a
  // contract it does not cover freshly is read from the chain as before.
  const indexes = new Map<string, Promise<PayoutIndex | null>>();
  const indexFor = (net: 'mainnet' | 'testnet'): Promise<PayoutIndex | null> => {
    let p = indexes.get(net);
    if (!p) {
      const own = new AbortController();
      const stop = () => own.abort();
      ctl.signal.addEventListener('abort', stop);
      const t = setTimeout(stop, Math.min(5000, timeoutMs / 2));
      p = fetchPayoutIndex(f, opts.apiUrl ?? '', net, own.signal).finally(() => clearTimeout(t));
      indexes.set(net, p);
    }
    return p;
  };
  const indexOf = (d: PayoutDeployment): Promise<PayoutIndex | null> => (!opts.apiUrl || d.rpc ? Promise.resolve(null) : indexFor(networkOf(d)));
  // The index does not need the list: ask for it while the list loads.
  if (opts.apiUrl && opts.network) void indexFor(opts.network);
  try {
    const res = await f(deploymentsUrl, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return { ...out, status: 'error' };
    const list = (await res.json()) as PayoutDeployment[];
    if (!Array.isArray(list)) return { ...out, status: 'error' };
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(), timeoutMs);
    const usable = list.filter((d) => !!PAYOUT_CHAINS[d?.chainId] && /^0x[0-9a-fA-F]{40}$/.test(d.address ?? '') && (!opts.only || opts.only(d)));
    if (!usable.length) return { ...out, status: 'empty' };
    if (opts.onIndexed) {
      const onIndexed = opts.onIndexed;
      void Promise.all(usable.map(async (d) => indexedFor(await indexOf(d), d.chainId, d.address, opts.nowMs ?? Date.now()))).then((covered) => {
        // Only when the index covers every contract: a partial list would understate the total.
        if (settled || !covered.every((c) => !!c)) return;
        try {
          onIndexed(earlyFromIndex(usable, covered as { events: IndexedEvent[] }[]));
        } catch {
          /* the caller's paint failed: the full read still lands */
        }
      });
    }
    out.chains = await Promise.all(usable.map(async (d): Promise<ChainRow> => {
      const known = PAYOUT_CHAINS[d.chainId];
      const chain = deploymentUnits(d, known);
      const meta = PAYOUT_CHAIN_META[d.chainId];
      const row: ChainRow = { chainId: d.chainId, name: meta?.name ?? `Chain ${d.chainId}`, explorer: meta?.explorer ?? '', address: d.address, symbol: chain.symbol, totals: new Map(), count: 0, ok: true };
      const proofs = Array.isArray(d.proofTxs) ? d.proofTxs.filter((t) => typeof t === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t)) : [];
      if (proofs.length) row.proofTxs = proofs;
      const url = d.rpc || chain.rpc;
      const index = await indexOf(d);
      const indexed = indexedFor(index, d.chainId, d.address, opts.nowMs ?? Date.now());
      const rows: PayoutRow[] = [];
      const add = (r: PayoutRow) => {
        row.totals.set(r.symbol, (row.totals.get(r.symbol) ?? 0n) + r.amount18);
        row.count++;
        rows.push(r);
      };
      const addIndexed = (events: IndexedEvent[]) => {
        for (const e of events) {
          add({
            chainId: d.chainId, chainName: row.name, explorer: row.explorer,
            symbol: e.kind === 'native' ? chain.nativeSymbol ?? 'native' : chain.symbol, amount18: BigInt(e.amount18),
            shelter: e.shelter.toLowerCase(), memo: displayMemo(e.memo.replace(/[\u0000-\u001f\u007f]/g, '').trim()),
            tx: e.txHash, block: e.blockNumber, time: e.timestamp,
          });
        }
      };
      if (indexed) {
        row.indexed = true;
        addIndexed(indexed.events);
        try {
          // Only the blocks after the index: one call on most chains.
          const fresh = await getLogsRange<RpcLog>(f, url, { address: d.address, topics: [[DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC]] }, indexed.through + 1, ctl.signal, chain.maxLogRange);
          const seen = new Set(rows.map((r) => r.tx.toLowerCase()));
          for (const log of fresh ?? []) {
            const p = payoutOf(log, chain);
            const tx = (log.transactionHash ?? '').toLowerCase();
            if (!p || seen.has(tx)) continue;
            const topic = log.topics?.[1];
            add({
              chainId: d.chainId, chainName: row.name, explorer: row.explorer, symbol: p.symbol, amount18: p.amount18,
              shelter: typeof topic === 'string' && topic.length === 66 ? '0x' + topic.slice(26).toLowerCase() : '',
              memo: memoOf(log.data ?? ''), tx: log.transactionHash ?? '', block: log.blockNumber ? parseInt(log.blockNumber, 16) || 0 : 0,
            });
          }
          // The newest payouts, newer than the index: without a time they would sort below every other
          // chain's timed rows in the merged list.
          if (opts.times) {
            const blocks = [...new Set(rows.filter((r) => r.time === undefined && r.block > 0).map((r) => r.block))].sort((a, b) => b - a).slice(0, TIMED_PER_CHAIN);
            for (const b of blocks) {
              try {
                const blk = await rpc<{ timestamp?: string } | null>(f, url, 'eth_getBlockByNumber', ['0x' + b.toString(16), false], ctl.signal);
                const t = blk?.timestamp ? parseInt(blk.timestamp, 16) : NaN;
                if (t > 0) for (const r of rows) if (r.block === b && r.time === undefined) r.time = t;
              } catch {
                /* no time for this one */
              }
            }
          }
        } catch {
          // The chain is busy: the index still stands, labelled with its last block (the tail's logs
          // are added only once the whole read has answered).
          row.updating = { block: indexed.through, time: indexed.time };
        }
        rows.sort((a, b) => b.block - a.block);
        out.payouts.push(...rows);
        return row;
      }
      // An index behind by more than INDEX_STALE_MS: the chain is read in full, and the index's
      // last-known payouts stand in when it cannot be.
      const lastKnown = indexedFor(index, d.chainId, d.address, 0, Number.POSITIVE_INFINITY);
      try {
        let from = typeof d.fromBlock === 'number' ? d.fromBlock : 0;
        if (!from && d.tx) {
          const rc = await rpc<{ blockNumber?: string } | null>(f, url, 'eth_getTransactionReceipt', [d.tx], ctl.signal);
          if (rc?.blockNumber) from = parseInt(rc.blockNumber, 16);
        }
        let logs: RpcLog[] | null = null;
        if (chain.logsApi && !d.rpc) {
          try {
            logs = await getLogsFromApi(f, chain.logsApi, d.address, from, ctl.signal);
          } catch {
            if (ctl.signal.aborted) throw new Error('timed out');
            /* the explorer API is down or the page is full: scan the RPC */
          }
        }
        logs ??= await getLogsRange<RpcLog>(f, url, { address: d.address, topics: [[DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC]] }, from, ctl.signal, d.rpc ? undefined : chain.maxLogRange);
        for (const log of logs ?? []) {
          const p = payoutOf(log, chain);
          if (!p) continue;
          row.totals.set(p.symbol, (row.totals.get(p.symbol) ?? 0n) + p.amount18);
          row.count++;
          const topic = log.topics?.[1];
          rows.push({
            chainId: d.chainId, chainName: row.name, explorer: row.explorer, symbol: p.symbol, amount18: p.amount18,
            shelter: typeof topic === 'string' && topic.length === 66 ? '0x' + topic.slice(26).toLowerCase() : '',
            memo: memoOf(log.data ?? ''), tx: log.transactionHash ?? '', block: log.blockNumber ? parseInt(log.blockNumber, 16) || 0 : 0,
            ...(log.timeStamp && parseInt(log.timeStamp, 16) > 0 ? { time: parseInt(log.timeStamp, 16) } : {}),
          });
        }
        rows.sort((a, b) => b.block - a.block);
        if (opts.times) {
          const blocks = [...new Set(rows.slice(0, TIMED_PER_CHAIN).filter((r) => r.time === undefined).map((r) => r.block).filter((b) => b > 0))];
          const times = new Map<number, number>();
          // One at a time: a burst of block lookups is what trips public RPC rate limits.
          for (const b of blocks) {
            try {
              const blk = await rpc<{ timestamp?: string } | null>(f, url, 'eth_getBlockByNumber', ['0x' + b.toString(16), false], ctl.signal);
              if (blk?.timestamp) times.set(b, parseInt(blk.timestamp, 16));
            } catch {
              /* no time for this one */
            }
          }
          for (const r of rows) if (times.has(r.block)) r.time = times.get(r.block);
        }
        out.payouts.push(...rows);
      } catch {
        rows.length = 0;
        row.totals = new Map();
        row.count = 0;
        if (lastKnown) {
          // Never drop indexed payouts because the chain is busy: show them, labelled "updating".
          addIndexed(lastKnown.events);
          rows.sort((a, b) => b.block - a.block);
          out.payouts.push(...rows);
          row.updating = { block: lastKnown.through, time: lastKnown.time };
          row.indexed = true;
        } else {
          row.ok = false;
        }
      }
      return row;
    }));
    for (const c of out.chains) for (const [s, v] of c.totals) out.totals.set(s, (out.totals.get(s) ?? 0n) + v);
    if (out.chains.every((c) => !c.ok)) out.status = 'error';
    out.payouts.sort(newestFirst);
  } catch {
    /* no list, or timed out */
    return { ...out, status: out.chains.length ? out.status : 'error' };
  } finally {
    settled = true;
    clearTimeout(timer);
  }
  return out;
}

/**
 * Sums every payout across the listed deployments. Best effort: a chain whose RPC fails or times
 * out is skipped, so the line shows what could be read (or nothing).
 */
export async function fetchShelterTotals(deploymentsUrl: string, f: Fetch = fetch, timeoutMs = 8000): Promise<Map<string, bigint>> {
  return (await fetchShelterPayouts(deploymentsUrl, f, timeoutMs)).totals;
}

/** Gets the early, index-only read (`partial`) of a shared payouts read. */
export type EarlyPayouts = (early: ShelterPayouts) => void;

/**
 * One shared read per network and page load: the full read's promise, plus the early index-only read
 * once it lands, so a modal opened later paints it at once instead of starting over.
 */
interface SharedRead { final: Promise<ShelterPayouts>; early: ShelterPayouts | null; done: boolean; waiting: Set<EarlyPayouts> }
const reads = new Map<'mainnet' | 'testnet', SharedRead>();

/** A read with any failed or updating chain is retried on the next call. */
const retryNext = (r: ShelterPayouts): boolean => r.status === 'error' || r.chains.some((c) => !c.ok || c.updating);

function sharedRead(key: 'mainnet' | 'testnet', start: (onIndexed: EarlyPayouts) => Promise<ShelterPayouts>, onEarly?: EarlyPayouts): Promise<ShelterPayouts> {
  let read = reads.get(key);
  if (!read) {
    const r: SharedRead = { final: null as never, early: null, done: false, waiting: new Set() };
    r.final = start((early) => {
      if (r.done) return;
      r.early = early;
      for (const fn of r.waiting) {
        try {
          fn(early);
        } catch {
          /* one caller's paint failed: the others still get it */
        }
      }
      r.waiting.clear();
    });
    const settle = (retry: boolean) => {
      r.done = true;
      r.waiting.clear();
      if (retry && reads.get(key) === r) reads.delete(key);
    };
    void r.final.then((res) => settle(retryNext(res)), () => settle(true));
    reads.set(key, r);
    read = r;
  }
  // The early read is only worth painting while the full one is still on its way.
  if (onEarly && !read.done) {
    if (read.early) onEarly(read.early);
    else read.waiting.add(onEarly);
  }
  return read.final;
}

/** The backend whose payout index the live reads try first (rail.ts heistRuntimeConfig), or '' for none. */
function payoutIndexApi(): string {
  try {
    return typeof window !== 'undefined' && typeof document !== 'undefined' ? heistRuntimeConfig(window as never, document).apiUrl : '';
  } catch {
    return '';
  }
}

/**
 * The payouts modal's data, fetched once per page load; a read with any failed or updating chain is
 * retried on the next call. `onEarly` gets the index-only read (`partial`) while the full read is on
 * its way: at once when it has already landed (a prefetch), else as soon as it does.
 */
export function loadShelterPayouts(deploymentsUrl: string, f: Fetch = fetch, onEarly?: EarlyPayouts): Promise<ShelterPayouts> {
  if (!deploymentsUrl) return Promise.resolve({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
  return sharedRead('mainnet', (onIndexed) => fetchShelterPayouts(deploymentsUrl, f, 15_000, { times: true, apiUrl: payoutIndexApi(), network: 'mainnet', onIndexed }), onEarly);
}

/**
 * Starts the payouts modal's reads ahead of it (at boot on a `?payouts`/`#payouts` link, when the
 * title shows otherwise), so the modal paints from them when it opens. '' skips a list.
 */
export function prefetchShelterPayouts(deploymentsUrl: string, testnetUrl = ''): void {
  if (deploymentsUrl) void loadShelterPayouts(deploymentsUrl).catch(() => undefined);
  if (testnetUrl) void loadTestnetPayouts(testnetUrl).catch(() => undefined);
}

/** Test hook: forget the cached payouts. */
export function resetShelterPayoutsCache(): void {
  reads.clear();
}

type TestnetEnv = { BASE_URL?: string; HEIST_TESTNET_DEPLOYMENTS_URL?: string };
const TESTNET_ENV: TestnetEnv = (import.meta as { env?: TestnetEnv }).env ?? {};

/**
 * Testnet ShelterSplit list for the payouts modal's "Testnet proof" section, kept apart from the
 * mainnet list (DEPLOYMENTS_URL) so test coins never sum with real payouts. Bundled at
 * public/payouts/testnet-deployments.json (written by `fund a:ingest --network testnet`, like the
 * client's copy). Override with HEIST_TESTNET_DEPLOYMENTS_URL=<url>; an empty string hides the section.
 * Kept out of types.ts, which the backend vendors with the sim.
 */
export const TESTNET_DEPLOYMENTS_URL: string = TESTNET_ENV.HEIST_TESTNET_DEPLOYMENTS_URL ?? `${TESTNET_ENV.BASE_URL ?? './'}payouts/testnet-deployments.json`;

/** Only the deploy wave's testnets, and never an entry the list marks as mainnet. */
export const isTestnetDeployment = (d: PayoutDeployment): boolean => TESTNET_CHAIN_IDS.includes(d.chainId) && d.network !== 'mainnet';

/**
 * The testnet proof's data (public/payouts/testnet-deployments.json): its own list, its own read and
 * its own totals, never added to the mainnet figures. Cached (and `onEarly`) like loadShelterPayouts.
 */
export function loadTestnetPayouts(testnetUrl: string, f: Fetch = fetch, onEarly?: EarlyPayouts): Promise<ShelterPayouts> {
  if (!testnetUrl) return Promise.resolve({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
  return sharedRead('testnet', (onIndexed) => fetchShelterPayouts(testnetUrl, f, 15_000, { times: true, only: isTestnetDeployment, apiUrl: payoutIndexApi(), network: 'testnet', onIndexed }), onEarly);
}

/**
 * The win-screen line from the modal's shared mainnet read (loadShelterPayouts), so the title's
 * prefetch serves both and the page reads the chains once. '' means hide it.
 */
export function shelterTotalLine(deploymentsUrl: string, f: Fetch = fetch): Promise<string> {
  if (!deploymentsUrl) return Promise.resolve('');
  return loadShelterPayouts(deploymentsUrl, f).then((r) => totalText(r.totals)).catch(() => '');
}

/**
 * "Send Pink Paw a rescue treat" link: the give page plus ?from=heist&cat=<rescued cat>. Keeps a
 * relative or same-origin path as is (so it works under tokentails.com/heist) and keeps any query
 * the base already has. '' (the build env set to empty) means hide the button. `chain` (optional,
 * from the page's own `?chain=<id>`, which the /heist host forwards) preselects the give page's
 * network; anything but a positive whole number is dropped.
 */
export function giveHref(baseUrl: string, catName: string, chain: string | null = null): string {
  const url = baseUrl.trim();
  if (!url) return '';
  const hashAt = url.indexOf('#');
  const path = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const q = new URLSearchParams({ from: 'heist' });
  const cat = catName.trim().slice(0, 64);
  if (cat) q.set('cat', cat);
  if (chain && /^[1-9]\d{0,14}$/.test(chain) && !/[?&]chain=/.test(path)) q.set('chain', chain);
  return `${path}${path.includes('?') ? '&' : '?'}${q.toString()}${hash}`;
}

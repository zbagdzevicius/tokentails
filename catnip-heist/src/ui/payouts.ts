// copy-lint: web-only the total renders only on the web host (ui.ts shelterTotal returns null in app builds)
// Read-only "sent to shelters" total for the win screen. It reads ShelterSplit's payout events
// straight from public chain RPCs (plain eth_getLogs, no wallet, no web3 dependency), so a player
// or judge sees real on-chain payouts without connecting anything.
//
// The deployment list is a copy of funding/framework/tracks/a-build/deployments.json that
// `fund a:ingest` writes to public/payouts/deployments.json. The chain table mirrors
// client/components/shelter-payouts/chains.ts (this package imports nothing from client/).

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
}

export const PAYOUT_CHAINS: Record<number, ChainUnits> = {
  5042: { rpc: 'https://rpc.mainnet.arc.io', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
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

async function rpcOnce<T>(f: Fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
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
 * Reads every payout across the listed deployments: totals, a row per deployment and the payout
 * events (newest first). Best effort: a chain whose RPC fails or times out is marked `ok: false`
 * and skipped. With `times`, the newest payouts per chain also get their block time.
 */
export async function fetchShelterPayouts(
  deploymentsUrl: string,
  f: Fetch = fetch,
  timeoutMs = 8000,
  opts: { times?: boolean; only?: (d: PayoutDeployment) => boolean } = {},
): Promise<ShelterPayouts> {
  const ctl = new AbortController();
  // Two budgets of `timeoutMs`: the list, then the chain reads. A busy main thread at boot (shader
  // compiles while the list loads) must not eat the RPCs' time.
  let timer = setTimeout(() => ctl.abort(), timeoutMs);
  const out: ShelterPayouts = { status: 'ok', totals: new Map(), chains: [], payouts: [] };
  try {
    const res = await f(deploymentsUrl, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return { ...out, status: 'error' };
    const list = (await res.json()) as PayoutDeployment[];
    if (!Array.isArray(list)) return { ...out, status: 'error' };
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(), timeoutMs);
    const usable = list.filter((d) => !!PAYOUT_CHAINS[d?.chainId] && /^0x[0-9a-fA-F]{40}$/.test(d.address ?? '') && (!opts.only || opts.only(d)));
    if (!usable.length) return { ...out, status: 'empty' };
    out.chains = await Promise.all(usable.map(async (d): Promise<ChainRow> => {
      const known = PAYOUT_CHAINS[d.chainId];
      const chain = deploymentUnits(d, known);
      const meta = PAYOUT_CHAIN_META[d.chainId];
      const row: ChainRow = { chainId: d.chainId, name: meta?.name ?? `Chain ${d.chainId}`, explorer: meta?.explorer ?? '', address: d.address, symbol: chain.symbol, totals: new Map(), count: 0, ok: true };
      const proofs = Array.isArray(d.proofTxs) ? d.proofTxs.filter((t) => typeof t === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t)) : [];
      if (proofs.length) row.proofTxs = proofs;
      const url = d.rpc || chain.rpc;
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
        const rows: PayoutRow[] = [];
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
        row.ok = false;
      }
      return row;
    }));
    for (const c of out.chains) for (const [s, v] of c.totals) out.totals.set(s, (out.totals.get(s) ?? 0n) + v);
    if (out.chains.every((c) => !c.ok)) out.status = 'error';
    // Newest first: by block time when both have one, else by block within a chain.
    out.payouts.sort((a, b) => (a.time !== undefined && b.time !== undefined ? b.time - a.time : a.chainId === b.chainId ? b.block - a.block : (b.time ?? 0) - (a.time ?? 0)));
  } catch {
    /* no list, or timed out */
    return { ...out, status: out.chains.length ? out.status : 'error' };
  } finally {
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

let cachedPayouts: Promise<ShelterPayouts> | null = null;

/** The payouts modal's data, fetched once per page load; a read with any failed chain is retried on the next call. */
export function loadShelterPayouts(deploymentsUrl: string, f: Fetch = fetch): Promise<ShelterPayouts> {
  if (!deploymentsUrl) return Promise.resolve({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
  const p = (cachedPayouts ??= fetchShelterPayouts(deploymentsUrl, f, 15_000, { times: true }));
  void p.then((r) => {
    if ((r.status === 'error' || r.chains.some((c) => !c.ok)) && cachedPayouts === p) cachedPayouts = null;
  });
  return p;
}

/** Test hook: forget the cached payouts. */
export function resetShelterPayoutsCache(): void {
  cachedPayouts = null;
  cachedTestnet = null;
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

let cachedTestnet: Promise<ShelterPayouts> | null = null;

/**
 * The testnet proof's data (public/payouts/testnet-deployments.json): its own list, its own read and
 * its own totals, never added to the mainnet figures. Cached like loadShelterPayouts.
 */
export function loadTestnetPayouts(testnetUrl: string, f: Fetch = fetch): Promise<ShelterPayouts> {
  if (!testnetUrl) return Promise.resolve({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
  const p = (cachedTestnet ??= fetchShelterPayouts(testnetUrl, f, 15_000, { times: true, only: isTestnetDeployment }));
  void p.then((r) => {
    if ((r.status === 'error' || r.chains.some((c) => !c.ok)) && cachedTestnet === p) cachedTestnet = null;
  });
  return p;
}

let cached: Promise<string> | null = null;

/** The win-screen line, fetched once per page load. '' means hide it. */
export function shelterTotalLine(deploymentsUrl: string): Promise<string> {
  if (!deploymentsUrl) return Promise.resolve('');
  cached ??= fetchShelterTotals(deploymentsUrl).then(totalText).catch(() => '');
  return cached;
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

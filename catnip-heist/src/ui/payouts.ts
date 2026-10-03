// copy-lint: web-only the total renders only on the web host (ui.ts shelterTotal returns null in app builds)
// Read-only "sent to shelters" total for the win screen. It reads ShelterSplit's payout events
// straight from public chain RPCs (plain eth_getLogs, no wallet, no web3 dependency), so a player
// or judge sees real on-chain payouts without connecting anything.
//
// The deployment list is a copy of funding/framework/tracks/a-build/deployments.json that
// `fund a:ingest` writes to public/payouts/deployments.json. The chain table mirrors
// client/components/shelter-payouts/chains.ts (this package imports nothing from client/).

import { PAYOUT_CHAIN_META } from './shelter-payouts-chains';

export interface PayoutDeployment {
  chainId: number;
  address: string;
  tx?: string;
  fromBlock?: number;
  rpc?: string;
  /** Payout token recorded by `fund a:ingest` ("USDC", or "EURC" for a second instance). */
  token?: string;
}

interface ChainUnits {
  rpc: string;
  decimals: number;
  symbol: string;
  nativeDecimals?: number;
  nativeSymbol?: string;
}

export const PAYOUT_CHAINS: Record<number, ChainUnits> = {
  5042: { rpc: 'https://rpc.mainnet.arc.io', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
  5042002: { rpc: 'https://rpc.testnet.arc.io', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'USDC' },
  4217: { rpc: 'https://rpc.tempo.xyz', decimals: 6, symbol: 'USDC' },
  42431: { rpc: 'https://rpc.moderato.tempo.xyz', decimals: 6, symbol: 'pathUSD' },
  42161: { rpc: 'https://arb1.arbitrum.io/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  421614: { rpc: 'https://sepolia-rollup.arbitrum.io/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  43114: { rpc: 'https://api.avax.network/ext/bc/C/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'AVAX' },
  43113: { rpc: 'https://api.avax-test.network/ext/bc/C/rpc', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'AVAX' },
  8453: { rpc: 'https://mainnet.base.org', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'ETH' },
  143: { rpc: 'https://rpc.monad.xyz', decimals: 6, symbol: 'USDC', nativeDecimals: 18, nativeSymbol: 'MON' },
};

/** A deployment's chain units with its own payout token: an EURC instance is never summed as USDC. */
export function deploymentUnits(d: Pick<PayoutDeployment, 'token'>, chain: ChainUnits): ChainUnits {
  const t = typeof d.token === 'string' ? d.token.trim().toUpperCase() : '';
  return t && t !== 'USDC' ? { ...chain, symbol: t } : chain;
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

/** "3.5 USDC" style, trimmed to at most 2 decimals. */
export function formatAmount(amount18: bigint, symbol: string): string {
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

async function rpc<T>(f: Fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'RPC error'}`);
  return body.result as T;
}

/** One deployment as the payouts modal lists it. `ok` is false when its RPC could not be read. */
export interface ChainRow {
  chainId: number;
  name: string;
  explorer: string;
  address: string;
  totals: Map<string, bigint>;
  count: number;
  ok: boolean;
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
    return new TextDecoder().decode(bytes).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  } catch {
    return '';
  }
}

interface RpcLog extends PayoutLog { blockNumber?: string; transactionHash?: string }

/** How many of each chain's newest payouts get a block time (one eth_getBlockByNumber each). */
const TIMED_PER_CHAIN = 6;

/**
 * Reads every payout across the listed deployments: totals, a row per deployment and the payout
 * events (newest first). Best effort: a chain whose RPC fails or times out is marked `ok: false`
 * and skipped. With `times`, the newest payouts per chain also get their block time.
 */
export async function fetchShelterPayouts(deploymentsUrl: string, f: Fetch = fetch, timeoutMs = 8000, opts: { times?: boolean } = {}): Promise<ShelterPayouts> {
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
    const usable = list.filter((d) => !!PAYOUT_CHAINS[d?.chainId] && /^0x[0-9a-fA-F]{40}$/.test(d.address ?? ''));
    if (!usable.length) return { ...out, status: 'empty' };
    out.chains = await Promise.all(usable.map(async (d): Promise<ChainRow> => {
      const known = PAYOUT_CHAINS[d.chainId];
      const chain = deploymentUnits(d, known);
      const meta = PAYOUT_CHAIN_META[d.chainId];
      const row: ChainRow = { chainId: d.chainId, name: meta?.name ?? `Chain ${d.chainId}`, explorer: meta?.explorer ?? '', address: d.address, totals: new Map(), count: 0, ok: true };
      const url = d.rpc || chain.rpc;
      try {
        let from = typeof d.fromBlock === 'number' ? d.fromBlock : 0;
        if (!from && d.tx) {
          const rc = await rpc<{ blockNumber?: string } | null>(f, url, 'eth_getTransactionReceipt', [d.tx], ctl.signal);
          if (rc?.blockNumber) from = parseInt(rc.blockNumber, 16);
        }
        const logs = await rpc<RpcLog[]>(f, url, 'eth_getLogs', [{ address: d.address, topics: [[DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC]], fromBlock: '0x' + from.toString(16), toBlock: 'latest' }], ctl.signal);
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
          });
        }
        rows.sort((a, b) => b.block - a.block);
        if (opts.times) {
          const blocks = [...new Set(rows.slice(0, TIMED_PER_CHAIN).map((r) => r.block).filter((b) => b > 0))];
          const times = new Map<number, number>();
          await Promise.all(blocks.map(async (b) => {
            try {
              const blk = await rpc<{ timestamp?: string } | null>(f, url, 'eth_getBlockByNumber', ['0x' + b.toString(16), false], ctl.signal);
              if (blk?.timestamp) times.set(b, parseInt(blk.timestamp, 16));
            } catch {
              /* no time for this one */
            }
          }));
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

/** The payouts modal's data, fetched once per page load; a failed read is retried on the next call. */
export function loadShelterPayouts(deploymentsUrl: string, f: Fetch = fetch): Promise<ShelterPayouts> {
  if (!deploymentsUrl) return Promise.resolve({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
  const p = (cachedPayouts ??= fetchShelterPayouts(deploymentsUrl, f, 15_000, { times: true }));
  void p.then((r) => {
    if (r.status === 'error' && cachedPayouts === p) cachedPayouts = null;
  });
  return p;
}

/** Test hook: forget the cached payouts. */
export function resetShelterPayoutsCache(): void {
  cachedPayouts = null;
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
 * the base already has. '' (the build env set to empty) means hide the button.
 */
export function giveHref(baseUrl: string, catName: string): string {
  const url = baseUrl.trim();
  if (!url) return '';
  const hashAt = url.indexOf('#');
  const path = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const q = new URLSearchParams({ from: 'heist' });
  const cat = catName.trim().slice(0, 64);
  if (cat) q.set('cat', cat);
  return `${path}${path.includes('?') ? '&' : '?'}${q.toString()}${hash}`;
}

// Read-only "sent to shelters" total for the win screen. It reads ShelterSplit's payout events
// straight from public chain RPCs (plain eth_getLogs, no wallet, no web3 dependency), so a player
// or judge sees real on-chain payouts without connecting anything.
//
// The deployment list is a copy of funding/framework/tracks/a-build/deployments.json that
// `fund a:ingest` writes to public/payouts/deployments.json. The chain table mirrors
// client/components/shelter-payouts/chains.ts (this package imports nothing from client/).

export interface PayoutDeployment {
  chainId: number;
  address: string;
  tx?: string;
  fromBlock?: number;
  rpc?: string;
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
};

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

/** Totals per symbol -> one line, or '' when nothing has been paid yet. */
export function totalText(totals: Map<string, bigint>): string {
  const parts = [...totals].filter(([, v]) => v > 0n).map(([s, v]) => formatAmount(v, s));
  return parts.length ? `${parts.join(' + ')} sent to real shelters so far, on-chain` : '';
}

type Fetch = typeof fetch;

async function rpc<T>(f: Fetch, url: string, method: string, params: unknown[], signal: AbortSignal): Promise<T> {
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'RPC error'}`);
  return body.result as T;
}

/**
 * Sums every payout across the listed deployments. Best effort: a chain whose RPC fails or times
 * out is skipped, so the line shows what could be read (or nothing).
 */
export async function fetchShelterTotals(deploymentsUrl: string, f: Fetch = fetch, timeoutMs = 8000): Promise<Map<string, bigint>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const totals = new Map<string, bigint>();
  try {
    const res = await f(deploymentsUrl, { cache: 'no-store', signal: ctl.signal });
    if (!res.ok) return totals;
    const list = (await res.json()) as PayoutDeployment[];
    if (!Array.isArray(list)) return totals;
    await Promise.all(list.map(async (d) => {
      const chain = PAYOUT_CHAINS[d?.chainId];
      if (!chain || !/^0x[0-9a-fA-F]{40}$/.test(d.address ?? '')) return;
      const url = d.rpc || chain.rpc;
      try {
        let from = typeof d.fromBlock === 'number' ? d.fromBlock : 0;
        if (!from && d.tx) {
          const rc = await rpc<{ blockNumber?: string } | null>(f, url, 'eth_getTransactionReceipt', [d.tx], ctl.signal);
          if (rc?.blockNumber) from = parseInt(rc.blockNumber, 16);
        }
        const logs = await rpc<PayoutLog[]>(f, url, 'eth_getLogs', [{ address: d.address, topics: [[DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC]], fromBlock: '0x' + from.toString(16), toBlock: 'latest' }], ctl.signal);
        for (const log of logs ?? []) {
          const p = payoutOf(log, chain);
          if (p) totals.set(p.symbol, (totals.get(p.symbol) ?? 0n) + p.amount18);
        }
      } catch {
        /* skip this chain */
      }
    }));
  } catch {
    /* no list, or timed out: show nothing */
  } finally {
    clearTimeout(timer);
  }
  return totals;
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

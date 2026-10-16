import {
  ARC_SPLIT,
  NATIVE_DISBURSED_TOPIC,
  WALLET_CHAINS,
  WalletChain
} from './chains';

export interface Amount {
  symbol: string;
  /** Raw integer amount. */
  raw: bigint;
  decimals: number;
  currency?: 'USD' | 'EUR';
}

export interface ChainBalance {
  chain: WalletChain;
  tokens: Amount[];
  native: Amount | null;
  error?: string;
}

export interface Payout {
  txHash: string;
  block: number;
  amount: Amount;
  memo: string;
}

export const RPC_TIMEOUT_MS = 8000;

export const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim());

/** Parses a JSON-RPC hex quantity ("0x" means zero). */
export function hexToBigInt(hex: string): bigint {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`Bad hex: ${String(hex).slice(0, 20)}`);
  }
  return hex === '0x' ? BigInt(0) : BigInt(hex);
}

/** Exact decimal string for a raw amount, trimmed to `maxFraction` digits. */
export function formatUnits(raw: bigint, decimals: number, maxFraction = 6): string {
  const neg = raw < BigInt(0);
  const abs = neg ? -raw : raw;
  const base = BigInt('1' + '0'.repeat(decimals));
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFraction);
  frac = frac.replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Sum of the stablecoins in one currency, as a number (display only). */
export function totalIn(balances: ChainBalance[], currency: 'USD' | 'EUR'): number {
  let sum = 0;
  for (const b of balances) {
    for (const a of [...b.tokens, ...(b.native ? [b.native] : [])]) {
      if (a.currency === currency) sum += Number(formatUnits(a.raw, a.decimals, 18));
    }
  }
  return sum;
}

let rpcId = 0;
export async function rpc<T = string>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = RPC_TIMEOUT_MS
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC error');
    return json.result as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const balanceOfData = (wallet: string) =>
  '0x70a08231' + wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export async function fetchChainBalance(
  chain: WalletChain,
  wallet: string
): Promise<ChainBalance> {
  try {
    const [native, ...tokens] = await Promise.all([
      chain.native
        ? rpc(chain.rpc, 'eth_getBalance', [wallet, 'latest']).then(
            (hex): Amount => ({ ...chain.native!, raw: hexToBigInt(hex) })
          )
        : Promise.resolve(null),
      ...chain.tokens.map((t) =>
        rpc(chain.rpc, 'eth_call', [
          { to: t.address, data: balanceOfData(wallet) },
          'latest'
        ]).then((hex): Amount => ({ ...t, raw: hexToBigInt(hex) }))
      )
    ]);
    return { chain, native, tokens: tokens as Amount[] };
  } catch (e) {
    return { chain, native: null, tokens: [], error: (e as Error).message };
  }
}

/** Reads every mainnet in parallel; one failing RPC only marks its own row. */
export function fetchWalletBalances(wallet: string, chains = WALLET_CHAINS) {
  return Promise.all(chains.map((c) => fetchChainBalance(c, wallet)));
}

/** Decodes the ABI string in NativeDisbursed data (uint256 amount, string memo). */
export function decodePayoutData(data: string): { amount: bigint; memo: string } {
  const hex = data.replace(/^0x/, '');
  const word = (i: number) => hex.slice(i * 64, (i + 1) * 64);
  const amount = BigInt('0x' + word(0));
  const offset = Number(BigInt('0x' + word(1))) / 32;
  const len = Number(BigInt('0x' + word(offset)));
  const bytesHex = hex.slice((offset + 1) * 64, (offset + 1) * 64 + len * 2);
  const bytes = new Uint8Array(bytesHex.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
  return { amount, memo: new TextDecoder().decode(bytes) };
}

type RawLog = { transactionHash: string; blockNumber: string; data: string };

/** Arc's public RPC caps eth_getLogs below 10,000 blocks, so this walks back in 9,000-block chunks. */
const LOG_CHUNK = 9000;

/** Last `limit` Arc payouts to this wallet over the last `blocks` blocks (newest first). */
export async function fetchArcPayouts(
  wallet: string,
  blocks = 27_000,
  limit = 10
): Promise<Payout[]> {
  const arc = WALLET_CHAINS.find((c) => c.chainId === 5042)!;
  const head = Number(hexToBigInt(await rpc(arc.rpc, 'eth_blockNumber', [])));
  const topics = [
    NATIVE_DISBURSED_TOPIC,
    '0x' + wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  ];
  const hex = (n: number) => '0x' + Math.max(0, n).toString(16);
  const logs: RawLog[] = [];
  // Sequential: the public RPC rate-limits parallel log queries.
  for (let to = head; to > head - blocks && to > 0 && logs.length < limit; to -= LOG_CHUNK) {
    const chunk = await rpc<RawLog[]>(arc.rpc, 'eth_getLogs', [
      { address: ARC_SPLIT, fromBlock: hex(to - LOG_CHUNK + 1), toBlock: hex(to), topics }
    ]);
    logs.push(...[...chunk].reverse());
  }
  return logs.slice(0, limit).map((l) => {
    const { amount, memo } = decodePayoutData(l.data);
    return {
      txHash: l.transactionHash,
      block: Number(hexToBigInt(l.blockNumber)),
      amount: { symbol: 'USDC', raw: amount, decimals: 18, currency: 'USD' },
      memo
    };
  });
}

/**
 * The "Motored fundraising for cats" event (Oct 2026): gifts with the memo `motored:user-N` are
 * Motored sponsor money (one sponsor, linked to the Token Tails founder), never separate donors or
 * outside wallets. Same test as the backend `motored` bucket and the client's motored.ts.
 */
export const MOTORED_MEMO_PREFIX = 'motored:';
export const MOTORED_LABEL = 'Motored-sponsored';
export const MOTORED_DISCLOSURE = 'Motored is linked to the Token Tails founder.';

export const isMotoredMemo = (memo: string | null | undefined) =>
  String(memo || '')
    .trim()
    .toLowerCase()
    .startsWith(MOTORED_MEMO_PREFIX);

/** Splits payouts into Motored sponsor money and the rest (the only rows any donor count may use). */
export function splitMotored(payouts: Payout[]): {
  motored: Payout[];
  others: Payout[];
  motoredUsd: number;
} {
  const motored = payouts.filter((p) => isMotoredMemo(p.memo));
  const others = payouts.filter((p) => !isMotoredMemo(p.memo));
  const motoredUsd = motored
    .filter((p) => p.amount.currency === 'USD')
    .reduce((sum, p) => sum + Number(formatUnits(p.amount.raw, p.amount.decimals, 18)), 0);
  return { motored, others, motoredUsd };
}

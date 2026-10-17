/**
 * F-CHECKOUT: the USDC tab. Wallet gifts straight into Pink Paw's ShelterSplit with the order's memo
 * `tt:rave:<16 hex>`, through the repo's own shelter-rail SDK: Arc sends native USDC with
 * donate(memo), every other chain approve + disburse(amount, memo) (Tempo: disburseWithMemo with the
 * bytes32 memo). The buyer pays gas (the gasless relay accepts only tt:wallet: memos). Chains come
 * from GET /rave/status (already filtered by the public giving gate) intersected with the published
 * split list. EURC splits are never used: a cat is a dollar.
 */
import type { Eip1193Provider, SdkChain, SdkCoin, ShelterRailSdk } from './sdk';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** Dollar coins a rave gift may use (same set the payout feed counts 1:1, plus testnet coins). */
export const USD_COINS: readonly string[] = Object.freeze(['USDC', 'USDC.e', 'USDG', 'pathUSD', 'mUSDC']);

export interface SplitDeployment {
  contract?: string;
  chainId?: number;
  address?: string;
  token?: string;
  symbol?: string;
  network?: string;
}

export interface UsdcChoice {
  chainId: number;
  name: string;
  split: string;
  coin: SdkCoin;
  /** Arc: native USDC through donate(memo). */
  native: boolean;
}

let sdkPromise: Promise<ShelterRailSdk> | null = null;

/** Loads shelter-rail/src/sdk.mjs on first use (it is not needed until the USDC tab is opened). */
export function loadSdk(): Promise<ShelterRailSdk> {
  if (!sdkPromise) {
    // @ts-ignore -- plain .mjs without a declaration file; typed by ./sdk.d.ts
    sdkPromise = import('../../../shelter-rail/src/sdk.mjs').then((m: unknown) => m as ShelterRailSdk);
    sdkPromise.catch(() => {
      sdkPromise = null;
    });
  }
  return sdkPromise;
}

/** The published split list: same origin on tokentails.com, the production copy elsewhere. */
export function deploymentsUrl(loc: Pick<Location, 'hostname'> | undefined = globalThis.location): string {
  const host = loc?.hostname ?? '';
  return host === 'tokentails.com' || host === 'www.tokentails.com' ? '/shelter-payouts/deployments.json' : 'https://tokentails.com/shelter-payouts/deployments.json';
}

export async function loadDeployments(fetchFn: typeof fetch = (...a) => fetch(...a), url = deploymentsUrl()): Promise<SplitDeployment[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8_000);
  try {
    const res = await fetchFn(url, { signal: ctl.signal, credentials: 'omit' });
    if (!res.ok) return [];
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as SplitDeployment[]) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** The ShelterSplit paying a dollar coin on `chainId` (never the EURC split), or null. */
export function pickSplit(deployments: readonly SplitDeployment[], chainId: number): string | null {
  for (const d of deployments) {
    if (!d || d.contract !== 'ShelterSplit' || d.chainId !== chainId) continue;
    const sym = String(d.symbol ?? d.token ?? 'USDC');
    if (/^EUR/i.test(sym)) continue;
    if (typeof d.address === 'string' && ADDRESS_RE.test(d.address)) return d.address;
  }
  return null;
}

/** The chain's dollar coin from the SDK table (its own coin first), or null. */
export function usdCoin(chain: SdkChain | undefined): SdkCoin | null {
  return chain?.coins.find((c) => USD_COINS.includes(c.symbol)) ?? null;
}

/** Arc mainnet and Arc testnet: the USDC tab opens on Arc (Arc week; Arc-first by default). */
export const ARC_FIRST: readonly number[] = Object.freeze([5042, 5042002]);

/**
 * Status chains that have both a published dollar split and an SDK entry: Arc first (the tab's default
 * pick), then the rest in status order.
 */
export function usdcChoices(statusChains: readonly number[], deployments: readonly SplitDeployment[], chains: Readonly<Record<number, SdkChain>>): UsdcChoice[] {
  const out: UsdcChoice[] = [];
  const ordered = [...statusChains.filter((c) => ARC_FIRST.includes(c)), ...statusChains.filter((c) => !ARC_FIRST.includes(c))];
  for (const chainId of ordered) {
    const chain = chains[chainId];
    const split = pickSplit(deployments, chainId);
    const coin = usdCoin(chain);
    if (!chain || !split || !coin) continue;
    out.push({ chainId, name: chain.name, split, coin, native: chain.nativeSymbol === 'USDC' });
  }
  return out;
}

/** 6-decimal units → Arc native wei (USDC is the gas coin there, 18 decimals). */
export function units6ToWei18(units6: string): bigint {
  return BigInt(units6) * 1_000_000_000_000n;
}

export function injectedProvider(): Eip1193Provider | null {
  const eth = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

/** Wallet errors → one buyer-facing line. */
export function walletMessage(err: unknown): string {
  const e = err as { code?: number; message?: string } | null;
  if (e?.code === 4001 || /user (rejected|denied)/i.test(e?.message ?? '')) return 'You cancelled in your wallet. Nothing was sent.';
  if (e?.code === 4902) return 'Your wallet does not know this chain yet. Add it in the wallet, then try again.';
  if (/insufficient funds|exceeds balance/i.test(e?.message ?? '')) return 'Not enough USDC (or gas) in this wallet.';
  return 'The wallet did not send the gift. Nothing was charged; try again.';
}

export interface GiveUsdcArgs {
  sdk: ShelterRailSdk;
  provider: Eip1193Provider;
  choice: UsdcChoice;
  memo: string;
  amountUnits6: string;
}

/** Sends the gift. Resolves with the tx hash once the wallet returns it (not mined yet). */
export async function giveUsdc({ sdk, provider, choice, memo, amountUnits6 }: GiveUsdcArgs): Promise<{ txHash: string; explorerUrl: string }> {
  if (!/^tt:rave:[0-9a-f]{16}$/.test(memo)) throw new Error('bad memo');
  if (!/^\d+$/.test(amountUnits6) || BigInt(amountUnits6) <= 0n) throw new Error('bad amount');
  const r = choice.native
    ? await sdk.donateWithInjected(provider, { chainId: choice.chainId, split: choice.split, amountWei: units6ToWei18(amountUnits6), memo })
    : await sdk.donateTokenWithInjected(provider, { chainId: choice.chainId, split: choice.split, token: choice.coin.address, amount: BigInt(amountUnits6), memo });
  return { txHash: r.txHash, explorerUrl: r.explorerUrl };
}

/**
 * Advertise with crypto: a plain USDC transfer on Arc from the buyer's injected wallet to the Token
 * Tails treasury (ad money is revenue, not a gift, so it never goes through the ShelterSplit). The
 * server answers the checkout with the exact amount ($100 plus a unique micro tag that matches the
 * transfer to the ad), the token and the recipient; this module checks them against what it knows
 * before the wallet opens: Arc only, the chain's own USDC, and on Arc mainnet the published treasury.
 */
import type { Eip1193Provider, SdkChain } from '../checkout/sdk';
import { ARC_FIRST, loadSdk, usdCoin } from '../checkout/usdc';
import type { AdUsdcPay } from './api';

/** ERC-20 transfer(address,uint256). */
export const TRANSFER_SELECTOR = '0xa9059cbb';
/** The Token Tails treasury on Arc mainnet (backend payments/crypto/treasury.public.ts). */
export const ARC_TREASURY = '0x7b136b872bEad1dAE557d1286f125B7A8A197C9A';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;

const word = (hex: string) => hex.toLowerCase().padStart(64, '0');

/** transfer(to, amount) calldata. */
export function encodeTransfer(to: string, amount: bigint): string {
  if (!ADDRESS_RE.test(to)) throw new Error('bad recipient');
  if (amount <= 0n) throw new Error('bad amount');
  return TRANSFER_SELECTOR + word(to.slice(2)) + word(amount.toString(16));
}

/** "100004321" (6 decimals) → "100.004321"; trailing zeros dropped ("100000000" → "100"). */
export function formatUnits6(amount: string): string {
  if (!/^\d+$/.test(amount)) return '0';
  const v = BigInt(amount);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
}

/** "0x7b13…9C9A". */
export const shortAddress = (a: string) => (ADDRESS_RE.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** Most base units above the price a tagged ad amount may carry (server: an offset of 10,000 plus a tag up to 9,999). */
export const AD_TAG_MAX_UNITS = 19_999n;

/**
 * Why the pay instruction cannot be trusted, or null when it can. The token must be the chain's own
 * USDC from the shelter-rail SDK table; on Arc mainnet the recipient must be the published treasury; the
 * amount must be the ad price plus at most AD_TAG_MAX_UNITS (about 2 cents) when `priceCents` is known.
 */
export function checkAdPay(pay: AdUsdcPay, sdkChains: Readonly<Record<number, SdkChain>>, priceCents?: number): string | null {
  if (!ARC_FIRST.includes(pay.chainId)) return 'chain';
  const coin = usdCoin(sdkChains[pay.chainId]);
  if (!coin || coin.address.toLowerCase() !== pay.token.toLowerCase()) return 'token';
  if (pay.chainId === 5042 && pay.recipient.toLowerCase() !== ARC_TREASURY.toLowerCase()) return 'recipient';
  if (pay.decimals !== 6 || !/^[1-9]\d*$/.test(pay.amount)) return 'amount';
  if (priceCents !== undefined) {
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return 'amount';
    const base = BigInt(priceCents) * 10_000n;
    const v = BigInt(pay.amount);
    if (v < base || v > base + AD_TAG_MAX_UNITS) return 'amount';
  }
  return null;
}

export type AddChainParams = (chainId: number) => Record<string, unknown> | null;

/** Switches the wallet to `chainId`, adding it (from the SDK table) when the wallet does not know it. */
export async function ensureChain(provider: Eip1193Provider, chainId: number, addParams: AddChainParams): Promise<void> {
  const read = async () => parseInt(String(await provider.request({ method: 'eth_chainId' })), 16);
  if ((await read()) === chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + chainId.toString(16) }] });
  } catch (err) {
    const params = addParams(chainId);
    if ((err as { code?: number })?.code !== 4902 || !params) throw err;
    await provider.request({ method: 'wallet_addEthereumChain', params: [params] });
  }
  // Some mobile wallets answer the switch without switching: on another chain the transfer would go to
  // an address with no USDC contract there (gas paid, nothing sent). Check before sending.
  if ((await read()) !== chainId) throw Object.assign(new Error('wrong chain'), { code: 'WRONG_CHAIN' });
}

export interface SendAdUsdcArgs {
  provider: Eip1193Provider;
  pay: AdUsdcPay;
  /** The ad price the server quoted (status.priceCents): caps the amount the wallet may send. */
  priceCents?: number;
  /** Defaults to the shelter-rail SDK's addChainParams (loaded on first use). */
  addParams?: AddChainParams;
  /** Defaults to the shelter-rail SDK's CHAINS. */
  sdkChains?: Readonly<Record<number, SdkChain>>;
}

/** Sends the transfer. Resolves with the tx hash once the wallet returns it (not mined yet). */
export async function sendAdUsdc({ provider, pay, priceCents, addParams, sdkChains }: SendAdUsdcArgs): Promise<{ txHash: string; from: string; explorerUrl: string | null }> {
  if (!addParams || !sdkChains) {
    const sdk = await loadSdk();
    addParams = addParams ?? sdk.addChainParams;
    sdkChains = sdkChains ?? sdk.CHAINS;
  }
  const bad = checkAdPay(pay, sdkChains, priceCents);
  if (bad) throw new Error(`bad pay instruction: ${bad}`);
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as unknown;
  const from = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
  if (!from) throw new Error('the wallet returned no account');
  await ensureChain(provider, pay.chainId, addParams);
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to: pay.token, value: '0x0', data: encodeTransfer(pay.recipient, BigInt(pay.amount)) }],
  });
  if (typeof txHash !== 'string' || !TX_RE.test(txHash)) throw new Error('the wallet returned no transaction');
  const explorer = sdkChains[pay.chainId]?.explorer;
  return { txHash, from, explorerUrl: explorer ? `${explorer.replace(/\/+$/, '')}/tx/${txHash}` : null };
}

/**
 * F-CHECKOUT: the slice of shelter-rail/src/sdk.mjs (MIT, no deps, plain .mjs) the USDC tab uses.
 * usdc.ts imports the module dynamically and casts it to this shape.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}

export interface SdkCoin {
  symbol: string;
  address: string;
  eip3009?: boolean;
  decimals?: number;
}

export interface SdkChain {
  name: string;
  rpc: string;
  explorer: string;
  nativeSymbol: string;
  nativeDecimals: number;
  testnet?: boolean;
  noNativeCoin?: boolean;
  memo32?: boolean;
  coins: readonly SdkCoin[];
}

export interface SdkGiftResult {
  txHash: string;
  chainId: number;
  from: string;
  explorerUrl: string;
  approveTxHash?: string | null;
  token?: string;
}

export interface ShelterRailSdk {
  CHAINS: Readonly<Record<number, SdkChain>>;
  coinFor(chainId: number, symbol?: string): SdkCoin | null;
  explorerTxUrl(chainId: number, txHash: string): string;
  donateWithInjected(provider: Eip1193Provider, args: { chainId: number; split: string; amountWei: bigint | string; memo?: string }): Promise<SdkGiftResult>;
  donateTokenWithInjected(
    provider: Eip1193Provider,
    args: { chainId: number; split: string; token?: string; amount: bigint | string; memo?: string; memo32?: string },
  ): Promise<SdkGiftResult>;
  waitForReceipt(provider: Eip1193Provider, txHash: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<unknown>;
}

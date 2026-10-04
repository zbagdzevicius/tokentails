/*
 * Crypto checkout API (docs/API.md "Crypto checkout"): USDC and EURC on every integrated EVM chain.
 * Types only; the client stage builds the checkout on them. Server source of truth:
 * backend/src/payments/crypto/ (crypto-checkout.schema.ts, crypto-checkout.service.ts).
 */

export type CryptoPayToken = "USDC" | "EURC";
export type CryptoPayRoute = "transfer" | "transferWithMemo" | "split";
export type CryptoPayBinding = "amount" | "memo";
export type CryptoPaySkuKind = "PACK" | "CAT" | "LOOT_BOX";
export type CryptoPayStatus = "OPEN" | "EXPIRED" | "PAID" | "COMPLETE" | "FAILED_GRANT" | "LATE";
export type CryptoPayMoneyTier = "pledged" | "onchain-custodial" | "onchain-shelter-held";

export const CRYPTO_PAY_ERROR_CODES = [
  "CRYPTO_PAY_DISABLED",
  "CRYPTO_PAY_BAD_SKU",
  "CRYPTO_PAY_NOT_FOR_SALE",
  "CRYPTO_PAY_ALREADY_OWNED",
  "CRYPTO_PAY_BUSY",
  "CRYPTO_PAY_NOT_FOUND",
  "CRYPTO_PAY_WRONG_CHAIN",
  "CRYPTO_PAY_BAD_TX",
  "CRYPTO_PAY_TX_FAILED",
  "CRYPTO_PAY_NO_MATCHING_TRANSFER",
  "CRYPTO_PAY_UNDERPAID",
  "CRYPTO_PAY_TX_BEFORE_ORDER",
  "CRYPTO_PAY_TX_USED",
  "CRYPTO_PAY_ALREADY_PAID",
  "CRYPTO_PAY_EXPIRED",
  "CRYPTO_PAY_RPC_UNAVAILABLE",
  "CRYPTO_PAY_TOO_MANY_ORDERS",
] as const;
export type CryptoPayErrorCode = (typeof CRYPTO_PAY_ERROR_CODES)[number];

export interface CryptoPayConfigToken {
  token: CryptoPayToken;
  /** What the token calls itself ("USDC.e" on Tempo). */
  symbol: string;
  address: string;
  decimals: number;
}

export interface CryptoPayConfigChain {
  chainId: number;
  name: string;
  testnet: boolean;
  explorer: string;
  confirmations: number;
  tokens: CryptoPayConfigToken[];
}

/** GET /payments/crypto/config */
export interface CryptoPayConfig {
  enabled: boolean;
  network: "mainnet" | "testnet";
  orderTtlSeconds: number;
  shelterHandedOver: boolean;
  prices: { packs: Record<string, number>; shelterCat: number; lootBox: number };
  /**
   * `fixed`: EURC is a fixed euro price (1 EURC per USD of the price, no conversion), `asOf` null.
   * `dated`: a set rate with its date. EURC is left out of `chains` while a set rate is stale.
   */
  fx: { EURC: { perUsd: string; asOf: string | null; source: "fixed" | "dated" } };
  chains: CryptoPayConfigChain[];
}

export type CryptoPaySku =
  | { kind: "PACK"; packType: "STARTER" | "INFLUENCER" | "LEGENDARY" }
  | { kind: "CAT"; catId: string }
  | { kind: "LOOT_BOX" };

export interface CryptoPayStep {
  kind: "transfer" | "transferWithMemo" | "approve" | "disburse";
  to: string;
  data: string;
  value: "0";
}

export interface CryptoPayOption {
  chainId: number;
  chainName: string;
  testnet: boolean;
  explorer: string;
  token: CryptoPayToken;
  symbol: string;
  tokenAddress: string;
  decimals: number;
  /** Base units, decimal string: send exactly this. */
  amount: string;
  amountDisplay: string;
  recipient: string;
  route: CryptoPayRoute;
  binding: CryptoPayBinding;
  memo: string | null;
  steps: CryptoPayStep[];
}

export interface CryptoPayShelterShare {
  route: "split" | "treasury";
  bps: number | null;
  evidenceTier: CryptoPayMoneyTier | null;
  state: string;
  amountUsdCents?: number | null;
  txHash?: string;
  chainId?: number;
}

/** POST /payments/crypto/orders (201) and GET /payments/crypto/orders/:orderId */
export interface CryptoPayOrder {
  orderId: string;
  status: CryptoPayStatus;
  sku: {
    kind: CryptoPaySkuKind;
    packType?: string;
    catId?: string;
    tier?: string;
    name?: string;
    shelter?: { _id: string; name: string; slug: string } | null;
  };
  priceUsd: number;
  priceUsdCents: number;
  discount: { code: string; percentage: number } | null;
  createdAt: string;
  expiresAt: string;
  accepted: CryptoPayOption[];
  shelterShare: CryptoPayShelterShare | null;
  payment?: {
    chainId: number;
    txHash: string;
    from: string;
    token: CryptoPayToken;
    amount: string;
    blockNumber: number;
    route: CryptoPayRoute;
  };
  grant?: { success: boolean; message: string; catId?: string; refund?: string };
}

/** POST /payments/crypto/orders/:orderId/confirm (200 or 202) */
export interface CryptoPayConfirmResult {
  orderId: string;
  status: CryptoPayStatus | "CONFIRMING";
  success?: boolean;
  message?: string;
  cat?: unknown;
  refund?: string;
  replay?: boolean;
  confirmations?: number;
  required?: number;
}

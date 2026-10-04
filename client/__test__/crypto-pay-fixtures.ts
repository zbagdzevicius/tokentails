import type { CryptoPayConfig, CryptoPayOption, CryptoPayOrder } from "@/models/crypto-pay";

// Calldata produced by ethers (backend/node_modules) for the same values the backend encodes in
// src/payments/crypto/crypto-evm.ts paymentSteps().
export const RECIPIENT = "0x1111111111111111111111111111111111111111";
export const SPLIT = "0x2222222222222222222222222222222222222222";
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const EURC = "0x808456652fdb597867f38412077A9182bf77359F";
export const TEMPO_USD = "0x20c0000000000000000000000000000000000000";
export const TX = "0x" + "ab".repeat(32);
export const APPROVE_TX = "0x" + "cd".repeat(32);

export const DATA = {
  transfer:
    "0xa9059cbb000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000004c4bc9",
  memo:
    "0x95777d59000000000000000000000000111111111111111111111111111111111111111100000000000000000000000000000000000000000000000000000000004c4b4074743a636f5f3966326334653161376233643565363000000000000000000000",
  approve:
    "0x095ea7b3000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000004c4b40",
  disburse:
    "0xc950e7d900000000000000000000000000000000000000000000000000000000004c4b400000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001774743a6361743a39663263346531613762336435653630000000000000000000",
};

export const transferOption = (over: Partial<CryptoPayOption> = {}): CryptoPayOption => ({
  chainId: 84532,
  chainName: "Base Sepolia",
  testnet: true,
  explorer: "https://sepolia.basescan.org",
  token: "USDC",
  symbol: "USDC",
  tokenAddress: USDC,
  decimals: 6,
  amount: "5000137",
  amountDisplay: "5.000137",
  recipient: RECIPIENT,
  route: "transfer",
  binding: "amount",
  memo: null,
  steps: [{ kind: "transfer", to: USDC, data: DATA.transfer, value: "0" }],
  ...over,
});

export const eurcOption = (): CryptoPayOption =>
  transferOption({
    token: "EURC",
    symbol: "EURC",
    tokenAddress: EURC,
    amount: "5000137",
    steps: [
      {
        kind: "transfer",
        to: EURC,
        data: DATA.transfer,
        value: "0",
      },
    ],
  });

export const memoOption = (): CryptoPayOption => ({
  chainId: 42431,
  chainName: "Tempo Testnet",
  testnet: true,
  explorer: "https://explore.testnet.tempo.xyz",
  token: "USDC",
  symbol: "pathUSD",
  tokenAddress: TEMPO_USD,
  decimals: 6,
  amount: "5000000",
  amountDisplay: "5",
  recipient: RECIPIENT,
  route: "transferWithMemo",
  binding: "memo",
  memo: "0x74743a636f5f3966326334653161376233643565363000000000000000000000",
  steps: [{ kind: "transferWithMemo", to: TEMPO_USD, data: DATA.memo, value: "0" }],
});

export const splitOption = (): CryptoPayOption => ({
  chainId: 5042002,
  chainName: "Arc Testnet",
  testnet: true,
  explorer: "https://explorer.testnet.arc.io",
  token: "USDC",
  symbol: "USDC",
  tokenAddress: USDC,
  decimals: 6,
  amount: "5000000",
  amountDisplay: "5",
  recipient: SPLIT,
  route: "split",
  binding: "memo",
  memo: "tt:cat:9f2c4e1a7b3d5e60",
  steps: [
    { kind: "approve", to: USDC, data: DATA.approve, value: "0" },
    { kind: "disburse", to: SPLIT, data: DATA.disburse, value: "0" },
  ],
});

export const config = (over: Partial<CryptoPayConfig> = {}): CryptoPayConfig => ({
  enabled: true,
  network: "testnet",
  orderTtlSeconds: 1800,
  shelterHandedOver: false,
  prices: { packs: { STARTER: 5, INFLUENCER: 25, LEGENDARY: 350 }, shelterCat: 5, lootBox: 1 },
  fx: { EURC: { perUsd: "0.9", asOf: "2026-10-04", source: "dated" } },
  chains: [
    {
      chainId: 84532,
      name: "Base Sepolia",
      testnet: true,
      explorer: "https://sepolia.basescan.org",
      confirmations: 2,
      tokens: [
        { token: "USDC", symbol: "USDC", address: USDC, decimals: 6 },
        { token: "EURC", symbol: "EURC", address: EURC, decimals: 6 },
      ],
    },
    {
      chainId: 42431,
      name: "Tempo Testnet",
      testnet: true,
      explorer: "https://explore.testnet.tempo.xyz",
      confirmations: 1,
      tokens: [{ token: "USDC", symbol: "pathUSD", address: TEMPO_USD, decimals: 6 }],
    },
  ],
  ...over,
});

export const order = (over: Partial<CryptoPayOrder> = {}, now = Date.now()): CryptoPayOrder => ({
  orderId: "co_9f2c4e1a7b3d5e60",
  status: "OPEN",
  sku: { kind: "PACK", packType: "STARTER" },
  priceUsd: 5,
  priceUsdCents: 500,
  discount: null,
  createdAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
  accepted: [transferOption(), eurcOption(), memoOption()],
  shelterShare: null,
  ...over,
});

import { cdnFile } from "@/constants/utils";

export const recipientEvm = "0x29D7d5361052c0990879D7926a0c98A63F9860F8";
export const recipientStellar =
  "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";
export const recipientSolana = "48ReRnWwnw68K2LTQjfUthtiXuQmaKG9zQnXUR8KMDJg";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  TAILS = "TAILS",
  XLM = "XLM",
  BNB = "BNB",
  SOL = "SOL",
  SEI = "SEI",
}

export enum ChainType {
  BNB = "BNB",
  BNB_TEST = "BNB_TEST",
  STELLAR = "STELLAR",
  STELLAR_TEST = "STELLAR_TEST",
  SOLANA = "SOLANA",
  MANTLE = "MANTLE",
  SOLANA_TEST = "SOLANA_TEST",
  SEI = "SEI",
}

export enum ChainNamespace {
  EVM = "EVM",
  STELLAR = "STELLAR",
  SOLANA = "SOLANA",
  SEI = "SEI",
}

export const ChainNamespaces = [
  ChainNamespace.SEI,
  ChainNamespace.EVM,
  ChainNamespace.STELLAR,
  ChainNamespace.SOLANA,
];

export const ChainNamespaceImg: Record<ChainNamespace, string> = {
  [ChainNamespace.EVM]: cdnFile("currency/BNB.webp"),
  [ChainNamespace.STELLAR]: cdnFile("currency/XLM.webp"),
  [ChainNamespace.SOLANA]: cdnFile("currency/SOL.webp"),
  [ChainNamespace.SEI]: cdnFile("currency/SEI.webp"),
};

export const ChainNamespacesCurrencies: Record<ChainNamespace, CurrencyType[]> =
  {
    [ChainNamespace.EVM]: [
      CurrencyType.BNB,
      CurrencyType.USDT,
      CurrencyType.USDC,
    ],
    [ChainNamespace.SEI]: [CurrencyType.SEI, CurrencyType.USDC],
    [ChainNamespace.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC],
    [ChainNamespace.SOLANA]: [CurrencyType.SOL],
  };

export const currencyContracts: Record<
  ChainType,
  Partial<Record<CurrencyType, any>>
> = {
  [ChainType.CAMP]: {
    [CurrencyType.TAILS]: "0x",
  },
  [ChainType.BNB]: {
    [CurrencyType.USDT]: "0x55d398326f99059fF775485246999027B3197955",
    [CurrencyType.USDC]: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    [CurrencyType.TAILS]: "0x",
  },
  [ChainType.BNB_TEST]: {
    [CurrencyType.USDT]: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    [CurrencyType.USDC]: "0x64544969ed7EBf5f083679233325356EbE738930",
    [CurrencyType.TAILS]: "0x",
  },
  [ChainType.SEI]: {
    [CurrencyType.USDC]: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
  },
  [ChainType.STELLAR]: {
    [CurrencyType.USDC]:
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
  [ChainType.STELLAR_TEST]: {
    [CurrencyType.USDC]: "0x",
  },
  [ChainType.SOLANA]: {
    [CurrencyType.SOL]: "0x",
  },
  [ChainType.SOLANA_TEST]: {
    [CurrencyType.SOL]: "0x",
  },
};

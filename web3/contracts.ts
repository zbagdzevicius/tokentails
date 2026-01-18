import { cdnFile } from "@/constants/utils";

export const recipientEvm = "0x29D7d5361052c0990879D7926a0c98A63F9860F8";
export const recipientStellar =
  "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";
export const recipientSolana = "48ReRnWwnw68K2LTQjfUthtiXuQmaKG9zQnXUR8KMDJg";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  XLM = "XLM",
  BNB = "BNB",
  SOL = "SOL",
  SEI = "SEI",
  ODP = "ODP",
  MNT = "MNT",
}

export enum ChainType {
  BNB = "BNB",
  STELLAR = "STELLAR",
  SOLANA = "SOLANA",
  MANTLE = "MANTLE",
  SEI = "SEI",
  TORUS = "TORUS",
}

export const EVM_CHAINS = [
  ChainType.BNB,
  ChainType.SEI,
  ChainType.MANTLE,
  ChainType.TORUS,
];

export const ChainImg: Record<ChainType, string> = {
  [ChainType.BNB]: cdnFile("currency/BNB.webp"),
  [ChainType.STELLAR]: cdnFile("currency/XLM.webp"),
  [ChainType.SOLANA]: cdnFile("currency/SOL.webp"),
  [ChainType.SEI]: cdnFile("currency/SEI.webp"),
  [ChainType.TORUS]: cdnFile("currency/ODP.webp"),
  [ChainType.MANTLE]: cdnFile("currency/MANTLE.webp"),
};

export const ChainCurrencies: Record<ChainType, CurrencyType[]> = {
  [ChainType.BNB]: [CurrencyType.BNB, CurrencyType.USDT, CurrencyType.USDC],
  [ChainType.SEI]: [CurrencyType.SEI, CurrencyType.USDC],
  [ChainType.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC],
  [ChainType.SOLANA]: [CurrencyType.SOL],
  [ChainType.TORUS]: [CurrencyType.ODP],
  [ChainType.MANTLE]: [CurrencyType.MNT],
};

export const currencyContracts: Record<
  ChainType,
  Partial<Record<CurrencyType, any>>
> = {
  [ChainType.MANTLE]: {},
  [ChainType.TORUS]: {
    [CurrencyType.ODP]: "0x7a900094798117A9a4bF8626F82b62f7f7536808",
  },
  [ChainType.BNB]: {
    [CurrencyType.USDT]: "0x55d398326f99059fF775485246999027B3197955",
    [CurrencyType.USDC]: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  },
  [ChainType.SEI]: {
    [CurrencyType.USDC]: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
  },
  [ChainType.STELLAR]: {
    [CurrencyType.USDC]:
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  },
  [ChainType.SOLANA]: {
    [CurrencyType.SOL]: "0x",
  },
};

export const recipient = "0x29D7d5361052c0990879D7926a0c98A63F9860F8";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  TAILS = "TAILS",
  BNB = "BNB",
}

export enum ChainType {
  SKALE = "SKALE",
  SKALE_TEST = "SKALE_TEST",
  BNB = "BNB",
  BNB_TEST = "BNB_TEST",
}

export const ChainTypeCurrencies: Record<ChainType, CurrencyType[]> = {
  [ChainType.BNB]: [CurrencyType.BNB, CurrencyType.USDT, CurrencyType.USDC],
  [ChainType.BNB_TEST]: [CurrencyType.BNB, CurrencyType.USDT, CurrencyType.USDC],
  [ChainType.SKALE]: [CurrencyType.TAILS],
  [ChainType.SKALE_TEST]: [CurrencyType.TAILS],
}

export const currencyContracts: Record<
  ChainType,
  Partial<Record<CurrencyType, `0x${string}`>>
> = {
  [ChainType.SKALE]: {
    [CurrencyType.TAILS]: "0x",
  },
  [ChainType.SKALE_TEST]: {
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
};

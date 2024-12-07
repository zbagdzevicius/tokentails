export const recipientEvm = "0x29D7d5361052c0990879D7926a0c98A63F9860F8";
// FREIGHTER TEST
// export const recipientStellar = "GBNJSE2FWUTCPX5CPY2QPJHF3JCXGNXU6KYP4J3VGUD7PLXP4TD64PSU";
// FREIGHTER
// export const recipientStellar = "GDZYQV5SUMCYIPS5HAGZ6HR73HCWLIKRL2FGMHH42UZNGHHE7MQVFOB3";
// LOBSTR
export const recipientStellar = "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  TAILS = "TAILS",
  XLM = "XLM",
  BNB = "BNB",
}

export enum ChainType {
  SKALE = "SKALE",
  SKALE_TEST = "SKALE_TEST",
  BNB = "BNB",
  BNB_TEST = "BNB_TEST",
  STELLAR = "STELLAR",
  STELLAR_TEST = "STELLAR_TEST",
}

export enum ChainNamespace {
  BNB = 'BNB',
  STELLAR = 'STELLAR',
}

export const ChainNamespaces = [ChainNamespace.BNB, ChainNamespace.STELLAR];

export const ChainNamespaceImg: Record<ChainNamespace, string> = {
  [ChainNamespace.BNB]: '/currency/BNB.webp',
  [ChainNamespace.STELLAR]: '/currency/XLM.webp',
}

export const ChainNamespacesCurrencies: Record<ChainNamespace, CurrencyType[]> = {
  [ChainNamespace.BNB]: [CurrencyType.BNB, CurrencyType.USDT, CurrencyType.USDC],
  [ChainNamespace.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC],
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
  [ChainType.STELLAR]: {
    [CurrencyType.USDC]: "0x",
  },
  [ChainType.STELLAR_TEST]: {
    [CurrencyType.USDC]: "0x",
  },
};

export const recipientEvm = "0x29D7d5361052c0990879D7926a0c98A63F9860F8";
// FREIGHTER TEST
// export const recipientStellar = "GBNJSE2FWUTCPX5CPY2QPJHF3JCXGNXU6KYP4J3VGUD7PLXP4TD64PSU";
// FREIGHTER
// export const recipientStellar = "GDZYQV5SUMCYIPS5HAGZ6HR73HCWLIKRL2FGMHH42UZNGHHE7MQVFOB3";
// LOBSTR
export const recipientStellar =
  "GD7GM5KP5B7MQ3NLYTLWA2EXEGGCWOTUVDP6WZIQDUPLQ7E2F67QKHSW";
export const recipientSolana = "48ReRnWwnw68K2LTQjfUthtiXuQmaKG9zQnXUR8KMDJg";

export enum CurrencyType {
  USDT = "USDT",
  USDC = "USDC",
  TAILS = "TAILS",
  XLM = "XLM",
  BNB = "BNB",
  ODP = "ODP",
  SOL = "SOL",
  DIAM = "DIAM",
}

export enum ChainType {
  SKALE = "SKALE",
  SKALE_TEST = "SKALE_TEST",
  BNB = "BNB",
  BNB_TEST = "BNB_TEST",
  STELLAR = "STELLAR",
  STELLAR_TEST = "STELLAR_TEST",
  SOLANA = "SOLANA",
  TORUS = "TORUS",
  CAMP_TEST = "CAMP_TEST",
  SOLANA_TEST = "SOLANA_TEST",
  DIAM = "DIAM",
}

export enum ChainNamespace {
  EVM = "EVM",
  TORUS = "TORUS",
  STELLAR = "STELLAR",
  SOLANA = "SOLANA",
}

export const ChainNamespaces = [
  ChainNamespace.EVM,
  ChainNamespace.STELLAR,
  ChainNamespace.SOLANA,
  ChainNamespace.TORUS,
];

export const ChainNamespaceImg: Record<ChainNamespace, string> = {
  [ChainNamespace.EVM]: "/currency/BNB.webp",
  [ChainNamespace.TORUS]: "/currency/ODP.webp",
  [ChainNamespace.STELLAR]: "/currency/XLM.webp",
  [ChainNamespace.SOLANA]: "/currency/SOL.webp",
};

export const ChainImg: Record<ChainType, string> = {
  [ChainType.BNB]: "/currency/BNB.webp",
  [ChainType.BNB_TEST]: "/currency/BNB.webp",
  [ChainType.STELLAR]: "/currency/XLM.webp",
  [ChainType.STELLAR_TEST]: "/currency/XLM.webp",
  [ChainType.SOLANA]: "/currency/SOL.webp",
  [ChainType.SOLANA_TEST]: "/currency/SOL.webp",
  [ChainType.SKALE]: "/currency/SKALE.png",
  [ChainType.SKALE_TEST]: "/currency/SKALE.png",
  [ChainType.TORUS]: "/currency/ODP.webp",
  [ChainType.DIAM]: "/currency/ODP.webp",
  [ChainType.CAMP_TEST]: "/currency/CAMP.webp",
};

export const ChainNamespacesCurrencies: Record<ChainNamespace, CurrencyType[]> =
  {
    [ChainNamespace.EVM]: [
      CurrencyType.BNB,
      CurrencyType.USDT,
      CurrencyType.USDC,
      CurrencyType.DIAM,
    ],
    [ChainNamespace.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC],
    [ChainNamespace.SOLANA]: [CurrencyType.SOL],
    [ChainNamespace.TORUS]: [CurrencyType.ODP],
  };

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
  [ChainType.CAMP_TEST]: {
    [CurrencyType.TAILS]: "0x",
  },
  [ChainType.BNB]: {
    [CurrencyType.USDT]: "0x55d398326f99059fF775485246999027B3197955",
    [CurrencyType.USDC]: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    [CurrencyType.DIAM]: "0x1FA0f5ed24a1a2b43741E88F8FEc19633e67082B",
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
  [ChainType.DIAM]: {},
  [ChainType.STELLAR_TEST]: {
    [CurrencyType.USDC]: "0x",
  },
  [ChainType.SOLANA]: {
    [CurrencyType.SOL]: "0x",
  },
  [ChainType.TORUS]: {
    [CurrencyType.ODP]: "0xFF47178dAE98Cb1D61c0e46f38EB68bEa5BDE284",
  },
  [ChainType.SOLANA_TEST]: {
    [CurrencyType.SOL]: "0x",
  },
};

export enum CurrencyType {
    USDT = 'USDT',
    USDC = 'USDC',
    TAILS = 'TAILS',
    BNB = 'BNB',
    SEI = 'SEI',
    ODP = 'ODP',
    XLM = 'XLM',
    SOL = 'SOL',
    MNT = 'MNT',
    ETH = 'ETH',
    USD = 'USD',
}

export const currencyRate = {
    [CurrencyType.BNB]: 600,
    [CurrencyType.SEI]: 0.1,
    [CurrencyType.ODP]: 0.001,
    [CurrencyType.USDC]: 1,
    [CurrencyType.USDT]: 1,
    [CurrencyType.XLM]: 0.2,
    [CurrencyType.SOL]: 150,
    [CurrencyType.ETH]: 2500,
    [CurrencyType.TAILS]: 0.03,
    [CurrencyType.MNT]: 1,
    [CurrencyType.USD]: 1,
};

export enum CurrencyType {
    USDT = 'USDT',
    USDC = 'USDC',
    XLM = 'XLM',
    USD = 'USD',
}

export const currencyRate = {
    [CurrencyType.USDC]: 1,
    [CurrencyType.USDT]: 1,
    [CurrencyType.XLM]: 0.2,
    [CurrencyType.USD]: 1,
};

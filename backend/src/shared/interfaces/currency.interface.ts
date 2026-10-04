export enum CurrencyType {
    USDT = 'USDT',
    USDC = 'USDC',
    XLM = 'XLM',
    USD = 'USD',
    /** Circle's euro coin, accepted by the crypto checkout (src/payments/crypto). */
    EURC = 'EURC',
}

export const currencyRate = {
    [CurrencyType.USDC]: 1,
    [CurrencyType.USDT]: 1,
    [CurrencyType.XLM]: 0.2,
    [CurrencyType.USD]: 1,
    // Not a market rate: the crypto checkout prices EURC from its own dated table (crypto-pay.config.ts).
    [CurrencyType.EURC]: 1,
};

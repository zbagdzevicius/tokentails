export enum CurrencyType {
    USDT = 'USDT',
    USDC = 'USDC',
    XLM = 'XLM',
    USD = 'USD',
    /** Circle's euro coin, accepted by the crypto checkout (src/payments/crypto). */
    EURC = 'EURC',
    /**
     * Euros, for the portrait card checkout (Stripe Checkout Session) only. Deliberately not in
     * `currencyRate`: that table feeds GET /cat/rates and the web3 rate table, and no other rail takes
     * EUR. The stats rate lives in src/payments/price-table.ts (PORTRAIT_STATS_USD_PER_EUR).
     */
    EUR = 'EUR',
}

export const currencyRate = {
    [CurrencyType.USDC]: 1,
    [CurrencyType.USDT]: 1,
    [CurrencyType.XLM]: 0.2,
    [CurrencyType.USD]: 1,
    // Not a market rate: the crypto checkout prices EURC from its own dated table (crypto-pay.config.ts).
    [CurrencyType.EURC]: 1,
};

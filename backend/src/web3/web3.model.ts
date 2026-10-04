import { CurrencyType } from 'src/shared/interfaces/currency.interface';

/**
 * `EVM`: an order paid through the crypto checkout (src/payments/crypto), USDC or EURC on one of the
 * EVM chains in src/payments/crypto/crypto-chains.ts. The chain id is on the order (`chainId`).
 */
export enum ChainType {
    STELLAR = 'STELLAR',
    FIAT = 'FIAT',
    EVM = 'EVM',
}

export const ChainTypeCurrencies: Record<ChainType, CurrencyType[]> = {
    [ChainType.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC, CurrencyType.USDT],
    [ChainType.FIAT]: [CurrencyType.USD],
    [ChainType.EVM]: [CurrencyType.USDC, CurrencyType.EURC],
};

export const chainTypeRpcUrl: Record<ChainType, string> = {
    [ChainType.STELLAR]: 'https://horizon.stellar.org',
    [ChainType.FIAT]: '',
    // One RPC per chain id: src/payments/crypto/crypto-pay.config.ts.
    [ChainType.EVM]: '',
};

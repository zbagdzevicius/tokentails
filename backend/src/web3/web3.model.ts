import { CurrencyType } from 'src/shared/interfaces/currency.interface';

export enum ChainType {
    STELLAR = 'STELLAR',
    FIAT = 'FIAT',
}

export const ChainTypeCurrencies: Record<ChainType, CurrencyType[]> = {
    [ChainType.STELLAR]: [CurrencyType.XLM, CurrencyType.USDC, CurrencyType.USDT],
    [ChainType.FIAT]: [CurrencyType.USD],
};

export const chainTypeRpcUrl: Record<ChainType, string> = {
    [ChainType.STELLAR]: 'https://horizon.stellar.org',
    [ChainType.FIAT]: '',
};

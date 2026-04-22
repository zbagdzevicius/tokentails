import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { JsonRpcProvider } from 'ethers';

export enum ChainType {
    BNB = 'BNB',
    ETH = 'ETH',
    STELLAR = 'STELLAR',
    TORUS = 'TORUS',
    MANTLE = 'MANTLE',
    SEI = 'SEI',
    BASE = 'BASE',
    FIAT = 'FIAT',
}

export const ChainTypeCurrencies: Record<ChainType, CurrencyType[]> = {
    [ChainType.BNB]: [CurrencyType.BNB, CurrencyType.USDT, CurrencyType.USDC],
    [ChainType.SEI]: [CurrencyType.SEI, CurrencyType.USDC],
    [ChainType.MANTLE]: [CurrencyType.MNT],
    [ChainType.ETH]: [CurrencyType.ETH, CurrencyType.USDC, CurrencyType.USDT],
    [ChainType.BASE]: [CurrencyType.USDC, CurrencyType.USDT],
    [ChainType.TORUS]: [],
    [ChainType.STELLAR]: [],
    [ChainType.FIAT]: [],
};

export const chainTypeRpcUrl: Record<ChainType, string> = {
    [ChainType.BNB]: 'https://bsc-dataseed.binance.org/',
    [ChainType.SEI]: 'https://sei-mainnet.g.alchemy.com/v2/_Ag2XJxvwpEd4hkDZhL1j',
    [ChainType.MANTLE]: 'https://rpc.mantle.xyz',
    [ChainType.BASE]: 'https://mainnet.base.org',
    [ChainType.TORUS]: 'https://rpc-v2.toruschain.com',
    [ChainType.STELLAR]: 'https://horizon.stellar.org',
    [ChainType.ETH]: 'https://eth.merkle.io',
    [ChainType.FIAT]: '',
};

export const chainTypeProvider: Partial<Record<ChainType, JsonRpcProvider>> = {
    [ChainType.BNB]: new JsonRpcProvider(chainTypeRpcUrl[ChainType.BNB]),
    [ChainType.SEI]: new JsonRpcProvider(chainTypeRpcUrl[ChainType.SEI]),
    [ChainType.MANTLE]: new JsonRpcProvider(chainTypeRpcUrl[ChainType.MANTLE]),
};

export interface IMintedNft {
    tokenId: number;
    hash: any;
    chainType: ChainType;
}

import { BadRequestException, Injectable } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { formatUnits, toBigInt } from 'ethers';
import { currencyRate, CurrencyType } from 'src/shared/interfaces/currency.interface';
import { ChainType, chainTypeProvider } from './web3.model';

const horizonServer = new StellarSdk.Horizon.Server(
    process.env.IS_PROD ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'
);

type CurrencyRate = Record<CurrencyType, number>;

@Injectable()
export class Web3Service {
    async validatePrice(currencyType: CurrencyType, price: number, chainType: ChainType, hash: string) {
        let hashUsdValue: number;
        if (currencyType === CurrencyType.ODP) {
            return { success: true };
        }
        const rates = await this.getCurrencyRates();
        if ([ChainType.BNB, ChainType.SEI, ChainType.TORUS].includes(chainType)) {
            hashUsdValue = await this.getEVMHashUsdValue(hash, chainType, currencyType, rates);
        }
        hashUsdValue = await this.getStellarHashUsdValue(hash, currencyType, rates);
        if (!hashUsdValue) {
            throw new BadRequestException("Price can't be verified");
        }

        return { success: true };
    }

    async getCurrencyRates(): Promise<CurrencyRate> {
        const rates = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbols=["BNBUSDC","SOLUSDC","XLMUSDC","SEIUSDC","ETHUSDC"]`
        )
            .then(res => res.json())
            .catch(e => console.error(e));

        const ratesObject = rates.reduce(
            (acc: Record<CurrencyType, number>, rate: { price: string; symbol: string }) => {
                const symbol = rate.symbol.replace(/USDC$/, '');
                acc[symbol as CurrencyType] = parseFloat(rate.price);
                return acc;
            },
            { ...currencyRate }
        );

        return ratesObject;
    }

    private async getEVMHashUsdValue(
        hash: string,
        chainType: ChainType,
        currencyType: CurrencyType,
        rates: CurrencyRate
    ): Promise<number> {
        const tx = await chainTypeProvider[chainType]?.getTransaction(hash);
        const isStableCoin = [CurrencyType.USDC, CurrencyType.USDT].includes(currencyType);

        if (!isStableCoin) {
            const valueInNonStableCoins = parseFloat(formatUnits(tx!.value, 18));

            return valueInNonStableCoins * rates[currencyType];
        }

        return parseFloat(formatUnits(toBigInt(`0x${tx?.data.slice(-64)}`), 18));
    }

    private async getStellarHashUsdValue(
        hash: string,
        currencyType: CurrencyType,
        rates: CurrencyRate
    ): Promise<number> {
        const isStableCoin = [CurrencyType.USDC, CurrencyType.USDT].includes(currencyType);

        const operations = await horizonServer.operations().forTransaction(hash).call();
        const sentTokens = operations.records.filter(
            op => op.type === 'payment' || op.type === 'path_payment_strict_send'
        );
        const amount = parseFloat((sentTokens?.[0] as any)?.amount) || 0;

        if (!isStableCoin) {
            return amount * rates[CurrencyType.XLM];
        }

        return amount;
    }
}

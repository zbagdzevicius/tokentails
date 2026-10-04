import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Types } from 'mongoose';
import { applyDiscountCents, discountPercentageForCode } from 'src/payments/price-table';
import { currencyRate, CurrencyType } from 'src/shared/interfaces/currency.interface';
import { UserRepository } from 'src/user/user.repository';
import { getOrderCatalogueCents } from './order-catalogue';
import { HASH_ALREADY_USED, OrderRepository } from './order.repository';
import { IOrder, OrderStatus } from './order.schema';
import {
    canonicalStellarHash,
    checkStellarPayment,
    expectedStellarAsset,
    getStellarTreasury,
    HorizonOperation,
    HorizonTransaction,
    isStellarTxHash,
    minimumStroops,
    StellarPaymentFailure,
    stellarHashAliases,
    stroopsToUnits,
} from './stellar-payment';
import { ChainType } from './web3.model';

const horizonServer = new StellarSdk.Horizon.Server(
    process.env.IS_PROD ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'
);

const XLM_RATE_URL = `https://api.binance.com/api/v3/ticker/price?symbols=["XLMUSDC"]`;

type CurrencyRate = Record<CurrencyType, number>;

const PAYMENT_FAILURE_MESSAGES: Record<StellarPaymentFailure, string> = {
    TX_NOT_SUCCESSFUL: 'Transaction was not successful',
    NO_PAYMENT_TO_TREASURY: 'Transaction does not pay the Token Tails account',
    WRONG_ASSET: 'Transaction pays in a different asset than the order',
    UNDERPAID: 'Transaction amount is below the price',
};

export interface VerifiedStellarPayment {
    success: true;
    /** Amount received by the treasury, in units of the order currency. */
    amount: number;
    /** USD value of `amount` at the rate used for verification. */
    priceUsd: number;
    /** When the payment's ledger closed (Horizon `created_at`); absent when Horizon did not say. */
    closedAt?: Date;
}

@Injectable()
export class Web3Service {
    constructor(private orderRepository: OrderRepository, private userRepository: UserRepository) {}

    /**
     * Verifies the Stellar payment behind the PENDING order that POST /web3/confirm has just
     * created for `hash`. The client `price` is not trusted: the minimum comes from the server
     * catalogue for the order's item, less a discount only when the code belongs to a user.
     *
     * On failure the order is marked FAILED and its hash released, so the payer can retry once
     * Horizon has the transaction. On success the order's price fields hold the verified amount.
     */
    async validatePrice(
        currencyType: CurrencyType,
        _clientPrice: number,
        chainType: ChainType,
        hash: string,
        orderId?: Types.ObjectId | string
    ): Promise<VerifiedStellarPayment> {
        if (chainType !== ChainType.STELLAR) {
            throw new BadRequestException('Unsupported chain');
        }
        if (!isStellarTxHash(hash)) {
            throw new BadRequestException('Invalid transaction hash');
        }
        // POST /web3/confirm stores the lowercased hash; Horizon returns lowercase hex too.
        hash = hash.toLowerCase();

        const orders = await this.orderRepository.findByHash(hash);
        const order = orderId
            ? orders.find(o => o._id?.toString() === orderId.toString())
            : orders.find(o => o.status === OrderStatus.PENDING);
        if (!order || order.status !== OrderStatus.PENDING) {
            throw new BadRequestException("Price can't be verified");
        }
        // The unique index makes this impossible; it guards databases where the index could not
        // be built because older duplicates exist.
        if (orders.some(o => o._id?.toString() !== order._id?.toString())) {
            return this.reject(order, hash, 'HASH_REUSED', new ConflictException(HASH_ALREADY_USED));
        }

        const asset = expectedStellarAsset(order.currencyType || currencyType);
        if (!asset || (order.currencyType && order.currencyType !== currencyType)) {
            return this.reject(order, hash, 'UNSUPPORTED_CURRENCY', new BadRequestException('Unsupported currency'));
        }

        const baseCents = getOrderCatalogueCents(order);
        if (baseCents === null) {
            return this.reject(order, hash, 'UNKNOWN_ITEM', new BadRequestException('Unknown item'));
        }
        const priceCents = applyDiscountCents(baseCents, await this.discountPercentage(order.discount));

        let xlmUsdRate: number | undefined;
        if (asset.type === 'native') {
            try {
                xlmUsdRate = await this.getLiveXlmUsdRate();
            } catch (error) {
                return this.reject(order, hash, 'RATE_UNAVAILABLE', error);
            }
        }

        let transaction: HorizonTransaction;
        let operations: HorizonOperation[];
        try {
            ({ transaction, operations } = await this.fetchStellarTransaction(hash));
        } catch (error) {
            const notFound = error?.response?.status === 404 || error?.name === 'NotFoundError';
            return this.reject(
                order,
                hash,
                notFound ? 'TX_NOT_FOUND' : 'HORIZON_ERROR',
                notFound
                    ? new BadRequestException('Transaction not found on Stellar yet, retry shortly')
                    : new ServiceUnavailableException("Price can't be verified right now, retry shortly")
            );
        }

        // One payment, one order: the order must hold the payment's canonical (outer) hash, and no
        // other order may hold any other hash Horizon resolves to it (a fee-bump's inner hash).
        if (
            canonicalStellarHash(transaction) !== hash ||
            (transaction.hash && transaction.hash.toLowerCase() !== hash)
        ) {
            return this.reject(
                order,
                hash,
                'NOT_CANONICAL_HASH',
                new BadRequestException('Confirm with the outer transaction hash of this payment')
            );
        }
        for (const alias of stellarHashAliases(transaction)) {
            if (alias !== hash && (await this.orderRepository.findByHash(alias)).length) {
                return this.reject(order, hash, 'HASH_REUSED', new ConflictException(HASH_ALREADY_USED));
            }
        }

        const check = checkStellarPayment({
            transaction,
            operations,
            destination: getStellarTreasury(),
            asset,
            minStroops: minimumStroops(asset, priceCents, xlmUsdRate),
        });
        if (!check.ok) {
            return this.reject(
                order,
                hash,
                check.reason!,
                new BadRequestException(PAYMENT_FAILURE_MESSAGES[check.reason!])
            );
        }

        const amount = stroopsToUnits(check.paidStroops);
        const priceUsd = asset.type === 'native' ? amount * xlmUsdRate! : amount;
        await this.orderRepository.update(order._id!, { $set: { price: amount, priceUsd } });

        const closed = transaction.created_at ? new Date(transaction.created_at) : null;
        return {
            success: true,
            amount,
            priceUsd,
            ...(closed && !isNaN(closed.getTime()) ? { closedAt: closed } : {}),
        };
    }

    /** Loads a transaction and its operations from Horizon. Throws Horizon's error when missing. */
    async fetchStellarTransaction(
        hash: string
    ): Promise<{ transaction: HorizonTransaction; operations: HorizonOperation[] }> {
        const [transaction, operations] = await Promise.all([
            horizonServer.transactions().transaction(hash).call(),
            horizonServer.operations().forTransaction(hash).limit(200).call(),
        ]);
        return {
            transaction: transaction as HorizonTransaction,
            operations: operations.records as unknown as HorizonOperation[],
        };
    }

    /** Live USD price of 1 XLM (Binance XLMUSDC, the source behind GET /cat/rates). */
    async getLiveXlmUsdRate(): Promise<number> {
        let rate: number | undefined;
        try {
            const tickers = await fetch(XLM_RATE_URL).then(res => res.json());
            const ticker = Array.isArray(tickers) ? tickers.find(t => t?.symbol === 'XLMUSDC') : undefined;
            rate = parseFloat(ticker?.price);
        } catch (error) {
            console.error('XLM rate lookup failed:', error);
        }
        // The static fallback in currencyRate is stale, so it is never used to price a payment.
        if (!rate || !Number.isFinite(rate) || rate <= 0) {
            throw new ServiceUnavailableException("XLM rate unavailable, price can't be verified right now");
        }
        return rate;
    }

    async getCurrencyRates(): Promise<CurrencyRate> {
        const rates = await fetch(XLM_RATE_URL)
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

    /** Same rule as POST /web3/validate-discount: only a code owned by a user discounts. */
    private async discountPercentage(code?: string): Promise<number> {
        const normalized = code?.trim().toLowerCase();
        if (!normalized) {
            return 0;
        }
        const owner = await this.userRepository.findOne({
            searchObject: { discount: normalized },
            projection: '_id',
        });
        return owner ? discountPercentageForCode(normalized) : 0;
    }

    private async reject(order: IOrder, hash: string, reason: string, error: Error): Promise<never> {
        try {
            await this.orderRepository.releaseHash(order._id!, hash, reason);
        } catch (releaseError) {
            console.error('Failed to release order hash after a failed verification:', releaseError);
        }
        throw error;
    }
}

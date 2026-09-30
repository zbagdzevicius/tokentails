import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderStatus, PackType, ProductType } from './order.schema';
import { DEFAULT_STELLAR_TREASURY, DEFAULT_STELLAR_USDC_ISSUER } from './stellar-payment';
import { ChainType } from './web3.model';
import { Web3Service } from './web3.service';

// The real UserRepository pulls in the user schema; the service only needs findOne.
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));

const mockTransactionCall = jest.fn();
const mockOperationsCall = jest.fn();
jest.mock('@stellar/stellar-sdk', () => ({
    Horizon: {
        Server: jest.fn().mockImplementation(() => ({
            transactions: () => ({ transaction: () => ({ call: () => mockTransactionCall() }) }),
            operations: () => ({
                forTransaction: () => {
                    const builder: any = { limit: () => builder, call: () => mockOperationsCall() };
                    return builder;
                },
            }),
        })),
    },
}));

const HASH = 'ab'.repeat(32);
const OTHER_ACCOUNT = 'GBOTHERACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const XLM_USD = 0.25;

const orderRepository = { findByHash: jest.fn(), releaseHash: jest.fn(), update: jest.fn() };
const userRepository = { findOne: jest.fn() };

function pendingOrder(fields: Record<string, unknown> = {}) {
    return {
        _id: 'order-1',
        hash: HASH,
        status: OrderStatus.PENDING,
        chainType: ChainType.STELLAR,
        currencyType: CurrencyType.XLM,
        entityType: EntityType.PACK,
        id: PackType.STARTER,
        price: 20,
        ...fields,
    };
}

const xlm = (amount: string, to = DEFAULT_STELLAR_TREASURY) => ({
    type: 'payment',
    to,
    amount,
    asset_type: 'native',
    transaction_successful: true,
});
const usdc = (amount: string, issuer = DEFAULT_STELLAR_USDC_ISSUER, to = DEFAULT_STELLAR_TREASURY) => ({
    type: 'payment',
    to,
    amount,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: issuer,
    transaction_successful: true,
});

function horizon(operations: any[], successful = true) {
    mockTransactionCall.mockResolvedValue({ hash: HASH, successful });
    mockOperationsCall.mockResolvedValue({ records: operations });
}

function verify(order = pendingOrder(), clientPrice = order.price as number) {
    orderRepository.findByHash.mockResolvedValue([order]);
    const service = new Web3Service(orderRepository as any, userRepository as any);
    return service.validatePrice(order.currencyType as CurrencyType, clientPrice, ChainType.STELLAR, order.hash);
}

describe('Web3Service.validatePrice (Stellar)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        userRepository.findOne.mockResolvedValue(null);
        (global as any).fetch = jest.fn().mockResolvedValue({
            json: async () => [{ symbol: 'XLMUSDC', price: String(XLM_USD) }],
        });
    });

    it('accepts an XLM payment to the treasury that covers the pack price at the live rate', async () => {
        horizon([xlm('20.0000000')]);

        await expect(verify()).resolves.toEqual({ success: true, amount: 20, priceUsd: 5 });
        expect(orderRepository.update).toHaveBeenCalledWith('order-1', { $set: { price: 20, priceUsd: 5 } });
        expect(orderRepository.releaseHash).not.toHaveBeenCalled();
    });

    it('accepts a USDC payment for a digital portrait', async () => {
        horizon([usdc('6.0000000')]);
        const order = pendingOrder({
            currencyType: CurrencyType.USDC,
            entityType: EntityType.IMAGE,
            id: ProductType.DIGITAL,
        });

        await expect(verify(order)).resolves.toEqual({ success: true, amount: 6, priceUsd: 6 });
    });

    it('rejects a payment to another account and releases the hash', async () => {
        horizon([xlm('20.0000000', OTHER_ACCOUNT)]);

        await expect(verify()).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'NO_PAYMENT_TO_TREASURY');
        expect(orderRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a transaction that did not succeed', async () => {
        horizon([xlm('20.0000000')], false);

        await expect(verify()).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'TX_NOT_SUCCESSFUL');
    });

    it('rejects a USDC order paid with a token from another issuer', async () => {
        horizon([usdc('5.0000000', 'GFAKEISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')]);

        await expect(verify(pendingOrder({ currencyType: CurrencyType.USDC, price: 5 }))).rejects.toBeInstanceOf(
            BadRequestException
        );
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'WRONG_ASSET');
    });

    it('rejects a USDC order paid in XLM', async () => {
        horizon([xlm('5.0000000')]);

        await expect(verify(pendingOrder({ currencyType: CurrencyType.USDC, price: 5 }))).rejects.toBeInstanceOf(
            BadRequestException
        );
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'WRONG_ASSET');
    });

    it('uses the server price, not the client price: 1 USDC does not buy a Legendary pack', async () => {
        horizon([usdc('1.0000000')]);
        const order = pendingOrder({ currencyType: CurrencyType.USDC, id: PackType.LEGENDARY, price: 1 });

        await expect(verify(order, 1)).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'UNDERPAID');
    });

    it('rejects XLM that falls short of the price beyond the rate tolerance', async () => {
        // $5 at 0.25 USD/XLM is 20 XLM; 3% tolerance allows 19.4, not 19.
        horizon([xlm('19.0000000')]);

        await expect(verify()).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'UNDERPAID');
    });

    it('sums several payments to the treasury and ignores payments elsewhere', async () => {
        horizon([xlm('12.0000000'), xlm('100.0000000', OTHER_ACCOUNT), xlm('8.0000000')]);

        await expect(verify()).resolves.toEqual({ success: true, amount: 20, priceUsd: 5 });
    });

    it('applies a discount only when the code belongs to a user', async () => {
        horizon([usdc('4.0000000')]);
        const order = pendingOrder({ currencyType: CurrencyType.USDC, discount: 'Friend', price: 4 });

        await expect(verify(order)).rejects.toBeInstanceOf(BadRequestException);

        jest.clearAllMocks();
        userRepository.findOne.mockResolvedValue({ _id: 'owner' });
        await expect(verify(order)).resolves.toEqual({ success: true, amount: 4, priceUsd: 4 });
        expect(userRepository.findOne).toHaveBeenCalledWith({
            searchObject: { discount: 'friend' },
            projection: '_id',
        });
    });

    it('rejects a hash that another order already holds', async () => {
        horizon([xlm('20.0000000')]);
        orderRepository.findByHash.mockResolvedValue([
            pendingOrder(),
            pendingOrder({ _id: 'order-0', status: OrderStatus.COMPLETE }),
        ]);
        const service = new Web3Service(orderRepository as any, userRepository as any);

        await expect(service.validatePrice(CurrencyType.XLM, 20, ChainType.STELLAR, HASH)).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'HASH_REUSED');
        expect(mockOperationsCall).not.toHaveBeenCalled();
    });

    it('rejects an order for an unknown item', async () => {
        horizon([xlm('20.0000000')]);

        await expect(verify(pendingOrder({ id: 'MEGA' }))).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'UNKNOWN_ITEM');
    });

    it('rejects a malformed hash before calling Horizon', async () => {
        horizon([xlm('20.0000000')]);

        await expect(verify(pendingOrder({ hash: 'not-a-hash' }))).rejects.toBeInstanceOf(BadRequestException);
        expect(mockOperationsCall).not.toHaveBeenCalled();
    });

    it('refuses to price XLM without a live rate', async () => {
        horizon([xlm('20.0000000')]);
        (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(verify()).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'RATE_UNAVAILABLE');
    });

    it('releases the hash when Horizon does not have the transaction yet, so the payer can retry', async () => {
        mockTransactionCall.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }));
        mockOperationsCall.mockRejectedValue(Object.assign(new Error('Not Found'), { response: { status: 404 } }));

        await expect(verify()).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'TX_NOT_FOUND');
    });

    it('rejects the inner hash of a fee-bump transaction, so one payment cannot be confirmed twice', async () => {
        // Horizon answers the inner hash with the fee-bump record; its canonical key is the outer hash.
        const OUTER = 'cd'.repeat(32);
        mockTransactionCall.mockResolvedValue({
            hash: HASH,
            successful: true,
            fee_bump_transaction: { hash: OUTER },
            inner_transaction: { hash: HASH },
        });
        mockOperationsCall.mockResolvedValue({ records: [xlm('20.0000000')] });

        await expect(verify()).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'NOT_CANONICAL_HASH');
        expect(orderRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a fee-bump hash when another order already holds its inner hash', async () => {
        const INNER = 'cd'.repeat(32);
        mockTransactionCall.mockResolvedValue({
            hash: HASH,
            successful: true,
            fee_bump_transaction: { hash: HASH },
            inner_transaction: { hash: INNER },
        });
        mockOperationsCall.mockResolvedValue({ records: [xlm('20.0000000')] });
        const order = pendingOrder();
        orderRepository.findByHash.mockImplementation(async (hash: string) =>
            hash === HASH ? [order] : [pendingOrder({ _id: 'order-0', hash: INNER, status: OrderStatus.COMPLETE })]
        );
        const service = new Web3Service(orderRepository as any, userRepository as any);

        await expect(service.validatePrice(CurrencyType.XLM, 20, ChainType.STELLAR, HASH)).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(orderRepository.findByHash).toHaveBeenCalledWith(INNER);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'HASH_REUSED');
    });

    it('accepts the outer hash of a fee-bump transaction nobody has used', async () => {
        mockTransactionCall.mockResolvedValue({
            hash: HASH,
            successful: true,
            fee_bump_transaction: { hash: HASH },
            inner_transaction: { hash: 'cd'.repeat(32) },
        });
        mockOperationsCall.mockResolvedValue({ records: [xlm('20.0000000')] });
        const order = pendingOrder();
        orderRepository.findByHash.mockImplementation(async (hash: string) => (hash === HASH ? [order] : []));
        const service = new Web3Service(orderRepository as any, userRepository as any);

        await expect(service.validatePrice(CurrencyType.XLM, 20, ChainType.STELLAR, HASH, 'order-1')).resolves.toEqual({
            success: true,
            amount: 20,
            priceUsd: 5,
        });
    });

    it('looks up an uppercase hash by its lowercase form', async () => {
        horizon([xlm('20.0000000')]);
        orderRepository.findByHash.mockResolvedValue([pendingOrder()]);
        const service = new Web3Service(orderRepository as any, userRepository as any);

        await expect(
            service.validatePrice(CurrencyType.XLM, 20, ChainType.STELLAR, HASH.toUpperCase(), 'order-1')
        ).resolves.toMatchObject({ success: true });
        expect(orderRepository.findByHash).toHaveBeenCalledWith(HASH);
    });

    it('prices a loot box that names a pack as an unknown item', async () => {
        horizon([usdc('1.0000000')]);
        const order = pendingOrder({ currencyType: CurrencyType.USDC, entityType: 'LOOT_BOX', id: PackType.LEGENDARY });

        await expect(verify(order, 1)).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.releaseHash).toHaveBeenCalledWith('order-1', HASH, 'UNKNOWN_ITEM');
    });

    it('still rejects non-Stellar chains', async () => {
        const service = new Web3Service(orderRepository as any, userRepository as any);

        await expect(service.validatePrice(CurrencyType.USD, 5, ChainType.FIAT, HASH)).rejects.toBeInstanceOf(
            BadRequestException
        );
    });
});

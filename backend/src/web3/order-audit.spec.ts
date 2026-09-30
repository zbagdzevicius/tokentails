import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { auditStellarOrder, auditStripeOrder, findDuplicateHashes, findSameStellarPayment } from './order-audit';
import { PackType, ProductType } from './order.schema';
import { DEFAULT_STELLAR_TREASURY, DEFAULT_STELLAR_USDC_ISSUER } from './stellar-payment';
import { ChainType } from './web3.model';

const HASH = 'cd'.repeat(32);
const options = { treasury: DEFAULT_STELLAR_TREASURY, maxXlmUsd: 1 };

const tx = (operations: any[], successful = true) => ({ transaction: { successful }, operations });
const xlmOp = (amount: string, to = DEFAULT_STELLAR_TREASURY) => ({
    type: 'payment',
    to,
    amount,
    asset_type: 'native',
});
const usdcOp = (amount: string) => ({
    type: 'payment',
    to: DEFAULT_STELLAR_TREASURY,
    amount,
    asset_type: 'credit_alphanum4',
    asset_code: 'USDC',
    asset_issuer: DEFAULT_STELLAR_USDC_ISSUER,
});

describe('order audit', () => {
    it('groups orders that share a non-empty hash', () => {
        const groups = findDuplicateHashes([
            { _id: 'a', hash: 'h1' },
            { _id: 'b', hash: 'h1' },
            { _id: 'c', hash: 'h2' },
            { _id: 'd', hash: '' },
            { _id: 'e', hash: '' },
            { _id: 'f' },
        ]);

        expect(groups).toEqual([['a', 'b']]);
    });

    describe('Stripe orders', () => {
        const stripe = (fields: Record<string, unknown>) => ({ _id: 'o1', chainType: ChainType.FIAT, ...fields });

        it('accepts catalogue prices, with or without a discount code', () => {
            expect(
                auditStripeOrder(stripe({ entityType: EntityType.IMAGE, id: ProductType.PRINT, price: 49 }))
            ).toBeNull();
            expect(
                auditStripeOrder(
                    stripe({ entityType: EntityType.PACK, id: PackType.INFLUENCER, price: 20, discount: 'x' })
                )
            ).toBeNull();
        });

        it('flags an amount below the catalogue price', () => {
            expect(auditStripeOrder(stripe({ entityType: EntityType.PACK, id: PackType.LEGENDARY, price: 1 }))).toEqual(
                {
                    orderId: 'o1',
                    issue: 'BELOW_CATALOGUE',
                    paid: 1,
                    expectedMin: 350,
                }
            );
        });

        it('flags an amount above the catalogue price separately', () => {
            expect(
                auditStripeOrder(stripe({ entityType: EntityType.PACK, id: PackType.LEGENDARY, price: 400 }))?.issue
            ).toBe('ABOVE_CATALOGUE');
        });

        it('ignores Stellar orders', () => {
            expect(auditStripeOrder({ _id: 'o1', chainType: ChainType.STELLAR, price: 1 })).toBeNull();
        });
    });

    describe('Stellar orders', () => {
        const stellar = (fields: Record<string, unknown> = {}) => ({
            _id: 'o2',
            hash: HASH,
            chainType: ChainType.STELLAR,
            currencyType: CurrencyType.XLM,
            entityType: EntityType.PACK,
            id: PackType.STARTER,
            price: 20,
            ...fields,
        });

        it('passes a payment to the treasury that covers the price', () => {
            expect(auditStellarOrder(stellar(), tx([xlmOp('20')]), options)).toEqual([]);
        });

        it('flags payments to another destination', () => {
            expect(auditStellarOrder(stellar(), tx([xlmOp('20', 'GELSEWHERE')]), options)).toEqual([
                { orderId: 'o2', issue: 'NO_PAYMENT_TO_TREASURY' },
            ]);
        });

        it('flags the wrong asset and missing transactions', () => {
            expect(
                auditStellarOrder(stellar({ currencyType: CurrencyType.USDC }), tx([xlmOp('5')]), options)[0].issue
            ).toBe('WRONG_ASSET');
            expect(auditStellarOrder(stellar(), null, options)[0].issue).toBe('TX_NOT_FOUND');
        });

        it('flags orders underpaid even at the generous XLM rate, and payments below the claimed price', () => {
            const findings = auditStellarOrder(
                stellar({ id: PackType.LEGENDARY, price: 1500 }),
                tx([xlmOp('1')]),
                options
            );

            expect(findings.map(f => f.issue)).toEqual(['UNDERPAID', 'BELOW_CLAIMED_PRICE']);
        });

        it('checks USDC 1:1 against the catalogue', () => {
            const order = stellar({
                currencyType: CurrencyType.USDC,
                entityType: EntityType.IMAGE,
                id: 'digital',
                price: 6,
            });
            expect(auditStellarOrder(order, tx([usdcOp('6')]), options)).toEqual([]);
            expect(auditStellarOrder({ ...order, price: 5 }, tx([usdcOp('5')]), options)[0].issue).toBe('UNDERPAID');
        });
    });

    it('flags a Stellar order that holds the inner hash of a fee-bump transaction', () => {
        const order = {
            _id: 'o1',
            hash: HASH,
            chainType: ChainType.STELLAR,
            currencyType: CurrencyType.XLM,
            entityType: EntityType.PACK,
            id: PackType.STARTER,
            price: 5,
        };
        const feeBump = {
            transaction: {
                successful: true,
                hash: HASH,
                fee_bump_transaction: { hash: 'ef'.repeat(32) },
                inner_transaction: { hash: HASH },
            },
            operations: [xlmOp('5.0000000')],
        };

        expect(auditStellarOrder(order, feeBump, options)).toEqual([{ orderId: 'o1', issue: 'NOT_CANONICAL_HASH' }]);
    });

    it('groups orders whose different hashes resolve to one Stellar payment', () => {
        expect(
            findSameStellarPayment([
                { orderId: 'inner', canonical: 'outer-hash' },
                { orderId: 'outer', canonical: 'outer-hash' },
                { orderId: 'other', canonical: 'another-hash' },
                { orderId: 'missing' },
            ])
        ).toEqual([['inner', 'outer']]);
    });
});

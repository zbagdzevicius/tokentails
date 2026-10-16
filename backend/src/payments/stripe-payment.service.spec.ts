import { BadRequestException } from '@nestjs/common';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderStatus, PackType, ProductType } from 'src/web3/order.schema';
import {
    getPackPriceCents,
    getPortraitCheckoutPrice,
    getPortraitPriceCents,
    LEGENDARY_PROMO_ENDS_AT,
    PACK_PRICES_CENTS,
    PORTRAIT_CHECKOUT_CURRENCY,
    PORTRAIT_CHECKOUT_PRICES_CENTS,
    PORTRAIT_LEGACY_DIGITAL_USD_CENTS,
    PORTRAIT_PRICES_CENTS,
    portraitPriceUsdForStats,
} from './price-table';
import * as priceTable from './price-table';
import { StripePaymentService } from './stripe-payment.service';

// The real repositories pull in Mongoose models; the service only needs the methods mocked below.
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));

const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const USER_ID = '64b7f0c2a1b2c3d4e5f60719';

function createService() {
    const orderModel = { findOneAndUpdate: jest.fn() };
    const orderRepository = { model: orderModel, findOne: jest.fn() };
    const userRepository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new StripePaymentService(orderRepository as any, userRepository as any);
    const stripe = {
        paymentIntents: {
            create: jest.fn().mockResolvedValue({ client_secret: 'secret_1' }),
            retrieve: jest.fn(),
        },
    };
    (service as any).stripeClient = stripe;
    return { service, orderModel, orderRepository, userRepository, stripe };
}

function intent(overrides: Record<string, any> = {}, metadata: Record<string, string> = {}): any {
    return {
        id: 'pi_1',
        status: 'succeeded',
        currency: 'usd',
        amount: 500,
        amount_received: 500,
        metadata: {
            entityType: EntityType.PACK,
            packType: PackType.STARTER,
            id: PackType.STARTER,
            productType: ProductType.DIGITAL,
            userId: USER_ID,
            expectedAmount: '500',
            ...metadata,
        },
        ...overrides,
    };
}

const DURING_SALE = new Date('2026-10-04T12:00:00Z');
const LAST_SALE_SECOND = new Date('2026-11-27T23:59:59Z');
const AFTER_SALE = new Date('2026-11-28T00:00:00Z');

const LONG_AGO = new Date('2026-09-01T12:00:00Z');
const FAR_LATER = new Date('2027-06-01T12:00:00Z');

describe('price table', () => {
    it('matches the catalogue: card portraits €14/€49/€69, USD portraits $16, packs $5/$25/$350 regular', () => {
        expect(PORTRAIT_CHECKOUT_CURRENCY).toBe('eur');
        expect(PORTRAIT_CHECKOUT_PRICES_CENTS).toEqual({ digital: 1400, print: 4900, canvas: 6900 });
        expect(getPortraitCheckoutPrice(ProductType.DIGITAL)).toEqual({ cents: 1400, currency: 'eur' });
        expect(PORTRAIT_PRICES_CENTS).toEqual({ digital: 1600, print: 4900, canvas: 6900 });
        expect(getPortraitPriceCents(ProductType.DIGITAL)).toBe(1600);
        expect(PACK_PRICES_CENTS).toEqual({ STARTER: 500, INFLUENCER: 2500, LEGENDARY: 35000 });
    });

    it('keeps the retired $6 digital price only as a historical value, with no date or env switch', () => {
        expect(PORTRAIT_LEGACY_DIGITAL_USD_CENTS).toBe(600);
        const table = priceTable as Record<string, unknown>;
        expect(table.PORTRAIT_USD_PRICE_CHANGED_AT).toBeUndefined();
        expect(table.portraitUsdFloorCents).toBeUndefined();
        expect(table.portraitUsdPriceChangedAt).toBeUndefined();
    });

    it('converts euro cents to a USD stats value in dollars', () => {
        expect(portraitPriceUsdForStats(1400)).toBe(16.1);
        expect(portraitPriceUsdForStats(4900)).toBe(56.35);
    });

    it('sells the Legendary pack for $100 through 27 Nov 2026 23:59:59 UTC, then $350', () => {
        expect(LEGENDARY_PROMO_ENDS_AT.toISOString()).toBe('2026-11-28T00:00:00.000Z');
        expect(getPackPriceCents(PackType.LEGENDARY, DURING_SALE)).toBe(10000);
        expect(getPackPriceCents(PackType.LEGENDARY, LAST_SALE_SECOND)).toBe(10000);
        expect(getPackPriceCents(PackType.LEGENDARY, AFTER_SALE)).toBe(35000);
        // Other packs are never on sale.
        expect(getPackPriceCents(PackType.STARTER, DURING_SALE)).toBe(500);
        expect(getPackPriceCents(PackType.INFLUENCER, DURING_SALE)).toBe(2500);
    });
});

describe('StripePaymentService', () => {
    describe('createPaymentIntent', () => {
        it('charges the Legendary sale price ($100) while the sale runs', async () => {
            const { service, stripe } = createService();
            await service.createPaymentIntent(
                {
                    entityType: EntityType.PACK,
                    packType: PackType.LEGENDARY,
                    userId: USER_ID,
                },
                DURING_SALE
            );
            const params = stripe.paymentIntents.create.mock.calls[0][0];
            expect(params.amount).toBe(10000);
            expect(params.metadata).toMatchObject({ expectedAmount: '10000' });
        });

        it('charges the server price for a pack, not a client amount', async () => {
            const { service, stripe } = createService();
            await service.createPaymentIntent(
                {
                    entityType: EntityType.PACK,
                    packType: PackType.LEGENDARY,
                    userId: USER_ID,
                },
                AFTER_SALE
            );

            const params = stripe.paymentIntents.create.mock.calls[0][0];
            expect(params.amount).toBe(35000);
            expect(params.currency).toBe('usd');
            expect(params.metadata).toMatchObject({
                entityType: EntityType.PACK,
                packType: PackType.LEGENDARY,
                userId: USER_ID,
                expectedAmount: '35000',
            });
        });

        it('charges the server price for a digital portrait', async () => {
            const { service, stripe } = createService();
            await service.createPaymentIntent({
                entityType: EntityType.IMAGE,
                productType: ProductType.DIGITAL,
                imageId: IMAGE_ID,
                userId: USER_ID,
            });

            const params = stripe.paymentIntents.create.mock.calls[0][0];
            expect(params.amount).toBe(1600);
            expect(params.currency).toBe('usd');
            expect(params.metadata).toMatchObject({ imageId: IMAGE_ID, id: IMAGE_ID, expectedAmount: '1600' });
        });

        it('charges euros on the card checkout and dollars on the PaymentIntent for a digital portrait', () => {
            const { service } = createService();
            expect(service.portraitCheckoutAmountCents(ProductType.DIGITAL)).toBe(1400);
            expect(service.portraitCheckoutAmountCents(ProductType.PRINT)).toBe(4900);
            expect(service.portraitCheckoutAmountCents(ProductType.CANVAS)).toBe(6900);
            expect(getPortraitPriceCents(ProductType.DIGITAL)).toBe(1600);
            expect(() => service.portraitCheckoutAmountCents('poster' as ProductType)).toThrow(BadRequestException);
        });

        it('applies a discount only for a code that belongs to a user', async () => {
            const { service, stripe, userRepository } = createService();
            userRepository.findOne.mockResolvedValueOnce({ _id: 'owner' });
            await service.createPaymentIntent({
                entityType: EntityType.PACK,
                packType: PackType.INFLUENCER,
                userId: USER_ID,
                discount: 'SEI',
            });
            expect(stripe.paymentIntents.create.mock.calls[0][0].amount).toBe(2250);
            expect(stripe.paymentIntents.create.mock.calls[0][0].metadata.discount).toBe('sei');

            userRepository.findOne.mockResolvedValueOnce(null);
            await service.createPaymentIntent({
                entityType: EntityType.PACK,
                packType: PackType.INFLUENCER,
                userId: USER_ID,
                discount: 'made-up',
            });
            expect(stripe.paymentIntents.create.mock.calls[1][0].amount).toBe(2500);
        });

        it("gives no discount (and so no affiliate share) for the buyer's own code", async () => {
            const { service, stripe, userRepository } = createService();
            userRepository.findOne.mockResolvedValueOnce({ _id: USER_ID });
            await service.createPaymentIntent({
                entityType: EntityType.PACK,
                packType: PackType.INFLUENCER,
                userId: USER_ID,
                discount: 'mine',
            });
            const params = stripe.paymentIntents.create.mock.calls[0][0];
            expect(params.amount).toBe(2500);
            expect(params.metadata.discount ?? '').toBe('');
        });

        it('rejects an unknown pack type', async () => {
            const { service, stripe } = createService();
            await expect(
                service.createPaymentIntent({ entityType: EntityType.PACK, packType: 'FREE', userId: USER_ID })
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
        });
    });

    describe('verifySucceededPaymentIntent', () => {
        it('accepts a succeeded intent that paid the server price', () => {
            const { service } = createService();
            const verified = service.verifySucceededPaymentIntent(intent(), USER_ID);
            expect(verified).toMatchObject({
                intentId: 'pi_1',
                entityType: EntityType.PACK,
                packType: PackType.STARTER,
                amountCents: 500,
                amountUsd: 5,
            });
        });

        it('accepts a $100 Legendary intent created during the sale, even when verified after it ends', () => {
            const { service } = createService();
            const saleLegendary = intent(
                { amount: 10000, amount_received: 10000, created: Math.floor(LAST_SALE_SECOND.getTime() / 1000) },
                { packType: PackType.LEGENDARY, id: PackType.LEGENDARY, expectedAmount: '10000' }
            );
            expect(service.verifySucceededPaymentIntent(saleLegendary, USER_ID)).toMatchObject({ amountCents: 10000 });
        });

        it('rejects a $100 Legendary intent created after the sale ended', () => {
            const { service } = createService();
            const lateLegendary = intent(
                { amount: 10000, amount_received: 10000, created: Math.floor(AFTER_SALE.getTime() / 1000) },
                { packType: PackType.LEGENDARY, id: PackType.LEGENDARY, expectedAmount: '10000' }
            );
            expect(() => service.verifySucceededPaymentIntent(lateLegendary, USER_ID)).toThrow(
                'Payment amount does not match the price'
            );
        });

        it('rejects an intent that paid less than the server price', () => {
            const { service } = createService();
            const cheapLegendary = intent(
                { amount: 100, amount_received: 100 },
                { packType: PackType.LEGENDARY, id: PackType.LEGENDARY, expectedAmount: '100' }
            );
            expect(() => service.verifySucceededPaymentIntent(cheapLegendary, USER_ID)).toThrow(
                'Payment amount does not match the price'
            );
        });

        it('rejects a legacy intent (no expectedAmount) below the price minus the largest discount', () => {
            const { service } = createService();
            const legacy = intent({ amount: 399, amount_received: 399 }, { expectedAmount: '' });
            expect(() => service.verifySucceededPaymentIntent(legacy, USER_ID)).toThrow(BadRequestException);

            const legacyDiscounted = intent({ amount: 400, amount_received: 400 }, { expectedAmount: '' });
            expect(service.verifySucceededPaymentIntent(legacyDiscounted, USER_ID).amountCents).toBe(400);
        });

        it('rejects an intent owned by another user, unpaid, or not in USD', () => {
            const { service } = createService();
            expect(() => service.verifySucceededPaymentIntent(intent(), 'someone-else')).toThrow(
                'Unauthorized payment confirmation'
            );
            expect(() =>
                service.verifySucceededPaymentIntent(intent({ status: 'requires_payment_method' }), USER_ID)
            ).toThrow('Payment not successful');
            expect(() => service.verifySucceededPaymentIntent(intent({ currency: 'eur' }), USER_ID)).toThrow(
                'Unexpected payment currency'
            );
        });

        const portraitIntent = (amount: number, created: Date, expectedAmount: string) =>
            intent(
                { amount, amount_received: amount, created: Math.floor(created.getTime() / 1000) },
                { entityType: EntityType.IMAGE, imageId: IMAGE_ID, id: IMAGE_ID, expectedAmount }
            );

        it('confirms a $6 portrait intent at its stored price, at any date', () => {
            const { service } = createService();
            for (const created of [LONG_AGO, FAR_LATER]) {
                const verified = service.verifySucceededPaymentIntent(portraitIntent(600, created, '600'), USER_ID);
                expect(verified).toMatchObject({ entityType: EntityType.IMAGE, imageId: IMAGE_ID, amountCents: 600 });
            }
        });

        it('holds a $16 portrait intent at its stored price: 600 received is refused', () => {
            const { service } = createService();
            for (const created of [LONG_AGO, FAR_LATER]) {
                expect(() =>
                    service.verifySucceededPaymentIntent(portraitIntent(600, created, '1600'), USER_ID)
                ).toThrow('Payment amount does not match the price');
                expect(
                    service.verifySucceededPaymentIntent(portraitIntent(1600, created, '1600'), USER_ID).amountCents
                ).toBe(1600);
            }
        });

        it('a portrait intent with no expectedAmount must cover $16 minus 20%', () => {
            const { service } = createService();
            expect(() => service.verifySucceededPaymentIntent(portraitIntent(1279, FAR_LATER, ''), USER_ID)).toThrow(
                'Payment amount does not match the price'
            );
            expect(service.verifySucceededPaymentIntent(portraitIntent(1280, LONG_AGO, ''), USER_ID).amountCents).toBe(
                1280
            );
        });

        it('ignores any PORTRAIT_USD_PRICE_CHANGED_AT left in the env', () => {
            const { service } = createService();
            const saved = process.env.PORTRAIT_USD_PRICE_CHANGED_AT;
            process.env.PORTRAIT_USD_PRICE_CHANGED_AT = '2099-01-01T00:00:00Z';
            try {
                expect(() =>
                    service.verifySucceededPaymentIntent(portraitIntent(600, FAR_LATER, '1600'), USER_ID)
                ).toThrow('Payment amount does not match the price');
                expect(
                    service.verifySucceededPaymentIntent(portraitIntent(600, FAR_LATER, '600'), USER_ID).amountCents
                ).toBe(600);
            } finally {
                if (saved === undefined) delete process.env.PORTRAIT_USD_PRICE_CHANGED_AT;
                else process.env.PORTRAIT_USD_PRICE_CHANGED_AT = saved;
            }
        });

        it('rejects a portrait intent without a valid image id', () => {
            const { service } = createService();
            const portrait = intent(
                { amount: 600, amount_received: 600 },
                { entityType: EntityType.IMAGE, imageId: 'nope', id: 'nope', expectedAmount: '600' }
            );
            expect(() => service.verifySucceededPaymentIntent(portrait, USER_ID)).toThrow(
                'Generated image id is missing for portrait checkout'
            );
        });
    });

    describe('claimPaymentIntent', () => {
        const verified = {
            intentId: 'pi_1',
            entityType: EntityType.PACK as const,
            productType: ProductType.DIGITAL,
            packType: PackType.STARTER,
            amountCents: 500,
            amountUsd: 5,
        };

        it('claims the intent on first use with an upsert keyed on the intent id', async () => {
            const { service, orderModel } = createService();
            orderModel.findOneAndUpdate.mockResolvedValue({
                value: { _id: 'o1', hash: 'pi_1' },
                lastErrorObject: { updatedExisting: false },
            });

            const result = await service.claimPaymentIntent(verified, { entityType: EntityType.PACK });

            expect(result.claimed).toBe(true);
            const [filter, update, options] = orderModel.findOneAndUpdate.mock.calls[0];
            expect(filter).toEqual({ hash: 'pi_1' });
            expect(update.$setOnInsert).toMatchObject({ status: OrderStatus.PENDING, hash: 'pi_1', priceUsd: 5 });
            expect(options).toMatchObject({ upsert: true });
        });

        it('does not claim a replayed intent', async () => {
            const { service, orderModel } = createService();
            orderModel.findOneAndUpdate.mockResolvedValue({
                value: { _id: 'o1', hash: 'pi_1', status: OrderStatus.COMPLETE },
                lastErrorObject: { updatedExisting: true },
            });

            const result = await service.claimPaymentIntent(verified, {});
            expect(result).toEqual({ claimed: false, order: expect.objectContaining({ _id: 'o1' }) });
        });

        it('does not claim when the unique hash index rejects a concurrent insert', async () => {
            const { service, orderModel, orderRepository } = createService();
            orderModel.findOneAndUpdate.mockRejectedValue({ code: 11000 });
            orderRepository.findOne.mockResolvedValue({ _id: 'o1' });

            const result = await service.claimPaymentIntent(verified, {});
            expect(result.claimed).toBe(false);
        });

        it('lets only one of two concurrent confirms claim', async () => {
            const { service, orderModel } = createService();
            let resolveFirst: (v: any) => void = () => undefined;
            orderModel.findOneAndUpdate.mockReturnValueOnce(new Promise(r => (resolveFirst = r)));

            const first = service.claimPaymentIntent(verified, {});
            const second = await service.claimPaymentIntent(verified, {});
            resolveFirst({ value: { _id: 'o1' }, lastErrorObject: { updatedExisting: false } });

            expect(second.claimed).toBe(false);
            expect((await first).claimed).toBe(true);
            expect(orderModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
        });
    });

    describe('checkPaidCheckoutSession', () => {
        const session = (overrides: Record<string, any> = {}): any => ({
            id: 'cs_1',
            payment_status: 'paid',
            currency: 'eur',
            amount_total: 6900,
            ...overrides,
        });
        const eurOrder = (fields: Record<string, any> = {}): any => ({
            _id: 'o1',
            id: ProductType.CANVAS,
            currencyType: CurrencyType.EUR,
            price: 69,
            ...fields,
        });
        const usdOrder = (fields: Record<string, any> = {}): any => ({
            _id: 'o2',
            id: ProductType.DIGITAL,
            currencyType: CurrencyType.USD,
            price: 6,
            ...fields,
        });

        it('accepts a paid EUR session at the server price', () => {
            const { service } = createService();
            expect(service.checkPaidCheckoutSession(session(), eurOrder())).toBeNull();
            expect(
                service.checkPaidCheckoutSession(
                    session({ amount_total: 1400 }),
                    eurOrder({ id: ProductType.DIGITAL, price: 14 })
                )
            ).toBeNull();
        });

        it('accepts usd for a USD order and refuses the other currency', () => {
            const { service } = createService();
            // A $6 session created before the deploy completes afterwards: its stored price is the price.
            expect(
                service.checkPaidCheckoutSession(session({ currency: 'usd', amount_total: 600 }), usdOrder())
            ).toBeNull();
            expect(
                service.checkPaidCheckoutSession(session({ currency: 'eur', amount_total: 600 }), usdOrder())
            ).toMatch(/currency eur, order expects usd/);
            expect(service.checkPaidCheckoutSession(session({ currency: 'usd' }), eurOrder())).toMatch(
                /currency usd, order expects eur/
            );
            expect(service.checkPaidCheckoutSession(session({ currency: 'gbp' }), eurOrder())).toMatch(/currency gbp/);
        });

        it('completes a USD order with a stored $6 price when 600 is paid, at any date', () => {
            const { service } = createService();
            for (const createdAt of [LONG_AGO, FAR_LATER]) {
                expect(
                    service.checkPaidCheckoutSession(
                        session({ currency: 'usd', amount_total: 600 }),
                        usdOrder({ createdAt })
                    )
                ).toBeNull();
            }
            // No stored price: the $16 table.
            expect(
                service.checkPaidCheckoutSession(
                    session({ currency: 'usd', amount_total: 600 }),
                    usdOrder({ price: 0 })
                )
            ).toMatch(/price is 1600/);
        });

        it('honours the stored order price and refuses an underpayment', () => {
            const { service } = createService();
            expect(service.checkPaidCheckoutSession(session({ amount_total: 100 }), eurOrder())).toMatch(
                /price is 6900/
            );
            // Stored price above the table: the stored price is what must be paid.
            expect(service.checkPaidCheckoutSession(session({ amount_total: 6900 }), eurOrder({ price: 70 }))).toMatch(
                /price is 7000/
            );
            // No stored price: the euro table.
            expect(
                service.checkPaidCheckoutSession(
                    session({ amount_total: 1399 }),
                    eurOrder({ id: ProductType.DIGITAL, price: 0 })
                )
            ).toMatch(/price is 1400/);
            expect(service.checkPaidCheckoutSession(session({ payment_status: 'unpaid' }), eurOrder())).toMatch(
                /not paid/
            );
        });

        it('uses the source currency and amount when Adaptive Pricing converted the session', () => {
            const { service } = createService();
            const converted = session({
                currency: 'usd',
                amount_total: 8000,
                currency_conversion: {
                    source_currency: 'eur',
                    amount_total: 6900,
                    amount_subtotal: 6900,
                    fx_rate: '1.16',
                },
            });
            expect(service.checkPaidCheckoutSession(converted, eurOrder())).toBeNull();
            const underpaid = session({
                currency: 'usd',
                amount_total: 8000,
                currency_conversion: {
                    source_currency: 'eur',
                    amount_total: 100,
                    amount_subtotal: 100,
                    fx_rate: '1.16',
                },
            });
            expect(service.checkPaidCheckoutSession(underpaid, eurOrder())).toMatch(/price is 6900/);
        });

        it('rejects an unknown product', () => {
            const { service } = createService();
            expect(service.checkPaidCheckoutSession(session(), eurOrder({ id: 'poster' }))).toMatch(/unknown product/);
        });
    });

    describe('completePendingOrder', () => {
        it('only moves a PENDING order to COMPLETE', async () => {
            const { service, orderModel } = createService();
            const lean = jest.fn().mockResolvedValue(null);
            orderModel.findOneAndUpdate.mockReturnValue({ lean });

            await expect(service.completePendingOrder('o1')).resolves.toBeNull();
            expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 'o1', status: OrderStatus.PENDING },
                { $set: { status: OrderStatus.COMPLETE } },
                { new: true }
            );
        });
    });
});

import { BadRequestException } from '@nestjs/common';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { OrderStatus, PackType, ProductType } from 'src/web3/order.schema';
import { PACK_PRICES_CENTS, PORTRAIT_PRICES_CENTS } from './price-table';
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

describe('price table', () => {
    it('matches the catalogue: portraits $6/$49/$69, packs $5/$25/$350 (backend Legendary price)', () => {
        expect(PORTRAIT_PRICES_CENTS).toEqual({ digital: 600, print: 4900, canvas: 6900 });
        expect(PACK_PRICES_CENTS).toEqual({ STARTER: 500, INFLUENCER: 2500, LEGENDARY: 35000 });
    });
});

describe('StripePaymentService', () => {
    describe('createPaymentIntent', () => {
        it('charges the server price for a pack, not a client amount', async () => {
            const { service, stripe } = createService();
            await service.createPaymentIntent({
                entityType: EntityType.PACK,
                packType: PackType.LEGENDARY,
                userId: USER_ID,
            });

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
            expect(params.amount).toBe(600);
            expect(params.metadata).toMatchObject({ imageId: IMAGE_ID, id: IMAGE_ID, expectedAmount: '600' });
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
        const order: any = { _id: 'o1', id: ProductType.CANVAS };
        const session = (overrides: Record<string, any> = {}): any => ({
            id: 'cs_1',
            payment_status: 'paid',
            currency: 'usd',
            amount_total: 6900,
            ...overrides,
        });

        it('accepts a paid session at the server price', () => {
            const { service } = createService();
            expect(service.checkPaidCheckoutSession(session(), order)).toBeNull();
        });

        it('rejects an underpaid, unpaid or non-USD session', () => {
            const { service } = createService();
            expect(service.checkPaidCheckoutSession(session({ amount_total: 100 }), order)).toMatch(/price is 6900/);
            expect(service.checkPaidCheckoutSession(session({ payment_status: 'unpaid' }), order)).toMatch(/not paid/);
            expect(service.checkPaidCheckoutSession(session({ currency: 'eur' }), order)).toMatch(/currency/);
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

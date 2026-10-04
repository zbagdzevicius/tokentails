import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Tier } from 'src/cat/cat.schema';
import { getShelterCatPriceCents, SHELTER_CAT_MIN_PRICE_CENTS } from 'src/payments/price-table';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { getOrderCatalogueCents } from './order-catalogue';
import { OrderStatus } from './order.schema';
import { CAT_GRANT_FAILED_MESSAGE, PurchaseGrantService } from './purchase-grant.service';
import { ChainType } from './web3.model';
import { Web3Controller } from './web3.controller';

jest.mock('stripe', () => {
    const client = { paymentIntents: { create: jest.fn(), retrieve: jest.fn() }, refunds: { create: jest.fn() } };
    return { __esModule: true, default: jest.fn(() => client), client };
});
jest.mock('src/cat/cat.service', () => ({
    CatService: class {},
    ALREADY_OWNED_MESSAGE: 'User already owns this NFT cat',
}));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('src/image/image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/blessing/blessing.repository', () => ({ BlessingRepository: class {} }));
jest.mock('src/web3/web3.service', () => ({ Web3Service: class {} }));

/*
 * Shelter cats bought one by one (founder, 2026-10-04): $5 and never less, the basic tier only, granted
 * through the same adoption path as packs, by Stripe as well as the crypto checkout.
 */

const stripe = jest.requireMock('stripe').client;
const USER = '64b7f0c2a1b2c3d4e5f60719';
const CAT = '68a1f0c2a1b2c3d4e5f60719';

describe('shelter cat price', () => {
    afterEach(() => delete process.env.SHELTER_CAT_PRICE_CENTS);

    it('is a fixed $5 with no env override, so the client copy always matches', () => {
        expect(SHELTER_CAT_MIN_PRICE_CENTS).toBe(500);
        expect(getShelterCatPriceCents()).toBe(500);
        process.env.SHELTER_CAT_PRICE_CENTS = '700';
        expect(getShelterCatPriceCents()).toBe(500);
    });

    it('is the catalogue price of a CAT order, so the order audit checks it', () => {
        expect(getOrderCatalogueCents({ entityType: EntityType.CAT, id: CAT })).toBe(500);
        expect(getOrderCatalogueCents({ entityType: EntityType.CAT })).toBeNull();
    });
});

function setup({
    adopt = { success: true, cat: { _id: 'copy1' } } as any,
    check = { ok: true, cat: { catId: CAT } } as any,
    cryptoCheckout = undefined as any,
} = {}) {
    const orderId = new Types.ObjectId();
    const orderRepository = {
        model: {
            findOneAndUpdate: jest.fn(async () => ({
                value: { _id: orderId },
                lastErrorObject: { updatedExisting: false },
            })),
            findOne: jest.fn(() => ({ lean: async () => ({ status: OrderStatus.PENDING }) })),
        },
        update: jest.fn(),
        create: jest.fn(),
        findOne: jest.fn(),
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn() };
    const catService = { adopt: jest.fn().mockResolvedValue(adopt), pickPackCat: jest.fn() };
    const svc = new StripePaymentService(orderRepository as any, userRepository as any);
    (svc as any).stripeClient = stripe;
    const catSale = { check: jest.fn().mockResolvedValue(check) };
    const ctrl = new (Web3Controller as any)(
        orderRepository,
        catService,
        userRepository,
        {},
        {},
        {},
        svc,
        undefined,
        catSale,
        cryptoCheckout
    ) as Web3Controller;
    return { ctrl, orderId, orderRepository, userRepository, catService, catSale };
}

const catIntent = (amount: number, extra: Record<string, string> = {}) => ({
    id: 'pi_cat',
    status: 'succeeded',
    currency: 'usd',
    amount,
    amount_received: amount,
    metadata: {
        entityType: EntityType.CAT,
        id: CAT,
        catId: CAT,
        userId: USER,
        expectedAmount: String(amount),
        ...extra,
    },
});

describe('Stripe: a shelter cat', () => {
    beforeEach(() => jest.clearAllMocks());

    it('create-payment checks the cat is for sale and charges $5 with no discount', async () => {
        const { ctrl, catSale } = setup();
        stripe.paymentIntents.create.mockResolvedValue({ client_secret: 's' });
        await ctrl.createPayment({ id: CAT, entityType: EntityType.CAT, amount: 1, discount: 'friend' } as any, USER);
        expect(catSale.check).toHaveBeenCalledWith(CAT, USER);
        const args = stripe.paymentIntents.create.mock.calls[0][0];
        expect(args.amount).toBe(500);
        expect(args.metadata).toEqual(expect.objectContaining({ entityType: 'CAT', catId: CAT, discount: '' }));
    });

    it('create-payment refuses a cat that is not for sale (400) or already owned (409)', async () => {
        await expect(
            setup({ check: { ok: false, reason: 'NOT_FOR_SALE' } }).ctrl.createPayment(
                { id: CAT, entityType: EntityType.CAT } as any,
                USER
            )
        ).rejects.toThrow('Cat is not for sale');
        await expect(
            setup({ check: { ok: false, reason: 'ALREADY_OWNED' } }).ctrl.createPayment(
                { id: CAT, entityType: EntityType.CAT } as any,
                USER
            )
        ).rejects.toBeInstanceOf(ConflictException);
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('confirm-payment grants one basic-tier copy with origin adopt, once', async () => {
        const { ctrl, catService, orderRepository, userRepository } = setup();
        stripe.paymentIntents.retrieve.mockResolvedValue(catIntent(500));
        const res = await ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER);
        expect(res.success).toBe(true);
        expect(catService.adopt).toHaveBeenCalledWith(CAT, USER, Tier.COMMON, undefined, 'adopt');
        expect(catService.pickPackCat).not.toHaveBeenCalled();
        expect(orderRepository.update).toHaveBeenCalledWith(expect.anything(), {
            $set: { status: OrderStatus.COMPLETE, cat: 'copy1' },
        });
        expect(userRepository.update).toHaveBeenCalledWith(USER, { $inc: { spent: 5, monthSpent: 5, spentUsd: 5 } });
        // A cat is not a pack: monthPacks does not move.
        expect(userRepository.update).not.toHaveBeenCalledWith(expect.anything(), {
            $inc: expect.objectContaining({ monthPacks: 1 }),
        });

        orderRepository.model.findOneAndUpdate.mockResolvedValueOnce({
            value: { _id: 'o' },
            lastErrorObject: { updatedExisting: true },
        } as any);
        const replay = await ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER);
        expect(replay).toEqual({ success: false, message: 'This payment was already processed.' });
        expect(catService.adopt).toHaveBeenCalledTimes(1);
    });

    it("confirm-payment records the shelter's share of a card sale the same way as a crypto one", async () => {
        const shelter = { _id: '67b48fafd6c26c6cd40bfec6', name: 'Rožinė pėdutė', slug: 'rozine-pedute' };
        const cryptoCheckout = { recordCardShelterShare: jest.fn(async () => ({ state: 'due' })) };
        const { ctrl, catSale } = setup({
            check: { ok: true, cat: { catId: CAT, name: 'Mochi', shelter } },
            cryptoCheckout,
        });
        stripe.paymentIntents.retrieve.mockResolvedValue(catIntent(500));
        const res = await ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER);
        expect(res.success).toBe(true);
        expect(catSale.check).toHaveBeenLastCalledWith(CAT);
        expect(cryptoCheckout.recordCardShelterShare).toHaveBeenCalledWith({
            userId: USER,
            intentId: 'pi_cat',
            catId: CAT,
            grantedCatId: 'copy1',
            name: 'Mochi',
            shelter,
            priceUsdCents: 500,
        });

        // A failed record never fails the purchase; a failed grant records no share.
        cryptoCheckout.recordCardShelterShare.mockRejectedValueOnce(new Error('db down'));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const other = setup({ check: { ok: true, cat: { catId: CAT, name: 'Mochi', shelter } }, cryptoCheckout });
        expect((await other.ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER)).success).toBe(
            true
        );
        const failed = setup({ adopt: { success: false, message: 'no' }, cryptoCheckout });
        stripe.refunds.create.mockResolvedValue({ id: 're_2' });
        cryptoCheckout.recordCardShelterShare.mockClear();
        await failed.ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER);
        expect(cryptoCheckout.recordCardShelterShare).not.toHaveBeenCalled();
    });

    it('confirm-payment refuses an intent below $5', async () => {
        const { ctrl, catService } = setup();
        stripe.paymentIntents.retrieve.mockResolvedValue(catIntent(400));
        await expect(ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER)).rejects.toThrow();
        expect(catService.adopt).not.toHaveBeenCalled();
    });

    it('a failed adoption is FAILED_GRANT and refunded through Stripe', async () => {
        const { ctrl, orderRepository } = setup({
            adopt: { success: false, message: 'User already owns this NFT cat' },
        });
        stripe.paymentIntents.retrieve.mockResolvedValue(catIntent(500));
        stripe.refunds.create.mockResolvedValue({ id: 're_1' });
        const res: any = await ctrl.confirmPayment({ paymentIntent: 'pi_cat', clientSecret: 's' }, USER);
        expect(res).toEqual(expect.objectContaining({ success: false, refund: 'refunded' }));
        expect(res.message).toContain(CAT_GRANT_FAILED_MESSAGE);
        expect(orderRepository.update).toHaveBeenCalledWith(expect.anything(), {
            $set: expect.objectContaining({ status: OrderStatus.FAILED_GRANT }),
        });
    });
});

describe('PurchaseGrantService.grantShelterCat', () => {
    it('refunds a crypto order by hand (due), never through Stripe', async () => {
        const orderRepository = {
            model: { findOneAndUpdate: jest.fn(async () => ({ _id: 'o' })) },
            update: jest.fn(),
        };
        const grants = new PurchaseGrantService(
            orderRepository as any,
            { adopt: jest.fn(async () => ({ success: false, message: 'Entities can not be found' })) } as any,
            { update: jest.fn() } as any,
            { stripe: { refunds: { create: jest.fn() } } } as any
        );
        const res = await grants.grantShelterCat({
            user: USER,
            order: { _id: new Types.ObjectId(), chainType: ChainType.EVM, hash: `evm:8453:0x${'a'.repeat(64)}` },
            catId: CAT,
            amountUsd: 5,
        });
        expect(res).toEqual(expect.objectContaining({ success: false, refund: 'due' }));
    });
});

import { Types } from 'mongoose';
import { PACK_POOL_EMPTY_MESSAGE } from 'src/cat/cat.service';
import { Tier } from 'src/cat/cat.schema';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { OrderStatus, PackType } from './order.schema';
import { leaderboardSpentUsd, spendIncrement, spendRefundPipeline } from './spend';
import { ChainType } from './web3.model';
import { PACK_GRANT_FAILED_MESSAGE, Web3Controller } from './web3.controller';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/cat/cat.service', () => ({
    CatService: class {},
    PACK_POOL_EMPTY_MESSAGE: 'You already have every cat this pack can bring home. Your payment will be refunded.',
}));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('src/image/image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/blessing/blessing.repository', () => ({ BlessingRepository: class {} }));
jest.mock('src/web3/web3.service', () => ({ Web3Service: class {} }));

/*
 * Pack grants and spend (plan G3 "Explicit fixes", G4 "Spend", decision #21):
 * - COMPLETE only when the adoption succeeded, FAILED_GRANT otherwise, counters only on success;
 * - an empty pool refunds the order (Stripe automatically, Stellar marked due), once;
 * - spend comes from the verified USD amount only: no +1 on grants.
 */

const USER = '64b7f0c2a1b2c3d4e5f60719';
const HASH = 'ab'.repeat(32);

function setup({
    priceUsd = 5,
    pick = 'c1' as string | null,
    adopt = { success: true, cat: { _id: 'c1' } } as any,
} = {}) {
    const orderId = new Types.ObjectId();
    let refundClaimed = false;
    const orderRepository = {
        create: jest.fn().mockResolvedValue({ _id: orderId }),
        update: jest.fn(),
        model: {
            findOne: jest.fn(() => ({ lean: async () => ({ _id: orderId, status: OrderStatus.PENDING }) })),
            // The `refund: {$exists: false}` guard: only the first claim matches.
            findOneAndUpdate: jest.fn(async () => {
                if (refundClaimed) return null;
                refundClaimed = true;
                return { _id: orderId };
            }),
        },
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue({ _id: 'owner' }), update: jest.fn() };
    const catService = { adopt: jest.fn().mockResolvedValue(adopt), pickPackCat: jest.fn().mockResolvedValue(pick) };
    const web3Service = { validatePrice: jest.fn().mockResolvedValue({ success: true, amount: priceUsd, priceUsd }) };
    const refunds = { create: jest.fn().mockResolvedValue({ id: 're_1' }) };
    const stripePayments = { stripe: { refunds } };
    const ctrl: Web3Controller = new (Web3Controller as any)(
        orderRepository,
        catService,
        userRepository,
        {},
        {},
        web3Service,
        stripePayments
    );
    return { ctrl, orderId, orderRepository, userRepository, catService, refunds };
}

const stellarPack = (fields: Record<string, unknown> = {}) => ({
    chainType: ChainType.STELLAR,
    hash: HASH,
    walletAddress: 'GWALLET',
    currencyType: CurrencyType.USDC,
    price: 5,
    entityType: EntityType.PACK,
    id: PackType.STARTER,
    ...fields,
});

/** The signed change of one write: an `$inc`, or the refund pipeline's floored `$subtract`. */
const incrementOf = (update: any): Record<string, number> => {
    if (!Array.isArray(update)) {
        return update.$inc || {};
    }
    const inc: Record<string, number> = {};
    for (const stage of update) {
        for (const [field, expression] of Object.entries<any>(stage.$set || {})) {
            inc[field] = -expression.$max[1].$subtract[1];
        }
    }
    return inc;
};

/** Every spend change written to the buyer, merged. */
const buyerIncrements = (userRepository: { update: jest.Mock }) =>
    userRepository.update.mock.calls
        .filter(([id]) => String(id) === USER)
        .map(([, update]) => incrementOf(update))
        .reduce((sum: Record<string, number>, inc: Record<string, number>) => {
            Object.entries(inc).forEach(([key, value]) => (sum[key] = (sum[key] || 0) + value));
            return sum;
        }, {});

describe('spendRefundPipeline', () => {
    it('takes the spend back floored at 0, so a lowered monthSpent never goes negative', () => {
        const [stage] = spendRefundPipeline(5) as any[];
        const apply = (doc: Record<string, number | undefined>) =>
            Object.fromEntries(
                Object.entries<any>(stage.$set).map(([field, expression]) => {
                    const [floor, { $subtract }] = expression.$max;
                    return [field, Math.max(floor, (doc[field] ?? 0) - $subtract[1])];
                })
            );
        expect(apply({ spent: 12, monthSpent: 5, spentUsd: 7 })).toEqual({ spent: 7, monthSpent: 0, spentUsd: 2 });
        // monthSpent reset (or fixed by hand) between payment and refund, spentUsd never written.
        expect(apply({ spent: 5, monthSpent: 0 })).toEqual({ spent: 0, monthSpent: 0, spentUsd: 0 });
        expect(Object.keys(stage.$set).sort()).toEqual(['monthSpent', 'spent', 'spentUsd']);
    });
});

describe('spendIncrement', () => {
    it('writes the same verified USD amount to spent, monthSpent and spentUsd', () => {
        expect(spendIncrement(12.5)).toEqual({ spent: 12.5, monthSpent: 12.5, spentUsd: 12.5 });
    });

    it('adds verified and legacy spend only for the leaderboard', () => {
        expect(leaderboardSpentUsd({ spentUsd: 3, spentUsdLegacy: 15.255 })).toBe(18.26);
        expect(leaderboardSpentUsd({ spentUsdLegacy: 1 })).toBe(1);
        expect(leaderboardSpentUsd({})).toBe(0);
    });

    it.each([[NaN], [-3], [Infinity], [0]])('never writes a negative or non-finite amount (%p)', amount => {
        expect(spendIncrement(amount)).toEqual({ spent: 0, monthSpent: 0, spentUsd: 0 });
    });
});

// Stellar packs are deprecated (2026-10-04); these cover the grant path behind the rollback switch.
describe('Stellar pack purchase (POST /web3/confirm)', () => {
    beforeAll(() => {
        process.env.STELLAR_PACKS_ENABLED = 'true';
    });
    afterAll(() => {
        delete process.env.STELLAR_PACKS_ENABLED;
    });

    it('increments spentUsd by priceUsd and spent by nothing extra', async () => {
        const { ctrl, userRepository } = setup({ priceUsd: 7.25 });

        const response = await ctrl.checkTransaction(USER, stellarPack() as any);

        expect(response.success).toBe(true);
        expect(buyerIncrements(userRepository)).toEqual({
            spent: 7.25,
            monthSpent: 7.25,
            spentUsd: 7.25,
            monthCatsAdopted: 1,
            monthPacks: 1,
        });
    });

    it('marks the order COMPLETE with the granted cat, with pack origin', async () => {
        const { ctrl, orderRepository, catService, orderId } = setup();

        await ctrl.checkTransaction(USER, stellarPack({ id: PackType.LEGENDARY }) as any);

        expect(catService.pickPackCat).toHaveBeenCalledWith(USER, PackType.LEGENDARY);
        expect(catService.adopt).toHaveBeenCalledWith('c1', USER, expect.any(String), PackType.LEGENDARY, 'pack');
        expect(Object.values(Tier)).toContain(catService.adopt.mock.calls[0][2]);
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { status: OrderStatus.COMPLETE, cat: 'c1' },
        });
    });

    it('retries a failed adoption once with another cat, excluding the one that failed', async () => {
        const { ctrl, orderRepository, catService, refunds, orderId } = setup();
        catService.pickPackCat.mockResolvedValueOnce('c1').mockResolvedValueOnce('c2');
        catService.adopt
            .mockResolvedValueOnce({ success: false, message: 'User already owns this NFT cat' })
            .mockResolvedValueOnce({ success: true, cat: { _id: 'c2' } });

        const response = await ctrl.checkTransaction(USER, stellarPack() as any);

        expect(response).toMatchObject({ success: true, cat: { _id: 'c2' } });
        expect(catService.pickPackCat).toHaveBeenLastCalledWith(USER, PackType.STARTER, ['c1']);
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { status: OrderStatus.COMPLETE, cat: 'c2' },
        });
        expect(orderRepository.update).not.toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ $set: expect.objectContaining({ status: OrderStatus.FAILED_GRANT }) })
        );
        expect(orderRepository.model.findOneAndUpdate).not.toHaveBeenCalled();
        expect(refunds.create).not.toHaveBeenCalled();
    });

    it('sets FAILED_GRANT and refunds when the retry fails too, with no counter and no affiliate share', async () => {
        const { ctrl, orderRepository, userRepository, catService, orderId } = setup({
            adopt: { success: false, message: 'User already owns this NFT cat' },
        });

        const response = await ctrl.checkTransaction(USER, stellarPack({ discount: 'friend' }) as any);

        expect(response).toEqual({ success: false, message: PACK_GRANT_FAILED_MESSAGE, refund: 'due' });
        expect(catService.adopt).toHaveBeenCalledTimes(2);
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { status: OrderStatus.FAILED_GRANT, failureReason: 'ADOPT_FAILED: User already owns this NFT cat' },
        });
        expect(orderRepository.update).not.toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ $set: expect.objectContaining({ status: OrderStatus.COMPLETE }) })
        );
        expect(orderRepository.model.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: orderId, refund: { $exists: false } },
            { $set: { refund: expect.objectContaining({ state: 'due', reason: 'ADOPT_FAILED', amountUsd: 5 }) } },
            { new: true }
        );
        const increments = buyerIncrements(userRepository);
        expect(increments.monthCatsAdopted).toBeUndefined();
        expect(increments.monthPacks).toBeUndefined();
        // The verified spend is written once and taken back once.
        expect(increments).toMatchObject({ spent: 0, monthSpent: 0, spentUsd: 0 });
        expect(userRepository.findOne).not.toHaveBeenCalled(); // no affiliate lookup
    });

    it('refunds when the retry finds no other cat', async () => {
        const { ctrl, catService, orderRepository } = setup({
            adopt: { success: false, message: 'Something went wrong, please try again later' },
        });
        catService.pickPackCat.mockResolvedValueOnce('c1').mockResolvedValueOnce(null);

        const response = await ctrl.checkTransaction(USER, stellarPack() as any);

        expect(response).toEqual({ success: false, message: PACK_GRANT_FAILED_MESSAGE, refund: 'due' });
        expect(catService.adopt).toHaveBeenCalledTimes(1);
        expect(orderRepository.model.findOneAndUpdate).toHaveBeenCalledWith(
            expect.anything(),
            { $set: { refund: expect.objectContaining({ reason: 'ADOPT_FAILED' }) } },
            { new: true }
        );
    });

    it('refunds an empty pool: FAILED_GRANT, refund due, spend taken back, no adoption', async () => {
        const { ctrl, orderRepository, userRepository, catService, refunds, orderId } = setup({ pick: null });

        const response = await ctrl.checkTransaction(USER, stellarPack({ discount: 'friend' }) as any);

        expect(response).toEqual({ success: false, message: PACK_POOL_EMPTY_MESSAGE, refund: 'due' });
        expect(catService.adopt).not.toHaveBeenCalled();
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { status: OrderStatus.FAILED_GRANT, failureReason: 'EMPTY_POOL: Pack pool empty for this buyer' },
        });
        expect(orderRepository.model.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: orderId, refund: { $exists: false } },
            { $set: { refund: expect.objectContaining({ state: 'due', reason: 'EMPTY_POOL', amountUsd: 5 }) } },
            { new: true }
        );
        // A Stellar payment is sent back by hand (manual step), never by this route.
        expect(refunds.create).not.toHaveBeenCalled();
        expect(buyerIncrements(userRepository)).toEqual({ spent: 0, monthSpent: 0, spentUsd: 0 });
        expect(userRepository.findOne).not.toHaveBeenCalled();
    });

    it.each([
        ['the pick', 'pickPackCat'],
        ['the adoption', 'adopt'],
    ])('refunds when %s throws: FAILED_GRANT, refund due, spend taken back (3c review)', async (_label, method) => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const { ctrl, orderRepository, userRepository, catService, orderId } = setup();
        (catService as any)[method].mockRejectedValue(new Error('connection reset'));

        const response = await ctrl.checkTransaction(USER, stellarPack({ discount: 'friend' }) as any);

        expect(response).toEqual({ success: false, message: PACK_GRANT_FAILED_MESSAGE, refund: 'due' });
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { status: OrderStatus.FAILED_GRANT, failureReason: 'ADOPT_FAILED: connection reset' },
        });
        expect(buyerIncrements(userRepository)).toEqual({ spent: 0, monthSpent: 0, spentUsd: 0 });
        expect(userRepository.findOne).not.toHaveBeenCalled(); // no affiliate share
    });

    it('never fails or refunds an order that was already COMPLETE when the error happened', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const { ctrl, orderRepository, userRepository, orderId } = setup();
        orderRepository.model.findOne.mockImplementation(() => ({
            lean: async () => ({ _id: orderId, status: OrderStatus.COMPLETE }),
        }));
        // The stats update after COMPLETE fails.
        userRepository.update.mockImplementation(async (_id: unknown, update: any) => {
            if (update?.$inc?.monthPacks) throw new Error('write conflict');
        });

        const response = await ctrl.checkTransaction(USER, stellarPack() as any);

        expect(response.success).toBe(true);
        expect(orderRepository.model.findOneAndUpdate).not.toHaveBeenCalled();
        expect(orderRepository.update).not.toHaveBeenCalledWith(
            orderId,
            expect.objectContaining({ $set: expect.objectContaining({ status: OrderStatus.FAILED_GRANT }) })
        );
    });

    it('takes the spend back only once per order', async () => {
        const { ctrl, userRepository, orderId } = setup({ pick: null });
        const order = { _id: orderId, chainType: ChainType.STELLAR, hash: HASH };

        await expect(ctrl.refundOrder(order, USER, 'EMPTY_POOL', 5)).resolves.toBe('due');
        await expect(ctrl.refundOrder(order, USER, 'EMPTY_POOL', 5)).resolves.toBeUndefined();
        expect(userRepository.update).toHaveBeenCalledTimes(1);
    });
});

describe('Stripe refunds for an empty pool', () => {
    it('refunds the PaymentIntent with an idempotency key and records it', async () => {
        const { ctrl, refunds, orderRepository, orderId } = setup({ pick: null });

        const state = await ctrl.refundOrder(
            { _id: orderId, chainType: ChainType.FIAT, hash: 'pi_123' },
            USER,
            'EMPTY_POOL',
            35
        );

        expect(state).toBe('refunded');
        expect(refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: 'pi_123' }), {
            idempotencyKey: `tt-refund-${orderId}`,
        });
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { 'refund.state': 'refunded', 'refund.refundedAt': expect.any(Date), 'refund.refundId': 're_1' },
        });
    });

    it('leaves the refund due when Stripe refuses', async () => {
        const { ctrl, refunds, orderRepository, orderId } = setup({ pick: null });
        refunds.create.mockRejectedValueOnce(new Error('charge_already_refunded'));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const state = await ctrl.refundOrder(
            { _id: orderId, chainType: ChainType.FIAT, hash: 'pi_123' },
            USER,
            'EMPTY_POOL',
            35
        );

        expect(state).toBe('due');
        expect(orderRepository.update).toHaveBeenCalledWith(orderId, {
            $set: { 'refund.error': 'charge_already_refunded' },
        });
    });
});

describe('admin GET /web3/pack/:packType/:id', () => {
    it('refuses to grant from an empty pool instead of crashing on blessing[0]', async () => {
        const { ctrl, catService } = setup({ pick: null });

        await expect(ctrl.pack(PackType.STARTER, USER)).rejects.toThrow(PACK_POOL_EMPTY_MESSAGE);
        expect(catService.adopt).not.toHaveBeenCalled();
    });
});

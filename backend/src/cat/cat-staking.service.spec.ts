import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { Tier } from './cat.schema';
import { CatController } from './cat.controller';
import { CatStakingService, getTailsCraft, STAKE_PERIOD_MS } from './cat-staking.service';
import { CAT_NAP_MAX_CATS, CAT_NAP_TAILS, catNapPaidMessage } from 'src/shared-contracts/copy';

jest.mock('./cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * W1 security hotfix, G5 P1. The old claim read the cat, never wrote it, and `$unset` `staked` on
 * the USER, so the same finished stake paid again on every call, for any cat id.
 */

interface StoredCat {
    _id: Types.ObjectId;
    owner?: Types.ObjectId;
    staked?: Date | null;
    blessing?: Types.ObjectId;
    tier?: Tier;
}

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/** Matches the filters this service sends, the way MongoDB evaluates them on one document. */
function matches(cat: StoredCat, filter: Record<string, any>) {
    if (filter._id && !sameId(cat._id, filter._id)) return false;
    if ('owner' in filter && !sameId(cat.owner, filter.owner)) return false;
    if ('staked' in filter) {
        const condition = filter.staked;
        const value = cat.staked;
        if (condition === null) return value === undefined || value === null;
        if (condition.$exists === true && value === undefined) return false;
        if ('$ne' in condition && value === condition.$ne) return false;
        if (condition.$lte && !(value instanceof Date && value.getTime() <= condition.$lte.getTime())) return false;
    }
    return true;
}

// In-memory cats collection. findOneAndUpdate applies filter and update in one step, after a yield,
// so concurrent callers interleave the way parallel requests do.
function createStore(cats: StoredCat[]) {
    const model = {
        findOneAndUpdate: jest.fn((filter: any, update: any) => ({
            lean: async () => {
                await Promise.resolve();
                const cat = cats.find(c => matches(c, filter));
                if (!cat) return null;
                const before = { ...cat };
                Object.assign(cat, update.$set || {});
                Object.keys(update.$unset || {}).forEach(key => delete (cat as any)[key]);
                return before;
            },
        })),
        findOne: jest.fn((filter: any) => ({
            lean: async () => {
                const cat = cats.find(c => matches(c, filter));
                return cat ? { ...cat } : null;
            },
        })),
        // The cat nap cap count and the take-back of an over-cap stake (G5 P2).
        countDocuments: jest.fn(async (filter: any) => {
            await Promise.resolve();
            return cats.filter(c => matches(c, filter)).length;
        }),
        updateOne: jest.fn(async (filter: any, update: any) => {
            await Promise.resolve();
            const cat = cats.find(
                c =>
                    matches(c, { _id: filter._id, owner: filter.owner }) &&
                    c.staked instanceof Date &&
                    c.staked.getTime() === filter.staked.getTime()
            );
            if (!cat) return { modifiedCount: 0 };
            Object.keys(update.$unset || {}).forEach(key => delete (cat as any)[key]);
            return { modifiedCount: 1 };
        }),
    };
    return { catRepository: { model }, cats };
}

function createService(cats: StoredCat[]) {
    const store = createStore(cats);
    const userRepository = { update: jest.fn(async () => ({})) };
    const service = new CatStakingService(store.catRepository as any, userRepository as any);
    return { service, userRepository, ...store };
}

const ownerId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const NOW = new Date('2026-09-30T12:00:00Z');
const past = new Date(NOW.getTime() - 1000);
const future = new Date(NOW.getTime() + 1000);

describe('W1-HF staking (G5 P1): owner-filtered atomic stake and claim', () => {
    it('five parallel claims of one finished stake credit exactly once', async () => {
        const catId = new Types.ObjectId();
        const { service, userRepository, cats } = createService([
            { _id: catId, owner: ownerId, staked: past, blessing: new Types.ObjectId(), tier: Tier.RARE },
        ]);

        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () => service.claim(catId.toString(), ownerId.toString(), NOW))
        );

        const paid = results.filter(r => r.status === 'fulfilled' && (r.value as any).success);
        expect(paid).toHaveLength(1);
        expect(userRepository.update).toHaveBeenCalledTimes(1);
        // The flat cat nap (G5 P2): 50 Tails whatever the tier, into the balance AND tailsEarned.
        expect(userRepository.update).toHaveBeenCalledWith(ownerId, {
            $inc: { tails: 50, tailsEarned: 50, monthTailsCrafted: 50, monthTails: 50 },
        });
        // The others see a cat that is no longer staked.
        results
            .filter(r => r.status === 'rejected')
            .forEach(r => expect((r as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException));
        expect(cats[0].staked).toBeUndefined();
    });

    it('returns the real reward in the response', async () => {
        const catId = new Types.ObjectId();
        const { service } = createService([
            { _id: catId, owner: ownerId, staked: past, blessing: new Types.ObjectId(), tier: Tier.LEGENDARY },
        ]);

        await expect(service.claim(catId.toString(), ownerId.toString(), NOW)).resolves.toEqual({
            success: true,
            message: catNapPaidMessage(CAT_NAP_TAILS),
            tails: CAT_NAP_TAILS,
        });
    });

    it("another user's cat gives 404 on claim and on stake, and nothing is written", async () => {
        const catId = new Types.ObjectId();
        const { service, userRepository, cats } = createService([{ _id: catId, owner: ownerId, staked: past }]);

        await expect(service.claim(catId.toString(), otherUserId.toString(), NOW)).rejects.toBeInstanceOf(
            NotFoundException
        );
        const fresh = new Types.ObjectId();
        cats.push({ _id: fresh, owner: ownerId });
        await expect(service.stake(fresh.toString(), otherUserId.toString(), NOW)).rejects.toBeInstanceOf(
            NotFoundException
        );

        expect(userRepository.update).not.toHaveBeenCalled();
        expect(cats[0].staked).toBe(past);
        expect(cats[1].staked).toBeUndefined();
    });

    it('a cat without an owner and an unknown cat give 404', async () => {
        const unowned = new Types.ObjectId();
        const { service } = createService([{ _id: unowned, staked: past }]);

        await expect(service.claim(unowned.toString(), ownerId.toString(), NOW)).rejects.toBeInstanceOf(
            NotFoundException
        );
        await expect(service.claim(new Types.ObjectId().toString(), ownerId.toString(), NOW)).rejects.toBeInstanceOf(
            NotFoundException
        );
    });

    it('an invalid id is 400, before any query', async () => {
        const { service, catRepository } = createService([]);
        await expect(service.claim('not-an-id', ownerId.toString(), NOW)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.stake('not-an-id', ownerId.toString(), NOW)).rejects.toBeInstanceOf(BadRequestException);
        expect(catRepository.model.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('a running stake pays nothing and keeps the stake', async () => {
        const catId = new Types.ObjectId();
        const { service, userRepository, cats } = createService([{ _id: catId, owner: ownerId, staked: future }]);

        await expect(service.claim(catId.toString(), ownerId.toString(), NOW)).resolves.toEqual({
            success: false,
            message: 'Your cat is still napping. Let it sleep a little longer.',
            tails: 0,
        });
        expect(userRepository.update).not.toHaveBeenCalled();
        expect(cats[0].staked).toBe(future);
    });

    it('an unstaked cat is 400 "Cat is not staked"', async () => {
        const catId = new Types.ObjectId();
        const { service } = createService([{ _id: catId, owner: ownerId }]);
        await expect(service.claim(catId.toString(), ownerId.toString(), NOW)).rejects.toThrow('Cat is not staked');
    });

    it('stake sets the week on the CAT, owner-filtered, and never touches the user', async () => {
        const catId = new Types.ObjectId();
        const { service, userRepository, cats, catRepository } = createService([{ _id: catId, owner: ownerId }]);

        const response = await service.stake(catId.toString(), ownerId.toString(), NOW);

        expect(response).toMatchObject({ success: true, stakedUntil: new Date(NOW.getTime() + STAKE_PERIOD_MS) });
        expect(cats[0].staked).toEqual(new Date(NOW.getTime() + STAKE_PERIOD_MS));
        const [filter] = catRepository.model.findOneAndUpdate.mock.calls[0];
        expect(sameId(filter.owner, ownerId)).toBe(true);
        expect(filter.staked).toBeNull();
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('five parallel stakes set the stake once; the rest are 409', async () => {
        const catId = new Types.ObjectId();
        const { service } = createService([{ _id: catId, owner: ownerId }]);

        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () => service.stake(catId.toString(), ownerId.toString(), NOW))
        );
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        results
            .filter(r => r.status === 'rejected')
            .forEach(r => expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException));
    });

    it('the user document never gets or loses `staked`', async () => {
        const catId = new Types.ObjectId();
        const { service, userRepository } = createService([{ _id: catId, owner: ownerId, staked: past }]);
        await service.claim(catId.toString(), ownerId.toString(), NOW);

        for (const [, update] of userRepository.update.mock.calls as any[]) {
            expect(JSON.stringify(update)).not.toContain('staked');
        }
    });

    it('the claim filter binds owner and a finished stake in one conditional write', async () => {
        const catId = new Types.ObjectId();
        const { service, catRepository } = createService([{ _id: catId, owner: ownerId, staked: past }]);
        await service.claim(catId.toString(), ownerId.toString(), NOW);

        const [filter, update] = catRepository.model.findOneAndUpdate.mock.calls[0];
        expect(sameId(filter._id, catId)).toBe(true);
        expect(sameId(filter.owner, ownerId)).toBe(true);
        expect(filter.staked).toEqual({ $exists: true, $ne: null, $lte: NOW });
        expect(update).toEqual({ $unset: { staked: 1 } });
    });

    it('pays the flat cat nap: 50 Tails for every cat, blessed or not, whatever the tier (decision #35)', () => {
        const blessing = new Types.ObjectId();
        expect(CAT_NAP_TAILS).toBe(50);
        expect(getTailsCraft({ blessing: undefined as any, tier: Tier.LEGENDARY })).toBe(50);
        for (const tier of Object.values(Tier)) {
            expect(getTailsCraft({ blessing, tier })).toBe(50);
        }
    });
});

describe('G5 P2 cat nap: at most 3 cats nap at once', () => {
    const napping = (owner: Types.ObjectId, n: number, staked = future): StoredCat[] =>
        Array.from({ length: n }, () => ({ _id: new Types.ObjectId(), owner, staked }));

    it('a 4th nap is 409 CAT_NAP_LIMIT and leaves the cat awake', async () => {
        expect(CAT_NAP_MAX_CATS).toBe(3);
        const fourth = new Types.ObjectId();
        const { service, cats } = createService([...napping(ownerId, 3), { _id: fourth, owner: ownerId }]);

        const error = await service.stake(fourth.toString(), ownerId.toString(), NOW).catch(e => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({ code: 'CAT_NAP_LIMIT' });
        expect(cats.find(c => sameId(c._id, fourth))!.staked).toBeUndefined();
    });

    it('a finished but uncollected nap still holds its slot', async () => {
        const fourth = new Types.ObjectId();
        const { service } = createService([...napping(ownerId, 3, past), { _id: fourth, owner: ownerId }]);
        await expect(service.stake(fourth.toString(), ownerId.toString(), NOW)).rejects.toBeInstanceOf(
            ConflictException
        );
    });

    it('the 3rd nap succeeds and reports the rule and the real reward', async () => {
        const third = new Types.ObjectId();
        const { service } = createService([...napping(ownerId, 2), { _id: third, owner: ownerId }]);

        await expect(service.stake(third.toString(), ownerId.toString(), NOW)).resolves.toMatchObject({
            success: true,
            tails: 50,
            napping: 3,
            rule: { tails: 50, maxCats: 3, days: 7 },
        });
    });

    it("another player's naps do not count", async () => {
        const mine = new Types.ObjectId();
        const { service } = createService([...napping(otherUserId, 3), { _id: mine, owner: ownerId }]);
        await expect(service.stake(mine.toString(), ownerId.toString(), NOW)).resolves.toMatchObject({ success: true });
    });

    it('ten parallel stakes of ten cats never leave more than 3 napping', async () => {
        const awake: StoredCat[] = Array.from({ length: 10 }, () => ({ _id: new Types.ObjectId(), owner: ownerId }));
        const { service, cats } = createService(awake);

        const results = await Promise.allSettled(
            awake.map(cat => service.stake(cat._id.toString(), ownerId.toString(), NOW))
        );

        const kept = cats.filter(c => c.staked).length;
        expect(kept).toBeLessThanOrEqual(3);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(kept);
    });

    it('collecting a nap frees its slot', async () => {
        const [first, ...rest] = napping(ownerId, 3, past);
        const next = new Types.ObjectId();
        const { service } = createService([first, ...rest, { _id: next, owner: ownerId }]);

        await service.claim(first._id.toString(), ownerId.toString(), NOW);
        await expect(service.stake(next.toString(), ownerId.toString(), NOW)).resolves.toMatchObject({ success: true });
    });
});

describe('CatController staking routes', () => {
    const proto = CatController.prototype as any;

    it('delegate to CatStakingService with the caller id', async () => {
        const staking = { stake: jest.fn(async () => ({ success: true })), claim: jest.fn(async () => ({})) };
        const controller = new CatController({} as any, {} as any, {} as any, staking as any);

        await controller.stake('cat-1', 'user-1');
        await controller.stakeReward('cat-1', 'user-1');

        expect(staking.stake).toHaveBeenCalledWith('cat-1', 'user-1');
        expect(staking.claim).toHaveBeenCalledWith('cat-1', 'user-1');
    });

    it('stay signed-in only, per-user throttled (G5 P4) and closed to guests', () => {
        for (const handler of [proto.stake, proto.stakeReward]) {
            expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AppAuthGuard, UserThrottlerGuard]);
            expect(Reflect.getMetadata('tt:allowGuest', handler)).toBeUndefined();
        }
    });
});

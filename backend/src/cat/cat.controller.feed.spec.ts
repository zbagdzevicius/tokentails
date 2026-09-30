import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MAX_CAT_STATUS } from 'src/cat/cat.schema';
import { REWARDS } from 'src/shared/constants/rewards';
import { CatController } from './cat.controller';

// The real CatService pulls in AI and image utilities; feeding does not use it.
jest.mock('./cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

interface StoredCat {
    _id: Types.ObjectId;
    owner?: Types.ObjectId;
    status?: { EAT: number } | null;
}

// In-memory stand-in for the Cat collection. findOneAndUpdate applies the filter and the update
// in one synchronous step, the way MongoDB applies them to a single document.
function createCatStore(cats: StoredCat[]) {
    const matches = (cat: StoredCat, filter: any) => {
        if (filter._id && cat._id.toString() !== filter._id.toString()) {
            return false;
        }
        if ('owner' in filter && cat.owner?.toString() !== filter.owner?.toString()) {
            return false;
        }
        const eatFilter = filter['status.EAT'];
        if (eatFilter) {
            const eat = cat.status?.EAT;
            const notFull = eat === undefined || eat === null || !(eat >= eatFilter.$not.$gte);
            if (!notFull) {
                return false;
            }
        }
        return true;
    };

    const model = {
        findOneAndUpdate: jest.fn((filter: any, update: any) => ({
            lean: async () => {
                // Yield first so concurrent callers interleave before the write.
                await Promise.resolve();
                const cat = cats.find(c => matches(c, filter));
                if (!cat) {
                    return null;
                }
                const original = { ...cat };
                Object.assign(cat, update.$set);
                return original;
            },
        })),
    };

    const repository = {
        model,
        findOne: jest.fn(async ({ searchObject }: any) => {
            const cat = cats.find(c => c._id.toString() === searchObject._id.toString());
            return cat ? { ...cat } : null;
        }),
        // Plain write by id, as the read-then-write implementation used it.
        update: jest.fn(async (id: any, update: any) => {
            await Promise.resolve();
            const cat = cats.find(c => c._id.toString() === id.toString());
            if (cat) {
                Object.assign(cat, update.$set || update);
            }
            return cat;
        }),
    };

    return { repository, cats };
}

function createController(cats: StoredCat[]) {
    const store = createCatStore(cats);
    const userRepository = {
        update: jest.fn(async () => ({})),
        findOne: jest.fn(async ({ searchObject }: any) => ({ _id: searchObject._id, wallets: {} })),
    };
    const controller = new CatController(store.repository as any, userRepository as any, {} as any);

    return { controller, userRepository, store };
}

describe('CatController PUT /cat/:id (feeding)', () => {
    const ownerId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    let catId: Types.ObjectId;

    beforeEach(() => {
        catId = new Types.ObjectId();
    });

    it('feeds an owned hungry cat, fills EAT and pays once', async () => {
        const { controller, userRepository, store } = createController([
            { _id: catId, owner: ownerId, status: { EAT: 0 } },
        ]);

        await expect(controller.updateStatus(ownerId.toString(), catId.toString())).resolves.toEqual({
            success: true,
        });

        expect(store.cats[0].status).toEqual({ EAT: MAX_CAT_STATUS });
        expect(userRepository.update).toHaveBeenCalledTimes(1);
        expect(userRepository.update).toHaveBeenCalledWith(ownerId.toString(), {
            $inc: { tails: REWARDS.FEED, monthFeeded: 1, monthTails: REWARDS.FEED },
        });
    });

    it('puts the ownership and cap checks in the write filter', async () => {
        const { controller, store } = createController([{ _id: catId, owner: ownerId, status: { EAT: 0 } }]);

        await controller.updateStatus(ownerId.toString(), catId.toString());

        const [filter] = store.repository.model.findOneAndUpdate.mock.calls[0];
        expect(filter._id.toString()).toBe(catId.toString());
        expect(filter.owner.toString()).toBe(ownerId.toString());
        expect(filter['status.EAT']).toEqual({ $not: { $gte: MAX_CAT_STATUS } });
    });

    it('rejects feeding someone else’s cat with 403 and pays nothing', async () => {
        const { controller, userRepository, store } = createController([
            { _id: catId, owner: ownerId, status: { EAT: 0 } },
        ]);

        await expect(controller.updateStatus(otherUserId.toString(), catId.toString())).rejects.toBeInstanceOf(
            ForbiddenException
        );

        expect(store.cats[0].status).toEqual({ EAT: 0 });
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('rejects feeding an unowned (catalogue) cat with 403', async () => {
        const { controller, userRepository } = createController([{ _id: catId, status: { EAT: 0 } }]);

        await expect(controller.updateStatus(ownerId.toString(), catId.toString())).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a full cat with 409 and pays nothing', async () => {
        const { controller, userRepository } = createController([
            { _id: catId, owner: ownerId, status: { EAT: MAX_CAT_STATUS } },
        ]);

        await expect(controller.updateStatus(ownerId.toString(), catId.toString())).rejects.toBeInstanceOf(
            ConflictException
        );
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 404 for a cat that does not exist', async () => {
        const { controller, userRepository } = createController([]);

        await expect(controller.updateStatus(ownerId.toString(), catId.toString())).rejects.toBeInstanceOf(
            NotFoundException
        );
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed cat id without querying', async () => {
        const { controller, userRepository, store } = createController([]);

        await expect(controller.updateStatus(ownerId.toString(), 'not-an-id')).rejects.toBeInstanceOf(
            BadRequestException
        );
        expect(store.repository.model.findOneAndUpdate).not.toHaveBeenCalled();
        expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('feeds a cat whose status is missing', async () => {
        const { controller, userRepository, store } = createController([{ _id: catId, owner: ownerId, status: null }]);

        await controller.updateStatus(ownerId.toString(), catId.toString());

        expect(store.cats[0].status).toEqual({ EAT: MAX_CAT_STATUS });
        expect(userRepository.update).toHaveBeenCalledTimes(1);
    });

    it('pays exactly once when the same cat is fed by concurrent requests', async () => {
        const { controller, userRepository } = createController([{ _id: catId, owner: ownerId, status: { EAT: 0 } }]);

        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () => controller.updateStatus(ownerId.toString(), catId.toString()))
        );

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        expect(rejected).toHaveLength(4);
        rejected.forEach(r => expect(r.reason).toBeInstanceOf(ConflictException));
        expect(userRepository.update).toHaveBeenCalledTimes(1);
    });
});

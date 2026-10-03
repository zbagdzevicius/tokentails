import { CAT_STATUS_RESET_JOB, CatController } from 'src/cat/cat.controller';
import { USER_JOBS, UserController } from 'src/user/user.controller';
import { acquireLease, claimJobPeriod, DUPLICATE_KEY, ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from './lease';

// The controllers' collaborators pull in Firebase, AI and wallet code; the crons need none of them.
jest.mock('src/user/user.service', () => ({ UserService: class {}, generateRandomNumber: () => 1 }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

const silentLogger = { log: jest.fn(), error: jest.fn() };

/**
 * In-memory `jobruns` shared by several "instances". Follows MongoDB: when the filter misses and
 * upsert is set, it inserts, and an insert on an existing `_id` throws E11000. Every call yields
 * first, so concurrent callers interleave the way two replicas do.
 */
function createJobRuns() {
    const docs = new Map<string, Record<string, any>>();
    const matches = (doc: Record<string, any>, filter: Record<string, any>) =>
        Object.entries(filter).every(([key, condition]) => {
            const value = doc[key];
            if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
                if ('$ne' in condition) return value !== condition.$ne;
                if ('$not' in condition) {
                    const gte = condition.$not.$gte as Date;
                    return !(value instanceof Date && value.getTime() >= gte.getTime());
                }
            }
            return value === condition;
        });
    const write = async (filter: any, update: any, options?: any) => {
        await Promise.resolve();
        const doc = docs.get(filter._id);
        if (doc && matches(doc, filter)) {
            Object.assign(doc, update.$set);
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (!options?.upsert) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        if (doc) {
            throw Object.assign(new Error('E11000 duplicate key error'), { code: DUPLICATE_KEY });
        }
        docs.set(filter._id, { _id: filter._id, ...update.$set });
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    };
    const collection: ILeaseCollection = {
        updateOne: jest.fn(write),
        findOneAndUpdate: jest.fn(write),
    };
    return { collection, docs };
}

describe('acquireLease', () => {
    const t0 = new Date('2026-10-02T01:00:00Z');

    it('takes a free lease once; a second instance at the same moment sees it held', async () => {
        const { collection } = createJobRuns();
        const results = await Promise.all([
            acquireLease(collection, 'job', 60000, t0, 'a'),
            acquireLease(collection, 'job', 60000, t0, 'b'),
        ]);
        expect(results.sort()).toEqual([false, true]);
    });

    it('stays held until it expires, then can be taken again', async () => {
        const { collection, docs } = createJobRuns();
        await expect(acquireLease(collection, 'job', 60000, t0)).resolves.toBe(true);
        // Held up to and including `lockedUntil` (the plan's `lockedUntil: {$lt: now}`).
        await expect(acquireLease(collection, 'job', 60000, new Date(t0.getTime() + 60000))).resolves.toBe(false);
        await expect(acquireLease(collection, 'job', 60000, new Date(t0.getTime() + 60001))).resolves.toBe(true);
        expect(docs.get('job')!.lockedUntil).toEqual(new Date(t0.getTime() + 120001));
    });

    it('uses the jobruns pattern: conditional upsert on the job name', async () => {
        const { collection } = createJobRuns();
        await acquireLease(collection, 'job', 1000, t0, 'me');
        const [filter, update, options] = (collection.findOneAndUpdate as jest.Mock).mock.calls[0];
        expect(filter).toEqual({ _id: 'job', lockedUntil: { $not: { $gte: t0 } } });
        expect(update.$set).toMatchObject({ lockedUntil: new Date(t0.getTime() + 1000), lockedBy: 'me' });
        expect(options).toEqual({ upsert: true });
    });

    it('rethrows errors other than E11000', async () => {
        const collection = {
            updateOne: jest.fn(),
            findOneAndUpdate: jest.fn(async () => {
                throw new Error('network');
            }),
        };
        await expect(acquireLease(collection, 'job', 1000, t0)).rejects.toThrow('network');
    });
});

describe('claimJobPeriod', () => {
    it('claims a period once, across instances and reruns', async () => {
        const { collection } = createJobRuns();
        const now = new Date();
        const first = await Promise.all([
            claimJobPeriod(collection, 'codex-reset', '2026-10', now),
            claimJobPeriod(collection, 'codex-reset', '2026-10', now),
        ]);
        expect(first.sort()).toEqual([false, true]);
        await expect(claimJobPeriod(collection, 'codex-reset', '2026-10', now)).resolves.toBe(false);
        await expect(claimJobPeriod(collection, 'codex-reset', '2026-11', now)).resolves.toBe(true);
    });
});

describe('runLeased', () => {
    it('records done, and failed with a rethrow', async () => {
        const { collection, docs } = createJobRuns();
        const now = new Date('2026-10-02T01:00:00Z');
        await expect(
            runLeased({
                jobRuns: collection,
                jobName: 'ok',
                ttlMs: 1000,
                run: async () => 1,
                now,
                logger: silentLogger,
            })
        ).resolves.toBe('ran');
        expect(docs.get('ok')!.status).toBe('done');

        await expect(
            runLeased({
                jobRuns: collection,
                jobName: 'boom',
                ttlMs: 1000,
                now,
                logger: silentLogger,
                run: async () => {
                    throw new Error('boom');
                },
            })
        ).rejects.toThrow('boom');
        expect(docs.get('boom')!.status).toBe('failed');
    });
});

/*
 * F8 known-issue fix: the crons at cat.controller.ts:64 and user.controller.ts:282-304 ran on every
 * replica. Two instances of each controller share one jobruns collection here.
 */
describe('leased crons: two instances run each cron once per tick', () => {
    beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'performance'] }));
    afterEach(() => jest.useRealTimers());

    function instances() {
        const { collection, docs } = createJobRuns();
        const db = { collection: jest.fn((name: string) => (name === JOB_RUNS_COLLECTION ? collection : null)) };
        const makeCat = () => {
            const repository = { model: { db }, updateAll: jest.fn(async () => ({})) };
            const controller = new CatController(repository as any, {} as any, {} as any, {} as any);
            (controller as any).logger = silentLogger;
            return { controller, repository };
        };
        const makeUser = () => {
            const repository = {
                model: { db, updateMany: jest.fn(async () => ({})) },
                updateAll: jest.fn(async () => ({})),
                find: jest.fn(async () => [{ _id: 'top-1' }]),
            };
            const controller = Object.create(UserController.prototype);
            controller.repository = repository;
            controller.logger = silentLogger;
            return { controller, repository };
        };
        return { docs, cats: [makeCat(), makeCat()], users: [makeUser(), makeUser()] };
    }

    it('the daily cat hunger reset', async () => {
        const { cats, docs } = instances();
        jest.setSystemTime(new Date('2026-10-02T01:00:00Z'));

        const outcomes = await Promise.all(cats.map(({ controller }) => controller.saveLinkedArticlesCount()));

        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        expect(cats[0].repository.updateAll.mock.calls.length + cats[1].repository.updateAll.mock.calls.length).toBe(1);
        expect(docs.get(CAT_STATUS_RESET_JOB)!.status).toBe('done');

        // The next day's tick runs once again.
        jest.setSystemTime(new Date('2026-10-03T01:00:00Z'));
        await Promise.all(cats.map(({ controller }) => controller.saveLinkedArticlesCount()));
        expect(cats[0].repository.updateAll.mock.calls.length + cats[1].repository.updateAll.mock.calls.length).toBe(2);
    });

    it.each([
        ['resetCheckIn', USER_JOBS.CHECK_IN_RESET, 'updateAll'],
        ['saveLinkedArticlesCount', USER_JOBS.STATUS_RESET, 'updateAll'],
        ['giveWeeklyTopRewards', USER_JOBS.WEEKLY_TOP_REWARDS, 'updateMany'],
    ])('UserController.%s', async (method, jobName, write) => {
        const { users, docs } = instances();
        jest.setSystemTime(new Date('2026-10-04T01:00:00Z'));
        const writes = () =>
            users.reduce(
                (sum, { repository }) =>
                    sum +
                    (write === 'updateMany' ? repository.model.updateMany : repository.updateAll).mock.calls.length,
                0
            );

        const outcomes = await Promise.all(users.map(({ controller }) => controller[method]()));

        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        expect(writes()).toBe(1);
        expect(docs.get(jobName)!.status).toBe('done');

        jest.setSystemTime(new Date('2026-10-11T01:00:00Z'));
        await Promise.all(users.map(({ controller }) => controller[method]()));
        expect(writes()).toBe(2);
    });

    it('the weekly reward still pays the top 200 with 200 Tails', async () => {
        const { users } = instances();
        jest.setSystemTime(new Date('2026-10-04T00:00:00Z'));
        await users[0].controller.giveWeeklyTopRewards();

        expect(users[0].repository.find).toHaveBeenCalledWith(expect.objectContaining({ perPage: 200 }));
        expect(users[0].repository.model.updateMany).toHaveBeenCalledWith(
            { _id: { $in: ['top-1'] } },
            // G5 ledger split (task 4e): the credit also moves lifetime earned Tails.
            { $inc: { tails: 200, tailsEarned: 200 } }
        );
    });
});

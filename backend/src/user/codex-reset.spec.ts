import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { CronTime } from 'cron';
import { getPhase } from 'src/common/utils';
import {
    claimCodexResetPeriod,
    CODEX_RESET_CRON,
    CODEX_RESET_JOB_NAME,
    CODEX_RESET_TIMEZONE,
    codexResetPeriod,
    currentCodexPeriodStart,
    IJobRunsCollection,
    JOB_RUNS_COLLECTION,
    MONTHLY_COUNTER_RESET,
    runCodexReset,
} from './codex-reset';
import { UserController } from './user.controller';

// The controller's collaborators pull in Firebase, AI and image utilities; the cron needs none of them.
jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

const silentLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

// In-memory stand-in for the jobruns collection. updateOne follows MongoDB: when the filter misses
// and upsert is set, it inserts, and an insert on an existing _id throws E11000.
function createJobRuns(initial: Record<string, any>[] = []) {
    const docs = new Map<string, Record<string, any>>(initial.map(doc => [doc._id, { ...doc }]));
    const matches = (doc: Record<string, any>, filter: Record<string, any>) =>
        Object.entries(filter).every(([key, condition]) =>
            condition && typeof condition === 'object' && '$ne' in condition
                ? doc[key] !== condition.$ne
                : doc[key] === condition
        );
    const collection: IJobRunsCollection = {
        updateOne: jest.fn(async (filter: any, update: any, options?: any) => {
            const doc = docs.get(filter._id);
            if (doc && matches(doc, filter)) {
                Object.assign(doc, update.$set);
                return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
            }
            if (!options?.upsert) {
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            }
            if (doc) {
                throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
            }
            docs.set(filter._id, { _id: filter._id, ...update.$set });
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }),
    };
    return { collection, docs };
}

const nextFireTimes = (cronTime: string, timeZone: string | undefined, count: number) =>
    (new CronTime(cronTime, timeZone).sendAt(count) as unknown as { toJSDate(): Date }[]).map(time =>
        time.toJSDate().toISOString()
    );

describe('codex reset schedule', () => {
    it('fires once a month at 23:00 UTC on the 8th, one hour before the phase anchor', () => {
        expect(CODEX_RESET_TIMEZONE).toBe('UTC');
        expect(nextFireTimes(CODEX_RESET_CRON, CODEX_RESET_TIMEZONE, 3)).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/-08T23:00:00\.000Z$/),
                expect.stringMatching(/-08T23:00:00\.000Z$/),
                expect.stringMatching(/-08T23:00:00\.000Z$/),
            ])
        );
        const [first, second] = nextFireTimes(CODEX_RESET_CRON, CODEX_RESET_TIMEZONE, 2).map(time => new Date(time));
        expect(
            (second.getUTCFullYear() - first.getUTCFullYear()) * 12 + second.getUTCMonth() - first.getUTCMonth()
        ).toBe(1);
    });

    it('runs inside the two-hour freeze, before getPhase moves on', () => {
        jest.useFakeTimers({ doNotFake: ['performance'], now: new Date('2026-10-08T23:00:00Z') });
        const phaseAtReset = getPhase();
        jest.setSystemTime(new Date('2026-10-09T00:00:00Z'));
        const phaseAfterAnchor = getPhase();
        jest.useRealTimers();
        expect(phaseAfterAnchor).toBe(phaseAtReset + 1);
    });

    it('is registered on UserController.resetCodex with the monthly expression and an explicit time zone', () => {
        const options = Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, UserController.prototype.resetCodex);
        expect(options).toMatchObject({ cronTime: CODEX_RESET_CRON, timeZone: 'UTC', name: CODEX_RESET_JOB_NAME });
        const fires = nextFireTimes(options.cronTime, options.timeZone, 2).map(time => new Date(time).getTime());
        expect(fires[1] - fires[0]).toBeGreaterThan(27 * 24 * 60 * 60 * 1000);
    });
});

describe('codexResetPeriod', () => {
    it('names the phase that starts at the nearest anchor', () => {
        expect(codexResetPeriod(new Date('2026-10-08T23:00:00Z'))).toBe('2026-10');
        expect(codexResetPeriod(new Date('2026-10-09T05:00:00Z'))).toBe('2026-10');
        expect(codexResetPeriod(new Date('2026-12-08T23:00:00Z'))).toBe('2026-12');
        expect(codexResetPeriod(new Date('2027-01-08T23:00:00Z'))).toBe('2027-01');
    });

    it('refuses times that are not within 48 hours of an anchor', () => {
        expect(codexResetPeriod(new Date('2026-10-01T00:00:00Z'))).toBeNull();
        expect(codexResetPeriod(new Date('2026-10-20T00:00:00Z'))).toBeNull();
    });

    it('computes the current period start from the reset instant', () => {
        expect(currentCodexPeriodStart(new Date('2026-09-29T12:00:00Z')).toISOString()).toBe(
            '2026-09-08T23:00:00.000Z'
        );
        expect(currentCodexPeriodStart(new Date('2026-10-08T22:59:59Z')).toISOString()).toBe(
            '2026-09-08T23:00:00.000Z'
        );
        expect(currentCodexPeriodStart(new Date('2026-10-08T23:00:00Z')).toISOString()).toBe(
            '2026-10-08T23:00:00.000Z'
        );
        expect(currentCodexPeriodStart(new Date('2027-01-02T00:00:00Z')).toISOString()).toBe(
            '2026-12-08T23:00:00.000Z'
        );
    });
});

describe('runCodexReset', () => {
    const at = new Date('2026-10-08T23:00:00Z');

    beforeEach(() => jest.clearAllMocks());

    it('pays guards, then resets counters, and records the period', async () => {
        const { collection, docs } = createJobRuns();
        const calls: string[] = [];
        const outcome = await runCodexReset({
            jobRuns: collection,
            payGuards: async () => calls.push('pay'),
            resetCounters: async () => calls.push('reset'),
            now: at,
            logger: silentLogger,
        });

        expect(outcome).toBe('done');
        expect(calls).toEqual(['pay', 'reset']);
        expect(docs.get(CODEX_RESET_JOB_NAME)).toMatchObject({ period: '2026-10', status: 'done' });
    });

    it('does nothing on a second run for the same period', async () => {
        const { collection } = createJobRuns();
        const payGuards = jest.fn(async () => undefined);
        const resetCounters = jest.fn(async () => undefined);
        const deps = { jobRuns: collection, payGuards, resetCounters, logger: silentLogger };

        await runCodexReset({ ...deps, now: at });
        const second = await runCodexReset({ ...deps, now: new Date('2026-10-09T08:00:00Z') });

        expect(second).toBe('already-done');
        expect(payGuards).toHaveBeenCalledTimes(1);
        expect(resetCounters).toHaveBeenCalledTimes(1);
    });

    it('runs again for the next period', async () => {
        const { collection } = createJobRuns([{ _id: CODEX_RESET_JOB_NAME, period: '2026-09', status: 'done' }]);
        const payGuards = jest.fn(async () => undefined);
        const resetCounters = jest.fn(async () => undefined);

        const outcome = await runCodexReset({
            jobRuns: collection,
            payGuards,
            resetCounters,
            now: at,
            logger: silentLogger,
        });

        expect(outcome).toBe('done');
        expect(payGuards).toHaveBeenCalledTimes(1);
    });

    it('refuses to run away from an anchor', async () => {
        const { collection } = createJobRuns();
        const payGuards = jest.fn(async () => undefined);
        const resetCounters = jest.fn(async () => undefined);

        const outcome = await runCodexReset({
            jobRuns: collection,
            payGuards,
            resetCounters,
            now: new Date('2026-10-01T00:00:00Z'),
            logger: silentLogger,
        });

        expect(outcome).toBe('outside-window');
        expect(payGuards).not.toHaveBeenCalled();
        expect(resetCounters).not.toHaveBeenCalled();
        expect(collection.updateOne).not.toHaveBeenCalled();
    });

    it('releases the period when the payout fails and leaves counters alone', async () => {
        const { collection, docs } = createJobRuns();
        const resetCounters = jest.fn(async () => undefined);

        await expect(
            runCodexReset({
                jobRuns: collection,
                payGuards: async () => {
                    throw new Error('bulkWrite failed');
                },
                resetCounters,
                now: at,
                logger: silentLogger,
            })
        ).rejects.toThrow('bulkWrite failed');

        expect(resetCounters).not.toHaveBeenCalled();
        expect(docs.get(CODEX_RESET_JOB_NAME)).toMatchObject({ period: null, failedPeriod: '2026-10' });
        expect(await claimCodexResetPeriod(collection, '2026-10', at)).toBe(true);
    });

    it('keeps the period taken when the reset fails after payout', async () => {
        const { collection, docs } = createJobRuns();
        const payGuards = jest.fn(async () => undefined);

        await expect(
            runCodexReset({
                jobRuns: collection,
                payGuards,
                resetCounters: async () => {
                    throw new Error('updateMany failed');
                },
                now: at,
                logger: silentLogger,
            })
        ).rejects.toThrow('updateMany failed');

        expect(docs.get(CODEX_RESET_JOB_NAME)).toMatchObject({ period: '2026-10', status: 'reset-failed' });
        expect(await claimCodexResetPeriod(collection, '2026-10', at)).toBe(false);
    });
});

describe('UserController.resetCodex', () => {
    it('runs the guarded reset against the jobruns collection', async () => {
        const { collection, docs } = createJobRuns();
        const dbCollection = jest.fn(() => collection);
        const repository = {
            model: { db: { collection: dbCollection } },
            updateAll: jest.fn(async () => undefined),
        };
        const controller = new UserController(
            repository as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any
        );
        const giveLootBoxesToTailsGuards = jest
            .spyOn(controller, 'giveLootBoxesToTailsGuards')
            .mockResolvedValue(undefined);

        jest.useFakeTimers({ doNotFake: ['performance'], now: at() });
        const first = await controller.resetCodex();
        const second = await controller.resetCodex();
        jest.useRealTimers();

        expect([first, second]).toEqual(['done', 'already-done']);
        expect(dbCollection).toHaveBeenCalledWith(JOB_RUNS_COLLECTION);
        expect(giveLootBoxesToTailsGuards).toHaveBeenCalledTimes(1);
        expect(repository.updateAll).toHaveBeenCalledTimes(1);
        expect(repository.updateAll).toHaveBeenCalledWith(MONTHLY_COUNTER_RESET);
        expect(docs.get(CODEX_RESET_JOB_NAME)).toMatchObject({ period: '2026-10', status: 'done' });

        function at() {
            return new Date('2026-10-08T23:00:00Z');
        }
    });
});

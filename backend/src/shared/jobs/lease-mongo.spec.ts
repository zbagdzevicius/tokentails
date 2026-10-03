import mongoose, { Connection, Types } from 'mongoose';
import { acquireLease, claimJobPeriod, ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from './lease';

/*
 * The F8 lease against a REAL MongoDB (opt-in). `lease.spec.ts` checks the logic against an in-memory
 * collection; this one checks that MongoDB answers a held lease with E11000 on the conditional upsert
 * and that `lockedUntil: {$not: {$gte}}` matches a missing field.
 *
 * Skipped unless MONGO_IT_URI (or IDENTITY_SPEC_MONGO_URL, the older name) is set. It creates and
 * drops its own scratch database:
 *
 *   MONGO_IT_URI=mongodb://localhost:27017 npx jest src/shared/jobs/lease-mongo.spec.ts
 */

const url = process.env.MONGO_IT_URI || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('job lease on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let jobRuns: ILeaseCollection;

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_lease_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        jobRuns = connection.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection;
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await connection.db.collection(JOB_RUNS_COLLECTION).deleteMany({});
    });

    it('two instances acquiring at the same moment: exactly one wins', async () => {
        const now = new Date();
        const results = await Promise.all([
            acquireLease(jobRuns, 'job', 60000, now, 'a'),
            acquireLease(jobRuns, 'job', 60000, now, 'b'),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
        const doc = await connection.db.collection(JOB_RUNS_COLLECTION).findOne({ _id: 'job' as any });
        expect(['a', 'b']).toContain(doc?.lockedBy);
    });

    it('stays held until it expires, and a document without lockedUntil is free', async () => {
        const t0 = new Date();
        await connection.db.collection(JOB_RUNS_COLLECTION).insertOne({ _id: 'legacy' as any, status: 'done' });
        await expect(acquireLease(jobRuns, 'legacy', 60000, t0)).resolves.toBe(true);
        await expect(acquireLease(jobRuns, 'legacy', 60000, new Date(t0.getTime() + 59999))).resolves.toBe(false);
        await expect(acquireLease(jobRuns, 'legacy', 60000, new Date(t0.getTime() + 60001))).resolves.toBe(true);
    });

    it('two instances run a cron once per tick', async () => {
        const run = jest.fn(async () => undefined);
        const now = new Date();
        const outcomes = await Promise.all(
            ['a', 'b'].map(() => runLeased({ jobRuns, jobName: 'tick', ttlMs: 60000, run, now }))
        );
        expect(run).toHaveBeenCalledTimes(1);
        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        const doc = await connection.db.collection(JOB_RUNS_COLLECTION).findOne({ _id: 'tick' as any });
        expect(doc?.status).toBe('done');
    });

    it('claims a period once across parallel instances', async () => {
        const now = new Date();
        const results = await Promise.all(
            Array.from({ length: 3 }, () => claimJobPeriod(jobRuns, 'codex', '2026-10', now))
        );
        expect(results.filter(Boolean)).toHaveLength(1);
        await expect(claimJobPeriod(jobRuns, 'codex', '2026-11', now)).resolves.toBe(true);
    });
});

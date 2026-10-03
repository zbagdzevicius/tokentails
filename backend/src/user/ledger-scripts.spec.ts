import { MongoClient, ObjectId } from 'mongodb';
import { Types } from 'mongoose';

/* eslint-disable @typescript-eslint/no-var-requires */
const backfillTailsEarned = require('../../scripts/backfill-tails-earned.js');
const flagBoardExclusions = require('../../scripts/flag-board-exclusions.js');
const auditStaking = require('../../scripts/audit-staking.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/*
 * G5 ops scripts (task 4e). Both are dry runs by default and print counts only.
 *   scripts/backfill-tails-earned.js   tailsEarned = max(tailsEarned, tails); refuses once any pledge exists
 *   scripts/flag-board-exclusions.js   keeps 1b's flagged staking abusers off every board (decision #35)
 * The fake-db tests below run always; the real-MongoDB block runs when MONGO_IT_URI is set.
 */

interface FakeState {
    collections: Record<string, number>;
    givers: number;
    users: number;
    withoutTailsEarned: number;
    needsBackfill: number;
    sums: { tails: number; tailsEarned: number };
}

function fakeDb(state: FakeState) {
    const calls: string[] = [];
    const collection = (name: string) => ({
        countDocuments: async (filter: any) => {
            calls.push(`${name}.countDocuments`);
            if (name !== 'users') return state.collections[name] || 0;
            if (filter.$or) return state.givers;
            if (filter.tailsEarned) return state.withoutTailsEarned;
            if (filter.$expr) return state.needsBackfill;
            return state.users;
        },
        aggregate: () => ({
            toArray: async () => (calls.push(`${name}.aggregate`), [{ _id: null, ...state.sums }]),
        }),
        updateMany: async () => (calls.push(`${name}.updateMany`), { modifiedCount: state.needsBackfill }),
    });
    const db = {
        listCollections: () => ({
            toArray: async () => Object.keys({ users: 1, ...state.collections }).map(name => ({ name })),
        }),
        collection,
    };
    return { db, calls };
}

const clean = (): FakeState => ({
    collections: { rescuegoalpledges: 0, cats: 7 },
    givers: 0,
    users: 10,
    withoutTailsEarned: 8,
    needsBackfill: 9,
    sums: { tails: 12345, tailsEarned: 40 },
});

describe('scripts/backfill-tails-earned.js', () => {
    it('dry run by default: prints counts only and writes nothing', async () => {
        const { db, calls } = fakeDb(clean());
        const lines: string[] = [];

        const report = await backfillTailsEarned.backfill(db, {}, (line: string) => lines.push(line));

        expect(report).toMatchObject({
            users: 10,
            withoutTailsEarned: 8,
            partialTailsEarned: 1,
            needsBackfill: 9,
            tailsTotal: 12345,
            tailsEarnedTotalBefore: 40,
            applied: 0,
            refused: false,
        });
        expect(calls).not.toContain('users.updateMany');
        expect(lines.join('\n')).toContain('Dry run: nothing written');
        // Counts only: no id, email or name ever printed.
        expect(lines.join('\n')).not.toMatch(/@|ObjectId|[0-9a-f]{24}/);
        Object.values(report).forEach(value => expect(['number', 'boolean']).toContain(typeof value));
    });

    it.each([
        ['a non-empty pledge collection', { collections: { rescuegoalpledges: 1 } }, /rescuegoalpledges/],
        ['a user who gave Tails', { givers: 2 }, /2 user\(s\) with tailsGiven/],
    ])('refuses when %s exists, and writes nothing', async (_label, overrides, message) => {
        const { db, calls } = fakeDb({ ...clean(), ...(overrides as Partial<FakeState>) });

        const error = await backfillTailsEarned.backfill(db, { apply: true }, () => undefined).catch((e: Error) => e);

        expect(error).toBeInstanceOf(backfillTailsEarned.PledgesExistError);
        expect(error.message).toMatch(/^Refusing: pledges exist/);
        expect(error.message).toMatch(message);
        expect(calls).not.toContain('users.updateMany');
    });

    it('re-checks right before writing: a pledge that lands during the run stops the write', async () => {
        const state = clean();
        const { db, calls } = fakeDb(state);
        const log = (line: string) => {
            if (line.startsWith('No pledges found')) state.givers = 1;
        };

        await expect(backfillTailsEarned.backfill(db, { apply: true }, log)).rejects.toBeInstanceOf(
            backfillTailsEarned.PledgesExistError
        );
        expect(calls).not.toContain('users.updateMany');
    });

    it('--apply writes max(tailsEarned, tails) for the documents that need it', async () => {
        const { db, calls } = fakeDb(clean());
        const report = await backfillTailsEarned.backfill(db, { apply: true }, () => undefined);
        expect(report.applied).toBe(9);
        expect(calls.filter(call => call === 'users.updateMany')).toHaveLength(1);
        expect(backfillTailsEarned.BACKFILL_UPDATE).toEqual([
            { $set: { tailsEarned: { $max: [{ $ifNull: ['$tailsEarned', 0] }, { $ifNull: ['$tails', 0] }] } } },
        ]);
    });

    it('parses only --db and --apply', () => {
        expect(backfillTailsEarned.parseArgs([])).toEqual({ apply: false });
        expect(backfillTailsEarned.parseArgs(['--db', 'x', '--apply'])).toEqual({ db: 'x', apply: true });
        expect(() => backfillTailsEarned.parseArgs(['--force'])).toThrow('Unknown option --force');
    });
});

describe('scripts/flag-board-exclusions.js', () => {
    it("reuses the audit rule, with each cat's bound raised to the flat cat nap", () => {
        const pipeline = flagBoardExclusions.flaggedUsersPipeline();
        const audit = auditStaking.overCraftedPipeline();

        expect(pipeline[1].$project.reward).toEqual({ $max: [auditStaking.rewardExpression(), 50] });
        expect(pipeline[pipeline.length - 1]).toEqual({ $project: { _id: 1 } });
        expect(pipeline.some((stage: any) => stage.$group?._id === null)).toBe(false);
        // Everything else is the audit's pipeline unchanged.
        expect(pipeline.length).toBe(audit.length);
        expect(JSON.stringify(pipeline.slice(2, 6))).toBe(JSON.stringify(audit.slice(2, 6)));
        expect(JSON.stringify(pipeline)).not.toMatch(/email|name|wallet/);
    });

    it('dry run counts; --apply sets the flag only on users not flagged yet', async () => {
        const ids = [new Types.ObjectId(), new Types.ObjectId()];
        const updates: any[] = [];
        const db = {
            collection: (name: string) => ({
                aggregate: () => ({ toArray: async () => (name === 'cats' ? ids.map(_id => ({ _id })) : []) }),
                countDocuments: async () => 1,
                updateMany: async (filter: any, update: any) => (
                    updates.push({ filter, update }), { modifiedCount: 1 }
                ),
            }),
        };
        const now = new Date('2026-10-01T12:00:00Z');

        await expect(flagBoardExclusions.flagBoardExclusions(db, {}, now, () => undefined)).resolves.toEqual({
            flagged: 2,
            alreadyFlagged: 1,
            applied: 0,
        });
        expect(updates).toHaveLength(0);

        await flagBoardExclusions.flagBoardExclusions(db, { apply: true }, now, () => undefined);
        expect(updates).toEqual([
            {
                filter: { _id: { $in: ids }, boardExcludedAt: { $exists: false } },
                update: { $set: { boardExcludedAt: now, boardExcludedReason: 'staking-abuse' } },
            },
        ]);
    });
});

const url = process.env.MONGO_IT_URI || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('G5 ops scripts on a real MongoDB', () => {
    jest.setTimeout(60000);
    let client: MongoClient;
    let dbName: string;

    beforeAll(async () => {
        client = await new MongoClient(url!).connect();
    });

    afterAll(async () => {
        await client?.close();
    });

    beforeEach(() => {
        dbName = `tt_ledger_spec_${new ObjectId().toString()}`;
    });

    afterEach(async () => {
        await client.db(dbName).dropDatabase();
    });

    it('backfills tailsEarned exactly, never lowers it, and is idempotent', async () => {
        const db = client.db(dbName);
        const users = db.collection('users');
        const ids = Array.from({ length: 4 }, () => new ObjectId());
        await users.insertMany([
            { _id: ids[0], tails: 900 },
            { _id: ids[1], tails: 1000, tailsEarned: 100 },
            { _id: ids[2], tails: 50, tailsEarned: 50 },
            { _id: ids[3], name: 'no tails' },
        ] as any[]);

        const dry = await backfillTailsEarned.backfill(db, {}, () => undefined);
        expect(dry).toMatchObject({ users: 4, withoutTailsEarned: 2, needsBackfill: 2, applied: 0 });
        expect(await users.countDocuments({ tailsEarned: { $exists: true } })).toBe(2);

        const applied = await backfillTailsEarned.backfill(db, { apply: true }, () => undefined);
        expect(applied.applied).toBe(2);
        const byId = Object.fromEntries((await users.find({}).toArray()).map(doc => [String(doc._id), doc]));
        expect(byId[String(ids[0])].tailsEarned).toBe(900);
        expect(byId[String(ids[1])].tailsEarned).toBe(1000);
        expect(byId[String(ids[2])].tailsEarned).toBe(50);
        expect(byId[String(ids[3])].tailsEarned).toBeUndefined();

        const again = await backfillTailsEarned.backfill(db, { apply: true }, () => undefined);
        expect(again).toMatchObject({ needsBackfill: 0, applied: 0 });
    });

    it('refuses on a real pledge collection and on a giver, writing nothing', async () => {
        const db = client.db(dbName);
        await db.collection('users').insertOne({ _id: new ObjectId(), tails: 10 } as any);
        await db.collection('rescuegoalpledges').insertOne({ _id: new ObjectId() } as any);

        await expect(backfillTailsEarned.backfill(db, { apply: true }, () => undefined)).rejects.toThrow(
            /collection rescuegoalpledges is not empty/
        );
        expect(await db.collection('users').countDocuments({ tailsEarned: { $exists: true } })).toBe(0);

        await db.collection('rescuegoalpledges').deleteMany({});
        await db.collection('users').insertOne({ _id: new ObjectId(), tails: 0, tailsGiven: 5 } as any);
        await expect(backfillTailsEarned.backfill(db, {}, () => undefined)).rejects.toThrow(/tailsGiven/);
    });

    it('flags exactly the over-crafting users, keeping the flat-nap bound', async () => {
        const db = client.db(dbName);
        const abuser = new ObjectId();
        const honestNapper = new ObjectId();
        const honest = new ObjectId();
        await db.collection('users').insertMany([
            // One unblessed cat: old bound 5 x 10 = 50, nap bound 5 x 50 = 250.
            { _id: abuser, monthTailsCrafted: 20000 },
            { _id: honestNapper, monthTailsCrafted: 150 },
            { _id: honest, monthTailsCrafted: 40 },
        ] as any[]);
        await db
            .collection('cats')
            .insertMany([abuser, honestNapper, honest].map(owner => ({ _id: new ObjectId(), owner })) as any[]);

        const dry = await flagBoardExclusions.flagBoardExclusions(db, {}, new Date(), () => undefined);
        expect(dry).toEqual({ flagged: 1, alreadyFlagged: 0, applied: 0 });
        await flagBoardExclusions.flagBoardExclusions(db, { apply: true }, new Date(), () => undefined);

        const flagged = await db
            .collection('users')
            .find({ boardExcludedAt: { $exists: true } })
            .toArray();
        expect(flagged.map(doc => String(doc._id))).toEqual([String(abuser)]);
        expect(flagged[0]).toMatchObject({ boardExcludedReason: 'staking-abuse', monthTailsCrafted: 20000 });
    });
});

import { ObjectId } from 'mongodb';
import {
    classify,
    emptyCounts,
    isTrusted,
    parseArgs as parseUidArgs,
    processPage,
} from '../../scripts/backfill-firebase-uid';

/* eslint-disable @typescript-eslint/no-var-requires */
const auditIdentity = require('../../scripts/audit-identity.js');
const auditDuplicates = require('../../scripts/audit-duplicate-users.js');
const backfillFields = require('../../scripts/backfill-identity-fields.js');
/* eslint-enable @typescript-eslint/no-var-requires */

/*
 * F5.3 scripts: the two audits only read and print counts, the backfills are dry runs unless --apply,
 * and the unique-index build refuses to build while duplicates exist. The same scripts run
 * against a real MongoDB in identity-mongo.spec.ts (opt-in).
 */

const READS = ['countDocuments', 'aggregate', 'find'];

/** A db stand-in that throws on any method outside `allowed`, so the spec proves a script only reads. */
function recordingDb(allowed: string[] = READS, aggregateRows: any[] = []) {
    const calls: string[] = [];
    const collection = (name: string) =>
        new Proxy({} as Record<string, any>, {
            get(_target, prop: string) {
                if (!allowed.includes(prop)) {
                    throw new Error(`script must not call ${name}.${prop}`);
                }
                return (...args: any[]) => {
                    calls.push(`${name}.${prop}`);
                    if (prop === 'countDocuments') return Promise.resolve(0);
                    const cursor: any = {
                        toArray: async () => (prop === 'aggregate' ? aggregateRows : []),
                        batchSize: () => cursor,
                        [Symbol.asyncIterator]: async function* () {
                            // no rows
                        },
                    };
                    void args;
                    return cursor;
                };
            },
        });
    return { db: { collection }, calls };
}

const PERSONAL = /@|uid-|[0-9a-f]{24}/;

describe('scripts/audit-identity.js', () => {
    it('only reads and prints counts', async () => {
        const { db, calls } = recordingDb(['countDocuments', 'aggregate']);

        const summary = await auditIdentity.audit(db, new Date('2026-09-30T00:00:00Z'));

        expect(new Set(calls.map((call: string) => call.split('.')[1]))).toEqual(
            new Set(['countDocuments', 'aggregate'])
        );
        Object.values(summary).forEach(value => expect(typeof value).toBe('number'));
        expect(JSON.stringify(summary)).not.toMatch(PERSONAL);
        expect(summary).toMatchObject({
            usersIsGuestMissing: 0,
            accountsReferredMoreThanOnce: 0,
            usersWithDanglingCat: 0,
        });
    });

    it('summarize reads the aggregate rows', () => {
        expect(
            auditIdentity.summarize(
                { usersTotal: 5 },
                {
                    dangling: [{ count: 2 }],
                    multiStarter: [],
                    multiReferred: [{ accounts: 3, extraPayouts: 4 }],
                    pending: [{ guests: 2, total: 900, max: 600 }],
                }
            )
        ).toEqual({
            usersTotal: 5,
            usersWithDanglingCat: 2,
            ownersWithMoreThanOneStarter: 0,
            accountsReferredMoreThanOnce: 3,
            extraReferralPayouts: 4,
            guestsHoldingPendingTails: 2,
            guestPendingTailsTotal: 900,
            guestPendingTailsMax: 600,
        });
    });

    it('rejects unknown options (there is no --apply)', () => {
        expect(() => auditIdentity.parseArgs(['--apply'])).toThrow('Unknown option');
        expect(auditIdentity.parseArgs(['--db', 'x', '--dry-run'])).toEqual({ db: 'x', dryRun: true });
    });
});

describe('scripts/audit-duplicate-users.js', () => {
    it('only reads; ready for unique indexes when nothing is duplicated', async () => {
        const { db, calls } = recordingDb(['countDocuments', 'aggregate']);

        const summary = await auditDuplicates.audit(db);

        expect(calls.every((call: string) => /countDocuments|aggregate/.test(call))).toBe(true);
        expect(summary.readyForUniqueIndexes).toBe(true);
    });

    it('not ready while emails or uids are duplicated', () => {
        const summary = auditDuplicates.summarize({
            emails: [
                {
                    groups: 2,
                    docs: 5,
                    maxGroupSize: 3,
                    groupsWithSeveralUidOwners: 1,
                    groupsWithProgressOnSeveralDocs: 1,
                    groupsOnlyDifferingInCase: 2,
                },
            ],
            uids: [],
            emptyUidArrays: 0,
        });
        expect(summary).toMatchObject({
            duplicateEmailGroups: 2,
            docsInDuplicateEmailGroups: 5,
            readyForUniqueIndexes: false,
        });
        expect(
            auditDuplicates.summarize({ emails: [], uids: [{ uids: 1, maxDocsPerUid: 2 }], emptyUidArrays: 0 })
                .readyForUniqueIndexes
        ).toBe(false);
    });
});

describe('scripts/backfill-identity-fields.js', () => {
    it('is a dry run by default: counts, never writes', async () => {
        const { db, calls } = recordingDb(['countDocuments', 'find']);

        const result = await backfillFields.backfill(db);

        expect(result.mode).toBe('dry-run');
        expect(calls.some((call: string) => /update|bulkWrite/.test(call))).toBe(false);
        expect(backfillFields.parseArgs([])).toEqual({ apply: false });
        expect(backfillFields.parseArgs(['--apply']).apply).toBe(true);
    });

    it('skips emails whose lowercased form is taken, or shared inside the batch', () => {
        const rows = [
            { _id: 1, email: 'Taken@Example.com' },
            { _id: 2, email: ' Free@Example.com ' },
            { _id: 3, email: 'Twin@Example.com' },
            { _id: 4, email: 'TWIN@example.com' },
        ];

        const plan = backfillFields.planEmailBatch(rows, ['taken@example.com']);

        expect(plan.collisions).toBe(3);
        expect(plan.writes).toEqual([
            {
                updateOne: {
                    filter: { _id: 2, email: ' Free@Example.com ' },
                    update: { $set: { email: 'free@example.com' } },
                },
            },
        ]);
    });
});

describe('scripts/backfill-firebase-uid.ts', () => {
    const account = (fields: Record<string, unknown> = {}) => ({
        uid: 'uid-1',
        email: 'Player@Example.com',
        emailVerified: true,
        providerIds: ['password'],
        ...fields,
    });
    const doc = (fields: Record<string, unknown> = {}) => ({ _id: new ObjectId(), ...fields });

    it('trusts emailVerified only, never a linked Google or Apple provider on its own', () => {
        expect(isTrusted(account())).toBe(true);
        expect(isTrusted(account({ emailVerified: false, providerIds: ['google.com'] }))).toBe(false);
        expect(isTrusted(account({ emailVerified: false, providerIds: ['apple.com', 'password'] }))).toBe(false);
        expect(isTrusted(account({ emailVerified: false }))).toBe(false);
        expect(
            classify(account({ emailVerified: false, providerIds: ['password', 'google.com'] }), [doc()], null)
        ).toBe('skippedUnverified');
    });

    it('classifies every case', () => {
        const legacy = doc();
        expect(classify(account(), [legacy], null)).toBe('bind');
        expect(classify(account({ emailVerified: false }), [legacy], null)).toBe('skippedUnverified');
        expect(classify(account(), [], null)).toBe('noAccount');
        expect(classify(account(), [legacy, doc()], null)).toBe('duplicateEmail');
        expect(classify(account({ email: undefined }), [], null)).toBe('noEmail');
        expect(classify(account(), [legacy], legacy)).toBe('alreadyBound');
        expect(classify(account(), [legacy], doc())).toBe('uidOwnedElsewhere');
        expect(classify(account({ email: undefined, providerIds: [] }), [], doc({ isGuest: true }))).toBe('noEmail');
    });

    it('binds only with --apply, idempotently ($addToSet), and never a guest or deleted doc', async () => {
        const legacy = doc({ email: 'player@example.com' });
        const updateOne = jest.fn(async () => ({ modifiedCount: 1 }));
        const find = jest.fn((filter: any) => ({
            toArray: async () => (filter.email ? [legacy] : []),
        }));
        const users = { find, updateOne } as any;

        const dry = emptyCounts(false);
        await processPage(users, [account()], dry, false);
        expect(dry).toMatchObject({ mode: 'dry-run', firebaseUsers: 1, bind: 1, bound: 0 });
        expect(updateOne).not.toHaveBeenCalled();

        const wet = emptyCounts(true);
        await processPage(users, [account()], wet, true);
        expect(wet.bound).toBe(1);
        expect(updateOne).toHaveBeenCalledWith(
            { _id: legacy._id, isGuest: { $ne: true }, deletedAt: { $exists: false } },
            { $addToSet: { firebaseUids: 'uid-1' }, $min: { emailVerifiedAt: expect.any(Date) } }
        );
        expect((find.mock.calls[0] as any)[0]).toMatchObject({
            email: { $in: ['player@example.com'] },
            isGuest: { $ne: true },
        });
        expect(JSON.stringify(wet)).not.toMatch(PERSONAL);
    });

    it('parses --dry-run (default) and --apply', () => {
        expect(parseUidArgs([])).toEqual({ apply: false });
        expect(parseUidArgs(['--dry-run', '--db', 'tokentails'])).toEqual({ apply: false, db: 'tokentails' });
        expect(parseUidArgs(['--apply']).apply).toBe(true);
        expect(() => parseUidArgs(['--force'])).toThrow();
    });
});

/*
 * The unique-index migration (migrations/tokentails/2026-10-01-identity-unique-indexes.js) is not
 * versioned (backend/.gitignore ignores /migrations); it delegates to these versioned functions.
 */
describe('identity index build (migration 2026-10-01-identity-unique-indexes)', () => {
    function db(aggregateRows: Record<string, any[]>) {
        const created: string[] = [];
        const users = {
            aggregate: (pipeline: any[]) => ({
                toArray: async () => aggregateRows[pipeline.some(stage => stage.$unwind) ? 'uids' : 'emails'] || [],
            }),
            createIndex: async (_key: unknown, options: { name: string }) => {
                created.push(options.name);
                return options.name;
            },
        };
        return { db: { collection: () => users }, created };
    }

    it('refuses to build anything while duplicates remain', async () => {
        const { db: withDuplicates, created } = db({ emails: [{ groups: 3 }] });

        await expect(auditDuplicates.buildIdentityIndexes(withDuplicates)).rejects.toThrow(
            /Refusing to build unique identity indexes/
        );
        expect(created).toEqual([]);
    });

    it('builds the partial unique and board indexes once the audit is clean', async () => {
        const { db: clean, created } = db({});

        await auditDuplicates.buildIdentityIndexes(clean);

        expect(created).toEqual([
            'board_tails',
            'board_catnip',
            'guest_idle',
            'guest_merge',
            'email_canonical',
            'firebaseUids_unique',
            'email_unique',
        ]);
        expect(auditDuplicates.UNIQUE_INDEXES[0].options.partialFilterExpression).toEqual({
            'firebaseUids.0': { $exists: true },
        });
    });
});

/*
 * Logic of migrations/tokentails/2026-10-02-heist-replay-digest.js (see its header for what it does and how to run it).
 *
 * It lives under src/ because backend/.gitignore lists /migrations: the specs
 * (src/user/heist/heist-migrations.spec.ts, heist-mongo.spec.ts) require this file, which is
 * committed, so they pass on a clean checkout. The migration file only re-exports it. Plain
 * CommonJS (`.cjs`: migrate-mongo loads it without a build, `nest build` and ts-jest leave it alone).
 */

const INDEX = {
    key: { replayDigest: 1 },
    options: { name: 'replayDigest_unique', unique: true, partialFilterExpression: { replayDigest: { $type: 'string' } } },
};

/** Lengths match shared/caps.ts (pinned by src/user/heist/heist-migrations.spec.ts). */
const ARRAYS = [
    { field: 'heistScore', length: 8 },
    { field: 'heistStars', length: 8, integers: true },
    { field: 'catnipChaosCleared', length: 97 },
    { field: 'seasonEventCleared', length: 14 },
    { field: 'match3Cleared', length: 30 },
];

const zeros = length => Array.from({ length }, () => 0);
const backfillMissing = () => process.env.MIGRATION_BACKFILL_MISSING === '1';
/**
 * A null value, not a missing field (`{field: null}` matches both) and not an array that merely
 * holds a null (`$type` matches array elements too, so arrays are excluded explicitly).
 */
const nullOnly = field => ({ [field]: { $type: 'null', $not: { $type: 'array' } } });
const absent = field => ({ [field]: { $exists: false } });
const toFill = field => (backfillMissing() ? { $or: [nullOnly(field), absent(field)] } : nullOnly(field));

/** An array with a missing slot or a non-number, or shorter than `length`. */
const needsIntegerRepair = (field, length) => ({
    [field]: { $type: 'array' },
    $expr: {
        $or: [
            { $lt: [{ $size: `$${field}` }, length] },
            { $anyElementTrue: [{ $map: { input: `$${field}`, as: 'v', in: { $not: [{ $isNumber: '$$v' }] } } }] },
        ],
    },
});

const integerRepair = (field, length) => [
    {
        $set: {
            [field]: {
                $map: {
                    input: { $range: [0, { $max: [length, { $size: `$${field}` }] }] },
                    as: 'i',
                    in: {
                        $let: {
                            vars: { v: { $arrayElemAt: [`$${field}`, '$$i'] } },
                            in: { $cond: [{ $isNumber: '$$v' }, { $toInt: '$$v' }, 0] },
                        },
                    },
                },
            },
        },
    },
];

async function duplicateDigests(games) {
    const [row] = await games
        .aggregate(
            [
                { $match: { replayDigest: { $type: 'string' } } },
                { $group: { _id: '$replayDigest', n: { $sum: 1 } } },
                { $match: { n: { $gt: 1 } } },
                { $count: 'groups' },
            ],
            { allowDiskUse: true }
        )
        .toArray();
    return (row && row.groups) || 0;
}

/** Counts only: what `apply` would do. */
async function plan(db) {
    const users = db.collection('users');
    const games = db.collection('games');
    const indexes = await games.indexes().catch(() => []);
    const report = {
        indexReady: indexes.some(index => index.name === INDEX.options.name),
        backfillMissing: backfillMissing(),
        heistRows: await games.countDocuments({ replayDigest: { $type: 'string' } }),
        duplicateDigestGroups: await duplicateDigests(games),
        arrays: {},
    };
    for (const { field, length, integers } of ARRAYS) {
        report.arrays[field] = {
            null: await users.countDocuments(nullOnly(field)),
            missing: await users.countDocuments(absent(field)),
            objectShaped: await users.countDocuments({ [field]: { $type: 'object', $not: { $type: 'array' } } }),
            ...(integers ? { needsRepair: await users.countDocuments(needsIntegerRepair(field, length)) } : {}),
        };
    }
    return report;
}

async function apply(db) {
    const users = db.collection('users');
    const games = db.collection('games');
    if (await duplicateDigests(games)) {
        throw new Error('Refusing to build replayDigest_unique: duplicate digests exist. Resolve them first.');
    }
    await games.createIndex(INDEX.key, INDEX.options);
    const changed = {};
    for (const { field, length, integers } of ARRAYS) {
        const filled = await users.updateMany(toFill(field), { $set: { [field]: zeros(length) } });
        changed[field] = filled.modifiedCount;
        if (integers) {
            const repaired = await users.updateMany(needsIntegerRepair(field, length), integerRepair(field, length));
            changed[field] += repaired.modifiedCount;
        }
    }
    return changed;
}

const wantsApply = () => process.env.MIGRATION_APPLY === '1' || process.argv.includes('--apply');

module.exports = {
    INDEX,
    ARRAYS,
    plan,
    apply,

    async up(db) {
        const before = await plan(db);
        console.log(`heist-replay-digest plan: ${JSON.stringify(before)}`);
        if (!wantsApply()) {
            // Throwing keeps migrate-mongo from recording the dry run as applied.
            throw new Error('Dry run only (nothing written). Re-run with MIGRATION_APPLY=1 to apply.');
        }
        if (before.duplicateDigestGroups) {
            throw new Error(`Refusing: ${before.duplicateDigestGroups} duplicate replayDigest groups.`);
        }
        const changed = await apply(db);
        console.log(`heist-replay-digest applied: ${JSON.stringify(changed)}`);
    },

    async down(db) {
        // The arrays stay: they are valid data, and the app reads them either way.
        await db
            .collection('games')
            .dropIndex(INDEX.options.name)
            .catch(error => {
                if (error.codeName !== 'IndexNotFound') throw error;
            });
    },
};

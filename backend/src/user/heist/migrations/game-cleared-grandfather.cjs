/*
 * Logic of migrations/tokentails/2026-10-02-game-cleared-grandfather.js (see its header for what it does and how to run it).
 *
 * It lives under src/ because backend/.gitignore lists /migrations: the specs
 * (src/user/heist/heist-migrations.spec.ts, heist-mongo.spec.ts) require this file, which is
 * committed, so they pass on a clean checkout. The migration file only re-exports it. Plain
 * CommonJS (`.cjs`: migrate-mongo loads it without a build, `nest build` and ts-jest leave it alone).
 */

/** Lengths and the INFINITE slot match shared/caps.ts (pinned by src/user/heist/heist-migrations.spec.ts). */
const MODES = [
    { cleared: 'catnipChaosCleared', sources: ['catnipChaos'], length: 97, neverCleared: [0] },
    { cleared: 'seasonEventCleared', sources: ['seasonEvent'], length: 14, neverCleared: [] },
    { cleared: 'match3Cleared', sources: ['match3', 'match3Score'], length: 30, neverCleared: [] },
];

/** `$field[i]` when `$field` is an array, else null. */
const at = (field, index) => ({ $cond: [{ $isArray: `$${field}` }, { $arrayElemAt: [`$${field}`, index] }, null] });

/** The grandfathered cleared array: max(existing flag, points > 0) per slot, INFINITE always 0. */
function clearedExpression({ cleared, sources, length, neverCleared }) {
    return {
        $map: {
            input: { $range: [0, length] },
            as: 'i',
            in: {
                $cond: [
                    {
                        $and: [
                            { $not: [{ $in: ['$$i', neverCleared] }] },
                            {
                                $or: [
                                    { $gt: [at(cleared, '$$i'), 0] },
                                    ...sources.map(source => ({ $gt: [at(source, '$$i'), 0] })),
                                ],
                            },
                        ],
                    },
                    1,
                    0,
                ],
            },
        },
    };
}

/**
 * Users with a positive score in the mode whose cleared array differs from the grandfathered one
 * and would hold at least one clear. (`$gt: 0` inside `$elemMatch` ignores null slots; object-shaped
 * arrays never match.) The `$in: [1, …]` term skips players whose only score is on an INFINITE slot
 * (Purrsuit level `01`): without it they would get a 97-slot all-zero array, the storage the
 * replay-digest migration deliberately avoids (review 3b finding 4). `/live` treats a missing
 * array as all zeros.
 */
function needsUpdate(mode) {
    const expected = clearedExpression(mode);
    return {
        $or: mode.sources.map(source => ({ [source]: { $elemMatch: { $gt: 0 } } })),
        $expr: { $and: [{ $in: [1, expected] }, { $ne: [`$${mode.cleared}`, expected] }] },
    };
}

async function plan(db) {
    const users = db.collection('users');
    const report = {};
    for (const mode of MODES) {
        report[mode.cleared] = {
            toUpdate: await users.countDocuments(needsUpdate(mode)),
            objectShapedSources: await users.countDocuments({
                $or: mode.sources.map(source => ({ [source]: { $type: 'object', $not: { $type: 'array' } } })),
            }),
        };
    }
    return report;
}

async function apply(db) {
    const users = db.collection('users');
    const changed = {};
    for (const mode of MODES) {
        const result = await users.updateMany(needsUpdate(mode), [{ $set: { [mode.cleared]: clearedExpression(mode) } }]);
        changed[mode.cleared] = result.modifiedCount;
    }
    return changed;
}

const wantsApply = () => process.env.MIGRATION_APPLY === '1' || process.argv.includes('--apply');

module.exports = {
    MODES,
    clearedExpression,
    needsUpdate,
    plan,
    apply,

    async up(db) {
        console.log(`game-cleared-grandfather plan: ${JSON.stringify(await plan(db))}`);
        if (!wantsApply()) {
            throw new Error('Dry run only (nothing written). Re-run with MIGRATION_APPLY=1 to apply.');
        }
        console.log(`game-cleared-grandfather applied: ${JSON.stringify(await apply(db))}`);
    },

    // Nothing to undo safely: after the deploy, `/live` writes real clears into the same arrays.
    async down() {},
};

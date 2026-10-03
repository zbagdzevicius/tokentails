#!/usr/bin/env node
/*
 * Read-only audit of the staking exploit closed by the W1 security hotfix (G5 P1, decision #1).
 *
 * READ ONLY, DRY RUN, COUNTS ONLY. It runs countDocuments() and aggregate() and prints numbers. No
 * names, emails, wallets or ids leave the database, and there is no --apply. Use a database user
 * with the `read` role anyway.
 *
 *   MONGODB_URI=<read-only connection string> node scripts/audit-staking.js [--db <name>]
 *
 * Before the hotfix `GET /cat/stake-reward/:id` read the cat, never cleared its stake, and
 * `$unset` `staked` on the USER, so one finished stake of any cat could be claimed again and again.
 * Staking is the only writer of `monthTailsCrafted`, so a user whose `monthTailsCrafted` exceeds
 * what their own cats could honestly earn this month is flagged. The bound is generous: every owned
 * cat claimed MAX_CLAIMS_PER_MONTH times at the old reward (src/cat/cat-staking.service.ts).
 *
 * No clawback (decision #35): flagged accounts are to be kept off boards, not debited. This script
 * only counts them.
 */
const { MongoClient } = require('mongodb');

// A cat can finish at most five week-long stakes in a 31-day month.
const MAX_CLAIMS_PER_MONTH = 5;

// Mirrors getTailsCraft in src/cat/cat-staking.service.ts.
const REWARD_BY_TIER = { COMMON: 100, RARE: 500, EPIC: 2000, LEGENDARY: 10000 };
const REWARD_WITHOUT_BLESSING = 10;

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

/** Aggregation stage computing one cat's old stake reward from `$blessing` and `$tier`. */
function rewardExpression(prefix = '$') {
    return {
        $cond: [
            { $ifNull: [`${prefix}blessing`, false] },
            {
                $switch: {
                    branches: Object.entries(REWARD_BY_TIER).map(([tier, tails]) => ({
                        case: { $eq: [`${prefix}tier`, tier] },
                        then: tails,
                    })),
                    default: REWARD_WITHOUT_BLESSING,
                },
            },
            REWARD_WITHOUT_BLESSING,
        ],
    };
}

/**
 * Over `cats`: users whose crafted Tails this month exceed their own cats' honest maximum.
 *
 * One scan of `cats` grouped by owner (only `owner`, `blessing` and `tier` are read), unioned with
 * one scan of the crafting users, then grouped again by user id. There is no per-user `$lookup`
 * (`cats` has no `{owner: 1}` index, so a join would scan `cats` once per user) and no whole cat
 * document is loaded (so no 16MB risk from `resqueStory`). Users with crafted Tails and no cats get
 * an honest maximum of 0. Needs MongoDB 4.4+ (`$unionWith`); run with `allowDiskUse`.
 */
function overCraftedPipeline() {
    return [
        { $match: { owner: { $exists: true, $ne: null } } },
        { $project: { _id: 0, owner: 1, reward: rewardExpression() } },
        { $group: { _id: '$owner', honestPerClaim: { $sum: '$reward' } } },
        {
            $unionWith: {
                coll: 'users',
                pipeline: [
                    { $match: { monthTailsCrafted: { $gt: 0 } } },
                    { $project: { _id: 1, crafted: '$monthTailsCrafted' } },
                ],
            },
        },
        {
            $group: {
                _id: '$_id',
                honestPerClaim: { $sum: { $ifNull: ['$honestPerClaim', 0] } },
                crafted: { $sum: { $ifNull: ['$crafted', 0] } },
            },
        },
        { $match: { crafted: { $gt: 0 } } },
        {
            $project: {
                _id: 0,
                crafted: 1,
                honestMax: { $multiply: ['$honestPerClaim', MAX_CLAIMS_PER_MONTH] },
            },
        },
        { $match: { $expr: { $gt: ['$crafted', '$honestMax'] } } },
        {
            $group: {
                _id: null,
                flaggedUsers: { $sum: 1 },
                excessTails: { $sum: { $subtract: ['$crafted', '$honestMax'] } },
                maxExcessTails: { $max: { $subtract: ['$crafted', '$honestMax'] } },
            },
        },
    ];
}

function summarize({ staked, claimable, stakedWithoutOwner, usersWithStakedField, craftingUsers, overCrafted }) {
    const row = overCrafted[0] || {};
    return {
        catsStaked: staked,
        catsClaimableNow: claimable,
        catsStakedWithoutOwner: stakedWithoutOwner,
        usersWithLegacyStakedField: usersWithStakedField,
        usersWithCraftedTailsThisMonth: craftingUsers,
        usersFlaggedOverHonestMax: row.flaggedUsers || 0,
        excessCraftedTails: row.excessTails || 0,
        maxExcessCraftedTailsForOneUser: row.maxExcessTails || 0,
    };
}

async function audit(db, now = new Date()) {
    const cats = db.collection('cats');
    const users = db.collection('users');
    const stakedFilter = { staked: { $exists: true, $ne: null } };
    const [staked, claimable, stakedWithoutOwner, usersWithStakedField, craftingUsers, overCrafted] = await Promise.all(
        [
            cats.countDocuments(stakedFilter),
            cats.countDocuments({ staked: { $exists: true, $ne: null, $lte: now } }),
            cats.countDocuments({ ...stakedFilter, owner: { $exists: false } }),
            users.countDocuments({ staked: { $exists: true } }),
            users.countDocuments({ monthTailsCrafted: { $gt: 0 } }),
            cats.aggregate(overCraftedPipeline(), { allowDiskUse: true }).toArray(),
        ]
    );
    return summarize({ staked, claimable, stakedWithoutOwner, usersWithStakedField, craftingUsers, overCrafted });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI to a read-only connection string');
    }
    const client = await new MongoClient(uri, { readPreference: 'secondaryPreferred' }).connect();
    try {
        console.log(JSON.stringify(await audit(client.db(args.db)), null, 2));
    } finally {
        await client.close();
    }
}

module.exports = {
    MAX_CLAIMS_PER_MONTH,
    REWARD_BY_TIER,
    REWARD_WITHOUT_BLESSING,
    audit,
    overCraftedPipeline,
    parseArgs,
    rewardExpression,
    summarize,
};

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

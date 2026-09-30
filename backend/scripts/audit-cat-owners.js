#!/usr/bin/env node
/*
 * Read-only count of users whose cats would now be refused food (platform fix 6).
 *
 * READ ONLY. It runs aggregate() on the users collection and prints counts and ids. Use a database
 * user with the `read` role anyway.
 *
 *   MONGODB_URI=<read-only connection string> node scripts/audit-cat-owners.js [--db <name>] [--ids]
 *
 * PUT /cat/:id pays only when the cat's `owner` is the caller. Current creation paths always set
 * `owner`, but older cats may lack it. This lists users whose `cat` or `cats` point to a cat whose
 * owner is missing or is another user. When the count is not zero, backfill `owner` with a reviewed
 * script before relying on the check; nothing here writes.
 *
 * Output: counts, plus user and cat ids with --ids. No names, emails or wallets.
 */
const { MongoClient } = require('mongodb');

function parseArgs(argv) {
    const args = { ids: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--ids') args.ids = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

/** Aggregation over `users`: one row per (user, cat) where the cat's owner is missing or different. */
function ownerMismatchPipeline() {
    return [
        {
            $project: {
                catIds: {
                    $setUnion: [{ $ifNull: ['$cats', []] }, { $cond: [{ $ifNull: ['$cat', false] }, ['$cat'], []] }],
                },
            },
        },
        { $unwind: '$catIds' },
        {
            $lookup: {
                from: 'cats',
                localField: 'catIds',
                foreignField: '_id',
                as: 'catDoc',
            },
        },
        { $unwind: '$catDoc' },
        { $match: { $expr: { $ne: ['$catDoc.owner', '$_id'] } } },
        {
            $project: {
                _id: 0,
                user: '$_id',
                cat: '$catDoc._id',
                ownerMissing: { $eq: [{ $ifNull: ['$catDoc.owner', null] }, null] },
            },
        },
    ];
}

function summarize(rows) {
    const users = new Set(rows.map(row => String(row.user)));
    return {
        mismatchedCats: rows.length,
        usersAffected: users.size,
        ownerMissing: rows.filter(row => row.ownerMissing).length,
        ownedByAnotherUser: rows.filter(row => !row.ownerMissing).length,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI to a read-only connection string');
    }
    const client = await new MongoClient(uri, { readPreference: 'secondaryPreferred' }).connect();
    try {
        const rows = await client.db(args.db).collection('users').aggregate(ownerMismatchPipeline()).toArray();
        console.log(JSON.stringify(summarize(rows), null, 2));
        if (args.ids) {
            for (const row of rows)
                console.log(`  user ${row.user} cat ${row.cat}${row.ownerMissing ? ' (no owner)' : ''}`);
        }
    } finally {
        await client.close();
    }
}

module.exports = { ownerMismatchPipeline, summarize, parseArgs };

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

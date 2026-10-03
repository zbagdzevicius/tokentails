#!/usr/bin/env node
/*
 * Backfill of `tailsEarned` (plan G5 "Ledger split", decision #34). An explicit, single exception to
 * "no data migration": the founder runs it by hand, after review. Never run it from CI or a deploy.
 *
 * Since the ledger split every Tails credit moves `tails` and `tailsEarned` together
 * (src/user/tails-ledger.ts). Legacy documents have no `tailsEarned`, or only the part earned since
 * the deploy. Until the first give to a shelter goal nothing has ever lowered `tails`, so `tails` IS
 * lifetime earned, and the backfill sets `tailsEarned = max(tailsEarned, tails)` (never lowers it,
 * so a rerun and credits that land during the run are safe).
 *
 * That equality holds only before the first pledge, so the script REFUSES (exit 1, nothing written)
 * when any pledge exists: a document in any collection whose name contains "pledge", or a user with
 * `tailsGiven` or `goalsHelped` above 0. It checks again right before writing.
 *
 * DRY RUN BY DEFAULT. Prints counts only: no names, emails or ids.
 *
 *   MONGODB_URI=... node scripts/backfill-tails-earned.js            # dry run
 *   MONGODB_URI=... node scripts/backfill-tails-earned.js --apply    # write
 *
 * Options:
 *   --db <name>   Database name when MONGODB_URI does not include one.
 *   --apply       Write `tailsEarned`.
 *
 * After a successful --apply, set TAILS_EARNED_BACKFILL_DONE=true on the backend: the earned-Tails
 * board then sorts on `tailsEarned` (index `board_tails_earned`) instead of `tails`. Do it BEFORE the
 * Rescue Goals pledge route opens (docs/plans/alignment-log/4e.md, manual steps).
 */
const { MongoClient } = require('mongodb');

function parseArgs(argv) {
    const args = { apply: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

class PledgesExistError extends Error {
    constructor(found) {
        super(
            `Refusing: pledges exist (${found.join('; ')}). tailsEarned = tails is exact only before the ` +
                'first pledge; compute it from the pledge ledger instead.'
        );
        this.name = 'PledgesExistError';
        this.found = found;
    }
}

/** Every sign that a give already happened, as human-readable counts. Empty means none. */
async function pledgeEvidence(db) {
    const found = [];
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
        if (!/pledge/i.test(name)) continue;
        const count = await db.collection(name).countDocuments({}, { limit: 1 });
        if (count > 0) found.push(`collection ${name} is not empty`);
    }
    const givers = await db
        .collection('users')
        .countDocuments({ $or: [{ tailsGiven: { $gt: 0 } }, { goalsHelped: { $gt: 0 } }] });
    if (givers > 0) found.push(`${givers} user(s) with tailsGiven or goalsHelped above 0`);
    return found;
}

/** Documents whose `tailsEarned` is missing or below `tails`, i.e. the ones --apply changes. */
const NEEDS_BACKFILL = {
    $expr: { $lt: [{ $ifNull: ['$tailsEarned', 0] }, { $ifNull: ['$tails', 0] }] },
};

const BACKFILL_UPDATE = [
    {
        $set: {
            tailsEarned: { $max: [{ $ifNull: ['$tailsEarned', 0] }, { $ifNull: ['$tails', 0] }] },
        },
    },
];

async function backfill(db, { apply = false } = {}, log = console.log) {
    const users = db.collection('users');
    const report = {
        users: 0,
        withoutTailsEarned: 0,
        partialTailsEarned: 0,
        needsBackfill: 0,
        tailsTotal: 0,
        tailsEarnedTotalBefore: 0,
        applied: 0,
        refused: false,
    };

    const evidence = await pledgeEvidence(db);
    if (evidence.length) {
        report.refused = true;
        throw new PledgesExistError(evidence);
    }

    const [total, without, needs, sums] = await Promise.all([
        users.countDocuments({}),
        users.countDocuments({ tailsEarned: { $exists: false } }),
        users.countDocuments(NEEDS_BACKFILL),
        users
            .aggregate([
                {
                    $group: {
                        _id: null,
                        tails: { $sum: { $ifNull: ['$tails', 0] } },
                        tailsEarned: { $sum: { $ifNull: ['$tailsEarned', 0] } },
                    },
                },
            ])
            .toArray(),
    ]);
    report.users = total;
    report.withoutTailsEarned = without;
    report.needsBackfill = needs;
    report.partialTailsEarned = Math.max(0, needs - without);
    report.tailsTotal = sums[0]?.tails || 0;
    report.tailsEarnedTotalBefore = sums[0]?.tailsEarned || 0;

    log(`Users: ${report.users}`);
    log(`Without tailsEarned: ${report.withoutTailsEarned}; with a partial tailsEarned: ${report.partialTailsEarned}`);
    log(`To write: ${report.needsBackfill}`);
    log(`Sum of tails: ${report.tailsTotal}; sum of tailsEarned now: ${report.tailsEarnedTotalBefore}`);
    log('No pledges found: tails equals lifetime earned for every user.');
    if (!apply) {
        log('Dry run: nothing written. Re-run with --apply to write.');
        return report;
    }

    // A pledge could have landed since the first check.
    const late = await pledgeEvidence(db);
    if (late.length) {
        report.refused = true;
        throw new PledgesExistError(late);
    }
    const result = await users.updateMany(NEEDS_BACKFILL, BACKFILL_UPDATE);
    report.applied = result.modifiedCount || 0;
    log(`Applied: ${report.applied}. Now set TAILS_EARNED_BACKFILL_DONE=true on the backend.`);
    return report;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        await backfill(client.db(args.db), args);
    } finally {
        await client.close();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

module.exports = { parseArgs, pledgeEvidence, backfill, PledgesExistError, NEEDS_BACKFILL, BACKFILL_UPDATE };

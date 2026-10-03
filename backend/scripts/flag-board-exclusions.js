#!/usr/bin/env node
/*
 * Keeps flagged staking abusers off every board (plan G5, decision #35: "no clawback, but exclude
 * flagged accounts from leaderboards"). Added by task 4e next to 1b's read-only audit, whose rule it
 * reuses unchanged: a user whose `monthTailsCrafted` exceeds five claims of every cat they own at
 * the OLD reward (`overCraftedPipeline` in scripts/audit-staking.js) is flagged.
 *
 * It sets `boardExcludedAt` and `boardExcludedReason: 'staking-abuse'` and nothing else: Tails,
 * cats and history stay. Every board and position filters on `boardExcludedAt` (src/user/boards.ts).
 *
 * DRY RUN BY DEFAULT. Prints counts only: no names, emails or ids.
 *
 *   MONGODB_URI=... node scripts/flag-board-exclusions.js            # dry run (counts)
 *   MONGODB_URI=... node scripts/flag-board-exclusions.js --apply    # write the flags
 *
 * TIMING: the evidence is `monthTailsCrafted`, which the codex reset zeroes at 23:00 UTC on the 8th.
 * Run it (after review) before the next reset, or that month's evidence is gone.
 *
 * To lift a flag by hand: `$unset: { boardExcludedAt: 1, boardExcludedReason: 1 }` on that user.
 */
const { MongoClient } = require('mongodb');
const { overCraftedPipeline, rewardExpression } = require('./audit-staking');

const REASON = 'staking-abuse';

// The flat cat nap reward (shared/copy.ts CAT_NAP_TAILS). Once it is live a nap pays 50 even for a
// cat whose old reward was 10, so each cat's honest per-claim maximum is the larger of the two:
// a month that mixes old claims and naps is never over-flagged.
const CAT_NAP_TAILS = 50;

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

/**
 * The audit's pipeline, ending in one row per flagged user id instead of the summary row. Fails
 * loudly if the audit pipeline changes shape, rather than flagging the wrong set.
 */
function flaggedUsersPipeline() {
    const stages = overCraftedPipeline();
    const last = stages[stages.length - 1];
    if (!last.$group || last.$group._id !== null) {
        throw new Error('audit-staking.js changed: expected a final summary $group');
    }
    const projectIndex = stages.findIndex(
        stage => stage.$project && stage.$project._id === 0 && stage.$project.honestMax
    );
    if (projectIndex < 0) {
        throw new Error('audit-staking.js changed: expected the {_id: 0, crafted, honestMax} projection');
    }
    const rewardIndex = stages.findIndex(stage => stage.$project && stage.$project.reward);
    if (rewardIndex !== 1 || JSON.stringify(stages[1].$project.reward) !== JSON.stringify(rewardExpression())) {
        throw new Error('audit-staking.js changed: expected the per-cat reward projection second');
    }
    const body = stages.slice(0, -1);
    body[rewardIndex] = {
        $project: { ...stages[rewardIndex].$project, reward: { $max: [rewardExpression(), CAT_NAP_TAILS] } },
    };
    body[projectIndex] = { $project: { _id: 1, crafted: 1, honestMax: stages[projectIndex].$project.honestMax } };
    return [...body, { $project: { _id: 1 } }];
}

async function flagBoardExclusions(db, { apply = false } = {}, now = new Date(), log = console.log) {
    const users = db.collection('users');
    const rows = await db.collection('cats').aggregate(flaggedUsersPipeline(), { allowDiskUse: true }).toArray();
    const ids = rows.map(row => row._id).filter(Boolean);
    const alreadyFlagged = ids.length
        ? await users.countDocuments({ _id: { $in: ids }, boardExcludedAt: { $exists: true } })
        : 0;
    const report = { flagged: ids.length, alreadyFlagged, applied: 0 };

    log(`Users over the honest staking maximum: ${report.flagged}; already off the boards: ${alreadyFlagged}`);
    if (!apply) {
        log('Dry run: nothing written. Re-run with --apply to keep them off the boards.');
        return report;
    }
    if (ids.length) {
        const result = await users.updateMany(
            { _id: { $in: ids }, boardExcludedAt: { $exists: false } },
            { $set: { boardExcludedAt: now, boardExcludedReason: REASON } }
        );
        report.applied = result.modifiedCount || 0;
    }
    log(`Flagged now: ${report.applied}`);
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
        await flagBoardExclusions(client.db(args.db), args);
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

module.exports = { REASON, CAT_NAP_TAILS, parseArgs, flaggedUsersPipeline, flagBoardExclusions };

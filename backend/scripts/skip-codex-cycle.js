#!/usr/bin/env node
/*
 * Marks one codex reset period as already done, so the new monthly job (23:00 UTC on the 8th,
 * src/user/codex-reset.ts) skips it.
 *
 * Use it only when the OLD daily/monthly cron already paid guards and wiped the monthly counters
 * for this cycle, i.e. the backend with the new codex job was deployed after 2026-10-01 00:00
 * server time. Without it the new job pays guards again and wipes the Oct 1-8 counters at
 * 2026-10-08T23:00Z. Run it before that instant.
 *
 * DRY RUN BY DEFAULT. Without --apply it only reads the jobruns document and prints the change.
 *
 *   MONGODB_URI=... node scripts/skip-codex-cycle.js --period 2026-10            # report only
 *   MONGODB_URI=... node scripts/skip-codex-cycle.js --period 2026-10 --apply    # write
 *
 * Options:
 *   --period <YYYY-MM>  The codex phase to skip (the month whose 9th starts the new phase).
 *   --db <name>         Database name when MONGODB_URI does not include one.
 *   --apply             Write the change.
 */
const { MongoClient } = require('mongodb');

// Mirrors CODEX_RESET_JOB_NAME and JOB_RUNS_COLLECTION in src/user/codex-reset.ts.
const JOB_NAME = 'codex-reset';
const COLLECTION = 'jobruns';

function parseArgs(argv) {
    const args = { apply: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--period') args.period = argv[++i];
        else if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.period || '')) {
        throw new Error('--period YYYY-MM is required');
    }
    return args;
}

/**
 * The update that makes runCodexReset skip `period`, or a reason not to write. `existing` is the
 * current jobruns document for the job, or null.
 */
function planSkip(existing, period, now = new Date()) {
    if (existing && existing.period === period) {
        return { skip: `period ${period} is already taken (status ${existing.status}); nothing to do` };
    }
    if (existing && existing.status && !['done', 'payout-failed'].includes(existing.status)) {
        return { skip: `job is in status "${existing.status}" for ${existing.period}; check it before skipping` };
    }
    return {
        filter: { _id: JOB_NAME },
        update: {
            $set: {
                period,
                status: 'done',
                skippedAt: now,
                skipReason: 'old cron already paid and reset this cycle',
            },
        },
        options: { upsert: true },
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        const collection = client.db(args.db).collection(COLLECTION);
        const existing = await collection.findOne({ _id: JOB_NAME });
        console.log(`Current ${COLLECTION} document: ${JSON.stringify(existing)}`);
        const plan = planSkip(existing, args.period);
        if (plan.skip) {
            console.log(plan.skip);
            return;
        }
        console.log(`Change: ${JSON.stringify(plan.update)}`);
        if (!args.apply) {
            console.log('Dry run: nothing written. Re-run with --apply to write.');
            return;
        }
        await collection.updateOne(plan.filter, plan.update, plan.options);
        console.log(`Period ${args.period} marked done; the codex job will skip it.`);
    } finally {
        await client.close();
    }
}

module.exports = { parseArgs, planSkip, JOB_NAME };

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

#!/usr/bin/env node
/*
 * Rescue Goals ledger audit (plan G5 "Rescue Goals", F8). READ ONLY: it never writes.
 *
 * Checks that every goal, give, daily reservation and user hold agree with each other, the way the
 * saga in src/rescue-goal/rescue-goal-pledge.service.ts leaves them once the sweeper has run:
 *
 *   - a goal's `raisedTails` equals the sum of its CONFIRMED gives plus the PENDING ones it already
 *     counted (`pendingTakes`), and its `pledgeCount` the number of those gives
 *   - no goal is overfilled, every FILLED goal reached its target, every OPEN goal is below it
 *   - every OPEN, FILLED or DELIVERED goal has its money marked set aside (decision #37)
 *   - no PENDING give is older than 10 minutes (the sweeper settles them within about 3)
 *   - no final give is still unsettled after 10 minutes
 *   - no daily reservation is above PLEDGE_DAILY_CAP (decision #44: 5,000 a day)
 *   - no user still holds a give that is final (`pledgeHolds`)
 *
 * Prints counts and goal ids only: no names, emails or user ids. Exit code 1 when a check fails,
 * so it can run as a scheduled monitor.
 *
 *   MONGODB_URI=... node scripts/rescue-goal-audit.js
 *   MONGODB_URI=... node scripts/rescue-goal-audit.js --db tokentails --json
 *
 * Collection names and the cap mirror src/rescue-goal/rescue-goal.constants.ts and
 * src/shared-contracts/caps.ts; the spec src/rescue-goal/rescue-goal-audit.spec.ts keeps them equal.
 */
const { MongoClient } = require('mongodb');

const COLLECTIONS = {
    goals: 'rescuegoals',
    pledges: 'rescuegoalpledges',
    days: 'rescuegoalpledgedays',
    users: 'users',
};
const PLEDGE_DAILY_CAP = 5000;
const STUCK_MS = 10 * 60 * 1000;
const FINAL = ['CONFIRMED', 'REFUNDED', 'REJECTED'];
const FUNDED_STATUSES = ['OPEN', 'FILLED', 'DELIVERED'];

function parseArgs(argv) {
    const args = { json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--json') args.json = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
const ids = list => (Array.isArray(list) ? list.map(String) : []);

async function audit(db, now = new Date()) {
    const goals = db.collection(COLLECTIONS.goals);
    const pledges = db.collection(COLLECTIONS.pledges);
    const days = db.collection(COLLECTIONS.days);
    const users = db.collection(COLLECTIONS.users);
    const stuckBefore = new Date(now.getTime() - STUCK_MS);

    const report = {
        goals: { total: 0, byStatus: {} },
        pledges: { total: 0, byStatus: {} },
        problems: [],
    };

    const goalRows = await goals
        .find(
            {},
            { projection: { status: 1, raisedTails: 1, targetTails: 1, pledgeCount: 1, pendingTakes: 1, funding: 1 } }
        )
        .toArray();
    report.goals.total = goalRows.length;

    const sums = await pledges
        .aggregate([
            { $group: { _id: { goal: '$goal', status: '$status' }, tails: { $sum: '$amount' }, count: { $sum: 1 } } },
        ])
        .toArray();
    const byGoal = new Map();
    for (const row of sums) {
        const goal = String(row._id.goal);
        const status = row._id.status;
        report.pledges.total += row.count;
        report.pledges.byStatus[status] = (report.pledges.byStatus[status] || 0) + row.count;
        if (!byGoal.has(goal)) byGoal.set(goal, {});
        byGoal.get(goal)[status] = { tails: num(row.tails), count: num(row.count) };
    }

    for (const goal of goalRows) {
        const id = String(goal._id);
        report.goals.byStatus[goal.status] = (report.goals.byStatus[goal.status] || 0) + 1;
        const raised = num(goal.raisedTails);
        const target = num(goal.targetTails);
        const counted = byGoal.get(id) || {};
        const pendingTakes = ids(goal.pendingTakes);
        let pendingTails = 0;
        if (pendingTakes.length) {
            const rows = await pledges
                .find({ _id: { $in: goal.pendingTakes }, status: 'PENDING' }, { projection: { amount: 1 } })
                .toArray();
            pendingTails = rows.reduce((sum, row) => sum + num(row.amount), 0);
        }
        // A cancelled goal keeps `raisedTails` as history while its gives turn REFUNDED.
        if (goal.status !== 'CANCELLED') {
            const expected = num(counted.CONFIRMED && counted.CONFIRMED.tails) + pendingTails;
            if (raised !== expected) {
                report.problems.push(
                    `goal ${id}: raisedTails ${raised} but confirmed + counted gives sum to ${expected}`
                );
            }
            const expectedCount = num(counted.CONFIRMED && counted.CONFIRMED.count) + pendingTakes.length;
            if (num(goal.pledgeCount) !== expectedCount) {
                report.problems.push(
                    `goal ${id}: pledgeCount ${num(goal.pledgeCount)} but ${expectedCount} gives counted`
                );
            }
        }
        if (raised > target) {
            report.problems.push(`goal ${id}: overfilled (${raised} of ${target})`);
        }
        if (goal.status === 'FILLED' && raised < target) {
            report.problems.push(`goal ${id}: FILLED at ${raised} of ${target}`);
        }
        if (goal.status === 'OPEN' && raised >= target) {
            report.problems.push(`goal ${id}: still OPEN at ${raised} of ${target}`);
        }
        if (FUNDED_STATUSES.includes(goal.status) && !(goal.funding && goal.funding.setAside === true)) {
            report.problems.push(`goal ${id}: ${goal.status} without money set aside`);
        }
    }

    const [stuck, unsettled, overCap, staleHolders] = await Promise.all([
        pledges.countDocuments({ status: 'PENDING', createdAt: { $lt: stuckBefore } }),
        pledges.countDocuments({ status: { $in: FINAL }, settled: false, updatedAt: { $lt: stuckBefore } }),
        days.countDocuments({ reserved: { $gt: PLEDGE_DAILY_CAP } }),
        countStaleHolders(users, pledges),
    ]);
    if (stuck) report.problems.push(`${stuck} give(s) PENDING for more than 10 minutes (is the sweeper running?)`);
    if (unsettled) report.problems.push(`${unsettled} final give(s) still unsettled after 10 minutes`);
    if (overCap) report.problems.push(`${overCap} daily reservation(s) above ${PLEDGE_DAILY_CAP}`);
    if (staleHolders) report.problems.push(`${staleHolders} user(s) still hold a give that is final`);
    report.ok = report.problems.length === 0;
    return report;
}

/** Users whose `pledgeHolds` names a give that is no longer PENDING (and was settled). */
async function countStaleHolders(users, pledges) {
    const holders = await users
        .find({ 'pledgeHolds.0': { $exists: true } }, { projection: { pledgeHolds: 1 } })
        .toArray();
    let stale = 0;
    for (const user of holders) {
        const final = await pledges.countDocuments({
            _id: { $in: user.pledgeHolds },
            status: { $in: FINAL },
            settled: true,
        });
        if (final) stale++;
    }
    return stale;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        const report = await audit(client.db(args.db));
        if (args.json) {
            console.log(JSON.stringify(report, null, 2));
        } else {
            console.log(`Goals: ${report.goals.total} ${JSON.stringify(report.goals.byStatus)}`);
            console.log(`Gives: ${report.pledges.total} ${JSON.stringify(report.pledges.byStatus)}`);
            console.log(report.ok ? 'OK: the ledger is consistent.' : `PROBLEMS (${report.problems.length}):`);
            report.problems.forEach(problem => console.log(`  - ${problem}`));
        }
        if (!report.ok) process.exitCode = 1;
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

module.exports = { parseArgs, audit, COLLECTIONS, PLEDGE_DAILY_CAP, STUCK_MS };

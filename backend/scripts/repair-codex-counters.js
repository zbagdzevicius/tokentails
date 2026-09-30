#!/usr/bin/env node
/*
 * Recompute the current codex phase's monthly counters from stored history.
 *
 * DRY RUN BY DEFAULT. Without --apply it only reads and prints a report.
 *
 *   MONGODB_URI=... node scripts/repair-codex-counters.js            # report only
 *   MONGODB_URI=... node scripts/repair-codex-counters.js --apply    # raise counters that are too low
 *   MONGODB_URI=... node scripts/repair-codex-counters.js --apply --allow-lower
 *
 * Options:
 *   --db <name>       Database name when MONGODB_URI does not include one.
 *   --now <iso>       Pretend it is this instant (to pick another phase window).
 *   --apply           Write the changes.
 *   --allow-lower     With --apply, also lower counters that exceed the recomputed value.
 *
 * Window. A phase runs from 23:00 UTC on the 8th (the reset instant of src/user/codex-reset.ts,
 * one hour before the 00:00 UTC anchor on the 9th) to the same instant next month.
 *
 * What the data allows. Game rows (POST /user/catbassadors/live) never touch a month* counter, so
 * Game history cannot rebuild any of them. The only month* counters with a timestamped ledger are
 * the purchase counters, rebuilt from COMPLETE orders whose updatedAt is inside the window:
 *   monthPortraitPurchases = orders with entityType IMAGE
 *   monthPacks             = orders with any other entityType (all of them grant a pack cat)
 * Limits of that formula:
 *   - updatedAt is the completion time for every flow, but any later write to the order moves it.
 *   - Admin pack grants (GET /web3/pack/:packType/:id) bump monthPacks without an order, so the
 *     recomputed monthPacks can be lower than the true value. That is why lowering is opt-in.
 * No ledger exists for monthTails, monthBoxes, monthFeeded, monthStreak, monthReferrals or
 * monthTailsCrafted. They are reported, never changed.
 *
 * Before this fix the reset ran at 00:00 server time on the 1st, not at the phase boundary, so
 * during most of a phase the counters also hold activity from the last days of the previous phase
 * (the 1st to the 8th). The report shows how many users have a monthStreak longer than the window.
 */
const { MongoClient } = require('mongodb');

const ANCHOR_DAY = 9;
const RESET_LEAD_MS = 60 * 60 * 1000;
const UNRECOVERABLE = ['monthTails', 'monthBoxes', 'monthFeeded', 'monthStreak', 'monthReferrals', 'monthTailsCrafted'];

// Mirrors currentCodexPeriodStart in src/user/codex-reset.ts.
function currentPeriodStart(now) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    let start = new Date(Date.UTC(year, month, ANCHOR_DAY) - RESET_LEAD_MS);
    if (start.getTime() > now.getTime()) {
        start = new Date(Date.UTC(year, month - 1, ANCHOR_DAY) - RESET_LEAD_MS);
    }
    return start;
}

function recomputeFromOrders(orders) {
    const byUser = new Map();
    for (const order of orders) {
        if (!order.user) {
            continue;
        }
        const key = order.user.toString();
        const counts = byUser.get(key) || { user: order.user, monthPacks: 0, monthPortraitPurchases: 0 };
        if (order.entityType === 'IMAGE') {
            counts.monthPortraitPurchases += 1;
        } else {
            counts.monthPacks += 1;
        }
        byUser.set(key, counts);
    }
    return byUser;
}

// users: [{ _id, monthPacks, monthPortraitPurchases }] for every user with a non-zero counter or an
// order in the window. Returns the per-user changes; raise-only unless allowLower.
function buildRepairPlan(users, recomputed, { allowLower = false } = {}) {
    const plan = [];
    for (const user of users) {
        const target = recomputed.get(user._id.toString()) || { monthPacks: 0, monthPortraitPurchases: 0 };
        const set = {};
        for (const field of ['monthPacks', 'monthPortraitPurchases']) {
            const current = user[field] || 0;
            if (target[field] > current || (allowLower && target[field] < current)) {
                set[field] = target[field];
            }
        }
        if (Object.keys(set).length) {
            plan.push({
                _id: user._id,
                before: { monthPacks: user.monthPacks || 0, monthPortraitPurchases: user.monthPortraitPurchases || 0 },
                set,
            });
        }
    }
    return plan;
}

// Raises use $max so an increment that lands between the read and the write is not lost.
function toUpdate(entry) {
    const update = {};
    for (const [field, value] of Object.entries(entry.set)) {
        const operator = value > entry.before[field] ? '$max' : '$set';
        update[operator] = { ...(update[operator] || {}), [field]: value };
    }
    return update;
}

function parseArgs(argv) {
    const args = { apply: false, allowLower: false, db: undefined, now: new Date() };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--apply') args.apply = true;
        else if (arg === '--allow-lower') args.allowLower = true;
        else if (arg === '--db') args.db = argv[++i];
        else if (arg === '--now') args.now = new Date(argv[++i]);
        else throw new Error(`Unknown argument ${arg}`);
    }
    if (Number.isNaN(args.now.getTime())) {
        throw new Error('--now is not a valid date');
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!process.env.MONGODB_URI) {
        throw new Error('Set MONGODB_URI');
    }
    const start = currentPeriodStart(args.now);
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    try {
        const db = client.db(args.db);
        console.log(`Database: ${db.databaseName}`);
        console.log(
            `Mode: ${args.apply ? `APPLY (${args.allowLower ? 'raise and lower' : 'raise only'})` : 'dry run'}`
        );
        console.log(`Window: ${start.toISOString()} to ${args.now.toISOString()}`);

        const orders = await db
            .collection('orders')
            .find({ status: 'COMPLETE', user: { $exists: true }, updatedAt: { $gte: start, $lte: args.now } })
            .project({ user: 1, entityType: 1 })
            .toArray();
        const recomputed = recomputeFromOrders(orders);
        console.log(`COMPLETE orders in window: ${orders.length} across ${recomputed.size} users`);

        const orderUserIds = [...recomputed.values()].map(counts => counts.user);
        const users = await db
            .collection('users')
            .find({
                $or: [
                    { monthPacks: { $gt: 0 } },
                    { monthPortraitPurchases: { $gt: 0 } },
                    { _id: { $in: orderUserIds } },
                ],
            })
            .project({ monthPacks: 1, monthPortraitPurchases: 1 })
            .toArray();

        const plan = buildRepairPlan(users, recomputed, { allowLower: args.allowLower });
        const raises = plan.filter(p => Object.entries(p.set).some(([k, v]) => v > p.before[k])).length;
        console.log(`Users to change: ${plan.length} (${raises} with a raise)`);
        const lowerCandidates = buildRepairPlan(users, recomputed, { allowLower: true }).length - plan.length;
        if (!args.allowLower && lowerCandidates > 0) {
            console.log(`Users above the recomputed value (not lowered without --allow-lower): ${lowerCandidates}`);
        }
        for (const entry of plan.slice(0, 50)) {
            console.log(`  ${entry._id} ${JSON.stringify(entry.before)} -> ${JSON.stringify(entry.set)}`);
        }
        if (plan.length > 50) {
            console.log(`  ... ${plan.length - 50} more`);
        }

        const windowDays = Math.ceil((args.now.getTime() - start.getTime()) / 86400000);
        const longStreaks = await db.collection('users').countDocuments({ monthStreak: { $gt: windowDays } });
        console.log(`Users with monthStreak above the ${windowDays} days in the window: ${longStreaks}`);
        console.log(`Not recomputable (no ledger), left unchanged: ${UNRECOVERABLE.join(', ')}`);

        if (!args.apply) {
            console.log('Dry run: nothing written. Re-run with --apply to write.');
            return;
        }
        if (plan.length) {
            const result = await db
                .collection('users')
                .bulkWrite(plan.map(entry => ({ updateOne: { filter: { _id: entry._id }, update: toUpdate(entry) } })));
            console.log(`Updated ${result.modifiedCount} users`);
        }
    } finally {
        await client.close();
    }
}

module.exports = { currentPeriodStart, recomputeFromOrders, buildRepairPlan, toUpdate, parseArgs };

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

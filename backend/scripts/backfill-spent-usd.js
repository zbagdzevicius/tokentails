#!/usr/bin/env node
/*
 * Legacy estimate of `spentUsd` (plan G4 "Spend").
 *
 * Since the G4 fix, `spentUsd` is written only at verified USD payment sites (src/web3/spend.ts).
 * Purchases from before that deploy are estimated here from COMPLETE orders created AND last
 * updated before `--cutoff` (the deploy instant). An order created before the cutoff but confirmed
 * after it was counted live by the verified write, so it is skipped and reported (an older order
 * merely edited after the cutoff is skipped too: the estimate errs low, never double):
 *   - `priceUsd` when the order has it (Stellar verification and Stripe write it);
 *   - else `price` when the order currency is USD, USDC or USDT;
 *   - else (an XLM order without priceUsd) the order is NOT counted, and reported as unpriced.
 * The legacy `spent` field is never used: the +1 grant increments inflated it.
 *
 * Each user gets the estimate in its own field, `spentUsdLegacy`, once (`spentUsdLegacyAt` is the
 * guard), so the script can run again safely. `spentUsd` is never touched: it stays verified-only
 * (3c review), so a user with both a legacy estimate and live purchases keeps the two apart. The
 * leaderboard adds `spentUsd + spentUsdLegacy` and can label the estimated part; impact and receipts
 * read `spentUsd` only.
 *
 * DRY RUN BY DEFAULT. Prints counts and the total estimate only: no names, emails or ids.
 *
 *   MONGODB_URI=... node scripts/backfill-spent-usd.js --cutoff 2026-10-05T00:00:00Z
 *   MONGODB_URI=... node scripts/backfill-spent-usd.js --cutoff 2026-10-05T00:00:00Z --apply
 *
 * Options:
 *   --cutoff <date>   Required. Orders created before it are legacy.
 *   --db <name>       Database name when MONGODB_URI does not include one.
 *   --apply           Write the estimates.
 */
const { MongoClient } = require('mongodb');

const USD_LIKE = ['USD', 'USDC', 'USDT'];

function parseArgs(argv) {
    const args = { apply: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else if (arg === '--cutoff') args.cutoff = new Date(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    if (!args.cutoff || Number.isNaN(args.cutoff.getTime())) {
        throw new Error('--cutoff <date> is required: the instant the verified spentUsd writes were deployed');
    }
    return args;
}

/** USD value of one legacy order, or null when it cannot be priced in USD. */
function orderUsd(order) {
    if (typeof order.priceUsd === 'number' && Number.isFinite(order.priceUsd) && order.priceUsd > 0) {
        return order.priceUsd;
    }
    if (USD_LIKE.includes(String(order.currencyType || '').toUpperCase())) {
        const price = Number(order.price);
        return Number.isFinite(price) && price > 0 ? price : 0;
    }
    return null;
}

const round2 = value => Math.round(value * 100) / 100;

async function backfill(db, { cutoff, apply = false }, now = new Date(), log = console.log) {
    const orders = db.collection('orders');
    const users = db.collection('users');
    const report = {
        orders: 0,
        priced: 0,
        unpriced: 0,
        updatedAfterCutoff: 0,
        users: 0,
        totalUsd: 0,
        alreadyApplied: 0,
        applied: 0,
    };
    const perUser = new Map();

    const legacy = { status: 'COMPLETE', createdAt: { $lt: cutoff }, user: { $exists: true } };
    report.updatedAfterCutoff = await orders.countDocuments({ ...legacy, updatedAt: { $gte: cutoff } });
    const cursor = orders.find(
        { ...legacy, $or: [{ updatedAt: { $lt: cutoff } }, { updatedAt: { $exists: false } }] },
        { projection: { user: 1, price: 1, priceUsd: 1, currencyType: 1 } }
    );
    for await (const order of cursor) {
        report.orders += 1;
        const usd = orderUsd(order);
        if (usd === null) {
            report.unpriced += 1;
            continue;
        }
        report.priced += 1;
        const key = String(order.user);
        perUser.set(key, { id: order.user, usd: (perUser.get(key)?.usd || 0) + usd });
    }
    for (const entry of perUser.values()) {
        if (entry.usd > 0) {
            report.users += 1;
            report.totalUsd += entry.usd;
        }
    }
    report.totalUsd = round2(report.totalUsd);

    log(`Legacy COMPLETE orders before ${cutoff.toISOString()}: ${report.orders}`);
    log(`Priced in USD: ${report.priced}; not priceable (XLM without priceUsd): ${report.unpriced}`);
    log(`Skipped, completed or updated after the cutoff (counted live): ${report.updatedAfterCutoff}`);
    log(`Users with an estimate: ${report.users}; total estimate: ${report.totalUsd} USD`);
    if (!apply) {
        log('Dry run: nothing written. Re-run with --apply to write.');
        return report;
    }
    for (const entry of perUser.values()) {
        if (!(entry.usd > 0)) continue;
        const result = await users.updateOne(
            { _id: entry.id, spentUsdLegacyAt: { $exists: false } },
            { $set: { spentUsdLegacy: round2(entry.usd), spentUsdLegacyAt: now } }
        );
        if (result.modifiedCount) report.applied += 1;
        else report.alreadyApplied += 1;
    }
    log(`Applied: ${report.applied}; already applied before: ${report.alreadyApplied}`);
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

module.exports = { parseArgs, orderUsd, backfill };

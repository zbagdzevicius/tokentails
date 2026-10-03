#!/usr/bin/env node
/*
 * Read-only audit of paid orders and their grants (plan G3 "audit scripts for orders before and
 * after"). Run it before deploying the G3 grant fixes and again after, and compare.
 *
 * READ ONLY: it only runs find() and countDocuments(). Use a database user with the `read` role.
 * Output is counts only: no ids, emails, wallets, hashes or amounts per person.
 *
 *   MONGODB_URI=... node scripts/audit-orders-grants.js
 *   MONGODB_URI=... node scripts/audit-orders-grants.js --cutoff 2026-10-05T00:00:00Z --json
 *
 * Options:
 *   --db <name>       Database name when MONGODB_URI does not include one.
 *   --cutoff <date>   Split every count into orders created before and after this instant (the
 *                     deploy of the G3 fixes). Without it there is one bucket, "all".
 *   --json            Print the report as JSON.
 *
 * Per bucket and kind (pack: PACK and LOOT_BOX; portrait: IMAGE):
 *   byStatus                 orders per status (COMPLETE, PENDING, FAILED, FAILED_GRANT, LOCKED)
 *   completeWithoutCat       pack orders marked COMPLETE with no cat: the old "COMPLETE on failure"
 *   completeCatMissing       COMPLETE pack orders whose cat no longer exists
 *   completeCatNotOwned      COMPLETE pack orders whose cat belongs to someone else (or no one)
 *   failedGrantByReason      FAILED_GRANT orders per reason (EMPTY_POOL, ADOPT_FAILED, NO_CAT)
 *   refunds                  refund states (due: someone has to send the money back; refunded)
 *   stalePending             PENDING orders older than one hour
 *
 * Once, over all cats:
 *   duplicateCopies          extra copies of one catalogue cat for one owner (same `sourceCat`).
 *                            Must be 0 for the unique `copy_per_owner_source` index to build.
 */
const { MongoClient } = require('mongodb');

const PACK_KINDS = ['PACK', 'LOOT_BOX'];
const BATCH = 1000;
const HOUR = 60 * 60 * 1000;

function parseArgs(argv) {
    const args = { json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--json') args.json = true;
        else if (arg === '--cutoff') args.cutoff = new Date(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    if (args.cutoff && Number.isNaN(args.cutoff.getTime())) {
        throw new Error('--cutoff must be a date, e.g. 2026-10-05T00:00:00Z');
    }
    return args;
}

const emptyBucket = () => ({
    pack: {
        total: 0,
        byStatus: {},
        completeWithoutCat: 0,
        completeCatMissing: 0,
        completeCatNotOwned: 0,
        failedGrantByReason: {},
        refunds: {},
        stalePending: 0,
    },
    portrait: { total: 0, byStatus: {}, refunds: {}, stalePending: 0 },
});

const bump = (record, name) => {
    record[name] = (record[name] || 0) + 1;
};

const reasonOf = failureReason =>
    String(failureReason || 'UNKNOWN')
        .split(':')[0]
        .trim() || 'UNKNOWN';

async function audit(db, { cutoff } = {}, now = new Date()) {
    const orders = db.collection('orders');
    const cats = db.collection('cats');
    const report = { cutoff: cutoff ? cutoff.toISOString() : null, buckets: {} };
    const bucketOf = order =>
        !cutoff ? 'all' : order.createdAt && new Date(order.createdAt) >= cutoff ? 'after' : 'before';

    let pendingChecks = [];
    const flush = async () => {
        if (!pendingChecks.length) return;
        const ids = pendingChecks.map(check => check.cat);
        const found = await cats.find({ _id: { $in: ids } }, { projection: { owner: 1 } }).toArray();
        const ownerOf = new Map(found.map(cat => [String(cat._id), cat.owner]));
        for (const check of pendingChecks) {
            const pack = report.buckets[check.bucket].pack;
            if (!ownerOf.has(String(check.cat))) pack.completeCatMissing += 1;
            else if (!check.user || String(ownerOf.get(String(check.cat))) !== String(check.user))
                pack.completeCatNotOwned += 1;
        }
        pendingChecks = [];
    };

    const cursor = orders.find(
        { entityType: { $in: [...PACK_KINDS, 'IMAGE'] } },
        {
            projection: {
                status: 1,
                entityType: 1,
                cat: 1,
                user: 1,
                createdAt: 1,
                failureReason: 1,
                'refund.state': 1,
            },
        }
    );
    for await (const order of cursor) {
        const bucket = bucketOf(order);
        report.buckets[bucket] = report.buckets[bucket] || emptyBucket();
        const kind = PACK_KINDS.includes(order.entityType) ? 'pack' : 'portrait';
        const stats = report.buckets[bucket][kind];
        stats.total += 1;
        bump(stats.byStatus, order.status || 'UNKNOWN');
        if (order.refund && order.refund.state) bump(stats.refunds, order.refund.state);
        if (order.status === 'PENDING' && order.createdAt && now - new Date(order.createdAt) > HOUR) {
            stats.stalePending += 1;
        }
        if (kind !== 'pack') continue;
        if (order.status === 'FAILED_GRANT') bump(stats.failedGrantByReason, reasonOf(order.failureReason));
        if (order.status === 'COMPLETE') {
            if (!order.cat) stats.completeWithoutCat += 1;
            else {
                pendingChecks.push({ bucket, cat: order.cat, user: order.user });
                if (pendingChecks.length >= BATCH) await flush();
            }
        }
    }
    await flush();

    // Copies that would stop the unique `copy_per_owner_source` index (cat.schema.ts) from building:
    // more than one cat of an owner with the same `sourceCat`. Expected 0, since `sourceCat` is new.
    const seen = new Set();
    report.duplicateCopies = 0;
    const copies = cats.find(
        { sourceCat: { $exists: true }, owner: { $exists: true } },
        { projection: { _id: 0, owner: 1, sourceCat: 1 } }
    );
    for await (const copy of copies) {
        const key = `${String(copy.owner)}:${String(copy.sourceCat)}`;
        if (seen.has(key)) report.duplicateCopies += 1;
        else seen.add(key);
    }
    return report;
}

function print(report, log = console.log) {
    log(`Order grant audit${report.cutoff ? ` (cutoff ${report.cutoff})` : ''}`);
    log(`Duplicate cat copies (same owner and sourceCat; must be 0): ${report.duplicateCopies}`);
    for (const [bucket, kinds] of Object.entries(report.buckets)) {
        log(`\n[${bucket}]`);
        for (const [kind, stats] of Object.entries(kinds)) {
            log(`  ${kind}: ${stats.total} orders`);
            for (const [name, value] of Object.entries(stats)) {
                if (name === 'total') continue;
                log(`    ${name}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
            }
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        const report = await audit(client.db(args.db), args);
        if (args.json) console.log(JSON.stringify(report, null, 2));
        else print(report);
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

module.exports = { parseArgs, audit, print };

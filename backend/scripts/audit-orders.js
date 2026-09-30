#!/usr/bin/env node
/*
 * Read-only order audit (platform fix 0, docs/plans/core-game-strategy.md section 5).
 *
 * READ ONLY. It never writes to MongoDB: it only runs find() on the orders collection, with index
 * and collection creation turned off. Use a database user with the `read` role anyway.
 *
 *   cd backend
 *   MONGODB_URI=<read-only connection string> \
 *     node -r ts-node/register -r tsconfig-paths/register scripts/audit-orders.js
 *
 * Options:
 *   --db <name>          Database name when MONGODB_URI does not include one.
 *   --skip-horizon       Only check duplicate hashes and Stripe amounts (no Horizon requests).
 *   --testnet            Read Stellar testnet Horizon instead of mainnet.
 *   --max-xlm-usd <n>    USD value per XLM used to judge XLM orders (default 1). No historical rate
 *                        is stored, so only orders underpaid even at this generous rate are flagged.
 *   --all-statuses       Check amounts on every order, not only COMPLETE ones (duplicates always
 *                        cover every order).
 *   --json               Print the report as JSON.
 *
 * Reports:
 *   1. Orders sharing a hash. These block the `hash_unique` index and may be double grants.
 *   2. Stellar orders whose transaction failed, does not pay the treasury (STELLAR_TREASURY_ADDRESS,
 *      default the public receiving account), pays another asset, or pays less than the catalogue.
 *      NOT_CANONICAL_HASH marks an order holding a fee-bump's inner hash (or a non-lowercase hash);
 *      "Same Stellar payment" lists orders whose different hash strings resolve to one payment.
 *   3. Stripe orders whose stored amount is not a catalogue price (src/payments/price-table.ts).
 * Output is counts and order ids, plus amounts. No emails, wallets, user ids or payment hashes.
 * Horizon's public API allows about 3600 requests an hour; each Stellar order costs two.
 */
const mongoose = require('mongoose');
const StellarSdk = require('@stellar/stellar-sdk');
const { OrderSchema, OrderStatus } = require('src/web3/order.schema');
const {
    AUDIT_ORDER_PROJECTION,
    auditStellarOrder,
    auditStripeOrder,
    findDuplicateHashes,
    findSameStellarPayment,
} = require('src/web3/order-audit');
const { canonicalStellarHash, getStellarTreasury, isStellarTxHash } = require('src/web3/stellar-payment');

const HORIZON_CONCURRENCY = 4;

function parseArgs(argv) {
    const args = { maxXlmUsd: 1, skipHorizon: false, testnet: false, allStatuses: false, json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--skip-horizon') args.skipHorizon = true;
        else if (arg === '--testnet') args.testnet = true;
        else if (arg === '--all-statuses') args.allStatuses = true;
        else if (arg === '--json') args.json = true;
        else if (arg === '--max-xlm-usd') args.maxXlmUsd = Number(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    if (!Number.isFinite(args.maxXlmUsd) || args.maxXlmUsd <= 0) {
        throw new Error('--max-xlm-usd must be a positive number');
    }
    return args;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadHorizon(server, hash) {
    for (let attempt = 0; ; attempt++) {
        try {
            const [transaction, operations] = await Promise.all([
                server.transactions().transaction(hash).call(),
                server.operations().forTransaction(hash).limit(200).call(),
            ]);
            return { transaction, operations: operations.records };
        } catch (error) {
            const status = error && error.response && error.response.status;
            if (status === 404 || (error && error.name === 'NotFoundError')) return null;
            if (status === 429 && attempt < 5) {
                await sleep(60000);
                continue;
            }
            throw error;
        }
    }
}

async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function group(findings) {
    const byIssue = {};
    for (const finding of findings) {
        (byIssue[finding.issue] = byIssue[finding.issue] || []).push(finding);
    }
    return byIssue;
}

function printSection(title, byIssue) {
    const issues = Object.keys(byIssue);
    console.log(`\n${title}: ${issues.reduce((n, k) => n + byIssue[k].length, 0)} finding(s)`);
    for (const issue of issues) {
        console.log(`  ${issue}: ${byIssue[issue].length}`);
        for (const f of byIssue[issue]) {
            const amounts =
                f.paid === undefined
                    ? ''
                    : ` paid=${f.paid}${f.expectedMin === undefined ? '' : ` min=${f.expectedMin}`}`;
            console.log(`    ${f.orderId}${amounts}`);
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI to a read-only connection string');
    }

    const connection = await mongoose
        .createConnection(uri, {
            dbName: args.db,
            autoIndex: false,
            autoCreate: false,
            readPreference: 'secondaryPreferred',
        })
        .asPromise();
    try {
        const Order = connection.model('Order', OrderSchema);
        const orders = await Order.find({}, AUDIT_ORDER_PROJECTION).lean();

        const duplicates = findDuplicateHashes(orders);
        const checked = args.allStatuses ? orders : orders.filter(o => o.status === OrderStatus.COMPLETE);
        const stripe = checked.map(auditStripeOrder).filter(Boolean);

        const stellarOrders = checked.filter(o => o.chainType === 'STELLAR');
        let stellar = [];
        let samePayment = [];
        if (!args.skipHorizon) {
            const server = new StellarSdk.Horizon.Server(
                args.testnet ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'
            );
            const options = { treasury: getStellarTreasury(), maxXlmUsd: args.maxXlmUsd };
            const perOrder = await mapLimited(stellarOrders, HORIZON_CONCURRENCY, async order => {
                const horizon = isStellarTxHash(order.hash) ? await loadHorizon(server, order.hash) : null;
                return {
                    findings: auditStellarOrder(order, horizon, options),
                    payment: {
                        orderId: String(order._id),
                        canonical: horizon && canonicalStellarHash(horizon.transaction),
                    },
                };
            });
            stellar = perOrder.flatMap(result => result.findings);
            samePayment = findSameStellarPayment(perOrder.map(result => result.payment));
        }

        const report = {
            ordersRead: orders.length,
            ordersChecked: checked.length,
            duplicateHashGroups: duplicates.length,
            ordersInDuplicateGroups: duplicates.reduce((n, ids) => n + ids.length, 0),
            duplicates,
            stellarOrdersChecked: args.skipHorizon ? 0 : stellarOrders.length,
            stellar: group(stellar),
            samePaymentGroups: samePayment.length,
            samePayment,
            stripeOrdersChecked: checked.filter(o => o.chainType === 'FIAT').length,
            stripe: group(stripe),
        };

        if (args.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
        }
        console.log(`Orders read: ${report.ordersRead}, amount-checked: ${report.ordersChecked}`);
        console.log(
            `\nDuplicate hashes: ${report.duplicateHashGroups} group(s), ${report.ordersInDuplicateGroups} order(s)`
        );
        for (const ids of duplicates) console.log(`  ${ids.join(', ')}`);
        if (args.skipHorizon) console.log('\nStellar: skipped (--skip-horizon)');
        else {
            printSection(`Stellar (${report.stellarOrdersChecked} checked)`, report.stellar);
            console.log(`\nSame Stellar payment under different hashes: ${report.samePaymentGroups} group(s)`);
            for (const ids of samePayment) console.log(`  ${ids.join(', ')}`);
        }
        printSection(`Stripe (${report.stripeOrdersChecked} checked)`, report.stripe);
    } finally {
        await connection.close();
    }
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});

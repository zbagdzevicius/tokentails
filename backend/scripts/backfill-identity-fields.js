#!/usr/bin/env node
/*
 * Identity field backfill (plan F5.3 step 2): `isGuest: false` on every legacy user, and every email
 * trimmed and lowercased.
 *
 * DRY RUN BY DEFAULT: without --apply it only counts. Output is counts only: no names, emails or ids.
 *
 *   MONGODB_URI=<connection string> node scripts/backfill-identity-fields.js [--db <name>]           # counts
 *   MONGODB_URI=<connection string> node scripts/backfill-identity-fields.js [--db <name>] --apply   # writes
 *
 * Run order (F5.3): audit-identity.js and audit-duplicate-users.js first. Emails whose lowercased
 * form already belongs to another doc are SKIPPED and counted (`emailCollisionsSkipped`): those are
 * the duplicates to merge by hand (decision #2) before `email_unique` can be built. Idempotent: a
 * second --apply changes nothing. After it, set IDENTITY_BACKFILL_DONE=true on the backend so board
 * queries send the strict `{isGuest: false}` their partial indexes serve.
 *
 * Also unsets empty `firebaseUids` arrays, which the partial unique index would index as one key,
 * and writes `emailCanonical` (the inbox an address delivers to: Gmail dots and +tags removed,
 * googlemail.com as gmail.com; src/user/guest/canonical-email.ts) on every doc with an email that
 * lacks it, server side in one update pipeline (2a review finding #5).
 */
const { MongoClient } = require('mongodb');

const BATCH = 500;

function parseArgs(argv) {
    const args = { apply: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else if (arg === '--dry-run') args.apply = false;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

const missingIsGuest = { isGuest: { $exists: false } };

const emailNeedsLowercase = {
    email: { $type: 'string' },
    $expr: { $ne: ['$email', { $toLower: { $trim: { input: '$email' } } }] },
};

const normalize = email => email.trim().toLowerCase();

const missingCanonical = { email: { $type: 'string' }, emailCanonical: { $exists: false } };

/**
 * Aggregation expression of src/user/guest/canonical-email.ts `canonicalEmail` (MongoDB 4.4+,
 * `$replaceAll`). identity-mongo.spec.ts checks the two agree.
 */
function canonicalEmailExpr(field = '$email') {
    return {
        $let: {
            vars: { lower: { $toLower: { $trim: { input: field } } } },
            in: {
                $let: {
                    vars: { at: { $indexOfCP: ['$$lower', '@'] } },
                    in: {
                        $let: {
                            vars: {
                                local: { $substrCP: ['$$lower', 0, '$$at'] },
                                domain: { $substrCP: ['$$lower', { $add: ['$$at', 1] }, { $strLenCP: '$$lower' }] },
                            },
                            in: {
                                $cond: [
                                    { $in: ['$$domain', ['gmail.com', 'googlemail.com']] },
                                    {
                                        $concat: [
                                            {
                                                $replaceAll: {
                                                    input: { $arrayElemAt: [{ $split: ['$$local', '+'] }, 0] },
                                                    find: '.',
                                                    replacement: '',
                                                },
                                            },
                                            '@gmail.com',
                                        ],
                                    },
                                    '$$lower',
                                ],
                            },
                        },
                    },
                },
            },
        },
    };
}

/**
 * Decides, for one batch of `{_id, email}` rows that need lowercasing, which can be written and which
 * collide. `taken(lowerEmails)` returns the lowercased emails already used by OTHER docs.
 * Two rows of the batch that lowercase to the same address collide with each other too.
 */
function planEmailBatch(rows, takenEmails) {
    const taken = new Set(takenEmails);
    const seen = new Map();
    rows.forEach(row => {
        const key = normalize(row.email);
        seen.set(key, (seen.get(key) || 0) + 1);
    });
    const writes = [];
    let collisions = 0;
    for (const row of rows) {
        const key = normalize(row.email);
        if (!key || taken.has(key) || seen.get(key) > 1) {
            collisions += 1;
            continue;
        }
        writes.push({ updateOne: { filter: { _id: row._id, email: row.email }, update: { $set: { email: key } } } });
    }
    return { writes, collisions };
}

async function backfill(db, { apply = false } = {}) {
    const users = db.collection('users');
    const result = {
        mode: apply ? 'apply' : 'dry-run',
        usersMissingIsGuest: await users.countDocuments(missingIsGuest),
        emailsToLowercase: await users.countDocuments(emailNeedsLowercase),
        emptyFirebaseUidArrays: await users.countDocuments({ firebaseUids: { $size: 0 } }),
        emailsMissingCanonical: await users.countDocuments(missingCanonical),
        isGuestWritten: 0,
        emailsLowercased: 0,
        emailCollisionsSkipped: 0,
        emptyFirebaseUidArraysUnset: 0,
        emailCanonicalWritten: 0,
    };

    // Collisions are counted in both modes, so the dry run shows what --apply will skip.
    const cursor = users.find(emailNeedsLowercase, { projection: { _id: 1, email: 1 } }).batchSize(BATCH);
    // Addresses planned by earlier batches count as taken, so the dry run finds cross-batch
    // collisions too (in --apply mode they are in the database already).
    const planned = new Set();
    let batch = [];
    const flush = async () => {
        if (!batch.length) {
            return;
        }
        const lowered = [...new Set(batch.map(row => normalize(row.email)))];
        const ids = batch.map(row => row._id);
        const others = await users
            .find({ email: { $in: lowered }, _id: { $nin: ids } }, { projection: { _id: 0, email: 1 } })
            .toArray();
        const plan = planEmailBatch(batch, [...others.map(other => other.email), ...planned]);
        plan.writes.forEach(write => planned.add(write.updateOne.update.$set.email));
        result.emailCollisionsSkipped += plan.collisions;
        if (apply && plan.writes.length) {
            const written = await users.bulkWrite(plan.writes, { ordered: false });
            result.emailsLowercased += written.modifiedCount || 0;
        }
        batch = [];
    };
    for await (const row of cursor) {
        batch.push(row);
        if (batch.length >= BATCH) {
            await flush();
        }
    }
    await flush();

    if (apply) {
        const flagged = await users.updateMany(missingIsGuest, { $set: { isGuest: false } });
        result.isGuestWritten = flagged.modifiedCount || 0;
        const unset = await users.updateMany({ firebaseUids: { $size: 0 } }, { $unset: { firebaseUids: '' } });
        result.emptyFirebaseUidArraysUnset = unset.modifiedCount || 0;
        // After the lowercasing above, so the canonical form is computed from the stored email.
        const canonical = await users.updateMany(missingCanonical, [
            { $set: { emailCanonical: canonicalEmailExpr('$email') } },
        ]);
        result.emailCanonicalWritten = canonical.modifiedCount || 0;
    }
    return result;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        console.log(JSON.stringify(await backfill(client.db(args.db), { apply: args.apply }), null, 2));
        if (!args.apply) {
            console.log('Dry run: nothing was written. Re-run with --apply to write.');
        }
    } finally {
        await client.close();
    }
}

module.exports = {
    backfill,
    canonicalEmailExpr,
    emailNeedsLowercase,
    missingCanonical,
    missingIsGuest,
    parseArgs,
    planEmailBatch,
};

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

#!/usr/bin/env node
/*
 * Read-only identity audit for the uid-first accounts and guests (plan F5.3 step 1, G1, decision #1).
 *
 * READ ONLY, DRY RUN, COUNTS ONLY. It runs countDocuments() and aggregate() and prints numbers. No
 * names, emails, uids, wallets or ids leave the database, and there is no --apply. Use a database
 * user with the `read` role anyway.
 *
 *   MONGODB_URI=<read-only connection string> node scripts/audit-identity.js [--db <name>]
 *
 * What it answers before the F5.3 rollout:
 * - how many users still lack `isGuest` or have a mixed-case email (backfill-identity-fields.js),
 * - how many registered users have no Firebase uid yet (backfill-firebase-uid.ts),
 * - guests: how many, idle over 30 days (decision #11), stuck in a merge, pending Tails held,
 * - starters: owners with more than one (must be 0 for the `starter_per_owner` index), dangling
 *   `user.cat` pointers,
 * - referrals: accounts referred by more than one referrer under the old GET route (decision #12
 *   leaves them unchanged; this only sizes it).
 *
 * Duplicate emails and uids (the unique-index blockers) are in audit-duplicate-users.js.
 */
const { MongoClient } = require('mongodb');

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_IDLE_DAYS = 30;

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--dry-run') args.dryRun = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

const registered = { isGuest: { $ne: true } };
const guest = { isGuest: true };

/** `email` is a string that changes when trimmed and lowercased. */
const emailNeedsLowercase = {
    email: { $type: 'string' },
    $expr: { $ne: ['$email', { $toLower: { $trim: { input: '$email' } } }] },
};

/**
 * Registered users whose `cat` points at no cat document. The equality `$lookup` uses the `_id`
 * index and works on MongoDB 3.6+ (the joined cat is dropped at once).
 */
function danglingCatPipeline() {
    return [
        { $match: { ...registered, cat: { $exists: true, $ne: null } } },
        { $project: { _id: 0, cat: 1 } },
        { $lookup: { from: 'cats', localField: 'cat', foreignField: '_id', as: 'found' } },
        { $project: { found: { $size: '$found' } } },
        { $match: { found: 0 } },
        { $count: 'count' },
    ];
}

/** Owners with more than one `isStarter` cat. */
function multiStarterPipeline() {
    return [
        { $match: { isStarter: true } },
        { $group: { _id: '$owner', starters: { $sum: 1 } } },
        { $match: { starters: { $gt: 1 } } },
        { $count: 'count' },
    ];
}

/** Accounts that appear in more than one referrer's `referrals` (paid more than once before #12). */
function multiReferredPipeline() {
    return [
        { $match: { 'referrals.0': { $exists: true } } },
        { $project: { _id: 1, referrals: 1 } },
        { $unwind: '$referrals' },
        { $group: { _id: '$referrals', referrers: { $addToSet: '$_id' } } },
        { $project: { referrers: { $size: '$referrers' } } },
        { $match: { referrers: { $gt: 1 } } },
        { $group: { _id: null, accounts: { $sum: 1 }, extraPayouts: { $sum: { $subtract: ['$referrers', 1] } } } },
    ];
}

function pendingTailsPipeline() {
    return [
        { $match: { ...guest, pendingTails: { $gt: 0 } } },
        {
            $group: {
                _id: null,
                guests: { $sum: 1 },
                total: { $sum: '$pendingTails' },
                max: { $max: '$pendingTails' },
            },
        },
    ];
}

const first = rows => (Array.isArray(rows) && rows[0]) || {};

async function audit(db, now = new Date()) {
    const users = db.collection('users');
    const cats = db.collection('cats');
    const idleCutoff = new Date(now.getTime() - GUEST_IDLE_DAYS * DAY_MS);
    const counts = {
        usersTotal: users.countDocuments({}),
        usersRegistered: users.countDocuments(registered),
        usersIsGuestMissing: users.countDocuments({ isGuest: { $exists: false } }),
        usersWithoutEmail: users.countDocuments({ ...registered, email: { $not: { $type: 'string' } } }),
        usersEmailNeedsLowercase: users.countDocuments({ ...registered, ...emailNeedsLowercase }),
        usersWithFirebaseUid: users.countDocuments({ ...registered, 'firebaseUids.0': { $exists: true } }),
        usersWithoutFirebaseUid: users.countDocuments({ ...registered, 'firebaseUids.0': { $exists: false } }),
        usersEmailVerified: users.countDocuments({ ...registered, emailVerifiedAt: { $exists: true } }),
        usersOnboardingPending: users.countDocuments({ ...registered, 'onboarding.state': 'pending' }),
        usersDeleted: users.countDocuments({ deletedAt: { $exists: true } }),
        guests: users.countDocuments(guest),
        guestsIdleOver30Days: users.countDocuments({
            ...guest,
            mergedInto: { $exists: false },
            $or: [
                { lastSeenAt: { $lt: idleCutoff } },
                { lastSeenAt: { $exists: false }, createdAt: { $lt: idleCutoff } },
            ],
        }),
        guestsInMerge: users.countDocuments({ ...guest, mergedInto: { $exists: true } }),
        catsStarters: cats.countDocuments({ isStarter: true }),
        catsGuestStarters: cats.countDocuments({ isGuestStarter: true }),
    };
    const keys = Object.keys(counts);
    const values = await Promise.all(Object.values(counts));
    const [dangling, multiStarter, multiReferred, pending] = await Promise.all([
        users.aggregate(danglingCatPipeline(), { allowDiskUse: true }).toArray(),
        cats.aggregate(multiStarterPipeline(), { allowDiskUse: true }).toArray(),
        users.aggregate(multiReferredPipeline(), { allowDiskUse: true }).toArray(),
        users.aggregate(pendingTailsPipeline()).toArray(),
    ]);
    return summarize(Object.fromEntries(keys.map((key, index) => [key, values[index]])), {
        dangling,
        multiStarter,
        multiReferred,
        pending,
    });
}

function summarize(counts, { dangling, multiStarter, multiReferred, pending }) {
    const referred = first(multiReferred);
    const held = first(pending);
    return {
        ...counts,
        usersWithDanglingCat: first(dangling).count || 0,
        ownersWithMoreThanOneStarter: first(multiStarter).count || 0,
        accountsReferredMoreThanOnce: referred.accounts || 0,
        extraReferralPayouts: referred.extraPayouts || 0,
        guestsHoldingPendingTails: held.guests || 0,
        guestPendingTailsTotal: held.total || 0,
        guestPendingTailsMax: held.max || 0,
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
        console.log(JSON.stringify(await audit(client.db(args.db)), null, 2));
    } finally {
        await client.close();
    }
}

module.exports = {
    GUEST_IDLE_DAYS,
    audit,
    danglingCatPipeline,
    emailNeedsLowercase,
    multiReferredPipeline,
    multiStarterPipeline,
    parseArgs,
    pendingTailsPipeline,
    summarize,
};

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

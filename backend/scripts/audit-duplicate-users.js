#!/usr/bin/env node
/*
 * Read-only audit of duplicate accounts (plan F5.3 step 1, G3, decisions #1 and #2).
 *
 * READ ONLY, DRY RUN, COUNTS ONLY. It runs aggregate() and prints numbers. No names, emails, uids
 * or ids leave the database, and there is no --apply. Use a database user with the `read` role.
 *
 *   MONGODB_URI=<read-only connection string> node scripts/audit-duplicate-users.js [--db <name>]
 *
 * The unique partial indexes `email_unique` (`{email: {$type: 'string'}}`) and `firebaseUids_unique`
 * (migrations/tokentails/2026-10-01-identity-unique-indexes.js) fail to build while duplicates exist.
 * This counts them:
 * - registered accounts sharing one email once trimmed and lowercased (the old email-only sign-in
 *   raced on first sign-in, and manager-created accounts kept mixed case),
 * - how many of those groups have progress on more than one doc (tails, catnip, cats or spend), which
 *   is what makes the manual merge (decision #2) need review,
 * - Firebase uids listed on more than one doc.
 *
 * `readyForUniqueIndexes` is true only when both counts are zero. Merging is manual and reviewed
 * (decision #2); this script never merges.
 *
 * The index definitions and the guarded build (`buildIdentityIndexes`) also live here, because
 * backend/.gitignore ignores /migrations: the migration file is a thin, unversioned wrapper that calls
 * them, so the versioned logic and its spec work on a clean checkout. Running this file never builds
 * an index; only the migration's `up` calls `buildIdentityIndexes`.
 */
const { MongoClient } = require('mongodb');

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

/** A doc with anything a merge would have to carry over. */
const hasProgress = {
    $or: [
        { $gt: [{ $ifNull: ['$tails', 0] }, 0] },
        { $gt: [{ $ifNull: ['$catnipCount', 0] }, 0] },
        { $gt: [{ $ifNull: ['$spent', 0] }, 0] },
        { $gt: [{ $size: { $ifNull: ['$cats', []] } }, 1] },
    ],
};

/** Groups of registered accounts per lowercased email, reduced to counts at once. */
function duplicateEmailPipeline() {
    return [
        { $match: { isGuest: { $ne: true }, email: { $type: 'string' } } },
        {
            $project: {
                _id: 0,
                key: { $toLower: { $trim: { input: '$email' } } },
                withUid: { $cond: [{ $gt: [{ $size: { $ifNull: ['$firebaseUids', []] } }, 0] }, 1, 0] },
                withProgress: { $cond: [hasProgress, 1, 0] },
                exactCase: { $cond: [{ $eq: ['$email', { $toLower: { $trim: { input: '$email' } } }] }, 1, 0] },
            },
        },
        {
            $group: {
                _id: '$key',
                docs: { $sum: 1 },
                withUid: { $sum: '$withUid' },
                withProgress: { $sum: '$withProgress' },
                exactCase: { $sum: '$exactCase' },
            },
        },
        { $match: { docs: { $gt: 1 } } },
        {
            $group: {
                _id: null,
                groups: { $sum: 1 },
                docs: { $sum: '$docs' },
                maxGroupSize: { $max: '$docs' },
                groupsWithSeveralUidOwners: { $sum: { $cond: [{ $gt: ['$withUid', 1] }, 1, 0] } },
                groupsWithProgressOnSeveralDocs: { $sum: { $cond: [{ $gt: ['$withProgress', 1] }, 1, 0] } },
                groupsOnlyDifferingInCase: { $sum: { $cond: [{ $lt: ['$exactCase', '$docs'] }, 1, 0] } },
            },
        },
    ];
}

/** Firebase uids listed on more than one doc (guests included: the uid index covers every doc). */
function duplicateUidPipeline() {
    return [
        { $match: { 'firebaseUids.0': { $exists: true } } },
        { $project: { _id: 1, firebaseUids: 1 } },
        { $unwind: '$firebaseUids' },
        { $group: { _id: '$firebaseUids', docs: { $addToSet: '$_id' } } },
        { $project: { docs: { $size: '$docs' } } },
        { $match: { docs: { $gt: 1 } } },
        { $group: { _id: null, uids: { $sum: 1 }, maxDocsPerUid: { $max: '$docs' } } },
    ];
}

/** Docs whose `firebaseUids` is an empty array: harmless, but the backfill should unset it. */
const emptyUidArray = { firebaseUids: { $size: 0 } };

function summarize({ emails, uids, emptyUidArrays }) {
    const email = emails[0] || {};
    const uid = uids[0] || {};
    const duplicateEmailGroups = email.groups || 0;
    const duplicateUids = uid.uids || 0;
    return {
        duplicateEmailGroups,
        docsInDuplicateEmailGroups: email.docs || 0,
        maxDocsPerEmail: email.maxGroupSize || 0,
        emailGroupsWithSeveralUidOwners: email.groupsWithSeveralUidOwners || 0,
        emailGroupsWithProgressOnSeveralDocs: email.groupsWithProgressOnSeveralDocs || 0,
        emailGroupsDifferingOnlyInCase: email.groupsOnlyDifferingInCase || 0,
        duplicateFirebaseUids: duplicateUids,
        maxDocsPerFirebaseUid: uid.maxDocsPerUid || 0,
        docsWithEmptyFirebaseUids: emptyUidArrays,
        readyForUniqueIndexes: duplicateEmailGroups === 0 && duplicateUids === 0,
    };
}

async function audit(db) {
    const users = db.collection('users');
    const [emails, uids, emptyUidArrays] = await Promise.all([
        users.aggregate(duplicateEmailPipeline(), { allowDiskUse: true }).toArray(),
        users.aggregate(duplicateUidPipeline(), { allowDiskUse: true }).toArray(),
        users.countDocuments(emptyUidArray),
    ]);
    return summarize({ emails, uids, emptyUidArrays });
}

/*
 * Identity indexes (plan F5.1, F5.3 step 5). The unique ones are never built by autoIndex, because
 * they fail while duplicates exist.
 * - `firebaseUids_unique` on `{firebaseUids: 1}`, partial on `'firebaseUids.0': {$exists: true}`.
 *   Not `{firebaseUids: {$exists: true}}`: two docs holding `[]` both index the key `undefined` and
 *   the build fails (checked on MongoDB 7).
 * - `email_unique` on `{email: 1}`, partial on `{email: {$type: 'string'}}` (guests and deleted
 *   accounts have no email).
 * The partial board and guest indexes are also declared in the schema; creating them here makes the
 * migration complete where autoIndex is off. `createIndex` with the same spec is a no-op.
 */
const UNIQUE_INDEXES = [
    {
        key: { firebaseUids: 1 },
        options: {
            name: 'firebaseUids_unique',
            unique: true,
            partialFilterExpression: { 'firebaseUids.0': { $exists: true } },
        },
    },
    {
        key: { email: 1 },
        options: { name: 'email_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    },
];

const SUPPORT_INDEXES = [
    { key: { tails: -1 }, options: { name: 'board_tails', partialFilterExpression: { isGuest: false } } },
    { key: { catnipCount: -1 }, options: { name: 'board_catnip', partialFilterExpression: { isGuest: false } } },
    { key: { lastSeenAt: 1 }, options: { name: 'guest_idle', partialFilterExpression: { isGuest: true } } },
    { key: { mergedInto: 1 }, options: { name: 'guest_merge', partialFilterExpression: { isGuest: true } } },
    // Abuse checks by inbox (referrals, guest Tails cap; 2a review finding #5). Not unique: Gmail
    // aliases are separate accounts. Not in the schema, so autoIndex never builds it.
    {
        key: { emailCanonical: 1 },
        options: { name: 'email_canonical', partialFilterExpression: { emailCanonical: { $type: 'string' } } },
    },
];

async function duplicates(users) {
    const [emails, uids] = await Promise.all([
        users.aggregate(duplicateEmailPipeline(), { allowDiskUse: true }).toArray(),
        users.aggregate(duplicateUidPipeline(), { allowDiskUse: true }).toArray(),
    ]);
    return { duplicateEmailGroups: (emails[0] || {}).groups || 0, duplicateFirebaseUids: (uids[0] || {}).uids || 0 };
}

/** Migration `up`: refuses (throws, builds nothing, counts only) while duplicates remain. */
async function buildIdentityIndexes(db) {
    const users = db.collection('users');
    const found = await duplicates(users);
    if (found.duplicateEmailGroups || found.duplicateFirebaseUids) {
        throw new Error(
            `Refusing to build unique identity indexes: ${JSON.stringify(found)}. ` +
                'Merge duplicates by hand (decision #2) and re-run scripts/audit-duplicate-users.js.'
        );
    }
    for (const { key, options } of [...SUPPORT_INDEXES, ...UNIQUE_INDEXES]) {
        await users.createIndex(key, options);
        console.log(`index ${options.name} ready`);
    }
}

/** Migration `down`: drops the unique indexes only. */
async function dropUniqueIdentityIndexes(db) {
    const users = db.collection('users');
    for (const { options } of UNIQUE_INDEXES) {
        await users.dropIndex(options.name).catch(error => {
            if (error.codeName !== 'IndexNotFound') throw error;
        });
    }
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
    audit,
    duplicateEmailPipeline,
    duplicateUidPipeline,
    emptyUidArray,
    parseArgs,
    summarize,
    UNIQUE_INDEXES,
    SUPPORT_INDEXES,
    duplicates,
    buildIdentityIndexes,
    dropUniqueIdentityIndexes,
};

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exit(1);
    });
}

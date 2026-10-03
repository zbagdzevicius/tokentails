#!/usr/bin/env node
/*
 * Marks the legacy Cleocatra cats as locked PINKIE starters (plan G3 "Legacy", decision #20).
 *
 * Before F5, every new account got a hardcoded Cleocatra from `generateACat`. Those cats are the
 * accounts' starters, but carry no `isStarter`. This script finds them by an EXACT match on the
 * legacy payload (name, sprite, gif and type, no blessing, no source cat), and for each owner marks
 * one as `{isStarter: true, starterLockedAt, starterBreed: 'PINKIE', origin: 'starter'}`:
 *
 * - The owner's active cat (`user.cat`) when it is one of the matches, else the oldest match.
 * - Owners who already have a starter are skipped (the unique `starter_per_owner` index would
 *   refuse a second one anyway; a race is counted, never retried). Those whose starter is still
 *   unlocked (created by sign-in or a guest merge after the F5 deploy) are counted separately.
 * - Eligible owners also get `renameOffer: true` on that cat: a one-time rename that skips the
 *   30-day window (PUT /cat/:id/name; DELETE /cat/:id/name-offer dismisses it). Not eligible: the
 *   cat is minted (its name is frozen), or the account is deleted or a guest.
 * - `onboarding` is not touched: a missing field means done, so Meet your cat never shows to these
 *   accounts, and the onboarding gate never depends on this script.
 *
 * DRY RUN BY DEFAULT. Without --apply it only counts. It prints counts only: no names, emails or ids.
 *
 *   MONGODB_URI=... node scripts/backfill-starter-cats.js            # report only
 *   MONGODB_URI=... node scripts/backfill-starter-cats.js --apply    # write
 *
 * Options:
 *   --db <name>   Database name when MONGODB_URI does not include one.
 *   --apply       Write the change.
 *   --no-offer    Mark starters without the rename offer.
 */
const { MongoClient } = require('mongodb');

/** The exact legacy payload of `generateACat` (git history of src/user/user.service.ts). */
const LEGACY_CLEOCATRA = Object.freeze({
    name: 'Cleocatra',
    type: 'WATER',
    spriteImg: 'https://tokentails.com/cats/pinkie/sprites/hearted-red.png',
    catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red/GROOMING.gif',
});
const BATCH = 1000;

function parseArgs(argv) {
    const args = { apply: false, offer: true };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else if (arg === '--no-offer') args.offer = false;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

/** Exact-match filter for legacy Cleocatra cats that are not starters yet. */
function legacyFilter() {
    return {
        ...LEGACY_CLEOCATRA,
        owner: { $exists: true, $ne: null },
        isStarter: { $exists: false },
        blessing: { $exists: false },
        sourceCat: { $exists: false },
    };
}

const isMinted = token => !!token && typeof token === 'object' && Object.values(token).some(Boolean);
const key = id => String(id);

/**
 * `db` is a native driver database (the spec passes a stand-in with `collection(name)` returning
 * `find`, `updateOne`). Returns the counts; writes only with `apply`.
 */
async function backfill(db, { apply = false, offer = true } = {}, now = new Date(), log = console.log) {
    const cats = db.collection('cats');
    const users = db.collection('users');
    const report = {
        matches: 0,
        owners: 0,
        ownersWithStarter: 0,
        ownersWithUnlockedStarter: 0,
        extraMatches: 0,
        toMark: 0,
        renameOffers: 0,
        minted: 0,
        marked: 0,
        raced: 0,
    };

    // owner -> candidate cats (only the fields the choice needs)
    const byOwner = new Map();
    const cursor = cats.find(legacyFilter(), { projection: { _id: 1, owner: 1, createdAt: 1, token: 1 } });
    for await (const cat of cursor) {
        report.matches += 1;
        const list = byOwner.get(key(cat.owner)) || [];
        list.push(cat);
        byOwner.set(key(cat.owner), list);
    }
    report.owners = byOwner.size;

    const owners = [...byOwner.keys()];
    for (let start = 0; start < owners.length; start += BATCH) {
        const batch = owners.slice(start, start + BATCH);
        const ownerIds = batch.map(owner => byOwner.get(owner)[0].owner);
        const [starters, accounts] = await Promise.all([
            cats
                .find({ owner: { $in: ownerIds }, isStarter: true }, { projection: { owner: 1, starterLockedAt: 1 } })
                .toArray(),
            users.find({ _id: { $in: ownerIds } }, { projection: { cat: 1, deletedAt: 1, isGuest: 1 } }).toArray(),
        ]);
        const hasStarter = new Set(starters.map(cat => key(cat.owner)));
        const unlockedStarter = new Set(starters.filter(cat => !cat.starterLockedAt).map(cat => key(cat.owner)));
        const accountOf = new Map(accounts.map(user => [key(user._id), user]));

        for (const owner of batch) {
            const candidates = byOwner.get(owner);
            if (hasStarter.has(owner)) {
                report.ownersWithStarter += 1;
                // An unlocked starter next to a legacy Cleocatra was created by sign-in or a guest merge
                // (`ensureStarterCat` without `locked`). POST /user/starter refuses it (no pending
                // onboarding), but the Cleocatra cannot become the starter while it exists. Counted for
                // the manual follow-up in docs/plans/alignment-log/3c.md; never changed here.
                if (unlockedStarter.has(owner)) report.ownersWithUnlockedStarter += 1;
                continue;
            }
            report.extraMatches += candidates.length - 1;
            const account = accountOf.get(owner);
            const active = account && candidates.find(cat => account.cat && key(cat._id) === key(account.cat));
            const chosen =
                active ||
                [...candidates].sort(
                    (a, b) =>
                        (a.createdAt ? new Date(a.createdAt).getTime() : 0) -
                            (b.createdAt ? new Date(b.createdAt).getTime() : 0) || key(a._id).localeCompare(key(b._id))
                )[0];
            const minted = isMinted(chosen.token);
            if (minted) report.minted += 1;
            const eligible = offer && !minted && !!account && !account.deletedAt && account.isGuest !== true;
            report.toMark += 1;
            if (eligible) report.renameOffers += 1;
            if (!apply) continue;

            try {
                const result = await cats.updateOne(
                    { _id: chosen._id, isStarter: { $exists: false } },
                    {
                        $set: {
                            isStarter: true,
                            starterLockedAt: chosen.createdAt || now,
                            starterBreed: 'PINKIE',
                            origin: 'starter',
                            starterBackfilledAt: now,
                            ...(eligible ? { renameOffer: true } : {}),
                        },
                    }
                );
                if (result.modifiedCount) report.marked += 1;
                else report.raced += 1;
            } catch (error) {
                // starter_per_owner: a starter appeared for this owner since the read.
                if (error && error.code === 11000) report.raced += 1;
                else throw error;
            }
        }
    }

    log(`Legacy Cleocatra matches: ${report.matches} across ${report.owners} owners`);
    log(`Owners who already have a starter (skipped): ${report.ownersWithStarter}`);
    log(`  of which the starter is unlocked (created by sign-in or a merge): ${report.ownersWithUnlockedStarter}`);
    log(`Extra matches left as ordinary cats (owner had more than one): ${report.extraMatches}`);
    log(`Starters to mark: ${report.toMark} (rename offers: ${report.renameOffers}, minted: ${report.minted})`);
    if (!apply) {
        log('Dry run: nothing written. Re-run with --apply to write.');
    } else {
        log(`Marked: ${report.marked}; skipped by a race: ${report.raced}`);
    }
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

module.exports = { parseArgs, legacyFilter, backfill, LEGACY_CLEOCATRA };

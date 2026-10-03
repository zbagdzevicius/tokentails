#!/usr/bin/env node
/*
 * Sets `Blessing.kind` on rows created before plan F7.8, so impact counts and featured cats can use
 * `kind: 'rescue'` only.
 *
 * - A blessing of the portrait shelter (`SHELTER_ID` in src/cat/cat.service.ts, where paid pet
 *   portraits are stored as ADOPTED blessings) becomes `portrait`.
 * - Every other blessing without a kind becomes `rescue`.
 * - A row that already has a kind is never touched, so the script can run again safely.
 * - Blessings in Token Tails' house zones (`role: 'house'`, or before the shelter backfill a slug in
 *   DEFAULT_HOUSE_SLUGS of backfill-shelter-fields.js) also become `rescue`: `kind` says what the
 *   record is (plan F7.8, rescue or portrait), and the G3 pack and featured pools read the
 *   catfluencers zone by `kind: 'rescue'`. The public figures leave house zones out by shelter
 *   (`rescueBlessingFilter(houseShelterIds)`), not by kind. The dry run prints how many of the
 *   planned rescue rows sit in house zones, so the founder can check that split.
 *
 * DRY RUN BY DEFAULT. Without --apply it only counts and prints the plan. It prints counts only:
 * no names, creators or ids.
 *
 *   MONGODB_URI=... node scripts/backfill-blessing-kind.js            # report only
 *   MONGODB_URI=... node scripts/backfill-blessing-kind.js --apply    # write
 *
 * Options:
 *   --portrait-shelter <id>  The portrait shelter's ObjectId (default: the one cat.service.ts uses).
 *   --db <name>              Database name when MONGODB_URI does not include one.
 *   --apply                  Write the change.
 */
const { MongoClient, ObjectId } = require('mongodb');
const { DEFAULT_HOUSE_SLUGS } = require('./backfill-shelter-fields.js');

// Mirrors SHELTER_ID in src/cat/cat.service.ts (createBlessingWithCat, the portrait path).
const PORTRAIT_SHELTER_ID = '69a0008f83f121409ebfed1e';
const COLLECTION = 'blessings';

function parseArgs(argv) {
    const args = { apply: false, portraitShelter: PORTRAIT_SHELTER_ID };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--portrait-shelter') args.portraitShelter = argv[++i];
        else if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    if (!/^[0-9a-f]{24}$/i.test(args.portraitShelter || '')) {
        throw new Error('--portrait-shelter must be a 24-character ObjectId');
    }
    return args;
}

/** The two updates the backfill makes. Both match only rows without a kind. */
function planUpdates(portraitShelterId) {
    const shelter = new ObjectId(portraitShelterId);
    const missing = { kind: { $exists: false } };
    return [
        { kind: 'portrait', filter: { ...missing, shelter } },
        { kind: 'rescue', filter: { ...missing, shelter: { $ne: shelter } } },
    ];
}

/** Ids of the house zones: `role: 'house'`, or no role and a default house slug (impact-public.ts). */
async function houseShelterIds(shelters) {
    const rows = await shelters.find({}, { projection: { _id: 1, slug: 1, role: 1 } }).toArray();
    return rows
        .filter(row => row.role === 'house' || (!row.role && DEFAULT_HOUSE_SLUGS.includes(String(row.slug || ''))))
        .map(row => row._id);
}

/**
 * Counts, then (with `apply`) writes. `collection` is a native driver collection; the spec passes a
 * stand-in. Returns the per-kind counts and what was modified.
 */
async function backfill(
    collection,
    { apply, portraitShelter, houseShelters = [] },
    now = new Date(),
    log = console.log
) {
    const updates = planUpdates(portraitShelter);
    const report = {
        alreadySet: await collection.countDocuments({ kind: { $exists: true } }),
        planned: {},
        houseZoneRescue: 0,
        modified: {},
    };
    for (const { kind, filter } of updates) {
        report.planned[kind] = await collection.countDocuments(filter);
    }
    for (const shelter of houseShelters) {
        if (String(shelter) !== String(portraitShelter)) {
            report.houseZoneRescue += await collection.countDocuments({ kind: { $exists: false }, shelter });
        }
    }
    log(`Blessings with a kind already: ${report.alreadySet}`);
    for (const { kind } of updates) {
        log(`Would set kind=${kind}: ${report.planned[kind]}`);
    }
    log(`  of the rescue rows, in house zones (left out of the public figures by shelter): ${report.houseZoneRescue}`);
    if (!apply) {
        log('Dry run: nothing written. Re-run with --apply to write.');
        return report;
    }
    for (const { kind, filter } of updates) {
        const result = await collection.updateMany(filter, { $set: { kind, kindBackfilledAt: now } });
        report.modified[kind] = result.modifiedCount || 0;
        log(`Set kind=${kind}: ${report.modified[kind]}`);
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
        const db = client.db(args.db);
        const houseShelters = await houseShelterIds(db.collection('shelters'));
        await backfill(db.collection(COLLECTION), { ...args, houseShelters });
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

module.exports = { parseArgs, planUpdates, backfill, houseShelterIds, PORTRAIT_SHELTER_ID };

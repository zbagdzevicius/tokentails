#!/usr/bin/env node
/*
 * Fills the plan F7.7 shelter fields on existing rows: `countryCode` (ISO alpha-2), `role`
 * (partner | house, decision #88), `handoverStatus` and, only when told, `partnerStatus`.
 *
 * - countryCode: from the free-text `country` when it names one country unambiguously (or is
 *   already an alpha-2 code); otherwise from the known-shelter table below; otherwise left unset
 *   and listed as "needs a code".
 * - role: `house` for the Token Tails zones (token-tails, token-tails-2, home, or --house), and
 *   `partner` for every other shelter.
 * - handoverStatus: `held-by-token-tails`. True for every shelter today (Token Tails holds the
 *   keys); the ADMIN-only shelter PUT moves a shelter to `handed-over` with its publicWallet.
 * - partnerStatus: never guessed. Set only for slugs passed with --active, --past or --prospect
 *   (founder input: the globe and the partner count read it).
 *
 * A field that already has a value is never overwritten. DRY RUN BY DEFAULT: without --apply it
 * prints the plan per slug (slugs and codes only; never wallets, members or contacts).
 *
 *   MONGODB_URI=... node scripts/backfill-shelter-fields.js                          # report only
 *   MONGODB_URI=... node scripts/backfill-shelter-fields.js --active rozine-pedute   # report only
 *   MONGODB_URI=... node scripts/backfill-shelter-fields.js --active rozine-pedute --apply
 *
 * Options:
 *   --active|--past|--prospect <slug,slug>  partnerStatus for these slugs.
 *   --house <slug,slug>                     Extra house-zone slugs.
 *   --db <name>                             Database name when MONGODB_URI does not include one.
 *   --apply                                 Write the change.
 */
const { MongoClient } = require('mongodb');

const COLLECTION = 'shelters';

// Mirrors src/impact/iso-countries.ts (the 249 assigned ISO 3166-1 alpha-2 codes).
const ISO_ALPHA2 = new Set(
    (
        'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
        'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
        'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM ' +
        'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
        'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
        'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
        'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
        'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
    ).split(' ')
);

// Country names seen in shelter rows and likely ones, in English and the local spelling.
const COUNTRY_NAMES = {
    lithuania: 'LT',
    lietuva: 'LT',
    latvia: 'LV',
    estonia: 'EE',
    eesti: 'EE',
    poland: 'PL',
    spain: 'ES',
    españa: 'ES',
    espana: 'ES',
    france: 'FR',
    germany: 'DE',
    italy: 'IT',
    portugal: 'PT',
    ukraine: 'UA',
    'united kingdom': 'GB',
    uk: 'GB',
    'great britain': 'GB',
    'united states': 'US',
    'united states of america': 'US',
    usa: 'US',
    us: 'US',
    netherlands: 'NL',
    greece: 'GR',
    turkey: 'TR',
    türkiye: 'TR',
    canada: 'CA',
};

// Shelters known from the storefront audit (slugs only). Used only when `country` says nothing.
const KNOWN_SHELTERS = {
    'rozine-pedute': { countryCode: 'LT' },
    'mil-bigotes': { countryCode: 'ES' },
    'puppy-kitty-nyc': { countryCode: 'US' },
};

const DEFAULT_HOUSE_SLUGS = ['token-tails', 'token-tails-2', 'home'];
const PARTNER_STATUSES = ['active', 'past', 'prospect'];

const list = value =>
    String(value || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

function parseArgs(argv) {
    const args = { apply: false, house: [...DEFAULT_HOUSE_SLUGS], partnerStatus: {} };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const status = arg.replace(/^--/, '');
        if (PARTNER_STATUSES.includes(status) && arg.startsWith('--')) {
            for (const slug of list(argv[++i])) {
                if (args.partnerStatus[slug] && args.partnerStatus[slug] !== status) {
                    throw new Error(`${slug} is given two partner statuses`);
                }
                args.partnerStatus[slug] = status;
            }
        } else if (arg === '--house') args.house.push(...list(argv[++i]));
        else if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

/** ISO alpha-2 for a free-text country, or null when it is empty, unknown or ambiguous. */
function countryCodeOf(country) {
    const text = String(country || '').trim();
    if (!text) return null;
    if (/^[A-Za-z]{2}$/.test(text) && ISO_ALPHA2.has(text.toUpperCase())) return text.toUpperCase();
    return COUNTRY_NAMES[text.toLowerCase()] || null;
}

/** The `$set` for one shelter row (only fields it lacks), and a note when a code is missing. */
function planShelter(row, args) {
    const set = {};
    const notes = [];
    if (!row.countryCode) {
        const code = countryCodeOf(row.country) || KNOWN_SHELTERS[row.slug]?.countryCode || null;
        if (code) set.countryCode = code;
        else notes.push('needs a country code');
    } else if (!ISO_ALPHA2.has(row.countryCode)) {
        notes.push(`stored countryCode ${JSON.stringify(row.countryCode)} is not ISO alpha-2`);
    }
    if (!row.role) {
        set.role = args.house.includes(row.slug) ? 'house' : 'partner';
    }
    if (!row.handoverStatus) {
        set.handoverStatus = 'held-by-token-tails';
    }
    if (!row.partnerStatus) {
        if (args.partnerStatus[row.slug]) set.partnerStatus = args.partnerStatus[row.slug];
        else if ((row.role || set.role) !== 'house') notes.push('partnerStatus not given (--active/--past/--prospect)');
    }
    return { slug: row.slug, set, notes };
}

// Reads only the fields the plan needs: never wallets, users, code or contacts.
const PROJECTION = { slug: 1, country: 1, countryCode: 1, role: 1, handoverStatus: 1, partnerStatus: 1 };

async function backfill(collection, args, now = new Date(), log = console.log) {
    const rows = await collection.find({}, { projection: PROJECTION }).toArray();
    const plans = rows.map(row => ({ _id: row._id, ...planShelter(row, args) }));
    const unknown = Object.keys(args.partnerStatus).filter(slug => !rows.some(row => row.slug === slug));
    if (unknown.length) {
        throw new Error(`No shelter with slug ${unknown.join(', ')}`);
    }
    for (const plan of plans) {
        const fields = Object.entries(plan.set).map(([k, v]) => `${k}=${v}`);
        log(
            `${plan.slug}: ${fields.length ? fields.join(' ') : 'nothing to set'}${
                plan.notes.length ? ` (${plan.notes.join('; ')})` : ''
            }`
        );
    }
    const changes = plans.filter(plan => Object.keys(plan.set).length);
    if (!args.apply) {
        log(`Dry run: ${changes.length} of ${plans.length} shelters would change. Re-run with --apply to write.`);
        return { plans, modified: 0 };
    }
    let modified = 0;
    for (const plan of changes) {
        // Each field is set only while still absent, so a concurrent CMS edit is never overwritten.
        for (const [field, value] of Object.entries(plan.set)) {
            const result = await collection.updateOne(
                { _id: plan._id, [field]: { $exists: false } },
                { $set: { [field]: value, fieldsBackfilledAt: now } }
            );
            modified += result.modifiedCount || 0;
        }
    }
    log(`Wrote ${modified} fields on ${changes.length} shelters.`);
    return { plans, modified };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    const client = await new MongoClient(uri).connect();
    try {
        await backfill(client.db(args.db).collection(COLLECTION), args);
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

module.exports = { parseArgs, countryCodeOf, planShelter, backfill, ISO_ALPHA2, DEFAULT_HOUSE_SLUGS };

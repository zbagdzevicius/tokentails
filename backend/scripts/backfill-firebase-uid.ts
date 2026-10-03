#!/usr/bin/env ts-node
/*
 * Firebase uid backfill (plan F5.3 step 4, G9). Binds each Firebase user's uid to the legacy account
 * with its email, but only when the Firebase user proves the address: `emailVerified === true`. A
 * linked Google or Apple provider is NOT enough on its own (an unverified password user can link
 * its own Google account; see `isVerifiedToken` in src/user/user.service.ts). The same rule as sign-in (F5.2 step 2), applied ahead of time so legacy users keep
 * working once the unique `firebaseUids_unique` index and `email_verified` enforcement are on.
 *
 * DRY RUN BY DEFAULT (`--dry-run` is accepted and is the default). `--apply` writes. Output is counts
 * only: no emails, uids or ids.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> MONGODB_URI=<uri> \
 *     npx ts-node scripts/backfill-firebase-uid.ts [--db <name>] [--dry-run | --apply]
 *
 * Run after backfill-identity-fields.js (emails lowercased) and after duplicates are merged by hand
 * (decision #2): an email that matches several docs is skipped and counted (`duplicateEmail`).
 * Idempotent: `$addToSet`, so a second --apply changes nothing. Never touches guest docs, deleted
 * accounts, or a uid that another doc already owns.
 */
import * as admin from 'firebase-admin';
import { Collection, Document, MongoClient, ObjectId } from 'mongodb';

const PAGE_SIZE = 1000;

export interface IFirebaseAccount {
    uid: string;
    email?: string;
    emailVerified?: boolean;
    providerIds: string[];
}

export interface IUserRow {
    _id: ObjectId | string;
    firebaseUids?: string[];
}

export type BindOutcome =
    | 'bind'
    | 'alreadyBound'
    | 'noEmail'
    | 'skippedUnverified'
    | 'noAccount'
    | 'duplicateEmail'
    | 'uidOwnedElsewhere';

export const OUTCOMES: BindOutcome[] = [
    'bind',
    'alreadyBound',
    'noEmail',
    'skippedUnverified',
    'noAccount',
    'duplicateEmail',
    'uidOwnedElsewhere',
];

/** Only a verified primary email proves the address; a linked provider does not (see the header). */
export const isTrusted = (account: IFirebaseAccount) => account.emailVerified === true;

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/**
 * One Firebase user against the registered docs with its (lowercased) email and the doc that already
 * lists its uid, if any. Pure, so the spec covers every branch.
 */
export function classify(account: IFirebaseAccount, emailDocs: IUserRow[], uidOwner: IUserRow | null): BindOutcome {
    if (uidOwner) {
        if (emailDocs.some(doc => sameId(doc._id, uidOwner._id))) {
            return 'alreadyBound';
        }
        // An anonymous Firebase user (no email) that owns its guest doc is not an email binding.
        return account.email ? 'uidOwnedElsewhere' : 'noEmail';
    }
    if (!account.email) {
        return 'noEmail';
    }
    if (!isTrusted(account)) {
        return 'skippedUnverified';
    }
    if (!emailDocs.length) {
        return 'noAccount';
    }
    if (emailDocs.length > 1) {
        return 'duplicateEmail';
    }
    return 'bind';
}

export type BackfillCounts = Record<BindOutcome, number> & { firebaseUsers: number; bound: number; mode: string };

/** Classifies (and with `apply`, binds) one page of Firebase users. */
export async function processPage(
    users: Pick<Collection<Document>, 'find' | 'updateOne'>,
    accounts: IFirebaseAccount[],
    counts: BackfillCounts,
    apply: boolean,
    now = new Date()
): Promise<void> {
    const emails = [
        ...new Set(accounts.map(account => account.email?.trim().toLowerCase()).filter(Boolean)),
    ] as string[];
    const uids = accounts.map(account => account.uid);
    const [emailRows, uidRows] = await Promise.all([
        users
            .find(
                { email: { $in: emails }, isGuest: { $ne: true }, deletedAt: { $exists: false } },
                { projection: { _id: 1, email: 1, firebaseUids: 1 } }
            )
            .toArray(),
        users.find({ firebaseUids: { $in: uids } }, { projection: { _id: 1, firebaseUids: 1 } }).toArray(),
    ]);

    for (const account of accounts) {
        counts.firebaseUsers += 1;
        const email = account.email?.trim().toLowerCase();
        const emailDocs = email ? (emailRows.filter(row => row.email === email) as IUserRow[]) : [];
        const owner = (uidRows.find(row => (row.firebaseUids || []).includes(account.uid)) as IUserRow) || null;
        const outcome = classify(account, emailDocs, owner);
        counts[outcome] += 1;
        if (outcome !== 'bind' || !apply) {
            continue;
        }
        const result = await users.updateOne(
            { _id: emailDocs[0]._id as ObjectId, isGuest: { $ne: true }, deletedAt: { $exists: false } },
            { $addToSet: { firebaseUids: account.uid }, $min: { emailVerifiedAt: now } }
        );
        counts.bound += result.modifiedCount || 0;
    }
}

export function emptyCounts(apply: boolean): BackfillCounts {
    return {
        mode: apply ? 'apply' : 'dry-run',
        firebaseUsers: 0,
        bound: 0,
        ...(Object.fromEntries(OUTCOMES.map(outcome => [outcome, 0])) as Record<BindOutcome, number>),
    };
}

export const toAccount = (user: admin.auth.UserRecord): IFirebaseAccount => ({
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    providerIds: (user.providerData || []).map(provider => provider.providerId),
});

export function parseArgs(argv: string[]) {
    const args: { db?: string; apply: boolean } = { apply: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--db') args.db = argv[++i];
        else if (arg === '--apply') args.apply = true;
        else if (arg === '--dry-run') args.apply = false;
        else throw new Error(`Unknown option ${arg}`);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Set MONGODB_URI');
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to the Firebase service-account JSON file');
    }
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    const client = await new MongoClient(uri).connect();
    const counts = emptyCounts(args.apply);
    try {
        const users = client.db(args.db).collection('users');
        let pageToken: string | undefined;
        do {
            const page = await admin.auth().listUsers(PAGE_SIZE, pageToken);
            await processPage(users, page.users.map(toAccount), counts, args.apply);
            pageToken = page.pageToken;
        } while (pageToken);
        console.log(JSON.stringify(counts, null, 2));
        if (!args.apply) {
            console.log('Dry run: nothing was written. Re-run with --apply to write.');
        }
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

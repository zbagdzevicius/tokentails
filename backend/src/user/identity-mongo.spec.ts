import mongoose, { Connection, Model, Types } from 'mongoose';
import { CatRepository } from 'src/cat/cat.repository';
import { CatSchema } from 'src/cat/cat.schema';
import { notGuestFilter } from 'src/common/decorators/auth-user.decorator';
import { GameSchema } from 'src/game/game.schema';
import { GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import { runGuestMerge, startGuestMerge } from './guest/guest-lifecycle';
import { fakeFirebase } from './guest/identity-harness.helper-spec';
import { UserRepository } from './user.repository';
import { UserSchema } from './user.schema';
import { UserService } from './user.service';
import { recomputeGameTotals } from './utils/live-game';
import { canonicalEmail } from './guest/canonical-email';

/* eslint-disable @typescript-eslint/no-var-requires */
const auditIdentity = require('../../scripts/audit-identity.js');
const auditDuplicates = require('../../scripts/audit-duplicate-users.js');
const backfillFields = require('../../scripts/backfill-identity-fields.js');
/* eslint-enable @typescript-eslint/no-var-requires */
// The unversioned migration 2026-10-01-identity-unique-indexes.js delegates to these.
const migration = { up: auditDuplicates.buildIdentityIndexes, down: auditDuplicates.dropUniqueIdentityIndexes };

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

/*
 * The identity code against a REAL MongoDB (opt-in): upserts with `$setOnInsert: {_id}`, `$max` on
 * missing array paths, the partial unique indexes, the scripts, and the query plans of the board
 * queries (IXSCAN on the partial `{isGuest: false}` indexes, G1 acceptance).
 *
 * Skipped unless IDENTITY_SPEC_MONGO_URL is set. It creates and drops its own scratch database
 * (`tt_identity_spec_<random>`), so it is safe against a local dev server:
 *
 *   IDENTITY_SPEC_MONGO_URL=mongodb://localhost:27017 npx jest src/user/identity-mongo.spec.ts
 */

const url = process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('identity on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let users: Model<any>;
    let cats: Model<any>;
    let games: Model<any>;
    let service: UserService;
    let userRepository: UserRepository;

    const newService = () => {
        const created = new UserService(
            userRepository,
            new CatRepository(cats as any),
            { encrypt: () => ({ iv: 'i', content: 'c' }) } as any,
            { model: games } as any
        );
        created.firebase = fakeFirebase();
        return created;
    };

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_identity_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        users = connection.model('User', UserSchema);
        cats = connection.model('Cat', CatSchema);
        games = connection.model('Game', GameSchema);
        await Promise.all([users.init(), cats.init(), games.init()]);
        userRepository = new UserRepository(users as any);
        service = newService();
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all([users.deleteMany({}), cats.deleteMany({}), games.deleteMany({})]);
        delete process.env.IDENTITY_BACKFILL_DONE;
    });

    const google = (uid: string, email: string) =>
        ({ uid, email, email_verified: true, firebase: { sign_in_provider: 'google.com' } } as any);

    it('creates one user and one starter from six parallel first requests on two replicas (after the migration)', async () => {
        await migration.up(connection.db);
        const replica = newService();

        await Promise.all(
            Array.from({ length: 6 }, (_v, index) =>
                (index % 2 ? replica : service).getFirebaseUser(google('uid-new', 'new@example.com'))
            )
        );

        expect(await users.countDocuments()).toBe(1);
        expect(await cats.countDocuments({ isStarter: true })).toBe(1);
        const user = await users.findOne().lean<any>();
        expect(user).toMatchObject({ firebaseUids: ['uid-new'], isGuest: false, onboarding: { state: 'pending' } });
        expect(String(user.cat)).toBe(String((await cats.findOne().lean<any>())._id));
    });

    it('promotes a guest in place with real operators ($unset pendingTails, capped $inc)', async () => {
        const guest: any = await service.createGuestSession('uid-guest', '203.0.113.1');
        await users.updateOne({ _id: guest._id }, { $set: { pendingTails: 2600, catnipChaos: [30] } });

        const promoted: any = await service.getFirebaseUser(google('uid-guest', 'Pat@Example.com'));

        expect(promoted.promotedNow).toBe(true);
        const doc = await users.findById(guest._id).lean<any>();
        expect(doc).toMatchObject({ isGuest: false, email: 'pat@example.com', tails: GUEST_TAILS_LIFETIME_CAP });
        expect(doc.pendingTails).toBeUndefined();
        const starter = await cats.findOne({ owner: guest._id }).lean<any>();
        expect(starter.isGuestStarter).toBeUndefined();
        expect(typeof starter.tokenId).toBe('number');
    });

    it('binds a guest to a Firebase-less portrait account with real operators ($pull, array-equality guard) and merges', async () => {
        await migration.up(connection.db);
        const portrait = await users.collection.insertOne({
            name: 'Portrait buyer',
            email: 'pat@example.com',
            isGuest: false,
            tails: 10,
            cats: [],
            createdAt: new Date(),
        });
        const guest: any = await service.createGuestSession('uid-guest', '203.0.113.2');
        await users.updateOne({ _id: guest._id }, { $set: { pendingTails: 40, catnipChaos: [30] } });
        await games.collection.insertOne({ user: guest._id, type: 'CATNIP_CHAOS', level: '1', points: 30 });

        const resolved: any = await service.getFirebaseUser(google('uid-guest', 'Pat@Example.com'));

        expect(String(resolved._id)).toBe(String(portrait.insertedId));
        expect(resolved.promotedNow).toBe(true);
        const doc = await users.findById(portrait.insertedId).lean<any>();
        expect(doc).toMatchObject({ firebaseUids: ['uid-guest'], isGuest: false, tails: 50 });
        expect(await users.countDocuments({ _id: guest._id })).toBe(0);
        expect(await games.countDocuments({ user: portrait.insertedId })).toBe(1);
        expect(await cats.countDocuments({ owner: guest._id })).toBe(0);
    });

    it('the guest feed pipeline clamps pendingTails exactly at the cap', async () => {
        const guest: any = await service.createGuestSession('uid-feed', '203.0.113.3');
        await users.updateOne({ _id: guest._id }, { $set: { pendingTails: GUEST_TAILS_LIFETIME_CAP - 1 } });
        const feed = () =>
            users.updateOne(
                { _id: guest._id, isGuest: true, pendingTails: { $not: { $gte: GUEST_TAILS_LIFETIME_CAP } } },
                [
                    {
                        $set: {
                            pendingTails: {
                                $min: [GUEST_TAILS_LIFETIME_CAP, { $add: [{ $ifNull: ['$pendingTails', 0] }, 25] }],
                            },
                        },
                    },
                ]
            );

        await feed();
        await feed();

        expect((await users.findById(guest._id).lean<any>()).pendingTails).toBe(GUEST_TAILS_LIFETIME_CAP);
    });

    it('finds a legacy mixed-case email case-insensitively until the backfill is done', async () => {
        const legacy = await users.collection.insertOne({
            name: 'Legacy',
            email: 'Mixed@Example.COM',
            createdAt: new Date(),
        });

        const user: any = await service.getFirebaseUser(google('uid-mixed', 'mixed@example.com'));

        expect(String(user._id)).toBe(String(legacy.insertedId));
        expect(await users.countDocuments()).toBe(1);
    });

    it('merges bests into a target without arrays (object paths) and re-derives them as arrays', async () => {
        const target = await users.collection.insertOne({
            name: 'T',
            email: 't@example.com',
            isGuest: false,
            codex: [1],
        });
        const guest: any = await service.createGuestSession('uid-g', 'ip');
        await users.updateOne({ _id: guest._id }, { $set: { catnipChaos: [50, 7], codex: [0, 1], pendingTails: 30 } });
        await games.collection.insertOne({ user: guest._id, type: 'CATNIP_CHAOS', level: '1', points: 7 });
        const deps = {
            users,
            cats,
            games,
            firebase: fakeFirebase(),
            recomputeTotals: (id: string) => recomputeGameTotals(userRepository, id),
        };

        const claimed = await startGuestMerge(deps, guest._id, target.insertedId as unknown as Types.ObjectId);
        await runGuestMerge(deps, claimed);

        const doc = await users.findById(target.insertedId).lean<any>();
        expect(Array.isArray(doc.catnipChaos)).toBe(true);
        expect(doc.catnipChaos.slice(0, 2)).toEqual([50, 7]);
        expect(doc.catnipChaosCount).toBe(57);
        expect(doc.codex).toEqual([1, 1]);
        expect(await users.countDocuments({ _id: guest._id })).toBe(0);
        expect(await games.countDocuments({ user: target.insertedId })).toBe(1);
    });

    it('merges bests into a target whose score arrays are null (a bare dotted $max would fail)', async () => {
        const target = await users.collection.insertOne({
            name: 'T',
            email: 't@example.com',
            isGuest: false,
            catnipChaos: null,
            match3Score: null,
        });
        await expect(
            users.collection.updateOne({ _id: target.insertedId }, { $max: { 'catnipChaos.3': 5 } })
        ).rejects.toThrow(/Cannot create field/);
        const guest: any = await service.createGuestSession('uid-g', 'ip');
        await users.updateOne({ _id: guest._id }, { $set: { catnipChaos: [50, 7], match3Score: [0, 40] } });
        const deps = {
            users,
            cats,
            games,
            firebase: fakeFirebase(),
            recomputeTotals: (id: string) => recomputeGameTotals(userRepository, id),
        };

        const claimed = await startGuestMerge(deps, guest._id, target.insertedId as unknown as Types.ObjectId);
        const result = await runGuestMerge(deps, claimed);

        expect(result.state).toBe('done');
        const doc = await users.findById(target.insertedId).lean<any>();
        expect(doc.catnipChaos.slice(0, 2)).toEqual([50, 7]);
        expect(doc.catnipChaosCount).toBe(57);
        expect(doc.match3Score[1]).toBe(40);
        expect(await users.countDocuments({ _id: guest._id })).toBe(0);
    });

    it('the backfill pipeline computes the same emailCanonical as canonicalEmail', async () => {
        const emails = [
            'me@gmail.com',
            ' M.e+1@Gmail.com',
            'm.e+promo@googlemail.com',
            'first.last+tag@example.com',
            'UPPER@Example.org',
        ];
        await users.collection.insertMany(emails.map((email, i) => ({ name: `u${i}`, email, isGuest: false })));

        await backfillFields.backfill(connection.db, { apply: true });

        const docs = await users.collection.find({}, { projection: { email: 1, emailCanonical: 1 } }).toArray();
        expect(docs).toHaveLength(emails.length);
        for (const doc of docs) {
            expect(doc.emailCanonical).toBe(canonicalEmail(doc.email));
        }
        const again = await backfillFields.backfill(connection.db, { apply: true });
        expect(again).toMatchObject({ emailsMissingCanonical: 0, emailCanonicalWritten: 0 });
    });

    it('recomputeGameTotals repairs an object-shaped best array without a path conflict', async () => {
        const { insertedId } = await users.collection.insertOne({ name: 'P', catnipChaos: { 3: 5 } });

        await expect(recomputeGameTotals(userRepository, String(insertedId))).resolves.toMatchObject({
            catnipChaosCount: 5,
        });

        const doc = await users.findById(insertedId).lean<any>();
        expect(Array.isArray(doc.catnipChaos)).toBe(true);
        expect(doc.catnipChaos[3]).toBe(5);
    });

    it('board queries use the partial {isGuest: false} indexes (IXSCAN) once the backfill switch is on', async () => {
        await users.collection.insertMany(
            Array.from({ length: 60 }, (_v, index) => ({
                name: `u${index}`,
                isGuest: index % 3 === 0,
                tails: index * 10,
                catnipCount: index,
            }))
        );
        await users.syncIndexes();
        const plan = async (query: Record<string, unknown>, sort: Record<string, 1 | -1>) => {
            const explained: any = await users.find(query).sort(sort).limit(10).explain('queryPlanner');
            return JSON.stringify(explained.queryPlanner?.winningPlan ?? explained[0]?.queryPlanner?.winningPlan);
        };

        process.env.IDENTITY_BACKFILL_DONE = 'true';
        const leaderboard = await plan({ ...notGuestFilter() }, { tails: -1 });
        const position = await plan({ tails: { $gt: 100 }, ...notGuestFilter() }, { tails: -1 });
        const catnip = await plan({ catnipCount: { $lte: 5000 }, ...notGuestFilter() }, { catnipCount: -1 });
        expect(leaderboard).toContain('IXSCAN');
        expect(leaderboard).toContain('board_tails');
        expect(position).toContain('board_tails');
        expect(catnip).toContain('board_catnip');

        // Before the backfill the `$ne: true` form cannot use the partial index (why the switch exists).
        delete process.env.IDENTITY_BACKFILL_DONE;
        expect(await plan({ ...notGuestFilter() }, { tails: -1 })).not.toContain('board_tails');
    });

    it('scripts: audits count, the backfill is idempotent, the migration refuses duplicates then builds', async () => {
        const now = new Date();
        await users.collection.insertMany([
            { name: 'a', email: 'Dup@Example.com', createdAt: now },
            { name: 'b', email: 'dup@example.com', createdAt: now, tails: 5 },
            { name: 'c', email: 'Solo@Example.com', createdAt: now },
            { name: 'd', email: 'bound@example.com', firebaseUids: ['uid-d'], isGuest: false, createdAt: now },
            { name: 'e', firebaseUids: [], createdAt: now },
            { name: 'f', firebaseUids: [], createdAt: now },
            {
                name: 'Guest',
                firebaseUids: ['uid-guest'],
                isGuest: true,
                lastSeenAt: new Date(Date.now() - 40 * 864e5),
            },
        ]);
        const db = connection.db;

        const identity = await auditIdentity.audit(db);
        expect(identity).toMatchObject({
            usersTotal: 7,
            guests: 1,
            guestsIdleOver30Days: 1,
            usersIsGuestMissing: 5,
            usersEmailNeedsLowercase: 2,
        });
        expect(await auditDuplicates.audit(db)).toMatchObject({
            duplicateEmailGroups: 1,
            docsInDuplicateEmailGroups: 2,
            docsWithEmptyFirebaseUids: 2,
            readyForUniqueIndexes: false,
        });
        await expect(migration.up(db)).rejects.toThrow(/Refusing/);

        const dry = await backfillFields.backfill(db);
        expect(dry).toMatchObject({
            mode: 'dry-run',
            emailsToLowercase: 2,
            emailCollisionsSkipped: 1,
            emailsLowercased: 0,
        });
        expect(await users.countDocuments({ isGuest: { $exists: false } })).toBe(5);

        const applied = await backfillFields.backfill(db, { apply: true });
        expect(applied).toMatchObject({
            emailsLowercased: 1,
            emailCollisionsSkipped: 1,
            isGuestWritten: 5,
            emptyFirebaseUidArraysUnset: 2,
        });
        const again = await backfillFields.backfill(db, { apply: true });
        expect(again).toMatchObject({ emailsLowercased: 0, isGuestWritten: 0, emptyFirebaseUidArraysUnset: 0 });

        // The manual merge (decision #2), then the indexes build.
        await users.deleteOne({ email: 'Dup@Example.com' });
        expect((await auditDuplicates.audit(db)).readyForUniqueIndexes).toBe(true);
        await migration.up(db);
        await expect(users.collection.insertOne({ name: 'x', firebaseUids: ['uid-d'] })).rejects.toMatchObject({
            code: 11000,
        });
        await expect(users.collection.insertOne({ name: 'y', email: 'solo@example.com' })).rejects.toMatchObject({
            code: 11000,
        });
        await expect(
            users.collection.insertMany([{ name: 'z1', firebaseUids: [] }, { name: 'z2' }])
        ).resolves.toBeTruthy();
        await migration.down(db);
    });
});

import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AUTH_ERROR } from 'src/common/guards/auth-errors';
import { GUEST_TAILS_LIFETIME_CAP } from 'src/shared-contracts/caps';
import {
    anonymousToken,
    createIdentityHarness,
    EMAIL,
    googleToken,
    guestSeed,
    httpError,
    registeredToken,
    rejection,
    verifiedToken,
    writes,
} from './guest/identity-harness.helper-spec';
import { ensureStarterCat, GUEST_STARTER_TEMPLATE_ID } from './guest/starter';
import { UserService } from './user.service';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

/*
 * Plan F5.2 (uid-first resolution), F5.5 (guest session) and the G1 / G9 acceptance items for the
 * backend binding: legacy conflict 409, unverified attach refused 403 with no write, verified bind,
 * uid mismatch 409, no user for an unverified new email, throttle 429, case-insensitive match,
 * parallel first requests, and the in-place guest promotion.
 */

const ENV_KEYS = [
    'AUTH_ENFORCE_EMAIL_VERIFIED',
    'AUTH_REQUIRE_VERIFIED_EXISTING',
    'NEW_ACCOUNTS_PER_IP_PER_HOUR',
    'GUEST_SESSIONS_PER_IP_PER_HOUR',
    'DISPOSABLE_EMAIL_DOMAINS',
    'IDENTITY_BACKFILL_DONE',
];
afterEach(() => ENV_KEYS.forEach(key => delete process.env[key]));

const legacyDoc = (fields: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    name: 'Legacy player',
    email: EMAIL,
    tails: 500,
    cats: [],
    ...fields,
});

describe('F5.2 resolveRegistered', () => {
    it('an unverified token with enforcement on is refused before any email lookup (no regex scan per poll)', async () => {
        const ctx = createIdentityHarness({ users: [legacyDoc({ email: 'Player@Example.com' })] });

        const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-new' })));

        expect(httpError(error)).toMatchObject({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        // Only the uid lookup ran.
        expect(ctx.users.calls).toEqual(['findOne']);
    });

    it('with enforcement off an unverified token still never attaches to an existing email doc', async () => {
        process.env.AUTH_ENFORCE_EMAIL_VERIFIED = 'false';
        const ctx = createIdentityHarness({ users: [legacyDoc()] });

        const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-new' })));

        expect(httpError(error)).toMatchObject({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        expect(writes(ctx.users)).toEqual([]);
    });

    it('a still-valid token of a deleted Firebase user (DELETE /user/me) never re-creates an account: 401, nothing written', async () => {
        const ctx = createIdentityHarness();
        ctx.firebase.missing.add('uid-deleted');

        const error = await rejection(ctx.service.getFirebaseUser(verifiedToken({ uid: 'uid-deleted' })));

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(writes(ctx.users)).toEqual([]);
        expect(writes(ctx.cats)).toEqual([]);
    });

    it('a lingering anonymous token of a merged or erased guest never re-creates a guest doc: 401', async () => {
        const ctx = createIdentityHarness();
        ctx.firebase.missing.add('uid-gone');

        const error = await rejection(ctx.service.createGuestSession('uid-gone', '198.51.100.1'));

        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(ctx.users.docs).toHaveLength(0);
        expect(ctx.cats.docs).toHaveLength(0);
    });

    it('resolves a registered doc by uid first, whatever its email', async () => {
        const owner = legacyDoc({ email: 'old@example.com', firebaseUids: ['uid-player'] });
        const ctx = createIdentityHarness({ users: [owner, legacyDoc()] });

        await expect(ctx.service.getFirebaseUser(verifiedToken())).resolves.toMatchObject({ _id: owner._id });
    });

    it('verified bind: attaches the uid to a uid-less legacy doc, lowercases its email and records verification', async () => {
        const legacy = legacyDoc({ email: 'Player@Example.COM' });
        const ctx = createIdentityHarness({ users: [legacy] });

        const user: any = await ctx.service.getFirebaseUser(verifiedToken({ email: 'player@example.com' }));

        expect(user._id).toEqual(legacy._id);
        expect(ctx.users.docs[0]).toMatchObject({ email: EMAIL, firebaseUids: ['uid-player'], isGuest: false });
        expect(ctx.users.docs[0].emailVerifiedAt).toBeInstanceOf(Date);
        expect(ctx.cats.docs).toHaveLength(0);
    });

    it('case-insensitive match: a mixed-case token email finds the lowercase doc', async () => {
        const legacy = legacyDoc();
        const ctx = createIdentityHarness({ users: [legacy] });

        await expect(
            ctx.service.getFirebaseUser(googleToken({ email: '  PLAYER@example.com ' }))
        ).resolves.toMatchObject({ _id: legacy._id });
        expect(ctx.users.docs).toHaveLength(1);
    });

    it('a verified token attaches a second uid to a doc that already has one (legacy Google plus password)', async () => {
        const doc = legacyDoc({ firebaseUids: ['uid-google'] });
        const ctx = createIdentityHarness({ users: [doc] });

        await ctx.service.getFirebaseUser(verifiedToken({ uid: 'uid-password' }));

        expect(ctx.users.docs[0].firebaseUids).toEqual(['uid-google', 'uid-password']);
    });

    it('unverified attach refused: 403 EMAIL_UNVERIFIED and no write', async () => {
        const ctx = createIdentityHarness({ users: [legacyDoc({ firebaseUids: ['uid-google'] })] });

        const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-password' })));

        expect(httpError(error)).toEqual({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        expect(writes(ctx.users)).toEqual([]);
    });

    it('no user for an unverified new email: 403, no user, cat or wallet', async () => {
        const ctx = createIdentityHarness();

        const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-new' })));

        expect(httpError(error)).toEqual({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        expect(ctx.users.docs).toHaveLength(0);
        expect(ctx.cats.docs).toHaveLength(0);
    });

    it('uid mismatch: a unique-index clash while binding (uid taken by another doc) is 409 ACCOUNT_CONFLICT', async () => {
        const ctx = createIdentityHarness({ users: [legacyDoc()] });
        jest.spyOn(ctx.users, 'updateOne').mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));

        const error = await rejection(ctx.service.getFirebaseUser(verifiedToken({ uid: 'uid-other' })));

        expect(httpError(error)).toEqual({ status: 409, code: AUTH_ERROR.ACCOUNT_CONFLICT });
    });

    it('decision #3 switch: with AUTH_REQUIRE_VERIFIED_EXISTING an unverified existing account must verify first', async () => {
        const doc = legacyDoc({ firebaseUids: ['uid-player'] });
        const ctx = createIdentityHarness({ users: [doc] });
        await expect(ctx.service.getFirebaseUser(registeredToken())).resolves.toMatchObject({ _id: doc._id });

        process.env.AUTH_REQUIRE_VERIFIED_EXISTING = 'true';
        expect(httpError(await rejection(ctx.service.getFirebaseUser(registeredToken())))).toEqual({
            status: 403,
            code: AUTH_ERROR.EMAIL_UNVERIFIED,
        });
        await expect(ctx.service.getFirebaseUser(verifiedToken())).resolves.toMatchObject({ _id: doc._id });
    });

    it('a deleted (anonymised) account never resolves', async () => {
        const doc = legacyDoc({ firebaseUids: ['uid-player'], deletedAt: new Date() });
        const ctx = createIdentityHarness({ users: [doc] });

        await expect(ctx.service.getFirebaseUser(googleToken())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('writes lastSeenAt at most once a day', async () => {
        const doc = legacyDoc({ firebaseUids: ['uid-player'] });
        const ctx = createIdentityHarness({ users: [doc] });

        await ctx.service.getFirebaseUser(googleToken());
        const first = ctx.users.docs[0].lastSeenAt;
        await ctx.service.getFirebaseUser(googleToken());

        expect(first).toBeInstanceOf(Date);
        expect(ctx.users.calls.filter(call => call === 'updateOne')).toHaveLength(2); // lastSeenAt + emailVerifiedAt
        expect(ctx.users.docs[0].lastSeenAt).toEqual(first);
    });
});

describe('F5.2 step 4: new accounts', () => {
    it('six parallel first requests create one user and one starter', async () => {
        const ctx = createIdentityHarness();

        const results: any[] = await Promise.all(
            Array.from({ length: 6 }, () => ctx.service.getFirebaseUser(googleToken({ uid: 'uid-new' })))
        );

        expect(new Set(results.map(user => String(user._id))).size).toBe(1);
        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.cats.docs).toHaveLength(1);
        expect(String(ctx.users.docs[0].cat)).toBe(String(ctx.cats.docs[0]._id));
    });

    it('six parallel first requests across two replicas still create one user and one starter', async () => {
        const ctx = createIdentityHarness();
        const replica = new UserService(
            ctx.userRepository as any,
            ctx.catRepository as any,
            {
                encrypt: () => ({}),
            } as any
        );

        await Promise.all(
            Array.from({ length: 6 }, (_v, index) =>
                (index % 2 ? replica : ctx.service).getFirebaseUser(googleToken({ uid: 'uid-new' }))
            )
        );

        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.cats.docs).toHaveLength(1);
        expect(ctx.users.docs[0].cats).toHaveLength(1);
    });

    it('the new account has onboarding pending, an unlocked SCOUT starter with a token id, and a wallet', async () => {
        const ctx = createIdentityHarness();

        const user: any = await ctx.service.getFirebaseUser(googleToken({ uid: 'uid-new', name: 'Pat' }));

        expect(user).toMatchObject({ isGuest: false, onboarding: { state: 'pending', version: 1 } });
        expect(user.promotedAt).toBeInstanceOf(Date);
        expect(user.wallets.stellar.walletPrivateKey).toEqual({ iv: 'iv', content: 'secret' });
        expect(ctx.cats.docs[0]).toMatchObject({
            owner: user._id,
            isStarter: true,
            starterBreed: 'SCOUT',
            origin: 'starter',
            name: 'Scout',
        });
        expect(ctx.cats.docs[0].tokenId).toEqual(expect.any(Number));
        expect(ctx.cats.docs[0].starterLockedAt).toBeUndefined();
        expect(ctx.cats.docs[0].isGuestStarter).toBeUndefined();
    });

    it('NewAccountThrottle: 429 once an IP created its hourly quota; other IPs and existing users are unaffected', async () => {
        process.env.NEW_ACCOUNTS_PER_IP_PER_HOUR = '2';
        const ctx = createIdentityHarness();
        const ip = { ip: '203.0.113.7' };

        await ctx.service.getFirebaseUser(googleToken({ uid: 'u1', email: 'a@example.com' }), ip);
        // Parallel first requests of one player count once.
        await Promise.all([
            ctx.service.getFirebaseUser(googleToken({ uid: 'u2', email: 'b@example.com' }), ip),
            ctx.service.getFirebaseUser(googleToken({ uid: 'u2', email: 'b@example.com' }), ip),
        ]);
        const error = await rejection(
            ctx.service.getFirebaseUser(googleToken({ uid: 'u3', email: 'c@example.com' }), ip)
        );

        expect(httpError(error).status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(ctx.users.docs).toHaveLength(2);
        await expect(
            ctx.service.getFirebaseUser(googleToken({ uid: 'u3', email: 'c@example.com' }), { ip: '198.51.100.1' })
        ).resolves.toBeTruthy();
        await expect(
            ctx.service.getFirebaseUser(googleToken({ uid: 'u1', email: 'a@example.com' }), ip)
        ).resolves.toBeTruthy();
    });

    it('decision #5: a disposable inbox cannot create an account (403, nothing written)', async () => {
        process.env.DISPOSABLE_EMAIL_DOMAINS = 'throwaway.test';
        const ctx = createIdentityHarness();

        for (const email of ['x@mailinator.com', 'x@eu.mailinator.com', 'x@throwaway.test']) {
            const error = await rejection(ctx.service.getFirebaseUser(verifiedToken({ uid: email, email })));
            expect(httpError(error).status).toBe(403);
        }
        expect(ctx.users.docs).toHaveLength(0);
    });

    it('an existing account on a disposable domain still signs in', async () => {
        const doc = legacyDoc({ email: 'old@mailinator.com', firebaseUids: ['uid-player'] });
        const ctx = createIdentityHarness({ users: [doc] });

        await expect(ctx.service.getFirebaseUser(googleToken({ email: 'old@mailinator.com' }))).resolves.toMatchObject({
            _id: doc._id,
        });
    });

    it('self-heals a dangling user.cat to the starter', async () => {
        const userId = new Types.ObjectId();
        const ctx = createIdentityHarness({ users: [{ _id: userId, name: 'P', cat: new Types.ObjectId(), cats: [] }] });

        const cat = await ensureStarterCat(ctx.cats as any, ctx.users as any, userId);

        expect(String(ctx.users.docs[0].cat)).toBe(String(cat._id));
        expect(ctx.users.docs[0].cats.map(String)).toContain(String(cat._id));
    });

    it('keeps a user.cat that points at a real cat', async () => {
        const userId = new Types.ObjectId();
        const adopted = { _id: new Types.ObjectId(), owner: userId, name: 'Luna' };
        const ctx = createIdentityHarness({
            users: [{ _id: userId, name: 'P', cat: adopted._id, cats: [adopted._id] }],
            cats: [adopted],
        });

        await ensureStarterCat(ctx.cats as any, ctx.users as any, userId);

        expect(String(ctx.users.docs[0].cat)).toBe(String(adopted._id));
        expect(ctx.users.docs[0].cats).toHaveLength(2);
    });
});

describe('F5.2 step 1: anonymous tokens and guests', () => {
    it('an anonymous uid without a doc resolves to the transient template and writes nothing', async () => {
        const ctx = createIdentityHarness();

        const user: any = await ctx.service.getFirebaseUser(anonymousToken('uid-anon'));

        expect(user).toMatchObject({
            isGuest: true,
            transient: true,
            firebaseUid: 'uid-anon',
            onboarding: { state: 'pending' },
            cat: { _id: GUEST_STARTER_TEMPLATE_ID, isStarter: true, isGuestStarter: true },
        });
        expect(user._id).toBeUndefined();
        expect(writes(ctx.users)).toEqual([]);
        expect(ctx.cats.docs).toHaveLength(0);
    });

    it('an anonymous uid with a guest doc resolves to that doc', async () => {
        const { user } = guestSeed('uid-anon');
        const ctx = createIdentityHarness({ users: [user] });

        await expect(ctx.service.getFirebaseUser(anonymousToken('uid-anon'))).resolves.toMatchObject({
            _id: user._id,
            isGuest: true,
        });
    });
});

describe('F5.5 createGuestSession', () => {
    it('six parallel calls create one guest doc (no email, no wallet) and one guest starter', async () => {
        const ctx = createIdentityHarness();

        await Promise.all(Array.from({ length: 6 }, () => ctx.service.createGuestSession('uid-anon', '203.0.113.1')));

        expect(ctx.users.docs).toHaveLength(1);
        const guest = ctx.users.docs[0];
        expect(guest).toMatchObject({
            firebaseUids: ['uid-anon'],
            isGuest: true,
            onboarding: { state: 'pending', version: 1 },
            pendingTails: 0,
            guestMergedTails: 0,
        });
        expect(guest.email).toBeUndefined();
        expect(guest.wallets).toBeUndefined();
        expect(guest.lastSeenAt).toBeInstanceOf(Date);
        expect(ctx.cats.docs).toHaveLength(1);
        expect(ctx.cats.docs[0]).toMatchObject({ isStarter: true, isGuestStarter: true, starterBreed: 'SCOUT' });
        expect(ctx.cats.docs[0].tokenId).toBeUndefined();
        expect(ctx.cats.docs[0].starterLockedAt).toBeUndefined();
    });

    it('is idempotent across calls', async () => {
        const ctx = createIdentityHarness();
        const first: any = await ctx.service.createGuestSession('uid-anon', 'ip');
        const second: any = await ctx.service.createGuestSession('uid-anon', 'ip');

        expect(String(second._id)).toBe(String(first._id));
        expect(ctx.users.docs).toHaveLength(1);
    });

    it('a uid that belongs to a registered account gets 409', async () => {
        const ctx = createIdentityHarness({ users: [legacyDoc({ firebaseUids: ['uid-player'] })] });

        expect(httpError(await rejection(ctx.service.createGuestSession('uid-player', 'ip'))).status).toBe(409);
    });

    it('is throttled per IP; resuming an existing session is not counted', async () => {
        process.env.GUEST_SESSIONS_PER_IP_PER_HOUR = '1';
        const ctx = createIdentityHarness();
        await ctx.service.createGuestSession('uid-a', '203.0.113.9');
        await ctx.service.createGuestSession('uid-a', '203.0.113.9');

        const error = await rejection(ctx.service.createGuestSession('uid-b', '203.0.113.9'));

        expect(httpError(error).status).toBe(429);
        expect(ctx.users.docs).toHaveLength(1);
    });
});

describe('F5.2 steps 1a-1e: guest promotion', () => {
    const promote = (ctx: ReturnType<typeof createIdentityHarness>, overrides: Record<string, unknown> = {}) =>
        ctx.service.getFirebaseUser(googleToken({ uid: 'uid-guest', name: 'Pat', ...overrides }));

    it('keeps the _id and scores, credits pending Tails up to the cap and unsets them, binds the email, creates a wallet', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 2500, catnipChaos: [40, 80], tails: 0 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        const promoted: any = await promote(ctx);

        expect(promoted.promotedNow).toBe(true);
        const doc = ctx.users.docs[0];
        expect(doc._id).toEqual(user._id);
        expect(doc).toMatchObject({
            isGuest: false,
            email: EMAIL,
            name: 'Pat',
            tails: GUEST_TAILS_LIFETIME_CAP,
            guestMergedTails: GUEST_TAILS_LIFETIME_CAP,
            catnipChaos: [40, 80],
            firebaseUids: ['uid-guest'],
        });
        expect(doc.pendingTails).toBeUndefined();
        expect(doc.emailVerifiedAt).toBeInstanceOf(Date);
        expect(doc.promotedAt).toBeInstanceOf(Date);
        expect(doc.wallets.stellar.walletAddress).toMatch(/^G/);
    });

    it('clears isGuestStarter on the kept starter and gives it a token id', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 10 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        await promote(ctx);

        expect(ctx.cats.docs).toHaveLength(1);
        expect(ctx.cats.docs[0].isGuestStarter).toBeUndefined();
        expect(ctx.cats.docs[0].isStarter).toBe(true);
        expect(ctx.cats.docs[0].tokenId).toEqual(expect.any(Number));
    });

    it('credits only the headroom left under the lifetime cap', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 300, guestMergedTails: 1900, tails: 5 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        await promote(ctx);

        expect(ctx.users.docs[0]).toMatchObject({ tails: 105, guestMergedTails: 2000 });
    });

    // 2a review finding #5: Gmail aliases share one lifetime cap (once the canonical backfill is done).
    it.each([
        ['after the backfill, aliases share the cap', 'true', 100],
        ['before the backfill, no inbox lookup runs', undefined, 300],
    ])('Gmail aliases: %s', async (_label, backfillDone, credited) => {
        if (backfillDone) process.env.IDENTITY_BACKFILL_DONE = backfillDone;
        const alias = legacyDoc({
            email: 'pat@gmail.com',
            emailCanonical: 'pat@gmail.com',
            isGuest: false,
            firebaseUids: ['uid-alias'],
            guestMergedTails: 1900,
        });
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 300, tails: 0 });
        const ctx = createIdentityHarness({ users: [alias, user], cats: [cat] });

        await promote(ctx, { email: 'P.a.t+2@googlemail.com' });

        const promoted = ctx.users.docs.find(doc => String(doc._id) === String(user._id))!;
        expect(promoted).toMatchObject({
            email: 'p.a.t+2@googlemail.com',
            emailCanonical: 'pat@gmail.com',
            tails: credited,
            guestMergedTails: credited,
        });
        expect(promoted.pendingTails).toBeUndefined();
    });

    it('returns promotedNow once: parallel requests promote and credit exactly once', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 150, tails: 0 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        const results: any[] = await Promise.all([promote(ctx), promote(ctx), promote(ctx)]);
        const later: any = await promote(ctx);

        expect(results.filter(result => result.promotedNow)).toHaveLength(1);
        expect(later.promotedNow).toBeUndefined();
        expect(ctx.users.docs[0].tails).toBe(150);
        expect(ctx.users.docs).toHaveLength(1);
    });

    it('1a: an unverified link (email and password) gets 403 and the guest doc is untouched', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 150 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-guest' })));

        expect(httpError(error)).toEqual({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        expect(writes(ctx.users)).toEqual([]);
        expect(ctx.users.docs[0]).toMatchObject({ isGuest: true, pendingTails: 150 });
    });

    it('1b legacy conflict: the token email belongs to an account with a live Firebase user, 409 ACCOUNT_CONFLICT, nothing written', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 150 });
        const ctx = createIdentityHarness({
            users: [user, legacyDoc({ email: 'Player@Example.com', firebaseUids: ['uid-legacy'] })],
            cats: [cat],
        });

        const error = await rejection(promote(ctx));

        expect(httpError(error)).toEqual({ status: 409, code: AUTH_ERROR.ACCOUNT_CONFLICT });
        expect(writes(ctx.users)).toEqual([]);
        expect(ctx.users.docs.find(doc => doc.isGuest)).toMatchObject({ pendingTails: 150 });
    });

    describe('1b with an account that has no live Firebase user (portrait order, manager-created, deleted Firebase user)', () => {
        function firebaseless(fields: Record<string, unknown> = {}) {
            const { user, cat } = guestSeed('uid-guest', { pendingTails: 150, catnipChaos: [40] });
            const portrait = legacyDoc({ name: 'Portrait buyer', email: 'Player@Example.com', ...fields });
            const ctx = createIdentityHarness({
                users: [user, portrait],
                cats: [cat],
                games: [{ user: user._id, cat: cat._id, type: 'CATNIP_CHAOS', level: '1', points: 40 }],
            });
            return { ctx, guest: user, portrait };
        }

        it.each([
            ['no firebaseUids', {}],
            ['an empty firebaseUids', { firebaseUids: [] }],
            ['only uids whose Firebase user is gone', { firebaseUids: ['uid-dead'] }],
        ])(
            'with %s: binds the uid to that account, merges the guest into it, promotedNow once',
            async (_label, fields) => {
                const { ctx, guest, portrait } = firebaseless(fields);
                ctx.firebase.missing.add('uid-dead');

                const resolved: any = await promote(ctx);

                expect(String(resolved._id)).toBe(String(portrait._id));
                expect(resolved.promotedNow).toBe(true);
                const account = ctx.users.docs.find(doc => String(doc._id) === String(portrait._id))!;
                expect(account).toMatchObject({
                    firebaseUids: ['uid-guest'],
                    email: EMAIL,
                    isGuest: false,
                    tails: 500 + 150,
                    promotionUnnotified: true,
                });
                expect(account.emailVerifiedAt).toBeInstanceOf(Date);
                expect(account.catnipChaos[0]).toBe(40);
                // The guest doc is gone; its linked Firebase user is now the account's sign-in: kept.
                expect(ctx.users.docs.some(doc => String(doc._id) === String(guest._id))).toBe(false);
                expect(ctx.firebase.deleted).toEqual([]);
                expect(ctx.games.docs.every(game => String(game.user) === String(portrait._id))).toBe(true);
                // The next request resolves by uid, with no 409 loop.
                const again: any = await promote(ctx);
                expect(String(again._id)).toBe(String(portrait._id));
                expect(again.promotedNow).toBeUndefined();
            }
        );

        it('an account that already merged a guest in the last 30 days is still bound; the guest progress is erased', async () => {
            const { ctx, guest, portrait } = firebaseless({ lastGuestMergeAt: new Date() });

            const resolved: any = await promote(ctx);

            expect(String(resolved._id)).toBe(String(portrait._id));
            const account = ctx.users.docs.find(doc => String(doc._id) === String(portrait._id))!;
            expect(account).toMatchObject({ firebaseUids: ['uid-guest'], tails: 500 });
            expect(ctx.users.docs.some(doc => String(doc._id) === String(guest._id))).toBe(false);
            expect(ctx.games.docs).toHaveLength(0);
            expect(ctx.firebase.deleted).toEqual([]);
        });

        // 2a review fix #1: this path used plain recomputeGameTotals, so Heist progress and cleared
        // levels were lost for good once the guest doc was deleted. Both merge paths now share
        // recomputeAfterGuestMerge.
        it("carries the guest's Heist score and stars and its cleared levels into the account", async () => {
            const { user, cat } = guestSeed('uid-guest', {
                pendingTails: 0,
                heistScore: [120, 0, 90],
                heistStars: [5, 0, 3, 0, 0, 0, 0, 0],
                match3Cleared: [0, 1, 1],
            });
            const portrait = legacyDoc({
                name: 'Portrait buyer',
                email: 'Player@Example.com',
                heistScore: [80, 40],
                heistStars: [2, 1, 0, 0, 0, 0, 0, 0],
                catnipChaosCleared: [],
                seasonEventCleared: [],
                match3Cleared: [],
            });
            const ctx = createIdentityHarness({ users: [user, portrait], cats: [cat] });

            const resolved: any = await promote(ctx);

            expect(String(resolved._id)).toBe(String(portrait._id));
            const account = ctx.users.docs.find(doc => String(doc._id) === String(portrait._id))!;
            expect(account.heistScore.slice(0, 3)).toEqual([120, 40, 90]);
            expect(account.heistStars.slice(0, 3)).toEqual([7, 1, 3]);
            expect(account.match3Cleared.slice(1, 3)).toEqual([1, 1]);
            expect(ctx.users.docs.some(doc => String(doc._id) === String(user._id))).toBe(false);
        });

        // 2a review fix #2: the bind counts against the new-account quota like any promotion.
        it('is throttled per IP like a new account: 429 before any write', async () => {
            process.env.NEW_ACCOUNTS_PER_IP_PER_HOUR = '1';
            const { ctx } = firebaseless();
            ctx.service.newAccountThrottle.record('203.0.113.50');

            const error = await rejection(
                ctx.service.getFirebaseUser(googleToken({ uid: 'uid-guest', name: 'Pat' }), { ip: '203.0.113.50' })
            );

            expect(httpError(error).status).toBe(HttpStatus.TOO_MANY_REQUESTS);
            expect(writes(ctx.users)).toEqual([]);
        });

        it('an unverified token never binds (1a comes first): 403, nothing written', async () => {
            const { ctx } = firebaseless();

            const error = await rejection(ctx.service.getFirebaseUser(registeredToken({ uid: 'uid-guest' })));

            expect(httpError(error)).toMatchObject({ status: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
            expect(writes(ctx.users)).toEqual([]);
        });
    });

    // 2a review fix #2: a promotion creates a registered account (wallet, starter token id, the
    // referral window), so 30 guest sessions per IP must not become 30 accounts per IP.
    it('NewAccountThrottle covers promotion: the 11th promotion from one IP within an hour is 429 and leaves the guest unchanged', async () => {
        const ip = { ip: '203.0.113.77' };
        const guests = Array.from({ length: 11 }, (_, index) => guestSeed(`uid-g${index}`, { pendingTails: 10 }));
        const ctx = createIdentityHarness({
            users: guests.map(guest => guest.user),
            cats: guests.map(guest => guest.cat),
        });

        for (let index = 0; index < 10; index += 1) {
            await ctx.service.getFirebaseUser(
                googleToken({ uid: `uid-g${index}`, email: `p${index}@example.com` }),
                ip
            );
        }
        const before = JSON.parse(JSON.stringify(ctx.users.docs.find(doc => doc.firebaseUids?.[0] === 'uid-g10')));
        const error = await rejection(
            ctx.service.getFirebaseUser(googleToken({ uid: 'uid-g10', email: 'p10@example.com' }), ip)
        );

        expect(httpError(error).status).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const after = ctx.users.docs.find(doc => doc.firebaseUids?.[0] === 'uid-g10');
        expect(JSON.parse(JSON.stringify(after))).toEqual(before);
        expect(after).toMatchObject({ isGuest: true, pendingTails: 10 });
        expect(ctx.users.docs.filter(doc => doc.isGuest === false)).toHaveLength(10);
        // Another network is unaffected.
        await expect(
            ctx.service.getFirebaseUser(googleToken({ uid: 'uid-g10', email: 'p10@example.com' }), {
                ip: '198.51.100.77',
            })
        ).resolves.toMatchObject({ isGuest: false, promotedNow: true });
    });

    it('a guest in the middle of a merge (another tab) is not promoted: 409, nothing written', async () => {
        const { user, cat } = guestSeed('uid-guest', { mergedInto: new Types.ObjectId(), mergeState: 'started' });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        const error = await rejection(promote(ctx));

        expect(httpError(error).status).toBe(409);
        expect(writes(ctx.users)).toEqual([]);
        expect(ctx.users.docs[0]).toMatchObject({ isGuest: true });
    });

    it('a merge claimed between the read and the promote write wins: the promote write never matches', async () => {
        const { user, cat } = guestSeed('uid-guest');
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });
        const original = ctx.users.findOneAndUpdate.bind(ctx.users);
        let claimedFirst = false;
        jest.spyOn(ctx.users, 'findOneAndUpdate').mockImplementation((filter: any, update: any, options: any) => {
            if (!claimedFirst) {
                claimedFirst = true;
                ctx.users.docs[0].mergedInto = new Types.ObjectId();
                ctx.users.docs[0].mergeState = 'started';
            }
            return original(filter, update, options);
        });

        expect(httpError(await rejection(promote(ctx))).status).toBe(409);
        expect(ctx.users.docs[0]).toMatchObject({ isGuest: true, mergeState: 'started' });
    });

    it('promotedNow reaches GET /user/profile once even when another request promoted', async () => {
        const { user, cat } = guestSeed('uid-guest');
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        // The promoting request is /live (its promotedNow is dropped by that route).
        await promote(ctx);
        const next: any = await promote(ctx);
        expect(next.promotedNow).toBeUndefined();
        expect(next.promotionUnnotified).toBe(true);

        await expect(ctx.service.claimPromotionNotice(next)).resolves.toBe(true);
        await expect(ctx.service.claimPromotionNotice(next)).resolves.toBe(false);
        expect(ctx.users.docs[0].promotionUnnotified).toBeUndefined();
    });

    it('promotion also credits monthTails by the same capped amount', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 120, monthTails: 5 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });

        await promote(ctx);

        expect(ctx.users.docs[0]).toMatchObject({ tails: 120, monthTails: 125, guestMergedTails: 120 });
    });

    it('1b uid mismatch: the uid is on a guest doc while the email is bound to another account, 409', async () => {
        const { user, cat } = guestSeed('uid-guest');
        const ctx = createIdentityHarness({
            users: [user, legacyDoc({ firebaseUids: ['uid-registered'] })],
            cats: [cat],
        });

        expect(httpError(await rejection(promote(ctx)))).toEqual({ status: 409, code: AUTH_ERROR.ACCOUNT_CONFLICT });
    });

    it('1d: an E11000 from the email index during the promote is 409 ACCOUNT_CONFLICT', async () => {
        const { user, cat } = guestSeed('uid-guest');
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });
        jest.spyOn(ctx.users, 'findOneAndUpdate').mockImplementationOnce(() => {
            throw Object.assign(new Error('E11000 email_unique'), { code: 11000 });
        });

        expect(httpError(await rejection(promote(ctx)))).toEqual({ status: 409, code: AUTH_ERROR.ACCOUNT_CONFLICT });
        expect(ctx.users.docs[0].isGuest).toBe(true);
    });

    it('a feed landing between the read and the promote is not lost', async () => {
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 100, tails: 0 });
        const ctx = createIdentityHarness({ users: [user], cats: [cat] });
        const original = ctx.users.findOneAndUpdate.bind(ctx.users);
        let raced = false;
        jest.spyOn(ctx.users, 'findOneAndUpdate').mockImplementation((filter: any, update: any, options: any) => {
            if (!raced && update?.$set?.isGuest === false) {
                raced = true;
                ctx.users.docs[0].pendingTails = 110; // a feed reward
            }
            return original(filter, update, options);
        });

        await promote(ctx);

        expect(ctx.users.docs[0].tails).toBe(110);
    });
});

describe('accounts created for someone else', () => {
    it('createUser (portrait orders): lowercased email, isGuest false, locked starter, never onboarding', async () => {
        const ctx = createIdentityHarness();

        const created: any = await ctx.service.createUser({ email: ' Buyer@Example.COM ' } as any);

        expect(created).toMatchObject({ email: 'buyer@example.com', isGuest: false });
        expect(created.onboarding).toBeUndefined();
        expect(ctx.cats.docs).toHaveLength(1);
        expect(ctx.cats.docs[0]).toMatchObject({ isStarter: true, name: 'Cleocatra', origin: 'starter' });
        expect(ctx.cats.docs[0].starterLockedAt).toBeInstanceOf(Date);
    });

    it("the buyer's later verified sign-in binds to that account instead of creating a second one", async () => {
        const ctx = createIdentityHarness();
        const created: any = await ctx.service.createUser({ email: 'Buyer@Example.COM' } as any);

        const user: any = await ctx.service.getFirebaseUser(
            googleToken({ uid: 'uid-buyer', email: 'buyer@example.com' })
        );

        expect(String(user._id)).toBe(String(created._id));
        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.cats.docs).toHaveLength(1);
    });
});

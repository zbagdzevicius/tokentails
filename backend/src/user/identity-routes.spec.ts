import { Types } from 'mongoose';
import { REWARDS } from 'src/shared-contracts/caps';
import { createIdentityHarness, guestSeed, httpError, rejection } from './guest/identity-harness.helper-spec';
import { transientGuestProfile } from './guest/starter';
import { UserController, USER_JOBS } from './user.controller';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));
// The real CatService pulls in AI and image utilities; these routes do not use it.
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));

/*
 * The HTTP layer of plan F5.5 and decision #12 on UserController: POST /user/guest/session,
 * POST /user/guest/merge, DELETE /user/guest, DELETE /user/me, POST /user/catbassadors/referral (and
 * the deprecated GET), the transient profile, "you would be #N", and the leased guest crons.
 */

const DAY = 24 * 60 * 60 * 1000;
const ENV_KEYS = ['APP_CHECK_ENFORCE', 'IDENTITY_BACKFILL_DONE'];
afterEach(() => {
    ENV_KEYS.forEach(key => delete process.env[key]);
    jest.restoreAllMocks();
});

function setup(seed: Parameters<typeof createIdentityHarness>[0] = {}) {
    const ctx = createIdentityHarness(seed);
    const controller = new UserController(
        ctx.userRepository as any,
        {} as any,
        {} as any,
        ctx.catRepository as any,
        ctx.service,
        ctx.gameRepository as any,
        {} as any,
        {} as any,
        {} as any
    );
    controller.firebase = ctx.firebase;
    return { ctx, controller };
}

const registered = (fields: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    name: 'Registered',
    email: 'target@example.com',
    firebaseUids: ['uid-target'],
    isGuest: false,
    tails: 100,
    referrals: [],
    promotedAt: new Date(),
    ...fields,
});

const req = { ip: '203.0.113.5' };

describe('GET /user/profile', () => {
    it('returns the transient template for a guest with no doc (onboarding pending)', async () => {
        const { controller, ctx } = setup();
        const transient = transientGuestProfile('uid-anon');

        await expect(controller.profile(undefined as any, transient as any)).resolves.toMatchObject({
            isGuest: true,
            transient: true,
            onboarding: { state: 'pending' },
        });
        expect(ctx.users.calls).toEqual([]);
    });

    it('adds promotedNow only on the promoting request', async () => {
        const user = registered();
        const { controller } = setup({ users: [user] });

        await expect(
            controller.profile(String(user._id), { _id: user._id, promotedNow: true } as any)
        ).resolves.toMatchObject({ promotedNow: true });
        await expect(controller.profile(String(user._id), { _id: user._id } as any)).resolves.not.toHaveProperty(
            'promotedNow'
        );
    });
});

describe('POST /user/guest/session', () => {
    it('creates the guest doc and starter for a transient guest', async () => {
        const { controller, ctx } = setup();

        await controller.guestSession(transientGuestProfile('uid-anon') as any, req);

        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.users.docs[0]).toMatchObject({ isGuest: true, firebaseUids: ['uid-anon'] });
        expect(ctx.cats.docs[0]).toMatchObject({ isGuestStarter: true });
    });

    it('is idempotent for a persisted guest', async () => {
        const { user, cat } = guestSeed('uid-anon');
        const { controller, ctx } = setup({ users: [user], cats: [cat] });

        await controller.guestSession(user as any, req);

        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.cats.docs).toHaveLength(1);
    });

    it('a registered token gets 409', async () => {
        const user = registered();
        const { controller } = setup({ users: [user] });

        expect(httpError(await rejection(controller.guestSession(user as any, req))).status).toBe(409);
    });

    it('App Check: verified when sent, required only with APP_CHECK_ENFORCE=true', async () => {
        const { controller, ctx } = setup();
        const guest = () => transientGuestProfile(`uid-${Math.random()}`) as any;

        await expect(controller.guestSession(guest(), req)).resolves.toBeTruthy();
        await expect(controller.guestSession(guest(), req, 'bogus')).resolves.toBeTruthy();
        expect(ctx.firebase.appChecks).toEqual(['bogus']);

        process.env.APP_CHECK_ENFORCE = 'true';
        expect(httpError(await rejection(controller.guestSession(guest(), req))).status).toBe(401);
        expect(httpError(await rejection(controller.guestSession(guest(), req, 'bogus'))).status).toBe(401);
        await expect(controller.guestSession(guest(), req, 'valid-app-check')).resolves.toBeTruthy();
    });
});

describe('POST /user/guest/merge', () => {
    it('requires an fb-prefixed guest token in x-guest-token', async () => {
        const target = registered();
        const { controller } = setup({ users: [target] });

        expect(httpError(await rejection(controller.mergeGuest(String(target._id)))).status).toBe(400);
        expect(httpError(await rejection(controller.mergeGuest(String(target._id), 'anon:uid-guest'))).status).toBe(
            400
        );
        expect(httpError(await rejection(controller.mergeGuest(String(target._id), 'fbnot-a-token'))).status).toBe(401);
        expect(httpError(await rejection(controller.mergeGuest(String(target._id), 'fbreg:uid-other'))).status).toBe(
            400
        );
    });

    it('merges a persisted guest into the caller and deletes the guest', async () => {
        const target = registered();
        const { user, cat } = guestSeed('uid-guest', { pendingTails: 40 });
        const { controller, ctx } = setup({ users: [target, user], cats: [cat] });

        await expect(controller.mergeGuest(String(target._id), 'fbanon:uid-guest')).resolves.toMatchObject({
            success: true,
            merged: true,
            state: 'done',
            tailsCredited: 40,
        });
        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.users.docs[0].tails).toBe(140);
        expect(ctx.firebase.deleted).toEqual(['uid-guest']);
    });

    it('a guest that never saved anything only deletes the anonymous Firebase user', async () => {
        const target = registered();
        const { controller, ctx } = setup({ users: [target] });

        await expect(controller.mergeGuest(String(target._id), 'fbanon:uid-transient')).resolves.toMatchObject({
            merged: false,
            state: 'done',
        });
        expect(ctx.firebase.deleted).toEqual(['uid-transient']);
    });

    it('refuses an anonymous token whose uid belongs to a registered account (409)', async () => {
        const target = registered();
        const other = registered({ firebaseUids: ['uid-linked'], email: 'other@example.com' });
        const { controller } = setup({ users: [target, other] });

        expect(httpError(await rejection(controller.mergeGuest(String(target._id), 'fbanon:uid-linked'))).status).toBe(
            409
        );
    });
});

describe('DELETE /user/guest and DELETE /user/me', () => {
    it('erases a persisted guest', async () => {
        const { user, cat } = guestSeed('uid-guest');
        const { controller, ctx } = setup({ users: [user], cats: [cat] });

        await controller.deleteGuest(user as any);

        expect(ctx.users.docs).toHaveLength(0);
        expect(ctx.cats.docs).toHaveLength(0);
        expect(ctx.firebase.deleted).toEqual(['uid-guest']);
    });

    it('erases a transient guest (its anonymous Firebase user)', async () => {
        const { controller, ctx } = setup();

        await controller.deleteGuest(transientGuestProfile('uid-anon') as any);

        expect(ctx.firebase.deleted).toEqual(['uid-anon']);
    });

    it('refuses a registered caller on DELETE /user/guest (409)', async () => {
        const user = registered();
        const { controller } = setup({ users: [user] });

        expect(httpError(await rejection(controller.deleteGuest(user as any))).status).toBe(409);
    });

    it('DELETE /user/me anonymises the account and writes an audit record', async () => {
        const user = registered();
        const { controller, ctx } = setup({ users: [user] });

        const result = await controller.deleteMe(String(user._id), {});

        expect(result).toMatchObject({ success: true, apple: 'skipped-no-code' });
        expect(ctx.users.docs[0]).toMatchObject({ name: 'Deleted player' });
        expect(ctx.users.docs[0].email).toBeUndefined();
        expect(ctx.users.extraCollections.get('accountdeletions')!.docs).toHaveLength(1);
    });
});

describe('POST /user/catbassadors/referral (decision #12)', () => {
    it('pays both accounts once and sets referredBy once', async () => {
        const referrer = registered({ email: 'referrer@example.com', firebaseUids: ['uid-referrer'] });
        const referred = registered({ tails: 0 });
        const { controller, ctx } = setup({ users: [referrer, referred] });

        await expect(controller.referral(String(referred._id), { referrerId: String(referrer._id) })).resolves.toEqual({
            success: true,
            tails: REWARDS.INVITE_FRIEND,
        });
        expect(
            httpError(await rejection(controller.referral(String(referred._id), { referrerId: String(referrer._id) })))
                .status
        ).toBe(409);
        // The deprecated GET follows the same rules.
        expect(
            httpError(await rejection(controller.TreferralWeb(String(referred._id), String(referrer._id)))).status
        ).toBe(409);

        const [a, b] = ctx.users.docs;
        expect(a).toMatchObject({ tails: 100 + REWARDS.INVITE_FRIEND, referralsCount: 1, monthReferrals: 1 });
        expect(b).toMatchObject({ tails: REWARDS.INVITE_FRIEND });
        expect(String(b.referredBy)).toBe(String(referrer._id));
    });
});

describe('boards and positions', () => {
    it('a guest sees "you would be #N" among registered players only', async () => {
        const { user } = guestSeed('uid-guest', { tails: 50 });
        const { controller } = setup({
            users: [
                registered({ tails: 100 }),
                registered({ tails: 10 }),
                guestSeed('uid-g2', { tails: 999 }).user,
                user,
            ],
        });

        await expect(controller.position(String(user._id), user as any)).resolves.toEqual({
            position: 2,
            wouldBe: true,
        });
    });

    it('a registered player gets a plain position that ignores guests above them', async () => {
        const me = registered({ tails: 50 });
        const { controller } = setup({ users: [me, guestSeed('uid-g', { tails: 999 }).user] });

        await expect(controller.position(String(me._id), me as any)).resolves.toEqual({ position: 1 });
    });

    it('board queries switch to the strict {isGuest: false} filter after the backfill', async () => {
        const { controller, ctx } = setup();
        const find = jest.fn(async () => []);
        (ctx.userRepository as any).find = find;

        await controller.leaderboard();
        process.env.IDENTITY_BACKFILL_DONE = 'true';
        await controller.leaderboardCatnip();

        expect((find.mock.calls[0] as any)[0].searchObject).toEqual({
            isGuest: { $ne: true },
            boardExcludedAt: { $exists: false },
            deletedAt: { $exists: false },
        });
        expect((find.mock.calls[1] as any)[0].searchObject).toMatchObject({ isGuest: false });
    });
});

describe('leased crons', () => {
    // Off by default outside NODE_ENV=production (review finding #4); these cases switch them on.
    beforeEach(() => {
        process.env.CRONS_ENABLED = 'true';
    });
    afterEach(() => {
        delete process.env.CRONS_ENABLED;
    });

    it('the daily check-in reset touches registered users only', async () => {
        const { user } = guestSeed('uid-guest', { canRedeemLives: false });
        const regular = registered({ canRedeemLives: false });
        const { controller, ctx } = setup({ users: [user, regular] });
        (ctx.userRepository as any).updateAll = (object: any, filter: any) =>
            ctx.users.updateMany(filter, { $set: object });

        await controller.resetCheckIn();

        expect(ctx.users.docs.find(doc => doc.isGuest)!.canRedeemLives).toBe(false);
        expect(ctx.users.docs.find(doc => !doc.isGuest)!.canRedeemLives).toBe(true);
    });

    it('the guest cleanup runs under its lease and deletes idle guests only', async () => {
        const old = new Date(Date.now() - 45 * DAY);
        const idle = guestSeed('uid-idle', { lastSeenAt: old });
        const { controller, ctx } = setup({ users: [idle.user, registered({ lastSeenAt: old })], cats: [idle.cat] });

        await expect(controller.cleanupGuests()).resolves.toBe('ran');

        expect(ctx.users.docs.map(doc => doc.isGuest)).toEqual([false]);
        expect(ctx.users.extraCollections.get('jobruns')!.docs[0]).toMatchObject({
            _id: USER_JOBS.GUEST_CLEANUP,
            status: 'done',
        });
    });

    it('the merge resume cron runs under its lease', async () => {
        const { controller, ctx } = setup();

        await expect(controller.resumeMerges()).resolves.toBe('ran');
        expect(ctx.users.extraCollections.get('jobruns')!.docs[0]._id).toBe(USER_JOBS.GUEST_MERGE_RESUME);
    });

    // 2a review fix #4: a dev box sharing a database with production can switch the guest crons off.
    it.each([
        ['CRONS_ENABLED=false', { CRONS_ENABLED: 'false' }],
        ['unset outside production (dev box)', { CRONS_ENABLED: undefined, NODE_ENV: 'development' }],
    ])('%s skips the guest crons: nothing deleted, no lease taken', async (_label, env) => {
        const old = new Date(Date.now() - 45 * DAY);
        const idle = guestSeed('uid-idle', { lastSeenAt: old });
        const { controller, ctx } = setup({ users: [idle.user], cats: [idle.cat] });
        const saved = { CRONS_ENABLED: process.env.CRONS_ENABLED, NODE_ENV: process.env.NODE_ENV };
        const apply = (values: Record<string, string | undefined>) =>
            Object.entries(values).forEach(([key, value]) =>
                value === undefined ? delete process.env[key] : (process.env[key] = value)
            );
        apply(env);
        try {
            await expect(controller.cleanupGuests()).resolves.toBeUndefined();
            await expect(controller.resumeMerges()).resolves.toBeUndefined();
        } finally {
            apply(saved);
        }

        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.users.extraCollections.get('jobruns')?.docs.length || 0).toBe(0);
    });
});

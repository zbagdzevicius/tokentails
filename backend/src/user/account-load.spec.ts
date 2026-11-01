import { Types } from 'mongoose';
import { AUTH_ERROR } from 'src/common/guards/auth-errors';
import {
    createIdentityHarness,
    EMAIL,
    googleToken,
    guestSeed,
    httpError,
    rejection,
    verifiedToken,
} from './guest/identity-harness.helper-spec';
import { UserController } from './user.controller';

jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Player report (Nov 1): a signed-in player saw "We couldn't load your account" for days, because
 * GET /user/profile failed the same way on every retry. These cover the per-account refusals that
 * could never clear: each now either recovers on the server or answers with a code the client can
 * explain (F5.6).
 */

const MINUTE = 60 * 1000;

describe('GET /user/profile never locks an account out', () => {
    function controllerWith(findOne: jest.Mock) {
        const controller = Object.create(UserController.prototype);
        controller.repository = { findOne };
        controller.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
        controller.userService = { claimPromotionNotice: jest.fn().mockResolvedValue(false) };
        return controller;
    }

    it('a populate that throws (bad cat, blessing or shelter reference) still answers the profile, without the cat', async () => {
        const doc = { _id: 'u1', name: 'Pat', cat: new Types.ObjectId() };
        const findOne = jest
            .fn()
            .mockRejectedValueOnce(new Error('Cast to ObjectId failed for value "x" at path "_id"'))
            .mockResolvedValueOnce(doc);
        const controller = controllerWith(findOne);

        const profile = await controller.profile('u1', { _id: 'u1' } as any);

        expect(profile).toMatchObject({ _id: 'u1', name: 'Pat', cat: null });
        expect(findOne).toHaveBeenCalledTimes(2);
        expect(findOne.mock.calls[1][0].populate).toBeUndefined();
        expect(controller.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('profile populate failed userId=u1'),
            expect.any(String)
        );
    });

    it('a resolved id without a document is 401 ACCOUNT_MISSING, never an empty 200', async () => {
        const controller = controllerWith(jest.fn().mockResolvedValue(null));

        const error = await rejection(controller.profile('u1', { _id: 'u1' } as any));

        expect(httpError(error)).toEqual({ status: 401, code: AUTH_ERROR.ACCOUNT_MISSING });
    });
});

describe('sign-in of an account that can never load', () => {
    it('a deleted account answers 401 ACCOUNT_DELETED and deletes its leftover Firebase user', async () => {
        const doc = { _id: new Types.ObjectId(), name: 'Deleted', firebaseUids: ['uid-player'], deletedAt: new Date() };
        const ctx = createIdentityHarness({ users: [doc] });

        const error = await rejection(ctx.service.getFirebaseUser(googleToken()));

        expect(httpError(error)).toEqual({ status: 401, code: AUTH_ERROR.ACCOUNT_DELETED });
        expect(ctx.firebase.deleted).toEqual(['uid-player']);
    });

    it('a disposable inbox answers 403 EMAIL_DISPOSABLE', async () => {
        const ctx = createIdentityHarness();

        const error = await rejection(
            ctx.service.getFirebaseUser(verifiedToken({ uid: 'uid-x', email: 'x@mailinator.com' }))
        );

        expect(httpError(error)).toEqual({ status: 403, code: AUTH_ERROR.EMAIL_DISPOSABLE });
    });

    describe('a guest doc stuck in a merge (mergedInto set)', () => {
        function stuck(targetFields: Record<string, unknown> | null, ageMs: number) {
            const targetId = new Types.ObjectId();
            const { user: guest, cat } = guestSeed('uid-guest', {
                mergedInto: targetId,
                mergeState: 'started',
                pendingTails: 0,
            });
            const users: any[] = [guest];
            if (targetFields) {
                users.push({
                    _id: targetId,
                    name: 'Target',
                    email: 'target@example.com',
                    isGuest: false,
                    cats: [],
                    ...targetFields,
                });
            }
            const ctx = createIdentityHarness({
                users,
                cats: [cat],
                games: [{ user: guest._id, cat: guest.cat, type: 'CATNIP_CHAOS', level: '1', points: 80 }],
            });
            ctx.users.docs.find(doc => String(doc._id) === String(guest._id))!.updatedAt = new Date(
                ctx.clock.now.getTime() - ageMs
            );
            // The player linked Google to the anonymous user, so the merge's Firebase delete keeps it.
            ctx.firebase.linked.add('uid-guest');
            return { ctx, guest, targetId };
        }

        const signIn = (ctx: ReturnType<typeof createIdentityHarness>) =>
            ctx.service.getFirebaseUser(googleToken({ uid: 'uid-guest', email: EMAIL }));

        it('a merge running right now (another tab) is 409 GUEST_MERGE_IN_PROGRESS', async () => {
            const { ctx } = stuck({}, MINUTE);

            const error = await rejection(signIn(ctx));

            expect(httpError(error)).toEqual({ status: 409, code: AUTH_ERROR.GUEST_MERGE_IN_PROGRESS });
        });

        it('a merge that stopped half way is finished at sign-in, then the sign-in goes on', async () => {
            const { ctx, guest, targetId } = stuck({}, 60 * MINUTE);

            const user: any = await signIn(ctx);

            expect(user).toMatchObject({ isGuest: false, email: EMAIL });
            expect(ctx.users.docs.find(doc => String(doc._id) === String(guest._id))).toBeUndefined();
            expect(ctx.games.docs.every(game => String(game.user) === String(targetId))).toBe(true);
        });

        it('a merge whose target account is gone is released and the guest is promoted in place', async () => {
            const { ctx, guest } = stuck(null, 60 * MINUTE);

            const user: any = await signIn(ctx);

            expect(String(user._id)).toBe(String(guest._id));
            expect(user).toMatchObject({ isGuest: false, email: EMAIL, promotedNow: true });
            expect(user.mergedInto).toBeUndefined();
        });

        it('a merge into a deleted account is released too', async () => {
            const { ctx, guest } = stuck({ deletedAt: new Date() }, 60 * MINUTE);

            const user: any = await signIn(ctx);

            expect(String(user._id)).toBe(String(guest._id));
            expect(user.isGuest).toBe(false);
        });
    });
});

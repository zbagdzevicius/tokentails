import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { AUTH_ERROR } from 'src/common/guards/auth-errors';
import {
    createIdentityHarness,
    EMAIL,
    googleToken,
    registeredToken,
    rejection,
    writes,
} from './guest/identity-harness.helper-spec';
import { isVerifiedToken } from './user.service';

// The real EncryptionService derives a key from an env secret at import time.
jest.mock('src/shared/encryption.service', () => ({
    EncryptionService: class {
        encrypt = () => ({ iv: 'iv', content: 'secret' });
    },
}));

/*
 * W1 security hotfix, F5.2 step 2.2 "no-uid rule". Anyone can create a Firebase password account for
 * someone else's address; the backend resolved users by email alone, so an unverified token took
 * over the legacy account with that email. Now an unverified token never binds to or resolves a doc
 * that does not already own its uid: 403 EMAIL_UNVERIFIED and nothing is written.
 *
 * Moved onto the in-memory model by task 2a (F5.2 replaced the repository lookups). Three cases
 * changed with F5 on purpose and say so below.
 */

const token = (overrides: Record<string, any> = {}) => registeredToken({ uid: 'uid-attacker', ...overrides });

function expectNothingWritten(ctx: ReturnType<typeof createIdentityHarness>) {
    expect(writes(ctx.users)).toEqual([]);
    expect(writes(ctx.cats)).toEqual([]);
}

describe('W1-HF: unverified token and a doc without its uid', () => {
    it('an unverified token plus a uid-less legacy doc gives 403 EMAIL_UNVERIFIED and writes nothing', async () => {
        const ctx = createIdentityHarness({ users: [{ _id: new Types.ObjectId(), name: 'Legacy', email: EMAIL }] });

        const error = await rejection(ctx.service.getFirebaseUser(token()));

        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ statusCode: 403, code: AUTH_ERROR.EMAIL_UNVERIFIED });
        expectNothingWritten(ctx);
    });

    it('an unverified token plus a doc owned by other uids gives 403 and writes nothing', async () => {
        const ctx = createIdentityHarness({
            users: [{ _id: new Types.ObjectId(), name: 'Owner', email: EMAIL, firebaseUids: ['uid-owner'] }],
        });

        const error = await rejection(ctx.service.getFirebaseUser(token()));

        expect((error.getResponse() as any).code).toBe('EMAIL_UNVERIFIED');
        expectNothingWritten(ctx);
    });

    it('treats a missing email_verified like false', async () => {
        const ctx = createIdentityHarness({ users: [{ _id: new Types.ObjectId(), name: 'Legacy', email: EMAIL }] });
        await expect(ctx.service.getFirebaseUser(token({ email_verified: undefined }))).rejects.toBeInstanceOf(
            ForbiddenException
        );
        expectNothingWritten(ctx);
    });

    it('the 403 and its code pass through AppAuthGuard unchanged', async () => {
        const ctx = createIdentityHarness({ users: [{ _id: new Types.ObjectId(), name: 'Legacy', email: EMAIL }] });
        const error = await rejection(ctx.service.getFirebaseUser(token()));

        expect(() => new AppAuthGuard(new Reflector()).handleRequest(error, false)).toThrow(error);
    });

    it('an unverified token resolves a doc that already owns its uid, without writing', async () => {
        const owned = {
            _id: new Types.ObjectId(),
            name: 'Owner',
            email: EMAIL,
            firebaseUids: ['uid-attacker'],
            // Seen today, so the at-most-daily lastSeenAt write (F5.1) does not happen either.
            lastSeenAt: new Date(),
        };
        const ctx = createIdentityHarness({ users: [owned] });

        await expect(ctx.service.getFirebaseUser(token())).resolves.toMatchObject({ _id: owned._id });
        expectNothingWritten(ctx);
    });

    // Changed by the 2a review: only email_verified counts. A Google or Apple provider with an
    // unverified primary email is refused (see the account-takeover spec below).
    it.each([
        ['email_verified', { email_verified: true }],
        ['a verified Google sign-in', { email_verified: true, firebase: { sign_in_provider: 'google.com' } }],
        ['a verified Apple sign-in', { email_verified: true, firebase: { sign_in_provider: 'apple.com' } }],
    ])('%s resolves the legacy doc by email and $addToSets its uid', async (_label, overrides) => {
        const legacy = { _id: new Types.ObjectId(), name: 'Legacy', email: EMAIL };
        const ctx = createIdentityHarness({ users: [legacy] });

        await expect(ctx.service.getFirebaseUser(token({ uid: 'uid-real', ...overrides }))).resolves.toMatchObject({
            _id: legacy._id,
        });
        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.users.docs[0].firebaseUids).toEqual(['uid-real']);
        expect(ctx.cats.docs).toHaveLength(0);
    });

    // Changed by F5.2 step 4: a verified new user gets a uid-keyed account and an unlocked SCOUT
    // starter (not the hardcoded Cleocatra), with onboarding pending for Meet your cat.
    it('new verified user creation records the uid, a wallet and one starter', async () => {
        const ctx = createIdentityHarness();

        const created: any = await ctx.service.getFirebaseUser(googleToken({ uid: 'uid-new', name: 'Pat' }));

        expect(ctx.users.docs).toHaveLength(1);
        expect(ctx.cats.docs).toHaveLength(1);
        expect(created).toMatchObject({
            name: 'Pat',
            email: EMAIL,
            firebaseUids: ['uid-new'],
            isGuest: false,
            canRedeemLives: true,
            onboarding: { state: 'pending' },
        });
        expect(created.wallets?.stellar?.walletAddress).toMatch(/^G/);
        expect(created.cats.map(String)).toEqual([String(created.cat)]);
        expect(ctx.cats.docs[0]).toMatchObject({ isStarter: true, starterBreed: 'SCOUT' });
        expect(ctx.cats.docs[0].starterLockedAt).toBeUndefined();
    });

    // Changed by F5.2 step 3: an unverified token with no account creates nothing (403). With
    // AUTH_ENFORCE_EMAIL_VERIFIED=false (rollout switch) it gets an account that resolves by uid.
    it('a new unverified user gets 403 and nothing is created; with enforcement off it resolves by uid next time', async () => {
        const ctx = createIdentityHarness();
        await expect(ctx.service.getFirebaseUser(token({ uid: 'uid-new' }))).rejects.toBeInstanceOf(ForbiddenException);
        expectNothingWritten(ctx);

        process.env.AUTH_ENFORCE_EMAIL_VERIFIED = 'false';
        try {
            const first: any = await ctx.service.getFirebaseUser(token({ uid: 'uid-new' }));
            await expect(ctx.service.getFirebaseUser(token({ uid: 'uid-new' }))).resolves.toMatchObject({
                _id: first._id,
            });
            expect(ctx.users.docs).toHaveLength(1);
            expect(first.emailVerifiedAt).toBeUndefined();
        } finally {
            delete process.env.AUTH_ENFORCE_EMAIL_VERIFIED;
        }
    });

    // Changed by F5.2: a token without a uid is refused before any lookup.
    it('never looks up by a missing uid or email (which would match any user)', async () => {
        const ctx = createIdentityHarness({
            users: [{ _id: new Types.ObjectId(), name: 'Other', email: 'other@example.com' }],
        });
        await expect(
            ctx.service.getFirebaseUser(token({ uid: undefined, email_verified: true }))
        ).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(
            ctx.service.getFirebaseUser(token({ email: undefined, email_verified: true }))
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(ctx.users.calls).toEqual([]);
    });

    it.each([
        ['google.com', undefined],
        ['google.com', false],
        ['apple.com', false],
    ])(
        'an unverified primary email with provider %s (email_verified %s) never binds a legacy doc: 403, nothing written',
        async (provider, emailVerified) => {
            // The attack: an unverified password user for the victim's address links its own Google
            // account; Firebase keeps the primary email unverified with sign_in_provider google.com.
            const legacy = { _id: new Types.ObjectId(), name: 'Victim', email: EMAIL, lastSeenAt: new Date() };
            const bound = {
                _id: new Types.ObjectId(),
                name: 'Bound',
                email: 'bound@example.com',
                firebaseUids: ['uid-owner'],
                lastSeenAt: new Date(),
            };
            const ctx = createIdentityHarness({ users: [legacy, bound] });
            for (const email of [EMAIL, 'bound@example.com']) {
                const attack = token({
                    uid: 'uid-attacker',
                    email,
                    email_verified: emailVerified,
                    firebase: { sign_in_provider: provider },
                });
                await expect(ctx.service.getFirebaseUser(attack)).rejects.toBeInstanceOf(ForbiddenException);
            }
            expectNothingWritten(ctx);
            expect(ctx.users.docs.find(doc => doc.name === 'Victim')?.firebaseUids).toBeUndefined();
            expect(ctx.users.docs.find(doc => doc.name === 'Bound')?.firebaseUids).toEqual(['uid-owner']);
        }
    );

    it('isVerifiedToken trusts email_verified === true only', () => {
        expect(isVerifiedToken(token({ email_verified: true }))).toBe(true);
        expect(isVerifiedToken(token({ firebase: { sign_in_provider: 'google.com' } }))).toBe(false);
        expect(isVerifiedToken(token({ firebase: { sign_in_provider: 'apple.com' } }))).toBe(false);
        expect(isVerifiedToken(token())).toBe(false);
        expect(isVerifiedToken(token({ email_verified: 'true' }))).toBe(false);
        expect(isVerifiedToken(token({ firebase: { sign_in_provider: 'anonymous' } }))).toBe(false);
    });
});

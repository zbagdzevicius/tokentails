import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { AuthStrategy } from './auth-app.strategy';
import { UNAUTHORIZED } from './constants';

jest.mock('firebase-admin', () => ({ auth: jest.fn() }));
// The real UserService pulls in Mongoose models; the strategy only needs getFirebaseUser.
jest.mock('../user.service', () => ({ UserService: class {}, ANONYMOUS_PROVIDER: 'anonymous' }));

const verifyIdToken = jest.fn();
const getFirebaseUser = jest.fn();

// Passport runs each request on Object.create(strategy) with these actions attached.
function createRequestStrategy(accesstoken?: string) {
    const strategy = new AuthStrategy({ getFirebaseUser } as any);
    const perRequest = Object.create(strategy);
    perRequest.success = jest.fn();
    perRequest.fail = jest.fn();
    perRequest.error = jest.fn();
    perRequest.pass = jest.fn();
    perRequest.redirect = jest.fn();

    const req = { headers: accesstoken === undefined ? {} : { accesstoken } };

    return { perRequest, run: () => perRequest.authenticate(req) };
}

function outcomes(perRequest: any) {
    return {
        success: perRequest.success.mock.calls.length,
        fail: perRequest.fail.mock.calls.length,
        error: perRequest.error.mock.calls.length,
    };
}

describe('AppAuthStrategy (appauth)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (admin.auth as jest.Mock).mockReturnValue({ verifyIdToken });
    });

    it('fails with 401 when no token is sent', async () => {
        const { perRequest, run } = createRequestStrategy();
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail).toHaveBeenCalledWith(UNAUTHORIZED, 401);
    });

    it('fails with 401 for a token without the fb prefix', async () => {
        const { perRequest, run } = createRequestStrategy('query_id=abc&user=%7B%7D&hash=123');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail).toHaveBeenCalledWith(UNAUTHORIZED, 401);
        expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('fails with 401 when the prefix is present but the token is empty', async () => {
        const { perRequest, run } = createRequestStrategy('fb');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(verifyIdToken).not.toHaveBeenCalled();
    });

    it('fails once when Firebase rejects the token', async () => {
        verifyIdToken.mockRejectedValue(new Error('auth/id-token-expired'));
        const { perRequest, run } = createRequestStrategy('fbexpired');
        await run();

        expect(verifyIdToken).toHaveBeenCalledWith('expired', false);
        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail.mock.calls[0][1]).toBe(401);
    });

    it('answers 401 once for a non-anonymous Firebase token without an email', async () => {
        verifyIdToken.mockResolvedValue({ uid: 'u1', firebase: { sign_in_provider: 'password' } });
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        // The UnauthorizedException is passed on unchanged, so the client still gets 401.
        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 0, error: 1 });
        expect(perRequest.error.mock.calls[0][0]).toBeInstanceOf(UnauthorizedException);
        expect(getFirebaseUser).not.toHaveBeenCalled();
    });

    it('resolves an anonymous token (no email) as a guest (F5.2 step 1)', async () => {
        const decoded = { uid: 'anon-1', firebase: { sign_in_provider: 'anonymous' } };
        const transient = { isGuest: true, transient: true, firebaseUid: 'anon-1' };
        verifyIdToken.mockResolvedValue(decoded);
        getFirebaseUser.mockResolvedValue(transient);
        const { perRequest, run } = createRequestStrategy('fbanon');
        await run();

        expect(getFirebaseUser).toHaveBeenCalledWith(decoded, { ip: 'unknown' });
        expect(outcomes(perRequest)).toEqual({ success: 1, fail: 0, error: 0 });
        expect(perRequest.success).toHaveBeenCalledWith(transient, transient);
    });

    it('passes the client IP (req.ips first, as the throttler does) to user resolution', async () => {
        const decoded = { uid: 'u1', email: 'player@example.com', firebase: { sign_in_provider: 'google.com' } };
        verifyIdToken.mockResolvedValue(decoded);
        getFirebaseUser.mockResolvedValue({ _id: 'user-1' });
        const strategy = new AuthStrategy({ getFirebaseUser } as any);
        const perRequest = Object.create(strategy);
        perRequest.success = jest.fn();
        perRequest.fail = jest.fn();
        perRequest.error = jest.fn();
        await perRequest.authenticate({ headers: { accesstoken: 'fbvalid' }, ips: ['203.0.113.7'], ip: '10.0.0.1' });

        expect(getFirebaseUser).toHaveBeenCalledWith(decoded, { ip: '203.0.113.7' });
    });

    it('passes an HttpException from user resolution on unchanged (403 EMAIL_UNVERIFIED)', async () => {
        verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'player@example.com', firebase: {} });
        const forbidden = new ForbiddenException({ statusCode: 403, code: 'EMAIL_UNVERIFIED' });
        getFirebaseUser.mockRejectedValue(forbidden);
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 0, error: 1 });
        expect(perRequest.error).toHaveBeenCalledWith(forbidden);
    });

    it('keeps any other resolution error a plain 401', async () => {
        verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'player@example.com', firebase: {} });
        getFirebaseUser.mockRejectedValue(new Error('Mongo is down'));
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail.mock.calls[0][1]).toBe(401);
    });

    it('succeeds once, and never also fails, for a valid token with an email', async () => {
        const decoded = { uid: 'u1', email: 'player@example.com', firebase: { sign_in_provider: 'google.com' } };
        const user = { _id: 'user-1' };
        verifyIdToken.mockResolvedValue(decoded);
        getFirebaseUser.mockResolvedValue(user);
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(getFirebaseUser).toHaveBeenCalledWith(decoded, { ip: 'unknown' });
        expect(outcomes(perRequest)).toEqual({ success: 1, fail: 0, error: 0 });
        expect(perRequest.success).toHaveBeenCalledWith(user, user);
    });

    it('fails once when no user can be resolved for a valid token', async () => {
        verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'player@example.com', firebase: {} });
        getFirebaseUser.mockResolvedValue(null);
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail).toHaveBeenCalledWith(UNAUTHORIZED, 401);
    });

    it('fails once when Firebase Admin is not initialised', async () => {
        (admin.auth as jest.Mock).mockImplementation(() => {
            throw new Error('The default Firebase app does not exist.');
        });
        const { perRequest, run } = createRequestStrategy('fbvalid');
        jest.spyOn(perRequest.logger, 'error').mockImplementation(() => undefined);
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
    });
});

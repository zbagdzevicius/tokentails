import * as admin from 'firebase-admin';
import { AuthStrategy } from './auth-app.strategy';
import { UNAUTHORIZED } from './constants';

jest.mock('firebase-admin', () => ({ auth: jest.fn() }));
// The real UserService pulls in Mongoose models; the strategy only needs getFirebaseUser.
jest.mock('../user.service', () => ({ UserService: class {} }));

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

    it('fails once for a Firebase token without an email', async () => {
        verifyIdToken.mockResolvedValue({ uid: 'u1', firebase: { sign_in_provider: 'anonymous' } });
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(outcomes(perRequest)).toEqual({ success: 0, fail: 1, error: 0 });
        expect(perRequest.fail.mock.calls[0][1]).toBe(401);
        expect(getFirebaseUser).not.toHaveBeenCalled();
    });

    it('succeeds once, and never also fails, for a valid token with an email', async () => {
        const decoded = { uid: 'u1', email: 'player@example.com', firebase: { sign_in_provider: 'google.com' } };
        const user = { _id: 'user-1' };
        verifyIdToken.mockResolvedValue(decoded);
        getFirebaseUser.mockResolvedValue(user);
        const { perRequest, run } = createRequestStrategy('fbvalid');
        await run();

        expect(getFirebaseUser).toHaveBeenCalledWith(decoded);
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

import { ConflictException, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AllowGuest } from '../decorators/allow-guest.decorator';
import { AppAuthGuard } from './app-auth.guard';
import { AUTH_ERROR, GUEST_SESSION_REQUIRED_STATUS } from './auth-errors';

class Routes {
    registeredOnly() {
        return 1;
    }

    @AllowGuest()
    guestWithSession() {
        return 1;
    }

    @AllowGuest({ transient: true })
    anyGuest() {
        return 1;
    }
}

function context(handler: keyof Routes) {
    const request: Record<string, unknown> = {};
    return {
        request,
        ctx: {
            getHandler: () => Routes.prototype[handler],
            getClass: () => Routes,
            switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        } as any,
    };
}

async function activate(user: Record<string, unknown> | undefined, handler: keyof Routes) {
    const { ctx, request } = context(handler);
    // The passport step is stubbed; it sets req.user the way the appauth strategy would.
    jest.spyOn(AuthGuard('appauth').prototype, 'canActivate').mockImplementation(async function (this: any) {
        request.user = user;
        return true;
    });
    return new AppAuthGuard(new Reflector()).canActivate(ctx);
}

async function codeOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        const body = (error as HttpException).getResponse() as { code?: string };
        return { status: (error as HttpException).getStatus(), code: body?.code };
    }
    return null;
}

afterEach(() => jest.restoreAllMocks());

describe('AppAuthGuard', () => {
    it('extends the appauth passport guard', () => {
        expect(new AppAuthGuard(new Reflector())).toBeInstanceOf(AuthGuard('appauth'));
    });

    it.each(['registeredOnly', 'guestWithSession', 'anyGuest'] as const)('admits a registered user on %s', async h => {
        await expect(activate({ _id: 'u1', isGuest: false }, h)).resolves.toBe(true);
    });

    it('denies a guest on a route without @AllowGuest with 403 GUEST_FORBIDDEN', async () => {
        await expect(codeOf(activate({ _id: 'g1', isGuest: true }, 'registeredOnly'))).resolves.toEqual({
            status: 403,
            code: AUTH_ERROR.GUEST_FORBIDDEN,
        });
    });

    it('denies a transient guest on a route without @AllowGuest with 403', async () => {
        await expect(codeOf(activate({ isGuest: true, transient: true }, 'registeredOnly'))).resolves.toEqual({
            status: 403,
            code: AUTH_ERROR.GUEST_FORBIDDEN,
        });
    });

    it('admits a persisted guest on @AllowGuest()', async () => {
        await expect(activate({ _id: 'g1', isGuest: true }, 'guestWithSession')).resolves.toBe(true);
    });

    it('answers a transient guest on @AllowGuest() with 428 GUEST_SESSION_REQUIRED', async () => {
        await expect(codeOf(activate({ isGuest: true, transient: true }, 'guestWithSession'))).resolves.toEqual({
            status: GUEST_SESSION_REQUIRED_STATUS,
            code: AUTH_ERROR.GUEST_SESSION_REQUIRED,
        });
        expect(GUEST_SESSION_REQUIRED_STATUS).toBe(428);
    });

    it('admits a transient guest on @AllowGuest({ transient: true })', async () => {
        await expect(activate({ isGuest: true, transient: true }, 'anyGuest')).resolves.toBe(true);
    });

    describe('handleRequest', () => {
        const guard = new AppAuthGuard(new Reflector());

        it('returns the user', () => {
            const user = { _id: 'u1' };
            expect(guard.handleRequest(null, user)).toBe(user);
        });

        it.each([
            ['403 EMAIL_UNVERIFIED', new ForbiddenException({ code: 'EMAIL_UNVERIFIED' })],
            ['409', new ConflictException({ code: 'ACCOUNT_CONFLICT' })],
            ['401', new UnauthorizedException()],
        ])('rethrows a %s HttpException unchanged', (_label, error) => {
            expect(() => guard.handleRequest(error, false)).toThrow(error);
        });

        it('turns any other error or a missing user into 401', () => {
            expect(() => guard.handleRequest(new Error('auth/id-token-expired'), false)).toThrow(UnauthorizedException);
            expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedException);
            expect(() => guard.handleRequest(undefined, undefined)).toThrow(UnauthorizedException);
        });
    });
});

describe('auth error codes', () => {
    it('use the same literals as the repo-root shared/errors.ts (F5.6)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { existsSync, readFileSync } = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { join } = require('path');
        const shared = join(__dirname, '..', '..', '..', '..', 'shared', 'errors.ts');
        if (!existsSync(shared)) {
            return;
        }
        const source = readFileSync(shared, 'utf8');
        Object.entries(AUTH_ERROR).forEach(([key, value]) => expect(source).toContain(`${key}: '${value}'`));
    });
});

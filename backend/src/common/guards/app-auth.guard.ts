import { ExecutionContext, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_GUEST_KEY, AllowGuestOptions } from '../decorators/allow-guest.decorator';
import { guestForbidden, guestSessionRequired } from './auth-errors';

/**
 * The one auth guard (plan F5.4). Replaces every raw `AuthGuard('appauth')`.
 *
 * - Verifies the `fb`-prefixed Firebase token in the lowercase `accesstoken` header through the
 *   `appauth` strategy and sets `req.user`.
 * - Denies guests by default: `req.user.isGuest` without `@AllowGuest()` is 403 GUEST_FORBIDDEN, and
 *   a transient guest (no guest document yet) without `@AllowGuest({ transient: true })` is 428
 *   GUEST_SESSION_REQUIRED.
 * - Rethrows `HttpException`s from the strategy unchanged, so 403 and 409 codes such as
 *   EMAIL_UNVERIFIED reach the client. Anything else, including a bad or expired token, is 401.
 *
 * Guards that read `req.user` (PermissionGuard, LiveGameUserThrottleGuard) are listed after it.
 */
@Injectable()
export class AppAuthGuard extends AuthGuard('appauth') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        await super.canActivate(context);

        const user = context.switchToHttp().getRequest().user;
        if (!user?.isGuest && !user?.transient) {
            return true;
        }

        const allowGuest = this.reflector.getAllAndOverride<AllowGuestOptions | undefined>(ALLOW_GUEST_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!allowGuest) {
            throw guestForbidden();
        }
        if (user.transient && !allowGuest.transient) {
            throw guestSessionRequired();
        }
        return true;
    }

    handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
        if (err instanceof HttpException) {
            throw err;
        }
        if (err || !user) {
            throw new UnauthorizedException();
        }
        return user;
    }
}

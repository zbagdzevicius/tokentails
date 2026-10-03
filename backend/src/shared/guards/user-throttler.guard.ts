import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';

export interface UserThrottleOptions {
    /** Requests per user per window. */
    limit: number;
    /** Window in milliseconds. */
    ttl: number;
}

export const USER_THROTTLE_KEY = 'tt:user-throttle';

/** Per-user limit read by `UserThrottlerGuard`. Without it the guard applies DEFAULT_USER_THROTTLE. */
export const UserThrottle = (options: UserThrottleOptions) => SetMetadata(USER_THROTTLE_KEY, options);

export const DEFAULT_USER_THROTTLE: UserThrottleOptions = { limit: 10, ttl: 60000 };

/**
 * Per-user rate limit (plan G5 P4), tracking `req.user._id` instead of the IP. The global
 * `AppThrottlerGuard` counts per IP, so on its own it lets one account spread requests over many
 * addresses, or locks out everyone behind one NAT. Used on POST /shelter/donate and, later, pledges.
 *
 * Runs after `AppAuthGuard`, which sets `req.user`: `@UseGuards(AppAuthGuard, UserThrottlerGuard)`.
 * Fails closed: without a user id there is no bucket, so the request is refused, never let through.
 * Buckets are per route (class and handler), so limits on two routes never share a count.
 */
@Injectable()
export class UserThrottlerGuard implements CanActivate {
    constructor(
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const userId = http.getRequest().user?._id;
        if (!userId) {
            throw new UnauthorizedException();
        }
        const options =
            this.reflector.getAllAndOverride<UserThrottleOptions | undefined>(USER_THROTTLE_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) || DEFAULT_USER_THROTTLE;
        const key = `user-throttle:${context.getClass().name}.${context.getHandler().name}:${String(userId)}`;
        const { totalHits, timeToExpire } = await this.storage.increment(key, options.ttl);
        if (totalHits > options.limit) {
            http.getResponse().header('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        return true;
    }
}

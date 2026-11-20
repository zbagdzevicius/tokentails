import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { clientIp } from '../client-ip';

export interface ClientIpThrottleOptions {
    /** Requests per client address per window. */
    limit: number;
    /** Window in milliseconds. */
    ttl: number;
}

export const CLIENT_IP_THROTTLE_KEY = 'tt:client-ip-throttle';

/** Per-client-address limit read by `ClientIpThrottlerGuard`. Without it the guard applies the default. */
export const ClientIpThrottle = (options: ClientIpThrottleOptions) => SetMetadata(CLIENT_IP_THROTTLE_KEY, options);

export const DEFAULT_CLIENT_IP_THROTTLE: ClientIpThrottleOptions = { limit: 30, ttl: 60000 };

/** The bucket of a request with no usable address; the AI gate refuses it in production. */
export const UNKNOWN_CLIENT_IP_BUCKET = 'unknown';

/** The bucket of `req`: the client address key (shared/client-ip.ts), or the unknown bucket. */
export function clientIpBucket(req: any, env: NodeJS.ProcessEnv = process.env): string {
    return clientIp(req, env)?.key ?? UNKNOWN_CLIENT_IP_BUCKET;
}

/** Throttle scopes of the Paw Legends game routes (every Paw Legends controller names its scope `Pawlegends…`). */
export const PLAYER_SCOPE = /^Pawlegends/;
/** A Paw Legends request with no account behind it counts per address at this many times the route's limit. */
export const PLAYER_ANON_IP_FACTOR = 10;

/**
 * The bucket and limit of one request. Paw Legends routes (founder, 2026-11-20: "lift such restrictions") count per
 * player, never per address: a signed-in caller or guest (`req.user`, set by AppAuthGuard before the handler) is keyed
 * by its account id at the route's limit, and a caller without one by its address at PLAYER_ANON_IP_FACTOR times the
 * limit (a carrier NAT, a school or a home wifi puts many players behind one address). Every other scope keeps the
 * per-address bucket.
 */
export function throttleBucket(
    scope: string,
    req: any,
    options: ClientIpThrottleOptions,
    env: NodeJS.ProcessEnv = process.env
): { key: string; limit: number } {
    if (!PLAYER_SCOPE.test(scope)) return { key: clientIpBucket(req, env), limit: options.limit };
    const id = req?.user?._id ?? req?.user?.id;
    if (id) return { key: `acct:${String(id)}`, limit: options.limit };
    return { key: clientIpBucket(req, env), limit: options.limit * PLAYER_ANON_IP_FACTOR };
}

/**
 * Per-client-address burst limit (bet #3, docs/plans/yourcat-v2.md section 2.2), the `UserThrottlerGuard`
 * pattern keyed on `clientIp(req).key` instead of the user (the Cloudflare client address, else the
 * Express address; shared/client-ip.ts). In memory, per replica, like the other throttlers.
 *
 * Routes that use it carry `@SkipThrottle()` for the global guard. It does not read `req.user`. Buckets
 * are per route (class and handler).
 */
@Injectable()
export class ClientIpThrottlerGuard implements CanActivate {
    constructor(
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options =
            this.reflector.getAllAndOverride<ClientIpThrottleOptions | undefined>(CLIENT_IP_THROTTLE_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) || DEFAULT_CLIENT_IP_THROTTLE;
        const http = context.switchToHttp();
        await this.consume(
            `${context.getClass().name}.${context.getHandler().name}`,
            http.getRequest(),
            options,
            http.getResponse()
        );
        return true;
    }

    /**
     * Counts one request of `req` in the `scope` bucket and throws 429 above the limit. Also called
     * from a public handler (GET /yourcat/status), where a guard list would have to start with
     * `AppAuthGuard`.
     */
    async consume(scope: string, req: any, options: ClientIpThrottleOptions, res?: any): Promise<void> {
        const { key, limit } = throttleBucket(scope, req, options);
        const { totalHits, timeToExpire } = await this.storage.increment(
            `client-ip-throttle:${scope}:${key}`,
            options.ttl
        );
        if (totalHits > limit) {
            res?.header?.('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
    }
}

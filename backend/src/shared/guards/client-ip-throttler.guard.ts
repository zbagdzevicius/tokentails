import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { clientIp, UNTRUSTED_IP_BUCKET } from '../client-ip';

export interface ClientIpThrottleOptions {
    /** Requests per client address per window. */
    limit: number;
    /** Window in milliseconds. */
    ttl: number;
    /**
     * Requests per window for the one bucket every unprovable address shares in production
     * (`UNTRUSTED_IP_BUCKET`). Default: `limit * 10`.
     */
    untrustedLimit?: number;
}

export const CLIENT_IP_THROTTLE_KEY = 'tt:client-ip-throttle';

/** Per-client-address limit read by `ClientIpThrottlerGuard`. Without it the guard applies the default. */
export const ClientIpThrottle = (options: ClientIpThrottleOptions) => SetMetadata(CLIENT_IP_THROTTLE_KEY, options);

export const DEFAULT_CLIENT_IP_THROTTLE: ClientIpThrottleOptions = { limit: 30, ttl: 60000 };

/** The bucket of a request with no usable address; the AI gate refuses it in production. */
export const UNKNOWN_CLIENT_IP_BUCKET = 'unknown';

const isProduction = (env: NodeJS.ProcessEnv) => env.NODE_ENV === 'production';

/**
 * The bucket of `req`: the proven client address; in production an unproven one (a raw
 * `cf-connecting-ip` that anyone can send straight to the origin) shares `UNTRUSTED_IP_BUCKET`; outside
 * production the unproven address is used as is (local development has no Cloudflare in front).
 */
export function clientIpBucket(req: any, env: NodeJS.ProcessEnv = process.env): string {
    const ip = clientIp(req, env);
    if (!ip) {
        return UNKNOWN_CLIENT_IP_BUCKET;
    }
    return ip.trusted || !isProduction(env) ? ip.key : UNTRUSTED_IP_BUCKET;
}

/**
 * Per-client-address burst limit (bet #3, docs/plans/yourcat-v2.md section 2.2), the `UserThrottlerGuard`
 * pattern keyed on `clientIp(req).key` instead of the user. The global `AppThrottlerGuard` keys on
 * `req.ips[0] || req.ip`, which is one site-wide bucket while TRUST_PROXY is unset; this guard reads the
 * Cloudflare client address (shared/client-ip.ts). In production an address that is not proven to come
 * through Cloudflare goes to one shared bucket with its own, larger limit (known issue KI-07). In memory,
 * per replica, like the other throttlers.
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
        const key = clientIpBucket(req);
        const limit = key === UNTRUSTED_IP_BUCKET ? options.untrustedLimit ?? options.limit * 10 : options.limit;
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

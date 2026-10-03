import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { GameType } from 'src/shared-contracts/enums';
import { isUsableClientIp, requestIp } from '../guest/ip-throttle';
import { isProxyUntrusted } from './proxy-warning';

/**
 * Per-IP limit on Heist replays (plan F6 "Replay CPU bound"). Guests are free to create, so the
 * per-player `/live` limit does not bound how many replays one machine can ask for; this bucket is
 * keyed on the client address instead and counts only requests that would replay (a CATNIP_HEIST
 * type or any `replay` field). Plain score saves never touch it.
 *
 * 30 a minute: a human needs 30 s or more per level (the shortest golden run is 973 ticks), so a
 * shared address (school, carrier NAT) still fits a dozen players at once. Listed right after
 * AppAuthGuard (every guarded route runs auth first, src/guard-migration.spec.ts); the global
 * per-IP AppThrottlerGuard runs before both.
 *
 * The address is `req.ips[0]` only when Express `trust proxy` is set (TRUST_PROXY, see
 * src/shared/trust-proxy.ts). Without it, behind a load balancer every client would share one
 * bucket of 30 a minute for the whole service, so an address that cannot identify a client
 * (`isUsableClientIp`: private, loopback, link-local, CGNAT, unknown) is keyed per player as
 * `${ip}:${userId}` instead (review 3b finding 2). That fallback is for development and for the odd
 * unusable address behind a trusted proxy: with NODE_ENV=production and TRUST_PROXY unset, guests are
 * free and per-player buckets do not bound a script, so replays are refused with 503 before any
 * bucket or simulation (review 3b sixth pass, finding 1), and main.ts logs an error at startup.
 * In-process storage like the global throttler: the effective limit is per replica.
 */
export const HEIST_REPLAY_IP_THROTTLE = { limit: 30, ttl: 60000 };

/** True for a `/live` body that would run a Heist replay. */
export const wantsReplay = (body: unknown): boolean => {
    if (!body || typeof body !== 'object') {
        return false;
    }
    const record = body as { type?: unknown; replay?: unknown };
    return record.type === GameType.CATNIP_HEIST || record.replay !== undefined;
};

/** The throttle key: the client address, or address plus player when the address is shared. */
export function heistReplayBucket(req: { ips?: string[]; ip?: string; user?: { _id?: unknown } }): string {
    const ip = requestIp(req);
    if (isUsableClientIp(ip)) {
        return `heist-replay-ip:${ip}`;
    }
    return `heist-replay-ip:${ip}:${String(req?.user?._id ?? 'anonymous')}`;
}

@Injectable()
export class HeistReplayIpThrottleGuard implements CanActivate {
    /** Read per request; a field (not a constructor argument) so Nest DI does not try to inject it. */
    env: NodeJS.ProcessEnv = process.env;

    constructor(@InjectThrottlerStorage() private readonly storage: ThrottlerStorage) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const req = http.getRequest();
        if (!wantsReplay(req.body)) {
            return true;
        }
        if (isProxyUntrusted(this.env)) {
            throw new ServiceUnavailableException(
                'Heist saves are unavailable: the server cannot identify client addresses (TRUST_PROXY unset)'
            );
        }
        const { limit, ttl } = HEIST_REPLAY_IP_THROTTLE;
        const { totalHits, timeToExpire } = await this.storage.increment(heistReplayBucket(req), ttl);
        if (totalHits > limit) {
            // The throttler floors the remaining time to whole seconds; never tell a client 0.
            http.getResponse().header('Retry-After', String(Math.max(1, Math.ceil(Number(timeToExpire) || 0))));
            throw new ThrottlerException();
        }
        return true;
    }
}

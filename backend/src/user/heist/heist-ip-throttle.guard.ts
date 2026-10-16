import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { GameType } from 'src/shared-contracts/enums';
import { clientIp } from 'src/shared/client-ip';
import { requestIp } from '../guest/ip-throttle';

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
 * The address is `clientIp(req)` (src/shared/client-ip.ts): a usable `cf-connecting-ip`, else the
 * Express address, which the default `trust proxy` setting resolves past our own hops with no env.
 * When no address can identify a client (development, or the odd private address), the request is
 * keyed per player as `${ip}:${userId}` instead (review 3b finding 2), so one bucket is never shared
 * by the whole service. Replays are never refused for a missing proxy setting. A caller who reaches the
 * origin directly can forge `cf-connecting-ip` (accepted risk, docs/BACKEND.md "Known issues").
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
export function heistReplayBucket(
    req: { ips?: string[]; ip?: string; headers?: Record<string, unknown>; user?: { _id?: unknown } },
    env: NodeJS.ProcessEnv = process.env
): string {
    const client = clientIp(req, env);
    if (client && client.ip !== 'dev') {
        return `heist-replay-ip:${client.key}`;
    }
    return `heist-replay-ip:${requestIp(req)}:${String(req?.user?._id ?? 'anonymous')}`;
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
        const { limit, ttl } = HEIST_REPLAY_IP_THROTTLE;
        const { totalHits, timeToExpire } = await this.storage.increment(heistReplayBucket(req, this.env), ttl);
        if (totalHits > limit) {
            // The throttler floors the remaining time to whole seconds; never tell a client 0.
            http.getResponse().header('Retry-After', String(Math.max(1, Math.ceil(Number(timeToExpire) || 0))));
            throw new ThrottlerException();
        }
        return true;
    }
}

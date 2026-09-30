import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { LIVE_GAME_USER_THROTTLE } from './dto/live-game.dto';

/**
 * Per-player limit for `POST /user/catbassadors/live`. The global `AppThrottlerGuard` tracks by IP,
 * so on its own it either lets one player spam saves or locks out everyone sharing an address.
 * Runs after `AuthGuard('appauth')`, which sets `req.user`.
 */
@Injectable()
export class LiveGameUserThrottleGuard implements CanActivate {
    constructor(@InjectThrottlerStorage() private readonly storage: ThrottlerStorage) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const userId = http.getRequest().user?._id;
        if (!userId) {
            return true;
        }
        const { limit, ttl } = LIVE_GAME_USER_THROTTLE;
        const { totalHits, timeToExpire } = await this.storage.increment(`live-game-user:${userId}`, ttl);
        if (totalHits > limit) {
            http.getResponse().header('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        return true;
    }
}

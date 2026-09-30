import { ValidationPipe } from '@nestjs/common';
import { IsEnum, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GamePlatform, MAX_MATCH3_SCORE_PER_LEVEL, scoredGameTypes, ScoredGameType } from 'src/game/game.schema';

/** Longest game `time` accepted, in seconds. Paw Match levels run for minutes; the other modes send 0. */
export const MAX_LIVE_GAME_TIME = 24 * 60 * 60;

/**
 * Per-IP limit on level-end saves. Loose, because players behind carrier NAT, a school or an office,
 * or behind the load balancer when TRUST_PROXY is unset, share one address.
 * Shared by the route decorator and its spec.
 */
export const LIVE_GAME_THROTTLE = { limit: 120, ttl: 60000 };

/** Per-player limit on level-end saves, enforced after auth by `LiveGameUserThrottleGuard`. */
export const LIVE_GAME_USER_THROTTLE = { limit: 30, ttl: 60000 };

/**
 * Body of `POST /user/catbassadors/live`, the only write path for game scores.
 *
 * `GameContext.gameStopCallback` in the client sends `{ type, points, score, time, level }`, plus
 * `platform` from newer builds. Per-level caps are checked in `resolveLiveGame`
 * (`src/user/utils/live-game.ts`), because they depend on `type` and `level`.
 */
export class LiveGameDto {
    @IsIn(scoredGameTypes)
    type: ScoredGameType;

    /** Catnip (Purrsuit, Paw Match) or hearts (Cupid Cat) earned in the run. */
    @IsInt()
    @Min(0)
    points: number;

    /** Paw Match raw score. Ignored for the other types. */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(MAX_MATCH3_SCORE_PER_LEVEL)
    score?: number;

    // No lower bound: current Paw Match clients send the elapsed run time (getMatch3RunTime, never
    // negative), but older clients sent `timeLimit - timeLeft`, which goes negative after a streak
    // bonus. The row stores it clamped to 0.
    @IsOptional()
    @IsNumber({ allowNaN: false, allowInfinity: false })
    @Max(MAX_LIVE_GAME_TIME)
    time?: number;

    @IsOptional()
    @IsString()
    @MaxLength(8)
    level?: string;

    /** Listed in the documented body but ignored: the row always gets the caller's current cat. */
    @IsOptional()
    @IsMongoId()
    cat?: string;

    /** Absent from clients built before the field existed; stored as `web`. */
    @IsOptional()
    @IsEnum(GamePlatform)
    platform?: GamePlatform;
}

/**
 * Route-level pipe for `/live`. Unknown fields such as `user`, `tails` or a Mongo operator are
 * rejected, so the raw body can never reach the `Game` row or the user update.
 */
export const liveGamePipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});

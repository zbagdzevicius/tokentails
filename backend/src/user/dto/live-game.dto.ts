import { ArgumentMetadata, BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
    IsDefined,
    IsEnum,
    IsIn,
    IsInt,
    IsMongoId,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { GamePlatform, GameType, liveGameTypes, LiveGameType, MAX_MATCH3_SCORE_PER_LEVEL } from 'src/game/game.schema';
import { LIVE_GAME_OUTCOMES, LiveGameOutcome } from 'src/shared-contracts/enums';
import { ErrorCode } from 'src/shared-contracts/errors';
import { HeistReplayDto } from '../heist/heist-replay.dto';
import { heistSimErrorDetail } from '../heist/heist-sim-info';

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
 * Largest JSON body `/live` accepts (plan F6), applied by a route parser registered before the
 * global 50 MB one (`src/user/heist/live-body-limit.ts`). The golden Heist logs are 1 to 2 KB; a
 * 10-minute log that changes input every 4 ticks is about 55 KB.
 */
export const LIVE_GAME_BODY_LIMIT = '64kb';

const isHeist = (body: { type?: unknown }) => body.type === GameType.CATNIP_HEIST;

/**
 * Body of `POST /user/catbassadors/live`, the only write path for game scores.
 *
 * `GameContext.gameStopCallback` in the client sends `{ type, points, score, time, level }`, plus
 * `platform` from newer builds and `outcome` (plan F6). Per-level caps are checked in
 * `resolveLiveGame` (`src/user/utils/live-game.ts`), because they depend on `type` and `level`.
 *
 * `CATNIP_HEIST` saves carry a `replay` (the run's input log) and nothing the client says about the
 * result is used: the server replays the log and takes score, stars and time from its own run
 * (`src/user/heist/heist-live.ts`, plan G2 layer 2).
 */
export class LiveGameDto {
    @IsIn(liveGameTypes)
    type: LiveGameType;

    /** Catnip (Purrsuit, Paw Match) or hearts (Cupid Cat) earned in the run. Ignored for CATNIP_HEIST. */
    @ValidateIf(body => !isHeist(body))
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

    /**
     * How the run ended (plan F6, G10). `won` on a level that is not INFINITE marks it cleared.
     * Client-asserted like `points`: it unlocks levels, never catnip. Absent from older clients.
     */
    @IsOptional()
    @IsIn(LIVE_GAME_OUTCOMES)
    outcome?: LiveGameOutcome;

    /** The Heist input log. Required for CATNIP_HEIST; refused on every other type. */
    @ValidateIf(body => isHeist(body) || body.replay !== undefined)
    @IsDefined()
    @IsObject()
    @ValidateNested()
    @Type(() => HeistReplayDto)
    replay?: HeistReplayDto;
}

/** `property.child: constraint message` for every failed constraint, as Nest's default pipe lists them. */
function flattenErrors(errors: ValidationError[], parent = ''): { path: string; messages: string[] }[] {
    return errors.flatMap(error => {
        const path = parent ? `${parent}.${error.property}` : error.property;
        const own = error.constraints ? [{ path, messages: Object.values(error.constraints) }] : [];
        return [...own, ...flattenErrors(error.children || [], path)];
    });
}

/**
 * The 400 of a body that fails validation: Nest's usual `{statusCode, message[], error}`, plus an F5.6
 * `code` when the Heist log is at fault, so the client can tell a stale sim (`HEIST_SIM_VERSION`,
 * purge the queued run with a message) from a bad log (`HEIST_REPLAY_INVALID`, drop it).
 */
export function liveGameValidationError(errors: ValidationError[]): BadRequestException {
    const failed = flattenErrors(errors);
    const message = failed.flatMap(({ path, messages }) =>
        messages.map(text => (path.includes('.') ? `${path.slice(0, path.lastIndexOf('.') + 1)}${text}` : text))
    );
    const replayFailures = failed.filter(({ path }) => path === 'replay' || path.startsWith('replay.'));
    const code = replayFailures.some(({ path }) => path === 'replay.simVersion')
        ? ErrorCode.HEIST_SIM_VERSION
        : replayFailures.length
        ? ErrorCode.HEIST_REPLAY_INVALID
        : undefined;
    return new BadRequestException({
        statusCode: 400,
        message,
        error: 'Bad Request',
        ...(code ? { code, ...heistSimErrorDetail() } : {}),
    });
}

/**
 * Route-level pipe for `/live`. Unknown fields such as `user`, `tails` or a Mongo operator are
 * rejected, so the raw body can never reach the `Game` row or the user update.
 */
export const liveGamePipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: liveGameValidationError,
});

/**
 * The global pipe of main.ts (`transform: true`, no whitelist). Global pipes run before route pipes,
 * so for a DTO whose route has its own strict pipe the global one would reject first, with Nest's
 * plain 400 and without the F5.6 `code` the route pipe adds. DTOs listed here are left to their
 * route pipe (which validates and transforms them itself); every other body behaves as before.
 */
export class AppValidationPipe extends ValidationPipe {
    static readonly routeValidated = new Set<unknown>([LiveGameDto]);

    protected toValidate(metadata: ArgumentMetadata): boolean {
        if (AppValidationPipe.routeValidated.has(metadata.metatype)) {
            return false;
        }
        return super.toValidate(metadata);
    }
}

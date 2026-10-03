import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { HEIST_LEVEL_CAPS, HEIST_LEVELS, HEIST_STAR_MASK } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { canonicalLogKey, HeistVerifyResult, LEVELS, TICK_HZ, verifyRun } from 'src/vendor/heist-sim';
import { LiveGameDto } from '../dto/live-game.dto';
import {
    arrayGuardPipeline,
    HEIST_SCORE_FIELD,
    HEIST_STARS_FIELD,
    IGameTotalsRepository,
    IHeistTotals,
    ILiveGameRow,
    isSafeArray,
    normalizeHeistScores,
    normalizeHeistStars,
    recomputeHeistTotals,
} from '../utils/live-game';
import { FailedReplayCache, failedHeistReplays } from './failed-replay-cache';
import { heistSimErrorDetail } from './heist-sim-info';
import { heistReplayQueue, ReplayQueue } from './replay-queue';

/**
 * The replay-verified branch of `POST /user/catbassadors/live` for CATNIP_HEIST (plan G2 layer 2,
 * F6). There is no other Heist route: this is still the one score writer.
 *
 * 1. The DTO already checked the log's shape (seed 1, current sim version, two known cats, run and
 *    tick bounds). The digest of the canonical log is looked up first: a log that already failed
 *    verification (bounded in-memory cache) gets the same 400 again, and a log that already saved,
 *    from any account, is 409 HEIST_DUPLICATE, both without replaying it. When the saved row is the
 *    caller's own (a resend, or a row the guest merge moved over), its score and stars are re-applied
 *    to the caller's arrays first, so a 409 never leaves progress missing.
 * 2. `verifyRun` (the vendored sim) replays it through the bounded queue: 429 with Retry-After when
 *    the queue is full, before any simulation. It enforces the per-level tick cap, a win, and a win on
 *    the last tick; failures are 400 with HEIST_REPLAY_INVALID, HEIST_NOT_WON, HEIST_TRAILING_INPUT
 *    or HEIST_SIM_VERSION.
 * 3. The `Game` row takes the server's score, time and `outcome: 'won'`, never the client's `points`,
 *    and carries the globally unique `replayDigest` (a parallel duplicate loses on the index: 409).
 * 4. The user gets `$max heistScore.i`, `$bit heistStars.i {or}` and `lastPlayedAt`, after a
 *    conditional `$set` turned missing arrays into arrays. Nothing else: no catnip, no
 *    `totalCatnipCap` share, no loot-drop eligibility (decision #14) and no lives (decision #17).
 */

export interface IHeistLiveDeps {
    users: IGameTotalsRepository;
    games: {
        findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
        create(row: Record<string, unknown>): Promise<any>;
        delete?(id: string): Promise<unknown>;
    };
    queue?: ReplayQueue;
    /** Digests that failed verification (default: the process-wide cache). */
    failures?: FailedReplayCache;
    verify?: (log: unknown) => HeistVerifyResult;
    now?: () => Date;
}

export interface IHeistLiveResult extends IHeistTotals {
    levelId: string;
    levelIndex: number;
    /** Server score of this run. */
    score: number;
    /** Stars (bitmask) this run earned. */
    stars: number;
    /** Stars this run added to the ones already held. */
    newStars: number;
    /** Best score held for the level after this run. */
    best: number;
}

const heistError = (code: ErrorCode, message: string) =>
    new BadRequestException({
        statusCode: 400,
        message,
        error: 'Bad Request',
        code,
        // Which sim rejected it, so a client can tell "my sim is newer" from "my log is bad".
        ...(code === ErrorCode.HEIST_SIM_VERSION || code === ErrorCode.HEIST_REPLAY_INVALID
            ? heistSimErrorDetail()
            : {}),
    });

export const heistDuplicate = () =>
    new ConflictException({
        statusCode: 409,
        message: 'This heist run is already saved',
        error: 'Conflict',
        code: ErrorCode.HEIST_DUPLICATE,
    });

/** sha256 of the canonical log (`canonicalLogKey`): what `Game.replayDigest` stores. */
export const replayDigest = (replay: Parameters<typeof canonicalLogKey>[0]): string =>
    createHash('sha256').update(canonicalLogKey(replay)).digest('hex');

const isDuplicateKey = (error: unknown) => (error as { code?: unknown } | undefined)?.code === 11000;

/** Makes the user's Heist arrays safe targets for a dotted `$max` / `$bit`. */
async function guardHeistArrays(users: IGameTotalsRepository, userId: string, user: Record<string, any>) {
    const slots = HEIST_LEVELS.length;
    if (!isSafeArray(user[HEIST_SCORE_FIELD]) || !isSafeArray(user[HEIST_STARS_FIELD], slots)) {
        await users.update(
            userId,
            arrayGuardPipeline([HEIST_SCORE_FIELD], [{ field: HEIST_STARS_FIELD, length: slots }]) as any
        );
    }
}

/**
 * A duplicate of the caller's own saved run: re-applies that row's score and stars (idempotent
 * `$max` / `$bit`). Repairs progress a guest merge did not carry over; writes no row and no
 * `lastPlayedAt` (nothing was played).
 */
async function restoreOwnRun(users: IGameTotalsRepository, userId: string, saved: Record<string, any>) {
    const index = HEIST_LEVELS.indexOf(saved.level);
    const score = Math.min(HEIST_LEVEL_CAPS[index] ?? 0, Math.max(0, Math.floor(Number(saved.score) || 0)));
    const stars = Math.max(0, Math.floor(Number(saved.stars) || 0)) & HEIST_STAR_MASK;
    if (index < 0 || (!score && !stars)) {
        return;
    }
    const user = await users.findOne({
        searchObject: { _id: userId },
        projection: `${HEIST_SCORE_FIELD} ${HEIST_STARS_FIELD}`,
    });
    if (!user) {
        return;
    }
    const held = normalizeHeistScores(user[HEIST_SCORE_FIELD])[index];
    const heldStars = normalizeHeistStars(user[HEIST_STARS_FIELD])[index];
    if (held >= score && (heldStars & stars) === stars) {
        return;
    }
    await guardHeistArrays(users, userId, user);
    await users.update(userId, {
        $max: { [`${HEIST_SCORE_FIELD}.${index}`]: score },
        ...(stars ? { $bit: { [`${HEIST_STARS_FIELD}.${index}`]: { or: stars } } } : {}),
    });
    await recomputeHeistTotals(users, userId);
}

export async function saveHeistRun(deps: IHeistLiveDeps, userId: string, body: LiveGameDto): Promise<IHeistLiveResult> {
    const replay = body.replay;
    if (!replay) {
        throw heistError(ErrorCode.HEIST_REPLAY_INVALID, 'replay is required for CATNIP_HEIST');
    }
    if (body.level !== undefined && body.level !== replay.levelId) {
        throw heistError(ErrorCode.HEIST_REPLAY_INVALID, 'level must match replay.levelId');
    }
    if (body.outcome !== undefined && body.outcome !== 'won') {
        throw heistError(ErrorCode.HEIST_NOT_WON, 'Only won heists are saved');
    }

    const digest = replayDigest(replay);
    const failures = deps.failures || failedHeistReplays;
    const failed = failures.get(digest);
    if (failed) {
        // The sim is deterministic: the same canonical log fails the same way. No replay, no queue slot.
        throw heistError(failed.code as ErrorCode, failed.reason);
    }
    const saved = await deps.games.findOne({
        searchObject: { replayDigest: digest },
        projection: '_id user level score stars',
    });
    if (saved) {
        if (saved.user && String(saved.user) === String(userId)) {
            await restoreOwnRun(deps.users, userId, saved);
        }
        throw heistDuplicate();
    }

    // Throws the 429 synchronously when the queue is full: nothing has been simulated.
    const verify = deps.verify || verifyRun;
    const result = await (deps.queue || heistReplayQueue).run(() => verify(replay));
    if (!result.ok) {
        failures.set(digest, { code: result.code, reason: result.reason });
        throw heistError(result.code as ErrorCode, result.reason);
    }
    const level = LEVELS[result.levelIndex];
    if (!level || HEIST_LEVELS[result.levelIndex] !== result.levelId) {
        // The vendored sim and shared/caps.ts disagree on the campaign: refuse rather than misfile.
        throw heistError(ErrorCode.HEIST_REPLAY_INVALID, 'unknown level');
    }

    const user = await deps.users.findOne({
        searchObject: { _id: userId },
        projection: `cat ${HEIST_SCORE_FIELD} ${HEIST_STARS_FIELD}`,
    });
    if (!user) {
        throw new BadRequestException('User not found');
    }

    await guardHeistArrays(deps.users, userId, user);

    const row: ILiveGameRow = {
        type: GameType.CATNIP_HEIST,
        level: result.levelId,
        points: result.score,
        score: result.score,
        time: Math.round((result.ticks / TICK_HZ) * 100) / 100,
        platform: body.platform ?? GamePlatform.WEB,
        outcome: 'won',
        replayDigest: digest,
        stars: result.stars,
    };
    let created: any;
    try {
        created = await deps.games.create({ ...row, cat: user.cat, user: user._id });
    } catch (error) {
        if (isDuplicateKey(error)) {
            throw heistDuplicate();
        }
        throw error;
    }

    const index = result.levelIndex;
    try {
        await deps.users.update(userId, {
            $max: { [`${HEIST_SCORE_FIELD}.${index}`]: result.score },
            $bit: { [`${HEIST_STARS_FIELD}.${index}`]: { or: result.stars } },
            $set: { lastPlayedAt: (deps.now || (() => new Date()))() },
        });
    } catch (error) {
        // The row is the dedupe lock; without the progress write it would only block a retry.
        if (created?._id && deps.games.delete) {
            await deps.games.delete(String(created._id)).catch(() => undefined);
        }
        throw error;
    }

    const totals = await recomputeHeistTotals(deps.users, userId);
    const heldBefore = normalizeHeistStars(user[HEIST_STARS_FIELD])[index];
    return {
        levelId: result.levelId,
        levelIndex: index,
        score: result.score,
        stars: result.stars,
        newStars: result.stars & ~heldBefore,
        best: totals.heistScore[index],
        ...totals,
    };
}

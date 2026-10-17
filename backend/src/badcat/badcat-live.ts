import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { GamePlatform, GameType } from 'src/game/game.schema';
import { ErrorCode } from 'src/shared-contracts/errors';
import { FailedReplayCache, FAILED_HEIST_REPLAYS } from 'src/user/heist/failed-replay-cache';
import { heistReplayQueue, ReplayQueue } from 'src/user/heist/replay-queue';
import { ILiveGameRow } from 'src/user/utils/live-game';
import {
    BadcatVerifyResult,
    canonicalLogKey,
    catCodeOk,
    cleanName,
    dayNoUtc,
    TICK_HZ,
    verifyRanked,
} from 'src/vendor/badcat-sim';
import { Env } from './badcat-flags';
import { badcatSimErrorDetail } from './badcat-sim-info';
import { BadcatRunDto } from './badcat-run.dto';

/**
 * The replay-verified BAD_CAT branch of `POST /user/catbassadors/live` (GDD 10 Phase 2). There is no other Bad Cat
 * score route: this is still the one score writer (always on).
 *
 * 1. The DTO checked the log's shape (current sim version, input runs within one boss run). The day must be open:
 *    the UTC day, yesterday or tomorrow (players' local days), or up to `BADCAT_SCORE_GRACE_DAYS` (0..7, default 1)
 *    more days back for a run queued offline.
 * 2. The digest of the canonical log is looked up first: a log that already failed is the same 400 again, a log that
 *    already saved (from any account) is 409 BADCAT_DUPLICATE, both without replaying it.
 * 3. One ranked run per player and day: a second save for the same day is 409 BADCAT_ALREADY_RANKED (the partial
 *    unique index `badcat_user_day_unique` also stops a parallel one).
 * 4. `verifyRanked` (the vendored sim) replays it through the shared bounded replay queue (429 with Retry-After when
 *    full). The row takes the server's score, time and stamp, never the client's.
 * 5. The user document is not touched except `lastPlayedAt`: no catnip, no Tails, no board reward. Guests may save
 *    (their rows move with the guest merge) but never appear on the board (`src/badcat/badcat-board.service.ts`).
 */

export interface IBadcatLiveDeps {
    users: {
        findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
        update(id: string, update: Record<string, unknown>): Promise<unknown>;
    };
    games: {
        findOne(params: { searchObject: Record<string, unknown>; projection?: string }): Promise<any>;
        create(row: Record<string, unknown>): Promise<any>;
    };
    queue?: ReplayQueue;
    failures?: FailedReplayCache;
    verify?: (log: unknown) => BadcatVerifyResult;
    now?: () => Date;
    env?: Env;
}

export interface IBadcatLiveResult {
    dayNo: number;
    score: number;
    stamp: string;
    rank: string;
    ticks: number;
    /** The server's state hash after the run (the client compares it with its own). */
    finalHash: number;
    hashMatch?: boolean;
    /** `d<dayNo>`: the `Game.level` of the row. */
    level: string;
}

/** The process-wide cache of failed Bad Cat digests (same bounds as the Heist's). */
export const failedBadcatReplays = new FailedReplayCache(FAILED_HEIST_REPLAYS);

export const badcatLevel = (dayNo: number) => `d${dayNo}`;

const badcatError = (code: string, message: string) =>
    new BadRequestException({
        statusCode: 400,
        message,
        error: 'Bad Request',
        code,
        ...(code === ErrorCode.BADCAT_SIM_VERSION || code === ErrorCode.BADCAT_REPLAY_INVALID
            ? badcatSimErrorDetail()
            : {}),
    });

const conflict = (code: string, message: string) =>
    new ConflictException({ statusCode: 409, message, error: 'Conflict', code });

const isDuplicateKey = (error: unknown) => (error as { code?: unknown } | undefined)?.code === 11000;

/** sha256 of the canonical log: what `Game.replayDigest` stores for a BAD_CAT row. */
export const badcatDigest = (log: Pick<BadcatRunDto, 'dayNo' | 'simVersion' | 'runs'>): string =>
    createHash('sha256').update(canonicalLogKey(log)).digest('hex');

/** `BADCAT_SCORE_GRACE_DAYS` (0..7, default 1): extra days back a queued ranked run may still save. */
export function scoreGraceDays(env: Env = process.env): number {
    const raw = Number(env.BADCAT_SCORE_GRACE_DAYS);
    return Number.isInteger(raw) && raw >= 0 && raw <= 7 ? raw : 1;
}

export async function saveBadcatRun(
    deps: IBadcatLiveDeps,
    userId: string,
    body: { type?: unknown; badcat?: BadcatRunDto; replay?: unknown; platform?: GamePlatform }
): Promise<IBadcatLiveResult> {
    const env = deps.env || process.env;
    const log = body.badcat;
    if (!log) throw badcatError(ErrorCode.BADCAT_REPLAY_INVALID, 'badcat is required for BAD_CAT');
    if (body.replay !== undefined) throw badcatError(ErrorCode.BADCAT_REPLAY_INVALID, 'replay is for CATNIP_HEIST');

    const now = (deps.now || (() => new Date()))();
    const today = dayNoUtc(now.getTime());
    if (log.dayNo > today + 1 || log.dayNo < today - 1 - scoreGraceDays(env)) {
        throw badcatError(ErrorCode.BADCAT_DAY_CLOSED, `Day ${log.dayNo} is not open for ranked runs`);
    }

    const digest = badcatDigest(log);
    const failures = deps.failures || failedBadcatReplays;
    const failed = failures.get(digest);
    if (failed) throw badcatError(failed.code, failed.reason);
    const level = badcatLevel(log.dayNo);
    const saved = await deps.games.findOne({ searchObject: { replayDigest: digest }, projection: '_id user' });
    if (saved) throw conflict(ErrorCode.BADCAT_DUPLICATE, 'This run is already saved');
    const mine = await deps.games.findOne({
        searchObject: { type: GameType.BAD_CAT, user: userId, level },
        projection: '_id score',
    });
    if (mine) throw conflict(ErrorCode.BADCAT_ALREADY_RANKED, 'Your ranked run of this day is already saved');

    const verify = deps.verify || verifyRanked;
    const result = await (deps.queue || heistReplayQueue).run(() => verify(log));
    if (!result.ok) {
        failures.set(digest, { code: result.code, reason: result.reason });
        throw badcatError(result.code, result.reason);
    }

    const user = await deps.users.findOne({ searchObject: { _id: userId }, projection: 'cat' });
    if (!user) throw new BadRequestException('User not found');

    const catName = cleanName(log.name ?? '', 12);
    const row: ILiveGameRow = {
        type: GameType.BAD_CAT,
        level,
        points: result.score,
        score: result.score,
        time: Math.round((result.ticks / TICK_HZ) * 100) / 100,
        platform: body.platform ?? GamePlatform.WEB,
        outcome: result.caught ? 'died' : 'won',
        replayDigest: digest,
        stamp: result.stamp,
        ...(log.catCode && catCodeOk(log.catCode) ? { catCode: log.catCode } : {}),
        ...(catName ? { catName } : {}),
    };
    try {
        await deps.games.create({ ...row, cat: user.cat, user: user._id });
    } catch (error) {
        if (isDuplicateKey(error)) {
            const keys = Object.keys((error as { keyPattern?: Record<string, unknown> }).keyPattern || {});
            throw keys.includes('replayDigest')
                ? conflict(ErrorCode.BADCAT_DUPLICATE, 'This run is already saved')
                : conflict(ErrorCode.BADCAT_ALREADY_RANKED, 'Your ranked run of this day is already saved');
        }
        throw error;
    }
    await deps.users.update(userId, { $set: { lastPlayedAt: now } });

    return {
        dayNo: result.dayNo,
        score: result.score,
        stamp: result.stamp,
        rank: result.rank,
        ticks: result.ticks,
        finalHash: result.finalHash,
        ...(result.hashMatch !== undefined ? { hashMatch: result.hashMatch } : {}),
        level,
    };
}

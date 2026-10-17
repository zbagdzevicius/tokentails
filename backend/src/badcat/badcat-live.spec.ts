import { HttpException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Types } from 'mongoose';
import { GameType } from 'src/game/game.schema';
import { MemoryModel, memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { liveGamePipe, LiveGameDto } from 'src/user/dto/live-game.dto';
import { wantsReplay } from 'src/user/heist/heist-ip-throttle.guard';
import { resolveLiveGame } from 'src/user/utils/live-game';
import { SIM_VERSION } from 'src/vendor/badcat-sim';
import { badcatDigest, saveBadcatRun, scoreGraceDays } from './badcat-live';

/*
 * The BAD_CAT branch of POST /user/catbassadors/live (GDD 10 Phase 2): off by default, replay-verified, one ranked
 * run per player and day, duplicates refused without a replay, the server's score only.
 */

const golden = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'badcat-golden.json'), 'utf8'));
const RUN = golden.runs[0];
const ON = { BADCAT_ENABLED: 'true', BADCAT_SCORES_ENABLED: 'true' };
/** A moment inside the golden run's day (UTC noon). */
const DAY_NOON = (dayNo: number) => new Date(Date.UTC(2026, 10, 16 + dayNo - 1, 12));

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
        return 'ok';
    } catch (error) {
        if (error instanceof HttpException) {
            const body = error.getResponse() as { code?: string };
            return `${error.getStatus()} ${body.code ?? ''}`.trim();
        }
        throw error;
    }
};

function harness(env: Record<string, string> = ON) {
    const userId = new Types.ObjectId();
    const users = new MemoryModel([{ _id: userId, cat: new Types.ObjectId() }]);
    const games = new MemoryModel(
        [],
        [
            { fields: ['replayDigest'], partial: { replayDigest: { $exists: true } } },
            { fields: ['user', 'level'], partial: { type: 'BAD_CAT' } },
        ]
    );
    const failures = new FailedReplayCache({ maxEntries: 100, ttlMs: 60_000 });
    const verify = jest.fn((log: unknown) => jest.requireActual('src/vendor/badcat-sim').verifyRanked(log));
    const deps = {
        users: memoryRepository(users) as any,
        games: memoryRepository(games) as any,
        queue: new ReplayQueue({ concurrency: 1, maxQueued: 4 }),
        failures,
        verify,
        now: () => DAY_NOON(RUN.dayNo),
        env,
    };
    return { userId: String(userId), users, games, deps, verify, failures };
}

const body = (extra: Record<string, unknown> = {}) => ({
    type: GameType.BAD_CAT,
    badcat: {
        dayNo: RUN.dayNo,
        simVersion: SIM_VERSION,
        runs: RUN.runs,
        finalHash: RUN.finalHash,
        name: 'Mochi',
        ...extra,
    },
});

describe('POST /user/catbassadors/live, type BAD_CAT', () => {
    it('is off unless BADCAT_ENABLED and BADCAT_SCORES_ENABLED', async () => {
        const h = harness({ BADCAT_ENABLED: 'true' });
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body() as any))).toBe('404 BADCAT_SCORES_OFF');
        expect(h.games.docs).toHaveLength(0);
    });

    it('saves the server replay result, not the client claim', async () => {
        const h = harness();
        const res = await saveBadcatRun(h.deps, h.userId, body({ score: 99_999_999 }) as any);
        expect(res).toMatchObject({
            dayNo: RUN.dayNo,
            score: RUN.score,
            stamp: RUN.stamp,
            finalHash: RUN.finalHash,
            hashMatch: true,
        });
        expect(h.games.docs).toHaveLength(1);
        expect(h.games.docs[0]).toMatchObject({
            type: 'BAD_CAT',
            level: `d${RUN.dayNo}`,
            score: RUN.score,
            points: RUN.score,
            stamp: RUN.stamp,
            catName: 'Mochi',
            replayDigest: badcatDigest(body().badcat as any),
        });
        expect(h.users.docs[0].lastPlayedAt).toBeInstanceOf(Date);
        // No catnip, Tails or arrays on the user.
        expect(Object.keys(h.users.docs[0]).sort()).toEqual(['_id', 'cat', 'createdAt', 'lastPlayedAt', 'updatedAt']);
    });

    it('allows one ranked run per player and day, and one save per log', async () => {
        const h = harness();
        await saveBadcatRun(h.deps, h.userId, body() as any);
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body() as any))).toBe('409 BADCAT_DUPLICATE');
        const other = new Types.ObjectId();
        h.users.docs.push({ _id: other, cat: null });
        expect(await codeOf(saveBadcatRun(h.deps, String(other), body() as any))).toBe('409 BADCAT_DUPLICATE');
        // A different log of the same day by the same player.
        const alt = [...RUN.runs.slice(0, -1), [0, 0, 1, 1], RUN.runs[RUN.runs.length - 1]];
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body({ runs: alt }) as any))).toBe(
            '409 BADCAT_ALREADY_RANKED'
        );
        expect(h.verify).toHaveBeenCalledTimes(1);
    });

    it('refuses closed days and caches failed logs', async () => {
        const h = harness();
        h.deps.now = () => DAY_NOON(RUN.dayNo + 5);
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body() as any))).toBe('400 BADCAT_DAY_CLOSED');
        h.deps.now = () => DAY_NOON(RUN.dayNo);
        const trailing = [...RUN.runs, [1, 2, 0, 80]];
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body({ runs: trailing }) as any))).toBe(
            '400 BADCAT_TRAILING_INPUT'
        );
        expect(await codeOf(saveBadcatRun(h.deps, h.userId, body({ runs: trailing }) as any))).toBe(
            '400 BADCAT_TRAILING_INPUT'
        );
        expect(h.verify).toHaveBeenCalledTimes(1);
        expect(h.games.docs).toHaveLength(0);
    });

    it('reads BADCAT_SCORE_GRACE_DAYS within 0..7 (default 1)', () => {
        expect(scoreGraceDays({})).toBe(1);
        expect(scoreGraceDays({ BADCAT_SCORE_GRACE_DAYS: '3' })).toBe(3);
        expect(scoreGraceDays({ BADCAT_SCORE_GRACE_DAYS: '30' })).toBe(1);
    });
});

describe('the /live DTO and the plain path with BAD_CAT', () => {
    const validate = (raw: unknown) =>
        liveGamePipe.transform(raw, { type: 'body', metatype: LiveGameDto }).then(
            () => 'ok',
            (error: HttpException) => {
                const res = error.getResponse() as { code?: string };
                return `${error.getStatus()} ${res.code ?? ''}`.trim();
            }
        );

    it('accepts a BAD_CAT body without points and checks the log shape', async () => {
        expect(await validate(body())).toBe('ok');
        expect(await validate({ ...body(), badcat: { ...body().badcat, simVersion: SIM_VERSION - 1 } })).toBe(
            '400 BADCAT_SIM_VERSION'
        );
        expect(await validate({ ...body(), badcat: { ...body().badcat, runs: [[9, 0, 0, 1]] } })).toBe(
            '400 BADCAT_REPLAY_INVALID'
        );
        expect(await validate({ type: GameType.BAD_CAT })).toBe('400 BADCAT_REPLAY_INVALID');
        expect(await validate({ ...body(), badcat: { ...body().badcat, owner: 'x' } })).toBe(
            '400 BADCAT_REPLAY_INVALID'
        );
    });

    it('never lets a BAD_CAT log through the plain points path', () => {
        expect(() => resolveLiveGame({ type: GameType.BAD_CAT, points: 5 } as any)).toThrow(/BAD_CAT/);
        expect(() => resolveLiveGame({ type: GameType.MATCH_3, points: 5, level: '1', badcat: {} } as any)).toThrow(
            /BAD_CAT/
        );
    });

    it('counts BAD_CAT bodies in the per-IP replay bucket', () => {
        expect(wantsReplay({ type: GameType.BAD_CAT })).toBe(true);
        expect(wantsReplay({ type: GameType.MATCH_3, badcat: {} })).toBe(true);
        expect(wantsReplay({ type: GameType.MATCH_3 })).toBe(false);
    });
});

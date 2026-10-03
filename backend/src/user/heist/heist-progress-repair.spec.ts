import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HEIST_LEVEL_CAPS, HEIST_LEVELS } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { GameType } from 'src/game/game.schema';
import { verifyRun } from 'src/vendor/heist-sim';
import { LiveGameDto } from '../dto/live-game.dto';
import { guestProgressUpdate, mergeGuestProgress, recomputeAfterGuestMerge } from '../utils/live-game';
import { FailedReplayCache } from './failed-replay-cache';
import { FakeGames, FakeUsers } from './fake-live-store.helper-spec';
import { goldenLog, withRuns } from './heist-test-logs.helper-spec';
import { saveHeistRun } from './heist-live';
import { ReplayQueue } from './replay-queue';

/*
 * Review fixes of task 3b:
 * - a guest's cleared flags and Heist progress survive the guest merge (recomputeAfterGuestMerge);
 * - a resent log the caller already owns (e.g. a row the merge moved) restores progress, still 409;
 * - a losing log is replayed once, then answered from the failed-digest cache.
 */

const codeOf = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;

async function rejection(promise: Promise<unknown>) {
    return promise.then(
        () => {
            throw new Error('expected a rejection');
        },
        error => error
    );
}

const body = (replay: unknown) => ({ type: GameType.CATNIP_HEIST, replay } as unknown as LiveGameDto);

function deps(users = new FakeUsers(), games = new FakeGames(), verify = jest.fn(verifyRun)) {
    return {
        users,
        games,
        verify,
        failures: new FailedReplayCache({ maxEntries: 100, ttlMs: 60_000 }),
        queue: new ReplayQueue({ concurrency: 1, maxQueued: 4 }),
    };
}

/** A users model for `recomputeAfterGuestMerge` over the fake store's docs. */
const guestFinder = (users: FakeUsers) => ({
    find: jest.fn((filter: Record<string, any>) => ({
        lean: async () =>
            [...users.docs.values()].filter(
                doc =>
                    doc.isGuest === filter.isGuest &&
                    doc.mergeState === filter.mergeState &&
                    String(doc.mergedInto) === String(filter.mergedInto)
            ),
    })),
});

describe('guest merge carries cleared state and Heist progress', () => {
    it('a guest with a won level and Heist stars merges into an account without the arrays: both survive', async () => {
        const users = new FakeUsers();
        const targetId = users.add({});
        const guestId = users.add({
            isGuest: true,
            mergeState: 'gamesMoved',
            mergedInto: new Types.ObjectId(targetId),
            // Purrsuit 01 is INFINITE (never cleared, even if a bad value says so), 02 won.
            catnipChaosCleared: [1, 1],
            match3Cleared: [0, 0, 1],
            heistScore: [180, 0, 210],
            heistStars: [5, 0, 3],
        });

        const totals = await recomputeAfterGuestMerge(users, guestFinder(users))(targetId);

        const target = users.get(targetId);
        expect(target.catnipChaosCleared.slice(0, 2)).toEqual([0, 1]);
        expect(target.match3Cleared.slice(0, 3)).toEqual([0, 0, 1]);
        expect(target.heistScore.slice(0, 3)).toEqual([180, 0, 210]);
        expect(target.heistStars.slice(0, 3)).toEqual([5, 0, 3]);
        expect(totals.catnipChaosCleared[1]).toBe(1);
        expect(totals.heistStars[0]).toBe(5);
        // Every array is a real array of full length, never a sub-document.
        for (const field of ['catnipChaosCleared', 'seasonEventCleared', 'match3Cleared', 'heistScore', 'heistStars']) {
            expect(Array.isArray(target[field])).toBe(true);
        }
        expect(target.heistStars).toHaveLength(HEIST_LEVELS.length);
        expect(users.get(guestId).isGuest).toBe(true);
    });

    it('ORs stars and maxes scores into an account that already has progress, idempotently', async () => {
        const users = new FakeUsers();
        const targetId = users.add({ heistScore: [200, 50], heistStars: [3, 1], catnipChaosCleared: [0, 0, 1] });
        users.add({
            isGuest: true,
            mergeState: 'gamesMoved',
            mergedInto: new Types.ObjectId(targetId),
            heistScore: [150, 90],
            heistStars: [5, 0],
            catnipChaosCleared: [0, 1, 0],
        });
        const recompute = recomputeAfterGuestMerge(users, guestFinder(users));

        await recompute(targetId);
        const once = JSON.parse(JSON.stringify(users.get(targetId)));
        await recompute(targetId);

        const target = users.get(targetId);
        expect(target.heistScore.slice(0, 2)).toEqual([200, 90]);
        // 3 | 5 = 7: a $max would have kept 5 and lost the coins star.
        expect(target.heistStars.slice(0, 2)).toEqual([7, 1]);
        expect(target.catnipChaosCleared.slice(0, 3)).toEqual([0, 1, 1]);
        expect(JSON.parse(JSON.stringify(target))).toEqual(once);
    });

    it('only merges guests at the gamesMoved step for this target', async () => {
        const users = new FakeUsers();
        const targetId = users.add({});
        const otherId = users.add({});
        users.add({
            isGuest: true,
            mergeState: 'gamesMoved',
            mergedInto: new Types.ObjectId(otherId),
            heistStars: [1],
        });
        users.add({ isGuest: true, mergeState: 'started', mergedInto: new Types.ObjectId(targetId), heistStars: [1] });

        await recomputeAfterGuestMerge(users, guestFinder(users))(targetId);

        // Nothing to carry: the target's missing array is not created (review 3b finding 6).
        expect(users.get(targetId).heistStars).toBeUndefined();
    });

    it('normalises the guest values: caps, star mask, INFINITE, nothing to carry is no write', async () => {
        const update = guestProgressUpdate({
            heistScore: [999999],
            heistStars: [255],
            catnipChaosCleared: [1],
        });
        expect(update).toEqual({ $max: { 'heistScore.0': HEIST_LEVEL_CAPS[0] }, $bit: { 'heistStars.0': { or: 7 } } });

        const users = new FakeUsers();
        const targetId = users.add({});
        expect(await mergeGuestProgress(users, { heistScore: [0], catnipChaosCleared: [1] }, targetId)).toBe(false);
        expect(users.update).not.toHaveBeenCalled();
    });
});

describe('Heist resend of an owned run, and the failed-digest cache', () => {
    it('stores the run stars on the row', async () => {
        const d = deps();
        const userId = d.users.add();
        const result = await saveHeistRun(d, userId, body(goldenLog('heist-01')));
        expect(d.games.rows[0].stars).toBe(result.stars);
    });

    it('a duplicate of the caller own row restores lost progress and is still 409', async () => {
        const d = deps();
        const userId = d.users.add();
        const log = goldenLog('heist-02');
        const saved = await saveHeistRun(d, userId, body(log));
        // A merge that did not carry the arrays: the row is the caller's, the progress is gone.
        d.users.get(userId).heistScore = [];
        delete d.users.get(userId).heistStars;
        d.verify.mockClear();

        const error = await rejection(saveHeistRun(d, userId, body(log)));

        expect(error).toBeInstanceOf(ConflictException);
        expect(codeOf(error)).toBe(ErrorCode.HEIST_DUPLICATE);
        expect(d.verify).not.toHaveBeenCalled();
        expect(d.games.rows).toHaveLength(1);
        const user = d.users.get(userId);
        expect(user.heistScore[1]).toBe(saved.score);
        expect(user.heistStars[1]).toBe(saved.stars);
        expect(user.heistStars).toHaveLength(HEIST_LEVELS.length);
    });

    it('a duplicate from another account writes nothing to the caller', async () => {
        const d = deps();
        const owner = d.users.add();
        const other = d.users.add();
        const log = goldenLog('heist-03');
        await saveHeistRun(d, owner, body(log));
        const updatesBefore = d.users.updates.length;

        const error = await rejection(saveHeistRun(d, other, body(log)));

        expect(codeOf(error)).toBe(ErrorCode.HEIST_DUPLICATE);
        expect(d.users.updates.length).toBe(updatesBefore);
        expect(d.users.get(other).heistScore).toBeUndefined();
    });

    it('a second identical losing log never calls verify and gets the same 400', async () => {
        const d = deps();
        const userId = d.users.add();
        const full = goldenLog('heist-04');
        const losing = withRuns(full, full.runs.slice(0, -1));

        const first = await rejection(saveHeistRun(d, userId, body(losing)));
        expect(first).toBeInstanceOf(BadRequestException);
        expect(d.verify).toHaveBeenCalledTimes(1);
        expect(d.failures.size).toBe(1);

        const second = await rejection(saveHeistRun(d, userId, body(losing)));
        const third = await rejection(saveHeistRun(d, d.users.add(), body(losing)));

        expect(d.verify).toHaveBeenCalledTimes(1);
        expect(codeOf(second)).toBe(codeOf(first));
        expect(codeOf(third)).toBe(codeOf(first));
        expect((second as HttpException).getStatus()).toBe(400);
        expect(d.games.create).not.toHaveBeenCalled();
    });

    it('a cached failure skips the queue: no slot is taken even when the queue is full', async () => {
        const d = deps();
        const losing = withRuns(goldenLog('heist-05'), goldenLog('heist-05').runs.slice(0, -1));
        await rejection(saveHeistRun(d, d.users.add(), body(losing)));
        const run = jest.spyOn(d.queue, 'run');

        await rejection(saveHeistRun(d, d.users.add(), body(losing)));

        expect(run).not.toHaveBeenCalled();
    });
});

describe('FailedReplayCache bounds', () => {
    it('drops the least recently used entry past maxEntries and expires entries after ttl', () => {
        let now = 0;
        const cache = new FailedReplayCache({ maxEntries: 2, ttlMs: 1000, now: () => now });
        cache.set('a', { code: 'X', reason: 'a' });
        cache.set('b', { code: 'X', reason: 'b' });
        cache.get('a');
        cache.set('c', { code: 'X', reason: 'c' });
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toEqual({ code: 'X', reason: 'a' });
        expect(cache.size).toBe(2);
        now = 1000;
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('c')).toBeUndefined();
        expect(cache.size).toBe(0);
    });
});

import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Types } from 'mongoose';
import { isMainThread, threadId as mainThreadId } from 'worker_threads';
import { GameType } from 'src/game/game.schema';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { AppValidationPipe } from 'src/user/dto/live-game.dto';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { ReplayQueue, ReplayQueueFullException } from 'src/user/heist/replay-queue';
import { UserController } from 'src/user/user.controller';
import { PawlegendsReplayRecord, PawlegendsVerifyResult, SIM_VERSION } from 'src/vendor/pawlegends-sim';
import {
    PAWLEGENDS_REPLAY_QUEUE,
    PawlegendsReplayWorker,
    pawlegendsDigest,
    pawlegendsReplayQueue,
    pawlegendsReplayWorker,
    savePawlegendsMatch,
} from './pawlegends-live';

// The real services pull in Mongoose models, AI and wallet code; /live only uses the repositories.
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * POC.md §15 item 14: the PAWLEGENDS branch of POST /user/catbassadors/live. The re-sim itself is the vendored sim's
 * (pinned by pawlegends/tests/unit/replay.test.ts); here `verify` is a fake that behaves like `verifyReplay` (it
 * accepts exactly the genuine record), except in the worker tests, which run the vendored bundle in a real
 * worker thread.
 */

const genuine = (over: Partial<PawlegendsReplayRecord> = {}): PawlegendsReplayRecord => ({
    v: 1,
    simVersion: SIM_VERSION,
    seed: 12345,
    difficulty: 'easy',
    hero: 'clem',
    trick: 'pounce',
    ticks: 14_000,
    inputs: 'AQIDBA==',
    outcome: 'won',
    finalHash: '0badc0de',
    ...over,
});

/** A fake `verifyReplay`: only the records in `accepted` (by digest) re-sim to their own outcome and hash. */
function fakeSim(...accepted: PawlegendsReplayRecord[]) {
    const ok = new Map(accepted.map(record => [pawlegendsDigest(record), record]));
    return jest.fn(async (record: PawlegendsReplayRecord): Promise<PawlegendsVerifyResult> => {
        const match = ok.get(pawlegendsDigest(record));
        if (match)
            return { ok: true, outcome: match.outcome, finalHash: match.finalHash, ticks: match.ticks, stats: [] };
        return { ok: false, code: 'PAWLEGENDS_HASH_MISMATCH', message: 'final hash differs' };
    });
}

function setup(...accepted: PawlegendsReplayRecord[]) {
    const users = new FakeUsers();
    const games = new FakeGames();
    const userId = users.add({});
    const verify = fakeSim(...accepted);
    const deps = {
        users,
        games,
        verify,
        queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
        failures: new FailedReplayCache({ maxEntries: 100, ttlMs: 60_000 }),
        now: () => new Date('2026-11-12T12:00:00Z'),
    };
    const save = (record: PawlegendsReplayRecord) =>
        savePawlegendsMatch(deps as any, userId, { pawlegends: record as any });
    return { users, games, userId, verify, deps, save };
}

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise;
        return null;
    } catch (error) {
        const body = (error as HttpException).getResponse?.() as any;
        return { status: (error as HttpException).getStatus?.(), code: body?.code };
    }
};

describe('PAWLEGENDS /live branch', () => {
    it('saves a genuine replay once: the row, the fastest win and the first-win catnip', async () => {
        const record = genuine();
        const { users, games, userId, save } = setup(record);
        const result = await save(record);
        expect(result).toEqual({
            difficulty: 'easy',
            outcome: 'won',
            ticks: 14_000,
            finalHash: '0badc0de',
            catnipPaid: PAWLEGENDS_LEVEL_CAPS[0],
            catnipCount: PAWLEGENDS_LEVEL_CAPS[0],
            fastestWin: 14_000,
        });
        expect(games.rows).toHaveLength(1);
        expect(games.rows[0]).toMatchObject({
            type: GameType.PAWLEGENDS,
            level: 'easy',
            points: 20,
            outcome: 'won',
            replayDigest: pawlegendsDigest(record),
        });
        const user = users.get(userId);
        expect(user.pawlegendsFastestWin).toEqual({ easy: 14_000 });
        expect(user.pawlegendsCatnip).toEqual({ easy: 20 });
        // The catnip is paid into the account's Token Tails total.
        expect(user.catnipCount).toBe(20);
        expect(user.pawlegendsMatches).toEqual({ easy: 1 });

        // The same replay again (any account): 409, nothing new, no second re-sim.
        expect(await codeOf(save(record))).toEqual({ status: 409, code: ErrorCode.PAWLEGENDS_DUPLICATE });
        expect(games.rows).toHaveLength(1);
        expect(users.get(userId).pawlegendsMatches).toEqual({ easy: 1 });
    });

    it.each([
        ['a changed input byte', { inputs: 'AQIDBQ==' }],
        ['a changed seed', { seed: 54321 }],
        ['a forged outcome', { outcome: 'won' as const, finalHash: '0badc0de' }],
        ['a forged hash', { finalHash: 'deadbeef' }],
    ])('refuses %s with 400 and writes nothing', async (_label, change) => {
        const real = genuine({ outcome: 'lost', finalHash: '11112222' });
        const { users, games, userId, save, verify } = setup(real);
        const tampered = { ...real, ...change };
        const failure = await codeOf(save(tampered));
        expect(failure?.status).toBe(400);
        expect(failure?.code).toMatch(/^PAWLEGENDS_/);
        expect(games.rows).toHaveLength(0);
        expect(users.updates).toHaveLength(0);
        expect(users.get(userId).pawlegendsCatnip).toBeUndefined();
        // The same tampered record again is answered from the failure cache, without a re-sim.
        verify.mockClear();
        expect((await codeOf(save(tampered)))?.status).toBe(400);
        expect(verify).not.toHaveBeenCalled();
    });

    it('sim v9: a shelter champion replay saves like any hero (champions are free: no entitlement check)', async () => {
        const record = genuine({ hero: 'gabe' as any, difficulty: 'easy' });
        const { save, games } = setup(record);
        expect(await save(record)).toMatchObject({ outcome: 'won' });
        expect(games.rows).toHaveLength(1);
    });

    it('refuses an unknown simVersion cleanly (400 PAWLEGENDS_SIM_VERSION with the backend sim, no re-sim)', async () => {
        const { save, verify, games } = setup();
        let error: any;
        try {
            await save(genuine({ simVersion: SIM_VERSION + 1 }));
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toMatchObject({
            code: ErrorCode.PAWLEGENDS_SIM_VERSION,
            sim: { simVersion: SIM_VERSION },
        });
        expect(verify).not.toHaveBeenCalled();
        expect(games.rows).toHaveLength(0);
    });

    it('two different first wins saved at the same time pay the catnip once', async () => {
        const a = genuine({ seed: 11, ticks: 15_000 });
        const b = genuine({ seed: 12, ticks: 14_500 });
        const { users, games, userId, save } = setup(a, b);
        users.add({}); // another account, untouched
        const results = await Promise.all([save(a), save(b)]);
        expect(results.map(r => r.catnipPaid).sort()).toEqual([0, PAWLEGENDS_LEVEL_CAPS[0]]);
        expect(games.rows).toHaveLength(2);
        expect(games.rows.reduce((sum, row) => sum + row.points, 0)).toBe(PAWLEGENDS_LEVEL_CAPS[0]);
        const user = users.get(userId);
        expect(user.pawlegendsCatnip).toEqual({ easy: PAWLEGENDS_LEVEL_CAPS[0] });
        expect(user.catnipCount).toBe(PAWLEGENDS_LEVEL_CAPS[0]);
    });

    it('adds the first-win catnip to an existing catnip total', async () => {
        const record = genuine({ seed: 21 });
        const { users, userId, save } = setup(record);
        const doc = users.get(userId);
        doc.catnipChaos = [5, 5];
        doc.catnipCount = 10;
        const result = await save(record);
        expect(result.catnipCount).toBe(10 + PAWLEGENDS_LEVEL_CAPS[0]);
        expect(users.get(userId).catnipCount).toBe(10 + PAWLEGENDS_LEVEL_CAPS[0]);
    });

    it('pays catnip once per difficulty, capped by PAWLEGENDS_LEVEL_CAPS', async () => {
        const easy1 = genuine({ seed: 1, ticks: 15_000 });
        const easy2 = genuine({ seed: 2, ticks: 13_000 });
        const normal = genuine({ seed: 3, difficulty: 'normal', ticks: 16_000 });
        const lost = genuine({ seed: 4, difficulty: 'normal', outcome: 'lost', finalHash: '00000001' });
        const rookie = genuine({ seed: 5, difficulty: 'rookie', ticks: 9_000 });
        const { users, userId, save } = setup(easy1, easy2, normal, lost, rookie);

        expect((await save(easy1)).catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[0]);
        const second = await save(easy2);
        expect(second.catnipPaid).toBe(0);
        expect(second.fastestWin).toBe(13_000);
        expect((await save(lost)).catnipPaid).toBe(0);
        expect((await save(normal)).catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[1]);
        expect((await save(rookie)).catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[2]);

        const user = users.get(userId);
        expect(PAWLEGENDS_LEVELS).toEqual(['easy', 'normal', 'rookie', 'hard']);
        expect(user.pawlegendsCatnip).toEqual({ easy: 20, normal: 40, rookie: 10 });
        expect(user.pawlegendsFastestWin).toEqual({ easy: 13_000, normal: 16_000, rookie: 9_000 });
        expect(user.pawlegendsMatches).toEqual({ easy: 2, normal: 2, rookie: 1 });
        const total = Object.values(user.pawlegendsCatnip as Record<string, number>).reduce((a, b) => a + b, 0);
        expect(total).toBe(PAWLEGENDS_LEVEL_CAPS.reduce((a, b) => a + b, 0));
    });

    it('turns a non-object progress field into a document before the dotted write', async () => {
        const record = genuine();
        const { users, userId, save } = setup(record);
        users.get(userId).pawlegendsCatnip = 7;
        await save(record);
        expect(users.get(userId).pawlegendsCatnip).toEqual({ easy: 20 });
    });

    it('answers 429 with Retry-After when the queue is full, before any re-sim', async () => {
        const queue = new ReplayQueue({ concurrency: 1, maxQueued: 8 });
        let open!: () => void;
        const gate = new Promise<void>(resolve => (open = resolve));
        // Fill the running slot and the 8 waiting places.
        const busy = Array.from({ length: 9 }, () => queue.runAsync(() => gate));
        const controller = Object.create(UserController.prototype);
        controller.repository = new FakeUsers();
        controller.gameRepository = new FakeGames();
        const userId = controller.repository.add({});
        const verify = jest.fn();
        const setHeader = jest.fn();
        // The controller uses the process-wide queue: swap in the full one for this call.
        const runAsync = jest.spyOn(pawlegendsReplayQueue, 'runAsync').mockImplementation(task => queue.runAsync(task));
        try {
            const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, 'Tcatbassadors') || {};
            const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
            const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, 'Tcatbassadors')[
                bodyArg.index
            ];
            let body: unknown = { type: GameType.PAWLEGENDS, pawlegends: genuine() };
            for (const pipe of [new AppValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
                body = await pipe.transform(body, { type: 'body', metatype, data: undefined });
            }
            let error: any;
            try {
                await controller.Tcatbassadors(userId, body, { res: { setHeader } });
            } catch (caught) {
                error = caught;
            }
            expect(error).toBeInstanceOf(ReplayQueueFullException);
            expect(error.getStatus()).toBe(429);
            expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
            expect(verify).not.toHaveBeenCalled();
            expect(controller.gameRepository.rows).toHaveLength(0);
        } finally {
            runAsync.mockRestore();
            open();
            await Promise.all(busy);
        }
    });

    it('refuses a pawlegends field on another type and a plain PAWLEGENDS save', async () => {
        const controller = Object.create(UserController.prototype);
        controller.repository = new FakeUsers();
        controller.gameRepository = new FakeGames();
        await expect(
            controller.Tcatbassadors('u', { type: GameType.MATCH_3, level: '1', points: 1, pawlegends: genuine() })
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            savePawlegendsMatch({ users: controller.repository, games: controller.gameRepository }, 'u', {})
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(controller.gameRepository.rows).toHaveLength(0);
    });

    it('a parallel duplicate loses on the replayDigest index with 409', async () => {
        const record = genuine();
        const { games, save } = setup(record);
        const results = await Promise.allSettled([save(record), save(record)]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(ConflictException);
        expect(games.rows).toHaveLength(1);
    });

    describe('the worker thread', () => {
        const worker = new PawlegendsReplayWorker(60_000);
        afterAll(() => Promise.all([worker.close(), pawlegendsReplayWorker.close()]));

        it('runs verifyReplay off the main thread', async () => {
            expect(isMainThread).toBe(true);
            const malformed = { ...genuine(), hero: 'nobody' };
            const verdict = await worker.verify(malformed as any);
            expect(verdict.threadId).not.toBe(mainThreadId);
            expect(verdict.result).toEqual(expect.objectContaining({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' }));
        }, 60_000);

        it('the default /live path re-sims in the worker and refuses a forged record without writing', async () => {
            const users = new FakeUsers();
            const games = new FakeGames();
            const userId = users.add({});
            const forged = genuine({ inputs: '', ticks: 1 });
            const failure = await codeOf(
                savePawlegendsMatch(
                    {
                        users,
                        games,
                        failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
                        queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
                    },
                    userId,
                    { pawlegends: forged as any }
                )
            );
            expect(failure?.status).toBe(400);
            expect(failure?.code).toMatch(/^PAWLEGENDS_/);
            expect(games.rows).toHaveLength(0);
            expect(users.updates).toHaveLength(0);
        }, 60_000);

        it('sim v9: re-sims a genuine shelter champion match in the worker; its v8 twin is refused before any re-sim', async () => {
            // Recorded by `npm run vendor-sim` (CHAMPION_FIXTURE_HERO, the naive player-bot on Easy).
            const record: PawlegendsReplayRecord = JSON.parse(
                readFileSync(join(__dirname, '..', 'vendor', 'pawlegends-sim', 'champion-replay.fixture.json'), 'utf8')
            );
            expect(record).toMatchObject({ hero: 'gabe', difficulty: 'easy', simVersion: SIM_VERSION });
            expect(SIM_VERSION).toBe(9);
            const users = new FakeUsers();
            const games = new FakeGames();
            const userId = users.add({});
            const deps = {
                users,
                games,
                failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
                queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            };
            const old = await codeOf(
                savePawlegendsMatch(deps, userId, { pawlegends: { ...record, simVersion: 8 } as any })
            );
            expect(old).toMatchObject({ status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION });
            const result = await savePawlegendsMatch(deps, userId, { pawlegends: record as any });
            expect(result).toMatchObject({ difficulty: 'easy', outcome: record.outcome, ticks: record.ticks });
            expect(games.rows).toHaveLength(1);
        }, 60_000);

        it('re-sims a genuine Rookie match (match 1) in the worker and pays the Rookie first-win catnip once', async () => {
            // Recorded by `npm run vendor-sim` with the vendored sim (the naive player-bot), so it is always current.
            const record: PawlegendsReplayRecord = JSON.parse(
                readFileSync(join(__dirname, '..', 'vendor', 'pawlegends-sim', 'rookie-replay.fixture.json'), 'utf8')
            );
            expect(record).toMatchObject({ difficulty: 'rookie', outcome: 'won', simVersion: SIM_VERSION });
            const users = new FakeUsers();
            const games = new FakeGames();
            const userId = users.add({});
            const deps = {
                users,
                games,
                failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
                queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            };
            const result = await savePawlegendsMatch(deps, userId, { pawlegends: record as any });
            expect(result).toMatchObject({ difficulty: 'rookie', outcome: 'won', ticks: record.ticks });
            expect(result.catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[PAWLEGENDS_LEVELS.indexOf('rookie')]);
            expect(users.get(userId).pawlegendsCatnip).toEqual({ rookie: 10 });
            expect(games.rows).toHaveLength(1);
            expect(await codeOf(savePawlegendsMatch(deps, userId, { pawlegends: record as any }))).toMatchObject({
                status: 409,
            });
        }, 60_000);
    });

    it('stores the row with the caller and their cat', async () => {
        const record = genuine({ outcome: 'lost', finalHash: 'aaaabbbb' });
        const { games, users, userId, save } = setup(record);
        await save(record);
        expect(String(games.rows[0].user)).toBe(userId);
        expect(games.rows[0].cat).toBeInstanceOf(Types.ObjectId);
        expect(games.rows[0].outcome).toBe('died');
        expect(users.get(userId).pawlegendsFastestWin).toBeUndefined();
    });
});

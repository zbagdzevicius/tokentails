import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';
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
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'crypto';
import { PawlegendsReplayDto } from './pawlegends-replay.dto';
import { PawlegendsReplayRecord, PawlegendsVerifyResult, SIM_VERSION, SIM_VERSIONS } from 'src/vendor/pawlegends-sim';
import { PAWLEGENDS_SIM_INFO } from './pawlegends-sim-info';
import { verifyBySimVersion } from './pawlegends-replay.worker';
import {
    PAWLEGENDS_REPLAY_QUEUE,
    PawlegendsReplayWorker,
    canonicalRecord,
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

/** A fixture `npm run vendor-sim` recorded into backend/src/vendor/pawlegends-sim/v<version>/. */
const fixture = (version: number, name: 'rookie' | 'champion' | 'forfeit'): PawlegendsReplayRecord =>
    JSON.parse(
        readFileSync(
            join(__dirname, '..', 'vendor', 'pawlegends-sim', `v${version}`, `${name}-replay.fixture.json`),
            'utf8'
        )
    );

const freshDeps = () => {
    const users = new FakeUsers();
    const games = new FakeGames();
    const userId = users.add({});
    const deps = {
        users,
        games,
        failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
        queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
    };
    return { users, games, userId, deps };
};

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

    it.each([[SIM_VERSION + 1], [8], [1]])(
        'refuses simVersion %s cleanly (400 PAWLEGENDS_SIM_VERSION with the backend sims, no re-sim)',
        async simVersion => {
            const { save, verify, games } = setup();
            let error: any;
            try {
                await save(genuine({ simVersion }));
            } catch (caught) {
                error = caught;
            }
            expect(error).toBeInstanceOf(BadRequestException);
            expect(error.getResponse()).toMatchObject({
                code: ErrorCode.PAWLEGENDS_SIM_VERSION,
                sim: { simVersion: SIM_VERSION, simVersions: [9, 10] },
            });
            expect(verify).not.toHaveBeenCalled();
            expect(games.rows).toHaveLength(0);
        }
    );

    it('sim v10 dual verifier: accepts v9 and v10 (GAPS B0), names both in GET /pawlegends/sim', async () => {
        expect(SIM_VERSION).toBe(10);
        expect(SIM_VERSIONS).toEqual([9, 10]);
        expect(PAWLEGENDS_SIM_INFO).toMatchObject({ simVersion: 10, simVersions: [9, 10] });
        expect(Object.keys(PAWLEGENDS_SIM_INFO.bundles)).toEqual(['9', '10']);
        for (const simVersion of [9, 10]) {
            const record = genuine({ simVersion, finalHash: simVersion === 9 ? '99990000' : '10100000' });
            const { save, games } = setup(record);
            expect(await save(record)).toMatchObject({ outcome: 'won' });
            expect(games.rows).toHaveLength(1);
        }
    });

    it('sim v10 mutator: in the digest from v10 (a missing one is none), never in a v9 digest', () => {
        const v10 = genuine();
        expect(canonicalRecord(v10)).toMatchObject({ mutator: 'none' });
        expect(pawlegendsDigest(v10)).toBe(pawlegendsDigest({ ...v10, mutator: 'none' }));
        // A v9 record keeps the digest v9 stored (the ten pre-v10 keys only), so its duplicate check still holds.
        const v9 = genuine({ simVersion: 9 });
        const legacy = createHash('sha256')
            .update(
                `pawlegends:${JSON.stringify({
                    v: 1,
                    simVersion: 9,
                    seed: v9.seed,
                    difficulty: v9.difficulty,
                    hero: v9.hero,
                    trick: v9.trick,
                    ticks: v9.ticks,
                    inputs: v9.inputs,
                    outcome: v9.outcome,
                    finalHash: v9.finalHash,
                })}`
            )
            .digest('hex');
        expect(pawlegendsDigest(v9)).toBe(legacy);
        expect(canonicalRecord({ ...v9, mutator: 'none' })).not.toHaveProperty('mutator');
    });

    it('sim v10 mutator: a mutator win is a match only, no fastest win and no catnip (GAPS §8 item 1)', async () => {
        // Only 'none' passes the DTO in v10; this is the rule for the mutators that come later.
        const record = genuine({ mutator: 'sunsetRush' as any });
        const { users, userId, save, games } = setup(record);
        expect(await save(record)).toMatchObject({ outcome: 'won', catnipPaid: 0, fastestWin: null });
        expect(games.rows).toHaveLength(1);
        expect(games.rows[0].points).toBe(0);
        const user = users.get(userId);
        expect(user.pawlegendsFastestWin).toBeUndefined();
        expect(user.pawlegendsCatnip).toBeUndefined();
        expect(user.pawlegendsMatches).toEqual({ easy: 1 });
    });

    it("sim v10 mutator: the DTO accepts no field or 'none', and refuses any other value", async () => {
        const errorsOf = async (record: unknown) =>
            (await validate(plainToInstance(PawlegendsReplayDto, record) as object)).map(error => error.property);
        expect(await errorsOf(genuine())).toEqual([]);
        expect(await errorsOf(genuine({ mutator: 'none' }))).toEqual([]);
        expect(await errorsOf(genuine({ mutator: 'sunsetRush' as any }))).toEqual(['mutator']);
        expect(await errorsOf(genuine({ mutator: null as any }))).toEqual([]);
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

    it('logs every save that does not write: code, simVersion and difficulty, never the user (LAUNCH a.8)', async () => {
        const record = genuine();
        const { deps, userId, save } = setup(record);
        const logger = { warn: jest.fn(), log: jest.fn() };
        (deps as any).logger = logger;
        const lines = () => [...logger.warn.mock.calls, ...logger.log.mock.calls].map(([line]) => String(line));

        await save(record);
        expect(lines()).toEqual([]);

        expect((await codeOf(save(record)))?.status).toBe(409);
        expect(logger.log).toHaveBeenLastCalledWith(
            `pawlegends save duplicate: code=PAWLEGENDS_DUPLICATE simVersion=${SIM_VERSION} difficulty=easy`
        );

        const forged = genuine({ finalHash: 'deadbeef' });
        expect((await codeOf(save(forged)))?.code).toBe('PAWLEGENDS_HASH_MISMATCH');
        expect(logger.warn).toHaveBeenLastCalledWith(
            `pawlegends save rejected: code=PAWLEGENDS_HASH_MISMATCH simVersion=${SIM_VERSION} difficulty=easy`
        );
        // The same record again: refused from the failure cache, still logged (marked cached).
        await codeOf(save(forged));
        expect(logger.warn).toHaveBeenLastCalledWith(
            expect.stringMatching(/rejected: code=PAWLEGENDS_HASH_MISMATCH .* cached$/)
        );

        // A sim that answers ok with a different result: OUTCOME_MISMATCH, the sim-drift signal.
        (deps as any).verify = async () => ({ ok: true, outcome: 'lost', finalHash: 'x', ticks: 1, stats: [] });
        expect((await codeOf(save(genuine({ seed: 7, difficulty: 'hard' }))))?.code).toBe(
            ErrorCode.PAWLEGENDS_OUTCOME_MISMATCH
        );
        expect(logger.warn).toHaveBeenLastCalledWith(
            `pawlegends save rejected: code=PAWLEGENDS_OUTCOME_MISMATCH simVersion=${SIM_VERSION} difficulty=hard`
        );

        expect((await codeOf(save(genuine({ simVersion: 99 }))))?.code).toBe(ErrorCode.PAWLEGENDS_SIM_VERSION);
        expect(logger.warn).toHaveBeenLastCalledWith(
            'pawlegends save rejected: code=PAWLEGENDS_SIM_VERSION simVersion=99 difficulty=easy'
        );
        // A difficulty outside the levels is never echoed into the log.
        await codeOf(save(genuine({ difficulty: 'x'.repeat(40) as any })));
        expect(logger.warn).toHaveBeenLastCalledWith(
            `pawlegends save rejected: code=PAWLEGENDS_REPLAY_INVALID simVersion=${SIM_VERSION} difficulty=unknown`
        );

        // A full queue (429) and a stopped worker (503) are warnings too, and still thrown.
        (deps as any).queue = {
            runAsync: () => {
                throw new ReplayQueueFullException(3);
            },
        };
        expect((await codeOf(save(genuine({ seed: 8 }))))?.status).toBe(429);
        expect(logger.warn).toHaveBeenLastCalledWith(
            `pawlegends save queue-full: code=HTTP_429 simVersion=${SIM_VERSION} difficulty=easy`
        );
        (deps as any).queue = new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE);
        (deps as any).verify = async () => {
            throw new ServiceUnavailableException('Replay check timed out');
        };
        expect((await codeOf(save(genuine({ seed: 9 }))))?.status).toBe(503);
        expect(logger.warn).toHaveBeenLastCalledWith(
            `pawlegends save unavailable: code=HTTP_503 simVersion=${SIM_VERSION} difficulty=easy`
        );

        expect(lines().some(line => line.includes(userId))).toBe(false);
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

        it.each([[9], [10]])(
            'sim v%s: re-sims a genuine shelter champion match in the worker; its v8 twin is refused before any re-sim',
            async simVersion => {
                // Recorded by `npm run vendor-sim` (CHAMPION_FIXTURE_HERO, the naive player-bot on Easy); v9 is frozen.
                const record = fixture(simVersion, 'champion');
                expect(record).toMatchObject({ hero: 'gabe', difficulty: 'easy', simVersion });
                if (simVersion === 9) expect(record).not.toHaveProperty('mutator');
                else expect(record).toMatchObject({ mutator: 'none' });
                const { games, userId, deps } = freshDeps();
                const old = await codeOf(
                    savePawlegendsMatch(deps, userId, { pawlegends: { ...record, simVersion: 8 } as any })
                );
                expect(old).toMatchObject({ status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION });
                const result = await savePawlegendsMatch(deps, userId, { pawlegends: record as any });
                expect(result).toMatchObject({ difficulty: 'easy', outcome: record.outcome, ticks: record.ticks });
                expect(games.rows).toHaveLength(1);
            },
            60_000
        );

        it('dispatches by simVersion: a v9 replay labelled v10 (or v10 labelled v9) does not verify', () => {
            const v9 = fixture(9, 'rookie');
            const v10 = fixture(10, 'rookie');
            expect(verifyBySimVersion(v9)).toMatchObject({ ok: true, finalHash: v9.finalHash, ticks: v9.ticks });
            expect(verifyBySimVersion(v10)).toMatchObject({ ok: true, finalHash: v10.finalHash, ticks: v10.ticks });
            expect(verifyBySimVersion({ ...v9, simVersion: 10 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...v10, simVersion: 9 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...v10, simVersion: 11 })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_SIM_VERSION',
            });
            expect(verifyBySimVersion({ ...v10, mutator: 'sunsetRush' })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_REPLAY_INVALID',
            });
        }, 60_000);

        it('sim v10 forfeit (GAPS B2): a genuine forfeited Normal match verifies, is a loss stored as quit, pays nothing', async () => {
            // Recorded by `npm run vendor-sim` (FORFEIT_FIXTURE_SEED: the normal player-bot to 4:00, then Op.Forfeit).
            const record = fixture(10, 'forfeit');
            expect(record).toMatchObject({ difficulty: 'normal', outcome: 'lost', simVersion: 10, ticks: 7201 });
            const verdict = verifyBySimVersion(record);
            expect(verdict).toMatchObject({ ok: true, outcome: 'lost', reason: 'forfeit', ticks: 7201 });
            // claiming the forfeit was a win does not verify
            expect(verifyBySimVersion({ ...record, outcome: 'won' })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_OUTCOME_MISMATCH',
            });
            // the save path with that verdict (the worker re-sim itself is covered by the tests above)
            const { users, games, userId, deps } = freshDeps();
            const result = await savePawlegendsMatch({ ...deps, verify: async () => verdict }, userId, {
                pawlegends: record as any,
            });
            expect(result).toMatchObject({
                difficulty: 'normal',
                outcome: 'lost',
                reason: 'forfeit',
                catnipPaid: 0,
                fastestWin: null,
            });
            expect(games.rows).toHaveLength(1);
            expect(games.rows[0]).toMatchObject({ outcome: 'quit', points: 0, score: 7201, level: 'normal' });
            const user = users.get(userId);
            expect(user.pawlegendsMatches).toEqual({ normal: 1 });
            expect(user.pawlegendsFastestWin).toBeUndefined();
            expect(user.pawlegendsCatnip).toBeUndefined();
        }, 60_000);

        it.each([[9], [10]])(
            'sim v%s: re-sims a genuine Rookie match (match 1) in the worker and pays the Rookie first-win catnip once',
            async simVersion => {
                // Recorded by `npm run vendor-sim` with the vendored sim (the naive player-bot), so it is always current.
                const record = fixture(simVersion, 'rookie');
                expect(record).toMatchObject({ difficulty: 'rookie', outcome: 'won', simVersion });
                const { users, games, userId, deps } = freshDeps();
                const result = await savePawlegendsMatch(deps, userId, { pawlegends: record as any });
                expect(result).toMatchObject({ difficulty: 'rookie', outcome: 'won', ticks: record.ticks });
                expect(result.catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[PAWLEGENDS_LEVELS.indexOf('rookie')]);
                expect(users.get(userId).pawlegendsCatnip).toEqual({ rookie: 10 });
                expect(games.rows).toHaveLength(1);
                expect(await codeOf(savePawlegendsMatch(deps, userId, { pawlegends: record as any }))).toMatchObject({
                    status: 409,
                });
            },
            60_000
        );
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

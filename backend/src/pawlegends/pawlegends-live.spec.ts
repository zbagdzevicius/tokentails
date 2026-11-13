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
import {
    PawlegendsReplayRecord,
    PawlegendsVerifyResult,
    SIM_VERSION,
    SIM_VERSIONS,
    simFor,
} from 'src/vendor/pawlegends-sim';
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
const fixture = (
    version: number,
    name: 'rookie' | 'champion' | 'forfeit' | 'dog' | 'new-dog' | 'pvp' | 'hearthwood'
): PawlegendsReplayRecord =>
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
                sim: {
                    simVersion: SIM_VERSION,
                    simVersions: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
                },
            });
            expect(verify).not.toHaveBeenCalled();
            expect(games.rows).toHaveLength(0);
        }
    );

    it('sim v25 verifier: accepts v10 to v25 (GAPS B0; v9 retired), names all sixteen in GET /pawlegends/sim', async () => {
        expect(SIM_VERSION).toBe(25);
        expect(SIM_VERSIONS).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
        expect(PAWLEGENDS_SIM_INFO).toMatchObject({
            simVersion: 25,
            simVersions: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
        });
        expect(Object.keys(PAWLEGENDS_SIM_INFO.bundles)).toEqual([
            '10',
            '11',
            '12',
            '13',
            '14',
            '15',
            '16',
            '17',
            '18',
            '19',
            '20',
            '21',
            '22',
            '23',
            '24',
            '25',
        ]);
        const fakeHash: Record<number, string> = {
            10: '10100000',
            11: '11110000',
            12: '12120000',
            13: '13130000',
            14: '14140000',
            15: '15150000',
            16: '16160000',
            17: '17170000',
            18: '18180000',
            19: '19190000',
            20: '20200000',
            21: '21210000',
            22: '22220000',
            23: '23230000',
            24: '24240000',
            25: '25250000',
        };
        for (const simVersion of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]) {
            const record = genuine({ simVersion, finalHash: fakeHash[simVersion] });
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

    it("sim v10 mutator: the DTO accepts no field, 'none' or (sim v22) 'blitz', and refuses any other value", async () => {
        const errorsOf = async (record: unknown) =>
            (await validate(plainToInstance(PawlegendsReplayDto, record) as object)).map(error => error.property);
        expect(await errorsOf(genuine())).toEqual([]);
        expect(await errorsOf(genuine({ mutator: 'none' }))).toEqual([]);
        expect(await errorsOf(genuine({ mutator: 'blitz' }))).toEqual([]);
        expect(await errorsOf(genuine({ mutator: 'sunsetRush' as any }))).toEqual(['mutator']);
        expect(await errorsOf(genuine({ mutator: null as any }))).toEqual([]);
    });

    it('sim v22 Blitz: a win is a match only (no catnip, no fastest win); Season XP is paid per minute', async () => {
        const record = genuine({ mutator: 'blitz', ticks: 5_200 });
        const { users, userId, games, deps } = setup(record);
        const addXp = jest.fn(async () => ({ seasonId: 's1', xp: 10, tier: 0, prevTier: 0, gained: 10 }));
        const result = await savePawlegendsMatch({ ...deps, season: { addXp } } as any, userId, {
            pawlegends: record as any,
        });
        expect(result).toMatchObject({ outcome: 'won', catnipPaid: 0, fastestWin: null });
        expect(games.rows[0]).toMatchObject({ points: 0, outcome: 'won', score: 5_200 });
        expect(users.get(userId).pawlegendsFastestWin).toBeUndefined();
        expect(addXp).toHaveBeenCalledWith(String(userId), expect.objectContaining({ won: true, ticks: 5_200 }));
        // a plain match pays in full (no ticks)
        const plain = genuine({ seed: 99 });
        const two = setup(plain);
        const addXp2 = jest.fn(async (_id: string, _m: unknown) => null);
        await savePawlegendsMatch({ ...two.deps, season: { addXp: addXp2 } } as any, two.userId, {
            pawlegends: plain as any,
        });
        expect(addXp2.mock.calls[0][1]).not.toHaveProperty('ticks');
    });

    it('sim v22 Blitz: a record of an older sim with a mutator is refused before any re-sim', async () => {
        const record = genuine({ mutator: 'blitz', simVersion: 21 });
        const { save, verify } = setup(record);
        expect(await codeOf(save(record))).toEqual({ status: 400, code: ErrorCode.PAWLEGENDS_REPLAY_INVALID });
        expect(verify).not.toHaveBeenCalled();
        // the digest covers the mutator: the same match saved as 'none' is another record
        expect(pawlegendsDigest(genuine({ mutator: 'blitz' }))).not.toBe(
            pawlegendsDigest(genuine({ mutator: 'none' }))
        );
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

        it('a cold worker answers even when loading its sims takes longer than a replay may (the timeout starts at ready)', async () => {
            // a 2 s replay budget: from TypeScript sources the worker alone loads its 16 sims in about 10 s
            const cold = new PawlegendsReplayWorker(2_000);
            try {
                const verdict = await cold.verify({ ...genuine(), hero: 'nobody' } as any);
                expect(verdict.threadId).not.toBe(mainThreadId);
                expect(verdict.result).toEqual(
                    expect.objectContaining({ ok: false, code: 'PAWLEGENDS_REPLAY_INVALID' })
                );
            } finally {
                await cold.close();
            }
        }, 90_000);

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

        it.each([[10], [11], [12], [13], [14], [15], [16], [17], [18], [19], [20], [21], [22], [23], [24], [25]])(
            'sim v%s: re-sims a genuine shelter champion match in the worker; its v9 twin is refused before any re-sim',
            async simVersion => {
                // Recorded by `npm run vendor-sim` (CHAMPION_FIXTURE_HERO, the naive player-bot on Easy); v10 is frozen.
                const record = fixture(simVersion, 'champion');
                expect(record).toMatchObject({ hero: 'gabe', difficulty: 'easy', simVersion, mutator: 'none' });
                const { games, userId, deps } = freshDeps();
                // sim v11 retired v9: a v9 record is refused like any unknown version
                const old = await codeOf(
                    savePawlegendsMatch(deps, userId, { pawlegends: { ...record, simVersion: 9 } as any })
                );
                expect(old).toMatchObject({ status: 400, code: ErrorCode.PAWLEGENDS_SIM_VERSION });
                const result = await savePawlegendsMatch(deps, userId, { pawlegends: record as any });
                expect(result).toMatchObject({ difficulty: 'easy', outcome: record.outcome, ticks: record.ticks });
                expect(games.rows).toHaveLength(1);
            },
            60_000
        );

        it('dispatches by simVersion: a v10 replay labelled v11 (or v11 labelled v10) does not verify', () => {
            const v10 = fixture(10, 'rookie');
            const v11 = fixture(11, 'rookie');
            expect(verifyBySimVersion(v10)).toMatchObject({ ok: true, finalHash: v10.finalHash, ticks: v10.ticks });
            expect(verifyBySimVersion(v11)).toMatchObject({ ok: true, finalHash: v11.finalHash, ticks: v11.ticks });
            expect(verifyBySimVersion({ ...v10, simVersion: 11 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...v11, simVersion: 10 }).ok).toBe(false);
            for (const simVersion of [9, SIM_VERSION + 1]) {
                expect(verifyBySimVersion({ ...v11, simVersion })).toMatchObject({
                    ok: false,
                    code: 'PAWLEGENDS_SIM_VERSION',
                });
            }
            expect(verifyBySimVersion({ ...v11, mutator: 'sunsetRush' })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_REPLAY_INVALID',
            });
        }, 60_000);

        it('sim v12: a v12 replay labelled v11 (or v11 labelled v12) does not verify; a v10 replay still does', () => {
            const v10 = fixture(10, 'rookie');
            const v11 = fixture(11, 'rookie');
            const v12 = fixture(12, 'rookie');
            expect(verifyBySimVersion(v10)).toMatchObject({ ok: true, finalHash: v10.finalHash });
            expect(verifyBySimVersion(v12)).toMatchObject({ ok: true, finalHash: v12.finalHash, ticks: v12.ticks });
            expect(verifyBySimVersion({ ...v12, simVersion: 11 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...v11, simVersion: 12 }).ok).toBe(false);
        }, 60_000);

        it('sim v14: a v14 replay labelled v13 (or v13 labelled v14) does not verify; the v12 dog-human replay still does', () => {
            // The v12 Rookie fixture is played as Sir Brutus: a dog human on the frozen v12 bundle.
            const v12 = fixture(12, 'rookie');
            const v13 = fixture(13, 'rookie');
            const v14 = fixture(14, 'rookie');
            expect(v12.hero).toBe('brutus');
            expect(verifyBySimVersion(v12)).toMatchObject({ ok: true, finalHash: v12.finalHash, ticks: v12.ticks });
            expect(verifyBySimVersion(v13)).toMatchObject({ ok: true, finalHash: v13.finalHash, ticks: v13.ticks });
            expect(verifyBySimVersion(v14)).toMatchObject({ ok: true, finalHash: v14.finalHash, ticks: v14.ticks });
            if (v14.finalHash !== v13.finalHash) {
                expect(verifyBySimVersion({ ...v14, simVersion: 13 }).ok).toBe(false);
                expect(verifyBySimVersion({ ...v13, simVersion: 14 }).ok).toBe(false);
            }
            expect(verifyBySimVersion({ ...v12, simVersion: 14 }).ok).toBe(false);
        }, 60_000);

        it('sim v14: a replay played as a new dog (Chili) verifies; the same record labelled v13 or v12 is refused (no Chili there)', () => {
            const dog = fixture(14, 'dog');
            expect(dog).toMatchObject({ hero: 'chili', simVersion: 14, difficulty: 'easy' });
            expect(verifyBySimVersion(dog)).toMatchObject({ ok: true, finalHash: dog.finalHash, ticks: dog.ticks });
            expect(verifyBySimVersion({ ...dog, simVersion: 13 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...dog, simVersion: 12 }).ok).toBe(false);
        }, 60_000);

        it('sim v15: a v15 replay labelled v14 (or v14 labelled v15) does not verify; the frozen v14 dog-human replay still does', () => {
            const v14 = fixture(14, 'rookie');
            const v15 = fixture(15, 'rookie');
            expect(verifyBySimVersion(v14)).toMatchObject({ ok: true, finalHash: v14.finalHash, ticks: v14.ticks });
            expect(verifyBySimVersion(v15)).toMatchObject({ ok: true, finalHash: v15.finalHash, ticks: v15.ticks });
            if (v15.finalHash !== v14.finalHash) {
                expect(verifyBySimVersion({ ...v15, simVersion: 14 }).ok).toBe(false);
                expect(verifyBySimVersion({ ...v14, simVersion: 15 }).ok).toBe(false);
            }
            // The v14 Chili replay (frozen with v14) still verifies on the frozen bundle, and not on v15.
            const dog14 = fixture(14, 'dog');
            expect(dog14).toMatchObject({ hero: 'chili', simVersion: 14 });
            expect(verifyBySimVersion(dog14)).toMatchObject({
                ok: true,
                finalHash: dog14.finalHash,
                ticks: dog14.ticks,
            });
            expect(verifyBySimVersion({ ...dog14, simVersion: 15 }).ok).toBe(false);
        }, 60_000);

        it('sim v15: a replay played as a sim v15 dog (Frankie) verifies; the same record labelled v14 is refused (no Frankie there)', () => {
            const dog = fixture(15, 'new-dog');
            expect(dog).toMatchObject({ hero: 'frankie', simVersion: 15, difficulty: 'easy' });
            expect(verifyBySimVersion(dog)).toMatchObject({ ok: true, finalHash: dog.finalHash, ticks: dog.ticks });
            expect(verifyBySimVersion({ ...dog, simVersion: 14 }).ok).toBe(false);
            const chili = fixture(15, 'dog');
            expect(chili).toMatchObject({ hero: 'chili', simVersion: 15 });
            expect(verifyBySimVersion(chili)).toMatchObject({
                ok: true,
                finalHash: chili.finalHash,
                ticks: chili.ticks,
            });
        }, 60_000);

        it('sim v16: a v16 replay labelled v15 (or v15 labelled v16) does not verify; the frozen v15 new-dog replay still does', () => {
            const v15 = fixture(15, 'rookie');
            const v16 = fixture(16, 'rookie');
            expect(verifyBySimVersion(v15)).toMatchObject({ ok: true, finalHash: v15.finalHash, ticks: v15.ticks });
            expect(verifyBySimVersion(v16)).toMatchObject({ ok: true, finalHash: v16.finalHash, ticks: v16.ticks });
            if (v16.finalHash !== v15.finalHash) {
                expect(verifyBySimVersion({ ...v16, simVersion: 15 }).ok).toBe(false);
                expect(verifyBySimVersion({ ...v15, simVersion: 16 }).ok).toBe(false);
            }
            const dog15 = fixture(15, 'new-dog');
            expect(dog15).toMatchObject({ hero: 'frankie', simVersion: 15 });
            expect(verifyBySimVersion(dog15)).toMatchObject({
                ok: true,
                finalHash: dog15.finalHash,
                ticks: dog15.ticks,
            });
            const dog16 = fixture(16, 'new-dog');
            expect(dog16).toMatchObject({ hero: 'frankie', simVersion: 16 });
            expect(verifyBySimVersion(dog16)).toMatchObject({
                ok: true,
                finalHash: dog16.finalHash,
                ticks: dog16.ticks,
            });
        }, 60_000);

        it('sim v16 S-PvP: the vendored PvP record (v3) verifies with the v16 party facade; older bundles have no PvP', () => {
            const pvp = fixture(16, 'pvp') as any;
            expect(pvp).toMatchObject({ v: 3, mode: 'pvp', simVersion: 16, difficulty: 'hard' });
            const party = simFor(16)?.party;
            expect(party?.PVP_SINCE).toBe(16);
            expect(party?.checkPvpShape?.(pvp)).toBeNull();
            const verdict = party?.verifyPvpReplay?.(pvp) as any;
            expect(verdict).toMatchObject({ ok: true, finalHash: pvp.finalHash, ticks: pvp.ticks });
            expect([0, 1]).toContain(verdict.winner);
            // A v3 record is not a v1 or v2 replay, and the frozen v15 bundle has no PvP verifier.
            expect(verifyBySimVersion(pvp).ok).toBe(false);
            expect(party?.verifyPartyReplay({ ...pvp, v: 2 }).ok).toBe(false);
            expect(party?.verifyPvpReplay?.({ ...pvp, simVersion: 15 })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_SIM_VERSION',
            });
            expect(simFor(15)?.party?.verifyPvpReplay).toBeUndefined();
        }, 60_000);

        it('sim v17: a v17 replay labelled v16 (or v16 labelled v17) does not verify; the frozen v16 PvP replay still does', () => {
            const v16 = fixture(16, 'rookie');
            const v17 = fixture(17, 'rookie');
            expect(verifyBySimVersion(v16)).toMatchObject({ ok: true, finalHash: v16.finalHash, ticks: v16.ticks });
            expect(verifyBySimVersion(v17)).toMatchObject({ ok: true, finalHash: v17.finalHash, ticks: v17.ticks });
            if (v17.finalHash !== v16.finalHash) {
                expect(verifyBySimVersion({ ...v17, simVersion: 16 }).ok).toBe(false);
                expect(verifyBySimVersion({ ...v16, simVersion: 17 }).ok).toBe(false);
            }
            const dog17 = fixture(17, 'new-dog');
            expect(dog17).toMatchObject({ hero: 'frankie', simVersion: 17 });
            expect(verifyBySimVersion(dog17)).toMatchObject({
                ok: true,
                finalHash: dog17.finalHash,
                ticks: dog17.ticks,
            });
            // The frozen v16 bundle still verifies its own PvP record; the live v17 verifies the v17 one.
            const pvp16 = fixture(16, 'pvp') as any;
            expect((simFor(16)?.party?.verifyPvpReplay?.(pvp16) as any)?.ok).toBe(true);
            const pvp17 = fixture(17, 'pvp') as any;
            expect(pvp17).toMatchObject({ v: 3, mode: 'pvp', simVersion: 17, difficulty: 'hard' });
            const party = simFor(17)?.party;
            expect(party?.PARTY_SINCE).toBe(13);
            expect(party?.PVP_SINCE).toBe(16);
            expect(party?.HERO_IDS).toHaveLength(20);
            expect(party?.verifyPvpReplay?.(pvp17)).toMatchObject({
                ok: true,
                finalHash: pvp17.finalHash,
                ticks: pvp17.ticks,
            });
            expect(party?.verifyPvpReplay?.({ ...pvp17, simVersion: 16 })).toMatchObject({ ok: false });
        }, 120_000);

        it('sim v18: a v18 replay labelled v17 (or v17 labelled v18) does not verify; the frozen v17 PvP replay still does', () => {
            const v17 = fixture(17, 'rookie');
            const v18 = fixture(18, 'rookie');
            expect(verifyBySimVersion(v17)).toMatchObject({ ok: true, finalHash: v17.finalHash, ticks: v17.ticks });
            expect(verifyBySimVersion(v18)).toMatchObject({ ok: true, finalHash: v18.finalHash, ticks: v18.ticks });
            if (v18.finalHash !== v17.finalHash) {
                expect(verifyBySimVersion({ ...v18, simVersion: 17 }).ok).toBe(false);
                expect(verifyBySimVersion({ ...v17, simVersion: 18 }).ok).toBe(false);
            }
            const dog18 = fixture(18, 'new-dog');
            expect(dog18).toMatchObject({ hero: 'frankie', simVersion: 18 });
            expect(verifyBySimVersion(dog18)).toMatchObject({
                ok: true,
                finalHash: dog18.finalHash,
                ticks: dog18.ticks,
            });
            // The frozen v17 bundle still verifies its own PvP record; the live v18 verifies the v18 one.
            const pvp17 = fixture(17, 'pvp') as any;
            expect((simFor(17)?.party?.verifyPvpReplay?.(pvp17) as any)?.ok).toBe(true);
            const pvp18 = fixture(18, 'pvp') as any;
            expect(pvp18).toMatchObject({ v: 3, mode: 'pvp', simVersion: 18, difficulty: 'hard' });
            const party = simFor(18)?.party;
            expect(party?.PARTY_SINCE).toBe(13);
            expect(party?.PVP_SINCE).toBe(16);
            expect(party?.HERO_IDS).toHaveLength(20);
            expect(party?.verifyPvpReplay?.(pvp18)).toMatchObject({
                ok: true,
                finalHash: pvp18.finalHash,
                ticks: pvp18.ticks,
            });
            expect(party?.verifyPvpReplay?.({ ...pvp18, simVersion: 17 })).toMatchObject({ ok: false });
        }, 120_000);

        it('sim v19 (5v5 Classic): the Hearthwood solo, party and PvP records verify on v19 only; v18 stays frozen', () => {
            const v18 = fixture(18, 'rookie');
            const v19 = fixture(19, 'rookie');
            expect(verifyBySimVersion(v18)).toMatchObject({ ok: true, finalHash: v18.finalHash, ticks: v18.ticks });
            expect(verifyBySimVersion(v19)).toMatchObject({ ok: true, finalHash: v19.finalHash, ticks: v19.ticks });
            // Crossing plays exactly as in v18 (gate G1): the same record verifies under either label.
            expect(v19.finalHash).toBe(v18.finalHash);
            const solo = fixture(19, 'hearthwood') as any;
            expect(solo).toMatchObject({ v: 1, simVersion: 19, map: 'hearthwood' });
            expect(verifyBySimVersion(solo)).toMatchObject({ ok: true, finalHash: solo.finalHash, ticks: solo.ticks });
            // A Hearthwood record labelled v18 is refused (v18 has no map), and so is one without its map.
            expect(verifyBySimVersion({ ...solo, simVersion: 18 }).ok).toBe(false);
            expect(verifyBySimVersion({ ...solo, map: undefined }).ok).toBe(false);
            const party = simFor(19)?.party;
            expect(party?.MAP_IDS).toEqual(['crossing', 'hearthwood']);
            expect(party?.slotCountOf?.('hearthwood')).toBe(10);
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v19');
            const partyRec = JSON.parse(readFileSync(join(vendor, 'hearthwood-party.fixture.json'), 'utf8'));
            expect(partyRec).toMatchObject({ v: 2, map: 'hearthwood' });
            expect(party?.verifyPartyReplay(partyRec)).toMatchObject({ ok: true, finalHash: partyRec.finalHash });
            const pvpRec = JSON.parse(readFileSync(join(vendor, 'hearthwood-pvp.fixture.json'), 'utf8'));
            expect(pvpRec).toMatchObject({ v: 3, mode: 'pvp', map: 'hearthwood' });
            expect(party?.verifyPvpReplay?.(pvpRec)).toMatchObject({ ok: true, finalHash: pvpRec.finalHash });
            expect(simFor(18)?.party?.verifyPvpReplay?.({ ...pvpRec, simVersion: 18 })).toMatchObject({ ok: false });
        }, 180_000);

        it('sim v22 (Hearthwood rebuilt to the standard MOBA layout): its records verify on v22 only; v21 stays frozen', () => {
            const v21 = fixture(21, 'rookie');
            const v22 = fixture(22, 'rookie');
            expect(verifyBySimVersion(v21)).toMatchObject({ ok: true, finalHash: v21.finalHash, ticks: v21.ticks });
            expect(verifyBySimVersion(v22)).toMatchObject({ ok: true, finalHash: v22.finalHash, ticks: v22.ticks });
            expect(verifyBySimVersion({ ...v22, simVersion: 19 }).ok).toBe(false);
            const solo = fixture(22, 'hearthwood') as any;
            expect(solo).toMatchObject({ v: 1, simVersion: 22, map: 'hearthwood' });
            expect(verifyBySimVersion(solo)).toMatchObject({ ok: true, finalHash: solo.finalHash, ticks: solo.ticks });
            // the carved jungle plays differently, so the v21 sim refuses a v22 Hearthwood record
            expect(verifyBySimVersion({ ...solo, simVersion: 21 }).ok).toBe(false);
            const party = simFor(22)?.party;
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v22');
            const pvpRec = JSON.parse(readFileSync(join(vendor, 'hearthwood-pvp.fixture.json'), 'utf8'));
            expect(party?.verifyPvpReplay?.(pvpRec)).toMatchObject({ ok: true, finalHash: pvpRec.finalHash });
            expect(simFor(21)?.party?.verifyPvpReplay?.({ ...pvpRec, simVersion: 21 })).toMatchObject({ ok: false });
        }, 180_000);

        it('sim v22 Blitz: a genuine Blitz record verifies on v22; v21 (no mutators) refuses it', () => {
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v22');
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 22, mutator: 'blitz' });
            expect(blitz.ticks).toBeLessThanOrEqual(5_850);
            const v = verifyBySimVersion(blitz);
            expect(v).toMatchObject({ ok: true, finalHash: blitz.finalHash, ticks: blitz.ticks });
            expect(['core', 'timeUp']).toContain((v as { reason?: string }).reason);
            expect(verifyBySimVersion({ ...blitz, simVersion: 21 })).toMatchObject({ ok: false });
            expect(verifyBySimVersion({ ...blitz, mutator: 'none' })).toMatchObject({ ok: false });
            expect(verifyBySimVersion({ ...blitz, map: 'hearthwood' })).toMatchObject({
                ok: false,
                code: 'PAWLEGENDS_REPLAY_INVALID',
            });
        }, 120_000);

        it('sim v23 (Op.Kite, KITE-FIX.md): a kite record verifies on v23 only; bot-only v22 records replay the same on v23', () => {
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v23');
            const kite = JSON.parse(readFileSync(join(vendor, 'kite-replay.fixture.json'), 'utf8'));
            expect(kite).toMatchObject({ v: 1, simVersion: 23, hero: 'rocket', mutator: 'none' });
            expect(verifyBySimVersion(kite)).toMatchObject({ ok: true, finalHash: kite.finalHash, ticks: kite.ticks });
            // v22 has no opcode 12, so it refuses the record
            expect(verifyBySimVersion({ ...kite, simVersion: 22 })).toMatchObject({ ok: false });
            // bots never kite: a v22 bot-only record (solo, Blitz) plays byte for byte on v23
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v22 = fixture(22, name);
                expect(verifyBySimVersion({ ...v22, simVersion: 23 })).toMatchObject({
                    ok: true,
                    finalHash: v22.finalHash,
                    ticks: v22.ticks,
                });
            }
            const blitz = JSON.parse(
                readFileSync(
                    join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v22', 'blitz-replay.fixture.json'),
                    'utf8'
                )
            );
            expect(verifyBySimVersion({ ...blitz, simVersion: 23 })).toMatchObject({
                ok: true,
                finalHash: blitz.finalHash,
            });
        }, 180_000);

        it('sim v25 (deliberate fun toys, V21-FUN.md §2.3): its records verify on v25 only; v24 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v24 = fixture(24, name);
                const v25 = fixture(25, name);
                expect(verifyBySimVersion(v24)).toMatchObject({ ok: true, finalHash: v24.finalHash, ticks: v24.ticks });
                expect(verifyBySimVersion(v25)).toMatchObject({ ok: true, finalHash: v25.finalHash, ticks: v25.ticks });
                // bots kick, take and step onto the toys differently, so the matches differ and v24 refuses a v25 record
                expect(v25.finalHash).not.toBe(v24.finalHash);
                expect(verifyBySimVersion({ ...v25, simVersion: 24 }).ok).toBe(false);
            }
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v25');
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 25, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            expect(verifyBySimVersion({ ...blitz, simVersion: 24 }).ok).toBe(false);
            const v24blitz = JSON.parse(readFileSync(join(vendor, '..', 'v24', 'blitz-replay.fixture.json'), 'utf8'));
            expect(verifyBySimVersion(v24blitz)).toMatchObject({ ok: true, finalHash: v24blitz.finalHash });
        }, 180_000);

        it('sim v24 (instant Boing Beds, V21-FUN.md §2.1): its records verify on v24 only; v23 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v23 = fixture(23, name);
                const v24 = fixture(24, name);
                expect(verifyBySimVersion(v23)).toMatchObject({ ok: true, finalHash: v23.finalHash, ticks: v23.ticks });
                expect(verifyBySimVersion(v24)).toMatchObject({ ok: true, finalHash: v24.finalHash, ticks: v24.ticks });
                // the state grew (bedT, the stand timer), so every match hashes differently and v23 refuses a v24 record
                expect(v24.finalHash).not.toBe(v23.finalHash);
                expect(verifyBySimVersion({ ...v24, simVersion: 23 }).ok).toBe(false);
            }
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v24');
            const kite = JSON.parse(readFileSync(join(vendor, 'kite-replay.fixture.json'), 'utf8'));
            expect(kite).toMatchObject({ v: 1, simVersion: 24, hero: 'rocket' });
            expect(verifyBySimVersion(kite)).toMatchObject({ ok: true, finalHash: kite.finalHash, ticks: kite.ticks });
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 24, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            expect(verifyBySimVersion({ ...blitz, simVersion: 23 }).ok).toBe(false);
        }, 180_000);

        it('sim v20 (Wild Rift basic attacks, V20-CHASE.md): its own records verify on v20; v19 stays frozen and verifies its own', () => {
            const v19 = fixture(19, 'rookie');
            const v20 = fixture(20, 'rookie');
            expect(verifyBySimVersion(v19)).toMatchObject({ ok: true, finalHash: v19.finalHash, ticks: v19.ticks });
            expect(verifyBySimVersion(v20)).toMatchObject({ ok: true, finalHash: v20.finalHash, ticks: v20.ticks });
            const solo = fixture(20, 'hearthwood') as any;
            expect(solo).toMatchObject({ v: 1, simVersion: 20, map: 'hearthwood' });
            expect(verifyBySimVersion(solo)).toMatchObject({ ok: true, finalHash: solo.finalHash, ticks: solo.ticks });
            const party = simFor(20)?.party;
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v20');
            const pvpRec = JSON.parse(readFileSync(join(vendor, 'hearthwood-pvp.fixture.json'), 'utf8'));
            expect(pvpRec).toMatchObject({ v: 3, mode: 'pvp', map: 'hearthwood', simVersion: 20 });
            expect(party?.verifyPvpReplay?.(pvpRec)).toMatchObject({ ok: true, finalHash: pvpRec.finalHash });
        }, 180_000);

        it('sim v21 (Kibble Cannon, Boing Beds, Yarn Ball, stronger towers): its records verify on v21 only; v20 stays frozen', () => {
            const v20 = fixture(20, 'rookie');
            const v21 = fixture(21, 'rookie');
            expect(verifyBySimVersion(v20)).toMatchObject({ ok: true, finalHash: v20.finalHash, ticks: v20.ticks });
            expect(verifyBySimVersion(v21)).toMatchObject({ ok: true, finalHash: v21.finalHash, ticks: v21.ticks });
            // the state grew (the cannon, the yarn balls, the bed cooldowns), so a Crossing match hashes differently
            expect(v21.finalHash).not.toBe(v20.finalHash);
            expect(verifyBySimVersion({ ...v21, simVersion: 20 }).ok).toBe(false);
            const solo = fixture(21, 'hearthwood') as any;
            expect(solo).toMatchObject({ v: 1, simVersion: 21, map: 'hearthwood' });
            expect(verifyBySimVersion(solo)).toMatchObject({ ok: true, finalHash: solo.finalHash, ticks: solo.ticks });
            const party = simFor(21)?.party;
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v21');
            const pvpRec = JSON.parse(readFileSync(join(vendor, 'hearthwood-pvp.fixture.json'), 'utf8'));
            expect(party?.verifyPvpReplay?.(pvpRec)).toMatchObject({ ok: true, finalHash: pvpRec.finalHash });
            expect(simFor(20)?.party?.verifyPvpReplay?.({ ...pvpRec, simVersion: 20 })).toMatchObject({ ok: false });
        }, 180_000);

        it('sim v13 (party play, frozen) still verifies; v13 and v14 both carry party code (v12 shipped without it)', () => {
            const v13 = fixture(13, 'rookie');
            expect(verifyBySimVersion(v13)).toMatchObject({ ok: true, finalHash: v13.finalHash, ticks: v13.ticks });
            expect(simFor(12)?.party).toBeUndefined();
            expect(simFor(13)?.party?.PARTY_SINCE).toBe(13);
            expect(simFor(14)?.party?.PARTY_SINCE).toBe(13);
            expect(simFor(13)?.party?.HERO_IDS).not.toContain('chili');
            expect(simFor(14)?.party?.HERO_IDS).toContain('chili');
            // Sim v15: the frozen v14 serves v14 party clients during the rollout; the live v15 has the ten dogs.
            expect(simFor(15)?.party?.PARTY_SINCE).toBe(13);
            expect(simFor(14)?.party?.HERO_IDS).not.toContain('frankie');
            expect(simFor(15)?.party?.HERO_IDS).toContain('frankie');
            expect(simFor(15)?.party?.HERO_IDS).toHaveLength(20);
            // Sim v16 (S-PvP): the party format is unchanged, so PARTY_SINCE stays 13.
            expect(simFor(16)?.party?.PARTY_SINCE).toBe(13);
            expect(simFor(16)?.party?.HERO_IDS).toHaveLength(20);
        }, 60_000);

        it('sim v12: the verified stats carry Fish, Toys, last hits and Toy timings (older versions leave them out)', () => {
            const v12 = verifyBySimVersion(fixture(12, 'champion'));
            expect(v12.ok).toBe(true);
            const stats = (v12 as any).stats as Record<string, number>[];
            expect(stats).toHaveLength(6);
            for (const s of stats) {
                for (const key of ['fish', 'toys', 'lastHits', 'toy1At', 'toy2At', 'toy3At', 'toy4At'])
                    expect(typeof s[key]).toBe('number');
                expect(s.toys).toBeGreaterThanOrEqual(0);
                expect(s.toys).toBeLessThanOrEqual(4);
            }
            expect(stats.some(s => s.fish > 0)).toBe(true);
            const v11 = verifyBySimVersion(fixture(11, 'champion')) as any;
            expect(v11.stats[0].fish).toBeUndefined();
        }, 60_000);

        it.each([[10], [11], [12], [13], [14], [15], [16], [17], [18], [19], [20], [21], [22], [23], [24], [25]])(
            'sim v%s forfeit (GAPS B2): a genuine forfeited Normal match verifies, is a loss stored as quit, pays nothing',
            async simVersion => {
                // Recorded by `npm run vendor-sim` (FORFEIT_FIXTURE_SEED: the normal player-bot to 4:00, then Op.Forfeit).
                const record = fixture(simVersion, 'forfeit');
                expect(record).toMatchObject({ difficulty: 'normal', outcome: 'lost', simVersion, ticks: 7201 });
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
            },
            60_000
        );

        it.each([[10], [11], [12], [13], [14], [15], [16], [17], [18], [19], [20], [21], [22], [23], [24], [25]])(
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

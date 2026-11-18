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
    name:
        | 'rookie'
        | 'champion'
        | 'forfeit'
        | 'dog'
        | 'new-dog'
        | 'pvp'
        | 'hearthwood'
        | 'roster'
        | 'roster31'
        | 'late'
        | 'blitz'
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
                    simVersions: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
                },
                // force update (FORCE-UPDATE.md §5.3): the game shows "Update needed" instead of a silent rejection
                update: { action: 'update', minSim: 24, liveSim: SIM_VERSION, web: 'https://pawlegends.app/play' },
            });
            expect(verify).not.toHaveBeenCalled();
            expect(games.rows).toHaveLength(0);
        }
    );

    it('sim v37 verifier: accepts v24 to v37 (GAPS B0; v9 to v23 retired), names all fourteen in GET /pawlegends/sim', async () => {
        expect(SIM_VERSION).toBe(37);
        expect(SIM_VERSIONS).toEqual([24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]);
        expect(PAWLEGENDS_SIM_INFO).toMatchObject({
            simVersion: 37,
            simVersions: [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
        });
        expect(Object.keys(PAWLEGENDS_SIM_INFO.bundles)).toEqual([
            '24',
            '25',
            '26',
            '27',
            '28',
            '29',
            '30',
            '31',
            '32',
            '33',
            '34',
            '35',
            '36',
            '37',
        ]);
        const fakeHash: Record<number, string> = {
            24: '24240000',
            25: '25250000',
            26: '26260000',
            27: '27270000',
            28: '28280000',
            29: '29290000',
            30: '30300000',
            31: '31310000',
            32: '32320000',
            33: '33330000',
            34: '34340000',
            35: '35350000',
            36: '36360000',
            37: '37370000',
        };
        for (const simVersion of [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37]) {
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
        // sim v37 retired v20 to v23: a v21 Blitz record is refused (an unknown version) before any re-sim
        const record = genuine({ mutator: 'blitz', simVersion: 21 });
        const { save, verify } = setup(record);
        const refused = await codeOf(save(record));
        expect(refused?.status).toBe(400);
        expect([ErrorCode.PAWLEGENDS_REPLAY_INVALID, ErrorCode.PAWLEGENDS_SIM_VERSION]).toContain(refused?.code);
        expect(verify).not.toHaveBeenCalled();
        // the digest covers the mutator: the same match saved as 'none' is another record
        expect(pawlegendsDigest(genuine({ mutator: 'blitz' }))).not.toBe(
            pawlegendsDigest(genuine({ mutator: 'none' }))
        );
    });

    it('sim v27: the DTO takes Cannon Chaos and the weekly twists (never the unsaved Practice ground); an older sim with one is refused before any re-sim', async () => {
        const errorsOf = async (record: unknown) =>
            (await validate(plainToInstance(PawlegendsReplayDto, record) as object)).map(error => error.property);
        for (const mutator of ['cannon', 'toybox', 'rapid', 'bounty'] as const) {
            expect(await errorsOf(genuine({ mutator, simVersion: 27 }))).toEqual([]);
            const record = genuine({ mutator, simVersion: 26 });
            const { save, verify } = setup(record);
            expect(await codeOf(save(record))).toEqual({ status: 400, code: ErrorCode.PAWLEGENDS_REPLAY_INVALID });
            expect(verify).not.toHaveBeenCalled();
        }
        expect(await errorsOf(genuine({ mutator: 'practice' as any, simVersion: 27 }))).toEqual(['mutator']);
    });

    it('sim v28: the DTO takes One Lane Brawl, the Duel and Boss Weekend; an older sim with one is refused before any re-sim', async () => {
        const errorsOf = async (record: unknown) =>
            (await validate(plainToInstance(PawlegendsReplayDto, record) as object)).map(error => error.property);
        for (const mutator of ['onelane', 'duel', 'boss'] as const) {
            expect(await errorsOf(genuine({ mutator, simVersion: 28 }))).toEqual([]);
            const record = genuine({ mutator, simVersion: 27 });
            const { save, verify } = setup(record);
            expect(await codeOf(save(record))).toEqual({ status: 400, code: ErrorCode.PAWLEGENDS_REPLAY_INVALID });
            expect(verify).not.toHaveBeenCalled();
        }
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
        // Both workers start cold here, from TypeScript sources: every vendored sim through ts-node, about 10 s idle and
        // past 60 s on a busy CI runner. Warm them once so the tests below time the replays, not the start.
        beforeAll(async () => {
            const malformed = { ...genuine(), hero: 'nobody' } as any;
            await Promise.all([worker.verify(malformed), pawlegendsReplayWorker.verify(malformed)]);
        }, 330_000);
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
            // a third cold start in this file (from sources, see beforeAll): the limit leaves room for a busy runner
        }, 330_000);

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

        it.each([[24], [25], [26], [27], [28], [29], [30], [31], [32], [33], [34], [35], [36], [37]])(
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

        it('sim v37 (bots commit to a walk goal on the 3v3 maps, the Blitz rout and rows, V37.md): every live v37 fixture verifies; the same record labelled v36 is refused; v36 stays frozen and verifies its own; a v36 Hearthwood record verifies on v37 unchanged', () => {
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim');
            const read = (v: number) =>
                JSON.parse(
                    readFileSync(join(vendor, `v${v}`, 'maps-replay.fixture.json'), 'utf8')
                ) as PawlegendsReplayRecord[];
            for (const live of [fixture(37, 'late'), ...read(37)]) {
                expect(live).toMatchObject({ simVersion: 37, difficulty: 'normal' });
                expect(verifyBySimVersion(live)).toMatchObject({
                    ok: true,
                    finalHash: live.finalHash,
                    ticks: live.ticks,
                });
                // the bots walk differently on every 3v3 map, so v36 refuses each of them
                expect(verifyBySimVersion({ ...live, simVersion: 36 }).ok).toBe(false);
            }
            for (const v36 of [fixture(36, 'late'), ...read(36)])
                expect(verifyBySimVersion(v36)).toMatchObject({ ok: true, finalHash: v36.finalHash, ticks: v36.ticks });
            const blitz = fixture(37, 'blitz');
            expect(blitz).toMatchObject({ simVersion: 37, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            // Hearthwood keeps its bots and the new memory is empty there: the v36 record re-sims to the same hash
            const hw = fixture(36, 'hearthwood');
            expect(verifyBySimVersion({ ...hw, simVersion: 37 })).toMatchObject({
                ok: true,
                finalHash: hw.finalHash,
                ticks: hw.ticks,
            });
        }, 300_000);

        it('sim v36 (the v35 hero balance pass, V36-BALANCE.md): every live v36 fixture verifies; the same record labelled v35 is refused; v35 stays frozen and verifies its own fixtures', () => {
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim');
            const read = (v: number) =>
                JSON.parse(
                    readFileSync(join(vendor, `v${v}`, 'maps-replay.fixture.json'), 'utf8')
                ) as PawlegendsReplayRecord[];
            for (const live of [fixture(36, 'late'), ...read(36)]) {
                expect(live).toMatchObject({ simVersion: 36, difficulty: 'normal' });
                expect(verifyBySimVersion(live)).toMatchObject({
                    ok: true,
                    finalHash: live.finalHash,
                    ticks: live.ticks,
                });
            }
            // a balance pass changes only matches with a re-rowed hero: at least one live fixture must differ under v35
            expect(
                [fixture(36, 'late'), ...read(36)].some(
                    live => verifyBySimVersion({ ...live, simVersion: 35 }).ok === false
                )
            ).toBe(true);
            for (const v35 of [fixture(35, 'late'), ...read(35)])
                expect(verifyBySimVersion(v35)).toMatchObject({ ok: true, finalHash: v35.finalHash, ticks: v35.ticks });
        }, 300_000);

        it('sim v35 (deaths punish more, much more kill XP, V35-DEATHS.md): every live v35 fixture verifies; the same record labelled v34 is refused; v34 stays frozen and verifies its own pool-map fixtures', () => {
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim');
            const read = (v: number) =>
                JSON.parse(
                    readFileSync(join(vendor, `v${v}`, 'maps-replay.fixture.json'), 'utf8')
                ) as PawlegendsReplayRecord[];
            for (const live of [fixture(35, 'late'), ...read(35)]) {
                expect(live).toMatchObject({ simVersion: 35, difficulty: 'normal' });
                expect(verifyBySimVersion(live)).toMatchObject({
                    ok: true,
                    finalHash: live.finalHash,
                    ticks: live.ticks,
                });
                expect(verifyBySimVersion({ ...live, simVersion: 34 }).ok).toBe(false);
            }
            for (const v34 of read(34))
                expect(verifyBySimVersion(v34)).toMatchObject({ ok: true, finalHash: v34.finalHash, ticks: v34.ticks });
        }, 300_000);

        it('sim v34 (the 3v3 map pool, V34-MAPS.md): a match on each pool map verifies; the same record labelled v33 is refused; v33 stays frozen and verifies its own late fixture', () => {
            const maps = JSON.parse(
                readFileSync(
                    join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v34', 'maps-replay.fixture.json'),
                    'utf8'
                )
            ) as PawlegendsReplayRecord[];
            expect(maps.map(r => r.map)).toEqual(['ridge', 'thicket', 'quarry', 'pitch']);
            for (const live of maps) {
                expect(live).toMatchObject({ simVersion: 34, difficulty: 'normal' });
                expect(verifyBySimVersion(live)).toMatchObject({
                    ok: true,
                    finalHash: live.finalHash,
                    ticks: live.ticks,
                });
                expect(verifyBySimVersion({ ...live, simVersion: 33 }).ok).toBe(false);
            }
            const v33 = fixture(33, 'late');
            expect(verifyBySimVersion(v33)).toMatchObject({ ok: true, finalHash: v33.finalHash, ticks: v33.ticks });
        }, 300_000);

        it('sim v33 (kills matter more, respawns grow, V33-KILLS.md): a v33 Normal match verifies; the same record labelled v32 is refused; v32 stays frozen and verifies its own late fixture', () => {
            const live = fixture(33, 'late');
            expect(live).toMatchObject({ simVersion: 33, difficulty: 'normal' });
            expect(verifyBySimVersion(live)).toMatchObject({ ok: true, finalHash: live.finalHash, ticks: live.ticks });
            expect(verifyBySimVersion({ ...live, simVersion: 32 }).ok).toBe(false);
            const v32 = fixture(32, 'late');
            expect(verifyBySimVersion(v32)).toMatchObject({ ok: true, finalHash: v32.finalHash, ticks: v32.ticks });
        }, 180_000);

        it('sim v32 (no Sudden Death, V32-NO-SUDDEN-DEATH.md): a Normal match past the late tick verifies and ends on a core; the same record labelled v31 (Sudden Death burn) is refused; v31 stays frozen and verifies its own', () => {
            const late = fixture(32, 'late');
            expect(late).toMatchObject({ simVersion: 32, difficulty: 'normal' });
            expect(verifyBySimVersion(late)).toMatchObject({ ok: true, finalHash: late.finalHash, ticks: late.ticks });
            expect(verifyBySimVersion({ ...late, simVersion: 31 }).ok).toBe(false);
            for (const name of ['rookie', 'hearthwood', 'roster31'] as const) {
                const v31 = fixture(31, name);
                expect(verifyBySimVersion(v31)).toMatchObject({ ok: true, finalHash: v31.finalHash, ticks: v31.ticks });
            }
        }, 180_000);

        it('sim v31 (the second roster release, ROSTER-V31.md): a replay played as a v31 hero (Ranger) verifies; the same record labelled v30 is refused (no Ranger there); v30 stays frozen and verifies its own', () => {
            const roster = fixture(31, 'roster31');
            expect(roster).toMatchObject({ hero: 'ranger', simVersion: 31, difficulty: 'easy' });
            expect(verifyBySimVersion(roster)).toMatchObject({
                ok: true,
                finalHash: roster.finalHash,
                ticks: roster.ticks,
            });
            expect(verifyBySimVersion({ ...roster, simVersion: 30 }).ok).toBe(false);
            for (const name of ['rookie', 'hearthwood', 'roster'] as const) {
                const v30 = fixture(30, name);
                expect(verifyBySimVersion(v30)).toMatchObject({ ok: true, finalHash: v30.finalHash, ticks: v30.ticks });
            }
        }, 180_000);

        it('sim v30 (the 5v5 balance release, V30-BALANCE.md): Crossing replays are unchanged from v29, Hearthwood ones are not; v29 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'roster'] as const) {
                const v29 = fixture(29, name);
                expect(verifyBySimVersion({ ...v29, simVersion: 30 })).toMatchObject({
                    ok: true,
                    finalHash: v29.finalHash,
                    ticks: v29.ticks,
                });
            }
            for (const name of ['rookie', 'hearthwood', 'roster'] as const) {
                const v29 = fixture(29, name);
                const v30 = fixture(30, name);
                expect(verifyBySimVersion(v29)).toMatchObject({ ok: true, finalHash: v29.finalHash, ticks: v29.ticks });
                expect(verifyBySimVersion(v30)).toMatchObject({ ok: true, finalHash: v30.finalHash, ticks: v30.ticks });
            }
            const hearth29 = fixture(29, 'hearthwood');
            expect(verifyBySimVersion({ ...hearth29, simVersion: 30 }).ok).toBe(false);
        }, 180_000);

        it('sim v29 (the roster release, ROSTER-V29.md): a replay played as a roster hero (Biscuit) verifies; the same record labelled v28 is refused (no Biscuit there); v28 stays frozen and verifies its own', () => {
            const roster = fixture(29, 'roster');
            expect(roster).toMatchObject({ hero: 'biscuit', simVersion: 29, difficulty: 'easy' });
            expect(verifyBySimVersion(roster)).toMatchObject({
                ok: true,
                finalHash: roster.finalHash,
                ticks: roster.ticks,
            });
            expect(verifyBySimVersion({ ...roster, simVersion: 28 }).ok).toBe(false);
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v28 = fixture(28, name);
                const v29 = fixture(29, name);
                expect(verifyBySimVersion(v28)).toMatchObject({ ok: true, finalHash: v28.finalHash, ticks: v28.ticks });
                expect(verifyBySimVersion(v29)).toMatchObject({ ok: true, finalHash: v29.finalHash, ticks: v29.ticks });
            }
        }, 180_000);

        it('sim v28 (bot pushes and lead protection, One Lane Brawl, the Duel, Boss Weekend, V28.md): its records verify on v28; v27 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v27 = fixture(27, name);
                const v28 = fixture(28, name);
                expect(verifyBySimVersion(v27)).toMatchObject({ ok: true, finalHash: v27.finalHash, ticks: v27.ticks });
                expect(verifyBySimVersion(v28)).toMatchObject({ ok: true, finalHash: v28.finalHash, ticks: v28.ticks });
                // the world grew (Boss Weekend's globals), so every v28 record differs from v27's
                expect(verifyBySimVersion({ ...v28, simVersion: 27 }).ok).toBe(false);
            }
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v28');
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 28, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            const v27blitz = JSON.parse(readFileSync(join(vendor, '..', 'v27', 'blitz-replay.fixture.json'), 'utf8'));
            expect(verifyBySimVersion(v27blitz)).toMatchObject({ ok: true, finalHash: v27blitz.finalHash });
            // a v27 record never carries a v28 mutator: the v27 sim refuses them
            for (const mutator of ['onelane', 'duel', 'boss'])
                expect(verifyBySimVersion({ ...v27blitz, mutator }).ok).toBe(false);
        }, 180_000);

        it('sim v27 (executions, Cannon Chaos and the weekly twists, V27.md): its records verify on v27 only; v26 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v26 = fixture(26, name);
                const v27 = fixture(27, name);
                expect(verifyBySimVersion(v26)).toMatchObject({ ok: true, finalHash: v26.finalHash, ticks: v26.ticks });
                expect(verifyBySimVersion(v27)).toMatchObject({ ok: true, finalHash: v27.finalHash, ticks: v27.ticks });
                // Hearthwood's towers changed (chip floor, Fortified 5:00, outer HP), so v26 refuses a v27 5v5 record; a
                // Crossing record with no execution in it plays the same on both
                if (name === 'hearthwood') expect(verifyBySimVersion({ ...v27, simVersion: 26 }).ok).toBe(false);
            }
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v27');
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 27, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            const v26blitz = JSON.parse(readFileSync(join(vendor, '..', 'v26', 'blitz-replay.fixture.json'), 'utf8'));
            expect(verifyBySimVersion(v26blitz)).toMatchObject({ ok: true, finalHash: v26blitz.finalHash });
            // a v26 record never carries a v27 mutator: the v26 sim refuses Cannon Chaos and the twists
            for (const mutator of ['cannon', 'toybox', 'rapid', 'bounty'])
                expect(verifyBySimVersion({ ...v26blitz, mutator }).ok).toBe(false);
        }, 180_000);

        it('sim v26 (stronger towers early, V26-TOWERS.md): its records verify on v26 only; v25 stays frozen and verifies its own', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v25 = fixture(25, name);
                const v26 = fixture(26, name);
                expect(verifyBySimVersion(v25)).toMatchObject({ ok: true, finalHash: v25.finalHash, ticks: v25.ticks });
                expect(verifyBySimVersion(v26)).toMatchObject({ ok: true, finalHash: v26.finalHash, ticks: v26.ticks });
                // towers shoot, chip and take damage differently, so the matches differ and v25 refuses a v26 record
                expect(v26.finalHash).not.toBe(v25.finalHash);
                expect(verifyBySimVersion({ ...v26, simVersion: 25 }).ok).toBe(false);
            }
            const vendor = join(__dirname, '..', 'vendor', 'pawlegends-sim', 'v26');
            const blitz = JSON.parse(readFileSync(join(vendor, 'blitz-replay.fixture.json'), 'utf8'));
            expect(blitz).toMatchObject({ v: 1, simVersion: 26, mutator: 'blitz' });
            expect(verifyBySimVersion(blitz)).toMatchObject({ ok: true, finalHash: blitz.finalHash });
            expect(verifyBySimVersion({ ...blitz, simVersion: 25 }).ok).toBe(false);
            const v25blitz = JSON.parse(readFileSync(join(vendor, '..', 'v25', 'blitz-replay.fixture.json'), 'utf8'));
            expect(verifyBySimVersion(v25blitz)).toMatchObject({ ok: true, finalHash: v25blitz.finalHash });
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

        it('sim v24 (instant Boing Beds, V21-FUN.md §2.1): its records verify on v24 (the oldest kept sim since v37 retired v20 to v23)', () => {
            for (const name of ['rookie', 'hearthwood'] as const) {
                const v24 = fixture(24, name);
                expect(verifyBySimVersion(v24)).toMatchObject({ ok: true, finalHash: v24.finalHash, ticks: v24.ticks });
                // v23 is retired: the same record labelled 23 is refused like any unknown version
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

        it('sim v37 retired v20 to v23 (backend build memory, V37.md §6): no sim is kept for them and their records are refused', () => {
            for (const v of [20, 21, 22, 23]) {
                expect(simFor(v)).toBeNull();
                expect(SIM_VERSIONS).not.toContain(v);
                expect(verifyBySimVersion({ ...fixture(24, 'rookie'), simVersion: v }).ok).toBe(false);
            }
        });

        it.each([[24], [25], [26], [27], [28], [29], [30], [31], [32], [33], [34], [35], [36], [37]])(
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

        it.each([[24], [25], [26], [27], [28], [29], [30], [31], [32], [33], [34], [35], [36], [37]])(
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

import { BadRequestException, ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AppValidationPipe } from '../dto/live-game.dto';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GameType } from 'src/game/game.schema';
import { HEIST_LEVEL_CAPS, HEIST_LEVELS } from 'src/shared-contracts/caps';
import { ErrorCode } from 'src/shared-contracts/errors';
import { CAT_IDS, computeStars, LEVELS, SIM_VERSION, STAR_WIN } from 'src/vendor/heist-sim';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { LiveGameUserThrottleGuard } from '../live-game-throttle.guard';
import { UserController } from '../user.controller';
import { FakeGames, FakeUsers } from './fake-live-store.helper-spec';
import { goldenLog, withRuns } from './heist-test-logs.helper-spec';
import {
    HEIST_REPLAY_IP_THROTTLE,
    heistReplayBucket,
    HeistReplayIpThrottleGuard,
    wantsReplay,
} from './heist-ip-throttle.guard';
import { warnIfProxyUntrusted } from './proxy-warning';
import { replayDigest, saveHeistRun } from './heist-live';
import { heistReplayQueue, ReplayQueue, ReplayQueueFullException } from './replay-queue';

jest.mock('../user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

const HANDLER = 'Tcatbassadors';

function createController(users = new FakeUsers(), games = new FakeGames()) {
    const controller = Object.create(UserController.prototype);
    controller.pawMatchLeaderboardCache = new Map();
    controller.repository = users;
    controller.gameRepository = games;
    return { controller, users, games };
}

/** Runs the body through the global pipe from main.ts and the route's own pipes, then the handler. */
async function post(
    controller: any,
    userId: string,
    body: Record<string, unknown>,
    req: any = { res: { setHeader: jest.fn() } }
) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, HANDLER) || {};
    const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
    const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, HANDLER)[bodyArg.index];
    let value: unknown = body;
    for (const pipe of [new AppValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
        value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
    }
    return controller[HANDLER](userId, value, req);
}

const heistBody = (replay: unknown, extra: Record<string, unknown> = {}) => ({
    type: GameType.CATNIP_HEIST,
    replay,
    ...extra,
});

/** The F5.6 code of a thrown HttpException, or undefined. */
const codeOf = (error: unknown) => ((error as HttpException).getResponse() as { code?: string }).code;

async function expectRejected(promise: Promise<unknown>, type: any, code?: string) {
    const error = await promise.then(
        () => undefined,
        caught => caught
    );
    expect(error).toBeInstanceOf(type);
    if (code) {
        expect(codeOf(error)).toBe(code);
    }
    return error;
}

describe('POST /user/catbassadors/live, CATNIP_HEIST (replay-verified branch)', () => {
    it('makes exactly one row from a valid replay, with the server score and outcome, ignoring client points', async () => {
        const { controller, users, games } = createController();
        const userId = users.add();
        const log = goldenLog('heist-01');

        const response = await post(
            controller,
            userId,
            heistBody(log, { points: 99999, level: 'heist-01', platform: 'ios' })
        );

        expect(games.create).toHaveBeenCalledTimes(1);
        const row = games.rows[0];
        expect(row).toMatchObject({
            type: 'CATNIP_HEIST',
            level: 'heist-01',
            points: log.score,
            score: log.score,
            outcome: 'won',
            platform: 'ios',
            time: Math.round((log.ticks / 30) * 100) / 100,
        });
        expect(row.points).not.toBe(99999);
        expect(row.replayDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(row.replayDigest).toBe(replayDigest(log));
        expect(String(row.user)).toBe(userId);
        expect(row.cat).toBe(users.get(userId).cat);

        const stars = computeStars(log, true, { coins: LEVELS[0].coins, meta: { parTicks: LEVELS[0].parTicks } });
        expect(response).toMatchObject({
            levelId: 'heist-01',
            levelIndex: 0,
            score: log.score,
            stars,
            newStars: stars,
        });
        expect(response.heistScore).toEqual([log.score, 0, 0, 0, 0, 0, 0, 0]);
        expect(response.heistStars).toEqual([stars, 0, 0, 0, 0, 0, 0, 0]);
        expect(users.get(userId).heistScore).toEqual(response.heistScore);
        expect(users.get(userId).heistStars).toEqual(response.heistStars);
        expect(users.get(userId).lastPlayedAt).toBeInstanceOf(Date);
    });

    it.each(['abc', -5, 1.5, null, { $gt: 1 }])('ignores client points %j for CATNIP_HEIST', async points => {
        const { controller, users, games } = createController();
        await post(controller, users.add(), heistBody(goldenLog('heist-02'), { points }));
        expect(games.rows[0].points).toBe(goldenLog('heist-02').score);
    });

    it('saves every golden level with its own slot, score and stars', async () => {
        const { controller, users } = createController();
        const userId = users.add();
        for (const levelId of HEIST_LEVELS) {
            await post(controller, userId, heistBody(goldenLog(levelId)));
        }
        const user = users.get(userId);
        expect(user.heistScore).toEqual(HEIST_LEVELS.map(id => goldenLog(id).score));
        user.heistScore.forEach((score: number, index: number) =>
            expect(score).toBeLessThanOrEqual(HEIST_LEVEL_CAPS[index])
        );
        user.heistStars.forEach((mask: number) => expect(mask & STAR_WIN).toBe(STAR_WIN));
    });

    describe('400s write nothing', () => {
        const cases: [string, () => unknown, string][] = [
            [
                'trailing input after the win',
                () => withRuns(goldenLog(), [...goldenLog().runs, [0, 0, 0, 1]]),
                ErrorCode.HEIST_TRAILING_INPUT,
            ],
            ['a wrong seed', () => ({ ...goldenLog(), seed: 2 }), ErrorCode.HEIST_REPLAY_INVALID],
            [
                'a wrong sim version',
                () => ({ ...goldenLog(), simVersion: SIM_VERSION + 1 }),
                ErrorCode.HEIST_SIM_VERSION,
            ],
            [
                'an old sim version',
                () => ({ ...goldenLog(), simVersion: SIM_VERSION - 1 }),
                ErrorCode.HEIST_SIM_VERSION,
            ],
            [
                'an unknown cat id',
                () => ({ ...goldenLog(), catIds: ['bob', 'not-a-cat'] }),
                ErrorCode.HEIST_REPLAY_INVALID,
            ],
            ['the same cat twice', () => ({ ...goldenLog(), catIds: ['bob', 'bob'] }), ErrorCode.HEIST_REPLAY_INVALID],
            ['one cat', () => ({ ...goldenLog(), catIds: ['bob'] }), ErrorCode.HEIST_REPLAY_INVALID],
            [
                'a tick-cap overrun (heist-02 cap 9000)',
                () => ({
                    ...goldenLog('heist-02'),
                    runs: [[0, 0, 0, LEVELS[1].tickCap + 1]],
                    ticks: LEVELS[1].tickCap + 1,
                }),
                ErrorCode.HEIST_REPLAY_INVALID,
            ],
            [
                'over the 18000-tick bound',
                () => ({ ...goldenLog(), runs: [[0, 0, 0, 18001]], ticks: 18001 }),
                ErrorCode.HEIST_REPLAY_INVALID,
            ],
            [
                'counts not summing to ticks',
                () => ({ ...goldenLog(), ticks: goldenLog().ticks + 3 }),
                ErrorCode.HEIST_REPLAY_INVALID,
            ],
            [
                'a malformed run',
                () => ({ ...goldenLog(), runs: [[0, 0, 9, 1], ...goldenLog().runs.slice(1)] }),
                ErrorCode.HEIST_REPLAY_INVALID,
            ],
            ['an unknown level', () => ({ ...goldenLog(), levelId: 'heist-09' }), ErrorCode.HEIST_REPLAY_INVALID],
            ['an unknown field', () => ({ ...goldenLog(), user: 'x' }), ErrorCode.HEIST_REPLAY_INVALID],
            [
                'a run that does not win',
                () => {
                    const log = goldenLog();
                    return withRuns(log, log.runs.slice(0, -1));
                },
                ErrorCode.HEIST_NOT_WON,
            ],
            ['no replay', () => undefined, ErrorCode.HEIST_REPLAY_INVALID],
            ['a replay that is not an object', () => 'heist-01', ErrorCode.HEIST_REPLAY_INVALID],
        ];

        it.each(cases)('%s', async (_name, replay, code) => {
            const { controller, users, games } = createController();
            const userId = users.add();
            const body = replay() === undefined ? { type: GameType.CATNIP_HEIST, points: 1 } : heistBody(replay());
            await expectRejected(post(controller, userId, body), BadRequestException, code);
            expect(games.create).not.toHaveBeenCalled();
            expect(users.update).not.toHaveBeenCalled();
        });

        it('a level that does not match the log', async () => {
            const { controller, users, games } = createController();
            await expectRejected(
                post(controller, users.add(), heistBody(goldenLog(), { level: 'heist-02' })),
                BadRequestException,
                ErrorCode.HEIST_REPLAY_INVALID
            );
            expect(games.create).not.toHaveBeenCalled();
        });

        it.each(['died', 'timeout', 'quit'])('a %s outcome (only wins are saved)', async outcome => {
            const { controller, users, games } = createController();
            await expectRejected(
                post(controller, users.add(), heistBody(goldenLog(), { outcome })),
                BadRequestException,
                ErrorCode.HEIST_NOT_WON
            );
            expect(games.create).not.toHaveBeenCalled();
        });

        it('a replay on a plain mode', async () => {
            const { controller, users, games } = createController();
            await expectRejected(
                post(controller, users.add(), { type: 'MATCH_3', level: '1', points: 1, time: 1, replay: goldenLog() }),
                BadRequestException
            );
            expect(games.create).not.toHaveBeenCalled();
        });
    });

    describe('one canonical log saves once, from any account', () => {
        it('gives 409 HEIST_DUPLICATE to the same log from another account, without replaying it', async () => {
            const { controller, users, games } = createController();
            const first = users.add();
            const second = users.add();
            await post(controller, first, heistBody(goldenLog('heist-05')));
            const runSpy = jest.spyOn(heistReplayQueue, 'run');
            await expectRejected(
                post(controller, second, heistBody(goldenLog('heist-05'))),
                ConflictException,
                ErrorCode.HEIST_DUPLICATE
            );
            expect(runSpy).not.toHaveBeenCalled();
            runSpy.mockRestore();
            expect(games.rows).toHaveLength(1);
            expect(users.get(second).heistScore).toBeUndefined();
        });

        it('treats a re-split recording and another crew as the same log', async () => {
            const { controller, users } = createController();
            await post(controller, users.add(), heistBody(goldenLog('heist-03')));
            const log = goldenLog('heist-03');
            const split = log.runs.flatMap(run =>
                run[3] > 1
                    ? ([
                          [run[0], run[1], run[2], 1],
                          [run[0], run[1], run[2], run[3] - 1],
                      ] as [number, number, number, number][])
                    : [run]
            );
            await expectRejected(
                post(controller, users.add(), heistBody(withRuns(log, split))),
                ConflictException,
                ErrorCode.HEIST_DUPLICATE
            );
            const crew = [CAT_IDS[CAT_IDS.length - 1], CAT_IDS[0]];
            await expectRejected(
                post(controller, users.add(), heistBody({ ...log, catIds: crew })),
                ConflictException,
                ErrorCode.HEIST_DUPLICATE
            );
        });

        it('maps a parallel duplicate that loses on the unique index to 409', async () => {
            const { controller, users, games } = createController();
            const log = goldenLog('heist-04');
            // The pre-check misses (both requests passed it), the index catches the second.
            games.findOne.mockResolvedValue(null);
            await post(controller, users.add(), heistBody(log));
            const loser = users.add();
            await expectRejected(post(controller, loser, heistBody(log)), ConflictException, ErrorCode.HEIST_DUPLICATE);
            expect(games.rows).toHaveLength(1);
            // At most the conditional array guard ran for the loser; no score, stars or lastPlayedAt.
            expect(users.updates.filter(entry => entry.id === loser && !Array.isArray(entry.update))).toHaveLength(0);
        });
    });

    describe('array safety (plan F6)', () => {
        it.each([
            ['missing', {}],
            ['null', { heistScore: null, heistStars: null }],
            ['empty', { heistScore: [], heistStars: [] }],
            ['null-padded', { heistScore: [null, 5], heistStars: [null, 1] }],
        ])('turns %s heist arrays into full arrays, never a sub-document', async (_name, fields) => {
            const { controller, users } = createController();
            const userId = users.add(fields);
            await post(controller, userId, heistBody(goldenLog('heist-02')));
            const user = users.get(userId);
            expect(Array.isArray(user.heistScore)).toBe(true);
            expect(Array.isArray(user.heistStars)).toBe(true);
            expect(user.heistScore).toHaveLength(8);
            expect(user.heistStars).toHaveLength(8);
            expect(user.heistStars.every((mask: unknown) => Number.isInteger(mask))).toBe(true);
            expect(user.heistScore[1]).toBe(goldenLog('heist-02').score);
        });

        it('skips the guard when the arrays are already safe', async () => {
            const { controller, users } = createController();
            const userId = users.add({ heistScore: [0, 0, 0, 0, 0, 0, 0, 0], heistStars: [0, 0, 0, 0, 0, 0, 0, 0] });
            await post(controller, userId, heistBody(goldenLog('heist-06')));
            expect(users.updates.some(entry => Array.isArray(entry.update))).toBe(false);
        });

        it('keeps earlier stars (bitwise or) and the best score ($max)', async () => {
            const { controller, users } = createController();
            const userId = users.add({ heistScore: [999, 0, 0, 0, 0, 0, 0, 0], heistStars: [4, 0, 0, 0, 0, 0, 0, 0] });
            const response = await post(controller, userId, heistBody(goldenLog('heist-01')));
            // 999 is over the level cap, so the recompute clamps it to the cap of heist-01.
            expect(users.get(userId).heistScore[0]).toBe(HEIST_LEVEL_CAPS[0]);
            expect(users.get(userId).heistStars[0]).toBe(4 | response.stars);
            expect(response.newStars).toBe(response.stars & ~4);
        });
    });

    describe('economy isolation (decisions #14, #17)', () => {
        it('never touches catnip, caps, codex, tails or lives, however many heists are saved', async () => {
            const { controller, users } = createController();
            const before = {
                catnipCount: 59,
                catnipChaos: [10, 3],
                catnipChaosCount: 13,
                match3: [46],
                match3Count: 46,
                tails: 7,
                lives: 3,
                codex: [1, 0],
            };
            const userId = users.add(before);
            for (const levelId of HEIST_LEVELS) {
                await post(controller, userId, heistBody(goldenLog(levelId)));
            }
            const user = users.get(userId);
            expect(user).toMatchObject(before);
            const touched = users.updates.flatMap(entry =>
                Array.isArray(entry.update)
                    ? entry.update.flatMap((stage: any) => Object.keys(stage.$set))
                    : Object.values<any>(entry.update).flatMap(fields => Object.keys(fields))
            );
            touched.forEach(path => expect(path).toMatch(/^(heistScore|heistStars|lastPlayedAt)(\.\d+)?$/));
            // Eight real replays: under a parallel full jest run this can pass the 5 s default.
        }, 30000);

        it('keeps the loot-drop export reading catnipCount only (web3.controller.ts, read-only)', () => {
            const source = readFileSync(join(__dirname, '..', '..', 'web3', 'web3.controller.ts'), 'utf8');
            const lootRoute = source.slice(
                source.indexOf("@Get('loot/buyers')"),
                source.indexOf('async grantBoughtCat')
            );
            expect(lootRoute).toContain('catnipCount || 0) >= 60');
            expect(lootRoute).toMatch(/select: 'email -_id catnipCount createdAt'/);
            expect(lootRoute).not.toMatch(/heist/i);
        });
    });

    describe('replay CPU bound', () => {
        it('returns 429 with Retry-After before any simulation when the queue is full', async () => {
            const verify = jest.fn(() => ({ ok: false as const, code: 'HEIST_NOT_WON' as const, reason: 'x' }));
            const never = () => new Promise<never>(() => undefined);
            const queue = new ReplayQueue({ concurrency: 1, maxQueued: 2, execute: never });
            const users = new FakeUsers();
            const games = new FakeGames();
            const deps = { users, games, queue, verify };
            const body: any = { type: GameType.CATNIP_HEIST, replay: goldenLog() };
            // One running, two waiting: the queue is full.
            for (const levelId of ['heist-01', 'heist-02', 'heist-03']) {
                void saveHeistRun(deps, users.add(), { ...body, replay: goldenLog(levelId) });
            }
            await new Promise(resolve => setImmediate(resolve));
            expect(queue.size).toBe(3);
            const error = await expectRejected(
                saveHeistRun(deps, users.add(), { ...body, replay: goldenLog('heist-04') }),
                ReplayQueueFullException
            );
            expect((error as HttpException).getStatus()).toBe(429);
            expect((error as ReplayQueueFullException).retryAfterSeconds).toBeGreaterThanOrEqual(1);
            expect(verify).not.toHaveBeenCalled();
        });

        it('sets Retry-After on the response when the route hits a full queue', async () => {
            const { controller, users } = createController();
            const runSpy = jest.spyOn(heistReplayQueue, 'run').mockImplementation(() => {
                throw new ReplayQueueFullException(3);
            });
            const req = { res: { setHeader: jest.fn() } };
            const error = await expectRejected(
                post(controller, users.add(), heistBody(goldenLog()), req),
                ReplayQueueFullException
            );
            expect((error as HttpException).getStatus()).toBe(429);
            expect(req.res.setHeader).toHaveBeenCalledWith('Retry-After', '3');
            runSpy.mockRestore();
        });

        describe('per-IP replay throttle', () => {
            const storages: ThrottlerStorageService[] = [];
            afterAll(() => storages.forEach(storage => storage.onApplicationShutdown()));

            const context = (req: Record<string, unknown>, res = { header: jest.fn() }) =>
                ({ switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any);

            it('runs right after auth and before the per-player bucket', () => {
                const guards = Reflect.getMetadata(GUARDS_METADATA, UserController.prototype[HANDLER]);
                expect(guards).toEqual([AppAuthGuard, HeistReplayIpThrottleGuard, LiveGameUserThrottleGuard]);
            });

            it('limits one address across many anonymous accounts, and only counts replays', async () => {
                const storage = new ThrottlerStorageService();
                storages.push(storage);
                const guard = new HeistReplayIpThrottleGuard(storage);
                const replayReq = (n: number) => ({
                    ip: '198.51.100.9',
                    ips: [],
                    body: heistBody({}),
                    user: { _id: `guest-${n}` },
                });
                for (let n = 0; n < HEIST_REPLAY_IP_THROTTLE.limit; n++) {
                    await expect(guard.canActivate(context(replayReq(n)))).resolves.toBe(true);
                }
                const res = { header: jest.fn() };
                await expect(guard.canActivate(context(replayReq(999), res))).rejects.toBeInstanceOf(
                    ThrottlerException
                );
                expect(res.header).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^[1-9]\d*$/));
                // Plain score saves from the same address are not counted here.
                await expect(
                    guard.canActivate(context({ ip: '198.51.100.9', body: { type: 'MATCH_3' } }))
                ).resolves.toBe(true);
                // Another address has its own bucket; behind trust proxy, req.ips[0] is the client.
                await expect(
                    guard.canActivate(
                        context({ ip: '10.0.0.1', ips: ['203.0.113.5', '10.0.0.1'], body: heistBody({}) })
                    )
                ).resolves.toBe(true);
            });

            it('never sends Retry-After 0 when the bucket expires within the second', async () => {
                const storage = {
                    increment: jest.fn(async () => ({ totalHits: 999, timeToExpire: 0 })),
                } as any;
                const guard = new HeistReplayIpThrottleGuard(storage);
                const res = { header: jest.fn() };
                await expect(
                    guard.canActivate(context({ ip: '198.51.100.9', body: heistBody({}) }, res))
                ).rejects.toBeInstanceOf(ThrottlerException);
                expect(res.header).toHaveBeenCalledWith('Retry-After', '1');
            });

            it('keys a shared (private, loopback) address per player, so an untrusted proxy is not one bucket', async () => {
                // TRUST_PROXY unset behind a load balancer: every request comes from the balancer.
                expect(heistReplayBucket({ ip: '10.0.0.7', ips: [], user: { _id: 'a' } })).toBe(
                    'heist-replay-ip:10.0.0.7:a'
                );
                expect(heistReplayBucket({ ip: '::1', user: { _id: 'b' } })).toBe('heist-replay-ip:::1:b');
                expect(heistReplayBucket({ ip: '198.51.100.9', user: { _id: 'a' } })).toBe(
                    'heist-replay-ip:198.51.100.9'
                );
                expect(heistReplayBucket({ ip: '10.0.0.1', ips: ['203.0.113.5', '10.0.0.1'] })).toBe(
                    'heist-replay-ip:203.0.113.5'
                );

                const storage = new ThrottlerStorageService();
                storages.push(storage);
                const guard = new HeistReplayIpThrottleGuard(storage);
                const balancer = (player: string) => ({
                    ip: '10.0.0.7',
                    ips: [],
                    body: heistBody({}),
                    user: { _id: player },
                });
                for (let n = 0; n < HEIST_REPLAY_IP_THROTTLE.limit; n++) {
                    await expect(guard.canActivate(context(balancer('p1')))).resolves.toBe(true);
                }
                await expect(guard.canActivate(context(balancer('p1')))).rejects.toBeInstanceOf(ThrottlerException);
                // Another player behind the same balancer still has a full bucket.
                await expect(guard.canActivate(context(balancer('p2')))).resolves.toBe(true);
            });

            it('logs an error at startup when production runs without TRUST_PROXY', () => {
                const logger = { error: jest.fn() } as any;
                expect(warnIfProxyUntrusted({ NODE_ENV: 'production' } as any, logger)).toBe(true);
                expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TRUST_PROXY'));
                expect(warnIfProxyUntrusted({ NODE_ENV: 'production', TRUST_PROXY: '1' } as any, logger)).toBe(false);
                expect(warnIfProxyUntrusted({ NODE_ENV: 'development' } as any, logger)).toBe(false);
                expect(logger.error).toHaveBeenCalledTimes(1);
            });

            it('refuses replays with 503 in production without TRUST_PROXY, before counting or simulating', async () => {
                const storage = { increment: jest.fn(async () => ({ totalHits: 1, timeToExpire: 60 })) } as any;
                const guard = new HeistReplayIpThrottleGuard(storage);
                guard.env = { NODE_ENV: 'production' } as any;
                const balancer = { ip: '10.0.0.7', ips: [], body: heistBody({}), user: { _id: 'p1' } };
                await expect(guard.canActivate(context(balancer))).rejects.toBeInstanceOf(ServiceUnavailableException);
                await expect(
                    guard.canActivate(context({ ...balancer, body: { type: 'MATCH_3', replay: null } }))
                ).rejects.toBeInstanceOf(ServiceUnavailableException);
                expect(storage.increment).not.toHaveBeenCalled();
                // Plain score saves are untouched.
                await expect(guard.canActivate(context({ ...balancer, body: { type: 'MATCH_3' } }))).resolves.toBe(
                    true
                );
                // With TRUST_PROXY set (or outside production) replays are counted as before.
                guard.env = { NODE_ENV: 'production', TRUST_PROXY: '1' } as any;
                await expect(guard.canActivate(context(balancer))).resolves.toBe(true);
                guard.env = { NODE_ENV: 'development' } as any;
                await expect(guard.canActivate(context(balancer))).resolves.toBe(true);
                expect(storage.increment).toHaveBeenCalledTimes(2);
            });

            it('treats any replay field as a replay request', () => {
                expect(wantsReplay({ type: 'MATCH_3', replay: {} })).toBe(true);
                expect(wantsReplay({ type: 'CATNIP_HEIST' })).toBe(true);
                expect(wantsReplay({ type: 'MATCH_3' })).toBe(false);
                expect(wantsReplay(undefined)).toBe(false);
            });
        });
    });
});

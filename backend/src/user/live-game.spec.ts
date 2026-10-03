import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { GameType, scoredGameTypes, seasonEventLevelPointCaps, totalCatnipCap } from 'src/game/game.schema';
import { CATNIP_CHAOS_ENDLESS_CAP, MATCH3_TOTAL_CAP } from 'src/shared-contracts/caps';
import { AppValidationPipe, LIVE_GAME_USER_THROTTLE } from './dto/live-game.dto';
import { LiveGameUserThrottleGuard } from './live-game-throttle.guard';
import { UserController } from './user.controller';
import { FakeGames, FakeUsers } from './heist/fake-live-store.helper-spec';

// The real services pull in Mongoose models, AI and wallet code; /live only uses the repositories.
jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

const USER_ID = new Types.ObjectId().toString();
const USER_CAT = new Types.ObjectId();
const OTHER_ID = new Types.ObjectId().toString();
const HANDLER = 'Tcatbassadors';

function createController() {
    const controller = Object.create(UserController.prototype);
    controller.pawMatchLeaderboardCache = new Map();
    controller.repository = {
        // The /live read asks for `cat` plus the arrays it writes into; healthy arrays skip the guard.
        findOne: jest.fn(async ({ projection }) =>
            String(projection).startsWith('cat')
                ? {
                      _id: new Types.ObjectId(USER_ID),
                      cat: USER_CAT,
                      catnipChaos: [],
                      seasonEvent: [],
                      match3: [],
                      match3Score: [],
                      catnipChaosCleared: [],
                      seasonEventCleared: [],
                      match3Cleared: [],
                  }
                : {}
        ),
        update: jest.fn().mockResolvedValue({}),
    };
    controller.gameRepository = { create: jest.fn().mockResolvedValue({}) };
    return controller;
}

/** Runs the body through the global pipe from main.ts and the route's own pipes, then the handler, as Nest does. */
async function post(controller: any, body: Record<string, unknown>) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, HANDLER) || {};
    // Keys are `${RouteParamtypes}:${index}`, and RouteParamtypes.BODY is 3.
    const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
    const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, HANDLER)[bodyArg.index];
    let value: unknown = body;
    for (const pipe of [new AppValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
        value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
    }
    return controller[HANDLER](USER_ID, value);
}

const storedRow = (controller: any) => controller.gameRepository.create.mock.calls[0]?.[0];

describe('POST /user/catbassadors/live', () => {
    it('is throttled to 120 saves per minute per IP and 30 per player', () => {
        const handler = UserController.prototype[HANDLER];
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(120);
        expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60000);
        // The per-player guard needs req.user, so it must run after the auth guard.
        const guards = Reflect.getMetadata(GUARDS_METADATA, handler);
        expect(guards[guards.length - 1]).toBe(LiveGameUserThrottleGuard);
        expect(LIVE_GAME_USER_THROTTLE).toEqual({ limit: 30, ttl: 60000 });
    });

    describe('per-player throttle', () => {
        const storages: ThrottlerStorageService[] = [];
        afterAll(() => storages.forEach(storage => storage.onApplicationShutdown()));

        function guardContext(userId: string | undefined, res = { header: jest.fn() }) {
            return {
                switchToHttp: () => ({
                    getRequest: () => ({ user: userId && { _id: userId } }),
                    getResponse: () => res,
                }),
            } as any;
        }

        it('allows each player their own 30 saves a minute, whatever address they share', async () => {
            const storage = new ThrottlerStorageService();
            storages.push(storage);
            const guard = new LiveGameUserThrottleGuard(storage);
            for (let i = 0; i < LIVE_GAME_USER_THROTTLE.limit; i++) {
                await expect(guard.canActivate(guardContext(USER_ID))).resolves.toBe(true);
            }
            const res = { header: jest.fn() };
            await expect(guard.canActivate(guardContext(USER_ID, res))).rejects.toBeInstanceOf(ThrottlerException);
            expect(res.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
            await expect(guard.canActivate(guardContext(OTHER_ID))).resolves.toBe(true);
        });
    });

    it.each([
        ['MATCH_3', { level: '1', points: 11, score: 1234, time: 50 }],
        ['CATNIP_CHAOS', { level: '01', points: 500, time: 0 }],
        ['PIXEL_RESCUE', { level: '1', points: 42, time: 0 }],
    ])('accepts what the current client sends for %s', async (type, fields) => {
        const controller = createController();
        await expect(post(controller, { type, ...fields })).resolves.toBeDefined();
        expect(controller.gameRepository.create).toHaveBeenCalledTimes(1);
    });

    it.each(['FOO', 'catnip_chaos', '', 'SHELTER', 'HOME', 'PURRQUEST', 'CATBASSADORS', 'CATNIP_HEIST'])(
        'rejects game type %j with 400 and writes nothing',
        async type => {
            const controller = createController();
            await expect(post(controller, { type, points: 1, time: 0, level: '1' })).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(controller.gameRepository.create).not.toHaveBeenCalled();
            expect(controller.repository.update).not.toHaveBeenCalled();
        }
    );

    describe('CATNIP_HEIST', () => {
        it('is a GameType but never a plain scored type', () => {
            expect(GameType.CATNIP_HEIST).toBe('CATNIP_HEIST');
            expect(scoredGameTypes as readonly string[]).not.toContain(GameType.CATNIP_HEIST);
        });

        it.each([
            { level: 'heist-01', points: 250, time: 30 },
            { level: '1', points: 1, time: 0 },
            { level: '01', points: 0 },
        ])('rejects a plain Heist save %j with 400 and writes nothing', async fields => {
            const controller = createController();
            await expect(post(controller, { type: GameType.CATNIP_HEIST, ...fields })).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(controller.gameRepository.create).not.toHaveBeenCalled();
            expect(controller.repository.update).not.toHaveBeenCalled();
        });
    });

    it.each([
        [{ tails: 1000000 }],
        [{ user: OTHER_ID }],
        [{ _id: OTHER_ID }],
        [{ createdAt: '2020-01-01' }],
        [{ $set: { tails: 1 } }],
    ])('rejects unknown field %j', async extra => {
        const controller = createController();
        await expect(
            post(controller, { type: 'MATCH_3', level: '1', points: 1, time: 1, ...extra })
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(controller.gameRepository.create).not.toHaveBeenCalled();
    });

    it('stores only the sanitized fields, with the caller and their cat, never the raw body', async () => {
        const controller = createController();
        await post(controller, { type: 'MATCH_3', level: '3', points: 10, score: 999, time: 42, cat: OTHER_ID });

        const row = storedRow(controller);
        expect(Object.keys(row).sort()).toEqual([
            'cat',
            'level',
            'platform',
            'points',
            'score',
            'time',
            'type',
            'user',
        ]);
        expect(row).toMatchObject({ type: 'MATCH_3', level: '3', points: 10, score: 999, time: 42, platform: 'web' });
        expect(row.cat).toBe(USER_CAT);
        expect(row.user.toString()).toBe(USER_ID);
    });

    it('drops the raw score for non Paw Match types and clamps a negative Paw Match time to 0', async () => {
        const chaos = createController();
        await post(chaos, { type: 'CATNIP_CHAOS', level: '11', points: 3, score: 500, time: 0 });
        expect(storedRow(chaos)).not.toHaveProperty('score');

        const match3 = createController();
        await post(match3, { type: 'MATCH_3', level: '1', points: 3, score: 500, time: -4 });
        expect(storedRow(match3).time).toBe(0);
    });

    it.each([Number.MAX_SAFE_INTEGER, 'soon'])('rejects time %j', async time => {
        const controller = createController();
        await expect(post(controller, { type: 'MATCH_3', level: '1', points: 1, time })).rejects.toBeInstanceOf(
            BadRequestException
        );
    });

    describe('per-type caps', () => {
        it.each([
            ['CATNIP_CHAOS', '01', 500],
            ['CATNIP_CHAOS', '11', 10],
            ['CATNIP_CHAOS', '166', 10],
            ['MATCH_3', '1', 11],
            ['MATCH_3', '30', 76],
            ['PIXEL_RESCUE', '1', 500],
            ['PIXEL_RESCUE', '14', 500],
        ])('%s level %s accepts %i points and rejects one more', async (type, level, cap) => {
            const ok = createController();
            await expect(post(ok, { type, level, points: cap, time: 1 })).resolves.toBeDefined();

            const over = createController();
            await expect(post(over, { type, level, points: cap + 1, time: 1 })).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(over.gameRepository.create).not.toHaveBeenCalled();
            expect(over.repository.update).not.toHaveBeenCalled();
        });

        it('uses the 500 endless and Cupid Cat caps of decision #57', () => {
            expect(CATNIP_CHAOS_ENDLESS_CAP).toBe(500);
            expect(seasonEventLevelPointCaps.every(cap => cap === 500)).toBe(true);
            // MAX_LEGIT_CATNIP_SCORE (the leaderboard ceiling) is totalCatnipCap: 80 higher than with 420.
            expect(totalCatnipCap).toBe(500 + 96 * 10 + MATCH3_TOTAL_CAP);
        });

        it.each([
            ['CATNIP_CHAOS', '17'],
            ['CATNIP_CHAOS', undefined],
            ['MATCH_3', '31'],
            ['PIXEL_RESCUE', '15'],
            ['PIXEL_RESCUE', undefined],
        ])('%s rejects level %j before writing a row', async (type, level) => {
            const controller = createController();
            await expect(post(controller, { type, level, points: 1, time: 1 })).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(controller.gameRepository.create).not.toHaveBeenCalled();
        });

        it.each([-1, 1.5, '5', null])('rejects points %j', async points => {
            const controller = createController();
            await expect(
                post(controller, { type: 'PIXEL_RESCUE', level: '1', points, time: 1 })
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(controller.gameRepository.create).not.toHaveBeenCalled();
        });

        it('caps the Paw Match raw score at one million', async () => {
            const ok = createController();
            await expect(
                post(ok, { type: 'MATCH_3', level: '1', points: 1, score: 1000000, time: 1 })
            ).resolves.toBeDefined();

            const over = createController();
            await expect(
                post(over, { type: 'MATCH_3', level: '1', points: 1, score: 1000001, time: 1 })
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(over.gameRepository.create).not.toHaveBeenCalled();
        });

        it('records PIXEL_RESCUE points on seasonEvent with $max, and sets lastPlayedAt', async () => {
            const controller = createController();
            await post(controller, { type: 'PIXEL_RESCUE', level: '3', points: 7, time: 0 });
            expect(controller.repository.update).toHaveBeenNthCalledWith(1, USER_ID, {
                $max: { 'seasonEvent.2': 7 },
                $set: { lastPlayedAt: expect.any(Date) },
            });
        });
    });

    describe('platform', () => {
        it.each(['web', 'ios', 'android'])('stores platform %s', async platform => {
            const controller = createController();
            await post(controller, { type: 'MATCH_3', level: '1', points: 1, time: 1, platform });
            expect(storedRow(controller).platform).toBe(platform);
        });

        it('defaults to web when an old client sends none', async () => {
            const controller = createController();
            await post(controller, { type: 'MATCH_3', level: '1', points: 1, time: 1 });
            expect(storedRow(controller).platform).toBe('web');
        });

        it.each(['windows', 'IOS', 1])('rejects platform %j', async platform => {
            const controller = createController();
            await expect(
                post(controller, { type: 'MATCH_3', level: '1', points: 1, time: 1, platform })
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(controller.gameRepository.create).not.toHaveBeenCalled();
        });
    });

    describe('outcome and cleared state (plan F6, G10)', () => {
        function storeController(doc: Record<string, unknown> = {}) {
            const users = new FakeUsers();
            const games = new FakeGames();
            const controller = Object.create(UserController.prototype);
            controller.pawMatchLeaderboardCache = new Map();
            controller.repository = users;
            controller.gameRepository = games;
            const userId = users.add(doc);
            const send = (body: Record<string, unknown>) => postAs(controller, userId, body);
            return { users, games, userId, send };
        }

        async function postAs(controller: any, userId: string, body: Record<string, unknown>) {
            const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, HANDLER) || {};
            const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
            const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, HANDLER)[bodyArg.index];
            let value: unknown = body;
            for (const pipe of [new AppValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
                value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
            }
            return controller[HANDLER](userId, value);
        }

        it.each([
            ['CATNIP_CHAOS', '11', 1, 'catnipChaosCleared', 97],
            ['CATNIP_CHAOS', '166', 96, 'catnipChaosCleared', 97],
            ['PIXEL_RESCUE', '3', 2, 'seasonEventCleared', 14],
            ['MATCH_3', '30', 29, 'match3Cleared', 30],
        ])('%s level %s won sets %s[%i] in the same $max', async (type, level, index, field, length) => {
            const { users, userId, send } = storeController();
            const totals = await send({ type, level, points: 1, time: 1, outcome: 'won' });
            const bestUpdate = users.updates.find(entry => !Array.isArray(entry.update) && entry.update.$max);
            expect(bestUpdate!.update.$max[`${field}.${index}`]).toBe(1);
            const stored = users.get(userId)[field];
            expect(Array.isArray(stored)).toBe(true);
            expect(stored).toHaveLength(length);
            expect(stored[index]).toBe(1);
            expect(stored.reduce((a: number, b: number) => a + b, 0)).toBe(1);
            expect(totals[field]).toEqual(stored);
        });

        it('never clears INFINITE (Purrsuit 01), even when won', async () => {
            const { users, userId, send } = storeController();
            const totals = await send({ type: 'CATNIP_CHAOS', level: '01', points: 500, time: 0, outcome: 'won' });
            const bestUpdate = users.updates.find(entry => !Array.isArray(entry.update) && entry.update.$max);
            expect(Object.keys(bestUpdate!.update.$max)).toEqual(['catnipChaos.0']);
            // Nothing was cleared, so no cleared array is created (review 3b finding 6); the response
            // still carries the zeros.
            expect(users.get(userId).catnipChaosCleared).toBeUndefined();
            expect(totals.catnipChaosCleared).toEqual(Array(97).fill(0));
        });

        it.each(['died', 'timeout', 'quit', undefined])('outcome %j clears nothing', async outcome => {
            const { users, userId, send } = storeController();
            const totals = await send({
                type: 'PIXEL_RESCUE',
                level: '1',
                points: 3,
                time: 0,
                ...(outcome ? { outcome } : {}),
            });
            expect(users.get(userId).seasonEventCleared).toBeUndefined();
            expect(totals.seasonEventCleared).toEqual(Array(14).fill(0));
        });

        it('keeps an earlier clear when a later run on the level dies', async () => {
            const { users, userId, send } = storeController();
            await send({ type: 'MATCH_3', level: '2', points: 5, time: 10, outcome: 'won' });
            await send({ type: 'MATCH_3', level: '2', points: 0, time: 10, outcome: 'died' });
            expect(users.get(userId).match3Cleared[1]).toBe(1);
        });

        it('stores the outcome on the Game row when sent, and no outcome key for older clients', async () => {
            const withOutcome = storeController();
            await withOutcome.send({ type: 'MATCH_3', level: '1', points: 1, time: 1, outcome: 'timeout' });
            expect(withOutcome.games.rows[0].outcome).toBe('timeout');

            const legacy = storeController();
            await legacy.send({ type: 'MATCH_3', level: '1', points: 1, time: 1 });
            expect(legacy.games.rows[0]).not.toHaveProperty('outcome');
        });

        it.each(['WON', 'win', 1, ''])('rejects outcome %j with 400', async outcome => {
            const { games, send } = storeController();
            await expect(send({ type: 'MATCH_3', level: '1', points: 1, time: 1, outcome })).rejects.toBeInstanceOf(
                BadRequestException
            );
            expect(games.create).not.toHaveBeenCalled();
        });

        it('turns missing best and cleared arrays into arrays before the dotted $max', async () => {
            const { users, userId, send } = storeController({ catnipChaos: undefined, catnipChaosCleared: null });
            delete users.get(userId).catnipChaos;
            await send({ type: 'CATNIP_CHAOS', level: '12', points: 4, time: 0, outcome: 'won' });
            const guard = users.updates.find(entry => Array.isArray(entry.update));
            expect(Object.keys(guard!.update[0].$set).sort()).toEqual(['catnipChaos', 'catnipChaosCleared']);
            const user = users.get(userId);
            expect(Array.isArray(user.catnipChaos)).toBe(true);
            expect(user.catnipChaos[2]).toBe(4);
            expect(Array.isArray(user.catnipChaosCleared)).toBe(true);
            expect(user.catnipChaosCleared[2]).toBe(1);
        });

        it('does not run the guard when every target array exists', async () => {
            const { users, send } = storeController({ match3: [], match3Score: [], match3Cleared: [] });
            await send({ type: 'MATCH_3', level: '1', points: 1, time: 1, outcome: 'won' });
            expect(users.updates.some(entry => Array.isArray(entry.update))).toBe(false);
        });

        it('sets lastPlayedAt on every save, and only through /live', async () => {
            const { users, userId, send } = storeController();
            await send({ type: 'CATNIP_CHAOS', level: '11', points: 1, time: 0 });
            expect(users.get(userId).lastPlayedAt).toBeInstanceOf(Date);
        });

        it('accepts an existing-mode save exactly as before: same row, same totals shape plus the new arrays', async () => {
            const { games, send } = storeController();
            const totals = await send({
                type: 'MATCH_3',
                level: '1',
                points: 11,
                score: 1234,
                time: 50,
                platform: 'web',
            });
            expect(Object.keys(games.rows[0]).sort()).toEqual(
                ['_id', 'cat', 'level', 'platform', 'points', 'score', 'time', 'type', 'user'].sort()
            );
            expect(totals).toMatchObject({
                match3: expect.any(Array),
                match3Count: 11,
                match3ScoreCount: 1234,
                catnipCount: 11,
            });
            expect(totals.heistScore).toEqual(Array(8).fill(0));
        });
    });
});

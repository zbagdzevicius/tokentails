import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { LIVE_GAME_USER_THROTTLE } from './dto/live-game.dto';
import { LiveGameUserThrottleGuard } from './live-game-throttle.guard';
import { UserController } from './user.controller';

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
        findOne: jest.fn(async ({ projection }) =>
            projection === 'cat' ? { _id: new Types.ObjectId(USER_ID), cat: USER_CAT } : {}
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
    for (const pipe of [new ValidationPipe({ transform: true }), ...(bodyArg.pipes || [])]) {
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
        ['CATNIP_CHAOS', { level: '01', points: 420, time: 0 }],
        ['PIXEL_RESCUE', { level: '1', points: 42, time: 0 }],
    ])('accepts what the current client sends for %s', async (type, fields) => {
        const controller = createController();
        await expect(post(controller, { type, ...fields })).resolves.toBeDefined();
        expect(controller.gameRepository.create).toHaveBeenCalledTimes(1);
    });

    it.each(['FOO', 'catnip_chaos', '', 'SHELTER', 'HOME', 'PURRQUEST', 'CATBASSADORS'])(
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
            ['CATNIP_CHAOS', '01', 420],
            ['CATNIP_CHAOS', '11', 10],
            ['CATNIP_CHAOS', '166', 10],
            ['MATCH_3', '1', 11],
            ['MATCH_3', '30', 76],
            ['PIXEL_RESCUE', '1', 420],
            ['PIXEL_RESCUE', '14', 420],
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

        it('records PIXEL_RESCUE points on seasonEvent with $max', async () => {
            const controller = createController();
            await post(controller, { type: 'PIXEL_RESCUE', level: '3', points: 7, time: 0 });
            expect(controller.repository.update).toHaveBeenCalledWith(USER_ID, { $max: { 'seasonEvent.2': 7 } });
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
});

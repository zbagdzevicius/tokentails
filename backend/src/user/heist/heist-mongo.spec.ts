import { ConflictException, ValidationPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import mongoose, { Connection, Model, Types } from 'mongoose';
import { GameRepository } from 'src/game/game.repository';
import { GameSchema } from 'src/game/game.schema';
import { ErrorCode } from 'src/shared-contracts/errors';
import { AppValidationPipe } from '../dto/live-game.dto';
import { UserController } from '../user.controller';
import { UserRepository } from '../user.repository';
import { UserSchema } from '../user.schema';
import { arrayGuardPipeline, recomputeAfterGuestMerge } from '../utils/live-game';
import { goldenLog } from './heist-test-logs.helper-spec';
import { saveHeistRun } from './heist-live';
import { ReplayQueue } from './replay-queue';

/* eslint-disable @typescript-eslint/no-var-requires */
const digestMigration = require('./migrations/heist-replay-digest.cjs');
const clearedMigration = require('./migrations/game-cleared-grandfather.cjs');
/* eslint-enable @typescript-eslint/no-var-requires */

jest.mock('../user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * `/live` and the two migrations against a REAL MongoDB (opt-in): the conditional array guard and
 * the dotted `$max`/`$bit` on missing arrays, the global unique replayDigest index under parallel
 * saves, and the migrations' pipelines, dry run and idempotency.
 *
 * Skipped unless LIVE_SPEC_MONGO_URL (or IDENTITY_SPEC_MONGO_URL) is set. It creates and drops its
 * own scratch database (`tt_live_spec_<random>`), so it is safe against a local dev server:
 *
 *   LIVE_SPEC_MONGO_URL=mongodb://localhost:27017 npx jest src/user/heist/heist-mongo.spec.ts
 */

const url = process.env.LIVE_SPEC_MONGO_URL || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;
const HANDLER = 'Tcatbassadors';

maybe('/live and migrations on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let users: Model<any>;
    let games: Model<any>;
    let userRepository: UserRepository;
    let gameRepository: GameRepository;
    const queue = new ReplayQueue({ concurrency: 1, maxQueued: 64 });

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_live_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        users = connection.model('User', UserSchema);
        games = connection.model('Game', GameSchema);
        await Promise.all([users.init(), games.init()]);
        userRepository = new UserRepository(users as any);
        gameRepository = new GameRepository(games as any);
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    beforeEach(async () => {
        await Promise.all([users.deleteMany({}), games.deleteMany({})]);
        delete process.env.MIGRATION_APPLY;
    });

    /** A raw user document, bypassing schema defaults (legacy shapes). */
    const insertUser = async (fields: Record<string, unknown> = {}) =>
        String((await users.collection.insertOne({ isGuest: false, cat: new Types.ObjectId(), ...fields })).insertedId);
    const raw = (id: string) => users.collection.findOne({ _id: new Types.ObjectId(id) }) as Promise<any>;

    async function post(userId: string, body: Record<string, unknown>) {
        const controller = Object.create(UserController.prototype);
        controller.pawMatchLeaderboardCache = new Map();
        controller.repository = userRepository;
        controller.gameRepository = gameRepository;
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, UserController, HANDLER) || {};
        const [, bodyArg] = Object.entries<any>(args).find(([key]) => key.startsWith('3:')) as [string, any];
        const metatype = Reflect.getMetadata('design:paramtypes', UserController.prototype, HANDLER)[bodyArg.index];
        let value: unknown = body;
        for (const pipe of [new AppValidationPipe({ transform: true }), ...(bodyArg.pipes || [])] as ValidationPipe[]) {
            value = await pipe.transform(value, { type: 'body', metatype, data: undefined });
        }
        return controller[HANDLER](userId, value, { res: { setHeader: () => undefined } });
    }

    it('turns missing arrays into arrays, never sub-documents (plain modes and Heist)', async () => {
        const userId = await insertUser();
        await post(userId, { type: 'CATNIP_CHAOS', level: '13', points: 5, time: 0, outcome: 'won' });
        await post(userId, { type: 'CATNIP_HEIST', replay: goldenLog('heist-03') });
        const doc = await raw(userId);
        for (const field of ['catnipChaos', 'catnipChaosCleared', 'heistScore', 'heistStars']) {
            expect({ field, isArray: Array.isArray(doc[field]) }).toEqual({ field, isArray: true });
        }
        expect(doc.catnipChaos[3]).toBe(5);
        expect(doc.catnipChaosCleared[3]).toBe(1);
        expect(doc.catnipChaosCleared[0]).toBe(0);
        expect(doc.heistScore[2]).toBe(goldenLog('heist-03').score);
        expect(doc.heistStars[2] & 1).toBe(1);
        expect(doc.lastPlayedAt).toBeInstanceOf(Date);
    });

    it('repairs a null-padded heistStars so $bit never sees null', async () => {
        const userId = await insertUser({ heistStars: [null, null, 2], heistScore: null });
        await users.updateOne(
            { _id: new Types.ObjectId(userId) },
            arrayGuardPipeline(['heistScore'], [{ field: 'heistStars', length: 8 }])
        );
        expect(await raw(userId)).toMatchObject({ heistScore: [], heistStars: [0, 0, 2, 0, 0, 0, 0, 0] });
        await post(userId, { type: 'CATNIP_HEIST', replay: goldenLog('heist-01') });
        const doc = await raw(userId);
        expect(doc.heistStars[0] & 1).toBe(1);
        expect(doc.heistStars[2]).toBe(2);
    });

    it('saves one canonical log once across accounts, also when the saves race', async () => {
        const accounts = await Promise.all(Array.from({ length: 4 }, () => insertUser()));
        const results = await Promise.allSettled(
            accounts.map(userId =>
                saveHeistRun({ users: userRepository, games: gameRepository, queue }, userId, {
                    type: 'CATNIP_HEIST',
                    replay: goldenLog('heist-06'),
                } as any)
            )
        );
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        results
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .forEach(result => {
                expect(result.reason).toBeInstanceOf(ConflictException);
                expect((result.reason.getResponse() as any).code).toBe(ErrorCode.HEIST_DUPLICATE);
            });
        expect(await games.countDocuments({ type: 'CATNIP_HEIST' })).toBe(1);
        const progressed = await users.countDocuments({ 'heistScore.5': { $gt: 0 } });
        expect(progressed).toBe(1);
    });

    it('guest merge: cleared flags and Heist stars of a gamesMoved guest survive into an account without them', async () => {
        const targetId = await insertUser();
        await insertUser({
            isGuest: true,
            mergeState: 'gamesMoved',
            mergedInto: new Types.ObjectId(targetId),
            catnipChaosCleared: [0, 1],
            heistScore: [0, 0, 200],
            heistStars: [0, 0, 5],
        });
        const recompute = recomputeAfterGuestMerge(userRepository, users as any);
        await recompute(targetId);
        await recompute(targetId);
        const doc = await raw(targetId);
        expect(Array.isArray(doc.catnipChaosCleared) && Array.isArray(doc.heistStars)).toBe(true);
        expect(doc.catnipChaosCleared[1]).toBe(1);
        expect(doc.heistScore[2]).toBe(200);
        expect(doc.heistStars.slice(0, 3)).toEqual([0, 0, 5]);
        expect(doc.heistStars).toHaveLength(8);
    });

    it('leaves catnipCount and the loot-drop inputs alone after every Heist level', async () => {
        const userId = await insertUser({
            catnipCount: 59,
            catnipChaos: [9, 10],
            catnipChaosCount: 19,
            match3: [40],
            match3Count: 40,
        });
        for (const levelId of [
            'heist-01',
            'heist-02',
            'heist-03',
            'heist-04',
            'heist-05',
            'heist-06',
            'heist-07',
            'heist-08',
        ]) {
            await post(userId, { type: 'CATNIP_HEIST', replay: goldenLog(levelId) });
        }
        expect(await raw(userId)).toMatchObject({
            catnipCount: 59,
            catnipChaos: [9, 10],
            catnipChaosCount: 19,
            match3: [40],
            match3Count: 40,
        });
    });

    describe('migrations', () => {
        const quiet = () => jest.spyOn(console, 'log').mockImplementation(() => undefined);

        it('heist-replay-digest: dry run writes nothing; apply builds the index, repairs arrays, and is idempotent', async () => {
            const nullUser = await insertUser({ heistScore: null, heistStars: [1, null] });
            const missingUser = await insertUser();
            await games.collection.dropIndex('replayDigest_unique').catch(() => undefined);
            const log = quiet();

            await expect(digestMigration.up(connection.db)).rejects.toThrow(/Dry run/);
            expect((await games.collection.indexes()).some(index => index.name === 'replayDigest_unique')).toBe(false);
            expect((await raw(nullUser)).heistScore).toBeNull();

            process.env.MIGRATION_APPLY = '1';
            await digestMigration.up(connection.db);
            const index = (await games.collection.indexes()).find(entry => entry.name === 'replayDigest_unique');
            expect(index).toMatchObject({
                unique: true,
                partialFilterExpression: { replayDigest: { $type: 'string' } },
            });
            expect(await raw(nullUser)).toMatchObject({
                heistScore: [0, 0, 0, 0, 0, 0, 0, 0],
                heistStars: [1, 0, 0, 0, 0, 0, 0, 0],
            });
            // A missing field stays missing by default (no 157 zeros per user; /live creates arrays).
            expect((await raw(missingUser)).heistScore).toBeUndefined();

            expect(await digestMigration.apply(connection.db)).toEqual({
                heistScore: 0,
                heistStars: 0,
                catnipChaosCleared: 0,
                seasonEventCleared: 0,
                match3Cleared: 0,
            });
            log.mockRestore();
        });

        it('heist-replay-digest refuses while duplicate digests exist', async () => {
            await games.collection.dropIndex('replayDigest_unique').catch(() => undefined);
            await games.collection.insertMany([
                { type: 'CATNIP_HEIST', replayDigest: 'same' },
                { type: 'CATNIP_HEIST', replayDigest: 'same' },
            ]);
            process.env.MIGRATION_APPLY = '1';
            const log = quiet();
            await expect(digestMigration.up(connection.db)).rejects.toThrow(/duplicate/);
            log.mockRestore();
            await games.deleteMany({});
            await games.collection.createIndex(digestMigration.INDEX.key, digestMigration.INDEX.options);
        });

        it('game-cleared-grandfather: marks every level with points > 0, never INFINITE, keeps clears, is idempotent', async () => {
            const chaos = Array(97).fill(0);
            chaos[0] = 300; // INFINITE
            chaos[1] = 4; // 1-1
            chaos[5] = 1; // 1-5
            const keep = Array(97).fill(0);
            keep[9] = 1; // a clear the scores do not show
            const player = await insertUser({
                catnipChaos: chaos,
                catnipChaosCleared: keep,
                seasonEvent: [0, 12, null],
                match3: [0, 0, 5],
                match3Score: [700, 0, 0],
            });
            const idle = await insertUser({ catnipChaos: [], seasonEvent: [] });
            const legacy = await insertUser({ catnipChaos: { '3': 5 } });
            const endlessOnly = Array(97).fill(0);
            endlessOnly[0] = 900; // only the INFINITE level: no clear, so no all-zero array (finding 4)
            const endless = await insertUser({ catnipChaos: endlessOnly });
            const log = quiet();

            await expect(clearedMigration.up(connection.db)).rejects.toThrow(/Dry run/);
            expect((await raw(player)).seasonEventCleared).toBeUndefined();
            const plan = await clearedMigration.plan(connection.db);
            expect(plan.catnipChaosCleared).toMatchObject({ toUpdate: 1, objectShapedSources: 1 });

            process.env.MIGRATION_APPLY = '1';
            await clearedMigration.up(connection.db);
            const doc = await raw(player);
            const expectedChaos = Array(97).fill(0);
            expectedChaos[1] = 1;
            expectedChaos[5] = 1;
            expectedChaos[9] = 1;
            expect(doc.catnipChaosCleared).toEqual(expectedChaos);
            expect(doc.seasonEventCleared).toEqual([0, 1, ...Array(12).fill(0)]);
            expect(doc.match3Cleared).toEqual([1, 0, 1, ...Array(27).fill(0)]);
            expect((await raw(idle)).catnipChaosCleared).toBeUndefined();
            expect((await raw(legacy)).catnipChaosCleared).toBeUndefined();
            expect((await raw(endless)).catnipChaosCleared).toBeUndefined();

            expect(await clearedMigration.apply(connection.db)).toEqual({
                catnipChaosCleared: 0,
                seasonEventCleared: 0,
                match3Cleared: 0,
            });
            log.mockRestore();
        });
    });
});

import {
    CATNIP_CHAOS_ENDLESS_LEVEL,
    CATNIP_CHAOS_LEVELS,
    HEIST_LEVELS,
    MATCH3_LEVELS,
    SEASON_EVENT_LEVELS,
} from 'src/shared-contracts/caps';
import { REPLAY_DIGEST_INDEX } from 'src/game/game.schema';
import { CLEARED_FIELDS, LIVE_GAME_LEVELS } from '../utils/live-game';

/* eslint-disable @typescript-eslint/no-var-requires */
// The migration logic lives in ./migrations/*.cjs (committed); migrations/tokentails/ only re-exports it.
const digestMigration = require('./migrations/heist-replay-digest.cjs');
const clearedMigration = require('./migrations/game-cleared-grandfather.cjs');
/* eslint-enable @typescript-eslint/no-var-requires */

/** A db whose reads report nothing to do and whose writes are recorded. */
function fakeDb() {
    const writes: string[] = [];
    const collection = () => ({
        countDocuments: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn(() => ({ toArray: async () => [] })),
        indexes: jest.fn().mockResolvedValue([]),
        createIndex: jest.fn(async () => writes.push('createIndex')),
        updateMany: jest.fn(async () => {
            writes.push('updateMany');
            return { modifiedCount: 0 };
        }),
        dropIndex: jest.fn(),
    });
    const collections: Record<string, any> = {};
    return {
        writes,
        collection: (name: string) => (collections[name] = collections[name] || collection()),
    };
}

describe('Heist and cleared-state migrations (static checks; heist-mongo.spec.ts runs them on MongoDB)', () => {
    const env = process.env.MIGRATION_APPLY;
    afterEach(() => {
        if (env === undefined) delete process.env.MIGRATION_APPLY;
        else process.env.MIGRATION_APPLY = env;
    });

    it('builds the same replayDigest index as the Game schema', () => {
        expect(digestMigration.INDEX).toEqual(JSON.parse(JSON.stringify(REPLAY_DIGEST_INDEX)));
    });

    it('backfills arrays with the lengths of shared/caps.ts', () => {
        const lengths = Object.fromEntries(digestMigration.ARRAYS.map((entry: any) => [entry.field, entry.length]));
        expect(lengths).toEqual({
            heistScore: HEIST_LEVELS.length,
            heistStars: HEIST_LEVELS.length,
            catnipChaosCleared: CATNIP_CHAOS_LEVELS.length,
            seasonEventCleared: SEASON_EVENT_LEVELS.length,
            match3Cleared: MATCH3_LEVELS.length,
        });
        expect(CLEARED_FIELDS.map(entry => entry.field).sort()).toEqual(
            ['catnipChaosCleared', 'seasonEventCleared', 'match3Cleared'].sort()
        );
    });

    it('grandfathers every mode from its best arrays, with INFINITE never cleared', () => {
        const modes = Object.fromEntries(clearedMigration.MODES.map((mode: any) => [mode.cleared, mode]));
        expect(modes.catnipChaosCleared).toMatchObject({
            sources: [LIVE_GAME_LEVELS.CATNIP_CHAOS.field],
            length: CATNIP_CHAOS_LEVELS.length,
            neverCleared: [CATNIP_CHAOS_LEVELS.indexOf(CATNIP_CHAOS_ENDLESS_LEVEL)],
        });
        expect(modes.seasonEventCleared).toMatchObject({
            sources: ['seasonEvent'],
            length: SEASON_EVENT_LEVELS.length,
            neverCleared: [],
        });
        expect(modes.match3Cleared).toMatchObject({
            sources: ['match3', 'match3Score'],
            length: MATCH3_LEVELS.length,
            neverCleared: [],
        });
    });

    it('game-cleared-grandfather only selects users who would get at least one clear (finding 4)', () => {
        const chaos = clearedMigration.MODES.find((mode: any) => mode.cleared === 'catnipChaosCleared');
        const filter = clearedMigration.needsUpdate(chaos);
        const expected = clearedMigration.clearedExpression(chaos);
        expect(filter.$expr).toEqual({
            $and: [{ $in: [1, expected] }, { $ne: ['$catnipChaosCleared', expected] }],
        });
    });

    it.each([
        ['heist-replay-digest', digestMigration],
        ['game-cleared-grandfather', clearedMigration],
    ])(
        '%s is a dry run by default: it reports, writes nothing and throws so it is not recorded',
        async (_name, migration) => {
            delete process.env.MIGRATION_APPLY;
            const db = fakeDb();
            const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
            await expect(migration.up(db)).rejects.toThrow(/Dry run/);
            log.mockRestore();
            expect(db.writes).toEqual([]);
        }
    );

    it.each([
        ['heist-replay-digest', digestMigration],
        ['game-cleared-grandfather', clearedMigration],
    ])('%s applies with MIGRATION_APPLY=1', async (_name, migration) => {
        process.env.MIGRATION_APPLY = '1';
        const db = fakeDb();
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        await expect(migration.up(db)).resolves.toBeUndefined();
        log.mockRestore();
        expect(db.writes.length).toBeGreaterThan(0);
    });
});

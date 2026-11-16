import mongoose, { Connection, Model, Types } from 'mongoose';
import { GameRepository } from './game.repository';
import { GameSchema, replayDigestLookup } from './game.schema';

/**
 * The replay digest lookup every Pawlegends save runs before its re-sim (`/live`, solo and party) must use the partial
 * `replayDigest_unique` index. A plain `{replayDigest: <digest>}` does not name the index's `$type: 'string'` filter, so
 * MongoDB scans the whole games collection; on production that made each save take 15-20 s and time out on the client.
 *
 * Skipped unless LIVE_SPEC_MONGO_URL (or IDENTITY_SPEC_MONGO_URL) is set:
 *   LIVE_SPEC_MONGO_URL=mongodb://localhost:27017 npx jest src/game/replay-digest-lookup.spec.ts
 */
const url = process.env.LIVE_SPEC_MONGO_URL || process.env.IDENTITY_SPEC_MONGO_URL;
const maybe = url ? describe : describe.skip;

maybe('replayDigestLookup on a real MongoDB', () => {
    jest.setTimeout(60000);
    let connection: Connection;
    let games: Model<any>;
    let repository: GameRepository;

    beforeAll(async () => {
        connection = await mongoose
            .createConnection(url!, { dbName: `tt_digest_spec_${new Types.ObjectId().toString()}` })
            .asPromise();
        games = connection.model('Game', GameSchema);
        await games.init();
        repository = new GameRepository(games as any);
        const rows = Array.from({ length: 2000 }, (_, i) => ({
            type: 'PAWLEGENDS',
            score: i,
            ...(i % 10 === 0 ? { replayDigest: `d${i}` } : {}),
        }));
        await games.collection.insertMany(rows);
    });

    afterAll(async () => {
        await connection?.db?.dropDatabase();
        await connection?.close();
    });

    const plan = async (filter: Record<string, unknown>) => {
        const explain: any = await games.collection.find(filter).limit(1).explain('executionStats');
        return {
            stage: JSON.stringify(explain.queryPlanner.winningPlan),
            examined: explain.executionStats.totalDocsExamined,
        };
    };

    it('uses the partial index for a new digest (no collection scan)', async () => {
        const indexed = await plan(replayDigestLookup('never-saved'));
        expect(indexed.stage).toContain('replayDigest_unique');
        expect(indexed.examined).toBe(0);
        // why the lookup is spelled this way: the plain equality scans every row
        const plain = await plan({ replayDigest: 'never-saved' });
        expect(plain.stage).not.toContain('replayDigest_unique');
        expect(plain.examined).toBe(2000);
    });

    it('finds a saved digest through the repository and nothing else', async () => {
        const saved = await repository.findOne({
            searchObject: replayDigestLookup('d1990'),
            projection: '_id score',
        } as any);
        expect(saved).toMatchObject({ score: 1990 });
        expect(
            await repository.findOne({ searchObject: replayDigestLookup('d1991'), projection: '_id' } as any)
        ).toBeNull();
        expect(await repository.findOne({ searchObject: replayDigestLookup(''), projection: '_id' } as any)).toBeNull();
    });
});

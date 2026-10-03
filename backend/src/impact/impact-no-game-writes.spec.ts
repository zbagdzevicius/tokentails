import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Types } from 'mongoose';
import { GameType } from 'src/game/game.schema';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { memoryModel } from './memory-model.fakes-spec';
import { PawSettlementService, settlementTimeFor } from './paws.service';

/*
 * Plan G4 and CLAUDE.md: game scores are saved only through POST /user/catbassadors/live. Nothing in
 * src/impact/** may create, change or delete a Game row, or import the live path.
 */

const IMPACT_DIR = __dirname;

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        // Application code only: specs and their fakes may build Game fixtures.
        return /\.ts$/.test(name) && !/(\.spec|-spec)\.ts$/.test(name) ? [path] : [];
    });
}

describe('src/impact/** never writes Game rows (plan G4)', () => {
    const files = sources(IMPACT_DIR);

    it('finds the impact sources', () => {
        expect(files.map(file => relative(IMPACT_DIR, file))).toEqual(
            expect.arrayContaining(['paws.service.ts', 'eligibility.service.ts', 'impact.service.ts'])
        );
    });

    it.each(sources(IMPACT_DIR).map(file => [relative(IMPACT_DIR, file), file]))(
        '%s calls no write method on a game model and does not import the live path',
        (_name, file) => {
            const text = readFileSync(file as string, 'utf8');
            const writes =
                /\bgameModel\s*\.\s*(create|insertMany|updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|replaceOne|bulkWrite|deleteOne|deleteMany|findOneAndDelete|findByIdAndDelete|save)\b/;
            expect(text).not.toMatch(writes);
            expect(text).not.toMatch(/new\s+this\.gameModel\b/);
            expect(text).not.toMatch(/GameRepository/);
            expect(text).not.toMatch(
                /from\s+'src\/user\/(user\.controller|live-game[^']*|heist[^']*|dto\/live-game\.dto)'/
            );
            expect(text).not.toMatch(/catbassadors\/live/);
        }
    );

    it('a full settlement and GET /impact/me run against a games model whose writes all throw', async () => {
        const rows = memoryModel();
        const forbidden = () => {
            throw new Error('impact code wrote to games');
        };
        const games = {
            ...rows,
            create: forbidden,
            insertMany: forbidden,
            updateOne: forbidden,
            updateMany: forbidden,
            findOneAndUpdate: forbidden,
            deleteOne: forbidden,
            deleteMany: forbidden,
            bulkWrite: forbidden,
        };
        const users = memoryModel();
        const user = {
            _id: new Types.ObjectId(),
            isGuest: false,
            emailVerifiedAt: new Date('2026-01-01'),
            createdAt: new Date('2026-01-01'),
        };
        users.rows.push(user);
        rows.rows.push(
            { user: user._id, type: GameType.MATCH_3, points: 3, createdAt: new Date('2026-10-01T10:00:00Z') },
            { user: user._id, type: GameType.MATCH_3, points: 3, createdAt: new Date('2026-10-01T10:05:00Z') }
        );
        const before = JSON.stringify(rows.rows);
        const service = new PawSettlementService(
            memoryModel({ unique: [['user', 'day']] }) as any,
            memoryModel({ collections: { [JOB_RUNS_COLLECTION]: memoryModel() } }) as any,
            games as any,
            users as any,
            {} as any
        );
        service.pawsConfig = () => ({ sendEnabled: false, dailyBudgetWei: BigInt(1), amountWei: BigInt(1) });

        const { settlement } = await service.settleDay('2026-10-01', settlementTimeFor('2026-10-01'));
        await service.me(user, new Date('2026-10-02T10:00:00Z'));

        expect(settlement.pawCount).toBe(1);
        expect(JSON.stringify(rows.rows)).toBe(before);
    });
});

import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Types } from 'mongoose';
import { Tier } from 'src/cat/cat.schema';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import { QuestController } from 'src/quest/quest.controller';
import { UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import {
    CAT_NAP_DAYS,
    CAT_NAP_LIMIT_MESSAGE,
    CAT_NAP_MAX_CATS,
    CAT_NAP_STARTED_MESSAGE,
    CAT_NAP_TAILS,
    catNapPaidMessage,
    DEFAULT_TAILS_MODE,
    tailsRewardMessage,
    TAILS_MODES,
} from 'src/shared-contracts/copy';
import { buildAirdropProgression } from './airdrop-progression';
import { boardFilter, boardTop, NOT_BOARD_EXCLUDED_FILTER } from './boards';
import { MONTHLY_COUNTER_RESET, seasonTimes } from './codex-reset';
import { PERMISSION_LEVEL } from './models/user.model';
import { ProfileWriteDto, profileWritePipe } from './dto/profile-write.dto';
import { earnedBoardField, earnedTails, earnTailsInc, giveTailsInc } from './tails-ledger';
import { tokenStatus, TOKEN_STATUS_CACHE_CONTROL } from './token-status';
import { UserController } from './user.controller';
import { drawWheel, WHEEL_SLICES, WHEEL_TOTAL_WEIGHT, wheelOdds } from './wheel';

jest.mock('./user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Plan G5 backend (task 4e): Tails are rescue points. Ledger split, progression on earned Tails,
 * rescuers board, flagged accounts off boards, season band, token-status, wheel odds, copy, P4
 * throttles and the ADMIN-only role grant.
 */

const SPECULATION = /\$TAILS|\bairdrop\b|\bTGE\b|\blisting\b|\bMNT\b|\ballocation\b|\btokens?\b/i;
const BACKFILLED = { TAILS_EARNED_BACKFILL_DONE: 'true' } as NodeJS.ProcessEnv;

// ---------- an in-memory users collection that answers the board queries ----------

type Doc = Record<string, any>;

function matchesCondition(value: unknown, condition: unknown): boolean {
    if (condition && typeof condition === 'object' && !(condition instanceof Types.ObjectId)) {
        const c = condition as Record<string, unknown>;
        if ('$exists' in c && (value !== undefined) !== c.$exists) return false;
        if ('$ne' in c && value === c.$ne) return false;
        if ('$gt' in c && !(Number(value ?? -Infinity) > Number(c.$gt))) return false;
        if ('$lte' in c && !(Number(value ?? Infinity) <= Number(c.$lte))) return false;
        return true;
    }
    return String(value) === String(condition);
}

const matches = (doc: Doc, filter: Doc = {}) =>
    Object.entries(filter).every(([key, condition]) => matchesCondition(doc[key], condition));

function boardController(docs: Doc[]) {
    const controller = Object.create(UserController.prototype);
    controller.pawMatchLeaderboardCache = new Map();
    controller.repository = {
        find: jest.fn(async ({ searchObject, sort, perPage, pipelineStages }: any) => {
            const rows = docs.filter(doc => matches(doc, searchObject));
            if (sort?.sortBy) {
                rows.sort((a, b) => (Number(b[sort.sortBy]) || 0) - (Number(a[sort.sortBy]) || 0));
            }
            const sortStage = (pipelineStages || []).find((stage: any) => stage.$sort)?.$sort;
            if (sortStage) {
                const keys = Object.entries(sortStage) as Array<[string, number]>;
                rows.sort((a, b) => {
                    for (const [key, direction] of keys) {
                        const left = key === '_id' ? String(a._id) : Number(a[key]) || 0;
                        const right = key === '_id' ? String(b._id) : Number(b[key]) || 0;
                        if (left < right) return -direction;
                        if (left > right) return direction;
                    }
                    return 0;
                });
            }
            return rows.slice(0, perPage ?? rows.length).map(row => ({ ...row }));
        }),
        count: jest.fn(async (filter: Doc) => docs.filter(doc => matches(doc, filter)).length),
        findOne: jest.fn(async ({ searchObject }: any) => {
            const doc = docs.find(d => String(d._id) === String(searchObject._id));
            return doc ? { ...doc } : null;
        }),
    };
    return controller as UserController;
}

/** 300 registered players with distinct earned Tails, already backfilled (tailsEarned = tails). */
function population(): Doc[] {
    return Array.from({ length: 300 }, (_, i) => {
        const tails = 100000 - i * 300;
        return { _id: new Types.ObjectId(), name: `P${i}`, isGuest: false, tails, tailsEarned: tails };
    });
}

/** What a pledge does to the user document (giveTailsInc, applied in memory). */
function give(doc: Doc, amount: number) {
    for (const [key, value] of Object.entries(giveTailsInc(amount))) {
        doc[key] = (Number(doc[key]) || 0) + value;
    }
    doc.goalsHelped = (doc.goalsHelped || 0) + 1;
    doc.monthGoalsHelped = (doc.monthGoalsHelped || 0) + 1;
}

const progressionOf = (doc: Doc) =>
    buildAirdropProgression({
        catTiers: [Tier.RARE, Tier.RARE, Tier.EPIC, Tier.COMMON, Tier.COMMON, Tier.COMMON],
        questsCompleted: 9,
        streak: 10,
        tailsEarned: earnedTails(doc),
        tailsGiven: doc.tailsGiven,
        goalsHelped: doc.goalsHelped,
        monthTailsGiven: doc.monthTailsGiven,
        monthGoalsHelped: doc.monthGoalsHelped,
        claimedRewards: [],
        claimedChallenges: [],
        claimedMilestones: [],
        now: new Date('2026-10-01T12:00:00Z'),
    });

describe('G5 ledger split (tails-ledger.ts)', () => {
    it('earnTailsInc moves the balance and lifetime earned together; giveTailsInc never touches earned', () => {
        expect(earnTailsInc(250)).toEqual({ tails: 250, tailsEarned: 250 });
        expect(earnTailsInc(-5)).toEqual({ tails: 0, tailsEarned: 0 });
        expect(earnTailsInc(NaN)).toEqual({ tails: 0, tailsEarned: 0 });
        expect(earnTailsInc(12.9)).toEqual({ tails: 12, tailsEarned: 12 });
        expect(giveTailsInc(1000)).toEqual({ tails: -1000, tailsGiven: 1000, monthTailsGiven: 1000 });
        expect(giveTailsInc(1000)).not.toHaveProperty('tailsEarned');
    });

    it('earnedTails is exact before and after the backfill', () => {
        // Legacy doc, never backfilled.
        expect(earnedTails({ tails: 900 })).toBe(900);
        // Legacy doc that earned 100 since the deploy (tailsEarned holds only that part).
        expect(earnedTails({ tails: 1000, tailsEarned: 100 })).toBe(1000);
        // Backfilled, then gave 400.
        expect(earnedTails({ tails: 600, tailsEarned: 1000, tailsGiven: 400 })).toBe(1000);
        expect(earnedTails(null)).toBe(0);
    });

    it('the earned board sorts on tails until TAILS_EARNED_BACKFILL_DONE=true', () => {
        expect(earnedBoardField({} as NodeJS.ProcessEnv)).toBe('tails');
        expect(earnedBoardField(BACKFILLED)).toBe('tailsEarned');
    });

    it('the season reset zeroes the season gives', () => {
        expect(MONTHLY_COUNTER_RESET).toMatchObject({ monthTailsGiven: 0, monthGoalsHelped: 0 });
        expect(MONTHLY_COUNTER_RESET).not.toHaveProperty('tailsEarned');
        expect(MONTHLY_COUNTER_RESET).not.toHaveProperty('tailsGiven');
    });
});

describe('G5 acceptance: giving 1,000 Tails keeps rank, tier progress and top-200 membership', () => {
    const env = process.env.TAILS_EARNED_BACKFILL_DONE;
    beforeAll(() => {
        // Pledges only open after the backfill (the backfill refuses once one exists).
        process.env.TAILS_EARNED_BACKFILL_DONE = 'true';
    });
    afterAll(() => {
        if (env === undefined) delete process.env.TAILS_EARNED_BACKFILL_DONE;
        else process.env.TAILS_EARNED_BACKFILL_DONE = env;
    });

    it('rank, board value, top-200 and tier progress are unchanged; the balance drops', async () => {
        const docs = population();
        const me = docs[150];
        const controller = boardController(docs);

        const rankBefore = (await controller.position(String(me._id))).position;
        const topBefore = (await controller.leaderboard(200)).map(row => String(row._id));
        const progressionBefore = progressionOf(me);

        give(me, 1000);

        const rankAfter = (await controller.position(String(me._id))).position;
        const top = await controller.leaderboard(200);
        const progressionAfter = progressionOf(me);

        expect(me.tails).toBe(me.tailsEarned - 1000);
        expect(rankAfter).toBe(rankBefore);
        expect(rankAfter).toBe(151);
        expect(top.map(row => String(row._id))).toEqual(topBefore);
        expect(top.find(row => String(row._id) === String(me._id))).toMatchObject({
            tails: me.tailsEarned,
            tailsEarned: me.tailsEarned,
        });
        expect(progressionAfter.metrics.tails).toBe(progressionBefore.metrics.tails);
        expect(progressionAfter.metrics.collectibleLevel).toBeGreaterThanOrEqual(
            progressionBefore.metrics.collectibleLevel
        );
        progressionAfter.tiers.forEach((tier, i) => {
            expect(tier.unlockProgress).toBeGreaterThanOrEqual(progressionBefore.tiers[i].unlockProgress);
        });
        expect(progressionAfter.eligibilityCriteria.find(c => c.id === 'TAILS')!.current).toBe(
            progressionBefore.eligibilityCriteria.find(c => c.id === 'TAILS')!.current
        );
    });

    it('a player at the edge of the top 200 stays in it after giving', async () => {
        const docs = population();
        const edge = docs[199];
        const controller = boardController(docs);

        give(edge, 1000);

        const top = await controller.leaderboard(200);
        expect(top).toHaveLength(200);
        expect(top.map(row => String(row._id))).toContain(String(edge._id));
    });

    it('control: ranking by the balance would have cost the giver places', async () => {
        const docs = population();
        const me = docs[150];
        give(me, 1000);
        const ahead = docs.filter(doc => doc.tails > me.tails).length;
        expect(ahead + 1).toBeGreaterThan(151);
    });
});

describe('G5 boards: rescuers board, flagged accounts off every board', () => {
    const rescuers = () => [
        { _id: new Types.ObjectId(), name: 'A', isGuest: false, tailsGiven: 5000, goalsHelped: 4, monthTailsGiven: 0 },
        {
            _id: new Types.ObjectId(),
            name: 'B',
            isGuest: false,
            tailsGiven: 3000,
            goalsHelped: 2,
            monthTailsGiven: 3000,
            monthGoalsHelped: 2,
        },
        {
            _id: new Types.ObjectId(),
            name: 'Flagged',
            isGuest: false,
            tailsGiven: 9000,
            goalsHelped: 9,
            boardExcludedAt: new Date(),
        },
        { _id: new Types.ObjectId(), name: 'Guest', isGuest: true, tailsGiven: 8000 },
        { _id: new Types.ObjectId(), name: 'Nobody', isGuest: false, tailsGiven: 0 },
    ];

    it('ranks by Tails given, lifetime by default, this season with ?period=season', async () => {
        const docs = rescuers();
        const controller = boardController(docs);

        expect(await controller.leaderboardRescuers()).toEqual([
            { _id: docs[0]._id, name: 'A', tailsGiven: 5000, goalsHelped: 4 },
            { _id: docs[1]._id, name: 'B', tailsGiven: 3000, goalsHelped: 2 },
        ]);
        expect(await controller.leaderboardRescuers('season')).toEqual([
            { _id: docs[1]._id, name: 'B', tailsGiven: 3000, goalsHelped: 2 },
        ]);
    });

    it('positions skip flagged accounts and guests; a guest sees "would be"', async () => {
        const docs = rescuers();
        const controller = boardController(docs);

        await expect(controller.positionRescuers(String(docs[1]._id))).resolves.toEqual({
            position: 2,
            tailsGiven: 3000,
        });
        await expect(controller.positionRescuers(String(docs[3]._id), { isGuest: true } as any)).resolves.toEqual({
            position: 1,
            wouldBe: true,
            tailsGiven: 8000,
        });
        expect(GUEST_ALLOW_LIST['GET /user/leaderboard/rescuers/position']).toEqual({});
    });

    it('a flagged account is on no Tails, catnip or rescuers board and pushes nobody down', async () => {
        const docs = population();
        docs[0].boardExcludedAt = new Date();
        docs[0].catnipCount = 400;
        const controller = boardController(docs);

        const tails = await controller.leaderboard();
        expect(tails.map(row => String(row._id))).not.toContain(String(docs[0]._id));
        expect((await controller.position(String(docs[1]._id))).position).toBe(1);
        const catnip = await controller.leaderboardCatnip();
        expect(catnip.map((row: any) => String(row._id))).not.toContain(String(docs[0]._id));
        expect(boardFilter()).toEqual(expect.objectContaining(NOT_BOARD_EXCLUDED_FILTER));
    });

    it('a deleted account keeps its given history but ranks on no board (4e review fix #2)', async () => {
        const docs = rescuers();
        // Account deletion zeroes `tails` but keeps tailsEarned / tailsGiven for impact totals.
        Object.assign(docs[0], { name: 'Deleted player', deletedAt: new Date(), tails: 0, tailsEarned: 90000 });
        const controller = boardController(docs);

        const given = await controller.leaderboardRescuers();
        expect(given.map(row => row.name)).toEqual(['B']);
        await expect(controller.positionRescuers(String(docs[1]._id))).resolves.toEqual({
            position: 1,
            tailsGiven: 3000,
        });

        const players = population();
        Object.assign(players[0], { name: 'Deleted player', deletedAt: new Date(), tails: 0 });
        const withEnv = process.env.TAILS_EARNED_BACKFILL_DONE;
        process.env.TAILS_EARNED_BACKFILL_DONE = 'true';
        try {
            const board = boardController(players);
            const top = await board.leaderboard(200);
            expect(top.map(row => String(row._id))).not.toContain(String(players[0]._id));
            expect(top).toHaveLength(200);
            expect((await board.position(String(players[1]._id))).position).toBe(1);
        } finally {
            if (withEnv === undefined) delete process.env.TAILS_EARNED_BACKFILL_DONE;
            else process.env.TAILS_EARNED_BACKFILL_DONE = withEnv;
        }
        expect(boardFilter()).toEqual(expect.objectContaining({ deletedAt: { $exists: false } }));
    });

    it('a flagged account is told no rank on any position route (4e review fix #3)', async () => {
        const docs = rescuers();
        docs[1].boardExcludedAt = new Date();
        Object.assign(docs[1], { catnipCount: 50, tails: 10, tailsEarned: 10 });
        const controller = boardController(docs);
        const id = String(docs[1]._id);

        await expect(controller.positionRescuers(id)).resolves.toEqual({
            position: null,
            excluded: true,
            tailsGiven: 3000,
        });
        await expect(controller.position(id)).resolves.toEqual({ position: null, excluded: true });
        await expect(controller.positionCatnip(id)).resolves.toEqual({ position: null, excluded: true });
        expect((controller as any).repository.count).not.toHaveBeenCalled();
    });

    it('ties are broken by _id, so the top=N cut-off is stable (4e review fix #5)', async () => {
        const ids = Array.from({ length: 6 }, () => new Types.ObjectId()).sort((a, b) =>
            String(a).localeCompare(String(b))
        );
        // Inserted in reverse id order, all tied at 1000.
        const docs = [...ids]
            .reverse()
            .map((id, i) => ({ _id: id, name: `T${i}`, isGuest: false, tailsGiven: 1000, goalsHelped: 1 }));
        const controller = boardController(docs);

        const first = await controller.leaderboardRescuers(undefined, '3');
        expect(first.map(row => String(row._id))).toEqual(ids.slice(0, 3).map(String));
        docs.reverse();
        const second = await controller.leaderboardRescuers(undefined, '3');
        expect(second).toEqual(first);
        expect((controller as any).repository.find).toHaveBeenCalledWith(
            expect.objectContaining({ pipelineStages: [{ $sort: { tailsGiven: -1, _id: 1 } }] })
        );
    });

    it('?top= is clamped to 1..200', () => {
        expect(boardTop(undefined)).toBe(50);
        expect(boardTop('5')).toBe(5);
        expect(boardTop('0')).toBe(1);
        expect(boardTop('99999')).toBe(200);
        expect(boardTop('abc')).toBe(50);
    });
});

describe('G5 progression: purchase-free tiers, BIG_HEART and GOAL_GETTER', () => {
    const base = {
        catTiers: [] as Tier[],
        questsCompleted: 0,
        streak: 0,
        tailsEarned: 0,
        claimedRewards: [] as string[],
        claimedChallenges: [] as string[],
        claimedMilestones: [] as string[],
    };

    it('no requirement, criterion or score depends on a purchase; monetizationScore is gone', () => {
        const progression = buildAirdropProgression({ ...base, packPurchases: 9, portraitPurchases: 9 });
        const ids = [
            ...progression.eligibilityCriteria.map(c => c.id),
            ...progression.tiers.flatMap(t => t.requirements.map(r => r.id)),
            ...progression.gamification.dailyChallenges.map(c => c.id),
        ];
        expect(ids.filter(id => /PURCHASE|MONETIZE/.test(id))).toEqual([]);
        expect(progression.metrics.scoreBreakdown).not.toHaveProperty('monetizationScore');
        expect(progression.metrics.collectibleLevel).toBe(0);
        expect(progression.gamification.comboMultiplier).toBe(1);
    });

    it('purchase steps became Tails given and goals helped', () => {
        const { tiers } = buildAirdropProgression(base);
        const req = (tier: string) => tiers.find(t => t.id === tier)!.requirements.map(r => [r.id, r.target]);
        expect(req('RESCUER')).toContainEqual(['TAILS_GIVEN', 500]);
        expect(req('CURATOR')).toEqual(
            expect.arrayContaining([
                ['TAILS_GIVEN', 2500],
                ['GOALS_HELPED', 2],
            ])
        );
        expect(req('LEGEND')).toEqual(
            expect.arrayContaining([
                ['TAILS_GIVEN', 10000],
                ['GOALS_HELPED', 5],
            ])
        );
    });

    it("BIG_HEART and GOAL_GETTER read this season's gives and replace the wallet and purchase challenges", () => {
        const progression = buildAirdropProgression({
            ...base,
            tailsGiven: 50000,
            goalsHelped: 50,
            monthTailsGiven: 1000,
            monthGoalsHelped: 1,
        });
        const challenges = Object.fromEntries(progression.gamification.dailyChallenges.map(c => [c.id, c]));
        expect(challenges).not.toHaveProperty('TAILS_MOMENTUM');
        expect(challenges).not.toHaveProperty('MONETIZE_LOOP');
        expect(challenges.BIG_HEART).toMatchObject({ current: 1000, target: 1000, completed: true, claimable: true });
        expect(challenges.GOAL_GETTER).toMatchObject({ current: 1, target: 2, completed: false });
    });

    it('giving raises the collectible level through rescueScore (capped at 60)', () => {
        expect(
            buildAirdropProgression({ ...base, goalsHelped: 2, tailsGiven: 3000 }).metrics.scoreBreakdown.rescueScore
        ).toBe(18);
        expect(
            buildAirdropProgression({ ...base, goalsHelped: 99, tailsGiven: 999999 }).metrics.scoreBreakdown.rescueScore
        ).toBe(60);
    });

    it('tier, criterion and challenge copy uses the rescue vocabulary', () => {
        const progression = buildAirdropProgression(base);
        const text = JSON.stringify({
            criteria: progression.eligibilityCriteria,
            tiers: progression.tiers,
            challenges: progression.gamification.dailyChallenges,
            milestones: progression.gamification.milestones,
        });
        expect(text).not.toMatch(SPECULATION);
        expect(text).not.toMatch(/wallet|snapshot|purchase|conversion/i);
    });
});

describe('G5 P6 season band (codex-reset.ts)', () => {
    it('freezes at 22:00 UTC on the 8th, resets at 23:00, starts the next season at 00:00 on the 9th', () => {
        expect(seasonTimes(new Date('2026-10-01T12:00:00Z'))).toEqual({
            freezeAt: '2026-10-08T22:00:00.000Z',
            resetAt: '2026-10-08T23:00:00.000Z',
            anchorAt: '2026-10-09T00:00:00.000Z',
            startedAt: '2026-09-09T00:00:00.000Z',
            frozen: false,
        });
    });

    it('is frozen in the last two hours and rolls over at the anchor', () => {
        expect(seasonTimes(new Date('2026-10-08T22:30:00Z')).frozen).toBe(true);
        expect(seasonTimes(new Date('2026-10-08T21:59:59Z')).frozen).toBe(false);
        expect(seasonTimes(new Date('2026-10-09T00:00:00Z'))).toMatchObject({
            anchorAt: '2026-11-09T00:00:00.000Z',
            startedAt: '2026-10-09T00:00:00.000Z',
            frozen: false,
        });
    });

    it('crosses the year end', () => {
        expect(seasonTimes(new Date('2026-12-20T00:00:00Z'))).toMatchObject({
            freezeAt: '2027-01-08T22:00:00.000Z',
            anchorAt: '2027-01-09T00:00:00.000Z',
            startedAt: '2026-12-09T00:00:00.000Z',
        });
    });

    it('the progression response carries the season, and no launch date', () => {
        const progression = progressionOf({ tails: 0 });
        expect(progression.season.freezeAt).toBe('2026-10-08T22:00:00.000Z');
        expect(JSON.stringify(progression)).not.toMatch(/tge|launch/i);
    });
});

describe('G5 Vault: GET /user/token-status', () => {
    it('defaults to POINTS with no date, whatever TAILS_TGE_AT says', () => {
        expect(DEFAULT_TAILS_MODE).toBe('POINTS');
        expect(tokenStatus({} as NodeJS.ProcessEnv)).toEqual({ mode: 'POINTS', tgeAt: null });
        expect(tokenStatus({ TAILS_TGE_AT: '2026-11-19T00:00:00Z' } as NodeJS.ProcessEnv)).toEqual({
            mode: 'POINTS',
            tgeAt: null,
        });
        expect(tokenStatus({ TAILS_TOKEN_MODE: 'yes please' } as NodeJS.ProcessEnv)).toEqual({
            mode: 'POINTS',
            tgeAt: null,
        });
    });

    it('reports TOKEN and its date only when switched on', () => {
        expect(TAILS_MODES).toEqual(['POINTS', 'TOKEN']);
        expect(
            tokenStatus({ TAILS_TOKEN_MODE: 'token', TAILS_TGE_AT: '2027-03-01T00:00:00Z' } as NodeJS.ProcessEnv)
        ).toEqual({ mode: 'TOKEN', tgeAt: '2027-03-01T00:00:00.000Z' });
        expect(tokenStatus({ TAILS_TOKEN_MODE: 'TOKEN', TAILS_TGE_AT: 'soon' } as NodeJS.ProcessEnv)).toEqual({
            mode: 'TOKEN',
            tgeAt: null,
        });
    });

    it('is public and cached', () => {
        const handler = (UserController.prototype as any).tokenStatus;
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
        expect(Reflect.getMetadata('path', handler)).toBe('token-status');
        expect(Reflect.getMetadata('__headers__', handler)).toEqual([
            { name: 'Cache-Control', value: TOKEN_STATUS_CACHE_CONTROL },
        ]);
    });
});

describe('G5 published wheel odds', () => {
    it('the published table is the draw table, and sums to 100%', () => {
        const odds = wheelOdds();
        expect(WHEEL_TOTAL_WEIGHT).toBe(100);
        expect(odds.slices.reduce((sum, s) => sum + s.chancePercent, 0)).toBeCloseTo(100);
        expect(odds.slices).toEqual(WHEEL_SLICES.map(s => ({ tails: s.tails, chancePercent: s.weight })));
        expect(odds.expectedTails).toBe(23.84);
    });

    it('draws each slice in proportion to its weight (same odds as the old hard-coded draw)', () => {
        const counts: Record<number, number> = {};
        for (let i = 0; i < 10000; i++) {
            const tails = drawWheel((i + 0.5) / 10000);
            counts[tails] = (counts[tails] || 0) + 1;
        }
        expect(counts).toEqual({ 1000: 100, 250: 100, 100: 100, 50: 100, 25: 2400, 10: 2400, 5: 2400, 1: 2400 });
        expect(drawWheel(-1)).toBe(1000);
        expect(drawWheel(2)).toBe(1);
    });

    it('a spin is one conditional write: it credits earned Tails, and a second spin is 400', async () => {
        const controller = Object.create(UserController.prototype);
        const userId = new Types.ObjectId();
        let spun = false;
        controller.repository = {
            model: {
                findOneAndUpdate: jest.fn((filter: any) => ({
                    lean: async () => {
                        if (filter.canRedeemLives !== true || spun) return null;
                        spun = true;
                        return { _id: userId };
                    },
                })),
            },
        };

        const first = await controller.Tredeem(String(userId));
        await expect(controller.Tredeem(String(userId))).rejects.toBeInstanceOf(BadRequestException);

        const [, update] = controller.repository.model.findOneAndUpdate.mock.calls[0];
        expect(update.$inc).toMatchObject({ tails: first.tails, tailsEarned: first.tails, monthTails: first.tails });
        expect(update.$set).toEqual({ canRedeemLives: false });
    });
});

describe('G5 P4: per-user throttles on the reward routes', () => {
    const guards = (proto: any, name: string) => Reflect.getMetadata(GUARDS_METADATA, proto[name]) || [];

    it.each([['claimAirdropTier'], ['claimAirdropChallenge'], ['claimAirdropMilestone'], ['Tredeem'], ['referral']])(
        'UserController.%s',
        name => {
            expect(guards(UserController.prototype, name)).toContain(UserThrottlerGuard);
        }
    );

    it.each([['Tquests'], ['contestRedeemal']])('QuestController.%s', name => {
        expect(guards(QuestController.prototype, name)).toContain(UserThrottlerGuard);
    });
});

describe('G4 scheduled fix: only an ADMIN grants MANAGER or above', () => {
    const validate = (body: unknown) => profileWritePipe.transform(body, { type: 'body', metatype: ProfileWriteDto });
    const manager = { _id: 'm', permission: PERMISSION_LEVEL.MANAGER } as any;
    const admin = { _id: 'a', permission: PERMISSION_LEVEL.ADMIN } as any;
    const controllerFor = (target: Doc | null) => {
        const controller = Object.create(UserController.prototype);
        controller.userService = { generateWallets: () => ({}), generateACat: async () => undefined };
        controller.repository = {
            create: jest.fn(async (doc: Doc) => doc),
            findOne: jest.fn(async () => target),
            update: jest.fn(async () => ({})),
        };
        return controller;
    };

    it.each([PERMISSION_LEVEL.MANAGER, PERMISSION_LEVEL.ADMIN])(
        'a manager creating a user with permission %i gets 403 and nothing is written',
        async permission => {
            const controller = controllerFor(null);
            const error = await controller
                .createProfile(await validate({ name: 'A', permission }), manager)
                .catch((e: any) => e);
            expect(error.getStatus()).toBe(403);
            expect((controller as any).repository.create).not.toHaveBeenCalled();
        }
    );

    it('a manager cannot promote an existing user to MANAGER', async () => {
        const controller = controllerFor({ email: 'u@example.com', permission: PERMISSION_LEVEL.USER });
        const error = await controller
            .updateProfile(await validate({ permission: PERMISSION_LEVEL.MANAGER }), 'target', manager)
            .catch((e: any) => e);
        expect(error.getStatus()).toBe(403);
        expect((controller as any).repository.update).not.toHaveBeenCalled();
    });

    it('a string permission is rejected by the pipe; an admin may grant MANAGER', async () => {
        await expect(validate({ name: 'A', permission: '4' })).rejects.toBeInstanceOf(BadRequestException);
        const created = await controllerFor(null).createProfile(
            await validate({ name: 'A', permission: PERMISSION_LEVEL.MANAGER }),
            admin
        );
        expect(created.permission).toBe(PERMISSION_LEVEL.MANAGER);
    });
});

describe('G5 copy: backend messages in the rescue vocabulary', () => {
    it('the shared message builders', () => {
        expect(tailsRewardMessage(2500, 'Explorer Tier')).toBe('You got 2,500 Tails from Explorer Tier');
        expect(tailsRewardMessage(10)).toBe('You got 10 Tails');
        expect(CAT_NAP_TAILS).toBe(50);
        expect(CAT_NAP_MAX_CATS).toBe(3);
        expect(CAT_NAP_DAYS).toBe(7);
        expect(CAT_NAP_STARTED_MESSAGE).toBe('Your cat is taking a nap. Come back in 7 days to collect 50 Tails.');
        expect(catNapPaidMessage(50)).toBe('Your cat woke up rested. You got 50 Tails.');
        [CAT_NAP_STARTED_MESSAGE, CAT_NAP_LIMIT_MESSAGE, catNapPaidMessage(50), tailsRewardMessage(5, 'x')].forEach(
            text => {
                expect(text).not.toMatch(SPECULATION);
                // F11 bans any "Tails per" rate.
                expect(text).not.toMatch(/Tails per/i);
            }
        );
    });

    // Needs tools/copy-lint's own install (TypeScript). The CI backend job does not install it, so
    // there the CI `copy-lint` job covers the same files; locally and with it installed, this runs.
    const root = join(__dirname, '..', '..', '..');
    const lintInstalled = existsSync(join(root, 'tools', 'copy-lint', 'node_modules', 'typescript'));
    (lintInstalled ? it : it.skip)(
        'tools/copy-lint (backend rule set: tone and claims) finds nothing in the files this task owns',
        () => {
            const cli = join(root, 'tools', 'copy-lint', 'bin', 'copy-lint.mjs');
            const run = spawnSync(
                process.execPath,
                [cli, '--root', root, '--target', 'backend', '--format', 'json', '--warn'],
                { encoding: 'utf8' }
            );
            expect(run.status).toBe(0);
            const { files, findings } = JSON.parse(run.stdout);
            expect(files).toBeGreaterThan(50);
            const owned = /^backend\/src\/(user|quest|cat|web3|blessing|image|feed|common)\//;
            expect(findings.filter((f: { file: string }) => owned.test(f.file))).toEqual([]);
        }
    );
});

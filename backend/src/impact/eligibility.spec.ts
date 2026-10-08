import { Types } from 'mongoose';
import {
    accountFactsOf,
    dailyPawPolicy,
    HOUR_MS,
    instantTreatPolicy,
    rescueGoalPledgePolicy,
    spacedScoringRuns,
} from './eligibility';
import { ImpactEligibilityService } from './eligibility.service';
import { memoryModel } from './memory-model.fakes-spec';

const NOW = new Date('2026-10-02T12:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);
const verified = { isGuest: false, emailVerified: true };

describe('F7.5 instant treat policy (open since Oct 8, 2026)', () => {
    it.each([
        ['a guest', { ...verified, isGuest: true, createdAt: ago(1), savedGames: 0 }],
        ['an unverified email', { ...verified, emailVerified: false, createdAt: ago(100), savedGames: 9 }],
        ['an account 1 h old', { ...verified, createdAt: ago(1), savedGames: 0 }],
        ['an unknown creation time', { ...verified, createdAt: null, savedGames: 0 }],
        ['no account at all', undefined],
    ])('%s may send a treat', (_label, facts) => {
        expect(instantTreatPolicy(facts as any, NOW)).toEqual({ eligible: true, reason: null });
    });
});

describe('F7.5 daily paw policy', () => {
    const at = (minutes: number, points = 5) => ({ points, createdAt: new Date(NOW.getTime() + minutes * 60000) });

    it('counts scoring runs at least 3 minutes apart', () => {
        expect(spacedScoringRuns([at(0), at(1), at(2)])).toBe(1);
        expect(spacedScoringRuns([at(0), at(3)])).toBe(2);
        expect(spacedScoringRuns([at(0), at(10, 0), at(20, 0)])).toBe(1);
        expect(spacedScoringRuns([at(5), at(0), at(2), at(8)])).toBe(3);
    });

    it.each([
        ['a guest', { ...verified, isGuest: true, createdAt: ago(100), runs: [at(0), at(5)] }, 'guest'],
        [
            'unverified',
            { ...verified, emailVerified: false, createdAt: ago(100), runs: [at(0), at(5)] },
            'email-unverified',
        ],
        ['too new at settlement', { ...verified, createdAt: ago(12), runs: [at(0), at(5)] }, 'account-too-new'],
        ['two runs 2 minutes apart', { ...verified, createdAt: ago(48), runs: [at(0), at(2)] }, 'not-enough-runs'],
        ['two zero-point runs', { ...verified, createdAt: ago(48), runs: [at(0, 0), at(5, 0)] }, 'not-enough-runs'],
        ['two scoring runs 3 minutes apart', { ...verified, createdAt: ago(48), runs: [at(0), at(3)] }, null],
    ])('%s -> %s', (_label, facts, reason) => {
        expect(dailyPawPolicy(facts as any, NOW).reason).toBe(reason);
    });
});

describe('F7.5 Rescue Goal pledge policy', () => {
    it.each([
        ['a guest', { isGuest: true, emailVerified: true, createdAt: ago(100), savedGames: 5 }, 'guest'],
        ['71 h old', { isGuest: false, emailVerified: false, createdAt: ago(71), savedGames: 5 }, 'account-too-new'],
        ['two games', { isGuest: false, emailVerified: false, createdAt: ago(80), savedGames: 2 }, 'not-enough-games'],
        [
            '72 h, three games (email not required)',
            { isGuest: false, emailVerified: false, createdAt: ago(72), savedGames: 3 },
            null,
        ],
    ])('%s -> %s', (_label, facts, reason) => {
        expect(rescueGoalPledgePolicy(facts as any, NOW).reason).toBe(reason);
    });
});

describe('accountFactsOf', () => {
    it('reads the request user; guests and transient guests are guests; verified needs emailVerifiedAt', () => {
        expect(accountFactsOf(undefined)).toEqual({ isGuest: true, emailVerified: false, createdAt: null });
        expect(accountFactsOf({ transient: true }).isGuest).toBe(true);
        expect(accountFactsOf({ isGuest: false, createdAt: '2026-01-01T00:00:00Z' })).toEqual({
            isGuest: false,
            emailVerified: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
        });
        expect(accountFactsOf({ emailVerifiedAt: new Date() }).emailVerified).toBe(true);
    });

    it('counts the age of a promoted guest from its promotion, never from its guest days', () => {
        const facts = accountFactsOf({ isGuest: false, createdAt: ago(24 * 10), promotedAt: ago(2) });
        expect(facts.createdAt).toEqual(ago(2));
        // A legacy account without promotedAt keeps its createdAt; a bad promotedAt is ignored.
        expect(accountFactsOf({ createdAt: ago(48), promotedAt: 'nope' }).createdAt).toEqual(ago(48));
    });
});

describe('ImpactEligibilityService', () => {
    function setup(games = 0) {
        const gameModel = memoryModel();
        const userId = new Types.ObjectId();
        for (let i = 0; i < games; i++) gameModel.rows.push({ _id: new Types.ObjectId(), user: userId, points: 3 });
        gameModel.rows.push({ _id: new Types.ObjectId(), user: new Types.ObjectId(), points: 3 });
        return { service: new ImpactEligibilityService(gameModel as any), userId, gameModel };
    }
    it('counts only the caller saved games', async () => {
        const { service, userId } = setup(2);
        await expect(service.savedGames(userId, 5)).resolves.toBe(2);
        await expect(service.savedGames(new Types.ObjectId(), 5)).resolves.toBe(0);
        await expect(service.savedGames('not-an-id', 5)).resolves.toBe(0);
    });

    it('instant treat is open to everyone and reads no games', async () => {
        const { service, userId, gameModel } = setup(0);
        for (const user of [null, { isGuest: true }, { _id: userId, createdAt: ago(1) }]) {
            await expect(service.instantTreat(user, NOW)).resolves.toEqual({ eligible: true, reason: null });
        }
        expect(gameModel.countDocuments).not.toHaveBeenCalled();
    });
});

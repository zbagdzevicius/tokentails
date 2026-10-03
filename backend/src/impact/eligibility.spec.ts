import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    accountFactsOf,
    dailyPawPolicy,
    HOUR_MS,
    instantTreatPolicy,
    rescueGoalPledgePolicy,
    spacedScoringRuns,
} from './eligibility';
import { DONATE_NOT_ELIGIBLE, ImpactEligibilityService } from './eligibility.service';
import { memoryModel } from './memory-model.fakes-spec';

const NOW = new Date('2026-10-02T12:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);
const verified = { isGuest: false, emailVerified: true };

describe('F7.5 instant treat policy', () => {
    it.each([
        [
            'a guest, even if everything else is met',
            { ...verified, isGuest: true, createdAt: ago(100), savedGames: 9 },
            'guest',
        ],
        [
            'an unverified email',
            { ...verified, emailVerified: false, createdAt: ago(100), savedGames: 9 },
            'email-unverified',
        ],
        ['an account 23 h old', { ...verified, createdAt: ago(23), savedGames: 9 }, 'account-too-new'],
        ['an unknown creation time', { ...verified, createdAt: null, savedGames: 9 }, 'account-too-new'],
        ['no saved game', { ...verified, createdAt: ago(25), savedGames: 0 }, 'no-saved-game'],
        ['a verified 24 h account with one game', { ...verified, createdAt: ago(24), savedGames: 1 }, null],
    ])('%s -> %s', (_label, facts, reason) => {
        const result = instantTreatPolicy(facts as any, NOW);
        expect(result.eligible).toBe(reason === null);
        expect(result.reason).toBe(reason);
    });

    it('says when a too-new account becomes eligible', () => {
        expect(instantTreatPolicy({ ...verified, createdAt: ago(20), savedGames: 1 }, NOW).eligibleAt).toBe(
            '2026-10-02T16:00:00.000Z'
        );
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
        expect(instantTreatPolicy({ ...facts, emailVerified: true, savedGames: 5 }, NOW)).toMatchObject({
            eligible: false,
            reason: 'account-too-new',
        });
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
    const errorOf = async (promise: Promise<unknown>) =>
        promise.then(
            () => null,
            (e: any) => e
        );

    it('counts only the caller saved games', async () => {
        const { service, userId } = setup(1);
        const user = { _id: userId, createdAt: ago(48), emailVerifiedAt: ago(40) };
        await expect(service.instantTreat(user, NOW)).resolves.toEqual({ eligible: true, reason: null });
        const other = { _id: new Types.ObjectId(), createdAt: ago(48), emailVerifiedAt: ago(40) };
        await expect(service.instantTreat(other, NOW)).resolves.toMatchObject({
            eligible: false,
            reason: 'no-saved-game',
        });
    });

    it('maps refusals to F5.6 codes: guest, email, then the policy code', async () => {
        const { service, userId } = setup(0);
        const guest = await errorOf(service.assertInstantTreat({ isGuest: true }, NOW));
        expect(guest.getResponse()).toMatchObject({ code: 'GUEST_FORBIDDEN' });

        const unverified = await errorOf(service.assertInstantTreat({ _id: userId, createdAt: ago(48) }, NOW));
        expect(unverified).toBeInstanceOf(ForbiddenException);
        expect(unverified.getResponse()).toMatchObject({ code: 'EMAIL_UNVERIFIED' });

        const young = await errorOf(
            service.assertInstantTreat({ _id: userId, createdAt: ago(2), emailVerifiedAt: ago(1) }, NOW)
        );
        expect(young.getResponse()).toMatchObject({
            code: DONATE_NOT_ELIGIBLE,
            reason: 'account-too-new',
            eligibleAt: '2026-10-03T10:00:00.000Z',
        });
    });

    it('counts a replay-verified Catnip Heist save as a saved game (F7.5, source heist)', async () => {
        const { service, userId, gameModel } = setup(0);
        const user = { _id: userId, createdAt: ago(48), emailVerifiedAt: ago(40) };
        await expect(service.instantTreat(user, NOW)).resolves.toMatchObject({
            eligible: false,
            reason: 'no-saved-game',
        });
        gameModel.rows.push({ _id: new Types.ObjectId(), user: userId, type: 'CATNIP_HEIST', points: 900 });
        await expect(service.instantTreat(user, NOW)).resolves.toEqual({ eligible: true, reason: null });
    });

    it('does not read games for a guest', async () => {
        const { service, gameModel } = setup(3);
        await service.instantTreat({ isGuest: true, _id: new Types.ObjectId() }, NOW);
        expect(gameModel.countDocuments).not.toHaveBeenCalled();
    });
});

import {
    accountLevelOf,
    accountMatchesOf,
    LEGACY_MATCHES_CAP,
    legacyCredit,
    legacyOf,
    playedOf,
} from './account-level';
import { levelOf, matchesForLevel, QUEUE_LEVEL } from './mode-unlocks';
import { pawlegendsMatchesInc } from './pawlegends-merge';
import { RANKED_MIN_MATCHES } from './ranked/tiers';

/*
 * The account level's one source (account-level.ts, LEADERBOARDS.md): the curve, the saved matches plus the frozen
 * legacy credit, and the founder's case (Nov 20: "my level ... is 8 ... but it shows LV 4").
 */

describe('account level', () => {
    it('the curve: Lv 1 at 0, Lv 4 at 6, Lv 5 at 8, Lv 8 at 16, Lv 10 at 25, then a level every 10', () => {
        expect([0, 1, 2, 6, 7, 8, 15, 16, 19, 20, 25, 50, 59, 60].map(levelOf)).toEqual([
            1, 1, 2, 4, 4, 5, 7, 8, 8, 9, 10, 14, 14, 15,
        ]);
        expect(matchesForLevel(8)).toBe(16);
        expect(RANKED_MIN_MATCHES).toBe(matchesForLevel(QUEUE_LEVEL.ranked));
        expect(levelOf(1e9)).toBe(99);
    });

    it('saved matches plus the legacy credit; junk ignored, the credit clamped', () => {
        expect(playedOf({ easy: 4, hard: 2, junk: 9, normal: -3 } as Record<string, unknown>)).toEqual({
            matches: 6,
            top: 'hard',
        });
        expect(accountMatchesOf({ pawlegendsMatches: { easy: 6 }, pawlegendsLegacyMatches: 12 })).toBe(18);
        expect(accountMatchesOf({ pawlegendsMatches: { easy: 6 }, pawlegendsLegacyMatches: 'x' })).toBe(6);
        expect(accountMatchesOf({ pawlegendsLegacyMatches: 1e6 })).toBe(LEGACY_MATCHES_CAP);
        expect(accountMatchesOf(null)).toBe(0);
        expect(legacyOf(-4)).toBe(0);
        expect(legacyOf(3.9)).toBe(3);
    });

    it("the founder's case: 6 saved, 18 on the synced device count: the credit makes the board's level his profile's (Lv 8)", () => {
        const credit = legacyCredit(18, 6);
        expect(credit).toBe(12);
        expect(levelOf(6)).toBe(4);
        expect(accountLevelOf({ pawlegendsMatches: { normal: 6 }, pawlegendsLegacyMatches: credit })).toBe(8);
        // never below 0, never above the cap, junk is 0
        expect(legacyCredit(3, 6)).toBe(0);
        expect(legacyCredit(1_000_000, 0)).toBe(LEGACY_MATCHES_CAP);
        expect(legacyCredit('99', 0)).toBe(0);
    });

    it('the guest merge carries the credit with the saved matches', () => {
        expect(pawlegendsMatchesInc({ pawlegendsMatches: { easy: 3 }, pawlegendsLegacyMatches: 4 })).toEqual({
            'pawlegendsMatches.easy': 3,
            pawlegendsLegacyMatches: 4,
        });
        expect(pawlegendsMatchesInc({ pawlegendsMatches: { easy: 3 } })).toEqual({ 'pawlegendsMatches.easy': 3 });
    });
});

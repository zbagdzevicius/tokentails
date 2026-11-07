import { difficultyAllowed, difficultyForRating, matchDifficulty, matchSide, partyRating } from './fill';

/* Quick Play match shape (M1A-IMPL.md §2.3, §2.5). */

describe('mm fill', () => {
    it('difficulty from the team rating (the bot pseudo-rating midpoints)', () => {
        expect(difficultyForRating(1000)).toBe('rookie');
        expect(difficultyForRating(1124)).toBe('rookie');
        expect(difficultyForRating(1125)).toBe('easy');
        expect(difficultyForRating(1374)).toBe('easy');
        expect(difficultyForRating(1500)).toBe('normal');
        expect(difficultyForRating(1625)).toBe('hard');
        expect(matchDifficulty([1400, 1600, 1700], [null, null, null])).toBe('normal');
    });

    it('capped at the lowest unlocked tier among the humans (a hint only lowers it)', () => {
        expect(matchDifficulty([1800, 1800], ['hard', 'easy'])).toBe('easy');
        expect(matchDifficulty([1000], ['hard'])).toBe('rookie');
        expect(matchDifficulty([1800], ['bogus'])).toBe('hard');
        expect(difficultyAllowed('normal', 'easy')).toBe(false);
        expect(difficultyAllowed('easy', 'easy')).toBe(true);
        expect(difficultyAllowed('hard', null)).toBe(true);
    });

    it('side: the fixed side wins; all `any` balances the recent matches, ties go to cats', () => {
        expect(matchSide(['any', 'dog'], [])).toBe('dog');
        expect(matchSide(['any', 'any'], [])).toBe('cat');
        expect(matchSide(['any'], ['cat', 'cat', 'dog'])).toBe('dog');
        expect(matchSide(['any'], ['dog', 'dog', 'cat'])).toBe('cat');
    });

    it('party rating: mean + 0.25 × (max − mean)', () => {
        expect(partyRating([1000, 2000])).toBe(1625);
        expect(partyRating([1500])).toBe(1500);
    });
});

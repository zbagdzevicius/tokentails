import { formatTails, TAILS_DEFINITION, TAILS_NO_CASH_VALUE, TAILS_WORD } from '../copy';

describe('shared copy', () => {
    it('never uses the token spelling', () => {
        [TAILS_WORD, TAILS_DEFINITION, TAILS_NO_CASH_VALUE, formatTails(10)].forEach(text =>
            expect(text).not.toMatch(/\$TAILS|airdrop|\bTGE\b|token/i)
        );
    });

    it('formats amounts with separators and the word Tails', () => {
        expect(formatTails(0)).toBe('0 Tails');
        expect(formatTails(1)).toBe('1 Tails');
        expect(formatTails(1500)).toBe('1,500 Tails');
        expect(formatTails(1234567)).toBe('1,234,567 Tails');
        expect(formatTails(-2500)).toBe('-2,500 Tails');
        expect(formatTails(99.9)).toBe('99 Tails');
        expect(formatTails(1500, { word: false })).toBe('1,500');
    });

    it('shows 0 for non-finite input', () => {
        expect(formatTails(NaN)).toBe('0 Tails');
        expect(formatTails(Infinity)).toBe('0 Tails');
    });

    it('carries the G5 definition and small print verbatim', () => {
        expect(TAILS_DEFINITION).toBe(
            'Tails are rescue points. Earn them by playing. Give them to a shelter goal to choose what we fund next.'
        );
        expect(TAILS_NO_CASH_VALUE).toBe("Tails have no cash value. You can't buy, sell or withdraw them.");
    });
});

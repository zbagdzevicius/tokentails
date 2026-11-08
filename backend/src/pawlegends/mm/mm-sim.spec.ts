import { CASUAL_RATES, RATES, casualVerdict, simulate, simulateCasual, verdict } from '../../../test/mm-sim';

/* The queue simulation as a gate (M1A-IMPL.md §9.5): p50 <= 15 s and p95 <= 30.5 s at every rate. */

describe('mm queue simulation', () => {
    it('meets the wait targets at every arrival rate', () => {
        const results = RATES.map(r => simulate(r));
        expect(verdict(results)).toEqual([]);
        for (const r of results) expect(r.max).toBeLessThanOrEqual(30_500);
    });

    it('casual PvP: every search seated by 45 s, p50 < 30 s from 6/min, >= 4 humans and fair matches when busy', () => {
        const results = CASUAL_RATES.map(r => simulateCasual(r, 1));
        expect(casualVerdict(results)).toEqual([]);
    });
});

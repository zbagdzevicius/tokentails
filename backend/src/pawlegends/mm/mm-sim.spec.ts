import { RATES, simulate, verdict } from '../../../test/mm-sim';

/* The queue simulation as a gate (M1A-IMPL.md §9.5): p50 <= 15 s and p95 <= 30.5 s at every rate. */

describe('mm queue simulation', () => {
    it('meets the wait targets at every arrival rate', () => {
        const results = RATES.map(r => simulate(r));
        expect(verdict(results)).toEqual([]);
        for (const r of results) expect(r.max).toBeLessThanOrEqual(30_500);
    });
});

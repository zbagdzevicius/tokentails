import { normalizeProgressArrays, progressOpsUpdate } from '../utils/live-game';

// Review 3b findings 5 and 6: the read-then-repair step in the recomputes must never write a
// whole array computed from a read (a concurrent save would be lost) and must not create arrays
// no request has written.
describe('normalizeProgressArrays (per-slot repairs only)', () => {
    const ALL = ['catnipChaosCleared', 'seasonEventCleared', 'match3Cleared', 'heistScore', 'heistStars'];

    it('writes nothing for missing or null fields (finding 6)', () => {
        const { values, ops } = normalizeProgressArrays({ heistStars: null }, ALL);
        expect(progressOpsUpdate(ops)).toEqual({});
        expect(values.heistScore).toEqual(Array(8).fill(0));
        expect(values.catnipChaosCleared).toHaveLength(97);
    });

    it('fills the null padding of a dotted $max with per-slot $max 0, never a whole-array $set (finding 5)', () => {
        const padded = [null, null, 1];
        const { ops } = normalizeProgressArrays({ match3Cleared: padded, heistScore: [null, 120] }, ALL);
        const update = progressOpsUpdate(ops);
        expect(update.$set).toBeUndefined();
        expect(update.$max).toMatchObject({ 'match3Cleared.0': 0, 'match3Cleared.1': 0, 'heistScore.0': 0 });
        // A missing tail slot is padded too, and a slot that already holds the right value is untouched.
        expect(update.$max['match3Cleared.29']).toBe(0);
        expect(update.$max['match3Cleared.2']).toBeUndefined();
        expect(update.$max['heistScore.1']).toBeUndefined();
    });

    it('caps with $min, masks stars with $bit and only $sets a non-numeric slot', () => {
        const chaos = Array(97).fill(0);
        chaos[0] = 1; // INFINITE is never cleared
        chaos[3] = 7;
        const { ops } = normalizeProgressArrays(
            { catnipChaosCleared: chaos, heistStars: [15, 'x', 0, 0, 0, 0, 0, 0] },
            ['catnipChaosCleared', 'heistStars']
        );
        const update = progressOpsUpdate(ops);
        expect(update.$min).toEqual({ 'catnipChaosCleared.0': 0, 'catnipChaosCleared.3': 1 });
        expect(update.$bit).toEqual({ 'heistStars.0': { and: expect.any(Number) } });
        expect(update.$set).toEqual({ 'heistStars.1': 0 });
    });

    it('replaces a legacy object-shaped value whole (the one case)', () => {
        const { ops } = normalizeProgressArrays({ heistScore: { '3': 50 } }, ['heistScore']);
        expect(Object.keys(progressOpsUpdate(ops))).toEqual(['$set']);
        expect(ops.$set.heistScore).toHaveLength(8);
    });
});

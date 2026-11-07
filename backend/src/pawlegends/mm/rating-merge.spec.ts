import { mergeRating, ratingModelBesides, type RatingMergeModel } from './rating-merge';
import type { MmRatingRow } from './rating.schema';

/* Guest merge of the hidden rating (M1A-IMPL.md §4.2): a re-key; the lower-RD row survives under the target. */

class FakeRatings implements RatingMergeModel {
    rows = new Map<string, any>();
    findById(id: string) {
        return { lean: async () => (this.rows.has(id) ? { ...this.rows.get(id) } : null) };
    }
    async replaceOne(filter: Record<string, unknown>, doc: Record<string, unknown>) {
        this.rows.set(String(filter._id), { ...doc });
    }
    async deleteOne(filter: Record<string, unknown>) {
        this.rows.delete(String(filter._id));
    }
}

const row = (accountId: string, rd: number, games: number, r = 1500): MmRatingRow => ({
    _id: `${accountId}:coop`,
    accountId,
    queue: 'coop',
    r,
    rd,
    sigma: 0.06,
    games,
    wins: 0,
    lastAt: null,
    appliedRooms: [],
    v: 1,
});

describe('mergeRating', () => {
    it('the guest row with the lower RD moves to the target account', async () => {
        const m = new FakeRatings();
        m.rows.set('g:coop', row('g', 80, 30, 1700));
        m.rows.set('t:coop', row('t', 200, 3, 1400));
        expect(await mergeRating(m, 'g', 't')).toBe('guest');
        expect(m.rows.has('g:coop')).toBe(false);
        expect(m.rows.get('t:coop')).toMatchObject({ _id: 't:coop', accountId: 't', r: 1700, rd: 80 });
    });

    it("the target's own row stays when its RD is lower (ties: more games); the guest row is deleted", async () => {
        const m = new FakeRatings();
        m.rows.set('g:coop', row('g', 120, 9, 1700));
        m.rows.set('t:coop', row('t', 120, 10, 1400));
        expect(await mergeRating(m, 'g', 't')).toBe('target');
        expect(m.rows.get('t:coop').r).toBe(1400);
        expect(m.rows.has('g:coop')).toBe(false);
        // idempotent: nothing left to merge
        expect(await mergeRating(m, 'g', 't')).toBeNull();
    });

    it('a target without a row takes the guest row; the model is found next to the user model', async () => {
        const m = new FakeRatings();
        m.rows.set('g:coop', row('g', 300, 1));
        expect(await mergeRating(m, 'g', 't')).toBe('guest');
        expect(m.rows.get('t:coop').accountId).toBe('t');
        expect(ratingModelBesides({ db: { models: { PawlegendsRating: m } } })).toBe(m);
        expect(ratingModelBesides({})).toBeNull();
    });
});

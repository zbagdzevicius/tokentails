import { rankedJoinSource } from './ranked-join';
import { RANKED_MIN_MATCHES } from './tiers';

/* What `mm.join ranked` reads in production (§7.11: always open): saved matches, unsettled ranked rooms. */

const NOW = new Date('2026-11-20T12:00:00Z');

function rooms(found: Array<{ _id: string }>) {
    const seen: Record<string, unknown>[] = [];
    const q = (filter: Record<string, unknown>) => {
        seen.push(filter);
        const chain = { select: () => chain, limit: () => chain, lean: async () => found };
        return chain;
    };
    return { find: q, seen };
}

describe('rankedJoinSource', () => {
    it('below the saved matches: mm_ranked_matches with have and need', async () => {
        const src = rankedJoinSource({
            played: async () => ({ matches: 3, top: 'easy' }),
            rooms: null,
            ratings: null,
        });
        expect(await src.check('a')).toEqual({ code: 'mm_ranked_matches', have: 3, need: RANKED_MIN_MATCHES });
    });

    it('an ended ranked room not applied to the ranked row: mm_ranked_pending (applied rooms excluded)', async () => {
        const r = rooms([{ _id: 'room-9' }]);
        const src = rankedJoinSource({
            played: async () => ({ matches: 40, top: 'hard' }),
            rooms: r,
            ratings: { findById: () => ({ lean: async () => ({ appliedRooms: ['room-1'] }) }) },
            now: () => NOW,
        });
        expect(await src.check('a')).toEqual({ code: 'mm_ranked_pending', rooms: ['room-9'] });
        expect(r.seen[0]).toMatchObject({ queue: 'ranked', _id: { $nin: ['room-1'] } });
        const clean = rankedJoinSource({
            played: async () => ({ matches: 40, top: 'hard' }),
            rooms: rooms([]),
            ratings: null,
            now: () => NOW,
        });
        expect(await clean.check('a')).toBeNull();
    });

    it('tier (§7.13 draft): the placed tier this season, null in placements, another season or no row', async () => {
        const src = (row: unknown) =>
            rankedJoinSource({
                played: async () => ({ matches: 40, top: 'hard' }),
                rooms: null,
                ratings: { findById: () => ({ lean: async () => row }) },
            });
        expect(await src({ season: 's1', tierIdx: 4, placementsLeft: 0 }).tier!('a')).toBe(4);
        expect(await src({ season: 's1', tierIdx: 0, placementsLeft: 2 }).tier!('a')).toBeNull();
        expect(await src({ season: 's0', tierIdx: 9, placementsLeft: 0 }).tier!('a')).toBeNull();
        expect(await src(null).tier!('a')).toBeNull();
    });
});

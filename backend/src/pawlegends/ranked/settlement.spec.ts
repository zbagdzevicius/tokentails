import { pendingRoomsFilter, RANKED_PENDING_MS, rankedSettleCheck } from './settlement';
import type { MmRoomRecord } from '../mm/mm-room.schema';

/* Ranked settlement (gap plan P4, SOCIAL-RANKED.md §7.6–§7.7): pure checks shared by mm.join, ranked/me and /live. */

const NOW = new Date('2026-11-20T12:00:00Z');
const member = (slot: number, accountId: string | null, over: Record<string, unknown> = {}) => ({
    slot,
    identityHash: `h${slot}`,
    accountId,
    joinedTick: 0,
    backfill: false,
    ratingAtStart: null,
    ...over,
});
const room = (over: Partial<MmRoomRecord> = {}) =>
    ({
        queue: 'ranked',
        season: 's1',
        endedAt: NOW,
        void: null,
        members: [member(0, 'acc'), member(3, 'foe')],
        ...over,
    } as Pick<MmRoomRecord, 'queue' | 'endedAt' | 'void' | 'members' | 'map' | 'season'>);

describe('rankedSettleCheck', () => {
    it('accepts an ended ranked 3v3 room of a known season that seats the account at the slot', () => {
        expect(rankedSettleCheck(room(), 'acc', 0)).toEqual({ ok: true, season: 's1' });
    });

    it.each([
        ['no record', null, 'not_ranked'],
        ['a casual room', room({ queue: 'casual' }), 'not_ranked'],
        ['not ended', room({ endedAt: null }), 'not_ended'],
        ['a remake', room({ void: 'remake' }), 'voided'],
        ['Hearthwood', room({ map: 'hearthwood' }), 'map'],
        ['no season', room({ season: undefined }), 'season'],
        ['an unknown season', room({ season: 's99' }), 'season'],
    ])('refuses %s', (_label, rec, why) => {
        expect(rankedSettleCheck(rec as never, 'acc', 0)).toEqual({ ok: false, why });
    });

    it('refuses another slot, another account and a backfilled seat', () => {
        expect(rankedSettleCheck(room(), 'acc', 3)).toEqual({ ok: false, why: 'not_member' });
        expect(rankedSettleCheck(room(), 'someone', 0)).toEqual({ ok: false, why: 'not_member' });
        expect(rankedSettleCheck(room({ members: [member(0, 'acc', { backfill: true })] }), 'acc', 0)).toEqual({
            ok: false,
            why: 'backfill',
        });
    });
});

describe('pendingRoomsFilter', () => {
    it('ended ranked rooms of the last day, not remade, seated to the end, not yet applied', () => {
        expect(pendingRoomsFilter('acc', ['r1'], NOW)).toEqual({
            queue: 'ranked',
            endedAt: { $gte: new Date(NOW.getTime() - RANKED_PENDING_MS) },
            void: { $ne: 'remake' },
            members: { $elemMatch: { accountId: 'acc', event: null, backfill: { $ne: true } } },
            _id: { $nin: ['r1'] },
        });
        expect(pendingRoomsFilter('acc', [], NOW)._id).toBeUndefined();
    });
});

import type { MmRoomMember, MmRoomRecord } from './mm-room.schema';
import { APPLIED_ROOMS, coopRatingStep } from './rating-update';
import type { MmRatingRow } from './rating.schema';

/* The co-op rating step (M1A-IMPL.md §4.2): pure. */

const NOW = Date.parse('2026-11-12T12:00:00Z');

function room(members: Partial<MmRoomMember>[], id = 'room1'): MmRoomRecord {
    return {
        _id: id,
        queue: 'coop',
        region: 'eu',
        side: 'cat',
        difficulty: 'normal',
        sim: '14:x',
        fill: [],
        queueMs: {},
        members: members.map((m, i) => ({
            slot: i,
            identityHash: `h${i}`,
            accountId: `a${i}`,
            joinedTick: 0,
            backfill: false,
            ratingAtStart: { r: 1500, rd: 300, sigma: 0.06 },
            ...m,
        })),
        createdAt: new Date(NOW),
    };
}

const row = (over: Partial<MmRatingRow> = {}): MmRatingRow => ({
    _id: 'a0:coop',
    accountId: 'a0',
    queue: 'coop',
    r: 1500,
    rd: 120,
    sigma: 0.06,
    games: 4,
    wins: 2,
    lastAt: new Date(NOW - 86_400_000),
    appliedRooms: [],
    v: 3,
    ...over,
});

const step = (r: MmRoomRecord, acc: string, outcome: 'won' | 'lost', existing: MmRatingRow | null) =>
    coopRatingStep({ room: r, accountId: acc, outcome, difficulty: 'normal', row: existing, nowMs: NOW });

describe('coop rating step', () => {
    it('a win moves the row up, a loss down; games, wins, appliedRooms and v follow', () => {
        const won = step(room([{}, {}]), 'a0', 'won', row()).row!;
        expect(won.r).toBeGreaterThan(1500);
        expect(won).toMatchObject({ games: 5, wins: 3, v: 4, appliedRooms: ['room1'], _id: 'a0:coop' });
        const lost = step(room([{}, {}]), 'a0', 'lost', row()).row!;
        expect(lost.r).toBeLessThan(1500);
        expect(lost.wins).toBe(2);
    });

    it('a new account starts from its ratingAtStart (the hint seed)', () => {
        const r = step(room([{ ratingAtStart: { r: 1150, rd: 300, sigma: 0.06 } }]), 'a0', 'won', null).row!;
        expect(r.r).toBeGreaterThan(1150);
        expect(r.games).toBe(1);
        expect(r.v).toBe(1);
    });

    it("a backfiller's loss changes nothing; a backfiller's win counts", () => {
        const r = room([{}, { accountId: 'a0', slot: 1, backfill: true, joinedTick: 1200 }]);
        r.members[0].accountId = 'other';
        expect(step(r, 'a0', 'lost', row()).skip).toBe('backfill_loss');
        expect(step(r, 'a0', 'won', row()).row).toBeDefined();
    });

    it('loss forgiveness: a teammate left or went AFK before tick 9,000', () => {
        expect(step(room([{}, { event: 'left', eventTick: 3000 }]), 'a0', 'lost', row()).skip).toBe('forgiven');
        expect(step(room([{}, { event: 'afk', eventTick: 0 }]), 'a0', 'lost', row()).skip).toBe('forgiven');
        expect(step(room([{}, { event: 'left', eventTick: 9500 }]), 'a0', 'lost', row()).row).toBeDefined();
        // the leaver's own loss still counts
        expect(step(room([{ event: 'left', eventTick: 100 }, {}]), 'a0', 'lost', row()).row).toBeDefined();
    });

    it('a room already applied is a no-op; appliedRooms keeps the last 50', () => {
        expect(step(room([{}]), 'a0', 'won', row({ appliedRooms: ['room1'] })).skip).toBe('applied');
        const many = Array.from({ length: APPLIED_ROOMS }, (_, i) => `old${i}`);
        const r = step(room([{}]), 'a0', 'won', row({ appliedRooms: many })).row!;
        expect(r.appliedRooms).toHaveLength(APPLIED_ROOMS);
        expect(r.appliedRooms[APPLIED_ROOMS - 1]).toBe('room1');
        expect(r.appliedRooms[0]).toBe('old1');
        expect(step(room([{}]), 'nobody', 'won', null).skip).toBe('not_member');
    });
});

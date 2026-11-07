import { leaverStatus, roomEvents } from './leaver';
import type { MmRoomMember, MmRoomRecord } from './mm-room.schema';

/* The light leaver ladder (M1A-IMPL.md §4.3, §4.4): pure, from the identity's own mm room records. */

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-12T12:00:00Z');
let n = 0;

function rec(daysAgo: number, event?: 'left' | 'afk', hash = 'me'): MmRoomRecord {
    const at = new Date(NOW - daysAgo * DAY);
    return {
        _id: `r${++n}`,
        queue: 'coop',
        region: 'eu',
        side: 'cat',
        difficulty: 'easy',
        sim: '14:x',
        fill: [],
        queueMs: {},
        members: [
            {
                slot: 0,
                identityHash: hash,
                accountId: null,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: null,
                ...(event ? { event, eventTick: 100 } : {}),
            },
            {
                slot: 1,
                identityHash: 'other',
                accountId: null,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: null,
                event: 'left',
                eventTick: 1,
            },
        ],
        createdAt: at,
        endedAt: at,
    };
}

describe('leaver ladder', () => {
    it('1 event warns, 2 wait 60 s, 3 or more wait 3 min; only the last 7 days count', () => {
        expect(leaverStatus('me', [rec(1)], NOW)).toEqual({ events: 0, level: 0, waitMs: 0 });
        expect(leaverStatus('me', [rec(1, 'left')], NOW)).toMatchObject({ level: 1, waitMs: 0 });
        expect(leaverStatus('me', [rec(2, 'left'), rec(1, 'afk')], NOW)).toMatchObject({ level: 2, waitMs: 60_000 });
        expect(
            leaverStatus('me', [rec(3, 'left'), rec(2, 'left'), rec(1, 'afk'), rec(0.5, 'left')], NOW)
        ).toMatchObject({
            level: 3,
            waitMs: 180_000,
        });
        expect(leaverStatus('me', [rec(8, 'left'), rec(9, 'left')], NOW).level).toBe(0);
        // another member's events are not mine
        expect(leaverStatus('other2', [rec(1, 'left')], NOW).level).toBe(0);
    });

    it('every 5 clean matches erase the oldest event', () => {
        const rooms = [rec(3, 'left'), rec(2.9, 'left'), rec(2.5), rec(2.4), rec(2.3), rec(2.2), rec(2.1)];
        expect(leaverStatus('me', rooms, NOW).events).toBe(1);
        expect(leaverStatus('me', rooms.slice(0, 6), NOW).events).toBe(2);
    });

    it('an IP-keyed identity (no hash) gets no ladder; the function is pure', () => {
        const rooms = [rec(1, 'left'), rec(1, 'left'), rec(1, 'left')];
        expect(leaverStatus(null, rooms, NOW).level).toBe(0);
        const copy = JSON.stringify(rooms);
        leaverStatus('me', rooms, NOW);
        expect(JSON.stringify(rooms)).toBe(copy);
    });

    it('events at the end: a leave, offline for the last 180 s, AFK over 35 %; a reconnected drop is not one', () => {
        const members: MmRoomMember[] = [0, 1, 2].map(slot => ({
            slot,
            identityHash: `h${slot}`,
            accountId: null,
            joinedTick: 0,
            backfill: false,
            ratingAtStart: null,
        }));
        const end = 9000;
        const endMs = 1_000_000;
        const out = roomEvents(
            members,
            [
                { slot: 0, left: true, leftTick: 1200, offSinceMs: null, pilotTicks: {} },
                { slot: 1, left: false, offSinceMs: endMs - 200_000, pilotTicks: {} },
                { slot: 2, left: false, offSinceMs: null, pilotTicks: { drop: 2000, afk: 1500 } },
            ],
            end,
            endMs,
            1000 / 30
        );
        expect(out[0]).toMatchObject({ event: 'left', eventTick: 1200 });
        expect(out[1].event).toBe('left');
        expect(out[2].event).toBe('afk');
        const fine = roomEvents(
            members,
            [{ slot: 0, left: false, offSinceMs: endMs - 10_000, pilotTicks: { drop: 300 } }],
            end,
            endMs,
            1000 / 30
        );
        expect(fine[0].event).toBeUndefined();
        expect(members[0].event).toBeUndefined();
    });
});

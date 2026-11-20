import { backfilledDrop, leaverStatus, roomEvents, waitStart } from './leaver';
import type { MmRoomMember, MmRoomRecord } from './mm-room.schema';

/* The light leaver ladder (M1A-IMPL.md §4.3, §4.4): pure, from the identity's own mm room records. */

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-12T12:00:00Z');
let n = 0;

function rec(daysAgo: number, event?: 'left' | 'afk' | 'dropped', hash = 'me'): MmRoomRecord {
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
                { slot: 2, left: false, offSinceMs: null, pilotTicks: { away: 2000, afk: 1500 } },
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

    it("graceful (founder, 2026-11-20): a seat freed for the same player's new search is dropped; drop ticks are no AFK", () => {
        const members: MmRoomMember[] = [0, 1].map(slot => ({
            slot,
            identityHash: `h${slot}`,
            accountId: null,
            joinedTick: 0,
            backfill: false,
            ratingAtStart: null,
        }));
        const out = roomEvents(
            members,
            [
                { slot: 0, left: true, dropped: true, leftTick: 500, offSinceMs: null, pilotTicks: {} },
                // a crash for most of a short match, then back: not AFK
                { slot: 1, left: false, offSinceMs: null, pilotTicks: { drop: 6000 } },
            ],
            9000,
            1_000_000,
            1000 / 30
        );
        expect(out[0]).toMatchObject({ event: 'dropped', eventTick: 500 });
        expect(out[1].event).toBeUndefined();
    });

    it('a dropped row is neither an event nor a clean match', () => {
        expect(leaverStatus('me', [rec(2, 'left'), rec(1, 'dropped'), rec(0.5, 'dropped')], NOW)).toMatchObject({
            events: 1,
            level: 1,
        });
        const rooms = [rec(3, 'left'), rec(2.9, 'left'), rec(2.5), rec(2.4), rec(2.3), rec(2.2), rec(2.15, 'dropped')];
        expect(leaverStatus('me', rooms, NOW).events).toBe(2);
    });

    it('a backfilled drop is left only when the player never came back and was offline for the last 180 s', () => {
        expect(backfilledDrop(NOW - 200_000, false, NOW)).toBe('left');
        expect(backfilledDrop(NOW - 200_000, true, NOW)).toBe('dropped');
        expect(backfilledDrop(NOW - 60_000, false, NOW)).toBe('dropped');
    });

    it('the wait anchor: kept while it runs and for an hour after, taken by a later match, else a new one', () => {
        const rooms = [rec(2, 'left'), rec(1, 'left')];
        const st = leaverStatus('me', rooms, NOW);
        expect(st).toMatchObject({ level: 2, waitMs: 60_000, anchor: { room: rooms[1]._id, waitFromMs: null } });
        expect(waitStart(st, NOW)).toBeNull(); // not anchored yet
        rooms[1].members[0].waitFromMs = NOW - 20_000;
        const running = leaverStatus('me', rooms, NOW);
        expect(waitStart(running, NOW)).toBe(NOW - 20_000);
        expect(waitStart(running, NOW - 20_000 + 60_000 + 3_599_000)).toBe(NOW - 20_000);
        expect(waitStart(running, NOW - 20_000 + 60_000 + 3_600_000)).toBeNull();
        // a match after the wait started took it: the next search owes a new wait
        const later = { ...rec(0, undefined), createdAt: new Date(NOW + 70_000), endedAt: null };
        expect(waitStart(leaverStatus('me', [...rooms, later], NOW + 80_000), NOW + 80_000)).toBeNull();
    });
});

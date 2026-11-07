import { decodeTurnBody } from '../party/net';
import { Room, type RoomIO } from '../party/room';

/* Room.reopen (M1A-IMPL.md §5.4): the backfill seat. */

function setup() {
    const io: RoomIO = {
        turn: (_f, body) => void decodeTurnBody(body),
        json: () => undefined,
        catchup: () => undefined,
    };
    const room = new Room(
        { id: 'r', humans: [0, 1], occupied: [0, 1], difficulty: 'normal', forfeitFrom: 0, nowMs: 0, startMs: 1000 },
        io
    );
    for (const s of [0, 1]) {
        room.connect(s, 0);
        room.loaded(s);
    }
    return room;
}

function run(room: Room, fromMs: number, toMs: number, beatSlots: number[]) {
    for (let t = fromMs; t <= toMs; t += 10) {
        if (t % 400 === 0) for (const s of beatSlots) room.beat(s, room.nextTurn, t);
        room.advance(t);
    }
}

describe('Room.reopen', () => {
    it("moves the earlier holder's AFK-reason ticks to `before` and makes the seat claimable", () => {
        const room = setup();
        run(room, 0, 1500, [0, 1]);
        room.disconnect(1, 1500);
        run(room, 1510, 4000, [0]);
        const drop = room.slots[1].pilotTicks.drop;
        expect(drop).toBeGreaterThan(0);
        expect(room.reopen(1, 4000)).toBe(true);
        expect(room.slots[1]).toMatchObject({ occupied: false, reason: 'open', connected: false, loaded: false });
        expect(room.slots[1].pilotTicks.drop).toBe(0);
        expect(room.slots[1].pilotTicks.before).toBe(drop);
        room.connect(1, 4000);
        expect(room.slots[1]).toMatchObject({ occupied: true, reason: 'late' });
        // a human seat (still played) is never reopened
        expect(room.reopen(0, 4000)).toBe(false);
    });

    it('the S5 flag never fires for a seat reopened and claimed after tick 1,800', () => {
        const room = setup();
        run(room, 0, 1500, [0, 1]);
        room.vacate(1, 1500, false);
        // past tick 1,800 (60 s of room time)
        run(room, 1510, 1000 + 61_000, [0]);
        expect(room.tick).toBeGreaterThan(1800);
        expect(room.reopen(1, 62_000)).toBe(true);
        room.connect(1, 62_000);
        run(room, 62_010, 63_000, [0, 1]);
        expect(room.openUnclaimedAt1800).toBe(false);
    });
});

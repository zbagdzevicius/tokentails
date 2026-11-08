import { CMD_OP, decodeTurnBody, encodeTurnBody, type TurnFrame } from './net';
import { TURN_MS } from './party-limits';
import { REMAKE, Room, type RoomIO } from './room';

/* Casual PvP rooms (docs/plans/moba/V16.md §4.2, §4.6): six human slots, team-scoped votes, a remake that voids. */

const move = (x: number) => new Uint8Array([CMD_OP.Move, x & 0xff, 0, 40, 0]);
const ping = () => new Uint8Array([CMD_OP.Ping, 0, 10, 0, 10, 0, 255]);

function setup(opts: { humans?: number[]; occupied?: number[]; pvp?: boolean; premade?: number[][] } = {}) {
    const turns: TurnFrame[] = [];
    const json: { slot: number | null; msg: Record<string, unknown> }[] = [];
    const io: RoomIO = {
        turn: (_f, body) => turns.push(decodeTurnBody(body)),
        json: (slot, msg) => json.push({ slot, msg }),
        catchup: () => undefined,
    };
    const humans = opts.humans ?? [0, 1, 3, 4];
    const room = new Room(
        {
            id: 'pvp1',
            humans,
            occupied: opts.occupied ?? humans,
            difficulty: 'hard',
            forfeitFrom: 7200,
            nowMs: 0,
            startMs: 1000,
            pvp: opts.pvp ?? true,
            premade: opts.premade,
        },
        io
    );
    for (const s of opts.occupied ?? humans) {
        room.connect(s, 0);
        room.loaded(s);
    }
    return { room, turns, json };
}

/** Advance to `toMs` in 10 ms steps, every connected slot beating and acting (no AFK). */
function run(room: Room, fromMs: number, toMs: number) {
    let seq = 1000;
    for (let t = fromMs; t <= toMs; t += 10) {
        if (t % 400 === 0)
            for (const s of room.slots)
                if (s.connected) {
                    room.beat(s.slot, room.nextTurn, t);
                    if (s.mode === 'human') room.intake(s.slot, ++seq + s.slot * 100_000, move(t & 0xff), t);
                }
        room.advance(t);
    }
}

const msAt = (tick: number) => Math.ceil((1000 + (tick / 2) * TURN_MS) / 10) * 10 + 10;

describe('casual PvP room', () => {
    it('six slots: mode bits and acks above slot 2 ride the TURN, and a co-op TURN keeps its bytes', () => {
        const { room, turns } = setup({ humans: [0, 3, 5], occupied: [0, 3] });
        room.advance(1000);
        expect(room.intake(3, 1, move(9), 1001)).toBe('ok');
        room.advance(1000 + TURN_MS + 1);
        const t = turns[0];
        // slot 5 is an open seat (a pilot flies it): bit 5 set
        expect((t.modeMask >> 5) & 1).toBe(1);
        expect(t.acks[3]).toBe(1);
        expect(t.entries.map(e => e.slot)).toEqual([3]);
        // a co-op turn (slots 0..2 only) encodes as it always did: mode and ack masks <= 0x07
        const body = encodeTurnBody({ turn: 4, modeMask: 0b011, acks: [5, undefined, 2], entries: [] });
        expect(Array.from(body)).toEqual([4, 3, 0b101, 5, 2, 0]);
    });

    it('takes a Ping from slot 3 (team 1 lead) in PvP only; never from 4, and never a Forfeit from a client', () => {
        const pvp = setup();
        pvp.room.advance(1000);
        expect(pvp.room.intake(3, 1, ping(), 1001)).toBe('ok');
        expect(pvp.room.intake(4, 1, ping(), 1001)).toBe('bad_op');
        expect(pvp.room.intake(0, 1, new Uint8Array([CMD_OP.Forfeit]), 1001)).toBe('bad_op');
        const coop = setup({ humans: [0, 1, 2], pvp: false });
        coop.room.advance(1000);
        // in a co-op room slot 3 is not a human seat at all
        expect(coop.room.intake(3, 1, ping(), 1001)).toBe('not_human');
        expect(coop.room.intake(1, 1, ping(), 1001)).toBe('bad_op');
    });

    it('surrender is per team: from 4:00, 2 of 3 (all when fewer), sent to that team only, Forfeit into slot 3', () => {
        const { room, json, turns } = setup();
        run(room, 0, msAt(7200));
        expect(room.tick).toBeGreaterThanOrEqual(7200);
        const now = msAt(7200) + 1;
        expect(room.castVote(3, 'surrender', true, now)).toBe(true);
        const open = json.filter(j => j.msg.t === 'vote' && j.msg.need === 2);
        // the vote frame reaches team 1's seats (3 and 4) only, with its team
        expect(open.map(j => j.slot).sort()).toEqual([3, 4]);
        expect(open[0].msg.team).toBe(1);
        expect(room.castVote(4, 'surrender', true, now + 10)).toBe(true);
        expect(json.some(j => j.msg.result === 'pass' && j.slot === 3)).toBe(true);
        expect(json.some(j => j.msg.t === 'vote' && (j.slot === 0 || j.slot === 1))).toBe(false);
        run(room, now + 10, now + 300);
        const forfeit = turns.flatMap(t => t.entries).filter(e => e.cmd[0] === CMD_OP.Forfeit);
        expect(forfeit.map(e => e.slot)).toEqual([3]);
        // team 0 may still vote its own surrender (independent)
        expect(room.castVote(0, 'surrender', true, now + 400)).toBe(true);
    });

    it('never pauses a PvP room', () => {
        const { room } = setup();
        run(room, 0, 2000);
        expect(room.castVote(0, 'pause', true, 2001)).toBe(false);
    });

    it('remake: a team that lost a seat votes from 1:00 to 3:00; a pass voids the room for everyone', () => {
        const { room, json } = setup({ humans: [0, 1, 3, 4] });
        run(room, 0, 2000);
        // slot 4 leaves at 0:01
        room.vacate(4, 2000, false);
        expect(room.remakeOpen(1)).toBe(false); // before 1:00
        run(room, 2000, msAt(REMAKE.fromTick));
        expect(room.remakeOpen(1)).toBe(true);
        expect(room.remakeOpen(0)).toBe(false); // team 0 lost nobody
        expect(room.castVote(0, 'remake', true, msAt(REMAKE.fromTick) + 1)).toBe(false);
        // team 1's one remaining human is all it takes
        expect(room.castVote(3, 'remake', true, msAt(REMAKE.fromTick) + 1)).toBe(true);
        expect(room.voided).toBe('remake');
        expect(room.status).toBe('abandoned');
        expect(json.find(j => j.msg.t === 'void')).toEqual({ slot: null, msg: { t: 'void', reason: 'remake' } });
    });

    it('remake: a teammate who loaded and lost the connection counts after 60 s offline, like one who left', () => {
        const { room } = setup({ humans: [0, 1, 3, 4] });
        run(room, 0, 1000);
        room.disconnect(4, 1000);
        run(room, 1000, msAt(REMAKE.fromTick));
        const at = msAt(REMAKE.fromTick) + 1;
        expect(at - 1000).toBeGreaterThanOrEqual(REMAKE.offlineMs);
        expect(room.remakeOpen(1, at)).toBe(true);
        // a fresh drop does not (yet)
        const fresh = setup({ humans: [0, 1, 3, 4] });
        run(fresh.room, 0, msAt(REMAKE.fromTick) - 30_000);
        fresh.room.disconnect(4, msAt(REMAKE.fromTick) - 30_000);
        run(fresh.room, msAt(REMAKE.fromTick) - 30_000, msAt(REMAKE.fromTick));
        expect(fresh.room.remakeOpen(1, msAt(REMAKE.fromTick) + 1)).toBe(false);
        expect(fresh.room.castVote(3, 'remake', true, msAt(REMAKE.fromTick) + 1)).toBe(false);
        // the reconnect closes it again
        room.connect(4, at);
        expect(room.remakeOpen(1, at + 1)).toBe(false);
    });

    it('remake: a pre-made duo cannot erase its own match (one leaves, the other votes)', () => {
        const { room } = setup({ humans: [0, 1, 3, 4], premade: [[3, 4]] });
        run(room, 0, 2000);
        room.vacate(4, 2000, false);
        run(room, 2000, msAt(REMAKE.fromTick));
        expect(room.remakeOpen(1, msAt(REMAKE.fromTick) + 1)).toBe(false);
        expect(room.castVote(3, 'remake', true, msAt(REMAKE.fromTick) + 1)).toBe(false);
        expect(room.voided).toBeNull();
        // a solo teammate (3) of a duo leaver (4 of 4+5) still may: 3 was not in that party
        const solo = setup({ humans: [0, 1, 3, 4, 5], premade: [[4, 5]] });
        run(solo.room, 0, 2000);
        solo.room.vacate(4, 2000, false);
        run(solo.room, 2000, msAt(REMAKE.fromTick));
        expect(solo.room.remakeOpen(1, msAt(REMAKE.fromTick) + 1)).toBe(true);
    });

    it('no remake after 3:00', () => {
        const { room } = setup({ humans: [0, 3] });
        run(room, 0, 2000);
        room.vacate(3, 2000, false);
        run(room, 2000, msAt(REMAKE.untilTick));
        expect(room.remakeOpen(1)).toBe(false);
    });
});

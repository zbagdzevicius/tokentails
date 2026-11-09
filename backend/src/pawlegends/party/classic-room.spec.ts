import { CMD_OP, decodeTurnBody, encodeTurnBody, type TurnEntry, type TurnFrame } from './net';
import { TURN_MS } from './party-limits';
import { RefereeRoom, liveSim, type RefereeConfig } from './referee-core';
import { RefereePool, roomUnits } from './referee-pool';
import { Room, type RoomIO } from './room';

/*
 * 5v5 Classic rooms (docs/plans/moba/MAP-5V5.md §9.2): ten seats (team 1 is 5..9, its lead slot 5), a surrender by a
 * majority of five, the referee deciding Hearthwood commands with its own map bound while a Crossing room shares its
 * worker, and the capacity units of a Hearthwood room.
 */

const sim = liveSim();
const move = (qx: number, qy: number) => new Uint8Array([CMD_OP.Move, qx & 0xff, qx >> 8, qy & 0xff, qy >> 8]);
const ping = () => new Uint8Array([CMD_OP.Ping, 0, 10, 0, 10, 0, 255]);

function room5(humans = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const turns: TurnFrame[] = [];
    const json: { slot: number | null; msg: Record<string, unknown> }[] = [];
    const io: RoomIO = {
        turn: (_f, body) => turns.push(decodeTurnBody(body)),
        json: (slot, msg) => json.push({ slot, msg }),
        catchup: () => undefined,
    };
    const room = new Room(
        {
            id: 'hw1',
            humans,
            occupied: humans,
            difficulty: 'hard',
            forfeitFrom: 7200,
            nowMs: 0,
            startMs: 1000,
            pvp: true,
            teamSize: 5,
        },
        io
    );
    for (const s of humans) {
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
                    if (s.mode === 'human') room.intake(s.slot, ++seq + s.slot * 100_000, move(t & 0xff, 40), t);
                }
        room.advance(t);
    }
}

const msAt = (tick: number) => Math.ceil((1000 + (tick / 2) * TURN_MS) / 10) * 10 + 10;

/** A Hearthwood PvP config: ten seats, five cats then five dogs, every slot human (pilots fly the idle ones). */
function hearthConfig(seed: number): RefereeConfig {
    const cats = sim.HERO_IDS.filter(h => sim.heroSideOf(h) === 'cat');
    const dogs = sim.HERO_IDS.filter(h => sim.heroSideOf(h) === 'dog');
    const seats = Array.from({ length: 10 }, (_, slot) => ({
        slot,
        hero: (slot < 5 ? cats[slot] : dogs[slot - 5]) as never,
        trick: sim.TRICK_IDS[slot % sim.TRICK_IDS.length] as never,
    }));
    const { picks, tricks } = sim.fillPicksParty(seed, seats, 'hearthwood');
    return {
        seed,
        picks,
        tricks,
        difficulty: 'hard',
        humans: seats.map(s => s.slot),
        mode: 'pvp',
        fillDifficulty: ['normal', 'normal'],
        map: 'hearthwood',
    };
}

function crossingConfig(seed: number): RefereeConfig {
    const seats = [{ slot: 0, hero: 'clem' as never, trick: 'pounce' as never }];
    const { picks, tricks } = sim.fillPicksParty(seed, seats);
    return { seed, picks, tricks, difficulty: 'easy', humans: [0] };
}

const body = (turn: number, entries: TurnEntry[], modeMask = 0) =>
    encodeTurnBody({ turn, modeMask, acks: [], entries });

describe('5v5 Classic room and referee', () => {
    it('ten slots; pings from leads 0 and 5 only; slots 8 and 9 ride the TURN', () => {
        const { room, turns } = room5();
        expect(room.slotCount).toBe(10);
        expect(room.slots).toHaveLength(10);
        room.advance(1000);
        expect(room.intake(5, 1, ping(), 1001)).toBe('ok');
        expect(room.intake(3, 1, ping(), 1001)).toBe('bad_op');
        expect(room.intake(9, 1, move(256, 400), 1001)).toBe('ok');
        room.advance(1100);
        const t = turns.find(f => f.entries.some(e => e.slot === 9))!;
        expect(t.entries.map(e => e.slot).sort()).toEqual([5, 9]);
    });

    it('a 3v3 room keeps six slots and slot 3 as team 1 lead', () => {
        const turns: TurnFrame[] = [];
        const room = new Room(
            {
                id: 'c1',
                humans: [0, 3],
                occupied: [0, 3],
                difficulty: 'hard',
                forfeitFrom: 7200,
                nowMs: 0,
                startMs: 1000,
                pvp: true,
            },
            { turn: (_f, b) => turns.push(decodeTurnBody(b)), json: () => undefined, catchup: () => undefined }
        );
        expect(room.slotCount).toBe(6);
        room.connect(3, 0);
        room.loaded(3);
        room.advance(1000);
        expect(room.intake(3, 1, ping(), 1001)).toBe('ok');
    });

    it('a surrender needs 3 of 5 connected teammates, then Forfeit goes into team 1 lead slot 5', () => {
        const { room, turns, json } = room5();
        run(room, 0, msAt(7200));
        const now = msAt(7200) + 1;
        expect(room.castVote(5, 'surrender', true, now)).toBe(true);
        const open = json.filter(j => j.msg.t === 'vote' && j.msg.need === 3);
        // the vote frame reaches team 1's seats (5..9) only
        expect(open.map(j => j.slot).sort()).toEqual([5, 6, 7, 8, 9]);
        expect(room.castVote(6, 'surrender', true, now + 10)).toBe(true);
        expect(json.some(j => j.msg.result === 'pass')).toBe(false);
        expect(room.castVote(7, 'surrender', true, now + 20)).toBe(true);
        expect(json.some(j => j.msg.result === 'pass' && j.slot === 5)).toBe(true);
        run(room, now + 20, now + 300);
        const forfeit = turns.flatMap(f => f.entries).filter(e => e.cmd[0] === CMD_OP.Forfeit);
        expect(forfeit.map(e => e.slot)).toEqual([5]);
    });

    it('the referee decodes a Hearthwood move (y = 100 m) while a Crossing room shares its worker', () => {
        const solo = new RefereeRoom(sim, hearthConfig(7));
        const a = new RefereeRoom(sim, hearthConfig(7));
        // created last: the sim module is bound to Crossing (60 m tall) when room `a` decodes
        const b = new RefereeRoom(sim, crossingConfig(9));
        const far = move(256, 400);
        for (let t = 0; t < 40; t++) {
            const entries: TurnEntry[] = t === 3 ? [{ slot: 9, sub: 0, pilot: false, cmd: far }] : [];
            solo.applyTurn(body(t, entries));
            b.applyTurn(body(t, []));
            a.applyTurn(body(t, entries));
        }
        expect(sim.hash(a.m)).toBe(sim.hash(solo.m));
        // the move was applied: a room without it differs
        const none = new RefereeRoom(sim, hearthConfig(7));
        for (let t = 0; t < 40; t++) none.applyTurn(body(t, []));
        expect(sim.hash(none.m)).not.toBe(sim.hash(a.m));
    });

    it('a Hearthwood room is 3 capacity units and goes to the least-loaded worker', async () => {
        expect(roomUnits({ map: 'hearthwood' })).toBe(3);
        expect(roomUnits({})).toBe(1);
        const pool = new RefereePool({ inline: true });
        try {
            pool.open('r1', sim.PARTY_SINCE, 'x', crossingConfig(1));
            pool.open('r2', sim.PARTY_SINCE, 'x', hearthConfig(2));
            expect(pool.units).toBe(4);
            pool.close('r2');
            expect(pool.units).toBe(1);
        } finally {
            pool.close('r1');
            await pool.shutdown();
        }
    });
});

import { CMD_OP, decodeTurnBody, type TurnFrame } from './net';
import { PARTY_LIMITS, TURN_MS } from './party-limits';
import { Room, type RoomIO } from './room';
import { RoomScheduler, phaseOf } from './room-scheduler';

/* Party play N3 (MULTIPLAYER.md §3.2, §12 N3): the room on a fake clock. */

const move = (x: number) => new Uint8Array([CMD_OP.Move, x & 0xff, 0, 40, 0]);
const stop = () => new Uint8Array([CMD_OP.Stop]);
const cast = () => new Uint8Array([CMD_OP.Cast, 0, 10, 0, 10, 0, 255]);
const ping = () => new Uint8Array([CMD_OP.Ping, 0, 10, 0, 10, 0, 255]);

function setup(opts: { humans?: number[]; occupied?: number[]; forfeitFrom?: number } = {}) {
    const turns: TurnFrame[] = [];
    const json: { slot: number | null; msg: Record<string, unknown> }[] = [];
    const catchups: { slot: number; from: number }[] = [];
    const io: RoomIO = {
        turn: (_f, body) => turns.push(decodeTurnBody(body)),
        json: (slot, msg) => json.push({ slot, msg }),
        catchup: (slot, from) => catchups.push({ slot, from }),
    };
    const humans = opts.humans ?? [0, 1];
    const room = new Room(
        {
            id: 'room1',
            humans,
            occupied: opts.occupied ?? humans,
            difficulty: 'normal',
            forfeitFrom: opts.forfeitFrom ?? 0,
            nowMs: 0,
            startMs: 1000,
        },
        io
    );
    for (const s of opts.occupied ?? humans) {
        room.connect(s, 0);
        room.loaded(s);
    }
    return { room, turns, json, catchups };
}

/** Advance the clock in 10 ms steps, beating every slot every 400 ms (alive clients). */
function run(room: Room, fromMs: number, toMs: number, beat = true) {
    for (let t = fromMs; t <= toMs; t += 10) {
        if (beat && t % 400 === 0) for (const s of room.slots) if (s.connected) room.beat(s.slot, room.nextTurn, t);
        room.advance(t);
    }
}

describe('party room (N3)', () => {
    it('closes a turn every 66.7 ms, and a 300 ms stall closes the 5 overdue turns in order', () => {
        const { room, turns } = setup();
        room.advance(1000);
        expect(room.status).toBe('live');
        room.advance(1000 + TURN_MS * 3 + 1);
        expect(turns.map(t => t.turn)).toEqual([0, 1, 2]);
        // a 333 ms stall (5 turns): the next advance closes all 5, in order
        room.advance(1000 + TURN_MS * 8 + 1);
        expect(turns.map(t => t.turn)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(room.overrunsMs.length).toBe(8);
        expect(Math.max(...room.overrunsMs)).toBeGreaterThan(250);
    });

    it('staggers room phases within one turn', () => {
        const phases = new Set<number>();
        for (let i = 0; i < 200; i++) {
            const p = phaseOf(`room${i}`);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(67);
            phases.add(p);
        }
        expect(phases.size).toBeGreaterThan(40);
    });

    it('places commands: first sub 0, next sub 1, newest replaces sub 1; late commands go to the next turn', () => {
        const { room, turns } = setup();
        room.advance(1000);
        expect(room.intake(1, 1, stop(), 1001)).toBe('ok');
        expect(room.intake(1, 2, cast(), 1002)).toBe('ok');
        expect(room.intake(1, 3, new Uint8Array([CMD_OP.Nap]), 1003)).toBe('ok');
        room.advance(1000 + TURN_MS + 1);
        const t0 = turns[0];
        expect(t0.entries.map(e => [e.slot, e.sub, e.cmd[0]])).toEqual([
            [1, 0, CMD_OP.Stop],
            [1, 1, CMD_OP.Nap],
        ]);
        expect(t0.acks[1]).toBe(3);
        // a command after the close lands in turn 1
        room.intake(1, 4, stop(), 1000 + TURN_MS + 2);
        room.advance(1000 + 2 * TURN_MS + 1);
        expect(turns[1].entries).toHaveLength(1);
    });

    it('drops duplicate sequence numbers, client forfeits, and pings from slots >= 1', () => {
        const { room } = setup();
        room.advance(1000);
        expect(room.intake(0, 5, stop(), 1001)).toBe('ok');
        expect(room.intake(0, 5, stop(), 1002)).toBe('dup');
        expect(room.intake(0, 4, stop(), 1002)).toBe('dup');
        expect(room.intake(0, 6, new Uint8Array([CMD_OP.Forfeit]), 1002)).toBe('bad_op');
        expect(room.intake(1, 1, ping(), 1002)).toBe('bad_op');
        expect(room.intake(0, 7, ping(), 1002)).toBe('ok');
    });

    it('sim v21: accepts Fire (op 11, the Kibble Cannon) from a human seat', () => {
        const { room } = setup();
        room.advance(1000);
        expect(room.intake(0, 1, new Uint8Array([CMD_OP.Fire, 0, 0, 0, 0]), 1001)).toBe('ok');
        expect(room.intake(1, 1, new Uint8Array([CMD_OP.Fire, 10, 0, 10, 0]), 1001)).toBe('ok');
    });

    it('sim v23: accepts Kite (op 12, KITE-FIX) from a human seat; a kite coalesces with a pending move, never dropped', () => {
        const { room, turns } = setup();
        room.advance(1000);
        let dropped = 0;
        for (let i = 1; i <= 30; i++) if (room.intake(1, i, stop(), 1001) === 'dropped') dropped++;
        expect(dropped).toBe(30 - PARTY_LIMITS.cmdBucket.burst);
        expect(room.intake(1, 31, move(31), 1001)).toBe('ok');
        for (let i = 32; i <= 60; i++)
            expect(room.intake(1, i, new Uint8Array([CMD_OP.Kite, i, 0, 10, 0, 7]), 1001)).toBe('ok');
        room.advance(1000 + TURN_MS + 1);
        const walks = turns[0].entries.filter(e => e.cmd[0] === CMD_OP.Move || e.cmd[0] === CMD_OP.Kite);
        expect(walks).toHaveLength(1);
        expect(Array.from(walks[0].cmd)).toEqual([CMD_OP.Kite, 60, 0, 10, 0, 7]);
    });

    it('B4: a Move replaces the pending Move and is never dropped over the budget; others are dropped', () => {
        const { room, turns } = setup();
        room.advance(1000);
        let dropped = 0;
        for (let i = 1; i <= 30; i++) if (room.intake(1, i, stop(), 1001) === 'dropped') dropped++;
        expect(dropped).toBe(30 - PARTY_LIMITS.cmdBucket.burst);
        for (let i = 31; i <= 60; i++) expect(room.intake(1, i, move(i), 1001)).toBe('ok');
        room.advance(1000 + TURN_MS + 1);
        const moves = turns[0].entries.filter(e => e.cmd[0] === CMD_OP.Move);
        expect(moves).toHaveLength(1);
        expect(moves[0].cmd[1]).toBe(60);
    });

    it('surrender: need = connected when <= 2, else 2; refused before forfeitFrom; the forfeit goes into slot 0', () => {
        const { room, turns } = setup({ humans: [0, 1, 2], forfeitFrom: 30 });
        room.advance(1000);
        expect(room.castVote(1, 'surrender', true, 1001)).toBe(false);
        run(room, 1000, 2100);
        expect(room.tick).toBeGreaterThanOrEqual(30);
        expect(room.castVote(1, 'surrender', true, 2101)).toBe(true);
        expect(room.castVote(2, 'surrender', true, 2102)).toBe(true);
        run(room, 2110, 2300);
        const ff = turns.flatMap(t => t.entries).filter(e => e.cmd[0] === CMD_OP.Forfeit);
        expect(ff).toEqual([{ slot: 0, sub: 1, pilot: false, cmd: new Uint8Array([CMD_OP.Forfeit]) }]);
        // a lone human passes at once
        const one = setup({ humans: [0, 1], occupied: [0], forfeitFrom: 2 });
        run(one.room, 1000, 1300);
        expect(one.room.castVote(0, 'surrender', true, 1300)).toBe(true);
        expect(one.json.some(j => j.msg.t === 'vote' && j.msg.result === 'pass')).toBe(true);
    });

    it('pause: stops turns, freezes AFK and silence timers, auto-resumes after 60 s with a countdown', () => {
        const { room, turns, json } = setup();
        run(room, 1000, 2000);
        room.castVote(0, 'pause', true, 2000);
        room.castVote(1, 'pause', true, 2001);
        expect(room.paused).toBe(true);
        const n = turns.length;
        // nobody beats for 50 s: no drop, no AFK while paused
        run(room, 2010, 52_000, false);
        expect(turns.length).toBe(n);
        expect(room.slots[0].mode).toBe('human');
        run(room, 52_010, 2000 + PARTY_LIMITS.pauseMaxMs + PARTY_LIMITS.resumeCountdownMs + 100, true);
        expect(room.paused).toBe(false);
        expect(json.some(j => j.msg.t === 'paused' && j.msg.paused === false)).toBe(true);
        expect(room.slots[0].mode).toBe('human');
        run(room, 66_000, 66_500);
        expect(turns.length).toBeGreaterThan(n);
    });

    it('AFK: a warning at 45 s, pilot at 60 s, any command reclaims', () => {
        const { room, json } = setup();
        run(room, 1000, 1000 + PARTY_LIMITS.afkWarnMs + 100);
        expect(json.some(j => j.slot === 0 && j.msg.t === 'afk')).toBe(true);
        run(room, 1000 + PARTY_LIMITS.afkWarnMs + 110, 1000 + PARTY_LIMITS.afkPilotMs + 100);
        expect(room.slots[0]).toMatchObject({ mode: 'pilot', reason: 'afk' });
        expect(room.intake(0, 1, stop(), 62_000)).toBe('ok');
        expect(room.slots[0].mode).toBe('human');
    });

    it('away pilots at once; back reclaims only within 1 s of live; the flip turn discards pilot commands', () => {
        const { room, turns } = setup();
        run(room, 1000, 4000);
        room.away(1);
        expect(room.slots[1]).toMatchObject({ mode: 'pilot', reason: 'away' });
        room.beat(1, room.nextTurn - PARTY_LIMITS.reclaimWithinTurns - 1, 4001);
        expect(room.back(1, 4001)).toBe(false);
        // received turns lag live by RTT and a buffer: a client 10 turns behind (150 ms RTT, B = 5) still reclaims
        room.beat(1, room.nextTurn - 10, 4002);
        room.pilotCommands(1, [stop()]);
        expect(room.back(1, 4003)).toBe(true);
        run(room, 4010, 4100);
        const last = turns[turns.length - 1];
        expect(turns.flatMap(t => t.entries).some(e => e.pilot)).toBe(false);
        expect(last.modeMask & 2).toBe(0);
    });

    it('counts pilot ticks by reason and announces modes in the TURN mask', () => {
        const { room, turns } = setup({ humans: [0, 1, 2], occupied: [0, 1] });
        run(room, 1000, 1000 + 10 * TURN_MS);
        expect(turns[0].modeMask).toBe(0b100);
        expect(room.slots[2].pilotTicks.open).toBe(turns.length * 2);
        room.disconnect(1, 2000);
        run(room, 2000, 2000 + 10 * TURN_MS);
        expect(room.slots[1].pilotTicks.drop).toBeGreaterThan(0);
        expect(turns[turns.length - 1].modeMask).toBe(0b110);
    });

    it('silence: away at 3 s, pilot at 6 s', () => {
        const { room } = setup();
        run(room, 1000, 2000);
        for (let t = 2000; t < 2000 + 6100; t += 50) {
            room.beat(0, room.nextTurn, t);
            room.advance(t);
        }
        expect(room.slots[1]).toMatchObject({ mode: 'pilot', reason: 'drop' });
        expect(room.slots[0].mode).toBe('human');
    });

    it('abandons after 30 s empty before any command, 120 s after play', () => {
        const a = setup();
        a.room.disconnect(0, 1000);
        a.room.disconnect(1, 1000);
        run(a.room, 1000, 1000 + PARTY_LIMITS.abandonBeforePlayMs - 100, false);
        expect(a.room.status).toBe('live');
        run(a.room, 1000 + PARTY_LIMITS.abandonBeforePlayMs, 1000 + PARTY_LIMITS.abandonBeforePlayMs + 50, false);
        expect(a.room.status).toBe('abandoned');
        const b = setup();
        b.room.advance(1000);
        b.room.intake(0, 1, stop(), 1001);
        b.room.disconnect(0, 1001);
        b.room.disconnect(1, 1001);
        run(b.room, 1010, 1001 + PARTY_LIMITS.abandonBeforePlayMs + 1000, false);
        expect(b.room.status).toBe('live');
        run(b.room, 1001 + PARTY_LIMITS.abandonAfterPlayMs - 20, 1001 + PARTY_LIMITS.abandonAfterPlayMs + 20, false);
        expect(b.room.status).toBe('abandoned');
    });

    it('stops taking commands past the 160 KB log cap; turns keep closing', () => {
        const { room } = setup();
        room.advance(1000);
        room.logBytes = PARTY_LIMITS.roomLogBytes;
        expect(room.intake(0, 1, stop(), 1001)).toBe('log_full');
        const n = room.nextTurn;
        room.advance(1000 + 5 * TURN_MS + 1);
        expect(room.nextTurn).toBe(n + 5);
    });

    it('late loaders are piloted from tick 0 with reason late', () => {
        const turns: TurnFrame[] = [];
        const room = new Room(
            { id: 'r', humans: [0, 1], occupied: [0, 1], difficulty: 'easy', forfeitFrom: 0, nowMs: 0, startMs: 100 },
            { turn: (_f, b) => turns.push(decodeTurnBody(b)), json: () => undefined, catchup: () => undefined }
        );
        room.connect(0, 0);
        room.loaded(0);
        room.connect(1, 0);
        room.advance(100 + TURN_MS + 1);
        expect(turns[0].modeMask).toBe(0b10);
        expect(room.slots[1].reason).toBe('late');
    });

    it('the scheduler closes turns in order under a 300 ms main-thread stall', () => {
        let now = 0;
        const timers: { at: number; fn: () => void }[] = [];
        const sched = new RoomScheduler({
            now: () => now,
            setTimer: (fn, ms) => {
                const t = { at: now + ms, fn };
                timers.push(t);
                return t;
            },
            clearTimer: h => {
                const i = timers.indexOf(h as never);
                if (i >= 0) timers.splice(i, 1);
            },
        });
        const { room, turns } = setup();
        sched.add(room);
        const step = (ms: number) => {
            now += ms;
            const due = timers.filter(x => x.at <= now);
            for (const t of due) timers.splice(timers.indexOf(t), 1);
            for (const t of due) t.fn();
        };
        for (let i = 0; i < 200; i++) step(10);
        now += 300; // a stall: the next wake closes every overdue turn
        step(1);
        for (let i = 0; i < 10; i++) step(10);
        const ids = turns.map(t => t.turn);
        expect(ids).toEqual(ids.map((_, i) => i));
        expect(ids.length).toBeGreaterThan(15);
    });
});

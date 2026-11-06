import { decodeTurnBody, encodeTurnBody } from './net';
import { PARTY_LIMITS, TURN_MS } from './party-limits';
import { RefereeRoom, liveSim, type RefereeConfig } from './referee-core';
import { Room } from './room';

/*
 * Party play N6 (MULTIPLAYER.md §4.4, §12 N6): desync detection and recovery on the room's hash compare. Clients are
 * modelled by the vendored sim fed TURN bodies (exactly what the net-host worker does); the referee is RefereeRoom.
 */

const sim = liveSim();

function cfg(seed: number): RefereeConfig {
    const seats = [
        { slot: 0, hero: 'clem', trick: 'pounce' },
        { slot: 1, hero: 'sage', trick: 'snack' },
        { slot: 2, hero: 'gabe', trick: 'hiss' },
    ];
    const { picks, tricks } = sim.fillPicksParty(seed, seats as never);
    return { seed, picks: picks as string[], tricks: tricks as string[], difficulty: 'easy', humans: [0, 1, 2] };
}

class Client {
    m: ReturnType<typeof sim.createMatch>;
    seen = 0;
    constructor(readonly config: RefereeConfig) {
        this.m = sim.createMatch(config);
    }
    rebuild() {
        this.m = sim.createMatch(this.config);
        this.seen = 0;
    }
    /** Apply a body; returns the new trail hashes. */
    apply(body: Uint8Array): { tick: number; hash: number }[] {
        const f = decodeTurnBody(body);
        for (let sub = 0; sub < 2; sub++) {
            const per: ReturnType<typeof sim.decodeCommand>[][] = [[], [], []];
            for (const e of f.entries) if (e.sub === sub) per[e.slot].push(sim.decodeCommand(e.cmd));
            sim.step(this.m, per[0], per);
        }
        const trail = sim.hashTrail(this.m);
        const out: { tick: number; hash: number }[] = [];
        while (this.seen < trail.length) {
            out.push({ tick: (this.seen + 1) * 30, hash: trail[this.seen] >>> 0 });
            this.seen++;
        }
        return out;
    }
}

function world(seed: number) {
    const config = cfg(seed);
    const bodies: Uint8Array[] = [];
    const resyncs: number[] = [];
    const catchups: { slot: number; from: number }[] = [];
    const events: string[] = [];
    const room = new Room(
        { id: 'd', humans: [0, 1, 2], occupied: [0, 1, 2], difficulty: 'easy', forfeitFrom: 0, nowMs: 0, startMs: 0 },
        {
            turn: (_f, b) => bodies.push(b),
            json: (slot, msg) => {
                if (msg.t === 'resync' && slot !== null) resyncs.push(slot);
            },
            catchup: (slot, from) => catchups.push({ slot, from }),
            log: e => events.push(e),
        }
    );
    for (const s of [0, 1, 2]) {
        room.connect(s, 0);
        room.loaded(s);
    }
    const ref = new RefereeRoom(sim, config);
    const clients = [new Client(config), new Client(config), new Client(config)];
    let now = 0;
    let seq = 0;
    /** One turn: close it, feed the referee and the clients (`mutate` corrupts what one party sees). */
    const turn = (mutate?: { who: 'client' | 'referee'; slot?: number }) => {
        now += TURN_MS;
        for (const s of [0, 1, 2]) room.beat(s, room.nextTurn, now);
        // keep the humans active (no AFK) with a harmless command now and then
        if (room.nextTurn % 120 === 0) for (const s of [0, 1, 2]) room.intake(s, ++seq, new Uint8Array([6]), now);
        room.advance(now + 1);
        const body = bodies[bodies.length - 1];
        const bad = corrupt(body);
        const refOut = ref.applyTurn(mutate?.who === 'referee' ? bad : body);
        for (const h of refOut.hashes) room.refereeHash(h.tick, h.hash, refOut.aliveMask);
        clients.forEach((c, s) => {
            const hs = c.apply(mutate?.who === 'client' && mutate.slot === s ? bad : body);
            for (const h of hs) room.clientHash(s, h.tick, h.hash);
        });
    };
    return { room, ref, clients, bodies, resyncs, catchups, events, turn, config };
}

/** The same turn with one extra Move from slot 0 (a different world). */
function corrupt(body: Uint8Array): Uint8Array {
    const f = decodeTurnBody(body);
    return encodeTurnBody({
        ...f,
        entries: [...f.entries, { slot: 0, sub: 0, pilot: false, cmd: new Uint8Array([1, 40, 0, 40, 0]) }],
    });
}

describe('net desync (N6)', () => {
    jest.setTimeout(120_000);

    it('a corrupted TURN for client B is flagged within 30 ticks; B rebuilds from turn 0 and agrees again', () => {
        const w = world(1);
        for (let i = 0; i < 200; i++) w.turn();
        w.turn({ who: 'client', slot: 1 });
        const at = w.room.tick;
        for (let i = 0; i < 16 && !w.resyncs.length; i++) w.turn();
        expect(w.resyncs).toEqual([1]);
        expect(w.room.tick - at).toBeLessThanOrEqual(32);
        expect(w.catchups).toEqual([{ slot: 1, from: 0 }]);
        expect(w.room.slots[1]).toMatchObject({ mode: 'pilot', reason: 'desync' });
        // B is piloted while it rebuilds from the full log (the CATCHUP), then goes on
        for (let i = 0; i < 30; i++) w.turn();
        w.clients[1].rebuild();
        for (const b of w.bodies) w.clients[1].apply(b);
        expect(sim.hash(w.clients[1].m)).toBe(sim.hash(w.ref.m));
        w.room.beat(1, w.room.nextTurn, 1e9);
        expect(w.room.back(1, 1e9)).toBe(true);
        for (let i = 0; i < 60; i++) w.turn();
        expect(w.resyncs).toEqual([1]);
        expect(w.events).toContain('mp_desync');
        // a desync pilot never counts toward the AFK rule
        expect(w.room.slots[1].pilotTicks.desync).toBeGreaterThan(0);
        expect(w.room.slots[1].pilotTicks.drop + w.room.slots[1].pilotTicks.afk + w.room.slots[1].pilotTicks.away).toBe(
            0
        );
    });

    it('majority rule: a diverged referee is logged (two clients agree), no resync storm, the room stays scored', () => {
        const w = world(2);
        for (let i = 0; i < 100; i++) w.turn();
        w.turn({ who: 'referee' });
        for (let i = 0; i < 40; i++) w.turn();
        expect(w.room.suspect).toBe(true);
        // client hashes never void a room: the end-of-match verify of the raw log is the independent check
        expect(w.room.unscored).toBeNull();
        expect(w.resyncs).toEqual([]);
        expect(w.events).toContain('mp_referee_divergence');
    });

    it('forged HASH frames from one member only resync that member; the room stays scored and detection stays on', () => {
        const w = world(4);
        for (let i = 0; i < 60; i++) w.turn();
        // slot 1 lies at the next two marks (a resync in between, then `back`, then the second lie)
        for (let k = 0; k < 2; k++) {
            const mark = (Math.floor(w.room.tick / 30) + 1) * 30;
            // just before the honest client reaches the mark (a forged frame arrives first)
            while (w.room.tick + 8 < mark) w.turn();
            expect(w.room.clientHash(1, mark, 0xdeadbeef)).toBe(true);
            // the same mark again is refused (one per slot and mark), and so are off-cadence ticks
            expect(w.room.clientHash(1, mark, 0xdeadbeef)).toBe(false);
            expect(w.room.clientHash(1, mark + 1, 1)).toBe(false);
            for (let i = 0; i < 60; i++) w.turn();
            w.room.beat(1, w.room.nextTurn, 1e9);
            w.room.back(1, 1e9);
        }
        expect(w.resyncs).toEqual([1, 1]);
        expect(w.room.unscored).toBeNull();
        expect(w.room.suspect).toBe(false);
        // a real desync on slot 2 is still caught
        w.turn({ who: 'client', slot: 2 });
        for (let i = 0; i < 16; i++) w.turn();
        expect(w.resyncs).toEqual([1, 1, 2]);
    });

    it('resync caps: 3 per slot (they survive a reconnect), then the slot only watches, piloted', () => {
        const w = world(3);
        for (let i = 0; i < 50; i++) w.turn();
        for (let k = 0; k < PARTY_LIMITS.resyncsPerSlot + 1; k++) {
            w.turn({ who: 'client', slot: 2 });
            for (let i = 0; i < 16; i++) w.turn();
            w.clients[2].rebuild();
            for (const b of w.bodies) w.clients[2].apply(b);
            w.room.disconnect(2, 0);
            w.room.connect(2, 0);
            w.room.beat(2, w.room.nextTurn, 1e9);
            w.room.back(2, 1e9);
            // agree once after the rebuild (so the next miss is a fresh desync, not a suspect referee)
            for (let i = 0; i < 16; i++) w.turn();
        }
        expect(w.room.slots[2].resyncs).toBe(PARTY_LIMITS.resyncsPerSlot);
        expect(w.room.slots[2].watching).toBe(true);
        expect(w.room.slots[2].mode).toBe('pilot');
    });
});

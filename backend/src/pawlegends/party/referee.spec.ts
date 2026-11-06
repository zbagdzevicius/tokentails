import { performance } from 'perf_hooks';
import { encodeTurnBody, type TurnEntry } from './net';
import { LoopGate } from './loop-gate';
import { TURN_MS } from './party-limits';
import { RefereeRoom, checkRoomLog, liveSim, type RefereeConfig } from './referee-core';
import { RefereePool } from './referee-pool';
import { Room } from './room';
import { RoomScheduler } from './room-scheduler';

/* Party play N4 (MULTIPLAYER.md §3.3, §12 N4): the referee. */

const sim = liveSim();

function configFor(seed: number, humans = [0, 1, 2]): RefereeConfig {
    const seats = humans.map((slot, i) => ({
        slot,
        hero: (['clem', 'sage', 'gabe'] as const)[i],
        trick: (['pounce', 'snack', 'hiss'] as const)[i],
    }));
    const { picks, tricks } = sim.fillPicksParty(seed, seats);
    return { seed, picks, tricks, difficulty: 'easy', humans };
}

const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
};

/**
 * A whole room the way the relay plays it: slots 0 and 1 are "humans" whose commands come from player-bots running
 * on the client's own copy of the match (fed the same TURN bodies); slot 2 is piloted by the referee, whose commands
 * are injected into the next turn with the pilot bit.
 */
function playRoom(seed: number) {
    const config = configFor(seed);
    const ref = new RefereeRoom(sim, config);
    const client = sim.createMatch(config);
    const brains = [sim.createPlayerBotFor(client, 'normal', 0), sim.createPlayerBotFor(client, 'easy', 1)];
    const log: Uint8Array[] = [];
    let pending: Uint8Array[] = [];
    let clientHumans: Uint8Array[][] = [[], []];
    for (let turn = 0; !ref.ended && turn < 20000; turn++) {
        const entries: TurnEntry[] = [];
        for (let s = 0; s < 2; s++)
            for (const c of clientHumans[s].slice(-2))
                entries.push({
                    slot: s,
                    sub: (entries.filter(e => e.slot === s).length & 1) as 0 | 1,
                    pilot: false,
                    cmd: c,
                });
        pending.slice(-1).forEach(c => entries.push({ slot: 2, sub: 0, pilot: true, cmd: c }));
        const body = encodeTurnBody({ turn, modeMask: 0b100, acks: [], entries });
        log.push(body);
        const out = ref.applyTurn(body);
        pending = out.pilot.flatMap(p => p.cmds);
        // the client applies the same TURN, then its "humans" think on the result
        clientHumans = [[], []];
        for (let sub = 0; sub < 2; sub++) {
            const per: ReturnType<typeof sim.decodeCommand>[][] = [[], [], []];
            for (const e of entries) if (e.sub === sub) per[e.slot].push(sim.decodeCommand(e.cmd));
            for (let s = 0; s < 2; s++)
                for (const c of sim.playerBotCommands(client, brains[s])) clientHumans[s].push(sim.encodeCommand(c));
            sim.step(client, per[0], per);
        }
    }
    return { config, ref, client, log };
}

describe('party referee (N4)', () => {
    jest.setTimeout(300_000);

    it('2 human streams + 1 piloted slot: the referee, the client, the stored log re-sim and verifyPartyReplay agree', () => {
        const { config, ref, client, log } = playRoom(77);
        expect(ref.ended).not.toBeNull();
        const end = ref.ended!;
        expect(sim.result(client)!.finalHash).toBe(end.finalHash);
        expect(end.record!.inputs).toHaveLength(3);
        expect(end.record!.inputs[2].length).toBeGreaterThan(0);
        const check = checkRoomLog(sim, config, concat(log), end);
        expect(check).toMatchObject({ ok: true });
        expect(sim.verifyPartyReplay(end.record)).toMatchObject({ ok: true, finalHash: end.finalHash });
        // a forged verdict fails
        expect(checkRoomLog(sim, config, concat(log), { ...end, finalHash: '00000000' }).ok).toBe(false);
    });

    it('3 rooms interleaved turn by turn in one isolate equal their solo runs', () => {
        const run = (configs: RefereeConfig[], interleave: boolean) => {
            const rooms = configs.map(c => new RefereeRoom(sim, c));
            const pend: Uint8Array[][] = rooms.map(() => []);
            const step = (i: number, turn: number) => {
                const entries: TurnEntry[] = pend[i]
                    .slice(-2)
                    .map((cmd, k) => ({ slot: 0, sub: (k & 1) as 0 | 1, pilot: true, cmd }));
                pend[i] = rooms[i]
                    .applyTurn(encodeTurnBody({ turn, modeMask: 0b111, acks: [], entries }))
                    .pilot.flatMap(p => (p.slot === 0 ? p.cmds : []));
            };
            if (interleave) for (let t = 0; t < 1500; t++) rooms.forEach((_, i) => step(i, t));
            else
                rooms.forEach((_, i) => {
                    for (let t = 0; t < 1500; t++) step(i, t);
                });
            return rooms.map(r => sim.hash(r.m));
        };
        const configs = [configFor(1), configFor(2), configFor(3)];
        expect(run(configs, true)).toEqual(run(configs, false));
    });

    it('the event-loop gate refuses new rooms at p99 > 20 ms and on referee lag', () => {
        let p99 = 5;
        const gate = new LoopGate(() => p99);
        expect(gate.busy()).toBe(false);
        p99 = 25;
        expect(gate.busy()).toBe(true);
        p99 = 5;
        gate.reportLag(31);
        expect(gate.busy()).toBe(true);
        gate.reportLag(0);
        expect(gate.busy()).toBe(false);
    });

    it('a 300 ms main-thread busy loop: the real scheduler closes the overdue turns in order afterwards', async () => {
        const bodies: number[] = [];
        const now = () => performance.now();
        const t0 = now();
        const room = new Room(
            { id: 'busy', humans: [0], occupied: [0], difficulty: 'easy', forfeitFrom: 0, nowMs: t0, startMs: t0 },
            { turn: (_f, _b, turn) => bodies.push(turn), json: () => undefined, catchup: () => undefined }
        );
        room.connect(0, t0);
        room.loaded(0);
        const sched = new RoomScheduler({
            now,
            setTimer: (fn, ms) => setTimeout(fn, ms),
            clearTimer: h => clearTimeout(h as NodeJS.Timeout),
        });
        sched.add(room);
        await new Promise(r => setTimeout(r, 200));
        const before = bodies.length;
        const until = now() + 300;
        while (now() < until) {
            /* busy */
        }
        await new Promise(r => setTimeout(r, 120));
        sched.stop();
        expect(bodies).toEqual(bodies.map((_, i) => i));
        expect(bodies.length - before).toBeGreaterThanOrEqual(Math.floor(300 / TURN_MS));
    });

    it('the pool (inline backend) opens a room, steps turns, and verifies a stored log', async () => {
        const pool = new RefereePool({ inline: true });
        const got: string[] = [];
        pool.onRoom = m => got.push(m.t);
        const { config, ref, log } = playRoom(78);
        const vendor = await import('../../vendor/pawlegends-sim');
        const live = vendor.simFor(vendor.SIM_VERSION)!;
        pool.open('p1', live.SIM_VERSION, live.SIM_SOURCE_HASH!, config);
        for (const b of log.slice(0, 60)) pool.turn('p1', b);
        await new Promise(r => setImmediate(r));
        expect(got).toContain('hash');
        const v = await pool.verify(live.SIM_VERSION, live.SIM_SOURCE_HASH!, config, concat(log), ref.ended!);
        expect(v).toMatchObject({ ok: true });
        await pool.shutdown();
    });
});

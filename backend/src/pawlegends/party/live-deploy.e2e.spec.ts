import { fork, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { CMD_OP } from './net';
import { PARTY_LIMITS } from './party-limits';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Live-match deploys, across real processes (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §9 integration test). Two relays
 * run in forked processes (test/relay-proc.harness.ts) and share one store held here, the way two containers share one
 * Mongo database. A planned deploy sends a real SIGTERM; a crash sends a real SIGKILL mid-match. Each client dials the
 * port of the relay the load balancer would pick.
 *
 * What a player keeps: the same member, room and slot; a turn sequence with no gap and no repeat; and, for every turn
 * both relays served, the same inputs (the sim is deterministic, so the same log is the same game state and the same
 * score). After a crash only the turns after the last checkpoint (at most `checkpointEveryMs`) are replayed differently.
 */

const HARNESS = resolve(__dirname, '../../../test/relay-proc.harness.ts');

type Logged = { event: string; props: Record<string, unknown> };

/** Buffers cross the IPC channel as plain Uint8Arrays: the turn log chunks become Buffers again. */
function buffers(v: unknown): unknown {
    if (v instanceof Uint8Array) return Buffer.isBuffer(v) ? v : Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    if (Array.isArray(v)) return v.map(buffers);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        const out: Record<string, unknown> = {};
        for (const [k, x] of Object.entries(v)) out[k] = buffers(x);
        return out;
    }
    return v;
}

class RelayProc {
    readonly logs: Logged[] = [];
    port = 0;
    exit: { code: number | null; signal: string | null } | null = null;
    private readonly child: ChildProcess;
    private readonly ready: Promise<void>;

    constructor(store: MemoryRoomStore, env: Record<string, string> = {}) {
        this.child = fork(HARNESS, [], {
            execArgv: ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register'],
            env: { ...process.env, ...env, TS_NODE_TRANSPILE_ONLY: '1' },
            serialization: 'advanced',
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        this.ready = new Promise((ok, fail) => {
            this.child.on('message', async (msg: any) => {
                if (msg.ready) {
                    this.port = msg.port;
                    ok();
                } else if (msg.log) this.logs.push(msg.log);
                else if (typeof msg.rpc === 'number') {
                    try {
                        const fn = (store as any)[msg.m] as (...a: unknown[]) => Promise<unknown>;
                        const v = await fn.apply(store, buffers(msg.a) as unknown[]);
                        if (this.child.connected) this.child.send({ rpc: msg.rpc, ok: true, v });
                    } catch (e: any) {
                        if (this.child.connected)
                            this.child.send({
                                rpc: msg.rpc,
                                ok: false,
                                err: { message: String(e?.message), code: e?.code },
                            });
                    }
                }
            });
            this.child.on('exit', (code, signal) => {
                this.exit = { code, signal };
                fail(new Error(`relay exited before ready (${code ?? signal})`));
            });
        });
    }

    start(): Promise<void> {
        return this.ready;
    }

    kill(signal: NodeJS.Signals): void {
        this.child.kill(signal);
    }

    async exited(ms = 15_000): Promise<{ code: number | null; signal: string | null }> {
        await until(() => this.exit, ms);
        return this.exit!;
    }

    has(event: string): Logged | undefined {
        return this.logs.find(l => l.event === event);
    }
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(pred: () => T | undefined | null | false, ms = 10_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const v = pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout');
        await wait(25);
    }
}

/** Two humans in a party match on `port` (bots fill the rest). */
async function partyMatch(port: number) {
    const a = new TestClient(port);
    const b = new TestClient(port);
    await Promise.all([a.open(), b.open()]);
    a.hello();
    b.hello();
    const wa = await a.until(() => a.last('welcome'));
    const wb = await b.until(() => b.last('welcome'));
    a.send({ t: 'party.create', difficulty: 'normal' });
    const pa = await a.until(() => a.last('party'));
    b.send({ t: 'party.join', code: pa.code });
    await a.until(() => a.last('party')?.members.length === 2);
    a.send({ t: 'party.start' });
    await a.until(() => a.last('party')?.phase === 'pick');
    a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
    b.send({ t: 'pick.lock', hero: 'gabe', trick: 'hiss' });
    await a.until(() => a.last('party')?.phase === 'loading');
    a.send({ t: 'loaded' });
    b.send({ t: 'loaded' });
    const ma = await a.until(() => a.last('match'));
    const mb = await b.until(() => b.last('match'));
    return { a, b, wa, wb, ma, mb };
}

/** Reconnect with a resume token until `match` comes (a moving room answers `room_elsewhere` or closes first). */
async function rejoin(port: number, token: string, ms: number): Promise<TestClient> {
    const end = Date.now() + ms;
    for (;;) {
        const c = new TestClient(port);
        await c.open();
        c.hello({ resume: { token } });
        try {
            await c.until(() => c.last('match') || c.closed, Math.max(100, end - Date.now()));
        } catch {
            /* timed out */
        }
        if (c.last('match')) return c;
        c.close();
        if (Date.now() > end) throw new Error('no match after rejoin');
        await wait(100);
    }
}

/** Scripted inputs: each client moves somewhere new every 200 ms and beats (so its slot stays human). */
function play(...clients: TestClient[]): () => void {
    let n = 0;
    const t = setInterval(() => {
        n++;
        clients.forEach((c, i) => {
            if (c.closed || c.ws.readyState !== 1) return;
            c.beat();
            if (n % 2 === i % 2)
                c.cmd(new Uint8Array([CMD_OP.Move, 60 + ((n * 7 + i * 13) % 40), 0, 60 + ((n * 5) % 40), 0]));
        });
    }, 200);
    return () => clearInterval(t);
}

/** Turn number → its inputs, as one client saw them. */
const byTurn = (...clients: TestClient[]) => {
    const m = new Map<number, string>();
    for (const c of clients) for (const t of c.turns) m.set(t.turn, JSON.stringify(t.entries));
    return m;
};
/** Turns `from..to` of both maps carry the same inputs. */
const sameLog = (x: Map<number, string>, y: Map<number, string>, from: number, to: number) => {
    for (let t = from; t <= to; t++) if (x.has(t) && y.has(t) && x.get(t) !== y.get(t)) return t;
    return -1;
};
const contiguous = (...turns: { turn: number }[][]) => {
    const ns = [...new Set(turns.flat().map(t => t.turn))].sort((p, q) => p - q);
    return ns.every((v, i) => v === i);
};

describe('live-match deploys across processes (LIVE-MATCH-DEPLOYS.md §9)', () => {
    jest.setTimeout(180_000);
    const procs: RelayProc[] = [];
    const clients: TestClient[] = [];
    beforeAll(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'live-deploy-secret-0123456789';
    });
    afterEach(async () => {
        for (const c of clients.splice(0)) c.close();
        for (const p of procs.splice(0)) if (!p.exit) p.kill('SIGKILL');
    });
    const proc = (store: MemoryRoomStore, env?: Record<string, string>) => {
        const p = new RelayProc(store, env);
        procs.push(p);
        return p;
    };

    it('planned deploy: the new relay comes up, SIGTERM drains the old one, the room moves and both players keep their seats and their game', async () => {
        const store = new MemoryRoomStore();
        const A = proc(store, { RELAY_DRAIN_MAX_MS: '1500' });
        await A.start();
        const m = await partyMatch(A.port);
        clients.push(m.a, m.b);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 100, 30_000);

        // the new container is ready; the old one starts draining by itself, its room plays on
        const B = proc(store);
        await B.start();
        // the load balancer starts routing to it (a first socket): only then does the old one start draining
        await new Promise(r => setTimeout(r, 1500));
        expect(A.has('relay_drain_start')).toBeFalsy();
        const probe = new TestClient(B.port);
        clients.push(probe);
        await probe.open();
        await until(() => A.has('relay_drain_start'), 5000);
        const n = m.a.turns.length;
        await wait(500);
        expect(m.a.turns.length).toBeGreaterThan(n);

        // SIGTERM (DigitalOcean swaps the container): the room plays on for RELAY_DRAIN_MAX_MS, then is pushed
        A.kill('SIGTERM');
        await m.a.until(() => m.a.closed, 10_000);
        await m.b.until(() => m.b.closed, 10_000);
        stop1();
        expect(m.a.closed!.code).toBe(1012);
        expect(m.a.json.find(j => j.t === 'error' && j.code === 'room_gone')?.retryMs).toBe(0);
        expect((await A.exited()).code).toBe(0);
        expect(A.logs.some(l => l.event === 'relay_handoff')).toBe(true);

        // both players reconnect to the new relay: bound to the same slot quickly
        const t0 = Date.now();
        const [a2, b2] = await Promise.all([
            rejoin(B.port, m.wa.resumeToken, 10_000),
            rejoin(B.port, m.wb.resumeToken, 10_000),
        ]);
        clients.push(a2, b2);
        const bindMs = Date.now() - t0;
        expect(bindMs).toBeLessThan(PARTY_LIMITS.restoreEveryMs + 2000);
        expect(a2.last('match')!.room).toBe(m.ma.room);
        expect(a2.last('match')!.you.slot).toBe(m.ma.you.slot);
        expect(b2.last('match')!.you.slot).toBe(m.mb.you.slot);

        // catch up from the start of the match on one client, from the last turn seen on the other
        const lastB = m.b.turns[m.b.turns.length - 1].turn;
        a2.send({ t: 'sync', fromTurn: 0 });
        b2.send({ t: 'sync', fromTurn: lastB + 1 });
        a2.send({ t: 'back' });
        b2.send({ t: 'back' });
        const stop2 = play(a2, b2);
        await a2.until(() => a2.turns.some(t => t.turn > lastB + 60), 20_000);
        stop2();
        const restored = B.has('relay_restore');
        expect(restored).toBeDefined();
        expect(Number(restored!.props.gapMs)).toBeLessThan(2000);

        // no turn skipped or repeated, and every turn served by both relays carries the same inputs
        const before = byTurn(m.a);
        const after = byTurn(a2);
        expect(sameLog(before, after, 0, lastB)).toBe(-1);
        expect(contiguous(m.b.turns, b2.turns)).toBe(true);
        expect(contiguous(a2.turns)).toBe(true);
    });

    it('crash: SIGKILL mid-match; the next relay claims the room after the stale lease and the players resume from the last checkpoint', async () => {
        const store = new MemoryRoomStore();
        const A = proc(store);
        await A.start();
        const m = await partyMatch(A.port);
        clients.push(m.a, m.b);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 100, 30_000);

        A.kill('SIGKILL');
        stop1();
        const killedAt = Date.now();
        expect((await A.exited()).signal).toBe('SIGKILL');
        const lastSeen = m.a.turns[m.a.turns.length - 1].turn;
        const row = { ...store.rooms.get(m.ma.room)! };
        // the log ends at the last checkpoint: at most one interval behind what the clients saw
        expect(lastSeen + 1 - row.lastTurn).toBeLessThanOrEqual(Math.ceil(PARTY_LIMITS.checkpointEveryMs / 66) + 15);
        expect(row.handoff).toBe(false);

        // autoheal boots a new relay; the players keep retrying (room_elsewhere while the dead lease is fresh)
        const B = proc(store);
        await B.start();
        const upAt = Date.now();
        const [a2, b2] = await Promise.all([
            rejoin(B.port, m.wa.resumeToken, PARTY_LIMITS.staleLeaseMs + 10_000),
            rejoin(B.port, m.wb.resumeToken, PARTY_LIMITS.staleLeaseMs + 10_000),
        ]);
        clients.push(a2, b2);
        // the lease goes stale `staleLeaseMs` after the last checkpoint (which was before the kill); the new relay was
        // booting meanwhile (a ts-node cold start here), so count from whichever came last
        const from = Math.max(killedAt, upAt - PARTY_LIMITS.staleLeaseMs);
        expect(Date.now() - from).toBeLessThan(PARTY_LIMITS.staleLeaseMs + PARTY_LIMITS.restoreEveryMs + 4000);
        expect(a2.last('match')!.you.slot).toBe(m.ma.you.slot);
        expect(b2.last('match')!.you.slot).toBe(m.mb.you.slot);

        // client a applied turns the restored log does not hold: the relay rolls it back (resync) and rebuilds from 0
        a2.send({ t: 'sync', fromTurn: lastSeen + 1 });
        b2.send({ t: 'sync', fromTurn: 0 });
        const stop2 = play(a2, b2);
        if (lastSeen + 1 > row.lastTurn) await a2.until(() => a2.json.find(j => j.t === 'resync'), 5000);
        await a2.until(() => a2.turns.some(t => t.turn > lastSeen + 30), 20_000);
        await b2.until(() => b2.turns.some(t => t.turn > lastSeen + 30), 20_000);
        // caught up: the real client says `back` and its slot is human again (no pilot)
        a2.beat();
        b2.beat();
        a2.send({ t: 'back' });
        b2.send({ t: 'back' });
        const backAt = a2.turns[a2.turns.length - 1].turn;
        await a2.until(
            () => a2.turns.some(t => t.turn > backAt && t.entries.some(e => e.slot === m.ma.you.slot && !e.pilot)),
            10_000
        );
        stop2();
        expect(contiguous(a2.turns)).toBe(true);
        expect(contiguous(b2.turns)).toBe(true);
        // up to the checkpoint the game is the same game; both players now share one log again
        expect(sameLog(byTurn(m.a), byTurn(a2), 0, row.lastTurn - 1)).toBe(-1);
        expect(sameLog(byTurn(a2), byTurn(b2), 0, lastSeen + 30)).toBe(-1);
    });
});

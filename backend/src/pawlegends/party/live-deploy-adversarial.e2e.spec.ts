import { fork, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { resolve } from 'path';
import { partySimFor, simFor } from '../../vendor/pawlegends-sim';
import { LoopGate } from './loop-gate';
import { CMD_OP, encodeTurnBody, splitTurnBodies, type TurnFrame } from './net';
import { PARTY_LIMITS } from './party-limits';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereeRoom, type RefereeConfig } from './referee-core';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore, type StoredRoom } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Adversarial checks of live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §9), on top of live-deploy.e2e.spec:
 * real processes killed with SIGTERM and SIGKILL, and for every player the game state compared by re-simming what that
 * player received (the sim's hash trail, every 30 ticks) against the room log the relays stored. Also: what each player
 * would have seen (the client shows "Reconnecting…" only when a move takes over 1.5 s), new parties during a drain, a
 * room of an older sim version, a stolen resume token, the checkpoint write size, and bounded relay memory.
 */

const HARNESS = resolve(__dirname, '../../../test/relay-proc.harness.ts');
const OLD_SIM = 18;

type Logged = { event: string; props: Record<string, unknown> };

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

/** The store both relay processes share, with the size and rate of every checkpoint append. */
class MeteredStore extends MemoryRoomStore {
    readonly appends: { bytes: number; at: number; turns: number }[] = [];
    async append(...a: Parameters<MemoryRoomStore['append']>): Promise<boolean> {
        const [, , prevTurn, chunk, meta] = a;
        this.appends.push({ bytes: chunk.length, at: Date.now(), turns: meta.lastTurn - prevTurn });
        return super.append(...a);
    }
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
        // a reply to a relay that was just killed: the IPC pipe is gone (EPIPE), nothing to deliver
        this.child.on('error', () => undefined);
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
                            this.child.send({ rpc: msg.rpc, ok: false, err: { message: String(e?.message) } });
                    }
                }
            });
            this.child.on('exit', (code, signal) => {
                this.exit = { code, signal };
                fail(new Error(`relay exited before ready (${code ?? signal})`));
            });
        });
    }
    start() {
        return this.ready;
    }
    kill(signal: NodeJS.Signals) {
        this.child.kill(signal);
    }
    async exited(ms = 20_000) {
        await until(() => this.exit, ms);
        return this.exit!;
    }
    has(event: string) {
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
        await wait(20);
    }
}

/** A headless client that stamps when it last received a turn and when its socket closed. */
class Player extends TestClient {
    lastTurnAt = 0;
    firstTurnAt = 0;
    closedAt = 0;
    constructor(port: number) {
        super(port);
        let n = 0;
        this.ws.on('message', () => {
            if (this.turns.length !== n) {
                n = this.turns.length;
                this.lastTurnAt = Date.now();
                this.firstTurnAt ||= this.lastTurnAt;
            }
        });
        this.ws.on('close', () => (this.closedAt = Date.now()));
    }
}

const helloFor = (key: string, sim?: number) => {
    const s = sim ? simFor(sim)! : null;
    return { guestKey: key, ...(s ? { sim, simHash: s.SIM_SOURCE_HASH } : {}) };
};

async function partyMatch(port: number, sim?: number) {
    const a = new Player(port);
    const b = new Player(port);
    await Promise.all([a.open(), b.open()]);
    a.hello(helloFor('player-a-key-0001', sim));
    b.hello(helloFor('player-b-key-0001', sim));
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
    const ma = await a.until(() => a.last('match'), 15_000);
    const mb = await b.until(() => b.last('match'), 15_000);
    return { a, b, wa, wb, ma, mb };
}

/**
 * Reconnect the way the client does (net/socket.ts): after a planned move wait the relay's `retryMs` plus 0–100 ms of
 * jitter, else 250 ms; until `match` binds the seat. Returns the new socket and how many dials it took.
 */
async function reconnect(
    port: number,
    token: string,
    key: string,
    firstRetryMs: number,
    ms: number,
    sim?: number
): Promise<{ c: Player; dials: number }> {
    const end = Date.now() + ms;
    let retry = firstRetryMs;
    let dials = 0;
    for (;;) {
        await wait(retry + Math.random() * 100);
        dials++;
        const c = new Player(port);
        await c.open();
        c.hello({ ...helloFor(key, sim), resume: { token } });
        try {
            await c.until(() => c.last('match') || c.closed, Math.max(100, end - Date.now()));
        } catch {
            /* timed out */
        }
        if (c.last('match')) return { c, dials };
        const err = [...c.json].reverse().find(j => j.t === 'error');
        retry = typeof err?.retryMs === 'number' ? err.retryMs : 250;
        c.close();
        if (Date.now() > end) throw new Error(`no match after ${dials} dials`);
    }
}

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

/**
 * The sim's hash trail (one hash per 30 ticks) of the turns a player applied, in order; a later frame of the same turn
 * (a resync) replaces the earlier one, the way the client rebuilds. Stops at the first missing turn.
 */
function trailOf(row: StoredRoom, ...streams: TurnFrame[][]): number[] {
    const sim = partySimFor(row.simVersion, row.simHash)!.party!;
    const by = new Map<number, TurnFrame>();
    for (const s of streams) for (const t of s) by.set(t.turn, t);
    const r = new RefereeRoom(sim, row.config as unknown as RefereeConfig, false);
    for (let i = 0; by.has(i) && !r.ended; i++) r.applyTurn(encodeTurnBody(by.get(i)!));
    return [...sim.hashTrail(r.m)].map(h => h >>> 0);
}
/** The trail of the log the relays stored (what the referee and the score check see). */
function storedTrail(row: StoredRoom): number[] {
    const sim = partySimFor(row.simVersion, row.simHash)!.party!;
    const r = new RefereeRoom(sim, row.config as unknown as RefereeConfig, false);
    for (const f of splitTurnBodies(new Uint8Array(Buffer.concat(row.chunks)))) {
        if (r.ended) break;
        r.applyTurn(encodeTurnBody(f));
    }
    return [...sim.hashTrail(r.m)].map(h => h >>> 0);
}
/** First index where two trails differ within their common length, or -1. */
const diverge = (x: number[], y: number[]) => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return i;
    return -1;
};

/** What the client UI shows for one move (net-host.ts): toast only past 1.5 s without a bound seat. */
const ui = (closedAt: number, boundAt: number) =>
    boundAt - closedAt > 5000
        ? 'Waiting for server…'
        : boundAt - closedAt > 1500
        ? 'Reconnecting…'
        : 'none (frozen frame)';

const report: Record<string, unknown> = {};
const activeResources = (): string[] =>
    (process as unknown as { getActiveResourcesInfo(): string[] }).getActiveResourcesInfo();

describe('live-match deploys, adversarial (LIVE-MATCH-DEPLOYS.md §9)', () => {
    jest.setTimeout(240_000);
    const procs: RelayProc[] = [];
    const clients: TestClient[] = [];
    beforeAll(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'adversarial-secret-0123456789';
    });
    afterEach(async () => {
        for (const c of clients.splice(0)) c.close();
        for (const p of procs.splice(0)) if (!p.exit) p.kill('SIGKILL');
    });
    afterAll(() => console.log('LIVE-DEPLOY-ADVERSARIAL ' + JSON.stringify(report, null, 1)));
    const proc = (store: MemoryRoomStore, env?: Record<string, string>) => {
        const p = new RelayProc(store, env);
        procs.push(p);
        return p;
    };

    it('SIGTERM mid-match: same game state for both players, new parties go to the new relay, a stolen token gets no seat', async () => {
        const store = new MeteredStore();
        const A = proc(store, { RELAY_DRAIN_MAX_MS: '2000' });
        await A.start();
        const m = await partyMatch(A.port);
        clients.push(m.a, m.b);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 150, 40_000);

        // checkpoint cost while one room plays: bytes and turns per append, appends per second
        const ap = store.appends.filter(x => x.turns > 0);
        const span = (ap[ap.length - 1].at - ap[0].at) / 1000 || 1;
        report.checkpoint = {
            appends: ap.length,
            perSecond: +(ap.length / span).toFixed(2),
            avgBytes: Math.round(ap.reduce((n, x) => n + x.bytes, 0) / ap.length),
            maxBytes: Math.max(...ap.map(x => x.bytes)),
            avgTurns: +(ap.reduce((n, x) => n + x.turns, 0) / ap.length).toFixed(1),
        };
        expect(Math.max(...ap.map(x => x.bytes))).toBeLessThan(16_000);

        // a lobby player on the old relay before the new one is announced
        const lobby = new Player(A.port);
        clients.push(lobby);
        await lobby.open();
        lobby.hello(helloFor('lobby-key-00000001'));
        const lw = await lobby.until(() => lobby.last('welcome'));
        lobby.send({ t: 'party.create', difficulty: 'normal' });
        const lp = await lobby.until(() => lobby.last('party'));

        // the new relay comes up and a player reaches it: the old one drains
        const B = proc(store);
        await B.start();
        const probe = new Player(B.port);
        clients.push(probe);
        await probe.open();
        await until(() => A.has('relay_drain_start'), 8000);

        // the lobby party moved to B with its code; a fresh player dialing A is sent on; a new party is made on B
        await lobby.until(() => lobby.closed, 5000);
        const lr = await (async () => {
            for (let i = 0; i < 40; i++) {
                const c = new Player(B.port);
                await c.open();
                c.hello({ ...helloFor('lobby-key-00000001'), resume: { token: lw.resumeToken } });
                await c.until(() => c.last('party') || c.closed, 3000).catch(() => undefined);
                if (c.last('party')) return c;
                c.close();
                await wait(250);
            }
            throw new Error('lobby party not found on B');
        })();
        clients.push(lr);
        expect(lr.last('party')!.code).toBe(lp.code);
        const fresh = new Player(A.port);
        clients.push(fresh);
        await fresh.open();
        fresh.hello(helloFor('fresh-key-0000001'));
        await fresh.until(() => fresh.closed, 5000);
        expect(fresh.json.some(j => j.t === 'error' && j.code === 'server_moving')).toBe(true);
        expect(fresh.closed!.code).toBe(1012);
        const fresh2 = new Player(B.port);
        clients.push(fresh2);
        await fresh2.open();
        fresh2.hello(helloFor('fresh-key-0000001'));
        await fresh2.until(() => fresh2.last('welcome'));
        fresh2.send({ t: 'party.create', difficulty: 'normal' });
        await fresh2.until(() => fresh2.last('party'));
        // the live room still plays on the old relay
        const n0 = m.a.turns.length;
        await wait(600);
        expect(m.a.turns.length).toBeGreaterThan(n0);

        // SIGTERM: drain 2 s, then push the room; both players reconnect like the client does
        A.kill('SIGTERM');
        await m.a.until(() => m.a.closed, 15_000);
        await m.b.until(() => m.b.closed, 15_000);
        stop1();
        expect((await A.exited()).code).toBe(0);
        const retry = (c: TestClient) => {
            const e = [...c.json].reverse().find(j => j.t === 'error' && typeof j.retryMs === 'number');
            return e?.retryMs ?? 250;
        };

        // an attacker with player a's resume token but another identity: no seat, no match
        const thief = new Player(B.port);
        clients.push(thief);
        await thief.open();
        thief.hello({ ...helloFor('thief-key-0000001'), resume: { token: m.wa.resumeToken } });
        await thief.until(() => thief.last('welcome') || thief.closed, 8000).catch(() => undefined);
        await wait(300);
        expect(thief.last('match')).toBeUndefined();
        expect(thief.last('welcome')?.member).not.toBe(m.wa.member);

        const [ra, rb] = await Promise.all([
            reconnect(B.port, m.wa.resumeToken, 'player-a-key-0001', retry(m.a), 15_000),
            reconnect(B.port, m.wb.resumeToken, 'player-b-key-0001', retry(m.b), 15_000),
        ]);
        const boundA = Date.now();
        clients.push(ra.c, rb.c);
        expect(ra.c.last('match')!.you.slot).toBe(m.ma.you.slot);
        expect(rb.c.last('match')!.you.slot).toBe(m.mb.you.slot);
        const lastB = m.b.turns[m.b.turns.length - 1].turn;
        ra.c.send({ t: 'sync', fromTurn: m.a.turns[m.a.turns.length - 1].turn + 1 });
        rb.c.send({ t: 'sync', fromTurn: lastB + 1 });
        ra.c.send({ t: 'back' });
        rb.c.send({ t: 'back' });
        const stop2 = play(ra.c, rb.c);
        await ra.c.until(() => ra.c.turns.some(t => t.turn > lastB + 90), 30_000);
        await rb.c.until(() => rb.c.turns.some(t => t.turn > lastB + 90), 30_000);
        stop2();
        // let B checkpoint what the players saw
        await wait(PARTY_LIMITS.checkpointEveryMs + 1500);

        const row = store.rooms.get(m.ma.room)!;
        const ta = trailOf(row, m.a.turns, ra.c.turns);
        const tb = trailOf(row, m.b.turns, rb.c.turns);
        const ts = storedTrail(row);
        report.sigterm = {
            playerA: {
                closeCode: m.a.closed!.code,
                errors: m.a.json.filter(j => j.t === 'error').map(j => j.code),
                dials: ra.dials,
                bindMs: boundA - m.a.closedAt,
                ui: ui(m.a.closedAt, boundA),
            },
            playerB: { closeCode: m.b.closed!.code, dials: rb.dials, bindMs: boundA - m.b.closedAt },
            freezeMs: ra.c.firstTurnAt - m.a.lastTurnAt,
            hashes: {
                a: ta.length,
                b: tb.length,
                stored: ts.length,
                aVsStored: diverge(ta, ts),
                bVsStored: diverge(tb, ts),
                aVsB: diverge(ta, tb),
            },
            restore: B.has('relay_restore')?.props,
            thief: { welcomed: !!thief.last('welcome'), matched: !!thief.last('match') },
        };
        expect(ta.length).toBeGreaterThan(10);
        expect(diverge(ta, ts)).toBe(-1);
        expect(diverge(tb, ts)).toBe(-1);
        expect(diverge(ta, tb)).toBe(-1);
        expect(boundA - m.a.closedAt).toBeLessThan(PARTY_LIMITS.restoreEveryMs + 2500);
    });

    it('SIGKILL mid-match: after the restore both players share one game again, equal to the stored log', async () => {
        const store = new MeteredStore();
        const A = proc(store);
        const B = proc(store); // the second relay is up already (the DigitalOcean overlap, or a fast autoheal)
        await Promise.all([A.start(), B.start()]);
        const m = await partyMatch(A.port);
        clients.push(m.a, m.b);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 150, 40_000);
        A.kill('SIGKILL');
        stop1();
        const killedAt = Date.now();
        await A.exited();
        const lastSeen = m.a.turns[m.a.turns.length - 1].turn;
        const ckpt = store.rooms.get(m.ma.room)!.lastTurn;

        const [ra, rb] = await Promise.all([
            reconnect(B.port, m.wa.resumeToken, 'player-a-key-0001', 250, PARTY_LIMITS.staleLeaseMs + 15_000),
            reconnect(B.port, m.wb.resumeToken, 'player-b-key-0001', 250, PARTY_LIMITS.staleLeaseMs + 15_000),
        ]);
        const boundAt = Date.now();
        clients.push(ra.c, rb.c);
        expect(ra.c.last('match')!.you.slot).toBe(m.ma.you.slot);
        ra.c.send({ t: 'sync', fromTurn: lastSeen + 1 });
        rb.c.send({ t: 'sync', fromTurn: lastSeen + 1 });
        ra.c.send({ t: 'back' });
        rb.c.send({ t: 'back' });
        const stop2 = play(ra.c, rb.c);
        await ra.c.until(() => ra.c.turns.some(t => t.turn > lastSeen + 60), 30_000);
        await rb.c.until(() => rb.c.turns.some(t => t.turn > lastSeen + 60), 30_000);
        stop2();
        await wait(PARTY_LIMITS.checkpointEveryMs + 1500);
        const row = store.rooms.get(m.ma.room)!;
        const resynced = ra.c.json.some(j => j.t === 'resync');
        // after a resync the client rebuilds from turn 0 of what it receives now (the restored log)
        const ta = resynced ? trailOf(row, ra.c.turns) : trailOf(row, m.a.turns, ra.c.turns);
        const tb = rb.c.json.some(j => j.t === 'resync')
            ? trailOf(row, rb.c.turns)
            : trailOf(row, m.b.turns, rb.c.turns);
        const ts = storedTrail(row);
        const before = trailOf(row, m.a.turns);
        report.sigkill = {
            lostTurns: lastSeen + 1 - ckpt,
            lostMs: Math.round(((lastSeen + 1 - ckpt) * 2 * 1000) / 30),
            bindMs: boundAt - killedAt,
            freezeMs: ra.c.firstTurnAt - m.a.lastTurnAt,
            ui: ui(killedAt, boundAt),
            resync: { a: resynced, b: rb.c.json.some(j => j.t === 'resync') },
            hashes: {
                afterVsStored: { a: diverge(ta, ts), b: diverge(tb, ts) },
                // the pre-crash game equals the stored one up to the checkpoint, then the last turns replay differently
                beforeVsStoredFirstDiff: diverge(before, ts),
                checkpointTrailIndex: Math.floor((ckpt * 2) / 30),
            },
        };
        expect(resynced).toBe(lastSeen + 1 > ckpt);
        expect(diverge(ta, ts)).toBe(-1);
        expect(diverge(tb, ts)).toBe(-1);
        const d = diverge(before, ts);
        expect(d === -1 || d >= Math.floor((ckpt * 2) / 30) - 1).toBe(true);
        expect(boundAt - killedAt).toBeLessThan(PARTY_LIMITS.staleLeaseMs + PARTY_LIMITS.restoreEveryMs + 5000);
    });

    it(`a room on an older sim (v${OLD_SIM}) moves to the new relay and keeps its version`, async () => {
        expect(simFor(OLD_SIM)?.party).toBeTruthy();
        const store = new MeteredStore();
        const A = proc(store, { RELAY_DRAIN_MAX_MS: '1000' });
        await A.start();
        const m = await partyMatch(A.port, OLD_SIM);
        clients.push(m.a, m.b);
        expect(store.rooms.get(m.ma.room)!.simVersion).toBe(OLD_SIM);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 60, 40_000);
        const B = proc(store);
        await B.start();
        A.kill('SIGTERM');
        await m.a.until(() => m.a.closed, 15_000);
        stop1();
        const [ra, rb] = await Promise.all([
            reconnect(B.port, m.wa.resumeToken, 'player-a-key-0001', 0, 15_000, OLD_SIM),
            reconnect(B.port, m.wb.resumeToken, 'player-b-key-0001', 0, 15_000, OLD_SIM),
        ]);
        clients.push(ra.c, rb.c);
        const last = m.a.turns[m.a.turns.length - 1].turn;
        ra.c.send({ t: 'sync', fromTurn: last + 1 });
        rb.c.send({ t: 'sync', fromTurn: 0 });
        const stop2 = play(ra.c, rb.c);
        await ra.c.until(() => ra.c.turns.some(t => t.turn > last + 45), 30_000);
        stop2();
        await wait(PARTY_LIMITS.checkpointEveryMs + 1500);
        const row = store.rooms.get(m.ma.room)!;
        expect(B.has('relay_restore')?.props.simVersion).toBe(OLD_SIM);
        const ts = storedTrail(row);
        const ta = trailOf(row, m.a.turns, ra.c.turns);
        report.oldSim = {
            simVersion: row.simVersion,
            restore: B.has('relay_restore')?.props,
            aVsStored: diverge(ta, ts),
        };
        expect(diverge(ta, ts)).toBe(-1);
        expect(diverge(trailOf(row, rb.c.turns), ts)).toBe(-1);
    });
});

describe('live-match deploys, in-process adversarial checks', () => {
    jest.setTimeout(120_000);
    const relays: PartyRelay[] = [];
    const servers: Server[] = [];
    const clients: TestClient[] = [];
    afterEach(async () => {
        for (const c of clients.splice(0)) c.close();
        for (const r of relays.splice(0)) await r.shutdown();
        for (const s of servers.splice(0)) await new Promise(r => s.close(() => r(undefined)));
    });
    async function relayOn(store: MemoryRoomStore, logs: Logged[], now?: () => number) {
        const server = createServer();
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        servers.push(server);
        const relay = new PartyRelay({
            server,
            store,
            tickets: new PartyTicketService(),
            referee: new RefereePool({ inline: true }),
            originAllowed: () => true,
            gate: new LoopGate(() => 0),
            log: (event, props) => logs.push({ event, props }),
            ...(now ? { now } : {}),
        });
        relays.push(relay);
        await relay.restore();
        return { relay, port: (server.address() as AddressInfo).port };
    }

    it('a draining relay starts no new room: a rematch vote in the results tail moves the party to the new relay', async () => {
        const store = new MemoryRoomStore();
        const la: Logged[] = [];
        const A = await relayOn(store, la);
        const a = new Player(A.port);
        const b = new Player(A.port);
        clients.push(a, b);
        await Promise.all([a.open(), b.open()]);
        a.hello(helloFor('start-a-key-00001'));
        b.hello(helloFor('start-b-key-00001'));
        const wa = await a.until(() => a.last('welcome'));
        const wb = await b.until(() => b.last('welcome'));
        a.send({ t: 'party.create', difficulty: 'normal' });
        const pa = await a.until(() => a.last('party'));
        b.send({ t: 'party.join', code: pa.code });
        await a.until(() => a.last('party')?.members.length === 2);
        // the party is on its results screen (a match just ended: the drain keeps it here for its 5 s results tail) and
        // the leader votes for a rematch while the relay drains
        const party = (A.relay as any).parties.partyOf(wa.member);
        party.phase = 'results';
        (A.relay as any).partyEndedAt.set(party.id, Date.now());
        A.relay.drain('sigterm', 60_000);
        await wait(100);
        expect(a.closed).toBeNull();
        a.send({ t: 'vote', kind: 'rematch', yes: true });
        await a.until(() => a.closed, 5000);
        expect(a.closed!.code).toBe(1012);
        expect(a.json.some(j => j.t === 'party' && j.phase === 'pick')).toBe(false);
        const B = await relayOn(store, []);
        const back = new Player(B.port);
        clients.push(back);
        await back.open();
        back.hello({ ...helloFor('start-a-key-00001'), resume: { token: wa.resumeToken } });
        await back.until(() => back.last('party'), 5000);
        expect(back.last('party')!.code).toBe(pa.code);
        void wb;
        // nothing is left on the draining relay: its drain completes without a room
        expect(A.relay.counters().rooms_live ?? 0).toBe(0);
    });

    it('memory: ended-party stamps are swept; no relay timer outlives shutdown', async () => {
        let t = Date.now();
        const store = new MemoryRoomStore();
        const A = await relayOn(store, [], () => t);
        (A.relay as any).partyEndedAt.set('old-party', t);
        t += 61_000;
        (A.relay as any).sweep();
        expect(A.relay.memo().partyEnded).toBe(0);

        const before = activeResources().filter((x: string) => x === 'Timeout').length;
        const r2 = await relayOn(store, []);
        r2.relay.drain('generation', 1000);
        await r2.relay.shutdown();
        relays.splice(relays.indexOf(r2.relay), 1);
        await wait(50);
        const after = activeResources().filter((x: string) => x === 'Timeout').length;
        expect(after).toBeLessThanOrEqual(before);
        const memo = r2.relay.memo();
        expect(memo.partySaves + memo.pulling).toBe(0);
    });
});

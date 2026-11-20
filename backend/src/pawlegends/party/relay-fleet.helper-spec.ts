import { fork, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { CMD_OP, PROTO_REDIRECT, WS_PATH, relayPath } from './net';
import { PARTY_LIMITS } from './party-limits';
import type { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * A fleet of relay processes for the relay-shard acceptance tests (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15): each
 * relay runs in its own forked process (test/relay-proc.harness.ts) on one shared store held by the test, behind the
 * round-robin proxy (test/rr-proxy.ts). `Player` dials the way the game's PartySocket does: it follows `relay_redirect`
 * to the shard path, and when a path keeps failing it tries the next one it knows (the front door, then the shards the
 * API lists, read here from the store).
 */

const HARNESS = resolve(__dirname, '../../../test/relay-proc.harness.ts');

export type Logged = { event: string; props: Record<string, unknown> };

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

export class RelayProc {
    readonly logs: Logged[] = [];
    port = 0;
    exit: { code: number | null; signal: string | null } | null = null;
    private readonly child: ChildProcess;
    private readonly ready: Promise<void>;
    private stateWaiters: ((s: { state: string; counters: Record<string, number> }) => void)[] = [];

    constructor(store: MemoryRoomStore, env: Record<string, string> = {}) {
        this.child = fork(HARNESS, [], {
            execArgv: ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register'],
            // no pod-like HOSTNAME leaks in: the deployment id comes from RELAY_DEPLOY_ID only
            env: { ...process.env, HOSTNAME: 'spec-host', ...env, TS_NODE_TRANSPILE_ONLY: '1' },
            serialization: 'advanced',
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        this.ready = new Promise((ok, fail) => {
            this.child.on('message', async (msg: any) => {
                if (msg.ready) {
                    this.port = msg.port;
                    ok();
                } else if (msg.log) this.logs.push(msg.log);
                else if (msg.counters) this.stateWaiters.splice(0).forEach(w => w(msg));
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
        this.ready.catch(() => undefined);
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

    count(event: string): number {
        return this.logs.filter(l => l.event === event).length;
    }

    /** serving, draining or stopped, and the counters, from the process itself. */
    state(): Promise<{ state: string; counters: Record<string, number> }> {
        return new Promise(r => {
            this.stateWaiters.push(r);
            this.child.send({ cmd: 'counters' });
        });
    }
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function until<T>(pred: () => T | undefined | null | false, ms = 10_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const v = pred();
        if (v) return v;
        if (Date.now() > end) throw new Error('timeout');
        await wait(25);
    }
}

/** The shards `GET /pawlegends/relays` would list now (the `mm` lease holder first), read from the shared store. */
export function listedShards(store: MemoryRoomStore): string[] {
    const now = Date.now();
    const lease = store.leases.get('mm');
    const leader = lease && lease.expiresAt.getTime() > now ? lease.owner : null;
    return [...store.relayRows.values()]
        .filter(
            r =>
                r.shard && r.path && r.state !== 'draining' && now - r.heartbeatAt.getTime() <= PARTY_LIMITS.relayDeadMs
        )
        .sort((a, b) => Number(b._id === leader) - Number(a._id === leader))
        .map(r => r.shard as string);
}

export interface DialResult {
    c: TestClient;
    /** Redirects followed. */
    hops: number;
    /** Paths dialed, in order (for the assertions and the failure messages). */
    paths: string[];
    /** `server_moving` answers seen on the way. */
    moving: number;
}

/**
 * One session the way PartySocket runs it: dial `path`, `hello`, and once welcomed run `ask` (a join, a search, a
 * watch). A `relay_redirect` dials that shard's path at once and asks again; a refused or failed path tries the next
 * one it knows (`fallback`: the front door, then the listed shards). Resolves when `done` holds.
 */
export async function dial(
    port: number,
    opts: {
        path?: string;
        hello?: Record<string, unknown>;
        ask?: (c: TestClient) => void;
        done: (c: TestClient) => unknown;
        fallback?: () => string[];
        ms?: number;
        proto?: number;
    }
): Promise<DialResult> {
    const end = Date.now() + (opts.ms ?? 15_000);
    let path = opts.path ?? WS_PATH;
    const paths: string[] = [];
    let hops = 0;
    let moving = 0;
    let queue: string[] = [];
    for (;;) {
        if (Date.now() > end) throw new Error(`no session after ${paths.join(' → ')}`);
        paths.push(path);
        const c = new TestClient(port, 'http://localhost:3000', {}, path);
        await c.open();
        if (c.closed) {
            // 503 (no live process on that route): the next path this player knows
            if (!queue.length) queue = [WS_PATH, ...(opts.fallback?.() ?? []).map(s => relayPath(s))];
            path = queue.shift()!;
            await wait(100);
            continue;
        }
        c.hello({ proto: opts.proto ?? PROTO_REDIRECT, ...(opts.hello ?? {}) });
        let asked = false;
        const redirectOf = () => c.json.find(j => j.t === 'error' && j.code === 'relay_redirect');
        try {
            await c.until(() => {
                if (!asked && c.last('welcome')) {
                    asked = true;
                    opts.ask?.(c);
                }
                return opts.done(c) || redirectOf() || c.closed;
            }, Math.max(100, end - Date.now()));
        } catch {
            /* timed out: try again below */
        }
        if (opts.done(c)) return { c, hops, paths, moving };
        moving += c.json.filter(j => j.t === 'error' && j.code === 'server_moving').length;
        const r = redirectOf();
        c.close();
        if (r) {
            hops++;
            path = relayPath(r.shard);
            continue;
        }
        const retryMs = c.json.find(j => j.t === 'error' && typeof j.retryMs === 'number')?.retryMs;
        await wait(typeof retryMs === 'number' ? retryMs + 50 : 200);
    }
}

/** A party match of two humans on whatever relay `dial` lands them (bots fill the rest). */
export async function partyMatch(port: number, path = WS_PATH, fallback?: () => string[]) {
    const host = await dial(port, {
        path,
        fallback,
        ask: c => c.send({ t: 'party.create', difficulty: 'normal' }),
        done: c => c.last('party'),
    });
    const code = host.c.last('party')!.code as string;
    const friend = await dial(port, {
        path,
        fallback,
        ask: c => c.send({ t: 'party.join', code }),
        done: c => c.last('party')?.members.length === 2,
    });
    const a = host.c;
    const b = friend.c;
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
    return { a, b, wa: a.last('welcome')!, wb: b.last('welcome')!, ma, mb, code };
}

/** Scripted inputs: each client moves somewhere new every 200 ms and beats (so its slot stays human). */
export function play(...clients: TestClient[]): () => void {
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
export const byTurn = (...clients: TestClient[]) => {
    const m = new Map<number, string>();
    for (const c of clients) for (const t of c.turns) m.set(t.turn, JSON.stringify(t.entries));
    return m;
};

/** First turn in `from..to` where both maps hold different inputs, or -1. */
export const sameLog = (x: Map<number, string>, y: Map<number, string>, from: number, to: number) => {
    for (let t = from; t <= to; t++) if (x.has(t) && y.has(t) && x.get(t) !== y.get(t)) return t;
    return -1;
};

export const contiguous = (...turns: { turn: number }[][]) => {
    const ns = [...new Set(turns.flat().map(t => t.turn))].sort((p, q) => p - q);
    return ns.every((v, i) => v === i);
};

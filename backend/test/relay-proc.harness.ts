/*
 * One party relay in its own process, for the live-match deploy e2e spec
 * (src/pawlegends/party/live-deploy.e2e.spec.ts, docs/plans/moba/LIVE-MATCH-DEPLOYS.md §9). The parent test forks two
 * of these and kills them for real (SIGTERM for a planned deploy, SIGKILL for a crash). The room store lives in the
 * parent and is reached over the fork IPC channel (`serialization: 'advanced'` keeps Dates), so both processes share
 * one store the way two containers share one Mongo database.
 *
 * SIGTERM does what PartyRelayService.beforeApplicationShutdown does: drain for RELAY_DRAIN_MAX_MS, then shut down.
 */
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { drainMaxMsFrom } from '../src/pawlegends/party/party-limits';
import { PartyRelay } from '../src/pawlegends/party/party-relay';
import { PartyTicketService } from '../src/pawlegends/party/party-ticket.service';
import { RefereePool } from '../src/pawlegends/party/referee-pool';
import type { RoomStore } from '../src/pawlegends/party/room-store';
import { LoopGate } from '../src/pawlegends/party/loop-gate';

type Reply = { rpc: number; ok: boolean; v?: unknown; err?: { message: string; code?: number } };

const send = (m: unknown) => process.send?.(m);

/** The IPC channel turns a Buffer into a plain Uint8Array: the turn log chunks become Buffers again. */
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
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
let nextId = 1;

/** Every RoomStore method is a call into the parent's MemoryRoomStore. */
const store = new Proxy({} as RoomStore, {
    get(_t, m) {
        if (typeof m !== 'string' || m === 'then') return undefined;
        return (...a: unknown[]) =>
            new Promise((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve, reject });
                send({ rpc: id, m, a });
            });
    },
});

process.on('message', (msg: Reply | { cmd: string }) => {
    if ('rpc' in msg) {
        const p = pending.get(msg.rpc);
        if (!p) return;
        pending.delete(msg.rpc);
        if (msg.ok) p.resolve(buffers(msg.v));
        else p.reject(Object.assign(new Error(msg.err?.message ?? 'store error'), { code: msg.err?.code }));
        return;
    }
    if (msg.cmd === 'counters') send({ counters: relay.counters(), state: relay.relayState });
});

const server = createServer();
const relay = new PartyRelay({
    server,
    store,
    tickets: new PartyTicketService(),
    referee: new RefereePool({ inline: true }),
    originAllowed: () => true,
    gate: new LoopGate(() => 0),
    drainMaxMs: drainMaxMsFrom(),
    log: (event, props) => send({ log: { event, props } }),
});

let stopping = false;
process.on('SIGTERM', async () => {
    if (stopping) return;
    stopping = true;
    await relay.drain('sigterm', drainMaxMsFrom()).done;
    await relay.shutdown();
    server.close();
    process.exit(0);
});

server.listen(0, '127.0.0.1', async () => {
    await relay.restore();
    send({ ready: true, port: (server.address() as AddressInfo).port });
});

/*
 * The referee pool (MULTIPLAYER.md §3.3): max(1, min(4, cpus - 1)) worker threads; rooms are hashed to workers. Each
 * room keeps the worker it opened on. `inline: true` runs the same RefereeHost on the main thread, asynchronously
 * (specs and the e2e harness on small machines); production always uses workers.
 */
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { cpus } from 'os';
import { join } from 'path';
import { Worker } from 'worker_threads';
import { RefereeHost, type RefereeIn, type RefereeOut } from './referee-host';

interface Backend {
    post(m: RefereeIn): void;
    close(): Promise<void>;
}

export interface RefereePoolOptions {
    inline?: boolean;
    workers?: number;
}

export const defaultWorkers = (): number => Math.max(1, Math.min(4, cpus().length - 1));

function spawnWorker(onMsg: (m: RefereeOut) => void, onExit: (err: unknown) => void): Backend {
    const js = join(__dirname, 'referee.worker.js');
    const worker = existsSync(js)
        ? new Worker(js)
        : new Worker(
              `require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });` +
                  `require(${JSON.stringify(join(__dirname, 'referee.worker.ts'))});`,
              { eval: true }
          );
    worker.unref();
    worker.on('message', onMsg);
    worker.on('error', onExit);
    worker.on('exit', code => onExit(`exit ${code}`));
    return {
        post: m => {
            if (m.t === 'turn') worker.postMessage(m);
            else worker.postMessage(m);
        },
        close: async () => {
            await worker.terminate();
        },
    };
}

function inlineBackend(onMsg: (m: RefereeOut) => void): Backend {
    const queue: RefereeIn[] = [];
    let scheduled = false;
    const host = new RefereeHost(onMsg);
    const drain = () => {
        scheduled = false;
        while (queue.length) host.handle(queue.shift()!);
    };
    return {
        post: m => {
            queue.push(m);
            if (!scheduled) {
                scheduled = true;
                setImmediate(drain);
            }
        },
        close: async () => undefined,
    };
}

export class RefereePool {
    private readonly backends: Backend[] = [];
    private readonly roomWorker = new Map<string, number>();
    private verifySeq = 0;
    private readonly verifies = new Map<number, (m: Extract<RefereeOut, { t: 'verified' }>) => void>();
    /** Messages for rooms (hash, pilot, progress, end, error). */
    onRoom?: (m: Exclude<RefereeOut, { t: 'verified' }>) => void;
    /** A worker died: its rooms must be re-opened (the relay replays their logs). */
    onWorkerLost?: (rooms: string[]) => void;

    constructor(private readonly opts: RefereePoolOptions = {}) {
        const n = opts.inline ? 1 : opts.workers ?? defaultWorkers();
        for (let i = 0; i < n; i++) this.backends.push(this.start(i));
    }

    private start(i: number): Backend {
        const onMsg = (m: RefereeOut) => {
            if (m.t === 'verified') {
                const cb = this.verifies.get(m.id);
                this.verifies.delete(m.id);
                cb?.(m);
            } else this.onRoom?.(m);
        };
        if (this.opts.inline) return inlineBackend(onMsg);
        return spawnWorker(onMsg, () => {
            const lost = [...this.roomWorker].filter(([, w]) => w === i).map(([r]) => r);
            for (const r of lost) this.roomWorker.delete(r);
            this.backends[i] = this.start(i);
            if (lost.length) this.onWorkerLost?.(lost);
        });
    }

    get size(): number {
        return this.backends.length;
    }

    private workerOf(room: string): number {
        let w = this.roomWorker.get(room);
        if (w === undefined) {
            w = createHash('sha256').update(room).digest().readUInt32BE(0) % this.backends.length;
            this.roomWorker.set(room, w);
        }
        return w;
    }

    open(room: string, simVersion: number, simHash: string, config: Extract<RefereeIn, { t: 'open' }>['config']): void {
        this.backends[this.workerOf(room)].post({ t: 'open', room, simVersion, simHash, config });
    }

    turn(room: string, body: Uint8Array): void {
        const w = this.roomWorker.get(room);
        if (w !== undefined) this.backends[w].post({ t: 'turn', room, body });
    }

    close(room: string): void {
        const w = this.roomWorker.get(room);
        if (w !== undefined) this.backends[w].post({ t: 'close', room });
        this.roomWorker.delete(room);
    }

    /** §6 item 1: re-sim a stored room log and verify its record against the verdict (on a worker). */
    verify(
        simVersion: number,
        simHash: string,
        config: Extract<RefereeIn, { t: 'verify' }>['config'],
        log: Uint8Array,
        verdict: Extract<RefereeIn, { t: 'verify' }>['verdict']
    ) {
        const id = ++this.verifySeq;
        return new Promise<Extract<RefereeOut, { t: 'verified' }>>(resolve => {
            this.verifies.set(id, resolve);
            this.backends[id % this.backends.length].post({
                t: 'verify',
                id,
                simVersion,
                simHash,
                config,
                log,
                verdict,
            });
        });
    }

    async shutdown(): Promise<void> {
        await Promise.all(this.backends.map(b => b.close()));
    }
}

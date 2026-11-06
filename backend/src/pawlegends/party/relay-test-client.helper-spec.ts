import { WebSocket } from 'ws';
import { simFor } from '../../vendor/pawlegends-sim';
import {
    Frame,
    PROTO,
    SUBPROTOCOL,
    WS_PATH,
    decodeServerBinary,
    encodeBeat,
    encodeCmdFrame,
    encodeHash,
    type ServerBinary,
    type TurnFrame,
} from './net';

/* A headless party client for the relay specs (and mp/load.mjs): JSON in a list, TURNs in order. */

export const LIVE = simFor(11)!;
export const SIM_HASH = LIVE.SIM_SOURCE_HASH!;

export class TestClient {
    readonly ws: WebSocket;
    readonly json: Record<string, any>[] = [];
    readonly turns: TurnFrame[] = [];
    readonly binary: ServerBinary[] = [];
    closed: { code: number } | null = null;
    private waiters: (() => void)[] = [];
    seq = 0;

    constructor(port: number, origin: string | null = 'http://localhost:3000', headers: Record<string, string> = {}) {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`, SUBPROTOCOL, {
            headers: { ...(origin ? { origin } : {}), ...headers },
        });
        this.ws.on('message', (data, isBinary) => {
            if (isBinary) {
                const b = data as Buffer;
                const f = decodeServerBinary(new Uint8Array(b.buffer, b.byteOffset, b.length));
                this.binary.push(f);
                if (f.type === Frame.TURN) this.turns.push(f.f);
                if (f.type === Frame.CATCHUP) this.turns.push(...f.f.turns);
            } else this.json.push(JSON.parse(String(data)));
            this.waiters.splice(0).forEach(w => w());
        });
        this.ws.on('close', code => {
            this.closed = { code };
            this.waiters.splice(0).forEach(w => w());
        });
        this.ws.on('error', () => undefined);
        this.ws.on('unexpected-response', (_req, res) => {
            this.closed = { code: res.statusCode ?? 0 };
            this.waiters.splice(0).forEach(w => w());
        });
    }

    open(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState === WebSocket.OPEN) return resolve();
            this.ws.once('open', () => resolve());
            this.ws.once('error', reject);
            this.ws.once('unexpected-response', () => resolve());
        });
    }

    send(msg: Record<string, unknown>): void {
        this.ws.send(JSON.stringify(msg));
    }

    raw(data: string | Buffer | Uint8Array): void {
        this.ws.send(data);
    }

    hello(extra: Record<string, unknown> = {}): void {
        this.send({ t: 'hello', proto: PROTO, sim: 11, simHash: SIM_HASH, build: 'spec.1', ...extra });
    }

    cmd(bytes: Uint8Array): void {
        this.raw(encodeCmdFrame({ seq: ++this.seq, cmd: bytes }));
    }

    beat(): void {
        this.raw(
            encodeBeat({
                lastTurn: this.turns.length ? this.turns[this.turns.length - 1].turn : 0,
                clientMs: Date.now() >>> 0,
            })
        );
    }

    hash(tick: number, hash: number): void {
        this.raw(encodeHash({ tick, hash }));
    }

    async until<T>(pred: () => T | undefined | null | false, ms = 10_000): Promise<T> {
        const end = Date.now() + ms;
        for (;;) {
            const v = pred();
            if (v) return v;
            if (Date.now() > end)
                throw new Error(
                    `timeout waiting; closed ${JSON.stringify(this.closed)} state ${
                        this.ws.readyState
                    }; last json ${JSON.stringify(this.json.slice(-3))}`
                );
            await new Promise<void>(r => {
                const t = setTimeout(r, 50);
                this.waiters.push(() => {
                    clearTimeout(t);
                    r();
                });
            });
        }
    }

    last(t: string): Record<string, any> | undefined {
        for (let i = this.json.length - 1; i >= 0; i--) if (this.json[i].t === t) return this.json[i];
        return undefined;
    }

    close(): void {
        this.ws.close();
    }
}

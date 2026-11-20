/*
 * A round-robin, non-sticky TCP proxy in front of forked relays (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15 acceptance
 * tests), the way the DigitalOcean ingress routes them: every new connection picks the next process of its route, never
 * the one the client used before. Routes by the upgrade path, longest prefix first:
 *
 * - `/pawlegends/ws/<shard>` goes to that shard's processes (two of them while a deploy overlaps);
 * - `/pawlegends/ws` (the front door) goes to the `front` processes (shard a on DigitalOcean; every instance of the
 *   one service on today's spec);
 * - an unknown shard falls to the front door (the ingress matches the `/pawlegends/ws` prefix);
 * - a route with no live process answers 503, as the ingress does when a component has no healthy instance.
 *
 * Bytes are piped unchanged in both directions; the first request line is only read, never rewritten.
 */
import { createServer, connect, type Server, type Socket } from 'net';
import type { AddressInfo } from 'net';

export class RoundRobinProxy {
    private readonly server: Server;
    private readonly routes = new Map<string, number[]>();
    private readonly next = new Map<string, number>();
    private readonly open = new Set<Socket>();
    /** Connections per target port (the specs check that both instances were reached). */
    readonly hits = new Map<number, number>();
    port = 0;

    constructor() {
        this.server = createServer(c => this.onConnection(c));
    }

    listen(): Promise<number> {
        return new Promise(resolve =>
            this.server.listen(0, '127.0.0.1', () => {
                this.port = (this.server.address() as AddressInfo).port;
                resolve(this.port);
            })
        );
    }

    /** Route `key` ('front' or a shard name) to these ports, in round-robin order. */
    set(key: string, ports: number[]): void {
        this.routes.set(key, [...ports]);
    }

    private pick(key: string): number | null {
        const ports = this.routes.get(key) ?? [];
        if (!ports.length) return null;
        const i = (this.next.get(key) ?? 0) % ports.length;
        this.next.set(key, i + 1);
        return ports[i];
    }

    private onConnection(c: Socket): void {
        this.open.add(c);
        c.on('close', () => this.open.delete(c));
        c.on('error', () => undefined);
        let head = Buffer.alloc(0);
        const onData = (d: Buffer) => {
            head = Buffer.concat([head, d]);
            const end = head.indexOf('\r\n\r\n');
            if (end < 0 && head.length < 8192) return;
            c.off('data', onData);
            c.pause();
            const line = head.toString('latin1', 0, head.indexOf('\r\n'));
            const path = (line.split(' ')[1] ?? '').split('?')[0];
            const m = /^\/pawlegends\/ws\/([a-z0-9-]{1,16})$/.exec(path);
            // a shard with a route (even an empty one: no live process, 503); an unknown shard falls to the front door
            const port = this.pick(m && this.routes.has(m[1]) ? m[1] : 'front');
            if (port === null) {
                c.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
                return;
            }
            this.hits.set(port, (this.hits.get(port) ?? 0) + 1);
            const up = connect(port, '127.0.0.1', () => {
                up.write(head);
                c.pipe(up);
                up.pipe(c);
                c.resume();
            });
            this.open.add(up);
            up.on('close', () => {
                this.open.delete(up);
                c.destroy();
            });
            up.on('error', () => c.destroy());
            c.on('close', () => up.destroy());
        };
        c.on('data', onData);
    }

    close(): Promise<void> {
        for (const s of this.open) s.destroy();
        return new Promise(resolve => this.server.close(() => resolve()));
    }
}

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { RTT_MAX_MS, RTT_PER_REGION, RTT_TOTAL, RTT_WINDOW_MS, RelayRtt, pct, regionOfCountry } from './relay-rtt';
import { TestClient } from './relay-test-client.helper-spec';

/* LATENCY-PLAN M2: server-measured socket RTT by continent, in the relay counters (no IPs, no ids). */

describe('relay RTT store', () => {
    it('maps Cloudflare countries to continents; junk, XX and Tor are unknown', () => {
        expect(regionOfCountry('LT')).toBe('eu');
        expect(regionOfCountry('de')).toBe('eu');
        expect(regionOfCountry('US')).toBe('na');
        expect(regionOfCountry('BR')).toBe('sa');
        expect(regionOfCountry('JP')).toBe('as');
        expect(regionOfCountry('AE')).toBe('me');
        expect(regionOfCountry('NG')).toBe('af');
        expect(regionOfCountry('AU')).toBe('oc');
        expect(regionOfCountry(['FR', 'US'])).toBe('eu');
        for (const bad of ['XX', 'T1', '', 'LTU', undefined, null, 7]) expect(regionOfCountry(bad)).toBe('unknown');
    });

    it('percentiles: nearest rank, p95 sees the tail', () => {
        const r = new RelayRtt();
        for (let i = 0; i < 94; i++) r.add('eu', 40);
        for (let i = 0; i < 6; i++) r.add('eu', 300);
        r.add('na', 10);
        const c = r.counters();
        expect(c.rtt_ms_p50).toBe(40);
        expect(c.rtt_ms_p95).toBe(300);
        expect(c.rtt_n).toBe(101);
        expect(c.rtt_ms_p95_eu).toBe(300);
        expect(c.rtt_ms_p95_na).toBe(10);
        expect(Object.keys(c).sort()).toEqual(['rtt_ms_p50', 'rtt_ms_p95', 'rtt_ms_p95_eu', 'rtt_ms_p95_na', 'rtt_n']);
        expect(pct([], 0.95)).toBe(0);
    });

    it('is bounded: per region and in total, the newest samples win; stalls and junk are dropped', () => {
        const r = new RelayRtt();
        for (let i = 0; i < RTT_PER_REGION + 100; i++) r.add('eu', i < 100 ? 900 : 30);
        expect(r.counters().rtt_ms_p95_eu).toBe(30);
        for (let i = 0; i < RTT_TOTAL; i++) r.add('as', 70);
        expect(r.size).toBe(RTT_TOTAL);
        expect(r.counters().rtt_ms_p50).toBe(70);
        r.add('eu', -1);
        r.add('eu', RTT_MAX_MS + 1);
        r.add('eu', NaN);
        expect(r.size).toBe(RTT_TOTAL);
    });
});

describe('relay RTT window', () => {
    it('counts only the last minute: a quiet minute writes no region key and rtt_n 0', () => {
        const r = new RelayRtt();
        for (let i = 0; i < 50; i++) r.add('eu', 900, 1000);
        expect(r.counters(1000 + RTT_WINDOW_MS).rtt_ms_p95_eu).toBe(900);
        const later = r.counters(1001 + RTT_WINDOW_MS);
        expect(later.rtt_n).toBe(0);
        expect(Object.keys(later).filter(k => k.startsWith('rtt_ms_p95_'))).toEqual([]);
        r.add('eu', 40, 2 * RTT_WINDOW_MS);
        expect(r.counters(2 * RTT_WINDOW_MS)).toMatchObject({ rtt_n: 1, rtt_ms_p95_eu: 40 });
    });
});

describe('relay ping keeps the stamp of a pong still due', () => {
    it('a second ping while the first pong is out does not restart the clock; past RTT_MAX_MS it does', () => {
        let now = 1000;
        const pings: number[] = [];
        const s: any = { ws: { readyState: 1, ping: () => pings.push(now) }, pingAtMs: 0, region: 'eu' };
        const relay: any = Object.create(PartyRelay.prototype);
        relay.now = () => now;
        relay.rtt = new RelayRtt();
        relay.ping(s);
        now += 5000;
        relay.ping(s);
        expect(pings).toEqual([1000]);
        now += 1000;
        relay.onPong(s);
        expect(relay.rtt.counters(now).rtt_ms_p95_eu).toBe(6000);
        relay.ping(s);
        now += RTT_MAX_MS + 1;
        relay.ping(s);
        expect(pings).toEqual([1000, 7000, now]);
    });
});

describe('relay counters carry the server-measured RTT', () => {
    let server: Server;
    let relay: PartyRelay;
    let port: number;
    const clients: TestClient[] = [];

    beforeEach(async () => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'spec-secret-0123456789abcdef';
        server = createServer();
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        port = (server.address() as AddressInfo).port;
        relay = new PartyRelay({
            server,
            store: new MemoryRoomStore(),
            tickets: new PartyTicketService(),
            referee: new RefereePool({ inline: true }),
            originAllowed: o => o === 'http://localhost:3000',
            gate: new LoopGate(() => 0),
        });
    });

    afterEach(async () => {
        clients.splice(0).forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    });

    it('a ping and its pong become one sample under the continent; no IP or country in the counters', async () => {
        const c = new TestClient(port, 'http://localhost:3000', { 'cf-ipcountry': 'LT' });
        clients.push(c);
        await c.open();
        const any = relay as any;
        await c.until(() => any.socks.size === 1);
        expect(relay.counters()).toMatchObject({ rtt_ms_p50: 0, rtt_ms_p95: 0, rtt_n: 0 });
        expect(Object.keys(relay.counters()).filter(k => k.startsWith('rtt_ms_p95_'))).toEqual([]);
        for (const s of any.socks) any.ping(s);
        await c.until(() => relay.counters().rtt_n === 1);
        const k = relay.counters();
        expect(Object.keys(k).filter(x => x.startsWith('rtt_ms_p95_'))).toEqual(['rtt_ms_p95_eu']);
        expect(k.rtt_ms_p95).toBeGreaterThanOrEqual(0);
        expect(k.rtt_ms_p95).toBeLessThan(RTT_MAX_MS);
        const text = JSON.stringify(k);
        expect(text).not.toContain('127.0.0.1');
        expect(text).not.toContain('LT');
        // an unsolicited pong (no ping out) is not a sample
        c.ws.pong();
        await new Promise(r => setTimeout(r, 50));
        expect(relay.counters().rtt_n).toBe(1);
    });
});

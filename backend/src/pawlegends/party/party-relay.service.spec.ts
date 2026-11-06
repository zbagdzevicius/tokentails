import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import type { IncomingMessage } from 'http';
import { CMD_OP } from './net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/* Party play N2 (MULTIPLAYER.md §3.1, §3.5, §12 N2): the relay over real sockets (inline referee, memory store). */

const SECRET = 'spec-secret-0123456789abcdef';

async function boot(opts: { allowNoOrigin?: boolean; gate?: LoopGate } = {}) {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const store = new MemoryRoomStore();
    const tickets = new PartyTicketService();
    const events: string[] = [];
    const relay = new PartyRelay({
        server,
        store,
        tickets,
        referee: new RefereePool({ inline: true }),
        allowNoOrigin: opts.allowNoOrigin,
        originAllowed: o => o === 'http://localhost:3000',
        gate: opts.gate ?? new LoopGate(() => 0),
        log: e => events.push(e),
    });
    const clients: TestClient[] = [];
    const client = async (origin: string | null = 'http://localhost:3000', headers: Record<string, string> = {}) => {
        const c = new TestClient(port, origin, headers);
        clients.push(c);
        await c.open();
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { server, port, store, tickets, relay, client, stop, events };
}

describe('party relay (N2)', () => {
    jest.setTimeout(120_000);

    it('refuses a wrong or missing Origin with 403 (missing allowed only by the harness option)', async () => {
        const b = await boot();
        const bad = await b.client('https://evil.example');
        await bad.until(() => bad.closed);
        expect(bad.closed!.code).toBe(403);
        const none = await b.client(null);
        await none.until(() => none.closed);
        expect(none.closed!.code).toBe(403);
        await b.stop();
        const h = await boot({ allowNoOrigin: true });
        const ok = await h.client(null);
        ok.hello();
        await ok.until(() => ok.last('welcome'));
        await h.stop();
    });

    it('trusts cf-connecting-ip from our own hops only (Cloudflare, or the private ingress hop), never a public peer', () => {
        const req = (peer: string) =>
            ({
                socket: { remoteAddress: peer },
                headers: { 'cf-connecting-ip': '9.9.9.9' },
            } as unknown as IncomingMessage);
        // a public peer that is not Cloudflare (someone hitting the origin directly) cannot pick its address
        expect(PartyRelay.clientIp(req('8.8.4.4'))).toBe('8.8.4.4');
        expect(PartyRelay.clientIp(req('173.245.48.10'))).toBe('9.9.9.9');
        // behind the DigitalOcean ingress (a private hop) the visitor is the Cloudflare header, not the shared hop
        expect(PartyRelay.clientIp(req('10.0.0.1'))).toBe('9.9.9.9');
    });

    it('hello: update_required for an unknown sim hash or protocol; welcome otherwise', async () => {
        const b = await boot();
        const c = await b.client();
        c.hello({ simHash: '0000000000000000' });
        await c.until(() => c.last('error'));
        expect(c.last('error')!.code).toBe('update_required');
        const d = await b.client();
        d.hello({ proto: 99 });
        await d.until(() => d.last('error'));
        expect(d.last('error')!.code).toBe('update_required');
        const e = await b.client();
        e.hello();
        const w = await e.until(() => e.last('welcome'));
        expect(w.member).toMatch(/^[A-Za-z0-9_-]{16}$/);
        expect(w.resumeToken).toBeTruthy();
        await b.stop();
    });

    it('caps sockets per identity', async () => {
        const b = await boot();
        const socks: TestClient[] = [];
        for (let i = 0; i < 5; i++) {
            const c = await b.client();
            c.hello({ guestKey: 'same-guest-key-123' });
            socks.push(c);
        }
        await socks[4].until(() => socks[4].closed);
        expect(socks[4].last('error')!.code).toBe('rate_limited');
        await b.stop();
    });

    it('strikes: a malformed binary frame is a strike, 3 close; a JSON frame over 1 KB closes', async () => {
        const b = await boot();
        const c = await b.client();
        c.hello();
        await c.until(() => c.last('welcome'));
        for (let i = 0; i < 3; i++) c.raw(Buffer.from([0x01, 0x01, 0x63]));
        await c.until(() => c.closed);
        expect(c.closed!.code).toBe(4002);
        const d = await b.client();
        d.raw('x'.repeat(1025));
        await d.until(() => d.closed);
        expect(d.closed!.code).toBe(1009);
        await b.stop();
    });

    it('hello timeout: a socket that never says hello is closed after 5 s', async () => {
        const b = await boot();
        const c = await b.client();
        await c.until(() => c.closed, 7000);
        expect(c.closed!.code).toBe(4000);
        await b.stop();
    });

    it('JSON rate limit: a burst over 10 frames is refused with rate_limited', async () => {
        const b = await boot();
        const c = await b.client();
        c.hello();
        await c.until(() => c.last('welcome'));
        for (let i = 0; i < 12; i++) c.send({ t: 'party.leave' });
        await c.until(() => c.json.some(j => j.t === 'error' && j.code === 'rate_limited'));
        await b.stop();
    });

    it('a two-player party: create, join by code, shared pick, both humans in the turns; shutdown hands off', async () => {
        const b = await boot();
        const a = await b.client();
        a.hello();
        await a.until(() => a.last('welcome'));
        a.send({ t: 'party.create', difficulty: 'easy' });
        const pa = await a.until(() => a.last('party'));
        expect(pa.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
        const c = await b.client();
        c.hello();
        await c.until(() => c.last('welcome'));
        c.send({ t: 'party.join', code: pa.code.toLowerCase() });
        await a.until(() => a.last('party')?.members.length === 2 && a.last('party'));
        // peers never see each other's custom names or ids beyond the member id
        const view = a.last('party')!;
        expect(view.members.every((m: any) => /^[A-Z][a-z]+ [A-Z][A-Za-z]+( \d)?$/.test(m.name))).toBe(true);
        a.send({ t: 'party.start' });
        await a.until(() => a.last('party')?.phase === 'pick');
        a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
        c.send({ t: 'pick.lock', hero: 'clem', trick: 'snack' }); // taken: refused
        c.send({ t: 'pick.lock', hero: 'sage', trick: 'snack' });
        await a.until(() => a.last('party')?.phase === 'loading');
        a.send({ t: 'loaded' });
        c.send({ t: 'loaded' });
        const ma = await a.until(() => a.last('match'));
        const mc = await c.until(() => c.last('match'));
        expect(ma.you.slot).toBe(0);
        expect(mc.you.slot).toBe(1);
        expect(ma.config.humans).toEqual([0, 1]);
        expect(ma.config.picks[1]).toBe('sage');
        await a.until(() => a.turns.length > 10, 8000);
        c.cmd(new Uint8Array([CMD_OP.Move, 80, 0, 80, 0]));
        const beat = setInterval(() => {
            a.beat();
            c.beat();
        }, 300);
        await a.until(() => a.turns.some(t => t.entries.some(e => e.slot === 1 && e.cmd[0] === CMD_OP.Move)));
        expect(a.turns.map(t => t.turn)).toEqual(a.turns.map((_, i) => i));
        // shutdown: room_gone with a retry, and a final checkpoint with handoff
        clearInterval(beat);
        const room = [...b.store.rooms.values()][0];
        await b.relay.shutdown();
        await a.until(() => a.json.some(j => j.t === 'error' && j.code === 'room_gone' && j.retryMs === 3000));
        const stored = b.store.rooms.get(room._id)!;
        expect(stored.handoff).toBe(true);
        expect(stored.lastTurn).toBeGreaterThan(10);
        expect(stored.chunks.length).toBeGreaterThan(0);
        await new Promise(r => b.server.close(r));
    });

    it('server_busy when the event loop is slow; the party stays', async () => {
        let p99 = 0;
        const b = await boot({ gate: new LoopGate(() => p99) });
        const a = await b.client();
        a.hello();
        await a.until(() => a.last('welcome'));
        a.send({ t: 'party.create', difficulty: 'easy' });
        const pa = await a.until(() => a.last('party'));
        a.send({ t: 'party.set', openSeats: true });
        await a.until(() => a.last('party')?.openSeats);
        p99 = 50;
        a.send({ t: 'party.start' });
        await a.until(() => a.last('party')?.phase === 'pick');
        a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
        await a.until(() => a.json.some(j => j.t === 'error' && j.code === 'server_busy'));
        expect(pa.code).toBeTruthy();
        await b.stop();
    });

    it('a second tab resuming the same seat takes it; the first tab gets seat_elsewhere', async () => {
        const b = await boot();
        const first = await b.client();
        first.hello();
        const w = await first.until(() => first.last('welcome'));
        first.send({ t: 'party.create', difficulty: 'easy' });
        await first.until(() => first.last('party'));
        const second = await b.client();
        second.hello({ resume: { token: w.resumeToken } });
        const w2 = await second.until(() => second.last('welcome'));
        expect(w2.member).toBe(w.member);
        expect(w2.resumeToken).not.toBe(w.resumeToken);
        await first.until(() => first.json.some(j => j.t === 'error' && j.code === 'seat_elsewhere'));
        await first.until(() => first.closed);
        await b.stop();
    });
});

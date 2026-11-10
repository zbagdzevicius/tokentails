import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PARTY_LIMITS } from './party-limits';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §4, §5, §9): two relays share one store, each on its own
 * port (the load balancer's choice is the port a client dials). Real clock: a party match runs at 15 turns a second.
 */

type Logged = { event: string; props: Record<string, unknown> };

async function listen(): Promise<{ server: Server; port: number }> {
    const server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    return { server, port: (server.address() as AddressInfo).port };
}

function relayOn(server: Server, store: MemoryRoomStore, logs: Logged[] = [], pool?: string) {
    return new PartyRelay({
        pool,
        server,
        store,
        tickets: new PartyTicketService(),
        referee: new RefereePool({ inline: true }),
        originAllowed: () => true,
        gate: new LoopGate(() => 0),
        log: (event, props) => {
            logs.push({ event, props });
            if (event === 'relay_error') console.log('relay_error', props);
        },
    });
}

/** Two humans in a party match (bots fill the rest); both clients keep beating so their slots stay human. */
async function partyMatch(port: number, helloA: Record<string, unknown> = {}) {
    const a = new TestClient(port);
    const b = new TestClient(port);
    await Promise.all([a.open(), b.open()]);
    a.hello(helloA);
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
    return { a, b, wa, wb, ma, mb, code: pa.code as string };
}

/** Reconnect with a resume token until a welcome comes (a draining relay or a pending pull closes the socket first). */
async function rejoin(
    port: number,
    token: string,
    ms = 10_000,
    extra: Record<string, unknown> = {}
): Promise<{ c: TestClient; tries: number }> {
    const end = Date.now() + ms;
    let tries = 0;
    for (;;) {
        tries++;
        const c = new TestClient(port);
        await c.open();
        c.hello({ ...extra, resume: { token } });
        try {
            await c.until(() => c.last('welcome') || c.closed, Math.max(100, end - Date.now()));
        } catch {
            /* timed out: fall through */
        }
        if (c.last('welcome')) return { c, tries };
        c.close();
        if (Date.now() > end) throw new Error(`no welcome after ${tries} tries`);
        await new Promise(r => setTimeout(r, 150));
    }
}

const turnNumbers = (...clients: TestClient[]) =>
    [...new Set(clients.flatMap(c => c.turns.map(t => t.turn)))].sort((x, y) => x - y);
const contiguous = (ns: number[]) => ns.every((n, i) => n === i);
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

describe('live-match deploys (LIVE-MATCH-DEPLOYS.md)', () => {
    jest.setTimeout(120_000);
    const open: { relays: PartyRelay[]; servers: Server[]; clients: TestClient[] } = {
        relays: [],
        servers: [],
        clients: [],
    };
    beforeAll(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'drain-secret-0123456789';
    });
    afterEach(async () => {
        for (const c of open.clients.splice(0)) c.close();
        for (const r of open.relays.splice(0)) await r.shutdown();
        for (const s of open.servers.splice(0)) await new Promise(r => s.close(() => r(undefined)));
    });
    const track = <T extends PartyRelay | Server | TestClient>(x: T): T => {
        if (x instanceof PartyRelay) open.relays.push(x);
        else if (x instanceof TestClient) open.clients.push(x);
        else open.servers.push(x as Server);
        return x;
    };

    it('DigitalOcean order: the new relay is ready first; the old one drains, hands off on SIGTERM, and the new one claims without a boot restore', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        const logsA: Logged[] = [];
        const logsB: Logged[] = [];
        const relayA = track(relayOn(one.server, store, logsA));
        await relayA.restore();
        const m = await partyMatch(one.port);
        track(m.a);
        track(m.b);
        await m.a.until(() => m.a.turns.length >= 30, 15_000);
        const roomId = m.ma.room as string;

        // the new container boots and becomes ready: the old one starts draining by itself (§4.4)
        const relayB = track(relayOn(two.server, store, logsB));
        expect(await relayB.restore()).toEqual([]);
        // ready but not routed to yet (DigitalOcean health-checks it first): standby, the old relay keeps serving
        await wait(PARTY_LIMITS.restoreEveryMs + 400);
        expect(relayA.relayState).toBe('serving');
        expect([...store.relayRows.values()].map(r => r.state).sort()).toEqual(['serving', 'standby']);
        // the load balancer routes to it: its first socket makes it the newest generation
        await track(new TestClient(two.port)).open();
        await until(() => relayA.relayState === 'draining', 5000);
        expect(logsA.find(l => l.event === 'relay_drain_start')?.props.trigger).toBe('generation');
        // the live room keeps playing on the draining relay
        const before = m.a.turns.length;
        await wait(700);
        expect(m.a.turns.length).toBeGreaterThan(before + 5);
        expect(relayA.counters().rooms_live).toBe(1);

        // SIGTERM with no time left: push handoff; clients are told to come back at once
        await relayA.drain('sigterm', 0).done;
        await relayA.shutdown();
        await m.a.until(() => m.a.closed);
        expect(m.a.closed!.code).toBe(1012);
        const gone = m.a.json.find(j => j.t === 'error' && j.code === 'room_gone');
        expect(gone?.retryMs).toBe(0);
        const handedTurn = store.rooms.get(roomId)!.lastTurn;
        expect(store.rooms.get(roomId)!.handoff).toBe(true);

        // B's restore loop claims the room (no explicit restore() call)
        const t0 = Date.now();
        await until(() => relayB.counters().rooms_live === 1, 3000);
        expect(Date.now() - t0).toBeLessThan(PARTY_LIMITS.restoreEveryMs + 1500);
        // §5.5: the restored room holds its clock until its humans are back
        const held = relayB.roomOfParty(store.rooms.get(roomId)!.party)!.room.nextTurn;
        expect(held).toBe(handedTurn);
        await wait(400);
        expect(relayB.roomOfParty(store.rooms.get(roomId)!.party)!.room.nextTurn).toBe(held);

        // both players come back with their tokens: the same member, the same room, the same slot
        const a2 = track((await rejoin(two.port, m.wa.resumeToken)).c);
        const b2 = track((await rejoin(two.port, m.wb.resumeToken)).c);
        expect(a2.last('welcome')!.member).toBe(m.wa.member);
        expect(b2.last('welcome')!.member).toBe(m.wb.member);
        const ma2 = await a2.until(() => a2.last('match'));
        const mb2 = await b2.until(() => b2.last('match'));
        expect(ma2.room).toBe(roomId);
        expect(ma2.you.slot).toBe(m.ma.you.slot);
        expect(mb2.you.slot).toBe(m.mb.you.slot);
        const lastA = m.a.turns[m.a.turns.length - 1].turn;
        a2.send({ t: 'sync', fromTurn: lastA + 1 });
        await a2.until(() => a2.turns.some(t => t.turn > held + 15), 10_000);
        // the clock was released as soon as both humans were bound, well inside the 2 s budget
        const restored = logsB.find(l => l.event === 'relay_restore');
        expect(restored).toBeDefined();
        expect(Number(restored!.props.gapMs)).toBeLessThan(3000);
        // no turn skipped or repeated across the move
        expect(contiguous(turnNumbers(m.a, a2))).toBe(true);
    });

    it('pull: a player whose socket lands on the new relay first gets the room at once; the other follows', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        const logsA: Logged[] = [];
        const relayA = track(relayOn(one.server, store, logsA));
        await relayA.restore();
        const m = await partyMatch(one.port);
        track(m.a);
        track(m.b);
        await m.a.until(() => m.a.turns.length >= 20, 15_000);
        const roomId = m.ma.room as string;
        const relayB = track(relayOn(two.server, store));
        await relayB.restore();
        await track(new TestClient(two.port)).open();
        await until(() => relayA.relayState === 'draining', 5000);

        // player a's network drops; the reconnect reaches the new relay, which pulls the room from the draining one
        m.a.close();
        const t0 = Date.now();
        const { c: a2 } = await rejoin(two.port, m.wa.resumeToken);
        track(a2);
        const pullMs = Date.now() - t0;
        expect(a2.last('welcome')!.member).toBe(m.wa.member);
        const ma2 = await a2.until(() => a2.last('match'));
        expect(ma2.room).toBe(roomId);
        expect(ma2.you.slot).toBe(m.ma.you.slot);
        expect(pullMs).toBeLessThan(PARTY_LIMITS.pullHoldMs + 1000);
        expect(logsA.find(l => l.event === 'relay_handoff')?.props.reason).toBe('pull');
        // player b, still on the old relay, was told to come back at once
        await m.b.until(() => m.b.closed);
        expect(m.b.json.find(j => j.t === 'error' && j.code === 'room_gone')?.retryMs).toBe(0);
        const { c: b2 } = await rejoin(two.port, m.wb.resumeToken);
        track(b2);
        expect((await b2.until(() => b2.last('match'))).room).toBe(roomId);
        const lastA = m.a.turns[m.a.turns.length - 1].turn;
        a2.send({ t: 'sync', fromTurn: lastA + 1 });
        await a2.until(() => a2.turns.length > 20, 10_000);
        expect(contiguous(turnNumbers(m.a, a2))).toBe(true);
        expect(store.rooms.get(roomId)!.epoch).toBe(1);
    });

    it('drain: readiness flips at once, new sockets move, a lobby party moves with its code, live rooms play on until the deadline push', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        const logsA: Logged[] = [];
        const relayA = track(relayOn(one.server, store, logsA));
        await relayA.restore();
        const m = await partyMatch(one.port);
        track(m.a);
        track(m.b);
        // a lobby party on the same relay
        const d = track(new TestClient(one.port));
        await d.open();
        d.hello();
        const wd = await d.until(() => d.last('welcome'));
        d.send({ t: 'party.create', difficulty: 'easy' });
        const pd = await d.until(() => d.last('party'));
        await m.a.until(() => m.a.turns.length >= 10, 15_000);

        const out = relayA.drain('endpoint', 60_000);
        expect(relayA.draining).toBe(true); // same tick: /readyz reads this
        expect(out.rooms_live).toBe(1);
        // idempotent: a second call keeps the sooner deadline
        expect(relayA.drain('endpoint', 120_000).deadlineMs).toBe(out.deadlineMs);

        // the lobby party is handed over, its member told to move
        await d.until(() => d.closed);
        expect(d.closed!.code).toBe(1012);
        expect(d.json.some(j => j.t === 'error' && j.code === 'server_moving')).toBe(true);
        const row = [...store.parties.values()].find(p => p.code === pd.code);
        expect(row?.handoff).toBe(true);

        // a new socket on the draining relay is sent on
        const c = track(new TestClient(one.port));
        await c.open();
        c.hello();
        await c.until(() => c.closed);
        expect(c.closed!.code).toBe(1012);
        expect(c.last('welcome')).toBeUndefined();

        // the live room keeps advancing on the draining relay
        const n = m.a.turns.length;
        await wait(600);
        expect(m.a.turns.length).toBeGreaterThan(n + 4);

        // the new relay claims the lobby party: same member, same code
        const relayB = track(relayOn(two.server, store));
        await relayB.restore();
        const { c: d2 } = await rejoin(two.port, wd.resumeToken);
        track(d2);
        expect(d2.last('welcome')!.member).toBe(wd.member);
        const pd2 = await d2.until(() => d2.last('party'));
        expect(pd2.code).toBe(pd.code);

        // the deadline: the room is pushed; the endpoint drain stops the relay
        await relayA.drain('endpoint', 0).done;
        await until(() => relayA.relayState === 'stopped', 5000);
        expect(store.rooms.get(m.ma.room)!.status).toBe('live');
        expect(logsA.some(l => l.event === 'relay_handoff' && l.props.reason === 'deadline')).toBe(true);
        expect(logsA.some(l => l.event === 'relay_drain_done')).toBe(true);
    });

    it('generations: a newer ready relay makes the older one drain; a stale row does not; when the newer one goes, it serves again', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        track(one.server);
        const relay = track(relayOn(one.server, store));
        await relay.restore();
        expect(relay.relayState).toBe('serving');
        await track(new TestClient(one.port)).open();
        // a row nobody refreshed for a minute: ignored
        await store.heartbeat({
            _id: 'old-dead',
            state: 'serving',
            readyAt: new Date(Date.now() + 1000),
            heartbeatAt: new Date(Date.now() - 60_000),
            simVersions: [],
        });
        await wait(PARTY_LIMITS.restoreEveryMs + 400);
        expect(relay.relayState).toBe('serving');
        // a live, newer relay of another pool (the GCP relay VM in the shadow phase, same database): ignored
        await store.heartbeat({
            _id: 'other-pool',
            state: 'serving',
            readyAt: new Date(Date.now() + 1000),
            heartbeatAt: new Date(),
            simVersions: [],
            pool: 'vm',
        });
        await wait(PARTY_LIMITS.restoreEveryMs + 400);
        expect(relay.relayState).toBe('serving');
        store.relayRows.delete('other-pool');
        // a live, newer relay
        await store.heartbeat({
            _id: 'newer',
            state: 'serving',
            readyAt: new Date(Date.now() + 1000),
            heartbeatAt: new Date(),
            simVersions: [],
        });
        await until(() => relay.relayState === 'draining', 3000);
        // the newer relay stops heartbeating (a failed deploy, a crash): this one serves again
        store.relayRows.delete('newer');
        await until(() => relay.relayState === 'serving', 3000);
    });

    it('a signed-in player keeps the account across the move: the spent ticket plus the resume token resume on the new relay', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        const relayA = track(relayOn(one.server, store));
        await relayA.restore();
        // tt-api mints the ticket (another process, another boot id)
        const { ticket } = new PartyTicketService().issue({ accountId: 'acct-drain-1', guest: false });
        const m = await partyMatch(one.port, { ticket });
        track(m.a);
        track(m.b);
        await m.a.until(() => m.a.turns.length >= 10, 15_000);
        const relayB = track(relayOn(two.server, store));
        await relayB.restore();
        await relayA.drain('sigterm', 0).done;
        await relayA.shutdown();
        // the client re-sends its original (spent) ticket with the resume token, as socket.ts does
        const { c: a2 } = await rejoin(two.port, m.wa.resumeToken, 10_000, { ticket });
        track(a2);
        expect(a2.last('welcome')!.member).toBe(m.wa.member);
        expect(a2.json.some(j => j.t === 'error' && j.code === 'bad_ticket')).toBe(false);
        const ma2 = await a2.until(() => a2.last('match'));
        expect(ma2.you.slot).toBe(m.ma.you.slot);
        const roomId = m.ma.room as string;
        expect(store.rooms.get(roomId)!.occupants.some(o => o.accountId === 'acct-drain-1')).toBe(true);
    });

    it('pools: a relay of another pool never takes a handoff by itself, only when a player of that room reaches it (the GCP cutover)', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        // the GCP relay VM is up in the shadow phase (same database), then DigitalOcean deploys
        const vm = track(relayOn(two.server, store, [], 'vm'));
        await vm.restore();
        const app = track(relayOn(one.server, store, [], 'app'));
        await app.restore();
        expect(app.relayState).toBe('serving');
        const m = await partyMatch(one.port);
        track(m.a);
        track(m.b);
        await m.a.until(() => m.a.turns.length >= 10, 15_000);
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        expect(app.relayState).toBe('serving'); // a newer relay of another pool does not drain it
        await app.drain('sigterm', 0).done;
        await app.shutdown();
        const roomId = m.ma.room as string;
        expect(store.rooms.get(roomId)!.handoff).toBe(true);
        await wait(PARTY_LIMITS.restoreEveryMs * 2 + 300);
        expect(vm.counters().rooms_live).toBe(0); // left for DigitalOcean's next container
        // after the DNS flip the player reaches the VM: the pull claims the room across pools
        const { c: a2 } = await rejoin(two.port, m.wa.resumeToken);
        track(a2);
        expect((await a2.until(() => a2.last('match'))).room).toBe(roomId);
        expect(vm.counters().rooms_live).toBe(1);
    });

    it('hold: a restored room whose players do not come back starts after restoreHoldMs, for both teams at once', async () => {
        const store = new MemoryRoomStore();
        const one = await listen();
        const two = await listen();
        track(one.server);
        track(two.server);
        const relayA = track(relayOn(one.server, store));
        await relayA.restore();
        const m = await partyMatch(one.port);
        track(m.a);
        track(m.b);
        await m.a.until(() => m.a.turns.length >= 15, 15_000);
        const roomId = m.ma.room as string;
        const logsB: Logged[] = [];
        const relayB = track(relayOn(two.server, store, logsB));
        await relayB.restore();
        await relayA.drain('sigterm', 0).done;
        await relayA.shutdown();
        await until(() => relayB.counters().rooms_live === 1, 3000);
        const party = store.rooms.get(roomId)!.party;
        const held = relayB.roomOfParty(party)!.room.nextTurn;
        // nobody reconnects: the clock stays put for the hold, then runs (absent humans are piloted)
        await wait(PARTY_LIMITS.restoreHoldMs - 1000);
        expect(relayB.roomOfParty(party)!.room.nextTurn).toBe(held);
        await until(() => logsB.find(l => l.event === 'relay_restore'), 3000);
        await until(() => relayB.roomOfParty(party)!.room.nextTurn > held + 5, 3000);
        const restored = logsB.find(l => l.event === 'relay_restore')!;
        expect(restored.props.waiting).toBe(2);
        expect(Number(restored.props.gapMs)).toBeGreaterThanOrEqual(PARTY_LIMITS.restoreHoldMs - 50);
    });

    it('abandonLive leaves a handed-off room inside the restore window alone (a relay carrying its sim may claim it)', async () => {
        const store = new MemoryRoomStore();
        const now = Date.now();
        const row = (id: string, ageMs: number) =>
            ({
                _id: id,
                status: 'live',
                owner: 'gone',
                epoch: 1,
                handoff: true,
                updatedAt: new Date(now - ageMs),
            } as never);
        store.rooms.set('recent', row('recent', 60_000));
        store.rooms.set('expired', row('expired', PARTY_LIMITS.restoreWithinMs + 1000));
        expect(await store.abandonLive([], new Date(now))).toBe(1);
        expect(store.rooms.get('recent')!.status).toBe('live');
        expect(store.rooms.get('expired')!.status).toBe('abandoned');
    });
});

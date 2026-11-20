import { PartyTicketService } from './party-ticket.service';
import { PROTO_REDIRECT, WS_PATH, relayPath } from './net';
import { PARTY_LIMITS } from './party-limits';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';
import { RoundRobinProxy } from '../../../test/rr-proxy';
import {
    RelayProc,
    byTurn,
    contiguous,
    dial,
    listedShards,
    partyMatch,
    play,
    sameLog,
    until,
    wait,
} from './relay-fleet.helper-spec';

/*
 * Relay shards, across real processes behind a round-robin, non-sticky proxy (docs/plans/moba/LIVE-MATCH-DEPLOYS.md
 * §15, the Phase A acceptance tests). Each relay is its own forked process; they share one store held here the way
 * the DigitalOcean components share one Mongo database. The proxy routes `/pawlegends/ws/<shard>` to that shard's
 * processes and the front door `/pawlegends/ws` to shard a (or, for today's spec, to both instances of one service),
 * as the DigitalOcean ingress will.
 */

describe('relay shards across processes (LIVE-MATCH-DEPLOYS.md §15)', () => {
    jest.setTimeout(240_000);
    const procs: RelayProc[] = [];
    const clients: TestClient[] = [];
    let proxy: RoundRobinProxy;
    beforeAll(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'relay-shards-secret-0123456789';
    });
    beforeEach(async () => {
        proxy = new RoundRobinProxy();
        await proxy.listen();
    });
    afterEach(async () => {
        for (const c of clients.splice(0)) c.close();
        for (const p of procs.splice(0)) if (!p.exit) p.kill('SIGKILL');
        await proxy.close();
    });
    const proc = (store: MemoryRoomStore, env?: Record<string, string>) => {
        const p = new RelayProc(store, env);
        procs.push(p);
        return p;
    };
    /** Shard a (the front door, pool `app` so it inherits today's handoffs) and shard b; `a` holds the mm lease. */
    async function twoShards(store: MemoryRoomStore, extraA: Record<string, string> = {}) {
        const A = proc(store, { RELAY_SHARD: 'a', RELAY_POOL: 'app', ...extraA });
        await A.start();
        proxy.set('a', [A.port]);
        proxy.set('front', [A.port]);
        await until(() => A.has('relay_lease'), 10_000);
        const B = proc(store, { RELAY_SHARD: 'b' });
        await B.start();
        proxy.set('b', [B.port]);
        // both rows carry their shard and path, and each relay has read the other's row and the lease once
        await until(() => [...store.relayRows.values()].filter(r => r.path).length === 2, 10_000);
        await wait(PARTY_LIMITS.restoreEveryMs + 500);
        return { A, B };
    }

    it('1. create on A, join via B: one relay_redirect, both in the lobby, the join well under a second', async () => {
        const store = new MemoryRoomStore();
        const { A, B } = await twoShards(store);
        const host = await dial(proxy.port, {
            ask: c => c.send({ t: 'party.create', difficulty: 'normal' }),
            done: c => c.last('party'),
        });
        clients.push(host.c);
        expect(host.hops).toBe(0);
        const code = host.c.last('party')!.code;
        const t0 = Date.now();
        const friend = await dial(proxy.port, {
            path: relayPath('b'),
            ask: c => c.send({ t: 'party.join', code }),
            done: c => c.last('party')?.members.length === 2,
        });
        clients.push(friend.c);
        const joinMs = Date.now() - t0;
        expect(friend.hops).toBe(1);
        expect(friend.paths).toEqual([relayPath('b'), relayPath('a')]);
        await host.c.until(() => host.c.last('party')?.members.length === 2);
        expect(B.has('relay_redirect')?.props).toEqual({ why: 'join', to: 'a' });
        expect(A.has('relay_redirect')).toBeUndefined();
        // two dials and one store lookup on a local machine (the plan's budget is 500 ms; CI machines are slower)
        expect(joinMs).toBeLessThan(1500);
        // eslint-disable-next-line no-console
        console.log(`relay-shards: join via the other shard took ${joinMs} ms`);
    });

    it("2. today's spec: two instances of one deployment both keep serving (no bounces); another deployment drains them", async () => {
        const store = new MemoryRoomStore();
        const A = proc(store, { RELAY_DEPLOY_ID: 'dep-1' });
        const B = proc(store, { RELAY_DEPLOY_ID: 'dep-1' });
        await Promise.all([A.start(), B.start()]);
        proxy.set('front', [A.port, B.port]);
        let moving = 0;
        let welcomed = 0;
        for (let i = 0; i < 100; i++) {
            const c = new TestClient(proxy.port);
            await c.open();
            c.hello();
            await c.until(() => c.last('welcome') || c.closed, 5000);
            moving += c.json.filter(j => j.code === 'server_moving').length;
            if (c.last('welcome')) welcomed++;
            c.close();
            if (i % 20 === 19) await wait(PARTY_LIMITS.restoreEveryMs);
        }
        // both reached, both announced; several generation passes later neither drains
        expect(proxy.hits.get(A.port)).toBeGreaterThan(20);
        expect(proxy.hits.get(B.port)).toBeGreaterThan(20);
        await wait(PARTY_LIMITS.relayHeartbeatMs + 2 * PARTY_LIMITS.restoreEveryMs);
        expect(moving).toBe(0);
        expect(welcomed).toBe(100);
        expect((await A.state()).state).toBe('serving');
        expect((await B.state()).state).toBe('serving');
        expect(A.has('relay_drain_start')).toBeUndefined();
        expect(B.has('relay_drain_start')).toBeUndefined();

        // a deploy: the next deployment comes up and DigitalOcean routes to it; both old instances drain
        const C = proc(store, { RELAY_DEPLOY_ID: 'dep-2' });
        await C.start();
        proxy.set('front', [C.port]);
        const probe = new TestClient(proxy.port);
        clients.push(probe);
        await probe.open();
        probe.hello();
        await probe.until(() => probe.last('welcome'));
        await until(() => A.has('relay_drain_start') && B.has('relay_drain_start'), 5000);
        expect(A.has('relay_drain_start')!.props.trigger).toBe('generation');
        expect((await C.state()).state).toBe('serving');
    });

    it('3. crash: SIGKILL shard a mid-match; the players reach shard b, which claims the room after the stale lease; same game up to the checkpoint', async () => {
        const store = new MemoryRoomStore();
        const { A, B } = await twoShards(store);
        const m = await partyMatch(proxy.port);
        clients.push(m.a, m.b);
        const stop1 = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 100, 30_000);

        A.kill('SIGKILL');
        stop1();
        const killedAt = Date.now();
        expect((await A.exited()).signal).toBe('SIGKILL');
        // DigitalOcean: shard a has no live instance; its path and the front door answer 503
        proxy.set('a', []);
        proxy.set('front', []);
        const lastSeen = m.a.turns[m.a.turns.length - 1].turn;
        const row = { ...store.rooms.get(m.ma.room)! };
        expect(row.handoff).toBe(false);

        const rejoin = (token: string) =>
            dial(proxy.port, {
                path: relayPath('a'),
                hello: { resume: { token } },
                fallback: () => listedShards(store),
                done: c => c.last('match'),
                ms: PARTY_LIMITS.staleLeaseMs + 15_000,
            });
        const [ra, rb] = await Promise.all([rejoin(m.wa.resumeToken), rejoin(m.wb.resumeToken)]);
        const a2 = ra.c;
        const b2 = rb.c;
        clients.push(a2, b2);
        const freezeMs = Date.now() - killedAt;
        // eslint-disable-next-line no-console
        console.log(`relay-shards: crash freeze ${freezeMs} ms, ${ra.paths.length} dials`);
        expect(freezeMs).toBeLessThan(20_000);
        expect(B.has('restores')).toBeDefined();
        expect(a2.last('match')!.room).toBe(m.ma.room);
        expect(a2.last('match')!.you.slot).toBe(m.ma.you.slot);
        expect(b2.last('match')!.you.slot).toBe(m.mb.you.slot);

        // rolled back to the checkpoint: a client past it is resynced; both share one log again
        a2.send({ t: 'sync', fromTurn: lastSeen + 1 });
        b2.send({ t: 'sync', fromTurn: 0 });
        const stop2 = play(a2, b2);
        if (lastSeen + 1 > row.lastTurn) await a2.until(() => a2.json.find(j => j.t === 'resync'), 5000);
        await a2.until(() => a2.turns.some(t => t.turn > lastSeen + 30), 20_000);
        await b2.until(() => b2.turns.some(t => t.turn > lastSeen + 30), 20_000);
        stop2();
        expect(contiguous(a2.turns)).toBe(true);
        expect(contiguous(b2.turns)).toBe(true);
        expect(sameLog(byTurn(m.a), byTurn(a2), 0, row.lastTurn - 1)).toBe(-1);
        expect(sameLog(byTurn(a2), byTurn(b2), 0, lastSeen + 30)).toBe(-1);
    });

    it('4. deploy of shard a: 200 connects during the swap and the drain, no server_moving, at most one redirect each', async () => {
        const store = new MemoryRoomStore();
        const { A: A1 } = await twoShards(store, { RELAY_DEPLOY_ID: 'a-1', RELAY_DRAIN_MAX_MS: '3000' });
        // a live room on the old process: it plays on while A1 drains, then is pushed to A2
        const m = await partyMatch(proxy.port);
        clients.push(m.a, m.b);
        const stop = play(m.a, m.b);
        const A2 = proc(store, {
            RELAY_SHARD: 'a',
            RELAY_POOL: 'app',
            RELAY_DEPLOY_ID: 'a-2',
            RELAY_DRAIN_MAX_MS: '3000',
        });
        await A2.start();
        // DigitalOcean routes new requests to the new container once it is healthy, then stops the old one
        proxy.set('a', [A2.port]);
        proxy.set('front', [A2.port]);
        const sessions: { hops: number; moving: number }[] = [];
        const connect = async () => {
            const r = await dial(proxy.port, { done: c => c.last('welcome') });
            sessions.push({ hops: r.hops, moving: r.moving });
            r.c.close();
        };
        for (let i = 0; i < 100; i++) await connect();
        A1.kill('SIGTERM');
        for (let i = 0; i < 100; i++) await connect();
        stop();
        expect(sessions).toHaveLength(200);
        expect(sessions.reduce((n, s) => n + s.moving, 0)).toBe(0);
        expect(Math.max(...sessions.map(s => s.hops))).toBeLessThanOrEqual(1);
        expect((await A1.exited()).code).toBe(0);
        expect(A1.has('relay_drain_start')).toBeDefined();
        // the live room moved to the new process with its players
        await until(() => A2.has('restores') || A2.has('relay_restore'), 10_000);
    });

    it('5. queue failover: the lease holder dies with a player searching; the lease moves within 15 s and the search continues on shard b', async () => {
        const store = new MemoryRoomStore();
        const { A, B } = await twoShards(store);
        const p = await dial(proxy.port, {
            ask: c => c.send({ t: 'mm.join', queue: 'coop', side: 'any' }),
            done: c => c.last('mm.status') || c.last('mm.queue'),
        });
        clients.push(p.c);
        const token = p.c.last('welcome')!.resumeToken;
        A.kill('SIGKILL');
        const killedAt = Date.now();
        proxy.set('a', []);
        proxy.set('front', []);
        await until(() => B.has('relay_lease'), PARTY_LIMITS.mmLeaseMs + 5000);
        const leaseMs = Date.now() - killedAt;
        expect(leaseMs).toBeLessThan(PARTY_LIMITS.mmLeaseMs + 3000);
        // the game re-sends its search after the new welcome (partyClient's welcome rule)
        const again = await dial(proxy.port, {
            path: relayPath('a'),
            hello: { resume: { token } },
            fallback: () => listedShards(store),
            ask: c => c.send({ t: 'mm.join', queue: 'coop', side: 'any' }),
            done: c => c.last('mm.status') || c.last('mm.queue') || c.last('mm.found') || c.last('party'),
            ms: 20_000,
        });
        clients.push(again.c);
        expect(again.paths[again.paths.length - 1]).toBe(relayPath('b'));
        const bRow = [...store.relayRows.values()].find(r => r.shard === 'b')!;
        expect(store.leases.get('mm')!.owner).toBe(bRow._id);
        // a match forms from that queue (bots fill co-op)
        await again.c.until(() => again.c.last('party')?.phase === 'pick' || again.c.last('mm.found'), 60_000);
    });

    it('6. spectate: a viewer on the wrong shard is sent to the match once and gets the delayed stream', async () => {
        const store = new MemoryRoomStore();
        const { B } = await twoShards(store);
        const m = await partyMatch(proxy.port);
        clients.push(m.a, m.b);
        const stop = play(m.a, m.b);
        await m.a.until(() => m.a.turns.length >= 30, 20_000);
        const v = await dial(proxy.port, {
            path: relayPath('b'),
            hello: { guestKey: `viewer-${process.pid}` },
            ask: c => c.send({ t: 'spectate', room: m.ma.room }),
            done: c => c.last('match')?.watch,
        });
        clients.push(v.c);
        expect(v.hops).toBe(1);
        expect(B.has('relay_redirect')?.props).toEqual({ why: 'watch', to: 'a' });
        expect(v.c.last('match')!.you.slot).toBe(-1);
        // nothing streams before the client asks (its NetCore starts, then `sync{0}`); the stream runs `delayMs` behind
        v.c.send({ t: 'sync', fromTurn: 0 });
        await v.c.until(() => v.c.turns.length > 0, v.c.last('match')!.watch.delayMs + 15_000);
        stop();
    });

    it('7. an old game (PROTO 8) on the front door is served there and never redirected; a join to another shard is a bounded party_elsewhere', async () => {
        const store = new MemoryRoomStore();
        // shard b holds the lease; the front door (shard a) sends new PROTO 9 sessions there
        const B = proc(store, { RELAY_SHARD: 'b' });
        await B.start();
        proxy.set('b', [B.port]);
        await until(() => B.has('relay_lease'), 10_000);
        const A = proc(store, { RELAY_SHARD: 'a', RELAY_POOL: 'app' });
        await A.start();
        proxy.set('a', [A.port]);
        proxy.set('front', [A.port]);
        await until(() => [...store.relayRows.values()].filter(r => r.path).length === 2, 10_000);
        await wait(PARTY_LIMITS.restoreEveryMs + 500);

        const host = await dial(proxy.port, {
            ask: c => c.send({ t: 'party.create', difficulty: 'normal' }),
            done: c => c.last('party'),
        });
        clients.push(host.c);
        expect(host.hops).toBe(1);
        expect(host.paths).toEqual([WS_PATH, relayPath('b')]);
        const code = host.c.last('party')!.code;

        const old = new TestClient(proxy.port);
        clients.push(old);
        await old.open();
        old.hello({ proto: PROTO_REDIRECT - 1 });
        await old.until(() => old.last('welcome'));
        old.send({ t: 'party.join', code });
        await old.until(() => old.closed);
        expect(old.json.some(j => j.code === 'relay_redirect')).toBe(false);
        expect(old.json.find(j => j.t === 'error')?.code).toBe('party_elsewhere');
        expect(old.closed!.code).toBe(4013);
    });

    it('8. a ticket is single use across the fleet: spent on shard a, refused on shard b', async () => {
        const store = new MemoryRoomStore();
        await twoShards(store);
        const tickets = new PartyTicketService();
        const { ticket } = tickets.issue({ accountId: 'acct-1', guest: false });
        const first = new TestClient(proxy.port, 'http://localhost:3000', {}, relayPath('a'));
        clients.push(first);
        await first.open();
        first.hello({ proto: PROTO_REDIRECT, ticket });
        await first.until(() => first.last('welcome'));
        expect(first.json.some(j => j.code === 'bad_ticket')).toBe(false);

        const replay = new TestClient(proxy.port, 'http://localhost:3000', {}, relayPath('b'));
        clients.push(replay);
        await replay.open();
        replay.hello({ proto: PROTO_REDIRECT, ticket });
        await replay.until(() => replay.last('welcome'));
        expect(replay.json.some(j => j.code === 'bad_ticket')).toBe(true);

        // a fresh ticket is fine on b
        const fresh = new TestClient(proxy.port, 'http://localhost:3000', {}, relayPath('b'));
        clients.push(fresh);
        await fresh.open();
        fresh.hello({ proto: PROTO_REDIRECT, ticket: tickets.issue({ accountId: 'acct-1', guest: false }).ticket });
        await fresh.until(() => fresh.last('welcome'));
        expect(fresh.json.some(j => j.code === 'bad_ticket')).toBe(false);
    });
});

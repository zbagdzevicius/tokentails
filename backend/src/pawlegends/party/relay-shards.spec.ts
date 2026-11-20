import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { cfHeaderTrusted } from '../../shared/runtime/backend-role';
import { loadBucket, relaysView } from '../../shared/runtime/relays.controller';
import { ChatBus } from '../social/chat-bus';
import { LoopGate } from './loop-gate';
import { PROTO_REDIRECT, relayPath } from './net';
import { PARTY_LIMITS, relayDeployIdFrom, relayPoolFrom, relayShardFrom } from './party-limits';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore, type RelayRow } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Relay shards (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15), in one process: the env rules, the deployment rule that lets
 * two instances of one deployment both serve (A1), the `mm` lease and where new sessions and searches go, the fleet
 * ticket nonces, DM notices through the store, the end-of-match write retry and the public relays view. The
 * multi-process acceptance tests are relay-shards.e2e.spec.ts.
 */

type Logged = { event: string; props: Record<string, unknown> };

async function listen(): Promise<{ server: Server; port: number }> {
    const server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    return { server, port: (server.address() as AddressInfo).port };
}

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

const row = (over: Partial<RelayRow>): RelayRow => ({
    _id: 'r',
    state: 'serving',
    readyAt: new Date(),
    heartbeatAt: new Date(),
    simVersions: [],
    ...over,
});

describe('relay shards: env rules', () => {
    it('RELAY_SHARD names a shard and its pool; RELAY_POOL still wins; a bad name is no shard', () => {
        expect(relayShardFrom({ RELAY_SHARD: ' B ' })).toBe('b');
        expect(relayShardFrom({ RELAY_SHARD: 'eu-west-2' })).toBe('eu-west-2');
        expect(relayShardFrom({ RELAY_SHARD: 'a/b' })).toBeNull();
        expect(relayShardFrom({ RELAY_SHARD: 'x'.repeat(17) })).toBeNull();
        expect(relayShardFrom({})).toBeNull();
        expect(relayPoolFrom('relay', { RELAY_SHARD: 'b' })).toBe('b');
        expect(relayPoolFrom('relay', { RELAY_SHARD: 'a', RELAY_POOL: 'app' })).toBe('app');
        expect(relayPoolFrom('relay', {})).toBe('vm');
        expect(relayPoolFrom('all', {})).toBe('app');
    });

    it('the deployment: RELAY_DEPLOY_ID, else a Kubernetes pod name without its own suffix, else none', () => {
        expect(relayDeployIdFrom({ RELAY_DEPLOY_ID: 'abc123' })).toBe('abc123');
        expect(relayDeployIdFrom({ RELAY_DEPLOY_ID: 'bad id!' })).toBeNull();
        // two replicas of one rollout share it; the next rollout changes it
        expect(relayDeployIdFrom({ HOSTNAME: 'tokentails-backend-6f8d7c9b5-x2kq4' })).toBe(
            'tokentails-backend-6f8d7c9b5'
        );
        expect(relayDeployIdFrom({ HOSTNAME: 'tokentails-backend-6f8d7c9b5-zz9aa' })).toBe(
            'tokentails-backend-6f8d7c9b5'
        );
        expect(relayDeployIdFrom({ HOSTNAME: 'tokentails-backend-7c5ddbdf54-x2kq4' })).toBe(
            'tokentails-backend-7c5ddbdf54'
        );
        // a laptop, a VM or a container id: none (the older relay of a pool drains, as before)
        expect(relayDeployIdFrom({ HOSTNAME: 'Zygis-MacBook-Pro.local' })).toBeNull();
        expect(relayDeployIdFrom({ HOSTNAME: 'tt-relay-x7k2' })).toBeNull();
        expect(relayDeployIdFrom({ HOSTNAME: '3f2a9c1d0b7e' })).toBeNull();
        expect(relayDeployIdFrom({})).toBeNull();
    });

    it('a split role behind the DigitalOcean ingress never trusts a client-sent cf-connecting-ip', () => {
        expect(cfHeaderTrusted('relay', {})).toBe(true);
        expect(cfHeaderTrusted('api', {})).toBe(true);
        expect(cfHeaderTrusted('relay', { ORIGIN_INGRESS: 'digitalocean' })).toBe(false);
        expect(cfHeaderTrusted('api', { ORIGIN_INGRESS: 'DigitalOcean' })).toBe(false);
        expect(cfHeaderTrusted('all', {})).toBe(false);
    });

    it('the public relays view: shards, paths, a load bucket and the leader; never boot ids or counts', () => {
        const now = Date.now();
        const view = relaysView(
            [
                row({ _id: 'boot-a', shard: 'a', path: relayPath('a'), rooms: 50, cap: 60 }),
                row({ _id: 'boot-b', shard: 'b', path: relayPath('b'), rooms: 1, cap: 60 }),
                row({ _id: 'boot-dead', shard: 'c', path: relayPath('c'), heartbeatAt: new Date(now - 60_000) }),
                row({ _id: 'boot-vm' }),
            ],
            'boot-b',
            now
        );
        expect(view).toEqual({
            shards: [
                { shard: 'a', path: '/pawlegends/ws/a', state: 'serving', load: 'high', leader: false },
                { shard: 'b', path: '/pawlegends/ws/b', state: 'serving', load: 'low', leader: true },
            ],
            leader: 'b',
        });
        expect(JSON.stringify(view)).not.toContain('boot-');
        expect(loadBucket({ rooms: 30, cap: 60 })).toBe('mid');
    });
});

describe('relay shards: one process per relay, one shared store (LIVE-MATCH-DEPLOYS.md §15)', () => {
    jest.setTimeout(60_000);
    const open: { relays: PartyRelay[]; servers: Server[]; clients: TestClient[] } = {
        relays: [],
        servers: [],
        clients: [],
    };
    beforeAll(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'shards-secret-0123456789';
    });
    afterEach(async () => {
        for (const c of open.clients.splice(0)) c.close();
        for (const r of open.relays.splice(0)) await r.shutdown();
        for (const s of open.servers.splice(0)) await new Promise(r => s.close(() => r(undefined)));
    });

    async function relay(
        store: MemoryRoomStore,
        opts: { shard?: string; pool?: string; deployId?: string; logs?: Logged[]; chat?: boolean } = {}
    ) {
        const { server, port } = await listen();
        open.servers.push(server);
        const logs = opts.logs ?? [];
        const r = new PartyRelay({
            server,
            store,
            tickets: new PartyTicketService(),
            referee: new RefereePool({ inline: true }),
            originAllowed: () => true,
            gate: new LoopGate(() => 0),
            shard: opts.shard ?? null,
            pool: opts.pool ?? (opts.shard ? relayPoolFrom('relay', { RELAY_SHARD: opts.shard }) : undefined),
            deployId: opts.deployId ?? null,
            ...(opts.chat
                ? {
                      chat: {
                          info: async () => ({ band: null, muted: false as const, blocked: [] }),
                          onNotice: (fn: (n: { to: string; thread: string; id?: string }) => void) => bus.subscribe(fn),
                      },
                  }
                : {}),
            log: (event, props) => logs.push({ event, props }),
        });
        open.relays.push(r);
        await r.restore();
        return { r, port, logs };
    }
    const bus = new ChatBus();
    const client = async (port: number, path?: string) => {
        const c = new TestClient(port, 'http://localhost:3000', {}, path);
        open.clients.push(c);
        await c.open();
        return c;
    };

    it('A1: a newer relay of the same pool and deployment never drains this one; another deployment does', async () => {
        const store = new MemoryRoomStore();
        const { r, port } = await relay(store, { deployId: 'dep-1' });
        await client(port); // announced: a player reached it
        await store.heartbeat(row({ _id: 'twin', readyAt: new Date(Date.now() + 1000), deployId: 'dep-1' }));
        await wait(PARTY_LIMITS.restoreEveryMs * 2 + 300);
        expect(r.relayState).toBe('serving');
        // a row without a deployment (an older build): as before, the newer one wins
        await store.heartbeat(row({ _id: 'legacy', readyAt: new Date(Date.now() + 1000) }));
        await until(() => r.relayState === 'draining', 3000);
        store.relayRows.delete('legacy');
        await until(() => r.relayState === 'serving', 3000);
        await store.heartbeat(row({ _id: 'next', readyAt: new Date(Date.now() + 1000), deployId: 'dep-2' }));
        await until(() => r.relayState === 'draining', 3000);
    });

    it('the mm lease: one shard takes it, renews it, gives it up when it drains; the other takes it then', async () => {
        const store = new MemoryRoomStore();
        const a = await relay(store, { shard: 'a', pool: 'app' });
        await until(() => a.logs.find(l => l.event === 'relay_lease'), 3000);
        const b = await relay(store, { shard: 'b' });
        await wait(PARTY_LIMITS.restoreEveryMs * 2 + 200);
        const held = store.leases.get('mm')!;
        expect(held.shard).toBe('a');
        expect(held.expiresAt.getTime()).toBeGreaterThan(Date.now() + PARTY_LIMITS.mmLeaseMs - 2500);
        expect(b.logs.find(l => l.event === 'relay_lease')).toBeUndefined();
        a.r.drain('endpoint', 60_000);
        await until(() => b.logs.find(l => l.event === 'relay_lease'), 3000);
        expect(store.leases.get('mm')!.shard).toBe('b');
        expect(store.leases.get('mm')!.epoch).toBe(held.epoch + 1);
    });

    it('a new session on the front door starts on the lease holder; a socket sent to a shard path stays; PROTO 8 is never redirected', async () => {
        const store = new MemoryRoomStore();
        const lead = await relay(store, { shard: 'b' });
        await until(() => lead.logs.find(l => l.event === 'relay_lease'), 3000);
        const front = await relay(store, { shard: 'a', pool: 'app' });
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        const c = await client(front.port);
        c.hello();
        await c.until(() => c.closed);
        expect(c.json).toEqual([{ t: 'error', code: 'relay_redirect', retryMs: 0, shard: 'b' }]);
        expect(c.closed!.code).toBe(4014);
        // dialed on its own shard path (sent here on purpose): served here
        const own = await client(front.port, relayPath('a'));
        own.hello();
        await own.until(() => own.last('welcome'));
        // an older game: served where it lands
        const old = await client(front.port);
        old.hello({ proto: PROTO_REDIRECT - 1 });
        await old.until(() => old.last('welcome'));
        expect(old.json.some(j => j.code === 'relay_redirect')).toBe(false);
    });

    it('a lease holder at 80 % of its cap: new sessions go to the least loaded shard (this one on a tie)', async () => {
        const store = new MemoryRoomStore();
        // a lease held by shard c (another process: its row and lease are written here by hand)
        const far = new Date(Date.now() + 60_000);
        store.leases.set('mm', { _id: 'mm', owner: 'boot-c', shard: 'c', epoch: 1, expiresAt: far });
        const c = row({ _id: 'boot-c', shard: 'c', pool: 'c', path: relayPath('c'), rooms: 10, cap: 60 });
        await store.heartbeat(c);
        const front = await relay(store, { shard: 'a', pool: 'app' });
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        const first = await client(front.port);
        first.hello();
        await first.until(() => first.closed);
        expect(first.json[0]).toMatchObject({ code: 'relay_redirect', shard: 'c' });
        // c fills up past the line: this shard (empty) takes new sessions itself
        await store.heartbeat({ ...c, rooms: 50, heartbeatAt: new Date() });
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        const second = await client(front.port);
        second.hello();
        await second.until(() => second.last('welcome'));
        // a third, emptier shard b exists and this one is no emptier: still here on a tie
        await store.heartbeat(row({ _id: 'boot-b', shard: 'b', pool: 'b', path: relayPath('b'), rooms: 0, cap: 60 }));
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        const third = await client(front.port);
        third.hello();
        await third.until(() => third.last('welcome'));
    });

    it('a lone search on a shard that does not hold the lease goes to the holder; a friend party searches where it is', async () => {
        const store = new MemoryRoomStore();
        const lead = await relay(store, { shard: 'b' });
        await until(() => lead.logs.find(l => l.event === 'relay_lease'), 3000);
        const other = await relay(store, { shard: 'a', pool: 'app' });
        await wait(PARTY_LIMITS.restoreEveryMs + 300);
        const solo = await client(other.port, relayPath('a'));
        solo.hello();
        await solo.until(() => solo.last('welcome'));
        solo.send({ t: 'mm.join', queue: 'coop', side: 'any' });
        await solo.until(() => solo.closed);
        expect(solo.json.find(j => j.t === 'error')).toEqual({
            t: 'error',
            code: 'relay_redirect',
            retryMs: 0,
            shard: 'b',
        });
        const host = await client(other.port, relayPath('a'));
        const mate = await client(other.port, relayPath('a'));
        host.hello();
        mate.hello();
        await host.until(() => host.last('welcome'));
        await mate.until(() => mate.last('welcome'));
        host.send({ t: 'party.create', difficulty: 'normal' });
        const p = await host.until(() => host.last('party'));
        mate.send({ t: 'party.join', code: p.code });
        await host.until(() => host.last('party')?.members.length === 2);
        host.send({ t: 'mm.join', queue: 'coop', side: 'any' });
        await host.until(() => host.json.some(j => String(j.t).startsWith('mm.')));
        expect(host.closed).toBeNull();
    });

    it('a ticket spent on one relay is refused on another (the fleet nonce), and keeps the account with its resume token', async () => {
        const store = new MemoryRoomStore();
        const one = await relay(store);
        const two = await relay(store);
        const { ticket } = new PartyTicketService().issue({ accountId: 'acct-7', guest: false });
        const a = await client(one.port);
        a.hello({ ticket });
        const w = await a.until(() => a.last('welcome'));
        expect(a.json.some(j => j.code === 'bad_ticket')).toBe(false);
        const b = await client(two.port);
        b.hello({ ticket });
        await b.until(() => b.last('welcome'));
        expect(b.json.some(j => j.code === 'bad_ticket')).toBe(true);
        // the reconnect rule still holds on the first relay: the spent ticket plus its own resume token
        const again = await client(one.port);
        again.hello({ ticket, resume: { token: w.resumeToken } });
        const w2 = await again.until(() => again.last('welcome'));
        expect(w2.member).toBe(w.member);
    });

    it('DM notices reach a player on any relay through the store, once each', async () => {
        const store = new MemoryRoomStore();
        const { port } = await relay(store, { chat: true });
        const { ticket } = new PartyTicketService().issue({ accountId: 'acct-dm', guest: false });
        const c = await client(port);
        c.hello({ ticket });
        await c.until(() => c.last('welcome'));
        // written by an API process elsewhere (another instance's ChatBus)
        store.noticeRows.push({ _id: 'n1', to: 'acct-dm', thread: 'thr-1', at: new Date() });
        store.noticeRows.push({ _id: 'n2', to: 'someone-else', thread: 'thr-2', at: new Date() });
        await c.until(() => c.last('chat.notice'), PARTY_LIMITS.noticePollMs * 3);
        // the same notice from the in-process bus as well: sent once
        bus.publish({ to: 'acct-dm', thread: 'thr-1', id: 'n1' });
        bus.publish({ to: 'acct-dm', thread: 'thr-3' });
        await c.until(() => c.json.filter(j => j.t === 'chat.notice').length >= 2, 3000);
        await wait(PARTY_LIMITS.noticePollMs * 2);
        expect(c.json.filter(j => j.t === 'chat.notice').map(j => j.thread)).toEqual(['thr-1', 'thr-3']);
    });

    it('a ChatBus notice is written to the store with the id the in-process event carries', async () => {
        const rows: { _id: string; to: string; thread: string }[] = [];
        const b = new ChatBus({ create: async d => void rows.push(d) });
        const seen: { id?: string }[] = [];
        b.subscribe(n => seen.push(n));
        b.publish({ to: 'acct', thread: 't' });
        await wait(0);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ to: 'acct', thread: 't', _id: seen[0].id });
        // a failing write never fails a send
        const broken = new ChatBus({ create: () => Promise.reject(new Error('down')) });
        expect(() => broken.publish({ to: 'a', thread: 't' })).not.toThrow();
    });
});

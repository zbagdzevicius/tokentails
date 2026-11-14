import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { CMD_OP, Frame, PROTO_MATCH_CHAT, SPECTATE_LIMITS } from './net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Live spectating over real sockets (SPECTATE.md, PROTO 7): a third socket watches a party match by its room id with
 * the delay respected, cannot affect it (a CMD is a strike, the room's TURNs never carry anything from it), hears the
 * delayed end, and the caps, the private-matches setting, own-match and version refusals hold. A PROTO 6 socket can
 * neither send `spectate` nor ever receive a spectate frame.
 */

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** 1 s of delay (15 turns) keeps the specs quick; production delays are SPECTATE_DELAY_MS. */
const DELAY_MS = 1000;
const DELAY_TURNS = 15;

async function boot() {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'spec-secret-0123456789abcdef';
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const events: { e: string; p: Record<string, unknown> }[] = [];
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets: new PartyTicketService(),
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        log: (e, p) => events.push({ e, p }),
        clientIp: (req: IncomingMessage) => String(req.headers['x-spec-ip'] ?? '10.0.0.1'),
        spectateDelayMs: () => DELAY_MS,
    });
    const clients: TestClient[] = [];
    const client = async (ip = '10.0.0.9', hello: Record<string, unknown> = {}) => {
        const c = new TestClient(port, 'http://localhost:3000', { 'x-spec-ip': ip });
        clients.push(c);
        await c.open();
        c.hello(hello);
        await c.until(() => c.last('welcome') || c.last('error'));
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { relay, client, stop, events };
}

type Booted = Awaited<ReturnType<typeof boot>>;

async function twoInMatch(b: Booted, hint: Record<string, unknown> = {}) {
    const a = await b.client('10.0.0.1', { guestKey: 'leader-key-0001', ...hint });
    a.send({ t: 'party.create', difficulty: 'easy' });
    const pa = await a.until(() => a.last('party'));
    const c = await b.client('10.0.0.2', { guestKey: 'member-key-0001' });
    c.send({ t: 'party.join', code: pa.code });
    await a.until(() => a.last('party')?.members.length === 2);
    a.send({ t: 'party.start' });
    await a.until(() => a.last('party')?.phase === 'pick');
    a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
    c.send({ t: 'pick.lock', hero: 'sage', trick: 'snack' });
    await a.until(() => a.last('party')?.phase === 'loading');
    a.send({ t: 'loaded' });
    c.send({ t: 'loaded' });
    await a.until(() => a.last('match'));
    await c.until(() => c.last('match'));
    const live = [...b.relay.rooms.values()][0];
    const beat = setInterval(() => {
        a.beat();
        c.beat();
    }, 250);
    return { a, c, live, room: live.room.id, stopBeats: () => clearInterval(beat) };
}

const errors = (c: TestClient) => c.json.filter(m => m.t === 'error').map(m => m.code as string);

describe('live spectating (PROTO 7)', () => {
    jest.setTimeout(120_000);

    it('a spectator gets the match as slot -1, a CATCHUP to the delayed turn, then delayed TURNs; it never plays', async () => {
        const b = await boot();
        const { a, live, room, stopBeats } = await twoInMatch(b);
        await a.until(() => live.room.nextTurn > DELAY_TURNS + 40 || null, 15_000);
        const s = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        s.send({ t: 'spectate', room });
        const m = await s.until(() => s.last('match'));
        expect(m.you.slot).toBe(-1);
        expect(m.room).toBe(room);
        expect(m.watch).toMatchObject({
            delayMs: Math.round(DELAY_TURNS * (1000 / 15)),
            viewers: 1,
            max: SPECTATE_LIMITS.perRoom,
            kind: 'party',
        });
        expect(m.config.humans).toEqual(live.config.humans);
        // nothing streams before the client asks (its NetCore starts, then `sync{0}`)
        await sleep(200);
        expect(s.turns.length).toBe(0);
        s.send({ t: 'sync', fromTurn: 0 });
        await s.until(() => s.turns.length > 20 || null, 5000);
        expect(s.binary.some(f => f.type === Frame.CATCHUP)).toBe(true);
        // never ahead of live minus the delay (one release tick of slack), and in order from 0
        for (let i = 0; i < 20; i++) {
            const top = Math.max(...s.turns.map(t => t.turn));
            expect(top).toBeLessThanOrEqual(live.room.nextTurn - DELAY_TURNS + 1);
            await sleep(60);
        }
        expect(s.turns.map(t => t.turn)).toEqual(s.turns.map((_, i) => i));
        // then live TURN frames keep coming at the match pace
        const n = s.binary.filter(f => f.type === Frame.TURN).length;
        await s.until(() => s.binary.filter(f => f.type === Frame.TURN).length > n + 10 || null, 5000);
        // a spectator's command is a strike, and none reaches the room: 3 close the socket
        const before = live.room.log.length;
        s.cmd(new Uint8Array([CMD_OP.Stop]));
        s.cmd(new Uint8Array([CMD_OP.Stop]));
        s.cmd(new Uint8Array([CMD_OP.Stop]));
        await s.until(() => s.closed, 5000);
        expect(s.closed!.code).toBe(4002);
        await a.until(() => live.room.log.length > before + 5 || null, 5000);
        expect(b.relay.rooms.has(room)).toBe(true);
        // a social or vote from a spectator would need a seat: there is none
        expect(live.watchers?.size ?? 0).toBe(0);
        stopBeats();
        await b.stop();
    });

    it('the spectator count reaches every spectator; leaving lowers it; the end comes after the delayed tail', async () => {
        const b = await boot();
        const { a, live, room, stopBeats } = await twoInMatch(b);
        await a.until(() => live.room.nextTurn > DELAY_TURNS + 30 || null, 15_000);
        const s1 = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        const s2 = await b.client('10.0.0.4', { guestKey: 'watcher-key-0002' });
        s1.send({ t: 'spectate', room });
        await s1.until(() => s1.last('match'));
        s2.send({ t: 'spectate', room });
        await s2.until(() => s2.last('match'));
        await s1.until(() => s1.last('spectate')?.viewers === 2 || null);
        s2.send({ t: 'spectate.leave' });
        await s1.until(() => s1.last('spectate')?.viewers === 1 || null);
        s1.send({ t: 'sync', fromTurn: 0 });
        await s1.until(() => s1.turns.length > 10 || null, 5000);
        const end = {
            winner: 0,
            outcome: 'won',
            ticks: live.room.tick,
            finalHash: '00000000',
            reason: 'core',
            stats: [],
        };
        await (b.relay as unknown as { endRoom(l: unknown, e: unknown): Promise<void> }).endRoom(live, end);
        // the end waits for the delayed tail (played at match pace), then every turn of the log was sent
        expect(s1.last('end')).toBeUndefined();
        const got = await s1.until(() => s1.last('end'), 10_000);
        expect(got).toMatchObject({ t: 'end', winner: 0, scored: false });
        expect(Math.max(...s1.turns.map(t => t.turn))).toBe(live.room.nextTurn - 1);
        expect(live.watchers?.size ?? 0).toBe(0);
        stopBeats();
        await b.stop();
    });

    it('refusals: own match, a party member, an unknown room, another sim, the per-identity cap, a private player', async () => {
        const b = await boot();
        const { a, c, room, stopBeats } = await twoInMatch(b);
        // a seated player (any socket of that identity) never watches its own match
        const own = await b.client('10.0.0.1', { guestKey: 'leader-key-0001' });
        own.send({ t: 'spectate', room });
        await own.until(() => errors(own).includes('watch_none') || null);
        // a socket in a party never watches from it
        c.send({ t: 'spectate', room });
        await c.until(() => errors(c).includes('watch_none') || null);
        // an unknown room, and no featured match yet (a room must have played 30 s)
        const s = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        s.send({ t: 'spectate', room: 'zzzzzzzzzzzz' });
        await s.until(() => errors(s).filter(e => e === 'watch_none').length === 1 || null);
        s.send({ t: 'spectate', featured: true });
        await s.until(() => errors(s).filter(e => e === 'watch_none').length === 2 || null);
        // two spectating sockets per identity
        const s2 = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        const s3 = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        s.send({ t: 'spectate', room });
        await s.until(() => s.last('match'));
        s2.send({ t: 'spectate', room });
        await s2.until(() => s2.last('match'));
        s3.send({ t: 'spectate', room });
        await s3.until(() => errors(s3).includes('rate_limited') || null);
        // a malformed target (both, or neither) is a bad message
        s3.send({ t: 'spectate', room, featured: true });
        await s3.until(() => errors(s3).includes('bad_message') || null);
        expect(a.closed).toBeNull();
        stopBeats();
        await b.stop();
    });

    it('a player with "Let friends watch" off closes the room: spectators are let go, presence has no room', async () => {
        const b = await boot();
        const { room, stopBeats, live } = await twoInMatch(b, {
            hint: { maxDifficulty: 'hard', newbie: false, watch: false },
        });
        expect(live.noWatch).toBe(true);
        const s = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        s.send({ t: 'spectate', room });
        await s.until(() => errors(s).includes('watch_none') || null);
        expect(b.relay.liveFeatured()).toBe(0);
        stopBeats();
        await b.stop();
    });

    it('a PROTO 6 socket cannot spectate and never gets a spectate frame or code', async () => {
        const b = await boot();
        const { room, stopBeats } = await twoInMatch(b);
        const old = await b.client('10.0.0.5', { guestKey: 'old-key-000001', proto: PROTO_MATCH_CHAT });
        old.send({ t: 'spectate', room });
        await old.until(() => errors(old).includes('bad_message') || null);
        expect(old.json.some(m => m.t === 'spectate' || String(m.code ?? '').startsWith('watch_'))).toBe(false);
        expect(old.last('match')).toBeUndefined();
        stopBeats();
        await b.stop();
    });

    it('an abandoned room tells its spectators watch_none', async () => {
        const b = await boot();
        const { a, live, room, stopBeats } = await twoInMatch(b);
        await a.until(() => live.room.nextTurn > 5 || null, 10_000);
        const s = await b.client('10.0.0.3', { guestKey: 'watcher-key-0001' });
        s.send({ t: 'spectate', room });
        await s.until(() => s.last('match'));
        (b.relay as unknown as { abandon(l: unknown, why: string): void }).abandon(live, 'spec');
        await s.until(() => errors(s).includes('watch_none') || null);
        expect(s.closed).toBeNull();
        stopBeats();
        await b.stop();
    });
});

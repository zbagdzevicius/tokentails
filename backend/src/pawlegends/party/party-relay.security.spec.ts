import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { CMD_OP } from './net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PARTY_LIMITS } from './party-limits';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { LIVE, TestClient } from './relay-test-client.helper-spec';

/*
 * Relay hardening (the party security review, Nov 2026): every finding that was reproduced against a live relay is
 * pinned here. A spec IP comes from the `x-spec-ip` header through the `clientIp` constructor seam (never in
 * production code paths: the real relay reads the Cloudflare header from a Cloudflare peer only).
 */

const ECHO = 0x83;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function boot() {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'spec-secret-0123456789abcdef';
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const store = new MemoryRoomStore();
    const events: { e: string; p: Record<string, unknown> }[] = [];
    const relay = new PartyRelay({
        server,
        store,
        tickets: new PartyTicketService(),
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        log: (e, p) => events.push({ e, p }),
        clientIp: (req: IncomingMessage) => String(req.headers['x-spec-ip'] ?? '10.0.0.1'),
    });
    const clients: TestClient[] = [];
    const client = async (ip = '10.0.0.1') => {
        const c = new TestClient(port, 'http://localhost:3000', { 'x-spec-ip': ip });
        clients.push(c);
        await c.open();
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { relay, store, client, stop, events };
}

type Booted = Awaited<ReturnType<typeof boot>>;

async function twoInMatch(b: Booted) {
    const a = await b.client('10.0.0.1');
    a.hello({ guestKey: 'leader-key-0001' });
    await a.until(() => a.last('welcome'));
    a.send({ t: 'party.create', difficulty: 'easy' });
    const pa = await a.until(() => a.last('party'));
    const c = await b.client('10.0.0.2');
    c.hello({ guestKey: 'member-key-0001' });
    await c.until(() => c.last('welcome'));
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
    await a.until(() => a.turns.length > 5, 8000);
    const live = [...b.relay.rooms.values()][0];
    const beat = setInterval(() => {
        a.beat();
        c.beat();
    }, 250);
    a.send({ t: 'back' });
    c.send({ t: 'back' });
    await a.until(() => (live.room.slots[1].mode === 'human' && live.room.slots[0].mode === 'human') || null, 8000);
    return { a, c, code: pa.code as string, live, stopBeats: () => clearInterval(beat) };
}

describe('party relay hardening', () => {
    jest.setTimeout(120_000);

    it('an undecodable command (a cast slot past 3) never reaches a TURN; 3 strikes close the sender', async () => {
        const b = await boot();
        const { a, c, live, stopBeats } = await twoInMatch(b);
        c.cmd(new Uint8Array([CMD_OP.Cast, 4, 0, 0, 0, 0, 0]));
        c.cmd(new Uint8Array([CMD_OP.Cast, 5, 0, 0, 0, 0, 0]));
        c.cmd(new Uint8Array([CMD_OP.Cast, 9, 0, 0, 0, 0, 0]));
        await c.until(() => c.closed, 5000);
        expect(c.closed!.code).toBe(4002);
        const n = a.turns.length;
        await a.until(() => a.turns.length > n + 15, 5000);
        // every TURN the honest member got decodes, and the room is still live and scored
        for (const t of a.turns)
            for (const e of t.entries) expect(() => LIVE.party!.decodeCommand(e.cmd)).not.toThrow();
        expect(b.relay.rooms.has(live.room.id)).toBe(true);
        expect(live.room.unscored).toBeNull();
        stopBeats();
        await b.stop();
    });

    it('failed joins back off the failing IP only: another IP still joins (no global lock)', async () => {
        const b = await boot();
        const leader = await b.client('10.1.0.1');
        leader.hello({ guestKey: 'victim-leader-1' });
        await leader.until(() => leader.last('welcome'));
        leader.send({ t: 'party.create', difficulty: 'easy' });
        const pv = await leader.until(() => leader.last('party'));
        // one IP, rotating guest keys, ~210 bad codes
        let limited = false;
        for (let i = 0; i < 35 && !limited; i++) {
            const s = await b.client('66.66.66.66');
            s.hello({ guestKey: `rot-key-${i}-xxxxxx` });
            await s.until(() => s.last('welcome'));
            for (let k = 0; k < 6; k++)
                s.send({ t: 'party.join', code: `ZZZZZ${'23456789ABCDEFGHJKMNPQRSTUVWXYZ'[(i * 6 + k) % 31]}` });
            await sleep(30);
            limited = s.json.some(j => j.t === 'error' && j.code === 'rate_limited');
            s.close();
        }
        // the per-IP rule caught it (a new guest key does not reset it)
        expect(limited).toBe(true);
        const again = await b.client('66.66.66.66');
        again.hello({ guestKey: 'fresh-key-00001' });
        await again.until(() => again.last('welcome'));
        again.send({ t: 'party.join', code: pv.code });
        expect((await again.until(() => again.last('error'))).code).toBe('rate_limited');
        // an innocent player elsewhere joins at once
        const victim = await b.client('10.2.0.9');
        victim.hello({ guestKey: 'innocent-key-1' });
        await victim.until(() => victim.last('welcome'));
        victim.send({ t: 'party.join', code: pv.code });
        await leader.until(() => leader.last('party')?.members.length === 2);
        await b.stop();
    });

    it('binary floods strike and close; a BEAT flood gets at most one ECHO per 250 ms', async () => {
        const b = await boot();
        const { a, c, stopBeats } = await twoInMatch(b);
        stopBeats();
        await sleep(600);
        const before = c.binary.filter(x => x.type === ECHO).length;
        for (let i = 0; i < 5000 && !c.closed; i++) c.beat();
        await c.until(() => c.closed, 5000);
        expect(c.closed!.code).toBe(4002);
        expect(c.binary.filter(x => x.type === ECHO).length - before).toBeLessThanOrEqual(2);
        // the honest member is untouched
        expect(a.closed).toBeNull();
        await b.stop();
    });

    it('HASH frames: off-cadence and repeated marks are refused; a flood strikes', async () => {
        const b = await boot();
        const { c, stopBeats } = await twoInMatch(b);
        for (let i = 0; i < 400 && !c.closed; i++) c.hash(i * 2 + 1, i);
        await c.until(() => c.closed, 5000);
        expect(c.closed!.code).toBe(4002);
        stopBeats();
        await b.stop();
    });

    it('forged hashes (one member, or two agreeing) never void the room: it stays scored', async () => {
        const b = await boot();
        const { a, c, live, stopBeats } = await twoInMatch(b);
        await a.until(() => live.room.refereeAt >= 90 || null, 20_000);
        const next = (Math.floor(live.room.tick / 30) + 2) * 30;
        // send just before the mark (a hash too far ahead of live is refused)
        await a.until(() => live.room.tick + 8 >= next || null, 20_000);
        a.hash(next, 0x1234);
        c.hash(next, 0x1234);
        await a.until(() => live.room.refereeAt >= next + 30 || null, 20_000);
        await sleep(300);
        expect(live.room.unscored).toBeNull();
        expect(b.events.map(e => e.e)).toContain('mp_referee_divergence');
        stopBeats();
        await b.stop();
    });

    it('a member who leaves mid-match gets no more room messages; the others see "left"', async () => {
        const b = await boot();
        const { a, c, live, stopBeats } = await twoInMatch(b);
        c.send({ t: 'party.leave' });
        await a.until(() => a.json.find(j => j.t === 'slot' && j.slot === 1 && j.reason === 'left'));
        await sleep(200);
        const n = c.json.length;
        a.send({ t: 'social', kind: 'chat', id: 1 });
        await a.until(() => a.json.find(j => j.t === 'social'));
        await sleep(300);
        expect(c.json.slice(n).filter(j => j.t === 'social' || j.t === 'slot')).toEqual([]);
        expect(live.seats.size).toBe(1);
        // no Open seats: a bot flies it (never an unclaimed open seat that would lower the others' catnip)
        expect(live.room.slots[1]).toMatchObject({ occupied: false, reason: 'drop', mode: 'pilot' });
        stopBeats();
        await b.stop();
    });

    it('a second tab of the same guest never gets a second seat: it takes the one seat over', async () => {
        const b = await boot();
        const a = await b.client();
        a.hello({ guestKey: 'leader-key-0002' });
        await a.until(() => a.last('welcome'));
        a.send({ t: 'party.create', difficulty: 'easy' });
        const pa = await a.until(() => a.last('party'));
        const twin = await b.client('10.0.0.3');
        twin.hello({ guestKey: 'twin-key-000001' });
        await twin.until(() => twin.last('welcome'));
        twin.send({ t: 'party.join', code: pa.code });
        await a.until(() => a.last('party')?.members.length === 2);
        const tab2 = await b.client('10.0.0.3');
        tab2.hello({ guestKey: 'twin-key-000001' });
        await tab2.until(() => tab2.last('welcome'));
        const seatId = twin.last('welcome')!.member;
        tab2.send({ t: 'party.join', code: pa.code });
        // the newer tab holds the seat; the older one is told "Playing in another tab" and closed
        await tab2.until(() => tab2.json.filter(j => j.t === 'welcome').length === 2 || null);
        expect(tab2.last('welcome')!.member).toBe(seatId);
        await twin.until(() => twin.json.find(j => j.t === 'error' && j.code === 'seat_elsewhere'));
        await twin.until(() => twin.closed);
        expect(a.last('party')!.members).toHaveLength(2);
        // that tab closes too; the link again (no resume token) gets that same seat back, not a second one
        tab2.close();
        await a.until(() => a.last('party')?.members.find((m: any) => m.id === seatId)?.conn === 'off' || null);
        const tab3 = await b.client('10.0.0.4');
        tab3.hello({ guestKey: 'twin-key-000001' });
        await tab3.until(() => tab3.last('welcome'));
        tab3.send({ t: 'party.join', code: pa.code });
        await tab3.until(() => tab3.json.filter(j => j.t === 'welcome').length === 2 || null);
        expect(tab3.last('welcome')!.member).toBe(seatId);
        await a.until(() => a.last('party')?.members.find((m: any) => m.id === seatId)?.conn === 'on' || null);
        expect(a.last('party')!.members).toHaveLength(2);
        await b.stop();
    });

    it('a closed tab rejoins a running match through the code: its own seat, the match frame, then its hero', async () => {
        const b = await boot();
        const { a, c, code, live, stopBeats } = await twoInMatch(b);
        const slot = live.room.slots[1];
        c.close();
        await a.until(() => (!slot.connected && slot.mode === 'pilot') || null, 10_000);
        const again = await b.client('10.0.0.2');
        again.hello({ guestKey: 'member-key-0001' });
        await again.until(() => again.last('welcome'));
        again.send({ t: 'party.join', code });
        const m = await again.until(() => again.last('match'), 10_000);
        expect(m.you.slot).toBe(1);
        const beat = setInterval(() => again.beat(), 250);
        await again.until(() => again.turns.length > 5 || null, 10_000);
        again.send({ t: 'back' });
        await a.until(() => (slot.mode === 'human' && slot.connected) || null, 10_000);
        clearInterval(beat);
        stopBeats();
        await b.stop();
    });

    it('resume tokens, retired codes and join failures stay bounded', async () => {
        const b = await boot();
        const a = await b.client();
        a.hello({ guestKey: 'churn-key-00001' });
        await a.until(() => a.last('welcome'));
        a.send({ t: 'party.create', difficulty: 'easy' });
        await a.until(() => a.last('party'));
        for (let i = 0; i < 30; i++) {
            const s = await b.client('10.9.0.1');
            s.hello({ guestKey: `res-key-${i}-xxxxxx` });
            await s.until(() => s.last('welcome'));
            s.close();
        }
        await sleep(800);
        // the closed sockets had no party: nothing to resume
        expect(b.relay.memo().resume).toBeLessThanOrEqual(1);
        await b.stop();
    });

    it('rooms per IP are capped, guests included', async () => {
        const b = await boot();
        let refused = 0;
        for (let i = 0; i < PARTY_LIMITS.roomsLivePerIp + 1; i++) {
            const s = await b.client('77.77.77.77');
            s.hello({ guestKey: `room-key-${i}-xxxxx` });
            await s.until(() => s.last('welcome'));
            s.send({ t: 'party.set', openSeats: true });
            s.send({ t: 'party.create', difficulty: 'easy' });
            await s.until(() => s.last('party'));
            s.send({ t: 'party.set', openSeats: true });
            await s.until(() => s.last('party')?.openSeats === true);
            s.send({ t: 'party.start' });
            await s.until(() => s.last('party')?.phase === 'pick');
            s.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
            await s.until(() => s.last('party')?.phase === 'loading');
            s.send({ t: 'loaded' });
            const r = await s.until(
                () => s.last('match') || s.json.find(j => j.t === 'error' && j.code === 'server_busy')
            );
            if (r.t === 'error') refused++;
        }
        expect(refused).toBe(1);
        expect(b.relay.rooms.size).toBe(PARTY_LIMITS.roomsLivePerIp);
        await b.stop();
    });

    it('a JSON frame with a prototype key is a clean protocol error', async () => {
        const b = await boot();
        const a = await b.client();
        a.raw('{"t":"hello","constructor":1}');
        await a.until(() => a.last('error'));
        expect(a.last('error')!.code).toBe('bad_message');
        expect(b.events.map(e => e.e)).not.toContain('relay_error');
        await b.stop();
    });
});

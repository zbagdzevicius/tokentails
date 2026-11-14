import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { SIM_HASH, TestClient } from './relay-test-client.helper-spec';
import { SIM_VERSION, simFor } from '../../vendor/pawlegends-sim';
import { bootMm } from '../mm/mm-relay.helper-spec';

/*
 * The founder's 2026-11-14 co-op report: two friends in one party saw different bots and towers. A member on another
 * sim build (an open tab from before the v28 deploy, an app whose update had not landed) was told `update_required`
 * and then seated in the room anyway, where its own sim drifted from the room's. The relay now never seats a mixed
 * party: refused at the start and at the rematch, and a seat on another build is never bound to a room.
 */

jest.setTimeout(120_000);

const OLD = SIM_VERSION - 1;
const OLD_HASH = simFor(OLD)!.SIM_SOURCE_HASH!;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function boot() {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'spec-secret-0123456789abcdef';
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets: new PartyTicketService(),
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        now: () => Date.now(),
        champions: async () => [],
    });
    const clients: TestClient[] = [];
    const client = async () => {
        const c = new TestClient(port);
        clients.push(c);
        await c.open();
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { client, stop };
}

/** A leader on the live build and a member on `memberSim` in one lobby. */
async function lobby(b: Awaited<ReturnType<typeof boot>>, memberSim: { sim: number; simHash: string }, tag: string) {
    const a = await b.client();
    a.hello({ guestKey: `leader-key-skew-${tag}` });
    await a.until(() => a.last('welcome'));
    a.send({ t: 'party.create', difficulty: 'easy' });
    const pa = await a.until(() => a.last('party'));
    const c = await b.client();
    c.hello({ guestKey: `member-key-skew-${tag}`, ...memberSim });
    const wc = await c.until(() => c.last('welcome'));
    c.send({ t: 'party.join', code: pa.code });
    await a.until(() => a.last('party')?.members.length === 2);
    return { a, c, wc };
}

const errors = (c: TestClient) => c.json.filter(j => j.t === 'error').map(j => j.code);

describe('party relay: one build per party (no mixed-sim rooms)', () => {
    it('a member on an older sim: the start is refused, the member must update, the leader hears why', async () => {
        const b = await boot();
        try {
            const { a, c } = await lobby(b, { sim: OLD, simHash: OLD_HASH }, '01');
            a.send({ t: 'party.start' });
            await c.until(() => errors(c).includes('update_required'));
            await a.until(() => errors(a).includes('party_update'));
            await sleep(500);
            expect(a.last('party')?.phase).toBe('lobby');
            expect(a.json.some(j => j.t === 'match')).toBe(false);
            expect(c.json.some(j => j.t === 'match')).toBe(false);
        } finally {
            await b.stop();
        }
    });

    it('a leader on an older sim: the leader must update, the member on the live build hears why', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello({ guestKey: 'leader-key-skew-02', sim: OLD, simHash: OLD_HASH });
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'easy' });
            const pa = await a.until(() => a.last('party'));
            const c = await b.client();
            c.hello({ guestKey: 'member-key-skew-02' });
            await c.until(() => c.last('welcome'));
            c.send({ t: 'party.join', code: pa.code });
            await a.until(() => a.last('party')?.members.length === 2);
            a.send({ t: 'party.start' });
            await a.until(() => errors(a).includes('update_required'));
            await c.until(() => errors(c).includes('party_update'));
            expect(errors(c)).not.toContain('update_required');
            expect(a.last('party')?.phase).toBe('lobby');
        } finally {
            await b.stop();
        }
    });

    it('a party on one build starts, and its match names the room`s sim version and hash', async () => {
        const b = await boot();
        try {
            const { a, c } = await lobby(b, { sim: SIM_VERSION, simHash: SIM_HASH }, '03');
            a.send({ t: 'party.start' });
            await a.until(() => a.last('party')?.phase === 'pick');
            a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
            c.send({ t: 'pick.lock', hero: 'sage', trick: 'pounce' });
            const m = await c.until(() => c.last('match'), 60_000);
            expect(m.simVersion).toBe(SIM_VERSION);
            expect(m.simHash).toBe(SIM_HASH);
            expect(errors(a)).toEqual([]);
            expect(errors(c)).toEqual([]);
        } finally {
            await b.stop();
        }
    });

    it('a seat resumed on another build is never bound to the running room', async () => {
        const b = await boot();
        try {
            const { a, c, wc } = await lobby(b, { sim: SIM_VERSION, simHash: SIM_HASH }, '04');
            a.send({ t: 'party.start' });
            await a.until(() => a.last('party')?.phase === 'pick');
            a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
            c.send({ t: 'pick.lock', hero: 'sage', trick: 'pounce' });
            await c.until(() => c.last('match'), 60_000);
            c.close();
            await sleep(300);
            // the same player comes back on an older build (another device, an app before its update)
            const c2 = await b.client();
            c2.hello({
                guestKey: 'member-key-skew-04',
                sim: OLD,
                simHash: OLD_HASH,
                resume: { token: wc.resumeToken },
            });
            await c2.until(() => errors(c2).includes('update_required'), 20_000);
            await sleep(500);
            expect(c2.json.some(j => j.t === 'match')).toBe(false);
        } finally {
            await b.stop();
        }
    });

    it('Quick Play: a friend party on two builds is not queued (the queue groups by one build)', async () => {
        const b = await bootMm();
        try {
            const lead = await b.guest();
            lead.send({ t: 'party.create', difficulty: 'easy' });
            const pv = await lead.until(() => lead.last('party'));
            const friend = await b.guest({ sim: OLD, simHash: OLD_HASH });
            friend.send({ t: 'party.join', code: pv.code });
            await lead.until(() => (lead.last('party')?.members.length === 2 ? true : null));
            lead.send({ t: 'mm.join', queue: 'coop', side: 'cat' });
            await friend.until(() => errors(friend).includes('update_required'));
            await lead.until(() => errors(lead).includes('party_update'));
            await sleep(700);
            expect(lead.json.some(j => j.t === 'mm.status')).toBe(false);
            expect(lead.last('party')?.queue).toBeFalsy();
        } finally {
            await b.stop();
        }
    });
});

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore, type StoredRoom } from './room-store';
import { LIVE, TestClient } from './relay-test-client.helper-spec';
import { liveSim } from './referee-core';
import { encodeTurnBody } from './net';

/*
 * Party play N9 (MULTIPLAYER.md §3.6, §12 N9): checkpoint, lease, restore. The relay runs on an accelerated clock
 * (×40) so a match reaches tick 9,000 in seconds; the room closes every overdue turn on each wake, in order.
 */

const SPEED = 40;

/** A clock that runs ×SPEED until `realTime()` is called, then at ×1 from where it got to. */
function clock() {
    let base = Date.now();
    let fakeBase = base;
    let speed = SPEED;
    const now = () => fakeBase + (Date.now() - base) * speed;
    return {
        now,
        realTime: () => {
            fakeBase = now();
            base = Date.now();
            speed = 1;
        },
        fast: () => {
            fakeBase = now();
            base = Date.now();
            speed = SPEED;
        },
    };
}

async function relayOn(server: Server, store: MemoryRoomStore, now: () => number) {
    return new PartyRelay({
        server,
        store,
        tickets: new PartyTicketService(),
        referee: new RefereePool({ inline: true }),
        originAllowed: () => true,
        gate: new LoopGate(() => 0),
        now,
        log: (e, p) => (e === 'relay_error' ? console.log('relay_error', p) : undefined),
    });
}

/** The final hash of a sequence of TURN frames, applied the way a client does. */
function finalOf(config: StoredRoom['config'], turns: { entries: { slot: number; sub: number; cmd: Uint8Array }[] }[]) {
    const sim = liveSim();
    const m = sim.createMatch(config);
    for (const t of turns) {
        for (let sub = 0; sub < 2 && !sim.result(m); sub++) {
            const per: ReturnType<typeof sim.decodeCommand>[][] = [[], [], []];
            for (const e of t.entries) if (e.sub === sub) per[e.slot].push(sim.decodeCommand(e.cmd));
            sim.step(m, per[0], per);
        }
    }
    return sim.result(m);
}

describe('room restore (N9)', () => {
    jest.setTimeout(240_000);

    it('kill mid-match (tick 4,000): a new instance restores the party and room, clients resume, the verdict verifies', async () => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'restore-secret-0123456789';
        const server = createServer();
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        const port = (server.address() as AddressInfo).port;
        const store = new MemoryRoomStore();
        const ck = clock();
        const relayA = await relayOn(server, store, ck.now);
        const a = new TestClient(port);
        const b = new TestClient(port);
        await Promise.all([a.open(), b.open()]);
        a.hello();
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
        await a.until(() => a.last('match'));
        // nobody beats on the fast clock: both slots get piloted (reason drop); pilots play the match
        // tick 4,000 (a pilot-flown match can end before 9,000, depending on when pilot commands land)
        await a.until(() => a.turns.length >= 2000, 60_000);
        const roomId = [...store.rooms.keys()][0];
        await relayA.shutdown();
        const handed = store.rooms.get(roomId)!;
        expect(handed.handoff).toBe(true);
        expect(handed.chunks.length).toBeGreaterThan(1); // checkpoints appended deltas
        a.close();
        b.close();

        // after the restart the clock runs at ×1 (the referee re-sims the log meanwhile; humans resume at once)
        ck.realTime();
        const relayB = await relayOn(server, store, ck.now);
        const restored = await relayB.restore();
        expect(restored).toEqual([roomId]);
        expect(store.rooms.get(roomId)!.epoch).toBe(1);
        // the clients resume with their tokens: the party (leader, members) is back, they get the match and catch up
        const a2 = new TestClient(port);
        const b2 = new TestClient(port);
        await Promise.all([a2.open(), b2.open()]);
        a2.hello({ resume: { token: wa.resumeToken } });
        b2.hello({ resume: { token: wb.resumeToken } });
        expect((await a2.until(() => a2.last('welcome'))).member).toBe(wa.member);
        const party = await a2.until(() => a2.last('party'));
        expect(party.leader).toBe(wa.member);
        expect(party.members.map((m: any) => m.id).sort()).toEqual([wa.member, wb.member].sort());
        const m2 = await a2.until(() => a2.last('match'));
        expect(m2.room).toBe(roomId);
        a2.send({ t: 'sync', fromTurn: 0 });
        b2.send({ t: 'sync', fromTurn: 0 });
        // let the room finish fast again once both clients are back and caught up
        await a2.until(() => a2.turns.length > 2000, 30_000);
        ck.fast();
        const end = await a2.until(() => a2.last('end'), 200_000);
        await b2.until(() => b2.last('end'), 10_000);
        const row = store.rooms.get(roomId)!;
        expect(row.status).toBe('ended');
        expect(row.verdict!.verified).toBe(true);
        expect(end.finalHash).toBe(row.verdict!.finalHash);
        // the client's own turns (catch-up from 0, then live) give the same result
        const seen = new Map<number, typeof a2.turns[number]>();
        for (const t of a2.turns) seen.set(t.turn, t);
        const ordered = [...seen.values()].sort((x, y) => x.turn - y.turn);
        expect(ordered.map(t => t.turn)).toEqual(ordered.map((_, i) => i));
        expect(finalOf(row.config, ordered)!.finalHash).toBe(row.verdict!.finalHash);
        a2.close();
        b2.close();
        await relayB.shutdown();
        await new Promise(r => server.close(r));
    });

    it('a stale room (past the 300 s window) is abandoned, a room another instance holds is not; two instances never both claim a room', async () => {
        const store = new MemoryRoomStore();
        const now = Date.now();
        const base = (id: string, ageMs: number, handoff: boolean): StoredRoom => ({
            _id: id,
            party: `p-${id}`,
            simVersion: LIVE.SIM_VERSION,
            simHash: LIVE.SIM_SOURCE_HASH!,
            config: {
                seed: 1,
                picks: ['clem', 'sage', 'gabe', 'brutus', 'lambo', 'aviete'],
                tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'],
                difficulty: 'easy',
                humans: [0, 1],
            },
            occupants: [{ slot: 0, accountId: null, guestKeyHash: null, name: 'Sunny Tabby', ticketed: false }],
            chunks: [Buffer.from(encodeTurnBody({ turn: 0, modeMask: 0, acks: [], entries: [] }))],
            lastTurn: 1,
            lastSeq: [0, 0, 0],
            pilotTicks: {},
            openUnclaimedAt1800: false,
            unscored: null,
            status: 'live',
            verdict: null,
            owner: 'old',
            epoch: 0,
            handoff,
            resume: {},
            createdAt: new Date(now - ageMs),
            updatedAt: new Date(now - ageMs),
        });
        await store.create(base('fresh', 1000, true));
        await store.create(base('stale', 400_000, true));
        // a match another running instance still checkpoints (DigitalOcean during the migration): never touched
        await store.create(base('held', 1000, false));
        const s1 = createServer();
        const s2 = createServer();
        const r1 = await relayOn(s1, store, Date.now);
        const r2 = await relayOn(s2, store, Date.now);
        const [g1, g2] = await Promise.all([r1.restore(), r2.restore()]);
        expect([...g1, ...g2]).toEqual(['fresh']);
        expect(store.rooms.get('stale')!.status).toBe('abandoned');
        expect(store.rooms.get('held')!.status).toBe('live');
        expect(store.rooms.get('held')!.owner).toBe('old');
        await r1.shutdown();
        await r2.shutdown();
    });
});

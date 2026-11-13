import { createHash } from 'crypto';
import { createServer, type IncomingMessage, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from '../party/loop-gate';
import { PartyRelay } from '../party/party-relay';
import { PartyTicketService } from '../party/party-ticket.service';
import { RefereePool } from '../party/referee-pool';
import { MemoryRoomStore } from '../party/room-store';
import { LIVE, TestClient } from '../party/relay-test-client.helper-spec';
import { memoryMm, type RankedJoinSource } from './mm-bridge';
import { identityHash, MemoryMmRoomStore } from './mm-room.schema';
import { MemoryRatingSource } from './rating.schema';

/* Quick Play relay specs: an in-process relay with the memory mm stores and a skewable clock. */

const SECRET = 'spec-secret-0123456789abcdef';

export async function bootMm(opts: { ip?: (req: IncomingMessage) => string; ranked?: RankedJoinSource } = {}) {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const store = new MemoryRoomStore();
    const mmRooms = new MemoryMmRoomStore();
    const ratings = new MemoryRatingSource();
    const tickets = new PartyTicketService();
    const skew = { ms: 0 };
    const events: { e: string; p: Record<string, unknown> }[] = [];
    let ips = 0;
    const relay = new PartyRelay({
        server,
        store,
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        now: () => Date.now() + skew.ms,
        // every socket its own address unless a spec picks one (x-test-ip)
        clientIp:
            opts.ip ??
            (req => {
                const h = req.headers['x-test-ip'];
                return typeof h === 'string' ? h : `10.9.${(++ips >> 8) & 255}.${ips & 255}`;
            }),
        log: (e, p) => events.push({ e, p }),
        mm: memoryMm({ rooms: mmRooms, ratings, ...(opts.ranked ? { ranked: opts.ranked } : {}) }),
    });
    const clients: TestClient[] = [];
    const client = async (headers: Record<string, string> = {}) => {
        const c = new TestClient(port, 'http://localhost:3000', headers);
        clients.push(c);
        await c.open();
        return c;
    };
    /** A helloed client with its own guest identity. */
    let guests = 0;
    const guest = async (extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
        const c = await client(headers);
        c.hello({ guestKey: `guest-key-${process.pid}-${++guests}`, ...extra });
        await c.until(() => c.last('welcome'));
        return c;
    };
    /**
     * A helloed guest with `played` completed Quick Play rooms on the server (the casual newbie lock reads server
     * records, never `hint.matches`).
     */
    let rooms = 0;
    const veteran = async (extra: Record<string, unknown> = {}, played = 5, headers: Record<string, string> = {}) => {
        const guestKey = `vet-key-${process.pid}-${++guests}`;
        const hash = identityHash(
            `guest:${createHash('sha256').update(`guest:${guestKey}`).digest('hex').slice(0, 24)}`
        );
        const at = new Date(Date.now() + skew.ms - 3_600_000);
        for (let i = 0; i < played; i++)
            await mmRooms.create({
                _id: `vetroom${++rooms}`,
                queue: 'coop',
                region: 'eu',
                side: 'cat',
                difficulty: 'normal',
                sim: 'x',
                fill: [],
                queueMs: {},
                members: [
                    {
                        slot: 0,
                        identityHash: hash,
                        accountId: null,
                        joinedTick: 0,
                        backfill: false,
                        ratingAtStart: null,
                    },
                ],
                outcome: 'won',
                endedAt: at,
                createdAt: at,
            });
        const c = await client(headers);
        c.hello({ guestKey, ...extra });
        await c.until(() => c.last('welcome'));
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { relay, store, mmRooms, ratings, tickets, skew, events, client, guest, veteran, stop, port };
}

/** Free heroes of a side, in sim order. */
export const heroesOf = (side: 'cat' | 'dog'): string[] =>
    (LIVE.party!.HERO_IDS as readonly string[]).filter(h => LIVE.party!.heroSideOf(h) === side);
export const TRICK = (LIVE.party!.TRICK_IDS as readonly string[])[0];

/** Every client locks a free hero of the party's side and reports loaded; resolves with each `match` frame. */
export async function lockAndLoad(clients: TestClient[]): Promise<Record<string, any>[]> {
    const view = await clients[0].until(() =>
        clients[0].last('party')?.phase === 'pick' ? clients[0].last('party') : null
    );
    const heroes = heroesOf(view.mm.side);
    clients.forEach((c, i) => c.send({ t: 'pick.lock', hero: heroes[i], trick: TRICK }));
    await clients[0].until(() => (clients[0].last('party')?.phase === 'loading' ? true : null), 15_000);
    clients.forEach(c => c.send({ t: 'loaded' }));
    const matches = await Promise.all(clients.map(c => c.until(() => c.last('match'), 15_000)));
    // loaded again once seated: the room starts these slots as humans (not late-load pilots)
    clients.forEach(c => c.send({ t: 'loaded' }));
    return matches;
}

/** Wait for the relay's 500 ms timer to run at least once more. */
export const nextTick = () => new Promise(r => setTimeout(r, 700));

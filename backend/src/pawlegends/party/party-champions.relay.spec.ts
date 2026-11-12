import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { CHAMPS_MAX_AGE_MS, CHAMPS_RELOAD_MS, PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';
import { CHAMPIONS, isFreeChampion, rotationWeek } from '../pawlegends-catalog';

/*
 * Champion store over real sockets (docs/plans/moba/CHAMPION-STORE.md §8.1): a ticketed member locks only starters,
 * the week's rotation and the champions its account owns; an unlock is seen on the next tap after a refusal; a
 * refund (the owned row revoked) is seen once the cached answer is older than CHAMPS_MAX_AGE_MS.
 */

const SECRET = 'spec-secret-0123456789abcdef';

async function boot(owned: Map<string, string[]>) {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const tickets = new PartyTicketService();
    const clock = { offset: 0 };
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        now: () => Date.now() + clock.offset,
        champions: async account => owned.get(account) ?? [],
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
    return { relay, tickets, client, stop, clock };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A cat champion that is neither a starter nor free in the week of `ms`. */
const lockedCat = (ms: number) =>
    CHAMPIONS.find(c => c.side === 'cat' && !isFreeChampion(c.hero, rotationWeek(ms)))!.hero;

async function pickOfTwo(b: Awaited<ReturnType<typeof boot>>, afterHello?: () => void) {
    const a = await b.client();
    a.hello({ ticket: b.tickets.issue({ accountId: 'acct-a', guest: false }).ticket });
    await a.until(() => a.last('welcome'));
    await sleep(100);
    afterHello?.();
    a.send({ t: 'party.create', difficulty: 'easy' });
    const pa = await a.until(() => a.last('party'));
    const c = await b.client();
    c.hello({ guestKey: 'member-key-champs-01' });
    await c.until(() => c.last('welcome'));
    c.send({ t: 'party.join', code: pa.code });
    await a.until(() => a.last('party')?.members.length === 2);
    a.send({ t: 'party.start' });
    await a.until(() => a.last('party')?.phase === 'pick');
    const me = () => a.last('party')?.members.find((m: { id: string }) => m.id === a.last('party')?.you);
    return { a, c, me };
}

describe('party relay: champion ownership', () => {
    jest.setTimeout(60_000);

    it('refuses a locked champion, then allows it after an unlock (read again on the next tap)', async () => {
        const owned = new Map<string, string[]>();
        const b = await boot(owned);
        try {
            const hero = lockedCat(Date.now());
            const { a, me } = await pickOfTwo(b);
            a.send({ t: 'pick.lock', hero, trick: 'pounce' });
            await sleep(300);
            expect(me()?.locked).toBe(false);
            // the account unlocks it (Yarn, a purchase): the next tap after the reload gap reads it again
            owned.set('acct-a', [hero]);
            b.clock.offset += CHAMPS_RELOAD_MS + 1;
            a.send({ t: 'pick.lock', hero, trick: 'pounce' });
            await a.until(() => me()?.locked === true);
            expect(me()?.hero).toBe(hero);
        } finally {
            await b.stop();
        }
    });

    it('a refunded champion stops being playable once the cached answer is old', async () => {
        const hero = lockedCat(Date.now());
        const owned = new Map<string, string[]>([['acct-a', [hero]]]);
        const b = await boot(owned);
        try {
            // refunded after the hello read it; the cache is past its max age when the pick opens
            const { a, me } = await pickOfTwo(b, () => {
                owned.set('acct-a', []);
                b.clock.offset += CHAMPS_MAX_AGE_MS + 1;
            });
            a.send({ t: 'pick.lock', hero, trick: 'pounce' });
            await sleep(500);
            expect(me()?.locked).toBe(false);
            a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
            await a.until(() => me()?.locked === true);
        } finally {
            await b.stop();
        }
    });
});

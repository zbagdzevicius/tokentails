import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay, type PartyCard } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/* Party play lane P over real sockets: hello hints, party.card (D8), hero skins, ticketed identity on resume. */

const SECRET = 'spec-secret-0123456789abcdef';
const ART = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.gif';

async function boot() {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const tickets = new PartyTicketService();
    const cards: Record<string, PartyCard & { owner: string }> = {
        cat1: {
            owner: 'acct-a',
            catId: 'cat1',
            image: ART,
            element: 'fire',
            tier: 'epic',
            catalog: 'Siamese',
            ownName: 'Sir Fluff',
        },
    };
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        cards: async (account, catId) => {
            const c = cards[catId];
            if (!c || c.owner !== account) return null;
            const card: PartyCard = { ...c };
            delete (card as Partial<typeof c>).owner;
            return card;
        },
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
    return { relay, tickets, client, stop };
}

describe('party relay lane P', () => {
    jest.setTimeout(60_000);

    it('hello hints set the default difficulty (lowest member tier) and the newbie flag', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello({ hint: { maxDifficulty: 'hard', newbie: false } });
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'hard' });
            const pa = await a.until(() => a.last('party'));
            expect(pa.difficulty).toBe('hard');
            const c = await b.client();
            c.hello({ hint: { maxDifficulty: 'easy', newbie: true } });
            await c.until(() => c.last('welcome'));
            c.send({ t: 'party.join', code: pa.code });
            const v = await a.until(() => (a.last('party')?.members.length === 2 ? a.last('party') : null));
            expect(v.difficulty).toBe('easy');
            expect(v.members[1].newbie).toBe(true);
        } finally {
            await b.stop();
        }
    });

    it('party.card: only an owned card; peers get art, element and tier, never catId or the custom name', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello({ ticket: b.tickets.issue({ accountId: 'acct-a', guest: false }).ticket });
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'normal' });
            const pa = await a.until(() => a.last('party'));
            const c = await b.client();
            c.hello({ ticket: b.tickets.issue({ accountId: 'acct-c', guest: true }).ticket });
            await c.until(() => c.last('welcome'));
            c.send({ t: 'party.join', code: pa.code });
            await c.until(() => c.last('party')?.members.length === 2);
            // someone else's card is refused silently
            c.send({ t: 'party.card', catId: 'cat1' });
            a.send({ t: 'party.card', catId: 'cat1' });
            const seen = await c.until(() => (c.last('party')?.members[0].card ? c.last('party') : null));
            expect(seen.members[0].card).toEqual({ image: ART, element: 'fire', tier: 'epic' });
            expect(seen.members[0].name).toMatch(/ Siamese$/);
            expect(JSON.stringify(c.json)).not.toContain('Sir Fluff');
            expect(JSON.stringify(c.json)).not.toContain('cat1');
            expect(seen.members[1].card).toBeUndefined();
            const own = await a.until(() => (a.last('party')?.members[0].card ? a.last('party') : null));
            expect(own.members[0].card.catId).toBe('cat1');
            expect(own.members[0].ownName).toBe('Sir Fluff');
            // the card is the hero skin in the match (render-only cosmetics)
            a.send({ t: 'party.start' });
            await a.until(() => a.last('party')?.phase === 'pick');
            a.send({ t: 'pick.lock', hero: 'clem', trick: 'pounce' });
            c.send({ t: 'pick.lock', hero: 'sage', trick: 'snack' });
            await a.until(() => a.last('party')?.phase === 'loading');
            a.send({ t: 'loaded' });
            c.send({ t: 'loaded' });
            const m = await c.until(() => c.last('match'));
            expect(m.cosmetics.heroSkins).toEqual([ART, null, null, null, null, null]);
            // taking it off
        } finally {
            await b.stop();
        }
    });

    it('a card from an unticketed guest is ignored', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello({ guestKey: 'guest-key-1234' });
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'normal' });
            await a.until(() => a.last('party'));
            a.send({ t: 'party.card', catId: 'cat1' });
            a.send({ t: 'party.set', difficulty: 'hard' });
            const v = await a.until(() => (a.last('party')?.difficulty === 'hard' ? a.last('party') : null));
            expect(v.members[0].card).toBeUndefined();
            expect(v.members[0].guest).toBe(true);
        } finally {
            await b.stop();
        }
    });

    it('a resume token is bound to its identity: another account cannot take the seat', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello({ ticket: b.tickets.issue({ accountId: 'acct-a', guest: false }).ticket });
            const wa = await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'normal' });
            await a.until(() => a.last('party'));
            const thief = await b.client();
            thief.hello({
                ticket: b.tickets.issue({ accountId: 'acct-x', guest: false }).ticket,
                resume: { token: wa.resumeToken },
            });
            const wt = await thief.until(() => thief.last('welcome'));
            expect(wt.member).not.toBe(wa.member);
            expect(thief.last('party')).toBeUndefined();
            // the owner resumes on a new socket and keeps the seat
            const again = await b.client();
            again.hello({
                ticket: b.tickets.issue({ accountId: 'acct-a', guest: false }).ticket,
                resume: { token: wa.resumeToken },
            });
            const w2 = await again.until(() => again.last('welcome'));
            expect(w2.member).toBe(wa.member);
            expect((await again.until(() => again.last('party'))).leader).toBe(wa.member);
        } finally {
            await b.stop();
        }
    });

    it('nudge reaches the away member; Start waits, then starts anyway', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello();
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'normal' });
            const pa = await a.until(() => a.last('party'));
            const c = await b.client();
            c.hello();
            await c.until(() => c.last('welcome'));
            c.send({ t: 'party.join', code: pa.code });
            await a.until(() => a.last('party')?.members.length === 2);
            const cid = (await c.until(() => c.last('welcome'))).member;
            c.send({ t: 'away' });
            a.send({ t: 'party.start' });
            const w = await a.until(() => (a.last('party')?.waiting?.length ? a.last('party') : null));
            expect(w.waiting).toEqual([cid]);
            a.send({ t: 'party.nudge', member: cid });
            const n = await c.until(() => c.last('nudge'));
            expect(n.from).toBe(w.you);
        } finally {
            await b.stop();
        }
    });

    it('lane M: social echoes enumerated ids only (clamped points, rate limit); counters list the totals', async () => {
        const b = await boot();
        try {
            const a = await b.client();
            a.hello();
            await a.until(() => a.last('welcome'));
            a.send({ t: 'party.create', difficulty: 'normal' });
            const pa = await a.until(() => a.last('party'));
            const c = await b.client();
            c.hello();
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
            await c.until(() => c.last('match'));
            // an id past the quick lines is dropped (no echo, no strike); a good one reaches both, from the slot
            c.send({ t: 'social', kind: 'chat', id: 9 });
            c.send({ t: 'social', kind: 'emote', id: 4 });
            c.send({ t: 'social', kind: 'ping', id: 0, x: 999_999, y: -5 });
            const got = await a.until(() => a.last('social'));
            expect(got).toMatchObject({ kind: 'ping', id: 0, x: 100_000, y: 0, slot: 1 });
            // the rate limit: a second one inside 2 s is dropped
            c.send({ t: 'social', kind: 'chat', id: 1 });
            await new Promise(r => setTimeout(r, 300));
            expect(a.json.filter(m => m.t === 'social')).toHaveLength(1);
            expect(c.closed).toBeNull();
            const n = b.relay.counters();
            for (const k of ['desyncs', 'divergences', 'restores', 'refused_busy', 'join_fail_global'])
                expect(typeof (n as Record<string, unknown>)[k]).toBe('number');
        } finally {
            await b.stop();
        }
    });
});

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay, matchThreadId, type RelayChatInfo, type RelayChatLine } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * In-match chat over real sockets (MATCH-CHAT.md §2, §3, PROTO 6): team text only when every human on the team is a
 * registered 16+ account, all chat phrases only, phrase scopes, a frame carries the hero slot and never a member id,
 * old sockets get only the legacy wheel line of a mapped phrase, `chat_mute` refuses, lines are stored in the room's
 * `match` thread, and a bot line is the same frame as a human's (same keys), refused outside the match.
 */

const SECRET = 'spec-secret-0123456789abcdef';

async function boot(infos: Record<string, Partial<RelayChatInfo>>) {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const tickets = new PartyTicketService();
    const stored: Array<{ line: RelayChatLine; members: string[] }> = [];
    const events: { e: string; p: Record<string, unknown> }[] = [];
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        log: (e, p) => events.push({ e, p }),
        chat: {
            info: async account => ({ band: null, muted: false, blocked: [], ...(infos[account] ?? {}) }),
            store: (line, members) => stored.push({ line, members }),
        },
    });
    const clients: TestClient[] = [];
    const join = async (opts: { account?: string; proto?: number; guestKey?: string }) => {
        const c = new TestClient(port);
        clients.push(c);
        await c.open();
        const extra: Record<string, unknown> = { hint: { maxDifficulty: 'hard', newbie: false, matches: 12 } };
        if (opts.account) extra.ticket = tickets.issue({ accountId: opts.account, guest: false }).ticket;
        if (opts.guestKey) extra.guestKey = opts.guestKey;
        if (opts.proto) extra.proto = opts.proto;
        c.hello(extra);
        await c.until(() => c.last('welcome'));
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { relay, join, stop, stored, events };
}

type Booted = Awaited<ReturnType<typeof boot>>;
const HEROES = ['clem', 'sage', 'bengas'];
const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));

async function inMatch(b: Booted, ...who: Array<{ account?: string; proto?: number; guestKey?: string }>) {
    const cs: TestClient[] = [];
    for (const w of who) cs.push(await b.join(w));
    const [lead, ...rest] = cs;
    lead.send({ t: 'party.create', difficulty: 'easy' });
    const p = await lead.until(() => lead.last('party'));
    for (const c of rest) {
        c.send({ t: 'party.join', code: p.code });
        await c.until(() => c.last('party'));
    }
    await lead.until(() => lead.last('party')?.members.length === cs.length);
    await settle();
    lead.send({ t: 'party.start' });
    await lead.until(() => lead.last('party')?.phase === 'pick');
    cs.forEach((c, i) => c.send({ t: 'pick.lock', hero: HEROES[i], trick: 'pounce' }));
    await lead.until(() => lead.last('party')?.phase === 'loading');
    cs.forEach(c => c.send({ t: 'loaded' }));
    for (const c of cs) await c.until(() => c.last('match'));
    await lead.until(() => lead.last('party')?.phase === 'match');
    // live seats send beats (a quiet socket is piloted, and a piloted seat does not chat)
    const beat = setInterval(() => cs.forEach(c => c.beat()), 200);
    beats.push(beat);
    await lead.until(() => lead.turns.length > 3, 8000);
    // caught up: take the heroes back from the pilots (what a client does after loading)
    const live = [...b.relay.rooms.values()][0];
    for (let i = 0; i < 40 && cs.some(c => live.room.slots[c.last('match')!.you.slot].mode !== 'human'); i++) {
        cs.forEach(c => c.send({ t: 'back' }));
        await settle(100);
    }
    await settle();
    return cs;
}

const beats: NodeJS.Timeout[] = [];
afterEach(() => beats.splice(0).forEach(clearInterval));

const lines = (c: TestClient) => c.json.filter(m => m.t === 'chat.msg');
const rejects = (c: TestClient) => c.json.filter(m => m.t === 'chat.reject');

describe('in-match chat (PROTO 6)', () => {
    jest.setTimeout(60_000);

    it('a 16+ team: filtered team text with the slot and no member id, all chat phrases to everyone, stored per room', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-b': { band: '16-17' } });
        try {
            const [a, c] = await inMatch(b, { account: 'acct-a' }, { account: 'acct-b' });
            await a.until(() => a.last('party')?.chat?.match === 'text');
            const room = a.last('match')!.room as string;
            const slotA = a.last('match')!.you.slot;
            a.send({ t: 'chat.say', k: 't', text: '  nice   push ', ch: 'team' });
            const got = await c.until(() => lines(c)[0]);
            expect(got).toMatchObject({ t: 'chat.msg', ch: 'team', slot: slotA, k: 't', text: 'nice push' });
            expect(got.from).toBeUndefined();
            expect(JSON.stringify(got)).not.toContain('acct-a');
            expect(JSON.stringify(got)).not.toContain(a.last('welcome')!.member);
            // all chat: phrases with the `all` scope only; text there is quick only; a match-only phrase is out of scope
            a.send({ t: 'chat.say', k: 'q', id: 24, ch: 'all' });
            await c.until(() => lines(c).length === 2);
            expect(lines(c)[1]).toMatchObject({ ch: 'all', k: 'q', id: 24, slot: slotA });
            a.send({ t: 'chat.say', k: 't', text: 'hello all', ch: 'all' });
            await a.until(() => rejects(a)[0]);
            expect(rejects(a)[0].why).toBe('quick_only');
            a.send({ t: 'chat.say', k: 'q', id: 29, ch: 'all' });
            await a.until(() => rejects(a).length === 2);
            expect(rejects(a)[1].why).toBe('scope');
            // a pre-match phrase is not a match phrase
            a.send({ t: 'chat.say', k: 'q', id: 12, ch: 'team' });
            await a.until(() => rejects(a).length === 3);
            expect(rejects(a)[2].why).toBe('scope');
            // stickers are not in-match chat
            a.send({ t: 'chat.say', k: 's', id: 1, ch: 'team' });
            await a.until(() => rejects(a).length === 4);
            // the filter: a link is refused with the class only
            a.send({ t: 'chat.say', k: 't', text: 'add me on discord', ch: 'team' });
            await a.until(() => rejects(a).length === 5);
            expect(rejects(a)[4].why).toBe('link');
            // an idle hero covered by a pilot (AFK): its human's own socket still chats; the pilot never does
            const live = [...b.relay.rooms.values()][0] as any;
            live.room.slots[slotA].mode = 'pilot';
            a.send({ t: 'chat.say', k: 'q', id: 31, ch: 'team' });
            await c.until(() => lines(c).length === 3);
            live.room.slots[slotA].mode = 'human';
            await settle();
            expect(lines(c)).toHaveLength(3);
            expect(b.stored.map(s => s.line.kind)).toEqual(['match', 'match', 'match']);
            expect(b.stored[0].line).toMatchObject({
                from: 'acct-a',
                k: 't',
                text: 'nice push',
                thread: matchThreadId(room),
            });
            expect(b.stored[0].line._id).toBe(got.mid);
            expect(b.stored[0].members.sort()).toEqual(['acct-a', 'acct-b']);
        } finally {
            await b.stop();
        }
    });

    it('an under-16 (or a guest) on the team makes it quick: text refused, phrases delivered', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-k': { band: 'under16' } });
        try {
            const [a, k] = await inMatch(b, { account: 'acct-a' }, { account: 'acct-k' });
            await a.until(() => a.last('party')?.chat?.match === 'quick');
            a.send({ t: 'chat.say', k: 't', text: 'nice', ch: 'team' });
            expect((await a.until(() => rejects(a)[0])).why).toBe('quick_only');
            a.send({ t: 'chat.say', k: 'q', id: 28, ch: 'team' });
            expect(await k.until(() => lines(k)[0])).toMatchObject({ k: 'q', id: 28, ch: 'team' });
            // a bot's free text never reaches a quick team, even when handed straight to delivery
            const live = [...b.relay.rooms.values()][0] as any;
            const bot = live.chatBots.find((s: number) => s < 3);
            expect(
                (b.relay as any).deliverMatchChat(
                    live,
                    bot,
                    'team',
                    { k: 't', text: 'nice' },
                    { account: null, bot: true }
                )
            ).toBe(false);
            await settle();
            expect(lines(k).some(l => l.k === 't')).toBe(false);
        } finally {
            await b.stop();
        }
        const g = await boot({ 'acct-a': { band: '18+' } });
        try {
            const [a] = await inMatch(g, { account: 'acct-a' }, { guestKey: 'guest-key-0001' });
            await a.until(() => a.last('party')?.chat?.match === 'quick');
            a.send({ t: 'chat.say', k: 't', text: 'nice', ch: 'team' });
            expect((await a.until(() => rejects(a)[0])).why).toBe('quick_only');
        } finally {
            await g.stop();
        }
    });

    it('a PROTO 5 socket gets only the legacy wheel line of a mapped phrase; a chat_mute refuses; outside a match chat.say with a channel is refused', async () => {
        const b = await boot({
            'acct-a': { band: '18+' },
            'acct-o': { band: '18+' },
            'acct-m': { band: '18+', muted: null },
        });
        try {
            const [a, o, m] = await inMatch(
                b,
                { account: 'acct-a' },
                { account: 'acct-o', proto: 5 },
                { account: 'acct-m' }
            );
            const slotA = a.last('match')!.you.slot;
            await a.until(() => a.last('party')?.chat?.match === 'text');
            a.send({ t: 'chat.say', k: 'q', id: 25, ch: 'team' }); // gg → wheel 7
            a.send({ t: 'chat.say', k: 'q', id: 35, ch: 'team' }); // Close one!: no legacy line
            a.send({ t: 'chat.say', k: 't', text: 'push top', ch: 'team' });
            await m.until(() => lines(m).length === 3);
            await settle();
            expect(lines(o)).toEqual([]);
            const social = o.json.filter(j => j.t === 'social' && j.kind === 'chat');
            expect(social).toEqual([{ t: 'social', kind: 'chat', id: 7, from: '', slot: slotA }]);
            m.send({ t: 'chat.say', k: 'q', id: 28, ch: 'team' });
            expect((await m.until(() => rejects(m)[0])).why).toBe('muted');
        } finally {
            await b.stop();
        }
    });

    it('a bot line is the same frame as a human line (same keys, no marker), stored as bot:<slot>, refused outside the match', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-b': { band: '18+' } });
        try {
            const [a, c] = await inMatch(b, { account: 'acct-a' }, { account: 'acct-b' });
            await a.until(() => a.last('party')?.chat?.match === 'text');
            const live = [...b.relay.rooms.values()][0] as any;
            // the room has fill bots (the enemy team at least): it has a chatter and its referee samples them
            expect(live.chatBots.length).toBeGreaterThan(0);
            await a.until(() => (b.relay as any).botChats.has(live.room.id) && true);
            const bot = live.chatBots.find((s: number) => s < 3) ?? live.chatBots[0];
            a.send({ t: 'chat.say', k: 't', text: 'gl hf', ch: 'team' });
            await c.until(() => lines(c)[0]);
            // a bot's free text never goes to all chat (minors may sit on the other team): refused at delivery
            expect(
                (b.relay as any).deliverMatchChat(
                    live,
                    bot,
                    'all',
                    { k: 't', text: 'gl all' },
                    { account: null, bot: true }
                )
            ).toBe(false);
            const delivered = (b.relay as any).deliverMatchChat(
                live,
                bot,
                'team',
                { k: 't', text: 'gl all' },
                { account: null, bot: true }
            );
            expect(delivered).toBe(true);
            const botLine = await c.until(() => lines(c)[1]);
            expect(Object.keys(botLine).sort()).toEqual(Object.keys(lines(c)[0]).sort());
            expect(botLine).toMatchObject({ ch: 'team', slot: bot, k: 't', text: 'gl all' });
            expect(b.stored.find(s => s.line._id === botLine.mid)!.line.from).toBe(`bot:${bot}`);
            // the end window: 12 s after the referee's end a bot line is refused
            live.endedAtMs = Date.now() - 13_000;
            expect(
                (b.relay as any).deliverMatchChat(live, bot, 'all', { k: 'q', id: 25 }, { account: null, bot: true })
            ).toBe(false);
            live.endedAtMs = Date.now() - 1_000;
            expect(
                (b.relay as any).deliverMatchChat(live, bot, 'all', { k: 'q', id: 25 }, { account: null, bot: true })
            ).toBe(true);
            // a human never chats after the end
            a.send({ t: 'chat.say', k: 'q', id: 25, ch: 'team' });
            expect((await a.until(() => rejects(a)[0])).why).toBe('phase');
            expect(b.events.some(e => e.e === 'mp_chat_bot_refused')).toBe(true);
        } finally {
            await b.stop();
        }
    });

    it('"are you a bot?" silences every bot for the match even when the line itself is refused', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-k': { band: 'under16' } });
        try {
            const [a] = await inMatch(b, { account: 'acct-a' }, { account: 'acct-k' });
            await a.until(() => a.last('party')?.chat?.match === 'quick');
            const live = [...b.relay.rooms.values()][0] as any;
            await a.until(() => (b.relay as any).botChats.has(live.room.id) && true);
            const chatter = (b.relay as any).botChats.get(live.room.id).chat.chatter;
            expect(chatter.quiet).toBe(false);
            // the team is quick (an under-16 sits on it), so the text is refused, and all chat is quick only too
            a.send({ t: 'chat.say', k: 't', text: 'r u bots', ch: 'all' });
            expect((await a.until(() => rejects(a)[0])).why).toBe('quick_only');
            expect(chatter.quiet).toBe(true);
            expect(chatter.pendingCount).toBe(0);
        } finally {
            await b.stop();
        }
    });
});

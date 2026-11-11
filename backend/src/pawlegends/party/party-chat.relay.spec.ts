import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay, type RelayChatInfo, type RelayChatLine } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { RefereePool } from './referee-pool';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';

/*
 * Party chat over real sockets (CHAT-AVATARS.md §5, PROTO 5): the tier is the strictest member's (a guest, an under-16
 * or an unknown band makes it quick), text passes the filter or is refused with the reason class only, phrase scopes,
 * the sender is a member id (never an account), only registered senders are stored, PROTO 4 sockets never see a chat
 * frame, a chat_mute refuses, the own copy lists blocked members, avatars ride the party view, DM notices arrive.
 */

const SECRET = 'spec-secret-0123456789abcdef';

async function boot(infos: Record<string, Partial<RelayChatInfo>>) {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const tickets = new PartyTicketService();
    const stored: Array<{ line: RelayChatLine; members: string[] }> = [];
    let notify: ((n: { to: string; thread: string }) => void) | null = null;
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        chat: {
            info: async account => ({ band: null, muted: false, blocked: [], ...(infos[account] ?? {}) }),
            store: (line, members) => stored.push({ line, members }),
            onNotice: fn => {
                notify = fn;
                return () => (notify = null);
            },
        },
    });
    const clients: TestClient[] = [];
    const join = async (opts: { account?: string; guest?: boolean; proto?: number }) => {
        const c = new TestClient(port);
        clients.push(c);
        await c.open();
        const extra: Record<string, unknown> = {};
        if (opts.account) extra.ticket = tickets.issue({ accountId: opts.account, guest: !!opts.guest }).ticket;
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
    return { relay, join, stop, stored, notice: (to: string, thread: string) => notify?.({ to, thread }) };
}

const settle = () => new Promise(r => setTimeout(r, 150));

async function party(b: Awaited<ReturnType<typeof boot>>, ...who: Array<{ account?: string; guest?: boolean; proto?: number }>) {
    const [first, ...rest] = who;
    const lead = await b.join(first);
    lead.send({ t: 'party.create', difficulty: 'easy' });
    const p = await lead.until(() => lead.last('party'));
    const others = [];
    for (const w of rest) {
        const c = await b.join(w);
        c.send({ t: 'party.join', code: p.code });
        await c.until(() => c.last('party')?.members?.length >= 2 && c.last('party'));
        others.push(c);
    }
    await settle();
    return [lead, ...others];
}

const msgs = (c: TestClient) => c.json.filter(m => m.t === 'chat.msg');

describe('party chat (PROTO 5)', () => {
    jest.setTimeout(60_000);

    it('two 16+ accounts: text tier, filtered text delivered to both from a member id, stored with the account', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-b': { band: '16-17' } });
        try {
            const [a, c] = await party(b, { account: 'acct-a' }, { account: 'acct-b' });
            await a.until(() => a.last('party')?.chat?.tier === 'text');
            a.send({ t: 'chat.say', k: 't', text: '  gg   wp  ' });
            const got = await c.until(() => msgs(c)[0]);
            expect(got).toMatchObject({ k: 't', text: 'gg wp', from: a.last('welcome')!.member });
            expect(got.mid).toMatch(/^[a-f0-9]{24}$/);
            expect(JSON.stringify(got)).not.toContain('acct-a');
            await a.until(() => msgs(a)[0]);
            expect(b.stored).toHaveLength(1);
            expect(b.stored[0].line).toMatchObject({ from: 'acct-a', k: 't', text: 'gg wp', _id: got.mid });
            expect(b.stored[0].line.thread).toBe(a.last('party')!.chat.thread);
            expect(b.stored[0].members.sort()).toEqual(['acct-a', 'acct-b']);
            // the probe filter applies across the 18 line; links and words are refused with the class only
            a.send({ t: 'chat.say', k: 't', text: 'how old are you?' });
            expect((await a.until(() => a.last('chat.reject'))).why).toBe('contact');
            a.send({ t: 'chat.say', k: 't', text: 'join discord.gg/x' });
            await a.until(() => a.json.filter(m => m.t === 'chat.reject').length === 2);
            expect(a.last('chat.reject')!.why).toBe('link');
            await settle();
            expect(msgs(c)).toHaveLength(1);
            expect(b.stored).toHaveLength(1);
        } finally {
            await b.stop();
        }
    });

    it('a guest makes the party quick: text refused, party phrases and stickers work, DM-only phrases are out of scope', async () => {
        const b = await boot({ 'acct-a': { band: '18+' } });
        try {
            const [a, g] = await party(b, { account: 'acct-a' }, {});
            await a.until(() => a.last('party')?.chat);
            expect(a.last('party')!.chat.tier).toBe('quick');
            a.send({ t: 'chat.say', k: 't', text: 'hello' });
            expect((await a.until(() => a.last('chat.reject'))).why).toBe('quick_only');
            g.send({ t: 'chat.say', k: 'q', id: 12 });
            expect(await a.until(() => msgs(a)[0])).toMatchObject({ k: 'q', id: 12 });
            g.send({ t: 'chat.say', k: 's', id: 3 });
            await a.until(() => msgs(a).length === 2);
            g.send({ t: 'chat.say', k: 'q', id: 0 });
            expect((await g.until(() => g.last('chat.reject'))).why).toBe('scope');
            // guests' lines are delivered live, never stored
            expect(b.stored).toHaveLength(0);
        } finally {
            await b.stop();
        }
    });

    it('an under-16 or unknown band makes it quick; leaving restores text', async () => {
        const b = await boot({ 'acct-a': { band: '18+' }, 'acct-c': { band: '18+' }, 'acct-k': { band: 'under16' } });
        try {
            const [a, , k] = await party(b, { account: 'acct-a' }, { account: 'acct-c' }, { account: 'acct-k' });
            await a.until(() => a.last('party')?.members?.length === 3 && a.last('party'));
            expect(a.last('party')!.chat.tier).toBe('quick');
            k.send({ t: 'party.leave' });
            await a.until(() => a.last('party')?.members?.length === 2 && a.last('party')!.chat.tier === 'text');
        } finally {
            await b.stop();
        }
    });

    it('a PROTO 4 member never receives chat frames, and its chat.say is a malformed frame', async () => {
        const b = await boot({});
        try {
            const [a, old] = await party(b, {}, { proto: 4 });
            a.send({ t: 'chat.say', k: 'q', id: 12 });
            await a.until(() => msgs(a)[0]);
            await settle();
            expect(old.json.some(m => String(m.t).startsWith('chat.'))).toBe(false);
            old.send({ t: 'chat.say', k: 'q', id: 12 });
            expect((await old.until(() => old.last('error'))).code).toBe('bad_message');
        } finally {
            await b.stop();
        }
    });

    it('a chat_mute refuses party lines; the rate is 5 in 10 s', async () => {
        const b = await boot({ 'acct-m': { band: '18+', muted: Date.now() + 86_400_000 } });
        try {
            const [m, o] = await party(b, { account: 'acct-m' }, {});
            m.send({ t: 'chat.say', k: 'q', id: 12 });
            expect((await m.until(() => m.last('chat.reject'))).why).toBe('muted');
            for (let i = 0; i < 6; i++) o.send({ t: 'chat.say', k: 's', id: i % 8 });
            expect((await o.until(() => o.last('chat.reject'))).why).toBe('rate');
            expect(msgs(o)).toHaveLength(5);
        } finally {
            await b.stop();
        }
    });

    it('avatars ride the party view; the own copy lists blocked members; DM notices reach the account', async () => {
        const av = { i: 'c:0123456789abcdef01234567', img: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/cats/a.gif', f: 'frame.store.goldpaw' };
        const b = await boot({ 'acct-a': { band: '18+', av, blocked: ['acct-b'] }, 'acct-b': { band: '18+' } });
        try {
            const [a, c] = await party(b, { account: 'acct-a' }, { account: 'acct-b' });
            const bMember = c.last('welcome')!.member;
            const view = await c.until(() => {
                const v = c.last('party');
                return v?.members?.find((m: any) => m.id === a.last('welcome')!.member)?.av?.f && v;
            });
            expect(view.members.find((m: any) => m.id !== bMember).av).toEqual(av);
            expect(view.members.find((m: any) => m.id === bMember).av.i).toMatch(/^h:/);
            expect(view.blocks).toBeUndefined();
            await a.until(() => a.last('party')?.blocks?.includes(bMember));
            b.notice('acct-b', 'dAAAAAAAAAAAAAAAAAAAAAA');
            expect((await c.until(() => c.last('chat.notice'))).thread).toBe('dAAAAAAAAAAAAAAAAAAAAAA');
            await settle();
            expect(a.last('chat.notice')).toBeUndefined();
        } finally {
            await b.stop();
        }
    });
});

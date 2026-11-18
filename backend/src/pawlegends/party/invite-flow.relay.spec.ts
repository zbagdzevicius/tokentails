import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LoopGate } from './loop-gate';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { PresenceSink } from './presence-sink';
import { RefereePool } from './referee-pool';
import { relayChatInfo, relaySocialRevs } from './relay-chat-info';
import { MemoryRoomStore } from './room-store';
import { TestClient } from './relay-test-client.helper-spec';
import { NicknameService } from '../social/nickname.service';
import { SocialService } from '../social/social.service';
import { SocialMemoryModel } from '../social/social-model.helper-spec';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';

/*
 * The friend invite path end to end on the backend (SOCIAL-INVITES.md): the real relay, presence sink, social and
 * nickname services on memory models, two ticketed sockets. A renamed player shows their nickname in their own lobby
 * from the first view, a rename in the lobby reaches both players, a friend found by nickname is invited, sees it in the
 * inbox, accepts and lands in the party, and an inviter whose relay identity is a guest gets "no party", never a silent
 * nothing.
 */
const SECRET = 'spec-secret-0123456789abcdef';

async function boot() {
    process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
    const now = () => new Date();
    const m = {
        social: new SocialMemoryModel(
            [],
            [
                { fields: ['code'] },
                { fields: ['_id'] },
                { fields: ['nickKey'], partial: { nickKey: { $exists: true } } },
            ],
            now
        ),
        friends: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        blocks: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        presence: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        invites: new SocialMemoryModel([], [], now),
        buyers: new SocialMemoryModel(
            [
                { key: 'account:aaaa', ageBand: '18+' },
                { key: 'account:bbbb', ageBand: '18+' },
            ],
            [{ fields: ['key'] }],
            now
        ),
        rooms: new SocialMemoryModel([], [], now),
        users: new SocialMemoryModel(
            [
                { _id: 'aaaa', isGuest: false },
                { _id: 'bbbb', isGuest: false },
            ],
            [],
            now
        ),
        cats: new SocialMemoryModel([], [], now),
        sanctions: new SocialMemoryModel([], [], now),
        yarn: new MemoryModel([], [{ fields: ['_id'] }], now),
        yarnLog: new MemoryModel([], [{ fields: ['accountId', 'ref'] }], now),
    };
    const clock = { now };
    const social = new SocialService(
        m.social,
        m.friends,
        m.blocks,
        m.presence,
        m.invites,
        m.buyers,
        m.rooms,
        m.users,
        m.cats,
        clock
    );
    const names = new NicknameService(social, m.yarn, m.yarnLog, clock);
    const server: Server = createServer();
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const tickets = new PartyTicketService();
    const relay = new PartyRelay({
        server,
        store: new MemoryRoomStore(),
        tickets,
        referee: new RefereePool({ inline: true }),
        originAllowed: o => o === 'http://localhost:3000',
        gate: new LoopGate(() => 0),
        chat: {
            info: relayChatInfo({
                buyers: m.buyers,
                sanctions: m.sanctions,
                blocks: m.blocks,
                social: m.social,
                avatars: { social: m.social, owned: null, cats: m.cats, heroes: ['sage'] },
            }),
            revs: relaySocialRevs(m.social),
        },
    });
    const sink = new PresenceSink(() => relay.presenceSnapshot(), m.presence as any);
    const clients: TestClient[] = [];
    const join = async (account: string | null) => {
        const c = new TestClient(port);
        clients.push(c);
        await c.open();
        c.hello(
            account
                ? { ticket: tickets.issue({ accountId: account, guest: false }).ticket }
                : { guestKey: 'g'.repeat(32) }
        );
        await c.until(() => c.last('welcome'));
        return c;
    };
    const stop = async () => {
        clients.forEach(c => c.close());
        await relay.shutdown();
        await new Promise(r => server.close(r));
    };
    return { m, social, names, relay, sink, join, stop };
}

const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));
const names = (c: TestClient) => (c.last('party')?.members ?? []).map((x: { name: string }) => x.name);

describe('friend invites end to end (SOCIAL-INVITES.md)', () => {
    jest.setTimeout(30_000);

    it('the leader sees their nickname from the first lobby view (not the generated name)', async () => {
        const b = await boot();
        try {
            await b.names.change('aaaa', { name: 'zygis' });
            const a = await b.join('aaaa');
            // the chat side resolves at hello, before the party exists
            await settle();
            a.send({ t: 'party.create', difficulty: 'easy' });
            await a.until(() => a.last('party'));
            await settle();
            expect(names(a)).toEqual(['zygis']);
        } finally {
            await b.stop();
        }
    });

    it('add by nickname, invite, the inbox shows it, accept joins; both see nicknames; a rename reaches both', async () => {
        const b = await boot();
        try {
            await b.names.change('aaaa', { name: 'zygis' });
            await b.names.change('bbbb', { name: 'Mira' });
            // A finds B by typing part of the nickname, then adds the exact name (case-insensitive)
            const found = await b.social.search('aaaa', 'mi');
            expect(found.players.map(p => p.name)).toEqual(['Mira']);
            expect(JSON.stringify(found)).not.toMatch(/bbbb|PL-/);
            const t = await b.social.targetOf('aaaa', { name: 'MIRA' });
            expect(await b.social.request('aaaa', t.id, t.via)).toEqual({ state: 'sent' });
            expect(
                await b.social.request('bbbb', (await b.social.targetOf('bbbb', { name: 'zygis' })).id, 'name')
            ).toEqual({
                state: 'friends',
            });
            const a = await b.join('aaaa');
            a.send({ t: 'party.create', difficulty: 'easy' });
            await a.until(() => a.last('party'));
            await settle();
            await b.sink.flush();
            const bCode = (await b.social.state('aaaa')).friends[0].code;
            const sent = await b.social.invite('aaaa', bCode, undefined, '1.abcd');
            expect(sent).toMatchObject({ ok: true, offline: true });
            const box = (await b.social.inbox('bbbb', undefined)) as any;
            expect(box.invites).toHaveLength(1);
            expect(box.invites[0].from.name).toBe('zygis');
            const ans = await b.social.answerInvite('bbbb', box.invites[0].id, 'accept');
            const bc = await b.join('bbbb');
            bc.send({ t: 'party.join', code: ans.party });
            await bc.until(() => bc.last('party')?.members?.length >= 2 && bc.last('party'));
            await settle();
            expect(names(bc).sort()).toEqual(['Mira', 'zygis']);
            // the inviter is told once
            const back = (await b.social.inbox('aaaa', undefined)) as any;
            expect(back.answers).toEqual([expect.objectContaining({ name: 'Mira', answer: 'accepted' })]);
            // B renames while in the lobby (on any API instance): both lobbies show it after the relay's name watch
            await b.m.social.updateOne({ _id: 'bbbb' }, { $set: { nameFree: true } });
            await b.names.change('bbbb', { name: 'Mirabel' });
            expect(await b.relay.watchNames()).toBeGreaterThan(0);
            await a.until(() => names(a).includes('Mirabel'));
            await bc.until(() => names(bc).includes('Mirabel'));
        } finally {
            await b.stop();
        }
    });

    it('an inviter the relay knows only as a guest has no party presence: the invite is refused, not lost', async () => {
        const b = await boot();
        try {
            await b.social.request('aaaa', 'bbbb', 'code');
            await b.social.request('bbbb', 'aaaa', 'code');
            const a = await b.join(null);
            a.send({ t: 'party.create', difficulty: 'easy' });
            await a.until(() => a.last('party'));
            await b.sink.flush();
            const bCode = (await b.social.state('aaaa')).friends[0].code;
            await expect(b.social.invite('aaaa', bCode)).rejects.toMatchObject({
                response: { code: 'PAWLEGENDS_SOCIAL_NO_PARTY' },
            });
        } finally {
            await b.stop();
        }
    });
});

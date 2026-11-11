import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import { ChatBus } from './chat-bus';
import { PawlegendsChatController } from './chat.controller';
import { PawlegendsChatMessageSchema, PawlegendsChatThreadSchema } from './chat.schema';
import { ChatService, dmThreadId, parseChatBody } from './chat.service';
import { pairId } from './social.contracts';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

/*
 * Friends chat over the API (CHAT-AVATARS.md §2, §4, §8): friends only, blocks both ways answer the same generic
 * error, DM policy, the tier matrix by age band, phrase scope, length, rate limits and duplicates, the strike cooldown,
 * `chat_mute`, read cursors and unread counts, the 24 h read-only window after an unfriend, and the pulse rev bump.
 */

const BANDS: Record<string, string> = { A: '18+', B: '16-17', C: '18+', K: 'under16', D: '18+' };
const CODES: Record<string, string> = {
    A: 'AAAAAAAA',
    B: 'BBBBBBBB',
    C: 'CCCCCCCC',
    K: 'KKKKKKKK',
    U: 'NNNNNNNN',
    D: 'DDDDDDDD',
    S: 'SSSSSSSS',
};

function harness() {
    const clock = new TestClock();
    const now = clock.now;
    const ids = Object.keys(CODES);
    const accepted = (a: string, b: string) => ({
        _id: pairId(a, b),
        a: a < b ? a : b,
        b: a < b ? b : a,
        from: a,
        state: 'accepted',
        via: 'code',
        createdAt: now(),
        acceptedAt: now(),
    });
    const models = {
        threads: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        messages: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        social: new SocialMemoryModel(
            ids.map(id => ({ _id: id, code: CODES[id], name: { kind: 'generated' }, rev: 0, dmPolicy: 'friends' })),
            [{ fields: ['_id'] }],
            now
        ),
        friends: new SocialMemoryModel(
            [
                accepted('A', 'B'),
                accepted('A', 'C'),
                accepted('A', 'K'),
                accepted('A', 'U'),
                accepted('B', 'D'),
                { ...accepted('A', 'S'), state: 'pending' },
            ],
            [{ fields: ['_id'] }],
            now
        ),
        blocks: new SocialMemoryModel([], [{ fields: ['_id'] }], now),
        buyers: new SocialMemoryModel(
            Object.entries(BANDS).map(([id, band]) => ({ key: `account:${id}`, ageBand: band })),
            [{ fields: ['key'] }],
            now
        ),
        users: new SocialMemoryModel(
            ids.map(id => ({ _id: id, isGuest: false })),
            [],
            now
        ),
        reports: new SocialMemoryModel([], [], now),
        sanctions: new SocialMemoryModel([], [], now),
    };
    const bus = new ChatBus();
    const notices: Array<{ to: string; thread: string }> = [];
    bus.subscribe(n => notices.push(n));
    const chat = new ChatService(
        models.threads,
        models.messages,
        models.social,
        models.friends,
        models.blocks,
        models.buyers,
        models.users,
        models.reports,
        models.sanctions,
        bus,
        undefined,
        clock
    );
    return { chat, models, clock, notices };
}

const code = (id: string) => `PL-${CODES[id].slice(0, 4)}-${CODES[id].slice(4)}`;
const status = async (p: Promise<unknown>) => {
    try {
        await p;
        return 'ok';
    } catch (e: any) {
        const r = e?.getResponse?.() ?? {};
        return r.why ? `${r.code}:${r.why}` : r.code ?? String(e);
    }
};

describe('pawlegends chat: who can talk', () => {
    it('opens DMs between accepted friends only (pending, stranger and self are refused)', async () => {
        const { chat } = harness();
        expect((await chat.open('A', code('B'))).thread).toBe(dmThreadId('A', 'B'));
        expect(await status(chat.open('A', code('S')))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await status(chat.open('A', code('D')))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await status(chat.open('A', code('A')))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await status(chat.open('A', 'nope'))).toBe('PAWLEGENDS_CHAT_INVALID');
    });

    it('thread ids are opaque: never an account id or a pair id', async () => {
        const { chat } = harness();
        const { thread } = await chat.open('A', code('B'));
        expect(thread).toMatch(/^d[A-Za-z0-9_-]{22}$/);
        expect(thread).not.toContain('A:B');
    });

    it('a stranger cannot read or write a thread by id', async () => {
        const { chat } = harness();
        const { thread } = await chat.open('A', code('B'));
        await chat.send('A', thread, { k: 'q', id: 0 });
        expect(await status(chat.history('D', thread))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await status(chat.send('D', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
    });

    it('a block either way refuses with the same generic error and hides the thread', async () => {
        const { chat, models } = harness();
        const { thread } = await chat.open('A', code('C'));
        await chat.send('A', thread, { k: 'q', id: 0 });
        await models.blocks.create({ _id: 'C:A', blocker: 'C', blocked: 'A', createdAt: new Date() });
        expect(await status(chat.send('A', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await status(chat.send('C', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect((await chat.list('A')).threads).toHaveLength(0);
        expect((await chat.list('C')).threads).toHaveLength(0);
    });

    it("dmPolicy 'off' refuses DMs both ways", async () => {
        const { chat, models } = harness();
        const { thread } = await chat.open('A', code('C'));
        await models.social.updateOne({ _id: 'C' }, { $set: { dmPolicy: 'off' } });
        expect(await status(chat.send('A', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
    });

    it('unfriending leaves the thread read-only for 24 h, then hides it; re-friending shows the history', async () => {
        const { chat, models, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        await chat.send('A', thread, { k: 'q', id: 5 });
        await models.friends.deleteOne({ _id: pairId('A', 'C') });
        await chat.closeDm('A', 'C');
        const h = await chat.history('C', thread);
        expect(h.thread.readOnly).toBe(true);
        expect(h.messages).toHaveLength(1);
        expect(await status(chat.send('C', thread, { k: 'q', id: 6 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        clock.advance(CHAT_LIMITS.unfriendReadOnlyMs + 1000);
        expect(await status(chat.history('C', thread))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect((await chat.list('C')).threads).toHaveLength(0);
        await models.friends.create({
            _id: pairId('A', 'C'),
            a: 'A',
            b: 'C',
            from: 'A',
            state: 'accepted',
            via: 'code',
            createdAt: new Date(),
        });
        expect((await chat.history('C', thread)).messages).toHaveLength(1);
    });
});

describe('pawlegends chat: tiers by age band (the strictest participant wins)', () => {
    const cases: Array<[string, string, 'text' | 'quick']> = [
        ['A', 'C', 'text'], // 18+ and 18+
        ['A', 'B', 'text'], // 18+ and 16-17 (Your call #1 default: allowed, probe filter on)
        ['A', 'K', 'quick'], // 18+ and under 16: both sides quick
        ['A', 'U', 'quick'], // unknown band: quick
    ];
    it.each(cases)('%s and %s: %s', async (a, b, tier) => {
        const { chat } = harness();
        const t = await chat.open(a, code(b));
        expect(t.tier).toBe(tier);
        const sent = await status(chat.send(a, t.thread, { k: 't', text: 'gg wp' }));
        expect(sent).toBe(tier === 'text' ? 'ok' : 'PAWLEGENDS_CHAT_QUICK_ONLY');
        const back = await status(chat.send(b, t.thread, { k: 't', text: 'thanks!' }));
        expect(back).toBe(tier === 'text' ? 'ok' : 'PAWLEGENDS_CHAT_QUICK_ONLY');
        // phrases and stickers work in every tier
        expect(await status(chat.send(b, t.thread, { k: 'q', id: 6 }))).toBe('ok');
        expect(await status(chat.send(b, t.thread, { k: 's', id: 0 }))).toBe('ok');
    });

    it('a 16-17 and 18+ thread refuses age and meeting probes; an 18+ pair does not', async () => {
        const { chat } = harness();
        const ab = await chat.open('A', code('B'));
        expect(await status(chat.send('A', ab.thread, { k: 't', text: 'how old are you?' }))).toBe(
            'PAWLEGENDS_CHAT_REJECTED:contact'
        );
        const ac = await chat.open('A', code('C'));
        expect(await status(chat.send('A', ac.thread, { k: 't', text: 'how old are you?' }))).toBe('ok');
    });

    it('a guest account gets no DM at all', async () => {
        const { chat, models } = harness();
        await models.users.updateOne({ _id: 'A' }, { $set: { isGuest: true } });
        expect(await status(chat.open('A', code('C')))).toBe('PAWLEGENDS_NEED_ACCOUNT');
    });
});

describe('pawlegends chat: send rules', () => {
    it('phrase scope: a party-only phrase is refused in a DM; bad bodies are refused', async () => {
        const { chat } = harness();
        const { thread } = await chat.open('A', code('C'));
        expect(await status(chat.send('A', thread, { k: 'q', id: 12 }))).toBe('PAWLEGENDS_CHAT_INVALID');
        expect(await status(chat.send('A', thread, { k: 'q', id: 99 }))).toBe('PAWLEGENDS_CHAT_INVALID');
        expect(await status(chat.send('A', thread, { k: 'img', url: 'x' }))).toBe('PAWLEGENDS_CHAT_INVALID');
        expect(parseChatBody({ k: 't', text: 'hi', extra: 1 })).toBeNull();
    });

    it('length cap: 120 characters after normalisation', async () => {
        const { chat } = harness();
        const { thread } = await chat.open('A', code('C'));
        expect(await status(chat.send('A', thread, { k: 't', text: 'ab'.repeat(61) }))).toBe(
            'PAWLEGENDS_CHAT_TOO_LONG'
        );
        expect(await status(chat.send('A', thread, { k: 't', text: 'x'.repeat(300) }))).toBe(
            'PAWLEGENDS_CHAT_TOO_LONG'
        );
        expect(await status(chat.send('A', thread, { k: 't', text: 'ab'.repeat(60) }))).toBe('ok');
    });

    it('rejected text is never stored, and the reason class is all the sender learns', async () => {
        const { chat, models } = harness();
        const { thread } = await chat.open('A', code('C'));
        expect(await status(chat.send('A', thread, { k: 't', text: 'add me on discord' }))).toBe(
            'PAWLEGENDS_CHAT_REJECTED:link'
        );
        expect(await status(chat.send('A', thread, { k: 't', text: 'call +370 612 34567' }))).toBe(
            'PAWLEGENDS_CHAT_REJECTED:contact'
        );
        expect(await status(chat.send('A', thread, { k: 't', text: 'fuck you' }))).toBe(
            'PAWLEGENDS_CHAT_REJECTED:words'
        );
        expect(models.messages.docs).toHaveLength(0);
    });

    it('5 rejections in 10 minutes start a 10-minute text cooldown; quick still works', async () => {
        const { chat, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        for (let i = 0; i < 5; i++) {
            await status(chat.send('A', thread, { k: 't', text: `visit site${i}.com` }));
            clock.advance(3000);
        }
        expect(await status(chat.send('A', thread, { k: 't', text: 'sorry' }))).toBe('PAWLEGENDS_CHAT_COOLDOWN');
        expect(await status(chat.send('A', thread, { k: 'q', id: 9 }))).toBe('ok');
        clock.advance(CHAT_LIMITS.cooldownMs + 1000);
        expect(await status(chat.send('A', thread, { k: 't', text: 'sorry' }))).toBe('ok');
    });

    it('rate limits: 5 in 10 s, then a pause; duplicates 3 times in 60 s', async () => {
        const { chat, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        for (let i = 0; i < 5; i++) expect(await status(chat.send('A', thread, { k: 'q', id: i % 2 }))).toBe('ok');
        expect(await status(chat.send('A', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_RATE');
        clock.advance(11_000);
        expect(await status(chat.send('A', thread, { k: 't', text: 'gg' }))).toBe('ok');
        clock.advance(3000);
        expect(await status(chat.send('A', thread, { k: 't', text: 'GG' }))).toBe('ok');
        clock.advance(3000);
        expect(await status(chat.send('A', thread, { k: 't', text: 'gg' }))).toBe('PAWLEGENDS_CHAT_RATE');
    });

    it('20 a minute per sender across threads', async () => {
        const { chat, clock } = harness();
        const t1 = (await chat.open('A', code('C'))).thread;
        const t2 = (await chat.open('A', code('B'))).thread;
        let ok = 0;
        for (let i = 0; i < 24; i++) {
            if ((await status(chat.send('A', i % 2 ? t1 : t2, { k: 's', id: i % 8 }))) === 'ok') ok++;
            clock.advance(2100);
        }
        expect(ok).toBe(20);
    });

    it('a chat_mute sanction refuses text and quick', async () => {
        const { chat, models, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        await models.sanctions.create({
            accountId: 'A',
            kind: 'chat_mute',
            until: new Date(clock.ms + 86_400_000),
            by: 'M',
            reasonCode: 'x',
            reports: [],
            seenAt: null,
            createdAt: new Date(),
        });
        expect(await status(chat.send('A', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_MUTED');
        expect(await status(chat.send('A', thread, { k: 't', text: 'hi' }))).toBe('PAWLEGENDS_CHAT_MUTED');
        clock.advance(86_400_000 + 1);
        expect(await status(chat.send('A', thread, { k: 'q', id: 0 }))).toBe('ok');
    });

    it('new DM threads: 10 a day', async () => {
        const { chat, models } = harness();
        for (let i = 0; i < 10; i++)
            await models.threads.create({
                _id: `d${'x'.repeat(21)}${i}`,
                kind: 'dm',
                members: ['A', `Z${i}`],
                createdBy: 'A',
                createdAt: new Date(Date.UTC(2026, 10, 12, 11)),
                lastAt: new Date(),
                exp: new Date(),
            });
        expect(await status(chat.open('A', code('C')))).toBe('PAWLEGENDS_CHAT_RATE');
    });
});

describe('pawlegends chat: delivery, unread and read cursors', () => {
    it('a DM bumps the recipient rev (the pulse returns 200), publishes a notice, and counts as unread', async () => {
        const { chat, models, notices } = harness();
        const { thread } = await chat.open('A', code('C'));
        await chat.send('A', thread, { k: 't', text: 'wanna play?' });
        await chat.send('A', thread, { k: 'q', id: 1 });
        expect(models.social.docs.find(d => d._id === 'C')!.rev).toBe(2);
        expect(notices).toEqual([
            { to: 'C', thread },
            { to: 'C', thread },
        ]);
        const sum = await chat.summary('C');
        expect(sum.unread).toBe(2);
        expect(sum.top).toMatchObject({ thread, preview: '[q:1]' });
        const list = await chat.list('C');
        expect(list.threads[0]).toMatchObject({ id: thread, unread: 2, lastMine: false, with: { code: code('A') } });
        // the client never sees an account id
        expect(JSON.stringify(list)).not.toMatch(/"(A|C)"/);
        expect((await chat.summary('A')).unread).toBe(0);
    });

    it('history pages oldest-first with `mine`; since answers only new messages; read clears unread', async () => {
        const { chat, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        for (let i = 0; i < 35; i++) {
            await chat.send(i % 2 ? 'C' : 'A', thread, { k: 's', id: i % 8 });
            clock.advance(11_000);
        }
        const h = await chat.history('C', thread);
        expect(h.messages).toHaveLength(30);
        expect(h.more).toBe(true);
        expect(h.messages[29].mine).toBe(false);
        const older = await chat.history('C', thread, h.messages[0].mid);
        expect(older.messages).toHaveLength(5);
        expect(older.more).toBe(false);
        const last = h.messages[29].mid;
        expect(await chat.since('C', thread, last)).toBeNull();
        await chat.send('A', thread, { k: 'q', id: 5 });
        const fresh = await chat.since('C', thread, last);
        expect(fresh!.messages.map(m => m.id)).toEqual([5]);
        expect((await chat.summary('C')).unread).toBeGreaterThan(0);
        await chat.markRead('C', thread, fresh!.messages[0].mid);
        expect((await chat.summary('C')).unread).toBe(0);
    });

    it('a muted thread gets no badge and no notice, but messages are stored', async () => {
        const { chat, notices, models } = harness();
        const { thread } = await chat.open('A', code('C'));
        await chat.mute('C', thread, true);
        await chat.send('A', thread, { k: 'q', id: 0 });
        expect(notices).toHaveLength(0);
        expect((await chat.summary('C')).unread).toBe(0);
        expect(models.messages.docs).toHaveLength(1);
        expect((await chat.list('C')).threads[0].muted).toBe(true);
    });
});

describe('pawlegends chat: reports', () => {
    it('copies the message and up to 6 lines of context; one report per message per reporter', async () => {
        const { chat, models, clock } = harness();
        const { thread } = await chat.open('A', code('C'));
        for (let i = 0; i < 8; i++) {
            await chat.send(i % 2 ? 'A' : 'C', thread, { k: 't', text: `line ${i} ok` });
            clock.advance(11_000);
        }
        const bad = (await chat.history('A', thread)).messages.filter(m => !m.mine).pop()!;
        expect(await chat.report('A', { msg: bad.mid, kind: 'harass', note: 'mean' })).toEqual({ created: true });
        expect(await chat.report('A', { msg: bad.mid, kind: 'harass' })).toEqual({ created: false });
        const row = models.reports.docs[0];
        expect(row).toMatchObject({
            reason: 'chat',
            chatKind: 'harass',
            target: 'C',
            reporter: 'A',
            queue: 'chat',
            note: 'mean',
        });
        expect(row.snapshot.text).toBe('line 6 ok');
        expect(row.snapshot.context).toHaveLength(6);
        // the evidence outlives the 30-day chat TTL
        expect(new Date(row.expireAt).getTime() - clock.ms).toBeGreaterThan(170 * 86_400_000);
    });

    it('refuses your own message, a stranger, and a bad kind; drops the note under 16', async () => {
        const { chat, models } = harness();
        const { thread } = await chat.open('A', code('K'));
        const sent = await chat.send('A', thread, { k: 'q', id: 0 });
        expect(await status(chat.report('A', { msg: sent.message.mid, kind: 'spam' }))).toBe('PAWLEGENDS_CHAT_INVALID');
        expect(await status(chat.report('D', { msg: sent.message.mid, kind: 'spam' }))).toBe(
            'PAWLEGENDS_CHAT_NOT_FOUND'
        );
        expect(await status(chat.report('K', { msg: sent.message.mid, kind: 'nope' }))).toBe('PAWLEGENDS_CHAT_INVALID');
        await chat.report('K', { msg: sent.message.mid, kind: 'spam', note: 'hello' });
        expect(models.reports.docs[0].note).toBeUndefined();
    });
    it('a party line still in the relay buffer: only an account of that party may report it', async () => {
        const { chat, models } = harness();
        const mid = '0123456789abcdef01234567';
        chat.setPendingLookup(id =>
            id === mid
                ? {
                      _id: mid,
                      thread: 'pAAAAAAAAAAAAAAAAAAAAAA',
                      from: 'B',
                      k: 'q',
                      id: 5,
                      at: new Date(),
                      exp: new Date(Date.now() + 86_400_000),
                      members: ['A', 'B'],
                  }
                : null
        );
        expect(await status(chat.report('D', { msg: mid, kind: 'spam' }))).toBe('PAWLEGENDS_CHAT_NOT_FOUND');
        expect(models.reports.docs).toHaveLength(0);
        expect(await chat.report('A', { msg: mid, kind: 'spam' })).toEqual({ created: true });
        expect(JSON.stringify(models.reports.docs[0].snapshot)).not.toContain('members');
    });
});

describe('pawlegends chat: storage and routes', () => {
    it('TTL indexes on messages and threads, and the thread/at index', () => {
        const idx = (s: any) => s.indexes().map(([fields, opts]: any) => ({ fields, opts }));
        expect(idx(PawlegendsChatMessageSchema)).toEqual(
            expect.arrayContaining([
                { fields: { exp: 1 }, opts: expect.objectContaining({ expireAfterSeconds: 0 }) },
                expect.objectContaining({ fields: { thread: 1, at: -1 } }),
            ])
        );
        expect(idx(PawlegendsChatThreadSchema)).toEqual(
            expect.arrayContaining([{ fields: { exp: 1 }, opts: expect.objectContaining({ expireAfterSeconds: 0 }) }])
        );
    });

    it('every route is AppAuthGuard (no guests)', () => {
        const proto = PawlegendsChatController.prototype as any;
        for (const name of ['list', 'report', 'open', 'history', 'since', 'send', 'read', 'mute'])
            expect(Reflect.getMetadata(GUARDS_METADATA, proto[name])).toContain(AppAuthGuard);
    });
});

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import { CURRENT_SEASON_ID, seasonDef } from '../pawlegends-catalog';
import { codeOf, clubHarness, type Account } from './clubs.helper-spec';
import {
    CLUB_CHEST_TIERS,
    CLUB_LIMITS,
    CLUB_NAME_FIRST,
    CLUB_NAME_SECOND,
    clubNameText,
    parseClubCode,
    parseClubName,
} from './clubs.contracts';
import { memberId, weekEndsAt } from './clubs.service';

/*
 * Clubs (docs/plans/moba/CLUBS-KUDOS.md): registered accounts only, generated names, join by code, the 30-member cap,
 * one club per account and the rejoin cooldown, blocks either way refuse a join and hide chat lines, the owner's
 * removal, club chat through the friends chat (filter, age tiers), and the weekly chest that only /live fills.
 */

const people = (n: number, band: Account['band'] = '18+'): Account[] =>
    Array.from({ length: n }, (_, i) => ({ id: `u${String(i).padStart(2, '0')}`, band }));

async function withClub(accounts: Account[] = people(4)) {
    const h = clubHarness(accounts);
    const made = await h.clubs.create(accounts[0].id, '3.7');
    return { ...h, code: made.club!.code, thread: made.club!.thread };
}

describe('club contracts', () => {
    it('names are two list words, never text', () => {
        expect(parseClubName('3.7')).toEqual([3, 7]);
        expect(parseClubName('Bad words')).toBeNull();
        expect(parseClubName(`${CLUB_NAME_FIRST.length}.0`)).toBeNull();
        expect(parseClubName(`0.${CLUB_NAME_SECOND.length}`)).toBeNull();
        expect(parseClubName(3)).toBeNull();
        expect(clubNameText(3, 7)).toBe(`${CLUB_NAME_FIRST[3]} ${CLUB_NAME_SECOND[7]}`);
    });

    it('codes read back from any typed form', () => {
        expect(parseClubCode('CL-7KQ2M9')).toBe('7KQ2M9');
        expect(parseClubCode('cl 7kq2m9')).toBe('7KQ2M9');
        expect(parseClubCode('7KQ2MO')).toBe('7KQ2M0');
        expect(parseClubCode('7KQ2M')).toBeNull();
        expect(parseClubCode({})).toBeNull();
    });

    it('the chest resets next Monday 00:00 UTC', () => {
        expect(weekEndsAt(new Date('2026-11-11T12:00:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
        expect(weekEndsAt(new Date('2026-11-15T23:59:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
        expect(weekEndsAt(new Date('2026-11-16T00:00:00Z')).toISOString()).toBe('2026-11-23T00:00:00.000Z');
    });
});

describe('clubs: create and join', () => {
    it('guests cannot create or join a club', async () => {
        const h = clubHarness([
            { id: 'g1', guest: true },
            { id: 'a1', band: '18+' },
        ]);
        expect(await codeOf(h.clubs.create('g1', '1.1'))).toBe('PAWLEGENDS_NEED_ACCOUNT');
        const { club } = await h.clubs.create('a1', '1.1');
        expect(await codeOf(h.clubs.join('g1', club!.code))).toBe('PAWLEGENDS_NEED_ACCOUNT');
        expect(h.models.clubs.docs).toHaveLength(1);
    });

    it('a free-text name is refused', async () => {
        const h = clubHarness(people(1));
        expect(await codeOf(h.clubs.create('u00', 'Rude Name'))).toBe('PAWLEGENDS_CLUB_INVALID');
    });

    it('create: the owner, a CL- code, the generated name and a club chat thread', async () => {
        const h = clubHarness(people(1));
        const { club } = await h.clubs.create('u00', '3.7');
        expect(club).toMatchObject({ name: clubNameText(3, 7), size: 1, cap: 30, owner: true });
        expect(club!.code).toMatch(/^CL-[0-9A-HJKMNP-TV-Z]{6}$/);
        expect(club!.thread).toMatch(/^c[A-Za-z0-9_-]{22}$/);
        const thread = h.models.threads.docs.find(t => t._id === club!.thread)!;
        expect(thread).toMatchObject({ kind: 'club', members: ['u00'] });
        // never an account id in the view
        expect(JSON.stringify(club)).not.toContain('u00');
    });

    it('holds at most 30 members: the 31st is refused and the size stays 30', async () => {
        const all = people(32);
        const { clubs, code, models } = await withClub(all);
        for (const a of all.slice(1, 30)) expect(await codeOf(clubs.join(a.id, code))).toBe('ok');
        expect(models.clubs.docs[0].size).toBe(CLUB_LIMITS.members);
        expect(await codeOf(clubs.join(all[30].id, code))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
        expect(await codeOf(clubs.join(all[31].id, code))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
        expect(models.clubs.docs[0].size).toBe(30);
        expect((await clubs.view('u00')).club!.members).toHaveLength(30);
        // a seat frees up when someone leaves
        await clubs.leave('u05');
        expect(await codeOf(clubs.join(all[30].id, code))).toBe('ok');
        expect(models.clubs.docs[0].size).toBe(30);
    });

    it('one club per account, and an hour before joining another after leaving', async () => {
        const { clubs, code, clock } = await withClub(people(4));
        await clubs.join('u01', code);
        expect(await codeOf(clubs.join('u01', code))).toBe('PAWLEGENDS_CLUB_ALREADY');
        expect(await codeOf(clubs.create('u01', '1.1'))).toBe('PAWLEGENDS_CLUB_ALREADY');
        await clubs.leave('u01');
        expect(await codeOf(clubs.join('u01', code))).toBe('PAWLEGENDS_CLUB_COOLDOWN');
        clock.advance(CLUB_LIMITS.rejoinMs + 1);
        expect(await codeOf(clubs.join('u01', code))).toBe('ok');
    });

    it('an unknown code answers like a full club', async () => {
        const { clubs } = await withClub(people(2));
        expect(await codeOf(clubs.join('u01', 'CL-000000'))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
        expect(await codeOf(clubs.join('u01', 'nope'))).toBe('PAWLEGENDS_CLUB_INVALID');
    });
});

describe('clubs: blocks', () => {
    it('a block either way between the joiner and any member refuses the join (the generic answer)', async () => {
        const { clubs, code, models } = await withClub(people(4));
        await clubs.join('u01', code);
        await models.blocks.create({ _id: 'u01:u02', blocker: 'u01', blocked: 'u02' });
        expect(await codeOf(clubs.join('u02', code))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
        await models.blocks.create({ _id: 'u03:u00', blocker: 'u03', blocked: 'u00' });
        expect(await codeOf(clubs.join('u03', code))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
        expect(models.clubs.docs[0].size).toBe(2);
    });

    it('club chat hides lines from anyone blocked either way after joining', async () => {
        const { clubs, chat, code, thread, models, clock } = await withClub(people(3));
        await clubs.join('u01', code);
        await clubs.join('u02', code);
        await chat.send('u01', thread, { k: 't', text: 'hello club' });
        clock.advance(1000);
        await chat.send('u02', thread, { k: 't', text: 'hi all' });
        await models.blocks.create({ _id: 'u00:u01', blocker: 'u00', blocked: 'u01' });
        const seen = (await chat.history('u00', thread)).messages.map(m => m.text);
        expect(seen).toEqual(['hi all']);
        // the blocked side sees nothing from the blocker either
        await chat.send('u00', thread, { k: 't', text: 'owner here' });
        expect((await chat.history('u01', thread)).messages.map(m => m.text)).toEqual(['hello club', 'hi all']);
    });
});

describe('clubs: owner and leaving', () => {
    it('the owner removes a member, who cannot join this club again; members cannot remove', async () => {
        const { clubs, code, clock, models } = await withClub(people(3));
        await clubs.join('u01', code);
        await clubs.join('u02', code);
        const mid = memberId(models.clubs.docs[0]._id, 'u02');
        expect((await clubs.view('u00')).club!.members.map(m => m.mid)).toContain(mid);
        expect(await codeOf(clubs.remove('u01', mid))).toBe('PAWLEGENDS_CLUB_OWNER');
        expect(await codeOf(clubs.remove('u00', mid))).toBe('ok');
        expect((await clubs.view('u02')).club).toBeNull();
        clock.advance(CLUB_LIMITS.rejoinMs + 1);
        expect(await codeOf(clubs.join('u02', code))).toBe('PAWLEGENDS_CLUB_UNAVAILABLE');
    });

    it('the owner leaving hands the club to the longest-standing member; the last one out closes it', async () => {
        const { clubs, code, thread, models } = await withClub(people(3));
        await clubs.join('u01', code);
        await clubs.leave('u00');
        expect((await clubs.view('u01')).club!.owner).toBe(true);
        await clubs.leave('u01');
        expect(models.clubs.docs).toHaveLength(0);
        expect(models.threads.docs.find(t => t._id === thread)).toBeUndefined();
    });
});

describe('clubs: chat uses the friends chat filter and age tiers', () => {
    it('members talk; strangers and former members cannot read or write', async () => {
        const { clubs, chat, code, thread } = await withClub(people(3));
        await clubs.join('u01', code);
        await chat.send('u01', thread, { k: 'q', id: 0 });
        const [line] = (await chat.history('u00', thread)).messages as Array<{ who?: string; mine: boolean }>;
        // a club line names its sender (a display name, never an account id)
        expect(line).toMatchObject({ mine: false, who: expect.stringMatching(/^[A-Z][a-z]+ /) });
        expect(JSON.stringify(line)).not.toContain('u01');
        expect(await codeOf(chat.history('u02', thread))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        expect(await codeOf(chat.send('u02', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
        await clubs.leave('u01');
        expect(await codeOf(chat.send('u01', thread, { k: 'q', id: 0 }))).toBe('PAWLEGENDS_CHAT_UNAVAILABLE');
    });

    it('free text only while every member is 16+; one under-16 makes the club quick chat only', async () => {
        const all = [...people(2), { id: 'kid', band: 'under16' as const }];
        const { clubs, chat, code, thread } = await withClub(all);
        await clubs.join('u01', code);
        expect(await codeOf(chat.send('u01', thread, { k: 't', text: 'gg team' }))).toBe('ok');
        await clubs.join('kid', code);
        expect((await clubs.view('u00')).club!.tier).toBe('quick');
        expect(await codeOf(chat.send('u01', thread, { k: 't', text: 'gg team' }))).toBe('PAWLEGENDS_CHAT_QUICK_ONLY');
        expect(await codeOf(chat.send('kid', thread, { k: 'q', id: 5 }))).toBe('ok');
    });

    it('the text filter refuses contact details and links, as in DMs', async () => {
        const { clubs, chat, code, thread } = await withClub(people(2));
        await clubs.join('u01', code);
        expect(await codeOf(chat.send('u01', thread, { k: 't', text: 'add me at bob@example.com' }))).toMatch(
            /^PAWLEGENDS_CHAT_REJECTED:/
        );
        expect(await codeOf(chat.send('u01', thread, { k: 't', text: 'x'.repeat(CHAT_LIMITS.rawMax + 1) }))).toBe(
            'PAWLEGENDS_CHAT_TOO_LONG'
        );
    });

    it('a member reports a club line like any chat line', async () => {
        const { clubs, chat, code, thread, models } = await withClub(people(2));
        await clubs.join('u01', code);
        const { message } = await chat.send('u01', thread, { k: 'q', id: 5 });
        expect(await chat.report('u00', { msg: message.mid, kind: 'spam' })).toEqual({ created: true });
        expect(models.reports.docs[0]).toMatchObject({ target: 'u01', snapshot: { kind: 'club' } });
    });
});

describe('clubs: the weekly chest moves only from /live', () => {
    const win = (
        h: Awaited<ReturnType<typeof withClub>>,
        acc: string,
        room: string,
        over: Record<string, unknown> = {}
    ) => h.clubs.applyClubChest({ accountId: acc, room, won: true, registered: true, now: h.clock.now(), ...over });

    it('a verified win counts once per room and account; losses and guests do not count', async () => {
        const h = await withClub(people(3));
        await h.clubs.join('u01', h.code);
        expect(await win(h, 'u00', 'r1')).toMatchObject({ wins: 1, counted: true });
        expect(await win(h, 'u00', 'r1')).toBeNull();
        expect(await win(h, 'u01', 'r1')).toMatchObject({ wins: 2 });
        expect(await win(h, 'u01', 'r2', { won: false })).toBeNull();
        expect(await win(h, 'u01', 'r3', { registered: false })).toBeNull();
        expect(await win(h, 'u02', 'r4')).toBeNull(); // not in a club
        expect((await h.clubs.view('u00')).club!.chest).toMatchObject({ wins: 2, mine: 1 });
    });

    it('at most 6 wins a member a day', async () => {
        const h = await withClub(people(1));
        for (let i = 0; i < CLUB_LIMITS.winsPerMemberPerDay; i++) await win(h, 'u00', `r${i}`);
        expect(await win(h, 'u00', 'rX')).toMatchObject({ counted: false, wins: 6 });
        h.clock.advance(86_400_000);
        expect(await win(h, 'u00', 'rY')).toMatchObject({ counted: true, wins: 7 });
    });

    it('a member who added a win claims each reached tier once: free-row items in order', async () => {
        const all = people(8);
        const h = await withClub(all);
        for (const a of all.slice(1)) await h.clubs.join(a.id, h.code);
        expect(await codeOf(h.clubs.claim('u00'))).toBe('PAWLEGENDS_CLUB_NEED_WIN');
        let n = 0;
        for (const a of all) await win(h, a.id, `room${n++}`);
        expect((await h.clubs.view('u00')).club!.chest).toMatchObject({ wins: CLUB_CHEST_TIERS[0], open: 1 });
        const free = seasonDef(CURRENT_SEASON_ID)!.free.map(r => r.item);
        const first = await h.clubs.claim('u00');
        expect(first.got.map(g => g.id)).toEqual([free[0]]);
        expect((await h.clubs.claim('u00')).got).toEqual([]);
        expect(h.models.owned.docs.filter(d => d.accountId === 'u00').map(d => d.item)).toEqual([free[0]]);
        // an owned item is skipped
        await h.models.owned.create({ accountId: 'u01', item: free[0], source: 'pass' });
        expect((await h.clubs.claim('u01')).got.map(g => g.id)).toEqual([free[1]]);
    });

    it('only the /live save calls applyClubChest, and only applyClubChest writes the chest', () => {
        const root = join(__dirname, '..', '..');
        const files = (dir: string): string[] =>
            readdirSync(dir).flatMap(n => {
                const p = join(dir, n);
                if (statSync(p).isDirectory()) return n === 'vendor' ? [] : files(p);
                return n.endsWith('.ts') && !n.includes('spec') ? [p] : [];
            });
        const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
        const callers = files(root)
            .filter(p => /\.applyClubChest\(/.test(strip(readFileSync(p, 'utf8'))))
            .map(p => relative(root, p));
        expect(callers).toEqual(['pawlegends/pawlegends-party-live.ts']);
        const svc = strip(readFileSync(join(__dirname, 'clubs.service.ts'), 'utf8'));
        const body = svc.slice(svc.indexOf('async applyClubChest('), svc.indexOf('async claim('));
        const writes = (t: string) =>
            (
                t.match(
                    /this\.(weeks|wins)\s*\.(create|updateOne|updateMany|findOneAndUpdate|insertMany|bulkWrite)\(/g
                ) ?? []
            ).length;
        expect(writes(body)).toBe(2);
        expect(writes(svc)).toBe(2);
    });
});

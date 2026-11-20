import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { displayNames } from './display-name';
import { checkNick, looksGenerated, NAME_CHANGE } from './nickname';
import { PawlegendsNicknameController } from './nickname.controller';
import { NicknameService, resetNickname } from './nickname.service';
import { ReportService } from './report.service';
import { SocialService } from './social.service';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

const DAY = 86_400_000;

function harness(balances: Record<string, number> = {}) {
    const clock = new TestClock();
    const now = clock.now;
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
        empty: () => new SocialMemoryModel([], [], now),
        yarn: new MemoryModel(
            Object.entries(balances).map(([_id, balance]) => ({ _id, balance })),
            [{ fields: ['_id'] }],
            now
        ),
        yarnLog: new MemoryModel([], [{ fields: ['accountId', 'ref'] }], now),
        cats: new SocialMemoryModel([], [], now),
    };
    const social = new SocialService(
        m.social,
        m.empty(),
        m.empty(),
        m.empty(),
        m.empty(),
        m.empty(),
        m.empty(),
        m.empty(),
        m.cats,
        clock
    );
    const svc = new NicknameService(social, m.yarn, m.yarnLog, clock);
    return { clock, m, svc };
}

const code = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (error) {
        const r = (error as { getResponse?: () => any }).getResponse?.();
        return { status: (error as { getStatus?: () => number }).getStatus?.(), ...r };
    }
    throw new Error('expected a refusal');
};

describe('pawlegends nicknames (SOCIAL-RANKED.md §2.3)', () => {
    it('checks names with the shared rules, the reserved words and the generated shape', () => {
        expect(checkNick('  Mira  ')).toEqual({ ok: true, name: 'Mira', key: 'mira' });
        expect(checkNick('Žygis')).toMatchObject({ ok: true, name: 'Žygis', key: 'zygis' });
        expect(checkNick('B0b')).toMatchObject({ ok: true, key: 'bob' });
        expect(checkNick('x')).toMatchObject({ ok: false, code: 'NAME_TOO_SHORT' });
        expect(checkNick('a'.repeat(17))).toMatchObject({ ok: false, code: 'NAME_TOO_LONG' });
        expect(checkNick('<b>hi</b>')).toMatchObject({ ok: false, code: 'NAME_CHARS' });
        expect(checkNick('Admin')).toMatchObject({ ok: false, code: 'NAME_RESERVED' });
        expect(checkNick('Paw Legends')).toMatchObject({ ok: false, code: 'NAME_RESERVED' });
        expect(checkNick('Fuuuck')).toMatchObject({ ok: false, code: 'NAME_BLOCKED' });
        expect(looksGenerated('Sunny Tabby')).toBe(true);
        expect(checkNick('Sunny Tabby')).toMatchObject({ ok: false, code: 'NAME_RESERVED' });
        expect(checkNick('Sunny')).toMatchObject({ ok: true });
        expect(checkNick(42)).toMatchObject({ ok: false });
    });

    it('the first change is free (from the generated name), shows everywhere and records the old name', async () => {
        const { m, svc } = harness({ A: 0 });
        const before = await svc.view('A');
        // every account has a nickname: a new one gets its generated name, assigned, with no notice
        expect(before).toMatchObject({
            nick: before.name,
            auto: true,
            notice: null,
            changes: 0,
            free: true,
            price: 0,
            cost: NAME_CHANGE.yarn,
            yarn: 0,
        });
        const out = await svc.change('A', { name: 'Mira' });
        expect(out).toMatchObject({ name: 'Mira', nick: 'Mira', changes: 1, free: false, paid: 0 });
        expect(out.price).toBe(NAME_CHANGE.yarn);
        expect(out.nextAt).toBe(new TestClock().ms + NAME_CHANGE.cooldownDays * DAY);
        const row = m.social.docs.find(d => d._id === 'A')!;
        expect(row.nickKey).toBe('mira');
        expect(row.nameHistory).toEqual([expect.objectContaining({ name: before.name, kind: 'nick', paid: 0 })]);
        // picked, not assigned: the flag and any notice are gone
        expect(row.nickAuto).toBeUndefined();
        expect(out.auto).toBe(false);
        // the one resolver of friends, boards, clubs, chat and history
        expect((await displayNames({ social: m.social }, ['A'])).get('A')).toBe('Mira');
        expect(m.yarnLog.docs).toHaveLength(0);
    });

    it('a later change costs Yarn after the cooldown, debited once with a ledger row', async () => {
        const { clock, m, svc } = harness({ A: 2000 });
        await svc.change('A', { name: 'Mira' });
        clock.advance(NAME_CHANGE.cooldownDays * DAY);
        const out = await svc.change('A', { name: 'Mirabel' });
        expect(out).toMatchObject({
            nick: 'Mirabel',
            changes: 2,
            paid: NAME_CHANGE.yarn,
            yarn: 2000 - NAME_CHANGE.yarn,
        });
        expect(m.yarn.docs[0].balance).toBe(2000 - NAME_CHANGE.yarn);
        expect(m.yarnLog.docs).toEqual([
            expect.objectContaining({ accountId: 'A', ref: 'name:2', amount: -NAME_CHANGE.yarn, done: true }),
        ]);
        expect(m.social.docs[0].nameHistory.map((h: any) => h.name).slice(-1)).toEqual(['Mira']);
    });

    it('refuses a paid change without enough Yarn and spends nothing', async () => {
        const { clock, m, svc } = harness({ A: NAME_CHANGE.yarn - 1 });
        await svc.change('A', { name: 'Mira' });
        clock.advance(8 * DAY);
        expect(await code(svc.change('A', { name: 'Mirabel' }))).toMatchObject({
            status: 402,
            code: 'PAWLEGENDS_NAME_YARN',
        });
        expect(m.yarn.docs[0].balance).toBe(NAME_CHANGE.yarn - 1);
        expect(m.yarnLog.docs).toHaveLength(0);
        expect(m.social.docs[0].nick).toBe('Mira');
        // no Yarn row at all: the same refusal
        const other = harness();
        await other.svc.change('B', { name: 'Bea' });
        other.clock.advance(8 * DAY);
        expect(await code(other.svc.change('B', { name: 'Beatrix' }))).toMatchObject({ code: 'PAWLEGENDS_NAME_YARN' });
    });

    it('refuses a taken name case- and accent-insensitively, an invalid one and the same one', async () => {
        const { svc } = harness();
        await svc.change('A', { name: 'Mira' });
        expect(await code(svc.change('B', { name: 'MIRA' }))).toMatchObject({
            status: 409,
            code: 'PAWLEGENDS_NAME_TAKEN',
        });
        expect(await code(svc.change('B', { name: 'Mîra' }))).toMatchObject({ code: 'PAWLEGENDS_NAME_TAKEN' });
        expect(await code(svc.change('B', { name: 'admin' }))).toMatchObject({
            status: 400,
            code: 'PAWLEGENDS_NAME_INVALID',
            reason: 'NAME_RESERVED',
        });
        expect(await code(svc.change('A', { name: 'Mira' }))).toMatchObject({ code: 'PAWLEGENDS_NAME_SAME' });
        // B's free change is still there
        expect((await svc.view('B')).free).toBe(true);
    });

    it('enforces the cooldown between changes once the free one is used', async () => {
        const { clock, m, svc } = harness({ A: 5000 });
        await svc.change('A', { name: 'Mira' });
        clock.advance(DAY);
        const r = await code(svc.change('A', { name: 'Mirabel' }));
        expect(r).toMatchObject({ status: 429, code: 'PAWLEGENDS_NAME_COOLDOWN' });
        expect(r.nextAt).toBe(new TestClock().ms + NAME_CHANGE.cooldownDays * DAY);
        expect(m.yarn.docs[0].balance).toBe(5000);
    });

    it('races: two free changes at once pass once; two players asking for one name, one wins', async () => {
        const { m, svc } = harness();
        const both = await Promise.allSettled([svc.change('A', { name: 'Mira' }), svc.change('A', { name: 'Nova' })]);
        expect(both.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(m.social.docs.find(d => d._id === 'A')!.nameChanges).toBe(1);
        const two = await Promise.allSettled([svc.change('B', { name: 'Zed' }), svc.change('C', { name: 'zed' })]);
        expect(two.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(m.social.docs.filter(d => d.nickKey === 'zed')).toHaveLength(1);
    });

    it('races: two paid changes at once debit once, and a lost race gives the Yarn back', async () => {
        const { clock, m, svc } = harness({ A: 5000, B: 5000 });
        await svc.change('A', { name: 'Mira' });
        await svc.change('B', { name: 'Bea' });
        clock.advance(8 * DAY);
        const both = await Promise.allSettled([
            svc.change('A', { name: 'Mirabel' }),
            svc.change('A', { name: 'Miranda' }),
        ]);
        expect(both.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(m.yarn.docs.find(d => d._id === 'A')!.balance).toBe(5000 - NAME_CHANGE.yarn);
        // B pays for "Kit" while C takes it for free at the same time: one wins; a lost paid change gets its Yarn back
        const [x, y] = await Promise.allSettled([svc.change('B', { name: 'Kit' }), svc.change('C', { name: 'Kit' })]);
        expect([x.status, y.status].filter(s => s === 'fulfilled')).toHaveLength(1);
        expect(m.yarn.docs.find(d => d._id === 'B')!.balance).toBe(
            x.status === 'fulfilled' ? 5000 - NAME_CHANGE.yarn : 5000
        );
        expect(m.yarnLog.docs.filter(d => d.accountId === 'B')).toHaveLength(x.status === 'fulfilled' ? 1 : 0);
    });

    it('a moderator reset frees the name, assigns the generated one, tells the player once and makes the next change free', async () => {
        const { clock, m, svc } = harness({ A: 0 });
        await svc.change('A', { name: 'Mira' });
        expect(await resetNickname(m.social, 'A', clock.now())).toBe(true);
        const v = await svc.view('A');
        expect(v).toMatchObject({
            nick: v.name,
            auto: true,
            notice: { kind: 'reset' },
            free: true,
            price: 0,
            nextAt: null,
        });
        expect(v.notice).not.toHaveProperty('from');
        expect(await svc.seen('A')).toEqual({ ok: true });
        expect((await svc.view('A')).notice).toBeNull();
        expect(v.name).not.toBe('Mira');
        expect(m.social.docs[0].nameHistory.slice(-1)[0]).toMatchObject({ name: 'Mira', reset: true });
        await svc.change('B', { name: 'Mira' });
        await svc.change('A', { name: 'Mirra' });
        expect(m.yarnLog.docs).toHaveLength(0);
    });

    it('name_reset through the report resolve marks the reports actioned without a sanction row', async () => {
        const { clock, m, svc } = harness();
        await svc.change('A', { name: 'Mira' });
        const reports = new SocialMemoryModel(
            [{ _id: 'r1', target: 'A', status: 'open', reason: 'name', room: 'x', reporter: 'B' }],
            [],
            clock.now
        );
        const sanctions = new SocialMemoryModel([], [], clock.now);
        const empty = new SocialMemoryModel([], [], clock.now);
        const rs = new ReportService(reports, sanctions, empty, empty, m.social, null, clock);
        expect(await rs.resolve('A', 'mod', { action: 'name_reset', reasonCode: 'name' })).toMatchObject({
            updated: 1,
            sanction: null,
            nameReset: true,
        });
        expect(reports.docs[0].status).toBe('actioned');
        expect(sanctions.docs).toHaveLength(0);
        expect(m.social.docs[0].nick).not.toBe('Mira');
        expect(m.social.docs[0].nickAuto).toBe(true);
    });

    it('routes are registered-only (AppAuthGuard, no guest allow), and guests get NEED_ACCOUNT', async () => {
        for (const k of ['view', 'change'] as const)
            expect(Reflect.getMetadata(GUARDS_METADATA, PawlegendsNicknameController.prototype[k])).toContain(
                AppAuthGuard
            );
        const ctl = new PawlegendsNicknameController(
            {} as any,
            { consume: async () => undefined } as any,
            { increment: async () => ({ totalHits: 1, timeToExpire: 0 }) } as any
        );
        expect(await code(ctl.view({ user: { _id: 'G', isGuest: true } }, {}))).toMatchObject({
            status: 403,
            code: 'PAWLEGENDS_NEED_ACCOUNT',
        });
    });
});

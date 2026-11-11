import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import type { MmRoomRecord } from '../mm/mm-room.schema';
import { ReportService } from './report.service';
import { PawlegendsReportsController } from './reports.controller';
import { SocialMemoryModel, TestClock } from './social-model.helper-spec';

const HOUR = 3600_000;

function room(id: string, over: Partial<MmRoomRecord> = {}): MmRoomRecord {
    return {
        _id: id,
        queue: 'casual',
        mode: 'casual',
        region: 'eu',
        side: 'cat',
        difficulty: 'hard',
        sim: '19',
        fill: [],
        queueMs: {},
        members: [
            { slot: 0, identityHash: 'h-a', accountId: 'A', joinedTick: 0, backfill: false, ratingAtStart: null },
            { slot: 1, identityHash: 'h-b', accountId: 'B', joinedTick: 0, backfill: false, ratingAtStart: null },
            { slot: 3, identityHash: 'h-c', accountId: 'C', joinedTick: 0, backfill: false, ratingAtStart: null },
            {
                slot: 4,
                identityHash: 'h-d',
                accountId: 'D',
                joinedTick: 0,
                backfill: false,
                ratingAtStart: null,
                event: 'afk',
                eventTick: 900,
            },
        ],
        outcome: null,
        endedAt: null,
        createdAt: new Date(Date.UTC(2026, 10, 12, 11, 50)),
        ...over,
    };
}

function harness() {
    const clock = new TestClock();
    const m = {
        reports: new SocialMemoryModel([], [{ fields: ['room', 'reporter', 'target'] }], clock.now),
        sanctions: new SocialMemoryModel([], [], clock.now),
        rooms: new SocialMemoryModel([room('r1'), room('r2', { queue: 'coop', mode: undefined })], [], clock.now),
        buyers: new SocialMemoryModel(
            [
                { key: 'account:A', ageBand: '18+' },
                { key: 'account:C', ageBand: 'under16' },
            ],
            [],
            clock.now
        ),
        social: new SocialMemoryModel([], [], clock.now),
    };
    const svc = new ReportService(m.reports, m.sanctions, m.rooms, m.buyers, m.social, null, clock);
    return { clock, m, svc };
}

const A = { id: 'A', guest: false };

describe('pawlegends PvP reports (SOCIAL-RANKED.md §8)', () => {
    it('files a report for a human foe in a PvP room and stores only the minimum', async () => {
        const { m, svc } = harness();
        expect(await svc.report(A, { room: 'r1', slot: 3, reason: 'cheat', tick: 600 })).toEqual({ created: true });
        expect(m.reports.docs).toHaveLength(1);
        const row = m.reports.docs[0];
        expect(Object.keys(row).sort()).toEqual(
            [
                '_id',
                'createdAt',
                'expireAt',
                'guest',
                'queue',
                'reason',
                'reporter',
                'room',
                'status',
                'target',
                'tick',
                'updatedAt',
            ].sort()
        );
        expect(row).toMatchObject({ room: 'r1', reporter: 'A', target: 'C', reason: 'cheat', status: 'open' });
    });

    it('is one report per target per match (the repeat is idempotent and adds the note once)', async () => {
        const { m, svc } = harness();
        await svc.report(A, { room: 'r1', slot: 3, reason: 'grief' });
        expect(await svc.report(A, { room: 'r1', slot: 3, reason: 'cheat', note: 'saw me in the bush' })).toEqual({
            created: false,
        });
        await svc.report(A, { room: 'r1', slot: 3, reason: 'cheat', note: 'second note' });
        expect(m.reports.docs).toHaveLength(1);
        expect(m.reports.docs[0].note).toBe('saw me in the bush');
    });

    it('refuses bots, self, unknown, co-op and old rooms, and non-members', async () => {
        const { clock, m, svc } = harness();
        await expect(svc.report(A, { room: 'r1', slot: 2, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_BOT' },
        });
        await expect(svc.report(A, { room: 'r1', slot: 0, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_SELF' },
        });
        await expect(svc.report(A, { room: 'nope', slot: 3, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_ROOM' },
        });
        await expect(svc.report(A, { room: 'r2', slot: 3, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_ROOM' },
        });
        await expect(
            svc.report({ id: 'Z', guest: false }, { room: 'r1', slot: 3, reason: 'afk' })
        ).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_ROOM' },
        });
        await expect(svc.report(A, { room: 'r1', slot: 3, reason: 'rude' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_INVALID' },
        });
        m.rooms.docs[0].endedAt = new Date(clock.ms - 25 * HOUR);
        await expect(svc.report(A, { room: 'r1', slot: 3, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_ROOM' },
        });
    });

    it('targets the tenure holder at the tick (a backfill took the slot later)', async () => {
        const { m, svc } = harness();
        m.rooms.docs[0].members.push({
            slot: 3,
            identityHash: 'h-e',
            accountId: 'E',
            joinedTick: 2000,
            backfill: true,
            ratingAtStart: null,
        });
        await svc.report(A, { room: 'r1', slot: 3, reason: 'grief', tick: 1000 });
        await svc.report(A, { room: 'r1', slot: 3, reason: 'grief' });
        expect(m.reports.docs.map(r => r.target).sort()).toEqual(['C', 'E']);
    });

    it('corroborates an AFK report against the mm member event', async () => {
        const { m, svc } = harness();
        await svc.report(A, { room: 'r1', slot: 4, reason: 'afk' });
        expect(m.reports.docs[0].status).toBe('corroborated');
    });

    it('keeps the note only for the 16-17 and 18+ bands', async () => {
        const { m, svc } = harness();
        await svc.report({ id: 'C', guest: false }, { room: 'r1', slot: 0, reason: 'name', note: 'my phone 555' });
        await svc.report({ id: 'B', guest: false }, { room: 'r1', slot: 3, reason: 'name', note: 'unknown band' });
        expect(m.reports.docs.every(r => r.note === undefined)).toBe(true);
    });

    it('caps reporters (10 a day, guests 3) and rooms (5)', async () => {
        const { m, svc } = harness();
        for (let i = 0; i < 12; i++) m.rooms.docs.push(room(`g${i}`));
        const G = { id: 'A', guest: true };
        for (let i = 0; i < 3; i++) await svc.report(G, { room: `g${i}`, slot: 3, reason: 'afk' });
        await expect(svc.report(G, { room: 'g3', slot: 3, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_LIMIT' },
        });
        for (let i = 3; i < 10; i++) await svc.report(A, { room: `g${i}`, slot: 3, reason: 'afk' });
        await expect(svc.report(A, { room: 'g10', slot: 3, reason: 'afk' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_LIMIT' },
        });
        // per room: 2 per reporter, 5 per target (one side cannot use up the room before the other reports)
        m.reports.docs = [];
        await svc.report(A, { room: 'r1', slot: 3, reason: 'grief' });
        await svc.report(A, { room: 'r1', slot: 4, reason: 'grief' });
        await expect(svc.report(A, { room: 'r1', slot: 1, reason: 'grief' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_LIMIT' },
        });
        // the other side still reports A after A filed its two
        expect(await svc.report({ id: 'C', guest: false }, { room: 'r1', slot: 0, reason: 'cheat' })).toEqual({
            created: true,
        });
        // five reporters on one target: the sixth is refused
        const big = room('r9', {
            members: Array.from({ length: 10 }, (_, slot) => ({
                slot,
                identityHash: `h-${slot}`,
                accountId: `P${slot}`,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: null,
            })),
            map: 'hearthwood',
        });
        m.rooms.docs.push(big);
        for (const s of [1, 2, 3, 4, 5])
            await svc.report({ id: `P${s}`, guest: false }, { room: 'r9', slot: 0, reason: 'grief' });
        await expect(
            svc.report({ id: 'P6', guest: false }, { room: 'r9', slot: 0, reason: 'grief' })
        ).rejects.toMatchObject({ response: { code: 'PAWLEGENDS_REPORT_LIMIT' } });
        expect(await svc.report({ id: 'P6', guest: false }, { room: 'r9', slot: 1, reason: 'grief' })).toEqual({
            created: true,
        });
    });

    it('lists groups per target with flags and never returns a reporter id', async () => {
        const { m, svc } = harness();
        m.rooms.docs.push(room('r3'), room('r4'));
        await svc.report(A, { room: 'r1', slot: 3, reason: 'cheat' });
        await svc.report({ id: 'B', guest: false }, { room: 'r3', slot: 3, reason: 'cheat' });
        await svc.report({ id: 'B', guest: false }, { room: 'r1', slot: 3, reason: 'grief' }).catch(() => undefined);
        await svc.report({ id: 'A', guest: false }, { room: 'r4', slot: 3, reason: 'afk' });
        m.rooms.docs.push({
            ...room('r5'),
            members: [
                ...room('r5').members,
                { slot: 2, identityHash: 'h-x', accountId: 'X', joinedTick: 0, backfill: false, ratingAtStart: null },
            ],
        });
        await svc.report({ id: 'X', guest: false }, { room: 'r5', slot: 3, reason: 'cheat' });
        const list = await svc.list({});
        expect(list.groups[0].target.accountId).toBe('C');
        expect(list.groups[0].flags).toContain('F1');
        expect(list.groups[0].target.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        const detail = await svc.detail('C');
        const text = JSON.stringify([list, detail]);
        expect(text).not.toContain('"reporter":');
        for (const id of ['A', 'B', 'X']) expect(text).not.toContain(`"${id}"`);
        expect(detail.reports.length).toBeGreaterThanOrEqual(4);
        expect(detail.rooms[0]).toMatchObject({ queue: 'casual', team: 1, replay: expect.any(String) });
        expect(m.reports.docs.length).toBeGreaterThan(0);
    });

    it('resolve writes a sanction (read by active) and marks reports; dismiss shortens the keep time', async () => {
        const { clock, m, svc } = harness();
        await svc.report(A, { room: 'r1', slot: 3, reason: 'cheat' });
        await expect(svc.resolve('C', 'MOD', { action: 'ranked_lock', reasonCode: 'map_hack' })).rejects.toMatchObject({
            response: { code: 'PAWLEGENDS_REPORT_INVALID' },
        });
        const res = await svc.resolve('C', 'MOD', { action: 'ranked_lock', days: 7, reasonCode: 'map_hack' });
        expect(res.updated).toBe(1);
        expect(m.reports.docs[0].status).toBe('actioned');
        expect(await svc.active('C')).toEqual([{ kind: 'ranked_lock', until: new Date(clock.ms + 7 * 86400_000) }]);
        clock.advance(8 * 86400_000);
        expect(await svc.active('C')).toEqual([]);
        const stats = await svc.stats(14);
        expect(stats).toMatchObject({ mapHackConfirmed: 1, pvpMatches: 1 });
        await svc.report(A, { room: 'r1', slot: 4, reason: 'afk' }).catch(() => undefined);
    });

    it('a warn is shown once', async () => {
        const { svc } = harness();
        await svc.report(A, { room: 'r1', slot: 3, reason: 'name' });
        await svc.resolve('C', 'MOD', { action: 'warn', reasonCode: 'name' });
        expect(await svc.active('C')).toEqual([]);
        expect(await svc.takeWarn('C')).toBe(true);
        expect(await svc.takeWarn('C')).toBe(false);
    });

    it('F4: a win-trade pair is flagged', () => {
        const { svc } = harness();
        const rooms = Array.from({ length: 5 }, (_, i) => room(`w${i}`, { outcome: 'won' }));
        expect(svc.winTradePairs(rooms, 'A')).toEqual(['C', 'D']);
        expect(svc.winTradePairs(rooms.slice(0, 3), 'A')).toEqual([]);
    });

    it('guards: players need AppAuthGuard (guests allowed), admin routes need MODERATOR', () => {
        const proto = PawlegendsReportsController.prototype as any;
        expect(Reflect.getMetadata(GUARDS_METADATA, proto.report)).toEqual([AppAuthGuard]);
        expect(GUEST_ALLOW_LIST['POST /pawlegends/reports']).toEqual({});
        for (const name of ['list', 'stats', 'detail', 'resolve']) {
            const guards = Reflect.getMetadata(GUARDS_METADATA, proto[name]);
            expect(guards[0]).toBe(AppAuthGuard);
            const perm = new guards[1]();
            const ctx = (permission: number) => ({
                switchToHttp: () => ({ getRequest: () => ({ user: { permission } }) }),
            });
            expect(perm.canActivate(ctx(1))).toBe(false);
            expect(perm.canActivate(ctx(2))).toBe(true);
        }
    });
});

import { CURRENT_SEASON_ID } from '../pawlegends-catalog';
import { MatchHistoryCore, type HistoryPeople, type HistoryStore } from '../history/history.service';
import { isoWeek } from '../ranked/boards';
import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { applyLevelSync, applyMatchSides, setLeaderboardSink } from './leaderboard-live';
import { BACKFILL_KEYS, LEVEL_PAGE, LEVEL_TOP, LeaderboardService } from './leaderboard.service';
import { ownSideWins, sideSplit, winningSide, type SideRow } from './sides';

/*
 * The Leaderboards window (LEADERBOARDS.md): the Level board's order and my own row, the Country board's filter
 * (hidden flags never show), the Cats vs Dogs tally (once per match, from live saves and the backfill, idempotent).
 */

const uniq = () => [{ fields: ['_id'] }];

function harness(
    o: { users?: any[]; levels?: any[]; flags?: any[]; sanctions?: any[]; history?: any[]; stats?: any[] } = {}
) {
    const clock = new TestClock();
    const m = {
        levels: new SocialMemoryModel(o.levels ?? [], uniq(), clock.now),
        sideWins: new SocialMemoryModel([], uniq(), clock.now),
        sideMatches: new SocialMemoryModel([], uniq(), clock.now),
        users: new SocialMemoryModel(o.users ?? [], uniq(), clock.now),
        history: new SocialMemoryModel(o.history ?? [], uniq(), clock.now),
        stats: new SocialMemoryModel(o.stats ?? [], uniq(), clock.now),
        sanctions: new SocialMemoryModel(o.sanctions ?? [], [], clock.now),
        social: new SocialMemoryModel(
            (o.users ?? []).map(u => ({ _id: u._id, name: { kind: 'nick' }, nick: `Nick${u._id}` })),
            [],
            clock.now
        ),
        flags: new SocialMemoryModel(o.flags ?? [], [], clock.now),
    };
    const svc = new LeaderboardService(
        m.levels,
        m.sideWins,
        m.sideMatches,
        m.users,
        m.history,
        m.stats,
        m.sanctions,
        m.social,
        m.flags,
        undefined,
        undefined,
        undefined,
        clock
    );
    return { clock, m, svc };
}

const user = (id: string, matches: number, extra: Record<string, unknown> = {}) => ({
    _id: id,
    pawlegendsMatches: { easy: matches },
    ...extra,
});

describe('Level board', () => {
    it('orders by matches (the level), then the earliest to reach them; guests, deleted and sanctioned left out', async () => {
        const t0 = new Date(Date.UTC(2026, 10, 1));
        const t1 = new Date(Date.UTC(2026, 10, 2));
        const { svc } = harness({
            users: [
                user('A', 60),
                user('B', 60),
                user('C', 12),
                user('G', 500, { isGuest: true }),
                user('D', 400, { deletedAt: t0 }),
                user('X', 300),
            ],
            levels: [
                { _id: 'A', m: 60, at: t1 },
                { _id: 'B', m: 60, at: t0 },
                { _id: 'C', m: 12, at: t0 },
                { _id: 'G', m: 500, at: t0 },
                { _id: 'D', m: 400, at: t0 },
                { _id: 'X', m: 300, at: t0 },
            ],
            sanctions: [{ accountId: 'X', kind: 'board_exclude', until: null }],
        });
        const b = await svc.levelBoard(0, null);
        expect(b.rows.map(r => [r.rank, r.name, r.value, r.m])).toEqual([
            [1, 'NickB', 15, 60],
            [2, 'NickA', 15, 60],
            [3, 'NickC', 6, 12],
        ]);
        expect(b.me).toBeUndefined();
        expect(b.pages).toBe(1);
    });

    it('marks my row on the page once, and gives my rank below the top 100', async () => {
        const users = Array.from({ length: LEVEL_TOP + 5 }, (_, i) => user(`u${String(i).padStart(3, '0')}`, 500 - i));
        const levels = users.map((u, i) => ({ _id: u._id, m: 500 - i, at: new Date(Date.UTC(2026, 10, 1)) }));
        const { svc } = harness({ users, levels });
        const first = await svc.levelBoard(0, 'u001');
        expect(first.rows).toHaveLength(LEVEL_PAGE);
        expect(first.pages).toBe(Math.ceil(LEVEL_TOP / LEVEL_PAGE));
        expect(first.rows.filter(r => r.me).map(r => r.rank)).toEqual([2]);
        expect(first.me).toMatchObject({ rank: 2, m: 499, name: 'Nicku001' });
        const low = await svc.levelBoard(0, 'u103');
        expect(low.rows.some(r => r.me)).toBe(false);
        expect(low.me).toMatchObject({ rank: 104, m: 397 });
    });

    it('syncs from the verified count after a save: up only, guests removed, cached 60 s', async () => {
        const { svc, m, clock } = harness({ users: [user('A', 3), user('G', 9, { isGuest: true })] });
        setLeaderboardSink(svc);
        try {
            await applyLevelSync('A');
            await applyLevelSync('G');
            expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([['A', 3]]);
            expect((await svc.levelBoard(0, null)).rows[0]).toMatchObject({ value: 2, m: 3 });
            m.users.docs[0].pawlegendsMatches = { easy: 3, hard: 2 };
            clock.advance(1000);
            await applyLevelSync('A');
            expect(m.levels.docs[0]).toMatchObject({ m: 5, at: clock.now() });
            // cached: the board shows the new count after a minute
            expect((await svc.levelBoard(0, null)).rows[0].m).toBe(3);
            clock.advance(60_000);
            expect((await svc.levelBoard(0, null)).rows[0].m).toBe(5);
            // never lowered
            m.users.docs[0].pawlegendsMatches = { easy: 1 };
            await applyLevelSync('A');
            expect(m.levels.docs[0].m).toBe(5);
            // a guest promoted later and then deleted: the row goes
            m.users.docs[0].deletedAt = clock.now();
            await applyLevelSync('A');
            expect(m.levels.docs).toHaveLength(0);
        } finally {
            setLeaderboardSink(null);
        }
    });
});

describe('Country board', () => {
    const t = new Date(Date.UTC(2026, 10, 1));
    const base = () =>
        harness({
            users: [user('A', 50), user('B', 40), user('C', 30), user('H', 90), user('L', 99), user('M', 2)],
            levels: [
                { _id: 'A', m: 50, at: t },
                { _id: 'B', m: 40, at: t },
                { _id: 'C', m: 30, at: t },
                { _id: 'H', m: 90, at: t },
                { _id: 'L', m: 99, at: t },
                { _id: 'M', m: 2, at: t },
            ],
            flags: [
                { _id: 'A', cc: 'LT', off: false, at: t },
                { _id: 'B', cc: 'LT', off: false, at: t },
                { _id: 'C', cc: 'LT', off: false, at: t },
                { _id: 'H', cc: 'LT', off: true, at: t },
                { _id: 'L', cc: 'LV', off: false, at: t },
                { _id: 'M', cc: null, off: false, at: t },
            ],
        });

    it('keeps the players whose shown flag is my country, by level; hidden flags never show', async () => {
        const { svc } = base();
        const b = await svc.countryBoard(0, 'B');
        expect(b.local).toEqual({ cc: 'LT', hidden: false });
        expect(b.rows.map(r => [r.rank, r.name, r.cc ?? null, !!r.me])).toEqual([
            [1, 'NickA', 'LT', false],
            [2, 'NickB', 'LT', true],
            [3, 'NickC', 'LT', false],
        ]);
        expect(b.me).toMatchObject({ rank: 2, m: 40 });
    });

    it('finds a small country however far down the global order its players are', async () => {
        const many = Array.from({ length: 1200 }, (_, i) => `P${i}`);
        const { svc } = harness({
            users: [...many.map(id => user(id, 500)), user('Z', 1)],
            levels: [...many.map(id => ({ _id: id, m: 500, at: t })), { _id: 'Z', m: 1, at: t }],
            flags: [
                ...many.map(id => ({ _id: id, cc: 'LV', off: false, at: t })),
                { _id: 'Z', cc: 'EE', off: false, at: t },
            ],
        });
        const b = await svc.countryBoard(0, 'Z');
        expect(b.rows.map(r => [r.rank, r.name, !!r.me])).toEqual([[1, 'NickZ', true]]);
        expect(b.me).toMatchObject({ rank: 1, m: 1 });
    });

    it('a hidden or unknown flag: no rows, the reason only', async () => {
        const { svc } = base();
        expect(await svc.countryBoard(0, 'H')).toMatchObject({ rows: [], me: null, local: { cc: 'LT', hidden: true } });
        expect(await svc.countryBoard(0, 'M')).toMatchObject({
            rows: [],
            me: null,
            local: { cc: null, hidden: false },
        });
    });
});

const row = (
    matchId: string,
    winner: 0 | 1 | -1,
    heroes: [string, string, string, string, string, string],
    extra: Partial<SideRow> = {}
): SideRow => ({
    matchId,
    at: new Date(Date.UTC(2026, 10, 12, 12)),
    season: CURRENT_SEASON_ID,
    mode: 'pvp',
    reason: 'core',
    winner,
    players: heroes.map((h, s) => ({ s, t: s >= 3 ? 1 : 0, h })),
    ...extra,
});

describe('Cats vs Dogs', () => {
    it('the winning team by species: majority, a tie to the first seat; practice, draws and abandoned never count', () => {
        expect(winningSide(row('m', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']))).toBe('cat');
        expect(winningSide(row('m', 1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']))).toBe('dog');
        expect(winningSide(row('m', 0, ['howler', 'sage', 'pixel', 'clem', 'chili', 'rocket']))).toBe('cat');
        // a 2-seat team with one each: the first seat names it (the scoreboard's rule)
        expect(
            winningSide({
                ...row('m', 0, ['howler', 'clem', 'x', 'a', 'b', 'c']),
                players: [
                    { s: 0, t: 0, h: 'howler' },
                    { s: 1, t: 0, h: 'clem' },
                ],
            })
        ).toBe('dog');
        expect(winningSide(row('m', -1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']))).toBeNull();
        expect(
            winningSide(row('m', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { mode: 'practice' }))
        ).toBeNull();
        expect(
            winningSide(row('m', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { reason: 'abandoned' }))
        ).toBeNull();
        expect(winningSide(row('m', 0, ['nope', 'nada', 'zip', 'howler', 'chili', 'rocket']))).toBeNull();
    });

    it('split math: shares and the lead in whole points', () => {
        expect(sideSplit(52, 48)).toMatchObject({ catShare: 0.52, lead: 'cat', leadPct: 4 });
        expect(sideSplit(0, 0)).toMatchObject({ catShare: 0.5, lead: null, leadPct: 0 });
        expect(sideSplit(1, 3)).toMatchObject({ lead: 'dog', leadPct: 50 });
        expect(ownSideWins({ clem: { w: 3 }, howler: { w: 2 }, nope: { w: 9 }, sage: { m: 4 } })).toEqual({
            cat: 3,
            dog: 2,
        });
    });

    it('a live save counts each match once (every human of a party stores a row), into all, season and week', async () => {
        const { svc, m } = harness();
        const people: HistoryPeople = {
            byCode: async () => null,
            friends: async () => false,
            blockedEither: async () => false,
            names: async () => new Map(),
        };
        const rows: any[] = [];
        const store: HistoryStore = {
            insert: async r =>
                rows.some(x => x.accountId === r.accountId && x.matchId === r.matchId) ? false : (rows.push(r), true),
            page: async () => [],
            get: async () => null,
            prune: async () => undefined,
            incStats: async () => undefined,
            stats: async () => null,
            visibility: async () => null,
            setVisibility: async () => undefined,
            purge: async () => undefined,
        };
        const core = new MatchHistoryCore(store, people);
        const stats = [0, 1, 2, 3, 4, 5].map(slot => ({
            slot,
            hero: ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'][slot],
            kills: 1,
        }));
        const save = (accountId: string, slot: number, matchId = 'party:r1') =>
            core.record({
                accountId,
                matchId,
                at: new Date(Date.UTC(2026, 10, 12, 12)),
                mode: 'pvp',
                map: 'crossing',
                mutator: null,
                difficulty: 'normal',
                outcome: slot < 3 ? 'won' : 'lost',
                ticks: 9000,
                finalHash: 'h',
                slot,
                stats,
                humans: new Map([
                    [0, 'A'],
                    [3, 'B'],
                    [4, 'C'],
                ]),
                winner: 0,
            });
        setLeaderboardSink(svc);
        try {
            await save('A', 0);
            await save('B', 3);
            await save('C', 4);
            await save('A', 0);
            const week = isoWeek(new Date(Date.UTC(2026, 10, 12, 12)));
            const doc = (id: string) => m.sideWins.docs.find(d => d._id === id);
            expect(doc('all')).toMatchObject({ cat: 1 });
            expect(doc(`season:${CURRENT_SEASON_ID}`)).toMatchObject({ cat: 1 });
            expect(doc(`week:${week}`)).toMatchObject({ cat: 1 });
            expect(doc('all')?.dog ?? 0).toBe(0);
            // a practice match: stored in history, never counted
            await applyMatchSides(
                row('solo:1', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { mode: 'practice' })
            );
            expect(doc('all')).toMatchObject({ cat: 1 });
        } finally {
            setLeaderboardSink(null);
        }
    });

    it('the backfill counts history once, is safe to run again, and never double counts a live save', async () => {
        const h = [
            {
                _id: 'h1',
                accountId: 'A',
                ...row('party:r1', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']),
            },
            {
                _id: 'h2',
                accountId: 'B',
                ...row('party:r1', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']),
            },
            {
                _id: 'h3',
                accountId: 'A',
                ...row('party:r2', 1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']),
            },
            {
                _id: 'h4',
                accountId: 'A',
                ...row('solo:x', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { mode: 'practice' }),
            },
            {
                _id: 'h5',
                accountId: 'C',
                ...row('party:r3', 1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket']),
            },
        ];
        const { svc, m, clock } = harness({
            history: h,
            users: [
                user('A', 4, { lastPlayedAt: new Date(Date.UTC(2026, 10, 3)) }),
                user('G', 9, { isGuest: true }),
                user('Z', 0),
            ],
        });
        // a live save of r3 landed before the backfill ran
        expect(await svc.countSides(h[4] as SideRow)).toBe(true);
        expect(await svc.backfill()).toEqual({ levels: 1, sides: 2 });
        const all = () => m.sideWins.docs.find(d => d._id === 'all');
        expect(all()).toMatchObject({ cat: 1, dog: 2 });
        expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([['A', 4]]);
        // run again: finished parts are skipped
        expect(await svc.backfill()).toEqual({ levels: 'skipped', sides: 'skipped' });
        // even forced (the markers gone), nothing counts twice and levels only go up
        m.sideWins.docs = m.sideWins.docs.filter(d => !String(d._id).startsWith('backfill:'));
        clock.advance(1000);
        expect(await svc.backfill()).toEqual({ levels: 1, sides: 0 });
        expect(all()).toMatchObject({ cat: 1, dog: 2 });
        expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([['A', 4]]);
        // another run holding the lock: this one waits
        m.sideWins.docs = m.sideWins.docs.filter(d => !String(d._id).startsWith('backfill:'));
        await m.sideWins.create({ _id: BACKFILL_KEYS.sides, lockUntil: new Date(clock.ms + 60_000) });
        expect((await svc.backfill()).sides).toBe('skipped');
    });

    it('the board: season, all time, this and last week, and my own split when signed in', async () => {
        const { svc, m, clock } = harness({
            stats: [
                {
                    _id: `A:${CURRENT_SEASON_ID}`,
                    accountId: 'A',
                    heroes: { clem: { m: 5, w: 4 }, howler: { m: 2, w: 1 } },
                },
            ],
        });
        await svc.countSides(row('a', 0, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { at: clock.now() }));
        await svc.countSides(row('b', 1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], { at: clock.now() }));
        await svc.countSides(
            row('c', 1, ['clem', 'sage', 'pixel', 'howler', 'chili', 'rocket'], {
                at: new Date(clock.ms - 7 * 86_400_000),
            })
        );
        const pub = await svc.sidesBoard(null);
        expect(pub).toMatchObject({
            season: { id: CURRENT_SEASON_ID, cat: 1, dog: 2 },
            all: { cat: 1, dog: 2 },
            week: { cat: 1, dog: 1 },
            lastWeek: { dog: 1 },
        });
        expect(pub.mine).toBeUndefined();
        expect((await svc.sidesBoard('A')).mine).toEqual({ cat: 4, dog: 1 });
        expect(m.sideMatches.docs).toHaveLength(3);
    });
});

describe('routes (GET /pawlegends/boards/:kind[/me])', () => {
    it('level and sides are public, country needs an account, ranked kinds go to RankedService', async () => {
        const { PawlegendsRankedController } = await import('../ranked/ranked.controller');
        const calls: string[] = [];
        const ranked = { board: async (k: string) => (calls.push(`ranked:${k}`), { k }) } as any;
        const lb = {
            levelBoard: async (p: number, c: string | null) => (calls.push(`level:${p}:${c}`), {}),
            sidesBoard: async (c: string | null) => (calls.push(`sides:${c}`), {}),
            countryBoard: async (p: number, c: string) => (calls.push(`country:${p}:${c}`), {}),
        } as any;
        const ctl = new PawlegendsRankedController(ranked, { consume: async () => undefined } as any, lb);
        await ctl.board('level', { page: '2' }, {}, {});
        await ctl.board('sides', {}, {}, {});
        await ctl.board('global', {}, {}, {});
        await expect(ctl.board('country', {}, {}, {})).rejects.toMatchObject({ status: 403 });
        const req = { user: { _id: 'A' } };
        await ctl.boardMe('country', { page: '1' }, req, {});
        await ctl.boardMe('level', {}, req, {});
        await ctl.boardMe('sides', {}, req, {});
        await ctl.boardMe('global', {}, req, {});
        expect(calls).toEqual([
            'level:2:null',
            'sides:null',
            'ranked:global',
            'country:1:A',
            'level:0:A',
            'sides:A',
            'ranked:global',
        ]);
    });
});

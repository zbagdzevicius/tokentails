import { CURRENT_SEASON_ID } from '../pawlegends-catalog';
import { MatchHistoryCore, type HistoryPeople, type HistoryStore } from '../history/history.service';
import { isoWeek } from '../ranked/boards';
import { levelOf } from '../mode-unlocks';
import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { applyLevelSync, applyMatchSides, setLeaderboardSink } from './leaderboard-live';
import { BACKFILL_KEYS, LEVEL_PAGE, LEVEL_TOP, LeaderboardService, rankCountries } from './leaderboard.service';
import { ownSideWins, sideSplit, winningSide, type SideRow } from './sides';

/*
 * The Leaderboards window (LEADERBOARDS.md): the Level board's order and my own row, the Country board's filter
 * (hidden flags never show), the Cats vs Dogs tally (once per match, from live saves and the backfill, idempotent).
 */

const uniq = () => [{ fields: ['_id'] }];

function harness(
    o: {
        users?: any[];
        levels?: any[];
        flags?: any[];
        sanctions?: any[];
        history?: any[];
        stats?: any[];
        progress?: any[];
    } = {}
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
        progress: new SocialMemoryModel(o.progress ?? [], uniq(), clock.now),
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
        m.progress,
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

    it('syncs exactly from the account level after a save: raised, lowered, guests removed, cached 60 s', async () => {
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
            // the save raised the board version: the board shows the new count within seconds, not after a minute
            clock.advance(3_000);
            expect((await svc.levelBoard(0, null)).rows[0].m).toBe(5);
            // a wrong (too high) count is corrected, its `at` kept
            const at = m.levels.docs[0].at;
            m.users.docs[0].pawlegendsMatches = { easy: 1 };
            clock.advance(1000);
            await applyLevelSync('A');
            expect(m.levels.docs[0]).toMatchObject({ m: 1, at });
            // the legacy credit counts (account-level.ts)
            m.users.docs[0].pawlegendsLegacyMatches = 15;
            await applyLevelSync('A');
            expect(m.levels.docs[0].m).toBe(16);
            // a promoted guest gets its row on the next sync; deleted later: the row goes
            m.users.docs[1].isGuest = false;
            await applyLevelSync('G');
            expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([
                ['A', 16],
                ['G', 9],
            ]);
            m.users.docs[0].deletedAt = clock.now();
            await applyLevelSync('A');
            expect(m.levels.docs.map(d => d._id)).toEqual(['G']);
        } finally {
            setLeaderboardSink(null);
        }
    });

    it("a signed-in read heals the caller's own missing row (a player with no row shows at once)", async () => {
        const t = new Date(Date.UTC(2026, 10, 1));
        const { svc, m } = harness({
            users: [
                user('Z', 6, { pawlegendsLegacyMatches: 12 }),
                user('I', 8),
                user('N', 0, { pawlegendsLegacyMatches: 5 }),
            ],
            levels: [
                { _id: 'Z', m: 6, at: t },
                { _id: 'I', m: 8, at: t },
            ],
        });
        // a public read never writes
        expect((await svc.levelBoard(0, null)).rows.map(r => r.name)).toEqual(['NickI', 'NickZ']);
        const b = await svc.levelBoard(0, 'N');
        expect(b.rows.map(r => [r.name, r.value, !!r.me])).toEqual([
            ['NickI', 5, false],
            ['NickZ', 4, false],
            ['NickN', 3, true],
        ]);
        expect(m.levels.docs.find(d => d._id === 'N')).toMatchObject({ m: 5 });
        // Zygis's own read corrects his row to the level his profile shows: 6 saved + 12 credit = 18, Lv 8
        const z = await svc.levelBoard(0, 'Z');
        expect(z.rows[0]).toMatchObject({ rank: 1, name: 'NickZ', value: 8, m: 18, me: true });
        expect(z.me).toMatchObject({ rank: 1, value: 8, m: 18 });
    });
});

describe('Account level repair (legacy credit + exact recompute)', () => {
    const t = new Date(Date.UTC(2026, 10, 1));
    const blob = (matches: number) => ({ blob: { v: 1, counts: { matches } } });

    it('freezes the legacy credit once, recomputes every row exactly, and is idempotent', async () => {
        const { svc, m } = harness({
            users: [
                // Zygis: 6 saved, 18 on his synced device count (Lv 8 on his profile), row says 6 (Lv 4)
                user('Z', 6, { lastPlayedAt: t }),
                // Irvidas: 8 saved, 19 synced
                user('I', 8, { lastPlayedAt: t }),
                // Angelinnaa: no saved match (all forfeits/unsaved), 5 synced, no row at all
                { _id: 'N', lastPlayedAt: t },
                // a row too high (an older bug) and no device row
                user('H', 2),
                // a guest with a row, and an account that is gone
                user('G', 9, { isGuest: true }),
                // a client that wrote a huge synced count: capped
                user('X', 1),
            ],
            levels: [
                { _id: 'Z', m: 6, at: t },
                { _id: 'I', m: 8, at: t },
                { _id: 'H', m: 40, at: t },
                { _id: 'G', m: 9, at: t },
                { _id: 'GONE', m: 70, at: t },
            ],
            progress: [
                { _id: 'Z', ...blob(18) },
                { _id: 'I', ...blob(19) },
                { _id: 'N', ...blob(5) },
                { _id: 'G', ...blob(9) },
                { _id: 'X', ...blob(1_000_000) },
            ],
        });
        const first = await svc.backfill();
        expect(first.legacy).toBe(4);
        const u = (id: string) => m.users.docs.find(d => d._id === id) as Record<string, any>;
        expect(u('Z').pawlegendsLegacyMatches).toBe(12);
        expect(u('I').pawlegendsLegacyMatches).toBe(11);
        expect(u('N').pawlegendsLegacyMatches).toBe(5);
        expect(u('X').pawlegendsLegacyMatches).toBe(200);
        expect(u('H').pawlegendsLegacyMatches).toBeUndefined();
        expect(m.levels.docs.map(d => [d._id, d.m]).sort()).toEqual(
            [
                ['H', 2],
                ['I', 19],
                ['N', 5],
                ['X', 201],
                ['Z', 18],
            ].sort()
        );
        const b = await svc.levelBoard(0, null);
        expect(b.rows.map(r => [r.name, r.value])).toEqual([
            ['NickX', 29],
            ['NickI', 8],
            ['NickZ', 8],
            ['NickN', 3],
            ['NickH', 2],
        ]);
        // a later sync of the device count never moves the frozen credit
        (m.progress.docs.find(d => d._id === 'Z') as Record<string, any>).blob.counts.matches = 90;
        m.sideWins.docs = m.sideWins.docs.filter(d => d._id !== BACKFILL_KEYS.levels);
        expect(await svc.backfill()).toEqual({ legacy: 'skipped', levels: 0, sides: 'skipped' });
        expect(u('Z').pawlegendsLegacyMatches).toBe(12);
        // even with the legacy marker gone, an account already credited is never credited again
        m.sideWins.docs = [];
        expect((await svc.backfill()).legacy).toBe(0);
        expect(u('Z').pawlegendsLegacyMatches).toBe(12);
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

    it('Top countries: by the sum of account levels, my country marked; my exact rank below the top 100', async () => {
        const { svc } = base();
        const b = await svc.countryBoard(0, 'B');
        // LT: A 50 (Lv 14) + B 40 (Lv 12) + C 30 (Lv 11) = 37; LV: L 99 (Lv 18); H hid the flag, M has none
        expect(b.countries).toEqual({
            rows: [
                { rank: 1, cc: 'LT', players: 3, levels: 37, me: true },
                { rank: 2, cc: 'LV', players: 1, levels: 18 },
            ],
            mine: null,
            total: 2,
        });
        // no flag: Top countries still shows
        expect((await svc.countryBoard(0, 'M')).countries?.rows.map(r => r.cc)).toEqual(['LT', 'LV']);
        const many = Array.from({ length: LEVEL_TOP + 20 }, (_, i) => `P${String(i).padStart(3, '0')}`);
        const big = harness({
            users: [...many.map(id => user(id, 500)), user('Z', 1)],
            levels: [...many.map(id => ({ _id: id, m: 500, at: t })), { _id: 'Z', m: 1, at: t }],
            flags: [...many, 'Z'].map(id => ({ _id: id, cc: 'LT', off: false, at: t })),
        });
        const z = await big.svc.countryBoard(0, 'Z');
        expect(z.rows).toHaveLength(LEVEL_PAGE);
        expect(z.pages).toBe(LEVEL_TOP / LEVEL_PAGE);
        expect(z.me).toMatchObject({ rank: LEVEL_TOP + 21, m: 1 });
        expect(z.me?.over).toBeUndefined();
    });

    it('countries (public): Top countries alone, no player, id or mark', async () => {
        const { svc } = base();
        expect(await svc.countriesBoard()).toEqual({
            countries: {
                rows: [
                    { rank: 1, cc: 'LT', players: 3, levels: 37 },
                    { rank: 2, cc: 'LV', players: 1, levels: 18 },
                ],
                mine: null,
                total: 2,
            },
        });
    });

    it('rankCountries: levels, then players, then the code; no flag never counts', () => {
        expect(
            rankCountries([
                { m: 16, cc: 'LT' },
                { m: 0, cc: 'LT' },
                { m: 16, cc: 'PL' },
                { m: 2, cc: 'EE' },
                { m: 0, cc: 'EE' },
                { m: 500, cc: null },
            ])
        ).toEqual([
            { rank: 1, cc: 'LT', players: 2, levels: 9 },
            { rank: 2, cc: 'PL', players: 1, levels: 8 },
            { rank: 3, cc: 'EE', players: 2, levels: 3 },
        ]);
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

    it('the repair counts history once, rebuilds lost counters from the guards, and is idempotent', async () => {
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
        // a live save of r3 landed before the repair ran
        expect(await svc.countSides(h[4] as SideRow)).toBe(true);
        expect(m.sideMatches.docs[0]).toMatchObject({ _id: 'party:r3', s: 'dog', se: CURRENT_SEASON_ID });
        // a crash after the guard of an older match, before its counters: the guard exists, the counters never moved
        await m.sideMatches.create({
            _id: 'party:old',
            s: 'cat',
            se: CURRENT_SEASON_ID,
            at: new Date(Date.UTC(2026, 10, 3)),
        });
        // and a counter that drifted up
        await m.sideWins.updateOne({ _id: 'all' }, { $inc: { dog: 5 } });
        expect(await svc.backfill()).toEqual({ legacy: 0, levels: 1, sides: 4 });
        const doc = (id: string) => m.sideWins.docs.find(d => d._id === id);
        expect(doc('all')).toMatchObject({ cat: 2, dog: 2 });
        expect(doc(`season:${CURRENT_SEASON_ID}`)).toMatchObject({ cat: 2, dog: 2 });
        expect(doc(`week:${isoWeek(new Date(Date.UTC(2026, 10, 12, 12)))}`)).toMatchObject({ cat: 1, dog: 2 });
        expect(doc(`week:${isoWeek(new Date(Date.UTC(2026, 10, 3)))}`)).toMatchObject({ cat: 1, dog: 0 });
        expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([['A', 4]]);
        // run again: finished parts are skipped
        expect(await svc.backfill()).toEqual({ legacy: 'skipped', levels: 'skipped', sides: 'skipped' });
        // a version bump (the markers gone): the same result, nothing counted twice
        m.sideWins.docs = m.sideWins.docs.filter(d => !String(d._id).startsWith('backfill:'));
        clock.advance(1000);
        expect(await svc.backfill()).toEqual({ legacy: 0, levels: 0, sides: 4 });
        expect(doc('all')).toMatchObject({ cat: 2, dog: 2 });
        expect(m.levels.docs.map(d => [d._id, d.m])).toEqual([['A', 4]]);
        // a live save after the repair still counts once on top
        expect(await svc.countSides(h[0] as SideRow)).toBe(false);
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
    it('level, sides and countries are public, country needs an account, ranked kinds go to RankedService', async () => {
        const { PawlegendsRankedController } = await import('../ranked/ranked.controller');
        const calls: string[] = [];
        const ranked = { board: async (k: string) => (calls.push(`ranked:${k}`), { k }) } as any;
        const lb = {
            levelBoard: async (p: number, c: string | null) => (calls.push(`level:${p}:${c}`), {}),
            sidesBoard: async (c: string | null) => (calls.push(`sides:${c}`), {}),
            countryBoard: async (p: number, c: string) => (calls.push(`country:${p}:${c}`), {}),
            countriesBoard: async () => (calls.push('countries'), {}),
        } as any;
        const ctl = new PawlegendsRankedController(ranked, { consume: async () => undefined } as any, lb);
        await ctl.board('level', { page: '2' }, {}, {});
        await ctl.board('sides', {}, {}, {});
        await ctl.board('global', {}, {}, {});
        await ctl.board('countries', {}, {}, {});
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
            'countries',
            'country:1:A',
            'level:0:A',
            'sides:A',
            'ranked:global',
        ]);
    });
});

describe('Boards after a saved match (founder Nov 21: "level / match is not updated in leaderboards")', () => {
    const t = new Date(Date.UTC(2026, 10, 1));
    const second = (h: ReturnType<typeof harness>) =>
        new LeaderboardService(
            h.m.levels,
            h.m.sideWins,
            h.m.sideMatches,
            h.m.users,
            h.m.history,
            h.m.stats,
            h.m.sanctions,
            h.m.social,
            h.m.flags,
            undefined,
            undefined,
            h.m.progress,
            h.clock
        );
    const setup = () =>
        harness({
            users: [user('A', 3), user('B', 10)],
            levels: [
                { _id: 'A', m: 3, at: t },
                { _id: 'B', m: 10, at: t },
            ],
            flags: [
                { _id: 'A', cc: 'LT', off: false, at: t },
                { _id: 'B', cc: 'LT', off: false, at: t },
            ],
        });

    it("the caller's own row (list and me) shows the new count at once on Global and Country", async () => {
        const h = setup();
        setLeaderboardSink(h.svc);
        try {
            // warm every cache
            await h.svc.levelBoard(0, 'A');
            await h.svc.countryBoard(0, 'A');
            h.m.users.docs[0].pawlegendsMatches = { easy: 4 };
            await applyLevelSync('A');
            // no clock advance at all
            const g = await h.svc.levelBoard(0, 'A');
            expect(g.rows.find(r => r.me)).toMatchObject({ m: 4 });
            expect(g.me).toMatchObject({ m: 4 });
            const c = await h.svc.countryBoard(0, 'A');
            expect(c.rows.find(r => r.me)).toMatchObject({ m: 4 });
            expect(c.me).toMatchObject({ m: 4 });
        } finally {
            setLeaderboardSink(null);
        }
    });

    it('every board and every instance shows the new count within seconds (the shared board version)', async () => {
        const h = setup();
        const other = second(h);
        setLeaderboardSink(h.svc);
        try {
            // the other instance caches the boards first
            expect((await other.levelBoard(0, null)).rows.map(r => r.m)).toEqual([10, 3]);
            expect((await other.levelBoard(0, 'B')).rows.map(r => r.m)).toEqual([10, 3]);
            expect((await other.countriesBoard()).countries.rows[0].levels).toBe(levelOf(10) + levelOf(3));
            // A saves 20 more matches on this instance: A passes B
            h.m.users.docs[0].pawlegendsMatches = { easy: 23 };
            h.clock.advance(1000);
            await applyLevelSync('A');
            // still inside the rebuild floor: the old answer is kept
            expect((await other.levelBoard(0, null)).rows.map(r => r.m)).toEqual([10, 3]);
            h.clock.advance(3_000);
            const pub = await other.levelBoard(0, null);
            expect(pub.rows.map(r => [r.name, r.m])).toEqual([
                ['NickA', 23],
                ['NickB', 10],
            ]);
            const b = await other.levelBoard(0, 'B');
            expect(b.rows.map(r => r.m)).toEqual([23, 10]);
            expect(b.me).toMatchObject({ rank: 2, m: 10 });
            const cb = await other.countryBoard(0, 'B');
            expect(cb.rows.map(r => r.m)).toEqual([23, 10]);
            expect(cb.me).toMatchObject({ rank: 2, m: 10 });
            expect((await other.countriesBoard()).countries.rows[0].levels).toBe(levelOf(23) + levelOf(10));
        } finally {
            setLeaderboardSink(null);
        }
    });

    it('with no save, an answer is still kept for a minute (the version did not move)', async () => {
        const h = setup();
        await h.svc.levelBoard(0, null);
        // a row changed behind the boards' back (no sync): the cache keeps the old one until it lapses
        h.m.levels.docs[0].m = 50;
        h.clock.advance(30_000);
        expect((await h.svc.levelBoard(0, null)).rows.map(r => r.m)).toEqual([10, 3]);
        h.clock.advance(31_000);
        expect((await h.svc.levelBoard(0, null)).rows.map(r => r.m)).toEqual([50, 10]);
    });
});

import { HttpException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { SIM_VERSION, type PawlegendsReplayRecord } from 'src/vendor/pawlegends-sim';
import { MemoryRoomStore, type StoredRoom } from '../party/room-store';
import { PAWLEGENDS_REPLAY_QUEUE, savePawlegendsMatch } from '../pawlegends-live';
import { savePawlegendsPartyMatch } from '../pawlegends-party-live';
import {
    buildRow,
    canView,
    groupOf,
    HISTORY_KEEP,
    HISTORY_PAGE,
    partyMode,
    seasonAt,
    soloMode,
    statsView,
    type BuildInput,
    type HistoryRowDoc,
    type HistoryVisibility,
    type SeasonStatsDoc,
} from './history.model';
import { MatchHistoryCore, type HistoryPeople, type HistoryStore } from './history.service';

jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('node-fetch', () => jest.fn());

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md): rows built from the verified stats only, once per account per match,
 * HISTORY_KEEP kept, season stats, pages and filters, who may look (default friends; blocks never; guests only their
 * own), no account id or replay key leaving the server for another player, and the `/live` saves writing the row.
 */

const NOW = new Date('2026-11-14T12:00:00Z');

const slotStats = (slot: number, hero: string, over: Record<string, number> = {}) => ({
    slot,
    hero,
    kills: 2,
    deaths: 2,
    assists: 2,
    heroDamage: 1000,
    towerDamage: 500,
    level: 8,
    damageTaken: 1200,
    healShield: 0,
    objective: 0,
    fish: 900,
    toys: 2,
    lastHits: 30,
    ...over,
});

const sixStats = () => [
    slotStats(0, 'clem', { kills: 9, assists: 4, deaths: 1, heroDamage: 6000, towerDamage: 3000 }),
    slotStats(1, 'sage'),
    slotStats(2, 'gabe'),
    slotStats(3, 'brutus', { kills: 5, heroDamage: 4000 }),
    slotStats(4, 'pixel'),
    slotStats(5, 'nugget'),
];

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
    accountId: 'acc-a',
    matchId: 'digest-1',
    at: NOW,
    mode: 'skirmish',
    map: 'crossing',
    mutator: 'none',
    difficulty: 'normal',
    outcome: 'won',
    ticks: 9000,
    finalHash: 'abcdef12',
    slot: 0,
    stats: sixStats(),
    humans: new Map([[0, 'acc-a']]),
    ...over,
});

class MemoryHistory implements HistoryStore {
    rows: HistoryRowDoc[] = [];
    statsRows = new Map<string, SeasonStatsDoc>();
    prefs = new Map<string, HistoryVisibility>();
    private n = 0;
    async insert(row: HistoryRowDoc) {
        if (this.rows.some(r => r.accountId === row.accountId && r.matchId === row.matchId)) return false;
        // ObjectIds grow with insertion, like Mongo's
        const id = new Types.ObjectId(Math.floor(NOW.getTime() / 1000) + this.n++);
        this.rows.push({ ...row, _id: id });
        return true;
    }
    async page(accountId: string, group: string | null, before: string | null, limit: number) {
        return this.rows
            .filter(r => r.accountId === accountId && (!group || r.group === group))
            .filter(r => !before || String(r._id) < before)
            .sort((a, b) => (String(a._id) < String(b._id) ? 1 : -1))
            .slice(0, limit);
    }
    async get(accountId: string, id: string) {
        return this.rows.find(r => r.accountId === accountId && String(r._id) === id) ?? null;
    }
    async prune(accountId: string, keep: number) {
        const mine = await this.page(accountId, null, null, 1e9);
        const drop = new Set(mine.slice(keep).map(r => String(r._id)));
        this.rows = this.rows.filter(r => !drop.has(String(r._id)));
    }
    async incStats(id: string, _accountId: string, inc: Record<string, number>) {
        const doc: any = this.statsRows.get(id) ?? { _id: id };
        for (const [k, v] of Object.entries(inc)) {
            const path = k.split('.');
            let o = doc;
            for (const p of path.slice(0, -1)) o = o[p] ??= {};
            o[path[path.length - 1]] = (o[path[path.length - 1]] ?? 0) + v;
        }
        this.statsRows.set(id, doc);
    }
    async stats(id: string) {
        return this.statsRows.get(id) ?? null;
    }
    async visibility(accountId: string) {
        return this.prefs.get(accountId) ?? null;
    }
    async setVisibility(accountId: string, v: HistoryVisibility) {
        this.prefs.set(accountId, v);
    }
    async purge(accountId: string) {
        this.rows = this.rows.filter(r => r.accountId !== accountId);
        for (const r of this.rows) for (const p of r.players) if (p.u === accountId) p.u = null;
        for (const k of [...this.statsRows.keys()]) if (k.startsWith(`${accountId}:`)) this.statsRows.delete(k);
        this.prefs.delete(accountId);
    }
}

const CODES: Record<string, string> = { ABCD2345: 'acc-a', BCDE3456: 'acc-b', CDEF4567: 'acc-c' };

function people(over: { friends?: string[][]; blocks?: string[][] } = {}): HistoryPeople {
    const pair = (a: string, b: string, list: string[][] = []) =>
        list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    return {
        byCode: async code => CODES[code] ?? null,
        friends: async (a, b) => pair(a, b, over.friends),
        blockedEither: async (a, b) => pair(a, b, over.blocks),
        names: async ids => new Map(ids.map(id => [id, `Name of ${id.replace('acc-', '')}`])),
    };
}

const setup = (over: { friends?: string[][]; blocks?: string[][] } = {}) => {
    const store = new MemoryHistory();
    const core = new MatchHistoryCore(store, people(over), () => NOW, { warn: () => undefined });
    return { store, core };
};

const codeOf = async (p: Promise<unknown>) => {
    try {
        await p;
        return null;
    } catch (error) {
        if (error instanceof HttpException) return (error.getResponse() as { code?: string }).code ?? null;
        throw error;
    }
};

describe('match history: the row', () => {
    it('is built from the verified stats: grades, MVP of the winners, SVP of the losers, the replay key', () => {
        const row = buildRow(input())!;
        expect(row).toMatchObject({
            hero: 'clem',
            k: 9,
            d: 1,
            a: 4,
            outcome: 'won',
            winner: 0,
            mvpSlot: 0,
            svpSlot: 3,
            group: 'ai',
            season: 's1',
            key: 'abcdef12:9000',
            map: 'crossing',
            mutator: null,
        });
        expect(row.grade).toMatch(/^[SABC]$/);
        expect(row.players).toHaveLength(6);
        expect(row.players[0]).toMatchObject({ s: 0, t: 0, h: 'clem', u: 'acc-a', lv: 8, cs: 30, f: 900, ty: 2 });
        expect(row.players[3]).toMatchObject({ s: 3, t: 1, u: null });
    });

    it('a draw has one MVP and no SVP; a 5v5 room has two teams of five', () => {
        const draw = buildRow(input({ draw: true, outcome: 'lost' }))!;
        expect(draw).toMatchObject({ outcome: 'draw', winner: -1, mvpSlot: 0, svpSlot: null });
        const ten = Array.from({ length: 10 }, (_, s) => slotStats(s, 'clem'));
        const big = buildRow(input({ map: 'hearthwood', stats: ten, slot: 7, outcome: 'lost', winner: 0 }))!;
        expect(big.players.filter(p => p.t === 1).map(p => p.s)).toEqual([5, 6, 7, 8, 9]);
        expect(big.winner).toBe(0);
    });

    it('no row without the owner seat or stats', () => {
        expect(buildRow(input({ stats: undefined }))).toBeNull();
        expect(buildRow(input({ slot: 4, stats: sixStats().slice(0, 3) }))).toBeNull();
    });

    it('modes and filters', () => {
        expect(soloMode('crossing', 'none')).toBe('skirmish');
        expect(soloMode('hearthwood', 'none')).toBe('classic');
        expect(soloMode('crossing', 'blitz')).toBe('blitz');
        expect(soloMode('crossing', 'practice')).toBe('practice');
        expect(soloMode('crossing', 'duel')).toBe('arcade');
        expect(partyMode(true, 'ranked')).toBe('ranked');
        expect(partyMode(false, 'ranked')).toBe('ranked');
        expect(partyMode(true, 'casual')).toBe('pvp');
        expect(partyMode(false, null)).toBe('coop');
        expect(groupOf('coop')).toBe('ai');
        expect(groupOf('practice')).toBe('arcade');
        expect(seasonAt(new Date('2027-03-01T00:00:00Z'))).toBe('s1');
    });

    it('who may look: self always, a block never, else the owner choice', () => {
        const r = { self: false, friends: true, blocked: false };
        expect(canView('friends', r)).toBe(true);
        expect(canView('friends', { ...r, friends: false })).toBe(false);
        expect(canView('everyone', { ...r, friends: false })).toBe(true);
        expect(canView('me', r)).toBe(false);
        expect(canView('everyone', { ...r, blocked: true })).toBe(false);
        expect(canView('me', { ...r, self: true })).toBe(true);
    });

    it('season stats: win rate, KDA and the three favourite champions', () => {
        const v = statsView('s1', {
            _id: 'x',
            m: 10,
            w: 6,
            k: 30,
            d: 10,
            a: 20,
            mvp: 2,
            heroes: { clem: { m: 5, w: 4 }, sage: { m: 3, w: 1 }, gabe: { m: 1, w: 1 }, pixel: { m: 1, w: 0 } },
        });
        expect(v).toMatchObject({ matches: 10, wins: 6, winRate: 60, kda: 5, mvp: 2 });
        expect(v.favourites.map(f => f.hero)).toEqual(['clem', 'sage', 'gabe']);
        expect(v.favourites[0].winRate).toBe(80);
        expect(statsView('s1', null)).toMatchObject({ matches: 0, winRate: null, favourites: [] });
    });
});

describe('match history: the store and the reads', () => {
    it('one row per account per match; season stats count it once', async () => {
        const { core, store } = setup();
        expect(await core.record(input())).toBe(true);
        expect(await core.record(input())).toBe(false);
        expect(store.rows).toHaveLength(1);
        expect(store.statsRows.get('acc-a:s1')).toMatchObject({
            m: 1,
            w: 1,
            k: 9,
            mvp: 1,
            heroes: { clem: { m: 1, w: 1 } },
        });
    });

    it(`keeps the newest ${HISTORY_KEEP} rows`, async () => {
        const { core, store } = setup();
        for (let i = 0; i < HISTORY_KEEP + 5; i++) await core.record(input({ matchId: `m${i}` }));
        expect(store.rows).toHaveLength(HISTORY_KEEP);
        expect(store.rows.some(r => r.matchId === 'm0')).toBe(false);
        expect(store.rows.some(r => r.matchId === `m${HISTORY_KEEP + 4}`)).toBe(true);
        // the season numbers keep every match
        expect(store.statsRows.get('acc-a:s1')?.m).toBe(HISTORY_KEEP + 5);
    });

    it('never throws into the save', async () => {
        const store = new MemoryHistory();
        store.insert = async () => {
            throw new Error('db down');
        };
        const core = new MatchHistoryCore(store, people(), () => NOW, { warn: () => undefined });
        await expect(core.record(input())).resolves.toBe(false);
    });

    it('pages newest first, filters by mode, season stats and the choice on the first page only', async () => {
        const { core } = setup();
        for (let i = 0; i < HISTORY_PAGE + 3; i++)
            await core.record(
                input({ matchId: `m${i}`, mode: i % 2 ? 'blitz' : 'skirmish', mutator: i % 2 ? 'blitz' : 'none' })
            );
        const first = await core.list('acc-a', {}, false);
        expect(first.rows).toHaveLength(HISTORY_PAGE);
        expect(first.owner).toEqual({ name: 'Name of a', self: true });
        expect(first.stats).toMatchObject({ matches: HISTORY_PAGE + 3, wins: HISTORY_PAGE + 3 });
        expect(first.visibility).toBe('friends');
        expect(first.rows[0].key).toBe('abcdef12:9000');
        expect(first.rows[0].mvp).toBe('mvp');
        expect(first.next).toBeTruthy();
        const second = await core.list('acc-a', { before: first.next }, false);
        expect(second.rows).toHaveLength(3);
        expect(second.next).toBeNull();
        expect(second.stats).toBeUndefined();
        const blitz = await core.list('acc-a', { mode: 'blitz' }, false);
        expect(blitz.rows.every(r => r.mode === 'blitz')).toBe(true);
        expect(await codeOf(core.list('acc-a', { mode: 'nope' }, false))).toBe('PAWLEGENDS_HISTORY_INVALID');
        expect(await codeOf(core.list('acc-a', { before: 'x' }, false))).toBe('PAWLEGENDS_HISTORY_INVALID');
    });

    it("a friend's history: friends by default, the owner's choice, blocks, guests", async () => {
        const { core } = setup({ friends: [['acc-a', 'acc-b']], blocks: [['acc-a', 'acc-c']] });
        await core.record(input());
        const seen = await core.list('acc-b', { code: 'ABCD2345' }, true);
        expect(seen.owner).toEqual({ name: 'Name of a', self: false });
        expect(seen.rows).toHaveLength(1);
        // no replay key and no choice for someone else
        expect(seen.rows[0].key).toBeUndefined();
        expect(seen.visibility).toBeUndefined();
        expect(await codeOf(core.list('acc-x', { code: 'ABCD2345' }, true))).toBe('PAWLEGENDS_HISTORY_PRIVATE');
        expect(await codeOf(core.list('acc-c', { code: 'ABCD2345' }, true))).toBe('PAWLEGENDS_SOCIAL_NOT_FOUND');
        expect(await codeOf(core.list('acc-b', { code: 'ABCD2345' }, false))).toBe('PAWLEGENDS_NEED_ACCOUNT');
        expect(await codeOf(core.list('acc-b', { code: 'ZZZZ9999' }, true))).toBe('PAWLEGENDS_SOCIAL_NOT_FOUND');
        expect(await codeOf(core.list('acc-b', { code: '!' }, true))).toBe('PAWLEGENDS_HISTORY_INVALID');
        await core.setVisibility('acc-a', 'me');
        expect(await codeOf(core.list('acc-b', { code: 'ABCD2345' }, true))).toBe('PAWLEGENDS_HISTORY_PRIVATE');
        await core.setVisibility('acc-a', 'everyone');
        expect((await core.list('acc-x', { code: 'ABCD2345' }, true)).rows).toHaveLength(1);
        // a block still wins over "everyone"
        expect(await codeOf(core.list('acc-c', { code: 'ABCD2345' }, true))).toBe('PAWLEGENDS_SOCIAL_NOT_FOUND');
        expect(await codeOf(core.setVisibility('acc-a', 'public'))).toBe('PAWLEGENDS_HISTORY_INVALID');
        // your own code is your own history
        expect((await core.list('acc-a', { code: 'ABCD2345' }, false)).owner.self).toBe(true);
    });

    it('the match detail: both teams, names for humans, bots as bots, never an account id', async () => {
        const { core, store } = setup({ friends: [['acc-a', 'acc-b']] });
        await core.record(
            input({
                humans: new Map([
                    [0, 'acc-a'],
                    [1, 'acc-b'],
                ]),
            })
        );
        const id = String(store.rows[0]._id);
        const m = await core.match('acc-b', { code: 'ABCD2345', id }, true);
        expect(m.players).toHaveLength(6);
        expect(m.players[0]).toMatchObject({ name: 'Name of a', bot: false, owner: true, damage: 6000, cs: 30 });
        expect(m.players[1]).toMatchObject({ name: 'Name of b', bot: false, owner: false });
        expect(m.players[2]).toMatchObject({ name: null, bot: true });
        expect(m).toMatchObject({ mvpSlot: 0, svpSlot: 3, winner: 0, slot: 0 });
        expect(JSON.stringify(m)).not.toContain('acc-');
        expect(m.key).toBeUndefined();
        expect(await codeOf(core.match('acc-a', { id: '0'.repeat(24) }, true))).toBe('PAWLEGENDS_HISTORY_NOT_FOUND');
        expect(await codeOf(core.match('acc-a', { id: 'nope' }, true))).toBe('PAWLEGENDS_HISTORY_INVALID');
        // another account's row id is not yours to read
        expect(await codeOf(core.match('acc-b', { id }, true))).toBe('PAWLEGENDS_HISTORY_NOT_FOUND');
    });

    it('account deletion: the rows, stats and choice go; the seat in other rows loses its id', async () => {
        const { core, store } = setup();
        await core.record(
            input({
                humans: new Map([
                    [0, 'acc-a'],
                    [1, 'acc-b'],
                ]),
            })
        );
        await core.record(
            input({
                accountId: 'acc-b',
                slot: 1,
                humans: new Map([
                    [0, 'acc-a'],
                    [1, 'acc-b'],
                ]),
            })
        );
        await core.setVisibility('acc-a', 'me');
        await core.purge('acc-a');
        expect(store.rows.map(r => r.accountId)).toEqual(['acc-b']);
        expect(store.rows[0].players[0].u).toBeNull();
        expect(store.statsRows.has('acc-a:s1')).toBe(false);
        expect(store.prefs.has('acc-a')).toBe(false);
    });
});

describe('match history: written by the /live saves', () => {
    it('a solo save stores the re-sim stats once (a duplicate save writes nothing)', async () => {
        const users = new FakeUsers();
        const games = new FakeGames();
        const userId = users.add({});
        const record: PawlegendsReplayRecord = {
            v: 1,
            simVersion: SIM_VERSION,
            seed: 7,
            difficulty: 'easy',
            hero: 'clem',
            trick: 'pounce',
            ticks: 9000,
            inputs: 'AQIDBA==',
            outcome: 'won',
            finalHash: '0badc0de',
            mutator: 'blitz',
        } as PawlegendsReplayRecord;
        const { core, store } = setup();
        const deps = {
            users,
            games,
            verify: async () => ({
                ok: true as const,
                outcome: 'won' as const,
                finalHash: '0badc0de',
                ticks: 9000,
                stats: sixStats() as any,
                reason: 'timeUp' as const,
                winner: 0 as const,
            }),
            queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
            now: () => NOW,
            logger: { warn: () => undefined, log: () => undefined },
            history: core,
        };
        await savePawlegendsMatch(deps as any, userId, { pawlegends: record as any });
        await expect(savePawlegendsMatch(deps as any, userId, { pawlegends: record as any })).rejects.toBeTruthy();
        expect(store.rows).toHaveLength(1);
        expect(store.rows[0]).toMatchObject({
            accountId: String(userId),
            mode: 'blitz',
            group: 'blitz',
            mutator: 'blitz',
            reason: 'timeUp',
            key: '0badc0de:9000',
            slot: 0,
        });
        expect(store.rows[0].players.filter(p => p.u).map(p => p.s)).toEqual([0]);
    });

    it("a party save stores the referee's stats with every human seat", async () => {
        const users = new FakeUsers();
        const games = new FakeGames();
        const a = users.add({});
        const b = users.add({});
        const r: StoredRoom = {
            _id: 'room1',
            party: 'p1',
            simVersion: SIM_VERSION,
            simHash: 'x',
            config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0, 1] },
            occupants: [
                { slot: 0, accountId: String(a), guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
                { slot: 1, accountId: String(b), guestKeyHash: null, name: 'Brave Paws', ticketed: true },
            ],
            chunks: [],
            lastTurn: 4000,
            lastSeq: [1, 1, 0],
            pilotTicks: {},
            openUnclaimedAt1800: false,
            unscored: null,
            status: 'ended',
            verdict: {
                finalHash: 'abcdef12',
                outcome: 'won',
                ticks: 8000,
                winner: 0,
                reason: 'core',
                verified: true,
                stats: sixStats(),
            },
            owner: 'boot',
            epoch: 0,
            handoff: false,
            resume: {},
            createdAt: NOW,
            updatedAt: NOW,
        };
        const rooms = new MemoryRoomStore();
        rooms.rooms.set(r._id, r);
        const { core, store } = setup();
        const deps = {
            users,
            games,
            rooms,
            now: () => NOW,
            logger: { warn: () => undefined, log: () => undefined },
            history: core,
        };
        const body = {
            pawlegends: {
                v: 2 as const,
                room: 'room1',
                slot: 1,
                simVersion: SIM_VERSION,
                ticks: 8000,
                outcome: 'won' as const,
                finalHash: 'abcdef12',
            },
        };
        await savePawlegendsPartyMatch(deps as any, String(b), body as any);
        expect(store.rows).toHaveLength(1);
        expect(store.rows[0]).toMatchObject({
            accountId: String(b),
            matchId: 'party:room1',
            mode: 'coop',
            slot: 1,
            hero: 'sage',
        });
        expect(store.rows[0].players.filter(p => p.u).map(p => p.u)).toEqual([String(a), String(b)]);
    });
});

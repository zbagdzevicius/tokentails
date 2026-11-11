import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { SIM_VERSION } from '../../vendor/pawlegends-sim';
import { MemoryMmRoomStore, type MmRoomRecord } from '../mm/mm-room.schema';
import { MemoryRoomStore, type StoredRoom } from '../party/room-store';
import { savePawlegendsPartyMatch } from '../pawlegends-party-live';
import { SocialMemoryModel } from '../social/social-model.helper-spec';
import { isoWeek } from './boards';

/* Leaderboards and ranked points through /live (SOCIAL-RANKED.md §6.1, §7.3): the one write site. */

const NOW = new Date('2026-11-12T13:00:00Z');

function setup(
    opts: {
        queue?: 'casual' | 'ranked';
        foes?: number;
        voided?: boolean;
        guest?: boolean;
        winner?: 0 | 1;
        sanction?: boolean;
        dailyWins?: number;
        casualRow?: boolean;
    } = {}
) {
    const users = new FakeUsers();
    const games = new FakeGames();
    const a = users.add({ isGuest: !!opts.guest });
    const c = users.add({});
    const d = users.add({});
    const room: StoredRoom = {
        _id: 'room1',
        party: 'p1',
        simVersion: SIM_VERSION,
        simHash: 'x',
        config: {
            seed: 1,
            picks: ['clem', 'brutus', 'sage', 'gabe', 'pixel', 'stilts'],
            tricks: [],
            difficulty: 'hard',
            humans: [0, 3, 4],
            mode: 'pvp',
        },
        occupants: [
            { slot: 0, accountId: a, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
            { slot: 3, accountId: c, guestKeyHash: null, name: 'Brave Paws', ticketed: true },
            { slot: 4, accountId: d, guestKeyHash: null, name: 'Tiny Bean', ticketed: true },
        ],
        chunks: [],
        lastTurn: 4000,
        lastSeq: [1, 0, 0, 1, 1, 0],
        pilotTicks: { '0': {}, '3': {}, '4': {} },
        openUnclaimedAt1800: false,
        unscored: null,
        status: 'ended',
        verdict: {
            finalHash: 'abcdef12',
            outcome: (opts.winner ?? 0) === 0 ? 'won' : 'lost',
            ticks: 8000,
            winner: opts.winner ?? 0,
            reason: 'core',
            verified: true,
        },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: NOW,
        updatedAt: NOW,
    };
    const store = new MemoryRoomStore();
    store.rooms.set(room._id, room);
    const mmRooms = new MemoryMmRoomStore();
    const member = (slot: number, accountId: string) => ({
        slot,
        identityHash: `h${slot}`,
        accountId,
        joinedTick: 0,
        backfill: false,
        ratingAtStart: { r: 1500, rd: 200, sigma: 0.06 },
    });
    const foes = opts.foes ?? 2;
    const rec: MmRoomRecord = {
        _id: 'room1',
        queue: opts.queue ?? 'casual',
        mode: 'casual',
        ...(opts.queue === 'ranked' ? { season: 's1' } : {}),
        teams: [
            { species: 'cat', slots: [0, 1], difficulty: 'hard', rating: 1500 },
            { species: 'dog', slots: [3, 4].slice(0, foes), difficulty: 'hard', rating: 1500 },
        ],
        void: opts.voided ? 'remake' : null,
        region: 'eu',
        side: 'cat',
        difficulty: 'hard',
        sim: `${SIM_VERSION}:x`,
        fill: [2, 5],
        queueMs: {},
        members: [member(0, a), member(1, 'mate'), member(3, c), ...(foes > 1 ? [member(4, d)] : [])],
        createdAt: NOW,
        endedAt: NOW,
    };
    void mmRooms.create(rec);
    const ratings = new SocialMemoryModel([], [{ fields: ['_id'] }], () => NOW);
    if (opts.casualRow)
        ratings.docs.push({
            _id: `${a}:casual`,
            accountId: a,
            queue: 'casual',
            r: 1700,
            rd: 80,
            sigma: 0.06,
            games: 30,
            wins: 20,
            lastAt: NOW,
            appliedRooms: [],
            v: 3,
        });
    const boards = new SocialMemoryModel([], [{ fields: ['_id'] }], () => NOW);
    if (opts.dailyWins)
        boards.docs.push({
            _id: `w:${isoWeek(NOW)}:${a}`,
            kind: 'w',
            period: isoWeek(NOW),
            acc: a,
            wins: opts.dailyWins,
            games: opts.dailyWins,
            days: { '2026-11-12': opts.dailyWins },
            rooms: [],
        });
    const sanctions = new SocialMemoryModel(
        opts.sanction ? [{ accountId: a, kind: 'board_exclude', until: null }] : [],
        [],
        () => NOW
    );
    const deps = {
        users: users as any,
        games: games as any,
        rooms: store,
        now: () => NOW,
        logger: { warn: () => undefined, log: () => undefined },
        mm: { rooms: mmRooms, ratings, boards, sanctions },
    };
    const body = (slot: number, outcome: 'won' | 'lost') => ({
        pawlegends: { v: 2, room: 'room1', slot, simVersion: SIM_VERSION, ticks: 8000, outcome, finalHash: 'abcdef12' },
    });
    return {
        a,
        c,
        boards,
        ratings,
        save: (u: string, slot: number, outcome: 'won' | 'lost' = 'won') =>
            savePawlegendsPartyMatch(deps as any, u, body(slot, outcome) as any),
    };
}

describe('leaderboards through /live (SOCIAL-RANKED.md §6)', () => {
    it('a verified PvP win writes the weekly and hero rows once', async () => {
        const s = setup();
        await s.save(s.a, 0);
        const week = isoWeek(NOW);
        expect(s.boards.docs.find(d => d._id === `w:${week}:${s.a}`)).toMatchObject({
            kind: 'w',
            wins: 1,
            games: 1,
            rooms: ['room1'],
        });
        expect(s.boards.docs.find(d => d._id === `h:s1:clem:${s.a}`)).toMatchObject({
            kind: 'h',
            hero: 'clem',
            wins: 1,
        });
        await expect(s.save(s.a, 0)).rejects.toBeTruthy();
        expect(s.boards.docs.find(d => d._id === `w:${week}:${s.a}`)).toMatchObject({ wins: 1, games: 1 });
        // the loser counts a game
        await s.save(s.c, 3, 'lost');
        expect(s.boards.docs.find(d => d._id === `w:${week}:${s.c}`)).toMatchObject({ wins: 0, games: 1 });
    });

    it('no rows for a bot-majority foe team, a guest, a sanctioned account, or over the daily win cap', async () => {
        for (const opts of [{ foes: 1 }, { guest: true }, { sanction: true }, { dailyWins: 25 }]) {
            const s = setup(opts);
            await s.save(s.a, 0);
            expect([opts, s.boards.docs.filter(d => d.acc === s.a && d.rooms?.includes('room1')).length]).toEqual([
                opts,
                0,
            ]);
        }
    });
});

describe('ranked points through /live (SOCIAL-RANKED.md §7.3)', () => {
    it('a ranked room steps the ranked row (seeded from casual), placements first, and only once', async () => {
        const s = setup({ queue: 'ranked', casualRow: true });
        await s.save(s.a, 0);
        const row = s.ratings.docs.find(d => d._id === `${s.a}:ranked`);
        expect(row).toMatchObject({
            queue: 'ranked',
            season: 's1',
            placementsLeft: 4,
            tierIdx: 0,
            games: 1,
            appliedRooms: ['room1'],
        });
        expect(row!.rd).toBeLessThanOrEqual(200);
        expect(row!.r).toBeGreaterThan(1700);
        // the casual row is untouched
        expect(s.ratings.docs.find(d => d._id === `${s.a}:casual`)).toMatchObject({ games: 30 });
    });

    it('guests never get a ranked row', async () => {
        const s = setup({ queue: 'ranked', guest: true });
        await s.save(s.a, 0);
        expect(s.ratings.docs.find(d => String(d._id).endsWith(':ranked'))).toBeUndefined();
    });
});

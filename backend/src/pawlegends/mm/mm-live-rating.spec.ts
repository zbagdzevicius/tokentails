import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { SIM_VERSION } from '../../vendor/pawlegends-sim';
import { MemoryRoomStore, type StoredRoom } from '../party/room-store';
import { savePawlegendsPartyMatch, type PawlegendsRatingModel } from '../pawlegends-party-live';
import { MemoryMmRoomStore, type MmRoomRecord } from './mm-room.schema';

/* The hidden co-op rating through /live (M1A-IMPL.md §4.2): once per account per room, after the Game row. */

class FakeRatings implements PawlegendsRatingModel {
    rows = new Map<string, any>();
    fail = false;
    writes = 0;
    findById(id: string) {
        return { lean: async () => (this.rows.has(id) ? JSON.parse(JSON.stringify(this.rows.get(id))) : null) };
    }
    async create(doc: Record<string, unknown>) {
        if (this.fail) throw new Error('boom');
        if (this.rows.has(String(doc._id))) throw Object.assign(new Error('dup'), { code: 11000 });
        this.writes++;
        this.rows.set(String(doc._id), { ...doc });
    }
    async updateOne(filter: Record<string, any>, update: Record<string, any>) {
        if (this.fail) throw new Error('boom');
        const r = this.rows.get(filter._id);
        if (!r || r.v !== filter.v) return { modifiedCount: 0 };
        Object.assign(r, update.$set);
        r.v += update.$inc.v;
        this.writes++;
        return { modifiedCount: 1 };
    }
}

function setup(opts: { mm?: boolean; outcome?: 'won' | 'lost' } = {}) {
    const users = new FakeUsers();
    const games = new FakeGames();
    const a = users.add({});
    const b = users.add({});
    const now = new Date('2026-11-12T12:00:00Z');
    const room: StoredRoom = {
        _id: 'mmroom1',
        party: 'p1',
        simVersion: SIM_VERSION,
        simHash: 'x',
        config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0, 1] },
        occupants: [
            { slot: 0, accountId: a, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
            { slot: 1, accountId: b, guestKeyHash: null, name: 'Brave Paws', ticketed: true },
        ],
        chunks: [],
        lastTurn: 4000,
        lastSeq: [1, 1, 0],
        pilotTicks: { '0': {}, '1': {} },
        openUnclaimedAt1800: false,
        unscored: null,
        status: 'ended',
        verdict: {
            finalHash: 'abcdef12',
            outcome: opts.outcome ?? 'won',
            ticks: 8000,
            winner: 0,
            reason: 'core',
            verified: true,
        },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: now,
        updatedAt: now,
    };
    const store = new MemoryRoomStore();
    store.rooms.set(room._id, room);
    const mmRooms = new MemoryMmRoomStore();
    const rec: MmRoomRecord = {
        _id: 'mmroom1',
        queue: 'coop',
        region: 'eu',
        side: 'cat',
        difficulty: 'normal',
        sim: `${SIM_VERSION}:x`,
        fill: [2],
        queueMs: { '0': 4000, '1': 9000 },
        members: [
            {
                slot: 0,
                identityHash: 'ha',
                accountId: a,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: { r: 1550, rd: 300, sigma: 0.06 },
            },
            {
                slot: 1,
                identityHash: 'hb',
                accountId: b,
                joinedTick: 0,
                backfill: false,
                ratingAtStart: { r: 1350, rd: 300, sigma: 0.06 },
            },
        ],
        createdAt: now,
        endedAt: now,
    };
    void mmRooms.create(rec);
    const ratings = new FakeRatings();
    const deps = {
        users: users as any,
        games: games as any,
        rooms: store,
        now: () => new Date('2026-11-12T13:00:00Z'),
        logger: { warn: () => undefined, log: () => undefined },
        ...(opts.mm === false ? {} : { mm: { rooms: mmRooms, ratings } }),
    };
    const body = (slot: number) => ({
        pawlegends: {
            v: 2,
            room: 'mmroom1',
            slot,
            simVersion: SIM_VERSION,
            ticks: 8000,
            outcome: opts.outcome ?? 'won',
            finalHash: 'abcdef12',
        },
    });
    return {
        a,
        b,
        ratings,
        mmRooms,
        games,
        save: (u: string, slot: number) => savePawlegendsPartyMatch(deps as any, u, body(slot) as any),
    };
}

describe('Quick Play rating through /live', () => {
    it('an mm win creates the coop row once per account per room (a second post is a duplicate, no second step)', async () => {
        const s = setup();
        await s.save(s.a, 0);
        const row = s.ratings.rows.get(`${s.a}:coop`);
        expect(row).toMatchObject({ accountId: s.a, games: 1, wins: 1, appliedRooms: ['mmroom1'] });
        expect(row.r).toBeGreaterThan(1550);
        await expect(s.save(s.a, 0)).rejects.toBeDefined();
        expect(s.ratings.writes).toBe(1);
        await s.save(s.b, 1);
        expect(s.ratings.rows.get(`${s.b}:coop`).games).toBe(1);
    });

    it('an mm loss lowers the row; an existing row is updated with its version', async () => {
        const s = setup({ outcome: 'lost' });
        s.ratings.rows.set(`${s.a}:coop`, {
            _id: `${s.a}:coop`,
            accountId: s.a,
            queue: 'coop',
            r: 1600,
            rd: 100,
            sigma: 0.06,
            games: 10,
            wins: 6,
            lastAt: new Date('2026-11-11T12:00:00Z'),
            appliedRooms: [],
            v: 10,
        });
        await s.save(s.a, 0);
        const row = s.ratings.rows.get(`${s.a}:coop`);
        expect(row.r).toBeLessThan(1600);
        expect(row).toMatchObject({ games: 11, wins: 6, v: 11 });
    });

    it('a non-mm party room writes no rating; a failed rating write still returns the save', async () => {
        const plain = setup();
        plain.mmRooms.rooms.clear();
        await plain.save(plain.a, 0);
        expect(plain.ratings.rows.size).toBe(0);
        const noDeps = setup({ mm: false });
        await expect(noDeps.save(noDeps.a, 0)).resolves.toMatchObject({ party: true });
        const failing = setup();
        failing.ratings.fail = true;
        await expect(failing.save(failing.a, 0)).resolves.toMatchObject({ party: true, outcome: 'won' });
        expect(failing.games.rows.length).toBe(1);
    });
});

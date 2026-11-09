import { HttpException } from '@nestjs/common';
import { GameType } from 'src/game/game.schema';
import { liveGamePipe, LiveGameDto } from 'src/user/dto/live-game.dto';
import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS } from 'src/shared-contracts/caps';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { SIM_VERSION } from '../vendor/pawlegends-sim';
import { casualRatingStep } from './mm/rating-update';
import type { MmRoomRecord } from './mm/mm-room.schema';
import { MemoryRoomStore, type StoredRoom } from './party/room-store';
import { savePawlegendsPartyMatch } from './pawlegends-party-live';

/*
 * Casual PvP through /live (docs/plans/moba/V16.md §4.5, §4.6): the slot's own view of the verdict, the hard-tier
 * catnip, the casual rating once per account per room, and nothing for a voided (remade) room.
 */

const A = '64b0000000000000000000a1';
const B = '64b0000000000000000000b2';

function pvpRoom(over: Partial<StoredRoom> = {}): StoredRoom {
    const now = new Date('2026-11-12T12:00:00Z');
    return {
        _id: 'pvp1',
        party: 'p1',
        simVersion: SIM_VERSION,
        simHash: 'x',
        config: {
            seed: 1,
            picks: [],
            tricks: [],
            difficulty: 'hard',
            humans: [0, 3],
            mode: 'pvp',
            fillDifficulty: ['normal', 'normal'],
        },
        occupants: [
            { slot: 0, accountId: A, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true },
            { slot: 3, accountId: B, guestKeyHash: null, name: 'Brave Paws', ticketed: true },
        ],
        chunks: [],
        lastTurn: 4000,
        lastSeq: [1, 0, 0, 1, 0, 0],
        pilotTicks: {},
        openUnclaimedAt1800: true,
        unscored: null,
        status: 'ended',
        // team 0's view: team 0 lost, so team 1 (slot 3) won
        verdict: { finalHash: 'abcdef12', outcome: 'lost', ticks: 8000, winner: 1, reason: 'core', verified: true },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: now,
        updatedAt: now,
        ...over,
    };
}

function mmRoom(over: Partial<MmRoomRecord> = {}): MmRoomRecord {
    const g = { r: 1500, rd: 120, sigma: 0.06 };
    return {
        _id: 'pvp1',
        queue: 'casual',
        mode: 'casual',
        teams: [
            { species: 'cat', slots: [0], difficulty: 'normal', rating: 1500 },
            { species: 'dog', slots: [3], difficulty: 'normal', rating: 1500 },
        ],
        region: 'eu',
        side: 'cat',
        difficulty: 'hard',
        sim: '16:x',
        fill: [1, 2, 4, 5],
        queueMs: {},
        members: [
            { slot: 0, identityHash: 'ha', accountId: A, joinedTick: 0, backfill: false, ratingAtStart: g },
            { slot: 3, identityHash: 'hb', accountId: B, joinedTick: 0, backfill: false, ratingAtStart: g },
        ],
        createdAt: new Date('2026-11-12T12:00:00Z'),
        ...over,
    };
}

class Ratings {
    rows = new Map<string, Record<string, unknown>>();
    findById(id: string) {
        return { lean: async () => (this.rows.has(id) ? { ...this.rows.get(id)! } : null) };
    }
    async updateOne(f: Record<string, unknown>, u: { $set: Record<string, unknown>; $inc: { v: number } }) {
        const row = this.rows.get(f._id as string);
        if (!row || row.v !== f.v) return { modifiedCount: 0 };
        this.rows.set(f._id as string, { ...row, ...u.$set, v: (row.v as number) + 1 });
        return { modifiedCount: 1 };
    }
    async create(doc: Record<string, unknown>) {
        this.rows.set(doc._id as string, { ...doc });
    }
}

function setup(r: StoredRoom = pvpRoom(), mm: MmRoomRecord = mmRoom()) {
    const users = new FakeUsers();
    const games = new FakeGames();
    const a = users.add({});
    const b = users.add({});
    for (const o of r.occupants) o.accountId = o.accountId === A ? a : o.accountId === B ? b : o.accountId;
    for (const m of mm.members) m.accountId = m.accountId === A ? a : m.accountId === B ? b : m.accountId;
    const store = new MemoryRoomStore();
    store.rooms.set(r._id, r);
    const ratings = new Ratings();
    const deps = {
        users: users as any,
        games: games as any,
        rooms: store,
        now: () => new Date('2026-11-12T13:00:00Z'),
        logger: { warn: () => undefined, log: () => undefined },
        mm: { rooms: { get: async (id: string) => (id === mm._id ? mm : null) }, ratings },
    };
    const body = (slot: number, outcome: 'won' | 'lost') => ({
        pawlegends: {
            v: 2 as const,
            room: r._id,
            slot,
            simVersion: SIM_VERSION,
            ticks: 8000,
            outcome,
            finalHash: 'abcdef12',
        },
    });
    const save = (user: string, slot: number, outcome: 'won' | 'lost') =>
        savePawlegendsPartyMatch(deps as any, user, body(slot, outcome) as any);
    return { users, games, ratings, a, b, save };
}

const codeOf = async (p: Promise<unknown>) => {
    try {
        await p;
        return 'ok';
    } catch (e) {
        return (e as { response?: { code?: string } }).response?.code ?? String(e);
    }
};

describe('pawlegends party live: casual PvP', () => {
    const hard = PAWLEGENDS_LEVELS.indexOf('hard');

    it('a team-1 win is posted from the slot view: slot 3 "won", slot 0 "lost"; team 0\'s view is refused for slot 3', async () => {
        const s = setup();
        expect(await codeOf(s.save(s.b, 3, 'lost'))).toBe('PAWLEGENDS_REPLAY_INVALID');
        const won = await s.save(s.b, 3, 'won');
        // hard-tier catnip, never lowered by the open-seat rule (bots fill PvP seats by design)
        expect(won).toMatchObject({ outcome: 'won', difficulty: 'hard', catnipDifficulty: 'hard' });
        expect(won.catnipPaid).toBe(PAWLEGENDS_LEVEL_CAPS[hard]);
        const lost = await s.save(s.a, 0, 'lost');
        expect(lost).toMatchObject({ outcome: 'lost', catnipPaid: 0 });
        expect(await codeOf(s.save(s.a, 0, 'lost'))).toBe('PAWLEGENDS_DUPLICATE');
    });

    it('rates the casual row once per account per room, winner up and loser down, whatever the post order', async () => {
        const s = setup();
        await s.save(s.a, 0, 'lost');
        await s.save(s.b, 3, 'won');
        const ra = s.ratings.rows.get(`${s.a}:casual`)!;
        const rb = s.ratings.rows.get(`${s.b}:casual`)!;
        expect(ra.r as number).toBeLessThan(1500);
        expect(rb.r as number).toBeGreaterThan(1500);
        expect(rb.queue).toBe('casual');
        expect(s.ratings.rows.has(`${s.a}:coop`)).toBe(false);
        // the same room again: no second change
        const step = casualRatingStep({
            room: mmRoom(),
            accountId: s.b,
            won: true,
            row: rb as any,
            nowMs: Date.now(),
        });
        expect(step.skip).toBe('applied');
    });

    it('a voided (remade) room pays and rates nothing: it never ended', async () => {
        const s = setup(pvpRoom({ status: 'abandoned', void: 'remake', verdict: null }), mmRoom({ void: 'remake' }));
        expect(await codeOf(s.save(s.b, 3, 'won'))).toBe('PAWLEGENDS_PARTY_ROOM');
        expect(s.ratings.rows.size).toBe(0);
        expect(
            casualRatingStep({ room: mmRoom({ void: 'remake' }), accountId: 'x', won: true, row: null, nowMs: 0 }).skip
        ).toBe('void');
    });

    it('loss forgiveness: a teammate who left before 5:00 spares the loss; a bot-weighted opponent moves less', () => {
        const g = { r: 1500, rd: 120, sigma: 0.06 };
        const room = mmRoom({
            members: [
                { slot: 0, identityHash: 'a', accountId: 'a', joinedTick: 0, backfill: false, ratingAtStart: g },
                {
                    slot: 1,
                    identityHash: 'c',
                    accountId: 'c',
                    joinedTick: 0,
                    backfill: false,
                    ratingAtStart: g,
                    event: 'left',
                    eventTick: 3000,
                },
                { slot: 3, identityHash: 'b', accountId: 'b', joinedTick: 0, backfill: false, ratingAtStart: g },
                { slot: 4, identityHash: 'd', accountId: 'd', joinedTick: 0, backfill: false, ratingAtStart: g },
            ],
        });
        expect(casualRatingStep({ room, accountId: 'a', won: false, row: null, nowMs: 0 }).skip).toBe('forgiven');
        // b faces one human (a; c left but was there at the start: two humans), d the same: full weight is 3 humans
        const win2 = casualRatingStep({ room, accountId: 'b', won: true, row: null, nowMs: 0 }).row!;
        const solo = mmRoom();
        const win1 = casualRatingStep({
            room: solo,
            accountId: solo.members[1].accountId!,
            won: true,
            row: null,
            nowMs: 0,
        }).row!;
        // against 1 human + 2 bots the gain is weighted by 1/3; against 2 humans + 1 bot by 2/3
        expect(win1.r - 1500).toBeGreaterThan(0);
        expect(win2.r - 1500).toBeGreaterThan(win1.r - 1500);
    });
});

describe('the /live pipe takes a team-1 PvP slot', () => {
    const validate = (slot: number) =>
        liveGamePipe
            .transform(
                {
                    type: GameType.PAWLEGENDS,
                    pawlegends: {
                        v: 2,
                        room: 'pvp1',
                        slot,
                        simVersion: SIM_VERSION,
                        ticks: 9000,
                        outcome: 'won',
                        finalHash: 'abcdef12',
                    },
                },
                { type: 'body', metatype: LiveGameDto }
            )
            .then(
                () => 'ok',
                (error: HttpException) =>
                    `${error.getStatus()} ${(error.getResponse() as { code?: string }).code ?? ''}`
            );

    it('slots 0-9 pass the DTO (5v5 Classic; the room occupant check decides ownership); 10 and -1 do not', async () => {
        for (const slot of [0, 2, 3, 5, 6, 9]) expect(await validate(slot)).toBe('ok');
        expect(await validate(10)).toBe('400 PAWLEGENDS_REPLAY_INVALID');
        expect(await validate(-1)).toBe('400 PAWLEGENDS_REPLAY_INVALID');
    });
});

import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { MemoryRoomStore, type StoredRoom } from '../party/room-store';
import { savePawlegendsPartyMatch } from '../pawlegends-party-live';
import { SIM_VERSION } from '../../vendor/pawlegends-sim';

/*
 * CLUBS-KUDOS.md §4: the `/live` party save calls `applyClubChest` once, after the Game row exists, with the slot's
 * own outcome; a rejected save (a duplicate) never reaches it.
 */

function room(occupant: string): StoredRoom {
    const now = new Date('2026-11-12T12:00:00Z');
    return {
        _id: 'room1',
        party: 'p1',
        simVersion: SIM_VERSION,
        simHash: 'x',
        config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0] },
        occupants: [{ slot: 0, accountId: occupant, guestKeyHash: null, name: 'Sunny Tabby', ticketed: true }],
        chunks: [],
        lastTurn: 4000,
        lastSeq: [1, 0, 0],
        pilotTicks: { '0': { drop: 0, away: 0, afk: 0, late: 0, desync: 0, restore: 0, open: 0 } },
        openUnclaimedAt1800: false,
        unscored: null,
        status: 'ended',
        verdict: { finalHash: 'abcdef12', outcome: 'won', ticks: 8000, winner: 0, reason: 'core', verified: true },
        owner: 'boot',
        epoch: 0,
        handoff: false,
        resume: {},
        createdAt: now,
        updatedAt: now,
    };
}

describe('clubs: the /live party save fills the club chest', () => {
    it('calls applyClubChest once per verified save, after the Game row', async () => {
        const users = new FakeUsers();
        const games = new FakeGames();
        const a = users.add({});
        const store = new MemoryRoomStore();
        store.rooms.set('room1', room(a));
        const calls: Array<Record<string, unknown>> = [];
        const deps = {
            users: users as any,
            games: games as any,
            rooms: store,
            now: () => new Date('2026-11-12T13:00:00Z'),
            logger: { warn: () => undefined, log: () => undefined },
            clubs: {
                applyClubChest: async (input: Record<string, unknown>) => {
                    calls.push({ ...input, rows: games.rows.length });
                    return null;
                },
            },
        };
        const body = {
            pawlegends: {
                v: 2 as const,
                room: 'room1',
                slot: 0,
                simVersion: SIM_VERSION,
                ticks: 8000,
                outcome: 'won' as const,
                finalHash: 'abcdef12',
            },
        };
        await savePawlegendsPartyMatch(deps, a, body as any);
        await expect(savePawlegendsPartyMatch(deps, a, body as any)).rejects.toBeTruthy();
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ accountId: a, room: 'room1', won: true, rows: 1 });
    });
});

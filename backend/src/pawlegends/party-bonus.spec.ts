import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { SIM_VERSION } from 'src/vendor/pawlegends-sim';
import { buildHarness, NOW } from './pawlegends-harness.helper-spec';
import { PARTY_XP_BONUS, partyXpBonusPct, SEASON_XP, seasonXpFor } from './pawlegends-catalog';
import { partyMatesOf, premadeAtStart } from './party-bonus';
import { MemoryRoomStore, type StoredRoom } from './party/room-store';
import { PARTY_DAILY_CAP, savePawlegendsPartyMatch } from './pawlegends-party-live';
import { addSeasonXp, type SeasonXpMatch } from './pawlegends-season.service';

jest.mock('node-fetch', () => jest.fn());

/* PARTY-XP.md: the party XP bonus (+50% with one pre-made party mate, +75% with two or more), server side only. */

const ACCOUNT = 'acct-0000000000000001';
const ZERO = { drop: 0, away: 0, afk: 0, late: 0, desync: 0, restore: 0, open: 0 };

const occ = (slot: number, accountId: string | null, over: Record<string, unknown> = {}) => ({
    slot,
    accountId,
    guestKeyHash: null,
    name: `P${slot}`,
    ticketed: true,
    ...over,
});

describe('party XP bonus: the numbers', () => {
    it('is +50% with one party mate, +75% with two or more, 0 alone', () => {
        expect(partyXpBonusPct(0)).toBe(0);
        expect(partyXpBonusPct(-1)).toBe(0);
        expect(partyXpBonusPct(1)).toBe(PARTY_XP_BONUS.oneMate);
        expect(partyXpBonusPct(2)).toBe(PARTY_XP_BONUS.moreMates);
        expect(partyXpBonusPct(4)).toBe(75);
        expect(PARTY_XP_BONUS).toEqual({ oneMate: 50, moreMates: 75 });
    });

    it('multiplies the match part (result, takedowns, per-minute share); the first win of the day stays flat', () => {
        const win = { won: true, forfeit: false, takedowns: 3, firstWinToday: false };
        expect(seasonXpFor(win)).toBe(130);
        expect(seasonXpFor({ ...win, partyPct: 50 })).toBe(195);
        expect(seasonXpFor({ ...win, partyPct: 75 })).toBe(228);
        // the first win of the day is added after the bonus, unchanged
        expect(seasonXpFor({ ...win, firstWinToday: true, partyPct: 50 })).toBe(195 + SEASON_XP.firstWinOfDay);
        // a short mutator match: the per-minute share first, then the bonus
        expect(seasonXpFor({ ...win, ticks: SEASON_XP.refTicks / 2, partyPct: 50 })).toBe(98);
        // a forfeit still gets its small amount boosted (it was a paid match)
        expect(seasonXpFor({ won: false, forfeit: true, takedowns: 0, firstWinToday: false, partyPct: 50 })).toBe(30);
        // a bad percent is clamped (never more than double, never negative)
        expect(seasonXpFor({ ...win, partyPct: 900 })).toBe(260);
        expect(seasonXpFor({ ...win, partyPct: -5 })).toBe(130);
    });
});

describe('party XP bonus: pre-made groups at the room start (relay)', () => {
    it("a friends' own party room is one group of every member", () => {
        expect(
            premadeAtStart({
                members: [
                    { id: 'a', slot: 0 },
                    { id: 'b', slot: 2 },
                    { id: 'c', slot: 1 },
                ],
            })
        ).toEqual([[0, 1, 2]]);
        // a party of one has no group
        expect(premadeAtStart({ members: [{ id: 'a', slot: 0 }] })).toEqual([]);
    });

    it('Quick Play co-op keeps only the hosting friend party, never the strangers it was matched with', () => {
        expect(
            premadeAtStart({
                members: [
                    { id: 'a', slot: 0 },
                    { id: 'b', slot: 1 },
                    { id: 's', slot: 2 },
                ],
                mm: { strangers: new Set(['s']), host: true },
            })
        ).toEqual([[0, 1]]);
        // a party of strangers (no host) has none
        expect(
            premadeAtStart({
                members: [
                    { id: 'a', slot: 0 },
                    { id: 'b', slot: 1 },
                ],
                mm: { strangers: new Set(['a', 'b']), host: false },
            })
        ).toEqual([]);
    });

    it("casual PvP uses the matchmaker's groups (groups of one are dropped)", () => {
        expect(
            premadeAtStart({
                members: [],
                mm: { strangers: new Set(), host: false, casual: { premade: [[4, 3], [0], [1, 2, 1]] } },
            })
        ).toEqual([
            [3, 4],
            [1, 2],
        ]);
    });
});

describe('party XP bonus: who counts as a party mate (writer)', () => {
    const base = {
        premade: [[0, 1, 2]],
        occupants: [occ(0, 'a'), occ(1, 'b'), occ(2, 'c')],
        pilotTicks: { '0': ZERO, '1': ZERO, '2': ZERO },
    };

    it('counts the other humans of the slot group', () => {
        expect(partyMatesOf(base, 0, 8000)).toBe(2);
        expect(partyMatesOf({ ...base, premade: [[0, 1]] }, 0, 8000)).toBe(1);
        expect(partyMatesOf({ ...base, premade: [[0, 1]] }, 2, 8000)).toBe(0);
    });

    it('a room made before the bonus (no premade) pays none', () => {
        expect(partyMatesOf({ ...base, premade: undefined }, 0, 8000)).toBe(0);
        expect(partyMatesOf({ ...base, premade: 'x' }, 0, 8000)).toBe(0);
    });

    it('a mate flown by a bot for more than half the match does not count', () => {
        const ticks = { ...base.pilotTicks, '1': { ...ZERO, drop: 3000, afk: 1001 } };
        expect(partyMatesOf({ ...base, pilotTicks: ticks }, 0, 8000)).toBe(1);
        // exactly half still counts (the same rule as the save's AFK gate)
        const half = { ...base.pilotTicks, '1': { ...ZERO, away: 4000 } };
        expect(partyMatesOf({ ...base, pilotTicks: half }, 0, 8000)).toBe(2);
    });

    it('the same account or guest key in two seats, an unticketed seat or a bot seat is no mate', () => {
        expect(partyMatesOf({ ...base, occupants: [occ(0, 'a'), occ(1, 'a'), occ(2, 'c')] }, 0, 8000)).toBe(1);
        expect(
            partyMatesOf(
                {
                    ...base,
                    occupants: [
                        occ(0, null, { guestKeyHash: 'g1' }),
                        occ(1, null, { guestKeyHash: 'g1' }),
                        occ(2, null, { guestKeyHash: 'g2' }),
                    ],
                },
                0,
                8000
            )
        ).toBe(1);
        expect(partyMatesOf({ ...base, occupants: [occ(0, 'a'), occ(1, 'b', { ticketed: false })] }, 0, 8000)).toBe(0);
        expect(partyMatesOf({ ...base, occupants: [occ(0, 'a')] }, 0, 8000)).toBe(0);
    });
});

describe('party XP bonus: Season XP and its caps', () => {
    const match: SeasonXpMatch = { won: false, forfeit: false, takedowns: 2 };

    it('pays the bonus inside `gained` and reports it', async () => {
        const h = buildHarness();
        const solo = await addSeasonXp(h.store, ACCOUNT, match, NOW);
        expect(solo!.gained).toBe(80);
        expect(solo!.partyBonus).toBeUndefined();
        const duo = await addSeasonXp(h.store, ACCOUNT, { ...match, partyMates: 1 }, NOW);
        expect(duo!.gained).toBe(120);
        expect(duo!.partyBonus).toEqual({ mates: 1, pct: 50, xp: 40 });
        const trio = await addSeasonXp(h.store, ACCOUNT, { ...match, partyMates: 2 }, NOW);
        expect(trio!.gained).toBe(140);
        expect(trio!.partyBonus).toEqual({ mates: 2, pct: 75, xp: 60 });
        expect(trio!.xp).toBe(80 + 120 + 140);
    });

    it('the first win of the day is not boosted', async () => {
        const h = buildHarness();
        const g = await addSeasonXp(h.store, ACCOUNT, { won: true, forfeit: false, takedowns: 0, partyMates: 1 }, NOW);
        expect(g!.gained).toBe(150 + SEASON_XP.firstWinOfDay);
        expect(g!.partyBonus).toEqual({ mates: 1, pct: 50, xp: 50 });
    });

    it('a match over the daily cap pays nothing, bonus included (the cap counts matches, so it is not raised)', async () => {
        const h = buildHarness();
        const g = await addSeasonXp(h.store, ACCOUNT, { ...match, capped: true, partyMates: 2 }, NOW);
        expect(g!.gained).toBe(0);
        expect(g!.partyBonus).toBeUndefined();
    });
});

describe('party XP bonus: the /live party writer', () => {
    const now = new Date('2026-11-12T12:00:00Z');
    function room(over: Partial<StoredRoom> = {}): StoredRoom {
        return {
            _id: 'room1',
            party: 'p1',
            simVersion: SIM_VERSION,
            simHash: 'x',
            config: { seed: 1, picks: [], tricks: [], difficulty: 'normal', humans: [0, 1] },
            occupants: [occ(0, 'A'), occ(1, 'B')],
            chunks: [],
            lastTurn: 4000,
            lastSeq: [1, 1, 0],
            pilotTicks: { '0': ZERO, '1': ZERO },
            openUnclaimedAt1800: false,
            premade: [[0, 1]],
            unscored: null,
            status: 'ended',
            verdict: { finalHash: 'abcdef12', outcome: 'won', ticks: 8000, winner: 0, reason: 'core', verified: true },
            owner: 'boot',
            epoch: 0,
            handoff: false,
            resume: {},
            createdAt: now,
            updatedAt: now,
            ...over,
        };
    }
    function setup(r: StoredRoom, ended = 1) {
        const users = new FakeUsers();
        const games = new FakeGames();
        const ids = { A: users.add({}), B: users.add({}) } as Record<string, string>;
        for (const o of r.occupants) o.accountId = ids[o.accountId ?? ''] ?? o.accountId;
        const store = new MemoryRoomStore();
        store.rooms.set(r._id, r);
        const seen: SeasonXpMatch[] = [];
        const deps = {
            users: users as any,
            games: games as any,
            rooms: { get: (id: string) => store.get(id), countEnded: async () => ended },
            season: {
                addXp: async (_id: string, m: SeasonXpMatch) => {
                    seen.push(m);
                    return null;
                },
            } as any,
            now: () => new Date('2026-11-12T13:00:00Z'),
            logger: { warn: () => undefined, log: () => undefined },
        };
        const body = (slot: number) => ({
            pawlegends: {
                v: 2 as const,
                room: r._id,
                slot,
                simVersion: SIM_VERSION,
                ticks: 8000,
                outcome: 'won' as const,
                finalHash: 'abcdef12',
            },
        });
        return {
            ids,
            seen,
            save: (who: string, slot: number) => savePawlegendsPartyMatch(deps, ids[who], body(slot) as any),
        };
    }

    it('passes the party mates from the stored room to Season XP', async () => {
        const s = setup(room());
        await s.save('A', 0);
        expect(s.seen[0]).toMatchObject({ partyMates: 1, capped: false });
    });

    it('a matched stranger (no pre-made group) gets no bonus', async () => {
        const s = setup(room({ premade: [] }));
        await s.save('A', 0);
        expect(s.seen[0]).toMatchObject({ partyMates: 0 });
    });

    it('over the daily cap the match is capped (Season XP pays 0, so no bonus either)', async () => {
        const s = setup(room(), PARTY_DAILY_CAP + 1);
        await s.save('A', 0);
        expect(s.seen[0]).toMatchObject({ capped: true, partyMates: 1 });
    });
});

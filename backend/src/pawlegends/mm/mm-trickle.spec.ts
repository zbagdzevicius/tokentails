import { Matchmaker, type MmEntry, type MmMatch, type MmMember } from './matchmaker';
import { MM_CASUAL, MM_CLASSIC, MM_LIMITS, MM_RANKED, trickleBots } from './mm-limits';

/*
 * Bots trickle in (founder, 2026-11-17): no bot seat before 17 s, then exactly one every 3 s, players first, a full
 * match at once. Fake clock, pure matchmaker.
 */

let n = 0;
const member = (key: string): MmMember => ({
    member: `m-${key}`,
    identityKey: `acct:${key}`,
    accountId: key,
    ipKey: `ip-${key}`,
    netKey: `net-${key}`,
    rating: { r: 1500, rd: 100 },
    newbie: false,
    maxDifficulty: null,
});
const entry = (clock: { now: number }, key: string, queue: 'casual' | 'classic' = 'casual'): MmEntry => ({
    id: `t${++n}`,
    partyId: null,
    members: [member(key)],
    queue,
    side: 'any',
    region: 'eu',
    sim: queue === 'classic' ? '19:abc' : '16:abc',
    enqueuedMs: clock.now,
    notBeforeMs: 0,
    awaySinceMs: null,
});

function make() {
    const clock = { now: 1_000_000 };
    let ids = 0;
    const mm = new Matchmaker(
        () => clock.now,
        () => `id${String(++ids).padStart(10, '0')}`
    );
    /** Ticks until `ms` after the start; the matches formed, each with the ms it formed at. */
    const start = clock.now;
    const until = (ms: number): { at: number; m: MmMatch }[] => {
        const out: { at: number; m: MmMatch }[] = [];
        while (clock.now - start < ms) {
            clock.now += MM_LIMITS.tickMs;
            for (const m of mm.tick().matches) out.push({ at: clock.now - start, m });
        }
        return out;
    };
    return { clock, mm, until };
}

describe('bot trickle', () => {
    it('no bot seat before 17 s, then exactly one every 3 s', () => {
        expect(trickleBots(0, MM_CASUAL)).toBe(0);
        expect(trickleBots(16_999, MM_CASUAL)).toBe(0);
        expect(trickleBots(17_000, MM_CASUAL)).toBe(1);
        expect(trickleBots(19_999, MM_CASUAL)).toBe(1);
        expect(trickleBots(20_000, MM_CASUAL)).toBe(2);
        expect(trickleBots(23_000, MM_CASUAL)).toBe(3);
        expect(trickleBots(26_000, MM_CASUAL)).toBe(4);
        expect(trickleBots(20_000, MM_CLASSIC)).toBe(2);
        // a 1v1 is full at the last bot seat: 4 bots on Purrhaven, 8 on Hearthwood
        expect(trickleBots(MM_CASUAL.fillMs, MM_CASUAL)).toBe(4);
        expect(trickleBots(MM_CASUAL.fillMs - 1, MM_CASUAL)).toBe(3);
        expect(trickleBots(MM_CLASSIC.fillMs, MM_CLASSIC)).toBe(8);
        expect(trickleBots(MM_CLASSIC.fillMs - 1, MM_CLASSIC)).toBe(7);
        // ranked keeps its one fill (the points rule)
        expect(trickleBots(MM_RANKED.fillMs - 1, MM_RANKED)).toBe(0);
        expect(trickleBots(MM_RANKED.fillMs, MM_RANKED)).toBe(Number.POSITIVE_INFINITY);
    });

    it.each([
        [5, 17_000, 1],
        [4, 20_000, 2],
        [3, 23_000, 3],
        [2, 26_000, 4],
    ])('%i players: the match forms the moment the bot seats fill the rest (%i ms, %i bots)', (humans, at, bots) => {
        const { clock, mm, until } = make();
        for (let i = 0; i < humans; i++) mm.join(entry(clock, `p${i}`));
        const out = until(30_000);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(at);
        expect(out[0].m).toMatchObject({ mode: 'casual', humans, bots });
    });

    it('a player arriving at 19 s takes a seat and the schedule goes on from the first search', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'a'));
        mm.join(entry(clock, 'b'));
        expect(until(19_000)).toHaveLength(0);
        mm.join(entry(clock, 'c'));
        const out = until(30_000);
        expect(out).toHaveLength(1);
        // three players need three bot seats: the third opens at 23 s
        expect(out[0].at).toBe(23_000);
        expect(out[0].m).toMatchObject({ humans: 3, bots: 3 });
        expect(out[0].m.members.slice().sort()).toEqual(['m-a', 'm-b', 'm-c']);
    });

    it('a full match starts at once, before and during the trickle', () => {
        const one = make();
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) one.mm.join(entry(one.clock, k));
        const first = one.until(500);
        expect(first).toHaveLength(1);
        expect(first[0].m).toMatchObject({ humans: 6, bots: 0 });

        const two = make();
        two.mm.join(entry(two.clock, 'a'));
        two.mm.join(entry(two.clock, 'b'));
        expect(two.until(21_000)).toHaveLength(0);
        for (const k of ['c', 'd', 'e', 'f']) two.mm.join(entry(two.clock, k));
        const out = two.until(21_500);
        expect(out).toHaveLength(1);
        expect(out[0].m).toMatchObject({ humans: 6, bots: 0 });
    });

    it('5v5 Classic trickles the same way: a 1v1 gets its 8th bot seat at 38 s', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'a', 'classic'));
        mm.join(entry(clock, 'b', 'classic'));
        const out = until(45_000);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(MM_CLASSIC.fillMs);
        expect(out[0].m).toMatchObject({ map: 'hearthwood', humans: 2, bots: 8 });
    });
});

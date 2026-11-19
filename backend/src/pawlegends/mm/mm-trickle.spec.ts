import { Matchmaker, type MmEntry, type MmMatch, type MmMember } from './matchmaker';
import { MM_CASUAL, MM_CLASSIC, MM_LIMITS, MM_RANKED, trickleBots } from './mm-limits';

/*
 * Bots trickle in (founder, 2026-11-19: "add a bot / 3s from 3s, not from 17s"): no bot seat before 3 s, then exactly
 * one every 3 s, players first, a full match at once; casual 3v3 fills a whole team of bots, so a lone search is seated
 * at 15 s. Fake clock, pure matchmaker.
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
    it('no bot seat before 3 s, then exactly one every 3 s', () => {
        expect(trickleBots(0, MM_CASUAL)).toBe(0);
        expect(trickleBots(2999, MM_CASUAL)).toBe(0);
        expect(trickleBots(3000, MM_CASUAL)).toBe(1);
        expect(trickleBots(5999, MM_CASUAL)).toBe(1);
        expect(trickleBots(6000, MM_CASUAL)).toBe(2);
        expect(trickleBots(9000, MM_CASUAL)).toBe(3);
        expect(trickleBots(12_000, MM_CASUAL)).toBe(4);
        expect(trickleBots(15_000, MM_CASUAL)).toBe(5);
        expect(trickleBots(6000, MM_CLASSIC)).toBe(2);
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
        [5, 3000, 1],
        [4, 6000, 2],
        [3, 9000, 3],
        [2, 12_000, 4],
        [1, 15_000, 5],
    ])('%i players: the match forms the moment the bot seats fill the rest (%i ms, %i bots)', (humans, at, bots) => {
        const { clock, mm, until } = make();
        for (let i = 0; i < humans; i++) mm.join(entry(clock, `p${i}`));
        const out = until(30_000);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(at);
        expect(out[0].m).toMatchObject({ mode: 'casual', humans, bots });
    });

    it('a lone search plays a team of bots at 15 s: its own team filled first, never moved to co-op', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'solo'));
        expect(until(14_500)).toHaveLength(0);
        const out = until(15_000);
        expect(out).toHaveLength(1);
        const m = out[0].m;
        expect(m).toMatchObject({ mode: 'casual', queue: 'casual', humans: 1, bots: 5 });
        expect(m.teams!.map(t => t.humans).sort()).toEqual([0, 1]);
        expect(m.teams!.find(t => t.humans === 1)!.bots).toBe(2);
        expect(m.teams!.find(t => t.humans === 0)!.bots).toBe(3);
    });

    it('a player arriving at 5 s takes a seat and the schedule goes on from the first search', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'a'));
        mm.join(entry(clock, 'b'));
        expect(until(5000)).toHaveLength(0);
        mm.join(entry(clock, 'c'));
        const out = until(30_000);
        expect(out).toHaveLength(1);
        // three players need three bot seats: the third opens at 9 s
        expect(out[0].at).toBe(9000);
        expect(out[0].m).toMatchObject({ humans: 3, bots: 3 });
        expect(out[0].m.members.slice().sort()).toEqual(['m-a', 'm-b', 'm-c']);
    });

    it('players first: a second player before 15 s turns a lone search into a 1v1, never two bot matches', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'a'));
        expect(until(11_000)).toHaveLength(0);
        mm.join(entry(clock, 'b'));
        // a 1v1 needs four bot seats (open since 12 s): it forms at 12 s, before a's bot team at 15 s
        const out = until(30_000);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(12_000);
        expect(out[0].m.teams!.map(t => t.humans)).toEqual([1, 1]);
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
        expect(two.until(5000)).toHaveLength(0);
        for (const k of ['c', 'd', 'e', 'f']) two.mm.join(entry(two.clock, k));
        const out = two.until(5500);
        expect(out).toHaveLength(1);
        expect(out[0].m).toMatchObject({ humans: 6, bots: 0 });
    });

    it('5v5 Classic trickles the same way: a 1v1 gets its 8th bot seat at 24 s, a lone search keeps waiting', () => {
        const { clock, mm, until } = make();
        mm.join(entry(clock, 'a', 'classic'));
        mm.join(entry(clock, 'b', 'classic'));
        const out = until(45_000);
        expect(out).toHaveLength(1);
        expect(out[0].at).toBe(MM_CLASSIC.fillMs);
        expect(out[0].m).toMatchObject({ map: 'hearthwood', humans: 2, bots: 8 });
        const lone = make();
        lone.mm.join(entry(lone.clock, 'c', 'classic'));
        expect(lone.until(60_000)).toHaveLength(0);
    });

    it('the queue estimate is the moment the trickle seats the entry (15 s alone, 9 s for a trio)', () => {
        const { clock, mm } = make();
        const e = entry(clock, 'solo');
        mm.join(e);
        expect(mm.status(e.id)!.estimateMs).toBe(15_000);
        const trio: MmEntry = { ...entry(clock, 'x'), members: [member('x'), member('y'), member('z')], partyId: 'p1' };
        mm.join(trio);
        expect(mm.status(trio.id)!.estimateMs).toBe(10_000);
    });
});

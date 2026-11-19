import { BOT_RATING, casualWindow, effectiveRating, shapeRank, team0SpeciesNext, winChance } from './casual';
import { Matchmaker, type MmEntry, type MmMember, type MmMatch } from './matchmaker';
import { MM_CASUAL, MM_LIMITS } from './mm-limits';

/* Casual PvP matchmaking (docs/plans/moba/V16.md §4.1, §4.6) on a fake clock: pure, deterministic, no sockets. */

let n = 0;
function member(key: string, over: Partial<MmMember> = {}): MmMember {
    return {
        member: `m-${key}`,
        identityKey: `acct:${key}`,
        accountId: key,
        ipKey: `ip-${key}`,
        netKey: `net-${key}`,
        rating: { r: 1500, rd: 100 },
        newbie: false,
        maxDifficulty: null,
        ...over,
    };
}

function entry(clock: { now: number }, keys: (string | MmMember)[], over: Partial<MmEntry> = {}): MmEntry {
    const members = keys.map(k => (typeof k === 'string' ? member(k) : k));
    return {
        id: `c${++n}`,
        partyId: members.length > 1 ? `p${n}` : null,
        members,
        queue: 'casual',
        side: 'any',
        region: 'eu',
        sim: '16:abc',
        enqueuedMs: clock.now,
        notBeforeMs: 0,
        awaySinceMs: null,
        ...over,
    };
}

function make() {
    const clock = { now: 1_000_000 };
    let ids = 0;
    const mm = new Matchmaker(
        () => clock.now,
        () => `id${String(++ids).padStart(10, '0')}`
    );
    const advance = (ms: number) => {
        const out = [];
        for (let t = 0; t < ms; t += MM_LIMITS.tickMs) {
            clock.now += MM_LIMITS.tickMs;
            out.push(mm.tick());
        }
        return out;
    };
    return { clock, mm, advance };
}

const matchesOf = (ticks: ReturnType<Matchmaker['tick']>[]): MmMatch[] => ticks.flatMap(t => t.matches);
const teamOf = (m: MmMatch, memberId: string): 0 | 1 => (m.teams![0].members.includes(memberId) ? 0 : 1);

describe('casual PvP matchmaker', () => {
    it('six solos form a 3v3 at once: two teams, one species each, slots 0..2 and 3..5', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) expect(mm.join(entry(clock, [k]))).toBe('ok');
        const [m] = matchesOf(advance(500));
        expect(m.mode).toBe('casual');
        expect(m.teams!.map(t => t.humans)).toEqual([3, 3]);
        expect(m.teams![0].species).not.toBe(m.teams![1].species);
        expect(m.members).toHaveLength(6);
        expect(m.fill).toBeNull();
        expect(m.difficulty).toBe('hard');
        expect(mm.size).toBe(0);
    });

    it('a trio queues casual (and never co-op); a trio party faces a trio party, else a team of bots at 9 s', () => {
        const { clock, mm, advance } = make();
        expect(mm.join(entry(clock, ['t1', 't2', 't3'], { queue: 'coop' }))).toBe('bad_entry');
        expect(mm.join(entry(clock, ['a1', 'a2', 'a3']))).toBe('ok');
        expect(matchesOf(advance(5000))).toHaveLength(0);
        mm.join(entry(clock, ['b1', 'b2', 'b3']));
        const [m] = matchesOf(advance(500));
        expect(m.teams!.map(t => t.humans)).toEqual([3, 3]);
        expect(m.teams!.map(t => t.entries.length)).toEqual([1, 1]);
        // a lone trio with three solos waiting: parties face parties until 40 s, so the trio plays bots at 9 s
        const two = make();
        const trio = entry(two.clock, ['c1', 'c2', 'c3']);
        two.mm.join(trio);
        for (const k of ['s1', 's2', 's3']) two.mm.join(entry(two.clock, [k]));
        const out = matchesOf(two.advance(9000));
        const vsBots = out.find(x => x.entries.includes(trio.id))!;
        expect(vsBots.teams!.map(t => t.humans).sort()).toEqual([0, 3]);
        expect(out.every(x => x.mode === 'casual')).toBe(true);
    });

    it('never puts the same address on opposite teams (teammates are fine)', () => {
        const { clock, mm, advance } = make();
        const shared = 'ip-home';
        mm.join(entry(clock, [member('x', { ipKey: shared })]));
        mm.join(entry(clock, [member('y', { ipKey: shared })]));
        // two lone players from one home: no 1v1, they play together against a team of bots (four bot seats, 12 s)
        const [home] = matchesOf(advance(MM_CASUAL.fillMs));
        expect(home.teams!.map(t => t.humans).sort()).toEqual([0, 2]);
        expect(teamOf(home, 'm-x')).toBe(teamOf(home, 'm-y'));
        // with two more players: each home player gets an opponent, and the home stays on one team
        const two = make();
        two.mm.join(entry(two.clock, [member('x', { ipKey: shared })]));
        two.mm.join(entry(two.clock, [member('y', { ipKey: shared })]));
        two.mm.join(entry(two.clock, ['p']));
        two.mm.join(entry(two.clock, ['q']));
        const [m] = matchesOf(two.advance(MM_CASUAL.fillMs));
        expect(m.humans).toBe(4);
        expect(teamOf(m, 'm-x')).toBe(teamOf(m, 'm-y'));
    });

    it('prefers symmetric fills: four humans become 2v2 plus a bot each at the second bot seat (6 s), not 3v1', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c', 'd']) mm.join(entry(clock, [k]));
        expect(matchesOf(advance(5500))).toHaveLength(0);
        const [m] = matchesOf(advance(500));
        expect(m.teams!.map(t => t.humans)).toEqual([2, 2]);
        expect(m.teams!.map(t => t.bots)).toEqual([1, 1]);
        expect(m.fill).not.toBeNull();
    });

    it('a lone human never faces three humans while a 2-human team can still form (15 s after the fill)', () => {
        expect(shapeRank(3, 1)).toBeGreaterThan(shapeRank(2, 1));
        expect(shapeRank(2, 2)).toBeLessThan(shapeRank(3, 2));
        const { clock, mm, advance } = make();
        // a trio party and a solo: 3v1 (two bot seats) is held back; the trio plays bots at 9 s, and a second solo
        // that arrives in time gives the first one a 1v1 at 12 s
        const trio = entry(clock, ['t1', 't2', 't3']);
        mm.join(trio);
        const s = entry(clock, ['s']);
        mm.join(s);
        const early = matchesOf(advance(8500));
        expect(early).toHaveLength(0);
        mm.join(entry(clock, ['s2']));
        const out = matchesOf(advance(MM_CASUAL.switchMs));
        expect(out.some(x => x.humans === 4)).toBe(false);
        expect(
            out
                .find(x => x.entries.includes(trio.id))!
                .teams!.map(t => t.humans)
                .sort()
        ).toEqual([0, 3]);
        expect(out.find(x => x.entries.includes(s.id))!.teams!.map(t => t.humans)).toEqual([1, 1]);
    });

    it('widens the rating window with the wait: 75 + 12/s, capped at 400', () => {
        const { clock, mm, advance } = make();
        const e = entry(clock, [member('a', { rating: { r: 1500, rd: 50 } })]);
        expect(casualWindow([e], 0)).toBe(75);
        expect(casualWindow([e], 10_000)).toBe(195);
        expect(casualWindow([e], 100_000)).toBe(400);
        mm.join(e);
        mm.join(entry(clock, [member('b', { rating: { r: 1950, rd: 50 } })]));
        // 450 apart: never inside the 400 cap, so never opponents in a 1v1 (as teammates against a fair team of bots
        // they may play: the window bounds the two teams' means, as in a 2v2)
        const ms = matchesOf(advance(MM_CASUAL.switchMs + 1000));
        expect(ms.length).toBeGreaterThan(0);
        for (const m of ms) expect(m.teams!.every(t => t.humans === 0 || t.humans === m.humans)).toBe(true);
    });

    it('honours a side request: six players who all asked for cats play cats against bots rather than as dogs', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) mm.join(entry(clock, [k], { side: 'cat' }));
        // no 3v3 (one team would have to be dogs): two trios of cats against teams of bots at the third bot seat
        expect(matchesOf(advance(8500))).toHaveLength(0);
        const ms = matchesOf(advance(500));
        expect(ms).toHaveLength(2);
        for (const m of ms) {
            const humans = m.teams!.find(t => t.humans === 3)!;
            expect(humans.species).toBe('cat');
        }
    });

    it('alternates the species on the left (team 0) per pool', () => {
        expect(team0SpeciesNext([])).toBe('cat');
        expect(team0SpeciesNext(['cat'])).toBe('dog');
        expect(team0SpeciesNext(['cat', 'dog'])).toBe('cat');
        const { clock, mm, advance } = make();
        const left: string[] = [];
        for (let round = 0; round < 4; round++) {
            for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) mm.join(entry(clock, [`${k}${round}`]));
            const [m] = matchesOf(advance(500));
            left.push(m.teams![0].species);
        }
        expect(left).toEqual(['cat', 'dog', 'cat', 'dog']);
    });

    it('moves a search no fair plan takes to co-op at 40 s (wait credited, a short Keep-waiting grace); Keep waiting puts it back', () => {
        // far above the Hard bots (2400 vs 1800): no fair team of bots, so the co-op switch is the safety net
        const strong = { rating: { r: 2400, rd: 50 } };
        const { clock, mm, advance } = make();
        const e = entry(clock, [member('solo', strong)]);
        mm.join(e);
        const ticks = advance(MM_CASUAL.switchMs);
        expect(matchesOf(ticks)).toHaveLength(0);
        const switched = ticks.flatMap(t => t.switched);
        expect(switched.map(x => x.id)).toEqual([e.id]);
        expect(mm.entry(e.id)!.queue).toBe('coop');
        // within the grace: still waiting; Keep waiting back to casual, never switched again
        expect(mm.keepCasual(e.id)).toBe(true);
        expect(mm.entry(e.id)!.queue).toBe('casual');
        expect(advance(60_000).flatMap(t => [...t.switched, ...t.matches])).toHaveLength(0);
        // without Keep waiting the co-op fill seats it once the grace is over (a fresh pool)
        const two = make();
        const f = entry(two.clock, [member('solo2', strong)]);
        two.mm.join(f);
        const later = two.advance(MM_CASUAL.switchMs + MM_CASUAL.switchGraceMs + 1000);
        const coop = matchesOf(later);
        expect(coop).toHaveLength(1);
        expect(coop[0].mode).toBeUndefined();
        expect(coop[0].entries).toEqual([f.id]);
    });

    it('protects wide-RD players: they play together until 45 s', () => {
        const { clock, mm, advance } = make();
        const wide = { r: 1500, rd: MM_CASUAL.protectedRd + 20 };
        for (const k of ['a', 'b', 'c']) mm.join(entry(clock, [member(k, { rating: wide })]));
        for (const k of ['d', 'e', 'f']) mm.join(entry(clock, [k]));
        // 3 + 3 across the pools: no 3v3 (each pool alone only has three; each fills its own 1v2 with bots)
        const out = matchesOf(advance(MM_CASUAL.fillMs));
        expect(out.some(m => m.humans === 6)).toBe(false);
        for (const m of out) {
            const keys = m.members.map(x => x.slice(2));
            expect(keys.every(k => 'abc'.includes(k)) || keys.every(k => 'def'.includes(k))).toBe(true);
        }
    });

    it('both teams get the same fill bots, from the mean of every human (1295 v 1305 is not easy v normal)', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, [member('lo', { rating: { r: 1295, rd: 60 } })]));
        mm.join(entry(clock, [member('hi', { rating: { r: 1305, rd: 60 } })]));
        const [m] = matchesOf(advance(MM_CASUAL.fillMs + 1000));
        expect(m.teams!.map(t => t.humans)).toEqual([1, 1]);
        expect(m.teams!.map(t => t.difficulty)).toEqual(['normal', 'normal']);
    });

    it('a filled match is judged with its bots: a 1v1 the 400-point window allows but predicted outside 35..65 % waits', () => {
        expect(winChance(effectiveRating([], BOT_RATING.normal), BOT_RATING.normal)).toBeCloseTo(0.5);
        const { clock, mm, advance } = make();
        mm.join(entry(clock, [member('lo', { rating: { r: 1200, rd: 60 } })]));
        mm.join(entry(clock, [member('hi', { rating: { r: 1600, rd: 60 } })]));
        // never against each other (1200 + 2 bots vs 1600 + 2 bots is 33 %): teammates against a fair team of bots
        const out = matchesOf(advance(MM_CASUAL.switchMs - 1000));
        expect(out.length).toBeGreaterThan(0);
        for (const m of out) expect(m.teams!.every(t => t.humans === 0 || t.humans === m.humans)).toBe(true);
    });

    it('a co-op entry never joins a casual match and the other way round', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, ['a'], { queue: 'coop', sim: '16:abc' }));
        mm.join(entry(clock, ['b']));
        const out = matchesOf(advance(MM_CASUAL.fillMs + 1000));
        expect(out.filter(m => m.mode === 'casual')).toHaveLength(0);
        expect(out.filter(m => !m.mode).flatMap(m => m.members)).toEqual(['m-a']);
    });
});

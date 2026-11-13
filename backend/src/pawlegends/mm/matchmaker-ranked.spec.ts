import { Matchmaker, maxPartyOf, type MmEntry, type MmMember, type MmMatch } from './matchmaker';
import { MM_LIMITS, MM_RANKED } from './mm-limits';

/*
 * The ranked pool (gap plan P4, SOCIAL-RANKED.md §7.1) on a fake clock: 3v3, solo or duo, full teams of humans only:
 * never a bot, never a move to co-op, never mixed with casual, and opposite teams never share a network.
 */

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
        id: `r${++n}`,
        partyId: members.length > 1 ? `p${n}` : null,
        members,
        queue: 'ranked',
        side: 'any',
        region: 'eu',
        sim: '26:abc',
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
        const out: ReturnType<Matchmaker['tick']>[] = [];
        for (let t = 0; t < ms; t += MM_LIMITS.tickMs) {
            clock.now += MM_LIMITS.tickMs;
            out.push(mm.tick());
        }
        return out;
    };
    return { clock, mm, advance };
}

const matchesOf = (ticks: ReturnType<Matchmaker['tick']>[]): MmMatch[] => ticks.flatMap(t => t.matches);

describe('ranked matchmaker pool', () => {
    it('six solos form a ranked 3v3 of humans only: no bots, no fill, queue ranked', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) expect(mm.join(entry(clock, [k]))).toBe('ok');
        const [m] = matchesOf(advance(500));
        expect(m).toMatchObject({ mode: 'casual', queue: 'ranked', humans: 6, bots: 0, fill: null });
        expect(m.map).toBeUndefined();
        expect(m.teams!.map(t => [t.humans, t.bots])).toEqual([
            [3, 0],
            [3, 0],
        ]);
        expect(mm.size).toBe(0);
    });

    it('never bots: five solos wait ten minutes without a match, never move to co-op, and keepCasual is refused', () => {
        const { clock, mm, advance } = make();
        const es = ['a', 'b', 'c', 'd', 'e'].map(k => entry(clock, [k]));
        for (const e of es) mm.join(e);
        const ticks = advance(10 * 60_000);
        expect(matchesOf(ticks)).toHaveLength(0);
        expect(ticks.flatMap(t => t.switched)).toHaveLength(0);
        expect(mm.all().every(e => e.queue === 'ranked')).toBe(true);
        expect(mm.keepCasual(es[0].id)).toBe(false);
        // the wait estimate stays a finite number (the card never shows "never")
        const st = mm.status(es[0].id)!;
        expect(Number.isFinite(st.estimateMs)).toBe(true);
        expect(st.estimateMs).toBeGreaterThan(0);
    });

    it('solo or duo only: a trio is a bad entry', () => {
        const { clock, mm } = make();
        expect(maxPartyOf('ranked')).toBe(MM_RANKED.maxParty);
        expect(mm.join(entry(clock, ['t1', 't2', 't3']))).toBe('bad_entry');
        expect(mm.join(entry(clock, ['d1', 'd2']))).toBe('ok');
    });

    it('ranked and casual never share a match', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c']) mm.join(entry(clock, [k]));
        for (const k of ['d', 'e', 'f']) mm.join(entry(clock, [k], { queue: 'casual' }));
        const ms = matchesOf(advance(60_000));
        // the casual three are matched (with bots, or moved to co-op); the ranked three keep waiting
        expect(ms.length).toBeGreaterThan(0);
        expect(ms.every(m => m.queue !== 'ranked')).toBe(true);
        expect(mm.all().map(e => e.queue)).toEqual(['ranked', 'ranked', 'ranked']);
    });

    it('two duos and two solos: duos face duos (duo + solo against duo + solo)', () => {
        const { clock, mm, advance } = make();
        const d1 = entry(clock, ['a1', 'a2']);
        const d2 = entry(clock, ['b1', 'b2']);
        mm.join(d1);
        mm.join(d2);
        mm.join(entry(clock, ['s1']));
        mm.join(entry(clock, ['s2']));
        const [m] = matchesOf(advance(500));
        expect(m.queue).toBe('ranked');
        const teamOf = (id: string) => (m.teams![0].entries.includes(id) ? 0 : 1);
        expect(teamOf(d1.id)).not.toBe(teamOf(d2.id));
    });

    it('players on one /24 network never land on opposite teams', () => {
        const { clock, mm, advance } = make();
        // a and b share a network (not an address): they may be teammates, never opponents
        mm.join(entry(clock, [member('a', { netKey: 'net-home' })]));
        mm.join(entry(clock, [member('b', { netKey: 'net-home' })]));
        for (const k of ['c', 'd', 'e', 'f']) mm.join(entry(clock, [k]));
        const [m] = matchesOf(advance(500));
        const t0 = m.teams![0].members;
        expect(t0.includes('m-a')).toBe(t0.includes('m-b'));
    });

    it('fair matches only: a 100-point team gap waits for the wider band after 60 s; the window reaches ±400 at 2:00', () => {
        const { clock, mm, advance } = make();
        for (const k of ['a', 'b', 'c']) mm.join(entry(clock, [member(k, { rating: { r: 1400, rd: 60 } })]));
        for (const k of ['d', 'e', 'f']) mm.join(entry(clock, [member(k, { rating: { r: 1700, rd: 60 } })]));
        // the best split is 1500 against 1600 (36 % predicted): outside 40..60 % before 60 s
        expect(matchesOf(advance(55_000))).toHaveLength(0);
        expect(matchesOf(advance(10_000))).toHaveLength(1);
        expect(MM_RANKED.window.base + MM_RANKED.window.perSecond * 120).toBeCloseTo(MM_RANKED.window.max);
        expect(MM_RANKED.window.base).toBe(150);
    });
});

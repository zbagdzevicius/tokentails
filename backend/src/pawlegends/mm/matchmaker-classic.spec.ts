import { shapeRank, shapeRankN } from './casual';
import { Matchmaker, type MmEntry, type MmMember, type MmMatch } from './matchmaker';
import { MM_CLASSIC, MM_LIMITS } from './mm-limits';
import type { MmRoomRecord } from './mm-room.schema';
import { casualRatingStep } from './rating-update';

/* 5v5 Classic matchmaking (docs/plans/moba/MAP-5V5.md §9.3) on a fake clock: pure, deterministic, no sockets. */

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

function entry(clock: { now: number }, keys: string[], over: Partial<MmEntry> = {}): MmEntry {
    const members = keys.map(k => member(k));
    return {
        id: `k${++n}`,
        partyId: members.length > 1 ? `p${n}` : null,
        members,
        queue: 'classic',
        side: 'any',
        region: 'eu',
        sim: '19:abc',
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

describe('5v5 Classic matchmaker', () => {
    it('shapes: team size 3 is the casual table; on 5 full teams first, then the fuller smaller team', () => {
        for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) expect(shapeRankN(a, b, 3)).toBe(shapeRank(a, b));
        expect(shapeRankN(5, 5, 5)).toBe(0);
        expect(shapeRankN(4, 4, 5)).toBeLessThan(shapeRankN(5, 4, 5));
        expect(shapeRankN(5, 4, 5)).toBeLessThan(shapeRankN(3, 3, 5));
        expect(shapeRankN(2, 2, 5)).toBeLessThan(shapeRankN(5, 1, 5));
        expect(shapeRankN(6, 1, 5)).toBe(99);
    });

    it('ten solos: one 5v5 on Hearthwood, no bots, one species a team, slots by team', () => {
        const { clock, mm, advance } = make();
        for (let i = 0; i < 10; i++) expect(mm.join(entry(clock, [`s${i}`]))).toBe('ok');
        const [m] = matchesOf(advance(MM_LIMITS.tickMs));
        expect(m).toMatchObject({ mode: 'casual', map: 'hearthwood', humans: 10, bots: 0, fill: null });
        expect(m.teams!.map(t => [t.humans, t.bots])).toEqual([
            [5, 0],
            [5, 0],
        ]);
        expect(m.teams![0].species).not.toBe(m.teams![1].species);
        expect(m.members).toHaveLength(10);
    });

    it('classic and casual pools never mix; a classic search never moves to co-op; bots fill at 45 s', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, ['a']));
        mm.join(entry(clock, ['b']));
        mm.join(entry(clock, ['c'], { queue: 'casual', sim: '19:abc' }));
        const early = advance(MM_CLASSIC.fillMs - 1000);
        expect(matchesOf(early).filter(m => m.map === 'hearthwood')).toHaveLength(0);
        expect(early.flatMap(t => t.switched).map(e => e.members[0].member)).not.toContain('m-a');
        const [m] = matchesOf(advance(2000)).filter(x => x.map === 'hearthwood');
        expect(m.fill).toBe('normal');
        expect(m.teams!.map(t => [t.humans, t.bots])).toEqual([
            [1, 4],
            [1, 4],
        ]);
        expect(m.bots).toBe(8);
        expect(mm.status(m.entries[0])).toBeNull();
    });

    it('a duo and a trio join each other against five solos (parties of up to three per entry)', () => {
        const { clock, mm, advance } = make();
        mm.join(entry(clock, ['d1', 'd2']));
        mm.join(entry(clock, ['t1', 't2', 't3']));
        for (let i = 0; i < 5; i++) mm.join(entry(clock, [`s${i}`]));
        const out = matchesOf(advance(MM_CLASSIC.partiesUntilMs + 2000));
        expect(out).toHaveLength(1);
        expect(out[0].humans).toBe(10);
        const teams = out[0].teams!.map(t => t.members.slice().sort());
        expect(teams.some(t => t.includes('m-d1') && t.includes('m-t1'))).toBe(true);
    });
});

describe('5v5 Classic rating', () => {
    it('rates the `classic` row against the five foes of the other team (slots 5..9)', () => {
        const foe = (slot: number) => ({
            slot,
            identityHash: `h${slot}`,
            accountId: `a${slot}`,
            joinedTick: 0,
            backfill: false,
            ratingAtStart: { r: 1800, rd: 60, sigma: 0.06 },
        });
        const room: MmRoomRecord = {
            _id: 'room1',
            queue: 'classic',
            mode: 'casual',
            map: 'hearthwood',
            teams: [
                { species: 'cat', slots: [0], difficulty: 'normal', rating: 1500 },
                { species: 'dog', slots: [5, 6, 7, 8, 9], difficulty: 'normal', rating: 1800 },
            ],
            region: 'eu',
            side: 'cat',
            difficulty: 'hard',
            sim: '19:abc',
            fill: [1, 2, 3, 4],
            queueMs: {},
            members: [
                { ...foe(0), accountId: 'me', ratingAtStart: { r: 1500, rd: 100, sigma: 0.06 } },
                ...[5, 6, 7, 8, 9].map(foe),
            ],
            createdAt: new Date(0),
        };
        const step = casualRatingStep({ room, accountId: 'me', won: true, row: null, nowMs: 1000 });
        expect(step.row).toMatchObject({ _id: 'me:classic', queue: 'classic', games: 1, wins: 1 });
        // the foes are slots 5..9 (all human: full weight); with one human foe the step is a fifth as large
        const one = casualRatingStep({
            room: { ...room, members: room.members.filter(m => m.slot === 0 || m.slot === 5) },
            accountId: 'me',
            won: true,
            row: null,
            nowMs: 1000,
        });
        expect(step.row!.r).toBeGreaterThan(1500);
        expect(step.row!.r - 1500).toBeGreaterThan(2 * (one.row!.r - 1500));
    });
});

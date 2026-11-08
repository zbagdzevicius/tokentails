/*
 * Casual PvP team building (docs/plans/moba/V16.md §4.1): pure, deterministic (entries in queue order, ties by id).
 * The Matchmaker calls `bestCasual` once per waiting casual entry, oldest first; the first entry that gets a match
 * keeps it. Two teams of up to three humans each, never cats and dogs on one team, never the same address on opposite
 * teams, bots in the empty seats once the oldest entry waited `fillMs`.
 */
import { entryRating, type MmEntry } from './matchmaker';
import { MM_CASUAL } from './mm-limits';

export type Species = 'cat' | 'dog';

export interface CasualPlan {
    /** Entries per team ([team A, team B], oldest first in each); team A holds the anchor. */
    teams: [MmEntry[], MmEntry[]];
    /** Species of each team. */
    species: [Species, Species];
    humans: [number, number];
    /** Bots fill the empty seats (false: 3v3 humans). */
    fill: boolean;
    cost: number;
}

const humansOf = (group: readonly MmEntry[]): number => group.reduce((n, e) => n + e.members.length, 0);

/** The team rating: the mean of its members' ratings (a party counts through its party rating, once per member). */
export function teamRating(group: readonly MmEntry[]): number {
    let sum = 0;
    let n = 0;
    for (const e of group) {
        sum += entryRating(e).r * e.members.length;
        n += e.members.length;
    }
    return n ? sum / n : 1500;
}

/** The predicted win chance of team A (Elo curve on the team means). */
export const winChance = (ra: number, rb: number): number => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/** The rating window after `waitedMs` (§4.1): min(75 + 12·w, 400), widened by any member with rd above 200. */
export function casualWindow(group: readonly MmEntry[], waitedMs: number): number {
    const w = MM_CASUAL.window;
    const rd = Math.max(...group.flatMap(e => e.members.map(m => m.rating.rd)));
    return Math.min(w.base + w.perSecond * (waitedMs / 1000), w.max) + Math.max(0, rd - w.rdFree);
}

/** Shapes in order of preference (§4.1 step 3), by [larger team, smaller team] humans. Lower is better. */
export function shapeRank(a: number, b: number): number {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (hi === 3 && lo === 3) return 0;
    if (hi === 2 && lo === 2) return 1;
    if (hi === 3 && lo === 2) return 2;
    if (hi === 1 && lo === 1) return 3;
    if (hi === 2 && lo === 1) return 4;
    if (hi === 3 && lo === 1) return 5;
    return 99;
}

/** The species a group can play: those every entry's side allows (strict), or both once relaxed. */
function speciesFor(group: readonly MmEntry[], relaxed: boolean): Species[] {
    if (relaxed) return ['cat', 'dog'];
    const fixed = new Set(group.map(e => e.side).filter(s => s !== 'any'));
    if (fixed.size > 1) return [];
    if (fixed.size === 1) return [...fixed] as Species[];
    return ['cat', 'dog'];
}

const sideMismatch = (group: readonly MmEntry[], species: Species): number =>
    group.filter(e => e.side !== 'any' && e.side !== species).length;

/** Hard rules inside one team: one person once, at most three humans. */
function teamOk(group: readonly MmEntry[]): boolean {
    if (humansOf(group) > 3) return false;
    const keys = new Set<string>();
    for (const e of group)
        for (const m of e.members) {
            if (m.identityKey.startsWith('ip:')) continue;
            if (keys.has(m.identityKey)) return false;
            keys.add(m.identityKey);
        }
    return true;
}

/** Same address never on opposite teams (teammates are fine); one identity never on both. */
function apartOk(a: readonly MmEntry[], b: readonly MmEntry[]): boolean {
    const ips = new Set(a.flatMap(e => e.members.map(m => m.ipKey)));
    const ids = new Set(
        a.flatMap(e => e.members.filter(m => !m.identityKey.startsWith('ip:')).map(m => m.identityKey))
    );
    for (const e of b)
        for (const m of e.members) {
            if (m.ipKey && ips.has(m.ipKey)) return false;
            if (ids.has(m.identityKey)) return false;
        }
    return true;
}

/** Every subset of `cands` with up to `room` humans (and at most 3 entries), in candidate order. */
function* subsets(cands: readonly MmEntry[], room: number, from = 0, acc: MmEntry[] = []): Generator<MmEntry[]> {
    yield acc;
    if (acc.length >= 3) return;
    for (let i = from; i < cands.length; i++) {
        const e = cands[i];
        if (e.members.length > room) continue;
        acc.push(e);
        yield* subsets(cands, room - e.members.length, i + 1, acc);
        acc.pop();
    }
}

/**
 * The best casual match anchored on `a` among `pool` (eligible casual entries of a's pool, oldest first), or null.
 * `protectedRd`: members with a rating deviation above it play only with each other until `protectWidenMs`.
 */
export function bestCasual(
    a: MmEntry,
    pool: readonly MmEntry[],
    nowMs: number,
    order: Map<string, number>
): CasualPlan | null {
    const c = MM_CASUAL;
    const waited = nowMs - a.enqueuedMs;
    const relaxed = waited >= c.sideRelaxMs;
    const fillOk = waited >= c.fillMs;
    const partyRule = waited < c.partiesUntilMs;
    const protect = waited < c.protectWidenMs;
    const protectedA = a.members.some(m => m.rating.rd > c.protectedRd);
    const cands = pool
        .filter(o => o !== a && o.region === a.region && o.sim === a.sim && o.queue === 'casual')
        .filter(o => !protect || o.members.some(m => m.rating.rd > c.protectedRd) === protectedA)
        .slice(0, c.candidates);
    let best: CasualPlan | null = null;
    for (const mates of subsets(cands, 3 - a.members.length)) {
        const teamA = [a, ...mates];
        if (!teamOk(teamA)) continue;
        const ha = humansOf(teamA);
        const restA = cands.filter(o => !mates.includes(o));
        for (const foes of subsets(restA, 3)) {
            if (!foes.length) continue;
            const teamB = [...foes];
            if (!teamOk(teamB) || !apartOk(teamA, teamB)) continue;
            const hb = humansOf(teamB);
            const rank = shapeRank(ha, hb);
            if (rank !== 0 && !fillOk) continue;
            if (rank >= 99) continue;
            // a lone human never faces three while a 2-human team can still form (15 s after the fill)
            if (rank === 5 && waited < c.fillMs + c.loneVsThreeMs) continue;
            // parties face parties of the same size or larger until 40 s
            if (partyRule) {
                const pa = Math.max(...teamA.map(e => e.members.length));
                const pb = Math.max(...teamB.map(e => e.members.length));
                if ((pa > 1 || pb > 1) && pa !== pb) continue;
            }
            const ra = teamRating(teamA);
            const rb = teamRating(teamB);
            const window = casualWindow([...teamA, ...teamB], waited);
            if (Math.abs(ra - rb) > window) continue;
            // a human-only match stays fair (predicted 40..60 %) while the anchor waited less than `fairUntilMs`
            const p0 = winChance(ra, rb);
            if (rank === 0 && waited < c.fairUntilMs && (p0 < 0.4 || p0 > 0.6)) continue;
            // species: A takes one the sides allow, B the other
            for (const sa of speciesFor(teamA, relaxed)) {
                const sb: Species = sa === 'cat' ? 'dog' : 'cat';
                if (!speciesFor(teamB, relaxed).includes(sb)) continue;
                const mismatch = sideMismatch(teamA, sa) + sideMismatch(teamB, sb);
                const p = winChance(ra, rb);
                let orderCost = 0;
                for (const e of [...mates, ...teamB]) orderCost += order.get(e.id) ?? 0;
                const cost =
                    rank * c.shapeWeight +
                    Math.abs(p * 100 - 50) * 2 +
                    c.sideMismatch * mismatch +
                    c.orderWeight * orderCost +
                    (sa === 'cat' ? 0 : 0.0001);
                if (!best || cost < best.cost)
                    best = {
                        teams: [teamA.slice(), teamB],
                        species: [sa, sb],
                        humans: [ha, hb],
                        fill: rank !== 0,
                        cost,
                    };
            }
        }
    }
    return best;
}

/** The species that plays on the left (team 0) next: the one that played there less in the recent matches; ties cats. */
export function team0SpeciesNext(recent: readonly Species[]): Species {
    let cats = 0;
    let dogs = 0;
    for (const s of recent) s === 'cat' ? cats++ : dogs++;
    return dogs < cats ? 'dog' : 'cat';
}

/** Fill-bot difficulty from a team's human mean (§4.1 step 5): < 1300 easy, < 1650 normal, else hard. */
export function fillDifficultyFor(r: number): 'easy' | 'normal' | 'hard' {
    if (r < 1300) return 'easy';
    if (r < 1650) return 'normal';
    return 'hard';
}

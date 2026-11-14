/*
 * Casual PvP team building (docs/plans/moba/V16.md §4.1): pure, deterministic (entries in queue order, ties by id).
 * The Matchmaker calls `bestCasual` once per waiting casual entry, oldest first; the first entry that gets a match
 * keeps it. Two teams of up to three humans each, never cats and dogs on one team, never the same address on opposite
 * teams, bots in the empty seats once the oldest entry waited `fillMs`.
 */
import { entryRating, type MmEntry } from './matchmaker';
import { MM_CASUAL, MM_CLASSIC, MM_RANKED } from './mm-limits';

/**
 * The PvP queue a plan is built for: `casual` (3v3 on Purrhaven Crossing) or `classic` (5v5 on Hearthwood Divide,
 * MAP-5V5.md §9.3). Same rules, different team size and limits.
 */
/** A queue's numbers, widened (casual and classic share the shape). */
type Widen<T> = T extends number
    ? number
    : T extends readonly unknown[]
    ? T
    : T extends object
    ? { readonly [K in keyof T]: Widen<T[K]> }
    : T;
export type PvpLimits = Widen<typeof MM_CASUAL>;
export interface PvpQueueRules {
    queue: 'casual' | 'classic' | 'ranked';
    teamSize: 3 | 5;
    limits: PvpLimits;
    /** Ranked (SOCIAL-RANKED.md §7.1): opposite teams never share a /24 (/48) network, not only an address. */
    apartByNet?: boolean;
    /** Ranked (§7.11): bots fill a match only when every entry in it sent `bots: true` (a game that labels them). */
    fillNeedsOptIn?: boolean;
}
export const CASUAL_RULES: PvpQueueRules = Object.freeze({ queue: 'casual', teamSize: 3, limits: MM_CASUAL });
export const CLASSIC_RULES: PvpQueueRules = Object.freeze({ queue: 'classic', teamSize: 5, limits: MM_CLASSIC });
/** Ranked: 3v3 on the Crossing, players first, labelled bots after the fill (opted-in entries only), the network rule. */
export const RANKED_RULES: PvpQueueRules = Object.freeze({
    queue: 'ranked',
    teamSize: 3,
    limits: MM_RANKED,
    apartByNet: true,
    fillNeedsOptIn: true,
});
/** Ranked inside Prime Time (§7.11): the same rules, bots wait `primeFillMs`. */
export const RANKED_PRIME_RULES: PvpQueueRules = Object.freeze({
    ...RANKED_RULES,
    limits: Object.freeze({ ...MM_RANKED, fillMs: MM_RANKED.primeFillMs }),
});
export const pvpRulesOf = (queue: string, prime = false): PvpQueueRules =>
    queue === 'classic'
        ? CLASSIC_RULES
        : queue === 'ranked'
        ? prime
            ? RANKED_PRIME_RULES
            : RANKED_RULES
        : CASUAL_RULES;

export type Species = 'cat' | 'dog';

export interface CasualPlan {
    /** Entries per team ([team A, team B], oldest first in each); team A holds the anchor. */
    teams: [MmEntry[], MmEntry[]];
    /** Species of each team. */
    species: [Species, Species];
    humans: [number, number];
    /** Bots fill the empty seats (false: every seat human). */
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

/** Fill-bot difficulty for a match (§4.1 step 5), from the mean of ALL its humans so both teams get the same bots. */
export function matchFillDifficulty(teams: readonly (readonly MmEntry[])[]): 'easy' | 'normal' | 'hard' {
    return fillDifficultyFor(teamRating(teams.flat()));
}

/** The rating a fill bot of each difficulty plays at, for the win prediction (the middle of its band). */
export const BOT_RATING: Readonly<Record<'easy' | 'normal' | 'hard', number>> = Object.freeze({
    easy: 1200,
    normal: 1475,
    hard: 1800,
});

/**
 * A team's strength with its bots (three seats): humans at their ratings, each empty seat at the bot rating. This is
 * what the fairness rule and the cost use, so a 1v1 with two bots each side is judged on the whole team, not the human.
 */
export function effectiveRating(group: readonly MmEntry[], botRating: number, teamSize = 3): number {
    let sum = 0;
    let n = 0;
    for (const e of group) {
        sum += entryRating(e).r * e.members.length;
        n += e.members.length;
    }
    return (sum + Math.max(0, teamSize - n) * botRating) / teamSize;
}

/** The predicted win chance of team A (Elo curve on the team means). */
export const winChance = (ra: number, rb: number): number => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/** The rating window after `waitedMs` (§4.1): min(75 + 12·w, 400), widened by any member with rd above 200. */
export function casualWindow(group: readonly MmEntry[], waitedMs: number, limits: PvpLimits = MM_CASUAL): number {
    const w = limits.window;
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

/**
 * Shapes for any team size (5v5 Classic): full teams first, then the fuller smaller team, then the smaller gap
 * (5v5, 4v4, 5v4, 3v3, 4v3, 5v3 ...). Team size 3 is `shapeRank` exactly.
 */
export function shapeRankN(a: number, b: number, teamSize: number): number {
    if (teamSize === 3) return shapeRank(a, b);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (lo < 1 || hi > teamSize) return 99;
    if (hi === teamSize && lo === teamSize) return 0;
    return 1 + (teamSize - lo) * teamSize + (hi - lo);
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

/** Hard rules inside one team: one person once, at most `teamSize` humans. */
function teamOk(group: readonly MmEntry[], teamSize = 3): boolean {
    if (humansOf(group) > teamSize) return false;
    const keys = new Set<string>();
    for (const e of group)
        for (const m of e.members) {
            if (m.identityKey.startsWith('ip:')) continue;
            if (keys.has(m.identityKey)) return false;
            keys.add(m.identityKey);
        }
    return true;
}

/** Same address never on opposite teams (teammates are fine); one identity never on both. `byNet`: nor one network. */
function apartOk(a: readonly MmEntry[], b: readonly MmEntry[], byNet = false): boolean {
    const ips = new Set(a.flatMap(e => e.members.map(m => m.ipKey)));
    const nets = byNet ? new Set(a.flatMap(e => e.members.map(m => m.netKey).filter(Boolean))) : null;
    const ids = new Set(
        a.flatMap(e => e.members.filter(m => !m.identityKey.startsWith('ip:')).map(m => m.identityKey))
    );
    for (const e of b)
        for (const m of e.members) {
            if (m.ipKey && ips.has(m.ipKey)) return false;
            if (nets && m.netKey && nets.has(m.netKey)) return false;
            if (ids.has(m.identityKey)) return false;
        }
    return true;
}

/** Every subset of `cands` with up to `room` humans (and at most `maxEntries` entries), in candidate order. */
function* subsets(
    cands: readonly MmEntry[],
    room: number,
    maxEntries = 3,
    from = 0,
    acc: MmEntry[] = []
): Generator<MmEntry[]> {
    yield acc;
    if (acc.length >= maxEntries) return;
    for (let i = from; i < cands.length; i++) {
        const e = cands[i];
        if (e.members.length > room) continue;
        acc.push(e);
        yield* subsets(cands, room - e.members.length, maxEntries, i + 1, acc);
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
    order: Map<string, number>,
    rules: PvpQueueRules = CASUAL_RULES
): CasualPlan | null {
    const c = rules.limits;
    const n = rules.teamSize;
    const waited = nowMs - a.enqueuedMs;
    const relaxed = waited >= c.sideRelaxMs;
    const fillOk = waited >= c.fillMs;
    const partyRule = waited < c.partiesUntilMs;
    const protect = waited < c.protectWidenMs;
    const protectedA = a.members.some(m => m.rating.rd > c.protectedRd);
    const cands = pool
        .filter(o => o !== a && o.region === a.region && o.sim === a.sim && o.queue === rules.queue)
        .filter(o => !protect || o.members.some(m => m.rating.rd > c.protectedRd) === protectedA)
        .slice(0, c.candidates);
    let best: CasualPlan | null = null;
    for (const mates of subsets(cands, n - a.members.length, n)) {
        const teamA = [a, ...mates];
        if (!teamOk(teamA, n)) continue;
        const ha = humansOf(teamA);
        const restA = cands.filter(o => !mates.includes(o));
        for (const foes of subsets(restA, n, n)) {
            if (!foes.length) continue;
            const teamB = [...foes];
            if (!teamOk(teamB, n) || !apartOk(teamA, teamB, rules.apartByNet)) continue;
            const hb = humansOf(teamB);
            const rank = shapeRankN(ha, hb, n);
            if (rank !== 0 && !fillOk) continue;
            // ranked (§7.11): never a bot for an entry whose game does not label them
            if (rank !== 0 && rules.fillNeedsOptIn && ![...teamA, ...teamB].every(e => e.bots === true)) continue;
            if (rank >= 99) continue;
            // a lone human never faces a full team while a 2-human team can still form (15 s after the fill)
            if (Math.min(ha, hb) === 1 && Math.max(ha, hb) === n && waited < c.fillMs + c.loneVsThreeMs) continue;
            // parties face parties of the same size or larger until 40 s
            if (partyRule) {
                const pa = Math.max(...teamA.map(e => e.members.length));
                const pb = Math.max(...teamB.map(e => e.members.length));
                if ((pa > 1 || pb > 1) && pa !== pb) continue;
            }
            const ra = teamRating(teamA);
            const rb = teamRating(teamB);
            const window = casualWindow([...teamA, ...teamB], waited, c);
            if (Math.abs(ra - rb) > window) continue;
            // predicted on the whole team: both sides' bots play at one level, from the mean of every human
            const bot = BOT_RATING[matchFillDifficulty([teamA, teamB])];
            const p = winChance(effectiveRating(teamA, bot, n), effectiveRating(teamB, bot, n));
            // every shape stays fair: predicted 40..60 % while the anchor waited less than `fairUntilMs`, then
            // within `fairAfter` (filled 1v1 and 3v1 included, so the widened window never seats a lopsided match)
            const fair = waited < c.fairUntilMs ? c.fairBand : c.fairAfter;
            if (p < fair[0] || p > fair[1]) continue;
            // species: A takes one the sides allow, B the other
            for (const sa of speciesFor(teamA, relaxed)) {
                const sb: Species = sa === 'cat' ? 'dog' : 'cat';
                if (!speciesFor(teamB, relaxed).includes(sb)) continue;
                const mismatch = sideMismatch(teamA, sa) + sideMismatch(teamB, sb);
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

/** Fill-bot difficulty from a human mean (§4.1 step 5): < 1300 easy, < 1650 normal, else hard. */
export function fillDifficultyFor(r: number): 'easy' | 'normal' | 'hard' {
    if (r < 1300) return 'easy';
    if (r < 1650) return 'normal';
    return 'hard';
}

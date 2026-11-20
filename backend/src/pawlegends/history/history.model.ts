import { CURRENT_SEASON_ID, SEASONS } from '../pawlegends-catalog';
import { gradeScore, slotGrade, type GradeStats } from '../ranked/grade';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md): the pure half. One compact row per human participant per match,
 * written ONLY by the `/live` save (`pawlegends-live.ts`, `pawlegends-party-live.ts`) after its Game row exists, from
 * the re-sim's or the referee's VERIFIED per-slot stats (never the client's numbers). Display only: no score and no
 * reward ever reads it; the one counter it feeds is the Leaderboards' Cats vs Dogs tally (leaderboard/sides.ts).
 *
 * Names are never stored (as everywhere in social): a human seat keeps its account id (`u`, server only, never sent to a
 * client) and the read resolves the display name. Bots are stored as bots and shown as bots.
 */

/** Rows kept per account (the oldest past it are deleted on the next write). */
export const HISTORY_KEEP = 100;
/** Rows per page of the list. */
export const HISTORY_PAGE = 15;

export const HISTORY_MODES = ['skirmish', 'classic', 'blitz', 'pvp', 'ranked', 'coop', 'practice', 'arcade'] as const;
export type HistoryMode = typeof HISTORY_MODES[number];

/** The list's filter chips: Ranked, PvP, vs AI, Blitz, Arcade (Practice and the weekend modes). */
export const HISTORY_GROUPS = ['ranked', 'pvp', 'ai', 'blitz', 'arcade'] as const;
export type HistoryGroup = typeof HISTORY_GROUPS[number];

export const HISTORY_VISIBILITY = ['everyone', 'friends', 'me'] as const;
export type HistoryVisibility = typeof HISTORY_VISIBILITY[number];
/** Friends see a player's history unless the player chose otherwise. */
export const DEFAULT_VISIBILITY: HistoryVisibility = 'friends';

export const groupOf = (mode: HistoryMode): HistoryGroup =>
    mode === 'ranked'
        ? 'ranked'
        : mode === 'pvp'
        ? 'pvp'
        : mode === 'blitz'
        ? 'blitz'
        : mode === 'practice' || mode === 'arcade'
        ? 'arcade'
        : 'ai';

export const isGroup = (v: unknown): v is HistoryGroup =>
    typeof v === 'string' && (HISTORY_GROUPS as readonly string[]).includes(v);
export const isVisibility = (v: unknown): v is HistoryVisibility =>
    typeof v === 'string' && (HISTORY_VISIBILITY as readonly string[]).includes(v);

/** Sim v34: the maps a history row can name (the 3v3 pool and 5v5 Hearthwood). */
export const HISTORY_MAPS = ['crossing', 'hearthwood', 'ridge', 'thicket', 'quarry', 'pitch'] as const;
export type HistoryMap = typeof HISTORY_MAPS[number];

/** A solo match's mode from its record: the map and the mutator. Pure. */
export function soloMode(map: unknown, mutator: unknown): HistoryMode {
    const m = typeof mutator === 'string' ? mutator : 'none';
    if (m === 'blitz') return 'blitz';
    if (m === 'practice') return 'practice';
    if (m !== 'none') return 'arcade';
    return map === 'hearthwood' ? 'classic' : 'skirmish';
}

/** A party room's mode: PvP (casual or ranked), or co-op against bots (ranked vs AI counts as ranked). Pure. */
export function partyMode(pvp: boolean, queue: string | null | undefined): HistoryMode {
    if (queue === 'ranked') return 'ranked';
    return pvp ? 'pvp' : 'coop';
}

/** One seat of a stored match. Short keys: up to 10 per row, 100 rows per account. */
export interface HistoryPlayer {
    /** slot */
    s: number;
    /** team (0 Purrhaven, 1 the other side) */
    t: 0 | 1;
    /** hero id */
    h: string;
    /** the human's account id (server only; never sent), null for a bot */
    u: string | null;
    lv: number;
    k: number;
    d: number;
    a: number;
    /** hero damage dealt */
    hd: number;
    /** damage taken */
    dt: number;
    /** tower damage */
    td: number;
    /** heal and shield */
    hs: number;
    /** fish earned */
    f: number;
    /** toy tiers owned at the end */
    ty: number;
    /** lane last hits (CS) */
    cs: number;
    g: 'S' | 'A' | 'B' | 'C' | null;
    /**
     * Casual bot seats shown as players (party/bot-persona.ts): the persona's name and flag, for display only. The seat
     * stays a bot here (`u: null`): stats, friends, ratings and analytics read it as one.
     */
    pn?: string;
    pc?: string;
}

export interface HistoryRowDoc {
    _id?: unknown;
    accountId: string;
    /** Dedupe key: the solo replay digest, or `party:<room>`. Unique per account. */
    matchId: string;
    at: Date;
    season: string;
    mode: HistoryMode;
    group: HistoryGroup;
    map: HistoryMap;
    mutator: string | null;
    difficulty: string;
    outcome: 'won' | 'lost' | 'draw';
    reason: string | null;
    ticks: number;
    /** The owner's seat. */
    slot: number;
    hero: string;
    k: number;
    d: number;
    a: number;
    grade: 'S' | 'A' | 'B' | 'C' | null;
    /** The winning team's best (`mvp`) or the losing team's best (`svp`), from the grade score. */
    mvpSlot: number | null;
    svpSlot: number | null;
    /** -1 on a draw. */
    winner: 0 | 1 | -1;
    /** `finalHash:ticks`: the owner's device finds its kept replay by it. */
    key: string;
    players: HistoryPlayer[];
}

const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const HERO = /^[a-z0-9_]{1,32}$/;

interface StatsLike {
    slot?: unknown;
    hero?: unknown;
    kills?: unknown;
    deaths?: unknown;
    assists?: unknown;
    heroDamage?: unknown;
    towerDamage?: unknown;
    level?: unknown;
    damageTaken?: unknown;
    healShield?: unknown;
    fish?: unknown;
    toys?: unknown;
    lastHits?: unknown;
}

export interface BuildInput {
    accountId: string;
    matchId: string;
    at: Date;
    mode: HistoryMode;
    map: unknown;
    mutator: unknown;
    difficulty: string;
    /** The owner's view. */
    outcome: 'won' | 'lost';
    draw?: boolean;
    reason?: unknown;
    ticks: number;
    finalHash: string;
    slot: number;
    /** The verified per-slot stats (the re-sim's, or the referee's verdict). */
    stats: unknown;
    /** Account id by slot for the human seats (bots absent or null). */
    humans: ReadonlyMap<number, string | null>;
    /** Casual bot seats shown as players: the name (and flag) each such seat showed in the match. */
    personas?: readonly { slot: number; name: string; cc?: string }[];
    /** The winning team (team 0's view): -1 on a draw; absent: derived from the owner's outcome. */
    winner?: unknown;
    /** The record's sim version: not stored, reported with the `match_saved` analytics event only. */
    simVersion?: number;
}

/** The season a match at `at` belongs to: the last one started by then (XP keeps counting until the next). Pure. */
export function seasonAt(at: Date): string {
    let id = CURRENT_SEASON_ID;
    const t = at.getTime();
    for (const s of SEASONS) if (Date.parse(s.startsAt) <= t) id = s.id;
    return id;
}

const PERSONA_NAME = /^[A-Za-z][A-Za-z '-]{1,31}$/;

/** A bot seat's persona fields (`pn`, `pc`), or nothing (a human seat, or a seat with no valid persona). */
function personaOf(i: BuildInput, slot: number): Pick<HistoryPlayer, 'pn' | 'pc'> {
    if (i.humans.get(slot)) return {};
    const p = i.personas?.find(x => x.slot === slot);
    if (!p || typeof p.name !== 'string' || !PERSONA_NAME.test(p.name)) return {};
    return { pn: p.name, ...(typeof p.cc === 'string' && /^[A-Z]{2}$/.test(p.cc) ? { pc: p.cc } : {}) };
}

/** The stored row, or null when the stats do not hold the owner's seat. Pure. */
export function buildRow(i: BuildInput): HistoryRowDoc | null {
    if (!Array.isArray(i.stats)) return null;
    // sim v34: the real map id (the 3v3 pool maps too); anything unknown is the Crossing
    const map: HistoryMap = (HISTORY_MAPS as readonly unknown[]).includes(i.map) ? (i.map as HistoryMap) : 'crossing';
    const teamSize = map === 'hearthwood' ? 5 : 3;
    const teamOf = (slot: number): 0 | 1 => (slot < teamSize ? 0 : 1);
    const rows = (i.stats as StatsLike[]).filter(
        s => !!s && Number.isInteger(s.slot) && (s.slot as number) >= 0 && (s.slot as number) < teamSize * 2
    );
    const grades = rows.map(s => ({
        slot: s.slot as number,
        hero: typeof s.hero === 'string' ? s.hero : '',
        kills: n0(s.kills),
        deaths: n0(s.deaths),
        assists: n0(s.assists),
        heroDamage: n0(s.heroDamage),
        towerDamage: n0(s.towerDamage),
        damageTaken: n0(s.damageTaken),
        healShield: n0(s.healShield),
    })) as GradeStats[];
    const players: HistoryPlayer[] = rows
        .map(s => {
            const slot = s.slot as number;
            return {
                s: slot,
                t: teamOf(slot),
                h: typeof s.hero === 'string' && HERO.test(s.hero) ? s.hero : 'clem',
                u: i.humans.get(slot) ?? null,
                lv: n0(s.level),
                k: n0(s.kills),
                d: n0(s.deaths),
                a: n0(s.assists),
                hd: n0(s.heroDamage),
                dt: n0(s.damageTaken),
                td: n0(s.towerDamage),
                hs: n0(s.healShield),
                f: n0(s.fish),
                ty: n0(s.toys),
                cs: n0(s.lastHits),
                g: slotGrade(grades, slot, teamSize),
                ...personaOf(i, slot),
            };
        })
        .sort((a, b) => a.s - b.s);
    const me = players.find(p => p.s === i.slot);
    if (!me) return null;
    const draw = !!i.draw;
    const myTeam = teamOf(i.slot);
    const winner: 0 | 1 | -1 = draw
        ? -1
        : i.winner === 0 || i.winner === 1
        ? i.winner
        : i.outcome === 'won'
        ? myTeam
        : ((1 - myTeam) as 0 | 1);
    const best = (team: 0 | 1 | null): number | null => {
        let top: number | null = null;
        let score = -1;
        for (const p of players) {
            if (team !== null && p.t !== team) continue;
            const v = gradeScore(grades, p.s, teamSize);
            if (v > score) {
                score = v;
                top = p.s;
            }
        }
        return top;
    };
    const mvpSlot = winner === -1 ? best(null) : best(winner);
    const svpSlot = winner === -1 ? null : best((1 - winner) as 0 | 1);
    const mutator = typeof i.mutator === 'string' && i.mutator !== 'none' ? i.mutator.slice(0, 16) : null;
    return {
        accountId: i.accountId,
        matchId: i.matchId,
        at: i.at,
        season: seasonAt(i.at),
        mode: i.mode,
        group: groupOf(i.mode),
        map,
        mutator,
        difficulty: String(i.difficulty).slice(0, 16),
        outcome: draw ? 'draw' : i.outcome,
        reason: typeof i.reason === 'string' ? i.reason.slice(0, 16) : null,
        ticks: n0(i.ticks),
        slot: i.slot,
        hero: me.h,
        k: me.k,
        d: me.d,
        a: me.a,
        grade: me.g,
        mvpSlot,
        svpSlot,
        winner,
        key: `${i.finalHash}:${n0(i.ticks)}`,
        players,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Season stats: one row per account and season, incremented once per stored match

export interface SeasonStatsDoc {
    _id: string;
    m?: number;
    w?: number;
    k?: number;
    d?: number;
    a?: number;
    mvp?: number;
    heroes?: Record<string, { m?: number; w?: number }>;
}

export const statsId = (accountId: string, season: string): string => `${accountId}:${season}`;

/** The `$inc` one stored row adds to its season row. Pure. */
export function statsInc(row: HistoryRowDoc): Record<string, number> {
    const won = row.outcome === 'won' ? 1 : 0;
    return {
        m: 1,
        w: won,
        k: row.k,
        d: row.d,
        a: row.a,
        mvp: row.mvpSlot === row.slot || row.svpSlot === row.slot ? 1 : 0,
        [`heroes.${row.hero}.m`]: 1,
        [`heroes.${row.hero}.w`]: won,
    };
}

export interface SeasonStatsView {
    season: string;
    name: string;
    matches: number;
    wins: number;
    /** 0..100, whole percent; null before the first match. */
    winRate: number | null;
    k: number;
    d: number;
    a: number;
    /** (K + A) / max(1, D), one decimal. */
    kda: number;
    mvp: number;
    /** The three most played champions this season. */
    favourites: { hero: string; matches: number; wins: number; winRate: number }[];
}

export function statsView(season: string, doc: SeasonStatsDoc | null): SeasonStatsView {
    const m = n0(doc?.m);
    const w = Math.min(m, n0(doc?.w));
    const k = n0(doc?.k);
    const d = n0(doc?.d);
    const a = n0(doc?.a);
    const heroes = Object.entries(doc?.heroes ?? {})
        .filter(([h]) => HERO.test(h))
        .map(([hero, v]) => ({ hero, matches: n0(v?.m), wins: n0(v?.w) }))
        .filter(h => h.matches > 0)
        .sort((x, y) => y.matches - x.matches || y.wins - x.wins || (x.hero < y.hero ? -1 : 1))
        .slice(0, 3)
        .map(h => ({ ...h, winRate: Math.round((100 * Math.min(h.wins, h.matches)) / h.matches) }));
    return {
        season,
        name: SEASONS.find(s => s.id === season)?.name ?? season,
        matches: m,
        wins: w,
        winRate: m ? Math.round((100 * w) / m) : null,
        k,
        d,
        a,
        kda: Math.round(((k + a) / Math.max(1, d)) * 10) / 10,
        mvp: n0(doc?.mvp),
        favourites: heroes,
    };
}

// ---------------------------------------------------------------------------------------------------------------
// Who may look, and what a client sees

export interface Relation {
    self: boolean;
    friends: boolean;
    blocked: boolean;
}

/** Self always; a block either way never; else the owner's choice. Pure. */
export function canView(visibility: HistoryVisibility, r: Relation): boolean {
    if (r.self) return true;
    if (r.blocked) return false;
    if (visibility === 'everyone') return true;
    if (visibility === 'friends') return r.friends;
    return false;
}

export interface HistoryRowView {
    id: string;
    at: number;
    mode: HistoryMode;
    map: HistoryMap;
    mutator: string | null;
    difficulty: string;
    outcome: 'won' | 'lost' | 'draw';
    seconds: number;
    hero: string;
    k: number;
    d: number;
    a: number;
    grade: 'S' | 'A' | 'B' | 'C' | null;
    mvp: 'mvp' | 'svp' | null;
    /** Own rows only: the device's replay key. */
    key?: string;
    /**
     * The owner's line in the list (Nov 19, founder: "show more stats"), from the stored seats (no new write). Each is
     * present only when known: a stat the match's sim did not count (0) is left out, never shown as a zero.
     */
    /** Champion level at the end. */
    lv?: number;
    /** Lane last hits. */
    cs?: number;
    fish?: number;
    /** Damage to champions, and the most any seat of the match dealt (the row's bar). */
    dmg?: number;
    dmgTop?: number;
    /** Kill participation, whole percent: (K + A) / the team's kills. */
    kp?: number;
    /** Team kills: the owner's team, then the other. */
    score?: [number, number];
    /** Toy tiers owned at the end (0..4). */
    toys?: number;
    /** Allies who are the owner's friends (the list asks the friendships); absent: none or not asked. */
    party?: number;
}

export interface HistoryPlayerView {
    slot: number;
    team: 0 | 1;
    hero: string;
    /** The human's display name; null for a bot. */
    name: string | null;
    /** The human's player code (opens their profile); absent for a bot or an unknown account. */
    code?: string;
    /**
     * A bot, except a casual bot seat shown as a player (its persona `name`, no `code`, so no profile link): the list
     * shows it like a player who keeps their profile private. The stored row keeps it a bot.
     */
    bot: boolean;
    /** The history's owner. */
    owner: boolean;
    level: number;
    k: number;
    d: number;
    a: number;
    damage: number;
    taken: number;
    tower: number;
    heal: number;
    fish: number;
    toys: number;
    cs: number;
    grade: 'S' | 'A' | 'B' | 'C' | null;
}

export interface HistoryMatchView extends HistoryRowView {
    slot: number;
    winner: 0 | 1 | -1;
    mvpSlot: number | null;
    svpSlot: number | null;
    reason: string | null;
    players: HistoryPlayerView[];
}

const TICK_HZ = 30;

/** The owner's stats line for the list, from the stored seats; `{}` when the owner's seat is not stored. Pure. */
export function rowStats(r: HistoryRowDoc, friends?: ReadonlySet<string>): Partial<HistoryRowView> {
    const seats = Array.isArray(r.players) ? r.players : [];
    const me = seats.find(p => p.s === r.slot);
    if (!me) return {};
    const team = me.t;
    const ours = seats.filter(p => p.t === team).reduce((n, p) => n + n0(p.k), 0);
    const theirs = seats.filter(p => p.t !== team).reduce((n, p) => n + n0(p.k), 0);
    const top = seats.reduce((m, p) => Math.max(m, n0(p.hd)), 0);
    const out: Partial<HistoryRowView> = {};
    if (n0(me.lv) > 0) out.lv = n0(me.lv);
    if (n0(me.cs) > 0) out.cs = n0(me.cs);
    if (n0(me.f) > 0) out.fish = n0(me.f);
    if (n0(me.hd) > 0) {
        out.dmg = n0(me.hd);
        out.dmgTop = Math.max(top, out.dmg);
    }
    if (ours > 0) out.kp = Math.min(100, Math.round((100 * (n0(me.k) + n0(me.a))) / ours));
    if (ours + theirs > 0) out.score = [ours, theirs];
    if (n0(me.ty) > 0) out.toys = Math.min(4, n0(me.ty));
    if (friends && friends.size) {
        const n = seats.filter(p => p.t === team && p.s !== r.slot && !!p.u && friends.has(p.u)).length;
        if (n > 0) out.party = n;
    }
    return out;
}

/** The owner's allies who are people (account ids, server only): the list asks which are the owner's friends. Pure. */
export const humanAllies = (r: HistoryRowDoc): string[] => {
    const seats = Array.isArray(r.players) ? r.players : [];
    const me = seats.find(p => p.s === r.slot);
    if (!me) return [];
    return seats.filter(p => p.t === me.t && p.s !== r.slot && !!p.u).map(p => p.u as string);
};

export function rowView(r: HistoryRowDoc, self: boolean, friends?: ReadonlySet<string>): HistoryRowView {
    return {
        id: String(r._id),
        at: new Date(r.at).getTime(),
        mode: r.mode,
        map: r.map,
        mutator: r.mutator ?? null,
        difficulty: r.difficulty,
        outcome: r.outcome,
        seconds: Math.floor(n0(r.ticks) / TICK_HZ),
        hero: r.hero,
        k: n0(r.k),
        d: n0(r.d),
        a: n0(r.a),
        grade: r.grade ?? null,
        mvp: r.mvpSlot === r.slot ? 'mvp' : r.svpSlot === r.slot ? 'svp' : null,
        ...(self ? { key: r.key } : {}),
        ...rowStats(r, friends),
    };
}

export function matchView(
    r: HistoryRowDoc,
    self: boolean,
    names: ReadonlyMap<string, string>,
    codes: ReadonlyMap<string, string> = new Map()
): HistoryMatchView {
    return {
        ...rowView(r, self),
        slot: r.slot,
        winner: r.winner,
        mvpSlot: r.mvpSlot ?? null,
        svpSlot: r.svpSlot ?? null,
        reason: r.reason ?? null,
        players: (r.players ?? []).map(p => ({
            slot: p.s,
            team: p.t,
            hero: p.h,
            name: p.u ? names.get(p.u) ?? null : p.pn ?? null,
            ...(p.u && codes.get(p.u) ? { code: codes.get(p.u) } : {}),
            bot: !p.u && !p.pn,
            owner: p.s === r.slot,
            level: n0(p.lv),
            k: n0(p.k),
            d: n0(p.d),
            a: n0(p.a),
            damage: n0(p.hd),
            taken: n0(p.dt),
            tower: n0(p.td),
            heal: n0(p.hs),
            fish: n0(p.f),
            toys: n0(p.ty),
            cs: n0(p.cs),
            grade: p.g ?? null,
        })),
    };
}

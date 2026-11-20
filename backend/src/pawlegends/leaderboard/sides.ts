import { championDef, type ChampSpecies } from '../pawlegends-catalog';
import { isoWeek } from '../ranked/boards';

/*
 * Cats vs Dogs (founder Nov 20: "Cats VS Dogs total wins visual cool representation"), the pure half. A saved match
 * counts ONCE (by its match id, whoever of its humans saved it first) for the side that won it. A team is the cats or
 * the dogs by who is in it (the game's `teamLabel`, sim v5 species teams): the winning team's champions by species, the
 * majority side; a tie goes to the team's first seat, as the scoreboard names it. Counted: every verified match a
 * player finished against someone (3v3 and 5v5 vs AI, Blitz, the weekend modes, co-op, casual PvP, Ranked). Not
 * counted: Practice, a draw, an abandoned match and a match whose champions are unknown.
 */

export type Side = ChampSpecies;
export const SIDES: readonly Side[] = Object.freeze(['cat', 'dog']);

/** Modes that never count (Practice is played on the device against a dummy). */
export const SIDE_SKIP_MODES: readonly string[] = Object.freeze(['practice']);
/** End reasons that never count. */
export const SIDE_SKIP_REASONS: readonly string[] = Object.freeze(['abandoned']);

/** The fields of a stored history row the tally reads. */
export interface SideRow {
    matchId: string;
    at: Date | string;
    season?: string;
    mode: string;
    reason?: string | null;
    winner: number;
    players: Array<{ s?: number; t?: number; h?: string }>;
}

/** The side that won this match, or null when it does not count. Pure. */
export function winningSide(row: SideRow | null | undefined): Side | null {
    if (!row || typeof row.matchId !== 'string' || !row.matchId) return null;
    if (SIDE_SKIP_MODES.includes(row.mode)) return null;
    if (row.reason && SIDE_SKIP_REASONS.includes(row.reason)) return null;
    if (row.winner !== 0 && row.winner !== 1) return null;
    const team = (Array.isArray(row.players) ? row.players : [])
        .filter(p => p && p.t === row.winner)
        .sort((a, b) => (Number(a.s) || 0) - (Number(b.s) || 0));
    let cat = 0;
    let dog = 0;
    let first: Side | null = null;
    for (const p of team) {
        const side = championDef(p.h)?.side;
        if (!side) continue;
        if (!first) first = side;
        if (side === 'cat') cat++;
        else dog++;
    }
    if (!first) return null;
    return cat > dog ? 'cat' : dog > cat ? 'dog' : first;
}

/** The counter documents one counted win adds to: all time, its season and its ISO week. Pure. */
export function sideCounterIds(row: SideRow): string[] {
    const at = row.at instanceof Date ? row.at : new Date(row.at);
    const ids = ['all'];
    if (row.season) ids.push(`season:${row.season}`);
    if (Number.isFinite(at.getTime())) ids.push(`week:${isoWeek(at)}`);
    return ids;
}

export interface SideSplit {
    cat: number;
    dog: number;
    /** The cats' share, 0..1 (0.5 with no wins yet). */
    catShare: number;
    /** Who leads, or null on a tie. */
    lead: Side | null;
    /** How far ahead the leader is, in whole percentage points of all wins. */
    leadPct: number;
}

/** The split of two counters. Pure. */
export function sideSplit(cat: unknown, dog: unknown): SideSplit {
    const c = Math.max(0, Math.floor(Number(cat) || 0));
    const d = Math.max(0, Math.floor(Number(dog) || 0));
    const total = c + d;
    const catShare = total ? c / total : 0.5;
    const leadPct = total ? Math.round((Math.abs(c - d) / total) * 100) : 0;
    return { cat: c, dog: d, catShare, lead: c > d ? 'cat' : d > c ? 'dog' : null, leadPct };
}

/** A player's own wins this season by the species of the champion they won with (`heroes.<id>.w`). Pure. */
export function ownSideWins(heroes: Record<string, { m?: unknown; w?: unknown } | undefined> | null | undefined): {
    cat: number;
    dog: number;
} {
    const out = { cat: 0, dog: 0 };
    for (const [hero, v] of Object.entries(heroes ?? {})) {
        const side = championDef(hero)?.side;
        const w = Math.max(0, Math.floor(Number(v?.w) || 0));
        if (side && w) out[side] += w;
    }
    return out;
}

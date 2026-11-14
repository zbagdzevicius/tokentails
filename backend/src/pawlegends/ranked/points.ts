import {
    FIRST_SEASON_CAP,
    LEGEND_IDX,
    PLACEMENTS,
    RANKED_BOTS,
    RANKED_POINTS,
    RANKED_TIERS,
    TIER_ANCHORS,
} from './tiers';

/*
 * Visible ranked points (docs/plans/moba/SOCIAL-RANKED.md §7.3–§7.8), pure. The hidden Glicko row is stepped exactly
 * like casual; these functions turn the post-update hidden rating and the result into tier points. Called only from
 * `/live` (pawlegends-party-live.ts), the one write path; `/ranked/me` and the boards call the read-only parts
 * (`decayedPoints`, `pendingDodgeCost`).
 */

const DAY = 86_400_000;

export interface RankedPoints {
    tierIdx: number;
    points: number;
    shield: number;
    placementsLeft: number;
    peakIdx: number;
    /** Placement matches of this run played against at least one player (none: placed at most at Alley III). */
    vsPlayers?: number;
}

/**
 * Who a ranked match was against (§7.11): `players` (six players), `filled` (players on both teams, labelled bots in
 * the empty seats) or `ai` (one team of players against bots).
 */
export type RankedMatchKind = 'players' | 'filled' | 'ai';

/** The share of the points a match of this kind moves (§7.11). */
export const kindShare = (kind: RankedMatchKind): number =>
    kind === 'ai' ? RANKED_BOTS.aiShare : kind === 'filled' ? RANKED_BOTS.filledShare : 1;

export const anchorOf = (tierIdx: number): number => TIER_ANCHORS[Math.max(0, Math.min(LEGEND_IDX, tierIdx))];

export const isProtected = (tierIdx: number): boolean => RANKED_TIERS[Math.min(4, Math.floor(tierIdx / 3))].protected;

/** The highest division whose anchor the hidden rating reaches (Kitten III below every anchor). */
export function tierOfRating(r: number): number {
    let idx = 0;
    for (let i = 0; i <= LEGEND_IDX; i++) if (r >= TIER_ANCHORS[i]) idx = i;
    return idx;
}

/** Convergence: above the division's anchor wins pay more and losses cost less, below it the other way. */
export function convergence(r: number, tierIdx: number): number {
    const c = 1 + (r - anchorOf(tierIdx)) / RANKED_POINTS.span;
    return Math.min(RANKED_POINTS.cMax, Math.max(RANKED_POINTS.cMin, c));
}

/** The global board key: tier × 100 + points (Legend: 1200 + uncapped points). */
export const ladderOf = (p: Pick<RankedPoints, 'tierIdx' | 'points'>): number =>
    p.tierIdx >= LEGEND_IDX ? LEGEND_IDX * 100 + p.points : p.tierIdx * 100 + p.points;

export const freshPoints = (placements: number = PLACEMENTS.first): RankedPoints => ({
    tierIdx: 0,
    points: 0,
    shield: RANKED_POINTS.shield,
    placementsLeft: placements,
    peakIdx: -1,
    vsPlayers: 0,
});

export interface RankedStepInput {
    state: RankedPoints;
    won: boolean;
    /** The hidden rating after this match's Glicko update. */
    r: number;
    /** Share of a loss by the server-side grade (GAPS N6); 1 until it lands. */
    gradeShare?: number;
    /** The loss is forgiven (a teammate left early) or a backfiller's: no points move. */
    free?: boolean;
    /** No ranked season finished before (the placement cap at Lion I). */
    firstSeason: boolean;
    /** A returning season's placement floor (at most 2 divisions under last season's finish). */
    floorIdx?: number;
    /** Who the match was against (§7.11); default `players`. */
    kind?: RankedMatchKind;
}

export interface RankedStepResult {
    state: RankedPoints;
    delta: number;
    placed?: boolean;
    promoted?: boolean;
    demoted?: boolean;
}

export function rankedStep(input: RankedStepInput): RankedStepResult {
    const s = { ...input.state };
    const kind = input.kind ?? 'players';
    if (s.placementsLeft > 0) {
        s.placementsLeft -= 1;
        if (kind !== 'ai') s.vsPlayers = (s.vsPlayers ?? 0) + 1;
        if (s.placementsLeft > 0) return { state: s, delta: 0 };
        let cap = input.firstSeason ? FIRST_SEASON_CAP : LEGEND_IDX;
        // §7.11: placements played only against bots place at most at Alley III
        if (!s.vsPlayers) cap = Math.min(cap, RANKED_BOTS.aiCapIdx);
        s.tierIdx = Math.max(input.floorIdx ?? 0, Math.min(cap, tierOfRating(input.r)));
        s.points = 0;
        s.shield = RANKED_POINTS.shield;
        s.peakIdx = Math.max(s.peakIdx, s.tierIdx);
        s.vsPlayers = 0;
        return { state: s, delta: 0, placed: true };
    }
    // §7.11: from Alley III up a vs AI match moves no points (it still counts for the Pass and the placements)
    if (kind === 'ai' && s.tierIdx >= RANKED_BOTS.aiCapIdx) return { state: s, delta: 0 };
    const share = kindShare(kind);
    const c = convergence(input.r, s.tierIdx);
    if (input.won) {
        const delta = Math.max(1, Math.round(RANKED_POINTS.win * c * share));
        s.points += delta;
        let promoted = false;
        while (s.tierIdx < LEGEND_IDX && s.points >= RANKED_POINTS.division) {
            s.points -= RANKED_POINTS.division;
            s.tierIdx += 1;
            s.shield = RANKED_POINTS.shield;
            promoted = true;
        }
        s.peakIdx = Math.max(s.peakIdx, s.tierIdx);
        return { state: s, delta, ...(promoted ? { promoted } : {}) };
    }
    if (input.free || isProtected(s.tierIdx)) return { state: s, delta: 0 };
    const gradeShare = Math.min(1, Math.max(0, input.gradeShare ?? 1));
    const delta = -Math.round(RANKED_POINTS.loss * (2 - c) * gradeShare * share);
    s.points += delta;
    if (s.points >= 0) return { state: s, delta };
    if (s.shield > 0) {
        s.shield -= 1;
        s.points = 0;
        return { state: s, delta };
    }
    // demote one division (Legend falls to Lion I), never under Kitten III
    s.tierIdx = Math.max(0, s.tierIdx - 1);
    s.points = Math.min(RANKED_POINTS.demotedTo, RANKED_POINTS.division + s.points);
    s.shield = RANKED_POINTS.shield;
    return { state: s, delta, demoted: true };
}

/** Legend only: −20 a day after 14 days without a ranked match, never below Legend 0 and never a demotion. */
export function decayedPoints(
    state: Pick<RankedPoints, 'tierIdx' | 'points'>,
    lastRankedAt: Date | null,
    now: Date
): number {
    if (state.tierIdx < LEGEND_IDX || !lastRankedAt) return state.points;
    const days = Math.floor((now.getTime() - new Date(lastRankedAt).getTime()) / DAY) - RANKED_POINTS.decayAfterDays;
    if (days <= 0) return state.points;
    return Math.max(0, state.points - RANKED_POINTS.decayPerDay * days);
}

/** Hidden from the top-100 board until the next ranked match. */
export const legendInactive = (lastRankedAt: Date | null, now: Date): boolean =>
    !!lastRankedAt && now.getTime() - new Date(lastRankedAt).getTime() >= RANKED_POINTS.decayAfterDays * DAY;

/** −3 per dodge, never below the division floor (0 points). */
export const afterDodges = (points: number, dodges: number): number =>
    Math.max(0, points - RANKED_POINTS.dodge * Math.max(0, dodges));

/** Soft reset at a new season (§7.4): r 25% toward 1500, RD ≥ 150, 3 placements, floor 2 divisions under the finish. */
export function softReset(prev: { r: number; rd: number; tierIdx: number }): {
    r: number;
    rd: number;
    placementsLeft: number;
    floorIdx: number;
} {
    return {
        r: Math.round((prev.r + 0.25 * (1500 - prev.r)) * 100) / 100,
        rd: Math.max(prev.rd, 150),
        placementsLeft: PLACEMENTS.season,
        floorIdx: Math.max(0, prev.tierIdx - 2),
    };
}

/*
 * Ranked tiers and point constants (docs/plans/moba/SOCIAL-RANKED.md §7.2, §7.3, §11.1). Duplicated in the game as
 * `pawlegends/src/meta/ranked.ts`; `tests/unit/ranked-tiers.test.ts` there deep-compares the two copies. Change both.
 *
 * A tier index runs 0..12: Kitten III, II, I (0..2), Tabby (3..5), Alley (6..8), Lion (9..11), Legend (12).
 */

export interface RankedTierDef {
    id: 'kitten' | 'tabby' | 'alley' | 'lion' | 'legend';
    name: string;
    /** Hidden-rating anchor of each division, III first (Legend: one). */
    anchors: number[];
    /** A protected tier never loses points. */
    protected: boolean;
}

export const RANKED_TIERS: readonly RankedTierDef[] = Object.freeze([
    { id: 'kitten', name: 'Kitten', anchors: [1000, 1075, 1150], protected: true },
    { id: 'tabby', name: 'Tabby', anchors: [1225, 1300, 1375], protected: true },
    { id: 'alley', name: 'Alley', anchors: [1450, 1525, 1600], protected: false },
    { id: 'lion', name: 'Lion', anchors: [1675, 1750, 1825], protected: false },
    { id: 'legend', name: 'Legend', anchors: [1900], protected: false },
]);

export const DIVISION_NUMERALS = Object.freeze(['III', 'II', 'I']);

export const RANKED_POINTS = Object.freeze({
    win: 20,
    loss: 15,
    /** c = clamp(1 + (r − anchor)/span, min, max). */
    span: 400,
    cMin: 0.5,
    cMax: 1.5,
    /** Points of a division; crossing it promotes. */
    division: 100,
    /** Free losses below 0 per division before a demotion. */
    shield: 1,
    /** Points after a demotion (at most). */
    demotedTo: 75,
    dodge: 3,
    /** Legend decay: after `decayAfterDays` without a ranked match, `decayPerDay` a day, never below Legend 0. */
    decayAfterDays: 14,
    decayPerDay: 20,
});

export const PLACEMENTS = Object.freeze({ first: 5, season: 3 });

/** The highest tier index a first-season placement can reach (Lion I). */
export const FIRST_SEASON_CAP = 11;
export const LEGEND_IDX = 12;

/**
 * Low-population ranked (SOCIAL-RANKED.md §7.11, round 4): who fills a quiet queue and what it pays. Players first;
 * labelled bots fill the empty seats after `fillS` (`primeFillS` inside Prime Time) when each team has a player, and a
 * search with no opponent player by `fillS + aiAfterS` plays its team against bots ("vs AI"). A bot-filled match pays
 * `filledShare` of the points both ways, a vs AI match `aiShare`, and vs AI pays nothing from `aiCapIdx` (Alley III) up;
 * placements with no match against players place at most there. The hidden rating never moves in a vs AI match.
 */
export const RANKED_BOTS = Object.freeze({
    fillS: 40,
    primeFillS: 75,
    aiAfterS: 30,
    filledShare: 0.5,
    aiShare: 0.25,
    aiCapIdx: 6,
});

/**
 * Prime Time (§7.11): the hours ranked players are asked to come together (UTC). Every day `daily`, and on Saturday
 * and Sunday also `weekend`; the windows of one day never overlap. Inside one, bots wait `primeFillS` instead of `fillS`.
 */
export const RANKED_PRIME_TIME = Object.freeze({
    daily: Object.freeze({ fromH: 18, toH: 22 }),
    weekend: Object.freeze({ fromH: 12, toH: 18 }),
});

/** Ranked eligibility (§7.1). The game shows the server's values; no copy there. */
export const RANKED_MIN_MATCHES = 10;

/**
 * Queue regions (§7.11, groundwork): the game times `ping` (a path on the API) for each and shows the result. One
 * region today (the matchmaker's MM_HOME_REGION); a second one adds a row here and a relay there.
 */
export const RANKED_REGIONS: readonly { id: string; name: string; ping: string }[] = Object.freeze([
    Object.freeze({ id: 'eu', name: 'Europe', ping: '/pawlegends/ping' }),
]);

/** Every division's anchor, index 0..12. */
export const TIER_ANCHORS: readonly number[] = Object.freeze(RANKED_TIERS.flatMap(t => t.anchors));

export function tierLabel(tierIdx: number, points?: number): string {
    if (tierIdx >= LEGEND_IDX) return `Legend · ${Math.max(0, Math.floor(points ?? 0))} pts`;
    const t = RANKED_TIERS[Math.floor(tierIdx / 3)];
    return `${t.name} ${DIVISION_NUMERALS[tierIdx % 3]}`;
}

export const tierIdOf = (tierIdx: number): RankedTierDef['id'] =>
    RANKED_TIERS[Math.min(4, Math.floor(Math.max(0, tierIdx) / 3))].id;

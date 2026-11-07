/*
 * Quick Play match shape (docs/plans/moba/M1A-IMPL.md §2.3, §2.5): pure. The room difficulty from the team rating,
 * capped by the members' unlocked tiers; the side of a match; a friend party's queue rating.
 */

export const MM_DIFFICULTIES = ['rookie', 'easy', 'normal', 'hard'] as const;
export type MmDifficulty = typeof MM_DIFFICULTIES[number];

/** The midpoints of the bot pseudo-ratings (glicko2.ts BOT_RATING): humans face bots just under their level. */
const DIFFICULTY_FROM: readonly [number, MmDifficulty][] = [
    [1125, 'rookie'],
    [1375, 'easy'],
    [1625, 'normal'],
];

/** The difficulty for a team rating `R` (the mean of the humans' r). */
export function difficultyForRating(R: number): MmDifficulty {
    for (const [below, d] of DIFFICULTY_FROM) if (R < below) return d;
    return 'hard';
}

/**
 * The room difficulty: from the humans' mean rating, capped at the lowest `maxDifficulty` among them (a hint can only
 * lower it, never raise it; an unknown or missing hint caps nothing).
 */
export function matchDifficulty(ratings: readonly number[], maxDifficulties: readonly (string | null)[]): MmDifficulty {
    const R = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 1500;
    let index = MM_DIFFICULTIES.indexOf(difficultyForRating(R));
    for (const m of maxDifficulties) {
        const cap = m ? MM_DIFFICULTIES.indexOf(m as MmDifficulty) : -1;
        if (cap >= 0 && cap < index) index = cap;
    }
    return MM_DIFFICULTIES[index];
}

/** A difficulty at or below `max` (null max: no cap known). */
export function difficultyAllowed(difficulty: string, max: string | null): boolean {
    if (!max) return true;
    const cap = MM_DIFFICULTIES.indexOf(max as MmDifficulty);
    const d = MM_DIFFICULTIES.indexOf(difficulty as MmDifficulty);
    return cap < 0 || d <= cap;
}

/**
 * A friend party's queue rating: mean + 0.25 × (max − mean), so a strong player does not drag a new friend into a high
 * difficulty.
 */
export function partyRating(ratings: readonly number[]): number {
    if (!ratings.length) return 1500;
    const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return mean + 0.25 * (Math.max(...ratings) - mean);
}

/**
 * The side of a match: the side of any entry that asked for one (compatible entries never disagree); when all asked
 * for either, the side the pool played less in its recent matches; ties go to cats.
 */
export function matchSide(
    sides: readonly ('cat' | 'dog' | 'any')[],
    recent: readonly ('cat' | 'dog')[]
): 'cat' | 'dog' {
    const fixed = sides.find(s => s !== 'any');
    if (fixed) return fixed as 'cat' | 'dog';
    let cats = 0;
    let dogs = 0;
    for (const s of recent) s === 'cat' ? cats++ : dogs++;
    return dogs < cats ? 'dog' : 'cat';
}

/** Two queue sides can share a team: equal, or either is `any`. */
export const sidesCompatible = (a: 'cat' | 'dog' | 'any', b: 'cat' | 'dog' | 'any'): boolean =>
    a === 'any' || b === 'any' || a === b;

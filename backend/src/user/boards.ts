import { notGuestFilter } from 'src/common/decorators/auth-user.decorator';

/**
 * Who may appear on (and be counted by) any board: registered players that are not flagged
 * (plan G5, decision #35) and not deleted. Guests are excluded as before (F5, G1). Flagged staking abusers keep their
 * Tails (no clawback) but never rank, never take a top-N reward and never push anyone down a place.
 *
 * `boardExcludedAt` is declared on the schema, so Mongoose's strictQuery keeps the filter.
 */
export const NOT_BOARD_EXCLUDED_FILTER = Object.freeze({ boardExcludedAt: { $exists: false } }) as {
    boardExcludedAt: { $exists: false };
};

/**
 * Anonymised (deleted) accounts never rank (4e review fix #2). Account deletion zeroes `tails` and
 * the game boards, but keeps `tailsEarned` and the given counters so shelter impact totals stay
 * true; this filter is what keeps a "Deleted player" off the Tails and rescuers boards, out of the
 * weekly top-200 and out of everyone's position count. `deletedAt` is declared on the schema.
 */
export const NOT_DELETED_FILTER = Object.freeze({ deletedAt: { $exists: false } }) as {
    deletedAt: { $exists: false };
};

/** Whether this account is kept off every board, so its own position is not a rank (review fix #3). */
export const isBoardExcluded = (user?: { boardExcludedAt?: unknown; deletedAt?: unknown } | null): boolean =>
    !!user?.boardExcludedAt || !!user?.deletedAt;

export function boardFilter(env: NodeJS.ProcessEnv = process.env) {
    return { ...notGuestFilter(env), ...NOT_BOARD_EXCLUDED_FILTER, ...NOT_DELETED_FILTER };
}

/**
 * The `$sort` stage of a ranked board: by `field`, highest first, ties by `_id` so the order (and
 * the `top=N` cut-off) is the same on every call (4e review fix #5). Passed as a pipeline stage
 * because `BaseRepository.find`'s `sort` takes one key.
 */
export const boardSort = (field: string) => ({ $sort: { [field]: -1, _id: 1 } as Record<string, 1 | -1> });

/** `?period=` of the rescuers board: lifetime (default) or this season. */
export type RescuerPeriod = 'all' | 'season';

export const rescuerPeriod = (value?: string): RescuerPeriod => (value === 'season' ? 'season' : 'all');

export const rescuerField = (period: RescuerPeriod): 'tailsGiven' | 'monthTailsGiven' =>
    period === 'season' ? 'monthTailsGiven' : 'tailsGiven';

export const BOARD_DEFAULT_TOP = 50;
export const BOARD_MAX_TOP = 200;

/** `?top=` parsed and clamped to 1..BOARD_MAX_TOP; anything else is the default. */
export function boardTop(value?: string | number, fallback = BOARD_DEFAULT_TOP): number {
    const parsed = Number(value);
    if (value === undefined || value === '' || !Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(1, Math.min(BOARD_MAX_TOP, Math.floor(parsed)));
}

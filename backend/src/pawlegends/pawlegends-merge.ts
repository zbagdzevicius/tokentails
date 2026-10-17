import { PAWLEGENDS_LEVEL_CAPS, PAWLEGENDS_LEVELS, PAWLEGENDS_MAX_TICKS } from 'src/shared-contracts/caps';

/*
 * Pawlegends progress in the guest merge (decision D44, POC.md §11.5). The guest merge
 * (`src/user/guest/guest-lifecycle.ts`) carries a guest's Pawlegends fields into the account it signs in to.
 * Nothing here creates a Game row or calls the score route: the guest's PAWLEGENDS rows are re-parented by the
 * merge's one `updateMany`, as every other game's are, so `POST /user/catbassadors/live` stays the one score writer.
 *
 * - `pawlegendsCatnip.<difficulty>`: `$max`, each value clamped to its PAWLEGENDS_LEVEL_CAPS entry. The value is the
 *   first-win claim (0 or the cap), so when both accounts already claimed a difficulty the max is still the cap:
 *   the catnip is paid once, never twice, and the account total stays within PAWLEGENDS_TOTAL_CAP (and so
 *   TOTAL_CATNIP_CAP), re-derived into `catnipCount` by `recomputeGameTotals` right after.
 * - `pawlegendsFastestWin.<difficulty>`: `$min` of a valid tick count (1..PAWLEGENDS_MAX_TICKS).
 * - `pawlegendsMatches.<difficulty>`: `$inc`. Not idempotent, so it rides on the merge's exactly-once Tails credit
 *   (guarded by `mergedGuestIds`), never on the replayable bests step.
 *
 * Only the known difficulties are read; junk keys and junk values are ignored.
 */

export const PAWLEGENDS_MERGE_FIELDS = ['pawlegendsCatnip', 'pawlegendsFastestWin', 'pawlegendsMatches'] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const entries = (raw: unknown): [string, number, number][] => {
    if (!isPlainObject(raw)) return [];
    return PAWLEGENDS_LEVELS.map(
        (level, index) => [level, Number(raw[level]), index] as [string, number, number]
    ).filter(([, value]) => Number.isFinite(value) && value > 0);
};

/** The idempotent part: `$max` of the first-win catnip and `$min` of the fastest wins. Null when there is none. */
export function pawlegendsBestsUpdate(
    guest: Record<string, any>
): { $max?: Record<string, number>; $min?: Record<string, number> } | null {
    const max: Record<string, number> = {};
    const min: Record<string, number> = {};
    for (const [level, value, index] of entries(guest.pawlegendsCatnip)) {
        const capped = Math.min(PAWLEGENDS_LEVEL_CAPS[index] ?? 0, Math.floor(value));
        if (capped > 0) max[`pawlegendsCatnip.${level}`] = capped;
    }
    for (const [level, value] of entries(guest.pawlegendsFastestWin)) {
        const ticks = Math.floor(value);
        if (ticks >= 1 && ticks <= PAWLEGENDS_MAX_TICKS) min[`pawlegendsFastestWin.${level}`] = ticks;
    }
    const update: { $max?: Record<string, number>; $min?: Record<string, number> } = {};
    if (Object.keys(max).length) update.$max = max;
    if (Object.keys(min).length) update.$min = min;
    return Object.keys(update).length ? update : null;
}

/** The `$inc` of the guest's saved matches per difficulty, for the exactly-once credit. Empty when there is none. */
export function pawlegendsMatchesInc(guest: Record<string, any>): Record<string, number> {
    const inc: Record<string, number> = {};
    for (const [level, value] of entries(guest.pawlegendsMatches)) {
        inc[`pawlegendsMatches.${level}`] = Math.floor(value);
    }
    return inc;
}

/**
 * A dotted write into a field that is not a sub-document fails (MongoDB refuses `pawlegendsCatnip.easy` under a
 * number or null): the same repair `/live` makes before its own dotted writes. Null when every field is fine.
 */
export function pawlegendsFieldRepair(target: Record<string, any> | null | undefined): Record<string, object> | null {
    if (!target) return null;
    const broken = PAWLEGENDS_MERGE_FIELDS.filter(
        field => target[field] !== undefined && !isPlainObject(target[field])
    );
    return broken.length ? Object.fromEntries(broken.map(field => [field, {}])) : null;
}

/*
 * The daily wheel (`GET /user/catbassadors/lives/redeem`) and its published odds (plan G5
 * vocabulary: "publish odds", core-game-strategy §6). One table drives both the draw and
 * `GET /user/catbassadors/lives/odds`, so what the wheel shows is what it does.
 *
 * Unchanged from the hard-coded draw it replaces: 1,000, 250, 100 and 50 Tails are 1% each; 25, 10,
 * 5 and 1 share the other 96% (24% each).
 */

export interface IWheelSlice {
    tails: number;
    /** Weight out of WHEEL_TOTAL_WEIGHT. */
    weight: number;
}

export const WHEEL_SLICES: readonly IWheelSlice[] = Object.freeze([
    { tails: 1000, weight: 1 },
    { tails: 250, weight: 1 },
    { tails: 100, weight: 1 },
    { tails: 50, weight: 1 },
    { tails: 25, weight: 24 },
    { tails: 10, weight: 24 },
    { tails: 5, weight: 24 },
    { tails: 1, weight: 24 },
]);

export const WHEEL_TOTAL_WEIGHT = WHEEL_SLICES.reduce((sum, slice) => sum + slice.weight, 0);

/** The slice for a uniform `random` in [0, 1). Out-of-range input is clamped. */
export function drawWheel(random: number = Math.random()): number {
    const r = Number.isFinite(random) ? Math.min(Math.max(random, 0), 1 - Number.EPSILON) : 0;
    let cursor = r * WHEEL_TOTAL_WEIGHT;
    for (const slice of WHEEL_SLICES) {
        if (cursor < slice.weight) {
            return slice.tails;
        }
        cursor -= slice.weight;
    }
    return WHEEL_SLICES[WHEEL_SLICES.length - 1].tails;
}

export interface IWheelOdds {
    /** One spin a day for signed-in players; guests never spin (G1). */
    spinsPerDay: 1;
    slices: Array<{ tails: number; chancePercent: number }>;
    /** Expected Tails of one spin, rounded to 2 decimals. */
    expectedTails: number;
}

export function wheelOdds(): IWheelOdds {
    const expected = WHEEL_SLICES.reduce((sum, slice) => sum + (slice.tails * slice.weight) / WHEEL_TOTAL_WEIGHT, 0);
    return {
        spinsPerDay: 1,
        slices: WHEEL_SLICES.map(slice => ({
            tails: slice.tails,
            chancePercent: Number(((slice.weight / WHEEL_TOTAL_WEIGHT) * 100).toFixed(2)),
        })),
        expectedTails: Number(expected.toFixed(2)),
    };
}

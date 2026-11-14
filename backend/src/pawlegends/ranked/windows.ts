import { RANKED_PRIME_TIME } from './tiers';

/*
 * Prime Time (docs/plans/moba/SOCIAL-RANKED.md §7.11), pure: the UTC hours ranked players are asked to come together.
 * Every day 18:00–22:00 UTC, and on Saturday and Sunday also 12:00–18:00 (one window 12:00–22:00 on those days).
 * The matchmaker reads `inPrimeTime` (bots wait longer inside), `ranked/status` sends `primeTime(now)` and the game
 * shows the window in the player's own time. Duplicated in the game as `pawlegends/src/meta/ranked.ts` (the same hours,
 * deep-compared by tests/unit/ranked-tiers.test.ts).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface PrimeTime {
    /** Inside a window now. */
    active: boolean;
    /** The current window's start and end (active), else the next window's. Epoch ms. */
    startsAt: number;
    endsAt: number;
}

/** The windows of the UTC day that holds `dayMs` (its 00:00), adjacent ones merged, in order. */
function windowsOfDay(dayStartMs: number): Array<[number, number]> {
    const dow = new Date(dayStartMs).getUTCDay();
    const out: Array<[number, number]> = [];
    const add = (fromH: number, toH: number) => out.push([dayStartMs + fromH * HOUR, dayStartMs + toH * HOUR]);
    if (dow === 0 || dow === 6) add(RANKED_PRIME_TIME.weekend.fromH, RANKED_PRIME_TIME.weekend.toH);
    add(RANKED_PRIME_TIME.daily.fromH, RANKED_PRIME_TIME.daily.toH);
    out.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const w of out) {
        const last = merged[merged.length - 1];
        if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
        else merged.push([w[0], w[1]]);
    }
    return merged;
}

/** The current or next Prime Time window at `nowMs`. */
export function primeTime(nowMs: number): PrimeTime {
    const day0 = Math.floor(nowMs / DAY) * DAY;
    for (let d = 0; d < 8; d++)
        for (const [from, to] of windowsOfDay(day0 + d * DAY)) {
            if (nowMs < from) return { active: false, startsAt: from, endsAt: to };
            if (nowMs < to) return { active: true, startsAt: from, endsAt: to };
        }
    // unreachable: every day has a window
    return { active: false, startsAt: day0 + DAY, endsAt: day0 + DAY };
}

export const inPrimeTime = (nowMs: number): boolean => primeTime(nowMs).active;

/*
 * Mode unlocks by account level (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 17: "by default initially 3x3 (skirmish)
 * and practise (sandbox) modes should be available (unlocked). then other modes unlocks upon reaching certain LVL").
 * The account level counts finished matches. The game's copy is pawlegends/src/meta/accountLevel.ts (a unit test there
 * pins the two tables equal). The server checks the modes it runs a queue for: 5v5 Classic here (the relay's
 * `mm.join {queue:'classic'}`), Ranked through its own saved-match rule (RANKED_MIN_MATCHES = the Ranked level's
 * matches). Every other mode is played against bots on the device.
 */

/** Finished matches needed for each level: index 0 is Lv 1. Past the table, every LEVEL_STEP_AFTER matches is a level. */
export const LEVEL_MATCHES: readonly number[] = Object.freeze([0, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36, 42, 50]);
export const LEVEL_STEP_AFTER = 10;
export const LEVEL_MAX = 99;

/** The account level of `matches` finished matches (Lv 1 at 0). */
export function levelOf(matches: number): number {
    const m = Math.max(0, Math.floor(Number(matches) || 0));
    let lv = 1;
    for (let i = 1; i < LEVEL_MATCHES.length; i++) if (m >= LEVEL_MATCHES[i]) lv = i + 1;
    const last = LEVEL_MATCHES[LEVEL_MATCHES.length - 1];
    if (m >= last) lv = LEVEL_MATCHES.length + Math.floor((m - last) / LEVEL_STEP_AFTER);
    return Math.min(LEVEL_MAX, lv);
}

/** Finished matches that reach `level`. */
export function matchesForLevel(level: number): number {
    const l = Math.max(1, Math.min(LEVEL_MAX, Math.floor(level)));
    if (l <= LEVEL_MATCHES.length) return LEVEL_MATCHES[l - 1];
    return LEVEL_MATCHES[LEVEL_MATCHES.length - 1] + (l - LEVEL_MATCHES.length) * LEVEL_STEP_AFTER;
}

/** The level each server-run queue needs (the game's MODE_UNLOCKS rows of the same modes). */
export const QUEUE_LEVEL: Readonly<Record<string, number>> = Object.freeze({ classic: 3, ranked: 6 });

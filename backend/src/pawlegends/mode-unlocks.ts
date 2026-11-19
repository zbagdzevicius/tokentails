/*
 * One main queue (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 19: "keep: 3v3 as main queue. Practise appears from
 * Level 5 only ... Ranked appears from level 10"). The account level counts finished matches. The game's copy is
 * pawlegends/src/meta/accountLevel.ts and pawlegends/src/ui/modeSelect/unlocks.ts (a unit test there pins the tables
 * equal). The server runs two queues a player picks: the 3v3 main queue (`casual`, with its co-op move) from Lv 1 and
 * Ranked from Lv 10 (RANKED_MIN_MATCHES = this level's matches, ranked/tiers.ts). Practice (Lv 5) is played on the
 * device, so the server has no gate for it. 5v5 Classic is retired from the menu: the relay refuses new
 * `mm.join {queue:'classic'}` with `mode_retired` (its rooms, replays and history stay).
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

/** The level each gated server-run queue needs (the game's MODE_UNLOCKS row of the same mode). */
export const QUEUE_LEVEL = Object.freeze({ ranked: 10 } as const);

/** Queues the relay no longer takes new joins for (MODE-UNLOCKS.md: one main queue, Nov 19). */
export const RETIRED_QUEUES: readonly string[] = Object.freeze(['classic']);

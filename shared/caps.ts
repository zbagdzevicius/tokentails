/**
 * Score caps, reward amounts and other limits shared by the backend and the clients (plan F2).
 *
 * Framework-free and TypeScript 4.8 compatible. Edit here, then run `node scripts/sync-contracts.mjs`.
 * The backend enforces every cap; client copies only shape the UI and must never be trusted.
 *
 * Every table is frozen: the same module instance is shared by the whole backend process, so a stray
 * `.sort()` or assignment would otherwise change the enforced caps for everyone. The arrays keep the
 * `number[]`/`string[]` types through a cast so existing consumers compile unchanged.
 */

const frozen = <T>(values: T[]): T[] => Object.freeze(values) as T[];

// ---------------------------------------------------------------------------------------------
// Catnip (Purrsuit endless and levels, Paw Match)
// ---------------------------------------------------------------------------------------------

/**
 * Purrsuit levels in save order: `01` is endless, then world `w` level `n` as `${w}${n}`.
 * Index `i` of the `catnipChaos` array on a user is the score for `CATNIP_CHAOS_LEVELS[i]`.
 */
export const CATNIP_CHAOS_LEVELS: string[] = frozen(
    (() => {
        const levels = ['01'];
        for (let world = 1; world <= 16; world += 1) {
            for (let level = 1; level <= 6; level += 1) {
                levels.push(`${world}${level}`);
            }
        }
        return levels;
    })()
);

/**
 * The endless Purrsuit level (the INFINITE card). It is never "cleared": a won outcome on it sets no
 * `catnipChaosCleared` slot, and it unlocks once 1-1 is cleared (decision #69, plan G10).
 */
export const CATNIP_CHAOS_ENDLESS_LEVEL = '01';

/** Catnip cap of the endless level (`01`). Was 420; raised to 500 by decision #57 (plan G8). */
export const CATNIP_CHAOS_ENDLESS_CAP = 500;

/** Catnip cap of every other Purrsuit level. */
export const CATNIP_CHAOS_LEVEL_CAP = 10;

/**
 * Per-slot caps the backend enforces, one per entry of `CATNIP_CHAOS_LEVELS` (97). The client's
 * `client/constants/catnip-accounting.ts` exports a same-named table with one entry per playable
 * Phaser level (79): same value at every index, different length and total. Only this table matches
 * backend validation. See bug #1 in docs/plans/alignment-log/1a.md.
 */
export const CATNIP_CHAOS_LEVEL_CAPS: number[] = frozen(
    CATNIP_CHAOS_LEVELS.map((_level, index) => (index === 0 ? CATNIP_CHAOS_ENDLESS_CAP : CATNIP_CHAOS_LEVEL_CAP))
);

export const MATCH3_LEVEL_COUNT = 30;

export const MATCH3_LEVELS: string[] = frozen(
    Array.from({ length: MATCH3_LEVEL_COUNT }, (_, index) => String(index + 1))
);

/** Paw Match catnip cap for a 1-based level number. Same formula as `client/components/Match3/match3.config.ts`. */
export function match3CatnipCap(levelNumber: number): number {
    const difficulty = levelNumber - 1;
    return Math.max(0, Math.min(85, Math.round(9 + levelNumber * 2 + Math.floor(difficulty / 4))));
}

export const MATCH3_LEVEL_CATNIP_CAPS: number[] = frozen(MATCH3_LEVELS.map(level => match3CatnipCap(Number(level))));

/** Highest raw Paw Match score a single level save may report. */
export const MAX_MATCH3_SCORE_PER_LEVEL = 1000000;

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

export const CATNIP_CHAOS_TOTAL_CAP = sum(CATNIP_CHAOS_LEVEL_CAPS);
export const MATCH3_TOTAL_CAP = sum(MATCH3_LEVEL_CATNIP_CAPS);

/** Most catnip a legitimate account can hold. Leaderboards ignore anything above it. */
export const TOTAL_CATNIP_CAP = CATNIP_CHAOS_TOTAL_CAP + MATCH3_TOTAL_CAP;

// ---------------------------------------------------------------------------------------------
// Cupid Cat (season event)
// ---------------------------------------------------------------------------------------------

export const SEASON_EVENT_LEVELS: string[] = frozen(Array.from({ length: 14 }, (_, index) => String(index + 1)));

/** Hearts cap per Cupid Cat level. Was 420; raised to 500 with the endless cap by decision #57. */
export const SEASON_EVENT_LEVEL_POINT_CAP = 500;

export const SEASON_EVENT_LEVEL_POINT_CAPS: number[] = frozen(
    SEASON_EVENT_LEVELS.map(() => SEASON_EVENT_LEVEL_POINT_CAP)
);

// ---------------------------------------------------------------------------------------------
// Catnip Heist
// ---------------------------------------------------------------------------------------------

/**
 * Heist campaign level ids in play order. Index `i` is the slot of `heistScore` and `heistStars` on a
 * user (plan G2 layer 2). Must match `LEVELS` of the vendored sim (`backend/src/vendor/heist-sim`).
 */
export const HEIST_LEVELS: string[] = frozen(Array.from({ length: 8 }, (_, index) => `heist-0${index + 1}`));

/**
 * Highest score a won run of each Heist level can reach, in level order: every catnip coin (10 each)
 * plus the rescue (50), no time penalty. Derived from the sim by `catnip-heist/src/sim/server.ts`
 * (`LEVELS[i].maxScore`) and pinned to it by `backend/src/user/heist/heist-sim.spec.ts` and
 * `catnip-heist/src/sim/__tests__/server.test.ts`, so a level edit that changes a cap fails CI until
 * this table is updated. The backend scores Heist runs itself; these are display and sanity bounds.
 */
export const HEIST_LEVEL_CAPS: number[] = frozen([250, 240, 220, 270, 240, 240, 240, 310]);

/** All three Heist star bits (win 1, every coin 2, clean and quick 4). */
export const HEIST_STAR_MASK = 7;

/** Ticks per second of the Heist sim (`TICK_HZ` in `catnip-heist/src/types.ts`). */
export const HEIST_TICK_HZ = 30;

/**
 * Longest run log the host forwards or the backend replays: 10 minutes at 30 Hz, the same bound as
 * the default `maxTicks` of `replay()` in `catnip-heist/src/sim/replay.ts`.
 */
export const HEIST_MAX_TICKS = HEIST_TICK_HZ * 600;

/**
 * Most input runs in one log. Every run covers at least one tick, so a valid log never has more runs
 * than ticks; the separate bound lets a guard reject an oversized array before walking it.
 */
export const HEIST_MAX_RUNS = HEIST_MAX_TICKS;

/** Longest `runId`, `levelId` or cat id a Heist message may carry. */
export const HEIST_MAX_ID_LENGTH = 64;

// ---------------------------------------------------------------------------------------------
// Tails (rescue points)
// ---------------------------------------------------------------------------------------------

/** Fixed Tails rewards. The client adds display-only bounds for the daily wheel. */
export const REWARDS = Object.freeze({
    INVITE_FRIEND: 100,
    DAILY_REWARD: 10,
    WEEKLY_CRAFT: 5,
    FEED: 1,
    MYSTERY_BOX: 100,
    WEEKLY_TOP: 200,
});

/**
 * Most Tails a guest can bank before signing in (decision #7, plan F5). Promotion credits
 * `min(pendingTails, GUEST_TAILS_LIFETIME_CAP)`; guests never hold spendable Tails before then.
 */
export const GUEST_TAILS_LIFETIME_CAP = 2000;

/** Most Tails one account can give to Rescue Goals per UTC day (decision #44, plan G5). */
export const PLEDGE_DAILY_CAP = 5000;

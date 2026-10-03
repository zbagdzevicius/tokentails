/*
 * The Tails ledger split (plan G5 "Ledger split", decision #34 option A).
 *
 *   tails            spendable balance. Earned Tails add to it; giving to a Rescue Goal takes from it.
 *   tailsEarned      lifetime earned. Never decremented. Every rank, tier, threshold and the
 *                    REACH_TAILS quests read it, so giving never costs rank.
 *   tailsGiven       lifetime Tails given to shelter goals (the rescuers board).
 *   monthTailsGiven  the same for the current season (reset by the codex reset with the other
 *   monthGoalsHelped month counters); BIG_HEART and GOAL_GETTER read them.
 *   goalsHelped      lifetime count of goals the player gave to.
 *
 * Every Tails credit goes through `earnTailsInc`, and `src/earn-tails.ast.spec.ts` fails the build on
 * a `tails` key inside an `$inc` that does not. A give goes through `giveTailsInc`.
 *
 * Until `scripts/backfill-tails-earned.js --apply` has run, legacy documents have no `tailsEarned`
 * (or only the part earned since this deploy). `earnedTails()` is exact either way, and the boards
 * sort on `tails` until TAILS_EARNED_BACKFILL_DONE=true: before the first pledge `tails` equals
 * lifetime earned, which is also why the backfill refuses to run once a pledge exists.
 */

// Type aliases, not interfaces: they must fit the driver's `Record<string, number>` `$inc` type.
export type ITailsEarnInc = {
    tails: number;
    tailsEarned: number;
};

export type ITailsGiveInc = {
    tails: number;
    tailsGiven: number;
    monthTailsGiven: number;
};

const wholeTails = (amount: number) => (Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0);

/**
 * The `$inc` fields of one Tails credit: the balance and the lifetime earned counter move together.
 * Spread it into the update and add the site's own counters next to it:
 * `{ $inc: { ...earnTailsInc(100), monthTails: 100 } }`.
 */
export function earnTailsInc(amount: number): ITailsEarnInc {
    const tails = wholeTails(amount);
    return { tails, tailsEarned: tails };
}

/**
 * The `$inc` fields of one give to a shelter goal: the balance goes down, the given counters go up,
 * `tailsEarned` is untouched. The caller guards the debit (`tails: {$gte: amount}` in the filter) and
 * counts a first give to a goal into `goalsHelped` / `monthGoalsHelped` itself.
 */
export function giveTailsInc(amount: number): ITailsGiveInc {
    const given = wholeTails(amount);
    return { tails: -given, tailsGiven: given, monthTailsGiven: given };
}

export interface ITailsLedgerFields {
    tails?: number | null;
    tailsEarned?: number | null;
    tailsGiven?: number | null;
}

const num = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Lifetime earned Tails of one user. Exact before and after the backfill: before it, `tailsEarned`
 * holds only what was earned since the deploy, while `tails + tailsGiven` is the whole history (the
 * balance only ever goes down by a give).
 */
export function earnedTails(user: ITailsLedgerFields | null | undefined): number {
    if (!user) {
        return 0;
    }
    return Math.max(num(user.tailsEarned), num(user.tails) + num(user.tailsGiven));
}

/** True once `scripts/backfill-tails-earned.js --apply` has run. Read per call (main.ts loads `.env` late). */
export const isTailsEarnedBackfillDone = (env: NodeJS.ProcessEnv = process.env) =>
    env.TAILS_EARNED_BACKFILL_DONE === 'true';

/**
 * The user field the earned-Tails board sorts and counts on. `tailsEarned` after the backfill;
 * `tails` before it, which equals lifetime earned while no pledge exists (the backfill refuses
 * once one does, so the two never disagree while this returns `tails`).
 */
export const earnedBoardField = (env: NodeJS.ProcessEnv = process.env): 'tailsEarned' | 'tails' =>
    isTailsEarnedBackfillDone(env) ? 'tailsEarned' : 'tails';

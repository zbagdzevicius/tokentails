import { CODEX_RESET_LEAD_MS, seasonTimes } from 'src/user/codex-reset';
import { giveTailsInc } from 'src/user/tails-ledger';

/*
 * The user-side writes of a give (plan G5 "Ledger split"), next to `giveTailsInc` in
 * src/user/tails-ledger.ts:
 *
 *   debit    `$inc: giveTailsInc(n)` behind `tails: {$gte: n}`, and the give's id pushed onto
 *            `pledgeHolds` in the same write. `tailsEarned` is never touched, so a give never costs rank.
 *   confirm  `$pull` the hold and count a first give to the goal into `goalsHelped`/`monthGoalsHelped`,
 *            filtered on the hold: runs once however often the saga or the sweeper repeats it.
 *   refund   a pipeline update filtered on the hold: balance back, given counters down (never below 0),
 *            hold removed. The season counter only moves if no counter reset happened since the give.
 *   cancel   a goal cancelled after it counted a give: the same refund, idempotent through
 *            `pledgeCancelRefunds` (the give's id is appended in the same write).
 *
 * `pledgeHolds` and `pledgeCancelRefunds` are written through the native collection, so they do not
 * need to be declared on the user schema (5f log: request to the user.schema owner to declare them).
 * The refund stages are built here, at run time, because they restore a balance without crediting
 * `tailsEarned`: the ledger AST spec (src/earn-tails.ast.spec.ts) is about credits and gives.
 */

export const PLEDGE_HOLDS_FIELD = 'pledgeHolds';
export const PLEDGE_CANCEL_REFUNDS_FIELD = 'pledgeCancelRefunds';

/** The most recent season counter reset at or before `now` (`MONTHLY_COUNTER_RESET`, 23:00 UTC on the 8th). */
export function lastCounterReset(now: Date): Date {
    const season = seasonTimes(now);
    const upcoming = Date.parse(season.resetAt);
    if (upcoming <= now.getTime()) {
        return new Date(upcoming);
    }
    return new Date(Date.parse(season.startedAt) - CODEX_RESET_LEAD_MS);
}

/** True when no season counter reset happened between the give (`epoch`) and `now`. */
export const sameCounterSeason = (epoch: Date | string, now: Date) =>
    new Date(epoch).getTime() === lastCounterReset(now).getTime();

/** The `$inc` of a debit. `tailsEarned` absent on purpose. */
export const debitInc = (amount: number) => giveTailsInc(amount);

const minusClamped = (field: string, amount: number) => ({
    $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, amount] }],
});

/**
 * Pipeline stage that undoes a give's debit: `tails + n`, `tailsGiven - n`, and `monthTailsGiven - n`
 * when the give is from this season. `extra` adds field expressions to the same stage.
 */
export function undoGiveStage(
    amount: number,
    sameSeason: boolean,
    extra: Record<string, unknown> = {}
): Record<string, unknown> {
    const stage: Record<string, unknown> = {
        tails: { $add: [{ $ifNull: ['$tails', 0] }, amount] },
        tailsGiven: minusClamped('tailsGiven', amount),
        ...extra,
    };
    if (sameSeason) {
        stage.monthTailsGiven = minusClamped('monthTailsGiven', amount);
    }
    return { $set: stage };
}

/** Refund of a held (not yet confirmed) give: filter the user update on `pledgeHolds: pledgeId`. */
export function refundHoldPipeline(pledgeId: unknown, amount: number, sameSeason: boolean) {
    return [
        undoGiveStage(amount, sameSeason, {
            [PLEDGE_HOLDS_FIELD]: {
                $filter: { input: { $ifNull: [`$${PLEDGE_HOLDS_FIELD}`, []] }, cond: { $ne: ['$$this', pledgeId] } },
            },
        }),
    ];
}

/**
 * Refund of a confirmed give whose goal was cancelled: filter the user update on
 * `pledgeCancelRefunds: {$ne: pledgeId}`. A first give also takes back its `goalsHelped`.
 */
export function cancelRefundPipeline(pledgeId: unknown, amount: number, sameSeason: boolean, firstForGoal: boolean) {
    const extra: Record<string, unknown> = {
        [PLEDGE_CANCEL_REFUNDS_FIELD]: {
            $concatArrays: [{ $ifNull: [`$${PLEDGE_CANCEL_REFUNDS_FIELD}`, []] }, [pledgeId]],
        },
    };
    if (firstForGoal) {
        extra.goalsHelped = minusClamped('goalsHelped', 1);
        if (sameSeason) {
            extra.monthGoalsHelped = minusClamped('monthGoalsHelped', 1);
        }
    }
    return [undoGiveStage(amount, sameSeason, extra)];
}

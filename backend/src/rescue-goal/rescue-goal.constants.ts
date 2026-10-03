import { HttpException, HttpStatus } from '@nestjs/common';
import { PLEDGE_DAILY_CAP } from 'src/shared-contracts/caps';
import { RescueGoalStatus } from 'src/shared-contracts/enums';
import { isTailsEarnedBackfillDone } from 'src/user/tails-ledger';

/*
 * Rescue Goals (plan G5 "Rescue Goals", F7.5, F8, decisions #37 and #44).
 *
 * A goal is a shelter purchase whose money Token Tails has ALREADY set aside (a sponsor or budget
 * line). Players give Tails (rescue points) to choose which goals get delivered first; Tails have
 * no cash value and the internal budgeting ratio of decision #37 never leaves the backend.
 */

export { PLEDGE_DAILY_CAP, RescueGoalStatus };

/** Smallest give. The IMPACT chips are 100 / 1,000 / MAX. */
export const PLEDGE_MIN = 10;

/** One give can never be larger than the daily cap (decision #44: 5,000 a day). */
export const PLEDGE_MAX = PLEDGE_DAILY_CAP;

/** Smallest and largest goal target in Tails. */
export const GOAL_TARGET_MIN = 100;
export const GOAL_TARGET_MAX = 10000000;

/** Decision #37: one monthly budget spread across 4 to 10 goals. More than 10 in one month is refused. */
export const GOALS_PER_BUDGET_MONTH_MAX = 10;
export const GOALS_PER_BUDGET_MONTH_MIN_HINT = 4;

/**
 * Cover pictures load in every player's client, so they come from Token Tails' own storage only:
 * the image uploads' CDN (`DO_SPACES_CDN`, the host the CMS image upload returns) and the two public
 * Spaces buckets already used for cat and shelter art. Any other host is refused (tracking, hotlinks,
 * and `next/image` domains).
 */
export const GOAL_IMAGE_HOSTS = [
    'tokentails.fra1.cdn.digitaloceanspaces.com',
    'tokentails-nfts.fra1.cdn.digitaloceanspaces.com',
];

export function goalImageHosts(env: NodeJS.ProcessEnv = process.env): string[] {
    const hosts = [...GOAL_IMAGE_HOSTS];
    try {
        const cdn = (env.DO_SPACES_CDN || '').trim();
        if (cdn) hosts.push(new URL(cdn).hostname.toLowerCase());
    } catch {
        // A malformed DO_SPACES_CDN adds nothing; the fixed hosts still apply.
    }
    return [...new Set(hosts)];
}

/** The delivery photo: an image the server re-encodes, so it is kept small and of a known type. */
export const GOAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const GOAL_PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Treat Giver (plan G5 "Treats"): five CONFIRMED treats in one season. Cosmetic; no Tails. */
export const TREAT_GIVER_BADGE = 'TREAT_GIVER';
export const TREAT_GIVER_TREATS = 5;

/** State of one give. Backend-only; clients show PENDING as "on its way". */
export enum RescueGoalPledgeStatus {
    PENDING = 'PENDING',
    CONFIRMED = 'CONFIRMED',
    /** Debited and then given back (the goal filled first, a crash, or the goal was cancelled). */
    REFUNDED = 'REFUNDED',
    /** Refused before or during the saga; anything it held is given back. */
    REJECTED = 'REJECTED',
}

export const PLEDGE_FINAL_STATUSES = [
    RescueGoalPledgeStatus.CONFIRMED,
    RescueGoalPledgeStatus.REFUNDED,
    RescueGoalPledgeStatus.REJECTED,
];

/*
 * Saga timing. The request performs a side effect only before `deadline` (created + 60 s). The
 * sweeper touches a PENDING give only once the deadline is a further 60 s behind it, so it never
 * races a live request, and it runs every minute: a give stuck after a crash is settled within about
 * three minutes, well inside the 10 minutes the plan asks for.
 */
export const PLEDGE_STEP_DEADLINE_MS = 60 * 1000;
export const PLEDGE_SWEEP_GRACE_MS = 60 * 1000;
/** After a give is refunded by the sweeper it is checked once more, for a write that landed late. */
export const PLEDGE_RECHECK_MS = 10 * 60 * 1000;
/** A cancelled goal re-runs its refunds for this long, for gives that were mid-flight at cancel time. */
export const GOAL_CANCEL_REFUND_WINDOW_MS = 15 * 60 * 1000;

export const PLEDGE_SWEEPER_JOB = 'rescue-goal-pledge-sweeper';
export const PLEDGE_SWEEPER_CRON = '* * * * *';
export const PLEDGE_SWEEPER_LEASE_MS = 50 * 1000;
export const PLEDGE_SWEEPER_BATCH = 200;

/** Collections. Every name holds "pledge" or "goal"; the tails backfill refuses once a "pledge" one has rows. */
export const RESCUE_GOAL_COLLECTIONS = {
    goals: 'rescuegoals',
    pledges: 'rescuegoalpledges',
    days: 'rescuegoalpledgedays',
    helpers: 'rescuegoalhelpers',
    receipts: 'rescuegoalreceipts',
} as const;

/**
 * Error codes in `{ statusCode, code, message }` bodies. Not in the F5.6 list yet: the shared
 * `shared/errors.ts` owner is asked to add them (docs/plans/alignment-log/5f.md); until then
 * clients match these literals.
 */
export const RESCUE_GOAL_ERROR = {
    PLEDGES_PAUSED: 'PLEDGES_PAUSED',
    PLEDGE_NOT_ELIGIBLE: 'PLEDGE_NOT_ELIGIBLE',
    PLEDGE_BALANCE: 'PLEDGE_BALANCE',
    PLEDGE_DAILY_CAP: 'PLEDGE_DAILY_CAP',
    PLEDGE_ID_REUSED: 'PLEDGE_ID_REUSED',
    GOAL_NOT_FOUND: 'GOAL_NOT_FOUND',
    GOAL_NOT_OPEN: 'GOAL_NOT_OPEN',
    GOAL_OVERFLOW: 'GOAL_OVERFLOW',
    GOAL_FUNDING_REQUIRED: 'GOAL_FUNDING_REQUIRED',
    GOAL_BUDGET_FULL: 'GOAL_BUDGET_FULL',
    GOAL_HOUSE_SHELTER: 'GOAL_HOUSE_SHELTER',
    GOAL_NOT_DELIVERABLE: 'GOAL_NOT_DELIVERABLE',
    GOAL_NOT_CANCELLABLE: 'GOAL_NOT_CANCELLABLE',
    GOAL_NOT_EDITABLE: 'GOAL_NOT_EDITABLE',
} as const;

export type RescueGoalErrorCode = typeof RESCUE_GOAL_ERROR[keyof typeof RESCUE_GOAL_ERROR];

export const RESCUE_GOAL_MESSAGES: Record<RescueGoalErrorCode, string> = {
    PLEDGES_PAUSED: 'Giving to shelter goals opens soon.',
    PLEDGE_NOT_ELIGIBLE: 'Play a few games with your cat first. Giving opens three days after you join.',
    PLEDGE_BALANCE: "You don't have that many Tails yet.",
    PLEDGE_DAILY_CAP: `You can give up to ${PLEDGE_DAILY_CAP.toLocaleString('en-US')} Tails a day.`,
    PLEDGE_ID_REUSED: 'This give was already used for another goal.',
    GOAL_NOT_FOUND: 'This goal does not exist.',
    GOAL_NOT_OPEN: 'This goal is no longer open.',
    GOAL_OVERFLOW: 'This goal needs fewer Tails than that.',
    GOAL_FUNDING_REQUIRED: 'A goal opens only once its money is set aside.',
    GOAL_BUDGET_FULL: `A budget month holds at most ${GOALS_PER_BUDGET_MONTH_MAX} goals.`,
    GOAL_HOUSE_SHELTER: 'Goals are for partner shelters, not Token Tails zones.',
    GOAL_NOT_DELIVERABLE: 'Only an open or filled goal can be delivered.',
    GOAL_NOT_CANCELLABLE: 'A delivered or cancelled goal cannot be cancelled.',
    GOAL_NOT_EDITABLE: 'A delivered or cancelled goal cannot be edited.',
};

const STATUS_OF: Record<RescueGoalErrorCode, number> = {
    PLEDGES_PAUSED: HttpStatus.SERVICE_UNAVAILABLE,
    PLEDGE_NOT_ELIGIBLE: HttpStatus.FORBIDDEN,
    PLEDGE_BALANCE: HttpStatus.CONFLICT,
    PLEDGE_DAILY_CAP: HttpStatus.CONFLICT,
    PLEDGE_ID_REUSED: HttpStatus.CONFLICT,
    GOAL_NOT_FOUND: HttpStatus.NOT_FOUND,
    GOAL_NOT_OPEN: HttpStatus.CONFLICT,
    GOAL_OVERFLOW: HttpStatus.CONFLICT,
    GOAL_FUNDING_REQUIRED: HttpStatus.BAD_REQUEST,
    GOAL_BUDGET_FULL: HttpStatus.CONFLICT,
    GOAL_HOUSE_SHELTER: HttpStatus.BAD_REQUEST,
    GOAL_NOT_DELIVERABLE: HttpStatus.CONFLICT,
    GOAL_NOT_CANCELLABLE: HttpStatus.CONFLICT,
    GOAL_NOT_EDITABLE: HttpStatus.CONFLICT,
};

/** `{ statusCode, code, message, ...extra }` with the code's HTTP status. */
export function rescueGoalError(code: RescueGoalErrorCode, extra: Record<string, unknown> = {}) {
    const statusCode = STATUS_OF[code];
    return new HttpException({ statusCode, code, message: RESCUE_GOAL_MESSAGES[code], ...extra }, statusCode);
}

/**
 * Gives open only after `scripts/backfill-tails-earned.js --apply` and TAILS_EARNED_BACKFILL_DONE=true
 * (task 4e manual step 3): until then the earned board sorts on the balance, so a give would cost
 * rank, and the backfill refuses to run once a give exists. RESCUE_GOAL_PLEDGES=off is a kill switch.
 */
export function pledgesOpen(env: NodeJS.ProcessEnv = process.env): boolean {
    if ((env.RESCUE_GOAL_PLEDGES || '').trim().toLowerCase() === 'off') {
        return false;
    }
    return isTailsEarnedBackfillDone(env);
}

/** MONGO_TRANSACTIONS=true runs a give in one transaction (needs a replica set); otherwise the saga. */
export const useTransactions = (env: NodeJS.ProcessEnv = process.env) =>
    (env.MONGO_TRANSACTIONS || '').trim().toLowerCase() === 'true';

/** RESCUE_GOAL_SWEEPER=off stops the sweeper on this instance (default on; the lease keeps it single). */
export const sweeperEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    (env.RESCUE_GOAL_SWEEPER || '').trim().toLowerCase() !== 'off';

/** `YYYY-MM-DD` (UTC) of `now`: the daily cap's day. */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** Next UTC midnight: when the daily cap resets. */
export function nextUtcMidnight(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** `YYYY-MM` budget months (decision #37). */
export const BUDGET_MONTH_PATTERN = /^20\d{2}-(0[1-9]|1[0-2])$/;

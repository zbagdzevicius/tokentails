/*
 * One eligibility policy table (plan F7.5), as pure functions. Every policy rejects guests before
 * anything else (F5.4), so a guest never learns more than "sign in first".
 *
 * | Action          | Requires                                                                           |
 * |-----------------|------------------------------------------------------------------------------------|
 * | Instant treat   | registered, email verified, account >= 24 h old, >= 1 saved game                   |
 * | Daily paw       | registered, email verified, >= 24 h old at settlement, >= 2 /live rows with        |
 * |                 | points > 0 at least 3 minutes apart that UTC day                                   |
 * | Goal pledge     | registered, account >= 72 h old, >= 3 saved games (daily cap and per-user throttle |
 * |                 | are enforced by the pledge route itself)                                           |
 *
 * The instant-treat policy is wired into POST /shelter/donate now. The paw and pledge policies are
 * used by the nightly settlement and Rescue Goals when those land (tasks 4f and G5).
 */

export const HOUR_MS = 60 * 60 * 1000;
export const INSTANT_TREAT_MIN_AGE_MS = 24 * HOUR_MS;
export const INSTANT_TREAT_MIN_GAMES = 1;
export const DAILY_PAW_MIN_AGE_MS = 24 * HOUR_MS;
export const DAILY_PAW_MIN_RUNS = 2;
export const DAILY_PAW_MIN_GAP_MS = 3 * 60 * 1000;
export const PLEDGE_MIN_AGE_MS = 72 * HOUR_MS;
export const PLEDGE_MIN_GAMES = 3;

export type EligibilityReason =
    | 'guest'
    | 'email-unverified'
    | 'account-too-new'
    | 'no-saved-game'
    | 'not-enough-games'
    | 'not-enough-runs';

export interface EligibilityResult {
    eligible: boolean;
    reason: EligibilityReason | null;
    /** When a time-based requirement will be met, if that is the only thing missing. */
    eligibleAt?: string | null;
}

/** What the policies read from an account. Built from the request user; never persisted. */
export interface AccountFacts {
    isGuest: boolean;
    emailVerified: boolean;
    createdAt: Date | null;
}

export interface GamesFacts {
    /** Saved `/live` rows (any mode, any points). */
    savedGames: number;
}

export interface RunFacts {
    /** `/live` rows of the settlement's UTC day. */
    runs: { points?: number | null; createdAt: Date | string }[];
}

const ok = (): EligibilityResult => ({ eligible: true, reason: null });
const no = (reason: EligibilityReason, eligibleAt: Date | null = null): EligibilityResult => ({
    eligible: false,
    reason,
    eligibleAt: eligibleAt ? eligibleAt.toISOString() : null,
});

/** An account with an unknown creation time is treated as brand new. */
function ageCheck(facts: AccountFacts, minAgeMs: number, at: Date): EligibilityResult | null {
    const created = facts.createdAt ? new Date(facts.createdAt) : null;
    if (!created || Number.isNaN(created.getTime())) {
        return no('account-too-new');
    }
    const readyAt = new Date(created.getTime() + minAgeMs);
    return readyAt.getTime() > at.getTime() ? no('account-too-new', readyAt) : null;
}

export function instantTreatPolicy(facts: AccountFacts & GamesFacts, now: Date = new Date()): EligibilityResult {
    if (facts.isGuest) {
        return no('guest');
    }
    if (!facts.emailVerified) {
        return no('email-unverified');
    }
    const age = ageCheck(facts, INSTANT_TREAT_MIN_AGE_MS, now);
    if (age) {
        return age;
    }
    if ((facts.savedGames || 0) < INSTANT_TREAT_MIN_GAMES) {
        return no('no-saved-game');
    }
    return ok();
}

/** Qualifying runs: points > 0, and each counted run at least 3 minutes after the previous one. */
export function spacedScoringRuns(runs: RunFacts['runs'], minGapMs = DAILY_PAW_MIN_GAP_MS): number {
    const times = runs
        .filter(run => typeof run.points === 'number' && run.points > 0)
        .map(run => new Date(run.createdAt).getTime())
        .filter(time => !Number.isNaN(time))
        .sort((a, b) => a - b);
    let count = 0;
    let last = -Infinity;
    for (const time of times) {
        if (time - last >= minGapMs) {
            count++;
            last = time;
        }
    }
    return count;
}

export function dailyPawPolicy(facts: AccountFacts & RunFacts, settlementAt: Date): EligibilityResult {
    if (facts.isGuest) {
        return no('guest');
    }
    if (!facts.emailVerified) {
        return no('email-unverified');
    }
    const age = ageCheck(facts, DAILY_PAW_MIN_AGE_MS, settlementAt);
    if (age) {
        return age;
    }
    if (spacedScoringRuns(facts.runs || []) < DAILY_PAW_MIN_RUNS) {
        return no('not-enough-runs');
    }
    return ok();
}

export function rescueGoalPledgePolicy(facts: AccountFacts & GamesFacts, now: Date = new Date()): EligibilityResult {
    if (facts.isGuest) {
        return no('guest');
    }
    const age = ageCheck(facts, PLEDGE_MIN_AGE_MS, now);
    if (age) {
        return age;
    }
    if ((facts.savedGames || 0) < PLEDGE_MIN_GAMES) {
        return no('not-enough-games');
    }
    return ok();
}

/**
 * Account facts from the request user (a lean user document from AppAuthGuard). `emailVerifiedAt`
 * is written by the F5.2 resolution; until an account has it, it is not verified here.
 *
 * The account's age counts from the later of `createdAt` and `promotedAt`: a promoted guest's days
 * as a guest never count towards the 24 h or 72 h minimum (F5 rule: guests cannot farm rewards).
 */
export function accountFactsOf(user: Record<string, any> | null | undefined): AccountFacts {
    const dateOf = (value: unknown) => {
        const date = value ? new Date(value as string) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
    };
    const created = dateOf(user?.createdAt);
    const promoted = dateOf(user?.promotedAt);
    const since = created && promoted ? (promoted > created ? promoted : created) : created;
    return {
        isGuest: !user || !!user.isGuest || !!user.transient,
        emailVerified: !!user?.emailVerifiedAt,
        createdAt: since,
    };
}

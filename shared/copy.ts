/**
 * Currency vocabulary for the play layer (plan G5): Tails are rescue points, never a token.
 * Write "Tails", never "$TAILS"; the copy lint (plan F11) enforces it.
 *
 * Framework-free and TypeScript 4.8 compatible. Edit here, then run `node scripts/sync-contracts.mjs`.
 */

/** The currency name. It is a name, so it stays "Tails" for any amount, including 1. */
export const TAILS_WORD = 'Tails';

/** One-line definition shown wherever Tails are first explained. */
export const TAILS_DEFINITION =
    'Tails are rescue points. Earn them by playing. Give them to a shelter goal to choose what we fund next.';

/**
 * Small print. Per plan G5 it ships in UI only after the staking rule (P2) and the tier rewrite land.
 * Both landed on the backend in task 4e (flat cat nap, purchase-free tiers); the client renders it
 * once its half (task 5e) ships.
 */
export const TAILS_NO_CASH_VALUE = "Tails have no cash value. You can't buy, sell or withdraw them.";

/** Words the play layer must not use for Tails (the F11 lint seed; the lint itself owns the full list). */
export const TAILS_FORBIDDEN_WORDS = ['$TAILS'];

/**
 * Formats a Tails amount: whole numbers with thousands separators and the currency word,
 * e.g. `formatTails(1500)` is `"1,500 Tails"`. Fractions are truncated toward zero.
 * Non-finite input is shown as 0. Pass `{ word: false }` for the number alone.
 */
export function formatTails(amount: number, options: { word?: boolean } = {}): string {
    const value = Number.isFinite(amount) ? Math.trunc(amount) : 0;
    const sign = value < 0 ? '-' : '';
    const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const number = `${sign}${digits}`;
    if (options.word === false) {
        return number;
    }
    return `${number} ${TAILS_WORD}`;
}

/** "You got 500 Tails from Explorer Tier": the one wording for every backend Tails credit message. */
export function tailsRewardMessage(amount: number, source?: string): string {
    const got = `You got ${formatTails(amount)}`;
    return source ? `${got} from ${source}` : got;
}

/*
 * Cat nap (plan G5 P2, decision #35): a napping cat brings a flat 50 Tails after a week, whatever
 * its tier, and at most 3 cats nap at once. The backend enforces these numbers
 * (backend/src/cat/cat-staking.service.ts); the client states them.
 */
export const CAT_NAP_TAILS = 50;
export const CAT_NAP_MAX_CATS = 3;
export const CAT_NAP_DAYS = 7;

export const CAT_NAP_STARTED_MESSAGE = `Your cat is taking a nap. Come back in ${CAT_NAP_DAYS} days to collect ${formatTails(
    CAT_NAP_TAILS
)}.`;
export const CAT_NAP_RUNNING_MESSAGE = 'Your cat is still napping. Let it sleep a little longer.';
export const CAT_NAP_LIMIT_MESSAGE = `Up to ${CAT_NAP_MAX_CATS} cats can nap at once. Wake one up first.`;

/** Message of a collected nap. */
export function catNapPaidMessage(amount: number): string {
    return `Your cat woke up rested. ${tailsRewardMessage(amount)}.`;
}

/**
 * What `GET /user/token-status` reports (plan G5 Vault, decision #39). POINTS is the default and the
 * only mode until counsel approves the Vault notice; any fetch error means POINTS on the client.
 */
export const TAILS_MODES = ['POINTS', 'TOKEN'] as const;
export type TailsMode = typeof TAILS_MODES[number];
export const DEFAULT_TAILS_MODE: TailsMode = 'POINTS';

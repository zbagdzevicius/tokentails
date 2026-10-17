import { Logger } from '@nestjs/common';
import { stripeKeyAccountHint } from './rave.config';

/*
 * Closes the Moon Rave CARD tab (cats and ads, reason `stripe`) when card payments cannot work although
 * every key is set, so buyers see "card unavailable" and use crypto (USDC on Arc) instead of failing at
 * the last step:
 *
 * - Stripe refuses the secret key (authentication or permission error on PaymentIntent create): closed
 *   for RAVE_STRIPE_BROKEN_MS, then tried again.
 * - The publishable key belongs to another account than STRIPE_SECRET_KEY: every browser confirm would fail
 *   with "No such payment_intent". Checked with GET /v1/account (the secret key's own account) at most once
 *   per RAVE_STRIPE_ACCOUNT_CHECK_MS. Only a CLEAR mismatch closes card (the publishable key carries the
 *   account fragment and the account id does not contain it); an unreadable account or a key of another
 *   shape never does.
 *
 * State is per process (each instance learns on its own); nothing here is a feature flag.
 */

export const RAVE_STRIPE_BROKEN_MS = 5 * 60 * 1000;
export const RAVE_STRIPE_ACCOUNT_CHECK_MS = 60 * 60 * 1000;
const RAVE_STRIPE_ACCOUNT_RETRY_MS = 10 * 60 * 1000;

const logger = new Logger('RaveStripeHealth');
const state: {
    brokenUntil: number;
    account: { key: string; at: number; mismatch: boolean; retryAt: number } | null;
} = { brokenUntil: 0, account: null };

/** Tests only. */
export function resetRaveStripeHealth() {
    state.brokenUntil = 0;
    state.account = null;
}

/** True while card must stay closed (see the file comment). */
export function raveStripeBroken(publishableKey: string | null | undefined, now: number = Date.now()): boolean {
    if (state.brokenUntil > now) return true;
    return !!(publishableKey && state.account?.key === publishableKey && state.account.mismatch);
}

/** Called with a failed PaymentIntent create: an authentication or permission error closes card a while. */
export function noteRaveStripeError(error: unknown, now: Date = new Date()) {
    const e = error as { type?: string; statusCode?: number } | null;
    const auth =
        e?.type === 'StripeAuthenticationError' ||
        e?.type === 'StripePermissionError' ||
        e?.statusCode === 401 ||
        e?.statusCode === 403;
    if (!auth) return;
    if (state.brokenUntil <= now.getTime()) {
        logger.error('rave: Stripe refused the secret key; card checkout closed for 5 minutes (crypto stays open)');
    }
    state.brokenUntil = now.getTime() + RAVE_STRIPE_BROKEN_MS;
}

/** Reads the secret key's account (cached) and records whether the publishable key is of another account. */
export async function checkRaveStripeAccount(
    stripePayments: { stripe?: any } | undefined,
    cfg: { secretKeyMode: string | null; publishableKey: string | null },
    now: Date = new Date()
): Promise<void> {
    const pk = cfg.publishableKey;
    if (!cfg.secretKeyMode || !pk) return;
    const hint = stripeKeyAccountHint(pk);
    if (!hint) return;
    const t = now.getTime();
    const cached = state.account;
    if (cached && cached.key === pk && t < cached.retryAt) return;
    let id = '';
    try {
        const account = await stripePayments?.stripe?.accounts?.retrieve();
        id = String(account?.id || '');
    } catch {
        id = '';
    }
    if (!id) {
        // Unknown (a restricted key, a network error): never a gate; keep any earlier answer.
        state.account = {
            key: pk,
            at: t,
            mismatch: cached?.key === pk ? cached.mismatch : false,
            retryAt: t + RAVE_STRIPE_ACCOUNT_RETRY_MS,
        };
        return;
    }
    const mismatch = !id.includes(hint);
    if (mismatch && !(cached?.key === pk && cached.mismatch)) {
        logger.error(
            `rave: the publishable key is not of the secret key's Stripe account (${id}); card checkout closed. Set STRIPE_PUBLISHABLE_KEY.`
        );
    }
    state.account = { key: pk, at: t, mismatch, retryAt: t + RAVE_STRIPE_ACCOUNT_CHECK_MS };
}

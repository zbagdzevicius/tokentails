import { createHmac } from 'crypto';
import { badcatStripeKey, Env, isProduction, StripeKeyState } from 'src/badcat/badcat-flags';

/*
 * Pawlegends environment readers (POC.md §8.3; names in docs/BACKEND.md). No on/off switches: the store is always
 * on, and a part whose secret is missing answers 503 until it is set (the game still plays, the store button hides).
 * Nothing here reads a file: values come from process.env.
 */

export type { Env };
export { isProduction };

export const PAWLEGENDS_DEFAULT_PUBLIC_URL = 'https://tokentails.com';

/** `PAWLEGENDS_PUBLIC_URL` (else https://tokentails.com) without a trailing slash: where Checkout returns. */
export function pawlegendsPublicUrl(env: Env = process.env): string {
    const value = (env.PAWLEGENDS_PUBLIC_URL || '').trim() || PAWLEGENDS_DEFAULT_PUBLIC_URL;
    return value.replace(/\/+$/, '');
}

/**
 * `PAWLEGENDS_STRIPE_SECRET_KEY`, else the shared `STRIPE_SECRET_KEY`, with the Bad Cat mode rule: a live key only
 * with NODE_ENV=production, a test key only outside it.
 */
export function pawlegendsStripeKey(env: Env = process.env): StripeKeyState {
    return badcatStripeKey({
        NODE_ENV: env.NODE_ENV,
        BADCAT_STRIPE_SECRET_KEY: env.PAWLEGENDS_STRIPE_SECRET_KEY,
        STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    });
}

/** `PAWLEGENDS_STRIPE_WEBHOOK_SECRET`; without it no payment could be confirmed, so checkout answers 503. */
export const pawlegendsWebhookSecret = (env: Env = process.env) =>
    (env.PAWLEGENDS_STRIPE_WEBHOOK_SECRET || '').trim() || null;

/** Fixed label of the derived entitlement key; changing it invalidates every token. */
export const PAWLEGENDS_ENTITLEMENT_LABEL = 'tokentails:pawlegends:entitlement:v1';

/** `PAWLEGENDS_ENTITLEMENT_SECRET`, else HMAC-SHA256(INVALIDATE_CACHE_SECRET, label), else null (503). */
export function pawlegendsEntitlementSecret(env: Env = process.env): string | null {
    const own = (env.PAWLEGENDS_ENTITLEMENT_SECRET || '').trim();
    if (own) return own;
    const shared = (env.INVALIDATE_CACHE_SECRET || '').trim();
    if (!shared) return null;
    return createHmac('sha256', shared).update(PAWLEGENDS_ENTITLEMENT_LABEL).digest('base64url');
}

/** Checkout can take money only when the key, the webhook secret and the entitlement key all exist. */
export const pawlegendsCheckoutReady = (env: Env = process.env) =>
    pawlegendsStripeKey(env).usable && !!pawlegendsWebhookSecret(env) && !!pawlegendsEntitlementSecret(env);

export const pawlegendsEmailReady = (env: Env = process.env) => !!(env.SENDGRID_API_KEY || '').trim();

/**
 * The restore and notify links in the HTTP answer, for local testing only: the explicit
 * `PAWLEGENDS_DEV_LINKS=true`, never with NODE_ENV=production.
 */
export const pawlegendsDevLinksAllowed = (env: Env = process.env) =>
    !isProduction(env) && env.PAWLEGENDS_DEV_LINKS === 'true';

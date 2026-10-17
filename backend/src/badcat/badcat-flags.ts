import { createHmac } from 'crypto';

/*
 * Bad Cat Daily (badcat) environment readers. There are no on/off switches: every feature is on, and a feature
 * that needs a secret (Stripe, webhook, VAPID, SendGrid) reports not-ready in GET /badcat/status and answers
 * 503 (or skips its cron) until the secret is set. Nothing here reads a file: values come from process.env
 * (names in docs/BACKEND.md).
 */

export type Env = NodeJS.ProcessEnv;

const on = (env: Env, name: string) => env[name] === 'true';

/**
 * BADCAT_FEED_AUTO_APPROVE (moderation policy, default off): a room that passes every server check is listed
 * without waiting for an admin.
 */
export const badcatFeedAutoApprove = (env: Env = process.env) => on(env, 'BADCAT_FEED_AUTO_APPROVE');

export const isProduction = (env: Env = process.env) => env.NODE_ENV === 'production';

export const DEFAULT_PUBLIC_URL = 'https://tokentails.com';

/** `BADCAT_PUBLIC_URL` without a trailing slash (default https://tokentails.com). */
export function badcatPublicUrl(env: Env = process.env): string {
    const value = (env.BADCAT_PUBLIC_URL || '').trim() || DEFAULT_PUBLIC_URL;
    return value.replace(/\/+$/, '');
}

export interface StripeKeyState {
    key?: string;
    /** A key of the mode this server may use is set (live in production, test elsewhere). */
    usable: boolean;
    /** The key is a test key (sk_test_ / rk_test_). */
    testMode: boolean;
    /** missing: no key; unknown_prefix: not a secret or restricted key; mode: only a key of the wrong mode is set. */
    reason?: 'missing' | 'unknown_prefix' | 'mode';
}

const keyMode = (key: string): 'test' | 'live' | null =>
    /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : null;

/**
 * `BADCAT_STRIPE_SECRET_KEY`, else the shared `STRIPE_SECRET_KEY`, taking the first one whose mode this server
 * may use: a live key only with NODE_ENV=production (a staging or local server never takes real money, as in
 * rave) and a test key only outside production (a test payment would grant real entitlements there). So a
 * leftover test BADCAT_STRIPE_SECRET_KEY in production is skipped in favour of the live shared key.
 */
export function badcatStripeKey(env: Env = process.env): StripeKeyState {
    const wanted = isProduction(env) ? 'live' : 'test';
    const keys = [env.BADCAT_STRIPE_SECRET_KEY, env.STRIPE_SECRET_KEY]
        .map(value => (value || '').trim())
        .filter(Boolean);
    if (!keys.length) return { usable: false, testMode: false, reason: 'missing' };
    const key = keys.find(candidate => keyMode(candidate) === wanted);
    if (key) return { key, usable: true, testMode: wanted === 'test' };
    if (keys.some(candidate => keyMode(candidate))) return { usable: false, testMode: false, reason: 'mode' };
    return { usable: false, testMode: false, reason: 'unknown_prefix' };
}

/** Mandatory for checkout: without it no payment could be confirmed, so checkout answers 503. */
export const badcatWebhookSecret = (env: Env = process.env) => (env.BADCAT_STRIPE_WEBHOOK_SECRET || '').trim() || null;

/** Fixed label for the entitlement key derived from INVALIDATE_CACHE_SECRET; changing it logs every buyer out. */
export const ENTITLEMENT_SECRET_LABEL = 'tokentails:badcat:entitlement:v1';

/**
 * `BADCAT_ENTITLEMENT_SECRET`, else HMAC-SHA256(INVALIDATE_CACHE_SECRET, ENTITLEMENT_SECRET_LABEL) (an existing
 * server secret, as the shelter and AI upload salts use; the HMAC keeps it one-way), else null (503).
 */
export function badcatEntitlementSecret(env: Env = process.env): string | null {
    const own = (env.BADCAT_ENTITLEMENT_SECRET || '').trim();
    if (own) return own;
    const shared = (env.INVALIDATE_CACHE_SECRET || '').trim();
    if (!shared) return null;
    return createHmac('sha256', shared).update(ENTITLEMENT_SECRET_LABEL).digest('base64url');
}

/** Checkout can take money only when the key, the webhook secret (to confirm it) and the entitlement key exist. */
export const badcatCheckoutReady = (env: Env = process.env) =>
    badcatStripeKey(env).usable && !!badcatWebhookSecret(env) && !!badcatEntitlementSecret(env);

export const sendgridConfigured = (env: Env = process.env) => !!(env.SENDGRID_API_KEY || '').trim();

/**
 * The restore `devLink` (the magic link in the HTTP answer) for local testing: only with the explicit
 * `BADCAT_RESTORE_DEV_LINK=true` and never with NODE_ENV=production. A staging server never hands one out.
 */
export const restoreDevLinkAllowed = (env: Env = process.env) =>
    !isProduction(env) && on(env, 'BADCAT_RESTORE_DEV_LINK');

/** Web push (VAPID, RFC 8292): the P-256 key pair as base64url (public 65 bytes uncompressed, private 32 bytes). */
export interface VapidKeys {
    publicKey: string;
    privateKey: string;
    subject: string;
}

/** `BADCAT_VAPID_PUBLIC_KEY`, `BADCAT_VAPID_PRIVATE_KEY`, `BADCAT_VAPID_SUBJECT` (mailto: or https:), or null. */
export function badcatVapidKeys(env: Env = process.env): VapidKeys | null {
    const publicKey = (env.BADCAT_VAPID_PUBLIC_KEY || '').trim();
    const privateKey = (env.BADCAT_VAPID_PRIVATE_KEY || '').trim();
    const subject = (env.BADCAT_VAPID_SUBJECT || '').trim() || 'mailto:hello@tokentails.com';
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(publicKey) || !/^[A-Za-z0-9_-]{40,50}$/.test(privateKey)) return null;
    if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
    return { publicKey, privateKey, subject };
}

/**
 * Where short links point: `BADCAT_SHORT_LINK_BASE` (e.g. https://api.tokentails.com, the origin that serves
 * /badcat/s/:id), else the backend's own origin from BADCAT_API_PUBLIC_URL, else https://api.tokentails.com.
 */
export function badcatShortLinkBase(env: Env = process.env): string {
    const value =
        (env.BADCAT_SHORT_LINK_BASE || env.BADCAT_API_PUBLIC_URL || '').trim() || 'https://api.tokentails.com';
    return value.replace(/\/+$/, '');
}

/*
 * Bad Cat Daily (badcat) environment readers. Every flag defaults off; only the exact string 'true'
 * switches one on. Nothing here reads a file: values come from process.env (names in docs/BACKEND.md).
 */

export type Env = NodeJS.ProcessEnv;

const on = (env: Env, name: string) => env[name] === 'true';

export interface BadcatFlags {
    enabled: boolean;
    checkout: boolean;
    cameos: boolean;
    gifts: boolean;
    brand: boolean;
    faceUploads: boolean;
    restoreEmail: boolean;
    seenEmail: boolean;
    creatorCodes: boolean;
    typedRedirect: boolean;
    // ----- Phase 2 (GDD 10, 17.3) -----
    /** BADCAT_SCORES_ENABLED: ranked runs save through the one score route (`/live` in the user module) (type BAD_CAT). */
    scores: boolean;
    /** BADCAT_BOARDS_ENABLED: GET /badcat/board/:day (top 100, registered players only). */
    boards: boolean;
    /** BADCAT_ACCOUNTS_ENABLED: GET /badcat/account, purchase claim by verified email, /yourcat face import. */
    accounts: boolean;
    /** BADCAT_SHORT_LINKS_ENABLED: POST /badcat/link, GET /badcat/s/:id (OG page) and /badcat/og/:id.png. */
    shortLinks: boolean;
    /** BADCAT_FEED_ENABLED: POST /badcat/room, GET /badcat/feed (rooms wait for review unless auto-approve). */
    feed: boolean;
    /** BADCAT_FEED_AUTO_APPROVE: a room that passes every server check is listed without review. */
    feedAutoApprove: boolean;
    /** BADCAT_METER_ENABLED: GET /badcat/meter (this month's Pink Paw share from purchases). */
    meter: boolean;
    /** BADCAT_PUSH_ENABLED: web-push daily reminders (needs the BADCAT_VAPID_* keys). */
    push: boolean;
    /** BADCAT_STREAK_EMAIL_ENABLED: opt-in "your streak ends tonight" email (needs SendGrid). */
    streakEmail: boolean;
    /** BADCAT_CREATOR_DASHBOARD_ENABLED: GET /badcat/creator/me for a signed-in creator. */
    creatorDashboard: boolean;
}

/** Every feature flag ANDed with the master switch `BADCAT_ENABLED`. */
export function badcatFlags(env: Env = process.env): BadcatFlags {
    const enabled = on(env, 'BADCAT_ENABLED');
    const flag = (name: string) => enabled && on(env, name);
    return {
        enabled,
        checkout: flag('BADCAT_CHECKOUT_ENABLED'),
        cameos: flag('BADCAT_CAMEOS_ENABLED'),
        gifts: flag('BADCAT_GIFTS_ENABLED'),
        brand: flag('BADCAT_BRAND_ENABLED'),
        faceUploads: flag('BADCAT_FACE_UPLOADS_ENABLED'),
        restoreEmail: flag('BADCAT_RESTORE_EMAIL_ENABLED'),
        seenEmail: flag('BADCAT_SEEN_EMAIL_ENABLED'),
        creatorCodes: flag('BADCAT_CREATOR_CODES_ENABLED'),
        typedRedirect: flag('BADCAT_TYPED_REDIRECT_ENABLED'),
        scores: flag('BADCAT_SCORES_ENABLED'),
        boards: flag('BADCAT_BOARDS_ENABLED'),
        accounts: flag('BADCAT_ACCOUNTS_ENABLED'),
        shortLinks: flag('BADCAT_SHORT_LINKS_ENABLED'),
        feed: flag('BADCAT_FEED_ENABLED'),
        feedAutoApprove: flag('BADCAT_FEED_ENABLED') && on(env, 'BADCAT_FEED_AUTO_APPROVE'),
        meter: flag('BADCAT_METER_ENABLED'),
        push: flag('BADCAT_PUSH_ENABLED'),
        streakEmail: flag('BADCAT_STREAK_EMAIL_ENABLED'),
        creatorDashboard: flag('BADCAT_CREATOR_DASHBOARD_ENABLED'),
    };
}

export const isProduction = (env: Env = process.env) => env.NODE_ENV === 'production';

export const DEFAULT_PUBLIC_URL = 'https://tokentails.com';

/** `BADCAT_PUBLIC_URL` without a trailing slash (default https://tokentails.com). */
export function badcatPublicUrl(env: Env = process.env): string {
    const value = (env.BADCAT_PUBLIC_URL || '').trim() || DEFAULT_PUBLIC_URL;
    return value.replace(/\/+$/, '');
}

export interface StripeKeyState {
    key?: string;
    /** A key is set and allowed (a test key, or a live key with BADCAT_STRIPE_ALLOW_LIVE=true). */
    usable: boolean;
    /** The key is a test key (sk_test_ / rk_test_). */
    testMode: boolean;
    reason?: 'missing' | 'live_refused' | 'unknown_prefix';
}

/**
 * `BADCAT_STRIPE_SECRET_KEY` only (never `STRIPE_SECRET_KEY`). A live key (sk_live_ / rk_live_) is refused
 * unless `BADCAT_STRIPE_ALLOW_LIVE=true` (a founder decision, never set in this build).
 */
export function badcatStripeKey(env: Env = process.env): StripeKeyState {
    const key = (env.BADCAT_STRIPE_SECRET_KEY || '').trim();
    if (!key) return { usable: false, testMode: false, reason: 'missing' };
    if (/^(sk|rk)_test_/.test(key)) return { key, usable: true, testMode: true };
    if (/^(sk|rk)_live_/.test(key)) {
        return on(env, 'BADCAT_STRIPE_ALLOW_LIVE')
            ? { key, usable: true, testMode: false }
            : { usable: false, testMode: false, reason: 'live_refused' };
    }
    return { usable: false, testMode: false, reason: 'unknown_prefix' };
}

export const badcatWebhookSecret = (env: Env = process.env) => (env.BADCAT_STRIPE_WEBHOOK_SECRET || '').trim() || null;
export const badcatEntitlementSecret = (env: Env = process.env) => (env.BADCAT_ENTITLEMENT_SECRET || '').trim() || null;
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

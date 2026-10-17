/*
 * Moon Rave checkout config (cat-rave/CHECKOUT-SPEC.md sections 4, 8, 9). No on/off flag: the card tab is
 * open whenever STRIPE_SECRET_KEY, a publishable key of the same mode and the shelter keeper resolve
 * (RaveService.cardReason), and the USDC tab (Arc only) whenever an Arc split qualifies
 * (RaveService.usdcChains). Neither needs the other. Secrets are never returned: only whether a key is set
 * and its mode.
 *
 * No new env is needed for card payments in production:
 * - Publishable key: STRIPE_PUBLISHABLE_KEY when set, else RAVE_PUBLIC_STRIPE_PK_LIVE (the live key the
 *   tokentails.com client already ships in its public bundle) when the secret key is live and
 *   NODE_ENV=production. A test secret key with no publishable key keeps card checkout closed.
 * - Webhook secret: optional. RAVE_STRIPE_WEBHOOK_SECRET, else STRIPE_WEBHOOK_SECRET (only useful if that
 *   endpoint's secret is the one Stripe signs /rave/stripe/webhook deliveries with). Without either,
 *   payments are confirmed by the Events API pull (RaveWebhookService.pullEvents, every minute) and the
 *   buyer's GET fallback.
 */

/**
 * The live publishable key of the Token Tails Stripe account. Public by design: it is inlined into the
 * tokentails.com client bundle (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, components/web3/StripePayment.tsx),
 * which confirms the PaymentIntents the backend creates with STRIPE_SECRET_KEY, so the two belong to the
 * same account. Read from the live bundle on 2026-10-17.
 */
export const RAVE_PUBLIC_STRIPE_PK_LIVE =
    'pk_live_51SHsEzQ3sukDo4Y0X5vltjlHzKfBYESoXE31bKZFoucWBTWsch6HtjjDI8QhRrwyoHRdtOXUlWfP9O8dcf6ookVB00VDirS7H4';

/** Arc mainnet and Arc testnet: the only chains the rave (cats and ads) takes crypto on. */
export const RAVE_USDC_CHAIN_IDS: readonly number[] = Object.freeze([5042, 5042002]);

export type StripeKeyMode = 'live' | 'test';

export interface RaveConfig {
    /** Stripe percentage fee in basis points (default 290 = 2.9 %). */
    feePercentBps: number;
    /** Stripe fixed fee in cents (default 30). */
    feeFixedCents: number;
    /** Most cats one order can buy (default 500). */
    maxCats: number;
    /** Paid donations per UTC day plus unpaid orders of the last 15 min, in whole USD (default 100). */
    dailyCapUsd: number;
    /** Unpaid orders created in the last 15 min above which checkout pauses (card-testing brake; env name kept). */
    createdPerHour: number;
    /** Mode of STRIPE_SECRET_KEY, null when unset or unrecognised. */
    secretKeyMode: StripeKeyMode | null;
    publishableKey: string | null;
    publishableKeyMode: StripeKeyMode | null;
    /** Optional push-webhook signing secret; null means confirmation by the Events API pull only. */
    webhookSecret: string | null;
    /** How payments are confirmed: the signed push webhook (plus the pull), or the Events API pull alone. */
    confirm: 'webhook' | 'events';
    production: boolean;
}

export const RAVE_DEFAULTS = Object.freeze({
    feePercentBps: 290,
    feeFixedCents: 30,
    maxCats: 500,
    dailyCapUsd: 100,
    createdPerHour: 200,
});

/** A whole number in [min, max], else the fallback. */
function int(value: string | undefined, fallback: number, min: number, max: number): number {
    const trimmed = (value || '').trim();
    if (!/^\d{1,9}$/.test(trimmed)) return fallback;
    const n = Number(trimmed);
    return n >= min && n <= max ? n : fallback;
}

export function stripeSecretKeyMode(key: string | undefined): StripeKeyMode | null {
    const k = (key || '').trim();
    if (/^(sk|rk)_live_/.test(k)) return 'live';
    if (/^(sk|rk)_test_/.test(k)) return 'test';
    return null;
}

export function stripePublishableKeyMode(key: string | undefined): StripeKeyMode | null {
    const k = (key || '').trim();
    if (k.startsWith('pk_live_')) return 'live';
    if (k.startsWith('pk_test_')) return 'test';
    return null;
}

/**
 * STRIPE_PUBLISHABLE_KEY when set; else the public live key, only for a live secret key in production.
 */
export function resolvePublishableKey(
    env: NodeJS.ProcessEnv,
    secretMode: StripeKeyMode | null,
    production: boolean
): string | null {
    const set = (env.STRIPE_PUBLISHABLE_KEY || '').trim();
    if (set) return set;
    return secretMode === 'live' && production ? RAVE_PUBLIC_STRIPE_PK_LIVE : null;
}

/** RAVE_STRIPE_WEBHOOK_SECRET, else STRIPE_WEBHOOK_SECRET, else null. */
export const resolveWebhookSecret = (env: NodeJS.ProcessEnv): string | null =>
    (env.RAVE_STRIPE_WEBHOOK_SECRET || '').trim() || (env.STRIPE_WEBHOOK_SECRET || '').trim() || null;

/**
 * The account fragment Stripe keys of the newer format carry after `_51` (an undocumented format, so it
 * only feeds a warning log, never a gate). Null when the key does not have that shape.
 */
export function stripeKeyAccountHint(key: string | null | undefined): string | null {
    const m = /^(?:sk|rk|pk)_(?:live|test)_51([A-Za-z0-9]{14})/.exec((key || '').trim());
    return m ? m[1] : null;
}

export function readRaveConfig(env: NodeJS.ProcessEnv = process.env): RaveConfig {
    const production = (env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const secretKeyMode = stripeSecretKeyMode(env.STRIPE_SECRET_KEY);
    const publishableKey = resolvePublishableKey(env, secretKeyMode, production);
    const webhookSecret = resolveWebhookSecret(env);
    return {
        feePercentBps: int(env.RAVE_FEE_PERCENT_BPS, RAVE_DEFAULTS.feePercentBps, 0, 2000),
        feeFixedCents: int(env.RAVE_FEE_FIXED_CENTS, RAVE_DEFAULTS.feeFixedCents, 0, 500),
        maxCats: int(env.RAVE_MAX_CATS, RAVE_DEFAULTS.maxCats, 10, 10000),
        dailyCapUsd: int(env.RAVE_DAILY_CAP_USD, RAVE_DEFAULTS.dailyCapUsd, 0, 1000000),
        createdPerHour: int(env.RAVE_CREATED_PER_HOUR, RAVE_DEFAULTS.createdPerHour, 1, 100000),
        secretKeyMode,
        publishableKey,
        publishableKeyMode: stripePublishableKeyMode(publishableKey || undefined),
        webhookSecret,
        confirm: webhookSecret ? 'webhook' : 'events',
        production,
    };
}

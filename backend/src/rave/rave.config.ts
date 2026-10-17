/*
 * Moon Rave checkout config (cat-rave/CHECKOUT-SPEC.md sections 4, 8, 9). Off unless
 * RAVE_CHECKOUT_ENABLED=true. Secrets are never returned: only whether a key is set and its mode.
 */

export type StripeKeyMode = 'live' | 'test';

export interface RaveConfig {
    enabled: boolean;
    usdcEnabled: boolean;
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
    webhookSecret: string | null;
    production: boolean;
}

export const RAVE_DEFAULTS = Object.freeze({
    feePercentBps: 290,
    feeFixedCents: 30,
    maxCats: 500,
    dailyCapUsd: 100,
    createdPerHour: 200,
});

const flag = (value: string | undefined) => (value || '').trim().toLowerCase() === 'true';

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

export function readRaveConfig(env: NodeJS.ProcessEnv = process.env): RaveConfig {
    const publishableKey = (env.STRIPE_PUBLISHABLE_KEY || '').trim() || null;
    return {
        enabled: flag(env.RAVE_CHECKOUT_ENABLED),
        usdcEnabled: flag(env.RAVE_USDC_ENABLED),
        feePercentBps: int(env.RAVE_FEE_PERCENT_BPS, RAVE_DEFAULTS.feePercentBps, 0, 2000),
        feeFixedCents: int(env.RAVE_FEE_FIXED_CENTS, RAVE_DEFAULTS.feeFixedCents, 0, 500),
        maxCats: int(env.RAVE_MAX_CATS, RAVE_DEFAULTS.maxCats, 10, 10000),
        dailyCapUsd: int(env.RAVE_DAILY_CAP_USD, RAVE_DEFAULTS.dailyCapUsd, 0, 1000000),
        createdPerHour: int(env.RAVE_CREATED_PER_HOUR, RAVE_DEFAULTS.createdPerHour, 1, 100000),
        secretKeyMode: stripeSecretKeyMode(env.STRIPE_SECRET_KEY),
        publishableKey,
        publishableKeyMode: stripePublishableKeyMode(publishableKey || undefined),
        webhookSecret: (env.RAVE_STRIPE_WEBHOOK_SECRET || '').trim() || null,
        production: (env.NODE_ENV || '').trim().toLowerCase() === 'production',
    };
}

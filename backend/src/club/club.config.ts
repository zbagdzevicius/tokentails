import { createHmac } from 'crypto';
import { ClientIpThrottleOptions } from 'src/shared/guards/client-ip-throttler.guard';
import {
    resolvePublishableKey,
    StripeKeyMode,
    stripePublishableKeyMode,
    stripeSecretKeyMode,
} from 'src/rave/rave.config';

/*
 * Tails Club (monthly or yearly membership, half of every payment to Pink Paw) config. No on/off flag: the
 * club is open whenever every required value below is set (clubMissing() is empty) and GET /club/status
 * could read both prices from Stripe. Nothing here is returned to a client except the publishable key.
 *
 * Required:
 * - STRIPE_SECRET_KEY (shared). Live only with NODE_ENV=production, test only elsewhere (the badcat-flags.ts
 *   rule): a staging box never takes real money and production never grants on a test payment.
 * - STRIPE_PUBLISHABLE_KEY, else the public live key the rave already uses (rave.config.ts), of the same mode.
 * - STRIPE_CLUB_PRICE_MONTH, STRIPE_CLUB_PRICE_YEAR: recurring USD prices, tax_behavior inclusive.
 * - CLUB_STRIPE_WEBHOOK_SECRET: the signing secret of POST /club/stripe/webhook.
 * - CLUB_TOKEN_SECRET, else an HMAC of INVALIDATE_CACHE_SECRET (the Bad Cat entitlement pattern).
 *
 * Optional: SENDGRID_API_KEY (only the emailed portal link needs it), CLUB_INCOMPLETE_PER_15MIN (card-testing
 * brake, default 30), CLUB_API_PUBLIC_URL (origin of the emailed /club/portal/open link).
 */

export type ClubPlan = 'month' | 'year';
export const CLUB_PLANS: readonly ClubPlan[] = Object.freeze(['month', 'year'] as ClubPlan[]);

/** Pink Paw's share of every club payment (founder decision 2026-10-20, 50/50). Not an env: it is promised in copy. */
export const CLUB_SHELTER_BPS = 5000;

/** Where the Stripe customer portal returns to. */
export const CLUB_RETURN_URL = 'https://tokentails.com/#club';

/** Fixed label for the token key derived from INVALIDATE_CACHE_SECRET; changing it voids every manage link. */
export const CLUB_TOKEN_SECRET_LABEL = 'tokentails:club:token:v1';

export const CLUB_DEFAULTS = Object.freeze({ incompletePer15Min: 30 });

const MINUTE = 60_000;
export const CLUB_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    status: { limit: 60, ttl: MINUTE },
    checkout: { limit: 6, ttl: 10 * MINUTE },
    subscription: { limit: 30, ttl: MINUTE },
    portal: { limit: 3, ttl: 60 * MINUTE },
    portalOpen: { limit: 10, ttl: 60 * MINUTE },
    me: { limit: 60, ttl: MINUTE },
};
/** Emailed portal links per address per day (counted on the canonical address, never revealed). */
export const CLUB_PORTAL_EMAILS_PER_DAY = 3;

export interface ClubConfig {
    production: boolean;
    /** Mode of a STRIPE_SECRET_KEY this server may use, null when unset or of the wrong mode. */
    secretKeyMode: StripeKeyMode | null;
    /** Why the secret key is not usable. */
    secretKeyReason?: 'missing' | 'unknown_prefix' | 'mode';
    publishableKey: string | null;
    publishableKeyMode: StripeKeyMode | null;
    prices: { month: string | null; year: string | null };
    webhookSecret: string | null;
    tokenSecret: string | null;
    sendgrid: boolean;
    incompletePer15Min: number;
    apiPublicUrl: string;
}

const PRICE_ID_RE = /^price_[A-Za-z0-9]{6,255}$/;

const priceId = (value: string | undefined): string | null => {
    const v = (value || '').trim();
    return PRICE_ID_RE.test(v) ? v : null;
};

/** A whole number in [min, max], else the fallback. */
function int(value: string | undefined, fallback: number, min: number, max: number): number {
    const trimmed = (value || '').trim();
    if (!/^\d{1,9}$/.test(trimmed)) return fallback;
    const n = Number(trimmed);
    return n >= min && n <= max ? n : fallback;
}

/** CLUB_TOKEN_SECRET, else HMAC-SHA256(INVALIDATE_CACHE_SECRET, CLUB_TOKEN_SECRET_LABEL), else null. */
export function clubTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
    const own = (env.CLUB_TOKEN_SECRET || '').trim();
    if (own) return own;
    const shared = (env.INVALIDATE_CACHE_SECRET || '').trim();
    if (!shared) return null;
    return createHmac('sha256', shared).update(CLUB_TOKEN_SECRET_LABEL).digest('base64url');
}

export function readClubConfig(env: NodeJS.ProcessEnv = process.env): ClubConfig {
    const production = (env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const rawKey = (env.STRIPE_SECRET_KEY || '').trim();
    const mode = stripeSecretKeyMode(rawKey);
    const wanted: StripeKeyMode = production ? 'live' : 'test';
    const secretKeyMode = mode === wanted ? mode : null;
    const secretKeyReason = secretKeyMode ? undefined : !rawKey ? 'missing' : mode ? 'mode' : 'unknown_prefix';
    const publishableKey = resolvePublishableKey(env, secretKeyMode, production);
    return {
        production,
        secretKeyMode,
        ...(secretKeyReason ? { secretKeyReason } : {}),
        publishableKey,
        publishableKeyMode: stripePublishableKeyMode(publishableKey || undefined),
        prices: { month: priceId(env.STRIPE_CLUB_PRICE_MONTH), year: priceId(env.STRIPE_CLUB_PRICE_YEAR) },
        webhookSecret: (env.CLUB_STRIPE_WEBHOOK_SECRET || '').trim() || null,
        tokenSecret: clubTokenSecret(env),
        sendgrid: !!(env.SENDGRID_API_KEY || '').trim(),
        incompletePer15Min: int(env.CLUB_INCOMPLETE_PER_15MIN, CLUB_DEFAULTS.incompletePer15Min, 1, 100000),
        apiPublicUrl: ((env.CLUB_API_PUBLIC_URL || '').trim() || 'https://api.tokentails.com').replace(/\/+$/, ''),
    };
}

/** The env names still missing (or unusable) for the club to open; empty when ready. */
export function clubMissing(cfg: ClubConfig): string[] {
    const missing: string[] = [];
    if (!cfg.secretKeyMode) missing.push('STRIPE_SECRET_KEY');
    if (!cfg.publishableKeyMode || cfg.publishableKeyMode !== cfg.secretKeyMode) missing.push('STRIPE_PUBLISHABLE_KEY');
    if (!cfg.prices.month) missing.push('STRIPE_CLUB_PRICE_MONTH');
    if (!cfg.prices.year) missing.push('STRIPE_CLUB_PRICE_YEAR');
    if (!cfg.webhookSecret) missing.push('CLUB_STRIPE_WEBHOOK_SECRET');
    if (!cfg.tokenSecret) missing.push('CLUB_TOKEN_SECRET');
    return missing;
}

/** Every required value is set (prices are still read from Stripe before GET /club/status says enabled). */
export const clubReady = (env: NodeJS.ProcessEnv = process.env) => clubMissing(readClubConfig(env)).length === 0;

export const clubPriceId = (cfg: ClubConfig, plan: ClubPlan): string | null => cfg.prices[plan];

/** The plan a price id belongs to, or null. */
export const clubPlanOfPrice = (cfg: ClubConfig, price: string | null | undefined): ClubPlan | null =>
    price && price === cfg.prices.month ? 'month' : price && price === cfg.prices.year ? 'year' : null;

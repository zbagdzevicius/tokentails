import { RAVE_DEFAULTS, stripePublishableKeyMode, stripeSecretKeyMode, StripeKeyMode } from '../rave.config';

/*
 * Moon Rave ad space config. No on/off flag: ads open whenever the config resolves
 * (RaveAdsService.readiness). Stripe keys and the webhook secret are
 * the rave checkout's (same PaymentIntent flow, same POST /rave/stripe/webhook). Ad money is Token Tails
 * revenue; RAVE_AD_SHELTER_BPS (default 0) routes a share of each approved ad to Pink Paw through the
 * shelter-share keeper (then those dollars become cats too).
 */

export const RAVE_AD_PRICE_CENTS = 10000;

export const RAVE_AD_DEFAULTS = Object.freeze({
    holdMinutes: 15,
    days: 30,
    shelterBps: 0,
});

export interface RaveAdsConfig {
    priceCents: number;
    holdMs: number;
    days: number;
    shelterBps: number;
    feePercentBps: number;
    feeFixedCents: number;
    secretKeyMode: StripeKeyMode | null;
    publishableKey: string | null;
    publishableKeyMode: StripeKeyMode | null;
    webhookSecret: string | null;
    production: boolean;
}

function int(value: string | undefined, fallback: number, min: number, max: number): number {
    const trimmed = (value || '').trim();
    if (!/^\d{1,9}$/.test(trimmed)) return fallback;
    const n = Number(trimmed);
    return n >= min && n <= max ? n : fallback;
}

export function readRaveAdsConfig(env: NodeJS.ProcessEnv = process.env): RaveAdsConfig {
    const publishableKey = (env.STRIPE_PUBLISHABLE_KEY || '').trim() || null;
    return {
        priceCents: RAVE_AD_PRICE_CENTS,
        holdMs: int(env.RAVE_AD_HOLD_MINUTES, RAVE_AD_DEFAULTS.holdMinutes, 5, 60) * 60 * 1000,
        days: int(env.RAVE_AD_DAYS, RAVE_AD_DEFAULTS.days, 1, 365),
        shelterBps: int(env.RAVE_AD_SHELTER_BPS, RAVE_AD_DEFAULTS.shelterBps, 0, 10000),
        feePercentBps: int(env.RAVE_FEE_PERCENT_BPS, RAVE_DEFAULTS.feePercentBps, 0, 2000),
        feeFixedCents: int(env.RAVE_FEE_FIXED_CENTS, RAVE_DEFAULTS.feeFixedCents, 0, 500),
        secretKeyMode: stripeSecretKeyMode(env.STRIPE_SECRET_KEY),
        publishableKey,
        publishableKeyMode: stripePublishableKeyMode(publishableKey || undefined),
        webhookSecret: (env.RAVE_STRIPE_WEBHOOK_SECRET || '').trim() || null,
        production: (env.NODE_ENV || '').trim().toLowerCase() === 'production',
    };
}

/** Card fee gross-up on a base price (same formula as raveQuote, cat-rave/CHECKOUT-SPEC.md section 8). */
export function raveAdQuote(
    coverFee: boolean,
    cfg: Pick<RaveAdsConfig, 'priceCents' | 'feePercentBps' | 'feeFixedCents'>
): { priceCents: number; feeCents: number; amountCents: number } {
    const priceCents = cfg.priceCents;
    if (!coverFee) return { priceCents, feeCents: 0, amountCents: priceCents };
    const num = (priceCents + cfg.feeFixedCents) * 10000;
    const den = 10000 - cfg.feePercentBps;
    const amountCents = Math.floor((num + den - 1) / den);
    return { priceCents, feeCents: amountCents - priceCents, amountCents };
}

/** Whole cents of an approved ad routed to Pink Paw (0 by default). */
export const raveAdShelterCents = (priceCents: number, bps: number) => Math.floor((priceCents * bps) / 10000);

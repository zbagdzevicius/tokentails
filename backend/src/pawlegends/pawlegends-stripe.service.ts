import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { normalizeEmail } from 'src/badcat/badcat-util';
import { STRIPE_API_VERSION } from 'src/payments/stripe-payment.service';
import Stripe from 'stripe';
import {
    AgeBand,
    effectiveBand,
    FOUNDER_LEGEND_CAP,
    isAgeBand,
    isPawlegendsCurrency,
    isCatalogSku,
    isPawlegendsSku,
    PAWLEGENDS_CONSENT_VERSIONS,
    PAWLEGENDS_STORE_TERMS_VERSION,
    PAWLEGENDS_MVP_TARGET,
    PAWLEGENDS_SKU_IDS,
    PAWLEGENDS_SKUS,
    PAWLEGENDS_LEGACY_TERMS_VERSION,
    PawlegendsCheckoutRequest,
    PawlegendsCheckoutResponse,
    PawlegendsCurrency,
    PawlegendsSku,
    SPEND_CAP_CENTS,
    SPEND_WINDOW_MS,
    stricterBand,
    UNDER_16_MESSAGE,
} from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { PawlegendsStore } from './pawlegends.schema';
import {
    Env,
    pawlegendsCanConfirmPayments,
    pawlegendsEntitlementSecret,
    pawlegendsPublicUrl,
    pawlegendsStripeKey,
} from './pawlegends-env';
import { verifyPawlegendsToken } from './pawlegends-token';
import { catalogSku, CATALOG_SKUS, championBundleCents, conflictsOf } from './pawlegends-catalog';
import { ownedItemsOf } from './pawlegends-season.service';

/*
 * Pawlegends Checkout (POC.md §8.2, §8.5). Key: `PAWLEGENDS_STRIPE_SECRET_KEY`, else the shared `STRIPE_SECRET_KEY`.
 * Checkout answers 503 until the key, PAWLEGENDS_STRIPE_WEBHOOK_SECRET and the entitlement key are all set, so no
 * payment is taken that could not be confirmed. Prices are inline `price_data` from PAWLEGENDS_SKUS in the requested
 * currency (VAT-inclusive); a price in the request is never read.
 *
 * Every checkout first writes a `pending` purchase row that holds its share of the buyer's spend cap and, for
 * Founder Legend, a seat, until the Checkout Session expires (31 minutes). The row is written before the checks
 * that count rows, so two racing checkouts cannot both take the last seat, the last of a cap, or a once-only SKU.
 *
 * An email is required (or a token with a verified email): the age band, the spend cap and the once-only SKUs
 * are kept with it (§8.5), and Stripe Checkout is opened with it locked (`customer_email`), so the email Stripe
 * collects is the one checked here. The age band is optional since Nov 12 (the sheets no longer ask): without an
 * answer the stored band applies, else DEFAULT_AGE_BAND (16-17, €30 per 30 days); a buyer is never blocked for not
 * answering. Store and pass checkouts need `consent: true`, sent when the buyer presses the sheet's purchase button
 * (the button is the express consent to delivery now and the end of the 14-day withdrawal right). The webhook checks again by the email Stripe reports (pawlegends-webhook).
 */

/** A Checkout Session stays open this long (Stripe's minimum is 30 minutes). */
export const SESSION_TTL_MS = 31 * 60 * 1000;
/** A hold outlives its session by this margin, so a late webhook still finds the row reserved. */
export const HOLD_MARGIN_MS = 10 * 60 * 1000;

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const isDeviceId = (value: unknown): value is string => typeof value === 'string' && DEVICE_ID.test(value);

/** Who is buying: every key a purchase can be matched by. */
export interface PawlegendsIdentity {
    email?: string | null;
    deviceId?: string | null;
    accountId?: string | null;
    /** Checkout Session ids an entitlement token speaks for. */
    sessionIds?: string[];
}

/** The keys an age band answer is kept under: the email, the device and the Token Tails account. */
export const bandKeys = (identity: PawlegendsIdentity): string[] =>
    [
        identity.email && `email:${identity.email}`,
        identity.deviceId && `device:${identity.deviceId}`,
        identity.accountId && `account:${identity.accountId}`,
    ].filter(Boolean) as string[];

/** `$or` clauses matching any of the identity's keys (empty when it has none). */
export function identityClauses(identity: PawlegendsIdentity): Record<string, unknown>[] {
    const clauses: Record<string, unknown>[] = [];
    if (identity.email) clauses.push({ email: identity.email });
    if (identity.deviceId) clauses.push({ deviceId: identity.deviceId });
    if (identity.accountId) clauses.push({ accountId: identity.accountId });
    if (identity.sessionIds?.length) clauses.push({ sessionId: { $in: identity.sessionIds } });
    return clauses;
}

/** Purchases that count: paid, or pending while their session can still be paid. */
export const activeFilter = (now: Date) => ({
    $or: [{ status: 'paid' }, { status: 'pending', holdUntil: { $gt: now } }],
});

/**
 * SKUs one buyer may hold only one of (§8.1): the starter, Founder, and one Founder Legend seat (bought or
 * upgraded). Null for a SKU without a limit.
 */
export function onceGroup(sku: PawlegendsSku): PawlegendsSku[] | null {
    // Store and pass SKUs: once per account, with the sets that overlap them and the overlapping pass SKUs.
    if (isCatalogSku(sku)) return conflictsOf(sku);
    if (PAWLEGENDS_SKUS[sku].legendSeat) return PAWLEGENDS_SKU_IDS.filter(id => PAWLEGENDS_SKUS[id].legendSeat);
    if (sku === 'pl_starter' || sku === 'pl_founder') return [sku];
    return null;
}

/** Cap amount of a price: euro cents, USD at a fixed €1 = $1. */
export const capCentsOf = (sku: PawlegendsSku, currency: PawlegendsCurrency) => PAWLEGENDS_SKUS[sku].cents[currency];

/** The Stripe metadata of a checkout (strings only). */
export function checkoutMetadata(
    req: Pick<PawlegendsCheckoutRequest, 'sku' | 'currency' | 'ageBand' | 'consentVersion' | 'deviceId' | 'consent'>,
    holdId: string,
    accountId?: string | null,
    extra: { band?: AgeBand; ageSource?: 'answer' | 'default'; consentAt?: string } = {}
): Record<string, string> {
    const store = isCatalogSku(req.sku);
    const band = extra.band ?? req.ageBand;
    return {
        pawlegends: '1',
        sku: req.sku,
        currency: req.currency,
        ...(band ? { age_band: band } : {}),
        ...(extra.ageSource ? { age_source: extra.ageSource } : {}),
        terms_version: store ? PAWLEGENDS_STORE_TERMS_VERSION : PAWLEGENDS_LEGACY_TERMS_VERSION,
        consent_version: req.consentVersion,
        // the purchase button is the consent: immediate delivery, the withdrawal right ends at delivery (art. 16(m))
        ...(store && req.consent === true
            ? { withdrawal_consent: 'buy_button', ...(extra.consentAt ? { consent_at: extra.consentAt } : {}) }
            : {}),
        ...(store ? {} : { deferred: PAWLEGENDS_MVP_TARGET }),
        device: req.deviceId,
        hold: holdId,
        ...(accountId ? { account: accountId } : {}),
    };
}

/** Stripe Checkout Session parameters for a validated request (pure). */
export function buildCheckoutParams(
    req: PawlegendsCheckoutRequest,
    options: {
        returnBase: string;
        email?: string | null;
        holdId: string;
        expiresAt: number;
        accountId?: string | null;
        /** A champion bundle's prorated price for this account (CHAMPION-STORE.md §5); else the SKU price. */
        amountCents?: number;
        /** The band applied (the stored or answered one, else DEFAULT_AGE_BAND) and where it came from. */
        band?: AgeBand;
        ageSource?: 'answer' | 'default';
        /** ISO time the purchase button (the consent) was pressed, as the server received it. */
        consentAt?: string;
    }
): Stripe.Checkout.SessionCreateParams {
    const def = PAWLEGENDS_SKUS[req.sku];
    const metadata = checkoutMetadata(req, options.holdId, options.accountId, {
        band: options.band,
        ageSource: options.ageSource,
        consentAt: options.consentAt,
    });
    const description = def.kind
        ? `${def.deliveredNow}.`
        : `Now: ${def.deliveredNow}. At MVP launch (target ${PAWLEGENDS_MVP_TARGET}): ${def.deliveredAtMvp}.`;
    return {
        mode: 'payment',
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: req.currency,
                    unit_amount: options.amountCents ?? def.cents[req.currency],
                    tax_behavior: 'inclusive',
                    product_data: {
                        name: def.label,
                        description,
                    },
                },
            },
        ],
        success_url: `${options.returnBase}/pawlegends?checkout=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${options.returnBase}/pawlegends?checkout=cancel`,
        metadata,
        payment_intent_data: { metadata },
        customer_creation: 'always',
        expires_at: Math.floor(options.expiresAt / 1000),
        ...(options.email ? { customer_email: options.email } : {}),
    };
}

@Injectable()
export class PawlegendsStripeService {
    private readonly logger = new Logger(PawlegendsStripeService.name);
    private client?: { key: string; stripe: Stripe };
    /** Replaceable in specs (no network there). */
    createClient: (key: string) => Stripe = key => new Stripe(key, { apiVersion: STRIPE_API_VERSION });
    now: () => Date = () => new Date();
    /** Specs of the presale flow only: the retired `pl_*` SKUs are refused at checkout everywhere else. */
    sellRetired = false;

    constructor(private readonly store: PawlegendsStore) {}

    /** The Pawlegends Stripe client; 503 without a usable key (missing, unknown prefix, or the wrong mode here). */
    stripe(env: Env = process.env): Stripe {
        const state = pawlegendsStripeKey(env);
        if (!state.usable || !state.key) throw PAWLEGENDS_ERRORS.stripeUnavailable();
        if (!this.client || this.client.key !== state.key) {
            this.client = { key: state.key, stripe: this.createClient(state.key) };
        }
        return this.client.stripe;
    }

    // -----------------------------------------------------------------------------------------------------------
    // Ledger

    /** SKUs the identity has paid for (not refunded). */
    async ownedSkus(identity: PawlegendsIdentity): Promise<Set<PawlegendsSku>> {
        const clauses = identityClauses(identity);
        if (!clauses.length) return new Set();
        const rows = (await this.store.purchases.find({ status: 'paid', $or: clauses }).lean()) as any[];
        return new Set(rows.map(row => row.sku).filter(isPawlegendsSku));
    }

    /** SKUs the identity has paid for or holds an open session of. */
    async activeSkus(identity: PawlegendsIdentity): Promise<Set<PawlegendsSku>> {
        const clauses = identityClauses(identity);
        if (!clauses.length) return new Set();
        const rows = (await this.store.purchases
            .find({ $and: [activeFilter(this.now()), { $or: clauses }] })
            .lean()) as any[];
        return new Set(rows.map(row => row.sku).filter(isPawlegendsSku));
    }

    /**
     * Rolling-30-day spend in euro cents: the largest total over the identity's keys taken one at a time (the
     * strictest match wins), counting paid and still-open purchases.
     */
    async spentCents(identity: PawlegendsIdentity, exceptSessionId?: string): Promise<number> {
        const since = new Date(this.now().getTime() - SPEND_WINDOW_MS);
        let max = 0;
        for (const clause of identityClauses({ ...identity, sessionIds: [] })) {
            const rows = (
                (await this.store.purchases
                    .find({ $and: [activeFilter(this.now()), clause, { createdAt: { $gt: since } }] })
                    .lean()) as any[]
            ).filter(row => row.sessionId !== exceptSessionId);
            max = Math.max(
                max,
                rows.reduce((sum, row) => sum + (Number(row.capCents) || 0), 0)
            );
        }
        return max;
    }

    /** The stored age band of the email, the device or the account (the strictest one), if any. */
    async storedBand(identity: PawlegendsIdentity): Promise<AgeBand | undefined> {
        const keys = bandKeys(identity);
        let band: AgeBand | undefined;
        for (const key of keys) {
            const row = (await this.store.buyers.findOne({ key }).lean()) as any;
            if (row && isAgeBand(row.ageBand)) band = stricterBand(band, row.ageBand);
        }
        return band;
    }

    /** Stores the first age band answer with the email, the device and the account; a younger later answer replaces it. */
    async rememberBand(identity: PawlegendsIdentity, band: AgeBand): Promise<void> {
        const keys = bandKeys(identity);
        for (const key of keys) {
            const row = (await this.store.buyers.findOne({ key }).lean()) as any;
            const next = stricterBand(isAgeBand(row?.ageBand) ? row.ageBand : undefined, band)!;
            if (row?.ageBand === next) continue;
            await this.store.buyers.updateOne({ key }, { $set: { ageBand: next } }, { upsert: true });
        }
    }

    /** Spend cap left for the identity in euro cents (0 under 16). The band defaults to 18+ when unknown. */
    async capLeftCents(identity: PawlegendsIdentity, band?: AgeBand): Promise<number> {
        const effective = stricterBand(await this.storedBand(identity), band) || '18+';
        return Math.max(0, SPEND_CAP_CENTS[effective] - (await this.spentCents(identity)));
    }

    /** Founder Legend seats taken: paid and held seats (the upgrade gives a seat too). */
    async legendSeatsTaken(): Promise<number> {
        const seatSkus = PAWLEGENDS_SKU_IDS.filter(sku => PAWLEGENDS_SKUS[sku].legendSeat);
        return this.store.purchases.countDocuments({ $and: [activeFilter(this.now()), { sku: { $in: seatSkus } }] });
    }

    async legendSeatsLeft(): Promise<number> {
        return Math.max(0, FOUNDER_LEGEND_CAP - (await this.legendSeatsTaken()));
    }

    /**
     * Is `sessionId` the first live claim of its once-only group for this identity? Paid rows come first, then open
     * holds by creation time and session id, so of two racing checkouts exactly one keeps its hold.
     */
    async firstClaim(identity: PawlegendsIdentity, group: PawlegendsSku[], sessionId: string): Promise<boolean> {
        const clauses = identityClauses({ ...identity, sessionIds: [] });
        if (!clauses.length) return true;
        const rows = (await this.store.purchases
            .find({ $and: [activeFilter(this.now()), { sku: { $in: group } }, { $or: clauses }] })
            .lean()) as any[];
        rows.sort(
            (a, b) =>
                Number(b.status === 'paid') - Number(a.status === 'paid') ||
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime() ||
                String(a.sessionId).localeCompare(String(b.sessionId))
        );
        return !rows.length || rows[0].sessionId === sessionId;
    }

    /**
     * A refund under the presale terms (POC.md §8.6, GDD §8.3: the MVP is late or stopped): the whole price comes
     * back and the items delivered now stay with the buyer. Marks the row first, so the `charge.refunded` webhook
     * keeps its items, then refunds in Stripe with the same marker in the refund metadata. For the refund script
     * and support; no route calls it.
     */
    async refundUnderTerms(sessionId: string, env: Env = process.env): Promise<{ refundId: string }> {
        const row = (await this.store.purchases.findOne({ sessionId, status: 'paid' }).lean()) as any;
        if (!row?.paymentIntentId) throw PAWLEGENDS_ERRORS.notFound();
        await this.store.purchases.updateOne({ sessionId }, { $set: { termsRefund: true } });
        const refund = await this.stripe(env).refunds.create({
            payment_intent: row.paymentIntentId,
            metadata: { pawlegends_terms_refund: '1', session: sessionId },
        });
        return { refundId: refund.id };
    }

    // -----------------------------------------------------------------------------------------------------------
    // Checkout

    /** Shape checks; throws 400. Returns the normalised email (or null). */
    validate(req: PawlegendsCheckoutRequest): { email: string | null } {
        if (!req || typeof req !== 'object' || !isPawlegendsSku(req.sku))
            throw PAWLEGENDS_ERRORS.invalid('Unknown sku');
        if (!isPawlegendsCurrency(req.currency)) throw PAWLEGENDS_ERRORS.invalid('currency must be eur or usd');
        // the age band is optional (the sheets no longer ask); one that is sent must be a real band
        if (req.ageBand !== undefined && req.ageBand !== null && !isAgeBand(req.ageBand))
            throw PAWLEGENDS_ERRORS.invalid('ageBand is not valid');
        if (PAWLEGENDS_SKUS[req.sku].retired && !this.sellRetired) {
            throw PAWLEGENDS_ERRORS.retired();
        }
        const consents: readonly string[] = isCatalogSku(req.sku)
            ? [PAWLEGENDS_STORE_TERMS_VERSION]
            : PAWLEGENDS_CONSENT_VERSIONS;
        if (!consents.includes(req.consentVersion)) {
            throw PAWLEGENDS_ERRORS.invalid('consentVersion is not current');
        }
        // store and pass SKUs: the purchase button is the consent to delivery now and the end of the 14-day right
        if (isCatalogSku(req.sku) && req.consent !== true) {
            throw PAWLEGENDS_ERRORS.invalid('consent is required: press the purchase button');
        }
        if (!isDeviceId(req.deviceId)) throw PAWLEGENDS_ERRORS.invalid('deviceId is required');
        if (req.email !== undefined && req.email !== null && req.email !== '' && !normalizeEmail(req.email)) {
            throw PAWLEGENDS_ERRORS.invalid('email is not valid');
        }
        return { email: normalizeEmail(req.email) };
    }

    /** The identity a request speaks for: its email and device, plus what a valid token adds. */
    identityOf(req: Pick<PawlegendsCheckoutRequest, 'deviceId' | 'token'>, email: string | null, env: Env) {
        const identity: PawlegendsIdentity = { email, deviceId: req.deviceId, sessionIds: [] };
        const secret = pawlegendsEntitlementSecret(env);
        const token = secret && req.token ? verifyPawlegendsToken(req.token, secret, this.now().getTime()) : null;
        if (token?.sids?.length) identity.sessionIds = token.sids.slice(0, 50);
        return { identity, tokenEmail: token?.ev === 1 ? token.email : undefined };
    }

    /**
     * Store and pass rules (STORE-PASS.md §3) before the hold: nothing the account owns or holds an open session of
     * again (a set while any of its items is owned is refused: the singles are sold instead, no prorated price), and
     * the Pass+ upgrade only for Pass owners.
     */
    async checkCatalog(sku: PawlegendsSku, accountId: string): Promise<void> {
        const def = PAWLEGENDS_SKUS[sku];
        if (def.kind === 'champion') return this.checkChampion(sku, accountId);
        const active = await this.activeSkus({ accountId });
        if (conflictsOf(sku).some(s => active.has(s))) throw PAWLEGENDS_ERRORS.alreadyOwned();
        const owned = new Set(await ownedItemsOf(this.store, accountId));
        if (def.kind !== 'pass' && def.items.some(item => owned.has(item))) throw PAWLEGENDS_ERRORS.alreadyOwned();
        if (def.requires && !(await this.ownedSkus({ accountId })).has(def.requires))
            throw PAWLEGENDS_ERRORS.needsPass();
    }

    /**
     * Champion SKUs (CHAMPION-STORE.md §5): refused when every champion in it is owned (bought, unlocked with Yarn, a
     * Champion Pick or the Founders roster), or while an open checkout of an overlapping champion SKU could still be
     * paid. A bundle over some owned champions is sold at its prorated price (`championPrice`), never refused.
     */
    private async checkChampion(sku: PawlegendsSku, accountId: string): Promise<void> {
        const def = PAWLEGENDS_SKUS[sku];
        const owned = new Set(await ownedItemsOf(this.store, accountId));
        if (def.items.every(item => owned.has(item))) throw PAWLEGENDS_ERRORS.alreadyOwned();
        const overlap = CATALOG_SKUS.filter(
            s => s.kind === 'champion' && s.items.some(item => def.items.includes(item))
        ).map(s => s.sku);
        const open = (await this.store.purchases
            .find({
                $and: [{ accountId }, { status: 'pending', holdUntil: { $gt: this.now() } }, { sku: { $in: overlap } }],
            })
            .lean()) as any[];
        if (open.length) throw PAWLEGENDS_ERRORS.alreadyOwned();
    }

    /** What a SKU costs this account and what it grants: a champion SKU only its champions not owned yet. */
    async championPrice(
        sku: PawlegendsSku,
        currency: PawlegendsCurrency,
        accountId: string
    ): Promise<{ cents: number; items: string[] } | null> {
        const def = catalogSku(sku);
        if (!def || def.kind !== 'champion') return null;
        const owned = new Set(await ownedItemsOf(this.store, accountId));
        const cents = championBundleCents(def, owned, currency);
        return cents === null ? null : { cents, items: def.items.filter(item => !owned.has(item)) };
    }

    async createCheckout(
        req: PawlegendsCheckoutRequest,
        env: Env = process.env,
        accountId?: string | null
    ): Promise<PawlegendsCheckoutResponse> {
        const { email } = this.validate(req);
        const stripe = this.stripe(env);
        // Never take money that could not be confirmed (webhook) or turned into an entitlement.
        if (!pawlegendsCanConfirmPayments(env)) throw PAWLEGENDS_ERRORS.webhookUnavailable();
        if (!pawlegendsEntitlementSecret(env)) throw PAWLEGENDS_ERRORS.secretMissing();

        const store = isCatalogSku(req.sku);
        // Store and pass items belong to a Token Tails account (decision #9: guests cannot buy).
        if (store && !accountId) throw PAWLEGENDS_ERRORS.signInRequired();
        const { identity, tokenEmail } = this.identityOf(req, email, env);
        if (accountId) identity.accountId = accountId;
        const buyerEmail = email || tokenEmail || null;
        if (!buyerEmail) throw PAWLEGENDS_ERRORS.invalid('email is required');
        const owners: PawlegendsIdentity = { ...identity, email: buyerEmail };

        // An answer the request still carries is stored as before; without one (the sheets no longer ask) the stored
        // band applies, else DEFAULT_AGE_BAND's cap. Nothing is stored for a default: it is not an answer.
        const answer = isAgeBand(req.ageBand) ? req.ageBand : undefined;
        if (answer) await this.rememberBand(owners, answer);
        const stored = await this.storedBand(owners);
        const band = effectiveBand(stored, answer);
        const ageSource: 'answer' | 'default' = stored || answer ? 'answer' : 'default';
        if (band === 'under16') throw PAWLEGENDS_ERRORS.underAge(UNDER_16_MESSAGE);
        const consentAt = store ? this.now() : undefined;

        const def = PAWLEGENDS_SKUS[req.sku];
        const active = await this.activeSkus(owners);
        if (req.sku === 'pl_starter' && active.has('pl_starter')) throw PAWLEGENDS_ERRORS.alreadyOwned();
        if (def.legendSeat && (active.has('pl_founder_legend') || active.has('pl_founder_legend_upgrade'))) {
            throw PAWLEGENDS_ERRORS.alreadyOwned();
        }
        if (req.sku === 'pl_founder' && active.has('pl_founder')) throw PAWLEGENDS_ERRORS.alreadyOwned();
        if (def.requiresFounder && !(await this.ownedSkus(owners)).has('pl_founder')) {
            throw PAWLEGENDS_ERRORS.needsFounder();
        }
        if (store) await this.checkCatalog(req.sku, accountId!);

        // champion SKUs: the prorated price and only the champions not owned yet (CHAMPION-STORE.md §5)
        const champ = store ? await this.championPrice(req.sku, req.currency, accountId!) : null;
        const amountCents = champ?.cents ?? def.cents[req.currency];
        const capCents = champ ? champ.cents : capCentsOf(req.sku, req.currency);
        if (capCents > (await this.capLeftCents(owners, band))) throw PAWLEGENDS_ERRORS.spendCap();
        if (def.legendSeat && (await this.legendSeatsLeft()) <= 0) throw PAWLEGENDS_ERRORS.soldOut();

        // Reserve first, then count: of two checkouts racing for the last seat or cap, at most one passes.
        const now = this.now().getTime();
        const holdId = `hold_${randomBytes(12).toString('hex')}`;
        await this.store.purchases.create({
            sessionId: holdId,
            sku: req.sku,
            status: 'pending',
            email: buyerEmail,
            deviceId: req.deviceId,
            accountId: identity.accountId || undefined,
            currency: req.currency,
            amountCents,
            capCents,
            ageBand: band,
            ageSource,
            ...(consentAt ? { consentAt } : {}),
            items: champ?.items ?? def.items,
            holdUntil: new Date(now + SESSION_TTL_MS + HOLD_MARGIN_MS),
        });
        const release = () => this.store.purchases.deleteMany({ sessionId: holdId });
        const group = onceGroup(req.sku);
        // Store and pass SKUs are once per account (another account on the same device or email may buy them).
        const claimers: PawlegendsIdentity = store ? { accountId } : owners;
        if (group && !(await this.firstClaim(claimers, group, holdId))) {
            await release();
            throw PAWLEGENDS_ERRORS.alreadyOwned();
        }
        if (def.legendSeat && (await this.legendSeatsTaken()) > FOUNDER_LEGEND_CAP) {
            await release();
            throw PAWLEGENDS_ERRORS.soldOut();
        }
        if ((await this.spentCents(owners)) > SPEND_CAP_CENTS[band]) {
            await release();
            throw PAWLEGENDS_ERRORS.spendCap();
        }

        const params = buildCheckoutParams(req, {
            returnBase: pawlegendsPublicUrl(env),
            email: buyerEmail,
            holdId,
            expiresAt: now + SESSION_TTL_MS,
            accountId: identity.accountId,
            ...(champ ? { amountCents } : {}),
            band,
            ageSource,
            ...(consentAt ? { consentAt: consentAt.toISOString() } : {}),
        });
        let session: Stripe.Checkout.Session;
        try {
            session = await stripe.checkout.sessions.create(params);
        } catch (error) {
            await release();
            throw error;
        }
        if (!session.url) {
            this.logger.error(`Checkout session ${session.id} has no URL`);
            await release();
            throw PAWLEGENDS_ERRORS.stripeUnavailable();
        }
        // The webhook may have upserted the session row already; then the hold is redundant.
        const raced = await this.store.purchases.findOne({ sessionId: session.id }).lean();
        if (raced) await release();
        else await this.store.purchases.updateOne({ sessionId: holdId }, { $set: { sessionId: session.id } });
        return { url: session.url, sessionId: session.id };
    }
}

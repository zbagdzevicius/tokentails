import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import { BADCAT_SKUS, BadcatSku, BRAND_SKUS, CAMEO_SKUS, GIFT_SKUS, isBadcatSku } from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { badcatWebhookSecret, Env, isProduction } from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import { BadcatStripeService } from './badcat-stripe.service';
import { addMonths, filterName, isCatCode, MS_DAY, normalizeEmail } from './badcat-util';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';

/*
 * POST /badcat/stripe/webhook (raw body, BADCAT_STRIPE_WEBHOOK_SECRET). Idempotent by Stripe event id
 * (`badcatwebhookevents`), and every write is keyed by the Checkout Session id as well, so a replayed
 * event under a new id adds nothing. Writes purchases, cameos, gifts and the brand queue; never a score.
 */

export const META_KEYS = ['trigger', 'via', 'entry', 'from_in_app', 'ab_arm', 'session_index'] as const;
export const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters: no I, O, 0, 1
/** A subscription is Club until the first invoice confirms its period: period + 2 days. */
export const PROVISIONAL_GRACE_MS = 2 * MS_DAY;

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored';

export function newGiftCode(): string {
    const bytes = randomBytes(10);
    return Array.from(bytes, byte => GIFT_ALPHABET[byte % 32]).join('');
}

const idOf = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : (value as { id?: string } | null | undefined)?.id || undefined;

/** The period end of a subscription (the item's since API 2025-03-31, the subscription's before). */
export function subscriptionPeriodEnd(sub: any): Date | undefined {
    const seconds = [sub?.current_period_end, ...(sub?.items?.data || []).map((item: any) => item?.current_period_end)]
        .filter((value: unknown) => typeof value === 'number')
        .reduce((max: number, value: number) => Math.max(max, value), 0);
    return seconds ? new Date(seconds * 1000) : undefined;
}

/** The subscription id of an invoice (`parent.subscription_details` since API 2025-03-31, `subscription` before). */
export const invoiceSubscriptionId = (invoice: any): string | undefined =>
    idOf(invoice?.parent?.subscription_details?.subscription) || idOf(invoice?.subscription);

/** PaymentIntent ids an invoice was paid with (`payments` since API 2025-03-31, `payment_intent` before). */
export function invoicePaymentIntents(invoice: any): string[] {
    const ids = [
        idOf(invoice?.payment_intent),
        ...((invoice?.payments?.data || []) as any[]).map(p => idOf(p?.payment?.payment_intent)),
    ].filter((id): id is string => !!id);
    return [...new Set(ids)];
}

@Injectable()
export class BadcatWebhookService {
    private readonly logger = new Logger(BadcatWebhookService.name);
    now: () => Date = () => new Date();

    constructor(private readonly store: BadcatStore, private readonly stripe: BadcatStripeService) {}

    /**
     * Verifies the signature (400) and returns the event; 503 only without the webhook secret. Uses the static
     * verifier, so refunds and cancellations still arrive while no usable Stripe key is set.
     */
    verify(rawBody: Buffer | string | undefined, signature: string | undefined, env: Env = process.env): Stripe.Event {
        const secret = badcatWebhookSecret(env);
        if (!secret) throw BADCAT_ERRORS.webhookUnavailable();
        if (!signature || !rawBody) throw BADCAT_ERRORS.badSignature();
        const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        try {
            return Stripe.webhooks.constructEvent(buffer, signature, secret);
        } catch {
            throw BADCAT_ERRORS.badSignature();
        }
    }

    /**
     * The event id is recorded only after `dispatch` succeeds: a crash or restart mid-dispatch leaves no id behind,
     * so Stripe's retry is processed (round 3: recording it first lost the event for good). Every write in
     * `dispatch` is idempotent by session, subscription or invoice id, so a retry, or two deliveries racing, apply
     * it once.
     */
    async handle(event: Stripe.Event, env: Env = process.env): Promise<WebhookOutcome> {
        if (await this.store.webhookEvents.findOne({ eventId: event.id }).lean()) return 'duplicate';
        const outcome = await this.dispatch(event, env);
        try {
            await this.store.webhookEvents.create({ eventId: event.id, type: event.type });
        } catch (error) {
            // a concurrent delivery of the same event recorded it first; its writes and ours are the same
            if (!isDuplicateKeyError(error))
                this.logger.warn(`webhook ${event.id}: processed, id not recorded (${(error as Error)?.message})`);
        }
        return outcome;
    }

    private async dispatch(event: Stripe.Event, env: Env): Promise<WebhookOutcome> {
        // production never creates test sessions; a test-mode event there would grant real entitlements for free
        if (isProduction(env) && !event.livemode) return 'ignored';
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                return this.checkoutCompleted(event.data.object as Stripe.Checkout.Session, event.livemode);
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                return this.subscriptionChanged(event.data.object as Stripe.Subscription, event.type);
            case 'invoice.paid':
                return this.invoicePaid(event.data.object as Stripe.Invoice);
            case 'charge.refunded':
                return this.chargeRefunded(event.data.object as Stripe.Charge, env);
            case 'checkout.session.expired':
                return this.checkoutExpired(event.data.object as Stripe.Checkout.Session);
            default:
                return 'ignored';
        }
    }

    async checkoutCompleted(session: Stripe.Checkout.Session, livemode = false): Promise<WebhookOutcome> {
        const md = (session.metadata || {}) as Record<string, string>;
        if (md.badcat !== '1' || !isBadcatSku(md.sku)) return 'ignored';
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return 'ignored';
        const sku = md.sku as BadcatSku;
        const def = BADCAT_SKUS[sku];
        const now = this.now();
        const email = normalizeEmail(session.customer_details?.email ?? session.customer_email) || undefined;
        const meta = Object.fromEntries(
            META_KEYS.filter(key => typeof md[key] === 'string').map(key => [key, md[key]])
        ) as Record<string, string>;
        const dayNo = /^-?\d{1,6}$/.test(md.day || '') ? Number(md.day) : undefined;
        const catCode = isCatCode(md.cat) ? md.cat : undefined;
        const catName = md.cat_name ? filterName(md.cat_name) : undefined;
        const recurring = !!def.recurring;
        const provisionalEnd = recurring
            ? new Date(addMonths(now, def.recurring === 'year' ? 12 : 1).getTime() + PROVISIONAL_GRACE_MS)
            : undefined;

        await this.store.purchases.updateOne(
            { sessionId: session.id },
            {
                $setOnInsert: {
                    kind: recurring ? 'subscription' : 'one_off',
                    sku,
                    email,
                    customerId: idOf(session.customer),
                    subscriptionId: idOf(session.subscription),
                    paymentIntentId: idOf(session.payment_intent),
                    amountTotal: session.amount_total ?? 0,
                    currency: session.currency || 'usd',
                    status: 'paid',
                    ...(recurring ? { subStatus: 'active', periodEnd: provisionalEnd } : {}),
                    meta,
                    catCode,
                    catName,
                    dayNo,
                    giftFor: md.gift_for,
                    ...(BRAND_SKUS.includes(sku)
                        ? { brand: { name: md.brand_name, url: md.brand_url, note: md.brand_note }, queue: 'queued' }
                        : {}),
                    livemode,
                },
            },
            { upsert: true }
        );

        if (CAMEO_SKUS.includes(sku) && catCode && dayNo !== undefined) {
            await this.store.cameos.updateOne(
                { sessionId: session.id },
                {
                    $setOnInsert: {
                        kind: sku === 'guest_star' ? 'guest_star' : 'paid',
                        dayNo,
                        catCode,
                        name: catName || 'A Cat',
                        email,
                    },
                },
                { upsert: true }
            );
        }

        if (GIFT_SKUS.includes(sku) && !(await this.store.gifts.findOne({ sessionId: session.id }).lean())) {
            await this.createGift(session.id, sku, email, md.gift_for);
        }
        // The founding place is a purchase row now, not a hold.
        if (sku === 'founding') await this.stripe.releaseFoundingHold(session.id);
        return 'processed';
    }

    /** An unpaid founding session expired: its held place is free again. */
    async checkoutExpired(session: Stripe.Checkout.Session): Promise<WebhookOutcome> {
        const md = (session.metadata || {}) as Record<string, string>;
        if (md.badcat !== '1' || md.sku !== 'founding' || !session.id) return 'ignored';
        await this.stripe.releaseFoundingHold(session.id);
        return 'processed';
    }

    private async createGift(sessionId: string, sku: BadcatSku, buyerEmail?: string, giftFor?: string) {
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await this.store.gifts.create({ code: newGiftCode(), sku, sessionId, buyerEmail, giftFor });
                return;
            } catch (error) {
                if (!isDuplicateKeyError(error)) throw error;
                // A concurrent delivery already made this session's gift.
                if (await this.store.gifts.findOne({ sessionId }).lean()) return;
            }
        }
        throw new Error(`Could not create a unique gift code for ${sessionId}`);
    }

    async subscriptionChanged(sub: Stripe.Subscription, type: string): Promise<WebhookOutcome> {
        const deleted = type === 'customer.subscription.deleted';
        const periodEnd = subscriptionPeriodEnd(sub);
        const row = (await this.store.purchases
            .findOne({ subscriptionId: sub.id, kind: 'subscription' })
            .lean()) as any;
        if (!row) return 'ignored';
        // A refund ended the access: a later update (Stripe has not canceled yet) never reopens it.
        const ended = !!row.refundedAt;
        await this.store.purchases.updateOne(
            { _id: row._id },
            {
                $set: {
                    subStatus: deleted || ended ? 'canceled' : sub.status,
                    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
                    ...(periodEnd && !deleted && !ended ? { periodEnd } : {}),
                },
            }
        );
        return 'processed';
    }

    async invoicePaid(invoice: Stripe.Invoice): Promise<WebhookOutcome> {
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) return 'ignored';
        const purchase = (await this.store.purchases.findOne({ subscriptionId, kind: 'subscription' }).lean()) as any;
        if (!purchase) return 'ignored';
        const paymentIntents = invoicePaymentIntents(invoice);
        if (paymentIntents.length) {
            await this.store.purchases.updateOne(
                { _id: purchase._id },
                { $addToSet: { paymentIntentIds: { $each: paymentIntents } } }
            );
        }
        if (purchase.refundedAt) {
            // A refunded subscription stays ended; an invoice paid after the refund (Stripe could not cancel) is
            // recorded as a renewal below but grants nothing until support looks at it.
            this.logger.warn(`Bad Cat invoice paid on a refunded subscription (${subscriptionId})`);
        }
        const lineEnd = ((invoice as any).lines?.data || [])
            .map((line: any) => line?.period?.end)
            .filter((value: unknown) => typeof value === 'number')
            .reduce((max: number, value: number) => Math.max(max, value), 0);
        const current = purchase.periodEnd ? new Date(purchase.periodEnd).getTime() : 0;
        const periodEnd = lineEnd ? Math.max(lineEnd * 1000, current) : current;
        if (!purchase.refundedAt) {
            await this.store.purchases.updateOne(
                { _id: purchase._id },
                { $set: { subStatus: 'active', ...(periodEnd ? { periodEnd: new Date(periodEnd) } : {}) } }
            );
        }
        if ((invoice as any).billing_reason === 'subscription_cycle' && invoice.id) {
            await this.store.purchases.updateOne(
                { sessionId: `inv:${invoice.id}` },
                {
                    $setOnInsert: {
                        kind: 'renewal',
                        sku: purchase.sku,
                        email: purchase.email,
                        customerId: purchase.customerId,
                        subscriptionId,
                        amountTotal: (invoice as any).amount_paid ?? 0,
                        currency: invoice.currency || 'usd',
                        status: 'paid',
                        meta: purchase.meta || {},
                        ...(paymentIntents[0] ? { paymentIntentId: paymentIntents[0] } : {}),
                    },
                },
                { upsert: true }
            );
        }
        return 'processed';
    }

    /**
     * A full refund voids the purchase and everything it made. One-off: the gift code is canceled (a redeemed
     * Club gift ends now, a redeemed gift cameo is hidden) and its cameo leaves the pool and the fridge.
     * Subscription (Club, founding) or a renewal of one: the row is marked refunded (out of revenue; a founding
     * place is free again), Club ends now and the subscription is canceled in Stripe so it never renews.
     */
    async chargeRefunded(charge: Stripe.Charge, env: Env = process.env): Promise<WebhookOutcome> {
        const paymentIntentId = idOf(charge.payment_intent);
        if (!paymentIntentId || !charge.refunded) return 'ignored';
        const purchase = await this.purchaseOfCharge(charge, paymentIntentId, env);
        if (!purchase) return 'ignored';
        const now = this.now();
        if (purchase.kind === 'subscription' || purchase.kind === 'renewal') {
            await this.refundSubscription(purchase, now, env);
            this.logger.log(`Bad Cat ${purchase.kind} refunded (${paymentIntentId})`);
            return 'processed';
        }
        await this.store.purchases.updateOne({ _id: purchase._id }, { $set: { status: 'refunded', refundedAt: now } });
        await this.store.cameos.updateMany({ sessionId: purchase.sessionId }, { $set: { hidden: true } });
        const gift = (await this.store.gifts.findOne({ sessionId: purchase.sessionId }).lean()) as any;
        if (gift) {
            await this.store.gifts.updateOne(
                { _id: gift._id },
                { $set: { canceledAt: now, ...(gift.clubUntil ? { clubUntil: now } : {}) } }
            );
            await this.store.cameos.updateMany({ sessionId: `gift:${gift.code}` }, { $set: { hidden: true } });
        }
        this.logger.log(`Bad Cat purchase refunded (${paymentIntentId})`);
        return 'processed';
    }

    /**
     * The purchase row a charge paid for: a one-off or renewal by its PaymentIntent, a subscription by a
     * PaymentIntent its invoices recorded, else by asking Stripe which invoice the PaymentIntent paid
     * (test-mode reads only; a failure falls back to the customer's only subscription row).
     */
    private async purchaseOfCharge(charge: Stripe.Charge, paymentIntentId: string, env: Env): Promise<any | null> {
        const direct = (await this.store.purchases.findOne({ paymentIntentId }).lean()) as any;
        if (direct) return direct;
        const recorded = (await this.store.purchases
            .findOne({ kind: 'subscription', paymentIntentIds: paymentIntentId })
            .lean()) as any;
        if (recorded) return recorded;
        let subscriptionId = idOf((charge as any).invoice?.parent?.subscription_details?.subscription);
        let invoiceId: string | undefined = idOf((charge as any).invoice);
        try {
            const stripe = this.stripe.stripe(env) as any;
            if (!invoiceId && stripe.invoicePayments?.list) {
                const list = await stripe.invoicePayments.list({
                    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
                    limit: 1,
                });
                invoiceId = idOf(list?.data?.[0]?.invoice);
            }
            if (invoiceId && !subscriptionId && stripe.invoices?.retrieve) {
                subscriptionId = invoiceSubscriptionId(await stripe.invoices.retrieve(invoiceId));
            }
        } catch (error: any) {
            this.logger.warn(`Bad Cat refund lookup failed (${paymentIntentId}): ${error?.message || error}`);
        }
        if (invoiceId) {
            const renewal = (await this.store.purchases.findOne({ sessionId: `inv:${invoiceId}` }).lean()) as any;
            if (renewal) return renewal;
        }
        if (subscriptionId) {
            const sub = (await this.store.purchases.findOne({ subscriptionId, kind: 'subscription' }).lean()) as any;
            if (sub) return sub;
        }
        const customerId = idOf(charge.customer);
        if (customerId) {
            const rows = (await this.store.purchases
                .find({ customerId, kind: 'subscription', status: { $ne: 'refunded' } })
                .lean()) as any[];
            if (rows.length === 1) return rows[0];
        }
        return null;
    }

    /** Ends the Club of a refunded subscription (or renewal) and cancels it in Stripe (never a charge). */
    private async refundSubscription(purchase: any, now: Date, env: Env): Promise<void> {
        const sub =
            purchase.kind === 'subscription'
                ? purchase
                : ((await this.store.purchases
                      .findOne({ subscriptionId: purchase.subscriptionId, kind: 'subscription' })
                      .lean()) as any);
        if (purchase.kind === 'renewal') {
            await this.store.purchases.updateOne(
                { _id: purchase._id },
                { $set: { status: 'refunded', refundedAt: now } }
            );
        }
        if (!sub) return;
        // The first charge refunded: the subscription row itself is refunded (out of revenue, the founding place
        // is free again). A renewal refunded: the row stays paid for its first period, but access ends now.
        await this.store.purchases.updateOne(
            { _id: sub._id },
            {
                $set: {
                    ...(purchase.kind === 'subscription' ? { status: 'refunded' } : {}),
                    refundedAt: now,
                    subStatus: 'canceled',
                    periodEnd: now,
                    cancelAtPeriodEnd: false,
                },
            }
        );
        if (sub.subscriptionId) {
            try {
                const stripe = this.stripe.stripe(env) as any;
                await stripe.subscriptions?.cancel?.(sub.subscriptionId);
            } catch (error: any) {
                // Already canceled, or Stripe is unreachable: the row is ended locally either way.
                this.logger.warn(`Bad Cat refund: cancel ${sub.subscriptionId} failed: ${error?.message || error}`);
            }
        }
    }
}

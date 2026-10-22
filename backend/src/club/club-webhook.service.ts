import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { invoiceSubscriptionId } from 'src/badcat/badcat-webhook.service';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import {
    CheckoutShelterShare,
    CryptoCheckout,
    CryptoCheckoutDocument,
} from 'src/payments/crypto/crypto-checkout.schema';
import { CryptoShelterShareService } from 'src/payments/crypto/crypto-shelter-share.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { reverseShare, shrinkShare } from 'src/rave/rave-share';
import { RAVE_SYSTEM_USER } from 'src/rave/rave.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { isTestnetChain, readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import Stripe from 'stripe';
import { CLUB_SHELTER_BPS, readClubConfig } from './club.config';
import { CLUB_ERRORS } from './club.errors';
import { ClubWebhookEvent, ClubWebhookEventDocument } from './club.schema';
import { ClubService } from './club.service';

/*
 * POST /club/stripe/webhook (raw body, CLUB_STRIPE_WEBHOOK_SECRET): 503 without the secret, 400 on a bad
 * signature. Production ignores test-mode events. Every handler skips objects that are not the club's
 * (`metadata.club === '1'` on the subscription, or on the invoice's `parent.subscription_details`; refunds
 * and disputes are matched to a club keeper row by PaymentIntent).
 *
 * Pink Paw's half: each paid invoice becomes one ordinary keeper row (`cryptocheckouts`, the rave
 * queuePayout shape): orderId `club_<16 hex of sha256(invoiceId)>` (deterministic, so a replayed event or a
 * second event of the same invoice hits the unique index and adds nothing), memo `tt:club:<16 hex>`, amount
 * CLUB_SHELTER_BPS of the amount paid, VAT included (the page promises "$5 of your $9.99" on VAT-inclusive
 * prices, so any VAT is paid from Token Tails' half, never the shelter's). Event ids are recorded only after a successful
 * dispatch, so a crash lets Stripe's retry run.
 */

export const CLUB_EVENT_TYPES = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
    'charge.refunded',
    'charge.dispute.created',
] as const;
export const CLUB_KEEPER_KICK_MS = 10 * 1000;

export const clubOrderId = (invoiceId: string) =>
    `club_${createHash('sha256').update(invoiceId).digest('hex').slice(0, 16)}`;
export const clubMemo = (orderId: string) => `tt:club:${orderId.slice(5)}`;

const idOf = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : (value as { id?: string } | null | undefined)?.id || undefined;

/**
 * Pink Paw's keeper share of a paid invoice: the `treasuryShelterShare` rule of the crypto checkout (`due`,
 * route `treasury`, `pledged`, ceil(base * bps / 10000)) with the club memo. Kept here rather than imported:
 * crypto-checkout.service.ts pulls the cat and OpenAI modules into every importer at load time.
 */
export function clubShelterShare(orderId: string, base: number): CheckoutShelterShare {
    return {
        shelterId: PACK_SHELTER_IDS.pinkPaw,
        route: 'treasury',
        bps: CLUB_SHELTER_BPS,
        state: 'due',
        evidenceTier: 'pledged',
        amountUsdCents: Math.ceil((base * CLUB_SHELTER_BPS) / 10000),
        memo: clubMemo(orderId),
        attempts: 0,
    };
}

/**
 * The share base of an invoice: the whole amount paid, VAT included. The home page and the checkout legal line
 * promise "$5 of your $9.99" and "half of each payment" on VAT-inclusive prices, so tax lines (`total_taxes`,
 * empty while no Stripe Tax or tax rate is set) are not deducted: VAT comes out of Token Tails' half.
 */
export function clubShareBase(invoice: any): number {
    return Math.max(0, Number(invoice?.amount_paid) || 0);
}

@Injectable()
export class ClubWebhookService implements OnModuleDestroy {
    private readonly logger = new Logger(ClubWebhookService.name);
    env: NodeJS.ProcessEnv = process.env;
    private kickTimer: NodeJS.Timeout | null = null;

    constructor(
        @InjectModel(ClubWebhookEvent.name) private events: Model<ClubWebhookEventDocument>,
        @InjectModel(CryptoCheckout.name) private checkouts: Model<CryptoCheckoutDocument>,
        private club: ClubService,
        private stripePayments: StripePaymentService,
        private shares: CryptoShelterShareService
    ) {}

    onModuleDestroy() {
        if (this.kickTimer) clearTimeout(this.kickTimer);
        this.kickTimer = null;
    }

    private get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    verify(rawBody: Buffer | string | undefined, signature: string | undefined): Stripe.Event {
        const secret = readClubConfig(this.env).webhookSecret;
        if (!secret) throw CLUB_ERRORS.webhookUnavailable();
        if (!signature || !rawBody) throw CLUB_ERRORS.badSignature();
        const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        try {
            return Stripe.webhooks.constructEvent(buffer, signature, secret);
        } catch {
            throw CLUB_ERRORS.badSignature();
        }
    }

    async handle(event: Stripe.Event, now: Date = new Date()): Promise<string> {
        if (await this.events.findOne({ eventId: event.id }).lean()) return 'duplicate';
        const outcome = await this.dispatch(event, now);
        try {
            await this.events.create({ eventId: event.id, type: event.type });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        return outcome;
    }

    private async dispatch(event: Stripe.Event, now: Date): Promise<string> {
        // Production never creates test subscriptions; a test event there must not queue a real payout.
        if (readClubConfig(this.env).production && !event.livemode) return 'ignored';
        const object: any = event.data?.object;
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                return this.subscriptionChanged(object);
            case 'invoice.paid':
                return this.invoicePaid(object, !!event.livemode, now);
            case 'invoice.payment_failed':
                if (!(await this.isClubInvoice(object))) return 'ignored';
                // The status itself arrives through customer.subscription.updated.
                this.logger.warn(`club invoice ${object?.id}: payment failed (${object?.billing_reason})`);
                return 'logged';
            case 'charge.refunded':
                return this.chargeReversed(object, 'refunded', now);
            case 'charge.dispute.created':
                return this.chargeReversed(object, 'disputed', now);
            default:
                return 'ignored';
        }
    }

    /** Reads the subscription itself (the event body may be stale or out of order) and writes its state. */
    private async subscriptionChanged(object: any): Promise<string> {
        if (object?.metadata?.club !== '1') return 'ignored';
        const sub = await this.stripe.subscriptions.retrieve(object.id, { expand: ['customer'] });
        return this.club.syncSubscription(sub);
    }

    private async isClubInvoice(invoice: any): Promise<boolean> {
        if (invoice?.parent?.subscription_details?.metadata?.club === '1') return true;
        const subId = invoiceSubscriptionId(invoice);
        return !!(subId && (await this.club.memberBySubscription(subId)));
    }

    /**
     * Extends the membership (the subscription is re-read and synced) and queues Pink Paw's half of what was
     * paid, excluding tax. Refused when the payment's mode does not match the keeper's chain.
     */
    async invoicePaid(invoice: any, livemode: boolean, now: Date = new Date()): Promise<string> {
        if (!invoice?.id || !(await this.isClubInvoice(invoice))) return 'ignored';
        if (!(Number(invoice.amount_paid) > 0)) return 'ignored';
        const subId = invoiceSubscriptionId(invoice);
        if (!subId) return 'ignored';
        const sub: any = await this.stripe.subscriptions.retrieve(subId, { expand: ['customer'] });
        await this.club.syncSubscription(sub);
        const member: any = await this.club.memberBySubscription(subId);
        const md = sub?.metadata || invoice?.parent?.subscription_details?.metadata || {};
        const plan = member?.plan || md.plan || 'month';
        const userId = member?.userId || md.userId;

        const shelter = readShelterConfig(this.env);
        const keeperMainnet = !isTestnetChain(shelter.chainId);
        if (livemode !== keeperMainnet) {
            this.logger.error(
                `club invoice ${invoice.id}: ${livemode ? 'live' : 'test'} payment against a ${
                    keeperMainnet ? 'mainnet' : 'testnet'
                } keeper, no share queued`
            );
            return 'mode-skipped';
        }
        if (String(invoice.currency || '').toLowerCase() !== 'usd') {
            // Both prices are USD (checked by GET /club/status); cents of another currency are not USD cents.
            this.logger.error(
                `club invoice ${invoice.id}: paid in ${invoice.currency}, no share queued; check by hand`
            );
            return 'currency-skipped';
        }
        const base = clubShareBase(invoice);
        if (base <= 0) return 'ignored';
        const orderId = clubOrderId(invoice.id);
        const cardIntent = await this.invoiceIntent(invoice);
        const shelterShare = clubShelterShare(orderId, base);
        try {
            await this.checkouts.create({
                orderId,
                user: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : RAVE_SYSTEM_USER,
                rail: 'card',
                network: livemode ? 'card' : 'testnet',
                ...(cardIntent ? { cardIntent } : {}),
                sku: { kind: 'CLUB', name: 'Tails Club', plan, subscriptionId: subId, invoiceId: invoice.id },
                priceUsdCents: base,
                discountPercentage: 0,
                accepted: [],
                status: 'COMPLETE',
                expiresAt: now,
                grant: { success: true, message: 'Tails Club' },
                shelterShare,
            } as any);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            return 'duplicate-invoice';
        }
        this.kickKeeper();
        return 'paid';
    }

    /** The PaymentIntent that paid the invoice (`invoicePayments.list` on clover; `payments` on the object). */
    private async invoiceIntent(invoice: any): Promise<string | undefined> {
        try {
            const list: any = await this.stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
            const paid = ((list?.data || []) as any[]).find(p => p?.status === 'paid' && p?.payment?.payment_intent);
            const any = paid || ((list?.data || []) as any[]).find(p => p?.payment?.payment_intent);
            const id = idOf(any?.payment?.payment_intent);
            if (id) return id;
        } catch (error) {
            this.logger.warn(`club invoice ${invoice.id}: payments not listed: ${(error as Error)?.message}`);
        }
        return idOf(invoice?.payments?.data?.[0]?.payment?.payment_intent) || idOf(invoice?.payment_intent);
    }

    /**
     * A refund or dispute of a club charge: matched to its keeper row by PaymentIntent. A full refund or a
     * dispute marks the row reversed (a row still `due` becomes `void`, rave-share.ts) and cancels the
     * subscription at once. A partial refund shrinks a waiting share to half of what was kept.
     */
    async chargeReversed(charge: any, kind: 'refunded' | 'disputed', now: Date = new Date()): Promise<string> {
        const pi = idOf(charge?.payment_intent);
        if (!pi) return 'ignored';
        const row: any = await this.checkouts.findOne({ cardIntent: pi, 'sku.kind': 'CLUB' }).lean();
        if (!row) return 'ignored';
        const amount = Number(charge?.amount) || 0;
        const refunded = Number(charge?.amount_refunded) || 0;
        const base = Number(row.priceUsdCents) || 0;
        let full = kind === 'disputed' || charge?.refunded === true || (amount > 0 && refunded >= amount);
        if (!full) {
            if (!(refunded > 0) || !(amount > 0)) return 'partial';
            const keptBase = Math.floor((base * (amount - refunded)) / amount);
            const keep = Math.ceil((keptBase * CLUB_SHELTER_BPS) / 10000);
            if (keep <= 0) {
                full = true;
            } else {
                if (await shrinkShare(this.checkouts, row.orderId, pi, keep)) {
                    this.logger.warn(`club ${row.orderId}: partial refund, share reduced to ${keep} cents`);
                    return 'reduced';
                }
                this.logger.error(
                    `club ${row.orderId}: partial refund after its share left; Token Tails absorbs it, check by hand`
                );
                return 'partial';
            }
        }
        const { outcome, state } = await reverseShare(this.checkouts, row.orderId, pi, kind, now);
        // A full refund or any dispute ends the membership at once: no further renewals to refund or dispute.
        if (row.sku?.subscriptionId) await this.cancelNow(row.sku.subscriptionId);
        if (outcome === 'paid' || outcome === 'in-flight') {
            this.logger.error(
                outcome === 'paid'
                    ? `club ${row.orderId}: ${kind} after its share confirmed; Token Tails absorbs it, check by hand`
                    : `club ${row.orderId}: ${kind} while its share was ${state}; it will not be re-sent, check by hand`
            );
            return 'after-payout';
        }
        return 'voided';
    }

    private async cancelNow(subscriptionId: string) {
        // A replayed refund finds it canceled already; any Stripe error throws, so the event is retried.
        const current: any = await this.stripe.subscriptions.retrieve(subscriptionId);
        if (['canceled', 'incomplete_expired'].includes(current?.status)) {
            await this.club.syncSubscription(current);
            return;
        }
        const sub = await this.stripe.subscriptions.cancel(subscriptionId);
        await this.club.syncSubscription(sub);
    }

    /** Debounced, fire-and-forget keeper run, so a paid invoice does not wait for the keeper cron. */
    kickKeeper(): void {
        if (this.kickTimer) return;
        this.kickTimer = setTimeout(() => {
            this.kickTimer = null;
            this.shares.runOnce().catch(error => this.logger.warn(`club keeper kick: ${(error as Error)?.message}`));
        }, CLUB_KEEPER_KICK_MS);
        this.kickTimer.unref?.();
    }
}

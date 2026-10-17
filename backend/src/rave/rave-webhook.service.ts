import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import Stripe from 'stripe';
import { readRaveConfig } from './rave.config';
import { RAVE_ERRORS } from './rave.errors';
import { RaveWebhookEvent, RaveWebhookEventDocument } from './rave.schema';
import { RaveService } from './rave.service';
import { RaveAdsService } from './ads/rave-ads.service';

/*
 * POST /rave/stripe/webhook (cat-rave/CHECKOUT-SPEC.md section 4). Its own signing secret
 * (RAVE_STRIPE_WEBHOOK_SECRET): 503 without it, 400 on a bad signature. It keeps working while
 * RAVE_CHECKOUT_ENABLED is off, so refunds and late payments of earlier orders are never dropped.
 *
 * Event ids are recorded only AFTER a successful dispatch (Bad Cat round 3: recording first loses the
 * event on a crash); every write is idempotent on the PaymentIntent id anyway.
 */

export type RaveWebhookOutcome = string;

const intentId = (value: unknown): string =>
    typeof value === 'string'
        ? value
        : value && typeof value === 'object'
        ? String((value as { id?: string }).id || '')
        : '';

@Injectable()
export class RaveWebhookService {
    private readonly logger = new Logger(RaveWebhookService.name);
    env: NodeJS.ProcessEnv = process.env;

    constructor(
        @InjectModel(RaveWebhookEvent.name) private events: Model<RaveWebhookEventDocument>,
        private rave: RaveService,
        private stripePayments: StripePaymentService,
        // Moon Rave ad slots (PaymentIntent metadata `raveAd: '1'`) share this endpoint and secret.
        @Optional() private ads?: RaveAdsService
    ) {}

    verify(rawBody: Buffer | string | undefined, signature: string | undefined): Stripe.Event {
        const secret = readRaveConfig(this.env).webhookSecret;
        if (!secret) throw RAVE_ERRORS.webhookUnavailable();
        if (!signature || !rawBody) throw RAVE_ERRORS.badSignature();
        const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        try {
            return Stripe.webhooks.constructEvent(buffer, signature, secret);
        } catch {
            throw RAVE_ERRORS.badSignature();
        }
    }

    async handle(event: Stripe.Event, now: Date = new Date()): Promise<RaveWebhookOutcome> {
        if (await this.events.findOne({ eventId: event.id }).lean()) return 'duplicate';
        const outcome = await this.dispatch(event, now);
        try {
            await this.events.create({ eventId: event.id, type: event.type });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        return outcome;
    }

    private async dispatch(event: Stripe.Event, now: Date): Promise<RaveWebhookOutcome> {
        const object: any = event.data?.object;
        switch (event.type) {
            case 'payment_intent.succeeded': {
                if (object?.metadata?.raveAd === '1' && this.ads) {
                    const adIntent = await this.stripePayments.stripe.paymentIntents.retrieve(object.id);
                    return this.ads.markPaid(adIntent, now);
                }
                if (object?.metadata?.rave !== '1') return 'ignored';
                // The event body may be stale or forged by a replay of an old event: read the intent itself.
                const intent = await this.stripePayments.stripe.paymentIntents.retrieve(object.id, {
                    expand: ['latest_charge'],
                });
                return this.rave.markPaid(intent, now);
            }
            case 'payment_intent.processing':
                return this.rave.markProcessing(object);
            case 'payment_intent.payment_failed':
                return this.rave.markFailed(object);
            case 'payment_intent.canceled':
                if (object?.metadata?.raveAd === '1' && this.ads) return this.ads.markCanceled(object);
                return this.rave.markCanceled(object);
            case 'charge.refunded': {
                const pi = intentId(object?.payment_intent);
                // Cumulative over all refunds of the charge, so partial refunds that add up are a full one.
                const refunded = typeof object?.amount_refunded === 'number' ? object.amount_refunded : undefined;
                const out = await this.rave.reverse(pi, 'refunded', object?.refunded === true, refunded, now);
                return out === 'ignored' && this.ads
                    ? this.ads.reverse(pi, 'refunded', object?.refunded === true, refunded)
                    : out;
            }
            case 'charge.dispute.created': {
                const pi = intentId(object?.payment_intent);
                const out = await this.rave.reverse(pi, 'disputed', true);
                return out === 'ignored' && this.ads ? this.ads.reverse(pi, 'disputed', true) : out;
            }
            default:
                return 'ignored';
        }
    }
}

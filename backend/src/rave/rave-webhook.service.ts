import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { ILeaseCollection, isDuplicateKeyError, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import Stripe from 'stripe';
import { readRaveConfig } from './rave.config';
import { RAVE_ERRORS } from './rave.errors';
import { RaveWebhookEvent, RaveWebhookEventDocument } from './rave.schema';
import { RaveService } from './rave.service';
import { RaveAdsService } from './ads/rave-ads.service';

/*
 * Stripe events of the rave (cats and ads), two ways in, one handler (`handle`):
 *
 * - POST /rave/stripe/webhook (cat-rave/CHECKOUT-SPEC.md section 4), OPTIONAL: its signing secret is
 *   RAVE_STRIPE_WEBHOOK_SECRET, else STRIPE_WEBHOOK_SECRET; 503 without either, 400 on a bad signature.
 * - pullEvents (cron, every minute, one instance per tick through the `jobruns` lease): reads the same
 *   event types from Stripe's Events API with the secret key, so no signing secret is needed. The key
 *   only sees its own mode's events, so test and live never mix. This is what confirms payments,
 *   refunds and disputes when no webhook endpoint is set up. It runs only with NODE_ENV=production, and a
 *   pulled event never rebuilds a missing order (markPaid `recover: false`): the account's events are
 *   shared by every deployment holding the key, and another database's orders must never be paid again.
 *
 * Both keep working while checkout reports not-ready, so refunds and late payments of earlier orders are
 * never dropped. Event ids are recorded only AFTER a successful dispatch (Bad Cat round 3: recording first
 * loses the event on a crash); every write is idempotent on the PaymentIntent id anyway, so an event that
 * arrives both ways (or is pulled twice) is a no-op the second time.
 */

export const RAVE_EVENT_TYPES = [
    'payment_intent.succeeded',
    'payment_intent.processing',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.refunded',
    'charge.dispute.created',
] as const;
/** On boot the pull starts this far back (Stripe keeps events for 30 days). */
export const RAVE_EVENTS_LOOKBACK_S = 72 * 3600;
/** Each pull re-reads this much before its cursor, for events Stripe dated a little earlier. */
export const RAVE_EVENTS_OVERLAP_S = 120;
export const RAVE_EVENTS_PAGE = 100;
export const RAVE_EVENTS_MAX_PAGES = 5;
/** Longer than one run can take (5 pages, each event a Stripe read and a few writes), so runs never overlap. */
const RAVE_EVENTS_LEASE_MS = 5 * 60 * 1000;

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
    /** Unix seconds the next pull reads from (minus the overlap); in memory, so a restart re-reads 72 h. */
    eventsCursor: number | null = null;
    /**
     * A burst bigger than one run: the id to continue after (Stripe lists newest first) and the time the
     * head of that window was read, which becomes the cursor once the tail is drained.
     */
    private eventsResume: { after: string; headS: number; gte: number } | null = null;
    /** `jobruns` lease collection; tests replace it. */
    jobRuns: ILeaseCollection | null = null;
    private eventsWarned = false;

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

    /** Every minute (second 40): one instance pulls the rave's Stripe events (see the file comment). */
    @Cron('40 * * * * *', { name: 'rave-stripe-events' })
    async pullEventsCron(now: Date = new Date()) {
        const cfg = readRaveConfig(this.env);
        if (!cfg.secretKeyMode || !cfg.production) return 'off';
        const jobRuns =
            this.jobRuns ||
            ((this.events as any).db?.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection | undefined);
        if (!jobRuns) return this.pullEvents(now);
        return runLeased({
            jobRuns,
            jobName: 'rave-stripe-events',
            ttlMs: RAVE_EVENTS_LEASE_MS,
            now,
            logger: this.logger,
            run: () => this.pullEvents(now),
        }).catch(error => {
            this.logger.warn(`rave events pull: ${(error as Error)?.message}`);
            return 'failed';
        });
    }

    /**
     * Reads the rave's event types created since the cursor (minus RAVE_EVENTS_OVERLAP_S), at most
     * RAVE_EVENTS_MAX_PAGES pages of RAVE_EVENTS_PAGE, and handles them oldest first. The cursor moves
     * only when every page was read. A burst bigger than one run continues next run after the oldest
     * event read, and once that tail is drained the cursor moves only to when the head was read, so
     * events that arrived meanwhile are read too (each event is handled once: `handle` dedupes by id).
     */
    async pullEvents(now: Date = new Date()): Promise<{ read: number; handled: number; drained: boolean } | 'off'> {
        if (!readRaveConfig(this.env).secretKeyMode) return 'off';
        const nowS = Math.floor(now.getTime() / 1000);
        const cursor = this.eventsCursor ?? nowS - RAVE_EVENTS_LOOKBACK_S;
        const collected: Stripe.Event[] = [];
        const resume = this.eventsResume;
        // A continuation keeps its window's lower bound, so the tail it is reading never slides away.
        const gte = resume ? resume.gte : cursor - RAVE_EVENTS_OVERLAP_S;
        let startingAfter: string | undefined = resume?.after;
        let drained = false;
        try {
            for (let page = 0; page < RAVE_EVENTS_MAX_PAGES; page++) {
                const res: Stripe.ApiList<Stripe.Event> = await this.stripePayments.stripe.events.list({
                    types: [...RAVE_EVENT_TYPES],
                    created: { gte },
                    limit: RAVE_EVENTS_PAGE,
                    ...(startingAfter ? { starting_after: startingAfter } : {}),
                });
                const data = res?.data || [];
                collected.push(...data);
                if (!res?.has_more || !data.length) {
                    drained = true;
                    break;
                }
                startingAfter = data[data.length - 1].id;
            }
        } catch (error) {
            const status = (error as { statusCode?: number })?.statusCode;
            if ((status === 401 || status === 403) && !this.eventsWarned) {
                this.eventsWarned = true;
                this.logger.warn(
                    'rave: the Stripe key cannot read events (restricted key?). Payments still confirm through the buyer GET fallback, but refunds and disputes reach rave orders and ads only through POST /rave/stripe/webhook. Give the key Events read access or set up the webhook.'
                );
            } else if (status !== 401 && status !== 403) {
                this.logger.warn(`rave events pull: ${(error as Error)?.message}`);
            }
            return { read: collected.length, handled: 0, drained: false };
        }
        // Stripe lists newest first; handle oldest first so `succeeded` lands before a later `refunded`.
        // Reversed before the (stable) sort, so events of the same second also keep Stripe's order.
        collected.reverse();
        collected.sort((a, b) => (a.created || 0) - (b.created || 0));
        let handled = 0;
        let holdBack: number | null = null;
        for (const event of collected) {
            try {
                const outcome = await this.handle(event, now, 'pull');
                if (outcome !== 'duplicate' && outcome !== 'ignored') handled++;
            } catch (error) {
                // Not recorded, so the next pull reads it again; one that keeps failing for a day stops
                // holding the cursor back (it is logged each time, check it by hand).
                this.logger.warn(`rave event ${event.id} (${event.type}): ${(error as Error)?.message}`);
                const created = event.created || 0;
                if (created > nowS - 24 * 3600) holdBack = holdBack === null ? created : Math.min(holdBack, created);
            }
        }
        if (drained) {
            this.eventsResume = null;
            this.eventsCursor = Math.max(cursor, Math.min(holdBack ?? nowS, resume ? resume.headS : nowS));
        } else if (startingAfter) {
            this.eventsResume = { after: startingAfter, headS: resume ? resume.headS : nowS, gte };
            this.logger.warn('rave events pull: more events than one run reads; continuing next run');
        }
        return { read: collected.length, handled, drained };
    }

    /** `source` `pull`: read from the Events API (never rebuilds a missing order, see the file comment). */
    async handle(
        event: Stripe.Event,
        now: Date = new Date(),
        source: 'push' | 'pull' = 'push'
    ): Promise<RaveWebhookOutcome> {
        if (await this.events.findOne({ eventId: event.id }).lean()) return 'duplicate';
        const outcome = await this.dispatch(event, now, source);
        // Pulled events of the rest of the account (packs, portraits) are not stored: they are cheap to
        // read again (no Stripe call, one lookup) and would only grow the collection.
        if (source === 'pull' && outcome === 'ignored') return outcome;
        try {
            await this.events.create({ eventId: event.id, type: event.type });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        return outcome;
    }

    private async dispatch(event: Stripe.Event, now: Date, source: 'push' | 'pull'): Promise<RaveWebhookOutcome> {
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
                return this.rave.markPaid(intent, now, { recover: source === 'push' });
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

import { Injectable, Logger, Optional } from '@nestjs/common';
import { normalizeEmail } from 'src/badcat/badcat-util';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import Stripe from 'stripe';
import {
    AgeBand,
    FOUNDER_LEGEND_CAP,
    isAgeBand,
    isCatalogSku,
    isPawlegendsCurrency,
    isPawlegendsSku,
    PAWLEGENDS_SKUS,
    PawlegendsSku,
    SPEND_CAP_CENTS,
    stricterBand,
} from './pawlegends.contracts';
import { PAWLEGENDS_ERRORS } from './pawlegends.errors';
import { PawlegendsStore } from './pawlegends.schema';
import { Env, isProduction, pawlegendsWebhookSecret } from './pawlegends-env';
import {
    activeFilter,
    capCentsOf,
    identityClauses,
    isDeviceId,
    onceGroup,
    PawlegendsIdentity,
    PawlegendsStripeService,
} from './pawlegends-stripe.service';
import { grantPurchase, revokeSession, syncPremium } from './pawlegends-season.service';
import { GrowthService } from './growth/growth.service';

/*
 * Two ways in, one handler. The store runs on the Token Tails Stripe account: the Token Tails endpoint
 * (POST /image/webhook, STRIPE_WEBHOOK_SECRET) verifies the event and passes it here when `isPawlegendsEvent` says
 * so. An own endpoint (POST /pawlegends/stripe/webhook, raw body, PAWLEGENDS_STRIPE_WEBHOOK_SECRET) is optional.
 * Either way `handle` is idempotent by Stripe event id
 * (`pawlegendswebhookevents`), and every write is keyed by the Checkout Session id as well, so a replayed event
 * under a new id grants nothing twice. Writes purchases (the grant and the spend ledger); never a score.
 */

export type PawlegendsWebhookOutcome = 'processed' | 'duplicate' | 'ignored';

/** The Checkout Session events the store handles (`dispatch`). */
const PAWLEGENDS_SESSION_EVENTS: ReadonlySet<string> = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.expired',
]);

const idOf = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : (value as { id?: string } | null | undefined)?.id || undefined;

@Injectable()
export class PawlegendsWebhookService {
    private readonly logger = new Logger(PawlegendsWebhookService.name);
    now: () => Date = () => new Date();

    constructor(
        private readonly store: PawlegendsStore,
        private readonly checkout: PawlegendsStripeService,
        // growth: the first-purchase gift (absent in the older specs)
        @Optional() private readonly growth?: GrowthService
    ) {}

    /** The first-purchase gift of a paid store order: once per account (GrowthService.grantGift). Idempotent. */
    private async grantGift(row: any, sessionId: string): Promise<void> {
        if (!this.growth || !row?.giftCoat || !row.accountId) return;
        await this.growth.grantGift(String(row.accountId), row.giftCoat, sessionId);
    }

    /** Verifies the signature (400) and returns the event; 503 only without the webhook secret. */
    verify(rawBody: Buffer | string | undefined, signature: string | undefined, env: Env = process.env): Stripe.Event {
        const secret = pawlegendsWebhookSecret(env);
        if (!secret) throw PAWLEGENDS_ERRORS.webhookUnavailable();
        if (!signature || !rawBody) throw PAWLEGENDS_ERRORS.badSignature();
        const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        try {
            return Stripe.webhooks.constructEvent(buffer, signature, secret);
        } catch {
            throw PAWLEGENDS_ERRORS.badSignature();
        }
    }

    /**
     * Whether an event verified by the shared Token Tails webhook belongs here: a Checkout Session event with
     * `metadata.pawlegends === '1'`, or any refund or dispute close (the handler matches its payment intent against
     * its own purchase rows and ignores the rest). Every other event stays with Token Tails.
     */
    isPawlegendsEvent(event: Pick<Stripe.Event, 'type' | 'data'> | null | undefined): boolean {
        if (!event?.type) return false;
        if (event.type === 'charge.refunded' || event.type === 'charge.dispute.closed') return true;
        if (!PAWLEGENDS_SESSION_EVENTS.has(event.type)) return false;
        const md = ((event.data?.object as Stripe.Checkout.Session | undefined)?.metadata || {}) as Record<
            string,
            string
        >;
        return md.pawlegends === '1';
    }

    /** The event id is recorded only after the grant succeeded, so Stripe's retry of a failed one is processed. */
    async handle(event: Stripe.Event, env: Env = process.env): Promise<PawlegendsWebhookOutcome> {
        if (await this.store.webhookEvents.findOne({ eventId: event.id }).lean()) return 'duplicate';
        const outcome = await this.dispatch(event, env);
        try {
            await this.store.webhookEvents.create({ eventId: event.id, type: event.type });
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                this.logger.warn(`webhook ${event.id}: processed, id not recorded (${(error as Error)?.message})`);
            }
        }
        return outcome;
    }

    private async dispatch(event: Stripe.Event, env: Env): Promise<PawlegendsWebhookOutcome> {
        // Production never creates test sessions; a test event there would grant real items for free.
        if (isProduction(env) && !event.livemode) return 'ignored';
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                return this.checkoutCompleted(event.data.object as Stripe.Checkout.Session, event.livemode, env);
            case 'checkout.session.expired':
                return this.checkoutExpired(event.data.object as Stripe.Checkout.Session);
            case 'charge.refunded':
                return this.chargeRefunded(event.data.object as Stripe.Charge);
            case 'charge.dispute.closed':
                return this.disputeClosed(event.data.object as Stripe.Dispute);
            default:
                return 'ignored';
        }
    }

    /**
     * Grants the SKU of a paid session once: the purchase row (keyed by session id) becomes `paid` with the SKU's
     * server-side items. A refunded row is never granted again. The items come from the SKU table only.
     *
     * Before granting, the session must match what POST /pawlegends/checkout created: the charged amount and
     * currency are the table price and a checkout hold exists; otherwise the row is stored as `review`, with no
     * items and no seat. Then the checkout rules are checked again by the email Stripe collected (and the device
     * and account of the hold): a second once-only SKU, a stored under-16 band, the spend cap, or no Founder Legend
     * seat left voids it and refunds it in Stripe (`voided`).
     */
    async checkoutCompleted(
        session: Stripe.Checkout.Session,
        livemode = false,
        env: Env = process.env
    ): Promise<PawlegendsWebhookOutcome> {
        const md = (session.metadata || {}) as Record<string, string>;
        if (md.pawlegends !== '1' || !isPawlegendsSku(md.sku)) return 'ignored';
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return 'ignored';
        const sku = md.sku as PawlegendsSku;
        const def = PAWLEGENDS_SKUS[sku];
        const currency = isPawlegendsCurrency(session.currency) ? session.currency : null;

        // The checkout's hold row becomes the session row (the checkout renames it too; either order works).
        if (md.hold && md.hold.startsWith('hold_')) {
            const existing = await this.store.purchases.findOne({ sessionId: session.id }).lean();
            if (!existing) {
                await this.store.purchases
                    .updateOne({ sessionId: md.hold }, { $set: { sessionId: session.id } })
                    .catch(error => {
                        if (!isDuplicateKeyError(error)) throw error;
                    });
            } else {
                await this.store.purchases.deleteMany({ sessionId: md.hold });
            }
        }
        const row = (await this.store.purchases.findOne({ sessionId: session.id }).lean()) as any;
        if (row?.status === 'refunded' || row?.status === 'voided' || row?.status === 'review') return 'ignored';
        // A store grant is idempotent: a retried delivery heals a grant that failed after the row was marked paid.
        if (row?.status === 'paid') {
            if (isCatalogSku(sku) && row.accountId) {
                await grantPurchase(this.store, row.accountId, sku, session.id, this.now(), row.items);
                await this.grantGift(row, session.id);
            }
            return 'processed';
        }

        const email = normalizeEmail(session.customer_details?.email ?? session.customer_email) || undefined;
        const paymentIntentId = idOf(session.payment_intent);
        const base = {
            sku,
            currency: currency || String(session.currency || ''),
            amountCents: typeof session.amount_total === 'number' ? session.amount_total : 0,
            capCents: currency ? capCentsOf(sku, currency) : 0,
            ...(isDeviceId(md.device) ? { deviceId: md.device } : {}),
            ...(md.age_band ? { ageBand: md.age_band } : {}),
        };

        // a champion SKU charges the prorated price its checkout hold recorded (CHAMPION-STORE.md §5)
        const held =
            def.kind === 'champion' && row && row.currency === currency && typeof row.amountCents === 'number'
                ? (row.amountCents as number)
                : null;
        const expected = currency ? held ?? def.cents[currency] : null;
        const mismatch =
            expected === null
                ? `currency ${String(session.currency)} is not eur or usd`
                : session.amount_total !== expected
                ? `charged ${String(session.amount_total)} ${currency}, the SKU price is ${expected}`
                : !row
                ? 'no checkout hold (a session made outside POST /pawlegends/checkout)'
                : null;
        if (mismatch) {
            this.logger.error(`session ${session.id}: not granted, needs review: ${mismatch}`);
            await this.upsertRow(session.id, {
                $set: {
                    status: 'review',
                    voidReason: mismatch,
                    paymentIntentId,
                    livemode,
                    items: [],
                    ...(email ? { email } : {}),
                },
                $unset: { holdUntil: '' },
                $setOnInsert: base,
            });
            return 'processed';
        }

        const buyer: PawlegendsIdentity = {
            email: email || row?.email,
            deviceId: row?.deviceId || (isDeviceId(md.device) ? md.device : undefined),
            accountId: row?.accountId,
        };
        const reason = await this.voidReason(session.id, sku, buyer, row);
        if (reason) {
            const refund = await this.refund(paymentIntentId, session.id, env);
            this.logger.warn(`session ${session.id}: voided and refunded: ${reason}`);
            await this.upsertRow(session.id, {
                $set: {
                    status: 'voided',
                    voidReason: reason,
                    paymentIntentId,
                    livemode,
                    items: [],
                    ...refund,
                    ...(email ? { email } : {}),
                },
                $unset: { holdUntil: '' },
                $setOnInsert: base,
            });
            return 'processed';
        }

        await this.upsertRow(session.id, {
            $set: {
                status: 'paid',
                paidAt: this.now(),
                items: def.kind === 'champion' && Array.isArray(row?.items) && row.items.length ? row.items : def.items,
                paymentIntentId,
                livemode,
                ...(email ? { email } : {}),
            },
            $unset: { holdUntil: '' },
            $setOnInsert: base,
        });
        // Store and pass SKUs: the items and the pass row (read from the paid rows). Idempotent: if this fails, the
        // event id is not recorded, Stripe retries, and the `paid` branch above grants again.
        if (isCatalogSku(sku)) {
            await grantPurchase(this.store, buyer.accountId!, sku, session.id, this.now(), row?.items);
            await this.grantGift(row, session.id);
        }
        return 'processed';
    }

    private async upsertRow(sessionId: string, update: Record<string, unknown>): Promise<void> {
        try {
            await this.store.purchases.updateOne({ sessionId }, update, { upsert: true });
        } catch (error) {
            // Two deliveries raced on the upsert; the other one wrote it.
            if (!isDuplicateKeyError(error)) throw error;
        }
    }

    /** Why this paid session must not be granted to `buyer`, or null (the checkout rules, by the Stripe email). */
    async voidReason(
        sessionId: string,
        sku: PawlegendsSku,
        buyer: PawlegendsIdentity,
        row: any
    ): Promise<string | null> {
        const def = PAWLEGENDS_SKUS[sku];
        const store = isCatalogSku(sku);
        // Store and pass SKUs belong to the account of the checkout hold; once per account, not per email or device.
        if (store && !buyer.accountId) return 'no Token Tails account on the checkout hold';
        const clauses = store ? [{ accountId: buyer.accountId }] : identityClauses(buyer);
        const others = clauses.length
            ? (
                  (await this.store.purchases.find({ $and: [{ status: 'paid' }, { $or: clauses }] }).lean()) as any[]
              ).filter(r => r.sessionId !== sessionId)
            : [];
        const group = onceGroup(sku);
        if (group && others.some(r => group.includes(r.sku))) return `the buyer already owns ${group.join(' or ')}`;
        if (def.requires && !others.some(r => r.sku === def.requires)) return `needs ${def.requires}`;
        let band: AgeBand | undefined = isAgeBand(row?.ageBand) ? row.ageBand : undefined;
        for (const key of [buyer.email && `email:${buyer.email}`, buyer.deviceId && `device:${buyer.deviceId}`]) {
            if (!key) continue;
            const stored = (await this.store.buyers.findOne({ key }).lean()) as any;
            if (stored && isAgeBand(stored.ageBand)) band = stricterBand(band, stored.ageBand);
        }
        const effective: AgeBand = band || '18+';
        if (effective === 'under16') return 'the stored age band is under 16';
        const spent = await this.checkout.spentCents(buyer, sessionId);
        const cap = row?.capCents ?? 0;
        if (spent + cap > SPEND_CAP_CENTS[effective]) return `over the ${effective} spend cap (${spent} + ${cap})`;
        if (def.legendSeat) {
            const seatSkus = Object.values(PAWLEGENDS_SKUS)
                .filter(d => d.legendSeat)
                .map(d => d.sku);
            const taken = (
                (await this.store.purchases
                    .find({ $and: [activeFilter(this.now()), { sku: { $in: seatSkus } }] })
                    .lean()) as any[]
            ).filter(r => r.sessionId !== sessionId).length;
            if (taken >= FOUNDER_LEGEND_CAP) return 'no Founder Legend seat left';
        }
        return null;
    }

    /** Refunds a voided session in full; never throws (the row records the error for support). */
    private async refund(
        paymentIntentId: string | undefined,
        sessionId: string,
        env: Env
    ): Promise<Record<string, string>> {
        if (!paymentIntentId) return { refundError: 'no payment intent' };
        try {
            const refund = await this.checkout.stripe(env).refunds.create({
                payment_intent: paymentIntentId,
                metadata: { pawlegends_void: '1', session: sessionId },
            });
            return { refundId: refund.id };
        } catch (error) {
            this.logger.error(`session ${sessionId}: automatic refund failed: ${(error as Error)?.message}`);
            return { refundError: String((error as Error)?.message || error).slice(0, 300) };
        }
    }

    /** An unpaid session expired: its hold (cap share, seat) is freed. */
    async checkoutExpired(session: Stripe.Checkout.Session): Promise<PawlegendsWebhookOutcome> {
        const md = (session.metadata || {}) as Record<string, string>;
        if (md.pawlegends !== '1' || !session.id) return 'ignored';
        const ids = [session.id, md.hold].filter(Boolean);
        await this.store.purchases.updateMany(
            { sessionId: { $in: ids }, status: 'pending' },
            { $set: { status: 'expired' }, $unset: { holdUntil: '' } }
        );
        return 'processed';
    }

    /**
     * A full refund ends the purchase: its Founder Legend seat and its cap share are freed, and its items too,
     * unless it is a refund under the presale terms (`refundUnderTerms` marked the row, or the refund carries
     * `pawlegends_terms_refund`): then the items delivered now stay (GDD §8.3, the terms page).
     */
    async chargeRefunded(charge: Stripe.Charge): Promise<PawlegendsWebhookOutcome> {
        const paymentIntentId = idOf(charge.payment_intent);
        if (!paymentIntentId || !charge.refunded) return 'ignored';
        const terms =
            charge.metadata?.pawlegends_terms_refund === '1' ||
            !!charge.refunds?.data?.some(r => r.metadata?.pawlegends_terms_refund === '1');
        return this.endPayment(paymentIntentId, terms ? { termsRefund: true } : {});
    }

    /** A lost chargeback ends the purchase like a full refund (not under the terms): the money is gone. */
    async disputeClosed(dispute: Stripe.Dispute): Promise<PawlegendsWebhookOutcome> {
        const paymentIntentId = idOf(dispute.payment_intent);
        if (!paymentIntentId || dispute.status !== 'lost') return 'ignored';
        return this.endPayment(paymentIntentId, { disputeId: dispute.id });
    }

    /**
     * Marks the paid rows of a payment refunded, then revokes and downgrades every catalogue row of that payment,
     * already refunded ones too: the revoke and `syncPremium` are idempotent, so a delivery that failed half way (the
     * rows flipped, the revoke not done; the event id is then not recorded) is healed by Stripe's retry.
     */
    private async endPayment(
        paymentIntentId: string,
        extra: { termsRefund?: true; disputeId?: string }
    ): Promise<PawlegendsWebhookOutcome> {
        const rows = (await this.store.purchases
            .find({ paymentIntentId, status: { $in: ['paid', 'refunded'] } })
            .lean()) as any[];
        if (!rows.length) return 'ignored';
        const result = await this.store.purchases.updateMany(
            { paymentIntentId, status: 'paid' },
            { $set: { status: 'refunded', refundedAt: this.now(), ...extra } }
        );
        let healed = false;
        // Store and pass purchases: the items go (unless refunded under the terms), and the pass row is downgraded.
        for (const row of rows) {
            if (!isCatalogSku(row.sku) || !row.accountId) continue;
            const keep = !!extra.termsRefund || !!row.termsRefund;
            if (!keep) await revokeSession(this.store, row.sessionId, this.now());
            if (PAWLEGENDS_SKUS[row.sku]?.kind === 'pass') await syncPremium(this.store, row.accountId, this.now());
            healed = true;
        }
        return (result as any)?.matchedCount || healed ? 'processed' : 'ignored';
    }
}

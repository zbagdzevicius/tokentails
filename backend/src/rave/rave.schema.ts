import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/*
 * Moon Rave orders (`raveorders`, cat-rave/CHECKOUT-SPEC.md section 5). One order = N cats = N USD for
 * Pink Paw. The payout itself is an ordinary row of the shelter-share keeper (`cryptocheckouts`, memo
 * `tt:rave:<16 hex>`); this collection keeps the names, the optional X handle and the order's state.
 * No email, no IP address, no user id is stored; only the buyer's country code (rave-country.ts).
 */

export const RAVE_ORDER_STATUSES = [
    'created',
    'pending',
    /** USDC: the buyer reported a tx hash; not listed or counted until verifyUsdc reads its receipt. */
    'reported',
    'paid',
    'review',
    'onchain',
    'canceled',
    'refunded',
    'disputed',
    'expired',
] as const;
export type RaveOrderStatus = typeof RAVE_ORDER_STATUSES[number];

export type RaveMethod = 'card' | 'usdc';

export interface RavePayout {
    chainId: number;
    txHash: string;
    confirmedAt: Date;
}

export interface RaveUsdcTx {
    chainId: number;
    txHash: string;
    reportedAt: Date;
    checkedAt?: Date;
}

@Schema({ timestamps: true, collection: 'raveorders' })
export class RaveOrder {
    /** Public id: `rv_<16 hex>`. Its hex part is the payout memo `tt:rave:<16 hex>`. */
    @Prop({ required: true })
    orderId: string;

    /** The sheet's per-open UUID: a repeat call with the same body returns the same order. */
    @Prop({ required: false })
    clientKey?: string;

    /** sha256 of the normalised request, to refuse a reused clientKey with another body. */
    @Prop({ required: false })
    requestHash?: string;

    @Prop({ required: true, enum: ['card', 'usdc'] })
    method: RaveMethod;

    @Prop({ required: true })
    cats: number;

    @Prop({ required: true })
    donationCents: number;

    @Prop({ required: true, default: 0 })
    feeCents: number;

    @Prop({ required: true })
    amountCents: number;

    @Prop({ required: true, default: false })
    coverFee: boolean;

    @Prop({ type: [String], default: [] })
    names: string[];

    @Prop({ required: false })
    restName?: string;

    @Prop({ type: [String], default: [] })
    defaultNames: string[];

    @Prop({ required: false })
    xHandle?: string;

    @Prop({ required: false })
    xHandleLower?: string;

    /** ISO 3166-1 alpha-2 code: Cloudflare's IP country, else the one the buyer picked. The cats hold its flag. */
    @Prop({ required: false })
    country?: string;

    @Prop({ required: false, enum: ['ip', 'picked'] })
    countrySource?: 'ip' | 'picked';

    @Prop({ required: true, default: false })
    hidden: boolean;

    @Prop({ required: false, type: Date })
    hiddenAt?: Date;

    @Prop({ required: false })
    hiddenBy?: string;

    @Prop({ required: false })
    paymentIntentId?: string;

    @Prop({ required: false })
    livemode?: boolean;

    @Prop({ required: true, enum: RAVE_ORDER_STATUSES })
    status: RaveOrderStatus;

    /** `latest_charge.outcome.risk_level` of the card payment. */
    @Prop({ required: false })
    risk?: string;

    /** Why a paid order has no payout row (`mode`: a test payment against a mainnet keeper, or the reverse). */
    @Prop({ required: false })
    payoutSkipped?: string;

    @Prop({ required: false, type: Object, _id: false })
    payout?: RavePayout;

    @Prop({ required: false, type: Object, _id: false })
    usdc?: RaveUsdcTx;

    /** Last background recheck of an `expired` USDC order (its receipt was missing for 30 min). */
    @Prop({ required: false, type: Date })
    recheckedAt?: Date;

    /** Mirror of the keeper row's `shelterShare.state`. */
    @Prop({ required: false })
    shareState?: string;

    /** Refunded or disputed after the payout was sent: Token Tails absorbs it, the shelter keeps the money. */
    @Prop({ required: false })
    reversedAfterPayout?: string;

    /** Cumulative cents Stripe refunded (charge.refunded `amount_refunded`); partial refunds shrink the payout. */
    @Prop({ required: false })
    refundedCents?: number;

    @Prop({ required: false, type: Date })
    paidAt?: Date;

    /** Set only while `created`: the TTL index removes an abandoned order. */
    @Prop({ required: false, type: Date })
    expireAt?: Date;

    createdAt?: Date;
    updatedAt?: Date;
}

export type RaveOrderDocument = RaveOrder & Document;
export type IRaveOrder = RaveOrder & { _id: Types.ObjectId };

export const RaveOrderSchema = SchemaFactory.createForClass(RaveOrder);
RaveOrderSchema.index({ orderId: 1 }, { unique: true, name: 'rave_order_id_unique' });
RaveOrderSchema.index(
    { clientKey: 1 },
    { unique: true, name: 'rave_client_key_unique', partialFilterExpression: { clientKey: { $type: 'string' } } }
);
RaveOrderSchema.index(
    { paymentIntentId: 1 },
    {
        unique: true,
        name: 'rave_payment_intent_unique',
        partialFilterExpression: { paymentIntentId: { $type: 'string' } },
    }
);
RaveOrderSchema.index(
    { 'usdc.txHash': 1 },
    { unique: true, name: 'rave_usdc_tx_unique', partialFilterExpression: { 'usdc.txHash': { $type: 'string' } } }
);
RaveOrderSchema.index({ status: 1, createdAt: -1 });
RaveOrderSchema.index(
    { expireAt: 1 },
    { expireAfterSeconds: 0, name: 'rave_created_ttl', partialFilterExpression: { status: 'created' } }
);

/** Stripe events already handled by the rave webhook (recorded after a successful dispatch). */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'ravewebhookevents' })
export class RaveWebhookEvent {
    @Prop({ required: true })
    eventId: string;

    @Prop({ required: true })
    type: string;

    createdAt?: Date;
}

export type RaveWebhookEventDocument = RaveWebhookEvent & Document;
export const RaveWebhookEventSchema = SchemaFactory.createForClass(RaveWebhookEvent);
RaveWebhookEventSchema.index({ eventId: 1 }, { unique: true, name: 'rave_event_id_unique' });
RaveWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'rave_event_ttl' });

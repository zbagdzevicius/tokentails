import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RaveAdUsdc } from './rave-ads.crypto';

/*
 * Moon Rave ads (`raveads`). One document per purchase of one slot. `slotLock` holds the slot id while
 * the ad occupies it (held for checkout, paid and in review, live); a unique partial index on it means a
 * slot can never be sold twice at once. Releasing a slot is `$unset: { slotLock }`.
 *
 *   held ──paid──▶ review ──approve──▶ live ──(days)──▶ ended
 *     │               └──reject + Stripe refund──▶ rejected   (USDC: refund by hand, `refund.state: manual`)
 *     └──hold expired, unpaid──▶ expired           (refund / dispute ▶ refunded)
 *
 * `method` is `card` (Stripe PaymentIntent) or `usdc` (USDC on Arc to the treasury, bound by its exact
 * amount: `usdcAmountKey` unique; the paying tx: `usdcTxHash` unique).
 *
 * No email, no IP address and no user id is stored. The image is the server's own re-encoded WebP.
 */

export const RAVE_AD_STATUSES = [
    'held',
    'review',
    'live',
    'ended',
    'expired',
    'rejected',
    'refunded',
    'canceled',
] as const;
export type RaveAdStatus = typeof RAVE_AD_STATUSES[number];

/** Statuses that occupy their slot (they carry `slotLock`). */
export const RAVE_AD_LOCKING: RaveAdStatus[] = ['held', 'review', 'live'];

export const RAVE_AD_METHODS = ['card', 'usdc'] as const;
export type RaveAdMethod = typeof RAVE_AD_METHODS[number];

export interface RaveAdRefund {
    /** `manual`: a USDC payment, to be sent back by hand to `payer` (no automatic on-chain refund). */
    state: 'due' | 'refunded' | 'failed' | 'manual';
    /** USDC refunds: the wallet that paid. */
    payer?: string;
    refundId?: string;
    reason: string;
    at: Date;
    error?: string;
}

@Schema({ timestamps: true, collection: 'raveads' })
export class RaveAd {
    /** Public id `ad_<16 hex>`. */
    @Prop({ required: true })
    adId: string;

    @Prop({ required: false })
    clientKey?: string;

    @Prop({ required: false })
    requestHash?: string;

    @Prop({ required: true })
    slotId: string;

    /** = slotId while the ad occupies the slot; unique. */
    @Prop({ required: false })
    slotLock?: string;

    @Prop({ required: true, enum: RAVE_AD_STATUSES })
    status: RaveAdStatus;

    /** Absent on ads made before crypto: card. */
    @Prop({ required: false, enum: RAVE_AD_METHODS })
    method?: RaveAdMethod;

    /** USDC on Arc: chain, token, treasury, exact amount, then the paying tx (rave-ads.crypto.ts). */
    @Prop({ required: false, type: Object, _id: false })
    usdc?: RaveAdUsdc;

    /** `<chainId>:<token>:<amount>` of a USDC ad; unique, so one exact amount binds one ad. */
    @Prop({ required: false })
    usdcAmountKey?: string;

    /** The tx that paid a USDC ad (lowercased); unique, so one transfer pays one ad. */
    @Prop({ required: false })
    usdcTxHash?: string;

    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    url: string;

    @Prop({ required: false })
    xHandle?: string;

    @Prop({ required: false })
    imageUrl?: string;

    /**
     * Storage key of the sanitized image. Private (`rave-ads/private/…`) until an admin approves the ad;
     * approve copies it to the public `imagePublicKey` (then `imageUrl`). Both are deleted when the ad
     * expires unpaid, is canceled, rejected, refunded or ends.
     */
    @Prop({ required: false })
    imageKey?: string;

    @Prop({ required: false })
    imagePublicKey?: string;

    /** sha256 of the buyer's client-IP bucket at checkout (never the address): caps active unpaid holds. */
    @Prop({ required: false })
    holdIpHash?: string;

    /** Cumulative cents Stripe refunded (partial refunds shrink the shelter share). */
    @Prop({ required: false })
    refundedCents?: number;

    @Prop({ required: false })
    imageSha256?: string;

    @Prop({ required: true })
    priceCents: number;

    @Prop({ required: true, default: 0 })
    feeCents: number;

    @Prop({ required: true })
    amountCents: number;

    @Prop({ required: true, default: false })
    coverFee: boolean;

    @Prop({ required: false })
    paymentIntentId?: string;

    @Prop({ required: false })
    livemode?: boolean;

    @Prop({ required: false, type: Date })
    holdUntil?: Date;

    @Prop({ required: false, type: Date })
    paidAt?: Date;

    @Prop({ required: false, type: Date })
    approvedAt?: Date;

    @Prop({ required: false })
    approvedBy?: string;

    @Prop({ required: false, type: Date })
    liveUntil?: Date;

    @Prop({ required: false, type: Date })
    rejectedAt?: Date;

    @Prop({ required: false })
    rejectedBy?: string;

    @Prop({ required: false })
    rejectReason?: string;

    @Prop({ required: false, type: Object, _id: false })
    refund?: RaveAdRefund;

    /** Share of the price queued for Pink Paw at approval (RAVE_AD_SHELTER_BPS), in cents. */
    @Prop({ required: false })
    shelterCents?: number;

    @Prop({ required: false })
    shareState?: string;

    createdAt?: Date;
    updatedAt?: Date;
}

export type RaveAdDocument = RaveAd & Document;
export type IRaveAd = RaveAd & { _id: Types.ObjectId };

export const RaveAdSchema = SchemaFactory.createForClass(RaveAd);
RaveAdSchema.index({ adId: 1 }, { unique: true, name: 'rave_ad_id_unique' });
RaveAdSchema.index(
    { slotLock: 1 },
    { unique: true, name: 'rave_ad_slot_lock_unique', partialFilterExpression: { slotLock: { $type: 'string' } } }
);
RaveAdSchema.index(
    { clientKey: 1 },
    { unique: true, name: 'rave_ad_client_key_unique', partialFilterExpression: { clientKey: { $type: 'string' } } }
);
RaveAdSchema.index(
    { paymentIntentId: 1 },
    {
        unique: true,
        name: 'rave_ad_payment_intent_unique',
        partialFilterExpression: { paymentIntentId: { $type: 'string' } },
    }
);
RaveAdSchema.index(
    { usdcAmountKey: 1 },
    {
        unique: true,
        name: 'rave_ad_usdc_amount_unique',
        partialFilterExpression: { usdcAmountKey: { $type: 'string' } },
    }
);
RaveAdSchema.index(
    { usdcTxHash: 1 },
    { unique: true, name: 'rave_ad_usdc_tx_unique', partialFilterExpression: { usdcTxHash: { $type: 'string' } } }
);
RaveAdSchema.index({ status: 1, createdAt: -1 });

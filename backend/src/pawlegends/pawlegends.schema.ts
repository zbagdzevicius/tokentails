import { Injectable } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/*
 * Pawlegends store collections (POC.md §8). Nothing here stores a score: match results save only through
 * `POST /user/catbassadors/live` (the PAWLEGENDS branch writes `Game` rows and the user document).
 */

// ---------------------------------------------------------------------------------------------
// Purchases: one row per Checkout Session. Written `pending` at checkout (so open sessions count toward the
// spend caps and the Founder Legend seats), `paid` by the webhook, `refunded` by a full refund. The webhook
// grants nothing to a session it cannot match to the table: `review` (charged amount or currency differs from
// the SKU price, or no checkout hold: a session made outside POST /pawlegends/checkout) waits for a person;
// `voided` (a second once-only SKU, over the spend cap, under 16, or no Founder Legend seat left by the email
// Stripe collected) is refunded automatically. This is also the spend ledger.
// ---------------------------------------------------------------------------------------------

export type PawlegendsPurchaseStatus = 'pending' | 'paid' | 'refunded' | 'expired' | 'review' | 'voided';

@Schema({ collection: 'pawlegendspurchases', timestamps: true })
export class PawlegendsPurchase extends CommonSchema {
    @Prop({ required: true, unique: true })
    sessionId: string;

    @Prop({ required: true, index: true })
    sku: string;

    @Prop({ required: true, default: 'pending', index: true })
    status: PawlegendsPurchaseStatus;

    /** Lower-cased; the typed email at checkout, replaced by the one Stripe collected when it pays. */
    @Prop({ index: true, sparse: true })
    email?: string;

    @Prop({ index: true, sparse: true })
    deviceId?: string;

    /** Token Tails user id, when the host had a session (MVP: the POC host sends none yet). */
    @Prop({ index: true, sparse: true })
    accountId?: string;

    @Prop({ required: true })
    currency: string;

    /** Server price in the currency's smallest unit. */
    @Prop({ required: true })
    amountCents: number;

    /** The same amount at €1 = $1, for the spend caps. */
    @Prop({ required: true })
    capCents: number;

    @Prop()
    ageBand?: string;

    @Prop({ type: [String], default: [] })
    items: string[];

    /** An open session holds its seat or its cap share until this time. */
    @Prop()
    holdUntil?: Date;

    @Prop()
    paymentIntentId?: string;

    @Prop()
    paidAt?: Date;

    @Prop()
    refundedAt?: Date;

    @Prop()
    livemode?: boolean;

    /** Why the webhook did not grant it (`review` or `voided`). */
    @Prop()
    voidReason?: string;

    /** The Stripe refund of a voided row (or the error text when the refund call failed). */
    @Prop()
    refundId?: string;

    @Prop()
    refundError?: string;

    /**
     * Refunded under the presale terms (MVP late or stopped, GDD §8.3): the items delivered now stay with the
     * buyer, so the entitlement token still lists them. Set by `refundUnderTerms` before the refund.
     */
    @Prop()
    termsRefund?: boolean;
}
export type PawlegendsPurchaseDocument = PawlegendsPurchase & Document;
export const PawlegendsPurchaseSchema = SchemaFactory.createForClass(PawlegendsPurchase);
PawlegendsPurchaseSchema.index({ email: 1, createdAt: -1 });
PawlegendsPurchaseSchema.index({ deviceId: 1, createdAt: -1 });

// ---------------------------------------------------------------------------------------------
// Buyers: the age band answer, stored with the email and with the device (asked once).
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'pawlegendsbuyers', timestamps: true })
export class PawlegendsBuyer extends CommonSchema {
    /** `email:<address>`, `device:<id>` or `account:<user id>`. */
    @Prop({ required: true, unique: true })
    key: string;

    @Prop({ required: true })
    ageBand: string;
}
export type PawlegendsBuyerDocument = PawlegendsBuyer & Document;
export const PawlegendsBuyerSchema = SchemaFactory.createForClass(PawlegendsBuyer);

// ---------------------------------------------------------------------------------------------
// Offer state per device (POC.md §8.4)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'pawlegendsoffers', timestamps: true })
export class PawlegendsOfferState extends CommonSchema {
    @Prop({ required: true, unique: true })
    deviceId: string;

    /** Start of the 48 h starter window. */
    @Prop()
    starterFirstShownAt?: Date;

    @Prop()
    founderLastShownAt?: Date;

    /** The last "Meet <cat>" card shown (the Token Tails named-cat offer), and for which catalog cat. */
    @Prop()
    meetLastShownAt?: Date;

    @Prop()
    meetLastCatalogId?: string;

    /** The game session count of the last shown card (at most one card per session). */
    @Prop()
    lastShownSession?: number;
}
export type PawlegendsOfferStateDocument = PawlegendsOfferState & Document;
export const PawlegendsOfferStateSchema = SchemaFactory.createForClass(PawlegendsOfferState);

// ---------------------------------------------------------------------------------------------
// Restore links and notify-me sign-ups (double opt-in): only sha256 hashes of the raw tokens are stored.
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'pawlegendsrestoretokens', timestamps: true })
export class PawlegendsRestoreToken extends CommonSchema {
    @Prop({ required: true, unique: true })
    tokenHash: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop({ type: Date, default: null })
    usedAt?: Date | null;
}
export type PawlegendsRestoreTokenDocument = PawlegendsRestoreToken & Document;
export const PawlegendsRestoreTokenSchema = SchemaFactory.createForClass(PawlegendsRestoreToken);
PawlegendsRestoreTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

@Schema({ collection: 'pawlegendsnotify', timestamps: true })
export class PawlegendsNotify extends CommonSchema {
    @Prop({ required: true, unique: true })
    email: string;

    /** sha256 of the confirmation token sent by email. */
    @Prop({ required: true, index: true })
    tokenHash: string;

    @Prop()
    confirmedAt?: Date;

    /** Where the sign-up came from: 'results' or 'store'. */
    @Prop()
    source?: string;
}
export type PawlegendsNotifyDocument = PawlegendsNotify & Document;
export const PawlegendsNotifySchema = SchemaFactory.createForClass(PawlegendsNotify);

// ---------------------------------------------------------------------------------------------
// Webhook events (idempotency by Stripe event id)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'pawlegendswebhookevents', timestamps: true })
export class PawlegendsWebhookEvent extends CommonSchema {
    @Prop({ required: true, unique: true })
    eventId: string;

    @Prop()
    type?: string;
}
export type PawlegendsWebhookEventDocument = PawlegendsWebhookEvent & Document;
export const PawlegendsWebhookEventSchema = SchemaFactory.createForClass(PawlegendsWebhookEvent);
PawlegendsWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

/** Every Pawlegends schema, for `MongooseModule.forFeature` in the one AppModule. */
export const PAWLEGENDS_SCHEMAS = [
    { name: PawlegendsPurchase.name, schema: PawlegendsPurchaseSchema },
    { name: PawlegendsBuyer.name, schema: PawlegendsBuyerSchema },
    { name: PawlegendsOfferState.name, schema: PawlegendsOfferStateSchema },
    { name: PawlegendsRestoreToken.name, schema: PawlegendsRestoreTokenSchema },
    { name: PawlegendsNotify.name, schema: PawlegendsNotifySchema },
    { name: PawlegendsWebhookEvent.name, schema: PawlegendsWebhookEventSchema },
];

/**
 * The Pawlegends models in one provider. Specs build it from in-memory models
 * (`src/user/guest/memory-model.helper-spec.ts`), so services only use the calls that model supports.
 */
@Injectable()
export class PawlegendsStore {
    constructor(
        @InjectModel(PawlegendsPurchase.name) readonly purchases: Model<PawlegendsPurchaseDocument>,
        @InjectModel(PawlegendsBuyer.name) readonly buyers: Model<PawlegendsBuyerDocument>,
        @InjectModel(PawlegendsOfferState.name) readonly offers: Model<PawlegendsOfferStateDocument>,
        @InjectModel(PawlegendsRestoreToken.name) readonly restoreTokens: Model<PawlegendsRestoreTokenDocument>,
        @InjectModel(PawlegendsNotify.name) readonly notify: Model<PawlegendsNotifyDocument>,
        @InjectModel(PawlegendsWebhookEvent.name) readonly webhookEvents: Model<PawlegendsWebhookEventDocument>
    ) {}
}

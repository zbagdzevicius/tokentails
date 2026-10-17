import { Injectable } from '@nestjs/common';
import { InjectModel, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Schema as MongooseSchema } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/*
 * Bad Cat Daily (badcat) collections. No accounts: buyers are identified by the email Stripe Checkout
 * collected (lower-cased). Nothing here stores a score (the one score write path of the repo stays untouched).
 */

// ---------------------------------------------------------------------------------------------
// Purchases (one row per paid Checkout Session; renewals of a subscription add `kind: 'renewal'` rows)
// ---------------------------------------------------------------------------------------------

export type PurchaseKind = 'one_off' | 'subscription' | 'renewal';
export type PurchaseStatus = 'paid' | 'refunded';
export type BrandQueueState = 'queued' | 'placed' | 'declined';

@Schema({ collection: 'badcatpurchases', timestamps: true })
export class BadcatPurchase extends CommonSchema {
    /** Checkout Session id, or `inv:<invoice id>` for a renewal row. Unique. */
    @Prop({ required: true, unique: true })
    sessionId: string;

    @Prop({ required: true })
    kind: PurchaseKind;

    @Prop({ required: true, index: true })
    sku: string;

    @Prop({ index: true })
    email?: string;

    @Prop()
    customerId?: string;

    @Prop({ index: true, sparse: true })
    subscriptionId?: string;

    @Prop({ index: true, sparse: true })
    paymentIntentId?: string;

    /** Subscriptions: the PaymentIntents of their paid invoices (a refund of one is matched by these). */
    @Prop({ type: [String], default: undefined, index: true, sparse: true })
    paymentIntentIds?: string[];

    /** Set when a full refund ended the purchase (subscriptions stay ended after later Stripe updates). */
    @Prop()
    refundedAt?: Date;

    @Prop({ default: 0 })
    amountTotal: number;

    @Prop({ default: 'usd' })
    currency: string;

    @Prop({ default: 'paid' })
    status: PurchaseStatus;

    /** Stripe subscription status (subscriptions only). */
    @Prop()
    subStatus?: string;

    @Prop()
    periodEnd?: Date;

    @Prop()
    cancelAtPeriodEnd?: boolean;

    /** CheckoutMeta, as Stripe metadata strings. */
    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    meta: Record<string, string>;

    @Prop()
    catCode?: string;

    @Prop()
    catName?: string;

    @Prop()
    dayNo?: number;

    @Prop()
    giftFor?: string;

    @Prop({ type: MongooseSchema.Types.Mixed })
    brand?: { name?: string; url?: string; note?: string };

    /** Brand Shelf / sponsor purchases wait here for manual placement. */
    @Prop({ index: true, sparse: true })
    queue?: BrandQueueState;

    @Prop()
    livemode?: boolean;
}
export type BadcatPurchaseDocument = BadcatPurchase & Document;
export const BadcatPurchaseSchema = SchemaFactory.createForClass(BadcatPurchase);
BadcatPurchaseSchema.index({ email: 1, createdAt: -1 });
BadcatPurchaseSchema.index({ 'meta.via': 1 }, { sparse: true });

// ---------------------------------------------------------------------------------------------
// Cameos (paid, guest star, gift, admin-granted free/streak/reply/community)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatcameos', timestamps: true })
export class BadcatCameo extends CommonSchema {
    @Prop({ required: true })
    kind: string; // CameoKind (never 'club': Club cats live in BadcatClubCat)

    @Prop({ required: true, index: true })
    dayNo: number;

    @Prop({ required: true, index: true })
    catCode: string;

    @Prop({ required: true })
    name: string;

    @Prop({ index: true })
    email?: string;

    /** The purchase (Checkout Session id), `gift:<code>` or `admin:<id>`; unique, so a retried webhook adds none. */
    @Prop({ unique: true, sparse: true })
    sessionId?: string;

    @Prop({ default: false })
    hidden?: boolean;
}
export type BadcatCameoDocument = BadcatCameo & Document;
export const BadcatCameoSchema = SchemaFactory.createForClass(BadcatCameo);

// ---------------------------------------------------------------------------------------------
// Shuffles: the stored membership of one (day, shuffle); later bookings for its day are merged in
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatshuffles', timestamps: true })
export class BadcatShuffle extends CommonSchema {
    @Prop({ required: true })
    dayNo: number;

    @Prop({ required: true })
    shuffle: number;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    spectators: unknown[];

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    fridge: unknown[];

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    guestStars: unknown[];

    /** Cameo ids shown as spectators or guest stars (the 300-load guarantee counts these). */
    @Prop({ type: [String], default: [], index: true })
    cameoIds: string[];

    /** Every cat code in the bundle (the seen counter counts these). */
    @Prop({ type: [String], default: [], index: true })
    catCodes: string[];

    /** Day rows booked after the shuffle was stored that were already merged in (or had no seat). */
    @Prop({ type: [String], default: [] })
    lateIds: string[];

    /** Late cameo id → this shuffle's load counter when it joined (its guarantee counts loads after that). */
    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    lateBase: Record<string, number>;
}
export type BadcatShuffleDocument = BadcatShuffle & Document;
export const BadcatShuffleSchema = SchemaFactory.createForClass(BadcatShuffle);
BadcatShuffleSchema.index({ dayNo: 1, shuffle: 1 }, { unique: true });

// ---------------------------------------------------------------------------------------------
// Counters: `load:<day>:<shuffle>` (room loads) and `typed:<YYYY-MM-DD>` (typed arrivals). No personal data.
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatcounters', timestamps: true })
export class BadcatCounter extends CommonSchema {
    @Prop({ required: true, unique: true })
    key: string;

    @Prop({ default: 0 })
    n: number;
}
export type BadcatCounterDocument = BadcatCounter & Document;
export const BadcatCounterSchema = SchemaFactory.createForClass(BadcatCounter);

// ---------------------------------------------------------------------------------------------
// Gifts (gift_cameo, gift_club_3m): a redeem code the buyer passes on
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatgifts', timestamps: true })
export class BadcatGift extends CommonSchema {
    @Prop({ required: true, unique: true })
    code: string;

    @Prop({ required: true })
    sku: string;

    @Prop({ required: true, unique: true })
    sessionId: string;

    @Prop()
    buyerEmail?: string;

    @Prop()
    giftFor?: string;

    @Prop()
    redeemedAt?: Date;

    @Prop({ index: true })
    redeemedEmail?: string;

    /** gift_club_3m: Club until this date for `redeemedEmail` (never a subscription). */
    @Prop()
    clubUntil?: Date;

    @Prop()
    cameoId?: string;

    /** Set when the gift's purchase was refunded: the code no longer redeems and a redeemed gift ends. */
    @Prop()
    canceledAt?: Date;
}
export type BadcatGiftDocument = BadcatGift & Document;
export const BadcatGiftSchema = SchemaFactory.createForClass(BadcatGift);

// ---------------------------------------------------------------------------------------------
// Faces: cameo face PNGs (≤ 64 KB), shown only after manual approval, once per cat
// ---------------------------------------------------------------------------------------------

export type FaceStatus = 'pending' | 'approved' | 'rejected';

@Schema({ collection: 'badcatfaces', timestamps: true })
export class BadcatFace extends CommonSchema {
    @Prop({ required: true, index: true })
    catCode: string;

    @Prop({ required: true })
    cameoId: string;

    @Prop()
    email?: string;

    @Prop({ type: Buffer, required: true })
    png: Buffer;

    @Prop({ required: true })
    bytes: number;

    @Prop({ default: 'pending', index: true })
    status: FaceStatus;

    @Prop()
    reviewedAt?: Date;
}
export type BadcatFaceDocument = BadcatFace & Document;
export const BadcatFaceSchema = SchemaFactory.createForClass(BadcatFace);

// ---------------------------------------------------------------------------------------------
// Creator codes
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatcreatorcodes', timestamps: true })
export class BadcatCreatorCode extends CommonSchema {
    @Prop({ required: true, unique: true })
    code: string;

    @Prop({ required: true })
    email: string;

    @Prop({ default: 'pending' })
    status: 'pending' | 'approved' | 'rejected';

    @Prop()
    approvedAt?: Date;
}
export type BadcatCreatorCodeDocument = BadcatCreatorCode & Document;
export const BadcatCreatorCodeSchema = SchemaFactory.createForClass(BadcatCreatorCode);

// ---------------------------------------------------------------------------------------------
// Restore tokens (hash only; 30 minutes; single use)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatrestoretokens', timestamps: true })
export class BadcatRestoreToken extends CommonSchema {
    @Prop({ required: true, unique: true })
    tokenHash: string;

    @Prop({ required: true })
    email: string;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop()
    usedAt?: Date;
}
export type BadcatRestoreTokenDocument = BadcatRestoreToken & Document;
export const BadcatRestoreTokenSchema = SchemaFactory.createForClass(BadcatRestoreToken);
// MongoDB removes a token a day after it expired.
BadcatRestoreTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

// ---------------------------------------------------------------------------------------------
// Club cat: which cat a Club member shows in the weekly cameo and on the fridge wall
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatclubcats', timestamps: true })
export class BadcatClubCat extends CommonSchema {
    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: true, index: true })
    catCode: string;

    @Prop({ required: true })
    name: string;

    /**
     * The purchase (Checkout Session id or `gift:<code>`) of the scoped token that set this row; a verified
     * token clears it. Another scoped token may not change the row.
     */
    @Prop()
    scope?: string;

    /** ISO week (Monday day number) of the last seen email. */
    @Prop()
    lastSeenEmailWeek?: number;
}
export type BadcatClubCatDocument = BadcatClubCat & Document;
export const BadcatClubCatSchema = SchemaFactory.createForClass(BadcatClubCat);

// ---------------------------------------------------------------------------------------------
// Webhook events (idempotency by Stripe event id)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatwebhookevents', timestamps: true })
export class BadcatWebhookEvent extends CommonSchema {
    @Prop({ required: true, unique: true })
    eventId: string;

    @Prop()
    type?: string;
}
export type BadcatWebhookEventDocument = BadcatWebhookEvent & Document;
export const BadcatWebhookEventSchema = SchemaFactory.createForClass(BadcatWebhookEvent);
BadcatWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

// ---------------------------------------------------------------------------------------------
// Founding holds: a place reserved for an open founding Checkout Session (so places are not oversold)
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'badcatfoundingholds', timestamps: true })
export class BadcatFoundingHold extends CommonSchema {
    /** A random id until Stripe answers, then the Checkout Session id. Unique. */
    @Prop({ required: true, unique: true })
    holdId: string;

    @Prop({ index: true, sparse: true })
    sessionId?: string;

    /** The session's own expiry plus a margin; the place frees itself after it. */
    @Prop({ required: true, index: true })
    expiresAt: Date;
}
export type BadcatFoundingHoldDocument = BadcatFoundingHold & Document;
export const BadcatFoundingHoldSchema = SchemaFactory.createForClass(BadcatFoundingHold);
// MongoDB removes a hold an hour after it lapsed (counts already ignore it).
BadcatFoundingHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

/** Every badcat schema, for `MongooseModule.forFeature` in the one AppModule. */
export const BADCAT_SCHEMAS = [
    { name: BadcatPurchase.name, schema: BadcatPurchaseSchema },
    { name: BadcatCameo.name, schema: BadcatCameoSchema },
    { name: BadcatShuffle.name, schema: BadcatShuffleSchema },
    { name: BadcatCounter.name, schema: BadcatCounterSchema },
    { name: BadcatGift.name, schema: BadcatGiftSchema },
    { name: BadcatFace.name, schema: BadcatFaceSchema },
    { name: BadcatCreatorCode.name, schema: BadcatCreatorCodeSchema },
    { name: BadcatRestoreToken.name, schema: BadcatRestoreTokenSchema },
    { name: BadcatClubCat.name, schema: BadcatClubCatSchema },
    { name: BadcatWebhookEvent.name, schema: BadcatWebhookEventSchema },
    { name: BadcatFoundingHold.name, schema: BadcatFoundingHoldSchema },
];

/**
 * The badcat models in one provider. Specs build it from in-memory models
 * (`src/user/guest/memory-model.helper-spec.ts`), so services only use the calls that model supports.
 */
@Injectable()
export class BadcatStore {
    constructor(
        @InjectModel(BadcatPurchase.name) readonly purchases: Model<BadcatPurchaseDocument>,
        @InjectModel(BadcatCameo.name) readonly cameos: Model<BadcatCameoDocument>,
        @InjectModel(BadcatShuffle.name) readonly shuffles: Model<BadcatShuffleDocument>,
        @InjectModel(BadcatCounter.name) readonly counters: Model<BadcatCounterDocument>,
        @InjectModel(BadcatGift.name) readonly gifts: Model<BadcatGiftDocument>,
        @InjectModel(BadcatFace.name) readonly faces: Model<BadcatFaceDocument>,
        @InjectModel(BadcatCreatorCode.name) readonly creatorCodes: Model<BadcatCreatorCodeDocument>,
        @InjectModel(BadcatRestoreToken.name) readonly restoreTokens: Model<BadcatRestoreTokenDocument>,
        @InjectModel(BadcatClubCat.name) readonly clubCats: Model<BadcatClubCatDocument>,
        @InjectModel(BadcatWebhookEvent.name) readonly webhookEvents: Model<BadcatWebhookEventDocument>,
        @InjectModel(BadcatFoundingHold.name) readonly foundingHolds: Model<BadcatFoundingHoldDocument>
    ) {}
}

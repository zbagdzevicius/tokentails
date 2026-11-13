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

    /** 'answer' when the buyer gave (or had stored) an age band, 'default' when DEFAULT_AGE_BAND was applied. */
    @Prop()
    ageSource?: string;

    /**
     * Store and pass SKUs: when the buyer pressed the purchase button that asks for delivery now and acknowledges the
     * end of the 14-day withdrawal right (the button is the consent, STORE-PASS.md).
     */
    @Prop()
    consentAt?: Date;

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

    /** The lost chargeback (`charge.dispute.closed`, status `lost`) that ended this purchase. */
    @Prop()
    disputeId?: string;
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

// ---------------------------------------------------------------------------------------------
// Store and Legends Pass ownership (STORE-PASS.md): one row per account and item. A grant upserts (re-grants are
// no-ops through the unique index); a refund sets `revokedAt` (a refund under the presale terms keeps the items).
// Cosmetic only: nothing here is read by the sim, the replay or the score.
// ---------------------------------------------------------------------------------------------

/**
 * How an item was got: a web purchase, a pass reward, the presale, and for champions (CHAMPION-STORE.md) the
 * Founders roster grant, a Yarn unlock or a free Champion Pick; a ranked season reward (ranked/season-rewards.ts).
 */
export type PawlegendsOwnedSource = 'purchase' | 'pass' | 'legacy' | 'founders' | 'yarn' | 'milestone' | 'ranked';

@Schema({ collection: 'pawlegendsowned', timestamps: true })
export class PawlegendsOwned extends CommonSchema {
    @Prop({ required: true })
    accountId: string;

    @Prop({ required: true })
    item: string;

    @Prop({ required: true })
    source: PawlegendsOwnedSource;

    /** The Checkout Session of a purchase. */
    @Prop({ index: true, sparse: true })
    sessionId?: string;

    /** A pass reward: `<season>:<row>:<tier>` (e.g. `s1:p:7`). */
    @Prop()
    claim?: string;

    @Prop()
    revokedAt?: Date;
}
export type PawlegendsOwnedDocument = PawlegendsOwned & Document;
export const PawlegendsOwnedSchema = SchemaFactory.createForClass(PawlegendsOwned);
PawlegendsOwnedSchema.index({ accountId: 1, item: 1 }, { unique: true });

// ---------------------------------------------------------------------------------------------
// Legends Pass progress per account and season: `_id` = `<accountId>:<seasonId>`. Season XP is paid only by the
// one score writer (`POST /user/catbassadors/live`), after its Game row exists, so a duplicate save never pays twice.
// ---------------------------------------------------------------------------------------------

export type PawlegendsPremium = 'none' | 'pass' | 'plus';

@Schema({ collection: 'pawlegendsseason', timestamps: true })
export class PawlegendsSeason {
    @Prop({ type: String })
    _id: string;

    @Prop({ required: true, index: true })
    accountId: string;

    @Prop({ required: true })
    seasonId: string;

    @Prop({ default: 0 })
    xp: number;

    @Prop({ type: String, default: 'none' })
    premium: PawlegendsPremium;

    /** Pass+ tier skips. */
    @Prop({ default: 0 })
    skips: number;

    /** Claimed rewards, `f:<tier>` and `p:<tier>`. */
    @Prop({ type: [String], default: [] })
    claimed: string[];

    /** UTC day (YYYY-MM-DD) of the last first-win-of-the-day bonus. */
    @Prop()
    winDay?: string;

    /** Solo XP gate: the UTC day of `xpMatches`, the solo matches paid that day, and when the last one was paid. */
    @Prop()
    xpDay?: string;

    @Prop()
    xpMatches?: number;

    @Prop()
    xpAt?: Date;

    @Prop()
    updatedAt?: Date;
}
export type PawlegendsSeasonDocument = PawlegendsSeason & Document;
export const PawlegendsSeasonSchema = SchemaFactory.createForClass(PawlegendsSeason);

// ---------------------------------------------------------------------------------------------
// Yarn (docs/plans/moba/CHAMPION-STORE.md §4): the earned soft currency that unlocks champions. One row per account
// (`_id` = account id): the balance, the verified matches counted for the welcome milestones, the Champion Picks
// earned and spent, the weekly chest's ISO week and count, and the Founders roster check. Never sold, never
// converted, no cash value. One more row, `_id: 'meta:champions-release'`, holds the release time T of the champion
// store (the Founders roster cut-off), written once by the first backend that runs this code.
// ---------------------------------------------------------------------------------------------

@Schema({ collection: 'pawlegendsyarn', timestamps: true })
export class PawlegendsYarn {
    @Prop({ type: String })
    _id: string;

    @Prop({ default: 0 })
    balance: number;

    /** Yarn earned in total (never decreases). */
    @Prop({ default: 0 })
    earned: number;

    /** Verified matches that paid Yarn (the welcome milestones count these). */
    @Prop({ default: 0 })
    matches: number;

    /** Champion Picks earned by milestones, and spent. */
    @Prop({ default: 0 })
    picks: number;

    @Prop({ default: 0 })
    picksUsed: number;

    /**
     * The champions this row paid for (Yarn or a Champion Pick): the spend's claim, written in the same update as the
     * spend, so an unlock never spends twice and a grant that failed after the spend is finished by the next call.
     */
    @Prop({ type: [String], default: undefined })
    unlocked?: string[];

    /** The weekly chest: the ISO week (`2026-W47`) of `weekMatches`, and the last week whose chest was paid. */
    @Prop()
    week?: string;

    @Prop()
    weekMatches?: number;

    @Prop()
    chestWeek?: string;

    /** The Founders roster check ran for this account (granted or not). */
    @Prop()
    foundersChecked?: boolean;

    /** The release row only: the champion store's release time. */
    @Prop()
    at?: Date;
}
export type PawlegendsYarnDocument = PawlegendsYarn & Document;
export const PawlegendsYarnSchema = SchemaFactory.createForClass(PawlegendsYarn);

/** The Yarn ledger: one row per payment or spend, unique per account and `ref` (a game id, `unlock:<id>`, a week). */
@Schema({ collection: 'pawlegendsyarnlog', timestamps: true })
export class PawlegendsYarnLog {
    @Prop({ required: true })
    accountId: string;

    @Prop({ required: true })
    ref: string;

    /** Positive: earned; negative: spent. */
    @Prop({ required: true })
    amount: number;

    /** The champion an unlock or a pick bought. */
    @Prop()
    hero?: string;

    /** An unlock's record: written after its spend (the claim is the Yarn row's `unlocked`). */
    @Prop()
    done?: boolean;
}
export type PawlegendsYarnLogDocument = PawlegendsYarnLog & Document;
export const PawlegendsYarnLogSchema = SchemaFactory.createForClass(PawlegendsYarnLog);
PawlegendsYarnLogSchema.index({ accountId: 1, ref: 1 }, { unique: true });

/** Every Pawlegends schema, for `MongooseModule.forFeature` in the one AppModule. */
export const PAWLEGENDS_SCHEMAS = [
    { name: PawlegendsPurchase.name, schema: PawlegendsPurchaseSchema },
    { name: PawlegendsBuyer.name, schema: PawlegendsBuyerSchema },
    { name: PawlegendsOfferState.name, schema: PawlegendsOfferStateSchema },
    { name: PawlegendsRestoreToken.name, schema: PawlegendsRestoreTokenSchema },
    { name: PawlegendsNotify.name, schema: PawlegendsNotifySchema },
    { name: PawlegendsWebhookEvent.name, schema: PawlegendsWebhookEventSchema },
    { name: PawlegendsOwned.name, schema: PawlegendsOwnedSchema },
    { name: PawlegendsSeason.name, schema: PawlegendsSeasonSchema },
    { name: PawlegendsYarn.name, schema: PawlegendsYarnSchema },
    { name: PawlegendsYarnLog.name, schema: PawlegendsYarnLogSchema },
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
        @InjectModel(PawlegendsWebhookEvent.name) readonly webhookEvents: Model<PawlegendsWebhookEventDocument>,
        @InjectModel(PawlegendsOwned.name) readonly owned: Model<PawlegendsOwnedDocument>,
        @InjectModel(PawlegendsSeason.name) readonly seasons: Model<PawlegendsSeasonDocument>,
        @InjectModel(PawlegendsYarn.name) readonly yarn: Model<PawlegendsYarnDocument>,
        @InjectModel(PawlegendsYarnLog.name) readonly yarnLog: Model<PawlegendsYarnLogDocument>
    ) {}
}

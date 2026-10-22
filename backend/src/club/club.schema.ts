import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/*
 * Tails Club members (`clubmembers`): one row per Stripe subscription the landing started. The money side
 * (Pink Paw's half) is an ordinary shelter-share keeper row per paid invoice (`cryptocheckouts`, memo
 * `tt:club:<16 hex>`); this collection keeps who pays for what and until when. No card data, no address.
 */

/** Statuses that count as a member (as in Bad Cat Daily). */
export const CLUB_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

@Schema({ timestamps: true, collection: 'clubmembers' })
export class ClubMember {
    /** Set once Stripe created the subscription. */
    @Prop({ required: false })
    subscriptionId?: string;

    @Prop({ required: false })
    customerId?: string;

    /** The address the buyer typed, lowercased. */
    @Prop({ required: true })
    email: string;

    /** guest/canonical-email.ts of `email`: one row per inbox for the already-a-member check. */
    @Prop({ required: true })
    emailCanonical: string;

    /** A Token Tails account, from the optional accesstoken at checkout or linked by GET /club/me. */
    @Prop({ required: false })
    userId?: string;

    @Prop({ required: true, enum: ['month', 'year'] })
    plan: string;

    @Prop({ required: false })
    catId?: string;

    /** Stripe's subscription status (`incomplete` until the first invoice is paid). */
    @Prop({ required: true })
    subStatus: string;

    @Prop({ required: true, default: false })
    cancelAtPeriodEnd: boolean;

    @Prop({ required: false, type: Date })
    periodEnd?: Date;

    /** The landing's per-checkout UUID (idempotency). */
    @Prop({ required: true })
    clientKey: string;

    /** sha256(clientKey): GET /club/subscriptions/:id?k= must match it. */
    @Prop({ required: true })
    clientKeyHash: string;

    /** sha256 of the normalised checkout body, to refuse a reused clientKey with other details. */
    @Prop({ required: true })
    bodyHash: string;

    @Prop({ required: false })
    livemode?: boolean;

    createdAt?: Date;
    updatedAt?: Date;
}

export type ClubMemberDocument = ClubMember & Document;
export type IClubMember = ClubMember & { _id: Types.ObjectId };

export const ClubMemberSchema = SchemaFactory.createForClass(ClubMember);
ClubMemberSchema.index(
    { subscriptionId: 1 },
    {
        unique: true,
        name: 'club_subscription_unique',
        partialFilterExpression: { subscriptionId: { $type: 'string' } },
    }
);
ClubMemberSchema.index({ clientKey: 1 }, { unique: true, name: 'club_client_key_unique' });
ClubMemberSchema.index({ emailCanonical: 1, subStatus: 1 });
ClubMemberSchema.index({ userId: 1 }, { partialFilterExpression: { userId: { $type: 'string' } } });
ClubMemberSchema.index({ subStatus: 1, createdAt: -1 });

/** Stripe events already handled by the club webhook (recorded only after a successful dispatch). */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'clubwebhookevents' })
export class ClubWebhookEvent {
    @Prop({ required: true })
    eventId: string;

    @Prop({ required: true })
    type: string;

    createdAt?: Date;
}

export type ClubWebhookEventDocument = ClubWebhookEvent & Document;
export const ClubWebhookEventSchema = SchemaFactory.createForClass(ClubWebhookEvent);
ClubWebhookEventSchema.index({ eventId: 1 }, { unique: true, name: 'club_event_id_unique' });
ClubWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'club_event_ttl' });

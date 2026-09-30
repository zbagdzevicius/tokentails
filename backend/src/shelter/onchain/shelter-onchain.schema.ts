import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

export const DONATION_SOURCES = ['heist', 'page'] as const;
export type DonationSource = typeof DONATION_SOURCES[number];

export enum ShelterDonationStatus {
    PENDING = 'PENDING',
    SENT = 'SENT',
}

/** One server-paid gift per user per UTC day (unique `user` + `day`). */
@Schema({ timestamps: true, collection: 'shelterdonations' })
export class ShelterDonation extends CommonSchema {
    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    /** UTC day, `YYYY-MM-DD`. */
    @Prop({ required: true })
    day: string;

    @Prop({ required: true, enum: DONATION_SOURCES })
    source: DonationSource;

    /** `tt:<source>:<shortId>`, random and not derived from the user. */
    @Prop({ required: true })
    memo: string;

    @Prop({ required: true })
    amountWei: string;

    @Prop({ required: true })
    chainId: number;

    @Prop({ required: false })
    txHash?: string;

    @Prop({ required: true, enum: Object.values(ShelterDonationStatus) })
    status: ShelterDonationStatus;
}
export type ShelterDonationDocument = ShelterDonation & Document;
export const ShelterDonationSchema = SchemaFactory.createForClass(ShelterDonation);
ShelterDonationSchema.index({ user: 1, day: 1 }, { unique: true, name: 'user_day_unique' });

/** Gift slots used per UTC day, claimed atomically against the daily budget. */
@Schema({ timestamps: true, collection: 'shelterdonatedays' })
export class ShelterDonateDay extends CommonSchema {
    @Prop({ required: true })
    day: string;

    @Prop({ required: true, default: 0 })
    count: number;
}
export type ShelterDonateDayDocument = ShelterDonateDay & Document;
export const ShelterDonateDaySchema = SchemaFactory.createForClass(ShelterDonateDay);
ShelterDonateDaySchema.index({ day: 1 }, { unique: true, name: 'day_unique' });

/** A server-issued x402 payment nonce. Mongo drops it after `expiresAt` (TTL index). */
@Schema({ timestamps: true, collection: 'x402nonces' })
export class X402Nonce extends CommonSchema {
    @Prop({ required: true })
    nonce: string;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop({ required: false, type: Date, default: null })
    usedAt?: Date | null;

    @Prop({ required: false })
    txHash?: string;
}
export type X402NonceDocument = X402Nonce & Document;
export const X402NonceSchema = SchemaFactory.createForClass(X402Nonce);
X402NonceSchema.index({ nonce: 1 }, { unique: true, name: 'nonce_unique' });
X402NonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'nonce_ttl' });

/** A transaction that already paid for an x402 card. Single use (unique `txHash`). */
@Schema({ timestamps: true, collection: 'x402usedtxs' })
export class X402UsedTx extends CommonSchema {
    @Prop({ required: true })
    txHash: string;

    @Prop({ required: true })
    nonce: string;

    @Prop({ required: true })
    amountWei: string;
}
export type X402UsedTxDocument = X402UsedTx & Document;
export const X402UsedTxSchema = SchemaFactory.createForClass(X402UsedTx);
X402UsedTxSchema.index({ txHash: 1 }, { unique: true, name: 'txhash_unique' });

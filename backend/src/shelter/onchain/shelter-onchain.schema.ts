import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import { DONATE_SOURCES, DonateSource, ShelterDonationStatus } from 'src/shared-contracts/enums';

// Sources and statuses come from the generated copy of shared/enums.ts (plan F2), shared with the
// client. The donate flow writes PENDING (with the signed hash before broadcast) and SENT; the reconcile job (plan F7.4) moves SENT to
// CONFIRMED or FAILED. Downstream counts use CONFIRMED only; SENT shows as "on its way".
export const DONATION_SOURCES = DONATE_SOURCES;
export type DonationSource = DonateSource;
export { ShelterDonationStatus };

/** Why a treat is FAILED (plan F7.4: G4's REVERTED is FAILED with reason `reverted`). */
export const DONATION_FAILURE_REASONS = [
    'reverted',
    'timeout',
    'send-failed',
    'budget-spent',
    'stuck-pending',
] as const;
export type DonationFailureReason = typeof DONATION_FAILURE_REASONS[number];

/** An earlier attempt of the same user-day row, kept when a FAILED row is reused for a retry. */
export interface IDonationAttempt {
    txHash?: string;
    txNonce?: number;
    failedReason?: DonationFailureReason;
    failedAt?: Date;
}

/**
 * One server-paid gift per user per UTC day (unique `user` + `day`). A FAILED row releases the user's
 * day: the next gift that day reuses the row (the failed attempt moves to `attempts`), so the unique
 * index stays as it is and needs no migration.
 */
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

    /** Written before the broadcast (ShelterChain.sendDonation), together with the nonce and sender. */
    @Prop({ required: false })
    txHash?: string;

    /** The hot wallet nonce of `txHash`. The reconcile fails a gift as `timeout` only once it is used. */
    @Prop({ required: false })
    txNonce?: number;

    /** The hot wallet address (lowercased) that signed `txHash`. */
    @Prop({ required: false })
    txFrom?: string;

    @Prop({ required: false, type: Date })
    signedAt?: Date;

    /** Last reconcile visit; rows are visited least recently checked first, so none starves. */
    @Prop({ required: false, type: Date })
    lastCheckedAt?: Date;

    @Prop({ required: true, enum: Object.values(ShelterDonationStatus) })
    status: ShelterDonationStatus;

    /** True while this row holds a slot in `shelterdonatedays` for its day. */
    @Prop({ required: false, default: false })
    budgetSlot?: boolean;

    @Prop({ required: false, type: Date })
    sentAt?: Date;

    @Prop({ required: false, type: Date })
    confirmedAt?: Date;

    @Prop({ required: false })
    blockNumber?: number;

    @Prop({ required: false, type: Date })
    failedAt?: Date;

    @Prop({ required: false, enum: DONATION_FAILURE_REASONS })
    failedReason?: DonationFailureReason;

    @Prop({
        required: false,
        type: [{ _id: false, txHash: String, txNonce: Number, failedReason: String, failedAt: Date }],
        default: undefined,
    })
    attempts?: IDonationAttempt[];
}
export type ShelterDonationDocument = ShelterDonation & Document;
export const ShelterDonationSchema = SchemaFactory.createForClass(ShelterDonation);
ShelterDonationSchema.index({ user: 1, day: 1 }, { unique: true, name: 'user_day_unique' });
// The reconcile job reads unsettled rows least recently checked first and stuck PENDING rows by age;
// the indexer looks gifts up by hash, including earlier attempts of a reused row.
ShelterDonationSchema.index({ status: 1, updatedAt: 1 }, { name: 'status_updated' });
ShelterDonationSchema.index({ status: 1, lastCheckedAt: 1 }, { name: 'status_checked' });
ShelterDonationSchema.index({ txHash: 1 }, { name: 'txhash', sparse: true });
ShelterDonationSchema.index({ 'attempts.txHash': 1 }, { name: 'attempts_txhash', sparse: true });

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

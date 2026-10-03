import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/**
 * One daily paw (plan G4 "Paws"): created only by the nightly settlement, never by a game route.
 * Unique on `user + day`, so a rerun of the settlement can never give anyone a second paw. In-game
 * only: a paw is never money; the settlement pays the shelter, not the player.
 */
@Schema({ timestamps: true, collection: 'paws' })
export class Paw extends CommonSchema {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    user: Types.ObjectId;

    /** The UTC day the runs were played, `YYYY-MM-DD`. */
    @Prop({ required: true })
    day: string;

    /** Random, 32 hex characters. Part of the leaf; tells the owner which leaf is theirs. */
    @Prop({ required: true })
    pawId: string;

    /** Random per paw (0x + 32 bytes). Only ever returned to the paw's owner. */
    @Prop({ required: true })
    salt: string;

    /** keccak256(userId + salt). */
    @Prop({ required: true })
    userHash: string;

    /** keccak256("<pawId>|<userHash>|<day>"). */
    @Prop({ required: true })
    leaf: string;
}
export type PawDocument = Paw & Document;
export const PawSchema = SchemaFactory.createForClass(Paw);
PawSchema.index({ user: 1, day: 1 }, { unique: true, name: 'user_day_unique' });
PawSchema.index({ day: 1, pawId: 1 });

/**
 * `building` (claimed, paws being written) → `built` (root fixed) → `sending` (send claimed) →
 * `signed` (hash stored before broadcast) → `sent` → `confirmed` | `failed`. `empty`: no one earned a
 * paw that day. A `built` row whose send is off keeps `sendSkipped`.
 */
export const PAW_SETTLEMENT_STATUSES = [
    'building',
    'built',
    'sending',
    'signed',
    'sent',
    'confirmed',
    'failed',
    'empty',
] as const;
export type PawSettlementStatus = typeof PAW_SETTLEMENT_STATUSES[number];

/** Statuses after which the settlement never rebuilds its tree or sends again. */
export const PAW_SETTLEMENT_FROZEN: readonly PawSettlementStatus[] = [
    'sending',
    'signed',
    'sent',
    'confirmed',
    'failed',
    'empty',
];

export type PawSendSkipped = 'disabled' | 'not-configured' | 'zero-amount';

/** One row per settled UTC day (`_id` = the day), so N replicas settle a day once. */
@Schema({ timestamps: true, collection: 'pawsettlements' })
export class PawSettlement {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, enum: PAW_SETTLEMENT_STATUSES })
    status: PawSettlementStatus;

    /** Eligibility is judged at this instant, also on a rerun (plan F7.5: ">= 24 h old at settlement"). */
    @Prop({ required: true, type: Date })
    settlementAt: Date;

    /** Players with at least one scoring run that day. */
    @Prop({ required: false, default: 0 })
    candidateCount: number;

    @Prop({ required: false, default: 0 })
    pawCount: number;

    @Prop({ required: false })
    root?: string;

    /** `tt:paws:<day>:<root>`, sent in full. */
    @Prop({ required: false })
    memo?: string;

    /** Wei strings (18 decimals). */
    @Prop({ required: false })
    budgetWei?: string;

    @Prop({ required: false })
    pawAmountWei?: string;

    /** min(budget, paws x amount): what the day pays. */
    @Prop({ required: false })
    amountWei?: string;

    @Prop({ required: false })
    perPawWei?: string;

    /** Decision #26 sizing aid: 30-day average paws x amount. */
    @Prop({ required: false })
    suggestedBudgetWei?: string;

    @Prop({ required: false })
    chainId?: number;

    @Prop({ required: false })
    sendSkipped?: PawSendSkipped;

    @Prop({ required: false })
    txHash?: string;

    @Prop({ required: false })
    nonce?: number;

    @Prop({ required: false })
    from?: string;

    @Prop({ required: false })
    blockNumber?: number;

    @Prop({ required: false })
    failedReason?: string;

    /** Error class only (an ethers code), never a URL or key. */
    @Prop({ required: false })
    lastError?: string;

    @Prop({ required: false, type: Date })
    builtAt?: Date;

    @Prop({ required: false, type: Date })
    sendingAt?: Date;

    @Prop({ required: false, type: Date })
    signedAt?: Date;

    @Prop({ required: false, type: Date })
    sentAt?: Date;

    @Prop({ required: false, type: Date })
    confirmedAt?: Date;

    @Prop({ required: false, type: Date })
    failedAt?: Date;
}
export type PawSettlementDocument = PawSettlement & Document<string>;
export const PawSettlementSchema = SchemaFactory.createForClass(PawSettlement);
PawSettlementSchema.index({ status: 1 });

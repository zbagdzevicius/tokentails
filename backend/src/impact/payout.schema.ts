import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import {
    PAYOUT_METHODS,
    PAYOUT_PURPOSES,
    PAYOUT_STATUSES,
    PayoutMethod,
    PayoutPurpose,
    PayoutStatus,
} from './attestation';

export interface IPayoutReceipt {
    /** SHA-256 of the receipt file, computed by the server on upload. The file is not kept. */
    sha256: string;
    size: number;
    mime: string;
    uploadedAt: Date;
}

export interface IUsdEquivalent {
    cents: number;
    /** `YYYY-MM-DD`. */
    fxDate: string;
    fxSource: string;
}

export interface IPayoutSignature {
    signer: string;
    signature: string;
    signedAt: Date;
}

/**
 * An off-chain (or separately sent) payout to a shelter with its evidence (plan G4 "Attestation").
 * DRAFT until a shelter member confirms it (SHELTER_CONFIRMED, amber) or the shelter's handed-over
 * wallet signs it (SHELTER_SIGNED, green). Only confirmed and signed payouts reach the snapshot.
 */
@Schema({ timestamps: true, collection: 'impactpayouts' })
export class ImpactPayout extends CommonSchema {
    /** Public id (`p-` + 12 hex). Mongo ids never leave the private routes. */
    @Prop({ required: true })
    publicId: string;

    @Prop({ type: Types.ObjectId, ref: 'Shelter', required: true })
    shelter: Types.ObjectId;

    @Prop({ required: true, enum: PAYOUT_STATUSES, default: 'DRAFT' })
    status: PayoutStatus;

    @Prop({ required: true, enum: PAYOUT_PURPOSES })
    purpose: PayoutPurpose;

    /** Integer string, 18 decimals, in `symbol`. */
    @Prop({ required: true })
    amount: string;

    @Prop({ required: true })
    symbol: string;

    @Prop({ required: true, type: Date })
    paidAt: Date;

    @Prop({ required: true, enum: PAYOUT_METHODS })
    method: PayoutMethod;

    /** `YYYY-MM` the purchase pledge payment covers (purpose `purchase-pledge`). */
    @Prop({ required: false })
    pledgeMonth?: string;

    @Prop({ required: false, _id: false, type: Object })
    usdEquivalent?: IUsdEquivalent;

    /** Invoice or transfer reference. Personal data is refused. */
    @Prop({ required: false })
    reference?: string;

    /** On-chain payout transaction, when the money moved on a chain. */
    @Prop({ required: false })
    txHash?: string;

    @Prop({ required: true, _id: false, type: Object })
    receipt: IPayoutReceipt;

    /** SHA-256 of `attestationMessage` for the current fields. Changes with every edit. */
    @Prop({ required: true })
    attestationHash: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    createdBy: Types.ObjectId;

    /** Everyone who edited the draft after `createdBy`. None of them may confirm it. */
    @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
    editors?: Types.ObjectId[];

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    confirmedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    confirmedAt?: Date;

    @Prop({ required: false, _id: false, type: Object })
    signature?: IPayoutSignature;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    voidedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    voidedAt?: Date;
}
export type ImpactPayoutDocument = ImpactPayout & Document;
export const ImpactPayoutSchema = SchemaFactory.createForClass(ImpactPayout);
ImpactPayoutSchema.index({ publicId: 1 }, { unique: true, name: 'public_id_unique' });
ImpactPayoutSchema.index({ shelter: 1, status: 1, paidAt: -1 });
ImpactPayoutSchema.index({ purpose: 1, status: 1, pledgeMonth: 1 });

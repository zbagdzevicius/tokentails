import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/**
 * Outcome types. Copies: `cms/models/outcome.ts` (OUTCOME_TYPES) and the labels in
 * `client/pages/impact.tsx` (OUTCOME_LABEL). `outcome-copies.spec.ts` fails when they drift.
 */
export const OUTCOME_TYPES = ['treatment', 'surgery', 'vaccination', 'adoption', 'food', 'supplies'] as const;
export type OutcomeType = typeof OUTCOME_TYPES[number];

/** The animal's name only: letters, spaces, apostrophes, dots and hyphens, up to 40 characters. */
export const ANIMAL_NAME = /^[\p{L}][\p{L} '’.-]{0,39}$/u;

export interface IOutcomeImage {
    /** SHA-256 of the processed (redacted, metadata-free) webp held in `shelteroutcomeimages`. */
    sha256: string;
    width: number;
    height: number;
    /** Normalised boxes that were pixelated, for the record. */
    regions: { x: number; y: number; w: number; h: number }[];
    processedAt: Date;
    /** Public CDN url. Set only when the outcome is published. */
    url?: string;
    /** Bucket key of the public object, so unpublishing can delete it. */
    key?: string;
}

/**
 * What happened after money reached a shelter (plan G11 `ShelterOutcome`): type, date, amount, the
 * animal's name only, a redacted image and an optional payout link. Published only when a reviewer
 * marked it redacted and a second reviewer (neither its author nor its redactor) approved it
 * (decision #78). The schema refuses any other published state.
 */
@Schema({ timestamps: true, collection: 'shelteroutcomes' })
export class ShelterOutcome extends CommonSchema {
    /** Public id (`o-` + 12 hex). */
    @Prop({ required: true })
    publicId: string;

    @Prop({ type: Types.ObjectId, ref: 'Shelter', required: true })
    shelter: Types.ObjectId;

    @Prop({ required: true, enum: OUTCOME_TYPES })
    type: OutcomeType;

    @Prop({ required: true, type: Date })
    date: Date;

    /** Integer string, 18 decimals, in `symbol`. */
    @Prop({ required: false })
    amount?: string;

    @Prop({ required: false })
    symbol?: string;

    @Prop({ required: false, validate: { validator: (v: unknown) => v == null || ANIMAL_NAME.test(String(v)) } })
    animalName?: string;

    @Prop({ type: Types.ObjectId, ref: 'ImpactPayout', required: false })
    payout?: Types.ObjectId;

    @Prop({ required: false, _id: false, type: Object })
    image?: IOutcomeImage;

    /** The redaction checkbox: a reviewer looked at the processed image and the text. */
    @Prop({ required: true, default: false })
    redacted: boolean;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    redactedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    redactedAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false })
    approvedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    approvedAt?: Date;

    @Prop({ required: true, default: false })
    published: boolean;

    @Prop({ required: false, type: Date })
    publishedAt?: Date;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    createdBy: Types.ObjectId;

    /** Public image objects whose delete failed: purge them from the bucket and CDN by hand. */
    @Prop({ type: [String], default: undefined })
    unpurgedImageKeys?: string[];
}
export type ShelterOutcomeDocument = ShelterOutcome & Document;
export const ShelterOutcomeSchema = SchemaFactory.createForClass(ShelterOutcome);
ShelterOutcomeSchema.index({ publicId: 1 }, { unique: true, name: 'public_id_unique' });
ShelterOutcomeSchema.index({ published: 1, date: -1 });
ShelterOutcomeSchema.index({ shelter: 1, date: -1 });

/** Why a document may not be published, or null when it may (decision #78). */
export function publishBlocker(doc: Partial<ShelterOutcome> | Record<string, any>): string | null {
    if (!doc.redacted || !doc.redactedBy) {
        return 'not marked redacted';
    }
    if (!doc.approvedBy) {
        return 'not approved by a second reviewer';
    }
    const approver = String(doc.approvedBy);
    if (approver === String(doc.createdBy) || approver === String(doc.redactedBy)) {
        return 'the approver must be a second reviewer';
    }
    if (doc.image && !doc.image.url) {
        return 'the image is not uploaded';
    }
    return null;
}

ShelterOutcomeSchema.pre('validate', function (next) {
    if ((this as any).published) {
        const blocker = publishBlocker(this as any);
        if (blocker) {
            return next(new Error(`ShelterOutcome cannot be published: ${blocker}`));
        }
    }
    next();
});

/** The processed image bytes, kept private until the outcome is published. */
@Schema({ timestamps: true, collection: 'shelteroutcomeimages' })
export class ShelterOutcomeImage {
    @Prop({ type: Types.ObjectId, required: true })
    _id: Types.ObjectId;

    @Prop({ type: Buffer, required: true })
    data: Buffer;

    @Prop({ required: true })
    sha256: string;
}
export type ShelterOutcomeImageDocument = ShelterOutcomeImage & Document<Types.ObjectId>;
export const ShelterOutcomeImageSchema = SchemaFactory.createForClass(ShelterOutcomeImage);

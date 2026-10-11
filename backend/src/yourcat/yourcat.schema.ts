import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import { YourcatAvatarStatus } from './yourcat.contracts';

/*
 * One `/yourcat` cat (bet #3, docs/plans/yourcat-v2.md section 2.5). No IP, no IP hash and no photo URL is
 * stored here: the original lives under a private key, the avatar under a public one. There is no
 * portrait order field: the portrait status is resolved from the orders on `portraitImage` (section 6.5).
 */

export const YOURCAT_SOURCES = ['photo', 'manual'] as const;
export type YourcatSource = typeof YOURCAT_SOURCES[number];

export const YOURCAT_AVATAR_STATUSES: readonly YourcatAvatarStatus[] = ['pending', 'ready', 'failed', 'none'];

@Schema({ collection: 'yourcats', timestamps: true })
export class YourCat extends CommonSchema {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    owner: Types.ObjectId;

    @Prop({ type: String, enum: YOURCAT_SOURCES, required: true })
    source: YourcatSource;

    @Prop({ required: true })
    name: string;

    @Prop({ type: Boolean, default: false })
    named: boolean;

    /** CatOriginType key, never PEACHES. */
    @Prop({ required: true })
    family: string;

    /** The playable cat; null only on a placeholder (`creatingAt` set) while the cat is being made. */
    @Prop({ type: Types.ObjectId, ref: 'Cat', default: null })
    cat: Types.ObjectId | null;

    /**
     * Set while the record is a placeholder: it is inserted before the cat is restyled, so a failed insert
     * leaves the cat and onboarding untouched, then `cat` is set and this field unset in one write. Reads
     * (`GET /yourcat/me`, `/:id`) and retention skip placeholders; retention hard-deletes any older than
     * 10 minutes (the process died in between).
     */
    @Prop({ type: Date })
    creatingAt?: Date;

    /** Photo uploads: when the visitor confirmed the S1 statement. */
    @Prop({ type: Date, default: null })
    consentAt: Date | null;

    /** The S1-P privacy notice version shown at upload. */
    @Prop({ type: String, default: null })
    privacyNoticeVersion: string | null;

    /** `yourcat/originals/<uuid>.webp` (private); null once deleted. */
    @Prop({ type: String, default: null })
    originalKey: string | null;

    /** Cleared when the original is deleted. */
    @Prop({ type: String, default: null })
    originalSha256: string | null;

    /** createdAt + 30 days (extended by a checkout and by delivery). */
    @Prop({ type: Date, default: null })
    originalDeleteAfter: Date | null;

    /** Set by DELETE while a paid portrait is undelivered (section 2.8). */
    @Prop({ type: Boolean, default: false })
    deleteOriginalAfterDelivery: boolean;

    /** `yourcat/avatars/<uuid>.png` (public). */
    @Prop({ type: String, default: null })
    avatarKey: string | null;

    @Prop({ type: String, default: null })
    avatarUrl: string | null;

    @Prop({ type: String, enum: YOURCAT_AVATAR_STATUSES, required: true })
    avatarStatus: YourcatAvatarStatus;

    /** Measured, classifier + avatar. */
    @Prop({ type: Number, default: 0 })
    costMicroEur: number;

    /** ONE Image per record, reused by every checkout (section 6.5). */
    @Prop({ type: Types.ObjectId, ref: 'Image', default: null })
    portraitImage: Types.ObjectId | null;

    /** Paid portrait delivery attempts (section 6.5). */
    @Prop({ type: Number, default: 0 })
    portraitAttempts: number;

    /** When the paid portrait email was accepted by SendGrid; null while it is not sent. */
    @Prop({ type: Date, default: null })
    deliveryEmailAt: Date | null;

    /** Portrait email sends tried (the sweeper retries a painted but unsent portrait, bounded). */
    @Prop({ type: Number, default: 0 })
    deliveryEmailAttempts: number;

    @Prop({ type: Date, default: null })
    deletedAt: Date | null;
}

export type IYourCat = Pick<YourCat, keyof YourCat>;
export type YourCatDocument = YourCat & Document;

export const YourCatSchema = SchemaFactory.createForClass(YourCat);
YourCatSchema.index({ owner: 1, createdAt: -1 });
YourCatSchema.index({ originalDeleteAfter: 1 });
YourCatSchema.index({ avatarStatus: 1, createdAt: 1 });
YourCatSchema.index({ portraitImage: 1 }, { sparse: true });
YourCatSchema.index({ creatingAt: 1 }, { sparse: true });

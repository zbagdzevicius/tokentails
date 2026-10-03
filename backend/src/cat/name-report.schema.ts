import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import {
    NAME_MODERATION_ACTIONS,
    NAME_REPORT_NOTE_LIMIT,
    NAME_REPORT_REASONS,
    NAME_REPORT_STATUSES,
    NameModerationAction,
    NameReportReason,
    NameReportStatus,
} from 'src/shared-contracts/name';

/*
 * Player reports of offensive cat names (plan G3, App Store guideline 1.2: a way to report
 * user-generated content and act on it). Stored in `name_reports`, listed in the CMS
 * (`/name-reports`), resolved by PUT /cat/:id/name/moderate.
 */

export const NAME_REPORTS_COLLECTION = 'name_reports';

// The vocabulary lives in shared/name.ts, so the CMS moderation page uses the same copy.
export {
    NAME_MODERATION_ACTIONS,
    NAME_REPORT_NOTE_LIMIT,
    NAME_REPORT_REASONS,
    NAME_REPORT_STATUSES,
} from 'src/shared-contracts/name';
export type { NameModerationAction, NameReportReason, NameReportStatus } from 'src/shared-contracts/name';

@Schema({ timestamps: true, collection: NAME_REPORTS_COLLECTION })
export class NameReport extends CommonSchema {
    @Prop({ required: true, type: Types.ObjectId, ref: 'Cat' })
    cat: Types.ObjectId;

    /** Owner of the cat when reported. Read by moderators only; never returned to the reporter. */
    @Prop({ required: false, type: Types.ObjectId, ref: 'User' })
    catOwner?: Types.ObjectId;

    /** Who reported it. Never returned by any route; it only makes one open report per reporter. */
    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    reporter: Types.ObjectId;

    /** The name as it was when reported, so a later rename does not hide what was reported. */
    @Prop({ required: true })
    nameSnapshot: string;

    @Prop({ required: true, type: String, enum: NAME_REPORT_REASONS })
    reason: NameReportReason;

    @Prop({ required: false, maxlength: NAME_REPORT_NOTE_LIMIT })
    note?: string;

    @Prop({ required: true, type: String, enum: NAME_REPORT_STATUSES, default: 'open' })
    status: NameReportStatus;

    @Prop({ required: false, type: String, enum: NAME_MODERATION_ACTIONS })
    action?: NameModerationAction;

    @Prop({ required: false, type: Types.ObjectId, ref: 'User' })
    resolvedBy?: Types.ObjectId;

    @Prop({ required: false, type: Date })
    resolvedAt?: Date;
}

export type NameReportDocument = NameReport & Document;
export type INameReport = Pick<NameReport, keyof NameReport>;

export const NameReportSchema = SchemaFactory.createForClass(NameReport);
// One open report per reporter and cat: a second report updates the first (upsert on this key).
NameReportSchema.index(
    { cat: 1, reporter: 1 },
    { name: 'open_report_per_reporter', unique: true, partialFilterExpression: { status: 'open' } }
);
NameReportSchema.index({ status: 1, createdAt: -1 });

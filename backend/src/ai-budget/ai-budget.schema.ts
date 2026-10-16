import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/*
 * Bet #3 AI spend control (docs/plans/yourcat-v2.md section 3.2 and 3.3).
 *
 * - `AiBudgetDay` (`aibudgetdays`): one document per UTC day with the reservations, the measured
 *   spend and the anonymous daily counters (the server-side funnel). No personal data; kept 400 days.
 * - `AiQuota` (`aiquotas`): one counter per `<kind>:<ip|user|fail>:<key>:<day>`. The ip key is an HMAC of
 *   the day and the address, never the address. Removed by a TTL index 48 h after the day.
 */

export const AI_BUDGET_DAY_COUNTERS = [
    'yourcatAdmitted',
    'yourcatDone',
    'yourcatFailed',
    'yourcatRefusedNoCat',
    'yourcatRefusedPerson',
    'manualCats',
    'avatarsReady',
    'avatarsFailed',
    'previewsAdmitted',
    'previewsDone',
    'portraitCheckouts',
    'portraitsPaid',
    'yourcatPortraitsPaid',
    'portraitsDelivered',
    'portraitsDeliveryFailed',
    // A paid `/yourcat` portrait painted, but its email send was not accepted (one per failed send, KI-11).
    'portraitsEmailFailed',
    'costAlerts',
    // AiUploadGate refusals (all kinds), one per refused request, at the layer that refused it.
    'refusedNoClientIp',
    'refusedAppCheck',
    'refusedIpCap',
    'refusedUserCap',
    'refusedFailureCap',
    'refusedBudget',
] as const;
export type AiBudgetCounter = typeof AI_BUDGET_DAY_COUNTERS[number];

export const AI_BUDGET_ALERTS = [
    'perUploadSentAt',
    'perPreviewSentAt',
    'budget80SentAt',
    'budget100SentAt',
    'deliveryFailedSentAt',
] as const;
export type AiBudgetAlert = typeof AI_BUDGET_ALERTS[number];

/** How long day documents are kept (aggregate counts only). */
export const AI_BUDGET_DAY_RETENTION_SECONDS = 400 * 24 * 60 * 60;
/** Quota documents expire 48 h after their `expiresAt` base (the start of the day they count). */
export const AI_QUOTA_TTL_MS = 48 * 60 * 60 * 1000;

@Schema({ collection: 'aibudgetdays', timestamps: true })
export class AiBudgetDay {
    /** UTC `YYYY-MM-DD`. */
    @Prop({ required: true })
    day: string;

    /** AI_BUDGET_EUR_PER_DAY in micro-euros, at the first write of the day. */
    @Prop({ required: false, type: Number })
    capMicroEur?: number;

    /** Reservations plus settled differences. */
    @Prop({ required: false, type: Number })
    committedMicroEur?: number;

    /** The portrait-preview part of `committedMicroEur` (sub-cap). */
    @Prop({ required: false, type: Number })
    previewCommittedMicroEur?: number;

    /** Measured spend. */
    @Prop({ required: false, type: Number })
    spentMicroEur?: number;

    @Prop({ required: false, _id: false, type: Object })
    counts?: Partial<Record<AiBudgetCounter, number>>;

    @Prop({ required: false, _id: false, type: Object })
    alerts?: Partial<Record<AiBudgetAlert, Date>>;

    createdAt?: Date;
    updatedAt?: Date;
}

export type AiBudgetDayDocument = AiBudgetDay & Document;
export const AiBudgetDaySchema = SchemaFactory.createForClass(AiBudgetDay);
AiBudgetDaySchema.index({ day: 1 }, { unique: true });
AiBudgetDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: AI_BUDGET_DAY_RETENTION_SECONDS });

@Schema({ collection: 'aiquotas', versionKey: false })
export class AiQuota {
    /** `<kind>:<ip|user|fail>:<key>:<day>`. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true })
    day: string;

    @Prop({ required: true, type: Number, default: 0 })
    count: number;

    @Prop({ required: true, type: Date })
    expiresAt: Date;
}

export type AiQuotaDocument = AiQuota & Document<string>;
export const AiQuotaSchema = SchemaFactory.createForClass(AiQuota);
AiQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

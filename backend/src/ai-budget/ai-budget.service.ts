import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { YOURCAT_ERRORS } from 'src/yourcat/yourcat.errors';
import { AiAlertSender, sendAiAlert } from './ai-alert';
import {
    AiBudgetAlert,
    AiBudgetCounter,
    AiBudgetDay,
    AiBudgetDayDocument,
    AiQuota,
    AiQuotaDocument,
    AI_QUOTA_TTL_MS,
} from './ai-budget.schema';
import { AiKind, exceedsCostAlert, MICRO, microToEur } from './ai-cost';

/*
 * The global daily AI budget and the daily quota counters (bet #3, docs/plans/yourcat-v2.md section
 * 3.2 and 3.3). Every write is one atomic MongoDB update, so replicas and restarts share the limits.
 */

/** What `AiUploadGate.admit` hands back; settle, cancel and release take it. */
export interface AiTicket {
    kind: AiKind;
    /** UTC day the reservation was made on; settle and cancel always adjust this day. */
    day: string;
    reservationMicroEur: number;
    /** Attempt slots claimed (per IP, per user); `release` gives each back once. */
    quotaKeys: string[];
    /** The per-IP failure counter; `recordFailure` adds to it, nothing ever lowers it. */
    failureKey: string | null;
    released?: boolean;
    finished?: boolean;
}

export interface AiBudgetDayView {
    day: string;
    capEur: number;
    spentEur: number;
    committedEur: number;
    counts: Partial<Record<AiBudgetCounter, number>>;
}

/** One counter map per kind, so no counter name is ever built from a string. */
export const KIND_COUNTERS: Readonly<
    Record<AiKind, { admitted: AiBudgetCounter; done: AiBudgetCounter | null; failed: AiBudgetCounter | null }>
> = {
    yourcat: { admitted: 'yourcatAdmitted', done: 'yourcatDone', failed: 'yourcatFailed' },
    'portrait-preview': { admitted: 'previewsAdmitted', done: 'previewsDone', failed: null },
    manual: { admitted: 'manualCats', done: null, failed: null },
};

/** Reservation per admitted call, in euros (section 3.1 table). */
export const KIND_ESTIMATE_EUR: Readonly<Record<AiKind, number>> = {
    yourcat: 0.08,
    'portrait-preview': 0.3,
    manual: 0,
};

export const DEFAULT_BUDGET_EUR_PER_DAY = 5;
export const DEFAULT_PREVIEW_BUDGET_EUR_PER_DAY = 3;

export function envNumber(name: string, fallback: number, env: NodeJS.ProcessEnv = process.env): number {
    const raw = env[name];
    if (raw !== undefined && raw.trim() !== '') {
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) {
            return value;
        }
    }
    return fallback;
}

export const utcDay = (date: Date = new Date()) => date.toISOString().slice(0, 10);

@Injectable()
export class AiBudgetService {
    private readonly logger = new Logger(AiBudgetService.name);
    /** Clock and alert sender, replaceable in specs. */
    now: () => Date = () => new Date();
    alert: AiAlertSender = sendAiAlert;

    constructor(
        @InjectModel(AiBudgetDay.name) private readonly days: Model<AiBudgetDayDocument>,
        @InjectModel(AiQuota.name) private readonly quotas: Model<AiQuotaDocument>
    ) {}

    today(): string {
        return utcDay(this.now());
    }

    capMicroEur(env: NodeJS.ProcessEnv = process.env): number {
        return Math.round(envNumber('AI_BUDGET_EUR_PER_DAY', DEFAULT_BUDGET_EUR_PER_DAY, env) * MICRO);
    }

    /** The preview sub-cap, never above the global cap. */
    previewCapMicroEur(env: NodeJS.ProcessEnv = process.env): number {
        const preview = Math.round(
            envNumber('AI_BUDGET_PREVIEW_EUR_PER_DAY', DEFAULT_PREVIEW_BUDGET_EUR_PER_DAY, env) * MICRO
        );
        return Math.min(preview, this.capMicroEur(env));
    }

    estimateMicroEur(kind: AiKind): number {
        return Math.round(KIND_ESTIMATE_EUR[kind] * MICRO);
    }

    // ----- budget -----

    /**
     * Reserves `estMicro` on `day` for `kind`, or throws 503 BUDGET_EXHAUSTED. `$not: {$gt}` (the
     * lease.ts pattern) also matches a document where the field is missing, so a day document created by
     * another kind, a paid delivery or an alert never blocks a reservation.
     */
    async reserve(kind: AiKind, estMicro: number, day: string = this.today()): Promise<void> {
        const preview = kind === 'portrait-preview';
        const cap = this.capMicroEur();
        const previewCap = this.previewCapMicroEur();
        // On the first request of a day there is no document, so the filter below cannot refuse: a cap
        // of 0 (or below one estimate) must refuse here.
        if (estMicro > cap || (preview && estMicro > previewCap)) {
            throw YOURCAT_ERRORS.budgetExhausted();
        }
        const filter: Record<string, unknown> = { day, committedMicroEur: { $not: { $gt: cap - estMicro } } };
        const inc: Record<string, number> = {
            committedMicroEur: estMicro,
            [`counts.${KIND_COUNTERS[kind].admitted}`]: 1,
        };
        if (preview) {
            filter.previewCommittedMicroEur = { $not: { $gt: previewCap - estMicro } };
            inc.previewCommittedMicroEur = estMicro;
        }
        const attempt = () =>
            this.days.findOneAndUpdate(
                filter,
                { $inc: inc, $setOnInsert: { capMicroEur: cap } },
                { upsert: true, new: true }
            );
        try {
            await attempt();
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            // Either the day is full (the filter missed and the upsert hit the unique `day`), or two
            // first-of-day upserts raced. Retry once; a second E11000 means full.
            try {
                await attempt();
            } catch (second) {
                if (isDuplicateKeyError(second)) {
                    throw YOURCAT_ERRORS.budgetExhausted();
                }
                throw second;
            }
        }
    }

    /** After the AI calls: replaces the reservation with the measured cost, on the ticket's own day. */
    async settle(ticket: AiTicket, actualMicro: number): Promise<void> {
        if (ticket.finished || !ticket.reservationMicroEur) {
            return;
        }
        ticket.finished = true;
        const actual = Math.max(0, Math.round(actualMicro));
        const diff = actual - ticket.reservationMicroEur;
        const inc: Record<string, number> = { committedMicroEur: diff, spentMicroEur: actual };
        if (ticket.kind === 'portrait-preview') {
            inc.previewCommittedMicroEur = diff;
        }
        await this.days.updateOne({ day: ticket.day }, { $inc: inc });
    }

    /** Refused before any AI call: gives the whole reservation back. */
    async cancel(ticket: AiTicket): Promise<void> {
        if (ticket.finished || !ticket.reservationMicroEur) {
            return;
        }
        ticket.finished = true;
        const inc: Record<string, number> = { committedMicroEur: -ticket.reservationMicroEur };
        if (ticket.kind === 'portrait-preview') {
            inc.previewCommittedMicroEur = -ticket.reservationMicroEur;
        }
        await this.days.updateOne({ day: ticket.day }, { $inc: inc });
    }

    /** A paid portrait delivery: recorded with no cap check (the customer has paid). */
    async recordPaidSpend(actualMicro: number, day: string = this.today()): Promise<void> {
        const actual = Math.max(0, Math.round(actualMicro));
        await this.upsertDay(day, { $inc: { committedMicroEur: actual, spentMicroEur: actual } });
    }

    /** Adds `by` to one daily counter. Never throws: counters must not fail a request. */
    async count(counter: AiBudgetCounter, day: string = this.today(), by = 1): Promise<void> {
        try {
            await this.upsertDay(day, { $inc: { [`counts.${counter}`]: by } });
        } catch (error) {
            this.logger.warn(`counter ${counter} not written: ${(error as Error)?.message}`);
        }
    }

    /** Whether today's budget still has room for one reservation of `kind` (GET /yourcat/status). */
    async hasRoomFor(kind: AiKind, day: string = this.today()): Promise<boolean> {
        const est = this.estimateMicroEur(kind);
        const cap = this.capMicroEur();
        if (est > cap) {
            return false;
        }
        const doc: any = await this.days.findOne({ day }, { committedMicroEur: 1, previewCommittedMicroEur: 1 }).lean();
        if ((doc?.committedMicroEur || 0) > cap - est) {
            return false;
        }
        if (kind === 'portrait-preview') {
            return (doc?.previewCommittedMicroEur || 0) <= this.previewCapMicroEur() - est;
        }
        return true;
    }

    async stats(days: number, now: Date = this.now()): Promise<AiBudgetDayView[]> {
        const span = Math.min(60, Math.max(1, Math.floor(days) || 14));
        const from = utcDay(new Date(now.getTime() - (span - 1) * 24 * 60 * 60 * 1000));
        const docs: any[] = await this.days
            .find({ day: { $gte: from } })
            .sort({ day: -1 })
            .lean();
        return docs.map(doc => ({
            day: doc.day,
            capEur: microToEur(doc.capMicroEur ?? this.capMicroEur()),
            spentEur: microToEur(doc.spentMicroEur || 0),
            committedEur: microToEur(doc.committedMicroEur || 0),
            counts: doc.counts || {},
        }));
    }

    // ----- alerts -----

    /** Committed spend crossed 80 % or 100 % of the cap: one email each per day. */
    async checkBudgetAlerts(day: string = this.today()): Promise<void> {
        try {
            const doc: any = await this.days.findOne({ day }).lean();
            if (!doc) {
                return;
            }
            const cap = doc.capMicroEur ?? this.capMicroEur();
            const committed = doc.committedMicroEur || 0;
            if (cap <= 0) {
                return;
            }
            const text = `AI budget on ${day}: committed €${microToEur(committed)} of €${microToEur(
                cap
            )}, measured €${microToEur(doc.spentMicroEur || 0)}. See GET /yourcat/stats.`;
            if (committed >= cap) {
                await this.alertOnce(day, 'budget100SentAt', `AI budget used up for ${day}`, text);
            }
            if (committed >= cap * 0.8) {
                await this.alertOnce(day, 'budget80SentAt', `AI budget at 80% for ${day}`, text);
            }
        } catch (error) {
            this.logger.warn(`budget alert check failed: ${(error as Error)?.message}`);
        }
    }

    /**
     * A call's measured cost: counts a cost alert when it is above the kind's threshold and emails at
     * most once a day per kind, with the day's alert count and the average measured cost.
     */
    async noteCost(kind: AiKind, day: string, costMicro: number): Promise<boolean> {
        if (!exceedsCostAlert(kind, costMicro)) {
            return false;
        }
        try {
            await this.count('costAlerts', day);
            const doc: any = await this.days.findOne({ day }).lean();
            const done = kind === 'yourcat' ? doc?.counts?.yourcatDone : doc?.counts?.previewsDone;
            const average = done ? microToEur((doc?.spentMicroEur || 0) / done) : microToEur(costMicro);
            const label = kind === 'yourcat' ? '/yourcat upload' : '/image/portrait preview';
            await this.alertOnce(
                day,
                kind === 'yourcat' ? 'perUploadSentAt' : 'perPreviewSentAt',
                `AI cost alert: a ${label} cost €${microToEur(costMicro)}`,
                `On ${day} a ${label} cost €${microToEur(costMicro)}. Cost alerts today: ${
                    doc?.counts?.costAlerts || 1
                }. Average measured cost per call today: about €${average}. ` +
                    'If this stays high, lower the caps or turn the avatar off (docs/BACKEND.md).'
            );
        } catch (error) {
            this.logger.warn(`cost alert failed: ${(error as Error)?.message}`);
        }
        return true;
    }

    /** Sets `alerts.<name>` once per day with a conditional update, then sends; false when already sent. */
    async alertOnce(day: string, name: AiBudgetAlert, subject: string, text: string): Promise<boolean> {
        await this.upsertDay(day, {});
        const result = await this.days.updateOne(
            { day, [`alerts.${name}`]: { $exists: false } },
            { $set: { [`alerts.${name}`]: this.now() } }
        );
        if (!result?.modifiedCount) {
            return false;
        }
        await this.alert(subject, text);
        return true;
    }

    // ----- quotas -----

    /**
     * Claims one slot of `id` under `limit` (the claimSlot pattern of the shelter donate service,
     * copied). A limit of 0 refuses without writing.
     */
    async claimQuota(id: string, limit: number, day: string): Promise<boolean> {
        if (!(limit > 0)) {
            return false;
        }
        const attempt = () =>
            this.quotas.findOneAndUpdate(
                { _id: id, count: { $not: { $gte: limit } } },
                { $inc: { count: 1 }, $setOnInsert: { day, expiresAt: this.quotaExpiry() } },
                { upsert: true, new: true }
            );
        try {
            await attempt();
            return true;
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            // Over the cap, or two first claims raced: retry once; a second E11000 means over the cap.
            try {
                await attempt();
                return true;
            } catch (second) {
                if (isDuplicateKeyError(second)) {
                    return false;
                }
                throw second;
            }
        }
    }

    /** Gives one claimed slot back (never below 0). */
    async releaseQuota(id: string): Promise<void> {
        await this.quotas.updateOne({ _id: id, count: { $gt: 0 } }, { $inc: { count: -1 } });
    }

    async quotaCount(id: string): Promise<number> {
        const doc: any = await this.quotas.findOne({ _id: id }, { count: 1 }).lean();
        return doc?.count || 0;
    }

    /** Adds one to a failure counter, with no limit check. Never released. */
    async addFailure(id: string, day: string): Promise<void> {
        const attempt = () =>
            this.quotas.updateOne(
                { _id: id },
                { $inc: { count: 1 }, $setOnInsert: { day, expiresAt: this.quotaExpiry() } },
                { upsert: true }
            );
        try {
            await attempt();
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            await attempt();
        }
    }

    private quotaExpiry(): Date {
        return new Date(this.now().getTime() + AI_QUOTA_TTL_MS);
    }

    /**
     * Upserts the day document. Whatever writes first on a day (a counter, a paid delivery, an alert or a
     * reservation) stores the cap of that moment, so stats and alerts report the cap reservations used.
     */
    private async upsertDay(day: string, update: Record<string, unknown>): Promise<void> {
        const setOnInsert = { capMicroEur: this.capMicroEur(), ...((update.$setOnInsert as object) || {}) };
        const withCap = { ...update, $setOnInsert: setOnInsert };
        const attempt = () => this.days.updateOne({ day }, withCap, { upsert: true });
        try {
            await attempt();
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            await attempt();
        }
    }
}

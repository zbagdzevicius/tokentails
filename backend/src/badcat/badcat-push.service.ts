import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Game, GameDocument, GameType } from 'src/game/game.schema';
import { claimJobPeriod, IJobRunsCollection, JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { dayNoUtc, dayTitle } from 'src/vendor/badcat-sim';
import { PushSubscribeRequest } from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { escapeHtml, sendBadcatEmail } from './badcat-email';
import { badcatPublicUrl, badcatVapidKeys, Env, sendgridConfigured } from './badcat-flags';
import { badcatLevel } from './badcat-live';
import { BadcatOnlineStore } from './badcat-online.schema';
import { buildPushRequest, isPushEndpoint } from './badcat-webpush';

/*
 * Bad Cat Daily Phase 2 return reasons (GDD 3.5 "Return reasons", 17.1 "web push"):
 * - Web push: the player picks a local hour in Settings; the browser's PushSubscription is stored with that hour in
 *   UTC. Every hour on the hour, subscriptions of that hour get "Today's room is open" once a day. Runs when
 *   the BADCAT_VAPID_* keys are set; a 404/410 from the push service deletes the row.
 * - Streak emails: signed-in players with a verified email who opted in, and whose ranked streak (2+ days) ends
 *   tonight (played yesterday, not today, UTC), get one email at 18:00 UTC. Runs when SendGrid is
 *   configured.
 * Both run once per period across replicas (`claimJobPeriod`). Specs replace `fetchImpl`.
 */

export type PushFetch = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: Buffer }
) => Promise<{ status: number }>;

export interface PushRunResult {
    skipped?: 'disabled' | 'claimed';
    sent: number;
    failed: number;
    removed: number;
}

const MAX_FAILURES = 5;
const PER_RUN = 5000;

@Injectable()
export class BadcatPushService {
    private readonly logger = new Logger(BadcatPushService.name);
    now: () => Date = () => new Date();
    fetchImpl?: PushFetch;
    emailFetch?: Parameters<typeof sendBadcatEmail>[3];

    constructor(
        private readonly store: BadcatOnlineStore,
        @InjectModel(Game.name) private readonly games: Model<GameDocument>
    ) {}

    publicKey(env: Env = process.env): { publicKey: string } {
        const keys = badcatVapidKeys(env);
        if (!keys) throw BADCAT_ERRORS.pushUnavailable();
        return { publicKey: keys.publicKey };
    }

    async subscribe(body: PushSubscribeRequest, env: Env = process.env): Promise<{ ok: boolean; utcHour: number }> {
        if (!badcatVapidKeys(env)) throw BADCAT_ERRORS.pushUnavailable();
        const sub = body?.subscription;
        const endpoint = sub?.endpoint;
        if (!isPushEndpoint(endpoint)) throw BADCAT_ERRORS.invalid('subscription endpoint is not a known push service');
        const p256dh = sub?.keys?.p256dh;
        const auth = sub?.keys?.auth;
        if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh))
            throw BADCAT_ERRORS.invalid('keys.p256dh');
        if (typeof auth !== 'string' || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw BADCAT_ERRORS.invalid('keys.auth');
        const hour = body?.hour;
        const offset = body?.tzOffsetMin;
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw BADCAT_ERRORS.invalid('hour must be 0..23');
        if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) throw BADCAT_ERRORS.invalid('tzOffsetMin');
        // local = utc - offset  =>  utc = local + offset (rounded to the hour)
        const utcHour = (((hour + Math.round(offset / 60)) % 24) + 24) % 24;
        await this.store.pushSubs.updateOne(
            { endpoint },
            { $set: { p256dh, auth, utcHour, failures: 0 } },
            { upsert: true }
        );
        return { ok: true, utcHour };
    }

    async unsubscribe(endpoint: unknown): Promise<{ ok: boolean }> {
        if (!isPushEndpoint(endpoint)) throw BADCAT_ERRORS.invalid('endpoint');
        await this.store.pushSubs.deleteOne({ endpoint });
        return { ok: true };
    }

    @Cron('0 0 * * * *', { timeZone: 'UTC' })
    async hourly(): Promise<PushRunResult> {
        return this.sendReminders();
    }

    async sendReminders(env: Env = process.env): Promise<PushRunResult> {
        const keys = badcatVapidKeys(env);
        if (!keys) return { skipped: 'disabled', sent: 0, failed: 0, removed: 0 };
        const now = this.now();
        const hour = now.getUTCHours();
        const today = dayNoUtc(now.getTime());
        const jobRuns = (this.store.pushSubs as any).db.collection(JOB_RUNS_COLLECTION) as IJobRunsCollection;
        if (!(await claimJobPeriod(jobRuns, 'badcat-push', `${now.toISOString().slice(0, 13)}`, now))) {
            return { skipped: 'claimed', sent: 0, failed: 0, removed: 0 };
        }
        const subs = (await this.store.pushSubs
            .find({ utcHour: hour, lastDay: { $ne: today } })
            .limit(PER_RUN)
            .lean()) as any[];
        const payload = {
            title: "Today's room is open 🐾",
            body: `${dayTitle(today)}. The human is busy. Go.`,
            url: `${badcatPublicUrl(env)}/badcat/d/${today}`,
            tag: `badcat-day-${today}`,
        };
        const send: PushFetch = this.fetchImpl || ((url, init) => fetch(url, init as any));
        const result: PushRunResult = { sent: 0, failed: 0, removed: 0 };
        const nowSec = Math.floor(now.getTime() / 1000);
        for (const sub of subs) {
            let status = 0;
            try {
                const req = buildPushRequest(sub, payload, keys, nowSec);
                status = (await send(sub.endpoint, { method: 'POST', headers: req.headers, body: req.body })).status;
            } catch (error) {
                this.logger.warn(`push failed: ${(error as Error)?.message}`);
            }
            if (status >= 200 && status < 300) {
                result.sent++;
                await this.store.pushSubs.updateOne({ _id: sub._id }, { $set: { lastDay: today, failures: 0 } });
            } else if (status === 404 || status === 410) {
                result.removed++;
                await this.store.pushSubs.deleteOne({ _id: sub._id });
            } else {
                result.failed++;
                if ((sub.failures || 0) + 1 >= MAX_FAILURES) await this.store.pushSubs.deleteOne({ _id: sub._id });
                else await this.store.pushSubs.updateOne({ _id: sub._id }, { $inc: { failures: 1 } });
            }
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------------
    // Streak emails
    // ---------------------------------------------------------------------------------------------

    @Cron('0 0 18 * * *', { timeZone: 'UTC' })
    async evening(): Promise<PushRunResult> {
        return this.sendStreakEmails();
    }

    async sendStreakEmails(env: Env = process.env): Promise<PushRunResult> {
        if (!sendgridConfigured(env)) {
            return { skipped: 'disabled', sent: 0, failed: 0, removed: 0 };
        }
        const now = this.now();
        const today = dayNoUtc(now.getTime());
        const jobRuns = (this.store.streakEmails as any).db.collection(JOB_RUNS_COLLECTION) as IJobRunsCollection;
        if (!(await claimJobPeriod(jobRuns, 'badcat-streak-email', `day:${today}`, now))) {
            return { skipped: 'claimed', sent: 0, failed: 0, removed: 0 };
        }
        const optIns = (await this.store.streakEmails
            .find({ on: true, lastDay: { $ne: today } })
            .limit(PER_RUN)
            .lean()) as any[];
        const result: PushRunResult = { sent: 0, failed: 0, removed: 0 };
        for (const row of optIns) {
            const streak = await this.streakEndingTonight(row.user, today);
            if (streak < 2) continue;
            const link = `${badcatPublicUrl(env)}/badcat/d/${today}`;
            const ok = await sendBadcatEmail(
                row.email,
                `Your ${streak}-day Bad Cat streak ends tonight`,
                streakEmailHtml(streak, dayTitle(today), link),
                this.emailFetch
            );
            if (ok) {
                result.sent++;
                await this.store.streakEmails.updateOne({ _id: row._id }, { $set: { lastDay: today } });
            } else result.failed++;
        }
        return result;
    }

    /** The ranked streak that ends tonight: played yesterday (and the days before), not today. 0 otherwise. */
    async streakEndingTonight(user: unknown, today: number): Promise<number> {
        const rows = (await this.games
            .find(
                {
                    type: GameType.BAD_CAT,
                    user,
                    level: { $in: Array.from({ length: 61 }, (_, i) => badcatLevel(today - i)) },
                },
                { level: 1 }
            )
            .lean()) as any[];
        const days = new Set(rows.map(r => Number(/^d(-?\d+)$/.exec(String(r.level))?.[1])));
        if (days.has(today) || !days.has(today - 1)) return 0;
        let n = 0;
        for (let d = today - 1; days.has(d); d--) n++;
        return n;
    }
}

export function streakEmailHtml(streak: number, label: string, link: string): string {
    return (
        `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">` +
        `<div style="max-width: 560px; margin: 0 auto; padding: 20px;">` +
        `<h2>Your ${streak}-day streak ends tonight 🔥</h2>` +
        `<p>Today's room is ${escapeHtml(label)}. One ranked run keeps it going.</p>` +
        `<p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(
            link
        )}" style="background:#7b2cbf;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;">Be a bad cat</a></p>` +
        `<p style="font-size:13px;color:#777;">Turn these off any time in the game: Settings, Streak emails.</p>` +
        `<p style="margin-top: 28px; color: #777; font-size: 13px;">Bad Cat Daily by Token Tails. 10% of net goes to Pink Paw.</p>` +
        `</div></body></html>`
    );
}

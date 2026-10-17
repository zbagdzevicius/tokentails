import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { claimJobPeriod, IJobRunsCollection, JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { FetchLike, seenEmailHtml, sendBadcatEmail } from './badcat-email';
import { badcatPublicUrl, Env, sendgridConfigured } from './badcat-flags';
import { BadcatStore } from './badcat.schema';
import { BadcatAccountService } from './badcat-account.service';
import { BadcatCameoService, loadKey } from './badcat-cameo.service';
import { dayNoOf, weekStartOf } from './badcat-util';

/*
 * Weekly "Mochi was seen in N rooms this week" email to Club members with a Club cat (GDD 6.5, M2).
 * Mondays 09:00 UTC, about last week. A no-op until SendGrid is set;
 * `claimJobPeriod` makes it run once per week across replicas.
 */

export const BADCAT_SEEN_EMAIL_JOB = 'badcat-seen-email';

export interface SeenEmailResult {
    skipped?: 'disabled' | 'claimed';
    sent: number;
    failed: number;
}

@Injectable()
export class BadcatSeenEmailJob {
    private readonly logger = new Logger(BadcatSeenEmailJob.name);
    now: () => Date = () => new Date();
    fetchImpl?: FetchLike;

    constructor(
        private readonly store: BadcatStore,
        private readonly account: BadcatAccountService,
        private readonly cameos: BadcatCameoService
    ) {}

    @Cron('0 0 9 * * 1', { timeZone: 'UTC' })
    async run(): Promise<SeenEmailResult> {
        return this.runOnce();
    }

    async runOnce(env: Env = process.env): Promise<SeenEmailResult> {
        if (!sendgridConfigured(env)) return { skipped: 'disabled', sent: 0, failed: 0 };
        const now = this.now();
        const thisWeek = weekStartOf(dayNoOf(now));
        const jobRuns = (this.store.clubCats as any).db.collection(JOB_RUNS_COLLECTION) as IJobRunsCollection;
        if (!(await claimJobPeriod(jobRuns, BADCAT_SEEN_EMAIL_JOB, `week:${thisWeek}`, now))) {
            return { skipped: 'claimed', sent: 0, failed: 0 };
        }
        const members = await this.account.activeClubEmails(now);
        const cats = (await this.store.clubCats.find({ email: { $in: [...members] } }).lean()) as any[];
        const result: SeenEmailResult = { sent: 0, failed: 0 };
        for (const cat of cats) {
            if (cat.lastSeenEmailWeek === thisWeek) continue;
            // Last week: the seen counter as of last Sunday (the service counts Monday..today).
            const lastWeek = await this.seenLastWeek(cat.catCode, thisWeek);
            if (lastWeek.week <= 0) continue;
            const ok = await sendBadcatEmail(
                cat.email,
                `${cat.name} was seen in ${lastWeek.week.toLocaleString('en-US')} rooms this week`,
                seenEmailHtml(cat.name, lastWeek.week, lastWeek.total, `${badcatPublicUrl(env)}/badcat`),
                this.fetchImpl
            );
            if (ok) {
                result.sent++;
                await this.store.clubCats.updateOne({ email: cat.email }, { $set: { lastSeenEmailWeek: thisWeek } });
            } else {
                result.failed++;
            }
        }
        this.logger.log(`Bad Cat seen email: ${result.sent} sent, ${result.failed} failed`);
        return result;
    }

    private async seenLastWeek(catCode: string, thisWeek: number) {
        const shuffles = (await this.store.shuffles.find({ catCodes: catCode }).lean()) as any[];
        const counts = await this.cameos.counterValues(shuffles.map(row => loadKey(row.dayNo, row.shuffle)));
        let week = 0;
        let total = 0;
        for (const row of shuffles) {
            const n = counts.get(loadKey(row.dayNo, row.shuffle)) || 0;
            if (row.dayNo < thisWeek) total += n;
            if (row.dayNo >= thisWeek - 7 && row.dayNo < thisWeek) week += n;
        }
        return { week, total };
    }
}

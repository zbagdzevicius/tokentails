import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { UserRepository } from 'src/user/user.repository';
import { YourcatRepository } from './yourcat.repository';
import { YourcatService } from './yourcat.service';

/*
 * `/yourcat` retention (bet #3, docs/plans/yourcat-v2.md section 2.8), daily at 03:15 UTC, leased so one
 * replica runs it:
 *
 * 1. Originals past `originalDeleteAfter` are deleted, unless a paid portrait still waits for delivery
 *    (delivery deletes or re-dates it).
 * 2. Records whose owner is gone (guest erased, idle guest cleanup, account deleted) lose both objects
 *    and the record itself; an undelivered paid portrait keeps its original until delivery.
 */

export const YOURCAT_RETENTION_JOB = 'yourcat-retention';
export const YOURCAT_RETENTION_LEASE_MS = 60 * 60 * 1000;
export const RETENTION_BATCH = 500;

@Injectable()
export class YourcatRetentionJob {
    private readonly logger = new Logger(YourcatRetentionJob.name);
    /** Clock, replaceable in specs. */
    now: () => Date = () => new Date();

    constructor(
        private readonly repository: YourcatRepository,
        private readonly userRepository: UserRepository,
        private readonly yourcatService: YourcatService
    ) {}

    @Cron('15 3 * * *')
    async run() {
        return runLeased({
            jobRuns: this.repository.model.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: YOURCAT_RETENTION_JOB,
            ttlMs: YOURCAT_RETENTION_LEASE_MS,
            logger: this.logger,
            run: () => this.runOnce(),
        });
    }

    async runOnce(): Promise<{ originalsDeleted: number; originalsKept: number; orphansRemoved: number }> {
        const now = this.now();
        let originalsDeleted = 0;
        let originalsKept = 0;
        const expired: any[] = await this.repository.model
            .find({ originalKey: { $ne: null }, originalDeleteAfter: { $lte: now } })
            .limit(RETENTION_BATCH)
            .lean();
        for (const record of expired) {
            if (await this.yourcatService.hasUndeliveredPaidPortrait(record)) {
                originalsKept += 1;
                continue;
            }
            try {
                await this.yourcatService.deleteOriginal(record);
                originalsDeleted += 1;
            } catch (error) {
                this.logger.error(`original of ${record._id} not deleted: ${(error as Error)?.message}`);
            }
        }

        let orphansRemoved = 0;
        const owners: any[] = await this.repository.model.distinct('owner');
        for (let index = 0; index < owners.length; index += RETENTION_BATCH) {
            const batch = owners.slice(index, index + RETENTION_BATCH);
            const alive: any[] = await this.userRepository.model
                .find({ _id: { $in: batch }, deletedAt: null }, { _id: 1 })
                .lean();
            const aliveIds = new Set(alive.map(user => String(user._id)));
            const gone = batch.filter(owner => !aliveIds.has(String(owner)));
            if (!gone.length) {
                continue;
            }
            const records: any[] = await this.repository.model.find({ owner: { $in: gone } }).lean();
            for (const record of records) {
                try {
                    orphansRemoved += (await this.removeOrphan(record)) ? 1 : 0;
                } catch (error) {
                    this.logger.error(`orphan ${record._id} not removed: ${(error as Error)?.message}`);
                }
            }
        }
        this.logger.log(
            `retention: ${originalsDeleted} originals deleted, ${originalsKept} kept for delivery, ${orphansRemoved} orphans removed`
        );
        return { originalsDeleted, originalsKept, orphansRemoved };
    }

    /** Both objects and the record; an undelivered paid portrait keeps the original (and the record) for now. */
    private async removeOrphan(record: any): Promise<boolean> {
        if (record.avatarKey) {
            await this.yourcatService.io.deleteObject(record.avatarKey);
            await this.repository.model.updateOne({ _id: record._id }, { $set: { avatarKey: null, avatarUrl: null } });
        }
        if (record.originalKey && (await this.yourcatService.hasUndeliveredPaidPortrait(record))) {
            await this.repository.model.updateOne(
                { _id: record._id },
                { $set: { deleteOriginalAfterDelivery: true, deletedAt: record.deletedAt || this.now() } }
            );
            return false;
        }
        if (record.originalKey) {
            await this.yourcatService.io.deleteObject(record.originalKey);
        }
        await this.repository.model.deleteOne({ _id: record._id });
        return true;
    }
}

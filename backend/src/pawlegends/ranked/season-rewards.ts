import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { isDuplicateKeyError, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { PawlegendsRating } from '../mm/rating.schema';
import type { MmRatingRow, RankedFields } from '../mm/rating.schema';
import { SEASONS } from '../pawlegends-catalog';
import { PawlegendsOwned } from '../pawlegends.schema';
import { LEGEND_IDX, RANKED_TIERS, tierIdOf } from './tiers';

/*
 * Ranked season rewards (docs/plans/moba/SOCIAL-RANKED.md §7.10, gap plan P4). Cosmetic only, never sold, never power.
 *
 * - Every tier a player peaked at or passed this season earns that tier's frame (a Lion peak: Kitten, Tabby, Alley
 *   and Lion frames).
 * - Peaking at Alley or above also earns the season coat.
 * - Rewards are items that already exist (the season's frames and coats), so nothing new is drawn or shipped.
 *
 * One leased job (every 15 minutes, one instance per lease) grants them after a season's `endsAt`, from the recorded
 * peaks: a ranked row of that season without a peak entry gets one written `rewarded: true`; a peak written by the lazy
 * soft reset in `/live` (`rewarded: false`) flips to true. The items are granted first (idempotent upserts keyed by
 * account and item), then the flag, so a crash between the two re-grants nothing new on the next run. The job writes
 * only `peaks` (and the row version, so a concurrent `/live` write re-reads); never r, rd, tier or points.
 */

export interface RankedSeasonRewards {
    /** One frame per tier group, Kitten → Legend (5). */
    frames: readonly [string, string, string, string, string];
    /** Alley and above. */
    coat: string;
}

/** Existing season items only (pawlegends-catalog.ts SEASONS; the game's mirror in pawlegends/src/money/catalog.ts). */
export const RANKED_SEASON_REWARDS: Readonly<Record<string, RankedSeasonRewards>> = Object.freeze({
    s1: Object.freeze({
        frames: Object.freeze([
            'frame.s1.sprout',
            'frame.s1.harvest',
            'frame.s1.lantern',
            'frame.s1.starfall',
            'frame.s1.crown',
        ]) as RankedSeasonRewards['frames'],
        coat: 'coat.clem.s1_starlight',
    }),
});

/** The tier index Alley III starts at (the season coat line). */
export const ALLEY_IDX = 6;

/** The items a peak tier index (0..12) earns in `season` (pure; [] for a season without a reward table). */
export function rankedRewardItems(season: string, peakIdx: number): string[] {
    const table = RANKED_SEASON_REWARDS[season];
    if (!table) return [];
    const idx = Math.max(0, Math.min(LEGEND_IDX, Math.floor(Number(peakIdx) || 0)));
    const group = RANKED_TIERS.findIndex(t => t.id === tierIdOf(idx));
    return [...table.frames.slice(0, group + 1), ...(idx >= ALLEY_IDX ? [table.coat] : [])];
}

type Row = MmRatingRow & Partial<RankedFields>;
type AnyModel = any;

/** Rows per batch, and batches per run (a run never holds its lease for long). */
const BATCH = 200;
const MAX_BATCHES = 25;

@Injectable()
export class RankedSeasonRewardsService {
    private readonly logger = new Logger('PawlegendsRankedRewards');

    constructor(
        @InjectModel(PawlegendsRating.name) private readonly ratings: AnyModel,
        @InjectModel(PawlegendsOwned.name) private readonly owned: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    @Cron('0 */15 * * * *')
    async tick(): Promise<void> {
        try {
            const jobRuns = this.ratings?.db?.collection?.(JOB_RUNS_COLLECTION);
            if (!jobRuns) return;
            await runLeased({
                jobRuns,
                jobName: 'pawlegends-ranked-season-rewards',
                ttlMs: 10 * 60_000,
                run: () => this.run(),
                logger: { log: () => undefined, error: (m: string) => this.logger.warn(m) },
            });
        } catch (error) {
            this.logger.warn(`ranked rewards failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
        }
    }

    /** Grants every ended season's unrewarded peaks. Idempotent: a second run grants and flips nothing. */
    async run(): Promise<{ granted: number; rows: number }> {
        const now = this.now();
        let granted = 0;
        let rows = 0;
        for (const season of SEASONS) {
            if (!RANKED_SEASON_REWARDS[season.id] || new Date(season.endsAt).getTime() > now.getTime()) continue;
            const skip: string[] = [];
            for (let batch = 0; batch < MAX_BATCHES; batch++) {
                const list = (await this.ratings
                    .find({
                        queue: 'ranked',
                        ...(skip.length ? { _id: { $nin: skip } } : {}),
                        $or: [
                            { season: season.id, placementsLeft: 0, 'peaks.season': { $ne: season.id } },
                            { peaks: { $elemMatch: { season: season.id, rewarded: false } } },
                        ],
                    })
                    .limit(BATCH)
                    .lean()) as Row[];
                if (!list.length) break;
                for (const row of list) {
                    rows++;
                    const n = await this.grantRow(row, season.id).catch(error => {
                        this.logger.warn(
                            `ranked reward ${row._id} failed: ${String((error as Error)?.message || error).slice(
                                0,
                                120
                            )}`
                        );
                        return -1;
                    });
                    // a row the flag could not move (a concurrent write) is retried on the next run, not this one
                    if (n < 0) skip.push(row._id);
                    else granted += n;
                }
            }
        }
        if (rows) this.logger.log(`pl_ranked_rewards ${JSON.stringify({ rows, granted })}`);
        return { granted, rows };
    }

    /** Grants one row's items for `season`, then marks its peak rewarded. Answers the items granted, -1 on a miss. */
    private async grantRow(row: Row, season: string): Promise<number> {
        const peak = (row.peaks ?? []).find(p => p.season === season);
        const peakIdx = peak ? peak.peakIdx : row.peakIdx ?? row.tierIdx ?? 0;
        const items = rankedRewardItems(season, peakIdx);
        const accountId = String(row.accountId ?? String(row._id).replace(/:ranked$/, ''));
        for (const item of items) await this.grant(accountId, item, `ranked:${season}:${tierIdOf(peakIdx)}`);
        const res = peak
            ? await this.ratings.updateOne(
                  { _id: row._id, peaks: { $elemMatch: { season, rewarded: false } } },
                  { $set: { 'peaks.$.rewarded': true }, $inc: { v: 1 } }
              )
            : await this.ratings.updateOne(
                  { _id: row._id, 'peaks.season': { $ne: season } },
                  {
                      $push: { peaks: { season, peakIdx, finalIdx: row.tierIdx ?? peakIdx, rewarded: true } },
                      $inc: { v: 1 },
                  }
              );
        return (res?.modifiedCount ?? 0) === 1 ? items.length : -1;
    }

    /** One item, once: a new row, or a revoked one restored. An item the player already owns stays as it is. */
    private async grant(accountId: string, item: string, claim: string): Promise<void> {
        try {
            await this.owned.updateOne(
                { accountId, item },
                { $setOnInsert: { accountId, item, source: 'ranked', claim } },
                { upsert: true }
            );
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        await this.owned.updateOne(
            { accountId, item, revokedAt: { $exists: true } },
            { $unset: { revokedAt: '' }, $set: { source: 'ranked', claim } }
        );
    }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { PawlegendsPresence, PawlegendsStatus } from '../social/social.schema';
import { pushBroadcast } from '../push/push-sink';
import { primeTime } from './windows';

/*
 * Ranked's live numbers (docs/plans/moba/SOCIAL-RANKED.md §7.9, §7.11). Round 4 retired the liquidity gate: ranked is
 * always open and a quiet queue fills with labelled bots. One leased job (API role) counts the presence rows every 30 s
 * and writes `pawlegendsstatus {_id: 'ranked'}`: ranked-eligible accounts online, and accounts searching ranked now
 * (the relay's presence rows carry `relay.q: 'ranked'`). `GET /pawlegends/ranked/status` reads it. When Prime Time
 * starts (ranked/windows.ts) the job sends the ranked push once (each device at most once in 12 h).
 */

export interface RankedLive {
    /** Always true since round 4 (older games read it as the tile's switch). */
    open: true;
    /** Ranked-eligible registered accounts online. */
    online: number;
    /** Registered accounts searching ranked now. */
    searching: number;
    /** Prime Time was active at the last count (the push fires on the change to active). */
    prime: boolean;
}

const EMPTY: RankedLive = { open: true, online: 0, searching: 0, prime: false };

@Injectable()
export class RankedStatusService {
    private readonly logger = new Logger('PawlegendsRankedStatus');

    private cache: { atMs: number; live: RankedLive } | null = null;

    constructor(
        @InjectModel(PawlegendsStatus.name) private readonly status: any,
        @InjectModel(PawlegendsPresence.name) private readonly presence: any,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    private now(): Date {
        return this.clock?.now() ?? new Date();
    }

    /** Count and store, on one instance per 25 s lease. */
    @Cron('*/30 * * * * *')
    async tick(): Promise<void> {
        try {
            const jobRuns = this.status?.db?.collection?.(JOB_RUNS_COLLECTION);
            if (!jobRuns) return;
            await runLeased({
                jobRuns,
                jobName: 'pawlegends-ranked-status',
                ttlMs: 25_000,
                run: () => this.refresh(),
                logger: { log: () => undefined, error: (m: string) => this.logger.warn(m) },
            });
        } catch (error) {
            this.logger.warn(`ranked status failed: ${String((error as Error)?.message || error).slice(0, 200)}`);
        }
    }

    async refresh(): Promise<RankedLive> {
        const now = this.now();
        const online = (await this.presence.countDocuments({ rk: 1, exp: { $gt: now } })) as number;
        const searching = (await this.presence.countDocuments({
            'relay.state': 'queue',
            'relay.q': 'ranked',
            exp: { $gt: now },
        })) as number;
        const prev = (await this.status.findById('ranked').lean()) as Partial<RankedLive> | null;
        const prime = primeTime(now.getTime()).active;
        const live: RankedLive = { open: true, online, searching, prime };
        await this.status.updateOne({ _id: 'ranked' }, { $set: { ...live, at: now } }, { upsert: true });
        if (prime && prev && prev.prime === false) {
            this.logger.log(`pl_ranked_prime ${JSON.stringify({ online, searching })}`);
            // SHARE-PUSH.md §2: Prime Time started (each device at most once in 12 h)
            pushBroadcast({
                cat: 'ranked',
                title: 'Ranked Prime Time',
                body: 'Prime Time is on: more players search now, so more matches are players only.',
                path: '/play',
                tag: 'ranked',
            });
        }
        this.cache = { atMs: now.getTime(), live };
        return live;
    }

    /** The stored numbers, cached 30 s. */
    async read(): Promise<RankedLive> {
        const nowMs = this.now().getTime();
        if (this.cache && nowMs - this.cache.atMs < 30_000) return this.cache.live;
        const row = (await this.status.findById('ranked').lean()) as Partial<RankedLive> | null;
        const live: RankedLive = row
            ? {
                  open: true,
                  online: Math.max(0, Number(row.online) || 0),
                  searching: Math.max(0, Number(row.searching) || 0),
                  prime: row.prime === true,
              }
            : EMPTY;
        this.cache = { atMs: nowMs, live };
        return live;
    }
}

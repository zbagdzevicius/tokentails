import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { PawlegendsPresence, PawlegendsStatus } from '../social/social.schema';
import { RANKED_CLOSE_AFTER_MS, RANKED_CLOSE_BELOW, RANKED_OPEN_AT } from './tiers';

/*
 * The ranked liquidity gate (docs/plans/moba/SOCIAL-RANKED.md §7.9): ranked opens when 24 ranked-eligible players are
 * online and closes when fewer than 16 are online for 10 minutes in a row. One leased job (API role) counts the
 * presence rows every 30 s and writes `pawlegendsstatus {_id: 'ranked'}`; the relay and `GET /pawlegends/ranked/status`
 * read it. Closing never kicks a queued entry (the relay only refuses new `mm.join ranked`).
 */

export interface RankedGate {
    open: boolean;
    online: number;
    need: number;
    since: Date | null;
    lowSince: Date | null;
}

/** The hysteresis step, pure. */
export function nextGate(prev: RankedGate | null, online: number, now: Date): RankedGate {
    const p: RankedGate = prev ?? { open: false, online: 0, need: RANKED_OPEN_AT, since: null, lowSince: null };
    if (!p.open) {
        if (online >= RANKED_OPEN_AT) return { open: true, online, need: RANKED_OPEN_AT, since: now, lowSince: null };
        return { ...p, online, need: RANKED_OPEN_AT, lowSince: null };
    }
    if (online >= RANKED_CLOSE_BELOW) return { ...p, online, need: RANKED_OPEN_AT, lowSince: null };
    const lowSince = p.lowSince ?? now;
    if (now.getTime() - new Date(lowSince).getTime() >= RANKED_CLOSE_AFTER_MS)
        return { open: false, online, need: RANKED_OPEN_AT, since: now, lowSince: null };
    return { ...p, online, need: RANKED_OPEN_AT, lowSince };
}

@Injectable()
export class RankedStatusService {
    private readonly logger = new Logger('PawlegendsRankedStatus');

    private cache: { atMs: number; gate: RankedGate } | null = null;

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

    async refresh(): Promise<RankedGate> {
        const now = this.now();
        const online = await this.presence.countDocuments({ rk: 1, exp: { $gt: now } });
        const prev = (await this.status.findById('ranked').lean()) as RankedGate | null;
        const gate = nextGate(prev, online, now);
        await this.status.updateOne({ _id: 'ranked' }, { $set: { ...gate, at: now } }, { upsert: true });
        if (!!prev?.open !== gate.open)
            this.logger.log(`pl_ranked_gate ${JSON.stringify({ open: gate.open, online })}`);
        this.cache = { atMs: now.getTime(), gate };
        return gate;
    }

    /** The stored gate, cached 30 s. */
    async read(): Promise<RankedGate> {
        const nowMs = this.now().getTime();
        if (this.cache && nowMs - this.cache.atMs < 30_000) return this.cache.gate;
        const row = (await this.status.findById('ranked').lean()) as RankedGate | null;
        const gate = row ?? { open: false, online: 0, need: RANKED_OPEN_AT, since: null, lowSince: null };
        this.cache = { atMs: nowMs, gate };
        return gate;
    }
}

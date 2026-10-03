/*
 * Impact data layer settings (plan F7.3). Every variable is optional; missing or malformed values
 * leave the feature idle, never half-on.
 *
 * - SHELTER_SPLIT_FROM_BLOCK   first block to index (the ShelterSplit deploy block). Unset: idle.
 * - SHELTER_LOG_CHUNK          blocks per eth_getLogs call (default 2000, 1 to 10000).
 * - IMPACT_INDEXER_MAX_CHUNKS  eth_getLogs calls per 5-minute run (default 25), so a run ends well
 *                              inside its lease; the next run continues from the cursor.
 * - IMPACT_PAWS_SENDERS       comma-separated addresses allowed to settle nightly paws (the task 4f
 *                              settlement wallet). The donate hot wallet always is. A `tt:paws:` payout
 *                              from anyone else counts as `direct`.
 * - IMPACT_CDN_ENABLED         'true' mirrors impact/impact.json to the Spaces bucket after each snapshot.
 * - IMPACT_CDN_OBJECT_KEY      object key (default impact/impact.json).
 * - IMPACT_CDN_BUCKET          bucket override (default DO_SPACES_NAME, as the image uploads use).
 * - IMPACT_JOBS_ENABLED        whether this instance runs the impact indexer, the hourly snapshot, the
 *                              daily compaction and the treat reconcile crons. 'true' or 'false' wins;
 *                              unset means on when NODE_ENV=production and off otherwise, so a developer
 *                              backend pointed at a shared database never writes to it, and a production
 *                              deploy that forgets the flag still settles treats. A disabled instance
 *                              logs a warning at startup. The job methods themselves run regardless
 *                              (specs, manual calls).
 *
 * The chain, RPC and ShelterSplit address come from the SHELTER_* variables (shelter-onchain.config.ts).
 */

/** Blocks below the last scanned block that every run reads again, to catch reorgs (plan F7.3). */
export const REORG_DEPTH = 12;

export const DEFAULT_LOG_CHUNK = 2000;
export const MAX_LOG_CHUNK = 10000;
export const DEFAULT_MAX_CHUNKS = 25;

export const IMPACT_CDN_DEFAULT_KEY = 'impact/impact.json';
export const IMPACT_CDN_CACHE_CONTROL = 'public, max-age=300';

export interface ImpactIndexerConfig {
    fromBlock: number | null;
    chunk: number;
    maxChunks: number;
    /** IMPACT_PAWS_SENDERS, lowercased; malformed entries are dropped. */
    pawSenders?: string[];
}

export interface ImpactCdnConfig {
    enabled: boolean;
    objectKey: string;
    bucket: string | null;
}

function nonNegativeInt(value: string | undefined): number | null {
    const trimmed = (value || '').trim();
    if (!/^\d+$/.test(trimmed)) {
        return null;
    }
    const n = Number(trimmed);
    return Number.isSafeInteger(n) ? n : null;
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
    if (value === null || value < min) {
        return fallback;
    }
    return Math.min(value, max);
}

export function readIndexerConfig(env: NodeJS.ProcessEnv = process.env): ImpactIndexerConfig {
    return {
        fromBlock: nonNegativeInt(env.SHELTER_SPLIT_FROM_BLOCK),
        chunk: clamp(nonNegativeInt(env.SHELTER_LOG_CHUNK), 1, MAX_LOG_CHUNK, DEFAULT_LOG_CHUNK),
        maxChunks: clamp(nonNegativeInt(env.IMPACT_INDEXER_MAX_CHUNKS), 1, 500, DEFAULT_MAX_CHUNKS),
        pawSenders: (env.IMPACT_PAWS_SENDERS || '')
            .split(',')
            .map(value => value.trim().toLowerCase())
            .filter(value => /^0x[0-9a-f]{40}$/.test(value)),
    };
}

/** Whether this instance runs the impact and treat reconcile crons (see IMPACT_JOBS_ENABLED). */
export function impactJobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const flag = (env.IMPACT_JOBS_ENABLED || '').trim().toLowerCase();
    if (flag === 'true' || flag === 'false') {
        return flag === 'true';
    }
    return (env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

/** The startup warning for an instance that does not run the jobs; null when it does. */
export function impactJobsDisabledWarning(env: NodeJS.ProcessEnv = process.env): string | null {
    if (impactJobsEnabled(env)) {
        return null;
    }
    return (
        'Impact jobs are off on this instance (IMPACT_JOBS_ENABLED is not true and NODE_ENV is not ' +
        'production): treats stay SENT (never CONFIRMED, failed slots are not given back), the payout ' +
        'indexer and the hourly impact snapshot do not run, and GET /impact is built live. ' +
        'Set IMPACT_JOBS_ENABLED=true on at least one production instance.'
    );
}

/** Never on under Jest: tests must not reach the bucket even with a developer's env loaded. */
export function readCdnConfig(env: NodeJS.ProcessEnv = process.env): ImpactCdnConfig {
    const underTest = !!env.JEST_WORKER_ID || env.NODE_ENV === 'test';
    const objectKey = (env.IMPACT_CDN_OBJECT_KEY || '').trim().replace(/^\/+/, '') || IMPACT_CDN_DEFAULT_KEY;
    return {
        enabled: !underTest && (env.IMPACT_CDN_ENABLED || '').trim().toLowerCase() === 'true',
        objectKey,
        bucket: (env.IMPACT_CDN_BUCKET || '').trim() || (env.DO_SPACES_NAME || '').trim() || null,
    };
}

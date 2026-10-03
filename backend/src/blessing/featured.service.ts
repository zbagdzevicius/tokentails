import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { isBlockedCatName } from 'src/shared-contracts/name';
import { rescueBlessingFilter } from './blessing.schema';
import { BlessingRepository } from './blessing.repository';
import {
    FEATURED_CACHE_TTL_MS,
    FEATURED_DEFAULT_LIMIT,
    FEATURED_MAX_LIMIT,
    FEATURED_STATUSES,
    IFeaturedCat,
    toFeaturedCat,
} from './featured';
import { FEATURED_SHELTER_KEYS, packShelterObjectIds } from './featured-shelters';

interface ICacheEntry<T> {
    value: Promise<T>;
}

/** Rank of a pool row in one 10-minute bucket: the same on every instance, for every limit. */
export function featuredRank(id: unknown, bucket: number): string {
    return createHash('sha1')
        .update(`${String(id)}:${bucket}`)
        .digest('hex');
}

/**
 * Real shelter cats for Meet your cat step 6, and the cat names reserved because of them (plan G3).
 *
 * Featured cats are rescue blessings only (F7.8: never a paid portrait) of Pink Paw and the
 * catfluencers, still WAITING or RECOVERING, whose name passes the shared blocked-word check (the
 * screen is all ages). The selection is deterministic: time is cut into 10-minute buckets
 * (`floor(now / FEATURED_CACHE_TTL_MS)`) and the pool is ordered by `sha1(_id + bucket)`, so every
 * server instance and every `limit` shows the same cats in a bucket; `limit=n` is the first n of
 * that order. One cache entry per bucket; concurrent requests share the in-flight query and a
 * failed query is never cached.
 */
@Injectable()
export class FeaturedBlessingService {
    private readonly logger = new Logger(FeaturedBlessingService.name);
    private rankedCache = new Map<number, ICacheEntry<IFeaturedCat[]>>();

    /** Clock, replaceable in specs. */
    now: () => number = Date.now;

    constructor(private blessingRepository: BlessingRepository) {}

    /** The filter of the featured pool. */
    static poolFilter(): Record<string, unknown> {
        return {
            ...rescueBlessingFilter(),
            shelter: { $in: packShelterObjectIds(FEATURED_SHELTER_KEYS) },
            status: { $in: [...FEATURED_STATUSES] },
        };
    }

    private bucket(): number {
        return Math.floor(this.now() / FEATURED_CACHE_TTL_MS);
    }

    async featured(limit: number): Promise<IFeaturedCat[]> {
        const ranked = await this.ranked(this.bucket());
        return ranked.slice(0, Math.max(0, Math.min(limit, FEATURED_MAX_LIMIT)));
    }

    /**
     * Names reserved for player cat names: the default set Meet your cat shows (FEATURED_DEFAULT_LIMIT)
     * in the current bucket and in the previous one, so a player who loaded the screen just before
     * a bucket turned over cannot name a starter after a cat they were shown. Never the longer
     * `?limit=` lists and never the whole pool: either would reserve ordinary Lithuanian cat names
     * (Medutis, Saule, ...). The client gets the same list from GET /blessing/featured/names.
     * Never throws: a bucket whose query fails adds no names.
     */
    async reservedNames(): Promise<string[]> {
        const current = this.bucket();
        const names = new Set<string>();
        for (const bucket of [current, current - 1]) {
            const cats = await this.ranked(bucket).catch((): IFeaturedCat[] => []);
            for (const cat of (cats || []).slice(0, FEATURED_DEFAULT_LIMIT)) {
                if (typeof cat?.name === 'string' && cat.name.trim()) {
                    names.add(cat.name.trim());
                }
            }
        }
        return [...names];
    }

    /** The first FEATURED_MAX_LIMIT cats of a bucket's order, cached until that bucket is stale. */
    private ranked(bucket: number): Promise<IFeaturedCat[]> {
        const current = this.bucket();
        for (const [key] of this.rankedCache) {
            if (key < current - 1) {
                this.rankedCache.delete(key);
            }
        }
        const cached = this.rankedCache.get(bucket);
        if (cached) {
            return cached.value;
        }
        const value = this.loadRanked(bucket);
        this.rankedCache.set(bucket, { value });
        value.catch(error => {
            this.logger.warn(`featured cats query failed: ${(error as Error)?.message}`);
            if (this.rankedCache.get(bucket)?.value === value) {
                this.rankedCache.delete(bucket);
            }
        });
        return value;
    }

    private async loadRanked(bucket: number): Promise<IFeaturedCat[]> {
        const model = this.blessingRepository.model;
        // The pool is small (two shelters' open cases); only ids and names are read to rank it.
        const pool: any[] = await model.find(FeaturedBlessingService.poolFilter(), { _id: 1, name: 1 }).lean().exec();
        const chosen = (pool || [])
            .filter(row => typeof row?.name === 'string' && row.name.trim() && !isBlockedCatName(row.name))
            .map(row => ({ id: row._id, rank: featuredRank(row._id, bucket) }))
            .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
            .slice(0, FEATURED_MAX_LIMIT);
        if (!chosen.length) {
            return [];
        }
        const rows: any[] = await model
            .find(
                { ...FeaturedBlessingService.poolFilter(), _id: { $in: chosen.map(row => row.id) } },
                { name: 1, status: 1, description: 1, image: 1, catAvatar: 1, shelter: 1, cat: 1 }
            )
            .lean()
            .exec();
        const populated: any[] = await model.populate(rows || [], [
            { path: 'image', select: 'url' },
            { path: 'catAvatar', select: 'url' },
            { path: 'shelter', select: 'name slug' },
            { path: 'cat', select: 'catImg' },
        ]);
        const byId = new Map((populated || []).map(row => [String(row._id), row]));
        return chosen
            .map(row => byId.get(String(row.id)))
            .filter(row => !!row && !isBlockedCatName(row.name))
            .map(toFeaturedCat);
    }
}

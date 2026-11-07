import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MM_LIMITS } from './mm-limits';

/*
 * The hidden Quick Play rating (docs/plans/moba/M1A-IMPL.md §4.2): one row per account and queue, `_id`
 * `${accountId}:coop` ('casual' and 'ranked' are reserved for M1b and M2). Matchmaking data, never a score and never
 * shown. Written ONLY by `/live` (`savePawlegendsPartyMatch`, after the Game row exists) and re-keyed by the guest
 * merge (rating-merge.ts); mm-no-write.spec.ts fails on any other write site. The relay reads it through
 * `MmRatingReader` (find only).
 */

export type MmRatingQueue = 'coop';

export interface MmRatingRow {
    _id: string;
    accountId: string;
    queue: MmRatingQueue;
    r: number;
    rd: number;
    sigma: number;
    games: number;
    wins: number;
    lastAt: Date | null;
    /** The last 50 rooms applied (idempotency next to the party save digest). */
    appliedRooms: string[];
    /** Optimistic version for the conditional update. */
    v: number;
}

export const ratingId = (accountId: string, queue: MmRatingQueue = 'coop'): string => `${accountId}:${queue}`;

@Schema({ collection: 'pawlegendsratings' })
export class PawlegendsRating {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, index: true })
    accountId: string;

    @Prop({ required: true, default: 'coop' })
    queue: string;

    @Prop({ required: true })
    r: number;

    @Prop({ required: true })
    rd: number;

    @Prop({ required: true })
    sigma: number;

    @Prop({ default: 0 })
    games: number;

    @Prop({ default: 0 })
    wins: number;

    @Prop({ type: Date, default: null })
    lastAt: Date | null;

    @Prop({ type: [String], default: [] })
    appliedRooms: string[];

    @Prop({ default: 0 })
    v: number;
}
export const PawlegendsRatingSchema = SchemaFactory.createForClass(PawlegendsRating);

/** What the relay may read: one row per account, cached 60 s. */
export interface MmRatingSource {
    get(accountId: string): Promise<MmRatingRow | null>;
}

/** Built by MmService with the model (find only). */
export class MmRatingReader implements MmRatingSource {
    private readonly cache = new Map<string, { row: MmRatingRow | null; atMs: number }>();

    constructor(
        private readonly model: Pick<Model<PawlegendsRating>, 'findById'> | null,
        private readonly now: () => number = Date.now
    ) {}

    async get(accountId: string): Promise<MmRatingRow | null> {
        if (!this.model) return null;
        const hit = this.cache.get(accountId);
        const now = this.now();
        if (hit && now - hit.atMs < MM_LIMITS.readCacheMs) return hit.row;
        const row = (await this.model.findById(ratingId(accountId)).lean()) as unknown as MmRatingRow | null;
        this.cache.set(accountId, { row, atMs: now });
        if (this.cache.size > 5000) for (const k of [...this.cache.keys()].slice(0, 1000)) this.cache.delete(k);
        return row;
    }
}

/** In memory (specs, harness). */
export class MemoryRatingSource implements MmRatingSource {
    readonly rows = new Map<string, MmRatingRow>();
    async get(accountId: string): Promise<MmRatingRow | null> {
        return this.rows.get(accountId) ?? null;
    }
}

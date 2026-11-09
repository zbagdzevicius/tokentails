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

/**
 * 'casual' (M1b PvP, V16.md §4.4): its own row per account, guests included (rated on their guest account).
 * 'classic' (5v5 on Hearthwood, MAP-5V5.md §9.3): its own row too, so 3v3 casual ratings stay clean.
 */
export type MmRatingQueue = 'coop' | 'casual' | 'classic';

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

/** An account's replay-verified saved matches (`User.pawlegendsMatches`): how many, and the top difficulty played. */
export interface MmPlayed {
    matches: number;
    top: string | null;
}

/** What the relay may read: one row per account, cached 60 s. */
export interface MmRatingSource {
    get(accountId: string, queue?: MmRatingQueue): Promise<MmRatingRow | null>;
    /** The account's saved matches (server records, never the client's hint), for the casual newbie lock and seed. */
    played?(accountId: string): Promise<MmPlayed | null>;
}

/** The top difficulty with a saved match and the total, from `pawlegendsMatches` (junk keys and values ignored). */
export function playedOf(counts: Record<string, unknown> | null | undefined): MmPlayed {
    const order = ['rookie', 'easy', 'normal', 'hard'];
    let matches = 0;
    let top: string | null = null;
    for (const d of order) {
        const n = counts?.[d];
        if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
        matches += Math.floor(n);
        top = d;
    }
    return { matches, top };
}

/** Built by MmService with the model (find only). */
export class MmRatingReader implements MmRatingSource {
    private readonly cache = new Map<string, { row: MmRatingRow | null; atMs: number }>();

    private readonly playedCache = new Map<string, { played: MmPlayed | null; atMs: number }>();

    constructor(
        private readonly model: Pick<Model<PawlegendsRating>, 'findById'> | null,
        private readonly now: () => number = Date.now,
        /** The users collection (find only, `pawlegendsMatches`). */
        private readonly users: { findById(id: string): any } | null = null
    ) {}

    async played(accountId: string): Promise<MmPlayed | null> {
        if (!this.users) return null;
        const now = this.now();
        const hit = this.playedCache.get(accountId);
        if (hit && now - hit.atMs < MM_LIMITS.readCacheMs) return hit.played;
        const doc = (await this.users.findById(accountId).select({ pawlegendsMatches: 1 }).lean()) as {
            pawlegendsMatches?: Record<string, unknown>;
        } | null;
        const played = doc ? playedOf(doc.pawlegendsMatches) : null;
        this.playedCache.set(accountId, { played, atMs: now });
        if (this.playedCache.size > 5000)
            for (const k of [...this.playedCache.keys()].slice(0, 1000)) this.playedCache.delete(k);
        return played;
    }

    async get(accountId: string, queue: MmRatingQueue = 'coop'): Promise<MmRatingRow | null> {
        if (!this.model) return null;
        const key = ratingId(accountId, queue);
        const hit = this.cache.get(key);
        const now = this.now();
        if (hit && now - hit.atMs < MM_LIMITS.readCacheMs) return hit.row;
        const row = (await this.model.findById(key).lean()) as unknown as MmRatingRow | null;
        this.cache.set(key, { row, atMs: now });
        if (this.cache.size > 5000) for (const k of [...this.cache.keys()].slice(0, 1000)) this.cache.delete(k);
        return row;
    }
}

/** In memory (specs, harness). */
export class MemoryRatingSource implements MmRatingSource {
    readonly rows = new Map<string, MmRatingRow>();
    /** Saved matches by account (specs). */
    readonly saved = new Map<string, MmPlayed>();
    async played(accountId: string): Promise<MmPlayed | null> {
        return this.saved.get(accountId) ?? null;
    }
    async get(accountId: string, queue: MmRatingQueue = 'coop'): Promise<MmRatingRow | null> {
        return this.rows.get(queue === 'coop' ? accountId : ratingId(accountId, queue)) ?? null;
    }
}

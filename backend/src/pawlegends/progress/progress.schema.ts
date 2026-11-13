import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/*
 * Account progress (gap plan P2 `rewards-cloud`), one row per account (`_id` = account id):
 * - `blob`: the cosmetic-progress blob (Treat Track, quests, counters, unlocks, settings), max-merged by
 *   `POST /pawlegends/progress` (progress-merge.ts) under the optimistic `rev`;
 * - written ONLY by the `/live` save (progress.service.ts `applyLive`): `luckyDay`/`luckyN` (the Lucky Treat claim),
 *   `welcomeDays` (the Welcome Path's days of play), `mastery` (verified matches and wins per hero) and `grants` (the
 *   ledger of what those paid, the newest 40, applied once by the client through `blob.applied`).
 */
@Schema({ collection: 'pawlegendsprogress', timestamps: true })
export class PawlegendsProgress {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    blob: Record<string, unknown>;

    @Prop({ default: 0 })
    rev: number;

    /** UTC day of the last Lucky Treat (or Daily Treat) claim. */
    @Prop()
    luckyDay?: string;

    /** Lucky Treats drawn so far (the every-10th floor counts these). */
    @Prop({ default: 0 })
    luckyN: number;

    /** UTC days with a verified match, the first seven only. */
    @Prop({ type: [String], default: [] })
    welcomeDays: string[];

    /** `{<hero>: {m, w}}`: verified matches and wins. */
    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    mastery: Record<string, { m?: number; w?: number }>;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    grants: Record<string, unknown>[];

    @Prop()
    updatedAt?: Date;
}
export type PawlegendsProgressDocument = PawlegendsProgress & Document;
export const PawlegendsProgressSchema = SchemaFactory.createForClass(PawlegendsProgress);

export const PAWLEGENDS_PROGRESS_SCHEMAS = [{ name: PawlegendsProgress.name, schema: PawlegendsProgressSchema }];

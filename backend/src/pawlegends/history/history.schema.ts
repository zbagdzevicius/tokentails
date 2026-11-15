import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md). Rows are written ONLY by the `/live` save (history.service.ts
 * `record`), never by a client route. No IP, no email, no name: human seats keep the account id (never sent) and the
 * name is derived at read time. HISTORY_KEEP rows per account; the oldest go on the next write.
 */

export const MATCH_HISTORY_COLLECTION = 'pawlegendsmatchhistory';
export const MATCH_STATS_COLLECTION = 'pawlegendsmatchstats';
export const HISTORY_PREFS_COLLECTION = 'pawlegendshistoryprefs';

@Schema({ collection: MATCH_HISTORY_COLLECTION, versionKey: false })
export class PawlegendsMatchHistory {
    @Prop({ type: String, required: true })
    accountId: string;

    @Prop({ type: String, required: true })
    matchId: string;

    @Prop({ type: Date, required: true })
    at: Date;

    @Prop({ type: String, required: true })
    season: string;

    @Prop({ type: String, required: true })
    mode: string;

    @Prop({ type: String, required: true })
    group: string;

    @Prop({ type: String, required: true })
    map: string;

    @Prop({ type: String, default: null })
    mutator: string | null;

    @Prop({ type: String, required: true })
    difficulty: string;

    @Prop({ type: String, required: true })
    outcome: string;

    @Prop({ type: String, default: null })
    reason: string | null;

    @Prop({ type: Number, required: true })
    ticks: number;

    @Prop({ type: Number, required: true })
    slot: number;

    @Prop({ type: String, required: true })
    hero: string;

    @Prop({ type: Number, default: 0 })
    k: number;

    @Prop({ type: Number, default: 0 })
    d: number;

    @Prop({ type: Number, default: 0 })
    a: number;

    @Prop({ type: String, default: null })
    grade: string | null;

    @Prop({ type: Number, default: null })
    mvpSlot: number | null;

    @Prop({ type: Number, default: null })
    svpSlot: number | null;

    @Prop({ type: Number, required: true })
    winner: number;

    @Prop({ type: String, required: true })
    key: string;

    @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
    players: Record<string, unknown>[];
}
export const PawlegendsMatchHistorySchema = SchemaFactory.createForClass(PawlegendsMatchHistory);
// one row per account per match (a retried save, a second seat)
PawlegendsMatchHistorySchema.index({ accountId: 1, matchId: 1 }, { unique: true });
// the list, newest first, and the filtered list
PawlegendsMatchHistorySchema.index({ accountId: 1, _id: -1 });
PawlegendsMatchHistorySchema.index({ accountId: 1, group: 1, _id: -1 });

/** `_id` = `<accountId>:<season>`: matches, wins, K/D/A sums, MVPs and `heroes.<id>.{m,w}`. */
@Schema({ collection: MATCH_STATS_COLLECTION, versionKey: false })
export class PawlegendsMatchStats {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: String, required: true, index: true })
    accountId: string;

    @Prop({ type: Number, default: 0 })
    m: number;

    @Prop({ type: Number, default: 0 })
    w: number;

    @Prop({ type: Number, default: 0 })
    k: number;

    @Prop({ type: Number, default: 0 })
    d: number;

    @Prop({ type: Number, default: 0 })
    a: number;

    @Prop({ type: Number, default: 0 })
    mvp: number;

    @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
    heroes: Record<string, { m?: number; w?: number }>;
}
export const PawlegendsMatchStatsSchema = SchemaFactory.createForClass(PawlegendsMatchStats);

/** `_id` = account id. Who may see the account's match history (default friends). */
@Schema({ collection: HISTORY_PREFS_COLLECTION, versionKey: false })
export class PawlegendsHistoryPrefs {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: String, enum: ['everyone', 'friends', 'me'], default: 'friends' })
    history: string;
}
export const PawlegendsHistoryPrefsSchema = SchemaFactory.createForClass(PawlegendsHistoryPrefs);

export const PAWLEGENDS_HISTORY_SCHEMAS = [
    { name: PawlegendsMatchHistory.name, schema: PawlegendsMatchHistorySchema },
    { name: PawlegendsMatchStats.name, schema: PawlegendsMatchStatsSchema },
    { name: PawlegendsHistoryPrefs.name, schema: PawlegendsHistoryPrefsSchema },
];

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/*
 * The Leaderboards window's own rows (docs/plans/moba/LEADERBOARDS.md). Derived data only: each is computed from what
 * the `/live` save already wrote (the account's verified `pawlegendsMatches`, the match history row) by
 * leaderboard-live.ts, and rebuilt by the one-time backfill (leaderboard.service.ts). Nothing a client sends lands here.
 */

export const LEVELS_COLLECTION = 'pawlegendslevels';
export const SIDE_WINS_COLLECTION = 'pawlegendssidewins';
export const SIDE_MATCHES_COLLECTION = 'pawlegendssidematches';

/** `_id` = account id (registered accounts only): `m` = verified finished matches (the account level), `at` = when `m` last grew. */
@Schema({ collection: LEVELS_COLLECTION, versionKey: false })
export class PawlegendsLevel {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: Number, required: true })
    m: number;

    @Prop({ type: Date, required: true })
    at: Date;
}
export const PawlegendsLevelSchema = SchemaFactory.createForClass(PawlegendsLevel);
// the Level and Country boards: most matches first, the earliest to reach them first
PawlegendsLevelSchema.index({ m: -1, at: 1, _id: 1 });

/**
 * Cats vs Dogs counters: `_id` = `all`, `season:<id>` or `week:<isoWeek>` with `cat`/`dog` wins; the backfill's own
 * marker rows (`backfill:*`) live here too.
 */
@Schema({ collection: SIDE_WINS_COLLECTION, versionKey: false, strict: false })
export class PawlegendsSideWins {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: Number, default: 0 })
    cat: number;

    @Prop({ type: Number, default: 0 })
    dog: number;
}
export const PawlegendsSideWinsSchema = SchemaFactory.createForClass(PawlegendsSideWins);

/** One row per counted match (`_id` = the history match id): the exactly-once guard for live saves and the backfill. */
@Schema({ collection: SIDE_MATCHES_COLLECTION, versionKey: false })
export class PawlegendsSideMatch {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: String, required: true })
    s: string;

    @Prop({ type: Date, required: true })
    at: Date;
}
export const PawlegendsSideMatchSchema = SchemaFactory.createForClass(PawlegendsSideMatch);

export const PAWLEGENDS_LEADERBOARD_SCHEMAS = [
    { name: PawlegendsLevel.name, schema: PawlegendsLevelSchema },
    { name: PawlegendsSideWins.name, schema: PawlegendsSideWinsSchema },
    { name: PawlegendsSideMatch.name, schema: PawlegendsSideMatchSchema },
];

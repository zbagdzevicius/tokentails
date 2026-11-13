import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/*
 * Live ops storage (docs/plans/moba/LIVEOPS.md). Three collections, none of them a score:
 * - `pawlegendsliveopsconfig`: the one override doc (`_id: 'live'`), edited by hand; code defaults otherwise.
 * - `pawlegendsliveopscount`: the shared counters, `goal:<goalId>` and `vote:<voteId>:<option>`, each `{n}`. The goal
 *   counter is incremented ONLY by `/live` (applyCommunityGoal, after the Game row exists); the vote counter only by
 *   the one-vote-per-account route.
 * - `pawlegendsliveops`: one doc per account (`_id` = account id): the Winter Nap UTC days played (written only by
 *   `/live`), the gifts claimed, the goals claimed, the votes cast and the coats granted.
 */

@Schema({ collection: 'pawlegendsliveopsconfig', versionKey: false, strict: false })
export class PawlegendsLiveopsConfig {
    @Prop({ type: String })
    _id: string;
}
export const PawlegendsLiveopsConfigSchema = SchemaFactory.createForClass(PawlegendsLiveopsConfig);

@Schema({ collection: 'pawlegendsliveopscount', versionKey: false })
export class PawlegendsLiveopsCount {
    @Prop({ type: String })
    _id: string;

    @Prop({ default: 0 })
    n: number;
}
export const PawlegendsLiveopsCountSchema = SchemaFactory.createForClass(PawlegendsLiveopsCount);

@Schema({ collection: 'pawlegendsliveops', versionKey: false })
export class PawlegendsLiveops {
    /** The account id (a guest's too). */
    @Prop({ type: String })
    _id: string;

    /** Winter Nap: distinct UTC days (`YYYY-MM-DD`) with a verified match. Never removed. */
    @Prop({ type: [String], default: [] })
    napDays: string[];

    /** Winter Nap gifts claimed so far (the first n of the list). */
    @Prop({ default: 0 })
    napClaimed: number;

    /** Community goals whose reward this account claimed. */
    @Prop({ type: [String], default: [] })
    goals: string[];

    /** `voteId → 'a' | 'b'`. */
    @Prop({ type: Object, default: {} })
    votes: Record<string, string>;

    /** Every coat granted here (the game adds them to its free unlocks, on any device). */
    @Prop({ type: [String], default: [] })
    items: string[];
}
export const PawlegendsLiveopsSchema = SchemaFactory.createForClass(PawlegendsLiveops);

export const PAWLEGENDS_LIVEOPS_SCHEMAS = [
    { name: PawlegendsLiveopsConfig.name, schema: PawlegendsLiveopsConfigSchema },
    { name: PawlegendsLiveopsCount.name, schema: PawlegendsLiveopsCountSchema },
    { name: PawlegendsLiveops.name, schema: PawlegendsLiveopsSchema },
];

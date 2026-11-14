import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/*
 * Push storage (docs/plans/moba/SHARE-PUSH.md §2). Not a score:
 * - `pawlegendspushsubs`: one doc per browser subscription (`_id` = sha256 of the endpoint): the account, the push
 *   service endpoint and keys, the categories the player left on, the device's UTC offset (quiet hours) and the send
 *   log the rate limits read. A 404/410 from the push service deletes it.
 * - `pawlegendspushstate`: `{_id: 'events'}`, the live-ops events already announced.
 */

@Schema({ collection: 'pawlegendspushsubs', versionKey: false, timestamps: true })
export class PawlegendsPushSub {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: String, required: true, index: true })
    acc: string;

    @Prop({ type: String, required: true })
    endpoint: string;

    @Prop({ type: String, required: true })
    p256dh: string;

    @Prop({ type: String, required: true })
    auth: string;

    @Prop({ type: [String], default: [] })
    cats: string[];

    /** Date.getTimezoneOffset() of the device (UTC+3 is -180). */
    @Prop({ default: 0 })
    tz: number;

    /** Send times (ms) of the last 24 h. */
    @Prop({ type: [Number], default: [] })
    recent: number[];

    /** Last send per category (ms). */
    @Prop({ type: Object, default: {} })
    last: Record<string, number>;

    /** Failed sends in a row (5: dropped). */
    @Prop({ default: 0 })
    fails: number;
}
export const PawlegendsPushSubSchema = SchemaFactory.createForClass(PawlegendsPushSub);
PawlegendsPushSubSchema.index({ cats: 1 });

@Schema({ collection: 'pawlegendspushstate', versionKey: false, strict: false })
export class PawlegendsPushState {
    @Prop({ type: String })
    _id: string;

    @Prop({ type: [String], default: [] })
    seen: string[];
}
export const PawlegendsPushStateSchema = SchemaFactory.createForClass(PawlegendsPushState);

export const PAWLEGENDS_PUSH_SCHEMAS = [
    { name: PawlegendsPushSub.name, schema: PawlegendsPushSubSchema },
    { name: PawlegendsPushState.name, schema: PawlegendsPushStateSchema },
];

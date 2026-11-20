import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { FLAGS_COLLECTION } from './flags';

/**
 * One account's flag (docs/plans/moba/FLAGS.md), guests included: `_id` = the account id, `cc` = the ISO country of the
 * last request that carried one (never the IP), `off` = the player hid the flag in Settings. Deleted with the account.
 */
@Schema({ collection: FLAGS_COLLECTION, versionKey: false })
export class PawlegendsFlag {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, default: null })
    cc: string | null;

    @Prop({ type: Boolean, default: false })
    off: boolean;

    @Prop({ type: Date, required: true })
    at: Date;
}
export const PawlegendsFlagSchema = SchemaFactory.createForClass(PawlegendsFlag);
// the Leaderboards' Country board (LEADERBOARDS.md): the shown flags of one country
PawlegendsFlagSchema.index({ cc: 1, off: 1 });

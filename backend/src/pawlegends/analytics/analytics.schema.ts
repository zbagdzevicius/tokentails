import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const ANALYTICS_CONSENT_COLLECTION = 'pawlegendsanalytics';

/**
 * One account's analytics choice (docs/BACKEND.md "Pawlegends server analytics"), guests included: `_id` = the account
 * id, `granted`, `id` = the hashed analytics id while granted (null after a denial), `v` = the privacy notice version
 * the player saw, `at` = when. Deleted with the account. Server events are sent only while `granted` is true.
 */
@Schema({ collection: ANALYTICS_CONSENT_COLLECTION, versionKey: false })
export class PawlegendsAnalyticsConsent {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: Boolean, required: true })
    granted: boolean;

    @Prop({ type: String, default: null })
    id: string | null;

    @Prop({ type: String, default: null })
    v: string | null;

    @Prop({ type: Date, required: true })
    at: Date;
}
export const PawlegendsAnalyticsConsentSchema = SchemaFactory.createForClass(PawlegendsAnalyticsConsent);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * One row per campaign goal (`_id` = the fact id, "C-001"): how far the inflow scan has gone and
 * what it has counted (plan: goal meter review fix). `configKey` is the counted wallet set; when the
 * facts change it (a handover adds a wallet), the scan starts again from the first block.
 *
 * Every write is a compare-and-set on `lastScannedBlock`, so two replicas scanning at once never
 * add the same window twice. Nothing private is stored: public chain data only.
 */
@Schema({ timestamps: true, collection: 'sheltergoalcursors' })
export class ShelterGoalCursor {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: String, required: true })
    configKey: string;

    /** Highest block counted; null before the first window. */
    @Prop({ type: Number, default: null })
    lastScannedBlock: number | null;

    /** 18-decimal USDC that came in, an integer string. */
    @Prop({ type: String, default: '0' })
    raised18: string;

    @Prop({ type: Number, default: 0 })
    transfers: number;

    /** The chain head seen by the last scan. */
    @Prop({ type: Number, default: null })
    head: number | null;

    @Prop({ type: Date, default: null })
    lastSuccessAt: Date | null;

    @Prop({ type: Date, required: false })
    lastErrorAt?: Date;

    /** The error class only (never the message: it can carry the RPC URL). */
    @Prop({ type: String, required: false })
    lastError?: string;
}
export type ShelterGoalCursorDocument = ShelterGoalCursor & Document<string>;
export const ShelterGoalCursorSchema = SchemaFactory.createForClass(ShelterGoalCursor);

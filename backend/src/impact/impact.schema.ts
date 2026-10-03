import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import { PAYOUT_BUCKETS, PayoutBucket, PayoutKind } from './shelter-logs';

/**
 * One indexed ShelterSplit payout log (plan F7.3). Unique on `chainId + txHash + logIndex`, so a
 * rescan of the reorg window never adds a row. Amounts are decimal strings (wei-style integers).
 */
@Schema({ timestamps: true, collection: 'shelterpayoutevents' })
export class ShelterPayoutEvent extends CommonSchema {
    @Prop({ required: true })
    chainId: number;

    /** Lowercased ShelterSplit address. */
    @Prop({ required: true })
    contract: string;

    @Prop({ required: true })
    txHash: string;

    @Prop({ required: true })
    logIndex: number;

    @Prop({ required: true })
    blockNumber: number;

    @Prop({ required: false })
    blockHash?: string;

    @Prop({ required: true, enum: ['native', 'token'] })
    kind: PayoutKind;

    /** Lowercased shelter wallet (the indexed event argument). */
    @Prop({ required: true })
    shelter: string;

    /** Raw units as emitted. */
    @Prop({ required: true })
    amount: string;

    /** Rescaled to 18 decimals. */
    @Prop({ required: true })
    amount18: string;

    @Prop({ required: true })
    symbol: string;

    /** Full memo, never truncated. */
    @Prop({ required: true })
    memo: string;

    @Prop({ required: true, enum: PAYOUT_BUCKETS })
    bucket: PayoutBucket;

    /** Transaction sender (lowercased), read only for `tt:paws:` memos (the paw-sender check). */
    @Prop({ required: false })
    txFrom?: string;
}
export type ShelterPayoutEventDocument = ShelterPayoutEvent & Document;
export const ShelterPayoutEventSchema = SchemaFactory.createForClass(ShelterPayoutEvent);
ShelterPayoutEventSchema.index({ chainId: 1, txHash: 1, logIndex: 1 }, { unique: true, name: 'chain_tx_log_unique' });
ShelterPayoutEventSchema.index({ chainId: 1, contract: 1, blockNumber: 1 });

/** Per chain and contract: how far the indexer has scanned, and the cumulative totals. */
@Schema({ timestamps: true, collection: 'impactchaincursors' })
export class ImpactChainCursor {
    /** `<chainId>:<lowercased contract>`. */
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true })
    chainId: number;

    @Prop({ required: true })
    contract: string;

    @Prop({ required: true })
    fromBlock: number;

    /** Highest block fully scanned; the next run rescans the last REORG_DEPTH blocks below it. */
    @Prop({ required: false, type: Number, default: null })
    lastScannedBlock: number | null;

    /** `{ [bucket]: { [symbol]: amount18 } }`, recomputed from the events after every run. */
    @Prop({ required: false, type: Object, default: {} })
    totals: Record<string, Record<string, string>>;

    @Prop({ required: false, default: 0 })
    eventCount: number;

    @Prop({ required: false })
    lastTxHash?: string;

    @Prop({ required: false, type: Date })
    lastSuccessAt?: Date;

    @Prop({ required: false, type: Date })
    lastErrorAt?: Date;

    /** Error class only (ethers code or name). Never an RPC URL or a key. */
    @Prop({ required: false })
    lastError?: string;
}
export type ImpactChainCursorDocument = ImpactChainCursor & Document<string>;
export const ImpactChainCursorSchema = SchemaFactory.createForClass(ImpactChainCursor);

/**
 * One public impact snapshot per UTC hour (`_id` = `YYYY-MM-DDTHH:00Z`), so N replicas write one row.
 * The latest row is served; rows older than two days are compacted to one per day. `data` is the
 * public shape built by `toPublicImpact` (plan F7.3): nothing private is ever stored here.
 */
@Schema({ timestamps: true, collection: 'impactsnapshots' })
export class ImpactSnapshot {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ type: Object, required: true })
    data: Record<string, unknown>;
}
export type ImpactSnapshotDocument = ImpactSnapshot & Document<string>;
export const ImpactSnapshotSchema = SchemaFactory.createForClass(ImpactSnapshot);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';

/*
 * The public payout index behind GET /shelter/payouts: every Disbursed and NativeDisbursed log of
 * every ShelterSplit recorded in wallet.config.ts (each chain's split and its other instances, such as
 * Arc's EURC split), mainnet and testnet, each row with its block time. Public chain data only: no
 * attribution buckets, no senders, nothing a visitor could not read from the chain themselves. The
 * impact indexer (impact/impact-indexer.service.ts) keeps its own attributed rows for the impact
 * numbers; this index exists so the payout pages need not scan public RPCs from every browser.
 */

export type PayoutIndexNetwork = 'mainnet' | 'testnet';

/** One payout log. Unique on `chainId + txHash + logIndex`: a rescan never adds a row. */
@Schema({ timestamps: true, collection: 'shelterpayoutlogs' })
export class ShelterPayoutLog extends CommonSchema {
    @Prop({ required: true, enum: ['mainnet', 'testnet'] })
    network: PayoutIndexNetwork;

    @Prop({ required: true })
    chainId: number;

    /** Lowercased ShelterSplit address. */
    @Prop({ required: true })
    contract: string;

    /** Lowercased. */
    @Prop({ required: true })
    txHash: string;

    @Prop({ required: true })
    logIndex: number;

    @Prop({ required: true })
    blockNumber: number;

    /** Lowercased; a rescan deletes the row only when the chain's canonical hash at that height differs. */
    @Prop({ required: false })
    blockHash?: string;

    /** Block time, unix seconds. */
    @Prop({ required: true })
    timestamp: number;

    @Prop({ required: true, enum: ['native', 'token'] })
    kind: 'native' | 'token';

    /** Lowercased shelter wallet (the indexed event argument). */
    @Prop({ required: true })
    shelter: string;

    /** Raw units as emitted (an integer string). */
    @Prop({ required: true })
    amount: string;

    /** Decimals of `amount`: the token's for `token`, the native coin's for `native`. */
    @Prop({ required: true })
    decimals: number;

    /** `amount` rescaled to 18 decimals, so one symbol's native and token payouts add up. */
    @Prop({ required: true })
    amount18: string;

    @Prop({ required: true })
    symbol: string;

    /** Full memo as emitted (a Tempo bytes32 memo stays 0x-hex; clients decode it for display). */
    @Prop({ required: true })
    memo: string;

    /**
     * `<timestamp 12>:<chainId 12>:<block 14>:<logIndex 8>`, zero padded: the newest-first order of the
     * list and its opaque page cursor.
     */
    @Prop({ required: true })
    sortKey: string;
}
export type ShelterPayoutLogDocument = ShelterPayoutLog & Document;
export const ShelterPayoutLogSchema = SchemaFactory.createForClass(ShelterPayoutLog);
ShelterPayoutLogSchema.index({ chainId: 1, txHash: 1, logIndex: 1 }, { unique: true, name: 'chain_tx_log_unique' });
ShelterPayoutLogSchema.index({ network: 1, sortKey: -1 });
ShelterPayoutLogSchema.index({ chainId: 1, contract: 1, blockNumber: 1 });

/** Per chain and contract: how far the payout index has read the chain. `_id` = `<chainId>:<contract>`. */
@Schema({ timestamps: true, collection: 'shelterpayoutindexcursors' })
export class ShelterPayoutIndexCursor {
    @Prop({ type: String, required: true })
    _id: string;

    @Prop({ required: true, enum: ['mainnet', 'testnet'] })
    network: PayoutIndexNetwork;

    @Prop({ required: true })
    chainId: number;

    @Prop({ required: true })
    contract: string;

    /** The split's payout token. */
    @Prop({ required: true })
    symbol: string;

    @Prop({ required: true })
    decimals: number;

    @Prop({ required: true })
    nativeSymbol: string;

    @Prop({ required: true })
    nativeDecimals: number;

    /** First block read (the split's deploy block). */
    @Prop({ required: true })
    fromBlock: number;

    /** Highest block fully read; the next run reads the last REORG_DEPTH blocks below it again. */
    @Prop({ required: false, type: Number, default: null })
    lastScannedBlock: number | null;

    /** Block time (unix seconds) of `lastScannedBlock`. */
    @Prop({ required: false, type: Number, default: null })
    lastScannedTime: number | null;

    /** The chain head the last run saw. */
    @Prop({ required: false, type: Number, default: null })
    head: number | null;

    @Prop({ required: false, type: Date })
    lastSuccessAt?: Date;

    @Prop({ required: false, type: Date })
    lastErrorAt?: Date;

    /** Error class only. Never an RPC URL or a key. */
    @Prop({ required: false })
    lastError?: string;
}
export type ShelterPayoutIndexCursorDocument = ShelterPayoutIndexCursor & Document<string>;
export const ShelterPayoutIndexCursorSchema = SchemaFactory.createForClass(ShelterPayoutIndexCursor);

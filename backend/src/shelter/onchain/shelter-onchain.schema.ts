import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CommonSchema } from 'src/common/common.schema';
import { DONATE_SOURCES, DonateSource, ShelterDonationStatus } from 'src/shared-contracts/enums';

// Sources and statuses come from the generated copy of shared/enums.ts (plan F2), shared with the
// client. The donate flow writes PENDING (with the signed hash before broadcast) and SENT; the reconcile job (plan F7.4) moves SENT to
// CONFIRMED or FAILED. Downstream counts use CONFIRMED only; SENT shows as "on its way".
export const DONATION_SOURCES = DONATE_SOURCES;
export type DonationSource = DonateSource;
export { ShelterDonationStatus };

/** Why a treat is FAILED (plan F7.4: G4's REVERTED is FAILED with reason `reverted`). */
export const DONATION_FAILURE_REASONS = [
    'reverted',
    'timeout',
    'send-failed',
    'budget-spent',
    'stuck-pending',
] as const;
export type DonationFailureReason = typeof DONATION_FAILURE_REASONS[number];

/** An earlier attempt of the same user-day row, kept when a FAILED row is reused for a retry. */
export interface IDonationAttempt {
    txHash?: string;
    txNonce?: number;
    failedReason?: DonationFailureReason;
    failedAt?: Date;
}

/**
 * One server-paid gift per user per UTC day (unique `user` + `day`). A FAILED row releases the user's
 * day: the next gift that day reuses the row (the failed attempt moves to `attempts`), so the unique
 * index stays as it is and needs no migration.
 */
@Schema({ timestamps: true, collection: 'shelterdonations' })
export class ShelterDonation extends CommonSchema {
    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    user: Types.ObjectId;

    /** UTC day, `YYYY-MM-DD`. */
    @Prop({ required: true })
    day: string;

    @Prop({ required: true, enum: DONATION_SOURCES })
    source: DonationSource;

    /** `tt:<source>:<shortId>`, random and not derived from the user. */
    @Prop({ required: true })
    memo: string;

    @Prop({ required: true })
    amountWei: string;

    @Prop({ required: true })
    chainId: number;

    /** Written before the broadcast (ShelterChain.sendDonation), together with the nonce and sender. */
    @Prop({ required: false })
    txHash?: string;

    /** The hot wallet nonce of `txHash`. The reconcile fails a gift as `timeout` only once it is used. */
    @Prop({ required: false })
    txNonce?: number;

    /** The hot wallet address (lowercased) that signed `txHash`. */
    @Prop({ required: false })
    txFrom?: string;

    @Prop({ required: false, type: Date })
    signedAt?: Date;

    /** Last reconcile visit; rows are visited least recently checked first, so none starves. */
    @Prop({ required: false, type: Date })
    lastCheckedAt?: Date;

    @Prop({ required: true, enum: Object.values(ShelterDonationStatus) })
    status: ShelterDonationStatus;

    /** True while this row holds a slot in `shelterdonatedays` for its day. */
    @Prop({ required: false, default: false })
    budgetSlot?: boolean;

    @Prop({ required: false, type: Date })
    sentAt?: Date;

    @Prop({ required: false, type: Date })
    confirmedAt?: Date;

    @Prop({ required: false })
    blockNumber?: number;

    @Prop({ required: false, type: Date })
    failedAt?: Date;

    @Prop({ required: false, enum: DONATION_FAILURE_REASONS })
    failedReason?: DonationFailureReason;

    @Prop({
        required: false,
        type: [{ _id: false, txHash: String, txNonce: Number, failedReason: String, failedAt: Date }],
        default: undefined,
    })
    attempts?: IDonationAttempt[];
}
export type ShelterDonationDocument = ShelterDonation & Document;
export const ShelterDonationSchema = SchemaFactory.createForClass(ShelterDonation);
ShelterDonationSchema.index({ user: 1, day: 1 }, { unique: true, name: 'user_day_unique' });
// The reconcile job reads unsettled rows least recently checked first and stuck PENDING rows by age;
// the indexer looks gifts up by hash, including earlier attempts of a reused row.
ShelterDonationSchema.index({ status: 1, updatedAt: 1 }, { name: 'status_updated' });
ShelterDonationSchema.index({ status: 1, lastCheckedAt: 1 }, { name: 'status_checked' });
ShelterDonationSchema.index({ txHash: 1 }, { name: 'txhash', sparse: true });
ShelterDonationSchema.index({ 'attempts.txHash': 1 }, { name: 'attempts_txhash', sparse: true });

/** Gift slots used per UTC day, claimed atomically against the daily budget. */
@Schema({ timestamps: true, collection: 'shelterdonatedays' })
export class ShelterDonateDay extends CommonSchema {
    @Prop({ required: true })
    day: string;

    @Prop({ required: true, default: 0 })
    count: number;
}
export type ShelterDonateDayDocument = ShelterDonateDay & Document;
export const ShelterDonateDaySchema = SchemaFactory.createForClass(ShelterDonateDay);
ShelterDonateDaySchema.index({ day: 1 }, { unique: true, name: 'day_unique' });

/** A server-issued x402 payment nonce. Mongo drops it after `expiresAt` (TTL index). */
@Schema({ timestamps: true, collection: 'x402nonces' })
export class X402Nonce extends CommonSchema {
    @Prop({ required: true })
    nonce: string;

    @Prop({ required: true })
    expiresAt: Date;

    @Prop({ required: false, type: Date, default: null })
    usedAt?: Date | null;

    @Prop({ required: false })
    txHash?: string;
}
export type X402NonceDocument = X402Nonce & Document;
export const X402NonceSchema = SchemaFactory.createForClass(X402Nonce);
X402NonceSchema.index({ nonce: 1 }, { unique: true, name: 'nonce_unique' });
X402NonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'nonce_ttl' });

/** A transaction that already paid for an x402 card. Single use (unique `txHash`). */
@Schema({ timestamps: true, collection: 'x402usedtxs' })
export class X402UsedTx extends CommonSchema {
    @Prop({ required: true })
    txHash: string;

    @Prop({ required: true })
    nonce: string;

    @Prop({ required: true })
    amountWei: string;

    /**
     * Optional, written by the x402 flows (F4): `onchain-receipt` is the custom flow paid into
     * ShelterSplit; `exact` is standard x402 paid straight to the shelter wallet (`payTo`), with no
     * split event, so the impact indexer counts it into the `x402` bucket from `amountBase`.
     */
    @Prop({ required: false, enum: ['onchain-receipt', 'exact'] })
    scheme?: 'onchain-receipt' | 'exact';

    @Prop({ required: false })
    chainId?: number;

    /** USDC base units (6 decimals). */
    @Prop({ required: false })
    amountBase?: string;

    /** Lowercased recipient of an `exact` payment. */
    @Prop({ required: false })
    payTo?: string;

    /**
     * `exact` only: true when the settlement's Transfer to `payTo` was read back from the chain. Rows
     * resting on the facilitator's word alone (RPC down, receipt still pending) are false and are not
     * counted in the public totals.
     */
    @Prop({ required: false })
    verifiedOnchain?: boolean;
}
export type X402UsedTxDocument = X402UsedTx & Document;
export const X402UsedTxSchema = SchemaFactory.createForClass(X402UsedTx);
X402UsedTxSchema.index({ txHash: 1 }, { unique: true, name: 'txhash_unique' });

export const RELAY_STATUSES = ['submitted', 'confirmed', 'failed'] as const;
export type RelayStatus = typeof RELAY_STATUSES[number];

/**
 * One relayed wallet gift: the donor signed an EIP-3009 authorization to the router, the hot wallet
 * submitted it and paid the gas. The USDC moved donor -> router -> ShelterSplit -> shelters in that
 * one transaction; no Token Tails wallet held it. `nonce` is the EIP-3009 nonce (unique: one relay
 * per authorization).
 */
@Schema({ timestamps: true, collection: 'shelterrelaytxs' })
export class ShelterRelayTx extends CommonSchema {
    @Prop({ required: true })
    nonce: string;

    /** The donor (lowercased). */
    @Prop({ required: true })
    from: string;

    /** USDC base units (6 decimals). */
    @Prop({ required: true })
    valueBase: string;

    @Prop({ required: true })
    memo: string;

    @Prop({ required: true })
    chainId: number;

    /** UTC day of the relay, for the per-signer and daily caps. */
    @Prop({ required: true })
    day: string;

    /** Written before the broadcast, like a treat. */
    @Prop({ required: false })
    txHash?: string;

    @Prop({ required: false })
    txNonce?: number;

    @Prop({ required: false })
    txFrom?: string;

    @Prop({ required: true, enum: RELAY_STATUSES })
    status: RelayStatus;

    @Prop({ required: false })
    batchId?: string;

    @Prop({ required: false })
    blockNumber?: number;

    @Prop({ required: false })
    failedReason?: string;

    /**
     * Set when our own transaction did not land but someone else submitted the donor's signature first:
     * the transaction that actually paid (found by the RouterDonation nonce topic).
     */
    @Prop({ required: false })
    settledTxHash?: string;

    /** sha256 of the caller IP with a fixed prefix; never the IP itself. */
    @Prop({ required: false })
    ipHash?: string;
}
export type ShelterRelayTxDocument = ShelterRelayTx & Document;
export const ShelterRelayTxSchema = SchemaFactory.createForClass(ShelterRelayTx);
ShelterRelayTxSchema.index({ nonce: 1 }, { unique: true, name: 'nonce_unique' });
ShelterRelayTxSchema.index({ txHash: 1 }, { name: 'txhash', sparse: true });
ShelterRelayTxSchema.index({ status: 1, updatedAt: 1 }, { name: 'status_updated' });

export const MATCH_STATUSES = ['pending', 'sent', 'confirmed', 'skipped-cap', 'skipped-small', 'failed'] as const;
export type MatchStatus = typeof MATCH_STATUSES[number];

/**
 * Token Tails' 1:1 match of one router gift, paid from the hot wallet (Token Tails' own money) into
 * ShelterSplit with memo `tt:match:<8 hex of the donor tx>`. Unique `donorTxHash`: a gift is matched
 * at most once, whatever the scan replays.
 */
@Schema({ timestamps: true, collection: 'sheltermatches' })
export class ShelterMatch extends CommonSchema {
    @Prop({ required: true })
    donorTxHash: string;

    @Prop({ required: true })
    donorFrom: string;

    /** USDC base units (6 decimals). */
    @Prop({ required: true })
    giftBase: string;

    @Prop({ required: true, default: '0' })
    matchBase: string;

    @Prop({ required: false })
    matchTxHash?: string;

    @Prop({ required: false })
    matchTxNonce?: number;

    @Prop({ required: true, enum: MATCH_STATUSES })
    status: MatchStatus;

    /** UTC day the match budget was charged to. */
    @Prop({ required: true })
    day: string;

    @Prop({ required: true })
    chainId: number;

    @Prop({ required: false })
    path?: number;

    @Prop({ required: false })
    failedReason?: string;

    /** True while `matchBase` is charged to the day and pool counters. */
    @Prop({ required: false, default: false })
    budgetHeld?: boolean;
}
export type ShelterMatchDocument = ShelterMatch & Document;
export const ShelterMatchSchema = SchemaFactory.createForClass(ShelterMatch);
ShelterMatchSchema.index({ donorTxHash: 1 }, { unique: true, name: 'donor_tx_unique' });
ShelterMatchSchema.index({ matchTxHash: 1 }, { name: 'match_txhash', sparse: true });
ShelterMatchSchema.index({ status: 1, updatedAt: 1 }, { name: 'status_updated' });

/**
 * `pending-rotation`: filed and signature-checked, never shown publicly. `approved`: an admin confirmed
 * the wallet with the shelter through a separate channel. `rotated`: the split pays it. `rejected`.
 */
export const CLAIM_STATUSES = ['pending-rotation', 'approved', 'rotated', 'rejected'] as const;
/** The only statuses `GET /shelter/claim` shows. */
export const PUBLIC_CLAIM_STATUSES: readonly ClaimStatus[] = ['approved', 'rotated'];
export type ClaimStatus = typeof CLAIM_STATUSES[number];

/**
 * A shelter naming its own payout wallet with a personal_sign signature by that wallet. Moving the
 * split's recipient is a manual owner step (`fund.mjs shelter rotate`), so a claim stays
 * `pending-rotation` until then. Not payout evidence: see docs/API.md.
 */
@Schema({ timestamps: true, collection: 'shelterclaims' })
export class ShelterClaim extends CommonSchema {
    @Prop({ required: true })
    chainId: number;

    /** Checksummed. */
    @Prop({ required: true })
    wallet: string;

    @Prop({ required: true })
    message: string;

    @Prop({ required: true })
    signature: string;

    @Prop({ required: true, enum: CLAIM_STATUSES })
    status: ClaimStatus;
}
export type ShelterClaimDocument = ShelterClaim & Document;
export const ShelterClaimSchema = SchemaFactory.createForClass(ShelterClaim);
ShelterClaimSchema.index({ createdAt: -1 }, { name: 'created' });
ShelterClaimSchema.index({ chainId: 1, wallet: 1 }, { unique: true, name: 'chain_wallet_unique' });

/**
 * Atomic counters for the relay and match caps: `relay:<day>`, `relay:<day>:<signer>`,
 * `match:<day>`, `match:pool:<chainId>`. Claimed with a conditional `$inc`; the unique `key` turns a
 * lost upsert race into a refusal. `expiresAt` lets Mongo drop day counters (TTL); the pool has none.
 */
@Schema({ timestamps: true, collection: 'sheltercounters' })
export class ShelterCounter extends CommonSchema {
    @Prop({ required: true })
    key: string;

    @Prop({ required: true, default: 0 })
    used: number;

    @Prop({ required: false, type: Date })
    expiresAt?: Date;
}
export type ShelterCounterDocument = ShelterCounter & Document;
export const ShelterCounterSchema = SchemaFactory.createForClass(ShelterCounter);
ShelterCounterSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });
ShelterCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'counter_ttl', sparse: true });

/** How far the RouterDonation scan has read, and when the flush keeper last ran, per chain and router. */
@Schema({ timestamps: true, collection: 'shelterrouterscans' })
export class ShelterRouterScan extends CommonSchema {
    @Prop({ required: true })
    key: string;

    @Prop({ required: false, type: Number, default: null })
    lastBlock?: number | null;

    @Prop({ required: false, type: Date })
    lastFlushAt?: Date;
}
export type ShelterRouterScanDocument = ShelterRouterScan & Document;
export const ShelterRouterScanSchema = SchemaFactory.createForClass(ShelterRouterScan);
ShelterRouterScanSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });

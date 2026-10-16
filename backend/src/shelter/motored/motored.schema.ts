import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/*
 * Motored × Stripe (tracks/motored-stripe/PLAN.md): one wallet = one real paying Motored customer, the
 * same wallet for every order of that customer. No raw customer id, email or name is stored: only the
 * sha256 keys below, so the collection is shareable without leaking customer data.
 *
 * - `motored_wallets`: one row per Stripe customer. `customerKey = sha256(MOTORED_CUSTOMER_SALT +
 *   customerId)`; `n` is the N-th real customer (labels `user-N` continue after the last event round, so
 *   round labels are never reused); `encryptedKey` is the customer wallet's private key encrypted at
 *   rest with MOTORED_WALLET_KEK.
 * - `motored_gifts`: one row per paid order, keyed by `paymentKey = sha256(MOTORED_CUSTOMER_SALT +
 *   paymentId)` (unique, so a resent webhook can't pay twice). `state` walks due -> sending -> sent ->
 *   confirmed; a reverted send goes back to `due`; a definite send error is `failed`; a refund/dispute
 *   of a gift still `due` is `void`, of one already sent is `reversed`.
 */

export type MotoredGiftState = 'due' | 'sending' | 'sent' | 'confirmed' | 'failed' | 'void';

@Schema({ timestamps: true, collection: 'motored_wallets' })
export class MotoredWallet {
    @Prop({ required: true })
    customerKey: string;

    /** `N` in `motored:user-N`: the N-th real Motored customer, never reused across rounds. */
    @Prop({ required: true })
    n: number;

    @Prop({ required: true })
    address: string;

    /** The customer wallet's private key, encrypted at rest with MOTORED_WALLET_KEK ({ iv, content }). */
    @Prop({ required: true, type: { iv: String, content: String } })
    encryptedKey: { iv: string; content: string };

    createdAt?: Date;
    updatedAt?: Date;
}

export type MotoredWalletDocument = MotoredWallet & Document;
export const MotoredWalletSchema = SchemaFactory.createForClass(MotoredWallet);
MotoredWalletSchema.index({ customerKey: 1 }, { unique: true, name: 'motored_wallet_customer_key_unique' });
MotoredWalletSchema.index({ n: 1 }, { unique: true, name: 'motored_wallet_n_unique' });

@Schema({ timestamps: { createdAt: true, updatedAt: true }, collection: 'motored_gifts' })
export class MotoredGift {
    /** sha256(MOTORED_CUSTOMER_SALT + payment id); unique, so a resent webhook can't pay twice. */
    @Prop({ required: true })
    paymentKey: string;

    @Prop({ required: true })
    customerKey: string;

    @Prop({ required: true })
    n: number;

    /** The deterministic whole-cent amount for this order (1¢ to $1.00). */
    @Prop({ required: true })
    amountUsdCents: number;

    /** `random-1-100c-v1`; the public wording is "up to $1 for every order". */
    @Prop({ required: true })
    amountRule: string;

    @Prop({ required: true, enum: ['due', 'sending', 'sent', 'confirmed', 'failed', 'void'] })
    state: MotoredGiftState;

    /** `motored:user-N`. */
    @Prop({ required: true })
    memo: string;

    /** `motored:user-N-final`, when the customer is closed out (swept); null otherwise. */
    @Prop({ required: false })
    sweepMemo?: string;

    /** The funder -> customer wallet top-up transaction hash. */
    @Prop({ required: false })
    fundTxHash?: string;

    /** The customer wallet -> split donate() transaction hash. */
    @Prop({ required: false })
    giftTxHash?: string;

    /** The wallet nonce of the donate() (for the dropped-tx check). */
    @Prop({ required: false })
    nonce?: number;

    /** The customer wallet address that donated (denormalised, for the keeper's dropped-tx check). */
    @Prop({ required: false })
    walletAddress?: string;

    /** `refunded` or `disputed` once a charge is reversed after the gift was sent. */
    @Prop({ required: false })
    reversed?: 'refunded' | 'disputed';

    /** When the row was locked for sending (stale `sending` rows are unlocked by the keeper). */
    @Prop({ required: false })
    lockedAt?: Date;

    /** How many times a reverted send has been retried (a definite send error is retried at most twice). */
    @Prop({ required: false })
    attempts?: number;

    /** The fixed EUR -> USD rate recorded for a EUR order (USD orders omit it). */
    @Prop({ required: false })
    eurRate?: number;

    /** Why a row was failed or skipped (for a person to check). */
    @Prop({ required: false })
    error?: string;

    @Prop({ required: false })
    sentAt?: Date;

    @Prop({ required: false })
    confirmedAt?: Date;

    createdAt?: Date;
    updatedAt?: Date;
}

export type MotoredGiftDocument = MotoredGift & Document;
export const MotoredGiftSchema = SchemaFactory.createForClass(MotoredGift);
MotoredGiftSchema.index({ paymentKey: 1 }, { unique: true, name: 'motored_gift_payment_key_unique' });
MotoredGiftSchema.index({ state: 1, updatedAt: 1 });
MotoredGiftSchema.index({ customerKey: 1, state: 1 });

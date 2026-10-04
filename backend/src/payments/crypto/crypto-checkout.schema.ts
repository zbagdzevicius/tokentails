import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CryptoPayTokenKind } from './crypto-chains';
import { PaymentBinding, PaymentRoute, TxStep } from './crypto-evm';

/*
 * One crypto checkout order (`cryptocheckouts`). The paid item itself is an `Order` (src/web3), created
 * when a payment is verified, with `hash = evm:<chainId>:<txHash>` so one transaction backs at most one
 * order across every payment rail. This document keeps the quote: what was sold at which price, every
 * accepted option, the reserved unique amounts, the payment and the grant result.
 */

export const CHECKOUT_STATUSES = ['OPEN', 'EXPIRED', 'PAID', 'COMPLETE', 'FAILED_GRANT', 'LATE'] as const;
export type CheckoutStatus = typeof CHECKOUT_STATUSES[number];

export const SKU_KINDS = ['PACK', 'CAT', 'LOOT_BOX'] as const;
export type SkuKind = typeof SKU_KINDS[number];

/** Money evidence tiers (plan F7.2, client/components/claims/tiers.ts) a shelter share can carry. */
export type ShelterShareTier = 'pledged' | 'onchain-custodial' | 'onchain-shelter-held';
export type ShelterShareRoute = 'split' | 'treasury';
/**
 * `quoted`: the order is not paid yet. `undecided`: no `CRYPTO_PAY_CAT_SHELTER_BPS` yet, nothing is
 * sent. `void`: the grant failed, no share. `due`: waiting for the keeper. `sending`: the keeper holds it.
 * `sent`: signed and broadcast. `confirmed`: mined. `failed`: reverted or stuck, needs a person.
 * `onchain`: paid by the buyer's own split transaction.
 */
export type ShelterShareState =
    | 'quoted'
    | 'undecided'
    | 'void'
    | 'due'
    | 'sending'
    | 'sent'
    | 'confirmed'
    | 'failed'
    | 'onchain';

export interface CheckoutSku {
    kind: SkuKind;
    packType?: string;
    catId?: string;
    tier?: string;
    name?: string;
    shelter?: { _id: string; name: string; slug: string } | null;
}

export interface CheckoutOption {
    chainId: number;
    chainName: string;
    testnet: boolean;
    explorer: string;
    token: CryptoPayTokenKind;
    symbol: string;
    tokenAddress: string;
    decimals: number;
    /** Base units, decimal string. */
    amount: string;
    amountDisplay: string;
    recipient: string;
    route: PaymentRoute;
    binding: PaymentBinding;
    memo: string | null;
    steps: TxStep[];
}

export interface CheckoutPayment {
    chainId: number;
    txHash: string;
    from: string;
    token: CryptoPayTokenKind;
    tokenAddress: string;
    amount: string;
    blockNumber: number;
    blockTime: Date;
    route: PaymentRoute;
    verifiedAt: Date;
    /** Split route: what the split paid its shelters and its treasury in this batch (base units). */
    toShelters?: string;
    toTreasury?: string;
}

export interface CheckoutGrant {
    success: boolean;
    message: string;
    catId?: string;
    refund?: string;
}

export interface CheckoutShelterShare {
    shelterId: string;
    route: ShelterShareRoute;
    bps: number | null;
    /** Null when no share is owed (`undecided`, `void`). */
    evidenceTier: ShelterShareTier | null;
    state: ShelterShareState;
    /** USD cents of the share (treasury route), or what the split paid (split route, valued 1:1 USDC, else null). */
    amountUsdCents?: number | null;
    /**
     * Base units that reached the shelter: the keeper's `DisbursementBatch.toShelters` once confirmed
     * (what it sent while `sent`), the split's `toShelters` on the split route.
     */
    amountBase?: string;
    /** Base units the keeper sent to the split (what reached the shelter is `amountBase`). */
    sentBase?: string;
    /** Decimals of the keeper's split token. */
    decimals?: number;
    /** When the keeper took the row (`sending`). */
    lockedAt?: Date;
    chainId?: number;
    memo?: string;
    txHash?: string;
    nonce?: number;
    from?: string;
    sentAt?: Date;
    confirmedAt?: Date;
    attempts?: number;
    error?: string;
}

/**
 * `crypto`: an order of the crypto checkout. `card`: a shelter cat paid by card (Stripe), stored here
 * only to carry the same shelter share as a crypto sale for the keeper; it has no options or payment.
 */
export type CheckoutRail = 'crypto' | 'card';

@Schema({ timestamps: true, collection: 'cryptocheckouts' })
export class CryptoCheckout {
    /** Public id: `co_<16 hex>`. */
    @Prop({ required: true })
    orderId: string;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    user: Types.ObjectId;

    @Prop({ required: true, type: Object, _id: false })
    sku: CheckoutSku;

    @Prop({ required: true })
    priceUsdCents: number;

    @Prop({ required: false })
    discount?: string;

    @Prop({ required: false, default: 0 })
    discountPercentage: number;

    /** `mainnet` or `testnet`; `card` for a card row. */
    @Prop({ required: true })
    network: string;

    /** Unset means `crypto`. */
    @Prop({ required: false })
    rail?: CheckoutRail;

    /** Card rows: the Stripe PaymentIntent id (unique), so one card payment records one share. */
    @Prop({ required: false })
    cardIntent?: string;

    @Prop({ required: true, type: [Object], _id: false })
    accepted: CheckoutOption[];

    /**
     * `chainId:token:amount` of every `amount`-bound option, unique among reserved orders (index
     * `amount_reserved`), so one exact amount on one token identifies one order. Released 24 hours
     * after `expiresAt`.
     */
    @Prop({ type: [String], default: undefined })
    amountKeys?: string[];

    @Prop({ required: false })
    reserved?: boolean;

    /**
     * Set by the first confirm call. An order nobody tried to confirm frees its unique amounts
     * PAYMENT_GRACE_MS after expiry; one with a confirm attempt keeps them RESERVATION_GRACE_MS.
     */
    @Prop({ required: false, type: Date })
    confirmAttemptAt?: Date;

    @Prop({ required: true, enum: CHECKOUT_STATUSES })
    status: CheckoutStatus;

    @Prop({ required: true, type: Date })
    expiresAt: Date;

    @Prop({ required: false, type: Object, _id: false })
    payment?: CheckoutPayment;

    /** The `Order` that holds the payment. */
    @Prop({ type: Types.ObjectId, ref: 'Order', required: false })
    order?: Types.ObjectId;

    /** Set by the one request that grants; a second confirm never grants again. */
    @Prop({ required: false, type: Date })
    grantStartedAt?: Date;

    /** The buyer's spend was counted (once, even when a stuck grant is run again). */
    @Prop({ required: false })
    spendCounted?: boolean;

    @Prop({ required: false, type: Object, _id: false })
    grant?: CheckoutGrant;

    @Prop({ required: false, type: Object, _id: false })
    shelterShare?: CheckoutShelterShare | null;

    createdAt?: Date;
    updatedAt?: Date;
}

export type CryptoCheckoutDocument = CryptoCheckout & Document;
export type ICryptoCheckout = CryptoCheckout & { _id: Types.ObjectId };

export const CryptoCheckoutSchema = SchemaFactory.createForClass(CryptoCheckout);
CryptoCheckoutSchema.index({ orderId: 1 }, { unique: true, name: 'order_id_unique' });
CryptoCheckoutSchema.index({ user: 1, createdAt: -1 });
CryptoCheckoutSchema.index(
    { amountKeys: 1 },
    { unique: true, name: 'amount_reserved', partialFilterExpression: { reserved: true } }
);
CryptoCheckoutSchema.index({ reserved: 1, expiresAt: 1 }, { partialFilterExpression: { reserved: true } });
CryptoCheckoutSchema.index({ user: 1, status: 1, expiresAt: 1 });
CryptoCheckoutSchema.index(
    { status: 1, grantStartedAt: 1 },
    { name: 'paid_grant_started', partialFilterExpression: { status: 'PAID' } }
);
CryptoCheckoutSchema.index(
    { cardIntent: 1 },
    { unique: true, name: 'card_intent_unique', partialFilterExpression: { cardIntent: { $exists: true } } }
);
CryptoCheckoutSchema.index(
    { 'shelterShare.state': 1 },
    { partialFilterExpression: { 'shelterShare.state': { $exists: true } } }
);

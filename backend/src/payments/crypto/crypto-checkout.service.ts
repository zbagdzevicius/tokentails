import { ConflictException, HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomInt } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Tier } from 'src/cat/cat.schema';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { EntityType } from 'src/shared/interfaces/common.interface';
import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import { getPackCardTier } from 'src/shared/utils/content.utils';
import { ShelterClaimService } from 'src/shelter/onchain/shelter-claim.service';
import { shelterConfigFor } from 'src/shelter/onchain/shelter-onchain.config';
import { ShelterCatSaleService } from 'src/shelter/shelter-cat-sale.service';
import { UserRepository } from 'src/user/user.repository';
import { LOOT_BOX_ENTITY, LOOT_BOX_PRICE_CENTS } from 'src/web3/order-catalogue';
import { OrderRepository } from 'src/web3/order.repository';
import { IOrder, OrderStatus, PackType } from 'src/web3/order.schema';
import {
    CAT_GRANT_FAILED_MESSAGE,
    GrantResult,
    PACK_GRANT_FAILED_MESSAGE,
    PurchaseGrantService,
    SHELTER_CAT_TIER,
} from 'src/web3/purchase-grant.service';
import { spendIncrement } from 'src/web3/spend';
import { ChainType } from 'src/web3/web3.model';
import {
    applyDiscountCents,
    getPackPriceCents,
    getShelterCatPriceCents,
    isPackType,
    PACK_PRICES_CENTS,
    LEGENDARY_PROMO_ENDS_AT,
    isLegendaryPromoActive,
} from '../price-table';
import { StripePaymentService } from '../stripe-payment.service';
import { CryptoChainReader } from './crypto-chain-reader';
import {
    CheckoutOption,
    CheckoutPayment,
    CheckoutGrant,
    CheckoutShelterShare,
    CheckoutSku,
    CryptoCheckout,
    CryptoCheckoutDocument,
    ICryptoCheckout,
    SkuKind,
} from './crypto-checkout.schema';
import {
    AMOUNT_TAG_MAX,
    AMOUNT_TAG_MIN,
    amountKey,
    catSplitMemo,
    checkPayment,
    formatBase,
    ORDER_ID_RE,
    paymentSteps,
    priceBase,
    tip20Memo,
    TX_HASH_RE,
} from './crypto-evm';
import { CryptoPayConfig, formatMicro, readCryptoPayConfig, ResolvedChain } from './crypto-pay.config';

/** Payment-local error codes (docs/API.md "Crypto checkout"). */
export const CRYPTO_PAY_CODES = {
    DISABLED: 'CRYPTO_PAY_DISABLED',
    BAD_SKU: 'CRYPTO_PAY_BAD_SKU',
    NOT_FOR_SALE: 'CRYPTO_PAY_NOT_FOR_SALE',
    ALREADY_OWNED: 'CRYPTO_PAY_ALREADY_OWNED',
    BUSY: 'CRYPTO_PAY_BUSY',
    NOT_FOUND: 'CRYPTO_PAY_NOT_FOUND',
    WRONG_CHAIN: 'CRYPTO_PAY_WRONG_CHAIN',
    BAD_TX: 'CRYPTO_PAY_BAD_TX',
    TX_FAILED: 'CRYPTO_PAY_TX_FAILED',
    NO_MATCHING_TRANSFER: 'CRYPTO_PAY_NO_MATCHING_TRANSFER',
    UNDERPAID: 'CRYPTO_PAY_UNDERPAID',
    TX_BEFORE_ORDER: 'CRYPTO_PAY_TX_BEFORE_ORDER',
    TX_USED: 'CRYPTO_PAY_TX_USED',
    ALREADY_PAID: 'CRYPTO_PAY_ALREADY_PAID',
    EXPIRED: 'CRYPTO_PAY_EXPIRED',
    RPC_UNAVAILABLE: 'CRYPTO_PAY_RPC_UNAVAILABLE',
    TOO_MANY_ORDERS: 'CRYPTO_PAY_TOO_MANY_ORDERS',
} as const;

const MESSAGES: Record<keyof typeof CRYPTO_PAY_CODES, string> = {
    DISABLED: 'Crypto checkout is not available right now.',
    BAD_SKU: 'Unknown item.',
    NOT_FOR_SALE: 'This cat is not for sale.',
    ALREADY_OWNED: 'You already have this cat.',
    BUSY: 'Too many open orders right now. Please try again in a minute.',
    NOT_FOUND: 'Order not found.',
    WRONG_CHAIN: 'This order does not take payments on that network.',
    BAD_TX: 'That is not a transaction hash.',
    TX_FAILED: 'That transaction failed on-chain. Nothing was paid.',
    NO_MATCHING_TRANSFER: 'That transaction does not pay this order. Send the exact amount shown to the address shown.',
    UNDERPAID: 'That payment is below the price of this order.',
    TX_BEFORE_ORDER: 'That transaction is older than this order.',
    TX_USED: 'That transaction already paid for another order.',
    ALREADY_PAID: 'This order was already paid. This second payment will be refunded.',
    EXPIRED: 'This order expired. Start a new one.',
    RPC_UNAVAILABLE: 'We could not read the network right now. Try again shortly.',
    TOO_MANY_ORDERS: 'You have several open orders. Finish one or let it close, then try again.',
};

export function payError(
    key: keyof typeof CRYPTO_PAY_CODES,
    status: HttpStatus,
    extra: Record<string, unknown> = {}
): HttpException {
    return new HttpException(
        { statusCode: status, code: CRYPTO_PAY_CODES[key], message: MESSAGES[key], ...extra },
        status
    );
}

/** A payment mined this much before the order still counts (clock skew between us and the chain). */
export const TX_CLOCK_SKEW_MS = 2 * 60 * 1000;
/**
 * A payment mined up to this long after `expiresAt` is still granted normally (a shelter cat is checked
 * for sale again): the order's binding still holds that long (a memo forever, a unique amount at least
 * this long, see `releaseReservations`). A later payment is LATE and refunded by hand.
 */
export const PAYMENT_GRACE_MS = 2 * 60 * 60 * 1000;
/**
 * Unique amounts of an order with a confirm attempt stay reserved this long after expiry, so a late
 * payment never matches a newer order. An order nobody tried to confirm frees them after
 * PAYMENT_GRACE_MS, so abandoned orders cannot exhaust the 9,999 tags of one price.
 */
export const RESERVATION_GRACE_MS = 24 * 60 * 60 * 1000;
/** Open, unexpired orders one buyer may hold at once. */
export const MAX_OPEN_ORDERS_PER_USER = 3;
/**
 * An open order for the same item is handed back instead of a new one; with less than this left it is
 * renewed first (a new `expiresAt`, the same id, amounts and memo), so the buyer has time to pay.
 */
export const REUSE_MIN_LEFT_MS = 3 * 60 * 1000;
/** A PAID order whose grant started this long ago and has no result is picked up by the recovery sweep. */
export const STUCK_GRANT_MS = 5 * 60 * 1000;
export const GRANT_RECOVERY_JOB = 'crypto-grant-recovery';
export const GRANT_RECOVERY_CRON = '*/5 * * * *';
const GRANT_RECOVERY_LEASE_MS = 4 * 60 * 1000;
const GRANT_RECOVERY_BATCH = 20;
const RESERVE_ATTEMPTS = 8;
/** How often a missing `amount_reserved` index is looked for again. */
const INDEX_RECHECK_MS = 60 * 1000;

export interface CreateOrderBody {
    sku?: { kind?: unknown; packType?: unknown; catId?: unknown } | null;
    discount?: unknown;
}

export interface ConfirmBody {
    chainId?: unknown;
    txHash?: unknown;
}

export type ConfirmResult = {
    orderId: string;
    status: string;
    success?: boolean;
    message?: string;
    cat?: unknown;
    refund?: string;
    replay?: boolean;
    confirmations?: number;
    required?: number;
};

export interface GrantRecoveryRun {
    /** Copied from an `Order` that was already COMPLETE or FAILED_GRANT. */
    settled: number;
    /** Granted again under a new lease. */
    regranted: number;
}

const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

/** The query fields that identify one SKU among a buyer's checkouts. */
function skuFilter(sku: CheckoutSku): Record<string, unknown> {
    if (sku.kind === 'PACK') return { 'sku.kind': 'PACK', 'sku.packType': sku.packType };
    if (sku.kind === 'CAT') return { 'sku.kind': 'CAT', 'sku.catId': sku.catId };
    return { 'sku.kind': sku.kind };
}

/** The shelter that gets a share of this sale, or null (packs, loot boxes, shelters off the split list). */
export function shareShelterId(sku: Pick<CheckoutSku, 'kind' | 'shelter'>, cfg: CryptoPayConfig): string | null {
    const id = sku.kind === 'CAT' ? sku.shelter?._id : undefined;
    return id && cfg.splitShelterIds.includes(id) ? id : null;
}

/**
 * The shelter share of a granted shelter cat that Token Tails received (the treasury route, or a card
 * payment): `due` for the keeper at `bps` of the price, `undecided` without a bps. One rule for both
 * payment methods, so Pink Paw is owed the same whichever way the buyer paid.
 */
export function treasuryShelterShare(
    shelterId: string,
    orderId: string,
    priceUsdCents: number,
    bps: number | null,
    base: Partial<CheckoutShelterShare> = {}
): CheckoutShelterShare {
    if (!bps) {
        return { ...base, shelterId, route: 'treasury', state: 'undecided', bps: null, evidenceTier: null };
    }
    return {
        ...base,
        shelterId,
        route: 'treasury',
        bps,
        state: 'due',
        evidenceTier: 'pledged',
        amountUsdCents: Math.ceil((priceUsdCents * bps) / 10000),
        memo: catSplitMemo(orderId),
        attempts: 0,
    };
}

@Injectable()
export class CryptoCheckoutService {
    private readonly logger = new Logger(CryptoCheckoutService.name);
    private reservationIndex: { ok: boolean; checkedAt: number } | null = null;

    constructor(
        @InjectModel(CryptoCheckout.name) private checkoutModel: Model<CryptoCheckoutDocument>,
        private orderRepository: OrderRepository,
        private userRepository: UserRepository,
        private stripePayments: StripePaymentService,
        private grants: PurchaseGrantService,
        private catSale: ShelterCatSaleService,
        private reader: CryptoChainReader,
        @Optional() private claims?: ShelterClaimService
    ) {}

    /** GET /payments/crypto/config. */
    publicConfig(cfg: CryptoPayConfig = readCryptoPayConfig(), now: Date = new Date()) {
        const chains = cfg.enabled ? this.payableChains(cfg) : [];
        return {
            enabled: cfg.enabled && chains.length > 0,
            network: cfg.network,
            orderTtlSeconds: Math.round(cfg.orderTtlMs / 1000),
            shelterHandedOver: cfg.handedOver,
            prices: {
                // The price charged now (the Legendary sale while it runs); `packsRegular` is the list price.
                packs: Object.fromEntries(
                    Object.keys(PACK_PRICES_CENTS).map(k => [k, getPackPriceCents(k as PackType, now) / 100])
                ),
                packsRegular: Object.fromEntries(Object.entries(PACK_PRICES_CENTS).map(([k, v]) => [k, v / 100])),
                legendaryPromoEndsAt: isLegendaryPromoActive(now) ? LEGENDARY_PROMO_ENDS_AT.toISOString() : null,
                shelterCat: getShelterCatPriceCents() / 100,
                lootBox: LOOT_BOX_PRICE_CENTS / 100,
            },
            // `fixed`: a fixed euro price (1 EURC per USD of the price, no conversion, no date).
            fx: { EURC: { perUsd: formatMicro(cfg.eurcPerUsdMicro), asOf: cfg.fxAsOf, source: cfg.fxSource } },
            chains: chains.map(({ chain, tokens }) => ({
                chainId: chain.chainId,
                name: chain.name,
                testnet: chain.testnet,
                explorer: chain.explorer,
                confirmations: chain.confirmations,
                tokens: tokens.map(t => ({
                    token: t.token,
                    symbol: t.symbol,
                    address: t.address,
                    decimals: t.decimals,
                })),
            })),
        };
    }

    /** Chains with a treasury, or with a split route a shelter cat could use. */
    private payableChains(cfg: CryptoPayConfig): ResolvedChain[] {
        return cfg.chains.filter(c => c.treasury || cfg.splits.some(s => s.chainId === c.chain.chainId));
    }

    // ------------------------------------------------------------------ create

    async createOrder(
        userId: string,
        body: CreateOrderBody,
        now: Date = new Date(),
        cfg: CryptoPayConfig = readCryptoPayConfig()
    ) {
        if (!cfg.enabled) {
            throw payError('DISABLED', HttpStatus.SERVICE_UNAVAILABLE);
        }
        await this.assertReservationIndex(now);
        const { sku, priceUsdCents, discount, discountPercentage } = await this.priceSku(userId, body, now);
        const user = new Types.ObjectId(userId);

        // The same item again (a reload, a second tab, a double tap, START A NEW ORDER at 0:59): the open
        // order is handed back, renewed when it is about to close, so retries never use up unique amounts
        // and one buyer never holds two orders for one cat.
        const reusable = (await this.checkoutModel
            .findOne({
                user,
                status: 'OPEN',
                network: cfg.network,
                expiresAt: { $gt: now },
                ...skuFilter(sku),
                ...(discount ? { discount } : { discount: { $exists: false } }),
            })
            .sort({ createdAt: -1 })
            .lean()) as unknown as ICryptoCheckout | null;
        if (reusable) {
            if (new Date(reusable.expiresAt).getTime() - now.getTime() < REUSE_MIN_LEFT_MS) {
                const renewed = (await this.checkoutModel.findOneAndUpdate(
                    { _id: reusable._id, status: 'OPEN' },
                    { $set: { expiresAt: new Date(now.getTime() + cfg.orderTtlMs) } },
                    { new: true, lean: true }
                )) as unknown as ICryptoCheckout | null;
                return this.view(renewed || reusable, now);
            }
            return this.view(reusable, now);
        }
        const open = await this.checkoutModel.countDocuments({ user, status: 'OPEN', expiresAt: { $gt: now } });
        if (open >= MAX_OPEN_ORDERS_PER_USER) {
            throw payError('TOO_MANY_ORDERS', HttpStatus.TOO_MANY_REQUESTS);
        }

        const orderId = `co_${randomBytes(8).toString('hex')}`;
        const shelterId = shareShelterId(sku, cfg);
        const splitChains = shelterId && cfg.handedOver ? await this.splitChains(cfg) : new Set<string>();

        await this.releaseReservations(now);
        for (let attempt = 0; attempt < RESERVE_ATTEMPTS; attempt++) {
            const tag = BigInt(randomInt(AMOUNT_TAG_MIN, AMOUNT_TAG_MAX + 1));
            const accepted = this.buildOptions(cfg, orderId, sku, priceUsdCents, tag, splitChains);
            if (!accepted.length) {
                throw payError('DISABLED', HttpStatus.SERVICE_UNAVAILABLE);
            }
            const amountKeys = accepted
                .filter(o => o.binding === 'amount')
                .map(o => amountKey(o.chainId, o.tokenAddress, BigInt(o.amount)));
            const shelterShare: CheckoutShelterShare | null = shelterId
                ? {
                      shelterId,
                      route: accepted.some(o => o.route === 'split') ? 'split' : 'treasury',
                      bps: cfg.catShelterBps,
                      evidenceTier: 'pledged',
                      state: 'quoted',
                  }
                : null;
            try {
                const created = await this.checkoutModel.create({
                    orderId,
                    user,
                    sku,
                    priceUsdCents,
                    discount,
                    discountPercentage,
                    network: cfg.network,
                    accepted,
                    amountKeys: amountKeys.length ? amountKeys : undefined,
                    reserved: amountKeys.length ? true : undefined,
                    status: 'OPEN',
                    expiresAt: new Date(now.getTime() + cfg.orderTtlMs),
                    shelterShare,
                    createdAt: now,
                } as any);
                const doc = (created as any).toObject ? (created as any).toObject() : created;
                return this.view(doc as ICryptoCheckout, now);
            } catch (error) {
                if (isDuplicateKey(error)) {
                    continue;
                }
                throw error;
            }
        }
        throw payError('BUSY', HttpStatus.SERVICE_UNAVAILABLE);
    }

    /**
     * The unique `amount_reserved` index is what makes one exact amount name one order. Without it two
     * buyers could hold the same amount, so orders are refused (503 DISABLED) until it exists.
     */
    private async assertReservationIndex(now: Date) {
        const known = this.reservationIndex;
        if (known?.ok || (known && now.getTime() - known.checkedAt < INDEX_RECHECK_MS)) {
            if (known.ok) return;
            throw payError('DISABLED', HttpStatus.SERVICE_UNAVAILABLE);
        }
        let ok = false;
        try {
            // Waits for the index build Mongoose starts at boot (autoIndex), then reads what exists.
            await this.checkoutModel.init();
            const indexes = (await this.checkoutModel.listIndexes()) as {
                name?: string;
                unique?: boolean;
                key?: Record<string, unknown>;
            }[];
            ok = indexes.some(
                ix =>
                    ix.name === 'amount_reserved' &&
                    ix.unique === true &&
                    Object.keys(ix.key || {}).join() === 'amountKeys'
            );
        } catch (error) {
            this.logger.error(`crypto checkout: could not list indexes: ${(error as Error)?.message}`);
        }
        this.reservationIndex = { ok, checkedAt: now.getTime() };
        if (!ok) {
            this.logger.error('crypto checkout: unique index amount_reserved is missing; orders are refused');
            throw payError('DISABLED', HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private async priceSku(userId: string, body: CreateOrderBody, now: Date = new Date()) {
        const kind = body?.sku?.kind as SkuKind;
        if (kind === 'PACK') {
            const packType = body.sku!.packType;
            if (!isPackType(packType)) {
                throw payError('BAD_SKU', HttpStatus.BAD_REQUEST);
            }
            const { code, percentage } = await this.stripePayments.resolveDiscount(
                typeof body.discount === 'string' ? body.discount : undefined
            );
            return {
                sku: { kind, packType } as CheckoutSku,
                priceUsdCents: applyDiscountCents(getPackPriceCents(packType, now), percentage),
                discount: code,
                discountPercentage: percentage,
            };
        }
        if (kind === 'LOOT_BOX') {
            return {
                sku: { kind } as CheckoutSku,
                priceUsdCents: LOOT_BOX_PRICE_CENTS,
                discount: undefined,
                discountPercentage: 0,
            };
        }
        if (kind === 'CAT') {
            const check = await this.catSale.check(body.sku!.catId, userId);
            if (!check.ok) {
                if (check.reason === 'BAD_ID') throw payError('BAD_SKU', HttpStatus.BAD_REQUEST);
                if (check.reason === 'ALREADY_OWNED') throw payError('ALREADY_OWNED', HttpStatus.CONFLICT);
                throw payError('NOT_FOR_SALE', HttpStatus.NOT_FOUND);
            }
            await this.assertNoCatInFlight(userId, check.cat.catId);
            const shelter = check.cat.shelter;
            return {
                sku: {
                    kind,
                    catId: check.cat.catId,
                    tier: SHELTER_CAT_TIER,
                    name: check.cat.name,
                    shelter: shelter ? { _id: shelter._id, name: shelter.name, slug: shelter.slug } : null,
                } as CheckoutSku,
                // $5 floor, never discounted.
                priceUsdCents: getShelterCatPriceCents(),
                discount: undefined,
                discountPercentage: 0,
            };
        }
        throw payError('BAD_SKU', HttpStatus.BAD_REQUEST);
    }

    /**
     * One cat, one paid order: a buyer whose payment for this cat is being granted cannot open another
     * (409 ALREADY_OWNED; once granted, the sale check says ALREADY_OWNED too). An open order for the
     * cat is handed back by createOrder instead of a second one.
     */
    private async assertNoCatInFlight(userId: string, catId: string) {
        const paid = await this.checkoutModel
            .findOne({ user: new Types.ObjectId(userId), 'sku.kind': 'CAT', 'sku.catId': catId, status: 'PAID' })
            .lean();
        if (paid) {
            throw payError('ALREADY_OWNED', HttpStatus.CONFLICT);
        }
    }

    /**
     * `chainId:TOKEN` of the split routes a buyer may pay directly: only after the handover, and on a
     * mainnet only when every split recipient is a rotated, shelter-held wallet (the same on-chain
     * check that opens public giving).
     */
    private async splitChains(cfg: CryptoPayConfig): Promise<Set<string>> {
        const allowed = new Set<string>();
        for (const split of cfg.splits) {
            const chain = cfg.chains.find(c => c.chain.chainId === split.chainId);
            if (!chain) continue;
            if (!chain.chain.testnet) {
                const shelterConfig = shelterConfigFor(split.chainId);
                if (!shelterConfig || !this.claims || !(await this.claims.publicGivingVerified(shelterConfig))) {
                    continue;
                }
            }
            allowed.add(`${split.chainId}:${split.token}`);
        }
        return allowed;
    }

    private buildOptions(
        cfg: CryptoPayConfig,
        orderId: string,
        sku: CheckoutSku,
        priceUsdCents: number,
        tag: bigint,
        splitChains: Set<string>
    ): CheckoutOption[] {
        const options: CheckoutOption[] = [];
        for (const { chain, treasury, tokens } of cfg.chains) {
            for (const token of tokens) {
                const base = priceBase(priceUsdCents, token.token, token.decimals, cfg.eurcPerUsdMicro);
                const split = splitChains.has(`${chain.chainId}:${token.token}`)
                    ? cfg.splits.find(s => s.chainId === chain.chainId && s.token === token.token)
                    : undefined;
                let route: CheckoutOption['route'];
                let recipient: string;
                let amount = base;
                let memo: string | null = null;
                if (sku.kind === 'CAT' && split) {
                    route = 'split';
                    recipient = split.address;
                    memo = catSplitMemo(orderId);
                } else if (treasury && chain.tip20Memo) {
                    route = 'transferWithMemo';
                    recipient = treasury;
                    memo = tip20Memo(orderId);
                } else if (treasury) {
                    route = 'transfer';
                    recipient = treasury;
                    amount = base + tag;
                } else {
                    continue;
                }
                options.push({
                    chainId: chain.chainId,
                    chainName: chain.name,
                    testnet: chain.testnet,
                    explorer: chain.explorer,
                    token: token.token,
                    symbol: token.symbol,
                    tokenAddress: token.address,
                    decimals: token.decimals,
                    amount: amount.toString(),
                    amountDisplay: formatBase(amount, token.decimals),
                    recipient,
                    route,
                    binding: route === 'transfer' ? 'amount' : 'memo',
                    memo,
                    steps: paymentSteps({ route, tokenAddress: token.address, recipient, amount, memo }),
                });
            }
        }
        return options;
    }

    /**
     * Frees unique amounts: PAYMENT_GRACE_MS after expiry for an order nobody tried to confirm,
     * RESERVATION_GRACE_MS after expiry for one with a confirm attempt. Idempotent; runs before every
     * create.
     */
    async releaseReservations(now: Date = new Date()) {
        await this.checkoutModel.updateMany(
            {
                reserved: true,
                $or: [
                    { expiresAt: { $lt: new Date(now.getTime() - RESERVATION_GRACE_MS) } },
                    {
                        confirmAttemptAt: { $exists: false },
                        expiresAt: { $lt: new Date(now.getTime() - PAYMENT_GRACE_MS) },
                    },
                ],
            },
            { $set: { reserved: false } }
        );
    }

    // ------------------------------------------------------------------ read

    async getOrder(userId: string, orderId: unknown, now: Date = new Date()) {
        return this.view(await this.load(userId, orderId), now);
    }

    private async load(userId: string, orderId: unknown): Promise<ICryptoCheckout> {
        if (typeof orderId !== 'string' || !ORDER_ID_RE.test(orderId) || !Types.ObjectId.isValid(String(userId))) {
            throw payError('NOT_FOUND', HttpStatus.NOT_FOUND);
        }
        const doc = (await this.checkoutModel
            .findOne({ orderId, user: new Types.ObjectId(String(userId)) })
            .lean()) as unknown as ICryptoCheckout | null;
        if (!doc || doc.rail === 'card') {
            throw payError('NOT_FOUND', HttpStatus.NOT_FOUND);
        }
        return doc;
    }

    /** The public shape of an order (docs/API.md). Never the user id, reservation keys or internal ids. */
    view(doc: ICryptoCheckout, now: Date = new Date()) {
        const expired = doc.status === 'OPEN' && new Date(doc.expiresAt).getTime() < now.getTime();
        const share = doc.shelterShare;
        return {
            orderId: doc.orderId,
            status: expired ? 'EXPIRED' : doc.status,
            sku: doc.sku,
            priceUsd: doc.priceUsdCents / 100,
            priceUsdCents: doc.priceUsdCents,
            discount: doc.discount ? { code: doc.discount, percentage: doc.discountPercentage } : null,
            createdAt: doc.createdAt,
            expiresAt: doc.expiresAt,
            accepted: doc.accepted,
            shelterShare: share
                ? {
                      route: share.route,
                      bps: share.bps,
                      evidenceTier: share.evidenceTier,
                      state: share.state,
                      ...(share.amountUsdCents !== undefined ? { amountUsdCents: share.amountUsdCents } : {}),
                      ...(share.txHash ? { txHash: share.txHash, chainId: share.chainId } : {}),
                  }
                : null,
            ...(doc.payment
                ? {
                      payment: {
                          chainId: doc.payment.chainId,
                          txHash: doc.payment.txHash,
                          from: doc.payment.from,
                          token: doc.payment.token,
                          amount: doc.payment.amount,
                          blockNumber: doc.payment.blockNumber,
                          route: doc.payment.route,
                      },
                  }
                : {}),
            ...(doc.grant ? { grant: doc.grant } : {}),
        };
    }

    // ------------------------------------------------------------------ confirm

    async confirm(
        userId: string,
        orderId: unknown,
        body: ConfirmBody,
        now: Date = new Date(),
        cfg: CryptoPayConfig = readCryptoPayConfig()
    ): Promise<{ httpStatus: HttpStatus; body: ConfirmResult }> {
        const doc = await this.load(userId, orderId);
        const chainId = Number(body?.chainId);
        const txHash = typeof body?.txHash === 'string' ? body.txHash.trim().toLowerCase() : '';
        if (!TX_HASH_RE.test(txHash)) {
            throw payError('BAD_TX', HttpStatus.BAD_REQUEST);
        }
        if (doc.payment && doc.payment.txHash === txHash && doc.payment.chainId === chainId) {
            return this.replay(doc);
        }
        const options = doc.accepted.filter(o => o.chainId === chainId);
        if (!Number.isSafeInteger(chainId) || !options.length) {
            throw payError('WRONG_CHAIN', HttpStatus.BAD_REQUEST);
        }
        if (!doc.confirmAttemptAt) {
            // Someone says they paid: the unique amounts stay reserved the long way (24 hours).
            await this.checkoutModel.updateOne(
                { _id: doc._id, confirmAttemptAt: { $exists: false } },
                { $set: { confirmAttemptAt: now } }
            );
        }
        const chain = cfg.chains.find(c => c.chain.chainId === chainId);
        if (!chain) {
            throw payError('RPC_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
        }

        let receipt;
        let head: number;
        try {
            receipt = await this.reader.receipt(chainId, chain.rpcUrl, txHash);
            if (!receipt) {
                return this.confirming(doc, 0, chain.chain.confirmations);
            }
            head = await this.reader.blockNumber(chainId, chain.rpcUrl);
        } catch {
            throw payError('RPC_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (receipt.status !== 1) {
            throw payError('TX_FAILED', HttpStatus.BAD_REQUEST);
        }
        const confirmations = Math.max(0, head - receipt.blockNumber + 1);
        if (confirmations < chain.chain.confirmations) {
            return this.confirming(doc, confirmations, chain.chain.confirmations);
        }
        let blockTime: number | null;
        try {
            blockTime = await this.reader.blockTime(chainId, chain.rpcUrl, receipt.blockNumber);
        } catch {
            throw payError('RPC_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (blockTime === null) {
            return this.confirming(doc, confirmations, chain.chain.confirmations);
        }
        const blockMs = blockTime * 1000;
        if (blockMs < new Date(doc.createdAt!).getTime() - TX_CLOCK_SKEW_MS) {
            throw payError('TX_BEFORE_ORDER', HttpStatus.BAD_REQUEST);
        }

        let matched: { option: CheckoutOption; check: ReturnType<typeof checkPayment> } | null = null;
        let underpaid = false;
        for (const option of options) {
            const check = checkPayment(receipt.logs, option);
            if (check.ok) {
                matched = { option, check };
                break;
            }
            underpaid = underpaid || check.reason === 'UNDERPAID';
        }
        if (!matched) {
            throw payError(underpaid ? 'UNDERPAID' : 'NO_MATCHING_TRANSFER', HttpStatus.BAD_REQUEST);
        }

        const { option, check } = matched;
        const payment: CheckoutPayment = {
            chainId,
            txHash,
            from: check.payer || receipt.from,
            token: option.token,
            tokenAddress: option.tokenAddress,
            amount: (check.paid ?? BigInt(option.amount)).toString(),
            blockNumber: receipt.blockNumber,
            blockTime: new Date(blockMs),
            route: option.route,
            verifiedAt: now,
            ...(check.toShelters !== undefined ? { toShelters: check.toShelters.toString() } : {}),
            ...(check.toTreasury !== undefined ? { toTreasury: check.toTreasury.toString() } : {}),
        };
        const order = await this.claimOrder(doc, payment, option);
        const amountUsd = doc.priceUsdCents / 100;
        const orderRef = { _id: order._id, chainType: ChainType.EVM, hash: order.hash };

        // Paid after the order and its grace closed: never granted, the payment goes back to the paying wallet.
        if (blockMs > new Date(doc.expiresAt).getTime() + PAYMENT_GRACE_MS) {
            await this.grants.markGrantFailed(
                order._id!,
                'PAID_AFTER_EXPIRY',
                `mined ${new Date(blockMs).toISOString()}`
            );
            await this.grants.refundOrder(orderRef, doc.user, 'PAID_AFTER_EXPIRY', amountUsd, { takeBackSpend: false });
            await this.checkoutModel.updateOne(
                { _id: doc._id, status: { $in: ['OPEN', 'EXPIRED'] } },
                {
                    $set: {
                        status: 'LATE',
                        payment,
                        order: order._id,
                        grant: { success: false, message: MESSAGES.EXPIRED, refund: 'due' },
                    },
                }
            );
            throw payError('EXPIRED', HttpStatus.GONE, { refund: 'due' });
        }

        // A LATE order (an earlier payment came after the grace) still takes a payment mined in time.
        const claimed = (await this.checkoutModel.findOneAndUpdate(
            { _id: doc._id, status: { $in: ['OPEN', 'EXPIRED', 'LATE'] } },
            { $set: { status: 'PAID', payment, order: order._id }, $unset: { grant: 1 } },
            { new: true, lean: true }
        )) as unknown as ICryptoCheckout | null;
        if (!claimed) {
            const current = (await this.checkoutModel
                .findOne({ _id: doc._id })
                .lean()) as unknown as ICryptoCheckout | null;
            if (current?.order && String(current.order) === String(order._id)) {
                return this.replay(current);
            }
            // A second, different payment for an order that is already paid.
            await this.grants.markGrantFailed(order._id!, 'DUPLICATE_PAYMENT', `order ${doc.orderId} already paid`);
            await this.grants.refundOrder(orderRef, doc.user, 'DUPLICATE_PAYMENT', amountUsd, { takeBackSpend: false });
            throw payError('ALREADY_PAID', HttpStatus.CONFLICT, { refund: 'due' });
        }
        return this.grant(claimed, order, now, cfg);
    }

    private confirming(doc: ICryptoCheckout, confirmations: number, required: number) {
        return {
            httpStatus: HttpStatus.ACCEPTED,
            body: { orderId: doc.orderId, status: 'CONFIRMING', confirmations, required },
        };
    }

    /**
     * The answer for an order whose payment was already taken. A paid order without a grant result is
     * still being granted (or its grant is stuck and the recovery sweep will finish it): 202
     * CONFIRMING, so the client keeps asking instead of showing a refund.
     */
    private replay(doc: ICryptoCheckout): { httpStatus: HttpStatus; body: ConfirmResult } {
        if (!doc.grant) {
            return {
                httpStatus: HttpStatus.ACCEPTED,
                body: {
                    orderId: doc.orderId,
                    status: 'CONFIRMING',
                    message: 'Your payment is verified. Your item is on its way.',
                    replay: true,
                },
            };
        }
        return {
            httpStatus: HttpStatus.OK,
            body: {
                orderId: doc.orderId,
                status: doc.status,
                success: doc.grant.success,
                message: doc.grant.message,
                ...(doc.grant.refund ? { refund: doc.grant.refund } : {}),
                ...(doc.grant.catId ? { cat: { _id: doc.grant.catId } } : {}),
                replay: true,
            },
        };
    }

    /**
     * Creates the `Order` for this payment. `hash = evm:<chainId>:<txHash>` is unique (index
     * `hash_unique`): a transaction that already backs another order is refused, and a retry of this
     * order's own confirm finds its order again.
     */
    private async claimOrder(doc: ICryptoCheckout, payment: CheckoutPayment, option: CheckoutOption): Promise<IOrder> {
        const hash = `evm:${payment.chainId}:${payment.txHash}`;
        const entityType =
            doc.sku.kind === 'PACK' ? EntityType.PACK : doc.sku.kind === 'CAT' ? EntityType.CAT : LOOT_BOX_ENTITY;
        try {
            const order = await this.orderRepository.create({
                status: OrderStatus.PENDING,
                hash,
                chainType: ChainType.EVM,
                chainId: payment.chainId,
                checkoutId: doc.orderId,
                walletAddress: payment.from,
                currencyType: option.token === 'EURC' ? CurrencyType.EURC : CurrencyType.USDC,
                price: Number(formatBase(BigInt(payment.amount), option.decimals)),
                priceUsd: doc.priceUsdCents / 100,
                entityType: entityType as EntityType,
                id: doc.sku.kind === 'PACK' ? doc.sku.packType : doc.sku.kind === 'CAT' ? doc.sku.catId : undefined,
                discount: doc.discount,
                user: doc.user,
            } as any);
            return ((order as any).toObject ? (order as any).toObject() : order) as IOrder;
        } catch (error) {
            if (!(error instanceof ConflictException) && !isDuplicateKey(error)) {
                throw error;
            }
            const existing = await this.orderRepository.findOne({ searchObject: { hash } });
            if (existing && (existing as any).checkoutId === doc.orderId) {
                return existing as IOrder;
            }
            throw payError('TX_USED', HttpStatus.CONFLICT);
        }
    }

    /** Takes the grant lease and grants. A second caller gets the 202 replay of the order in progress. */
    private async grant(
        doc: ICryptoCheckout,
        order: IOrder,
        now: Date,
        cfg: CryptoPayConfig
    ): Promise<{ httpStatus: HttpStatus; body: ConfirmResult }> {
        const started = await this.checkoutModel.findOneAndUpdate(
            { _id: doc._id, grantStartedAt: { $exists: false } },
            { $set: { grantStartedAt: now } },
            { new: true, lean: true }
        );
        if (!started) {
            return this.replay(doc);
        }
        return { httpStatus: HttpStatus.OK, body: await this.runGrant(doc, order, cfg) };
    }

    /**
     * Grants the item of a paid order that holds the grant lease, and stores the result. The buyer's
     * spend is counted once (`spendCounted`), so a stuck grant run again by the sweep never counts it
     * twice. A shelter cat paid in the grace after expiry is checked for sale again first.
     */
    private async runGrant(doc: ICryptoCheckout, order: IOrder, cfg: CryptoPayConfig): Promise<ConfirmResult> {
        const user = doc.user;
        const amountUsd = doc.priceUsdCents / 100;
        const orderRef = { _id: order._id, chainType: ChainType.EVM, hash: order.hash };
        const counted = await this.checkoutModel.findOneAndUpdate(
            { _id: doc._id, spendCounted: { $ne: true } },
            { $set: { spendCounted: true } },
            { new: true, lean: true }
        );
        if (counted) {
            await this.userRepository.update(user, { $inc: spendIncrement(amountUsd) });
        }

        let result: GrantResult;
        const paidLate =
            !!doc.payment?.blockTime && new Date(doc.payment.blockTime).getTime() > new Date(doc.expiresAt).getTime();
        if (doc.sku.kind === 'CAT') {
            const stillForSale = paidLate ? await this.catSale.check(doc.sku.catId, user) : null;
            if (stillForSale && !stillForSale.ok) {
                await this.grants.markGrantFailed(
                    order._id!,
                    'NOT_FOR_SALE',
                    `paid after expiry: ${stillForSale.reason}`
                );
                const refund = await this.grants.refundOrder(orderRef, user, 'NOT_FOR_SALE', amountUsd);
                result = {
                    success: false,
                    message: `This cat is no longer for sale. ${CAT_GRANT_FAILED_MESSAGE}`,
                    refund,
                };
            } else {
                result = await this.grants.grantShelterCat({ user, order: orderRef, catId: doc.sku.catId!, amountUsd });
            }
        } else {
            const packType = doc.sku.kind === 'PACK' ? (doc.sku.packType as PackType) : undefined;
            result = await this.grants.grantPack({
                user,
                order: orderRef,
                packType,
                tier: packType ? getPackCardTier(packType) : Tier.COMMON,
                amountUsd,
            });
            if (result.success) {
                await this.grants.creditAffiliate(doc.discount, amountUsd);
            }
        }

        const grant: CheckoutGrant = {
            success: !!result.success,
            message: result.message ?? '',
            ...(result.cat?._id ? { catId: String(result.cat._id) } : {}),
            ...(result.refund ? { refund: result.refund } : {}),
        };
        const status = result.success ? 'COMPLETE' : 'FAILED_GRANT';
        await this.storeGrant(doc, status, grant, cfg);
        return {
            orderId: doc.orderId,
            status,
            success: !!result.success,
            message: result.message,
            ...(result.cat ? { cat: result.cat } : {}),
            ...(result.refund ? { refund: result.refund } : {}),
        };
    }

    private async storeGrant(
        doc: ICryptoCheckout,
        status: 'COMPLETE' | 'FAILED_GRANT',
        grant: CheckoutGrant,
        cfg: CryptoPayConfig
    ) {
        const shelterShare = this.settleShare(doc, grant.success, cfg);
        await this.checkoutModel.updateOne(
            { _id: doc._id, status: 'PAID' },
            { $set: { status, grant, ...(shelterShare !== undefined ? { shelterShare } : {}) } }
        );
    }

    /**
     * The shelter share once a shelter cat sale is final. Split route: already paid on-chain by the
     * buyer's transaction (the shelter holds its key: `onchain-shelter-held`). Treasury route: see
     * `treasuryShelterShare`. A failed grant pays no share on the treasury route (`void`); on the split
     * route the shelter was already paid by the buyer's transaction. Returns undefined when nothing
     * changes.
     */
    private settleShare(
        doc: ICryptoCheckout,
        granted: boolean,
        cfg: CryptoPayConfig
    ): CheckoutShelterShare | null | undefined {
        const share = doc.shelterShare;
        if (!share) {
            return undefined;
        }
        if (doc.payment?.route === 'split') {
            const toShelters = BigInt(doc.payment.toShelters || '0');
            const option = doc.accepted.find(o => o.chainId === doc.payment!.chainId && o.route === 'split');
            const decimals = option?.decimals ?? 6;
            const cents =
                option?.token === 'USDC' && decimals >= 2
                    ? Number(toShelters / BigInt(10) ** BigInt(decimals - 2))
                    : null;
            return {
                ...share,
                route: 'split',
                state: 'onchain',
                evidenceTier: 'onchain-shelter-held',
                amountBase: toShelters.toString(),
                amountUsdCents: cents,
                chainId: doc.payment.chainId,
                txHash: doc.payment.txHash,
                confirmedAt: doc.payment.verifiedAt,
            };
        }
        if (!granted) {
            return { ...share, route: 'treasury', state: 'void', evidenceTier: null };
        }
        return treasuryShelterShare(
            share.shelterId,
            doc.orderId,
            doc.priceUsdCents,
            cfg.catShelterBps ?? share.bps,
            share
        );
    }

    // ------------------------------------------------------------------ card sales

    /**
     * A shelter cat paid by card (Stripe) carries the same shelter share as one paid to the treasury in
     * crypto. Stored as a `card` row so the one keeper pays both. Idempotent on the PaymentIntent id.
     * Returns the share, or null when this cat's shelter gets none.
     */
    async recordCardShelterShare(
        input: {
            userId: string;
            intentId: string;
            catId: string;
            grantedCatId?: string;
            name?: string;
            shelter: { _id: string; name: string; slug: string } | null;
            priceUsdCents: number;
        },
        now: Date = new Date(),
        cfg: CryptoPayConfig = readCryptoPayConfig()
    ): Promise<CheckoutShelterShare | null> {
        const sku: CheckoutSku = {
            kind: 'CAT',
            catId: input.catId,
            tier: SHELTER_CAT_TIER,
            name: input.name,
            shelter: input.shelter,
        };
        const shelterId = shareShelterId(sku, cfg);
        if (!shelterId || !Types.ObjectId.isValid(input.userId)) {
            return null;
        }
        const orderId = `co_${randomBytes(8).toString('hex')}`;
        const shelterShare = treasuryShelterShare(shelterId, orderId, input.priceUsdCents, cfg.catShelterBps);
        try {
            await this.checkoutModel.create({
                orderId,
                user: new Types.ObjectId(input.userId),
                rail: 'card',
                cardIntent: input.intentId,
                sku,
                priceUsdCents: input.priceUsdCents,
                discountPercentage: 0,
                network: 'card',
                accepted: [],
                status: 'COMPLETE',
                expiresAt: now,
                grant: {
                    success: true,
                    message: 'Paid by card',
                    ...(input.grantedCatId ? { catId: input.grantedCatId } : {}),
                },
                shelterShare,
                createdAt: now,
            } as any);
        } catch (error) {
            if (isDuplicateKey(error)) {
                return null;
            }
            throw error;
        }
        return shelterShare;
    }

    // ------------------------------------------------------------------ recovery

    @Cron(GRANT_RECOVERY_CRON, { name: GRANT_RECOVERY_JOB })
    async recoveryCron() {
        return runLeased({
            jobRuns: this.checkoutModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: GRANT_RECOVERY_JOB,
            ttlMs: GRANT_RECOVERY_LEASE_MS,
            logger: this.logger,
            run: () => this.recoverStuckGrants(),
        });
    }

    /**
     * Finishes orders left PAID with no grant result (the process died while granting). When the
     * `Order` already says COMPLETE or FAILED_GRANT, that result is copied; otherwise the grant runs
     * again under a new lease. A shelter cat the buyer already holds counts as delivered. A pack whose
     * adoption succeeded in the instant before the crash, without its order being marked, can be
     * granted twice (in the buyer's favour); that window is a single write.
     */
    async recoverStuckGrants(
        now: Date = new Date(),
        cfg: CryptoPayConfig = readCryptoPayConfig()
    ): Promise<GrantRecoveryRun> {
        const run: GrantRecoveryRun = { settled: 0, regranted: 0 };
        const rows = (await this.checkoutModel
            .find({
                status: 'PAID',
                grant: { $exists: false },
                grantStartedAt: { $lt: new Date(now.getTime() - STUCK_GRANT_MS) },
            })
            .limit(GRANT_RECOVERY_BATCH)
            .lean()) as unknown as ICryptoCheckout[];
        for (const doc of rows) {
            try {
                const order = (await this.orderRepository.findOne({
                    searchObject: { _id: doc.order },
                })) as unknown as IOrder | null;
                if (!order) {
                    this.logger.error(`grant recovery: order ${doc.orderId} has no Order; check by hand`);
                    continue;
                }
                const failedMessage = doc.sku.kind === 'CAT' ? CAT_GRANT_FAILED_MESSAGE : PACK_GRANT_FAILED_MESSAGE;
                if (order.status === OrderStatus.COMPLETE) {
                    await this.storeGrant(
                        doc,
                        'COMPLETE',
                        {
                            success: true,
                            message: 'Your item is in your collection.',
                            ...(order.cat ? { catId: String(order.cat) } : {}),
                        },
                        cfg
                    );
                    run.settled++;
                    continue;
                }
                if (order.status === OrderStatus.FAILED_GRANT) {
                    await this.storeGrant(
                        doc,
                        'FAILED_GRANT',
                        {
                            success: false,
                            message: failedMessage,
                            ...(order.refund?.state ? { refund: order.refund.state } : {}),
                        },
                        cfg
                    );
                    run.settled++;
                    continue;
                }
                const lease = await this.checkoutModel.findOneAndUpdate(
                    { _id: doc._id, status: 'PAID', grant: { $exists: false }, grantStartedAt: doc.grantStartedAt },
                    { $set: { grantStartedAt: now } },
                    { new: true, lean: true }
                );
                if (!lease) continue;
                if (doc.sku.kind === 'CAT') {
                    const held = await this.catSale.check(doc.sku.catId, doc.user);
                    if (!held.ok && held.reason === 'ALREADY_OWNED') {
                        await this.orderRepository.update(order._id!, { $set: { status: OrderStatus.COMPLETE } });
                        await this.storeGrant(
                            doc,
                            'COMPLETE',
                            { success: true, message: 'Your item is in your collection.' },
                            cfg
                        );
                        run.settled++;
                        continue;
                    }
                }
                await this.runGrant(lease as unknown as ICryptoCheckout, order, cfg);
                run.regranted++;
            } catch (error) {
                this.logger.error(`grant recovery of ${doc.orderId} failed: ${(error as Error)?.message}`);
            }
        }
        return run;
    }
}

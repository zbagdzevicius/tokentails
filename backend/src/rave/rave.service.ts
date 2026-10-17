import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import {
    CheckoutShelterShare,
    CryptoCheckout,
    CryptoCheckoutDocument,
} from 'src/payments/crypto/crypto-checkout.schema';
import { readCryptoPayConfig } from 'src/payments/crypto/crypto-pay.config';
import { CryptoShelterShareService, shelterShareNetworkOk } from 'src/payments/crypto/crypto-shelter-share.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    hotWalletAddress,
    NATIVE_BATCH_TOPIC,
    ShelterChain,
    shelterSplitInterface,
    TOKEN_BATCH_TOPIC,
} from 'src/shelter/onchain/shelter-chain';
import { ShelterClaimService } from 'src/shelter/onchain/shelter-claim.service';
import {
    chainWallets,
    isTestnetChain,
    NON_USD_TREAT_CHAIN_IDS,
    readShelterConfig,
    shelterConfigFor,
    ShelterOnchainConfig,
} from 'src/shelter/onchain/shelter-onchain.config';
import { CHAINS } from 'src/shelter/onchain/wallet.config';
import Stripe from 'stripe';
import { RaveConfig, readRaveConfig } from './rave.config';
import { RAVE_ERRORS } from './rave.errors';
import { raveQuote } from './rave-fee';
import { normalizeXHandle, RAVE_NAMED_SLOTS, resolveRaveNames } from './rave-names';
import { reverseShare, shrinkShare } from './rave-share';
import { IRaveOrder, RaveMethod, RaveOrder, RaveOrderDocument, RaveOrderStatus } from './rave.schema';

/*
 * Moon Rave checkout (cat-rave/CHECKOUT-SPEC.md). Every paid dollar becomes one dancing cat once its
 * on-chain payout to Pink Paw lands. A card payment is turned into an ordinary row of the existing
 * shelter-share keeper (CryptoShelterShareService, `cryptocheckouts`, memo `tt:rave:<16 hex>`, the FULL
 * donation, same `due` / retry semantics as $5 shelter cats); a USDC gift is the buyer's own split
 * transaction, verified read-only.
 *
 * Never double-pay: `raveorders.paymentIntentId` unique; the one-way `created|pending → paid` transition
 * shared by the webhook and the GET fallback; `cryptocheckouts.cardIntent` and `.orderId` unique; and the
 * keeper's own `due → sending` lock. A test payment never queues a payout against a mainnet keeper
 * (and a live payment never against a testnet one); the keeper also pays only rows of its own network
 * class (`card`/`mainnet` on a mainnet chain, `testnet` on a testnet chain).
 */

export const RAVE_ORDER_ID_RE = /^rv_[0-9a-f]{16}$/;
export const RAVE_CLIENT_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
/** `user` is required on keeper rows; rave buyers are anonymous. */
export const RAVE_SYSTEM_USER = new Types.ObjectId('000000000000000000000000');
export const RAVE_CARD_TTL_MS = 24 * 3600 * 1000;
export const RAVE_USDC_TTL_MS = 2 * 3600 * 1000;
export const RAVE_USDC_GIVE_UP_MS = 30 * 60 * 1000;
export const RAVE_DELAYED_MS = 30 * 60 * 1000;
export const RAVE_KEEPER_KICK_MS = 10 * 1000;
export const RAVE_STRIPE_POLL_MS = 5 * 1000;
export const RAVE_LIST_CACHE_MS = 15 * 1000;
export const RAVE_LIST_DEFAULT = 200;
export const RAVE_LIST_MAX = 500;
/**
 * How long an unpaid (`created`) order holds its dollars against RAVE_DAILY_CAP_USD and counts toward the
 * unpaid-orders brake. Its own TTL (24 h card, 2 h USDC) is far longer: holding the cap for that long let
 * one never-paid `POST /rave/checkout {cats: 100}` close checkout for the rest of the UTC day.
 */
export const RAVE_UNPAID_HOLD_MS = 15 * 60 * 1000;
/**
 * Most of RAVE_DAILY_CAP_USD that all unpaid (`created`) orders together may hold, in basis points (10 %).
 * Unpaid orders cost nothing to make, so without this one anonymous `{cats: <cap>}` every 15 min made
 * GET /rave/status answer `reason: 'cap'` for everyone. Paid orders always count in full.
 */
export const RAVE_UNPAID_HOLD_MAX_BPS = 1000;
/** Least time between two receipt reads of one reported USDC order from GET /rave/orders/:id. */
export const RAVE_USDC_POLL_MS = 10 * 1000;
/** An expired USDC order is rechecked in the background for this long after its tx was reported. */
export const RAVE_USDC_RECHECK_MS = 7 * 24 * 3600 * 1000;
/** Oldest `before` GET /rave/cats accepts (the rave did not exist earlier). */
const RAVE_LIST_EPOCH = Date.UTC(2026, 0, 1);
const HOLD_RISK = ['elevated', 'highest'];
/**
 * Public list: `review` (held for fraud review) stays private until a manager releases it, and a
 * `reported` USDC order (a tx hash the buyer sent, receipt not read yet) until verifyUsdc confirms it.
 */
const LISTED: RaveOrderStatus[] = ['pending', 'paid', 'onchain'];
const COUNTED_TODAY: RaveOrderStatus[] = ['pending', 'paid', 'review', 'onchain'];
/** A USDC order whose tx hash is waiting for its receipt (`pending` only on rows written before `reported`). */
const USDC_WAITING: RaveOrderStatus[] = ['reported', 'pending'];

export const raveMemo = (orderId: string) => `tt:rave:${orderId.slice(3)}`;
/** Tempo's bytes32 memo as the split emits it (`_hex`): UTF-8, right-padded, lowercase hex. */
export const raveMemo32 = (memo: string) => '0x' + Buffer.from(memo, 'utf8').toString('hex').padEnd(64, '0');

export type RaveOffReason = 'stripe' | 'keeper' | 'mode' | 'cap';

export interface RaveStatus {
    enabled: boolean;
    reason?: RaveOffReason;
    livemode?: boolean;
    publishableKey?: string;
    card?: boolean;
    usdc?: { enabled: boolean; chains: number[] };
    prices?: { fixed: number[]; customMin: number; max: number };
    fee?: { percentBps: number; fixedCents: number };
    payoutsDelayed?: boolean;
}

export interface RaveCheckoutBody {
    cats?: unknown;
    method?: unknown;
    coverFee?: unknown;
    names?: unknown;
    restName?: unknown;
    x?: unknown;
    clientKey?: unknown;
}

export interface RavePublicOrder {
    orderId: string;
    cats: number;
    names: string[];
    restName?: string;
    x?: string;
    status: string;
    chainId?: number;
    payoutTx?: string;
    method: RaveMethod;
    createdAt: string;
}

export interface RaveCatsPage {
    asOf: string;
    orders: RavePublicOrder[];
    nextBefore: string | null;
}

export interface RaveCheckoutResponse {
    orderId: string;
    clientSecret: string | null;
    amountCents: number;
    donationCents: number;
    feeCents: number;
    cats: number;
    names: string[];
    restName?: string;
    x: string | null;
    status: string;
    memo?: string;
    usdc?: { chains: number[]; amountUnits6: string };
}

export type MarkPaidOutcome = 'ignored' | 'not-succeeded' | 'mismatch' | 'already' | 'review' | 'mode-skipped' | 'paid';

/** True when the amount is one the rave sells: 1, 5, or a whole number from 10 to `max`. */
export function isRaveAmount(cats: unknown, max: number): cats is number {
    return (
        typeof cats === 'number' && Number.isInteger(cats) && (cats === 1 || cats === 5 || (cats >= 10 && cats <= max))
    );
}

const iso = (d: Date | string | undefined) => (d ? new Date(d).toISOString() : new Date(0).toISOString());
const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

@Injectable()
export class RaveService implements OnModuleDestroy {
    private readonly logger = new Logger(RaveService.name);
    /** Read on every call; tests replace it. Never logged or returned. */
    env: NodeJS.ProcessEnv = process.env;
    private kickTimer: NodeJS.Timeout | null = null;
    private readonly lastStripePoll = new Map<string, number>();
    private readonly lastUsdcPoll = new Map<string, number>();
    private listCache = new Map<string, { at: number; value: unknown }>();
    private usdcChainCache: { at: number; key: string; chains: number[] } | null = null;

    constructor(
        @InjectModel(RaveOrder.name) private orders: Model<RaveOrderDocument>,
        @InjectModel(CryptoCheckout.name) private checkouts: Model<CryptoCheckoutDocument>,
        private stripePayments: StripePaymentService,
        private shares: CryptoShelterShareService,
        private chain: ShelterChain,
        @Optional() private claims?: ShelterClaimService
    ) {}

    onModuleDestroy() {
        if (this.kickTimer) clearTimeout(this.kickTimer);
        this.kickTimer = null;
    }

    private get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    // ------------------------------------------------------------------ status

    /** Why checkout is closed, or null when card checkout may run (before the daily cap). */
    readiness(cfg: RaveConfig = readRaveConfig(this.env)): {
        reason: RaveOffReason | null;
        shelter: ShelterOnchainConfig;
    } {
        const shelter = readShelterConfig(this.env);
        if (!cfg.secretKeyMode || !cfg.publishableKeyMode || !cfg.webhookSecret) return { reason: 'stripe', shelter };
        if (!shelter.rpcUrl || !shelter.splitAddress || !hotWalletAddress(shelter)) {
            return { reason: 'keeper', shelter };
        }
        const live = cfg.secretKeyMode === 'live';
        if (cfg.publishableKeyMode !== cfg.secretKeyMode) return { reason: 'mode', shelter };
        if (live === isTestnetChain(shelter.chainId)) return { reason: 'mode', shelter };
        if (live && !cfg.production) return { reason: 'mode', shelter };
        // The keeper has no flag; it runs only when its chain matches the checkout network (main, Oct 14).
        if (!shelterShareNetworkOk(shelter, readCryptoPayConfig(this.env), this.env))
            return { reason: 'keeper', shelter };
        return { reason: null, shelter };
    }

    /**
     * USD cents still sellable today (UTC) under RAVE_DAILY_CAP_USD. Paid orders count in full; unpaid
     * `created` orders of the last RAVE_UNPAID_HOLD_MS hold at most RAVE_UNPAID_HOLD_MAX_BPS of the cap
     * together, so never-paid orders can shrink what is sellable but never close checkout. A `reported`
     * USDC order counts only once verifyUsdc has confirmed its receipt (then it is `onchain`).
     */
    async remainingTodayCents(cfg: RaveConfig, now: Date): Promise<number> {
        const rows: any[] = await this.orders
            .find(
                {
                    createdAt: { $gte: startOfUtcDay(now) },
                    $or: [
                        { status: { $in: COUNTED_TODAY } },
                        // Unpaid orders hold the cap only briefly (RAVE_UNPAID_HOLD_MS), not for their TTL.
                        {
                            status: 'created',
                            expireAt: { $gt: now },
                            createdAt: { $gte: new Date(now.getTime() - RAVE_UNPAID_HOLD_MS) },
                        },
                    ],
                },
                { donationCents: 1, status: 1 }
            )
            .limit(100000)
            .lean();
        let paid = 0;
        let unpaid = 0;
        for (const row of rows) {
            const cents = Number(row.donationCents) || 0;
            if (row.status === 'created') unpaid += cents;
            else paid += cents;
        }
        const capCents = cfg.dailyCapUsd * 100;
        const held = Math.min(unpaid, Math.floor((capCents * RAVE_UNPAID_HOLD_MAX_BPS) / 10000));
        return Math.max(0, capCents - paid - held);
    }

    async status(now: Date = new Date()): Promise<RaveStatus> {
        const cfg = readRaveConfig(this.env);
        const { reason, shelter } = this.readiness(cfg);
        if (reason) return { enabled: false, reason };
        const max = Math.min(cfg.maxCats, Math.floor((await this.remainingTodayCents(cfg, now)) / 100));
        if (max < 1) return { enabled: false, reason: 'cap' };
        const usdcChains = await this.usdcChains(shelter, now);
        return {
            enabled: true,
            livemode: cfg.secretKeyMode === 'live',
            publishableKey: cfg.publishableKey!,
            card: true,
            usdc: { enabled: usdcChains.length > 0, chains: usdcChains },
            prices: { fixed: [1, 5], customMin: 10, max },
            fee: { percentBps: cfg.feePercentBps, fixedCents: cfg.feeFixedCents },
            payoutsDelayed: await this.payoutsDelayed(now),
        };
    }

    /**
     * Chains a USDC gift may use: wallet.config.ts chains of the main chain's network class whose split
     * pays a USD coin, and only where buyer money never reaches a wallet Token Tails holds
     * (ShelterClaimService.publicGivingVerified; without it, testnets only).
     */
    async usdcChains(shelter: ShelterOnchainConfig, now: Date = new Date()): Promise<number[]> {
        const testnet = isTestnetChain(shelter.chainId);
        const key = `${shelter.chainId}`;
        if (this.usdcChainCache && this.usdcChainCache.key === key && now.getTime() - this.usdcChainCache.at < 60000) {
            return this.usdcChainCache.chains;
        }
        const candidates = Object.values(CHAINS)
            .filter(c => c.split && (c.network === 'testnet') === testnet)
            .filter(c => !/^EUR/i.test(c.split!.token.symbol) && !NON_USD_TREAT_CHAIN_IDS.includes(c.chainId))
            .map(c => c.chainId);
        const chains: number[] = [];
        for (const chainId of candidates) {
            let ok = false;
            try {
                ok = this.claims ? await this.claims.publicGivingVerified(chainId, now) : isTestnetChain(chainId);
            } catch {
                ok = false;
            }
            if (ok) chains.push(chainId);
        }
        this.usdcChainCache = { at: now.getTime(), key, chains };
        return chains;
    }

    /** Some card order has been paid for over 30 min with its payout still queued (float empty, RPC down). */
    async payoutsDelayed(now: Date): Promise<boolean> {
        const old: any[] = await this.orders
            .find(
                {
                    status: 'paid',
                    method: 'card',
                    paidAt: { $lt: new Date(now.getTime() - RAVE_DELAYED_MS) },
                    payoutSkipped: { $exists: false },
                },
                { orderId: 1 }
            )
            .limit(50)
            .lean();
        if (!old.length) return false;
        const waiting = await this.checkouts
            .findOne({
                orderId: { $in: old.map(o => o.orderId) },
                'shelterShare.state': { $in: ['due', 'sending', 'sent'] },
            })
            .lean();
        return !!waiting;
    }

    /** 503 while something checkout needs is missing (no on/off flag). */
    assertOpen(cfg: RaveConfig = readRaveConfig(this.env)): ShelterOnchainConfig {
        const { reason, shelter } = this.readiness(cfg);
        if (reason) throw RAVE_ERRORS.off(reason);
        return shelter;
    }

    // ------------------------------------------------------------------ checkout

    async checkout(body: RaveCheckoutBody, now: Date = new Date()): Promise<RaveCheckoutResponse> {
        const cfg = readRaveConfig(this.env);
        const shelter = this.assertOpen(cfg);
        if (!body || typeof body !== 'object') throw RAVE_ERRORS.invalid('Expected a JSON body');

        if (!isRaveAmount(body.cats, cfg.maxCats)) throw RAVE_ERRORS.amount();
        const cats = body.cats;
        const method: RaveMethod = body.method === undefined ? 'card' : (body.method as RaveMethod);
        if (method !== 'card' && method !== 'usdc') throw RAVE_ERRORS.method();
        if (body.coverFee !== undefined && typeof body.coverFee !== 'boolean') {
            throw RAVE_ERRORS.invalid('coverFee must be true or false');
        }
        const coverFee = method === 'card' ? body.coverFee !== false : false;
        const slots = Math.min(cats, RAVE_NAMED_SLOTS);
        if (body.names !== undefined && body.names !== null) {
            if (!Array.isArray(body.names) || body.names.length > slots) {
                throw RAVE_ERRORS.invalid(`names must be a list of at most ${slots} names`);
            }
            if (body.names.some(n => n !== null && n !== undefined && typeof n !== 'string')) {
                throw RAVE_ERRORS.invalid('Each name must be text');
            }
        }
        if (body.restName !== undefined && body.restName !== null && typeof body.restName !== 'string') {
            throw RAVE_ERRORS.invalid('restName must be text');
        }
        if (body.x !== undefined && body.x !== null && typeof body.x !== 'string') {
            throw RAVE_ERRORS.invalid('x must be text');
        }
        let clientKey: string | undefined;
        if (body.clientKey !== undefined && body.clientKey !== null) {
            if (typeof body.clientKey !== 'string' || !RAVE_CLIENT_KEY_RE.test(body.clientKey)) {
                throw RAVE_ERRORS.invalid('clientKey must be a UUID');
            }
            clientKey = body.clientKey;
        }
        const usdcChains = method === 'usdc' ? await this.usdcChains(shelter, now) : [];
        if (method === 'usdc' && !usdcChains.length) throw RAVE_ERRORS.method();

        const rawNames = Array.isArray(body.names) ? body.names.map(n => (typeof n === 'string' ? n.trim() : '')) : [];
        const rawRest = cats > RAVE_NAMED_SLOTS && typeof body.restName === 'string' ? body.restName.trim() : '';
        const rawX = typeof body.x === 'string' ? body.x.trim() : '';
        const requestHash = createHash('sha256')
            .update(JSON.stringify({ cats, method, coverFee, rawNames, rawRest, rawX }))
            .digest('hex');

        if (clientKey) {
            const existing: any = await this.orders.findOne({ clientKey }).lean();
            if (existing) return this.repeatCheckout(existing, requestHash, usdcChains);
        }

        const orderId = `rv_${randomBytes(8).toString('hex')}`;
        const resolved = resolveRaveNames({ cats, names: rawNames, restName: rawRest }, orderId);
        if (!resolved.ok) throw RAVE_ERRORS.names(resolved.fields);
        const x = normalizeXHandle(rawX);
        if (!x.ok) throw RAVE_ERRORS.xHandle(x.code);

        // Card-testing brake: unpaid orders of the last RAVE_UNPAID_HOLD_MS only, so a burst of never-paid
        // orders pauses checkout for minutes, not for an hour.
        const unpaid = await this.orders
            .countDocuments({
                status: { $in: ['created', 'canceled'] },
                createdAt: { $gte: new Date(now.getTime() - RAVE_UNPAID_HOLD_MS) },
            })
            .exec();
        if (unpaid >= cfg.createdPerHour) throw RAVE_ERRORS.busy();

        const quote = raveQuote(cats, coverFee, cfg);
        if (quote.donationCents > (await this.remainingTodayCents(cfg, now))) throw RAVE_ERRORS.cap();

        const doc: Partial<RaveOrder> & Record<string, unknown> = {
            orderId,
            ...(clientKey ? { clientKey } : {}),
            requestHash,
            method,
            cats,
            donationCents: quote.donationCents,
            feeCents: quote.feeCents,
            amountCents: quote.amountCents,
            coverFee,
            names: resolved.value.names,
            ...(resolved.value.restName !== undefined ? { restName: resolved.value.restName } : {}),
            defaultNames: resolved.value.defaultNames,
            ...(x.handle ? { xHandle: x.handle, xHandleLower: x.handle.toLowerCase() } : {}),
            hidden: false,
            status: 'created',
            expireAt: new Date(now.getTime() + (method === 'card' ? RAVE_CARD_TTL_MS : RAVE_USDC_TTL_MS)),
        };
        let order: any;
        try {
            order = (await this.orders.create(doc as any)) as any;
            order = typeof order?.toObject === 'function' ? order.toObject() : order;
        } catch (error) {
            if (clientKey && isDuplicateKeyError(error)) {
                const existing: any = await this.orders.findOne({ clientKey }).lean();
                if (existing) return this.repeatCheckout(existing, requestHash, usdcChains);
            }
            throw error;
        }

        if (method === 'usdc') return this.checkoutResponse(order, null, usdcChains);
        const intent = await this.createIntent(order);
        return this.checkoutResponse({ ...order, paymentIntentId: intent.id }, intent.client_secret, []);
    }

    private async repeatCheckout(order: any, requestHash: string, usdcChains: number[]): Promise<RaveCheckoutResponse> {
        if (order.requestHash !== requestHash) throw RAVE_ERRORS.keyReused();
        if (order.method === 'usdc') return this.checkoutResponse(order, null, usdcChains);
        let secret: string | null = null;
        if (['created', 'pending'].includes(order.status)) {
            const intent = order.paymentIntentId
                ? await this.stripe.paymentIntents.retrieve(order.paymentIntentId).catch(() => {
                      throw RAVE_ERRORS.stripe();
                  })
                : await this.createIntent(order);
            secret = intent.client_secret;
            order = { ...order, paymentIntentId: intent.id };
        }
        return this.checkoutResponse(order, secret, []);
    }

    /**
     * The order's PaymentIntent (idempotency key `rave:<orderId>`). Metadata carries no names, no handle,
     * no user id and no entity type, so the /web3 confirm path refuses it and never grants anything.
     */
    private async createIntent(order: any): Promise<Stripe.PaymentIntent> {
        let intent: Stripe.PaymentIntent;
        try {
            intent = await this.stripe.paymentIntents.create(
                {
                    amount: order.amountCents,
                    currency: 'usd',
                    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                    description: `Moon Rave: ${order.cats} cat${order.cats === 1 ? '' : 's'} for Pink Paw`,
                    statement_descriptor_suffix: 'MOON RAVE',
                    metadata: {
                        rave: '1',
                        orderId: order.orderId,
                        cats: String(order.cats),
                        donationCents: String(order.donationCents),
                        feeCents: String(order.feeCents),
                    },
                },
                { idempotencyKey: `rave:${order.orderId}` }
            );
        } catch (error) {
            this.logger.warn(`rave ${order.orderId}: PaymentIntent not created: ${(error as Error)?.message}`);
            // Nothing was charged; the order would only hold today's cap. A retry makes a new one.
            await this.orders.deleteOne({ orderId: order.orderId, paymentIntentId: { $exists: false } });
            throw RAVE_ERRORS.stripe();
        }
        await this.orders.updateOne(
            { orderId: order.orderId, paymentIntentId: { $exists: false } },
            { $set: { paymentIntentId: intent.id, livemode: intent.livemode } }
        );
        return intent;
    }

    private checkoutResponse(order: any, clientSecret: string | null, usdcChains: number[]): RaveCheckoutResponse {
        const out: RaveCheckoutResponse = {
            orderId: order.orderId,
            clientSecret,
            amountCents: order.amountCents,
            donationCents: order.donationCents,
            feeCents: order.feeCents,
            cats: order.cats,
            names: [...order.names],
            ...(order.restName !== undefined && order.restName !== null ? { restName: order.restName } : {}),
            x: order.xHandle || null,
            status: privateStatus(order.status),
        };
        if (order.method === 'usdc') {
            out.memo = raveMemo(order.orderId);
            out.usdc = { chains: usdcChains, amountUnits6: (BigInt(order.cats) * BigInt(1000000)).toString() };
        }
        return out;
    }

    // ------------------------------------------------------------------ paid

    /**
     * The one way an order becomes paid (webhook `payment_intent.succeeded` and the GET fallback). Only
     * the caller that wins the atomic `created|pending → paid|review` transition queues the payout; a
     * repeat re-queues an already paid order idempotently (a crash between the two writes).
     */
    async markPaid(intent: Stripe.PaymentIntent, now: Date = new Date()): Promise<MarkPaidOutcome> {
        const md = intent?.metadata || {};
        if (md.rave !== '1' || !RAVE_ORDER_ID_RE.test(String(md.orderId || ''))) return 'ignored';
        if (intent.status !== 'succeeded') return 'not-succeeded';
        const orderId = String(md.orderId);
        let order: any = await this.orders.findOne({ orderId }).lean();
        if (!order) order = await this.recoverOrder(intent, now);
        if (
            !order ||
            order.method !== 'card' ||
            intent.currency !== 'usd' ||
            (order.paymentIntentId && order.paymentIntentId !== intent.id) ||
            intent.amount_received !== order.amountCents
        ) {
            this.logger.error(`rave ${orderId}: paid intent ${intent.id} does not match its order: check by hand`);
            return 'mismatch';
        }
        const risk = riskLevel(intent);
        const hold = !!risk && HOLD_RISK.includes(risk);
        const won: any = await this.orders
            .findOneAndUpdate(
                { orderId, status: { $in: ['created', 'pending'] } },
                {
                    $set: {
                        status: hold ? 'review' : 'paid',
                        paidAt: now,
                        paymentIntentId: intent.id,
                        livemode: intent.livemode,
                        ...(risk ? { risk } : {}),
                    },
                    $unset: { expireAt: 1 },
                },
                { new: true }
            )
            .lean();
        this.listCache.clear();
        if (!won) {
            const current: any = await this.orders.findOne({ orderId }).lean();
            // queuePayout pays only what was kept (refundedCents), so a refund recorded in between is respected.
            if (current?.status === 'paid' && !current.payoutSkipped) await this.queuePayout(current, now);
            return 'already';
        }
        if (hold) {
            this.logger.warn(`rave ${orderId}: ${risk} risk, held for review`);
            return 'review';
        }
        return (await this.queuePayout(won, now)) ? 'paid' : 'mode-skipped';
    }

    /** A paid rave intent whose order is gone (removed by the TTL): rebuilt from metadata with default names. */
    private async recoverOrder(intent: Stripe.PaymentIntent, now: Date): Promise<any> {
        const md = intent.metadata || {};
        const cats = Number(md.cats);
        const donationCents = Number(md.donationCents);
        const feeCents = Number(md.feeCents);
        if (!isRaveAmount(cats, 100000) || donationCents !== cats * 100 || !Number.isSafeInteger(feeCents)) {
            return null;
        }
        const resolved = resolveRaveNames({ cats }, String(md.orderId));
        if (!resolved.ok) return null;
        this.logger.warn(`rave ${md.orderId}: paid intent without an order, rebuilt with default names`);
        try {
            await this.orders.create({
                orderId: String(md.orderId),
                method: 'card',
                cats,
                donationCents,
                feeCents,
                amountCents: donationCents + feeCents,
                coverFee: feeCents > 0,
                names: resolved.value.names,
                ...(resolved.value.restName !== undefined ? { restName: resolved.value.restName } : {}),
                defaultNames: resolved.value.defaultNames,
                hidden: false,
                paymentIntentId: intent.id,
                livemode: intent.livemode,
                status: 'created',
                expireAt: new Date(now.getTime() + RAVE_CARD_TTL_MS),
            } as any);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        return this.orders.findOne({ orderId: String(md.orderId) }).lean();
    }

    /**
     * Inserts the keeper row: the FULL donation to Pink Paw, memo `tt:rave:<16 hex>`, less any partial
     * refund recorded before the row existed (an order held for review, or a refund that beat the
     * webhook): `min(donation, amount - refunded - fee)`, as reverse() computes it. Nothing is queued when
     * nothing was kept. Refused when the payment's mode does not match the keeper's chain (test money
     * never pays a mainnet shelter). Idempotent on the PaymentIntent id and the order id. Returns whether
     * a row exists now.
     */
    async queuePayout(order: any, now: Date = new Date()): Promise<boolean> {
        const shelter = readShelterConfig(this.env);
        const keeperMainnet = !isTestnetChain(shelter.chainId);
        if (order.livemode !== keeperMainnet) {
            this.logger.error(
                `rave ${order.orderId}: ${order.livemode ? 'live' : 'test'} payment against a ${
                    keeperMainnet ? 'mainnet' : 'testnet'
                } keeper, no payout queued`
            );
            await this.orders.updateOne({ orderId: order.orderId }, { $set: { payoutSkipped: 'mode' } });
            return false;
        }
        const payCents = keptDonationCents(order);
        if (payCents <= 0) {
            this.logger.warn(`rave ${order.orderId}: everything was refunded before its payout, none queued`);
            await this.orders.updateOne({ orderId: order.orderId }, { $set: { payoutSkipped: 'refunded' } });
            return false;
        }
        if (payCents < order.donationCents) {
            this.logger.warn(`rave ${order.orderId}: partly refunded before its payout, paying ${payCents} cents`);
        }
        const shelterShare: CheckoutShelterShare = {
            shelterId: PACK_SHELTER_IDS.pinkPaw,
            route: 'treasury',
            bps: 10000,
            evidenceTier: 'pledged',
            state: 'due',
            amountUsdCents: payCents,
            memo: raveMemo(order.orderId),
            attempts: 0,
        };
        try {
            await this.checkouts.create({
                orderId: order.orderId,
                user: RAVE_SYSTEM_USER,
                rail: 'card',
                network: order.livemode ? 'card' : 'testnet',
                cardIntent: order.paymentIntentId,
                sku: { kind: 'RAVE', name: 'Moon Rave' },
                priceUsdCents: payCents,
                discountPercentage: 0,
                accepted: [],
                status: 'COMPLETE',
                expiresAt: now,
                grant: { success: true, message: 'Moon Rave' },
                shelterShare,
            } as any);
            await this.orders.updateOne({ orderId: order.orderId }, { $set: { shareState: 'due' } });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        this.kickKeeper();
        return true;
    }

    /** Debounced, fire-and-forget keeper run, so a paid order does not wait up to 5 min for the cron. */
    kickKeeper(): void {
        if (this.kickTimer) return;
        this.kickTimer = setTimeout(() => {
            this.kickTimer = null;
            this.shares.runOnce().catch(error => this.logger.warn(`rave keeper kick: ${(error as Error)?.message}`));
        }, RAVE_KEEPER_KICK_MS);
        this.kickTimer.unref?.();
    }

    async markProcessing(intent: Stripe.PaymentIntent): Promise<string> {
        if (intent?.metadata?.rave !== '1') return 'ignored';
        await this.orders.updateOne(
            { orderId: intent.metadata.orderId, paymentIntentId: intent.id, status: 'created' },
            { $set: { status: 'pending' } }
        );
        this.listCache.clear();
        return 'pending';
    }

    async markFailed(intent: Stripe.PaymentIntent): Promise<string> {
        if (intent?.metadata?.rave !== '1') return 'ignored';
        await this.orders.updateOne(
            { orderId: intent.metadata.orderId, paymentIntentId: intent.id, status: 'pending' },
            { $set: { status: 'created' } }
        );
        this.listCache.clear();
        return 'failed';
    }

    async markCanceled(intent: Stripe.PaymentIntent): Promise<string> {
        if (intent?.metadata?.rave !== '1') return 'ignored';
        await this.orders.updateOne(
            { orderId: intent.metadata.orderId, paymentIntentId: intent.id, status: { $in: ['created', 'pending'] } },
            { $set: { status: 'canceled' }, $unset: { expireAt: 1 } }
        );
        this.listCache.clear();
        return 'canceled';
    }

    /**
     * A refund or dispute. The keeper row is marked reversed whatever its state (rave-share.ts), so it is
     * never sent again; a row that has not left (`due`, `failed`) is voided at once. A row already
     * `sending` / `sent` may still land: the order is flagged, and refreshShares turns it `refunded` /
     * `disputed` if the keeper voids it instead. After a confirmed payout nothing is undone (the shelter
     * keeps the money) and a person is told.
     *
     * Partial refunds (`refundedCents` = the charge's cumulative `amount_refunded`) are recorded on the
     * order and shrink a waiting payout to what was kept of the donation; refunds adding up to the whole
     * amount are a full reversal.
     */
    async reverse(
        paymentIntentId: string,
        kind: 'refunded' | 'disputed',
        full: boolean,
        refundedCents?: number,
        now: Date = new Date()
    ): Promise<string> {
        if (!paymentIntentId) return 'ignored';
        const order: any = await this.orders.findOne({ paymentIntentId }).lean();
        if (!order) return 'ignored';
        const refunded =
            typeof refundedCents === 'number' && Number.isSafeInteger(refundedCents) && refundedCents > 0
                ? refundedCents
                : null;
        if (refunded !== null) {
            await this.orders.updateOne(
                {
                    orderId: order.orderId,
                    $or: [{ refundedCents: { $exists: false } }, { refundedCents: { $lt: refunded } }],
                },
                { $set: { refundedCents: refunded } }
            );
        }
        const keepCents =
            refunded === null ? order.donationCents : keptDonationCents({ ...order, refundedCents: refunded });
        const whole = full || (refunded !== null && (refunded >= order.amountCents || keepCents <= 0));
        this.listCache.clear();
        if (!whole) {
            if (refunded === null) {
                this.logger.warn(`rave ${order.orderId}: partial ${kind} without an amount, payout unchanged`);
                return 'partial';
            }
            const keep = keepCents;
            if (await shrinkShare(this.checkouts, order.orderId, paymentIntentId, keep)) {
                this.logger.warn(`rave ${order.orderId}: partial refund, payout reduced to ${keep} cents`);
                return 'reduced';
            }
            this.logger.error(
                `rave ${order.orderId}: partial refund of ${refunded} cents after its payout left; Token Tails absorbs it, check by hand`
            );
            return 'partial';
        }
        const { outcome, state } = await reverseShare(this.checkouts, order.orderId, paymentIntentId, kind, now);
        if (outcome === 'none' || outcome === 'voided') {
            await this.orders.updateOne(
                { orderId: order.orderId, status: { $in: ['created', 'pending', 'paid', 'review'] } },
                { $set: { status: kind, shareState: 'void' }, $unset: { expireAt: 1 } }
            );
            return 'voided';
        }
        await this.orders.updateOne({ orderId: order.orderId }, { $set: { reversedAfterPayout: kind } });
        this.logger.error(
            outcome === 'paid'
                ? `rave ${order.orderId}: ${kind} after its payout confirmed; Token Tails absorbs it, check by hand`
                : `rave ${order.orderId}: ${kind} while its payout was ${state}; it will not be re-sent, check the tx by hand`
        );
        return 'after-payout';
    }

    // ------------------------------------------------------------------ reads

    /** The buyer's own order; runs the Stripe fallback when the webhook is slow. */
    async getOrder(orderId: string, now: Date = new Date()) {
        if (!RAVE_ORDER_ID_RE.test(String(orderId || ''))) throw RAVE_ERRORS.orderNotFound();
        let order: any = await this.orders.findOne({ orderId }).lean();
        if (!order || (order.status === 'created' && order.expireAt && new Date(order.expireAt) < now)) {
            throw RAVE_ERRORS.orderNotFound();
        }
        if (order.method === 'card' && ['created', 'pending'].includes(order.status) && order.paymentIntentId) {
            await this.pollStripe(order, now);
        }
        if (order.method === 'card' && order.status === 'paid') {
            await this.refreshShares([order], now);
        }
        if (order.method === 'usdc' && USDC_WAITING.includes(order.status)) {
            await this.pollUsdc(order, now);
        }
        order = await this.orders.findOne({ orderId }).lean();
        return {
            ...publicOrder(order),
            status: privateStatus(order.status),
            amountCents: order.amountCents,
            donationCents: order.donationCents,
            feeCents: order.feeCents,
            ...(order.method === 'usdc' ? { memo: raveMemo(order.orderId) } : {}),
        };
    }

    /** verifyUsdc at most once per RAVE_USDC_POLL_MS per order, so polling buyers do not burn the RPC quota. */
    private async pollUsdc(order: any, now: Date) {
        const last = this.lastUsdcPoll.get(order.orderId) || 0;
        if (now.getTime() - last < RAVE_USDC_POLL_MS) return;
        if (this.lastUsdcPoll.size > 5000) this.lastUsdcPoll.clear();
        this.lastUsdcPoll.set(order.orderId, now.getTime());
        await this.verifyUsdc(order, now).catch(() => undefined);
    }

    private async pollStripe(order: any, now: Date) {
        const last = this.lastStripePoll.get(order.orderId) || 0;
        if (now.getTime() - last < RAVE_STRIPE_POLL_MS) return;
        if (this.lastStripePoll.size > 5000) this.lastStripePoll.clear();
        this.lastStripePoll.set(order.orderId, now.getTime());
        let intent: Stripe.PaymentIntent;
        try {
            intent = await this.stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] });
        } catch (error) {
            this.logger.warn(`rave ${order.orderId}: intent not read: ${(error as Error)?.message}`);
            return;
        }
        if (intent.status === 'succeeded') await this.markPaid(intent, now);
        else if (intent.status === 'processing') await this.markProcessing(intent);
        else if (intent.status === 'canceled') await this.markCanceled(intent);
    }

    /** Copies the keeper rows' state into paid card orders; a confirmed payout makes the order `onchain`. */
    async refreshShares(orders?: any[], now: Date = new Date()) {
        const list: any[] =
            orders ||
            (await this.orders
                .find({ status: 'paid', method: 'card', payoutSkipped: { $exists: false } })
                .sort({ paidAt: 1 })
                .limit(100)
                .lean());
        if (!list.length) return;
        const rows: any[] = await this.checkouts
            .find({ orderId: { $in: list.map(o => o.orderId) } }, { orderId: 1, shelterShare: 1 })
            .lean();
        for (const row of rows) {
            const share = row.shelterShare || {};
            if (share.state === 'confirmed' && share.txHash) {
                await this.orders.updateOne(
                    { orderId: row.orderId, status: 'paid' },
                    {
                        $set: {
                            status: 'onchain',
                            shareState: 'confirmed',
                            payout: {
                                chainId: Number(share.chainId),
                                txHash: String(share.txHash),
                                confirmedAt: share.confirmedAt ? new Date(share.confirmedAt) : now,
                            },
                        },
                    }
                );
            } else if (share.state === 'void' && ['refunded', 'disputed'].includes(share.reversed)) {
                // Refunded while its payout was in flight, and the keeper voided it instead of re-sending.
                await this.orders.updateOne(
                    { orderId: row.orderId, status: { $in: ['paid', 'review'] } },
                    { $set: { status: share.reversed, shareState: 'void' } }
                );
            } else if (share.state) {
                await this.orders.updateOne({ orderId: row.orderId }, { $set: { shareState: share.state } });
            }
        }
    }

    /** GET /rave/cats: listed orders, newest first. No PII beyond the X handle the buyer chose to show. */
    async listCats(query: { limit?: unknown; before?: unknown }, now: Date = new Date()): Promise<RaveCatsPage> {
        const limitRaw = Number(query?.limit);
        const limit =
            Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, RAVE_LIST_MAX) : RAVE_LIST_DEFAULT;
        let before: Date | null = null;
        if (query?.before !== undefined && query?.before !== '') {
            // Only the cursor this route hands out (`nextBefore`): an ISO instant in the rave's lifetime.
            const raw = typeof query.before === 'string' ? query.before : '';
            const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw) ? new Date(raw) : null;
            if (
                !d ||
                Number.isNaN(d.getTime()) ||
                d.getTime() < RAVE_LIST_EPOCH ||
                d.getTime() > now.getTime() + 60000
            ) {
                throw RAVE_ERRORS.invalid('before must be an ISO date');
            }
            before = d;
        }
        const key = `${limit}|${before ? before.toISOString() : ''}`;
        const cached = this.listCache.get(key);
        if (cached && now.getTime() - cached.at < RAVE_LIST_CACHE_MS) return cached.value as RaveCatsPage;

        // Only the first page (cached, so at most once per RAVE_LIST_CACHE_MS per `limit`) refreshes the
        // payout states; a stream of new `before` values costs one indexed read each, never RPC calls.
        // refreshCron keeps everything moving without visitors.
        if (!before) await this.refreshAll(now);

        const rows: any[] = await this.orders
            .find({ status: { $in: LISTED }, ...(before ? { createdAt: { $lt: before } } : {}) })
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .lean();
        const page = rows.slice(0, limit);
        const value: RaveCatsPage = {
            asOf: now.toISOString(),
            orders: page.map(publicOrder),
            nextBefore: rows.length > limit ? iso(page[page.length - 1].createdAt) : null,
        };
        if (this.listCache.size > 50) this.listCache.clear();
        this.listCache.set(key, { at: now.getTime(), value });
        return value;
    }

    // ------------------------------------------------------------------ USDC

    async reportUsdcTx(orderId: string, body: { chainId?: unknown; txHash?: unknown }, now: Date = new Date()) {
        const cfg = readRaveConfig(this.env);
        const shelter = this.assertOpen(cfg);
        if (!RAVE_ORDER_ID_RE.test(String(orderId || ''))) throw RAVE_ERRORS.orderNotFound();
        const chainId = Number(body?.chainId);
        const txHash = typeof body?.txHash === 'string' ? body.txHash.toLowerCase() : '';
        if (!Number.isSafeInteger(chainId) || !TX_HASH_RE.test(txHash)) {
            throw RAVE_ERRORS.invalid('Expected { chainId, txHash }');
        }
        if (!(await this.usdcChains(shelter, now)).includes(chainId)) throw RAVE_ERRORS.method();
        const order: any = await this.orders.findOne({ orderId }).lean();
        if (!order || order.method !== 'usdc') throw RAVE_ERRORS.orderNotFound();
        if (order.usdc?.txHash && order.usdc.txHash !== txHash) {
            throw RAVE_ERRORS.orderState('This order already has a transaction');
        }
        if (order.usdc?.txHash && order.status === 'expired') {
            // The same tx again after its receipt was missing for RAVE_USDC_GIVE_UP_MS: check it once more.
            const outcome = await this.verifyUsdc(order, now);
            if (outcome === 'mismatch') throw RAVE_ERRORS.txMismatch('That transaction is not this order’s gift');
            return this.getOrder(orderId, now);
        }
        if (!order.usdc?.txHash) {
            if (order.status !== 'created') throw RAVE_ERRORS.orderState('This order is closed');
            try {
                const res: any = await this.orders.updateOne(
                    { orderId, status: 'created', usdc: { $exists: false } },
                    // `reported`, not `pending`: neither listed nor counted against the cap until the receipt
                    // confirms it, so a made-up hash buys no public exposure and holds no cap.
                    {
                        $set: { status: 'reported', usdc: { chainId, txHash, reportedAt: now } },
                        $unset: { expireAt: 1 },
                    }
                );
                if (!res?.modifiedCount && !res?.matchedCount) {
                    throw RAVE_ERRORS.orderState('This order is closed');
                }
            } catch (error) {
                if (isDuplicateKeyError(error)) throw RAVE_ERRORS.txUsed();
                throw error;
            }
        }
        const fresh: any = await this.orders.findOne({ orderId }).lean();
        this.lastUsdcPoll.set(orderId, now.getTime());
        const outcome = await this.verifyUsdc(fresh, now);
        if (outcome === 'mismatch') throw RAVE_ERRORS.txMismatch('That transaction is not this order’s gift');
        return this.getOrder(orderId, now);
    }

    /**
     * Read-only receipt check of a buyer's USDC gift: a batch event of a split recorded for that chain,
     * with this order's memo (Tempo: its bytes32 hex form), paying the shelters at least `cats` USD.
     */
    async verifyUsdc(order: any, now: Date): Promise<'onchain' | 'pending' | 'mismatch' | 'expired'> {
        if (!order?.usdc?.txHash || ![...USDC_WAITING, 'expired'].includes(order.status)) return 'pending';
        // An expired order (no receipt within RAVE_USDC_GIVE_UP_MS) is rechecked, never reset or re-expired.
        const wasExpired = order.status === 'expired';
        const config = shelterConfigFor(order.usdc.chainId, this.env);
        const reported = new Date(order.usdc.reportedAt).getTime();
        let receipt: any = null;
        if (config?.rpcUrl) {
            try {
                receipt = await this.chain.getReceipt(config, order.usdc.txHash);
            } catch {
                receipt = null;
            }
        }
        if (!receipt) {
            if (wasExpired) return 'expired';
            if (now.getTime() - reported > RAVE_USDC_GIVE_UP_MS) {
                await this.orders.updateOne(
                    { orderId: order.orderId, status: { $in: USDC_WAITING } },
                    { $set: { status: 'expired' } }
                );
                this.listCache.clear();
                return 'expired';
            }
            return 'pending';
        }
        const paid =
            receipt.status === 1
                ? usdcPaidToShelters(receipt.logs || [], order.usdc.chainId, raveMemo(order.orderId))
                : null;
        if (paid === null || paid.toShelters < BigInt(order.cats) * BigInt(10) ** BigInt(paid.decimals)) {
            if (wasExpired) return 'mismatch';
            await this.orders.updateOne(
                { orderId: order.orderId, status: { $in: USDC_WAITING } },
                {
                    $set: { status: 'created', expireAt: new Date(now.getTime() + RAVE_USDC_TTL_MS) },
                    $unset: { usdc: 1 },
                }
            );
            return 'mismatch';
        }
        await this.orders.updateOne(
            { orderId: order.orderId, status: order.status },
            {
                $set: {
                    status: 'onchain',
                    paidAt: now,
                    payout: { chainId: order.usdc.chainId, txHash: order.usdc.txHash, confirmedAt: now },
                },
            }
        );
        this.listCache.clear();
        return 'onchain';
    }

    private async refreshUsdc(now: Date) {
        const pending: any[] = await this.orders
            .find({ status: { $in: USDC_WAITING }, method: 'usdc' })
            .sort({ updatedAt: 1 })
            .limit(5)
            .lean();
        for (const order of pending) {
            await this.verifyUsdc(order, now).catch(() => undefined);
        }
    }

    /** Expired USDC orders whose tx may have confirmed after an RPC outage: a few per run, oldest check first. */
    private async recheckExpiredUsdc(now: Date) {
        const expired: any[] = await this.orders
            .find({
                status: 'expired',
                method: 'usdc',
                'usdc.txHash': { $exists: true },
                'usdc.reportedAt': { $gte: new Date(now.getTime() - RAVE_USDC_RECHECK_MS) },
            })
            .sort({ updatedAt: 1 })
            .limit(3)
            .lean();
        for (const order of expired) {
            await this.verifyUsdc(order, now).catch(() => undefined);
            // Rotate: a still-missing receipt moves to the back of the queue.
            await this.orders.updateOne({ orderId: order.orderId, status: 'expired' }, { $set: { recheckedAt: now } });
        }
    }

    private async refreshAll(now: Date) {
        await this.refreshShares(undefined, now).catch(error =>
            this.logger.warn(`rave share refresh: ${(error as Error)?.message}`)
        );
        await this.refreshUsdc(now).catch(error => this.logger.warn(`rave usdc refresh: ${(error as Error)?.message}`));
    }

    /** Payout states and USDC receipts move every minute without visitors; expired USDC gifts are rechecked. */
    @Cron('15 * * * * *', { name: 'rave-refresh' })
    async refreshCron(now: Date = new Date()) {
        const any = await this.orders
            .findOne({ status: { $in: ['paid', 'pending', 'reported', 'expired'] } }, { orderId: 1 })
            .lean();
        if (!any) return 'idle';
        await this.refreshAll(now);
        await this.recheckExpiredUsdc(now).catch(error =>
            this.logger.warn(`rave usdc recheck: ${(error as Error)?.message}`)
        );
        this.listCache.clear();
        return 'ran';
    }

    // ------------------------------------------------------------------ admin

    async moderate(orderId: string, hidden: unknown, by: string | undefined, now: Date = new Date()) {
        if (!RAVE_ORDER_ID_RE.test(String(orderId || ''))) throw RAVE_ERRORS.orderNotFound();
        if (typeof hidden !== 'boolean') throw RAVE_ERRORS.invalid('hidden must be true or false');
        const res: any = await this.orders.updateOne(
            { orderId },
            hidden
                ? { $set: { hidden: true, hiddenAt: now, ...(by ? { hiddenBy: by } : {}) } }
                : { $set: { hidden: false }, $unset: { hiddenAt: 1, hiddenBy: 1 } }
        );
        if (!res?.matchedCount) throw RAVE_ERRORS.orderNotFound();
        this.listCache.clear();
        return { orderId, hidden };
    }

    /** Releases a `review` hold: the order becomes `paid` and its payout row is queued. */
    async release(orderId: string, now: Date = new Date()) {
        if (!RAVE_ORDER_ID_RE.test(String(orderId || ''))) throw RAVE_ERRORS.orderNotFound();
        const won: any = await this.orders
            .findOneAndUpdate({ orderId, status: 'review' }, { $set: { status: 'paid' } }, { new: true })
            .lean();
        if (!won) throw RAVE_ERRORS.orderState('Only an order held for review can be released');
        this.listCache.clear();
        const queued = await this.queuePayout(won, now);
        return { orderId, status: 'paid', payoutQueued: queued };
    }
}

/** `latest_charge.outcome.risk_level` when the charge is expanded. */
function riskLevel(intent: Stripe.PaymentIntent): string | null {
    const charge = intent.latest_charge;
    if (charge && typeof charge === 'object') {
        return (charge as Stripe.Charge).outcome?.risk_level || null;
    }
    return null;
}

/** What the buyer sees: `review` reads as `paid`, `reported` (receipt not read yet) as `pending`. */
const privateStatus = (status: string) => (status === 'review' ? 'paid' : status === 'reported' ? 'pending' : status);

/** Cents of the donation Token Tails kept after refunds: `min(donation, amount - refunded - fee)`, never below 0. */
export function keptDonationCents(order: {
    donationCents: number;
    amountCents: number;
    feeCents?: number;
    refundedCents?: number;
}): number {
    const refunded = Number(order.refundedCents) || 0;
    if (refunded <= 0) return Number(order.donationCents) || 0;
    const kept = Number(order.amountCents) - refunded - (Number(order.feeCents) || 0);
    return Math.max(0, Math.min(Number(order.donationCents) || 0, kept));
}

/** The public shape of an order. A hidden order shows its defaults and no handle. */
export function publicOrder(order: IRaveOrder | any): RavePublicOrder {
    const slots = Math.min(Number(order.cats), RAVE_NAMED_SLOTS);
    const defaults: string[] = Array.isArray(order.defaultNames) ? order.defaultNames : [];
    const hidden = !!order.hidden;
    const names = hidden ? defaults.slice(0, slots) : [...(order.names || [])];
    const out: RavePublicOrder = {
        orderId: String(order.orderId),
        cats: Number(order.cats),
        names,
        status: privateStatus(String(order.status)),
        method: order.method,
        createdAt: iso(order.createdAt),
    };
    if (Number(order.cats) > RAVE_NAMED_SLOTS) {
        const rest = hidden ? defaults[slots] : order.restName;
        if (rest) out.restName = String(rest);
    }
    if (!hidden && order.xHandle) out.x = String(order.xHandle);
    if (order.status === 'onchain' && order.payout?.txHash) {
        out.chainId = Number(order.payout.chainId);
        out.payoutTx = String(order.payout.txHash);
    }
    return out;
}

/**
 * What a USDC gift paid the shelters: `toShelters` of the first split batch event with `memo` (or its
 * bytes32 hex form) emitted by a split recorded for `chainId` in wallet.config.ts. Native batches are
 * 18-decimal USDC (Arc); token batches use the split's token decimals; EURC splits never count.
 */
export function usdcPaidToShelters(
    logs: readonly { address: string; topics: readonly string[]; data: string }[],
    chainId: number,
    memo: string
): { toShelters: bigint; decimals: number } | null {
    const c = chainWallets(chainId);
    if (!c) return null;
    const splits = [...(c.split ? [c.split] : []), ...c.otherSplits].filter(s => !/^EUR/i.test(s.token.symbol));
    const memo32 = raveMemo32(memo);
    for (const log of logs) {
        const split = splits.find(s => s.address.toLowerCase() === String(log.address).toLowerCase());
        if (!split) continue;
        const topic = String(log.topics?.[0] || '').toLowerCase();
        const native = topic === NATIVE_BATCH_TOPIC.toLowerCase();
        if (!native && topic !== TOKEN_BATCH_TOPIC.toLowerCase()) continue;
        try {
            const parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            const m = String(parsed?.args.memo || '');
            if (m === memo || m.toLowerCase() === memo32) {
                return { toShelters: BigInt(parsed!.args.toShelters), decimals: native ? 18 : split.token.decimals };
            }
        } catch {
            // Not a batch event.
        }
    }
    return null;
}

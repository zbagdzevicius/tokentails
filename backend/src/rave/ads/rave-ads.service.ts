import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import {
    CheckoutShelterShare,
    CryptoCheckout,
    CryptoCheckoutDocument,
} from 'src/payments/crypto/crypto-checkout.schema';
import { CryptoChainReader } from 'src/payments/crypto/crypto-chain-reader';
import { checkPayment } from 'src/payments/crypto/crypto-evm';
import { cryptoPayChain } from 'src/payments/crypto/crypto-chains';
import { readCryptoPayConfig } from 'src/payments/crypto/crypto-pay.config';
import { CryptoShelterShareService, shelterShareNetworkOk } from 'src/payments/crypto/crypto-shelter-share.service';
import { StripePaymentService } from 'src/payments/stripe-payment.service';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { UNKNOWN_CLIENT_IP_BUCKET } from 'src/shared/guards/client-ip-throttler.guard';
import { deleteObject, getPrivateObject, uploadFile, uploadPrivateObject } from 'src/shared/utils/aws.utils';
import { hotWalletAddress } from 'src/shelter/onchain/shelter-chain';
import { isTestnetChain, readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import Stripe from 'stripe';
import { RAVE_SYSTEM_USER } from '../rave.service';
import { checkRaveStripeAccount, noteRaveStripeError, raveStripeBroken } from '../rave-stripe-health';
import { normalizeXHandle } from '../rave-names';
import { reverseShare, shrinkShare } from '../rave-share';
import { raveAdQuote, raveAdShelterCents, RaveAdsConfig, readRaveAdsConfig } from './rave-ads.config';
import { RaveAdUsdc, raveAdAmountKey, raveAdUsdcAmount, raveAdUsdcTarget, RaveAdUsdcTarget } from './rave-ads.crypto';
import { RAVE_AD_ERRORS } from './rave-ads.errors';
import { AdImageError, sanitizeAdImage } from './rave-ads.image';
import { RaveAd, RaveAdDocument, RaveAdMethod, RaveAdRefund, RaveAdStatus } from './rave-ads.schema';
import { RAVE_AD_SLOTS, raveAdSlot, RaveAdSlotKind } from './rave-ads.slots';
import { normalizeAdName, normalizeAdUrl } from './rave-ads.validation';

/*
 * Moon Rave ad space: 20 slots in the world at $100 each (cat-rave/src/ads). The buyer picks a free slot,
 * uploads an image, names the sponsor, gives an https link and an optional X handle, and pays in place with
 * the Stripe Payment Element (server-priced PaymentIntent, idempotency key `ravead:<adId>`, same webhook as
 * the rave checkout). The slot is held for RAVE_AD_HOLD_MINUTES (15) from checkout; a unique index on
 * `slotLock` means it is never sold twice at once. A paid ad waits for an admin: approve makes it live for
 * RAVE_AD_DAYS (30), reject refunds it through Stripe and frees the slot. GET /rave/ads lists live ads only.
 *
 * Crypto (USDC on Arc only, rave-ads.crypto.ts): the same hold, then the buyer's wallet sends the exact
 * tagged amount to the Token Tails treasury and POSTs the tx hash (POST /rave/ads/:adId/usdc-tx); the
 * receipt is read (read-only) and the ad moves `held → review` like a card payment. A rejected USDC ad, or
 * one paid after its slot was taken, is refunded by hand to the paying wallet (`refund.state: manual`).
 *
 * Ad money is Token Tails revenue. RAVE_AD_SHELTER_BPS (default 0) queues that share of an approved ad's
 * price for Pink Paw as an ordinary shelter-share keeper row (memo `tt:ravead:<16 hex>`), the payout path of
 * the rave checkout, so those dollars also become cats. Test payments never queue against a mainnet keeper.
 *
 * Images are stored PRIVATE at checkout and copied to a public CDN key only when an admin approves the ad
 * (admins preview them through GET /rave/ads/admin/:adId/image). Both copies are deleted once the ad is
 * canceled, rejected, refunded or ended, and an hour after an unpaid hold expired (a payment racing the
 * expiry can still re-take the slot). One client IP can hold at most RAVE_AD_HOLDS_PER_IP unpaid slots at
 * once (more for the shared bucket of unproven addresses, known issue KI-07).
 */

export const RAVE_AD_ID_RE = /^ad_[0-9a-f]{16}$/;
const CLIENT_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
export const RAVE_AD_LIST_CACHE_MS = 15 * 1000;
const STRIPE_POLL_MS = 5 * 1000;
/** Active unpaid holds one client-IP bucket may have at once. */
export const RAVE_AD_HOLDS_PER_IP = 2;
/** The same for the shared bucket of requests with no usable client address. */
export const RAVE_AD_HOLDS_SHARED = 10;
/** An expired hold keeps its private image this long: a payment racing the expiry can re-take the slot. */
export const RAVE_AD_IMAGE_GRACE_MS = 60 * 60 * 1000;
const IMAGE_DROP_STATUSES: RaveAdStatus[] = ['canceled', 'ended', 'rejected', 'refunded', 'expired'];
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
/** Least time between two receipt reads of one reported USDC ad from GET /rave/ads/:adId. */
export const RAVE_AD_USDC_POLL_MS = 10 * 1000;
/** A reported tx with no receipt after this long is dropped, so the buyer can report the right one. */
export const RAVE_AD_USDC_GIVE_UP_MS = 30 * 60 * 1000;
/** A paying transfer may be mined at most this long before the ad was created (clock skew). */
const RAVE_AD_USDC_SKEW_S = 5 * 60;
/** A reported tx keeps a held ad's slot at least this long (the transfer may still be mining). */
export const RAVE_AD_USDC_REPORT_HOLD_MS = 10 * 60 * 1000;
/** An unpaid USDC ad's amount tag is freed this long after its hold ended (as RESERVATION_GRACE_MS). */
export const RAVE_AD_USDC_TAG_GRACE_MS = 24 * 60 * 60 * 1000;
/** Tries to find a free amount tag before giving up (9,999 tags per chain and token). */
const RAVE_AD_TAG_TRIES = 8;

export const raveAdMemo = (adId: string) => `tt:ravead:${adId.slice(3)}`;

/** `chain`: no Arc USDC treasury on the checkout network (the crypto tab only). */
export type RaveAdsOffReason = 'stripe' | 'mode' | 'keeper' | 'chain';

export interface RaveAdsSlotState {
    slotId: string;
    kind: RaveAdSlotKind;
    free: boolean;
    /** When a held (not yet paid) slot frees up again, if it does. */
    heldUntil?: string;
}

export interface RaveAdsStatus {
    enabled: boolean;
    reason?: RaveAdsOffReason;
    livemode?: boolean;
    /** Only while the card tab is open. */
    publishableKey?: string;
    card?: boolean;
    /** Why the card tab is closed while crypto is open. */
    cardReason?: RaveAdsOffReason;
    /** Why each closed tab is closed (`card` repeats cardReason). */
    reasons?: { card?: RaveAdsOffReason; usdc?: RaveAdsOffReason };
    /** Crypto: USDC on Arc only (`chains` is `[5042]` on mainnet, `[5042002]` on testnet). */
    usdc?: { enabled: boolean; chains: number[] };
    priceCents?: number;
    fee?: { percentBps: number; fixedCents: number };
    holdMinutes?: number;
    days?: number;
    shelterBps?: number;
    slots?: RaveAdsSlotState[];
}

export interface RaveAdCheckoutBody {
    slotId?: unknown;
    name?: unknown;
    url?: unknown;
    x?: unknown;
    coverFee?: unknown;
    /** `card` (default) or `usdc`. */
    method?: unknown;
    clientKey?: unknown;
}

export interface RavePublicAd {
    adId: string;
    slotId: string;
    name: string;
    url: string;
    x?: string;
    imageUrl: string;
    liveUntil: string;
}

export interface RaveAdBuyerView {
    adId: string;
    slotId: string;
    status: RaveAdStatus;
    name: string;
    url: string;
    x: string | null;
    imageUrl: string | null;
    priceCents: number;
    feeCents: number;
    amountCents: number;
    holdUntil: string | null;
    liveUntil: string | null;
    method: RaveAdMethod;
    /** USDC ads: what to send (exact `amount` base units of `token` to `recipient` on `chainId`) and the tx. */
    usdc: RaveAdUsdcView | null;
    /** Set once a refund is due, done, failed, or (USDC) to be sent by hand. */
    refund: { state: RaveAdRefund['state']; reason: string } | null;
}

export interface RaveAdUsdcView {
    chainId: number;
    token: string;
    decimals: number;
    recipient: string;
    amount: string;
    txHash: string | null;
    payer: string | null;
}

export interface RaveAdCheckoutResponse extends RaveAdBuyerView {
    clientSecret: string | null;
}

export type RaveAdPaidOutcome = 'ignored' | 'not-succeeded' | 'mismatch' | 'already' | 'review' | 'slot-lost';

export interface RaveAdsIo {
    /** Stores the sanitized WebP privately (`ACL: private`, no public URL). */
    storePrivate(key: string, data: Buffer): Promise<void>;
    /** Copies a private image to a public key and returns its https CDN URL. */
    publish(privateKey: string, publicKey: string): Promise<string>;
    /** Reads a private image back (admin preview). */
    readPrivate(key: string): Promise<Buffer>;
    remove(key: string): Promise<void>;
}

function storageCdn(): string {
    const cdn = (process.env.DO_SPACES_CDN || '').trim();
    if (process.env.JEST_WORKER_ID || !cdn || !process.env.DO_SPACES_NAME) {
        throw new Error('image storage is not configured');
    }
    return cdn.replace(/\/+$/, '');
}

/** Same bucket and CDN as the other image uploads. Refused under Jest and without storage config. */
export const defaultRaveAdsIo: RaveAdsIo = {
    async storePrivate(key, data) {
        storageCdn();
        await uploadPrivateObject(key, data, 'image/webp');
    },
    async publish(privateKey, publicKey) {
        const cdn = storageCdn();
        const { data } = await getPrivateObject(privateKey);
        await uploadFile(publicKey, data, 'webp');
        return `${cdn}/${publicKey}`;
    },
    async readPrivate(key) {
        storageCdn();
        return (await getPrivateObject(key)).data;
    },
    async remove(key) {
        storageCdn();
        await deleteObject(key);
    },
};

/** sha256 of the client-IP bucket: the address itself is never stored. */
export const raveAdHoldKey = (bucket: string) => createHash('sha256').update(`rave-ad-hold:${bucket}`).digest('hex');

const iso = (d: Date | string | undefined | null) => (d ? new Date(d).toISOString() : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

@Injectable()
export class RaveAdsService {
    private readonly logger = new Logger(RaveAdsService.name);
    /** Read on every call; tests replace it. Never logged or returned. */
    env: NodeJS.ProcessEnv = process.env;
    io: RaveAdsIo = defaultRaveAdsIo;
    private listCache: { at: number; value: { asOf: string; ads: RavePublicAd[] } } | null = null;
    private readonly lastStripePoll = new Map<string, number>();
    private readonly lastUsdcPoll = new Map<string, number>();

    constructor(
        @InjectModel(RaveAd.name) private ads: Model<RaveAdDocument>,
        @InjectModel(CryptoCheckout.name) private checkouts: Model<CryptoCheckoutDocument>,
        private stripePayments: StripePaymentService,
        @Optional() private shares?: CryptoShelterShareService,
        @Optional() private reader?: CryptoChainReader
    ) {}

    private get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    // ------------------------------------------------------------------ status

    /** Why the CARD tab is closed, or null. No webhook secret needed (the Events API pull confirms payments). */
    readiness(cfg: RaveAdsConfig = readRaveAdsConfig(this.env)): RaveAdsOffReason | null {
        if (!cfg.secretKeyMode || !cfg.publishableKeyMode || raveStripeBroken(cfg.publishableKey)) return 'stripe';
        if (cfg.publishableKeyMode !== cfg.secretKeyMode) return 'mode';
        const live = cfg.secretKeyMode === 'live';
        if (live && !cfg.production) return 'mode';
        return this.shareReason(cfg, live);
    }

    /** Why the CRYPTO tab (USDC on Arc) is closed, or null, with its payment target. Needs no Stripe. */
    usdcReadiness(cfg: RaveAdsConfig = readRaveAdsConfig(this.env)): {
        reason: RaveAdsOffReason | null;
        target: RaveAdUsdcTarget | null;
    } {
        const target = raveAdUsdcTarget(this.env, cfg.production);
        if (!target) return { reason: 'chain', target: null };
        const reason = this.shareReason(cfg, !target.testnet);
        return { reason, target: reason ? null : target };
    }

    /** A shelter share (RAVE_AD_SHELTER_BPS > 0) needs the keeper on the payment's network class. */
    private shareReason(cfg: RaveAdsConfig, live: boolean): RaveAdsOffReason | null {
        if (cfg.shelterBps <= 0) return null;
        const shelter = readShelterConfig(this.env);
        if (!shelter.rpcUrl || !shelter.splitAddress || !hotWalletAddress(shelter)) return 'keeper';
        if (live === isTestnetChain(shelter.chainId)) return 'mode';
        // The keeper has no flag; it runs only when its chain matches the checkout network (main, Oct 14).
        if (!shelterShareNetworkOk(shelter, readCryptoPayConfig(this.env), this.env)) return 'keeper';
        return null;
    }

    /** 503 while neither the card nor the crypto tab is open (no on/off flag). */
    assertOpen(cfg: RaveAdsConfig = readRaveAdsConfig(this.env)) {
        const card = this.readiness(cfg);
        if (card && this.usdcReadiness(cfg).reason) throw RAVE_AD_ERRORS.off(card);
    }

    async status(now: Date = new Date()): Promise<RaveAdsStatus> {
        const cfg = readRaveAdsConfig(this.env);
        await checkRaveStripeAccount(this.stripePayments, cfg, now);
        const reason = this.readiness(cfg);
        const usdc = this.usdcReadiness(cfg);
        if (reason && usdc.reason) return { enabled: false, reason };
        await this.sweep(now);
        const taken: any[] = await this.ads
            .find({ slotLock: { $exists: true } }, { slotLock: 1, status: 1, holdUntil: 1 })
            .limit(100)
            .lean();
        const bySlot = new Map(taken.map(t => [String(t.slotLock), t]));
        return {
            enabled: true,
            livemode: !reason ? cfg.secretKeyMode === 'live' : !usdc.target!.testnet,
            ...(!reason ? { publishableKey: cfg.publishableKey! } : { cardReason: reason }),
            card: !reason,
            reasons: { ...(reason ? { card: reason } : {}), ...(usdc.reason ? { usdc: usdc.reason } : {}) },
            usdc: { enabled: !!usdc.target, chains: usdc.target ? [usdc.target.chainId] : [] },
            priceCents: cfg.priceCents,
            fee: { percentBps: cfg.feePercentBps, fixedCents: cfg.feeFixedCents },
            holdMinutes: Math.round(cfg.holdMs / 60000),
            days: cfg.days,
            shelterBps: cfg.shelterBps,
            slots: RAVE_AD_SLOTS.map(s => {
                const t = bySlot.get(s.id);
                return {
                    slotId: s.id,
                    kind: s.kind,
                    free: !t,
                    ...(t?.status === 'held' && t.holdUntil ? { heldUntil: iso(t.holdUntil)! } : {}),
                };
            }),
        };
    }

    /**
     * Frees slots whose hold ran out unpaid (and cancels their PaymentIntent, best effort) and ends ads
     * whose run is over. Each release is a guarded single-document write, so a payment that lands at the
     * same moment either keeps the slot (markPaid won) or finds the ad `expired` and re-locks or refunds.
     */
    async sweep(now: Date = new Date()) {
        const stale: any[] = await this.ads
            .find({ status: 'held', holdUntil: { $lte: now } }, { adId: 1, paymentIntentId: 1 })
            .limit(200)
            .lean();
        for (const ad of stale) {
            const released: any = await this.ads
                .findOneAndUpdate(
                    { adId: ad.adId, status: 'held', holdUntil: { $lte: now } },
                    { $set: { status: 'expired' }, $unset: { slotLock: 1 } },
                    { new: true }
                )
                .lean();
            if (released && released.paymentIntentId) {
                await this.stripe.paymentIntents.cancel(released.paymentIntentId).catch(() => undefined);
            }
        }
        const ended: any = await this.ads.updateMany(
            { status: 'live', liveUntil: { $lte: now } },
            { $set: { status: 'ended' }, $unset: { slotLock: 1 } }
        );
        if (stale.length || ended?.modifiedCount) this.listCache = null;
        // Unpaid USDC holds give their amount tag back a day after they ended (9,999 tags per price).
        await this.ads.updateMany(
            {
                method: 'usdc',
                status: { $in: ['expired', 'canceled'] },
                usdcAmountKey: { $exists: true },
                usdcTxHash: { $exists: false },
                updatedAt: { $lte: new Date(now.getTime() - RAVE_AD_USDC_TAG_GRACE_MS) },
            },
            { $unset: { usdcAmountKey: 1 } }
        );
        await this.dropClosedImages(now).catch(error =>
            this.logger.warn(`rave ad image cleanup: ${(error as Error)?.message}`)
        );
    }

    /** Deletes the stored images of ads that will never show again (expired holds after a grace period). */
    private async dropClosedImages(now: Date) {
        const rows: any[] = await this.ads
            .find(
                {
                    status: { $in: IMAGE_DROP_STATUSES },
                    $or: [{ imageKey: { $exists: true } }, { imagePublicKey: { $exists: true } }],
                },
                { adId: 1, status: 1, holdUntil: 1 }
            )
            .limit(50)
            .lean();
        for (const ad of rows) {
            if (
                ad.status === 'expired' &&
                ad.holdUntil &&
                now.getTime() - new Date(ad.holdUntil).getTime() < RAVE_AD_IMAGE_GRACE_MS
            ) {
                continue;
            }
            await this.dropImages(ad.adId, ad.status);
        }
    }

    /** Removes an ad's stored images (best effort) while it is still in `status`; it never shows again. */
    private async dropImages(adId: string, status: RaveAdStatus) {
        const ad: any = await this.ads
            .findOneAndUpdate(
                { adId, status },
                { $unset: { imageKey: 1, imagePublicKey: 1, imageUrl: 1 } },
                { new: false }
            )
            .lean();
        if (!ad) return;
        for (const key of [ad.imageKey, ad.imagePublicKey]) {
            if (!key) continue;
            await this.io
                .remove(key)
                .catch(error => this.logger.warn(`rave ad ${adId}: ${key} not deleted: ${(error as Error)?.message}`));
        }
        this.listCache = null;
    }

    // ------------------------------------------------------------------ checkout

    async checkout(
        body: RaveAdCheckoutBody,
        file: { buffer?: Buffer; mimetype?: string } | undefined,
        now: Date = new Date(),
        ipBucket?: string
    ): Promise<RaveAdCheckoutResponse> {
        const cfg = readRaveAdsConfig(this.env);
        await checkRaveStripeAccount(this.stripePayments, cfg, now);
        this.assertOpen(cfg);
        if (!body || typeof body !== 'object') throw RAVE_AD_ERRORS.invalid('Expected a form body');
        const methodRaw = body.method === undefined || body.method === '' ? 'card' : body.method;
        if (methodRaw !== 'card' && methodRaw !== 'usdc') throw RAVE_AD_ERRORS.method();
        const method: RaveAdMethod = methodRaw as RaveAdMethod;
        // Each tab on its own: crypto needs no Stripe, card needs no Arc treasury.
        let target: RaveAdUsdcTarget | null = null;
        if (method === 'card') {
            const reason = this.readiness(cfg);
            if (reason) throw RAVE_AD_ERRORS.off(reason);
        } else {
            const usdc = this.usdcReadiness(cfg);
            if (usdc.reason || !usdc.target) throw RAVE_AD_ERRORS.off(usdc.reason || 'chain');
            target = usdc.target;
        }
        const slot = raveAdSlot(body.slotId);
        if (!slot) throw RAVE_AD_ERRORS.slot();
        const name = normalizeAdName(body.name);
        if (!name.ok) throw RAVE_AD_ERRORS.name(name.code);
        const url = normalizeAdUrl(body.url);
        if (!url.ok) throw RAVE_AD_ERRORS.url(url.code);
        const x = normalizeXHandle(str(body.x).trim());
        if (!x.ok) throw RAVE_AD_ERRORS.xHandle(x.code);
        // Multipart fields are text: 'true' / 'false'; JSON callers may send booleans.
        const coverRaw = body.coverFee;
        if (coverRaw !== undefined && ![true, false, 'true', 'false'].includes(coverRaw as any)) {
            throw RAVE_AD_ERRORS.invalid('coverFee must be true or false');
        }
        // No card fee on crypto.
        const coverFee = method === 'card' && coverRaw !== false && coverRaw !== 'false';
        let clientKey: string | undefined;
        if (body.clientKey !== undefined && body.clientKey !== null && body.clientKey !== '') {
            if (typeof body.clientKey !== 'string' || !CLIENT_KEY_RE.test(body.clientKey)) {
                throw RAVE_AD_ERRORS.invalid('clientKey must be a UUID');
            }
            clientKey = body.clientKey;
        }
        const upload = file?.buffer;
        const requestHash = createHash('sha256')
            .update(
                JSON.stringify({
                    slot: slot.id,
                    name: name.name,
                    url: url.url,
                    x: x.handle || '',
                    coverFee,
                    ...(method === 'usdc' ? { method } : {}),
                    image: upload ? createHash('sha256').update(upload).digest('hex') : '',
                })
            )
            .digest('hex');
        if (clientKey) {
            const existing: any = await this.ads.findOne({ clientKey }).lean();
            if (existing) return this.repeatCheckout(existing, requestHash, now);
        }

        let image;
        try {
            image = await sanitizeAdImage(upload, slot);
        } catch (error) {
            if (error instanceof AdImageError) throw RAVE_AD_ERRORS.image(error.code);
            throw error;
        }

        await this.sweep(now);
        const holdIpHash = ipBucket ? raveAdHoldKey(ipBucket) : undefined;
        if (holdIpHash) {
            const shared = ipBucket === UNKNOWN_CLIENT_IP_BUCKET;
            const active = await this.ads
                .countDocuments({ status: 'held', holdUntil: { $gt: now }, holdIpHash })
                .exec();
            if (active >= (shared ? RAVE_AD_HOLDS_SHARED : RAVE_AD_HOLDS_PER_IP)) throw RAVE_AD_ERRORS.tooManyHolds();
        }
        const quote = raveAdQuote(coverFee, cfg);
        const adId = `ad_${randomBytes(8).toString('hex')}`;
        const doc: Partial<RaveAd> = {
            adId,
            ...(clientKey ? { clientKey } : {}),
            requestHash,
            slotId: slot.id,
            slotLock: slot.id,
            status: 'held',
            name: name.name,
            url: url.url,
            ...(x.handle ? { xHandle: x.handle } : {}),
            imageSha256: image.sha256,
            priceCents: quote.priceCents,
            feeCents: quote.feeCents,
            amountCents: quote.amountCents,
            coverFee,
            method,
            holdUntil: new Date(now.getTime() + cfg.holdMs),
            ...(holdIpHash ? { holdIpHash } : {}),
        };
        try {
            await this.ads.create(doc as any);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            if (clientKey) {
                const existing: any = await this.ads.findOne({ clientKey }).lean();
                if (existing) return this.repeatCheckout(existing, requestHash, now);
            }
            throw RAVE_AD_ERRORS.slotTaken();
        }

        const release = async () => {
            await this.ads.updateOne(
                { adId, status: 'held', paymentIntentId: { $exists: false } },
                { $set: { status: 'canceled' }, $unset: { slotLock: 1 } }
            );
            await this.dropImages(adId, 'canceled');
        };
        // Private until an admin approves the ad: nothing reaches the public CDN before payment and review.
        const key = `rave-ads/private/${adId}-${image.sha256.slice(0, 12)}.webp`;
        try {
            await this.io.storePrivate(key, image.data);
        } catch (error) {
            this.logger.warn(`rave ad ${adId}: image not stored: ${(error as Error)?.message}`);
            await release();
            throw RAVE_AD_ERRORS.storage();
        }
        await this.ads.updateOne({ adId }, { $set: { imageKey: key } });

        if (method === 'usdc') {
            if (!(await this.assignUsdcAmount(adId, target!, quote.priceCents))) {
                await release();
                throw RAVE_AD_ERRORS.state('Crypto checkout is busy, try again');
            }
            const ad: any = await this.ads.findOne({ adId }).lean();
            return { ...this.buyerView(ad), clientSecret: null };
        }

        let intent: Stripe.PaymentIntent;
        try {
            intent = await this.createIntent({ ...doc, adId });
        } catch (error) {
            this.logger.warn(`rave ad ${adId}: PaymentIntent not created: ${(error as Error)?.message}`);
            noteRaveStripeError(error, now);
            await release();
            throw RAVE_AD_ERRORS.stripe();
        }
        const ad: any = await this.ads.findOne({ adId }).lean();
        return { ...this.buyerView(ad), clientSecret: intent.client_secret };
    }

    /** Writes a free exact amount (price + unique tag) on a held USDC ad; false when no tag was free. */
    private async assignUsdcAmount(adId: string, target: RaveAdUsdcTarget, priceCents: number): Promise<boolean> {
        for (let i = 0; i < RAVE_AD_TAG_TRIES; i++) {
            const amount = raveAdUsdcAmount(priceCents, target.decimals);
            const usdc: RaveAdUsdc = {
                chainId: target.chainId,
                token: target.token,
                decimals: target.decimals,
                recipient: target.recipient,
                amount: amount.toString(),
            };
            try {
                await this.ads.updateOne(
                    { adId, usdcAmountKey: { $exists: false } },
                    { $set: { usdc, usdcAmountKey: raveAdAmountKey(target, amount) } }
                );
                return true;
            } catch (error) {
                if (!isDuplicateKeyError(error)) throw error;
            }
        }
        this.logger.error(`rave ad ${adId}: no free USDC amount tag after ${RAVE_AD_TAG_TRIES} tries`);
        return false;
    }

    /** Server-priced PaymentIntent. Metadata carries no name, link or handle, so /web3 never grants anything for it. */
    private async createIntent(ad: Partial<RaveAd> & { adId: string }): Promise<Stripe.PaymentIntent> {
        const intent = await this.stripe.paymentIntents.create(
            {
                amount: ad.amountCents!,
                currency: 'usd',
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                description: `Moon Rave ad slot ${ad.slotId}`,
                statement_descriptor_suffix: 'MOON RAVE AD',
                metadata: {
                    raveAd: '1',
                    adId: ad.adId,
                    slotId: String(ad.slotId),
                    priceCents: String(ad.priceCents),
                    feeCents: String(ad.feeCents),
                },
            },
            { idempotencyKey: `ravead:${ad.adId}` }
        );
        await this.ads.updateOne(
            { adId: ad.adId, paymentIntentId: { $exists: false } },
            { $set: { paymentIntentId: intent.id, livemode: intent.livemode } }
        );
        return intent;
    }

    private async repeatCheckout(ad: any, requestHash: string, now: Date): Promise<RaveAdCheckoutResponse> {
        if (ad.requestHash !== requestHash) {
            // The same buyer changed something (method, name, image) after a hold: free their own unpaid
            // hold so the retry with a new key can take the slot again.
            await this.releaseOwnHold(ad);
            throw RAVE_AD_ERRORS.keyReused();
        }
        let secret: string | null = null;
        if (ad.method !== 'usdc' && ad.status === 'held' && ad.holdUntil && new Date(ad.holdUntil) > now) {
            if (!ad.paymentIntentId) throw RAVE_AD_ERRORS.state('This checkout is still starting, try again');
            const intent = await this.stripe.paymentIntents.retrieve(ad.paymentIntentId).catch(() => {
                throw RAVE_AD_ERRORS.stripe();
            });
            secret = intent.client_secret;
        }
        return { ...this.buyerView(ad), clientSecret: secret };
    }

    /**
     * Frees a held, unpaid ad of the buyer who holds its client key. A card hold frees only once its
     * PaymentIntent is canceled (Stripe refuses that for a succeeded or processing one); a USDC hold only
     * while no tx was reported.
     */
    private async releaseOwnHold(ad: any) {
        if (ad.status !== 'held') return;
        if (ad.method === 'usdc') {
            if (ad.usdcTxHash) return;
        } else if (ad.paymentIntentId) {
            try {
                const intent = await this.stripe.paymentIntents.cancel(ad.paymentIntentId);
                if (intent?.status !== 'canceled') return;
            } catch {
                return;
            }
        }
        const res: any = await this.ads.updateOne(
            { adId: ad.adId, status: 'held', usdcTxHash: { $exists: false } },
            { $set: { status: 'canceled' }, $unset: { slotLock: 1, holdUntil: 1 } }
        );
        if (res?.modifiedCount) {
            this.listCache = null;
            await this.dropImages(ad.adId, 'canceled');
        }
    }

    // ------------------------------------------------------------------ paid

    /**
     * payment_intent.succeeded (webhook, or the buyer's GET fallback). The one transition `held → review`
     * is atomic; a payment for an ad whose hold already lapsed re-takes the slot if it is still free, else
     * it is refunded at once (`slot-lost`). Idempotent on the PaymentIntent id.
     */
    async markPaid(intent: Stripe.PaymentIntent, now: Date = new Date()): Promise<RaveAdPaidOutcome> {
        const md = intent?.metadata || {};
        if (md.raveAd !== '1' || !RAVE_AD_ID_RE.test(String(md.adId || ''))) return 'ignored';
        if (intent.status !== 'succeeded') return 'not-succeeded';
        const adId = String(md.adId);
        const ad: any = await this.ads.findOne({ adId }).lean();
        if (
            !ad ||
            intent.currency !== 'usd' ||
            (ad.paymentIntentId && ad.paymentIntentId !== intent.id) ||
            intent.amount_received !== ad.amountCents
        ) {
            this.logger.error(`rave ad ${adId}: paid intent ${intent.id} does not match its ad: check by hand`);
            return 'mismatch';
        }
        const paid = { paidAt: now, paymentIntentId: intent.id, livemode: intent.livemode };
        const won = await this.ads
            .findOneAndUpdate(
                { adId, status: 'held' },
                { $set: { status: 'review', ...paid }, $unset: { holdUntil: 1 } },
                { new: true }
            )
            .lean();
        this.listCache = null;
        if (won) return 'review';
        if (!['expired', 'canceled'].includes(ad.status)) return 'already';
        // Paid after the hold lapsed: take the slot back if nobody else has it.
        try {
            const res: any = await this.ads.updateOne(
                { adId, status: { $in: ['expired', 'canceled'] }, slotLock: { $exists: false } },
                { $set: { status: 'review', slotLock: ad.slotId, ...paid } }
            );
            if (res?.modifiedCount || res?.matchedCount) return 'review';
            return 'already';
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        await this.ads.updateOne(
            { adId, status: { $in: ['expired', 'canceled'] } },
            {
                $set: {
                    status: 'refunded',
                    ...paid,
                    refund: { state: 'due', reason: 'slot-lost', at: now },
                },
            }
        );
        await this.refund(adId, intent.id, 'slot-lost');
        return 'slot-lost';
    }

    // ------------------------------------------------------------------ USDC on Arc

    /**
     * POST /rave/ads/:adId/usdc-tx: the buyer's wallet sent the exact amount; record the tx (unique) and
     * read its receipt. Works while the crypto tab reports closed, so a payment already sent is never lost.
     */
    async reportUsdcTx(adId: string, body: { txHash?: unknown }, now: Date = new Date()): Promise<RaveAdBuyerView> {
        if (!RAVE_AD_ID_RE.test(String(adId || ''))) throw RAVE_AD_ERRORS.adNotFound();
        const txHash = typeof body?.txHash === 'string' ? body.txHash.toLowerCase() : '';
        if (!TX_HASH_RE.test(txHash)) throw RAVE_AD_ERRORS.invalid('Expected { txHash }');
        const ad: any = await this.ads.findOne({ adId }).lean();
        if (!ad || ad.method !== 'usdc' || !ad.usdc) throw RAVE_AD_ERRORS.adNotFound();
        if (ad.usdcTxHash && ad.usdcTxHash !== txHash) {
            throw RAVE_AD_ERRORS.state('This ad already has a transaction');
        }
        if (!ad.usdcTxHash) {
            if (!['held', 'expired'].includes(ad.status)) throw RAVE_AD_ERRORS.state('This ad is closed');
            // A day after the hold ended its amount tag went back to the pool: match it by hand.
            if (!ad.usdcAmountKey) throw RAVE_AD_ERRORS.state('This checkout ran out; contact support');
            const write = () =>
                this.ads.updateOne(
                    { adId, usdcTxHash: { $exists: false } },
                    {
                        $set: {
                            usdcTxHash: txHash,
                            usdc: { ...ad.usdc, txHash, reportedAt: now },
                            // The transfer may still be mining: keep the slot a little longer.
                            ...(ad.status === 'held'
                                ? {
                                      holdUntil: new Date(
                                          Math.max(
                                              new Date(ad.holdUntil || 0).getTime(),
                                              now.getTime() + RAVE_AD_USDC_REPORT_HOLD_MS
                                          )
                                      ),
                                  }
                                : {}),
                        },
                    }
                );
            try {
                await write();
            } catch (error) {
                if (!isDuplicateKeyError(error)) throw error;
                // Another ad holds this hash. If its own check fails (someone reported a tx that was not
                // theirs), that ad drops the hash and this report takes it.
                const other: any = await this.ads.findOne({ usdcTxHash: txHash }).lean();
                const outcome = other && other.adId !== adId ? await this.verifyUsdc(other, now) : 'already';
                if (!['mismatch', 'underpaid', 'too-old', 'dropped'].includes(String(outcome))) {
                    throw RAVE_AD_ERRORS.txUsed();
                }
                try {
                    await write();
                } catch (again) {
                    if (isDuplicateKeyError(again)) throw RAVE_AD_ERRORS.txUsed();
                    throw again;
                }
            }
        }
        const fresh: any = await this.ads.findOne({ adId }).lean();
        this.lastUsdcPoll.set(adId, now.getTime());
        const outcome = await this.verifyUsdc(fresh, now);
        if (outcome === 'mismatch') {
            throw RAVE_AD_ERRORS.txMismatch('That transaction did not send this ad’s exact USDC amount to Token Tails');
        }
        if (outcome === 'underpaid') {
            throw RAVE_AD_ERRORS.txMismatch(
                'That transfer paid less than the exact amount (an exchange fee?). Contact support for a refund.'
            );
        }
        if (outcome === 'too-old') {
            throw RAVE_AD_ERRORS.txMismatch('That transfer was sent before this ad was made');
        }
        if (outcome === 'tx-used') {
            throw RAVE_AD_ERRORS.txMismatch('That transaction already paid for another Token Tails order');
        }
        return this.buyerView(await this.ads.findOne({ adId }).lean());
    }

    /** The RPC URL of a USDC ad's chain (the crypto checkout's, else the chain's public RPC). */
    private usdcRpc(chainId: number): string | null {
        const pay = readCryptoPayConfig(this.env);
        const resolved = pay.chains.find(c => c.chain.chainId === chainId);
        return resolved?.rpcUrl || cryptoPayChain(chainId)?.publicRpc || null;
    }

    /**
     * Read-only receipt check of a reported USDC tx: a `Transfer` of exactly the ad's amount of its token to
     * its treasury, mined after the ad was made. A wrong or failed tx is dropped so the buyer can report the
     * right one; a tx with no receipt after RAVE_AD_USDC_GIVE_UP_MS too.
     */
    async verifyUsdc(
        ad: any,
        now: Date
    ): Promise<RaveAdPaidOutcome | 'pending' | 'mismatch' | 'underpaid' | 'too-old' | 'tx-used' | 'dropped'> {
        if (!ad?.usdcTxHash || !ad.usdc) return 'pending';
        if (!['held', 'expired', 'canceled'].includes(ad.status)) return 'already';
        const chainId = Number(ad.usdc.chainId);
        const rpc = this.usdcRpc(chainId);
        if (!this.reader || !rpc) return 'pending';
        let receipt: Awaited<ReturnType<CryptoChainReader['receipt']>> = null;
        try {
            receipt = await this.reader.receipt(chainId, rpc, ad.usdcTxHash);
        } catch {
            receipt = null;
        }
        const drop = async () => {
            await this.ads.updateOne(
                { adId: ad.adId, usdcTxHash: ad.usdcTxHash, status: { $in: ['held', 'expired', 'canceled'] } },
                { $unset: { usdcTxHash: 1, 'usdc.txHash': 1, 'usdc.reportedAt': 1 } }
            );
        };
        if (!receipt) {
            const reported = ad.usdc.reportedAt ? new Date(ad.usdc.reportedAt).getTime() : now.getTime();
            if (now.getTime() - reported > RAVE_AD_USDC_GIVE_UP_MS) {
                await drop();
                return 'dropped';
            }
            return 'pending';
        }
        const check =
            receipt.status === 1
                ? checkPayment(receipt.logs || [], {
                      route: 'transfer',
                      binding: 'amount',
                      tokenAddress: ad.usdc.token,
                      recipient: ad.usdc.recipient,
                      amount: String(ad.usdc.amount),
                      memo: null,
                  })
                : { ok: false as const, reason: 'NO_MATCHING_TRANSFER' as const };
        if (!check.ok) {
            await drop();
            if (check.reason === 'UNDERPAID') {
                this.logger.error(
                    `rave ad ${ad.adId}: tx ${ad.usdcTxHash} paid ${String(check.paid)} of ${
                        ad.usdc.amount
                    } USDC base units to the treasury; refund it by hand`
                );
                await this.ads.updateOne(
                    { adId: ad.adId },
                    { $set: { 'usdc.underpaidTx': ad.usdcTxHash, 'usdc.underpaidAmount': String(check.paid) } }
                );
                return 'underpaid';
            }
            return 'mismatch';
        }
        const created = ad.createdAt ? Math.floor(new Date(ad.createdAt).getTime() / 1000) : null;
        if (created !== null) {
            const mined = await this.reader.blockTime(chainId, rpc, receipt.blockNumber).catch(() => null);
            // Unknown block time (RPC error): never accept an old transfer on trust; read it again later.
            if (mined === null || !Number.isFinite(mined)) return 'pending';
            if (mined < created - RAVE_AD_USDC_SKEW_S) {
                await drop();
                return 'too-old';
            }
        }
        // One transfer pays one thing: refuse a tx that already backs a crypto checkout (packs, cats).
        if (await this.checkouts.findOne({ 'payment.txHash': String(ad.usdcTxHash).toLowerCase() }).lean()) {
            await drop();
            this.logger.error(`rave ad ${ad.adId}: tx ${ad.usdcTxHash} already paid a crypto checkout`);
            return 'tx-used';
        }
        return this.markUsdcPaid(ad, check.payer || receipt.from || '', now);
    }

    /** The USDC counterpart of markPaid: `held → review`, or re-take a lapsed slot, or a manual refund. */
    private async markUsdcPaid(ad: any, payer: string, now: Date): Promise<RaveAdPaidOutcome> {
        const adId = ad.adId;
        const paid = {
            paidAt: now,
            livemode: !isTestnetChain(Number(ad.usdc.chainId)),
            usdc: { ...ad.usdc, txHash: ad.usdcTxHash, payer: payer.toLowerCase(), paidAt: now },
        };
        const won = await this.ads
            .findOneAndUpdate(
                { adId, status: 'held', usdcTxHash: ad.usdcTxHash },
                { $set: { status: 'review', ...paid }, $unset: { holdUntil: 1 } },
                { new: true }
            )
            .lean();
        this.listCache = null;
        if (won) return 'review';
        const current: any = await this.ads.findOne({ adId }).lean();
        if (!current || !['expired', 'canceled'].includes(current.status)) return 'already';
        try {
            const res: any = await this.ads.updateOne(
                {
                    adId,
                    status: { $in: ['expired', 'canceled'] },
                    usdcTxHash: ad.usdcTxHash,
                    slotLock: { $exists: false },
                },
                { $set: { status: 'review', slotLock: ad.slotId, ...paid } }
            );
            if (res?.modifiedCount || res?.matchedCount) return 'review';
            return 'already';
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        await this.ads.updateOne(
            { adId, status: { $in: ['expired', 'canceled'] } },
            {
                $set: {
                    status: 'refunded',
                    ...paid,
                    refund: { state: 'manual', reason: 'slot-lost', payer: payer.toLowerCase(), at: now },
                },
            }
        );
        this.logger.error(
            `rave ad ${adId}: USDC paid after its slot was taken; refund ${ad.usdc.amount} base units by hand to ${payer}`
        );
        return 'slot-lost';
    }

    async markCanceled(intent: Stripe.PaymentIntent): Promise<string> {
        if (intent?.metadata?.raveAd !== '1') return 'ignored';
        await this.ads.updateOne(
            { adId: intent.metadata.adId, paymentIntentId: intent.id, status: 'held' },
            { $set: { status: 'canceled' }, $unset: { slotLock: 1, holdUntil: 1 } }
        );
        await this.dropImages(intent.metadata.adId, 'canceled');
        this.listCache = null;
        return 'canceled';
    }

    /** A refund or dispute from Stripe (not our own reject refund): the ad comes down, its slot frees. */
    async reverse(
        paymentIntentId: string,
        kind: 'refunded' | 'disputed',
        full: boolean,
        refundedCents?: number
    ): Promise<string> {
        if (!paymentIntentId) return 'ignored';
        const ad: any = await this.ads.findOne({ paymentIntentId }).lean();
        if (!ad) return 'ignored';
        if (['rejected', 'refunded'].includes(ad.status)) return 'already';
        const refunded =
            typeof refundedCents === 'number' && Number.isSafeInteger(refundedCents) && refundedCents > 0
                ? refundedCents
                : null;
        if (refunded !== null) {
            await this.ads.updateOne(
                { adId: ad.adId, $or: [{ refundedCents: { $exists: false } }, { refundedCents: { $lt: refunded } }] },
                { $set: { refundedCents: refunded } }
            );
        }
        const kept = refunded === null ? ad.priceCents : Math.max(0, ad.amountCents - refunded - (ad.feeCents || 0));
        if (!full && !(refunded !== null && (refunded >= ad.amountCents || kept <= 0))) {
            // A partial refund keeps the ad up; a waiting shelter share shrinks in proportion.
            if (refunded !== null && ad.shelterCents > 0) {
                const keep = Math.floor((ad.shelterCents * Math.min(kept, ad.priceCents)) / ad.priceCents);
                if (!(await shrinkShare(this.checkouts, ad.adId, paymentIntentId, keep))) {
                    this.logger.error(`rave ad ${ad.adId}: partial refund after its shelter share left, check by hand`);
                }
            }
            this.logger.warn(`rave ad ${ad.adId}: partial refund (${refunded ?? '?'} cents), ad unchanged`);
            return 'partial';
        }
        await this.ads.updateOne(
            { adId: ad.adId, status: { $in: ['held', 'review', 'live', 'ended', 'expired', 'canceled'] } },
            {
                $set: { status: 'refunded', refund: { state: 'refunded', reason: kind, at: new Date() } },
                $unset: { slotLock: 1 },
            }
        );
        await this.voidShare(ad.adId, paymentIntentId, kind);
        await this.dropImages(ad.adId, 'refunded');
        this.listCache = null;
        return 'refunded';
    }

    // ------------------------------------------------------------------ buyer reads

    async getAd(adId: string, now: Date = new Date()): Promise<RaveAdBuyerView> {
        if (!RAVE_AD_ID_RE.test(String(adId || ''))) throw RAVE_AD_ERRORS.adNotFound();
        let ad: any = await this.ads.findOne({ adId }).lean();
        if (!ad) throw RAVE_AD_ERRORS.adNotFound();
        if (ad.method === 'usdc' && ad.usdcTxHash && ['held', 'expired', 'canceled'].includes(ad.status)) {
            const last = this.lastUsdcPoll.get(adId) || 0;
            if (now.getTime() - last >= RAVE_AD_USDC_POLL_MS) {
                if (this.lastUsdcPoll.size > 5000) this.lastUsdcPoll.clear();
                this.lastUsdcPoll.set(adId, now.getTime());
                await this.verifyUsdc(ad, now).catch(error =>
                    this.logger.warn(`rave ad ${adId}: USDC receipt not read: ${(error as Error)?.message}`)
                );
                ad = await this.ads.findOne({ adId }).lean();
            }
        }
        if (ad.status === 'held' && ad.paymentIntentId) {
            const last = this.lastStripePoll.get(adId) || 0;
            if (now.getTime() - last >= STRIPE_POLL_MS) {
                if (this.lastStripePoll.size > 5000) this.lastStripePoll.clear();
                this.lastStripePoll.set(adId, now.getTime());
                try {
                    const intent = await this.stripe.paymentIntents.retrieve(ad.paymentIntentId);
                    if (intent.status === 'succeeded') await this.markPaid(intent, now);
                } catch (error) {
                    this.logger.warn(`rave ad ${adId}: intent not read: ${(error as Error)?.message}`);
                }
                ad = await this.ads.findOne({ adId }).lean();
            }
        }
        return this.buyerView(ad);
    }

    private buyerView(ad: any): RaveAdBuyerView {
        return {
            adId: ad.adId,
            slotId: ad.slotId,
            status: ad.status,
            name: ad.name,
            url: ad.url,
            x: ad.xHandle || null,
            imageUrl: ad.imageUrl || null,
            priceCents: ad.priceCents,
            feeCents: ad.feeCents,
            amountCents: ad.amountCents,
            holdUntil: ad.status === 'held' ? iso(ad.holdUntil) : null,
            liveUntil: ad.status === 'live' ? iso(ad.liveUntil) : null,
            method: ad.method === 'usdc' ? 'usdc' : 'card',
            usdc:
                ad.method === 'usdc' && ad.usdc
                    ? {
                          chainId: Number(ad.usdc.chainId),
                          token: String(ad.usdc.token),
                          decimals: Number(ad.usdc.decimals),
                          recipient: String(ad.usdc.recipient),
                          amount: String(ad.usdc.amount),
                          txHash: ad.usdcTxHash || null,
                          payer: ad.usdc.payer || null,
                      }
                    : null,
            refund: ad.refund?.state ? { state: ad.refund.state, reason: String(ad.refund.reason || '') } : null,
        };
    }

    /** GET /rave/ads: approved, running ads only. Readable while ad checkout is not ready, so live ads keep showing. */
    async listPublic(now: Date = new Date()): Promise<{ asOf: string; ads: RavePublicAd[] }> {
        if (this.listCache && now.getTime() - this.listCache.at < RAVE_AD_LIST_CACHE_MS) return this.listCache.value;
        await this.sweep(now).catch(error => this.logger.warn(`rave ad sweep: ${(error as Error)?.message}`));
        const rows: any[] = await this.ads
            .find({ status: 'live', liveUntil: { $gt: now } })
            .sort({ approvedAt: 1 })
            .limit(RAVE_AD_SLOTS.length * 2)
            .lean();
        const seen = new Set<string>();
        const ads: RavePublicAd[] = [];
        for (const r of rows) {
            if (seen.has(r.slotId) || !raveAdSlot(r.slotId) || !r.imageUrl) continue;
            seen.add(r.slotId);
            ads.push({
                adId: r.adId,
                slotId: r.slotId,
                name: r.name,
                url: r.url,
                ...(r.xHandle ? { x: r.xHandle } : {}),
                imageUrl: r.imageUrl,
                liveUntil: iso(r.liveUntil)!,
            });
        }
        const value = { asOf: now.toISOString(), ads };
        this.listCache = { at: now.getTime(), value };
        return value;
    }

    // ------------------------------------------------------------------ admin

    async adminList(status: unknown) {
        const want: RaveAdStatus = typeof status === 'string' && status ? (status as RaveAdStatus) : 'review';
        const rows: any[] = await this.ads.find({ status: want }).sort({ createdAt: 1 }).limit(100).lean();
        return {
            ads: rows.map(r => ({
                ...this.buyerView(r),
                paymentIntentId: r.paymentIntentId || null,
                livemode: !!r.livemode,
                paidAt: iso(r.paidAt),
                approvedAt: iso(r.approvedAt),
                liveUntilAt: iso(r.liveUntil),
                rejectReason: r.rejectReason || null,
                refund: r.refund || null,
                shareState: r.shareState || null,
            })),
        };
    }

    /** review → live for RAVE_AD_DAYS; queues the shelter share when RAVE_AD_SHELTER_BPS > 0. */
    async approve(adId: string, by: string | undefined, now: Date = new Date()) {
        if (!RAVE_AD_ID_RE.test(String(adId || ''))) throw RAVE_AD_ERRORS.adNotFound();
        const cfg = readRaveAdsConfig(this.env);
        const current: any = await this.ads.findOne({ adId }).lean();
        if (!current || current.status !== 'review' || !current.slotLock) {
            throw RAVE_AD_ERRORS.state('Only a paid ad in review can be approved');
        }
        // The private image goes public only now.
        let imageUrl: string | undefined = current.imageUrl;
        let publicKey: string | undefined = current.imagePublicKey;
        let published = false;
        if (!imageUrl) {
            if (!current.imageKey) throw RAVE_AD_ERRORS.storage();
            publicKey = `rave-ads/${adId}-${randomBytes(6).toString('hex')}.webp`;
            try {
                imageUrl = await this.io.publish(current.imageKey, publicKey);
                published = true;
            } catch (error) {
                this.logger.warn(`rave ad ${adId}: image not published: ${(error as Error)?.message}`);
                throw RAVE_AD_ERRORS.storage();
            }
        }
        const won: any = await this.ads
            .findOneAndUpdate(
                { adId, status: 'review', slotLock: { $exists: true } },
                {
                    $set: {
                        status: 'live',
                        approvedAt: now,
                        ...(by ? { approvedBy: by } : {}),
                        liveUntil: new Date(now.getTime() + cfg.days * 24 * 3600 * 1000),
                        imageUrl,
                        ...(publicKey ? { imagePublicKey: publicKey } : {}),
                    },
                    ...(published ? { $unset: { imageKey: 1 } } : {}),
                },
                { new: true }
            )
            .lean();
        if (!won) {
            if (published && publicKey) await this.io.remove(publicKey).catch(() => undefined);
            throw RAVE_AD_ERRORS.state('Only a paid ad in review can be approved');
        }
        if (published) {
            await this.io
                .remove(current.imageKey)
                .catch(error =>
                    this.logger.warn(`rave ad ${adId}: private image not deleted: ${(error as Error)?.message}`)
                );
        }
        this.listCache = null;
        let payoutQueued = false;
        const keptCents = Math.max(0, won.priceCents - Math.max(0, (won.refundedCents || 0) - (won.feeCents || 0)));
        const shelterCents = raveAdShelterCents(keptCents, cfg.shelterBps);
        if (shelterCents > 0) payoutQueued = await this.queueShare(won, shelterCents, now);
        return { ...this.buyerView(won), payoutQueued };
    }

    /**
     * review or live → rejected: the slot frees at once and the full payment is refunded through Stripe
     * (idempotency key `ravead-refund:<adId>`). Calling it again retries any refund that has not gone
     * through (`refund.state` `failed`, or `due` after a crash): a rejected ad's, and a lost slot's
     * (status `refunded`, reason `slot-lost`, which markPaid writes before it calls Stripe). The same
     * idempotency key means a retry never refunds twice.
     */
    async reject(adId: string, reason: unknown, by: string | undefined, now: Date = new Date()) {
        if (!RAVE_AD_ID_RE.test(String(adId || ''))) throw RAVE_AD_ERRORS.adNotFound();
        const note = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
        const won: any = await this.ads
            .findOneAndUpdate(
                { adId, status: { $in: ['review', 'live'] } },
                {
                    $set: {
                        status: 'rejected',
                        rejectedAt: now,
                        ...(by ? { rejectedBy: by } : {}),
                        ...(note ? { rejectReason: note } : {}),
                        refund: { state: 'due', reason: 'rejected', at: now },
                    },
                    $unset: { slotLock: 1 },
                },
                { new: true }
            )
            .lean();
        this.listCache = null;
        let ad: any = won;
        if (!won) {
            ad = await this.ads.findOne({ adId }).lean();
            if (!ad) throw RAVE_AD_ERRORS.adNotFound();
            const refundOpen = ['failed', 'due'].includes(ad.refund?.state);
            if (ad.status === 'refunded' && ad.refund?.reason === 'slot-lost' && refundOpen) {
                // A late payment for a slot someone else took: only the refund is left to do.
                const refund = ad.paymentIntentId ? await this.refund(adId, ad.paymentIntentId, 'slot-lost') : 'failed';
                return { adId, status: 'refunded' as const, refund };
            }
            if (ad.status !== 'rejected' || !refundOpen) {
                throw RAVE_AD_ERRORS.state('Only a paid ad in review or live can be rejected');
            }
        }
        await this.voidShare(adId, ad.method === 'usdc' ? null : ad.paymentIntentId, 'refunded');
        await this.dropImages(adId, 'rejected');
        if (ad.method === 'usdc')
            return { adId, status: 'rejected' as const, refund: await this.manualRefund(ad, now) };
        const refund = ad.paymentIntentId ? await this.refund(adId, ad.paymentIntentId, 'rejected') : 'failed';
        return { adId, status: 'rejected' as const, refund };
    }

    /** The stored image of a paid ad, for the admin who approves it (it is not public before that). */
    async adminImage(adId: string): Promise<Buffer> {
        if (!RAVE_AD_ID_RE.test(String(adId || ''))) throw RAVE_AD_ERRORS.adNotFound();
        const ad: any = await this.ads.findOne({ adId }).lean();
        const key = ad?.imageKey || ad?.imagePublicKey;
        if (!key) throw RAVE_AD_ERRORS.adNotFound();
        try {
            return await this.io.readPrivate(key);
        } catch (error) {
            this.logger.warn(`rave ad ${adId}: image not read: ${(error as Error)?.message}`);
            throw RAVE_AD_ERRORS.storage();
        }
    }

    /** A rejected USDC ad: no on-chain refund from here; it is flagged for a refund by hand to the payer. */
    private async manualRefund(ad: any, now: Date): Promise<'manual'> {
        const payer = String(ad.usdc?.payer || '');
        await this.ads.updateOne(
            { adId: ad.adId },
            { $set: { refund: { state: 'manual', reason: 'rejected', ...(payer ? { payer } : {}), at: now } } }
        );
        this.logger.error(
            `rave ad ${ad.adId}: rejected USDC ad; refund ${ad.usdc?.amount} base units on chain ${
                ad.usdc?.chainId
            } by hand to ${payer || 'the payer'}`
        );
        return 'manual';
    }

    private async refund(adId: string, paymentIntentId: string, reason: string): Promise<'refunded' | 'failed'> {
        try {
            const refund = await this.stripe.refunds.create(
                { payment_intent: paymentIntentId, reason: 'requested_by_customer', metadata: { adId, reason } },
                { idempotencyKey: `ravead-refund:${adId}` }
            );
            await this.ads.updateOne(
                { adId },
                { $set: { 'refund.state': 'refunded', 'refund.refundId': refund.id }, $unset: { 'refund.error': 1 } }
            );
            return 'refunded';
        } catch (error) {
            const message = String((error as Error)?.message || 'refund failed').slice(0, 200);
            this.logger.error(
                `rave ad ${adId}: ${reason} refund failed (${message}); retry with POST /rave/ads/${adId}/reject (ADMIN)`
            );
            await this.ads.updateOne({ adId }, { $set: { 'refund.state': 'failed', 'refund.error': message } });
            return 'failed';
        }
    }

    // ------------------------------------------------------------------ shelter share

    /** Same keeper row shape as a rave order (RaveService.queuePayout), memo `tt:ravead:<16 hex>`. */
    private async queueShare(ad: any, cents: number, now: Date): Promise<boolean> {
        const shelter = readShelterConfig(this.env);
        const keeperMainnet = !isTestnetChain(shelter.chainId);
        if (!!ad.livemode !== keeperMainnet) {
            this.logger.error(
                `rave ad ${ad.adId}: ${
                    ad.livemode ? 'live' : 'test'
                } payment against the other keeper class, no share queued`
            );
            await this.ads.updateOne({ adId: ad.adId }, { $set: { shareState: 'skipped-mode' } });
            return false;
        }
        const shelterShare: CheckoutShelterShare = {
            shelterId: PACK_SHELTER_IDS.pinkPaw,
            route: 'treasury',
            bps: 10000,
            evidenceTier: 'pledged',
            state: 'due',
            amountUsdCents: cents,
            memo: raveAdMemo(ad.adId),
            attempts: 0,
        };
        try {
            await this.checkouts.create({
                orderId: ad.adId,
                user: RAVE_SYSTEM_USER,
                rail: ad.method === 'usdc' ? 'crypto' : 'card',
                network: !ad.livemode ? 'testnet' : ad.method === 'usdc' ? 'mainnet' : 'card',
                ...(ad.paymentIntentId ? { cardIntent: ad.paymentIntentId } : {}),
                sku: { kind: 'RAVE_AD', name: `Moon Rave ad ${ad.slotId}` },
                priceUsdCents: cents,
                discountPercentage: 0,
                accepted: [],
                status: 'COMPLETE',
                expiresAt: now,
                grant: { success: true, message: 'Moon Rave ad' },
                shelterShare,
            } as any);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        await this.ads.updateOne({ adId: ad.adId }, { $set: { shelterCents: cents, shareState: 'due' } });
        this.shares?.runOnce().catch(error => this.logger.warn(`rave ad keeper kick: ${(error as Error)?.message}`));
        return true;
    }

    /** Marks the ad's shelter-share row reversed whatever its state (rave-share.ts); voids it if nothing left. */
    /** `paymentIntentId` null: a USDC ad's row, which has no card intent (matched by the ad id alone). */
    private async voidShare(adId: string, paymentIntentId: string | null | undefined, why: string) {
        if (paymentIntentId === undefined) return;
        const { outcome, state } = await reverseShare(this.checkouts, adId, paymentIntentId, why);
        if (outcome === 'none') return;
        if (outcome === 'voided') {
            await this.ads.updateOne({ adId }, { $set: { shareState: 'void' } });
            return;
        }
        await this.ads.updateOne(
            { adId },
            { $set: { shareState: outcome === 'paid' ? 'reversed-after-payout' : 'reversed' } }
        );
        this.logger.error(`rave ad ${adId}: ${why} while its shelter share was ${state}; check by hand`);
    }
}

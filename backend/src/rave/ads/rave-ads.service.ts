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
import { normalizeXHandle } from '../rave-names';
import { reverseShare, shrinkShare } from '../rave-share';
import { raveAdQuote, raveAdShelterCents, RaveAdsConfig, readRaveAdsConfig } from './rave-ads.config';
import { RAVE_AD_ERRORS } from './rave-ads.errors';
import { AdImageError, sanitizeAdImage } from './rave-ads.image';
import { RaveAd, RaveAdDocument, RaveAdStatus } from './rave-ads.schema';
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

export const raveAdMemo = (adId: string) => `tt:ravead:${adId.slice(3)}`;

export type RaveAdsOffReason = 'stripe' | 'mode' | 'keeper';

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
    publishableKey?: string;
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

    constructor(
        @InjectModel(RaveAd.name) private ads: Model<RaveAdDocument>,
        @InjectModel(CryptoCheckout.name) private checkouts: Model<CryptoCheckoutDocument>,
        private stripePayments: StripePaymentService,
        @Optional() private shares?: CryptoShelterShareService
    ) {}

    private get stripe(): Stripe {
        return this.stripePayments.stripe;
    }

    // ------------------------------------------------------------------ status

    readiness(cfg: RaveAdsConfig = readRaveAdsConfig(this.env)): RaveAdsOffReason | null {
        if (!cfg.secretKeyMode || !cfg.publishableKeyMode || !cfg.webhookSecret) return 'stripe';
        if (cfg.publishableKeyMode !== cfg.secretKeyMode) return 'mode';
        const live = cfg.secretKeyMode === 'live';
        if (live && !cfg.production) return 'mode';
        if (cfg.shelterBps > 0) {
            // A shelter share needs the keeper, on the network class of the key.
            const shelter = readShelterConfig(this.env);
            if (!shelter.rpcUrl || !shelter.splitAddress || !hotWalletAddress(shelter)) return 'keeper';
            if (live === isTestnetChain(shelter.chainId)) return 'mode';
            // The keeper has no flag; it runs only when its chain matches the checkout network (main, Oct 14).
            if (!shelterShareNetworkOk(shelter, readCryptoPayConfig(this.env), this.env)) return 'keeper';
        }
        return null;
    }

    /** 503 while something ad checkout needs is missing (no on/off flag). */
    assertOpen(cfg: RaveAdsConfig = readRaveAdsConfig(this.env)) {
        const reason = this.readiness(cfg);
        if (reason) throw RAVE_AD_ERRORS.off(reason);
    }

    async status(now: Date = new Date()): Promise<RaveAdsStatus> {
        const cfg = readRaveAdsConfig(this.env);
        const reason = this.readiness(cfg);
        if (reason) return { enabled: false, reason };
        await this.sweep(now);
        const taken: any[] = await this.ads
            .find({ slotLock: { $exists: true } }, { slotLock: 1, status: 1, holdUntil: 1 })
            .limit(100)
            .lean();
        const bySlot = new Map(taken.map(t => [String(t.slotLock), t]));
        return {
            enabled: true,
            livemode: cfg.secretKeyMode === 'live',
            publishableKey: cfg.publishableKey!,
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
        this.assertOpen(cfg);
        if (!body || typeof body !== 'object') throw RAVE_AD_ERRORS.invalid('Expected a form body');
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
        const coverFee = coverRaw !== false && coverRaw !== 'false';
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

        let intent: Stripe.PaymentIntent;
        try {
            intent = await this.createIntent({ ...doc, adId });
        } catch (error) {
            this.logger.warn(`rave ad ${adId}: PaymentIntent not created: ${(error as Error)?.message}`);
            await release();
            throw RAVE_AD_ERRORS.stripe();
        }
        const ad: any = await this.ads.findOne({ adId }).lean();
        return { ...this.buyerView(ad), clientSecret: intent.client_secret };
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
        if (ad.requestHash !== requestHash) throw RAVE_AD_ERRORS.keyReused();
        let secret: string | null = null;
        if (ad.status === 'held' && ad.holdUntil && new Date(ad.holdUntil) > now) {
            if (!ad.paymentIntentId) throw RAVE_AD_ERRORS.state('This checkout is still starting, try again');
            const intent = await this.stripe.paymentIntents.retrieve(ad.paymentIntentId).catch(() => {
                throw RAVE_AD_ERRORS.stripe();
            });
            secret = intent.client_secret;
        }
        return { ...this.buyerView(ad), clientSecret: secret };
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
        await this.voidShare(adId, ad.paymentIntentId, 'refunded');
        await this.dropImages(adId, 'rejected');
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
                rail: 'card',
                network: ad.livemode ? 'card' : 'testnet',
                cardIntent: ad.paymentIntentId,
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
    private async voidShare(adId: string, paymentIntentId: string | undefined, why: string) {
        if (!paymentIntentId) return;
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

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import Stripe from 'stripe';
import {
    amountFor,
    customerKey,
    MOTORED_AMOUNT_RULE,
    MOTORED_FIRST_CUSTOMER_N,
    motoredMemo,
    motoredMissing,
    motoredReady,
    paymentKey,
    readMotoredConfig,
    MotoredConfig,
    encryptWalletKey,
} from './motored.config';
import { MotoredGift, MotoredGiftDocument, MotoredWallet, MotoredWalletDocument } from './motored.schema';
import { MotoredGiftService } from './motored-gift.service';
import { Wallet } from 'ethers';

/*
 * POST /shelter/motored/stripe (raw body, MOTORED_STRIPE_WEBHOOK_SECRET; same verify pattern as
 * club-webhook.service.ts:106). Motored's own Stripe account sends `checkout.session.completed` for
 * one-off orders (subscriptions, `invoice.paid`, are out of scope); `charge.refunded` and
 * `charge.dispute.created` reverse the gift.
 *
 * One wallet per real paying Motored customer: `motored_wallets` keyed by
 * `customerKey = sha256(MOTORED_CUSTOMER_SALT + customer id)`; the same wallet for every order of that
 * customer. One gift per paid order: `motored_gifts` keyed by `paymentKey = sha256(MOTORED_CUSTOMER_SALT
 * + payment id)` (unique index, so a resent webhook can't pay twice). No raw customer id, email or name
 * is ever stored. A gift is sent right away (MotoredGiftService.kick); the keeper is the retry backup.
 */

@Injectable()
export class MotoredStripeService {
    private readonly logger = new Logger(MotoredStripeService.name);
    env: NodeJS.ProcessEnv = process.env;

    constructor(
        @InjectModel(MotoredWallet.name) private wallets: Model<MotoredWalletDocument>,
        @InjectModel(MotoredGift.name) private gifts: Model<MotoredGiftDocument>,
        private giftService: MotoredGiftService
    ) {}

    verify(rawBody: Buffer | string | undefined, signature: string | undefined): Stripe.Event {
        const secret = readMotoredConfig(this.env).webhookSecret;
        if (!secret) throw new HttpException('Motored webhook secret not set', 503);
        if (!signature || !rawBody) throw new HttpException('Motored webhook signature missing or invalid', 400);
        const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        try {
            return Stripe.webhooks.constructEvent(buffer, signature, secret);
        } catch {
            throw new HttpException('Motored webhook signature missing or invalid', 400);
        }
    }

    async handle(event: Stripe.Event, now: Date = new Date()): Promise<string> {
        const cfg = readMotoredConfig(this.env);
        if (motoredMissing(cfg).length) return 'unconfigured';
        // Production never creates test orders: a test event there must not queue a real gift.
        if (cfg.production && !event.livemode) return 'ignored';
        const object: any = event.data?.object;
        switch (event.type) {
            case 'checkout.session.completed':
                return this.sessionCompleted(object, now);
            case 'charge.refunded':
                return this.chargeReversed(object, 'refunded');
            case 'charge.dispute.created':
                return this.chargeReversed(object, 'disputed');
            default:
                return 'ignored';
        }
    }

    private async sessionCompleted(session: any, now: Date): Promise<string> {
        if (session?.payment_status !== 'paid') return 'unpaid';
        const currency = String(session?.currency || '').toLowerCase();
        if (currency !== 'usd' && currency !== 'eur') return 'currency-skipped';
        const customerId = session?.customer;
        const paymentId = session?.payment_intent || session?.id;
        if (!customerId || !paymentId) return 'ignored';

        const cfg = readMotoredConfig(this.env);
        const cKey = customerKey(customerId, cfg.customerSalt!);
        const pKey = paymentKey(paymentId, cfg.customerSalt!);

        const wallet = await this.findOrCreateWallet(cKey, cfg);
        const cents = amountFor(pKey, cfg.amountSalt!);
        const memo = motoredMemo(wallet.n);
        try {
            await this.gifts.create({
                paymentKey: pKey,
                customerKey: cKey,
                n: wallet.n,
                amountUsdCents: cents,
                amountRule: MOTORED_AMOUNT_RULE,
                state: 'due',
                memo,
                ...(currency === 'eur' ? { eurRate: cfg.eurUsdRate } : {}),
            } as any);
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            return 'duplicate-order';
        }
        // Send right away (don't wait for the keeper); the keeper retries if this fails.
        this.giftService.kick();
        return 'due';
    }

    /**
     * Find the customer's wallet (same wallet for every order of that customer), or create it with a fresh
     * key and the next free label `N` (continuing after the last event round, so labels are not reused).
     */
    private async findOrCreateWallet(cKey: string, cfg: MotoredConfig): Promise<{ n: number; address: string }> {
        const existing = await this.wallets.findOne({ customerKey: cKey }).lean();
        if (existing) return { n: existing.n, address: existing.address };
        const top = await this.wallets.findOne({}, { n: 1, _id: 0 }).sort({ n: -1 }).lean();
        const n = Math.max(MOTORED_FIRST_CUSTOMER_N, (top?.n || MOTORED_FIRST_CUSTOMER_N - 1) + 1);
        const wallet = new Wallet(Wallet.createRandom().privateKey);
        const created = await this.wallets.create({
            customerKey: cKey,
            n,
            address: wallet.address,
            encryptedKey: encryptWalletKey(wallet.privateKey, cfg.walletKek!),
        } as any);
        return { n: created.n, address: created.address };
    }

    /**
     * A refund or dispute of a Motored charge (matched to its gift by paymentKey). If the gift is still
     * `due`, set `void`; if already sent, mark `reversed` (on-chain gifts are never clawed back) and show
     * it in the summary.
     */
    private async chargeReversed(charge: any, kind: 'refunded' | 'disputed'): Promise<string> {
        const paymentId = charge?.payment_intent;
        if (!paymentId) return 'ignored';
        const cfg = readMotoredConfig(this.env);
        const pKey = paymentKey(paymentId, cfg.customerSalt!);
        const row: any = await this.gifts.findOne({ paymentKey: pKey }).lean();
        if (!row) return 'ignored';
        if (row.state === 'due') {
            await this.gifts.updateOne({ _id: row._id, state: 'due' }, { $set: { state: 'void', reversed: kind } });
            return 'voided';
        }
        await this.gifts.updateOne({ _id: row._id }, { $set: { reversed: kind } });
        return 'after-payout';
    }
}

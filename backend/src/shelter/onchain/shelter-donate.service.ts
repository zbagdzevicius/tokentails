import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { getBigInt } from 'ethers';
import { Model, Types } from 'mongoose';
import { ErrorCode } from 'src/shared-contracts/errors';
import { DonationBroadcastError, ShelterChain, SignedDonation } from './shelter-chain';
import { donateReady, explorerTxUrl, readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
import {
    DonationFailureReason,
    DonationSource,
    ShelterDonateDay,
    ShelterDonateDayDocument,
    ShelterDonation,
    ShelterDonationDocument,
    ShelterDonationStatus,
} from './shelter-onchain.schema';

export const DONATE_PAUSED = 'Shelter gifts are paused right now. Your game progress is safe.';
export const DONATE_BUDGET_SPENT = "Today's shelter gift budget is used up. Come back tomorrow!";
export const DONATE_ALREADY_TODAY = "You already sent today's gift. Come back tomorrow!";
export const DONATE_SEND_FAILED = 'The gift could not be sent. Please try again later.';

/** Error bodies carry the F5.6 code next to the message: `{ statusCode, code, message }`.
 * No 503s here: in production a 503 from the app reaches clients as a bare gateway 504 (DigitalOcean
 * ingress / Cloudflare), which hides the message. "Off or used up" is a 409 and a failed send a 424. */
export const donatePaused = () =>
    new HttpException(
        { statusCode: HttpStatus.CONFLICT, code: ErrorCode.DONATE_PAUSED, message: DONATE_PAUSED },
        HttpStatus.CONFLICT
    );
export const donateBudgetSpent = () =>
    new HttpException(
        { statusCode: HttpStatus.CONFLICT, code: ErrorCode.DONATE_BUDGET_SPENT, message: DONATE_BUDGET_SPENT },
        HttpStatus.CONFLICT
    );
export const donateAlreadyToday = () =>
    new HttpException(
        {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: ErrorCode.DONATE_ALREADY_TODAY,
            message: DONATE_ALREADY_TODAY,
        },
        HttpStatus.TOO_MANY_REQUESTS
    );
export const donateSendFailed = () =>
    new HttpException(
        { statusCode: HttpStatus.FAILED_DEPENDENCY, code: ErrorCode.DONATE_SEND_FAILED, message: DONATE_SEND_FAILED },
        HttpStatus.FAILED_DEPENDENCY
    );

const DUPLICATE_KEY = 11000;
const ZERO = getBigInt(0);

/** How long `communityTotalConfirmedWei` is cached per instance. */
export const COMMUNITY_TOTAL_CACHE_MS = 5 * 60 * 1000;

export interface DonateResult {
    txHash: string;
    chainId: number;
    amountWei: string;
    explorerUrl: string;
}

/**
 * Where the rail is (plan G11 rail copy): `not-deployed` before the ShelterSplit deploy, `paused`
 * while server gifts are off, `exhausted` once today's budget is used, `live` otherwise.
 */
export type RailState = 'not-deployed' | 'paused' | 'live' | 'exhausted';

export interface DonateStatus {
    enabled: boolean;
    railState: RailState;
    chainId: number;
    amountWei: string;
    remainingTodayWei: string;
    dailyBudgetWei: string;
    /** Whole gifts the daily budget pays for. */
    giftsPerDayCap: number;
    treatsLeftToday: number;
    /** Next 00:00 UTC, when the per-user and budget counters reset. */
    resetsAt: string;
    /** Sum of CONFIRMED gifts, all time. Cached for a few minutes. */
    communityTotalConfirmedWei: string;
    splitAddress: string | null;
}

export interface DonateMe {
    day: string;
    resetsAt: string;
    today: {
        status: ShelterDonationStatus;
        source: DonationSource;
        txHash: string | null;
        explorerUrl: string | null;
        failedReason: DonationFailureReason | null;
    } | null;
    confirmedCount: number;
    onTheirWayCount: number;
    totalConfirmedWei: string;
    lastConfirmedAt: string | null;
}

export function utcDay(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: Date = new Date()): string {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

/** `tt:<source>:<8 hex>`. Random, so the memo carries no personal data and cannot be linked to a user. */
export function donationMemo(source: DonationSource): string {
    return `tt:${source}:${randomBytes(4).toString('hex')}`;
}

/** Gifts that fit in the daily budget. */
export function dailySlots(config: ShelterOnchainConfig): number {
    if (config.amountWei <= ZERO) {
        return 0;
    }
    return Number(config.dailyBudgetWei / config.amountWei);
}

/** Integer string of a Decimal128 `$sum`, or '0'. */
function decimalToWei(value: unknown): string {
    const text = String(value ?? '0');
    return /^\d+$/.test(text) ? text : '0';
}

/**
 * Server-paid shelter gifts: the Token Tails hot wallet calls ShelterSplit.donate on the player's behalf,
 * once per player per UTC day, within a daily budget. The player pays nothing and signs nothing.
 * `ShelterDonateReconcileService` settles SENT rows against their receipts (plan F7.4).
 */
@Injectable()
export class ShelterDonateService {
    private readonly logger = new Logger(ShelterDonateService.name);
    private communityTotal: { expiresAt: number; value: Promise<string> } | null = null;

    constructor(
        @InjectModel(ShelterDonation.name) private donationModel: Model<ShelterDonationDocument>,
        @InjectModel(ShelterDonateDay.name) private dayModel: Model<ShelterDonateDayDocument>,
        private chain: ShelterChain
    ) {}

    async status(now: Date = new Date()): Promise<DonateStatus> {
        const config = readShelterConfig();
        const enabled = donateReady(config);
        const cap = dailySlots(config);
        let remaining = ZERO;
        let left = 0;
        if (enabled) {
            const row = await this.dayModel.findOne({ day: utcDay(now) });
            const used = Math.max(0, row?.count || 0);
            left = Math.max(0, cap - used);
            const spent = getBigInt(used) * config.amountWei;
            remaining = spent >= config.dailyBudgetWei ? ZERO : config.dailyBudgetWei - spent;
            // Round down to whole gifts, so "remaining" never shows a partial gift that cannot be sent.
            remaining = (remaining / config.amountWei) * config.amountWei;
        }
        let railState: RailState = 'live';
        if (!config.splitAddress) {
            railState = 'not-deployed';
        } else if (!enabled) {
            railState = 'paused';
        } else if (left <= 0) {
            railState = 'exhausted';
        }
        return {
            enabled,
            railState,
            chainId: config.chainId,
            amountWei: config.amountWei.toString(),
            remainingTodayWei: remaining.toString(),
            dailyBudgetWei: config.dailyBudgetWei.toString(),
            giftsPerDayCap: cap,
            treatsLeftToday: left,
            resetsAt: nextUtcMidnight(now),
            communityTotalConfirmedWei: await this.communityTotalConfirmedWei(now),
            splitAddress: config.splitAddress,
        };
    }

    /** All-time CONFIRMED total, cached per instance. A failed read is not cached and reads as '0'. */
    communityTotalConfirmedWei(now: Date = new Date()): Promise<string> {
        const cached = this.communityTotal;
        if (cached && cached.expiresAt > now.getTime()) {
            return cached.value;
        }
        const value = this.donationModel
            .aggregate([
                { $match: { status: ShelterDonationStatus.CONFIRMED } },
                { $group: { _id: null, total: { $sum: { $toDecimal: '$amountWei' } } } },
            ])
            .exec()
            .then((rows: any[]) => decimalToWei(rows?.[0]?.total));
        this.communityTotal = { expiresAt: now.getTime() + COMMUNITY_TOTAL_CACHE_MS, value };
        return value.catch(error => {
            this.communityTotal = null;
            this.logger.error(`community total failed: ${error?.code || error?.name || 'unknown error'}`);
            return '0';
        });
    }

    /** The caller's treats. Never includes another user's rows. */
    async me(userId: string, now: Date = new Date()): Promise<DonateMe> {
        const user = new Types.ObjectId(userId);
        const day = utcDay(now);
        const [today, confirmedCount, onTheirWayCount, totals, last] = await Promise.all([
            this.donationModel.findOne({ user, day }).lean(),
            this.donationModel.countDocuments({ user, status: ShelterDonationStatus.CONFIRMED }),
            this.donationModel.countDocuments({ user, status: ShelterDonationStatus.SENT }),
            this.donationModel
                .aggregate([
                    { $match: { user, status: ShelterDonationStatus.CONFIRMED } },
                    { $group: { _id: null, total: { $sum: { $toDecimal: '$amountWei' } } } },
                ])
                .exec(),
            this.donationModel
                .findOne({ user, status: ShelterDonationStatus.CONFIRMED }, { confirmedAt: 1 })
                .sort({ confirmedAt: -1 })
                .lean(),
        ]);
        const row: any = today;
        const showTx =
            row?.txHash && [ShelterDonationStatus.SENT, ShelterDonationStatus.CONFIRMED].includes(row.status);
        return {
            day,
            resetsAt: nextUtcMidnight(now),
            today: row
                ? {
                      status: row.status,
                      source: row.source,
                      txHash: showTx ? row.txHash : null,
                      explorerUrl: showTx ? explorerTxUrl(row.txHash, row.chainId) : null,
                      failedReason: row.status === ShelterDonationStatus.FAILED ? row.failedReason || null : null,
                  }
                : null,
            confirmedCount,
            onTheirWayCount,
            totalConfirmedWei: decimalToWei((totals as any[])?.[0]?.total),
            lastConfirmedAt: (last as any)?.confirmedAt ? new Date((last as any).confirmedAt).toISOString() : null,
        };
    }

    async donate(userId: string, source: DonationSource, now: Date = new Date()): Promise<DonateResult> {
        const config = readShelterConfig();
        if (!donateReady(config)) {
            throw donatePaused();
        }
        const day = utcDay(now);
        const memo = donationMemo(source);

        // 1. One gift per user per UTC day, enforced by the unique (user, day) index. A FAILED row of
        // today gives the day back: it is reused for this attempt.
        const donation = await this.claimUserDay(userId, day, source, memo, config);

        // 2. Claim a slot in today's budget atomically.
        if (!(await this.claimSlot(day, dailySlots(config)))) {
            await this.markFailed(donation._id, 'budget-spent', now);
            throw donateBudgetSpent();
        }
        await this.donationModel.updateOne({ _id: donation._id }, { $set: { budgetSlot: true } });

        // 3. Sign, store the hash and nonce, then broadcast (ShelterChain.sendDonation). On a failure
        // where nothing can be mined, give back the slot and the user's daily gift so they can retry.
        let sent: SignedDonation;
        try {
            sent = await this.chain.sendDonation(config, memo, config.amountWei, async tx => {
                await this.donationModel.updateOne(
                    { _id: donation._id, status: ShelterDonationStatus.PENDING },
                    { $set: { txHash: tx.hash, txNonce: tx.nonce, txFrom: tx.from, signedAt: now } }
                );
            });
        } catch (error: any) {
            // Log the ethers error code only: never the wallet, the key or the raw request.
            this.logger.error(`shelter donate failed: ${error?.code || error?.name || 'unknown error'}`);
            if (error instanceof DonationBroadcastError && !error.definite) {
                // The node may have taken it before the answer was lost: it stays a gift on its way,
                // with its slots, and the reconcile job settles it by receipt or by nonce.
                await this.donationModel.updateOne(
                    { _id: donation._id, status: ShelterDonationStatus.PENDING },
                    { $set: { status: ShelterDonationStatus.SENT, sentAt: now } }
                );
                return this.result(error.tx.hash, config);
            }
            await this.markFailed(donation._id, 'send-failed', now);
            await this.releaseBudgetSlot(donation._id, day, now);
            throw donateSendFailed();
        }

        // Conditional on PENDING: a reconcile run may already have confirmed it.
        await this.donationModel.updateOne(
            { _id: donation._id, status: ShelterDonationStatus.PENDING },
            { $set: { status: ShelterDonationStatus.SENT, sentAt: now } }
        );
        return this.result(sent.hash, config);
    }

    private result(txHash: string, config: ShelterOnchainConfig): DonateResult {
        return {
            txHash,
            chainId: config.chainId,
            amountWei: config.amountWei.toString(),
            explorerUrl: explorerTxUrl(txHash, config.chainId),
        };
    }

    /**
     * Moves a row to FAILED with `reason`, once: the filter matches only a row not yet FAILED, so a
     * second call (or a second reconcile run) is a no-op. Returns whether this call made the change.
     */
    async markFailed(
        id: Types.ObjectId | string,
        reason: DonationFailureReason,
        now: Date,
        from: ShelterDonationStatus[] = [ShelterDonationStatus.PENDING, ShelterDonationStatus.SENT]
    ): Promise<boolean> {
        const row = await this.donationModel.findOneAndUpdate(
            { _id: id, status: { $in: from } },
            { $set: { status: ShelterDonationStatus.FAILED, failedReason: reason, failedAt: now } }
        );
        return !!row;
    }

    /**
     * Gives back the budget slot a FAILED row holds, once (`budgetSlot` flips first, so a crash can
     * lose at most one slot and never releases one twice). The day counter moves only when the
     * failure is on the row's own UTC day; an older day's budget no longer matters.
     */
    async releaseBudgetSlot(id: Types.ObjectId | string, day: string, now: Date): Promise<boolean> {
        const row = await this.donationModel.findOneAndUpdate(
            { _id: id, status: ShelterDonationStatus.FAILED, budgetSlot: true },
            { $set: { budgetSlot: false } }
        );
        if (!row) {
            return false;
        }
        if (day === utcDay(now)) {
            await this.dayModel.updateOne({ day, count: { $gt: 0 } }, { $inc: { count: -1 } });
        }
        return true;
    }

    private async claimUserDay(
        userId: string,
        day: string,
        source: DonationSource,
        memo: string,
        config: ShelterOnchainConfig
    ): Promise<{ _id: Types.ObjectId }> {
        const user = new Types.ObjectId(userId);
        const fields = {
            source,
            memo,
            amountWei: config.amountWei.toString(),
            chainId: config.chainId,
            status: ShelterDonationStatus.PENDING,
            budgetSlot: false,
        };
        try {
            return await this.donationModel.create({ user, day, ...fields });
        } catch (error: any) {
            if (error?.code !== DUPLICATE_KEY) {
                throw error;
            }
        }
        const failed: any = await this.donationModel
            .findOne({ user, day, status: ShelterDonationStatus.FAILED, budgetSlot: { $ne: true } })
            .lean();
        if (failed) {
            const attempt = {
                txHash: failed.txHash,
                txNonce: failed.txNonce,
                failedReason: failed.failedReason,
                failedAt: failed.failedAt,
            };
            // Conditional on FAILED: of two parallel retries only one reuses the row.
            const reused = await this.donationModel.findOneAndUpdate(
                { _id: failed._id, status: ShelterDonationStatus.FAILED, budgetSlot: { $ne: true } },
                {
                    $set: fields,
                    $unset: {
                        txHash: 1,
                        txNonce: 1,
                        txFrom: 1,
                        signedAt: 1,
                        lastCheckedAt: 1,
                        failedReason: 1,
                        failedAt: 1,
                        sentAt: 1,
                    },
                    $push: { attempts: attempt },
                },
                { new: true }
            );
            if (reused) {
                return reused;
            }
        }
        throw donateAlreadyToday();
    }

    /**
     * Increments today's counter only while it is below `slots`. When the day is full the filter misses,
     * the upsert tries to insert a second row for the day, and the unique `day` index rejects it.
     */
    private async claimSlot(day: string, slots: number): Promise<boolean> {
        if (slots <= 0) {
            return false;
        }
        try {
            const row = await this.dayModel.findOneAndUpdate(
                { day, count: { $lt: slots } },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            );
            return !!row;
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                return false;
            }
            throw error;
        }
    }
}

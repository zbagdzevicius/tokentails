import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { getBigInt } from 'ethers';
import { Model, Types } from 'mongoose';
import { ShelterChain } from './shelter-chain';
import { donateReady, explorerTxUrl, readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
import {
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

const DUPLICATE_KEY = 11000;
const ZERO = getBigInt(0);

export interface DonateResult {
    txHash: string;
    chainId: number;
    amountWei: string;
    explorerUrl: string;
}

export interface DonateStatus {
    enabled: boolean;
    chainId: number;
    amountWei: string;
    remainingTodayWei: string;
    splitAddress: string | null;
}

export function utcDay(now: Date = new Date()): string {
    return now.toISOString().slice(0, 10);
}

/** `tt:<source>:<8 hex>`. Random, so the memo carries no personal data and cannot be linked to a user. */
export function donationMemo(source: DonationSource): string {
    return `tt:${source}:${randomBytes(4).toString('hex')}`;
}

/** Gifts that fit in the daily budget. */
function dailySlots(config: ShelterOnchainConfig): number {
    if (config.amountWei <= ZERO) {
        return 0;
    }
    return Number(config.dailyBudgetWei / config.amountWei);
}

/**
 * Server-paid shelter gifts: the Token Tails hot wallet calls ShelterSplit.donate on the player's behalf,
 * once per player per UTC day, within a daily budget. The player pays nothing and signs nothing.
 */
@Injectable()
export class ShelterDonateService {
    private readonly logger = new Logger(ShelterDonateService.name);

    constructor(
        @InjectModel(ShelterDonation.name) private donationModel: Model<ShelterDonationDocument>,
        @InjectModel(ShelterDonateDay.name) private dayModel: Model<ShelterDonateDayDocument>,
        private chain: ShelterChain
    ) {}

    async status(now: Date = new Date()): Promise<DonateStatus> {
        const config = readShelterConfig();
        const enabled = donateReady(config);
        let remaining = ZERO;
        if (enabled) {
            const row = await this.dayModel.findOne({ day: utcDay(now) });
            const used = getBigInt(row?.count || 0);
            const spent = used * config.amountWei;
            remaining = spent >= config.dailyBudgetWei ? ZERO : config.dailyBudgetWei - spent;
            // Round down to whole gifts, so "remaining" never shows a partial gift that cannot be sent.
            remaining = (remaining / config.amountWei) * config.amountWei;
        }
        return {
            enabled,
            chainId: config.chainId,
            amountWei: config.amountWei.toString(),
            remainingTodayWei: remaining.toString(),
            splitAddress: config.splitAddress,
        };
    }

    async donate(userId: string, source: DonationSource, now: Date = new Date()): Promise<DonateResult> {
        const config = readShelterConfig();
        if (!donateReady(config)) {
            throw new ServiceUnavailableException(DONATE_PAUSED);
        }
        const day = utcDay(now);
        const memo = donationMemo(source);

        // 1. One gift per user per UTC day, enforced by the unique (user, day) index.
        let donation: ShelterDonationDocument;
        try {
            donation = await this.donationModel.create({
                user: new Types.ObjectId(userId),
                day,
                source,
                memo,
                amountWei: config.amountWei.toString(),
                chainId: config.chainId,
                status: ShelterDonationStatus.PENDING,
            });
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                throw new HttpException(DONATE_ALREADY_TODAY, HttpStatus.TOO_MANY_REQUESTS);
            }
            throw error;
        }

        // 2. Claim a slot in today's budget atomically.
        if (!(await this.claimSlot(day, dailySlots(config)))) {
            await this.donationModel.deleteOne({ _id: donation._id });
            throw new ServiceUnavailableException(DONATE_BUDGET_SPENT);
        }

        // 3. Broadcast. On failure give back the slot and the user's daily gift so they can retry.
        let txHash: string;
        try {
            txHash = await this.chain.sendDonation(config, memo, config.amountWei);
        } catch (error: any) {
            // Log the ethers error code only: never the wallet, the key or the raw request.
            this.logger.error(`shelter donate failed: ${error?.code || error?.name || 'unknown error'}`);
            await this.dayModel.updateOne({ day }, { $inc: { count: -1 } });
            await this.donationModel.deleteOne({ _id: donation._id });
            throw new ServiceUnavailableException(DONATE_SEND_FAILED);
        }

        await this.donationModel.updateOne(
            { _id: donation._id },
            { $set: { txHash, status: ShelterDonationStatus.SENT } }
        );
        return {
            txHash,
            chainId: config.chainId,
            amountWei: config.amountWei.toString(),
            explorerUrl: explorerTxUrl(txHash),
        };
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

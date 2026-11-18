import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { DonationBroadcastError, ShelterChain, shelterSplitInterface } from '../onchain/shelter-chain';
import { readShelterConfig, ShelterOnchainConfig } from '../onchain/shelter-onchain.config';
import {
    MOTORED_DONATE_ESTIMATE,
    MOTORED_FUNDER,
    MOTORED_GIFT_CRON,
    MOTORED_LOW_BALANCE_DAYS,
    MOTORED_SHELTER,
    MOTORED_STUCK_MS,
    motoredGasTerms,
    motoredReady,
    readMotoredConfig,
    MotoredConfig,
} from './motored.config';
import { MotoredGift, MotoredGiftDocument, MotoredWallet, MotoredWalletDocument } from './motored.schema';
import { decryptWalletKey } from './motored.config';

/*
 * The Motored × Stripe sender + keeper (tracks/motored-stripe/PLAN.md): the funder 0xF1d7…688f tops up
 * each customer wallet (amount + gas reserve), then the wallet calls ShelterSplit.donate(`motored:user-N`).
 *
 * The webhook sends right away (MotoredStripeService.kick → runOnce). The keeper (@Cron every 5 minutes)
 * only retries `due` rows and unlocks stale `sending` rows, exactly like crypto-shelter-share:
 * a `sent` row is settled by its receipt and never re-sent; a reverted send goes back to `due` at most
 * twice; a `sent` row with a used nonce and no receipt is `failed` for a person to check. Every run
 * re-checks the split pays 100% to Pink Paw and the funder is not low.
 */

const MOTORED_JOB = 'motored-gift';
const MOTORED_LEASE_MS = 4 * 60 * 1000;
const MOTORED_BATCH = 20;
const MOTORED_MAX_ATTEMPTS = 3;
/** 1 USDC (native, 18 decimals) in wei. */
const WEI_PER_USD = 10n ** 18n;
/** A whole number of cents to wei (18 decimals): cents * 1e16. */
const centsWei = (cents: number): bigint => BigInt(cents) * 10n ** 16n;

export interface MotoredGiftRun {
    sent: number;
    confirmed: number;
    failed: number;
    skipped: string | null;
}

@Injectable()
export class MotoredGiftService {
    private readonly logger = new Logger(MotoredGiftService.name);
    private kickTimer: NodeJS.Timeout | null = null;
    env: NodeJS.ProcessEnv = process.env;

    constructor(
        @InjectModel(MotoredGift.name) private gifts: Model<MotoredGiftDocument>,
        @InjectModel(MotoredWallet.name) private wallets: Model<MotoredWalletDocument>,
        private chain: ShelterChain
    ) {}

    @Cron(MOTORED_GIFT_CRON, { name: MOTORED_JOB })
    async cron() {
        if (!motoredReady(this.env)) return 'not-ready';
        return runLeased({
            jobRuns: this.gifts.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: MOTORED_JOB,
            ttlMs: MOTORED_LEASE_MS,
            logger: this.logger,
            run: () => this.runOnce(),
        });
    }

    /** Debounced, fire-and-forget send after a webhook inserts a `due` row: a gift does not wait for the cron. */
    kick(): void {
        if (this.kickTimer) return;
        this.kickTimer = setTimeout(() => {
            this.kickTimer = null;
            this.runOnce().catch(error => this.logger.warn(`motored kick: ${(error as Error)?.message}`));
        }, 1000);
        this.kickTimer.unref?.();
    }

    async runOnce(
        now: Date = new Date(),
        cfg: MotoredConfig = readMotoredConfig(this.env),
        shelter: ShelterOnchainConfig = readShelterConfig(this.env)
    ): Promise<MotoredGiftRun> {
        const result: MotoredGiftRun = { sent: 0, confirmed: 0, failed: 0, skipped: null };
        if (!shelter.rpcUrl || !shelter.splitAddress) {
            return { ...result, skipped: 'not-ready' };
        }
        if (!cfg.funderKey || !cfg.walletKek) {
            return { ...result, skipped: 'unconfigured' };
        }
        await this.unlockStale(now);
        await this.voidReversed();
        await this.settle(now, shelter, result);
        await this.voidReversed();
        await this.send(now, shelter, cfg, result);
        return result;
    }

    /** A `due` row that was reversed (refund/dispute) after it was taken is never sent: it becomes `void`. */
    private async voidReversed() {
        await this.gifts.updateMany({ state: 'due', reversed: { $exists: true } }, { $set: { state: 'void' } });
    }

    /** A row left `sending` with no hash (the process died between taking it and signing) goes back to `due`. */
    private async unlockStale(now: Date) {
        const before = new Date(now.getTime() - MOTORED_STUCK_MS);
        await this.gifts.updateMany(
            {
                state: 'sending',
                $or: [{ lockedAt: { $lt: before } }, { lockedAt: { $exists: false }, updatedAt: { $lt: before } }],
            },
            { $set: { state: 'due' }, $unset: { lockedAt: 1 } }
        );
    }

    /** Confirm `sent` rows by the donate() receipt; reverted sends go back to `due` (at most twice). */
    private async settle(now: Date, shelter: ShelterOnchainConfig, result: MotoredGiftRun) {
        const rows: any[] = await this.gifts.find({ state: 'sent' }).limit(MOTORED_BATCH).lean();
        for (const row of rows) {
            if (!row.giftTxHash) continue; // still funding; nothing to settle yet
            let receipt;
            try {
                receipt = await this.chain.getReceipt(shelter, row.giftTxHash);
            } catch {
                continue;
            }
            if (receipt && receipt.status === 1) {
                await this.gifts.updateOne(
                    { _id: row._id, state: 'sent' },
                    { $set: { state: 'confirmed', confirmedAt: now } }
                );
                result.confirmed++;
            } else if (receipt) {
                const attempts = (row.attempts || 0) + 1;
                const again = attempts < MOTORED_MAX_ATTEMPTS;
                await this.gifts.updateOne(
                    { _id: row._id, state: 'sent' },
                    {
                        $set: {
                            state: again ? 'due' : 'failed',
                            attempts,
                            error: 'reverted',
                        },
                        $unset: { giftTxHash: 1, nonce: 1 },
                    }
                );
                if (!again) result.failed++;
            } else if (now.getTime() - new Date(row.sentAt).getTime() > MOTORED_STUCK_MS) {
                // No receipt: only once the wallet's nonce moved on is it certainly dropped.
                const from = row.walletAddress;
                const mined = from ? await this.chain.minedNonce(shelter, from).catch(() => -1) : -1;
                if (mined > Number(row.nonce)) {
                    await this.gifts.updateOne(
                        { _id: row._id, state: 'sent' },
                        { $set: { state: 'failed', error: 'dropped: check by hand' } }
                    );
                    result.failed++;
                }
            }
        }
    }

    /** The whole cents of `sent`/`confirmed` gifts given since the start of the UTC day (the daily cap). */
    private async todayGivenCents(now: Date): Promise<number> {
        const start = new Date(now);
        start.setUTCHours(0, 0, 0, 0);
        const rows: any[] = await this.gifts
            .find({ state: { $in: ['sent', 'confirmed'] }, sentAt: { $gte: start } }, { amountUsdCents: 1 })
            .lean();
        return rows.reduce((s, r) => s + Number(r.amountUsdCents), 0);
    }

    /** Average confirmed gift cents per day over the last 7 days (for the funder low-balance alert). */
    private async avgDailyGivenCents(now: Date): Promise<number> {
        const since = new Date(now.getTime() - 7 * 86400000);
        const rows: any[] = await this.gifts
            .find({ state: 'confirmed', confirmedAt: { $gte: since } }, { amountUsdCents: 1 })
            .lean();
        if (!rows.length) return 0;
        const cents = rows.reduce((s, r) => s + Number(r.amountUsdCents), 0);
        return cents / 7;
    }

    private async checkFunder(shelter: ShelterOnchainConfig, cfg: MotoredConfig) {
        if (!cfg.funderAddress) return;
        if (cfg.funderAddress !== MOTORED_FUNDER.toLowerCase()) {
            this.logger.warn(
                `motored: funder key is for ${cfg.funderAddress}, expected ${MOTORED_FUNDER}; check MOTORED_FUNDER_KEY`
            );
        }
        const balance = await this.chain.nativeBalance(shelter, cfg.funderAddress).catch(() => null);
        if (balance === null) return;
        const avgDaily = await this.avgDailyGivenCents(new Date());
        const low = centsWei(Math.round(avgDaily * MOTORED_LOW_BALANCE_DAYS));
        if (balance < low) {
            this.logger.warn(
                `motored: funder ${cfg.funderAddress} low balance (${
                    Number(balance) / 1e18
                } USDC < ${MOTORED_LOW_BALANCE_DAYS} days of gifts); top it up`
            );
        }
    }

    /** The split still pays 100% to Pink Paw (paused check + preview), or a reason it does not. */
    async splitIsSafe(shelter: ShelterOnchainConfig): Promise<{ ok: boolean; why?: string }> {
        const split = shelter.splitAddress!;
        try {
            const paused = shelterSplitInterface.decodeFunctionResult(
                'paused',
                await this.chain.ethCall(shelter, split, shelterSplitInterface.encodeFunctionData('paused'))
            )[0];
            if (paused) return { ok: false, why: 'split is paused' };
            const p = shelterSplitInterface.decodeFunctionResult(
                'preview',
                await this.chain.ethCall(
                    shelter,
                    split,
                    shelterSplitInterface.encodeFunctionData('preview', [WEI_PER_USD])
                )
            );
            const pays = (p.wallets as string[])
                .map((w, k) => [String(w).toLowerCase(), p.amounts[k]])
                .filter(([, a]) => BigInt(a) > 0n);
            const ok =
                BigInt(p.toTreasury) === 0n &&
                pays.length === 1 &&
                String(pays[0][0]).toLowerCase() === MOTORED_SHELTER.toLowerCase() &&
                BigInt(pays[0][1]) === WEI_PER_USD;
            return ok ? { ok: true } : { ok: false, why: 'split does not pay 100% to Pink Paw right now' };
        } catch {
            return { ok: false, why: 'could not read the split' };
        }
    }

    /** Send every `due`/`failed` gift within the daily cap: funder -> wallet, then wallet -> donate(). */
    private async send(now: Date, shelter: ShelterOnchainConfig, cfg: MotoredConfig, result: MotoredGiftRun) {
        const safe = await this.splitIsSafe(shelter);
        if (!safe.ok) {
            this.logger.warn(`motored: ${safe.why}; no gifts this run`);
            return;
        }
        await this.checkFunder(shelter, cfg);

        const capCents = Math.round(cfg.dailyCapUsd * 100);
        let todayGiven = await this.todayGivenCents(now);
        const rows: any[] = await this.gifts.find({ state: 'due' }).sort({ createdAt: 1 }).limit(MOTORED_BATCH).lean();
        for (const row of rows) {
            if (capCents && todayGiven + Number(row.amountUsdCents) > capCents) {
                this.logger.warn(`motored: daily cap ${cfg.dailyCapUsd} USDC reached; the rest wait as due`);
                break;
            }
            const locked: any = await this.gifts.findOneAndUpdate(
                { _id: row._id, state: { $in: ['due', 'failed'] } },
                { $set: { state: 'sending', lockedAt: now } },
                { new: true, lean: true }
            );
            if (!locked) continue;
            try {
                await this.sendOne(locked, shelter, cfg);
                todayGiven += Number(locked.amountUsdCents);
                result.sent++;
            } catch (error) {
                const ambiguous = error instanceof DonationBroadcastError && !error.definite;
                if (ambiguous) {
                    // Signed and maybe broadcast: it stays `sent` (or `sending`) and settles by receipt.
                    result.sent++;
                    continue;
                }
                await this.gifts.updateOne(
                    { _id: locked._id, state: 'sending' },
                    {
                        $set: { state: 'due', error: String((error as Error)?.message || error).slice(0, 200) },
                        $unset: { fundTxHash: 1, giftTxHash: 1, lockedAt: 1 },
                    }
                );
                result.failed++;
                this.logger.warn(`motored gift for user-${locked.n} not sent: ${(error as Error)?.message}`);
                // One definite failure usually means the funder or RPC is the problem for every row.
                return;
            }
        }
    }

    /** Fund the customer wallet (amount + gas reserve), then have it donate(); records both tx hashes. */
    private async sendOne(row: any, shelter: ShelterOnchainConfig, cfg: MotoredConfig) {
        const wallet: any = await this.wallets.findOne({ customerKey: row.customerKey }).lean();
        if (!wallet) throw new Error(`no wallet for customerKey ${row.customerKey}`);
        const walletCfg: ShelterOnchainConfig = {
            ...shelter,
            privateKey: decryptWalletKey(wallet.encryptedKey, cfg.walletKek!),
        };
        const funderCfg: ShelterOnchainConfig = { ...shelter, privateKey: cfg.funderKey! };

        const gasPrice = (await this.chain.gasPrice(shelter).catch(() => null)) ?? 1n;
        const gas = motoredGasTerms({ gasPriceWei: gasPrice, donateEstimate: MOTORED_DONATE_ESTIMATE });
        const amountWei = centsWei(Number(row.amountUsdCents));
        // The wallet keeps a small gas buffer between orders (Sweeps), so fund amount + gas reserve.
        const gasReserveWei = BigInt(gas.donateGasLimit + gas.fundGasLimit) * gas.feeCapWei;
        const fundValue = amountWei + gasReserveWei;

        const fund = await this.chain.sendContractCall(wallet.address, '0x', fundValue, {
            config: funderCfg,
            onSigned: async tx => {
                await this.gifts.updateOne({ _id: row._id, state: 'sending' }, { $set: { fundTxHash: tx.hash } });
            },
        });
        const fundReceipt = await this.chain.waitForReceipt(shelter, fund.txHash, 60000);
        if (!fundReceipt || fundReceipt.status !== 1) {
            throw new Error('fund not mined');
        }
        await this.chain.sendDonation(walletCfg, row.memo, amountWei, async tx => {
            await this.gifts.updateOne(
                { _id: row._id, state: 'sending' },
                {
                    $set: {
                        state: 'sent',
                        sentAt: new Date(),
                        giftTxHash: tx.hash,
                        nonce: tx.nonce,
                        walletAddress: tx.from,
                    },
                }
            );
        });
    }
}

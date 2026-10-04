import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { MaxUint256 } from 'ethers';
import { Model } from 'mongoose';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import {
    DISBURSED_TOPIC,
    DonationBroadcastError,
    hotWalletAddress,
    ShelterChain,
    shelterSplitInterface,
    TOKEN_BATCH_TOPIC,
} from 'src/shelter/onchain/shelter-chain';
import { readShelterConfig, ShelterOnchainConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { CryptoCheckout, CryptoCheckoutDocument, ShelterShareTier } from './crypto-checkout.schema';
import { erc20PayInterface } from './crypto-evm';
import { CryptoPayConfig, readCryptoPayConfig } from './crypto-pay.config';

/*
 * Shelter share of a shelter cat bought on the treasury route (before the handover, or on a chain
 * without the shelter's split). The buyer paid the Token Tails treasury (commerce); this keeper pays
 * the shelter its share from Token Tails' own hot-wallet float through ShelterSplit.disburse on the
 * main shelter chain (SHELTER_CHAIN_ID), memo `tt:cat:<16 hex>`, so the payout is a public on-chain
 * event like every other shelter payout. The treasury tops the float up; the hot wallet never receives
 * buyer money.
 *
 * Custody: before the handover the split pays the wallet Token Tails holds for the shelter, so the
 * share is `onchain-custodial` (disclosed, like treats and the match); after it, `onchain-shelter-held`.
 * The tier is read from the receipt, not from the config at settle time: a share sent just before the
 * handover and settled after it went to the held wallet, so it stays custodial (shareTier).
 *
 * Off unless CRYPTO_PAY_SHELTER_SHARE_ENABLED=true and the main shelter config has an RPC, the split and
 * the hot wallet key. One send per row; a send whose fate is unknown is never repeated automatically:
 * it stays `sent` until its receipt settles it, and a reverted send goes back to `due` at most twice.
 *
 * What reached the shelter is read from the receipt: ShelterSplit pays its shelters only their
 * registered bps and the rest to its own treasury, so a confirmed row stores the batch's `toShelters`
 * (`amountBase`, `amountUsdCents`), never the amount sent (`sentBase`).
 */

export const SHELTER_SHARE_JOB = 'crypto-shelter-share';
export const SHELTER_SHARE_CRON = '*/5 * * * *';
export const SHELTER_SHARE_LEASE_MS = 4 * 60 * 1000;
export const SHELTER_SHARE_BATCH = 10;
export const SHELTER_SHARE_MAX_ATTEMPTS = 3;
/** A `sent` share with no receipt after this long and a used nonce is `failed` for a person to check. */
export const SHELTER_SHARE_STUCK_MS = 30 * 60 * 1000;

export interface ShelterShareRun {
    sent: number;
    confirmed: number;
    failed: number;
    skipped: string | null;
}

@Injectable()
export class CryptoShelterShareService {
    private readonly logger = new Logger(CryptoShelterShareService.name);

    constructor(
        @InjectModel(CryptoCheckout.name) private checkoutModel: Model<CryptoCheckoutDocument>,
        private chain: ShelterChain
    ) {}

    @Cron(SHELTER_SHARE_CRON, { name: SHELTER_SHARE_JOB })
    async cron() {
        if (!readCryptoPayConfig().shelterShareEnabled) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.checkoutModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: SHELTER_SHARE_JOB,
            ttlMs: SHELTER_SHARE_LEASE_MS,
            logger: this.logger,
            run: () => this.runOnce(),
        });
    }

    async runOnce(
        now: Date = new Date(),
        cfg: CryptoPayConfig = readCryptoPayConfig(),
        shelter: ShelterOnchainConfig = readShelterConfig()
    ): Promise<ShelterShareRun> {
        const result: ShelterShareRun = { sent: 0, confirmed: 0, failed: 0, skipped: null };
        if (!cfg.shelterShareEnabled) {
            return { ...result, skipped: 'disabled' };
        }
        const hot = hotWalletAddress(shelter);
        if (!shelter.rpcUrl || !shelter.splitAddress || !hot) {
            return { ...result, skipped: 'not-ready' };
        }
        const held = new Set([...cfg.heldWallets, ...shelter.heldWallets].map(w => w.toLowerCase()));
        await this.unlockStale(now);
        await this.settle(now, shelter, hot, cfg.handedOver, held, result);
        await this.send(now, shelter, hot, result);
        return result;
    }

    /**
     * A row left `sending` with no hash (the process died between taking it and signing) was never
     * broadcast: the hash is stored before anything leaves the process. It goes back to `due`.
     */
    private async unlockStale(now: Date) {
        const before = new Date(now.getTime() - SHELTER_SHARE_STUCK_MS);
        await this.checkoutModel.updateMany(
            {
                'shelterShare.state': 'sending',
                'shelterShare.txHash': { $exists: false },
                $or: [
                    { 'shelterShare.lockedAt': { $lt: before } },
                    { 'shelterShare.lockedAt': { $exists: false }, updatedAt: { $lt: before } },
                ],
            },
            { $set: { 'shelterShare.state': 'due' }, $unset: { 'shelterShare.lockedAt': 1 } }
        );
    }

    private async settle(
        now: Date,
        shelter: ShelterOnchainConfig,
        hot: string,
        handedOver: boolean,
        held: ReadonlySet<string>,
        result: ShelterShareRun
    ) {
        const rows: any[] = await this.checkoutModel
            .find({ 'shelterShare.state': 'sent' })
            .limit(SHELTER_SHARE_BATCH)
            .lean();
        for (const row of rows) {
            const share = row.shelterShare;
            let receipt;
            try {
                receipt = await this.chain.getReceipt(shelter, share.txHash);
            } catch {
                continue;
            }
            if (receipt && receipt.status === 1) {
                const toShelters = batchToShelters(receipt.logs || [], shelter.splitAddress!, share.memo);
                if (toShelters === null) {
                    await this.checkoutModel.updateOne(
                        { _id: row._id, 'shelterShare.state': 'sent' },
                        {
                            $set: {
                                'shelterShare.state': 'failed',
                                'shelterShare.error': 'mined without a DisbursementBatch for this memo: check by hand',
                            },
                        }
                    );
                    result.failed++;
                    continue;
                }
                const decimals = Number(share.decimals ?? 6);
                const tier = shareTier(
                    handedOver,
                    disbursedShelters(receipt.logs || [], shelter.splitAddress!, share.memo),
                    held
                );
                await this.checkoutModel.updateOne(
                    { _id: row._id, 'shelterShare.state': 'sent' },
                    {
                        $set: {
                            'shelterShare.state': 'confirmed',
                            'shelterShare.evidenceTier': tier,
                            'shelterShare.confirmedAt': now,
                            'shelterShare.amountBase': toShelters.toString(),
                            'shelterShare.amountUsdCents':
                                decimals >= 2 ? Number(toShelters / BigInt(10) ** BigInt(decimals - 2)) : null,
                        },
                    }
                );
                result.confirmed++;
            } else if (receipt) {
                const attempts = (share.attempts || 0) + 1;
                const again = attempts < SHELTER_SHARE_MAX_ATTEMPTS;
                await this.checkoutModel.updateOne(
                    { _id: row._id, 'shelterShare.state': 'sent' },
                    {
                        $set: {
                            'shelterShare.state': again ? 'due' : 'failed',
                            'shelterShare.attempts': attempts,
                            'shelterShare.error': 'reverted',
                        },
                        $unset: { 'shelterShare.txHash': 1, 'shelterShare.nonce': 1 },
                    }
                );
                if (!again) result.failed++;
            } else if (now.getTime() - new Date(share.sentAt).getTime() > SHELTER_SHARE_STUCK_MS) {
                // No receipt: only once the nonce is used by another transaction is it certainly dropped.
                const mined = await this.chain.minedNonce(shelter, hot).catch(() => -1);
                if (mined > Number(share.nonce)) {
                    await this.checkoutModel.updateOne(
                        { _id: row._id, 'shelterShare.state': 'sent' },
                        { $set: { 'shelterShare.state': 'failed', 'shelterShare.error': 'dropped: check by hand' } }
                    );
                    result.failed++;
                }
            }
        }
    }

    private async send(now: Date, shelter: ShelterOnchainConfig, hot: string, result: ShelterShareRun) {
        const split = shelter.splitAddress!;
        let token: string;
        let decimals: number;
        let allowance: bigint;
        try {
            token = String(
                shelterSplitInterface.decodeFunctionResult(
                    'token',
                    await this.chain.ethCall(shelter, split, shelterSplitInterface.encodeFunctionData('token', []))
                )[0]
            );
            decimals = Number(
                erc20PayInterface.decodeFunctionResult(
                    'decimals',
                    await this.chain.ethCall(shelter, token, erc20PayInterface.encodeFunctionData('decimals', []))
                )[0]
            );
            allowance = BigInt(
                erc20PayInterface.decodeFunctionResult(
                    'allowance',
                    await this.chain.ethCall(
                        shelter,
                        token,
                        erc20PayInterface.encodeFunctionData('allowance', [hot, split])
                    )
                )[0]
            );
        } catch (error) {
            this.logger.warn(`shelter share: could not read the split token: ${(error as Error)?.message}`);
            return;
        }

        const rows: any[] = await this.checkoutModel
            .find({ 'shelterShare.state': 'due' })
            .sort({ updatedAt: 1 })
            .limit(SHELTER_SHARE_BATCH)
            .lean();
        for (const row of rows) {
            const cents = Number(row.shelterShare?.amountUsdCents);
            if (!Number.isSafeInteger(cents) || cents <= 0 || decimals < 2) {
                await this.checkoutModel.updateOne(
                    { _id: row._id, 'shelterShare.state': 'due' },
                    { $set: { 'shelterShare.state': 'failed', 'shelterShare.error': 'no amount' } }
                );
                result.failed++;
                continue;
            }
            const amount = BigInt(cents) * BigInt(10) ** BigInt(decimals - 2);
            const locked = await this.checkoutModel.findOneAndUpdate(
                { _id: row._id, 'shelterShare.state': 'due' },
                { $set: { 'shelterShare.state': 'sending', 'shelterShare.lockedAt': now } },
                { new: true, lean: true }
            );
            if (!locked) continue;
            try {
                if (allowance < amount) {
                    const approve = await this.chain.sendContractCall(
                        token,
                        erc20PayInterface.encodeFunctionData('approve', [split, MaxUint256]),
                        BigInt(0),
                        { config: shelter }
                    );
                    const mined = await this.chain.waitForReceipt(shelter, approve.txHash, 60000);
                    if (!mined || mined.status !== 1) {
                        throw new Error('approve not mined');
                    }
                    allowance = MaxUint256;
                }
                const memo = row.shelterShare.memo;
                await this.chain.sendContractCall(
                    split,
                    shelterSplitInterface.encodeFunctionData('disburse', [amount, memo]),
                    BigInt(0),
                    {
                        config: shelter,
                        onSigned: async tx => {
                            await this.checkoutModel.updateOne(
                                { _id: row._id, 'shelterShare.state': 'sending' },
                                {
                                    $set: {
                                        'shelterShare.state': 'sent',
                                        'shelterShare.txHash': tx.hash,
                                        'shelterShare.nonce': tx.nonce,
                                        'shelterShare.from': tx.from,
                                        'shelterShare.chainId': shelter.chainId,
                                        'shelterShare.sentBase': amount.toString(),
                                        'shelterShare.decimals': decimals,
                                        'shelterShare.sentAt': now,
                                    },
                                }
                            );
                        },
                    }
                );
                allowance -= amount;
                result.sent++;
            } catch (error) {
                const ambiguous = error instanceof DonationBroadcastError && !error.definite;
                if (ambiguous) {
                    // Signed and maybe broadcast: it stays `sent` and the next run settles it by receipt.
                    result.sent++;
                    continue;
                }
                await this.checkoutModel.updateOne(
                    { _id: row._id, 'shelterShare.state': { $in: ['sending', 'sent'] } },
                    {
                        $set: {
                            'shelterShare.state': 'due',
                            'shelterShare.error': String((error as Error)?.message || error).slice(0, 200),
                        },
                        $unset: { 'shelterShare.txHash': 1, 'shelterShare.nonce': 1 },
                    }
                );
                this.logger.warn(`shelter share of ${row.orderId} not sent: ${(error as Error)?.message}`);
                // One failure stops the run: the float or the RPC is probably the problem for every row.
                return;
            }
        }
    }
}

/**
 * `toShelters` of the split's DisbursementBatch with this memo in a receipt, or null when there is
 * none. Only logs emitted by the split itself count.
 */
export function batchToShelters(
    logs: readonly { address: string; topics: readonly string[]; data: string }[],
    split: string,
    memo: string
): bigint | null {
    for (const log of logs) {
        if (String(log.address).toLowerCase() !== split.toLowerCase()) continue;
        if (String(log.topics?.[0] || '').toLowerCase() !== TOKEN_BATCH_TOPIC) continue;
        try {
            const parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed && String(parsed.args.memo) === memo) {
                return BigInt(parsed.args.toShelters);
            }
        } catch {
            // Not a batch event.
        }
    }
    return null;
}

/**
 * The shelter wallets (lowercased) the split paid in a receipt: its `Disbursed(shelter, amount, memo)`
 * events with this memo. Only logs emitted by the split itself count.
 */
export function disbursedShelters(
    logs: readonly { address: string; topics: readonly string[]; data: string }[],
    split: string,
    memo: string
): string[] {
    const out: string[] = [];
    for (const log of logs) {
        if (String(log.address).toLowerCase() !== split.toLowerCase()) continue;
        if (String(log.topics?.[0] || '').toLowerCase() !== DISBURSED_TOPIC) continue;
        try {
            const parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed && String(parsed.args.memo) === memo) {
                out.push(String(parsed.args.shelter).toLowerCase());
            }
        } catch {
            // Not a Disbursed event.
        }
    }
    return out;
}

/**
 * A settled share's evidence tier. `onchain-shelter-held` only when the shelter holds its key now AND
 * no wallet the split paid is one Token Tails holds; a share sent before the handover (paid to the
 * held wallet) stays `onchain-custodial` even when its receipt is read after it.
 */
export function shareTier(handedOver: boolean, paid: readonly string[], held: ReadonlySet<string>): ShelterShareTier {
    if (!handedOver) return 'onchain-custodial';
    return paid.some(wallet => held.has(wallet.toLowerCase())) ? 'onchain-custodial' : 'onchain-shelter-held';
}

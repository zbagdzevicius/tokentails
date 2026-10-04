import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { impactJobsEnabled } from 'src/impact/impact.config';
import { ILeaseCollection, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { ShelterChain } from './shelter-chain';
import { ShelterDonateService } from './shelter-donate.service';
import {
    readRelayChainConfigs,
    readShelterConfig,
    readTryShelterConfig,
    ShelterOnchainConfig,
} from './shelter-onchain.config';
import { ShelterDonation, ShelterDonationDocument, ShelterDonationStatus } from './shelter-onchain.schema';
import { MatchRunResult, ShelterMatchService } from './shelter-match.service';
import { ShelterRelayService } from './shelter-relay.service';

export const DONATE_RECONCILE_JOB = 'shelter-donate-reconcile';
export const DONATE_RECONCILE_CRON = '*/2 * * * *';
export const DONATE_RECONCILE_LEASE_MS = 90 * 1000;
/**
 * A signed gift with no receipt after this long is FAILED (`timeout`) once its nonce is used by another
 * transaction; a PENDING row that never signed is FAILED (`stuck-pending`).
 */
export const DONATE_RECONCILE_TIMEOUT_MS = 30 * 60 * 1000;
/** Rows per run, least recently checked first; the next run continues. */
export const DONATE_RECONCILE_BATCH = 200;

export interface ReconcileResult {
    confirmed: number;
    failed: number;
    released: number;
    skipped: number;
    /** Present when the relay is wired in: relays settled this run. */
    relay?: { confirmed: number; failed: number };
    /** Present when the match is wired in: the router scan, matches and the flush keeper. */
    match?: MatchRunResult;
    /** The same two steps on the try-it testnet, when SHELTER_TRY_CHAIN_ID is set. */
    tryRelay?: { confirmed: number; failed: number };
    tryMatch?: MatchRunResult;
    /** The same steps per SHELTER_RELAY_CHAINS chain, keyed by chain id. */
    chains?: Record<number, { relay?: { confirmed: number; failed: number }; match?: MatchRunResult }>;
}

/**
 * Settles server-paid treats against the chain (plan F7.4, fixes the BACKEND.md "slot stays used"
 * issue). A gift's hash, nonce and sender are stored before it is broadcast (ShelterChain.sendDonation),
 * so every gift that can be mined has a row that knows it.
 *
 * - SENT (or PENDING with a hash: a crash or a lost answer around the broadcast) with a success
 *   receipt: CONFIRMED.
 * - With a status-0 receipt: FAILED `reverted`.
 * - No receipt after 30 minutes: FAILED `timeout` only once the hot wallet's mined nonce is past the
 *   gift's nonce and the receipt is still missing. A nonce is used once, so that gift can never be
 *   mined and its slots are safe to give back. Until then (still in a mempool, dropped by one node but
 *   alive on another, or never broadcast and its nonce not reused yet) it stays as it is with its slots,
 *   so a retry can never put a second paid gift behind it. A legacy row without a nonce learns it from
 *   the node, or stays.
 * - PENDING without a hash for 30 minutes (the process died before signing): FAILED `stuck-pending`;
 *   nothing was signed, so nothing can be mined.
 * - A FAILED row that still holds a budget slot gives it back when the failure is on its own UTC day,
 *   and the user's day is free again (the next gift reuses the row).
 *
 * Unsettled rows are visited least recently checked first (`lastCheckedAt`), so rows that stay pending
 * never starve newer ones. Every transition is conditional on the current status, so a second run is a
 * no-op. An RPC error skips the row: a gift is never failed because the chain could not be asked.
 */
@Injectable()
export class ShelterDonateReconcileService {
    private readonly logger = new Logger(ShelterDonateReconcileService.name);

    constructor(
        @InjectModel(ShelterDonation.name) private donationModel: Model<ShelterDonationDocument>,
        private donateService: ShelterDonateService,
        private chain: ShelterChain,
        private relayService?: ShelterRelayService,
        private matchService?: ShelterMatchService
    ) {}

    @Cron(DONATE_RECONCILE_CRON, { name: DONATE_RECONCILE_JOB })
    async cron() {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.donationModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: DONATE_RECONCILE_JOB,
            ttlMs: DONATE_RECONCILE_LEASE_MS,
            logger: this.logger,
            run: () => this.reconcileOnce(),
        });
    }

    async reconcileOnce(
        now: Date = new Date(),
        config: ShelterOnchainConfig = readShelterConfig(),
        tryConfig: ShelterOnchainConfig | null = readTryShelterConfig(),
        chainConfigs: ShelterOnchainConfig[] = readRelayChainConfigs()
    ): Promise<ReconcileResult> {
        const result: ReconcileResult = { confirmed: 0, failed: 0, released: 0, skipped: 0 };
        const cutoff = new Date(now.getTime() - DONATE_RECONCILE_TIMEOUT_MS);

        // Each treat is settled on its own chain: the main one, or the SHELTER_RELAY_CHAINS entry it was
        // sent on (a picked network). A row whose chain is no longer configured is skipped, never failed.
        const treatConfigFor = (row: any): ShelterOnchainConfig | null => {
            const id = Number(row?.chainId);
            if (!id || id === config.chainId) {
                return config.rpcUrl ? config : null;
            }
            const other = chainConfigs.find(c => c.chainId === id);
            return other?.rpcUrl ? other : null;
        };
        if (config.rpcUrl || chainConfigs.some(c => c.rpcUrl)) {
            const unsettled: any[] = await this.donationModel
                .find({
                    $or: [
                        { status: ShelterDonationStatus.SENT },
                        { status: ShelterDonationStatus.PENDING, txHash: { $exists: true } },
                    ],
                })
                .sort({ lastCheckedAt: 1, _id: 1 })
                .limit(DONATE_RECONCILE_BATCH)
                .lean();
            for (const row of unsettled || []) {
                await this.donationModel.updateOne(
                    { _id: row._id },
                    { $set: { lastCheckedAt: now } },
                    { timestamps: false }
                );
                const rowConfig = treatConfigFor(row);
                if (!rowConfig) {
                    result.skipped++;
                    continue;
                }
                await this.settle(row, rowConfig, now, cutoff, result);
            }
        }

        const stuck: any[] = await this.donationModel
            .find(
                { status: ShelterDonationStatus.PENDING, txHash: { $exists: false }, updatedAt: { $lt: cutoff } },
                { _id: 1 }
            )
            .limit(DONATE_RECONCILE_BATCH)
            .lean();
        for (const row of stuck || []) {
            if (await this.donateService.markFailed(row._id, 'stuck-pending', now, [ShelterDonationStatus.PENDING])) {
                result.failed++;
            }
        }

        const holding: any[] = await this.donationModel
            .find({ status: ShelterDonationStatus.FAILED, budgetSlot: true }, { _id: 1, day: 1 })
            .limit(DONATE_RECONCILE_BATCH)
            .lean();
        for (const row of holding || []) {
            if (await this.donateService.releaseBudgetSlot(row._id, row.day, now)) {
                result.released++;
            }
        }

        // Wallet gifts (F2): settle relays, scan RouterDonation into matches, send them, flush the
        // router. Each step is isolated: a failure there never undoes the treat work above.
        if (this.relayService) {
            try {
                result.relay = await this.relayService.confirmPending(config, now);
            } catch (error: any) {
                this.logger.warn(`relay reconcile failed: ${error?.code || error?.name || 'unknown error'}`);
            }
        }
        if (this.matchService) {
            try {
                result.match = await this.matchService.runOnce(now, config);
            } catch (error: any) {
                this.logger.warn(`match reconcile failed: ${error?.code || error?.name || 'unknown error'}`);
            }
        }
        // The try-it testnet (SHELTER_TRY_*): its own relays and matches, same steps, own counters.
        if (tryConfig) {
            if (this.relayService) {
                try {
                    result.tryRelay = await this.relayService.confirmPending(tryConfig, now);
                } catch (error: any) {
                    this.logger.warn(`try relay reconcile failed: ${error?.code || error?.name || 'unknown error'}`);
                }
            }
            if (this.matchService) {
                try {
                    result.tryMatch = await this.matchService.runOnce(now, tryConfig);
                } catch (error: any) {
                    this.logger.warn(`try match reconcile failed: ${error?.code || error?.name || 'unknown error'}`);
                }
            }
        }
        // Multi-chain relay (SHELTER_RELAY_CHAINS): each chain's relays and matches, isolated per chain.
        for (const chainConfig of chainConfigs) {
            const out: { relay?: { confirmed: number; failed: number }; match?: MatchRunResult } = {};
            if (this.relayService) {
                try {
                    out.relay = await this.relayService.confirmPending(chainConfig, now);
                } catch (error: any) {
                    this.logger.warn(
                        `relay reconcile on ${chainConfig.chainId} failed: ${
                            error?.code || error?.name || 'unknown error'
                        }`
                    );
                }
            }
            if (this.matchService) {
                try {
                    out.match = await this.matchService.runOnce(now, chainConfig);
                } catch (error: any) {
                    this.logger.warn(
                        `match reconcile on ${chainConfig.chainId} failed: ${
                            error?.code || error?.name || 'unknown error'
                        }`
                    );
                }
            }
            result.chains = { ...(result.chains || {}), [chainConfig.chainId]: out };
        }
        return result;
    }

    private async settle(row: any, config: ShelterOnchainConfig, now: Date, cutoff: Date, result: ReconcileResult) {
        const from = [ShelterDonationStatus.SENT, ShelterDonationStatus.PENDING];
        let receipt = await this.receipt(config, row.txHash, result);
        if (receipt === undefined) {
            return;
        }
        if (!receipt) {
            if (new Date(row.signedAt || row.sentAt || row.updatedAt) >= cutoff) {
                return;
            }
            // 30 minutes without a receipt. Only a used nonce proves the gift can never be mined.
            const used = await this.nonceUsed(row, config, result);
            if (!used) {
                return;
            }
            // The nonce may have been used by this very gift between the two calls: ask once more.
            receipt = await this.receipt(config, row.txHash, result);
            if (receipt === undefined) {
                return;
            }
        }
        if (receipt && receipt.status === 1) {
            const updated = await this.donationModel.findOneAndUpdate(
                { _id: row._id, status: { $in: from } },
                {
                    $set: {
                        status: ShelterDonationStatus.CONFIRMED,
                        confirmedAt: now,
                        ...(row.sentAt ? {} : { sentAt: row.signedAt || now }),
                        ...(typeof receipt.blockNumber === 'number' ? { blockNumber: receipt.blockNumber } : {}),
                    },
                }
            );
            result.confirmed += updated ? 1 : 0;
            return;
        }
        const reason = receipt && receipt.status === 0 ? 'reverted' : 'timeout';
        result.failed += Number(await this.donateService.markFailed(row._id, reason, now, from));
        if (await this.donateService.releaseBudgetSlot(row._id, row.day, now)) {
            result.released++;
        }
    }

    /** The receipt, null when there is none yet, undefined when the RPC could not be asked (skipped). */
    private async receipt(
        config: ShelterOnchainConfig,
        txHash: string,
        result: ReconcileResult
    ): Promise<{ status?: number | null; blockNumber?: number } | null | undefined> {
        try {
            return (await this.chain.getReceipt(config, txHash)) || null;
        } catch (error: any) {
            this.logger.warn(`receipt lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            result.skipped++;
            return undefined;
        }
    }

    /**
     * Whether the hot wallet has mined a transaction at or past this gift's nonce. False (the gift is
     * kept) when that is not proven: the nonce is free, the row has no nonce and the node no longer
     * knows the transaction, or the RPC failed.
     */
    private async nonceUsed(row: any, config: ShelterOnchainConfig, result: ReconcileResult): Promise<boolean> {
        try {
            let nonce: number | undefined = typeof row.txNonce === 'number' ? row.txNonce : undefined;
            let sender: string | undefined = typeof row.txFrom === 'string' ? row.txFrom : undefined;
            if (nonce === undefined || !sender) {
                // A row written before nonces were stored: the node may still know the transaction.
                const known: any = await this.chain.getTransaction(config, row.txHash);
                if (typeof known?.nonce !== 'number' || typeof known?.from !== 'string') {
                    this.logger.warn(`treat ${row._id} has no receipt and no known nonce: kept for a manual check`);
                    result.skipped++;
                    return false;
                }
                nonce = known.nonce;
                sender = String(known.from).toLowerCase();
                await this.donationModel.updateOne(
                    { _id: row._id },
                    { $set: { txNonce: nonce, txFrom: sender } },
                    { timestamps: false }
                );
            }
            const mined = await this.chain.minedNonce(config, sender!);
            if (mined > nonce!) {
                return true;
            }
            this.logger.warn(`treat ${row._id} has no receipt after 30 minutes and its nonce is unused: kept`);
            result.skipped++;
            return false;
        } catch (error: any) {
            this.logger.warn(`nonce lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            result.skipped++;
            return false;
        }
    }
}

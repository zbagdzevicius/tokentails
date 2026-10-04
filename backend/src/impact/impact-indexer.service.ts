import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { decodeRouterDonation } from 'src/shelter/onchain/donate-router';
import { batchPayerOf, hotWalletAddress, ShelterChain } from 'src/shelter/onchain/shelter-chain';
import { ownSenders } from 'src/shelter/onchain/shelter-match.service';
import { readShelterConfig, ShelterOnchainConfig } from 'src/shelter/onchain/shelter-onchain.config';
import {
    ShelterDonation,
    ShelterDonationDocument,
    ShelterMatch,
    ShelterMatchDocument,
    X402UsedTx,
    X402UsedTxDocument,
} from 'src/shelter/onchain/shelter-onchain.schema';
import { ILeaseCollection, isDuplicateKeyError, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { impactJobsEnabled, ImpactIndexerConfig, readIndexerConfig, REORG_DEPTH } from './impact.config';
import {
    ImpactChainCursor,
    ImpactChainCursorDocument,
    ShelterPayoutEvent,
    ShelterPayoutEventDocument,
} from './impact.schema';
import {
    AttributionLookups,
    attributePayout,
    decodePayoutLog,
    DecodedPayout,
    hasWalletMemo,
    isPayoutLog,
    needsSender,
    RpcLog,
    to18,
    unitsFor,
} from './shelter-logs';

export const IMPACT_INDEXER_JOB = 'impact-indexer';
export const IMPACT_INDEXER_CRON = '*/5 * * * *';
/** Shorter than the 5-minute interval, longer than a bounded run. */
export const IMPACT_INDEXER_LEASE_MS = 4 * 60 * 1000;
/** `direct` events this recent are attributed again, in case the donation row got its hash late. */
export const REATTRIBUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type IndexerState = 'not-deployed' | 'no-from-block' | 'indexed' | 'error';

export interface IndexResult {
    state: IndexerState;
    cursorId?: string;
    scannedFrom?: number;
    scannedTo?: number;
    inserted?: number;
    removed?: number;
    head?: number;
}

export const cursorIdFor = (chainId: number, contract: string) => `${chainId}:${contract.toLowerCase()}`;

/** The error class only, never the message (it can carry the RPC URL). */
export const errorClass = (error: unknown) =>
    String((error as { code?: string })?.code || (error as Error)?.name || 'Error').slice(0, 64);

/** Parses a Decimal128 sum of integers to a plain integer string; rejects anything else. */
export function decimalSumToString(value: unknown): string {
    const text = String(value ?? '0');
    if (/^\d+$/.test(text)) {
        return text;
    }
    const exp = /^(\d+)E\+(\d+)$/i.exec(text);
    if (exp) {
        return exp[1] + '0'.repeat(Number(exp[2]));
    }
    throw new Error(`non-integer payout total: ${text}`);
}

/**
 * Reads ShelterSplit's Disbursed and NativeDisbursed logs into `shelterpayoutevents` (plan F7.3).
 *
 * Leased every 5 minutes. Each run reads from the cursor minus REORG_DEPTH blocks in SHELTER_LOG_CHUNK
 * chunks: rows are upserted on `chainId + txHash + logIndex` (a rescan adds nothing), and a row in a
 * scanned range that the chain no longer returns is deleted only when its block is no longer canonical
 * (`eth_getBlockByNumber` hash differs from the stored one), so a lagging node's empty answer never
 * deletes real payouts. Totals are recomputed from the rows after every run. With no deployment
 * configured it does nothing and says so.
 */
@Injectable()
export class ImpactIndexerService {
    private readonly logger = new Logger(ImpactIndexerService.name);

    constructor(
        @InjectModel(ShelterPayoutEvent.name) private eventModel: Model<ShelterPayoutEventDocument>,
        @InjectModel(ImpactChainCursor.name) private cursorModel: Model<ImpactChainCursorDocument>,
        @InjectModel(ShelterDonation.name) private donationModel: Model<ShelterDonationDocument>,
        @InjectModel(X402UsedTx.name) private usedTxModel: Model<X402UsedTxDocument>,
        private chain: ShelterChain,
        @InjectModel(ShelterMatch.name) private matchModel?: Model<ShelterMatchDocument>
    ) {}

    @Cron(IMPACT_INDEXER_CRON, { name: IMPACT_INDEXER_JOB })
    async cron() {
        if (!impactJobsEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.eventModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: IMPACT_INDEXER_JOB,
            ttlMs: IMPACT_INDEXER_LEASE_MS,
            logger: this.logger,
            run: () => this.indexOnce(),
        });
    }

    async indexOnce(
        now: Date = new Date(),
        config: ShelterOnchainConfig = readShelterConfig(),
        indexer: ImpactIndexerConfig = readIndexerConfig()
    ): Promise<IndexResult> {
        if (!config.splitAddress || !config.rpcUrl) {
            return { state: 'not-deployed' };
        }
        if (indexer.fromBlock === null) {
            this.logger.warn('SHELTER_SPLIT_ADDRESS is set but SHELTER_SPLIT_FROM_BLOCK is not: indexer idle');
            return { state: 'no-from-block' };
        }
        const contract = config.splitAddress.toLowerCase();
        const cursorId = cursorIdFor(config.chainId, contract);
        await this.cursorModel.updateOne(
            { _id: cursorId },
            {
                $setOnInsert: {
                    chainId: config.chainId,
                    contract,
                    fromBlock: indexer.fromBlock,
                    lastScannedBlock: null,
                    totals: {},
                    eventCount: 0,
                },
            },
            { upsert: true }
        );
        const cursor = await this.cursorModel.findOne({ _id: cursorId }).lean();
        const lastScanned = typeof cursor?.lastScannedBlock === 'number' ? cursor.lastScannedBlock : null;
        const start =
            lastScanned === null ? indexer.fromBlock : Math.max(indexer.fromBlock, lastScanned - REORG_DEPTH + 1);

        const result: IndexResult = { state: 'indexed', cursorId, scannedFrom: start, inserted: 0, removed: 0 };
        const pawSenders = new Set<string>(
            [...(indexer.pawSenders || []), hotWalletAddress(config)].filter((a): a is string => !!a)
        );
        try {
            const head = await this.chain.blockNumber(config);
            result.head = head;
            let from = start;
            for (let chunk = 0; chunk < indexer.maxChunks && from <= head; chunk++) {
                const to = Math.min(from + indexer.chunk - 1, head);
                const logs = await this.chain.getPayoutLogs(config, from, to);
                const counts = await this.ingest(config, contract, from, to, logs || [], pawSenders);
                result.inserted! += counts.inserted;
                result.removed! += counts.removed;
                result.scannedTo = to;
                // Never move the cursor backwards (a lagging RPC can report a lower head).
                await this.cursorModel.updateOne(
                    { _id: cursorId, $or: [{ lastScannedBlock: null }, { lastScannedBlock: { $lt: to } }] },
                    { $set: { lastScannedBlock: to } }
                );
                from = to + 1;
            }
            await this.reattributeRecent(config, contract, now, pawSenders);
            await this.refreshTotals(cursorId, config.chainId, contract, { lastSuccessAt: now });
            return result;
        } catch (error) {
            this.logger.error(`impact indexer failed: ${errorClass(error)}`);
            await this.cursorModel.updateOne(
                { _id: cursorId },
                { $set: { lastErrorAt: now, lastError: errorClass(error) } }
            );
            return { ...result, state: 'error' };
        }
    }

    /** Upserts the payout logs of [from, to] and deletes rows in that range the chain no longer has. */
    private async ingest(
        config: ShelterOnchainConfig,
        contract: string,
        from: number,
        to: number,
        logs: RpcLog[],
        pawSenders: Set<string>
    ) {
        const chainId = config.chainId;
        const payouts: DecodedPayout[] = [];
        for (const log of logs) {
            if (log?.removed || !isPayoutLog(log) || String(log.address).toLowerCase() !== contract) {
                continue;
            }
            try {
                payouts.push(decodePayoutLog(log, chainId));
            } catch (error) {
                // Kept out of the totals but visible in the logs; a malformed log is never guessed at.
                this.logger.error(`undecodable payout log in ${log.transactionHash}: ${errorClass(error)}`);
            }
        }

        const lookups = await this.lookups(
            payouts.map(p => p.txHash),
            pawSenders,
            config.routerAddress,
            config
        );
        const senders = await this.pawMemoSenders(config, payouts);
        // A router gift can carry any memo: every payout no other source claims is checked once here.
        const unclaimed = payouts.filter(
            p =>
                hasWalletMemo(p.memo) ||
                (!needsSender(p.memo) &&
                    !lookups.donationSourceByTx.has(p.txHash.toLowerCase()) &&
                    !lookups.x402Txs.has(p.txHash.toLowerCase()))
        );
        const payers = await this.routerGifts(config, contract, unclaimed);
        let inserted = 0;
        for (const payout of payouts) {
            const txFrom = senders.get(payout.txHash) || null;
            const gift = payers.get(payout.txHash.toLowerCase());
            const payer = gift?.payer || null;
            const donor = gift?.donor || null;
            const filter = { chainId, txHash: payout.txHash, logIndex: payout.logIndex };
            const update = {
                $set: {
                    contract,
                    blockNumber: payout.blockNumber,
                    blockHash: payout.blockHash || undefined,
                    kind: payout.kind,
                    shelter: payout.shelter,
                    amount: payout.amount.toString(),
                    amount18: payout.amount18.toString(),
                    symbol: payout.symbol,
                    memo: payout.memo,
                    bucket: attributePayout({ ...payout, from: txFrom, payer, donor }, lookups),
                    ...(txFrom ? { txFrom } : {}),
                },
            };
            try {
                const res: any = await this.eventModel.updateOne(filter, update, { upsert: true });
                inserted += res?.upsertedCount || 0;
            } catch (error) {
                // Two writers raced on the unique index: the row exists, so update it instead.
                if (!isDuplicateKeyError(error)) {
                    throw error;
                }
                await this.eventModel.updateOne(filter, update);
            }
        }

        const keep = new Set(payouts.map(p => `${p.txHash}:${p.logIndex}`));
        const existing = await this.eventModel
            .find(
                { chainId, contract, blockNumber: { $gte: from, $lte: to } },
                { _id: 1, txHash: 1, logIndex: 1, blockNumber: 1, blockHash: 1 }
            )
            .lean();
        const missing = (existing || []).filter((row: any) => !keep.has(`${row.txHash}:${row.logIndex}`));
        const stale = await this.reorgedOut(config, missing);
        if (missing.length > stale.length) {
            // A load-balanced RPC can answer from a node that has not indexed these blocks yet; its
            // empty answer is not a reorg. The rows stay; the next run reads the window again.
            this.logger.warn(
                `${missing.length - stale.length} payout rows in blocks ${from}-${to} missing from eth_getLogs ` +
                    'but their block is still canonical or unknown to the node: kept'
            );
        }
        if (stale.length) {
            await this.eventModel.deleteMany({ _id: { $in: stale.map((row: any) => row._id) } });
        }
        return { inserted, removed: stale.length };
    }

    /**
     * The rows among `missing` that a reorg removed: their block is known to the node and its canonical
     * hash is not the one the row was indexed from. A row from a block the node does not have yet, or
     * whose block hash is unchanged, is kept (the RPC answered incompletely, the payout is real).
     */
    private async reorgedOut(config: ShelterOnchainConfig, missing: any[]): Promise<any[]> {
        if (!missing.length) {
            return [];
        }
        const heights: number[] = [...new Set<number>(missing.map((row: any) => Number(row.blockNumber)))];
        const canonical = new Map<number, string | null>();
        for (const height of heights) {
            canonical.set(height, await this.chain.blockHash(config, height));
        }
        return missing.filter((row: any) => {
            const hash = canonical.get(Number(row.blockNumber));
            if (!hash) {
                return false;
            }
            const stored = typeof row.blockHash === 'string' ? row.blockHash.toLowerCase() : null;
            return stored === null || stored !== hash;
        });
    }

    /**
     * Senders of the payouts whose memo claims to be a paw settlement, one `eth_getTransactionByHash`
     * per such transaction (a few a day). Unknown to the node: absent, so the payout stays `direct`
     * and `reattributeRecent` asks again. An RPC error fails the run (retried next tick).
     */
    private async pawMemoSenders(config: ShelterOnchainConfig, payouts: { txHash: string; memo: string }[]) {
        const senders = new Map<string, string>();
        // Paw settlements and Token Tails matches: both count only from a Token Tails sender.
        const txs = [...new Set(payouts.filter(p => needsSender(p.memo)).map(p => p.txHash.toLowerCase()))];
        for (const tx of txs) {
            const from = await this.chain.transactionSender(config, tx);
            if (from) {
                senders.set(tx, from);
            }
        }
        return senders;
    }

    /**
     * The split's batch payer and the router's RouterDonation donor of each given payout's transaction,
     * from its receipt (one call per transaction). Only asked once a router is configured. Unknown
     * receipt: absent, so the payout stays `direct` (wallet-memo rows are asked again later).
     */
    private async routerGifts(
        config: ShelterOnchainConfig,
        contract: string,
        payouts: { txHash: string }[]
    ): Promise<Map<string, { payer: string; donor: string | null }>> {
        const gifts = new Map<string, { payer: string; donor: string | null }>();
        if (!config.routerAddress) {
            return gifts;
        }
        const router = config.routerAddress.toLowerCase();
        const txs = [...new Set(payouts.map(p => p.txHash.toLowerCase()))];
        for (const tx of txs) {
            const receipt: any = await this.chain.getReceipt(config, tx);
            const payer = receipt ? batchPayerOf(receipt.logs || [], contract) : null;
            if (!payer) {
                continue;
            }
            let donor: string | null = null;
            for (const log of receipt.logs || []) {
                const decoded = decodeRouterDonation(log);
                if (decoded && decoded.router === router) {
                    donor = decoded.donor;
                    break;
                }
            }
            gifts.set(tx, { payer, donor });
        }
        return gifts;
    }

    async lookups(
        txHashes: string[],
        pawSenders: Set<string> = new Set(),
        router: string | null = null,
        config: ShelterOnchainConfig = readShelterConfig()
    ): Promise<AttributionLookups> {
        const txs = [...new Set(txHashes.map(tx => tx.toLowerCase()))];
        const donationSourceByTx = new Map<string, string>();
        const x402Txs = new Set<string>();
        const matchTxs = new Set<string>();
        const routerLc = router ? router.toLowerCase() : null;
        const notPublic = ownSenders(config);
        pawSenders.forEach(a => notPublic.add(a.toLowerCase()));
        if (!txs.length) {
            return { donationSourceByTx, x402Txs, pawSenders, matchTxs, router: routerLc, notPublic };
        }
        const [donations, used, matches] = await Promise.all([
            this.donationModel
                .find(
                    { $or: [{ txHash: { $in: txs } }, { 'attempts.txHash': { $in: txs } }] },
                    {
                        txHash: 1,
                        source: 1,
                        attempts: 1,
                    }
                )
                .lean(),
            this.usedTxModel.find({ txHash: { $in: txs } }, { txHash: 1 }).lean(),
            this.matchModel
                ? this.matchModel.find({ matchTxHash: { $in: txs } }, { matchTxHash: 1 }).lean()
                : Promise.resolve([]),
        ]);
        for (const row of (matches || []) as any[]) {
            if (typeof row.matchTxHash === 'string') {
                matchTxs.add(row.matchTxHash.toLowerCase());
            }
        }
        for (const row of (donations || []) as any[]) {
            for (const tx of [row.txHash, ...((row.attempts || []) as any[]).map(a => a?.txHash)]) {
                if (typeof tx === 'string' && txs.includes(tx.toLowerCase())) {
                    donationSourceByTx.set(tx.toLowerCase(), row.source);
                }
            }
        }
        for (const row of (used || []) as any[]) {
            if (typeof row.txHash === 'string') {
                x402Txs.add(row.txHash.toLowerCase());
            }
        }
        return { donationSourceByTx, x402Txs, pawSenders, matchTxs, router: routerLc, notPublic };
    }

    /**
     * Rows indexed as `direct` in the last 24 hours get another chance: an older gift row may have been
     * written after the index ran, and a paw-memo sender the node did not know yet may be known now.
     */
    private async reattributeRecent(
        config: ShelterOnchainConfig,
        contract: string,
        now: Date,
        pawSenders: Set<string>
    ) {
        const recent = await this.eventModel
            .find(
                {
                    chainId: config.chainId,
                    contract,
                    bucket: 'direct',
                    createdAt: { $gte: new Date(now.getTime() - REATTRIBUTE_WINDOW_MS) },
                },
                { _id: 1, txHash: 1, memo: 1, txFrom: 1, shelter: 1 }
            )
            .lean();
        if (!recent?.length) {
            return;
        }
        const lookups = await this.lookups(
            recent.map((row: any) => row.txHash),
            pawSenders,
            config.routerAddress,
            config
        );
        const unknown = (recent as any[]).filter(row => !row.txFrom);
        const senders = await this.pawMemoSenders(config, unknown);
        // Only wallet-memo rows: a free-form memo's receipt was read once at ingest and does not change.
        const payers = await this.routerGifts(
            config,
            contract,
            (recent as any[]).filter(row => hasWalletMemo(row.memo))
        );
        for (const row of recent as any[]) {
            const txFrom = row.txFrom || senders.get(String(row.txHash).toLowerCase()) || null;
            const gift = payers.get(String(row.txHash).toLowerCase());
            const bucket = attributePayout(
                { ...row, from: txFrom, payer: gift?.payer || null, donor: gift?.donor || null },
                lookups
            );
            if (bucket !== 'direct' || (txFrom && !row.txFrom)) {
                await this.eventModel.updateOne({ _id: row._id }, { $set: { bucket, ...(txFrom ? { txFrom } : {}) } });
            }
        }
    }

    /**
     * Standard x402 `exact` payments go straight to the shelter wallet (`payTo`), so ShelterSplit emits
     * nothing for them. They are added to the `x402` bucket from `X402UsedTx.amountBase` (USDC, 6
     * decimals, rescaled to 18), once per tx hash, and never when the same hash already has a split
     * event (de-duplicated against the indexed rows). Rows of this cursor's chain only; a row without
     * `chainId` counts on the chain it was recorded under, which is unknown, so it is skipped. Only rows
     * with `verifiedOnchain: true` count: the transfer was read back from the chain, not just reported
     * by the facilitator. Only the configured split's cursor is published (impact.service), so these
     * rows are counted once per chain.
     */
    private async addExactX402(totals: Record<string, Record<string, string>>, chainId: number, contract: string) {
        const rows: any[] = await this.usedTxModel
            .find({ scheme: 'exact', chainId, verifiedOnchain: true }, { txHash: 1, amountBase: 1 })
            .lean();
        if (!rows?.length) {
            return;
        }
        const seen = new Set<string>();
        const hashes = rows.map(row => String(row.txHash || '').toLowerCase()).filter(Boolean);
        const indexed: any[] = await this.eventModel
            .find({ chainId, contract, txHash: { $in: hashes } }, { txHash: 1 })
            .lean();
        for (const row of indexed || []) {
            seen.add(String(row.txHash).toLowerCase());
        }
        const symbol = unitsFor(chainId).symbol;
        let sum = BigInt(0);
        for (const row of rows) {
            const tx = String(row.txHash || '').toLowerCase();
            if (!tx || seen.has(tx) || !/^\d+$/.test(String(row.amountBase || ''))) {
                continue;
            }
            seen.add(tx);
            sum += to18(BigInt(row.amountBase), unitsFor(chainId).decimals);
        }
        if (sum > BigInt(0)) {
            totals.x402 = totals.x402 || {};
            totals.x402[symbol] = (BigInt(totals.x402[symbol] || '0') + sum).toString();
        }
    }

    /** Recomputes the cursor's cumulative totals from the rows, so they always equal the event log. */
    private async refreshTotals(cursorId: string, chainId: number, contract: string, extra: Record<string, unknown>) {
        const groups: { _id: { bucket: string; symbol: string }; total: unknown; count: number }[] =
            await this.eventModel
                .aggregate([
                    { $match: { chainId, contract } },
                    {
                        $group: {
                            _id: { bucket: '$bucket', symbol: '$symbol' },
                            total: { $sum: { $toDecimal: '$amount18' } },
                            count: { $sum: 1 },
                        },
                    },
                ])
                .exec();
        const totals: Record<string, Record<string, string>> = {};
        let eventCount = 0;
        for (const group of groups || []) {
            totals[group._id.bucket] = totals[group._id.bucket] || {};
            totals[group._id.bucket][group._id.symbol] = decimalSumToString(group.total);
            eventCount += group.count;
        }
        await this.addExactX402(totals, chainId, contract);
        const last: any = await this.eventModel
            .findOne({ chainId, contract }, { txHash: 1 })
            .sort({ blockNumber: -1, logIndex: -1 })
            .lean();
        await this.cursorModel.updateOne(
            { _id: cursorId },
            {
                $set: { totals, eventCount, ...(last?.txHash ? { lastTxHash: last.txHash } : {}), ...extra },
                $unset: { lastError: 1 },
            }
        );
    }
}

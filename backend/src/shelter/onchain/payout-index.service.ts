import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { impactJobsEnabled, REORG_DEPTH } from 'src/impact/impact.config';
import { decodePayoutLog, IMPACT_CHAIN_UNITS, isPayoutLog, RpcLog } from 'src/impact/shelter-logs';
import { ILeaseCollection, isDuplicateKeyError, JOB_RUNS_COLLECTION, runLeased } from 'src/shared/jobs/lease';
import { ShelterChain } from './shelter-chain';
import { logRpcFor, shelterConfigFor, ShelterOnchainConfig } from './shelter-onchain.config';
import {
    PayoutIndexNetwork,
    ShelterPayoutIndexCursor,
    ShelterPayoutIndexCursorDocument,
    ShelterPayoutLog,
    ShelterPayoutLogDocument,
} from './payout-index.schema';
import { CHAINS } from './wallet.config';

/*
 * Settings (all optional):
 *
 * - SHELTER_PAYOUTS_INDEX           'off' stops the cron on this instance. It otherwise runs wherever
 *                                   the impact jobs run (IMPACT_JOBS_ENABLED, impact.config.ts).
 * - SHELTER_PAYOUTS_INDEX_NETWORKS  'mainnet', 'testnet' or both (default), comma separated.
 * - SHELTER_PAYOUTS_INDEX_CHUNK     widest eth_getLogs window in blocks (default 10000). A chain's known
 *                                   cap (logRpcFor: Base 500, Monad's public RPC 100, Avalanche 2048)
 *                                   always applies, and a window the RPC refuses shrinks to the cap the
 *                                   RPC names (or halves).
 *
 * Every RPC is read only: eth_blockNumber, eth_getLogs, eth_getBlockByNumber, eth_getTransactionReceipt.
 */

export const PAYOUT_INDEX_JOB = 'shelter-payout-index';
export const PAYOUT_INDEX_CRON = '*/2 * * * *';
/** Shorter than the 2-minute interval. */
export const PAYOUT_INDEX_LEASE_MS = 110 * 1000;
/** A run stops starting new RPC calls after this long; the cursors keep what it read. */
export const PAYOUT_INDEX_RUN_BUDGET_MS = 90 * 1000;
export const DEFAULT_PAYOUT_INDEX_CHUNK = 10000;
/** eth_getLogs calls per contract per run, so one long backfill never starves the other chains. */
export const PAYOUT_INDEX_MAX_CHUNKS = 60;
/** The smallest window a refused range shrinks to. */
export const MIN_PAYOUT_INDEX_WINDOW = 50;
/**
 * The shortest gap between two calls to a chain's RPC, for public RPCs that refuse bursts: Arc
 * mainnet answers about two calls a second (client/components/shelter-payouts/chains.ts minCallGapMs).
 */
export const PAYOUT_INDEX_CALL_GAP_MS: Record<number, number> = { 5042: 500 };

/** GET /shelter/payouts paging. */
export const PAYOUTS_DEFAULT_LIMIT = 500;
export const PAYOUTS_MAX_LIMIT = 2000;
/** One answer per query is reused this long (the route's Cache-Control says the same to caches). */
export const PAYOUTS_CACHE_MS = 30 * 1000;
export const PAYOUTS_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';

export const PAYOUTS_ERROR = {
    NOT_INDEXED: 'PAYOUTS_NOT_INDEXED',
    UNAVAILABLE: 'PAYOUTS_INDEX_UNAVAILABLE',
} as const;

/** A recorded ShelterSplit the index reads. */
export interface PayoutIndexTarget {
    network: PayoutIndexNetwork;
    chainId: number;
    /** Lowercased. */
    contract: string;
    symbol: string;
    decimals: number;
    nativeSymbol: string;
    nativeDecimals: number;
    deployTx: string | null;
    fromBlock: number | null;
}

export interface PayoutIndexResult {
    cursorId: string;
    state: 'indexed' | 'no-from-block' | 'error';
    scannedFrom?: number;
    scannedTo?: number;
    head?: number;
    inserted?: number;
    removed?: number;
}

export interface PayoutsQuery {
    network: PayoutIndexNetwork;
    chainId?: number;
    /** Lowercased contract address. */
    address?: string;
    limit: number;
    cursor?: string;
}

export interface PublicPayoutEvent {
    chainId: number;
    contract: string;
    txHash: string;
    logIndex: number;
    blockNumber: number;
    /** Block time, unix seconds. */
    timestamp: number;
    shelter: string;
    kind: 'token' | 'native';
    /** Raw units (integer string) in `decimals`. */
    amount: string;
    decimals: number;
    symbol: string;
    /** `amount` at 18 decimals. */
    amount18: string;
    memo: string;
}

export interface IndexedThrough {
    /** Every block up to this one has been read (null before the first run). */
    block: number | null;
    /** That block's time, unix seconds. */
    time: number | null;
    /** When the index last finished a run on this contract (ISO), or null. */
    at: string | null;
}

export interface PayoutTotal {
    symbol: string;
    kind: 'token' | 'native';
    /** Raw units in `decimals`. */
    amount: string;
    decimals: number;
    amount18: string;
    count: number;
}

export interface PublicPayoutContract {
    chainId: number;
    contract: string;
    symbol: string;
    decimals: number;
    nativeSymbol: string;
    nativeDecimals: number;
    fromBlock: number;
    head: number | null;
    indexedThrough: IndexedThrough;
    /** True when the last run failed (the rows up to indexedThrough are still right). */
    lastRunFailed: boolean;
    count: number;
    totals: PayoutTotal[];
}

export interface PublicPayouts {
    network: PayoutIndexNetwork;
    generatedAt: string;
    /** What the numbers are: an index of public on-chain events, each linkable to its explorer. */
    source: 'index';
    contracts: PublicPayoutContract[];
    /** Per chain: the oldest indexedThrough among its contracts. */
    chains: { chainId: number; indexedThrough: IndexedThrough }[];
    /** Per symbol across the listed contracts, 18 decimals. Never summed across symbols. */
    totals: { symbol: string; amount18: string; count: number }[];
    count: number;
    events: PublicPayoutEvent[];
    /** Pass as `cursor` for the next (older) page; null on the last one. */
    nextCursor: string | null;
}

const NETWORKS: PayoutIndexNetwork[] = ['mainnet', 'testnet'];

export const payoutCursorId = (chainId: number, contract: string) => `${chainId}:${contract.toLowerCase()}`;

/** The networks this instance indexes (SHELTER_PAYOUTS_INDEX_NETWORKS; default both). */
export function payoutIndexNetworks(env: NodeJS.ProcessEnv = process.env): PayoutIndexNetwork[] {
    const raw = (env.SHELTER_PAYOUTS_INDEX_NETWORKS || '').trim().toLowerCase();
    if (!raw) {
        return [...NETWORKS];
    }
    const picked = raw.split(',').map(v => v.trim()) as PayoutIndexNetwork[];
    return NETWORKS.filter(n => picked.includes(n));
}

export function payoutIndexChunk(env: NodeJS.ProcessEnv = process.env): number {
    const n = Number((env.SHELTER_PAYOUTS_INDEX_CHUNK || '').trim());
    return Number.isSafeInteger(n) && n >= MIN_PAYOUT_INDEX_WINDOW ? Math.min(n, 100000) : DEFAULT_PAYOUT_INDEX_CHUNK;
}

export const payoutIndexCronEnabled = (env: NodeJS.ProcessEnv = process.env) =>
    (env.SHELTER_PAYOUTS_INDEX || '').trim().toLowerCase() !== 'off' && impactJobsEnabled(env);

/** Every ShelterSplit recorded in wallet.config.ts (default and other instances) of `networks`. */
export function payoutIndexTargets(networks: PayoutIndexNetwork[] = NETWORKS): PayoutIndexTarget[] {
    const out: PayoutIndexTarget[] = [];
    for (const chain of Object.values(CHAINS)) {
        if (!networks.includes(chain.network)) {
            continue;
        }
        // Not unitsFor: it reads an unlisted chain like Arc, whose native coin is USDC, so a new chain's
        // gas-coin payouts would add into the USDC totals. An unlisted chain's native coin gets its own
        // symbol instead.
        const units = IMPACT_CHAIN_UNITS[chain.chainId] || {
            nativeSymbol: `NATIVE-${chain.chainId}`,
            nativeDecimals: 18,
        };
        for (const split of [...(chain.split ? [chain.split] : []), ...(chain.otherSplits || [])]) {
            if (!/^0x[0-9a-f]{40}$/.test(split.address)) {
                continue;
            }
            out.push({
                network: chain.network,
                chainId: chain.chainId,
                contract: split.address.toLowerCase(),
                symbol: split.token.symbol,
                decimals: split.token.decimals,
                nativeSymbol: units.nativeSymbol,
                nativeDecimals: units.nativeDecimals,
                deployTx: split.deployTx || null,
                fromBlock: typeof split.fromBlock === 'number' ? split.fromBlock : null,
            });
        }
    }
    return out;
}

export interface PayoutIndexRpcs {
    chain: ShelterOnchainConfig;
    logs: ShelterOnchainConfig;
    window: number | null;
}

/** The RPCs for a chain: the configured one (an env override may name a paid RPC), else the recorded one. */
export function payoutIndexRpcs(
    chainId: number,
    contract: string,
    env: NodeJS.ProcessEnv = process.env
): PayoutIndexRpcs | null {
    const configured = shelterConfigFor(chainId, env);
    const recorded = Object.values(CHAINS).find(c => c.chainId === chainId);
    const rpcUrl = configured?.rpcUrl || recorded?.rpc || null;
    if (!rpcUrl) {
        return null;
    }
    const base = { chainId, rpcUrl, splitAddress: contract, logRpcUrl: configured?.logRpcUrl || null };
    const logRpc = logRpcFor(base as ShelterOnchainConfig);
    const chain = base as unknown as ShelterOnchainConfig;
    const logs = { ...base, rpcUrl: logRpc.url || rpcUrl } as unknown as ShelterOnchainConfig;
    return { chain, logs, window: logRpc.maxRange };
}

/** The block cap an RPC names in a range error ("limited to a 1,000 range", "maximum 1000 blocks"). */
export function rangeLimitFrom(message: string): number | null {
    const m =
        /(?:limited to a|maximum(?: of)?|max(?:imum)?(?: block)? range(?: of)?|up to(?: a)?|ranges over)\s*([\d,]+)\s*(?:range|blocks?|$)/i.exec(
            message || ''
        );
    const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
}

const errorText = (error: any) =>
    [error?.message, error?.error?.message, error?.info?.error?.message, error?.shortMessage]
        .filter(v => typeof v === 'string')
        .join(' ');

/** True for an eth_getLogs refusal about the block range (as opposed to a rate limit or an outage). */
export const isRangeError = (error: unknown) =>
    /range|too many blocks|block count|exceed|query returned more than|10,?000 results|limit/i.test(errorText(error)) &&
    !/rate|429|too many requests/i.test(errorText(error));

const errorClass = (error: unknown) =>
    String((error as { code?: string })?.code || (error as Error)?.name || 'Error').slice(0, 64);

const pad = (n: number, width: number) => String(Math.max(0, Math.floor(n))).padStart(width, '0');
export const sortKeyOf = (timestamp: number, chainId: number, block: number, logIndex: number) =>
    `${pad(timestamp, 12)}:${pad(chainId, 12)}:${pad(block, 14)}:${pad(logIndex, 8)}`;
const SORT_KEY = /^\d{12}:\d{12}:\d{14}:\d{8}$/;

export function decimalToString(value: unknown): string {
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
 * The public payout index (GET /shelter/payouts). Leased every 2 minutes: per recorded ShelterSplit, it
 * reads eth_getLogs from the cursor (minus REORG_DEPTH blocks) to the head in windows the RPC accepts,
 * stores each payout with its block time (upsert on chainId + txHash + logIndex, so a rescan adds
 * nothing), and deletes a row of a rescanned window only when the chain's canonical block hash at its
 * height differs from the stored one. Backfills from the deploy block on the first runs.
 */
@Injectable()
export class ShelterPayoutIndexService {
    private readonly logger = new Logger(ShelterPayoutIndexService.name);
    private readonly cache = new Map<string, { at: number; value: PublicPayouts }>();
    private readonly lastCall = new Map<number, number>();
    /** Test hooks. */
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    clock = () => Date.now();

    constructor(
        @InjectModel(ShelterPayoutLog.name) private logModel: Model<ShelterPayoutLogDocument>,
        @InjectModel(ShelterPayoutIndexCursor.name) private cursorModel: Model<ShelterPayoutIndexCursorDocument>,
        private chain: ShelterChain
    ) {}

    @Cron(PAYOUT_INDEX_CRON, { name: PAYOUT_INDEX_JOB })
    async cron() {
        if (!payoutIndexCronEnabled()) {
            return 'disabled';
        }
        return runLeased({
            jobRuns: this.logModel.db.collection(JOB_RUNS_COLLECTION) as unknown as ILeaseCollection,
            jobName: PAYOUT_INDEX_JOB,
            ttlMs: PAYOUT_INDEX_LEASE_MS,
            logger: this.logger,
            run: () => this.indexAll(),
        });
    }

    /** Every target; chains in parallel, the contracts of one chain one after the other. */
    async indexAll(
        env: NodeJS.ProcessEnv = process.env,
        budgetMs: number = PAYOUT_INDEX_RUN_BUDGET_MS
    ): Promise<PayoutIndexResult[]> {
        const deadline = this.clock() + budgetMs;
        const byChain = new Map<number, PayoutIndexTarget[]>();
        for (const target of payoutIndexTargets(payoutIndexNetworks(env))) {
            byChain.set(target.chainId, [...(byChain.get(target.chainId) || []), target]);
        }
        const results = await Promise.all(
            [...byChain.values()].map(async targets => {
                const out: PayoutIndexResult[] = [];
                for (const target of targets) {
                    out.push(await this.indexTarget(target, deadline, env));
                }
                return out;
            })
        );
        this.cache.clear();
        return results.flat();
    }

    /** One RPC call slot on `chainId`, spaced out where the public RPC needs it. */
    private async pace(chainId: number) {
        const gap = PAYOUT_INDEX_CALL_GAP_MS[chainId];
        if (!gap) {
            return;
        }
        const now = this.clock();
        const at = Math.max(now, (this.lastCall.get(chainId) ?? 0) + gap);
        this.lastCall.set(chainId, at);
        if (at > now) {
            await this.sleep(at - now);
        }
    }

    private async fromBlockOf(target: PayoutIndexTarget, rpc: ShelterOnchainConfig): Promise<number | null> {
        const cursor: any = await this.cursorModel
            .findOne({ _id: payoutCursorId(target.chainId, target.contract) }, { fromBlock: 1 })
            .lean();
        if (typeof cursor?.fromBlock === 'number') {
            return cursor.fromBlock;
        }
        if (typeof target.fromBlock === 'number') {
            return target.fromBlock;
        }
        if (target.deployTx) {
            await this.pace(target.chainId);
            const receipt: any = await this.chain.getReceipt(rpc, target.deployTx);
            const block = Number(receipt?.blockNumber);
            return Number.isSafeInteger(block) && block >= 0 ? block : null;
        }
        return null;
    }

    async indexTarget(
        target: PayoutIndexTarget,
        deadline: number = this.clock() + PAYOUT_INDEX_RUN_BUDGET_MS,
        env: NodeJS.ProcessEnv = process.env
    ): Promise<PayoutIndexResult> {
        const cursorId = payoutCursorId(target.chainId, target.contract);
        const rpcs = payoutIndexRpcs(target.chainId, target.contract, env);
        if (!rpcs) {
            return { cursorId, state: 'no-from-block' };
        }
        const result: PayoutIndexResult = { cursorId, state: 'indexed', inserted: 0, removed: 0 };
        try {
            const fromBlock = await this.fromBlockOf(target, rpcs.chain);
            if (fromBlock === null) {
                return { cursorId, state: 'no-from-block' };
            }
            await this.cursorModel.updateOne(
                { _id: cursorId },
                {
                    $setOnInsert: { fromBlock, lastScannedBlock: null, lastScannedTime: null, head: null },
                    $set: {
                        network: target.network,
                        chainId: target.chainId,
                        contract: target.contract,
                        symbol: target.symbol,
                        decimals: target.decimals,
                        nativeSymbol: target.nativeSymbol,
                        nativeDecimals: target.nativeDecimals,
                    },
                },
                { upsert: true }
            );
            const cursor: any = await this.cursorModel.findOne({ _id: cursorId }).lean();
            const last = typeof cursor?.lastScannedBlock === 'number' ? cursor.lastScannedBlock : null;
            const start = last === null ? fromBlock : Math.max(fromBlock, last - REORG_DEPTH + 1);
            result.scannedFrom = start;

            await this.pace(target.chainId);
            const head = await this.chain.blockNumber(rpcs.logs);
            result.head = head;
            let window = Math.min(payoutIndexChunk(env), rpcs.window ?? Infinity);
            let from = start;
            let chunks = 0;
            const times = new Map<number, number>();
            while (from <= head && chunks < PAYOUT_INDEX_MAX_CHUNKS && this.clock() < deadline) {
                const to = Math.min(from + window - 1, head);
                let logs: RpcLog[];
                try {
                    await this.pace(target.chainId);
                    chunks++;
                    logs = ((await this.chain.getPayoutLogs(rpcs.logs, from, to)) || []) as RpcLog[];
                } catch (error) {
                    if (!isRangeError(error) || window <= MIN_PAYOUT_INDEX_WINDOW) {
                        throw error;
                    }
                    const cap = rangeLimitFrom(errorText(error));
                    window = Math.max(
                        MIN_PAYOUT_INDEX_WINDOW,
                        cap !== null && cap < window ? cap : Math.floor(window / 2)
                    );
                    continue;
                }
                const counts = await this.ingest(target, rpcs, from, to, logs, times);
                result.inserted! += counts.inserted;
                result.removed! += counts.removed;
                result.scannedTo = to;
                // The block time is read once the scan reaches the head (one call per run). Mid-backfill
                // the stored time stays the older one (or null), so readers see the index as behind.
                const toTime = to === head ? await this.blockTime(target.chainId, rpcs, to, times) : null;
                // Never move the cursor backwards (a lagging RPC can report a lower head).
                await this.cursorModel.updateOne(
                    { _id: cursorId, $or: [{ lastScannedBlock: null }, { lastScannedBlock: { $lt: to } }] },
                    { $set: { lastScannedBlock: to, ...(toTime !== null ? { lastScannedTime: toTime } : {}) } }
                );
                from = to + 1;
            }
            await this.cursorModel.updateOne(
                { _id: cursorId },
                { $set: { head, lastSuccessAt: new Date(this.clock()) }, $unset: { lastError: 1 } }
            );
            return result;
        } catch (error) {
            this.logger.error(`payout index failed on chain ${target.chainId}: ${errorClass(error)}`);
            await this.cursorModel
                .updateOne(
                    { _id: cursorId },
                    { $set: { lastErrorAt: new Date(this.clock()), lastError: errorClass(error) } }
                )
                .catch(() => undefined);
            return { ...result, state: 'error' };
        }
    }

    /**
     * Reads a block field from the chain's RPC, then from its log RPC when that is another URL: the log
     * RPC gave the head and the logs, so it knows a block the chain RPC may not have yet, and a pruned log
     * RPC (Base Sepolia's publicnode) still leaves old blocks to the chain RPC. Null when neither has it.
     */
    private async readBlock<T>(
        chainId: number,
        rpcs: PayoutIndexRpcs,
        read: (rpc: ShelterOnchainConfig) => Promise<T | null>
    ): Promise<T | null> {
        const order =
            rpcs.logs.rpcUrl && rpcs.logs.rpcUrl !== rpcs.chain.rpcUrl ? [rpcs.chain, rpcs.logs] : [rpcs.chain];
        let failure: unknown = null;
        for (const rpc of order) {
            try {
                await this.pace(chainId);
                const value = await read(rpc);
                if (value !== null && value !== undefined) {
                    return value;
                }
            } catch (error) {
                failure = error;
            }
        }
        if (failure) {
            throw failure;
        }
        return null;
    }

    /** A block's time; throws when no node has it yet (the window is read again next run). */
    private async blockTime(chainId: number, rpcs: PayoutIndexRpcs, block: number, times: Map<number, number>) {
        const known = times.get(block);
        if (known !== undefined) {
            return known;
        }
        const time = await this.readBlock(chainId, rpcs, rpc => this.chain.blockTimestamp(rpc, block));
        if (time === null) {
            throw Object.assign(new Error(`block ${block} not known yet`), { code: 'BLOCK_UNKNOWN' });
        }
        times.set(block, time);
        return time;
    }

    private async ingest(
        target: PayoutIndexTarget,
        rpcs: PayoutIndexRpcs,
        from: number,
        to: number,
        logs: RpcLog[],
        times: Map<number, number>
    ) {
        const units = {
            decimals: target.decimals,
            symbol: target.symbol,
            nativeDecimals: target.nativeDecimals,
            nativeSymbol: target.nativeSymbol,
        };
        let inserted = 0;
        const keep = new Set<string>();
        for (const log of logs) {
            if (log?.removed || !isPayoutLog(log) || String(log.address).toLowerCase() !== target.contract) {
                continue;
            }
            let payout;
            try {
                payout = decodePayoutLog(log, target.chainId, units);
            } catch (error) {
                // Kept out of the index but visible in the logs; a malformed log is never guessed at.
                this.logger.error(`undecodable payout log in ${log.transactionHash}: ${errorClass(error)}`);
                continue;
            }
            keep.add(`${payout.txHash}:${payout.logIndex}`);
            const timestamp = await this.blockTime(target.chainId, rpcs, payout.blockNumber, times);
            const filter = { chainId: target.chainId, txHash: payout.txHash, logIndex: payout.logIndex };
            const update = {
                $set: {
                    network: target.network,
                    contract: target.contract,
                    blockNumber: payout.blockNumber,
                    ...(payout.blockHash ? { blockHash: payout.blockHash } : {}),
                    timestamp,
                    kind: payout.kind,
                    shelter: payout.shelter,
                    amount: payout.amount.toString(),
                    decimals: payout.kind === 'native' ? target.nativeDecimals : target.decimals,
                    amount18: payout.amount18.toString(),
                    symbol: payout.symbol,
                    memo: payout.memo,
                    sortKey: sortKeyOf(timestamp, target.chainId, payout.blockNumber, payout.logIndex),
                },
            };
            try {
                const res: any = await this.logModel.updateOne(filter, update, { upsert: true });
                inserted += res?.upsertedCount || 0;
            } catch (error) {
                // Two writers raced on the unique index: the row exists, so update it instead.
                if (!isDuplicateKeyError(error)) {
                    throw error;
                }
                await this.logModel.updateOne(filter, update);
            }
        }

        const existing: any[] = await this.logModel
            .find(
                { chainId: target.chainId, contract: target.contract, blockNumber: { $gte: from, $lte: to } },
                { _id: 1, txHash: 1, logIndex: 1, blockNumber: 1, blockHash: 1 }
            )
            .lean();
        const missing = (existing || []).filter(row => !keep.has(`${row.txHash}:${row.logIndex}`));
        const stale: any[] = [];
        for (const height of [...new Set<number>(missing.map(row => Number(row.blockNumber)))]) {
            const hash = await this.readBlock(target.chainId, rpcs, rpc => this.chain.blockHash(rpc, height));
            if (!hash) {
                continue;
            }
            // A lagging node's empty answer is not a reorg: only a changed canonical hash removes a row.
            stale.push(
                ...missing.filter(
                    row =>
                        Number(row.blockNumber) === height &&
                        (typeof row.blockHash !== 'string' || row.blockHash.toLowerCase() !== hash)
                )
            );
        }
        if (stale.length) {
            await this.logModel.deleteMany({ _id: { $in: stale.map(row => row._id) } });
        }
        return { inserted, removed: stale.length };
    }

    /**
     * The public list: contracts with their indexedThrough and totals, network totals per symbol, and
     * one page of events, newest first. Throws 409 when nothing of `network` is indexed (the clients
     * then read the chains themselves) and 424 when the database cannot be read; never 503.
     */
    async list(query: PayoutsQuery, now: number = this.clock()): Promise<PublicPayouts> {
        const key = JSON.stringify(query);
        const hit = this.cache.get(key);
        if (hit && now - hit.at < PAYOUTS_CACHE_MS) {
            return hit.value;
        }
        let value: PublicPayouts;
        try {
            value = await this.build(query, now);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`payout index read failed: ${errorClass(error)}`);
            throw new HttpException(
                {
                    statusCode: HttpStatus.FAILED_DEPENDENCY,
                    code: PAYOUTS_ERROR.UNAVAILABLE,
                    message: 'The payout index cannot be read right now. Read the chain directly.',
                },
                HttpStatus.FAILED_DEPENDENCY
            );
        }
        if (this.cache.size > 200) {
            this.cache.clear();
        }
        this.cache.set(key, { at: now, value });
        return value;
    }

    private async build(query: PayoutsQuery, now: number): Promise<PublicPayouts> {
        const scope: Record<string, unknown> = { network: query.network };
        if (query.chainId !== undefined) {
            scope.chainId = query.chainId;
        }
        if (query.address) {
            scope.contract = query.address;
        }
        const cursors: any[] = await this.cursorModel.find(scope).lean();
        if (!cursors?.length) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.CONFLICT,
                    code: PAYOUTS_ERROR.NOT_INDEXED,
                    message: 'No payouts of this network are indexed here. Read the chain directly.',
                },
                HttpStatus.CONFLICT
            );
        }
        // Only rows at or below each contract's indexedThrough. A run that wrote a window's rows and then
        // failed before moving the cursor (or one still running) leaves rows above it; the readers read
        // the chain from indexedThrough + 1, so such a row would be counted twice.
        const through = cursors
            .filter(c => typeof c.lastScannedBlock === 'number')
            .map(c => ({ chainId: c.chainId, contract: c.contract, blockNumber: { $lte: c.lastScannedBlock } }));
        const match: Record<string, unknown> | null = through.length ? { ...scope, $or: through } : null;
        const groups: any[] = !match
            ? []
            : await this.logModel
                  .aggregate([
                      { $match: match },
                      {
                          $group: {
                              _id: {
                                  chainId: '$chainId',
                                  contract: '$contract',
                                  symbol: '$symbol',
                                  kind: '$kind',
                                  decimals: '$decimals',
                              },
                              amount: { $sum: { $toDecimal: '$amount' } },
                              amount18: { $sum: { $toDecimal: '$amount18' } },
                              count: { $sum: 1 },
                          },
                      },
                  ])
                  .exec();

        const byContract = new Map<string, PayoutTotal[]>();
        const bySymbol = new Map<string, { amount18: bigint; count: number }>();
        for (const g of groups || []) {
            const id = payoutCursorId(g._id.chainId, g._id.contract);
            const total: PayoutTotal = {
                symbol: g._id.symbol,
                kind: g._id.kind,
                amount: decimalToString(g.amount),
                decimals: g._id.decimals,
                amount18: decimalToString(g.amount18),
                count: g.count,
            };
            byContract.set(id, [...(byContract.get(id) || []), total]);
            const s = bySymbol.get(total.symbol) || { amount18: BigInt(0), count: 0 };
            bySymbol.set(total.symbol, { amount18: s.amount18 + BigInt(total.amount18), count: s.count + total.count });
        }

        const contracts: PublicPayoutContract[] = cursors
            .map(c => {
                const totals = (byContract.get(payoutCursorId(c.chainId, c.contract)) || []).sort((a, b) =>
                    `${a.symbol}:${a.kind}`.localeCompare(`${b.symbol}:${b.kind}`)
                );
                return {
                    chainId: c.chainId,
                    contract: c.contract,
                    symbol: c.symbol,
                    decimals: c.decimals,
                    nativeSymbol: c.nativeSymbol,
                    nativeDecimals: c.nativeDecimals,
                    fromBlock: c.fromBlock,
                    head: typeof c.head === 'number' ? c.head : null,
                    indexedThrough: {
                        block: typeof c.lastScannedBlock === 'number' ? c.lastScannedBlock : null,
                        time: typeof c.lastScannedTime === 'number' ? c.lastScannedTime : null,
                        at: c.lastSuccessAt ? new Date(c.lastSuccessAt).toISOString() : null,
                    },
                    lastRunFailed:
                        !!c.lastErrorAt && (!c.lastSuccessAt || new Date(c.lastErrorAt) > new Date(c.lastSuccessAt)),
                    count: totals.reduce((n, t) => n + t.count, 0),
                    totals,
                };
            })
            .sort((a, b) => a.chainId - b.chainId || a.contract.localeCompare(b.contract));

        const chainIds = [...new Set(contracts.map(c => c.chainId))];
        const chains = chainIds.map(chainId => {
            const own = contracts.filter(c => c.chainId === chainId);
            const oldest = own.reduce((min, c) =>
                (c.indexedThrough.time ?? -1) < (min.indexedThrough.time ?? -1) ? c : min
            );
            return { chainId, indexedThrough: oldest.indexedThrough };
        });

        const filter: Record<string, unknown> = { ...match };
        if (query.cursor) {
            filter.sortKey = { $lt: query.cursor };
        }
        const rows: any[] = !match
            ? []
            : await this.logModel
                  .find(filter, {
                      chainId: 1,
                      contract: 1,
                      txHash: 1,
                      logIndex: 1,
                      blockNumber: 1,
                      timestamp: 1,
                      shelter: 1,
                      kind: 1,
                      amount: 1,
                      decimals: 1,
                      symbol: 1,
                      amount18: 1,
                      memo: 1,
                      sortKey: 1,
                  })
                  .sort({ sortKey: -1 })
                  .limit(query.limit + 1)
                  .lean();
        const page = (rows || []).slice(0, query.limit);
        const events: PublicPayoutEvent[] = page.map(r => ({
            chainId: r.chainId,
            contract: r.contract,
            txHash: r.txHash,
            logIndex: r.logIndex,
            blockNumber: r.blockNumber,
            timestamp: r.timestamp,
            shelter: r.shelter,
            kind: r.kind,
            amount: r.amount,
            decimals: r.decimals,
            symbol: r.symbol,
            amount18: r.amount18,
            memo: r.memo,
        }));
        const totals = [...bySymbol.entries()]
            .map(([symbol, t]) => ({ symbol, amount18: t.amount18.toString(), count: t.count }))
            .sort((a, b) => a.symbol.localeCompare(b.symbol));
        return {
            network: query.network,
            generatedAt: new Date(now).toISOString(),
            source: 'index',
            contracts,
            chains,
            totals,
            count: totals.reduce((n, t) => n + t.count, 0),
            events,
            nextCursor: (rows || []).length > query.limit && page.length ? page[page.length - 1].sortKey : null,
        };
    }
}

/** Parses GET /shelter/payouts query strings; throws a 400 message on anything malformed. */
export function parsePayoutsQuery(raw: Record<string, unknown>): PayoutsQuery | string {
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v === undefined ? '' : null);
    const network = str(raw.network);
    if (network === null || (network && network !== 'mainnet' && network !== 'testnet')) {
        return 'network must be mainnet or testnet';
    }
    const out: PayoutsQuery = { network: (network || 'mainnet') as PayoutIndexNetwork, limit: PAYOUTS_DEFAULT_LIMIT };
    const chainId = str(raw.chainId);
    if (chainId) {
        if (!/^[1-9]\d{0,14}$/.test(chainId)) {
            return 'chainId must be a positive integer';
        }
        out.chainId = Number(chainId);
    } else if (chainId === null) {
        return 'chainId must be a positive integer';
    }
    const address = str(raw.address);
    if (address) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
            return 'address must be a 0x address';
        }
        out.address = address.toLowerCase();
    } else if (address === null) {
        return 'address must be a 0x address';
    }
    const limit = str(raw.limit);
    if (limit) {
        if (!/^\d{1,5}$/.test(limit) || Number(limit) < 1) {
            return `limit must be 1 to ${PAYOUTS_MAX_LIMIT}`;
        }
        out.limit = Math.min(Number(limit), PAYOUTS_MAX_LIMIT);
    } else if (limit === null) {
        return `limit must be 1 to ${PAYOUTS_MAX_LIMIT}`;
    }
    const cursor = str(raw.cursor);
    if (cursor) {
        if (!SORT_KEY.test(cursor)) {
            return 'cursor is not one this endpoint gave out';
        }
        out.cursor = cursor;
    } else if (cursor === null) {
        return 'cursor is not one this endpoint gave out';
    }
    return out;
}

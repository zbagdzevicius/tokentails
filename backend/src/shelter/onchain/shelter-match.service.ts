import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getAddress, getBigInt } from 'ethers';
import { Model } from 'mongoose';
import { readIndexerConfig } from 'src/impact/impact.config';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    decodeRouterDonation,
    DecodedRouterDonation,
    donateRouterInterface,
    erc20Interface,
    FLUSH_MEMO,
    matchMemo,
    ROUTER_PATH,
} from './donate-router';
import {
    DonationBroadcastError,
    erc20Interface as chainErc20,
    hotWalletAddress,
    ShelterChain,
    shelterSplitInterface,
} from './shelter-chain';
import { ShelterClaimService } from './shelter-claim.service';
import { utcDay } from './shelter-donate.service';
import {
    formatUsdc,
    isTestnetChain,
    matchConfirmations,
    matchReady,
    NATIVE_USDC_CHAIN_IDS,
    publicGivingAllowed,
    readShelterConfig,
    relayReady,
    ShelterOnchainConfig,
} from './shelter-onchain.config';
import {
    MatchStatus,
    ShelterCounter,
    ShelterCounterDocument,
    ShelterMatch,
    ShelterMatchDocument,
    ShelterRouterScan,
    ShelterRouterScanDocument,
} from './shelter-onchain.schema';
import { claimCounter, counterUsed, dayCounterExpiry, releaseCounter } from './shelter-relay.service';

/** 18-decimal native USDC per 6-decimal base unit. */
const NATIVE_SCALE = getBigInt('1000000000000');
const ZERO = getBigInt(0);
/** Blocks per RouterDonation scan call, and calls per run. */
export const ROUTER_SCAN_CHUNK = 5000;
export const ROUTER_SCAN_MAX_CHUNKS = 10;
/** First run without SHELTER_ROUTER_FROM_BLOCK: read this far behind the head. */
export const ROUTER_SCAN_BOOTSTRAP = 5000;
/** The flush keeper sends at most one flush per hour, and only for at least 0.01 USDC. */
export const FLUSH_MIN_BASE = getBigInt(10000);
export const FLUSH_INTERVAL_MS = 60 * 60 * 1000;
export const MATCH_TIMEOUT_MS = 30 * 60 * 1000;
export const MATCH_BATCH = 50;
/** Gifts older than this when the scan reads them are never matched (the match was off, or behind). */
export const MATCH_MAX_GIFT_AGE_S = 24 * 3600;

export type MatchState = 'off' | 'live' | 'exhausted' | 'awaiting-handover';

export interface MatchStatusView {
    state: MatchState;
    /** The chain this status (and its relay) serves: the client shows the meter only next to it. */
    chainId: number;
    /** True when the gas relay takes gifts on this chain (relayReady and the giving gate). */
    relay: boolean;
    /** Decimal USDC strings. */
    perGift: string;
    dailyLeft: string;
    poolLeft: string;
}

export interface MatchRunResult {
    scanned: number;
    queued: number;
    sent: number;
    skipped: number;
    confirmed: number;
    failed: number;
    flushTx?: string;
}

const dayKey = (config: ShelterOnchainConfig, day: string) => `match:${config.chainId}:${day}`;
const poolKey = (config: ShelterOnchainConfig) => `match:pool:${config.chainId}`;
const min = (...values: bigint[]) => values.reduce((a, b) => (b < a ? b : a));

/** The gift in USDC base units, or null for a gift the match does not cover (a native coin that is not USDC). */
export function giftBaseOf(gift: Pick<DecodedRouterDonation, 'path' | 'amount'>, chainId: number): bigint | null {
    if (gift.path === ROUTER_PATH.AUTH) {
        return gift.amount;
    }
    if (gift.path === ROUTER_PATH.NATIVE && NATIVE_USDC_CHAIN_IDS.includes(chainId)) {
        return gift.amount / NATIVE_SCALE;
    }
    return null;
}

/**
 * Wallets whose gifts are not public, from config alone (lowercased): the hot wallet,
 * IMPACT_PAWS_SENDERS, SHELTER_MATCH_EXCLUDE (team wallets) and SHELTER_TREASURY_ADDRESS. Never matched,
 * never counted as a public wallet gift. The scan adds the split's own recipients and treasury.
 */
export function ownSenders(config: ShelterOnchainConfig): Set<string> {
    return new Set(
        [
            ...(readIndexerConfig().pawSenders || []),
            ...(config.notPublicWallets || []),
            hotWalletAddress(config),
            config.treasuryAddress,
        ]
            .filter((a): a is string => !!a)
            .map(a => a.toLowerCase())
    );
}

/**
 * Token Tails' 1:1 match of router gifts (F2b), from the hot wallet: Token Tails' own money, never a
 * donor's. Eligible: a RouterDonation from the configured router (signed or native path), by a donor
 * that is not a Token Tails sender, of at least SHELTER_MATCH_MIN_GIFT, while the match is on and the
 * giving gate is open. match = min(gift, per gift, left today, left in the pool), charged to atomic
 * counters before it is sent and given back if it can never be mined. Separate from the treat budget.
 *
 * Also runs the RouterDonation scan and the flush keeper for the reconcile job.
 */
@Injectable()
export class ShelterMatchService {
    private readonly logger = new Logger(ShelterMatchService.name);

    constructor(
        @InjectModel(ShelterMatch.name) private matchModel: Model<ShelterMatchDocument>,
        @InjectModel(ShelterCounter.name) private counterModel: Model<ShelterCounterDocument>,
        @InjectModel(ShelterRouterScan.name) private scanModel: Model<ShelterRouterScanDocument>,
        private chain: ShelterChain,
        @Optional() private claims?: ShelterClaimService
    ) {}

    /** The full giving gate. Without the claim service a mainnet is refused (fail closed). */
    private async givingVerified(config: ShelterOnchainConfig): Promise<boolean> {
        if (!publicGivingAllowed(config)) {
            return false;
        }
        return this.claims ? this.claims.publicGivingVerified(config) : isTestnetChain(config.chainId);
    }

    /**
     * ownSenders plus, read on chain, every wallet ShelterSplit pays and its treasury: a round trip from
     * the shelter's own wallet or the treasury is not a public gift. Throws when the split cannot be read.
     */
    async notPublic(config: ShelterOnchainConfig): Promise<Set<string>> {
        const set = ownSenders(config);
        const split = config.splitAddress!;
        const previewRaw = await this.chain.ethCall(
            config,
            split,
            shelterSplitInterface.encodeFunctionData('preview', [getBigInt(1000000)])
        );
        for (const w of shelterSplitInterface.decodeFunctionResult('preview', previewRaw)[0] as string[]) {
            set.add(String(w).toLowerCase());
        }
        const treasuryRaw = await this.chain.ethCall(
            config,
            split,
            shelterSplitInterface.encodeFunctionData('treasury', [])
        );
        set.add(String(shelterSplitInterface.decodeFunctionResult('treasury', treasuryRaw)[0]).toLowerCase());
        return set;
    }

    async status(now: Date = new Date(), config: ShelterOnchainConfig = readShelterConfig()): Promise<MatchStatusView> {
        const perGift = formatUsdc(config.matchPerGiftBase);
        const giving = await this.givingVerified(config);
        const relay = relayReady(config) && giving;
        if (!matchReady(config)) {
            return { state: 'off', chainId: config.chainId, relay, perGift, dailyLeft: '0', poolLeft: '0' };
        }
        const { dailyLeft, poolLeft } = await this.left(config, utcDay(now));
        const view = {
            chainId: config.chainId,
            relay,
            perGift,
            dailyLeft: formatUsdc(dailyLeft),
            poolLeft: formatUsdc(poolLeft),
        };
        if (!giving) {
            return { state: 'awaiting-handover', ...view };
        }
        const exhausted = dailyLeft <= ZERO || poolLeft <= ZERO;
        return { state: exhausted ? 'exhausted' : 'live', ...view };
    }

    async byDonor(txHash: string): Promise<{ status: MatchStatus | 'none'; matchTxHash: string | null }> {
        const tx = String(txHash || '').toLowerCase();
        const row: any = /^0x[0-9a-f]{64}$/.test(tx) ? await this.matchModel.findOne({ donorTxHash: tx }).lean() : null;
        return { status: row?.status || 'none', matchTxHash: row?.matchTxHash || null };
    }

    private async left(config: ShelterOnchainConfig, day: string) {
        const [dayUsed, poolUsed] = await Promise.all([
            counterUsed(this.counterModel, dayKey(config, day)),
            counterUsed(this.counterModel, poolKey(config)),
        ]);
        const dailyLeft = config.matchDailyBase - getBigInt(dayUsed);
        const poolLeft = config.matchPoolBase - getBigInt(poolUsed);
        return { dailyLeft: dailyLeft > ZERO ? dailyLeft : ZERO, poolLeft: poolLeft > ZERO ? poolLeft : ZERO };
    }

    /** One reconcile pass: scan new gifts, send pending matches, settle sent ones, flush the router. */
    async runOnce(now: Date = new Date(), config: ShelterOnchainConfig = readShelterConfig()): Promise<MatchRunResult> {
        const result: MatchRunResult = { scanned: 0, queued: 0, sent: 0, skipped: 0, confirmed: 0, failed: 0 };
        if (!config.rpcUrl || !config.routerAddress || !config.privateKey) {
            return result;
        }
        const giving = await this.givingVerified(config);
        if (matchReady(config) && giving) {
            let own: Set<string> | null = null;
            try {
                own = await this.notPublic(config);
            } catch (error: any) {
                this.logger.warn(`match exclusions unreadable: ${error?.code || error?.name || 'unknown error'}`);
            }
            if (own) {
                await this.scan(config, now, own, result);
                await this.sendPending(config, now, result);
            }
        } else {
            // Off: gifts made now are not matched later, so the cursor moves past them (M5).
            await this.skipToHead(config);
        }
        await this.settleSent(config, now, result);
        const flushTx = giving ? await this.flushIfNeeded(config, now) : null;
        if (flushTx) {
            result.flushTx = flushTx;
        }
        return result;
    }

    /** Head minus the chain's confirmations: the newest block the match trusts not to be reorged. */
    private async safeHead(config: ShelterOnchainConfig): Promise<number> {
        return (await this.chain.blockNumber(config)) - matchConfirmations(config.chainId);
    }

    /** While the match is off, keeps the scan cursor at the safe head (never backwards). */
    async skipToHead(config: ShelterOnchainConfig) {
        try {
            const router = config.routerAddress!.toLowerCase();
            const key = `${config.chainId}:${router}`;
            const head = await this.safeHead(config);
            if (head < 0) {
                return;
            }
            const cursor: any = await this.scanModel.findOne({ key }).lean();
            if (typeof cursor?.lastBlock === 'number' && cursor.lastBlock >= head) {
                return;
            }
            await this.scanModel.updateOne({ key }, { $set: { lastBlock: head } }, { upsert: true });
        } catch (error: any) {
            this.logger.warn(`router cursor skip failed: ${error?.code || error?.name || 'unknown error'}`);
        }
    }

    /**
     * Reconcile step 2: reads RouterDonation logs since the last scanned block into pending matches, up
     * to the safe head (MATCH_CONFIRMATIONS). A gift older than MATCH_MAX_GIFT_AGE_S is never matched.
     */
    async scan(config: ShelterOnchainConfig, now: Date, own: Set<string>, result: MatchRunResult) {
        const router = config.routerAddress!.toLowerCase();
        const key = `${config.chainId}:${router}`;
        const head = await this.safeHead(config);
        const times = new Map<number, number>();
        const blockTime = async (block: number): Promise<number> => {
            if (!times.has(block)) {
                const ts = await this.chain.blockTimestamp(config, block);
                if (ts === null) {
                    // The node lacks the block: stop here, the cursor stays before it.
                    throw new Error('block timestamp unavailable');
                }
                times.set(block, ts);
            }
            return times.get(block)!;
        };
        const nowS = Math.floor(now.getTime() / 1000);
        const cursor: any = await this.scanModel.findOne({ key }).lean();
        let from: number =
            typeof cursor?.lastBlock === 'number'
                ? cursor.lastBlock + 1
                : config.routerFromBlock ?? Math.max(0, head - ROUTER_SCAN_BOOTSTRAP);
        for (let chunk = 0; chunk < ROUTER_SCAN_MAX_CHUNKS && from <= head; chunk++) {
            const to = Math.min(from + ROUTER_SCAN_CHUNK - 1, head);
            const logs = (await this.chain.getRouterLogs(config, from, to)) || [];
            for (const log of logs) {
                if (log?.removed) {
                    continue;
                }
                const gift = decodeRouterDonation(log);
                if (!gift || gift.router !== router) {
                    continue;
                }
                result.scanned++;
                if (nowS - (await blockTime(gift.blockNumber)) > MATCH_MAX_GIFT_AGE_S) {
                    continue;
                }
                if ((await this.enqueue(gift, config, now, own)) === 'queued') {
                    result.queued++;
                }
            }
            await this.scanModel.updateOne({ key }, { $set: { lastBlock: to } }, { upsert: true });
            from = to + 1;
        }
    }

    /**
     * Records one gift for matching. Ignored (no row): a flush, a gift from Token Tails' own senders, a
     * native coin that is not USDC. Below the minimum: a `skipped-small` row, so the donor's page can
     * say why. The unique donorTxHash makes a replayed log a no-op.
     */
    async enqueue(
        gift: DecodedRouterDonation,
        config: ShelterOnchainConfig,
        now: Date,
        own: Set<string> = ownSenders(config)
    ): Promise<'queued' | 'small' | 'ignored' | 'duplicate'> {
        if (gift.router !== String(config.routerAddress || '').toLowerCase()) {
            return 'ignored';
        }
        if (gift.path !== ROUTER_PATH.AUTH && gift.path !== ROUTER_PATH.NATIVE) {
            return 'ignored';
        }
        if (own.has(gift.donor.toLowerCase())) {
            return 'ignored';
        }
        const giftBase = giftBaseOf(gift, config.chainId);
        if (giftBase === null || !/^0x[0-9a-f]{64}$/.test(gift.txHash)) {
            return 'ignored';
        }
        const small = giftBase < config.matchMinGiftBase;
        try {
            await this.matchModel.create({
                donorTxHash: gift.txHash,
                donorFrom: gift.donor,
                giftBase: giftBase.toString(),
                matchBase: '0',
                status: small ? 'skipped-small' : 'pending',
                day: utcDay(now),
                chainId: config.chainId,
                path: gift.path,
                budgetHeld: false,
            });
            return small ? 'small' : 'queued';
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                return 'duplicate';
            }
            throw error;
        }
    }

    /** Sends every pending match in order, within the caps. */
    async sendPending(config: ShelterOnchainConfig, now: Date, result: MatchRunResult) {
        const rows: any[] = await this.matchModel
            .find({ status: 'pending', chainId: config.chainId })
            .sort({ createdAt: 1 })
            .limit(MATCH_BATCH)
            .lean();
        for (const row of rows || []) {
            const outcome = await this.sendOne(row, config, now);
            if (outcome === 'sent') result.sent++;
            else if (outcome === 'skipped') result.skipped++;
            else if (outcome === 'failed') result.failed++;
        }
    }

    async sendOne(row: any, config: ShelterOnchainConfig, now: Date): Promise<'sent' | 'skipped' | 'failed' | 'busy'> {
        const day = utcDay(now);
        const { dailyLeft, poolLeft } = await this.left(config, day);
        const match = min(getBigInt(row.giftBase), config.matchPerGiftBase, dailyLeft, poolLeft);
        if (match <= ZERO) {
            await this.matchModel.updateOne({ _id: row._id, status: 'pending' }, { $set: { status: 'skipped-cap' } });
            return 'skipped';
        }
        // The router refuses a gift that would send part to the treasury; the match must not do it either.
        const native = NATIVE_USDC_CHAIN_IDS.includes(config.chainId);
        let toTreasury: bigint;
        try {
            const raw = await this.chain.ethCall(
                config,
                config.splitAddress!,
                shelterSplitInterface.encodeFunctionData('preview', [native ? match * NATIVE_SCALE : match])
            );
            toTreasury = getBigInt(shelterSplitInterface.decodeFunctionResult('preview', raw)[2]);
        } catch (error: any) {
            this.logger.warn(`match preview failed: ${error?.code || error?.name || 'unknown error'}`);
            return 'busy';
        }
        if (toTreasury !== ZERO) {
            await this.matchModel.updateOne(
                { _id: row._id, status: 'pending' },
                { $set: { status: 'skipped-cap', failedReason: 'treasury-share' } }
            );
            return 'skipped';
        }
        // Outside Arc a reorg can drop the gift: match only one whose receipt is still there.
        if (matchConfirmations(config.chainId) > 0) {
            let donor: any;
            try {
                donor = await this.chain.getReceipt(config, row.donorTxHash);
            } catch {
                return 'busy';
            }
            if (!donor || donor.status !== 1) {
                await this.matchModel.updateOne(
                    { _id: row._id, status: 'pending' },
                    { $set: { status: 'failed', failedReason: 'donor-missing' } }
                );
                return 'failed';
            }
        }
        const amount = Number(match);
        const dKey = dayKey(config, day);
        const pKey = poolKey(config);
        if (
            !(await claimCounter(this.counterModel, dKey, amount, Number(config.matchDailyBase), dayCounterExpiry(day)))
        ) {
            await this.matchModel.updateOne({ _id: row._id, status: 'pending' }, { $set: { status: 'skipped-cap' } });
            return 'skipped';
        }
        if (!(await claimCounter(this.counterModel, pKey, amount, Number(config.matchPoolBase)))) {
            await releaseCounter(this.counterModel, dKey, amount);
            await this.matchModel.updateOne({ _id: row._id, status: 'pending' }, { $set: { status: 'skipped-cap' } });
            return 'skipped';
        }
        // Claim the row for this send; a second runner finds it no longer pending.
        const claimed = await this.matchModel.findOneAndUpdate(
            { _id: row._id, status: 'pending' },
            { $set: { matchBase: match.toString(), day, budgetHeld: true, status: 'sent' } }
        );
        if (!claimed) {
            await releaseCounter(this.counterModel, pKey, amount);
            await releaseCounter(this.counterModel, dKey, amount);
            return 'busy';
        }
        const memo = matchMemo(row.donorTxHash);
        const onSigned = async (tx: { hash: string; nonce: number }) => {
            await this.matchModel.updateOne(
                { _id: row._id },
                { $set: { matchTxHash: tx.hash.toLowerCase(), matchTxNonce: tx.nonce } }
            );
        };
        try {
            if (native) {
                // Arc: the native coin is USDC (18 decimals), so the match is one ShelterSplit.donate call.
                await this.chain.sendDonation(config, memo, match * NATIVE_SCALE, onSigned);
            } else {
                // Other chains: approve the split for the match ON TOP of what treats already left approved,
                // wait for it, then disburse. A plain approve(match) would overwrite the treats' daily
                // allowance, and a treat sent in between would spend part of the match's (SEC-6).
                const token = await this.splitToken(config);
                const hot = hotWalletAddress(config);
                const current = hot
                    ? await this.chain
                          .ethCall(
                              config,
                              token,
                              chainErc20.encodeFunctionData('allowance', [hot, config.splitAddress])
                          )
                          .then(raw => getBigInt(chainErc20.decodeFunctionResult('allowance', raw)[0]))
                          .catch(() => ZERO)
                    : ZERO;
                const approve = await this.chain.sendContractCall(
                    token,
                    erc20Interface.encodeFunctionData('approve', [config.splitAddress, current + match]),
                    ZERO,
                    { config }
                );
                const approved: any = await this.chain.waitForReceipt(config, approve.txHash);
                if (!approved || approved.status !== 1) {
                    throw new Error('approve not mined');
                }
                await this.chain.sendContractCall(
                    config.splitAddress!,
                    shelterSplitInterface.encodeFunctionData('disburse', [match, memo]),
                    ZERO,
                    { config, onSigned: async tx => onSigned(tx) }
                );
            }
            return 'sent';
        } catch (error: any) {
            this.logger.error(`match send failed: ${error?.code || error?.name || 'unknown error'}`);
            if (error instanceof DonationBroadcastError && !error.definite) {
                return 'sent';
            }
            await this.failAndRelease(row._id, config, 'send-failed', now);
            return 'failed';
        }
    }

    private async splitToken(config: ShelterOnchainConfig): Promise<string> {
        const raw = await this.chain.ethCall(
            config,
            config.splitAddress!,
            shelterSplitInterface.encodeFunctionData('token', [])
        );
        return getAddress(shelterSplitInterface.decodeFunctionResult('token', raw)[0]);
    }

    /** `failed` once, giving the day and pool budget back (the day only on its own day). */
    async failAndRelease(id: unknown, config: ShelterOnchainConfig, reason: string, now: Date = new Date()) {
        const row: any = await this.matchModel.findOneAndUpdate(
            { _id: id, status: { $in: ['pending', 'sent'] } },
            { $set: { status: 'failed', failedReason: reason } }
        );
        if (!row) {
            return false;
        }
        const released: any = await this.matchModel.findOneAndUpdate(
            { _id: id, budgetHeld: true },
            { $set: { budgetHeld: false } }
        );
        if (released) {
            const amount = Number(row.matchBase || 0);
            await releaseCounter(this.counterModel, poolKey(config), amount);
            if (row.day === utcDay(now)) {
                await releaseCounter(this.counterModel, dayKey(config, row.day), amount);
            }
        }
        return true;
    }

    /** Settles `sent` matches by receipt, like a treat. */
    async settleSent(config: ShelterOnchainConfig, now: Date, result: MatchRunResult) {
        const rows: any[] = await this.matchModel
            .find({ status: 'sent', chainId: config.chainId })
            .sort({ updatedAt: 1 })
            .limit(MATCH_BATCH)
            .lean();
        for (const row of rows || []) {
            if (!row.matchTxHash) {
                // Died between the claim and signing: nothing was signed, give the budget back.
                if (new Date(row.updatedAt).getTime() < now.getTime() - MATCH_TIMEOUT_MS) {
                    result.failed += Number(await this.failAndRelease(row._id, config, 'stuck', now));
                }
                continue;
            }
            try {
                const receipt: any = await this.chain.getReceipt(config, row.matchTxHash);
                if (receipt && receipt.status === 1) {
                    const res: any = await this.matchModel.updateOne(
                        { _id: row._id, status: 'sent' },
                        { $set: { status: 'confirmed' } }
                    );
                    result.confirmed += res?.modifiedCount ? 1 : 0;
                } else if (receipt && receipt.status === 0) {
                    result.failed += Number(await this.failAndRelease(row._id, config, 'reverted', now));
                } else if (
                    new Date(row.updatedAt).getTime() < now.getTime() - MATCH_TIMEOUT_MS &&
                    typeof row.matchTxNonce === 'number'
                ) {
                    const hot = hotWalletAddress(config);
                    const mined = hot ? await this.chain.minedNonce(config, hot) : -1;
                    if (mined > row.matchTxNonce && !(await this.chain.getReceipt(config, row.matchTxHash))) {
                        result.failed += Number(await this.failAndRelease(row._id, config, 'timeout', now));
                    }
                }
            } catch (error: any) {
                this.logger.warn(`match receipt lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            }
        }
    }

    /**
     * Reconcile step 3: USDC sitting on the router (someone sent it a plain transfer) is pushed into
     * ShelterSplit with `router.flush('tt:flush')`, at most once an hour and only for at least 0.01
     * USDC. The hot wallet pays gas only; the router is ownerless, so the USDC can only go to the split.
     */
    async flushIfNeeded(config: ShelterOnchainConfig, now: Date): Promise<string | null> {
        if (!(config.relayEnabled || config.matchEnabled) || !(await this.givingVerified(config))) {
            return null;
        }
        const router = config.routerAddress!;
        const key = `${config.chainId}:${router.toLowerCase()}`;
        const since = new Date(now.getTime() - FLUSH_INTERVAL_MS);
        try {
            const cursor: any = await this.scanModel.findOne({ key }).lean();
            if (cursor?.lastFlushAt && new Date(cursor.lastFlushAt).getTime() > since.getTime()) {
                return null;
            }
            const usdcRaw = await this.chain.ethCall(
                config,
                router,
                donateRouterInterface.encodeFunctionData('usdc', [])
            );
            const usdc = getAddress(donateRouterInterface.decodeFunctionResult('usdc', usdcRaw)[0]);
            const balanceRaw = await this.chain.ethCall(
                config,
                usdc,
                erc20Interface.encodeFunctionData('balanceOf', [router])
            );
            const balance = getBigInt(erc20Interface.decodeFunctionResult('balanceOf', balanceRaw)[0]);
            if (balance < FLUSH_MIN_BASE) {
                return null;
            }
            // Claim the hour atomically: of two instances only one matches, the other sends nothing.
            let claimed: unknown = null;
            try {
                claimed = await this.scanModel.findOneAndUpdate(
                    { key, $or: [{ lastFlushAt: { $lte: since } }, { lastFlushAt: { $exists: false } }] },
                    { $set: { lastFlushAt: now } },
                    { upsert: true, new: true }
                );
            } catch (error) {
                if (!isDuplicateKeyError(error)) {
                    throw error;
                }
            }
            if (!claimed) {
                return null;
            }
            const sent = await this.chain.sendContractCall(
                router,
                donateRouterInterface.encodeFunctionData('flush', [FLUSH_MEMO]),
                ZERO,
                { config }
            );
            return sent.txHash;
        } catch (error: any) {
            if (error instanceof DonationBroadcastError) {
                return error.definite ? null : error.tx.hash;
            }
            this.logger.warn(`router flush skipped: ${error?.code || error?.name || 'unknown error'}`);
            return null;
        }
    }
}

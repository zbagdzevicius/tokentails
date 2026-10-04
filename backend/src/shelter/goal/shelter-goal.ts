/*
 * A campaign goal's count (fact C-001): the USDC that CAME IN to the campaign wallets, summed from
 * the chain's Transfer logs. Pure, so the rules are unit tested without MongoDB or an RPC.
 *
 * - Each wallet counts only inside its own block range (`fromBlock`..`toBlock`, null = still open):
 *   at the handover the held wallet is closed and the shelter's own wallet is appended.
 * - A transfer whose sender is any campaign wallet is skipped, so the handover sweep (old wallet ->
 *   new wallet) is counted once, and spending never lowers the count (outflows are not read at all).
 * - On Arc, every USDC move (native, or through the ERC-20 view at 0x3600...) emits a Transfer log
 *   from the system address 0xff..fe with an 18-decimal amount; `inflowLog` names it. Checked
 *   read-only on rpc.mainnet.arc.io, 2026-10-04 (see the C-001 note).
 */
import { FACTS, PublicFact } from 'src/impact/facts.generated';
import { CRYPTO_PAY_CHAINS, CryptoPayChain } from 'src/payments/crypto/crypto-chains';
import { GoalChainCount, GoalSource, GoalWallet, ShelterGoalView, sourcesFor } from 'src/shared-contracts/shelter-goal';
import { isTestnetChain } from '../onchain/shelter-onchain.config';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Blocks per eth_getLogs call: the public Arc RPC refuses a span of 10,000 blocks or more. */
export const GOAL_WINDOW_BLOCKS = 9_999;

/** A count within this many blocks of the head is "up to date" (about two minutes on Arc). */
export const GOAL_UP_TO_DATE_LAG = 240;

export interface GoalCampaign {
    id: string;
    chainId: number;
    goalUsdc: string;
    /** The first block counted (the earliest wallet's fromBlock). */
    startBlock: number;
    wallets: GoalWallet[];
    inflowLog: { address: string; decimals: number };
    /** Changes whenever the counted set changes (a wallet added or closed): the cursor restarts. */
    configKey: string;
    /** The goal's start date (`YYYY-MM-DD`, 00:00 UTC): where the other chains start counting. */
    startDate?: string | null;
}

/** The goal campaign of fact `id`, or null when that fact has no counting campaign. */
export function goalCampaign(id: string, facts: Record<string, PublicFact> = FACTS): GoalCampaign | null {
    const fact = Object.prototype.hasOwnProperty.call(facts, id) ? facts[id] : undefined;
    const c = fact?.campaign;
    if (!fact || !c || !c.inflowLog || !Array.isArray(c.wallets) || !c.wallets.length) {
        return null;
    }
    const wallets: GoalWallet[] = c.wallets.map(w => ({
        wallet: w.wallet.toLowerCase(),
        fromBlock: w.fromBlock,
        toBlock: w.toBlock ?? null,
        holder: w.holder === 'shelter' ? 'shelter' : 'token-tails',
    }));
    const inflowLog = { address: c.inflowLog.address.toLowerCase(), decimals: c.inflowLog.decimals };
    const startBlock = Math.min(...wallets.map(w => w.fromBlock));
    return {
        id: fact.id,
        chainId: c.chainId,
        goalUsdc: String(fact.value ?? '0'),
        startBlock,
        wallets,
        inflowLog,
        configKey: JSON.stringify({ chainId: c.chainId, inflowLog, wallets }),
        startDate:
            typeof fact.goal?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fact.goal.startDate)
                ? fact.goal.startDate
                : null,
    };
}

/** The wallets whose block range meets [from, to]. */
export function walletsIn(c: GoalCampaign, from: number, to: number): GoalWallet[] {
    return c.wallets.filter(w => w.fromBlock <= to && (w.toBlock === null || w.toBlock >= from));
}

/** An address as a 32-byte log topic. */
export const addressTopic = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');

/** The eth_getLogs filter for [from, to], or null when no wallet is counted there. */
export function inflowFilter(c: GoalCampaign, from: number, to: number) {
    const wallets = walletsIn(c, from, to);
    if (!wallets.length) {
        return null;
    }
    return {
        address: c.inflowLog.address,
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [TRANSFER_TOPIC, null, wallets.map(w => addressTopic(w.wallet))],
    };
}

/**
 * eth_getLogs spans the chains' public RPCs accept (checked read-only 2026-10-04): mainnet.base.org
 * stops at 2,000 blocks and rpc.monad.xyz at 100; Tempo, Arbitrum, Avalanche and Robinhood Chain
 * took 100,000 for a wallet-filtered Transfer query, and 9,999 keeps a margin.
 */
export const GOAL_LOG_WINDOW: Record<number, number> = { 8453: 2_000, 143: 100, 10143: 100 };
export const goalLogWindow = (chainId: number) => GOAL_LOG_WINDOW[chainId] ?? GOAL_WINDOW_BLOCKS;

/** A coin a chain leg counts (address lowercased). */
export interface GoalLegToken {
    address: string;
    decimals: number;
    symbol: string;
}

/**
 * Another mainnet the goal counts on: the Transfer logs of its US dollar stablecoins to the campaign
 * wallets, from the first block of the goal's start date. Block ranges in `campaign.wallets` belong
 * to the campaign chain, so here every campaign wallet counts from the start (they are all Pink Paw's:
 * held for it, or its own), and a transfer between two campaign wallets is skipped, as on Arc.
 */
export interface GoalChainLeg {
    chainId: number;
    name: string;
    tokens: GoalLegToken[];
    /** The campaign wallets, lowercased, without duplicates. */
    wallets: string[];
    /** Unix seconds of the goal's start date, 00:00 UTC. */
    startTime: number;
    window: number;
    configKey: string;
    publicRpc: string | null;
}

/**
 * The other chains a goal counts on: every mainnet of the checkout's chain table (the repo's list of
 * chains and their stablecoin addresses) except the campaign chain, with its USD coins only (USDC,
 * USDC.e, USDG; never EURC, never a test-only coin). None for a campaign on a testnet, so test coins
 * never reach a real meter, and none without a start date.
 */
export function goalChainLegs(c: GoalCampaign, chains: readonly CryptoPayChain[] = CRYPTO_PAY_CHAINS): GoalChainLeg[] {
    if (isTestnetChain(c.chainId) || !c.startDate) return [];
    const startTime = Math.floor(Date.parse(`${c.startDate}T00:00:00Z`) / 1000);
    if (!Number.isFinite(startTime)) return [];
    const wallets = [...new Set(c.wallets.map(w => w.wallet.toLowerCase()))];
    const out: GoalChainLeg[] = [];
    for (const chain of chains) {
        if (chain.testnet || isTestnetChain(chain.chainId) || chain.chainId === c.chainId) continue;
        const tokens = chain.tokens
            .filter(t => t.token === 'USDC' && !t.testOnly && /^0x[0-9a-fA-F]{40}$/.test(t.address))
            .map(t => ({ address: t.address.toLowerCase(), decimals: t.decimals, symbol: t.symbol }));
        if (!tokens.length) continue;
        out.push({
            chainId: chain.chainId,
            name: chain.name,
            tokens,
            wallets,
            startTime,
            window: goalLogWindow(chain.chainId),
            configKey: JSON.stringify({ chainId: chain.chainId, tokens, wallets, startTime }),
            publicRpc: chain.publicRpc,
        });
    }
    return out;
}

/** The eth_getLogs filter of a chain leg for [from, to]. */
export function legInflowFilter(leg: GoalChainLeg, from: number, to: number) {
    return {
        address: leg.tokens.map(t => t.address),
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [TRANSFER_TOPIC, null, leg.wallets.map(addressTopic)],
    };
}

/**
 * What came in to the campaign wallets on a chain leg in [from, to]: a counted coin's Transfer whose
 * receiver is a campaign wallet and whose sender is not. A log listed twice counts once.
 */
export function sumLegInflows(leg: GoalChainLeg, logs: GoalRpcLog[], from: number, to: number): InflowSum {
    const ours = new Set(leg.wallets);
    const seen = new Set<string>();
    let sum18 = BigInt(0);
    let count = 0;
    for (const log of Array.isArray(logs) ? logs : []) {
        if (!log || log.removed) continue;
        const token = leg.tokens.find(t => t.address === String(log.address || '').toLowerCase());
        if (!token) continue;
        const topics = log.topics || [];
        if (String(topics[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
        const sender = topicAddress(topics[1]);
        const receiver = topicAddress(topics[2]);
        const block = typeof log.blockNumber === 'string' ? parseInt(log.blockNumber, 16) : NaN;
        if (!sender || !receiver || !Number.isInteger(block) || block < from || block > to) continue;
        if (ours.has(sender) || !ours.has(receiver)) continue;
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const value = amount18(log.data, token.decimals);
        if (value === null) continue;
        sum18 += value;
        count++;
    }
    return { sum18, count };
}

/** One `eth_getLogs` entry, as JSON-RPC sends it. */
export interface GoalRpcLog {
    address?: string;
    topics?: string[];
    data?: string;
    blockNumber?: string;
    transactionHash?: string;
    logIndex?: string;
    removed?: boolean;
}

export interface InflowSum {
    /** 18-decimal USDC. */
    sum18: bigint;
    count: number;
}

const topicAddress = (topic: string | undefined) =>
    typeof topic === 'string' && /^0x[0-9a-fA-F]{64}$/.test(topic) ? '0x' + topic.slice(26).toLowerCase() : null;

/** The amount of a Transfer log in 18-decimal units, or null when its data is not a uint256. */
function amount18(data: string | undefined, decimals: number): bigint | null {
    if (typeof data !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(data)) {
        return null;
    }
    const raw = BigInt(data);
    return decimals <= 18 ? raw * BigInt(10) ** BigInt(18 - decimals) : raw / BigInt(10) ** BigInt(decimals - 18);
}

/**
 * The USDC that came in to the campaign wallets in [from, to], from that window's logs. Counts a log
 * only when it is the inflow contract's Transfer, its receiver is a campaign wallet whose range holds
 * the log's block, and its sender is not a campaign wallet. A log listed twice counts once.
 */
export function sumInflows(c: GoalCampaign, logs: GoalRpcLog[], from: number, to: number): InflowSum {
    const ours = new Set(c.wallets.map(w => w.wallet));
    const seen = new Set<string>();
    let sum18 = BigInt(0);
    let count = 0;
    for (const log of Array.isArray(logs) ? logs : []) {
        if (!log || log.removed || String(log.address || '').toLowerCase() !== c.inflowLog.address) continue;
        const topics = log.topics || [];
        if (String(topics[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
        const sender = topicAddress(topics[1]);
        const receiver = topicAddress(topics[2]);
        const block = typeof log.blockNumber === 'string' ? parseInt(log.blockNumber, 16) : NaN;
        if (!sender || !receiver || !Number.isInteger(block) || block < from || block > to) continue;
        if (ours.has(sender)) continue;
        const wallet = c.wallets.find(
            w => w.wallet === receiver && block >= w.fromBlock && (w.toBlock === null || block <= w.toBlock)
        );
        if (!wallet) continue;
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const value = amount18(log.data, c.inflowLog.decimals);
        if (value === null) continue;
        sum18 += value;
        count++;
    }
    return { sum18, count };
}

/** 18-decimal units -> a decimal USDC string with at most 6 decimals, rounded down ("12.5"). */
export function usdcText(v18: bigint): string {
    const micro = v18 / BigInt(10) ** BigInt(12);
    const whole = (micro / BigInt(1_000_000)).toString();
    const frac = (micro % BigInt(1_000_000)).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
}

/** What the backend knows about the shop share route on the campaign chain. */
export interface ShareRoutes {
    /** A CAT checkout on this chain settles through the ShelterSplit (route `split`). */
    splitOnChain: boolean;
}

/**
 * The sources that can reach the open wallet today. A wallet Token Tails holds gets sponsored
 * treats only (custody rules: no public gifts, match or x402 to it); the shelter's own wallet gets
 * gifts, the match, treats and x402. Shop shares only while a checkout settles through the split.
 */
export function liveSources(c: GoalCampaign, routes: ShareRoutes): GoalSource[] {
    const open = c.wallets.find(w => w.toBlock === null) || null;
    if (!open) {
        return [];
    }
    const out = sourcesFor(open.holder);
    if (routes.splitOnChain) {
        out.push('purchase-shares');
    }
    return out;
}

export interface GoalCursorState {
    configKey: string;
    lastScannedBlock: number | null;
    raised18: string;
    transfers: number;
    head: number | null;
    lastSuccessAt: Date | null;
}

/** The cursor id of a chain leg: `C-001@8453`. The campaign chain keeps the bare fact id. */
export const legCursorId = (id: string, chainId: number) => `${id}@${chainId}`;

function chainCount(
    chainId: number,
    symbols: string[],
    configKey: string,
    cursor: GoalCursorState | null
): { count: GoalChainCount; raised18: bigint; updatedAt: Date | null } {
    const current = cursor && cursor.configKey === configKey ? cursor : null;
    const scannedTo = current?.lastScannedBlock ?? null;
    const head = current?.head ?? null;
    const raised18 =
        current && scannedTo !== null && /^\d+$/.test(current.raised18) ? BigInt(current.raised18) : BigInt(0);
    return {
        count: {
            chainId,
            symbols,
            raised: usdcText(raised18),
            scannedTo,
            head,
            upToDate: scannedTo !== null && head !== null && head - scannedTo <= GOAL_UP_TO_DATE_LAG,
            transfers: current && scannedTo !== null ? current.transfers : 0,
        },
        raised18,
        updatedAt: current?.lastSuccessAt ? new Date(current.lastSuccessAt) : null,
    };
}

/**
 * The public view of a goal from its cursors (a cursor for an older wallet set counts nothing): the
 * campaign chain's count plus every chain leg's (`legs`, keyed by chain id). `raised` is the sum;
 * `upToDate` only when every chain has reached its head; `scannedTo` stays the campaign chain's, so
 * nothing is claimed before its first window.
 */
export function goalView(
    c: GoalCampaign,
    cursor: GoalCursorState | null,
    routes: ShareRoutes,
    legs: { leg: GoalChainLeg; cursor: GoalCursorState | null }[] = []
): ShelterGoalView {
    const main = chainCount(c.chainId, ['USDC'], c.configKey, cursor);
    const others = legs.map(l =>
        chainCount(l.leg.chainId, [...new Set(l.leg.tokens.map(t => t.symbol))], l.leg.configKey, l.cursor)
    );
    const all = [main, ...others];
    const raised18 = all.reduce((sum, x) => sum + x.raised18, BigInt(0));
    const updated = all.map(x => x.updatedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    return {
        id: c.id,
        chainId: c.chainId,
        goalUsdc: c.goalUsdc,
        raised: usdcText(raised18),
        scannedTo: main.count.scannedTo,
        head: main.count.head,
        upToDate: all.every(x => x.count.upToDate),
        transfers: all.reduce((n, x) => n + x.count.transfers, 0),
        wallets: c.wallets,
        liveSources: liveSources(c, routes),
        updatedAt: main.updatedAt ? new Date(updated).toISOString() : null,
        chains: all.map(x => x.count),
    };
}

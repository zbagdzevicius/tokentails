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
import { GoalSource, GoalWallet, ShelterGoalView, sourcesFor } from 'src/shared-contracts/shelter-goal';

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

/** The public view of a goal from its cursor (a cursor for an older wallet set counts nothing). */
export function goalView(c: GoalCampaign, cursor: GoalCursorState | null, routes: ShareRoutes): ShelterGoalView {
    const current = cursor && cursor.configKey === c.configKey ? cursor : null;
    const scannedTo = current?.lastScannedBlock ?? null;
    const head = current?.head ?? null;
    const raised18 = current && /^\d+$/.test(current.raised18) ? BigInt(current.raised18) : BigInt(0);
    return {
        id: c.id,
        chainId: c.chainId,
        goalUsdc: c.goalUsdc,
        raised: usdcText(raised18),
        scannedTo,
        head,
        upToDate: scannedTo !== null && head !== null && head - scannedTo <= GOAL_UP_TO_DATE_LAG,
        transfers: current?.transfers ?? 0,
        wallets: c.wallets,
        liveSources: liveSources(c, routes),
        updatedAt: current?.lastSuccessAt ? new Date(current.lastSuccessAt).toISOString() : null,
    };
}

/**
 * A shelter campaign goal's live count (fact C-001), as `GET /shelter/goal/:id` serves it.
 *
 * The backend sums the US dollar stablecoins that CAME IN to the campaign wallets (each wallet inside
 * its own block range on the campaign chain), from the chains' Transfer logs, skipping transfers from
 * one campaign wallet to another. Every mainnet Token Tails pays out on counts (`chains`).
 * So spending never lowers the bar, and a handover (a new wallet the shelter owns) keeps counting
 * without counting its sweep twice. The web meter and the Heist both read this; they fall back to
 * the wallet's balance only while there is one wallet and it has never sent a transaction.
 *
 * Framework-free and TypeScript 4.8 compatible. Edit here, then run `node scripts/sync-contracts.mjs`.
 */

/** Every way USDC can reach a shelter wallet (facts schema GOAL_SOURCES). */
export type GoalSource = 'gifts' | 'match' | 'treats' | 'x402' | 'purchase-shares';

export const GOAL_SOURCES: readonly GoalSource[] = ['gifts', 'match', 'treats', 'x402', 'purchase-shares'];

/** Who holds a campaign wallet's key. */
export type GoalWalletHolder = 'token-tails' | 'shelter';

export interface GoalWallet {
    wallet: string;
    fromBlock: number;
    toBlock: number | null;
    holder: GoalWalletHolder;
}

/**
 * One chain's share of a goal's count. The campaign chain (Arc) counts its system Transfer log; every
 * other mainnet counts the Transfer logs of its US dollar stablecoins (USDC, USDC.e on Tempo, USDG on
 * Robinhood Chain) to the same campaign wallets. EURC and test coins are never counted.
 */
export interface GoalChainCount {
    chainId: number;
    /** The coins counted there ("USDC", "USDC.e", "USDG"). */
    symbols: string[];
    /** A decimal USD string with at most 6 decimals. */
    raised: string;
    /** Highest block counted on this chain; null until its first window (it then adds nothing). */
    scannedTo: number | null;
    head: number | null;
    upToDate: boolean;
    transfers: number;
}

export interface ShelterGoalView {
    id: string;
    chainId: number;
    /** The goal, a decimal USDC string ("50000"). */
    goalUsdc: string;
    /** USDC that came in, a decimal string with at most 6 decimals ("12.5"). */
    raised: string;
    /** Highest block counted; null until the first window is scanned (then nothing is claimed). */
    scannedTo: number | null;
    /** The chain head at the last scan; null when unknown. */
    head: number | null;
    /** True when the count reaches the head (within a minute or so): otherwise it is "at least". */
    upToDate: boolean;
    /** Transfers counted. */
    transfers: number;
    wallets: GoalWallet[];
    /**
     * The sources that can reach the open wallet today: a wallet Token Tails holds gets only
     * sponsored treats (custody rules), plus purchase shares while the backend settles them through
     * the split. Only these may be named as counting.
     */
    liveSources: GoalSource[];
    /** ISO time of the last successful scan, or null. */
    updatedAt: string | null;
    /**
     * Per-chain breakdown, the campaign chain first. `raised` is their sum, `transfers` too, and
     * `upToDate` is true only when every chain is. Empty from an older backend (campaign chain only).
     */
    chains: GoalChainCount[];
}

/** The goal endpoint's path. */
export const shelterGoalPath = (id: string) => `/shelter/goal/${encodeURIComponent(id)}`;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT = /^\d+(\.\d{1,18})?$/;
const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const blockOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

/** The sources that can reach a wallet held by `holder` (no backend: purchase shares are left out). */
export function sourcesFor(holder: GoalWalletHolder | null | undefined): GoalSource[] {
    return holder === 'shelter' ? ['gifts', 'match', 'treats', 'x402'] : ['treats'];
}

/** Checks a `GET /shelter/goal/:id` body; null when it is not one (the pages then fall back). */
export function parseShelterGoalView(raw: unknown): ShelterGoalView | null {
    if (!isObject(raw)) return null;
    if (typeof raw.id !== 'string' || typeof raw.chainId !== 'number') return null;
    if (typeof raw.goalUsdc !== 'string' || !AMOUNT.test(raw.goalUsdc)) return null;
    if (typeof raw.raised !== 'string' || !AMOUNT.test(raw.raised)) return null;
    const wallets: GoalWallet[] = [];
    for (const w of Array.isArray(raw.wallets) ? raw.wallets : []) {
        if (!isObject(w) || typeof w.wallet !== 'string' || !ADDRESS.test(w.wallet)) continue;
        const fromBlock = blockOrNull(w.fromBlock);
        if (fromBlock === null) continue;
        wallets.push({
            wallet: w.wallet.toLowerCase(),
            fromBlock,
            toBlock: blockOrNull(w.toBlock),
            holder: w.holder === 'shelter' ? 'shelter' : 'token-tails',
        });
    }
    const chains: GoalChainCount[] = [];
    for (const c of Array.isArray(raw.chains) ? raw.chains : []) {
        if (!isObject(c) || typeof c.chainId !== 'number' || !Number.isInteger(c.chainId) || c.chainId <= 0) continue;
        if (typeof c.raised !== 'string' || !AMOUNT.test(c.raised)) continue;
        chains.push({
            chainId: c.chainId,
            symbols: Array.isArray(c.symbols)
                ? c.symbols.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9.]{1,12}$/.test(x))
                : [],
            raised: c.raised,
            scannedTo: blockOrNull(c.scannedTo),
            head: blockOrNull(c.head),
            upToDate: c.upToDate === true,
            transfers: typeof c.transfers === 'number' && c.transfers >= 0 ? Math.floor(c.transfers) : 0,
        });
    }
    const liveSources = GOAL_SOURCES.filter(s => Array.isArray(raw.liveSources) && raw.liveSources.includes(s));
    return {
        id: raw.id,
        chainId: raw.chainId,
        goalUsdc: raw.goalUsdc,
        raised: raw.raised,
        scannedTo: blockOrNull(raw.scannedTo),
        head: blockOrNull(raw.head),
        upToDate: raw.upToDate === true,
        transfers: typeof raw.transfers === 'number' && raw.transfers >= 0 ? Math.floor(raw.transfers) : 0,
        wallets,
        liveSources,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        chains,
    };
}

/** "12.5" USDC -> 18-decimal units (the scale the pages sum in). */
export function usdcTo18Units(amount: string): bigint {
    const [whole, frac = ''] = amount.split('.');
    return BigInt((whole || '0') + frac.padEnd(18, '0').slice(0, 18));
}

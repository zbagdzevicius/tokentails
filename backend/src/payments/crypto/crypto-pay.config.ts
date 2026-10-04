import { getAddress, isAddress } from 'ethers';
import { PACK_SHELTER_IDS } from 'src/blessing/featured-shelters';
import { readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { CRYPTO_PAY_CHAINS, CryptoPayChain, CryptoPayToken, CryptoPayTokenKind, LOCAL_CHAIN_ID } from './crypto-chains';
import { TREASURY_ADDRESSES } from './treasury.public';

export type CryptoPayNetwork = 'mainnet' | 'testnet';

/** A chain the checkout can take payments on right now, with everything resolved from env. */
export interface ResolvedChain {
    chain: CryptoPayChain;
    rpcUrl: string;
    /** Token Tails treasury on this chain (checksummed), or null: then only the split route can use it. */
    treasury: string | null;
    tokens: CryptoPayToken[];
}

/** A ShelterSplit a buyer can pay directly once the shelter holds its own key (route `split`). */
export interface SplitRoute {
    chainId: number;
    token: CryptoPayTokenKind;
    address: string;
}

export interface CryptoPayConfig {
    enabled: boolean;
    network: CryptoPayNetwork;
    orderTtlMs: number;
    /** EURC per 1 USD of price, in millionths (1_000_000 = 1 EURC per USD). */
    eurcPerUsdMicro: bigint;
    /**
     * `fixed`: no rate is set, EURC is sold at a fixed euro price (1 EURC per USD of the price, not a
     * conversion). `dated`: CRYPTO_PAY_EURC_PER_USD with its CRYPTO_PAY_EURC_FX_DATE.
     */
    fxSource: EurcPricing;
    /** The date of a `dated` rate; null for a fixed euro price. */
    fxAsOf: string | null;
    /** False when a set rate is malformed, out of bounds, undated or older than EURC_FX_MAX_AGE_DAYS. */
    eurcEnabled: boolean;
    chains: ResolvedChain[];
    /** Shelter share of a shelter cat on the treasury and card routes, in bps (default 5000); null only when the env value is malformed. */
    catShelterBps: number | null;
    /** Shelters whose share goes through ShelterSplit (default Pink Paw). Others get no on-chain share. */
    splitShelterIds: string[];
    /** The keeper that sends treasury-route shelter shares from the hot wallet (off by default). */
    shelterShareEnabled: boolean;
    splits: SplitRoute[];
    /** SHELTER_HANDED_OVER: the shelter holds its own payout key. */
    handedOver: boolean;
    /** Wallets Token Tails holds for a shelter (lowercased); never a purchase recipient. */
    heldWallets: string[];
}

export type EurcPricing = 'fixed' | 'dated';

export const DEFAULT_ORDER_TTL_MIN = 30;
/** With no CRYPTO_PAY_EURC_PER_USD, EURC is a fixed euro price: 1 EURC per USD of the price ($5 -> 5 EURC). */
export const FIXED_EURC_PER_USD_MICRO = BigInt(1000000);
/** A dated EURC rate older than this stops EURC sales until it is updated. */
export const EURC_FX_MAX_AGE_DAYS = 30;
/** A set rate outside these bounds (EURC per USD) is treated as a typo: EURC is not sold. */
const EURC_RATE_MIN_MICRO = BigInt(500000);
const EURC_RATE_MAX_MICRO = BigInt(2000000);
const DAY_MS = 24 * 60 * 60 * 1000;

const flag = (value: string | undefined) => (value || '').trim().toLowerCase() === 'true';

function address(value: string | null | undefined): string | null {
    const trimmed = (value || '').trim();
    return trimmed && isAddress(trimmed) ? getAddress(trimmed) : null;
}

/** "0.92" -> 920000n millionths; malformed or not positive -> null. */
export function parsePerUsdMicroOrNull(value: string | undefined): bigint | null {
    const match = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec((value || '').trim());
    if (!match) {
        return null;
    }
    const micro = BigInt(match[1]) * BigInt(1000000) + BigInt((match[2] || '').padEnd(6, '0'));
    return micro > BigInt(0) ? micro : null;
}

/** "0.92" -> 920000n millionths; malformed or not positive -> 1 EURC per USD. */
export function parsePerUsdMicro(value: string | undefined): bigint {
    return parsePerUsdMicroOrNull(value) ?? FIXED_EURC_PER_USD_MICRO;
}

/**
 * How EURC is priced. No rate set: a fixed euro price (1 EURC per USD of the price). A set rate needs
 * a date (YYYY-MM-DD, not in the future, at most EURC_FX_MAX_AGE_DAYS old) and must lie between 0.5
 * and 2 EURC per USD; otherwise EURC is not sold, so a stale or mistyped rate never prices an item.
 */
export function eurcPricing(
    env: NodeJS.ProcessEnv,
    now: Date
): { micro: bigint; source: EurcPricing; asOf: string | null; enabled: boolean } {
    const raw = (env.CRYPTO_PAY_EURC_PER_USD || '').trim();
    if (!raw) {
        return { micro: FIXED_EURC_PER_USD_MICRO, source: 'fixed', asOf: null, enabled: true };
    }
    const micro = parsePerUsdMicroOrNull(raw);
    if (micro === FIXED_EURC_PER_USD_MICRO) {
        return { micro, source: 'fixed', asOf: null, enabled: true };
    }
    const date = (env.CRYPTO_PAY_EURC_FX_DATE || '').trim();
    const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
    const age = now.getTime() - at;
    const enabled =
        micro !== null &&
        micro >= EURC_RATE_MIN_MICRO &&
        micro <= EURC_RATE_MAX_MICRO &&
        Number.isFinite(at) &&
        age >= -DAY_MS &&
        age <= EURC_FX_MAX_AGE_DAYS * DAY_MS;
    return {
        micro: micro ?? FIXED_EURC_PER_USD_MICRO,
        source: 'dated',
        asOf: Number.isFinite(at) ? date : null,
        enabled,
    };
}

const isProduction = (env: NodeJS.ProcessEnv) => (env.NODE_ENV || '').trim().toLowerCase() === 'production';

/**
 * `mainnet` under NODE_ENV=production, else `testnet`; CRYPTO_PAY_NETWORK overrides, except that test
 * networks are never sold on in production (real items for faucet coins) unless
 * CRYPTO_PAY_ALLOW_TESTNET_IN_PROD=true is also set.
 */
function network(env: NodeJS.ProcessEnv): CryptoPayNetwork {
    const raw = (env.CRYPTO_PAY_NETWORK || '').trim().toLowerCase();
    const prod = isProduction(env);
    if (raw === 'testnet' && prod && !flag(env.CRYPTO_PAY_ALLOW_TESTNET_IN_PROD)) {
        console.error('crypto checkout: CRYPTO_PAY_NETWORK=testnet ignored under NODE_ENV=production; using mainnet');
        return 'mainnet';
    }
    if (raw === 'mainnet' || raw === 'testnet') {
        return raw;
    }
    return prod ? 'mainnet' : 'testnet';
}

/** The local anvil chain: testnet mode only, tokens and RPC from env only (the E2E). */
function localChain(env: NodeJS.ProcessEnv): CryptoPayChain | null {
    const tokens: CryptoPayToken[] = [];
    const usdc = address(env.CRYPTO_PAY_LOCAL_USDC);
    const eurc = address(env.CRYPTO_PAY_LOCAL_EURC);
    if (usdc) tokens.push({ token: 'USDC', symbol: 'USDC', address: usdc, decimals: 6 });
    if (eurc) tokens.push({ token: 'EURC', symbol: 'EURC', address: eurc, decimals: 6 });
    if (!tokens.length) {
        return null;
    }
    return {
        chainId: LOCAL_CHAIN_ID,
        key: 'local',
        name: 'Local test chain',
        testnet: true,
        explorer: '',
        rpcEnv: null,
        publicRpc: null,
        confirmations: 1,
        tip20Memo: false,
        tokens,
    };
}

/**
 * The RPC that decides whether a payment is real. By default each chain uses the `publicRpc` checked
 * in for it in crypto-chains.ts; on a mainnet that is always the chain operator's own endpoint (never
 * an unvetted third-party node, which could answer with a fake receipt and give items away). An env
 * value overrides it, e.g. a keyed provider for higher rate limits: CRYPTO_PAY_RPC_<chainId>, then
 * the chain's funding variable (RPC_ARC_MAINNET, ...).
 */
function rpcFor(chain: CryptoPayChain, env: NodeJS.ProcessEnv): string | null {
    const own = (env[`CRYPTO_PAY_RPC_${chain.chainId}`] || '').trim();
    if (own) return own;
    const shared = chain.rpcEnv ? (env[chain.rpcEnv] || '').trim() : '';
    if (shared) return shared;
    return chain.publicRpc;
}

/**
 * `CRYPTO_PAY_CAT_SPLITS`: `chainId:TOKEN:0xaddress` entries, comma separated. When unset, the main
 * shelter split (SHELTER_SPLIT_ADDRESS on SHELTER_CHAIN_ID) is used for USDC.
 */
function splitRoutes(env: NodeJS.ProcessEnv): SplitRoute[] {
    const raw = (env.CRYPTO_PAY_CAT_SPLITS || '').trim();
    if (!raw) {
        const shelter = readShelterConfig(env);
        return shelter.splitAddress ? [{ chainId: shelter.chainId, token: 'USDC', address: shelter.splitAddress }] : [];
    }
    const routes: SplitRoute[] = [];
    for (const entry of raw.split(',')) {
        const [chainId, token, addr] = entry.trim().split(':');
        const id = Number(chainId);
        const checked = address(addr);
        if (Number.isSafeInteger(id) && id > 0 && (token === 'USDC' || token === 'EURC') && checked) {
            routes.push({ chainId: id, token, address: checked });
        }
    }
    return routes;
}

/**
 * Pink Paw's share of each $5 shelter cat on the treasury and card routes: 50% (founder, 2026-10-04).
 * CRYPTO_PAY_CAT_SHELTER_BPS still overrides it; a set but malformed value leaves the share undecided.
 */
export const DEFAULT_CAT_SHELTER_BPS = 5000;

function catShelterBps(value: string | undefined): number | null {
    return (value || '').trim() ? bps(value) : DEFAULT_CAT_SHELTER_BPS;
}

function bps(value: string | undefined): number | null {
    const n = Number((value || '').trim());
    return (value || '').trim() && Number.isInteger(n) && n > 0 && n <= 10000 ? n : null;
}

/** Reads CRYPTO_PAY_*. Missing or malformed values fall back to safe defaults (feature off, no chains). */
export function readCryptoPayConfig(env: NodeJS.ProcessEnv = process.env, now: Date = new Date()): CryptoPayConfig {
    const net = network(env);
    const eurc = eurcPricing(env, now);
    const shelter = readShelterConfig(env);
    const held = new Set(shelter.heldWallets.map(w => w.toLowerCase()));
    const everyChainTreasury = address(env.CRYPTO_PAY_TREASURY);
    const candidates = CRYPTO_PAY_CHAINS.filter(chain => chain.testnet === (net === 'testnet'));
    // The local anvil chain never exists in production, whatever the network says.
    const local = net === 'testnet' && !isProduction(env) ? localChain(env) : null;
    if (local) candidates.push(local);

    const chains: ResolvedChain[] = [];
    for (const chain of candidates) {
        const rpcUrl = rpcFor(chain, env);
        if (!rpcUrl) continue;
        let treasury =
            address(env[`CRYPTO_PAY_TREASURY_${chain.chainId}`]) ||
            everyChainTreasury ||
            address(TREASURY_ADDRESSES[chain.chainId] ?? null);
        // Custody rule: a wallet Token Tails holds for a shelter never receives a purchase.
        if (treasury && held.has(treasury.toLowerCase())) {
            console.error(`crypto checkout: treasury for chain ${chain.chainId} is a held shelter wallet; ignored`);
            treasury = null;
        }
        const tokens = chain.tokens.filter(t => t.token !== 'EURC' || eurc.enabled);
        if (tokens.length) {
            chains.push({ chain, rpcUrl, treasury, tokens });
        }
    }

    const ttlMin = Number((env.CRYPTO_PAY_ORDER_TTL_MIN || '').trim());
    const shelterIds = (env.CRYPTO_PAY_SPLIT_SHELTER_IDS || '')
        .split(',')
        .map(id => id.trim().toLowerCase())
        .filter(id => /^[0-9a-f]{24}$/.test(id));
    return {
        enabled: flag(env.CRYPTO_PAY_ENABLED),
        network: net,
        orderTtlMs:
            (Number.isFinite(ttlMin) && ttlMin >= 5 && ttlMin <= 24 * 60 ? ttlMin : DEFAULT_ORDER_TTL_MIN) * 60000,
        eurcPerUsdMicro: eurc.micro,
        fxSource: eurc.source,
        fxAsOf: eurc.asOf,
        eurcEnabled: eurc.enabled,
        chains,
        catShelterBps: catShelterBps(env.CRYPTO_PAY_CAT_SHELTER_BPS),
        splitShelterIds: shelterIds.length ? shelterIds : [PACK_SHELTER_IDS.pinkPaw],
        shelterShareEnabled: flag(env.CRYPTO_PAY_SHELTER_SHARE_ENABLED),
        splits: splitRoutes(env),
        handedOver: shelter.handedOver,
        heldWallets: [...held],
    };
}

/** Formats millionths as a decimal string without trailing zeros ("1", "0.92"). */
export function formatMicro(micro: bigint): string {
    const whole = micro / BigInt(1000000);
    const frac = (micro % BigInt(1000000)).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : String(whole);
}

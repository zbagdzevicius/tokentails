import { getAddress, getBigInt, isAddress } from 'ethers';

/** Arc mainnet and testnet. Native USDC has 18 decimals there and pays for gas. */
export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_TESTNET_CHAIN_ID = 5042002;

/** Keyless public RPCs (the client's chains.ts list): a chain's config may name its own instead. */
const DEFAULT_RPC: Record<number, string> = {
    [ARC_MAINNET_CHAIN_ID]: 'https://rpc.mainnet.arc.io',
    [ARC_TESTNET_CHAIN_ID]: 'https://rpc.testnet.arc.io',
    4217: 'https://rpc.tempo.xyz',
    42431: 'https://rpc.moderato.tempo.xyz',
    42161: 'https://arb1.arbitrum.io/rpc',
    421614: 'https://sepolia-rollup.arbitrum.io/rpc',
    43114: 'https://api.avax.network/ext/bc/C/rpc',
    43113: 'https://api.avax-test.network/ext/bc/C/rpc',
    8453: 'https://mainnet.base.org',
    84532: 'https://sepolia.base.org',
    4663: 'https://rpc.mainnet.chain.robinhood.com',
    46630: 'https://rpc.testnet.chain.robinhood.com',
};

/** The keyless public RPC for `chainId`, or null when none is known. */
export const publicRpcUrl = (chainId: number): string | null => DEFAULT_RPC[chainId] || null;

/** 0.01 USDC in wei (18 decimals). */
const DEFAULT_AMOUNT_WEI = '10000000000000000';
/** 1 USDC in wei: 100 gifts a day at the default amount. */
const DEFAULT_DAILY_BUDGET_WEI = '1000000000000000000';
/** 0.01 USDC in wei per x402 cat card. */
const DEFAULT_X402_PRICE_WEI = '10000000000000000';

export interface ShelterOnchainConfig {
    donateEnabled: boolean;
    x402Enabled: boolean;
    chainId: number;
    rpcUrl: string | null;
    splitAddress: string | null;
    /** Server hot wallet key. Never logged or returned. */
    privateKey: string | null;
    amountWei: bigint;
    dailyBudgetWei: bigint;
    x402PriceWei: bigint;
    /** DonateRouter (F1): ownerless, keeps no balance. Null until deployed. */
    routerAddress: string | null;
    /** First block the RouterDonation scan reads. Null: the scan starts near the head on its first run. */
    routerFromBlock: number | null;
    /** Relay of signed EIP-3009 wallet gifts; the hot wallet pays gas only. */
    relayEnabled: boolean;
    /** Relayed transactions per UTC day across all donors (gas budget). */
    relayDailyTx: number;
    /** Relayed gift bounds in USDC base units (6 decimals). */
    relayMinBase: bigint;
    relayMaxBase: bigint;
    /**
     * True only after Pink Paw holds its own payout key (the on-chain rotation). Until then every
     * public mainnet path (relay, match, flush) stays off: see publicGivingAllowed.
     */
    handedOver: boolean;
    /** Token Tails 1:1 match of router gifts, from its own funds. All amounts in USDC base units. */
    matchEnabled: boolean;
    matchPerGiftBase: bigint;
    matchMinGiftBase: bigint;
    matchDailyBase: bigint;
    matchPoolBase: bigint;
    /** Optional: the split's treasury, so a shelter wallet claim can never name it. */
    treasuryAddress: string | null;
    /**
     * SHELTER_CLAIM_ALLOWED_WALLETS (lowercased): the only wallets `POST /shelter/claim` accepts. Empty:
     * every claim is refused. The shelter tells Token Tails its wallet through a separate channel first;
     * the signature then proves it controls that wallet.
     */
    claimAllowedWallets: string[];
    /**
     * SHELTER_MATCH_EXCLUDE (lowercased): team and other non-public wallets. Their router gifts are never
     * matched and never counted as public wallet gifts.
     */
    notPublicWallets: string[];
    /** SHELTER_RELAY_IP_PEPPER: secret HMAC key for the stored IP hash. Null: no IP hash is stored. */
    relayIpPepper: string | null;
    /**
     * Wallets Token Tails holds for a shelter (lowercased): TOKEN_TAILS_HELD_WALLETS plus
     * SHELTER_HELD_WALLETS. Never a claimable shelter wallet, never a public-giving recipient, never an
     * x402 `payTo`.
     */
    heldWallets: string[];
}

/**
 * Wallets Token Tails holds for a shelter: Pink Paw's payout wallet, created and held by Token Tails
 * until the handover. The client copy is TOKEN_TAILS_HELD_WALLETS in
 * client/components/shelter-payouts/giveMode.ts (shelter-onchain.config.spec.ts pins both). After the
 * handover the shelter's new wallet is rotated in; this one stays on the list.
 */
export const TOKEN_TAILS_HELD_WALLETS: readonly string[] = ['0xe299299b846ba629f5a591dbf4f562bcc07a0f37'];

function flag(value: string | undefined): boolean {
    return (value || '').trim().toLowerCase() === 'true';
}

function wei(value: string | undefined, fallback: string): bigint {
    const trimmed = (value || '').trim();
    return getBigInt(/^\d+$/.test(trimmed) ? trimmed : fallback);
}

function address(value: string | undefined): string | null {
    const trimmed = (value || '').trim();
    return trimmed && isAddress(trimmed) ? getAddress(trimmed) : null;
}

/** Reads the SHELTER_* variables. Missing or malformed values fall back to safe defaults (features off). */
export function readShelterConfig(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig {
    const chainId = Number((env.SHELTER_CHAIN_ID || '').trim() || ARC_MAINNET_CHAIN_ID);
    const safeChainId = Number.isInteger(chainId) && chainId > 0 ? chainId : ARC_MAINNET_CHAIN_ID;
    const rpcUrl = (env.SHELTER_ARC_RPC_URL || '').trim() || DEFAULT_RPC[safeChainId] || null;
    const privateKey = (env.SHELTER_DONATE_PRIVATE_KEY || '').trim() || null;
    return {
        donateEnabled: flag(env.SHELTER_DONATE_ENABLED),
        x402Enabled: flag(env.SHELTER_X402_ENABLED),
        chainId: safeChainId,
        rpcUrl,
        splitAddress: address(env.SHELTER_SPLIT_ADDRESS),
        privateKey,
        amountWei: wei(env.SHELTER_DONATE_AMOUNT_WEI, DEFAULT_AMOUNT_WEI),
        dailyBudgetWei: wei(env.SHELTER_DONATE_DAILY_BUDGET_WEI, DEFAULT_DAILY_BUDGET_WEI),
        x402PriceWei: wei(env.SHELTER_X402_PRICE_WEI, DEFAULT_X402_PRICE_WEI),
        routerAddress: address(env.SHELTER_ROUTER_ADDRESS),
        routerFromBlock: blockNumber(env.SHELTER_ROUTER_FROM_BLOCK),
        relayEnabled: flag(env.SHELTER_RELAY_ENABLED),
        relayDailyTx: positiveInt(env.SHELTER_RELAY_DAILY_TX, DEFAULT_RELAY_DAILY_TX),
        relayMinBase: usdcBase(env.SHELTER_RELAY_MIN_USDC, DEFAULT_RELAY_MIN),
        relayMaxBase: usdcBase(env.SHELTER_RELAY_MAX_USDC, DEFAULT_RELAY_MAX),
        handedOver: flag(env.SHELTER_HANDED_OVER),
        matchEnabled: flag(env.SHELTER_MATCH_ENABLED),
        matchPerGiftBase: usdcBase(env.SHELTER_MATCH_PER_GIFT, DEFAULT_MATCH_PER_GIFT),
        matchMinGiftBase: usdcBase(env.SHELTER_MATCH_MIN_GIFT, DEFAULT_MATCH_MIN_GIFT),
        matchDailyBase: usdcBase(env.SHELTER_MATCH_DAILY, DEFAULT_MATCH_DAILY),
        matchPoolBase: usdcBase(env.SHELTER_MATCH_POOL, DEFAULT_MATCH_POOL),
        treasuryAddress: address(env.SHELTER_TREASURY_ADDRESS),
        claimAllowedWallets: addressList(env.SHELTER_CLAIM_ALLOWED_WALLETS),
        notPublicWallets: addressList(env.SHELTER_MATCH_EXCLUDE),
        relayIpPepper: (env.SHELTER_RELAY_IP_PEPPER || '').trim() || null,
        heldWallets: [...new Set([...TOKEN_TAILS_HELD_WALLETS, ...addressList(env.SHELTER_HELD_WALLETS)])],
    };
}

/**
 * The optional "try it live" testnet (SHELTER_TRY_*): a second relay and match next to the main chain, so
 * the payouts page's testnet block can be gasless and matched while treats, claims and the campaign stay
 * on SHELTER_CHAIN_ID. Null unless SHELTER_TRY_CHAIN_ID names a known testnet other than the main chain.
 * It never reuses the main hot wallet key (SHELTER_TRY_PRIVATE_KEY holds test funds only), never sends
 * treats or serves x402, and takes no shelter claims.
 */
export function readTryShelterConfig(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig | null {
    const raw = (env.SHELTER_TRY_CHAIN_ID || '').trim();
    const chainId = Number(raw);
    if (!raw || !Number.isInteger(chainId) || chainId <= 0 || !isTestnetChain(chainId)) {
        return null;
    }
    const base = readShelterConfig(env);
    if (chainId === base.chainId) {
        return null;
    }
    return {
        ...base,
        chainId,
        rpcUrl: (env.SHELTER_TRY_RPC_URL || '').trim() || DEFAULT_RPC[chainId] || null,
        splitAddress: address(env.SHELTER_TRY_SPLIT_ADDRESS),
        privateKey: (env.SHELTER_TRY_PRIVATE_KEY || '').trim() || null,
        routerAddress: address(env.SHELTER_TRY_ROUTER_ADDRESS),
        routerFromBlock: blockNumber(env.SHELTER_TRY_ROUTER_FROM_BLOCK),
        relayEnabled: flag(env.SHELTER_TRY_RELAY_ENABLED),
        matchEnabled: flag(env.SHELTER_TRY_MATCH_ENABLED),
        treasuryAddress: address(env.SHELTER_TRY_TREASURY_ADDRESS),
        donateEnabled: false,
        x402Enabled: false,
        handedOver: false,
        claimAllowedWallets: [],
    };
}

const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/**
 * More chains for the gas relay (multi-chain wallet giving), one config each. Unset (the default),
 * nothing changes: the relay serves SHELTER_CHAIN_ID and the optional try-it testnet only.
 *
 *   SHELTER_RELAY_CHAINS=84532,421614          chain ids, comma-separated
 *   SHELTER_CHAIN_<id>_RPC_URL                 optional; defaults to the chain's public RPC
 *   SHELTER_CHAIN_<id>_SPLIT_ADDRESS           the chain's USDC ShelterSplit
 *   SHELTER_CHAIN_<id>_ROUTER_ADDRESS          its DonateRouter (the relay needs it)
 *   SHELTER_CHAIN_<id>_ROUTER_FROM_BLOCK       optional; where the RouterDonation scan starts
 *   SHELTER_CHAIN_<id>_KEY_ENV                 the NAME of the env variable holding that chain's hot
 *                                              wallet key (gas only), e.g. SHELTER_DONATEHOT_KEY
 *   SHELTER_CHAIN_<id>_RELAY_ENABLED           'true' to relay there
 *   SHELTER_CHAIN_<id>_RELAY_DAILY_TX          optional daily budget in relayed transactions
 *   SHELTER_CHAIN_<id>_MATCH_ENABLED           optional; the match stays off unless 'true'
 *   SHELTER_CHAIN_<id>_TREASURY_ADDRESS        optional; the split's treasury
 *
 * A chain already served (the main chain or the try-it testnet) is skipped. A testnet never signs with
 * the main hot wallet key (test funds only). A mainnet entry still waits for SHELTER_HANDED_OVER and the
 * on-chain claim check, like the main chain. These chains send no treats, serve no x402 and take no
 * shelter claims. Only the router path can be relayed: a gift straight into a ShelterSplit (approve +
 * disburse) is always sent and paid for by the donor's own wallet.
 */
export function readRelayChainConfigs(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig[] {
    const raw = (env.SHELTER_RELAY_CHAINS || '').trim();
    if (!raw) {
        return [];
    }
    const base = readShelterConfig(env);
    const tryConfig = readTryShelterConfig(env);
    const seen = new Set<number>([base.chainId, ...(tryConfig ? [tryConfig.chainId] : [])]);
    const out: ShelterOnchainConfig[] = [];
    for (const part of raw.split(',')) {
        const chainId = Number(part.trim());
        if (!Number.isSafeInteger(chainId) || chainId <= 0 || seen.has(chainId)) {
            continue;
        }
        seen.add(chainId);
        const p = `SHELTER_CHAIN_${chainId}_`;
        const keyEnv = (env[`${p}KEY_ENV`] || '').trim();
        const rawKey = ENV_NAME.test(keyEnv) ? (env[keyEnv] || '').trim() : '';
        let privateKey = PRIVATE_KEY.test(rawKey) ? rawKey : null;
        const testnet = isTestnetChain(chainId);
        if (privateKey && testnet && base.privateKey && privateKey.toLowerCase() === base.privateKey.toLowerCase()) {
            privateKey = null;
        }
        out.push({
            ...base,
            chainId,
            rpcUrl: (env[`${p}RPC_URL`] || '').trim() || DEFAULT_RPC[chainId] || null,
            splitAddress: address(env[`${p}SPLIT_ADDRESS`]),
            privateKey,
            routerAddress: address(env[`${p}ROUTER_ADDRESS`]),
            routerFromBlock: blockNumber(env[`${p}ROUTER_FROM_BLOCK`]),
            relayEnabled: flag(env[`${p}RELAY_ENABLED`]),
            relayDailyTx: positiveInt(env[`${p}RELAY_DAILY_TX`], base.relayDailyTx),
            matchEnabled: flag(env[`${p}MATCH_ENABLED`]),
            treasuryAddress: address(env[`${p}TREASURY_ADDRESS`]),
            donateEnabled: false,
            x402Enabled: false,
            handedOver: testnet ? false : base.handedOver,
            claimAllowedWallets: [],
        });
    }
    return out;
}

/**
 * Every chain the relay and match serve: the main one, the try-it testnet when configured, then the
 * SHELTER_RELAY_CHAINS entries.
 */
export function readShelterConfigs(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig[] {
    const tryConfig = readTryShelterConfig(env);
    return [readShelterConfig(env), ...(tryConfig ? [tryConfig] : []), ...readRelayChainConfigs(env)];
}

/** The config serving `chainId` (main, try-it or a SHELTER_RELAY_CHAINS entry), or null when none does. */
export function shelterConfigFor(chainId: number, env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig | null {
    return readShelterConfigs(env).find(c => c.chainId === Number(chainId)) || null;
}

/** USDC base units (6 decimals). Exported by name: the facts registry (`match_cap`) reads it. */
export const DEFAULT_MATCH_PER_GIFT = 1000000;
/** 0.10 USDC: smaller gifts are not matched. */
export const DEFAULT_MATCH_MIN_GIFT = 100000;
/** 2 USDC of match per UTC day. */
export const DEFAULT_MATCH_DAILY = 2000000;
/** 10 USDC of match in total, until raised. */
export const DEFAULT_MATCH_POOL = 10000000;
/** 0.01 to 100 USDC per relayed gift. */
export const DEFAULT_RELAY_MIN = 10000;
export const DEFAULT_RELAY_MAX = 100000000;
export const DEFAULT_RELAY_DAILY_TX = 50;

/**
 * Testnets from funding/framework/tracks/a-build/chains.json (Arc, Base Sepolia, Arbitrum Sepolia,
 * Robinhood, Fuji, Tempo, Mezo, Monad testnets) and a local anvil. Every other chain id counts as a
 * mainnet, so an unknown chain is gated like real money.
 */
export const TESTNET_CHAIN_IDS: readonly number[] = [
    ARC_TESTNET_CHAIN_ID,
    84532,
    421614,
    46630,
    43113,
    42431,
    31611,
    10143,
    31337,
];

export const isTestnetChain = (chainId: number): boolean => TESTNET_CHAIN_IDS.includes(chainId);

/** Chains whose native coin is USDC (18 decimals), so the match can use ShelterSplit.donate. */
export const NATIVE_USDC_CHAIN_IDS: readonly number[] = [ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID];

/** Parses a decimal USDC amount ("0.10", "2") to 6-decimal base units; malformed falls back. */
export function usdcBase(value: string | undefined, fallback: number): bigint {
    const trimmed = (value || '').trim();
    const match = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(trimmed);
    if (!match) {
        return getBigInt(fallback);
    }
    return getBigInt(match[1]) * getBigInt(1000000) + getBigInt((match[2] || '').padEnd(6, '0') || '0');
}

/** 6-decimal base units to a decimal USDC string without trailing zeros ("1", "0.1", "0.000001"). */
export function formatUsdc(base: bigint): string {
    const negative = base < getBigInt(0);
    const abs = negative ? -base : base;
    const whole = abs / getBigInt(1000000);
    const frac = (abs % getBigInt(1000000)).toString().padStart(6, '0').replace(/0+$/, '');
    return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

function positiveInt(value: string | undefined, fallback: number): number {
    const n = Number((value || '').trim());
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** A comma-separated list of addresses, lowercased; malformed entries are dropped. */
function addressList(value: string | undefined): string[] {
    return (value || '')
        .split(',')
        .map(v => v.trim().toLowerCase())
        .filter(v => /^0x[0-9a-f]{40}$/.test(v));
}

function blockNumber(value: string | undefined): number | null {
    const n = Number((value || '').trim());
    return (value || '').trim() && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

const ZERO = getBigInt(0);

/**
 * The first, synchronous gate on public giving (relay, match, flush). A testnet is always allowed
 * (test USDC, no real money). A mainnet, or any chain id not known to be a testnet, is allowed only once
 * SHELTER_HANDED_OVER is 'true': until Pink Paw holds its own key, public money would land in a
 * wallet Token Tails controls. On a mainnet the services also require the on-chain check
 * `ShelterClaimService.publicGivingVerified` (every split recipient is a rotated, shelter-held claim).
 * Neither gate can stop a stranger calling a deployed router directly: no DonateRouter is deployed on a
 * mainnet before the handover (docs/BACKEND.md).
 */
export function publicGivingAllowed(config: Pick<ShelterOnchainConfig, 'chainId' | 'handedOver'>): boolean {
    return isTestnetChain(config.chainId) || config.handedOver === true;
}

/** The relay needs its flag, an RPC, the router, the hot wallet key (gas only) and the giving gate. */
export function relayReady(config: ShelterOnchainConfig): boolean {
    return !!(config.relayEnabled && config.rpcUrl && config.routerAddress && config.privateKey);
}

/** The match needs its flag, an RPC, the split, the router (to know which gifts to match) and the key. */
export function matchReady(config: ShelterOnchainConfig): boolean {
    return !!(
        config.matchEnabled &&
        config.rpcUrl &&
        config.splitAddress &&
        config.routerAddress &&
        config.privateKey &&
        config.matchPerGiftBase > ZERO
    );
}

/** Server-paid gifts need the flag, an RPC, the split contract, the hot wallet key and a positive amount. */
export function donateReady(config: ShelterOnchainConfig): boolean {
    return !!(
        config.donateEnabled &&
        config.rpcUrl &&
        config.splitAddress &&
        config.privateKey &&
        config.amountWei > ZERO
    );
}

/**
 * Agent payments need the flag, an RPC, the split contract and a positive price. No server key is used.
 * The agent pays ShelterSplit, which pays the split's shelter wallets: on a mainnet that is public money,
 * so it also waits for the giving gate (publicGivingAllowed: SHELTER_HANDED_OVER), like the `exact`
 * scheme. Until the handover the split pays a wallet Token Tails holds for the shelter.
 */
export function x402Ready(config: ShelterOnchainConfig): boolean {
    return !!(
        config.x402Enabled &&
        config.rpcUrl &&
        config.splitAddress &&
        config.x402PriceWei > ZERO &&
        publicGivingAllowed(config)
    );
}

/**
 * Blocks the match scan stays behind the head, so a reorg cannot remove a gift after it was matched.
 * Arc has deterministic finality (0); every other chain, including unknown ones, waits 12.
 */
export const MATCH_CONFIRMATIONS: Record<number, number> = {
    [ARC_MAINNET_CHAIN_ID]: 0,
    [ARC_TESTNET_CHAIN_ID]: 0,
    31337: 0,
};
export const DEFAULT_MATCH_CONFIRMATIONS = 12;
export const matchConfirmations = (chainId: number): number =>
    MATCH_CONFIRMATIONS[chainId] ?? DEFAULT_MATCH_CONFIRMATIONS;

const EXPLORER: Record<number, string> = {
    [ARC_MAINNET_CHAIN_ID]: 'https://explorer.arc.io',
    [ARC_TESTNET_CHAIN_ID]: 'https://explorer.testnet.arc.io',
};

/** The Arc explorer link for `txHash` on `chainId` (docs.arc.io: testnet has its own explorer host). */
export function explorerTxUrl(txHash: string, chainId: number = ARC_MAINNET_CHAIN_ID): string {
    return `${EXPLORER[chainId] || EXPLORER[ARC_MAINNET_CHAIN_ID]}/tx/${txHash}`;
}

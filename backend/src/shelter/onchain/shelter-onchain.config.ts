import { getAddress, getBigInt, isAddress } from 'ethers';
import { CHAINS, ChainWallets, SplitInstance, WALLETS } from './wallet.config';

/** Arc mainnet and testnet. Native USDC has 18 decimals there and pays for gas. */
export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_TESTNET_CHAIN_ID = 5042002;

/** Keyless public RPCs per chain, from wallet.config.ts: a chain's config may name its own instead. */
const DEFAULT_RPC: Record<number, string> = Object.fromEntries(Object.values(CHAINS).map(c => [c.chainId, c.rpc]));

/** The keyless public RPC for `chainId`, or null when none is known. */
export const publicRpcUrl = (chainId: number): string | null => DEFAULT_RPC[chainId] || null;

/**
 * A separate keyless RPC for the impact indexer's eth_getLogs scan, used only while the chain reads its
 * default public RPC (the client's chains.ts `logRpc`): Monad's public RPCs cap eth_getLogs at 100
 * blocks, sepolia.base.org at 1,000, and Arc testnet's at ~10,000 with tight rate limits.
 */
const LOG_RPC: Record<number, string> = Object.fromEntries(
    Object.values(CHAINS)
        .filter(c => c.logRpc)
        .map(c => [c.chainId, c.logRpc as string])
);

/** The widest eth_getLogs range (blocks) a chain's default public RPC or its LOG_RPC accepts, when small. */
const LOG_RANGE: Record<string, number> = {
    'https://mainnet.base.org': 2000,
    'https://sepolia.base.org': 1000,
    'https://rpc.monad.xyz': 100,
    'https://testnet-rpc.monad.xyz': 100,
    'https://rpc.testnet.arc.io': 10000,
    'https://monad-testnet.api.onfinality.io/public': 10000,
    // Avalanche's public C-Chain RPCs refuse eth_getLogs over 2,048 blocks.
    'https://api.avax.network/ext/bc/C/rpc': 2048,
    'https://api.avax-test.network/ext/bc/C/rpc': 2048,
};

/**
 * Where the indexer reads logs for `config` and the widest window that URL takes: SHELTER_CHAIN_<id>_
 * LOG_RPC_URL when set, the dedicated LOG_RPC while the chain uses its default public RPC, else the
 * chain's own RPC. `maxRange` is null when no cap is known (SHELTER_LOG_CHUNK alone applies).
 */
export function logRpcFor(config: Pick<ShelterOnchainConfig, 'chainId' | 'rpcUrl' | 'logRpcUrl'>): {
    url: string | null;
    maxRange: number | null;
} {
    const url =
        config.logRpcUrl ||
        (config.rpcUrl && config.rpcUrl === DEFAULT_RPC[config.chainId] && LOG_RPC[config.chainId]) ||
        config.rpcUrl ||
        null;
    return { url, maxRange: (url && LOG_RANGE[url]) || null };
}

/** A recorded ShelterSplit instance, flattened for the config readers. */
export interface RecordedSplit {
    chainId: number;
    network: 'mainnet' | 'testnet';
    address: string;
    /** The payout token's symbol. */
    token: string;
    decimals: number;
    tx?: string;
    fromBlock?: number;
    router?: string;
    routerFromBlock?: number;
}

const flat = (c: ChainWallets, s: SplitInstance): RecordedSplit => ({
    chainId: c.chainId,
    network: c.network,
    address: s.address,
    token: s.token.symbol,
    decimals: s.token.decimals,
    ...(s.deployTx ? { tx: s.deployTx } : {}),
    ...(s.fromBlock !== undefined ? { fromBlock: s.fromBlock } : {}),
    ...(s.router ? { router: s.router } : {}),
    ...(s.routerFromBlock !== undefined ? { routerFromBlock: s.routerFromBlock } : {}),
});

/** The wallet.config.ts section of `chainId`, or null for a chain it does not list. */
export const chainWallets = (chainId: number): ChainWallets | null =>
    Object.values(CHAINS).find(c => c.chainId === Number(chainId)) || null;

/** The ShelterSplit a chain defaults to (wallet.config.ts `split`), or null. */
export function recordedSplit(chainId: number): RecordedSplit | null {
    const c = chainWallets(chainId);
    return c?.split ? flat(c, c.split) : null;
}

/** Any recorded ShelterSplit at `address` on `chainId` (the default one or another, e.g. EURC), or null. */
export function recordedSplitAt(chainId: number, address: string | null | undefined): RecordedSplit | null {
    const c = chainWallets(chainId);
    const a = String(address || '').toLowerCase();
    const s = c && [...(c.split ? [c.split] : []), ...c.otherSplits].find(x => x.address === a);
    return c && s ? flat(c, s) : null;
}

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
    /**
     * Server-paid treats paid in the split's ERC-20/TIP-20 token on a SHELTER_RELAY_CHAINS entry
     * (SHELTER_CHAIN_<id>_TREAT_*). Absent on the main chain, whose treat is the native donate() path.
     * On such an entry `donateEnabled` is the treat flag, and `amountWei`/`dailyBudgetWei` are the treat
     * amount and budget scaled to 18 decimals, so stored treat rows and the community total keep one unit.
     */
    treat?: TreatTokenConfig;
    /**
     * A SHELTER_RELAY_CHAINS entry's x402 price (SHELTER_CHAIN_<id>_X402_PRICE), a decimal amount of
     * that chain's payment coin ("0.01"): the split's token (scaled by its on-chain decimals), or native
     * USDC on Arc. Absent on the main chain, which keeps SHELTER_X402_PRICE_WEI.
     */
    x402Price?: string;
    /**
     * Why a wallet.config.ts chain cannot send treats although its flag is on
     * (no recorded split, a key of the other network class). Shown by GET /shelter/donate/status.
     */
    disabledReason?: string;
    /** First block the impact indexer reads on a relay chain (SHELTER_CHAIN_<id>_SPLIT_FROM_BLOCK or recorded). */
    splitFromBlock?: number | null;
    /** The split's deploy transaction (recorded): its receipt block is the indexer's start when no block is known. */
    splitDeployTx?: string | null;
    /** SHELTER_CHAIN_<id>_LOG_RPC_URL: the indexer's eth_getLogs RPC for that chain (see logRpcFor). */
    logRpcUrl?: string | null;
    /** Served from wallet.config.ts (zero config): its treats are health-checked before they are offered. */
    autoChain?: boolean;
    /**
     * SHELTER_HANDED_OVER=false, an emergency off: mainnet relay, match and x402 stay closed whatever the
     * on-chain claim check says. Unset, they open per chain once publicGivingVerified passes.
     */
    givingKilled?: boolean;
}

/** A treat paid in a token (approve + disburse, or disburseWithMemo on Tempo). */
export interface TreatTokenConfig {
    /** Treat size in token base units (the seven chains' tokens all have 6 decimals; TIP-20 always does). */
    amountBase: bigint;
    /** Daily treat budget on this chain, in token base units. */
    dailyBudgetBase: bigint;
    decimals: number;
    /** What the treat is paid in, for the give page chip (USDC, USDC.e, USDG, pathUSD...). */
    coin: string;
    /** Tempo TIP-20: disburseWithMemo(amount, bytes32 memo) instead of disburse(amount, string memo). */
    memo32: boolean;
}

/** Tempo mainnet and testnet: TIP-20 tokens, disburseWithMemo, fees paid in a USD stablecoin. */
export const TIP20_CHAIN_IDS: readonly number[] = [4217, 42431];

/** Default coin name per chain for a token treat (SHELTER_CHAIN_<id>_TREAT_COIN overrides it). */
const TREAT_COIN: Record<number, string> = {
    [ARC_MAINNET_CHAIN_ID]: 'USDC',
    [ARC_TESTNET_CHAIN_ID]: 'USDC',
    4217: 'USDC.e',
    42431: 'pathUSD',
    4663: 'USDG',
    46630: 'mUSDC',
};

/**
 * Chains whose treat coin is not a US dollar: Robinhood Chain testnet pays the test MockUSDC (mUSDC).
 * Their treats never add into the USD community totals (amountWei is summed as USDC there).
 */
export const NON_USD_TREAT_CHAIN_IDS: readonly number[] = [46630];

/** The coin a treat on `chainId` is paid in: USDC unless the chain is known to pay another token. */
export const treatCoin = (chainId: number): string => TREAT_COIN[chainId] || 'USDC';

/** 0.01 and 1 token (6 decimals): the token twins of the main chain's default treat and budget. */
const DEFAULT_TREAT_AMOUNT_BASE = 10000;
const DEFAULT_TREAT_DAILY_BUDGET_BASE = 1000000;
const TREAT_DECIMALS = 6;
const TO_18 = getBigInt(10) ** getBigInt(18 - TREAT_DECIMALS);

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

export type ShelterNetwork = 'mainnet' | 'testnet';

/** Whether this process runs as production: NODE_ENV=production, the backend's production signal. */
export const isProductionEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
    (env.NODE_ENV || '').trim().toLowerCase() === 'production';

/**
 * The network class of the default main chain: SHELTER_NETWORK=mainnet|testnet when set, else mainnet
 * under NODE_ENV=production and testnet everywhere else (a dev box needs no shelter env at all).
 */
export function shelterNetwork(env: NodeJS.ProcessEnv = process.env): ShelterNetwork {
    const raw = (env.SHELTER_NETWORK || '').trim().toLowerCase();
    if (raw === 'mainnet' || raw === 'testnet') {
        return raw;
    }
    return isProductionEnv(env) ? 'mainnet' : 'testnet';
}

/** The main chain when SHELTER_CHAIN_ID is unset or malformed: Arc mainnet or Arc testnet by shelterNetwork. */
export const defaultShelterChainId = (env: NodeJS.ProcessEnv = process.env): number =>
    shelterNetwork(env) === 'mainnet' ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID;

/** Reads the SHELTER_* variables. Missing or malformed values fall back to safe defaults (features off). */
export function readShelterConfig(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig {
    const fallbackChainId = defaultShelterChainId(env);
    const chainId = Number((env.SHELTER_CHAIN_ID || '').trim() || fallbackChainId);
    const safeChainId = Number.isInteger(chainId) && chainId > 0 ? chainId : fallbackChainId;
    const rpcUrl = (env.SHELTER_ARC_RPC_URL || '').trim() || DEFAULT_RPC[safeChainId] || null;
    const privateKey = (env.SHELTER_DONATE_PRIVATE_KEY || '').trim() || null;
    // The main chain's split defaults to its wallet.config.ts section (a recorded deploy), like every
    // other chain; SHELTER_SPLIT_ADDRESS still wins. Arc mainnet has no recorded split yet.
    const envSplit = address(env.SHELTER_SPLIT_ADDRESS);
    const recorded = envSplit ? null : recordedSplit(safeChainId);
    const splitAddress = envSplit || (recorded ? getAddress(recorded.address) : null);
    const fromRecorded = recordedSplitAt(safeChainId, splitAddress);
    return {
        // On by default; 'false' is an emergency off (treats need a split, a key and a funded hot wallet).
        donateEnabled: flagOr(env.SHELTER_DONATE_ENABLED, true),
        x402Enabled: flagOr(env.SHELTER_X402_ENABLED, true),
        chainId: safeChainId,
        rpcUrl,
        splitAddress,
        splitDeployTx: fromRecorded?.tx || null,
        splitFromBlock: fromRecorded?.fromBlock ?? null,
        ...(recorded ? { autoChain: true } : {}),
        givingKilled: (env.SHELTER_HANDED_OVER || '').trim().toLowerCase() === 'false',
        privateKey,
        amountWei: wei(env.SHELTER_DONATE_AMOUNT_WEI, DEFAULT_AMOUNT_WEI),
        dailyBudgetWei: wei(env.SHELTER_DONATE_DAILY_BUDGET_WEI, DEFAULT_DAILY_BUDGET_WEI),
        x402PriceWei: wei(env.SHELTER_X402_PRICE_WEI, DEFAULT_X402_PRICE_WEI),
        routerAddress: address(env.SHELTER_ROUTER_ADDRESS) || (recorded?.router ? getAddress(recorded.router) : null),
        routerFromBlock: blockNumber(env.SHELTER_ROUTER_FROM_BLOCK) ?? recorded?.routerFromBlock ?? null,
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
        treasuryAddress:
            address(env.SHELTER_TREASURY_ADDRESS) ||
            (recorded
                ? address(WALLETS[isTestnetChain(safeChainId) ? 'testnet' : 'mainnet'].treasury || undefined)
                : null),
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
    // The rule above, enforced: a main hot wallet key that holds real money (a mainnet main chain) never
    // signs on the try-it testnet, even when it is pasted as SHELTER_TRY_PRIVATE_KEY (the one-wallet plan
    // uses one address on both networks, so "the testnet hot key" can be the mainnet one).
    let tryKey = (env.SHELTER_TRY_PRIVATE_KEY || '').trim() || null;
    if (
        tryKey &&
        !isTestnetChain(base.chainId) &&
        base.privateKey &&
        tryKey.toLowerCase() === base.privateKey.toLowerCase()
    ) {
        tryKey = null;
    }
    return {
        ...base,
        chainId,
        rpcUrl: (env.SHELTER_TRY_RPC_URL || '').trim() || DEFAULT_RPC[chainId] || null,
        splitAddress: address(env.SHELTER_TRY_SPLIT_ADDRESS),
        privateKey: tryKey,
        routerAddress: address(env.SHELTER_TRY_ROUTER_ADDRESS),
        routerFromBlock: blockNumber(env.SHELTER_TRY_ROUTER_FROM_BLOCK),
        relayEnabled: flag(env.SHELTER_TRY_RELAY_ENABLED),
        matchEnabled: flag(env.SHELTER_TRY_MATCH_ENABLED),
        treasuryAddress: address(env.SHELTER_TRY_TREASURY_ADDRESS),
        donateEnabled: false,
        x402Enabled: false,
        handedOver: false,
        claimAllowedWallets: [],
        autoChain: false,
        splitDeployTx: null,
        splitFromBlock: null,
    };
}

const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

/**
 * More chains, one config each: the wallet.config.ts chains of the main chain's class (automatic), plus
 * SHELTER_RELAY_CHAINS entries (an advanced override, configured by their per-chain variables only).
 *
 *   SHELTER_RELAY_CHAINS=84532,421614          chain ids, comma-separated
 *   SHELTER_CHAIN_<id>_RPC_URL                 optional; defaults to the chain's public RPC
 *   SHELTER_CHAIN_<id>_SPLIT_ADDRESS           the chain's USDC ShelterSplit
 *   SHELTER_CHAIN_<id>_ROUTER_ADDRESS          its DonateRouter (the relay needs it)
 *   SHELTER_CHAIN_<id>_ROUTER_FROM_BLOCK       optional; where the RouterDonation scan starts
 *   SHELTER_CHAIN_<id>_SPLIT_FROM_BLOCK        optional; where the impact indexer starts (default: the
 *                                              recorded deploy block, read from the deploy tx receipt)
 *   SHELTER_CHAIN_<id>_LOG_RPC_URL             optional; the indexer's eth_getLogs RPC (see logRpcFor)
 *   SHELTER_CHAIN_<id>_KEY_ENV                 the NAME of the env variable holding that chain's hot
 *                                              wallet key (gas only), e.g. SHELTER_DONATEHOT_KEY
 *   SHELTER_CHAIN_<id>_RELAY_ENABLED           'true' to relay there
 *   SHELTER_CHAIN_<id>_RELAY_DAILY_TX          optional daily budget in relayed transactions
 *   SHELTER_CHAIN_<id>_MATCH_ENABLED           optional; the match stays off unless 'true'
 *   SHELTER_CHAIN_<id>_TREASURY_ADDRESS        optional; the split's treasury
 *   SHELTER_CHAIN_<id>_TREAT_ENABLED           'true' to send server-paid treats there too (the give
 *                                              page's network picker); needs SPLIT_ADDRESS and KEY_ENV
 *   SHELTER_CHAIN_<id>_TREAT_AMOUNT            optional treat size in the split's token, decimal
 *                                              ("0.01", the default); 6-decimal tokens only
 *   SHELTER_CHAIN_<id>_TREAT_DAILY_BUDGET      optional daily treat budget on that chain ("1", the default)
 *   SHELTER_CHAIN_<id>_TREAT_COIN              optional coin label (default per chain: USDC, USDC.e on
 *                                              Tempo, USDG on Robinhood; pathUSD/mUSDC on their testnets)
 *   SHELTER_CHAIN_<id>_X402_ENABLED            'true' to offer the x402 agent cat card on this chain too
 *                                              (one `accepts` entry per chain; needs SPLIT_ADDRESS, no key)
 *   SHELTER_CHAIN_<id>_X402_PRICE              optional price per card in the chain's payment coin,
 *                                              decimal ("0.01", the default): the split's token, scaled by
 *                                              its on-chain decimals, or native USDC on Arc
 *
 * Zero config: every chain in wallet.config.ts with a ShelterSplit of the main chain's network class
 * (autoChainIds) is served without any variable above. Its treats follow SHELTER_DONATE_ENABLED and its
 * x402 card SHELTER_X402_ENABLED; split, router, router first block and treasury come from
 * wallet.config.ts (generated by `fund a:ingest`) and the key is SHELTER_DONATE_PRIVATE_KEY. Every
 * per-chain variable above still overrides a default (an advanced override), and _TREAT_ENABLED=false /
 * _X402_ENABLED=false switch one chain off. Relay and match stay off unless their own flag is 'true'.
 *
 * A chain already served (the main chain or the try-it testnet) is skipped. A testnet never signs with
 * the main hot wallet key while the main chain is a mainnet (test funds only). On a mainnet entry the
 * relay and match still wait for the on-chain claim check (and stay shut under SHELTER_HANDED_OVER=false),
 * like the main chain. Treats there are Token Tails' own money (approve + disburse from the hot wallet, or
 * disburseWithMemo on Tempo), so they need only their own flag, like the main chain's treat. x402 there
 * is the agent's money paid into that chain's split (approve + disburse, disburseWithMemo on Tempo,
 * donate on Arc); on a mainnet it waits for the on-chain claim check like the main chain. These chains take
 * no shelter claims. Only the router path can be relayed: a gift straight
 * into a ShelterSplit (approve + disburse) is always sent and paid for by the donor's own wallet.
 */
export function readRelayChainConfigs(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig[] {
    const base = readShelterConfig(env);
    // Every chain in wallet.config.ts with a split of the main chain's network class serves treats
    // and x402 whenever the main chain's own switch is on (zero config). Mainnet splits are not
    // recorded yet, so a mainnet main chain (production) lists none of them.
    // SHELTER_AUTO_CHAINS=off (an advanced kill switch) serves SHELTER_RELAY_CHAINS entries only.
    const auto = (env.SHELTER_AUTO_CHAINS || '').trim().toLowerCase() === 'off' ? [] : autoChainIds(base.chainId);
    const listed = [...chainList(env.SHELTER_RELAY_CHAINS), ...auto];
    if (!listed.length) {
        return [];
    }
    const tryConfig = readTryShelterConfig(env);
    const seen = new Set<number>([base.chainId, ...(tryConfig ? [tryConfig.chainId] : [])]);
    const out: ShelterOnchainConfig[] = [];
    for (const chainId of listed) {
        if (seen.has(chainId)) {
            continue;
        }
        seen.add(chainId);
        const p = `SHELTER_CHAIN_${chainId}_`;
        const testnet = isTestnetChain(chainId);
        // A wallet.config.ts chain: the split, router, treasury and key default (below). A chain named
        // by SHELTER_RELAY_CHAINS alone reads its per-chain variables only, as before.
        const shortcut = auto.includes(chainId);
        const recorded = shortcut ? recordedSplit(chainId) : null;
        const keyEnv = (env[`${p}KEY_ENV`] || '').trim();
        let privateKey: string | null = null;
        let disabledReason: string | undefined;
        if (keyEnv) {
            const rawKey = ENV_NAME.test(keyEnv) ? (env[keyEnv] || '').trim() : '';
            privateKey = PRIVATE_KEY.test(rawKey) ? rawKey : null;
            // A main-chain key that holds real money never signs on a testnet. When the main chain is a
            // testnet itself (the local e2e), its key holds test funds only and may serve the other testnets.
            if (
                privateKey &&
                testnet &&
                !isTestnetChain(base.chainId) &&
                base.privateKey &&
                privateKey.toLowerCase() === base.privateKey.toLowerCase()
            ) {
                privateKey = null;
            }
            if (!privateKey && shortcut && base.privateKey) {
                // A stale or mistyped KEY_ENV (e.g. a variable that was never set) falls back to the one
                // main key, the zero-config default, instead of silently closing the chain.
                privateKey = base.privateKey;
            }
            if (!privateKey) {
                disabledReason = `${p}KEY_ENV names ${keyEnv}, which holds no usable key`;
            }
        } else if (shortcut || testnet === isTestnetChain(base.chainId)) {
            // One key: SHELTER_DONATE_PRIVATE_KEY signs on every chain of the main chain's network class
            // (one EVM key works on every EVM chain), whether the chain came from wallet.config.ts or
            // was only named in SHELTER_RELAY_CHAINS. A mainnet key never signs on a testnet.
            privateKey = base.privateKey;
            if (!privateKey) {
                disabledReason = 'SHELTER_DONATE_PRIVATE_KEY is not set';
            }
        }
        const splitAddress = address(env[`${p}SPLIT_ADDRESS`]) || (recorded ? getAddress(recorded.address) : null);
        if (shortcut && !splitAddress) {
            disabledReason = `no ShelterSplit for chain ${chainId} in wallet.config.ts`;
        }
        const routerAddress =
            address(env[`${p}ROUTER_ADDRESS`]) ||
            (recorded?.router && splitAddress && recorded.address === splitAddress.toLowerCase()
                ? getAddress(recorded.router)
                : null);
        const fromRecorded = recordedSplitAt(chainId, splitAddress);
        const treatAmountBase = usdcBase(env[`${p}TREAT_AMOUNT`], DEFAULT_TREAT_AMOUNT_BASE);
        const treatBudgetBase = usdcBase(env[`${p}TREAT_DAILY_BUDGET`], DEFAULT_TREAT_DAILY_BUDGET_BASE);
        const coin = (env[`${p}TREAT_COIN`] || '').trim();
        let donateEnabled = flagOr(env[`${p}TREAT_ENABLED`], shortcut && base.donateEnabled);
        if (donateEnabled && fromRecorded && fromRecorded.decimals !== TREAT_DECIMALS) {
            // Treat amounts are 6-decimal token units; an 18-decimal payout token (MUSD) is not supported.
            donateEnabled = false;
            disabledReason = `the split's token has ${fromRecorded.decimals} decimals; treats pay 6-decimal tokens only`;
        }
        out.push({
            ...base,
            chainId,
            rpcUrl: (env[`${p}RPC_URL`] || '').trim() || DEFAULT_RPC[chainId] || null,
            logRpcUrl: (env[`${p}LOG_RPC_URL`] || '').trim() || null,
            splitAddress,
            privateKey,
            routerAddress,
            routerFromBlock:
                blockNumber(env[`${p}ROUTER_FROM_BLOCK`]) ?? (routerAddress ? recorded?.routerFromBlock ?? null : null),
            relayEnabled: flag(env[`${p}RELAY_ENABLED`]),
            relayDailyTx: positiveInt(env[`${p}RELAY_DAILY_TX`], base.relayDailyTx),
            matchEnabled: flag(env[`${p}MATCH_ENABLED`]),
            treasuryAddress:
                address(env[`${p}TREASURY_ADDRESS`]) ||
                (shortcut ? address(WALLETS[testnet ? 'testnet' : 'mainnet'].treasury || undefined) : null),
            donateEnabled,
            amountWei: treatAmountBase * TO_18,
            dailyBudgetWei: treatBudgetBase * TO_18,
            treat: {
                amountBase: treatAmountBase,
                dailyBudgetBase: treatBudgetBase,
                decimals: TREAT_DECIMALS,
                coin: /^[A-Za-z0-9.]{1,12}$/.test(coin) ? coin : fromRecorded?.token || treatCoin(chainId),
                memo32: TIP20_CHAIN_IDS.includes(chainId),
            },
            x402Enabled: flagOr(env[`${p}X402_ENABLED`], shortcut && base.x402Enabled),
            x402Price: decimalAmount(env[`${p}X402_PRICE`], DEFAULT_X402_PRICE),
            handedOver: testnet ? false : base.handedOver,
            claimAllowedWallets: [],
            splitFromBlock: blockNumber(env[`${p}SPLIT_FROM_BLOCK`]) ?? fromRecorded?.fromBlock ?? null,
            splitDeployTx: fromRecorded?.tx || null,
            ...(disabledReason ? { disabledReason } : {}),
            ...(shortcut ? { autoChain: true } : {}),
        });
    }
    return out;
}

/** A comma-separated chain id list; malformed entries are dropped. */
export function chainList(value: string | undefined): number[] {
    return (value || '')
        .split(',')
        .map(part => Number(part.trim()))
        .filter(id => Number.isSafeInteger(id) && id > 0);
}

/**
 * The chains served without any per-chain variable: every chain in wallet.config.ts with a ShelterSplit
 * of the main chain's network class (testnets when SHELTER_CHAIN_ID is a testnet, mainnets otherwise).
 */
export function autoChainIds(mainChainId: number): number[] {
    const testnet = isTestnetChain(mainChainId);
    return Object.values(CHAINS)
        .filter(c => c.split && (c.network === 'testnet') === testnet && c.chainId !== mainChainId)
        .map(c => c.chainId);
}

/** A per-chain flag that overrides a default: 'true' or 'false' wins, anything else is the default. */
function flagOr(value: string | undefined, fallback: boolean): boolean {
    const v = (value || '').trim().toLowerCase();
    return v === 'true' ? true : v === 'false' ? false : fallback;
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
 * The first, synchronous gate on public giving (relay, match, flush, x402). A testnet is always allowed
 * (test USDC, no real money). A mainnet, or any chain id not known to be a testnet, passes this gate
 * unless SHELTER_HANDED_OVER=false (an emergency off); the services then require the on-chain check
 * `ShelterClaimService.publicGivingVerified` for that chain: every split recipient is a rotated,
 * shelter-held claim, so public money never lands in a wallet Token Tails holds. Neither gate can stop a
 * stranger calling a deployed router (or the split) directly. Since the 2026-10-05 decision the mainnet
 * wave deploys DonateRouters before the handover; such gifts reach the wallet Token Tails holds, are
 * disclosed as held, and are forwarded at handover (docs/BACKEND.md).
 */
export function publicGivingAllowed(config: Pick<ShelterOnchainConfig, 'chainId' | 'givingKilled'>): boolean {
    return isTestnetChain(config.chainId) || config.givingKilled !== true;
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
    const priced = config.x402Price !== undefined ? /[1-9]/.test(config.x402Price) : config.x402PriceWei > ZERO;
    return !!(config.x402Enabled && config.rpcUrl && config.splitAddress && priced && publicGivingAllowed(config));
}

/** The default x402 price on a SHELTER_RELAY_CHAINS entry, in that chain's payment coin. */
const DEFAULT_X402_PRICE = '0.01';

/** A positive decimal amount ("0.01", "2"), up to 18 fraction digits; anything else falls back. */
function decimalAmount(value: string | undefined, fallback: string): string {
    const trimmed = (value || '').trim();
    return /^\d{1,12}(\.\d{1,18})?$/.test(trimmed) && /[1-9]/.test(trimmed) ? trimmed : fallback;
}

/**
 * A decimal amount in base units of a coin with `decimals` places ("0.01", 6 -> 10000n). Null when the
 * amount has more fraction digits than the coin (it cannot be paid exactly) or is malformed.
 */
export function decimalToBase(value: string, decimals: number): bigint | null {
    const match = /^(\d{1,12})(?:\.(\d{1,18}))?$/.exec((value || '').trim());
    if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
        return null;
    }
    const frac = (match[2] || '').replace(/0+$/, '');
    if (frac.length > decimals) {
        return null;
    }
    return getBigInt(match[1]) * getBigInt(10) ** getBigInt(decimals) + getBigInt(frac.padEnd(decimals, '0') || '0');
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

/** Explorer hosts per chain, from wallet.config.ts (a treat on any served chain links to its own explorer). */
const EXPLORER: Record<number, string> = Object.fromEntries(Object.values(CHAINS).map(c => [c.chainId, c.explorer]));

/** The explorer host for `chainId`, or null when none is known. */
export const explorerBase = (chainId: number): string | null => EXPLORER[chainId] || null;

/** The explorer link for `txHash` on `chainId` (docs.arc.io: Arc testnet has its own explorer host). */
export function explorerTxUrl(txHash: string, chainId: number = ARC_MAINNET_CHAIN_ID): string {
    return `${EXPLORER[chainId] || EXPLORER[ARC_MAINNET_CHAIN_ID]}/tx/${txHash}`;
}

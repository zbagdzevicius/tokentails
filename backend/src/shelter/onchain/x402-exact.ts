import { getAddress, getBigInt, isAddress, verifyTypedData } from 'ethers';
import { TESTNET_CHAIN_IDS as SHELTER_TESTNET_CHAIN_IDS, TOKEN_TAILS_HELD_WALLETS } from './shelter-onchain.config';

/*
 * The standard x402 `exact` scheme (coinbase/x402, specs/schemes/exact/scheme_exact_evm.md, x402 v1
 * wire format) for GET /shelter/agent/cat-card.
 *
 * Custody: `payTo` is the SHELTER's own wallet. The agent signs an EIP-3009 TransferWithAuthorization
 * from its wallet straight to that wallet, and the facilitator submits it and pays the gas. Token Tails
 * never holds, relays or signs for the money; it only asks the facilitator to verify and settle, then
 * reads the settled transfer back from the chain. On a mainnet network the scheme is offered only once
 * the shelter holds its own key (SHELTER_HANDED_OVER=true).
 *
 * Plain classes and functions, instantiated inside ShelterX402Service (no Nest providers).
 */

export const EXACT_SCHEME = 'exact';
export const EXACT_X402_VERSION = 1;
export const EXACT_MAX_TIMEOUT_SECONDS = 120;
export const EXACT_DESCRIPTION = 'A Token Tails cat card; the price goes to the shelter';
export const DEFAULT_TESTNET_FACILITATOR = 'https://x402.org/facilitator';
/** 0.01 USDC. */
export const DEFAULT_EXACT_PRICE = '0.01';
const USDC_DECIMALS = 6;
const ZERO = getBigInt(0);
const TEN = getBigInt(10);

/** keccak256("Transfer(address,address,uint256)"). */
export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * The EVM networks of the x402 v1 wire format (`NetworkSchema` of the `x402` npm package 1.2.0, which
 * x402-fetch and x402-axios parse every `accepts` entry with) and their chain ids. Standard clients throw
 * on any other network name, so only these count as "standard x402".
 */
export const X402_V1_NETWORK_CHAIN_IDS: Record<string, number> = {
    base: 8453,
    'base-sepolia': 84532,
    avalanche: 43114,
    'avalanche-fuji': 43113,
    polygon: 137,
    'polygon-amoy': 80002,
    sei: 1329,
    'sei-testnet': 1328,
    iotex: 4689,
    abstract: 2741,
    'abstract-testnet': 11124,
    peaq: 3338,
    story: 1514,
    educhain: 41923,
    'skale-base-sepolia': 324705682,
};

/**
 * Names some facilitators use that are NOT x402 v1 networks. Offered only with an explicitly configured
 * SHELTER_X402_FACILITATOR_URL that supports them, and even then off-the-shelf x402 clients reject the
 * offer; the shelter-rail SDK pays them through its `chainIds` option.
 */
export const NON_STANDARD_NETWORK_CHAIN_IDS: Record<string, number> = {
    arbitrum: 42161,
    'arbitrum-sepolia': 421614,
    optimism: 10,
    'optimism-sepolia': 11155420,
    'arc-testnet': 5042002,
};

/** Every network name this module knows a chain id for. Unknown names need SHELTER_X402_EXACT_CHAIN_ID. */
export const EXACT_NETWORK_CHAIN_IDS: Record<string, number> = {
    ...X402_V1_NETWORK_CHAIN_IDS,
    ...NON_STANDARD_NETWORK_CHAIN_IDS,
};

/**
 * Networks the public x402.org facilitator settles for x402 v1 `exact` (its /supported list, checked
 * 2026-10-04: base-sepolia only on EVM). Any other network needs SHELTER_X402_FACILITATOR_URL.
 */
export const PUBLIC_FACILITATOR_NETWORKS = new Set(['base-sepolia']);

/** The asset must be a 6-decimal USDC-style token: prices are parsed as 6-decimal amounts. */
export const EXACT_ASSET_DECIMALS = 6;

/**
 * Networks where an `exact` payment moves no real money. Anything not listed counts as mainnet, so an
 * unknown network stays behind the handover gate (fail closed).
 */
const TESTNET_NETWORKS = new Set([
    'base-sepolia',
    'avalanche-fuji',
    'arbitrum-sepolia',
    'polygon-amoy',
    'optimism-sepolia',
    'sei-testnet',
    'abstract-testnet',
    'skale-base-sepolia',
    'arc-testnet',
]);
// The x402 testnets plus every testnet the shelter config knows (Tempo, Robinhood, Monad testnets...),
// so a custom CAIP-2 network on one of those is never gated like a mainnet.
const TESTNET_CHAIN_IDS = new Set([
    84532,
    43113,
    421614,
    80002,
    11155420,
    1328,
    11124,
    324705682,
    5042002,
    31337,
    ...SHELTER_TESTNET_CHAIN_IDS,
]);

export interface ExactConfig {
    enabled: boolean;
    network: string | null;
    chainId: number | null;
    asset: string | null;
    assetName: string;
    assetVersion: string;
    payTo: string | null;
    facilitatorUrl: string | null;
    /**
     * Extra headers for every facilitator call (an API key or bearer token from
     * SHELTER_X402_FACILITATOR_AUTH). Secret: never logged or sent to clients.
     */
    facilitatorHeaders: Record<string, string>;
    priceBase: bigint;
    rpcUrl: string | null;
    handedOver: boolean;
    testnet: boolean;
    /** True when `network` is an x402 v1 network name that off-the-shelf clients accept. */
    standard: boolean;
    /** Why exact is not offered, or null when it is. Logged, never sent to clients. */
    blocked: string | null;
}

function flag(value: string | undefined): boolean {
    return (value || '').trim().toLowerCase() === 'true';
}

function addr(value: string | undefined): string | null {
    const trimmed = (value || '').trim();
    return trimmed && isAddress(trimmed) ? getAddress(trimmed) : null;
}

/** "0.01" USDC → 10000 base units. Null for anything that is not a plain positive decimal. */
export function parseUsdc(value: string, decimals = USDC_DECIMALS): bigint | null {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
    if (!m || (m[2] && m[2].length > decimals)) {
        return null;
    }
    const base = getBigInt(m[1]) * TEN ** getBigInt(decimals) + getBigInt((m[2] || '').padEnd(decimals, '0') || '0');
    return base > ZERO ? base : null;
}

export function isTestnet(network: string | null, chainId: number | null): boolean {
    return (!!network && TESTNET_NETWORKS.has(network)) || (chainId !== null && TESTNET_CHAIN_IDS.has(chainId));
}

export interface ExactConfigOptions {
    /**
     * Address of the Token Tails hot wallet (derived by the caller, e.g. hotWalletAddress(config)); this
     * module never reads a key. `payTo` may never be it.
     */
    hotWallet?: string | null;
}

/** Reads the SHELTER_X402_EXACT_* variables from process.env. Missing or malformed values switch exact off. */
export function readExactConfig(env: NodeJS.ProcessEnv = process.env, options: ExactConfigOptions = {}): ExactConfig {
    const network = (env.SHELTER_X402_EXACT_NETWORK || '').trim() || null;
    const rawChain = Number((env.SHELTER_X402_EXACT_CHAIN_ID || '').trim());
    const envChainId = Number.isInteger(rawChain) && rawChain > 0 ? rawChain : null;
    const knownChainId = network ? EXACT_NETWORK_CHAIN_IDS[network] ?? null : null;
    const chainId = envChainId ?? knownChainId;
    // A known network name decides; an unknown one falls back to its chain id.
    const testnet = network && knownChainId ? TESTNET_NETWORKS.has(network) : isTestnet(network, chainId);
    const standard = !!network && network in X402_V1_NETWORK_CHAIN_IDS;
    const explicitFacilitator = (env.SHELTER_X402_FACILITATOR_URL || '').trim().replace(/\/+$/, '') || null;
    const facilitatorUrl =
        explicitFacilitator ||
        (testnet && network && PUBLIC_FACILITATOR_NETWORKS.has(network) ? DEFAULT_TESTNET_FACILITATOR : null);
    const facilitatorAuth = (env.SHELTER_X402_FACILITATOR_AUTH || '').trim();
    const facilitatorAuthHeader = (env.SHELTER_X402_FACILITATOR_AUTH_HEADER || '').trim() || 'Authorization';
    const config: ExactConfig = {
        enabled: flag(env.SHELTER_X402_EXACT_ENABLED),
        network,
        chainId,
        asset: addr(env.SHELTER_X402_EXACT_ASSET),
        assetName: (env.SHELTER_X402_EXACT_ASSET_NAME || '').trim() || 'USDC',
        assetVersion: (env.SHELTER_X402_EXACT_ASSET_VERSION || '').trim() || '2',
        payTo: addr(env.SHELTER_X402_EXACT_PAYTO),
        facilitatorUrl,
        facilitatorHeaders: facilitatorAuth ? { [facilitatorAuthHeader]: facilitatorAuth } : {},
        priceBase: parseUsdc(env.SHELTER_X402_EXACT_PRICE || DEFAULT_EXACT_PRICE) ?? ZERO,
        rpcUrl: (env.SHELTER_X402_EXACT_RPC || '').trim() || null,
        handedOver: flag(env.SHELTER_HANDED_OVER),
        testnet,
        standard,
        blocked: null,
    };
    // Wallets and contracts Token Tails controls or that are not the shelter: payTo may be none of them.
    const notShelter: Array<[string | null, string]> = [
        [addr(env.SHELTER_SPLIT_ADDRESS), 'the ShelterSplit contract'],
        [addr(env.SHELTER_ROUTER_ADDRESS), 'the DonateRouter contract'],
        [addr(env.SHELTER_TREASURY_ADDRESS), "the split's treasury"],
        [addr(options.hotWallet || undefined), 'the Token Tails hot wallet'],
        ...[...TOKEN_TAILS_HELD_WALLETS, ...(env.SHELTER_HELD_WALLETS || '').split(',')].map(
            (w): [string | null, string] => [addr(w.trim()), 'a wallet Token Tails holds for the shelter']
        ),
    ];
    const clash = config.payTo ? notShelter.find(([address]) => address && address === config.payTo) : undefined;
    config.blocked = !config.enabled
        ? 'SHELTER_X402_EXACT_ENABLED is off'
        : !network
        ? 'SHELTER_X402_EXACT_NETWORK is not set'
        : !chainId
        ? 'SHELTER_X402_EXACT_CHAIN_ID is not set for an unknown network'
        : envChainId && knownChainId && envChainId !== knownChainId
        ? `SHELTER_X402_EXACT_CHAIN_ID ${envChainId} does not match ${network} (${knownChainId})`
        : !standard && !explicitFacilitator
        ? `network ${network} is not supported by x402 v1 facilitators; set SHELTER_X402_FACILITATOR_URL to one that supports it`
        : !config.asset
        ? 'SHELTER_X402_EXACT_ASSET is not a valid address'
        : !config.payTo
        ? 'SHELTER_X402_EXACT_PAYTO is not a valid address'
        : clash
        ? `SHELTER_X402_EXACT_PAYTO must be the shelter's own wallet, not ${clash[1]}`
        : !facilitatorUrl
        ? testnet
            ? `SHELTER_X402_FACILITATOR_URL is required: the public facilitator settles only ${[
                  ...PUBLIC_FACILITATOR_NETWORKS,
              ].join(', ')}`
            : 'SHELTER_X402_FACILITATOR_URL is required on mainnet'
        : !config.rpcUrl
        ? 'SHELTER_X402_EXACT_RPC is required: every settlement is re-read on-chain before it counts'
        : config.priceBase <= ZERO
        ? 'SHELTER_X402_EXACT_PRICE is not a positive USDC amount'
        : !testnet && !config.handedOver
        ? 'exact on mainnet waits for the shelter handover (SHELTER_HANDED_OVER=true)'
        : null;
    return config;
}

export function exactReady(config: ExactConfig): boolean {
    return config.blocked === null;
}

/**
 * x402 v1 PaymentRequirements for the `exact` EVM scheme. No `outputSchema` key: the x402 package's
 * schema has it as an optional record, and `null` fails its parse in clients and in facilitators.
 */
export interface ExactRequirement {
    scheme: 'exact';
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: { name: string; version: string };
}

export function buildExactRequirement(config: ExactConfig, resource: string): ExactRequirement {
    return {
        scheme: EXACT_SCHEME,
        network: config.network!,
        maxAmountRequired: config.priceBase.toString(),
        resource,
        description: EXACT_DESCRIPTION,
        mimeType: 'application/json',
        payTo: config.payTo!,
        maxTimeoutSeconds: EXACT_MAX_TIMEOUT_SECONDS,
        asset: config.asset!,
        extra: { name: config.assetName, version: config.assetVersion },
    };
}

export interface ExactAuthorization {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
}

/** The decoded X-PAYMENT header, kept as sent so it can be forwarded to the facilitator unchanged. */
export interface ExactPaymentPayload {
    x402Version: number;
    scheme: 'exact';
    network: string;
    payload: { signature: string; authorization: ExactAuthorization };
}

const HEX = /^0x[0-9a-fA-F]*$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,78}$/;

// ---------------------------------------------------------------- x402 v2 HTTP transport

/** x402 v2 header names (specs/transports-v2/http.md); v1 uses X-PAYMENT and X-PAYMENT-RESPONSE. */
export const V2_PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
export const V2_PAYMENT_SIGNATURE_HEADER = 'PAYMENT-SIGNATURE';
export const V2_PAYMENT_RESPONSE_HEADER = 'PAYMENT-RESPONSE';

/** The CAIP-2 name v2 uses for a network: v1 names map through their chain id, `eip155:*` stays. */
export function caipNetwork(network: string, chainId?: number | null): string {
    if (network.startsWith('eip155:')) {
        return network;
    }
    const id = EXACT_NETWORK_CHAIN_IDS[network] ?? chainId;
    return id ? `eip155:${id}` : network;
}

/**
 * Turns a v2 PAYMENT-SIGNATURE payload (`{x402Version: 2, accepted: {scheme, network}, payload}`) into
 * the v1 X-PAYMENT shape the paywall checks, so both versions share one verify path. The signed
 * authorization is the same in both versions. `v1Network` maps a CAIP-2 network back to the name the
 * requirement uses (the exact network for its chain). Anything that is not v2 is returned unchanged.
 */
export function normalizePaymentHeader(header: string, v1Network: (caip: string) => string = n => n): string {
    let decoded: any;
    try {
        decoded = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
    } catch {
        return header;
    }
    if (decoded?.x402Version !== 2 || !decoded.accepted || typeof decoded.accepted !== 'object') {
        return header;
    }
    const scheme = decoded.accepted.scheme;
    const network = typeof decoded.accepted.network === 'string' ? decoded.accepted.network : '';
    const v1 = {
        x402Version: 1,
        scheme,
        network: scheme === EXACT_SCHEME ? v1Network(network) : network,
        payload: decoded.payload,
    };
    return Buffer.from(JSON.stringify(v1)).toString('base64');
}

/** The scheme named in an X-PAYMENT header, or null when it is not base64 JSON. */
export function peekScheme(header: string): string | null {
    try {
        const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
        return typeof decoded?.scheme === 'string' ? decoded.scheme : null;
    } catch {
        return null;
    }
}

/**
 * Decodes and checks an `exact` X-PAYMENT header against the requirement: version, scheme, network,
 * `to === payTo`, `value >= price`, a live validity window and a well-formed signature. Returns the
 * payload, or the reason it is refused.
 */
export function decodeXPayment(
    header: string,
    requirement: ExactRequirement,
    nowSeconds: number = Math.floor(Date.now() / 1000)
): ExactPaymentPayload | string {
    let decoded: any;
    try {
        decoded = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
    } catch {
        return 'X-PAYMENT is not base64 JSON';
    }
    if (!decoded || typeof decoded !== 'object') {
        return 'X-PAYMENT is not base64 JSON';
    }
    if (decoded.x402Version !== EXACT_X402_VERSION) {
        return 'unsupported x402Version';
    }
    if (decoded.scheme !== EXACT_SCHEME) {
        return 'unsupported scheme';
    }
    if (decoded.network !== requirement.network) {
        return `wrong network; use ${requirement.network}`;
    }
    const signature = decoded.payload?.signature;
    const auth = decoded.payload?.authorization;
    if (typeof signature !== 'string' || !HEX.test(signature) || signature.length < 132) {
        return 'payload.signature is missing or malformed';
    }
    if (!auth || typeof auth !== 'object') {
        return 'payload.authorization is missing';
    }
    for (const key of ['value', 'validAfter', 'validBefore'] as const) {
        if (typeof auth[key] !== 'string' || !UINT.test(auth[key])) {
            return `authorization.${key} must be a decimal string`;
        }
    }
    if (typeof auth.from !== 'string' || !isAddress(auth.from)) {
        return 'authorization.from is not an address';
    }
    if (typeof auth.to !== 'string' || !isAddress(auth.to)) {
        return 'authorization.to is not an address';
    }
    if (typeof auth.nonce !== 'string' || !BYTES32.test(auth.nonce)) {
        return 'authorization.nonce must be 32 bytes of hex';
    }
    if (getAddress(auth.to) !== getAddress(requirement.payTo)) {
        return `authorization.to must be the shelter wallet ${requirement.payTo}`;
    }
    if (getBigInt(auth.value) < getBigInt(requirement.maxAmountRequired)) {
        return `authorization.value is below ${requirement.maxAmountRequired}`;
    }
    if (getBigInt(auth.validAfter) > getBigInt(nowSeconds)) {
        return 'authorization is not valid yet';
    }
    // A few seconds of headroom, so the facilitator still has time to settle.
    if (getBigInt(auth.validBefore) <= getBigInt(nowSeconds + 6)) {
        return 'authorization has expired';
    }
    // x402 clients sign validBefore = now + maxTimeoutSeconds; a minute of clock skew is allowed.
    if (getBigInt(auth.validBefore) > getBigInt(nowSeconds + requirement.maxTimeoutSeconds + 60)) {
        return 'authorization window is too long';
    }
    return {
        x402Version: EXACT_X402_VERSION,
        scheme: EXACT_SCHEME,
        network: decoded.network,
        payload: {
            signature,
            authorization: {
                from: auth.from,
                to: auth.to,
                value: auth.value,
                validAfter: auth.validAfter,
                validBefore: auth.validBefore,
                nonce: auth.nonce,
            },
        },
    };
}

/** EIP-712 types of EIP-3009 transferWithAuthorization (what an `exact` payer signs). */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
    TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
    ],
};

export function exactDomain(config: ExactConfig) {
    return {
        name: config.assetName,
        version: config.assetVersion,
        chainId: config.chainId!,
        verifyingContract: config.asset!,
    };
}

/**
 * A cheap local check before calling the facilitator: an EOA (65-byte) signature must recover to
 * `from`. Longer signatures (ERC-1271 smart wallets) are left to the facilitator.
 */
export function signatureMatches(config: ExactConfig, payment: ExactPaymentPayload): boolean {
    const { signature, authorization } = payment.payload;
    if (signature.length !== 132) {
        return true;
    }
    try {
        const signer = verifyTypedData(
            exactDomain(config),
            TRANSFER_WITH_AUTHORIZATION_TYPES,
            authorization,
            signature
        );
        return getAddress(signer) === getAddress(authorization.from);
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------- facilitator

export type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export class FacilitatorError extends Error {
    constructor(message: string, readonly reason: string) {
        super(message);
        this.name = 'FacilitatorError';
    }
}

export interface VerifyResult {
    isValid: boolean;
    invalidReason?: string;
    payer?: string;
}

export interface SettleResult {
    success: boolean;
    errorReason?: string;
    payer?: string;
    transaction: string;
    network?: string;
}

/** POST {facilitator}/verify and /settle with the x402 v1 body. Injectable fetch for tests. */
export class FacilitatorClient {
    constructor(
        private readonly baseUrl: string,
        private readonly fetchFn: FetchLike = (globalThis as any).fetch,
        private readonly timeouts = { verifyMs: 10_000, settleMs: 60_000 },
        /** Auth headers for facilitators that need an API key (ExactConfig.facilitatorHeaders). */
        private readonly headers: Record<string, string> = {}
    ) {}

    async verify(paymentPayload: ExactPaymentPayload, requirements: ExactRequirement): Promise<VerifyResult> {
        const body = await this.post('verify', paymentPayload, requirements, this.timeouts.verifyMs);
        return {
            isValid: body?.isValid === true,
            invalidReason: typeof body?.invalidReason === 'string' ? body.invalidReason : undefined,
            payer: typeof body?.payer === 'string' ? body.payer : undefined,
        };
    }

    async settle(paymentPayload: ExactPaymentPayload, requirements: ExactRequirement): Promise<SettleResult> {
        const body = await this.post('settle', paymentPayload, requirements, this.timeouts.settleMs);
        return {
            success: body?.success === true,
            errorReason: typeof body?.errorReason === 'string' ? body.errorReason : undefined,
            payer: typeof body?.payer === 'string' ? body.payer : undefined,
            transaction: typeof body?.transaction === 'string' ? body.transaction : '',
            network: typeof body?.network === 'string' ? body.network : undefined,
        };
    }

    private async post(
        path: 'verify' | 'settle',
        paymentPayload: ExactPaymentPayload,
        paymentRequirements: ExactRequirement,
        timeoutMs: number
    ): Promise<any> {
        if (typeof this.fetchFn !== 'function') {
            throw new FacilitatorError('no fetch available', 'unavailable');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await this.fetchFn(`${this.baseUrl}/${path}`, {
                method: 'POST',
                headers: { ...this.headers, 'content-type': 'application/json' },
                body: JSON.stringify({ x402Version: EXACT_X402_VERSION, paymentPayload, paymentRequirements }),
                signal: controller.signal,
            });
        } catch (error: any) {
            const timedOut = error?.name === 'AbortError';
            throw new FacilitatorError(
                timedOut ? `facilitator ${path} timed out` : `facilitator ${path} is unreachable`,
                timedOut ? 'timeout' : 'unreachable'
            );
        } finally {
            clearTimeout(timer);
        }
        let body: any = null;
        try {
            body = await response.json();
        } catch {
            body = null;
        }
        // Facilitators answer 400 with an isValid:false / success:false body for a refused payment; keep it.
        if (!response.ok && !(body && typeof body === 'object' && ('isValid' in body || 'success' in body))) {
            throw new FacilitatorError(
                `facilitator ${path} answered HTTP ${response.status}`,
                `http_${response.status}`
            );
        }
        return body;
    }
}

// ---------------------------------------------------------------- chain reads (plain JSON-RPC)

const pad32 = (address: string) => '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** Decodes an ABI `string` return value. */
export function decodeAbiString(hex: string): string | null {
    try {
        const data = Buffer.from(String(hex).replace(/^0x/, ''), 'hex');
        if (data.length < 64) {
            return null;
        }
        const offset = Number(getBigInt('0x' + data.subarray(0, 32).toString('hex')));
        const length = Number(getBigInt('0x' + data.subarray(offset, offset + 32).toString('hex')));
        return data.subarray(offset + 32, offset + 32 + length).toString('utf8');
    } catch {
        return null;
    }
}

/** Decodes an ABI `uint8` return value, or null. */
export function decodeUint8(hex: unknown): number | null {
    if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(hex)) {
        return null;
    }
    const value = getBigInt(hex);
    return value <= getBigInt(255) ? Number(value) : null;
}

/**
 * Why the token's on-chain domain does not fit the configured `exact` offer, or null when it does:
 * payers sign with the configured name/version, and the price assumes 6 decimals.
 */
export function domainMismatch(
    config: Pick<ExactConfig, 'assetName' | 'assetVersion'>,
    onchain: { name: string | null; version: string | null; decimals: number | null }
): string | null {
    if (onchain.name !== config.assetName || onchain.version !== config.assetVersion) {
        return (
            `token domain on-chain is name=${onchain.name} version=${onchain.version}, configured ` +
            `${config.assetName}/${config.assetVersion}; payers' signatures would not verify`
        );
    }
    if (onchain.decimals !== EXACT_ASSET_DECIMALS) {
        return `token has ${onchain.decimals} decimals; exact prices assume ${EXACT_ASSET_DECIMALS}`;
    }
    return null;
}

export type TransferCheck = 'ok' | 'pending' | 'unreachable' | string;

/** Reads the token's EIP-712 domain and the settled transfer over plain JSON-RPC. */
export class ExactChainReader {
    constructor(private readonly rpcUrl: string, private readonly fetchFn: FetchLike = (globalThis as any).fetch) {}

    private async call(method: string, params: unknown[]): Promise<any> {
        const response = await this.fetchFn(this.rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const body = await response.json();
        if (body?.error) {
            throw new Error(body.error.message || 'RPC error');
        }
        return body?.result;
    }

    /** name(), version() and decimals() of the token: its EIP-712 domain and its unit. Throws on an RPC failure. */
    async domain(asset: string): Promise<{ name: string | null; version: string | null; decimals: number | null }> {
        const [name, version, decimals] = await Promise.all([
            this.call('eth_call', [{ to: asset, data: '0x06fdde03' }, 'latest']),
            this.call('eth_call', [{ to: asset, data: '0x54fd4d50' }, 'latest']),
            this.call('eth_call', [{ to: asset, data: '0x313ce567' }, 'latest']),
        ]);
        return { name: decodeAbiString(name), version: decodeAbiString(version), decimals: decodeUint8(decimals) };
    }

    /**
     * 'ok' when `txHash` succeeded and carries a Transfer(from → payTo, ≥ value) log from `asset`;
     * 'pending' when the node has no receipt yet; 'unreachable' when the RPC failed; otherwise the reason
     * the transaction does not show the payment.
     */
    async checkTransfer(
        txHash: string,
        expected: { asset: string; from: string; payTo: string; value: bigint }
    ): Promise<TransferCheck> {
        let receipt: any;
        try {
            receipt = await this.call('eth_getTransactionReceipt', [txHash]);
        } catch {
            return 'unreachable';
        }
        if (!receipt) {
            return 'pending';
        }
        if (receipt.status !== '0x1' && receipt.status !== 1) {
            return 'settlement transaction reverted';
        }
        const from = pad32(expected.from);
        const to = pad32(expected.payTo);
        for (const log of receipt.logs || []) {
            if (String(log.address || '').toLowerCase() !== expected.asset.toLowerCase()) {
                continue;
            }
            const topics = (log.topics || []).map((t: string) => String(t).toLowerCase());
            if (topics[0] !== ERC20_TRANSFER_TOPIC || topics[1] !== from || topics[2] !== to) {
                continue;
            }
            try {
                if (getBigInt(log.data) >= expected.value) {
                    return 'ok';
                }
            } catch {
                continue;
            }
        }
        return 'settlement transaction shows no matching transfer to the shelter wallet';
    }
}

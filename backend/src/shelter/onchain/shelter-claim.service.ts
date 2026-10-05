import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getAddress, getBigInt, isAddress, verifyMessage, ZeroAddress } from 'ethers';
import { Model } from 'mongoose';
import { hotWalletAddress, ShelterChain, shelterSplitInterface } from './shelter-chain';
import { readIndexerConfig } from 'src/impact/impact.config';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    isTestnetChain,
    publicGivingAllowed,
    readRelayChainConfigs,
    readShelterConfig,
    shelterConfigFor,
    ShelterOnchainConfig,
} from './shelter-onchain.config';
import { ClaimStatus, PUBLIC_CLAIM_STATUSES, ShelterClaim, ShelterClaimDocument } from './shelter-onchain.schema';

/**
 * The shelter named in the claim message: Rožinė pėdutė, ASCII-folded so every wallet renders the
 * signed text the same. The client's `CLAIM_SHELTER` (client/components/shelter-payouts/claim.ts) is
 * the same string; both specs pin it.
 */
export const CLAIM_SHELTER_LABEL = 'Pink Paw (Rozine pedute)';

/** How long a public-giving verdict (one preview read and one claims query) is reused. */
export const GIVING_CHECK_TTL_MS = 10 * 60 * 1000;

/**
 * The exact text the shelter signs with personal_sign (EIP-191). `issued` is a UTC date, `YYYY-MM-DD`.
 * Different from the payout-evidence signature of `POST /impact/payouts/:id/signature`: this one only
 * names a wallet, and moves no money by itself.
 */
export function shelterClaimMessage(wallet: string, chainId: number, issued: Date | string): string {
    const day = typeof issued === 'string' ? issued.slice(0, 10) : issued.toISOString().slice(0, 10);
    return [
        'Token Tails shelter payout wallet',
        `Shelter: ${CLAIM_SHELTER_LABEL}`,
        `Wallet: ${getAddress(wallet)}`,
        `Chain: ${chainId}`,
        `Issued: ${day}`,
    ].join('\n');
}

/** The v2 `Chains:` line for "every chain where the shelter is listed". */
export const CLAIM_ALL_CHAINS = 'all chains where Pink Paw is listed';

/**
 * The v2 claim message: one signature names several chains (or every chain where the shelter is
 * listed), and the server records one row per chain. The v1 text above stays valid for one chain.
 * The client's `claimMessageV2` (client/components/shelter-payouts/claim.ts) builds the same bytes.
 */
export function shelterClaimMessageV2(wallet: string, chains: number[] | 'all', issued: Date | string): string {
    const day = typeof issued === 'string' ? issued.slice(0, 10) : issued.toISOString().slice(0, 10);
    return [
        'Token Tails shelter payout wallet (v2)',
        `Shelter: ${CLAIM_SHELTER_LABEL}`,
        `Wallet: ${getAddress(wallet)}`,
        `Chains: ${chains === 'all' ? CLAIM_ALL_CHAINS : normaliseChains(chains).join(', ')}`,
        `Issued: ${day}`,
    ].join('\n');
}

/** Distinct positive chain ids, ascending: the order the v2 message lists them in. */
export function normaliseChains(chains: number[]): number[] {
    return [...new Set(chains.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
}

/**
 * Chains a shelter can claim its wallet on: the main chain and every other served chain (wallet.config.ts,
 * SHELTER_RELAY_CHAINS) with a split, of the main chain's network class
 * (a mainnet claim never covers a testnet). Never the try-it testnet. Each uses the main chain's
 * SHELTER_CLAIM_ALLOWED_WALLETS.
 */
export function claimChainConfigs(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig[] {
    const main = readShelterConfig(env);
    const testnet = isTestnetChain(main.chainId);
    return [
        main,
        ...readRelayChainConfigs(env)
            .filter(c => c.splitAddress && isTestnetChain(c.chainId) === testnet)
            .map(c => ({ ...c, claimAllowedWallets: main.claimAllowedWallets })),
    ];
}

export interface ClaimRequest {
    /** v1: the one chain. Ignored when `chains` or `allChains` is given (v2). */
    chainId?: number;
    wallet: string;
    signature: string;
    /** v2: the chains the signed message names. */
    chains?: number[];
    /** v2: the message names every chain where the shelter is listed (claimChainConfigs). */
    allChains?: boolean;
}

export interface ChainClaimStatus {
    chainId: number;
    status: ClaimStatus;
}

/** One claimable chain and its latest public claim (approved or rotated), or null. Never a pending one. */
export interface ChainClaimView {
    chainId: number;
    testnet: boolean;
    main: boolean;
    claim: ClaimView | null;
}

export interface ClaimView {
    wallet: string;
    chainId: number;
    status: ClaimStatus;
}

const refuse = (reason: string) => new BadRequestException({ statusCode: 400, code: 'CLAIM_REFUSED', message: reason });

/**
 * A shelter claims its own payout wallet (F2c): it signs `shelterClaimMessage` with that wallet, the
 * server checks the wallet is on SHELTER_CLAIM_ALLOWED_WALLETS (the shelter named it to Token Tails
 * through a separate channel first: a signature only proves control of a wallet, not who holds it),
 * that the signature recovers it, and that it is not one Token Tails holds (the hot wallet, the
 * treasury) or a contract of the rail, and records it `pending-rotation`. That row is never shown
 * publicly; an admin marks it `approved`, and the ShelterSplit owner rotates the recipient by hand
 * (`fund.mjs shelter rotate --dry-run` first), using the address confirmed with the shelter, never one
 * read from this endpoint, then marks it `rotated`.
 */
@Injectable()
export class ShelterClaimService {
    private readonly logger = new Logger(ShelterClaimService.name);

    constructor(
        @InjectModel(ShelterClaim.name) private claimModel: Model<ShelterClaimDocument>,
        private chain: ShelterChain
    ) {}

    async claim(
        body: ClaimRequest,
        now: Date = new Date(),
        config: ShelterOnchainConfig = readShelterConfig(),
        env: NodeJS.ProcessEnv = process.env
    ): Promise<{ status: ClaimStatus; chains?: ChainClaimStatus[] }> {
        if (!isAddress(body.wallet)) {
            throw refuse('Not a wallet address.');
        }
        if (body.allChains === true || Array.isArray(body.chains)) {
            return this.claimChains(body, now, config, env);
        }
        const wallet = getAddress(body.wallet);
        const chainId = Number(body.chainId);
        if (chainId !== config.chainId) {
            throw refuse(`Claims are taken for chain ${config.chainId} only.`);
        }
        if (!config.claimAllowedWallets.includes(wallet.toLowerCase())) {
            throw new ForbiddenException({
                statusCode: 403,
                code: 'CLAIM_NOT_ALLOWED',
                message: 'This wallet was not confirmed with Token Tails. Tell us the address first, then sign.',
            });
        }
        // The message names today's UTC date; yesterday's still counts around midnight.
        const days = [now, new Date(now.getTime() - 24 * 3600 * 1000)];
        let message: string | null = null;
        for (const day of days) {
            const candidate = shelterClaimMessage(wallet, chainId, day);
            let signer: string | null = null;
            try {
                signer = verifyMessage(candidate, body.signature);
            } catch {
                signer = null;
            }
            if (signer && getAddress(signer) === wallet) {
                message = candidate;
                break;
            }
        }
        if (!message) {
            throw refuse('The signature was not made by this wallet for today’s claim message.');
        }
        const forbidden = await this.forbiddenWallets(config);
        if (forbidden.has(wallet.toLowerCase())) {
            throw refuse('This wallet belongs to Token Tails or the rail, not to the shelter.');
        }
        // One row per (chain, wallet): a repeat claim reports the existing row and adds nothing.
        return { status: await this.recordRow(chainId, wallet, message, body.signature) };
    }

    /**
     * The v2 claim: one personal_sign over `shelterClaimMessageV2`, recorded as one `pending-rotation`
     * row per named chain (the same checks as v1 on each: allow-listed wallet, not a wallet Token
     * Tails or the rail holds there). `allChains` covers claimChainConfigs at the time of the claim. A
     * chain the backend does not serve is refused, so a signature never covers a chain nobody checked.
     * Rows that exist already are reported, not changed.
     */
    private async claimChains(
        body: ClaimRequest,
        now: Date,
        main: ShelterOnchainConfig,
        env: NodeJS.ProcessEnv
    ): Promise<{ status: ClaimStatus; chains: ChainClaimStatus[] }> {
        const wallet = getAddress(body.wallet);
        // The main chain as passed in (its allow-list included), then the other claimable chains.
        const claimable = [main, ...claimChainConfigs(env).filter(c => c.chainId !== main.chainId)];
        const all = body.allChains === true;
        let configs: ShelterOnchainConfig[];
        if (all) {
            configs = claimable;
        } else {
            const asked = normaliseChains(body.chains || []);
            if (!asked.length || asked.length > 32) {
                throw refuse('Name between 1 and 32 chains.');
            }
            const unknown = asked.filter(id => !claimable.some(c => c.chainId === id));
            if (unknown.length) {
                throw refuse(`Claims are not taken for chain ${unknown.join(', ')}.`);
            }
            configs = asked.map(id => claimable.find(c => c.chainId === id)!);
        }
        if (!main.claimAllowedWallets.includes(wallet.toLowerCase())) {
            throw new ForbiddenException({
                statusCode: 403,
                code: 'CLAIM_NOT_ALLOWED',
                message: 'This wallet was not confirmed with Token Tails. Tell us the address first, then sign.',
            });
        }
        const chainsLine: number[] | 'all' = all ? 'all' : configs.map(c => c.chainId);
        let message: string | null = null;
        for (const day of [now, new Date(now.getTime() - 24 * 3600 * 1000)]) {
            const candidate = shelterClaimMessageV2(wallet, chainsLine, day);
            let signer: string | null = null;
            try {
                signer = verifyMessage(candidate, body.signature);
            } catch {
                signer = null;
            }
            if (signer && getAddress(signer) === wallet) {
                message = candidate;
                break;
            }
        }
        if (!message) {
            throw refuse('The signature was not made by this wallet for today’s claim message.');
        }
        for (const config of configs) {
            const forbidden = await this.forbiddenWallets(config);
            if (forbidden.has(wallet.toLowerCase())) {
                throw refuse(
                    `This wallet belongs to Token Tails or the rail on chain ${config.chainId}, not to the shelter.`
                );
            }
        }
        const chains: ChainClaimStatus[] = [];
        for (const config of configs) {
            chains.push({
                chainId: config.chainId,
                status: await this.recordRow(config.chainId, wallet, message, body.signature),
            });
        }
        const first = chains.find(c => c.chainId === main.chainId) || chains[0];
        return { status: first?.status || 'pending-rotation', chains };
    }

    /** Inserts the (chain, wallet) row unless it exists; returns the row's status. */
    private async recordRow(chainId: number, wallet: string, message: string, signature: string): Promise<ClaimStatus> {
        const existing: any = await this.claimModel.findOne({ chainId, wallet }).lean();
        if (existing) {
            return existing.status;
        }
        try {
            await this.claimModel.create({ chainId, wallet, message, signature, status: 'pending-rotation' });
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            const row: any = await this.claimModel.findOne({ chainId, wallet }).lean();
            return row?.status || 'pending-rotation';
        }
        return 'pending-rotation';
    }

    /** Every claimable chain with its latest public claim (approved or rotated); pending rows stay private. */
    async chainsView(env: NodeJS.ProcessEnv = process.env): Promise<ChainClaimView[]> {
        const configs = claimChainConfigs(env);
        const mainId = configs[0].chainId;
        const rows: any[] = await this.claimModel
            .find({ chainId: { $in: configs.map(c => c.chainId) }, status: { $in: [...PUBLIC_CLAIM_STATUSES] } })
            .sort({ updatedAt: -1 })
            .lean();
        return configs.map(c => {
            const row = (rows || []).find(r => Number(r.chainId) === c.chainId);
            return {
                chainId: c.chainId,
                testnet: isTestnetChain(c.chainId),
                main: c.chainId === mainId,
                claim: row ? { wallet: row.wallet, chainId: row.chainId, status: row.status } : null,
            };
        });
    }

    /** The newest claim an admin approved or the split already pays; never a raw pending one. */
    async latest(config: ShelterOnchainConfig = readShelterConfig()): Promise<ClaimView | null> {
        const row: any = await this.claimModel
            .findOne({ chainId: config.chainId, status: { $in: [...PUBLIC_CLAIM_STATUSES] } })
            .sort({ updatedAt: -1 })
            .lean();
        return row ? { wallet: row.wallet, chainId: row.chainId, status: row.status } : null;
    }

    private givingCache = new Map<string, { ok: boolean; at: number }>();

    /**
     * The full public-giving gate (relay, match, flush, onchain-receipt x402), per chain. Testnets:
     * always. Mainnets: not switched off (SHELTER_HANDED_OVER=false) and, read on chain, every wallet in
     * `split.preview(1 USDC).wallets` is a `rotated` claim on this chain (a v1 claim on the main chain,
     * or a v2 claim naming this chain) and none is the hot wallet, the treasury, the split, the router,
     * an IMPACT_PAWS_SENDERS or a SHELTER_MATCH_EXCLUDE address. A verdict is reused for 10 minutes; a failed read is `false` and
     * not cached.
     */
    async publicGivingVerified(
        target: ShelterOnchainConfig | number = readShelterConfig(),
        now: Date = new Date()
    ): Promise<boolean> {
        // A chain id resolves to the config serving it (main, try-it or a relay chain); unknown: closed.
        const config = typeof target === 'number' ? shelterConfigFor(target) : target;
        if (!config) {
            return false;
        }
        if (isTestnetChain(config.chainId)) {
            return true;
        }
        if (!publicGivingAllowed(config) || !config.splitAddress || !config.rpcUrl) {
            return false;
        }
        const key = `${config.chainId}|${config.splitAddress.toLowerCase()}`;
        const cached = this.givingCache.get(key);
        if (cached && now.getTime() - cached.at < GIVING_CHECK_TTL_MS) {
            return cached.ok;
        }
        try {
            const raw = await this.chain.ethCall(
                config,
                config.splitAddress,
                shelterSplitInterface.encodeFunctionData('preview', [getBigInt(1000000)])
            );
            // preview() lists inactive shelters too (amount 0) and returns the treasury remainder: only
            // wallets that are actually paid count, and a split that keeps any part for the treasury
            // (a rotated shelter below 10000 bps, a deactivated one) is not public giving.
            const [listed, amounts, toTreasury] = shelterSplitInterface.decodeFunctionResult('preview', raw) as unknown as [
                string[],
                bigint[],
                bigint,
            ];
            const wallets = listed
                .filter((_w, i) => getBigInt(amounts?.[i] ?? 0) > getBigInt(0))
                .map(w => String(w).toLowerCase());
            if (getBigInt(toTreasury ?? 0) > getBigInt(0)) {
                this.givingCache.set(key, { ok: false, at: now.getTime() });
                return false;
            }
            const rotated = new Set(
                ((await this.claimModel.find({ chainId: config.chainId, status: 'rotated' }).lean()) as any[]).map(
                    row => String(row.wallet).toLowerCase()
                )
            );
            const forbidden = await this.forbiddenWallets(config, true);
            for (const extra of [...config.notPublicWallets, ...(readIndexerConfig().pawSenders || [])]) {
                forbidden.add(extra.toLowerCase());
            }
            const ok = wallets.length > 0 && wallets.every(w => rotated.has(w) && !forbidden.has(w));
            this.givingCache.set(key, { ok, at: now.getTime() });
            return ok;
        } catch (error: any) {
            this.logger.warn(`public giving check failed: ${error?.code || error?.name || 'unknown error'}`);
            return false;
        }
    }

    /**
     * Lowercased: zero, the wallets Token Tails holds for a shelter (config.heldWallets), the hot wallet,
     * the treasury (env and on-chain when readable), the split, the router.
     */
    private async forbiddenWallets(config: ShelterOnchainConfig, strict = false): Promise<Set<string>> {
        const set = new Set<string>([
            ZeroAddress.toLowerCase(),
            ...(config.heldWallets || []).map(w => w.toLowerCase()),
        ]);
        for (const address of [
            hotWalletAddress(config),
            config.treasuryAddress,
            config.splitAddress,
            config.routerAddress,
        ]) {
            if (address) set.add(address.toLowerCase());
        }
        if (config.splitAddress && config.rpcUrl) {
            try {
                const raw = await this.chain.ethCall(
                    config,
                    config.splitAddress,
                    shelterSplitInterface.encodeFunctionData('treasury', [])
                );
                set.add(String(shelterSplitInterface.decodeFunctionResult('treasury', raw)[0]).toLowerCase());
            } catch (error: any) {
                if (strict) {
                    throw error;
                }
                this.logger.warn(`treasury lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            }
        }
        return set;
    }
}

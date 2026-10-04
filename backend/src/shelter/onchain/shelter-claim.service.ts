import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { getAddress, getBigInt, isAddress, verifyMessage, ZeroAddress } from 'ethers';
import { Model } from 'mongoose';
import { hotWalletAddress, ShelterChain, shelterSplitInterface } from './shelter-chain';
import { readIndexerConfig } from 'src/impact/impact.config';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import { isTestnetChain, publicGivingAllowed, readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
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

export interface ClaimRequest {
    chainId: number;
    wallet: string;
    signature: string;
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
        config: ShelterOnchainConfig = readShelterConfig()
    ): Promise<{ status: ClaimStatus }> {
        if (!isAddress(body.wallet)) {
            throw refuse('Not a wallet address.');
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
        const existing: any = await this.claimModel.findOne({ chainId, wallet }).lean();
        if (existing) {
            return { status: existing.status };
        }
        try {
            await this.claimModel.create({
                chainId,
                wallet,
                message,
                signature: body.signature,
                status: 'pending-rotation',
            });
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }
            const row: any = await this.claimModel.findOne({ chainId, wallet }).lean();
            return { status: row?.status || 'pending-rotation' };
        }
        return { status: 'pending-rotation' };
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
     * The full public-giving gate (relay, match, flush). Testnets: always. Mainnets: SHELTER_HANDED_OVER
     * and, read on chain, every wallet in `split.preview(1 USDC).wallets` is a `rotated` claim on this
     * chain and none is the hot wallet, the treasury, the split, the router, an IMPACT_PAWS_SENDERS or a
     * SHELTER_MATCH_EXCLUDE address. A verdict is reused for 10 minutes; a failed read is `false` and
     * not cached.
     */
    async publicGivingVerified(
        config: ShelterOnchainConfig = readShelterConfig(),
        now: Date = new Date()
    ): Promise<boolean> {
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
            const wallets = (shelterSplitInterface.decodeFunctionResult('preview', raw)[0] as string[]).map(w =>
                String(w).toLowerCase()
            );
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

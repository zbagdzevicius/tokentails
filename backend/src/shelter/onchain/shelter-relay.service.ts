import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac } from 'crypto';
import { getAddress, getBigInt, isAddress } from 'ethers';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from 'src/shared/jobs/lease';
import {
    authNonce,
    DecodedRouterDonation,
    decodeRouterDonation,
    donateRouterInterface,
    encodeDonateWithAuthorization,
    encodeDonateWithAuthorizationVRS,
    erc20Interface,
    RELAY_ERRORS,
    RELAY_MEMO_RE,
    RelayAuthorization,
    RelayErrorCode,
    ROUTER_PATH,
} from './donate-router';
import { DonationBroadcastError, hotWalletAddress, ShelterChain, SignedDonation } from './shelter-chain';
import { utcDay } from './shelter-donate.service';
import { ShelterClaimService } from './shelter-claim.service';
import {
    publicGivingAllowed,
    readShelterConfig,
    relayReady,
    shelterConfigFor,
    ShelterOnchainConfig,
} from './shelter-onchain.config';
import {
    MatchStatus,
    RelayStatus,
    ShelterCounter,
    ShelterCounterDocument,
    ShelterMatch,
    ShelterMatchDocument,
    ShelterRelayTx,
    ShelterRelayTxDocument,
} from './shelter-onchain.schema';

/** Relays per signer per UTC day. A wallet can always give directly beyond it. */
export const RELAY_PER_SIGNER_DAILY = 5;
/** The signature must stay valid at least this long (time to mine) and at most this long. */
export const RELAY_MIN_VALIDITY_S = 30;
export const RELAY_MAX_VALIDITY_S = 600;
/** A `validAfter` this far ahead of the server clock still passes (clients should send 0). */
export const RELAY_CLOCK_SKEW_S = 5;
/** A relay with no receipt after this long fails once the hot wallet's nonce is past it. */
export const RELAY_TIMEOUT_MS = 30 * 60 * 1000;
export const RELAY_CONFIRM_BATCH = 100;
/**
 * When a relay did not land (revert or timeout) but the donor's EIP-3009 nonce is used, the gift may
 * have been submitted by someone else first. The reconcile looks back this many blocks per eth_getLogs
 * call, this many calls, for the RouterDonation carrying that nonce.
 */
export const RELAY_SETTLE_SCAN_BLOCKS = 2000;
export const RELAY_SETTLE_SCAN_CALLS = 5;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export interface RelayRequest {
    chainId: number;
    from: string;
    value: string;
    validAfter: string;
    validBefore: string;
    salt: string;
    memo: string;
    /** router.recipientsHash(value) the donor signed over (bound into the EIP-3009 nonce). */
    recipients: string;
    signature: string;
}

export interface RelayResult {
    txHash: string;
    status: 'submitted';
}

export interface RelayStatusView {
    status: RelayStatus;
    batchId?: string;
    /** Set when someone else submitted the donor's signature first: the transaction that paid. */
    settledTxHash?: string;
    match?: { txHash?: string; status: MatchStatus };
}

export const relayError = (code: RelayErrorCode, status: HttpStatus, extra: Record<string, unknown> = {}) =>
    new HttpException({ statusCode: status, code, message: RELAY_ERRORS[code], ...extra }, status);

/** One shared rule for counters: a conditional `$inc` against a cap (see ShelterCounter). */
export async function claimCounter(
    model: Model<ShelterCounterDocument>,
    key: string,
    amount: number,
    cap: number,
    expiresAt?: Date
): Promise<boolean> {
    if (amount <= 0) {
        return true;
    }
    if (amount > cap) {
        return false;
    }
    try {
        const update: Record<string, unknown> = { $inc: { used: amount } };
        if (expiresAt) {
            update.$setOnInsert = { expiresAt };
        }
        const row = await model.findOneAndUpdate({ key, used: { $lte: cap - amount } }, update, {
            upsert: true,
            new: true,
        });
        return !!row;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return false;
        }
        throw error;
    }
}

export async function releaseCounter(model: Model<ShelterCounterDocument>, key: string, amount: number) {
    if (amount > 0) {
        await model.updateOne({ key, used: { $gte: amount } }, { $inc: { used: -amount } });
    }
}

export async function counterUsed(model: Model<ShelterCounterDocument>, key: string): Promise<number> {
    const row: any = await model.findOne({ key }).lean();
    return Math.max(0, Number(row?.used) || 0);
}

/** Day counters live two days past their day, then Mongo drops them. */
export const dayCounterExpiry = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 3 * 24 * 3600 * 1000);

/**
 * HMAC-SHA-256 of the caller IP keyed with the secret SHELTER_RELAY_IP_PEPPER, truncated. Without the
 * pepper nothing is stored: a fixed public salt could be reversed by trying every IPv4 address.
 */
export const ipHash = (ip: string | undefined, pepper: string | null) =>
    ip && pepper ? createHmac('sha256', pepper).update(ip).digest('hex').slice(0, 32) : undefined;

/** A short, safe label for a revert: the custom error name or the revert string, never raw data. */
export function revertLabel(error: any): string {
    let custom: string | null = null;
    const data = typeof error?.data === 'string' ? error.data : null;
    if (data && /^0x[0-9a-fA-F]{8}/.test(data)) {
        try {
            custom = donateRouterInterface.parseError(data)?.name || null;
        } catch {
            custom = null;
        }
    }
    // ethers names a plain `require(..., "msg")` revert `Error` (and an assert `Panic`): the message is
    // the useful part ("FiatTokenV2: invalid signature"), not the name.
    const revertName = error?.revert?.name;
    const named =
        revertName === 'Error' || revertName === 'Panic'
            ? String(error?.revert?.args?.[0] ?? error?.reason ?? revertName)
            : revertName;
    const text = String(named || custom || error?.reason || error?.shortMessage || error?.code || 'reverted');
    return text.replace(/[^\w :.,'-]/g, '').slice(0, 80);
}

/** Maps a simulation revert to the relay refusal a donor can act on. */
export function mapRevert(error: any): HttpException {
    const label = revertLabel(error);
    const text = label.toLowerCase();
    if (/recipientschanged/.test(text)) {
        return relayError('RELAY_RECIPIENTS_CHANGED', HttpStatus.CONFLICT, { reason: label });
    }
    if (/signature|signer|invalidsig/.test(text)) {
        return relayError('RELAY_BAD_SIGNATURE', HttpStatus.BAD_REQUEST, { reason: label });
    }
    if (/used or canceled|authorizationused|nonce/.test(text)) {
        return relayError('RELAY_REPLAY', HttpStatus.CONFLICT, { reason: label });
    }
    if (/expired|not yet valid|validbefore|validafter/.test(text)) {
        return relayError('RELAY_WINDOW', HttpStatus.BAD_REQUEST, { reason: label });
    }
    return relayError('RELAY_REJECTED', HttpStatus.BAD_REQUEST, { reason: label });
}

const isCallException = (error: any) => error?.code === 'CALL_EXCEPTION';
const isTestnet = (config: ShelterOnchainConfig) => publicGivingAllowed({ chainId: config.chainId, handedOver: false });

/**
 * Gasless wallet gifts (F2a). A donor signs an EIP-3009 `receiveWithAuthorization` with the router as
 * the payee; this service checks it, simulates it, and submits `router.donateWithAuthorization` from
 * the hot wallet, which pays the gas and nothing else. The USDC moves from the donor's wallet through
 * the ownerless router into ShelterSplit in that one transaction: it never lands in a wallet Token
 * Tails controls.
 */
@Injectable()
export class ShelterRelayService {
    private readonly logger = new Logger(ShelterRelayService.name);

    constructor(
        @InjectModel(ShelterRelayTx.name) private relayModel: Model<ShelterRelayTxDocument>,
        @InjectModel(ShelterCounter.name) private counterModel: Model<ShelterCounterDocument>,
        @InjectModel(ShelterMatch.name) private matchModel: Model<ShelterMatchDocument>,
        private chain: ShelterChain,
        @Optional() private claims?: ShelterClaimService
    ) {}

    /** The full giving gate. Without the claim service a mainnet is refused (fail closed). */
    private async givingVerified(config: ShelterOnchainConfig): Promise<boolean> {
        if (!publicGivingAllowed(config)) {
            return false;
        }
        return this.claims ? this.claims.publicGivingVerified(config) : isTestnet(config);
    }

    async relay(
        body: RelayRequest,
        ip?: string,
        now: Date = new Date(),
        given?: ShelterOnchainConfig
    ): Promise<RelayResult> {
        // The main chain, or the try-it testnet when the gift names it (readTryShelterConfig).
        const config = given || shelterConfigFor(Number(body.chainId)) || readShelterConfig();
        // 1. Static checks: nothing here touches the chain or a counter.
        if (!relayReady(config)) {
            throw relayError('RELAY_OFF', HttpStatus.CONFLICT);
        }
        if (Number(body.chainId) !== config.chainId) {
            throw relayError('RELAY_WRONG_CHAIN', HttpStatus.BAD_REQUEST, { chainId: config.chainId });
        }
        if (!publicGivingAllowed(config)) {
            throw relayError('RELAY_AWAITING_HANDOVER', HttpStatus.CONFLICT);
        }
        if (!RELAY_MEMO_RE.test(String(body.memo))) {
            throw relayError('RELAY_BAD_MEMO', HttpStatus.BAD_REQUEST);
        }
        if (!isAddress(body.from)) {
            throw relayError('RELAY_REJECTED', HttpStatus.BAD_REQUEST, { reason: 'bad from address' });
        }
        if (!BYTES32_RE.test(String(body.recipients))) {
            throw relayError('RELAY_REJECTED', HttpStatus.BAD_REQUEST, { reason: 'bad recipients hash' });
        }
        const value = getBigInt(body.value);
        if (value < config.relayMinBase || value > config.relayMaxBase) {
            throw relayError('RELAY_AMOUNT', HttpStatus.BAD_REQUEST, {
                minBase: config.relayMinBase.toString(),
                maxBase: config.relayMaxBase.toString(),
            });
        }
        const nowS = getBigInt(Math.floor(now.getTime() / 1000));
        const validAfter = getBigInt(body.validAfter);
        const validBefore = getBigInt(body.validBefore);
        if (
            validAfter > nowS + getBigInt(RELAY_CLOCK_SKEW_S) ||
            validBefore <= nowS + getBigInt(RELAY_MIN_VALIDITY_S) ||
            validBefore > nowS + getBigInt(RELAY_MAX_VALIDITY_S)
        ) {
            throw relayError('RELAY_WINDOW', HttpStatus.BAD_REQUEST);
        }
        const from = getAddress(body.from).toLowerCase();
        const router = config.routerAddress!;
        const recipients = String(body.recipients).toLowerCase();
        const nonce = authNonce(router, body.salt, body.memo, recipients);
        if (await this.relayModel.findOne({ nonce }, { _id: 1 }).lean()) {
            throw relayError('RELAY_REPLAY', HttpStatus.CONFLICT);
        }
        // The on-chain half of the giving gate (mainnets only; cached).
        if (!(await this.givingVerified(config))) {
            throw relayError('RELAY_AWAITING_HANDOVER', HttpStatus.CONFLICT);
        }

        // 2. Read-only chain checks before any cap is taken, so junk requests cannot hold a slot.
        await this.assertSplitTakes(config, router, value);
        const auth: RelayAuthorization = {
            from,
            value,
            validAfter,
            validBefore,
            salt: body.salt,
            memo: body.memo,
            recipients,
        };
        // Simulate as the hot wallet: the bytes overload, then (v, r, s) for tokens that need it.
        const data = await this.simulate(config, router, auth, body.signature);

        // 3. Caps, claimed atomically and given back on any refusal below.
        const day = utcDay(now);
        const expiresAt = dayCounterExpiry(day);
        const globalKey = `relay:${config.chainId}:${day}`;
        const signerKey = `relay:${config.chainId}:${day}:${from}`;
        if (!(await claimCounter(this.counterModel, globalKey, 1, config.relayDailyTx, expiresAt))) {
            throw relayError('RELAY_DAILY_CAP', HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!(await claimCounter(this.counterModel, signerKey, 1, RELAY_PER_SIGNER_DAILY, expiresAt))) {
            await releaseCounter(this.counterModel, globalKey, 1);
            throw relayError('RELAY_SIGNER_CAP', HttpStatus.TOO_MANY_REQUESTS);
        }
        const giveBack = async () => {
            await releaseCounter(this.counterModel, signerKey, 1);
            await releaseCounter(this.counterModel, globalKey, 1);
        };

        // 4. The row claims the nonce (unique), then sign, store the hash, broadcast.
        let row: { _id: unknown };
        try {
            row = await this.relayModel.create({
                nonce,
                from,
                valueBase: value.toString(),
                memo: body.memo,
                chainId: config.chainId,
                day,
                status: 'submitted',
                ipHash: ipHash(ip, config.relayIpPepper),
            });
        } catch (error) {
            await giveBack();
            if (isDuplicateKeyError(error)) {
                throw relayError('RELAY_REPLAY', HttpStatus.CONFLICT);
            }
            throw error;
        }
        try {
            const sent = await this.chain.sendContractCall(router, data, getBigInt(0), {
                config,
                onSigned: async (tx: SignedDonation) => {
                    await this.relayModel.updateOne(
                        { _id: row._id },
                        { $set: { txHash: tx.hash, txNonce: tx.nonce, txFrom: tx.from } }
                    );
                },
            });
            return { txHash: sent.txHash, status: 'submitted' };
        } catch (error: any) {
            this.logger.error(`relay send failed: ${error?.code || error?.name || 'unknown error'}`);
            if (error instanceof DonationBroadcastError && !error.definite) {
                // May still be mined: it stays submitted and the reconcile job settles it.
                return { txHash: error.tx.hash, status: 'submitted' };
            }
            // Nothing can be mined: free the nonce so the same signature can be retried.
            await this.relayModel.deleteOne({ _id: row._id });
            await giveBack();
            throw relayError('RELAY_SEND_FAILED', HttpStatus.FAILED_DEPENDENCY);
        }
    }

    /**
     * router.canDonate(value): false when the split is paused, has no active shelter, or would send part
     * of the gift to the treasury (the router refuses that). 409 RELAY_SPLIT_UNAVAILABLE, so the donor
     * gets a clear answer instead of a generic revert. A node error is 424.
     */
    private async assertSplitTakes(config: ShelterOnchainConfig, router: string, value: bigint) {
        let ok: boolean;
        let toTreasury: bigint;
        try {
            const raw = await this.chain.ethCall(
                config,
                router,
                donateRouterInterface.encodeFunctionData('canDonate', [value])
            );
            const decoded = donateRouterInterface.decodeFunctionResult('canDonate', raw);
            ok = Boolean(decoded[0]);
            toTreasury = getBigInt(decoded[1]);
        } catch (error: any) {
            this.logger.warn(`relay canDonate failed: ${error?.code || error?.name || 'unknown error'}`);
            throw relayError('RELAY_SEND_FAILED', HttpStatus.FAILED_DEPENDENCY);
        }
        if (!ok) {
            throw relayError('RELAY_SPLIT_UNAVAILABLE', HttpStatus.CONFLICT, { toTreasury: toTreasury.toString() });
        }
    }

    /** Returns the calldata that simulated cleanly, or throws the mapped refusal. */
    private async simulate(
        config: ShelterOnchainConfig,
        router: string,
        auth: RelayAuthorization,
        signature: string
    ): Promise<string> {
        const caller = hotWalletAddress(config);
        const bytesData = encodeDonateWithAuthorization(auth, signature);
        try {
            await this.chain.ethCall(config, router, bytesData, caller);
            return bytesData;
        } catch (first: any) {
            if (!isCallException(first)) {
                this.logger.warn(`relay simulation failed: ${first?.code || first?.name || 'unknown error'}`);
                throw relayError('RELAY_SEND_FAILED', HttpStatus.FAILED_DEPENDENCY);
            }
            const vrsData = encodeDonateWithAuthorizationVRS(auth, signature);
            if (!vrsData) {
                throw mapRevert(first);
            }
            try {
                await this.chain.ethCall(config, router, vrsData, caller);
                return vrsData;
            } catch {
                // Both overloads refused: the first answer names the cause of the canonical call.
                throw mapRevert(first);
            }
        }
    }

    async status(txHash: string): Promise<RelayStatusView> {
        const tx = String(txHash || '').toLowerCase();
        if (!/^0x[0-9a-f]{64}$/.test(tx)) {
            throw new NotFoundException();
        }
        const row: any = await this.relayModel.findOne({ txHash: tx }).lean();
        if (!row) {
            throw new NotFoundException();
        }
        // The match is keyed by the transaction that paid: someone else's when they submitted first.
        const donorTx = String(row.settledTxHash || tx).toLowerCase();
        const match: any = await this.matchModel.findOne({ donorTxHash: donorTx }).lean();
        return {
            status: row.status,
            ...(row.batchId ? { batchId: String(row.batchId) } : {}),
            ...(row.settledTxHash ? { settledTxHash: String(row.settledTxHash) } : {}),
            ...(match
                ? { match: { status: match.status, ...(match.matchTxHash ? { txHash: match.matchTxHash } : {}) } }
                : {}),
        };
    }

    /**
     * Reconcile step 1: settles `submitted` relays by receipt. Success: `confirmed` with the batch id
     * from the router's RouterDonation log. Revert: `failed` (the donor's USDC never moved). No
     * receipt after 30 minutes and the hot wallet nonce is past it: `failed` (`timeout`).
     * Before failing a row it checks whether someone else submitted the same signature first (anyone
     * may): if USDC says the nonce is used and a RouterDonation carries it, the row is `confirmed`
     * with that transaction as `settledTxHash`, so the donor is never told to give again.
     */
    async confirmPending(
        config: ShelterOnchainConfig,
        now: Date = new Date()
    ): Promise<{ confirmed: number; failed: number }> {
        const out = { confirmed: 0, failed: 0 };
        if (!config.rpcUrl) {
            return out;
        }
        const rows: any[] = await this.relayModel
            .find({ status: 'submitted', txHash: { $exists: true }, chainId: config.chainId })
            .sort({ updatedAt: 1 })
            .limit(RELAY_CONFIRM_BATCH)
            .lean();
        for (const row of rows || []) {
            try {
                const receipt: any = await this.chain.getReceipt(config, row.txHash);
                if (receipt && receipt.status === 1) {
                    const gift = (receipt.logs || [])
                        .map((log: any) => decodeRouterDonation(log))
                        .find((d: any) => d && d.router === String(config.routerAddress).toLowerCase());
                    const res: any = await this.relayModel.updateOne(
                        { _id: row._id, status: 'submitted' },
                        {
                            $set: {
                                status: 'confirmed',
                                ...(gift ? { batchId: gift.batchId.toString() } : {}),
                                ...(typeof receipt.blockNumber === 'number'
                                    ? { blockNumber: receipt.blockNumber }
                                    : {}),
                            },
                        }
                    );
                    out.confirmed += res?.modifiedCount ? 1 : 0;
                    continue;
                }
                if (receipt && receipt.status === 0) {
                    const at = typeof receipt.blockNumber === 'number' ? receipt.blockNumber : undefined;
                    await this.fail(config, row, 'reverted', out, at);
                    continue;
                }
                if (new Date(row.updatedAt).getTime() > now.getTime() - RELAY_TIMEOUT_MS) {
                    continue;
                }
                if (typeof row.txNonce === 'number' && row.txFrom) {
                    const mined = await this.chain.minedNonce(config, row.txFrom);
                    if (mined > row.txNonce && !(await this.chain.getReceipt(config, row.txHash))) {
                        await this.fail(config, row, 'timeout', out);
                    }
                }
            } catch (error: any) {
                this.logger.warn(`relay receipt lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            }
        }
        return out;
    }

    private async fail(
        config: ShelterOnchainConfig,
        row: any,
        reason: string,
        out: { confirmed: number; failed: number },
        atBlock?: number
    ) {
        const settled = await this.settledElsewhere(config, row, atBlock);
        if (settled === 'unknown') {
            return; // The node did not answer: try again on the next run rather than guess.
        }
        if (settled) {
            const res: any = await this.relayModel.updateOne(
                { _id: row._id, status: 'submitted' },
                {
                    $set: {
                        status: 'confirmed',
                        batchId: settled.batchId.toString(),
                        settledTxHash: settled.txHash,
                        ...(settled.blockNumber ? { blockNumber: settled.blockNumber } : {}),
                    },
                }
            );
            out.confirmed += res?.modifiedCount ? 1 : 0;
            return;
        }
        const res: any = await this.relayModel.updateOne(
            { _id: row._id, status: 'submitted' },
            { $set: { status: 'failed', failedReason: reason } }
        );
        out.failed += res?.modifiedCount ? 1 : 0;
    }

    /**
     * The gift that used this row's EIP-3009 nonce through our router, if someone else submitted it
     * first. Null when the nonce is unused (the donor's USDC never moved) or used without a matching
     * RouterDonation in the scanned window (for example the donor cancelled the authorization).
     * 'unknown' when the node could not be asked.
     */
    private async settledElsewhere(
        config: ShelterOnchainConfig,
        row: any,
        atBlock?: number
    ): Promise<DecodedRouterDonation | null | 'unknown'> {
        const router = String(config.routerAddress || '').toLowerCase();
        const nonce = String(row?.nonce || '').toLowerCase();
        if (!router || !BYTES32_RE.test(nonce) || !isAddress(row?.from)) {
            return null;
        }
        try {
            const usdcRet = await this.chain.ethCall(config, router, donateRouterInterface.encodeFunctionData('usdc'));
            const usdc = String(donateRouterInterface.decodeFunctionResult('usdc', usdcRet)[0]);
            const stateRet = await this.chain.ethCall(
                config,
                usdc,
                erc20Interface.encodeFunctionData('authorizationState', [getAddress(row.from), nonce])
            );
            if (!erc20Interface.decodeFunctionResult('authorizationState', stateRet)[0]) {
                return null;
            }
            let to = typeof atBlock === 'number' ? atBlock : await this.chain.blockNumber(config);
            for (let i = 0; i < RELAY_SETTLE_SCAN_CALLS && to >= 0; i++) {
                const from = Math.max(0, to - RELAY_SETTLE_SCAN_BLOCKS + 1);
                const logs = await this.chain.getRouterLogsByNonce(config, nonce, from, to);
                const gift = (logs || [])
                    .map(log => decodeRouterDonation(log))
                    .find(
                        d =>
                            !!d &&
                            d.router === router &&
                            d.nonce === nonce &&
                            d.path === ROUTER_PATH.AUTH &&
                            d.donor === String(row.from).toLowerCase()
                    );
                if (gift) {
                    return gift;
                }
                to = from - 1;
            }
            return null;
        } catch (error: any) {
            this.logger.warn(`relay settle lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            return 'unknown';
        }
    }
}

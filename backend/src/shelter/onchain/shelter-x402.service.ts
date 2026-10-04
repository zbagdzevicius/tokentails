import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { getAddress, getBigInt } from 'ethers';
import { Model } from 'mongoose';
import { Blessing, BlessingDocument, BlessingStatus } from 'src/blessing/blessing.schema';
import {
    hotWalletAddress,
    NATIVE_BATCH_TOPIC,
    NATIVE_DISBURSED_TOPIC,
    ShelterChain,
    shelterSplitInterface,
} from './shelter-chain';
import { readShelterConfig, ShelterOnchainConfig, x402Ready } from './shelter-onchain.config';
import { X402Nonce, X402NonceDocument, X402UsedTx, X402UsedTxDocument } from './shelter-onchain.schema';
import {
    buildExactRequirement,
    decodeXPayment,
    domainMismatch,
    EXACT_SCHEME,
    ExactChainReader,
    ExactConfig,
    ExactPaymentPayload,
    ExactRequirement,
    exactReady,
    FacilitatorClient,
    FacilitatorError,
    FetchLike,
    peekScheme,
    readExactConfig,
    signatureMatches,
} from './x402-exact';

export const X402_VERSION = 1;
export const X402_SCHEME = 'onchain-receipt';
/** Matches `maxTimeoutSeconds` in the 402 body. */
export const X402_NONCE_TTL_SECONDS = 600;
export const X402_DISABLED =
    'Agent cat cards are off. Public payments open once the shelter holds its own wallet keys.';
export const X402_NO_CARDS = 'No adoptable cat cards are available right now.';

const DUPLICATE_KEY = 11000;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const NONCE = /^[0-9a-f]{32}$/;

/** The whitelisted card: never owner, creator, user or wallet data. */
export interface CatCard {
    name: string;
    imageUrl: string | null;
    shelterName: string | null;
}

export interface X402Accept {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    asset: 'native';
    payTo: string;
    resource: string;
    description: string;
    mimeType: string;
    maxTimeoutSeconds: number;
    extra: { memo: string; nonce: string };
}

/**
 * The 402 body. When `exact` is offered, `accepts` holds only the standard requirement (x402-fetch and
 * x402-axios schema-parse every entry and throw on a custom one), and the custom offer moves to the
 * top-level `onchainReceipt`, which standard clients do not read. Without `exact`, `accepts` holds the
 * onchain-receipt offer as before.
 */
export interface X402PaymentRequired {
    x402Version: number;
    error: string;
    accepts: Array<X402Accept | ExactRequirement>;
    onchainReceipt?: X402Accept;
}

export interface X402PaidCard {
    card: CatCard;
    txHash: string;
}

export function x402Network(chainId: number): string {
    return `eip155:${chainId}`;
}

export function x402Memo(nonce: string): string {
    return `x402:${nonce}`;
}

/**
 * `exact` settlements this process made recently, so X-PAYMENT-RESPONSE can carry the standard x402
 * SettlementResponse fields (transaction, network, payer). The controller only passes the hash.
 */
const exactSettlements = new Map<string, { network: string; payer: string }>();
const EXACT_SETTLEMENTS_KEPT = 256;

function rememberExactSettlement(txHash: string, network: string, payer: string) {
    exactSettlements.set(txHash.toLowerCase(), { network, payer });
    while (exactSettlements.size > EXACT_SETTLEMENTS_KEPT) {
        exactSettlements.delete(exactSettlements.keys().next().value as string);
    }
}

/**
 * The base64 X-PAYMENT-RESPONSE. onchain-receipt: `{success, txHash}`. exact: the x402 v1
 * SettlementResponse (`transaction`, `network`, `payer`), plus `txHash` for older clients.
 */
export function encodePaymentResponse(txHash: string): string {
    const exact = exactSettlements.get(String(txHash).toLowerCase());
    const body = exact
        ? { success: true, txHash, transaction: txHash, network: exact.network, payer: exact.payer }
        : { success: true, txHash };
    if (exact) {
        exactSettlements.delete(String(txHash).toLowerCase());
    }
    return Buffer.from(JSON.stringify(body)).toString('base64');
}

interface ParsedPayment {
    txHash: string;
    nonce: string;
}

/** How long a settled `exact` transfer may take to show up on the RPC before the card is sent anyway. */
const EXACT_RECEIPT_ATTEMPTS = 5;
const EXACT_RECEIPT_DELAY_MS = 1500;

/**
 * An x402 paywall with two schemes. Neither one lets money touch a Token Tails wallet.
 *
 * - `onchain-receipt` (custom, no facilitator; Arc): the agent pays ShelterSplit.donate('x402:<nonce>')
 *   itself, and this service checks the receipt over RPC. Gated by SHELTER_X402_ENABLED.
 * - `exact` (standard x402, EIP-3009): `payTo` is the shelter's own wallet. The agent signs a
 *   transferWithAuthorization to it, a facilitator verifies and settles it and pays the gas, and this
 *   service re-reads the Transfer log over SHELTER_X402_EXACT_RPC (required). Gated by
 *   SHELTER_X402_EXACT_ENABLED; on a mainnet network also by SHELTER_HANDED_OVER=true (the shelter
 *   holds its own key). See x402-exact.ts.
 */
@Injectable()
export class ShelterX402Service implements OnModuleInit {
    private readonly logger = new Logger(ShelterX402Service.name);
    /** Injectable for tests: the facilitator and the exact re-check RPC use it. */
    fetchFn: FetchLike = (url, init) => (globalThis as any).fetch(url, init);
    sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    /** Logged `blocked` reasons, so each is logged once. */
    private loggedBlocked = new Set<string>();
    /** Token-domain check per (rpc, chain, asset, name, version): null when it fits, else why not. */
    private domainChecks = new Map<string, string | null>();
    private domainInflight = new Map<string, Promise<string | null | 'unreachable'>>();

    constructor(
        @InjectModel(X402Nonce.name) private nonceModel: Model<X402NonceDocument>,
        @InjectModel(X402UsedTx.name) private usedTxModel: Model<X402UsedTxDocument>,
        @InjectModel(Blessing.name) private blessingModel: Model<BlessingDocument>,
        private chain: ShelterChain
    ) {}

    /** Reads the token domain at startup, so a misconfigured `exact` offer is never advertised. */
    async onModuleInit() {
        const exact = this.exactConfig(readShelterConfig());
        this.logBlockedOnce(exact);
        if (exactReady(exact)) {
            await this.exactOffered(exact).catch(() => undefined);
        }
    }

    private exactConfig(config: ShelterOnchainConfig): ExactConfig {
        return readExactConfig(process.env, { hotWallet: hotWalletAddress(config) });
    }

    /** Returns the paid card, or throws 402 (with a fresh challenge) or 503. */
    async catCard(paymentHeader: string | undefined, resource: string, now: Date = new Date()): Promise<X402PaidCard> {
        const config = readShelterConfig();
        const exact = this.exactConfig(config);
        const onchainOn = x402Ready(config);
        this.logBlockedOnce(exact);
        const exactOn = await this.exactOffered(exact);
        if (!onchainOn && !exactOn) {
            throw new HttpException(
                { statusCode: HttpStatus.CONFLICT, message: X402_DISABLED, error: 'Conflict' },
                HttpStatus.CONFLICT
            );
        }
        const challenge = (error: string) => this.paymentRequired(config, exactOn ? exact : null, resource, error, now);
        if (!paymentHeader) {
            if (!(await this.blessingModel.exists({ status: BlessingStatus.WAITING }))) {
                throw new HttpException(
                    { statusCode: HttpStatus.CONFLICT, message: X402_NO_CARDS, error: 'Conflict' },
                    HttpStatus.CONFLICT
                );
            }
            throw await challenge('payment required');
        }

        if (exactOn && peekScheme(paymentHeader) === EXACT_SCHEME) {
            return this.payExact(exact, paymentHeader, resource, now, challenge);
        }
        if (!onchainOn) {
            throw await challenge(`unsupported scheme; use ${EXACT_SCHEME}`);
        }

        const payment = this.parsePayment(paymentHeader, config);
        if (typeof payment === 'string') {
            throw await challenge(payment);
        }

        const nonce = await this.nonceModel.findOne({ nonce: payment.nonce, usedAt: null, expiresAt: { $gt: now } });
        if (!nonce) {
            throw await challenge('nonce is unknown, expired or already used');
        }

        const verdict = await this.verifyReceipt(config, payment);
        if (typeof verdict === 'string') {
            throw await challenge(verdict);
        }

        const txHash = payment.txHash.toLowerCase();
        try {
            await this.usedTxModel.create({ txHash, nonce: payment.nonce, amountWei: verdict.toString() });
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                throw await challenge('transaction was already used');
            }
            throw error;
        }
        const consumed = await this.nonceModel.findOneAndUpdate(
            { nonce: payment.nonce, usedAt: null, expiresAt: { $gt: now } },
            { $set: { usedAt: now, txHash } }
        );
        if (!consumed) {
            throw await challenge('nonce is unknown, expired or already used');
        }

        const card = await this.pickCard();
        return { card, txHash };
    }

    /**
     * Pays with the standard `exact` scheme: local checks, a single-use claim on the authorization
     * nonce, facilitator verify and settle, an optional on-chain re-check, then the used-tx row.
     */
    private async payExact(
        exact: ExactConfig,
        header: string,
        resource: string,
        now: Date,
        challenge: (error: string) => Promise<HttpException>
    ): Promise<X402PaidCard> {
        const requirement = buildExactRequirement(exact, resource);
        const payment = decodeXPayment(header, requirement, Math.floor(now.getTime() / 1000));
        if (typeof payment === 'string') {
            throw await challenge(payment);
        }
        if (!signatureMatches(exact, payment)) {
            throw await challenge('the signature does not match the authorization');
        }
        const auth = payment.payload.authorization;

        // Claim the EIP-3009 authorization (signer + nonce) before anything leaves this process, so two
        // concurrent requests with the same header cannot both be settled or both get a card.
        const claim = `exact:${exact.chainId}:${auth.from.toLowerCase()}:${auth.nonce.toLowerCase()}`;
        try {
            await this.nonceModel.create({
                nonce: claim,
                expiresAt: new Date(Math.max(Number(auth.validBefore) * 1000, now.getTime()) + 24 * 3600 * 1000),
                usedAt: now,
            });
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                throw await challenge('authorization was already used');
            }
            throw error;
        }
        const release = async () => {
            try {
                await this.nonceModel.deleteOne({ nonce: claim });
            } catch (error: any) {
                this.logger.warn(`x402 exact: could not release a claim: ${error?.name || 'unknown error'}`);
            }
        };

        const facilitator = new FacilitatorClient(exact.facilitatorUrl!, this.fetchFn);
        let verified;
        try {
            verified = await facilitator.verify(payment, requirement);
        } catch (error) {
            await release();
            throw await challenge(this.facilitatorMessage(error, 'verify'));
        }
        if (!verified.isValid) {
            await release();
            throw await challenge(`the facilitator refused the payment: ${verified.invalidReason || 'invalid'}`);
        }

        let settled;
        try {
            settled = await facilitator.settle(payment, requirement);
        } catch (error) {
            // Ambiguous: the transfer may still land, so the claim stays and the same header is refused.
            throw await challenge(this.facilitatorMessage(error, 'settle'));
        }
        if (!settled.success || !TX_HASH.test(settled.transaction)) {
            await release();
            throw await challenge(`the payment did not settle: ${settled.errorReason || 'no transaction'}`);
        }
        const txHash = settled.transaction.toLowerCase();

        const onchain = await this.recheckExact(exact, payment, txHash);
        if (typeof onchain === 'string') {
            throw await challenge(onchain);
        }

        try {
            await this.usedTxModel.create({
                txHash,
                nonce: auth.nonce.toLowerCase(),
                amountWei: auth.value,
                scheme: EXACT_SCHEME,
                chainId: exact.chainId,
                amountBase: auth.value,
                payTo: requirement.payTo,
                // Only rows read back from the chain count in the public totals (impact indexer).
                verifiedOnchain: onchain.verified,
            } as any);
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                throw await challenge('transaction was already used');
            }
            throw error;
        }

        rememberExactSettlement(txHash, requirement.network, getAddress(auth.from));
        const card = await this.pickCard();
        return { card, txHash };
    }

    private facilitatorMessage(error: unknown, step: 'verify' | 'settle'): string {
        if (error instanceof FacilitatorError) {
            this.logger.warn(`x402 exact ${step}: ${error.reason}`);
            return `the payment facilitator is unavailable (${step}); retry shortly`;
        }
        this.logger.warn(`x402 exact ${step}: ${(error as any)?.name || 'unknown error'}`);
        return `the payment facilitator is unavailable (${step}); retry shortly`;
    }

    /**
     * Confirms over SHELTER_X402_EXACT_RPC (required for exact) that the settlement shows a
     * Transfer(from -> shelter wallet, >= value) from the token. Returns a refusal reason, or whether the
     * transfer was read back. A receipt the node does not have yet (or an RPC outage) does not block the
     * card, since the facilitator reported the settlement, but the row is stored as unverified and is
     * left out of the public totals.
     */
    private async recheckExact(
        exact: ExactConfig,
        payment: ExactPaymentPayload,
        txHash: string
    ): Promise<string | { verified: boolean }> {
        if (!exact.rpcUrl) {
            return { verified: false };
        }
        const reader = new ExactChainReader(exact.rpcUrl, this.fetchFn);
        const auth = payment.payload.authorization;
        const expected = { asset: exact.asset!, from: auth.from, payTo: exact.payTo!, value: BigInt(auth.value) };
        for (let attempt = 1; ; attempt++) {
            const result = await reader.checkTransfer(txHash, expected);
            if (result === 'ok') {
                return { verified: true };
            }
            if (result === 'unreachable' || (result === 'pending' && attempt >= EXACT_RECEIPT_ATTEMPTS)) {
                this.logger.warn(`x402 exact: settlement ${txHash} not re-checked on-chain (${result}); not counted`);
                return { verified: false };
            }
            if (result !== 'pending') {
                this.logger.error(`x402 exact: facilitator settlement ${txHash} failed the on-chain check: ${result}`);
                return result;
            }
            await this.sleep(EXACT_RECEIPT_DELAY_MS);
        }
    }

    /** Logs once why exact is not offered (only when it was switched on). */
    private logBlockedOnce(exact: ExactConfig) {
        if (exact.enabled && exact.blocked && !this.loggedBlocked.has(exact.blocked)) {
            this.loggedBlocked.add(exact.blocked);
            this.logger.warn(`x402 exact is not offered: ${exact.blocked}`);
        }
    }

    /**
     * Whether `exact` is offered: the config is ready and the token's on-chain name, version and
     * decimals match it. A mismatch is cached (the scheme stays off until the config changes); an RPC
     * failure is not, so the next request tries again, and exact stays off meanwhile (fail closed).
     */
    private async exactOffered(exact: ExactConfig): Promise<boolean> {
        if (!exactReady(exact) || !exact.rpcUrl) {
            return false;
        }
        const key = [exact.rpcUrl, exact.chainId, exact.asset, exact.assetName, exact.assetVersion].join('|');
        if (this.domainChecks.has(key)) {
            return this.domainChecks.get(key) === null;
        }
        let inflight = this.domainInflight.get(key);
        if (!inflight) {
            inflight = new ExactChainReader(exact.rpcUrl, this.fetchFn)
                .domain(exact.asset!)
                .then(onchain => domainMismatch(exact, onchain))
                .catch(() => 'unreachable' as const)
                .finally(() => this.domainInflight.delete(key));
            this.domainInflight.set(key, inflight);
        }
        const verdict = await inflight;
        if (verdict === 'unreachable') {
            this.logger.warn('x402 exact: could not read the token domain; exact is not offered until it can');
            return false;
        }
        if (!this.domainChecks.has(key)) {
            this.domainChecks.set(key, verdict);
            if (verdict) {
                this.logger.error(`x402 exact is not offered: ${verdict}`);
            }
        }
        return verdict === null;
    }

    /** `exact` is the config when the scheme is offered (ready and domain-checked), else null. */
    private async paymentRequired(
        config: ShelterOnchainConfig,
        exact: ExactConfig | null,
        resource: string,
        error: string,
        now: Date
    ): Promise<HttpException> {
        let onchainOffer: X402Accept | null = null;
        if (x402Ready(config)) {
            const nonce = randomBytes(16).toString('hex');
            await this.nonceModel.create({
                nonce,
                expiresAt: new Date(now.getTime() + X402_NONCE_TTL_SECONDS * 1000),
                usedAt: null,
            });
            onchainOffer = {
                scheme: X402_SCHEME,
                network: x402Network(config.chainId),
                maxAmountRequired: config.x402PriceWei.toString(),
                asset: 'native',
                payTo: config.splitAddress!,
                resource,
                description:
                    'One adoptable-cat card. The ShelterSplit contract splits each payment among its shelter recipients',
                mimeType: 'application/json',
                maxTimeoutSeconds: X402_NONCE_TTL_SECONDS,
                extra: { memo: x402Memo(nonce), nonce },
            };
        }
        const body: X402PaymentRequired = exact
            ? {
                  x402Version: X402_VERSION,
                  error,
                  accepts: [buildExactRequirement(exact, resource)],
                  ...(onchainOffer ? { onchainReceipt: onchainOffer } : {}),
              }
            : { x402Version: X402_VERSION, error, accepts: onchainOffer ? [onchainOffer] : [] };
        return new HttpException(body, HttpStatus.PAYMENT_REQUIRED);
    }

    /** Decodes X-PAYMENT, or returns the reason it is not acceptable. */
    private parsePayment(header: string, config: ShelterOnchainConfig): ParsedPayment | string {
        let decoded: any;
        try {
            decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
        } catch {
            return 'X-PAYMENT is not base64 JSON';
        }
        if (decoded?.x402Version !== X402_VERSION) {
            return 'unsupported x402Version';
        }
        if (decoded.scheme !== X402_SCHEME) {
            return `unsupported scheme; use ${X402_SCHEME}`;
        }
        if (decoded.network !== x402Network(config.chainId)) {
            return `wrong network; use ${x402Network(config.chainId)}`;
        }
        const txHash = decoded.payload?.txHash;
        const nonce = decoded.payload?.nonce;
        if (typeof txHash !== 'string' || !TX_HASH.test(txHash)) {
            return 'payload.txHash must be a 0x-prefixed 32-byte hash';
        }
        if (typeof nonce !== 'string' || !NONCE.test(nonce)) {
            return 'payload.nonce is missing or malformed';
        }
        return { txHash, nonce };
    }

    /**
     * What the transaction paid ShelterSplit with memo `x402:<nonce>`. The NativeDisbursementBatch
     * `amount` is the whole msg.value, so a split whose shelters hold less than 10000 bps (the treasury
     * remainder emits no NativeDisbursed) still counts the full payment. Without a batch event, the
     * NativeDisbursed shares are summed.
     */
    private async verifyReceipt(config: ShelterOnchainConfig, payment: ParsedPayment): Promise<bigint | string> {
        let receipt;
        try {
            receipt = await this.chain.getReceipt(config, payment.txHash);
        } catch (error: any) {
            this.logger.warn(`x402 receipt lookup failed: ${error?.code || error?.name || 'unknown error'}`);
            return 'could not read the transaction; retry shortly';
        }
        if (!receipt) {
            return 'transaction not found or not mined yet; retry shortly';
        }
        if (receipt.status !== 1) {
            return 'transaction reverted';
        }
        const split = config.splitAddress!.toLowerCase();
        const memo = x402Memo(payment.nonce);
        let shares = getBigInt(0);
        let batches = getBigInt(0);
        for (const log of receipt.logs || []) {
            if ((log.address || '').toLowerCase() !== split) {
                continue;
            }
            const topic = (log.topics?.[0] || '').toLowerCase();
            if (topic !== NATIVE_DISBURSED_TOPIC && topic !== NATIVE_BATCH_TOPIC) {
                continue;
            }
            let parsed;
            try {
                parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            } catch {
                continue;
            }
            if (parsed?.args.memo !== memo) {
                continue;
            }
            if (topic === NATIVE_BATCH_TOPIC) {
                batches += getBigInt(parsed.args.amount);
            } else {
                shares += getBigInt(parsed.args.amount);
            }
        }
        const paid = batches > shares ? batches : shares;
        if (paid < config.x402PriceWei) {
            return `payment to ShelterSplit with memo ${memo} is below ${config.x402PriceWei.toString()} wei`;
        }
        return paid;
    }

    /** A random adoptable cat, falling back to any blessing, projected to the whitelisted card fields. */
    async pickCard(): Promise<CatCard> {
        const pipeline = (match: Record<string, unknown>) => [
            { $match: match },
            { $sample: { size: 1 } },
            { $lookup: { from: 'images', localField: 'image', foreignField: '_id', as: 'imageDoc' } },
            { $lookup: { from: 'shelters', localField: 'shelter', foreignField: '_id', as: 'shelterDoc' } },
            {
                $project: {
                    _id: 0,
                    name: 1,
                    imageUrl: { $arrayElemAt: ['$imageDoc.url', 0] },
                    shelterName: { $arrayElemAt: ['$shelterDoc.name', 0] },
                },
            },
        ];
        let [row] = await this.blessingModel.aggregate(pipeline({ status: BlessingStatus.WAITING }));
        if (!row) {
            [row] = await this.blessingModel.aggregate(pipeline({}));
        }
        // Rebuild the object, so nothing outside the whitelist can leak even if the projection changes.
        return {
            name: String(row?.name || 'A shelter cat'),
            imageUrl: typeof row?.imageUrl === 'string' ? row.imageUrl : null,
            shelterName: typeof row?.shelterName === 'string' ? row.shelterName : null,
        };
    }
}

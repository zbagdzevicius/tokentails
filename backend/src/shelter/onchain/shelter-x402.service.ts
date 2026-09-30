import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { getBigInt } from 'ethers';
import { Model } from 'mongoose';
import { Blessing, BlessingDocument, BlessingStatus } from 'src/blessing/blessing.schema';
import { NATIVE_DISBURSED_TOPIC, ShelterChain, shelterSplitInterface } from './shelter-chain';
import { readShelterConfig, ShelterOnchainConfig, x402Ready } from './shelter-onchain.config';
import { X402Nonce, X402NonceDocument, X402UsedTx, X402UsedTxDocument } from './shelter-onchain.schema';

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

export interface X402PaymentRequired {
    x402Version: number;
    error: string;
    accepts: X402Accept[];
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

export function encodePaymentResponse(txHash: string): string {
    return Buffer.from(JSON.stringify({ success: true, txHash })).toString('base64');
}

interface ParsedPayment {
    txHash: string;
    nonce: string;
}

/**
 * An x402-compatible paywall with an `onchain-receipt` scheme and no facilitator: the agent pays
 * ShelterSplit.donate('x402:<nonce>') itself, and this service checks the receipt over RPC.
 */
@Injectable()
export class ShelterX402Service {
    private readonly logger = new Logger(ShelterX402Service.name);

    constructor(
        @InjectModel(X402Nonce.name) private nonceModel: Model<X402NonceDocument>,
        @InjectModel(X402UsedTx.name) private usedTxModel: Model<X402UsedTxDocument>,
        @InjectModel(Blessing.name) private blessingModel: Model<BlessingDocument>,
        private chain: ShelterChain
    ) {}

    /** Returns the paid card, or throws 402 (with a fresh challenge) or 503. */
    async catCard(paymentHeader: string | undefined, resource: string, now: Date = new Date()): Promise<X402PaidCard> {
        const config = readShelterConfig();
        if (!x402Ready(config)) {
            throw new ServiceUnavailableException(X402_DISABLED);
        }
        if (!paymentHeader) {
            if (!(await this.blessingModel.exists({ status: BlessingStatus.WAITING }))) {
                throw new ServiceUnavailableException(X402_NO_CARDS);
            }
            throw await this.paymentRequired(config, resource, 'payment required', now);
        }

        const payment = this.parsePayment(paymentHeader, config);
        if (typeof payment === 'string') {
            throw await this.paymentRequired(config, resource, payment, now);
        }

        const nonce = await this.nonceModel.findOne({ nonce: payment.nonce, usedAt: null, expiresAt: { $gt: now } });
        if (!nonce) {
            throw await this.paymentRequired(config, resource, 'nonce is unknown, expired or already used', now);
        }

        const verdict = await this.verifyReceipt(config, payment);
        if (typeof verdict === 'string') {
            throw await this.paymentRequired(config, resource, verdict, now);
        }

        const txHash = payment.txHash.toLowerCase();
        try {
            await this.usedTxModel.create({ txHash, nonce: payment.nonce, amountWei: verdict.toString() });
        } catch (error: any) {
            if (error?.code === DUPLICATE_KEY) {
                throw await this.paymentRequired(config, resource, 'transaction was already used', now);
            }
            throw error;
        }
        const consumed = await this.nonceModel.findOneAndUpdate(
            { nonce: payment.nonce, usedAt: null, expiresAt: { $gt: now } },
            { $set: { usedAt: now, txHash } }
        );
        if (!consumed) {
            throw await this.paymentRequired(config, resource, 'nonce is unknown, expired or already used', now);
        }

        const card = await this.pickCard();
        return { card, txHash };
    }

    private async paymentRequired(
        config: ShelterOnchainConfig,
        resource: string,
        error: string,
        now: Date
    ): Promise<HttpException> {
        const nonce = randomBytes(16).toString('hex');
        await this.nonceModel.create({
            nonce,
            expiresAt: new Date(now.getTime() + X402_NONCE_TTL_SECONDS * 1000),
            usedAt: null,
        });
        const body: X402PaymentRequired = {
            x402Version: X402_VERSION,
            error,
            accepts: [
                {
                    scheme: X402_SCHEME,
                    network: x402Network(config.chainId),
                    maxAmountRequired: config.x402PriceWei.toString(),
                    asset: 'native',
                    payTo: config.splitAddress!,
                    resource,
                    description: 'One adoptable-cat card; payment goes to shelters via ShelterSplit',
                    mimeType: 'application/json',
                    maxTimeoutSeconds: X402_NONCE_TTL_SECONDS,
                    extra: { memo: x402Memo(nonce), nonce },
                },
            ],
        };
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

    /** Sums NativeDisbursed amounts from the split contract whose memo is `x402:<nonce>`. */
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
        let paid = getBigInt(0);
        for (const log of receipt.logs || []) {
            if ((log.address || '').toLowerCase() !== split) {
                continue;
            }
            if ((log.topics?.[0] || '').toLowerCase() !== NATIVE_DISBURSED_TOPIC) {
                continue;
            }
            let parsed;
            try {
                parsed = shelterSplitInterface.parseLog({ topics: [...log.topics], data: log.data });
            } catch {
                continue;
            }
            if (parsed?.args.memo === memo) {
                paid += getBigInt(parsed.args.amount);
            }
        }
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

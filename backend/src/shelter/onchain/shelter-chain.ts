import { Injectable } from '@nestjs/common';
import {
    computeAddress,
    Interface,
    JsonRpcProvider,
    keccak256,
    TransactionReceipt,
    TransactionResponse,
    Wallet,
} from 'ethers';
import { ShelterOnchainConfig } from './shelter-onchain.config';

/** The slice of ShelterSplit this backend uses. */
export const SHELTER_SPLIT_ABI = [
    'function donate(string memo) payable',
    'function disburse(uint256 amount, string memo)',
    'event NativeDisbursed(address indexed shelter, uint256 amount, string memo)',
    'event Disbursed(address indexed shelter, uint256 amount, string memo)',
    'event NativeDisbursementBatch(uint256 indexed batchId, address indexed payer, uint256 amount, uint256 toShelters, uint256 toTreasury, uint256 sheltersPaid, string memo)',
];

export const shelterSplitInterface = new Interface(SHELTER_SPLIT_ABI);

// keccak256("NativeDisbursed(address,uint256,string)") and keccak256("Disbursed(address,uint256,string)").
export const NATIVE_DISBURSED_TOPIC = '0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef';
export const DISBURSED_TOPIC = '0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a';
/** One per donate(): `amount` is the whole msg.value, shelters' shares plus the treasury remainder. */
export const NATIVE_BATCH_TOPIC = shelterSplitInterface.getEvent('NativeDisbursementBatch')!.topicHash.toLowerCase();

/**
 * Thin ethers v6 wrapper, so the services stay testable with a mocked `ethers`.
 * Sends are serialised in-process, so two gifts in the same instant do not race for the hot wallet's nonce.
 */
@Injectable()
export class ShelterChain {
    private providers = new Map<string, JsonRpcProvider>();
    private sendQueue: Promise<unknown> = Promise.resolve();

    provider(config: ShelterOnchainConfig): JsonRpcProvider {
        const key = `${config.chainId}|${config.rpcUrl}`;
        let provider = this.providers.get(key);
        if (!provider) {
            provider = new JsonRpcProvider(config.rpcUrl!, config.chainId, { staticNetwork: true });
            this.providers.set(key, provider);
        }
        return provider;
    }

    /**
     * Calls ShelterSplit.donate(memo) from the hot wallet in three steps (plan F7.4 reconcile):
     *
     * 1. populate and sign locally (nonce from the node's pending count);
     * 2. `onSigned` with the hash, nonce and sender, so the caller stores them BEFORE anything leaves
     *    the process: a crash or an RPC timeout after this point can never leave a gift whose hash is
     *    unknown;
     * 3. broadcast the signed bytes.
     *
     * Resolves with the signed transaction once broadcast. A failure before step 2 rejects with the
     * ethers error (nothing was broadcast). A failure in step 3 rejects with `DonationBroadcastError`,
     * whose `definite` says whether the node certainly refused it; an ambiguous one (a timeout, a
     * dropped connection) may still be mined.
     */
    sendDonation(
        config: ShelterOnchainConfig,
        memo: string,
        value: bigint,
        onSigned: (tx: SignedDonation) => Promise<void> = async () => undefined
    ): Promise<SignedDonation> {
        const run = async () => {
            const wallet = new Wallet(config.privateKey!, this.provider(config));
            const request = await wallet.populateTransaction({
                to: config.splitAddress!,
                data: shelterSplitInterface.encodeFunctionData('donate', [memo]),
                value,
                chainId: config.chainId,
            });
            const signed = await wallet.signTransaction(request);
            const tx: SignedDonation = {
                hash: keccak256(signed),
                nonce: Number(request.nonce),
                from: String(wallet.address).toLowerCase(),
            };
            await onSigned(tx);
            try {
                await this.provider(config).broadcastTransaction(signed);
            } catch (error) {
                throw new DonationBroadcastError(tx, error);
            }
            return tx;
        };
        const result = this.sendQueue.then(run, run);
        this.sendQueue = result.catch(() => undefined);
        return result;
    }

    /** Transactions `from` has had mined (`latest` nonce). A nonce below it is used for good. */
    minedNonce(config: ShelterOnchainConfig, from: string): Promise<number> {
        return this.provider(config).getTransactionCount(from, 'latest');
    }

    /** The lowercased sender of `txHash`, or null when the node does not know the transaction. */
    async transactionSender(config: ShelterOnchainConfig, txHash: string): Promise<string | null> {
        const tx = await this.getTransaction(config, txHash);
        return typeof tx?.from === 'string' ? tx.from.toLowerCase() : null;
    }

    getReceipt(config: ShelterOnchainConfig, txHash: string): Promise<TransactionReceipt | null> {
        return this.provider(config).getTransactionReceipt(txHash);
    }

    /** The transaction if the node still knows it (mined or in its mempool), else null (dropped or never seen). */
    getTransaction(config: ShelterOnchainConfig, txHash: string): Promise<TransactionResponse | null> {
        return this.provider(config).getTransaction(txHash);
    }

    /**
     * The canonical hash of block `blockNumber`, lowercased, or null when the node does not have that
     * block yet (a lagging node behind a load balancer).
     */
    async blockHash(config: ShelterOnchainConfig, blockNumber: number): Promise<string | null> {
        const block: { hash?: string } | null = await this.provider(config).send('eth_getBlockByNumber', [
            '0x' + blockNumber.toString(16),
            false,
        ]);
        return typeof block?.hash === 'string' ? block.hash.toLowerCase() : null;
    }

    blockNumber(config: ShelterOnchainConfig): Promise<number> {
        return this.provider(config).getBlockNumber();
    }

    /**
     * Raw `eth_getLogs` for ShelterSplit's two payout events, in JSON-RPC shape (hex quantities), so the
     * backend decodes exactly what the browser decoders read (plan F7.3 parity fixture).
     */
    getPayoutLogs(config: ShelterOnchainConfig, fromBlock: number, toBlock: number): Promise<RpcPayoutLog[]> {
        return this.provider(config).send('eth_getLogs', [
            {
                address: config.splitAddress,
                topics: [[DISBURSED_TOPIC, NATIVE_DISBURSED_TOPIC]],
                fromBlock: '0x' + fromBlock.toString(16),
                toBlock: '0x' + toBlock.toString(16),
            },
        ]);
    }
}

/** The donate hot wallet's address (lowercased), or null when no valid key is configured. */
export function hotWalletAddress(config: Pick<ShelterOnchainConfig, 'privateKey'>): string | null {
    if (!config.privateKey) {
        return null;
    }
    try {
        return computeAddress(config.privateKey).toLowerCase();
    } catch {
        return null;
    }
}

/** A signed gift: its hash, the hot wallet nonce it uses and the hot wallet address (lowercased). */
export interface SignedDonation {
    hash: string;
    nonce: number;
    from: string;
}

/**
 * ethers codes for a broadcast the node certainly refused: the transaction is not in any mempool and
 * its nonce is free. Anything else (TIMEOUT, NETWORK_ERROR, SERVER_ERROR, UNKNOWN_ERROR, ...) is
 * ambiguous: the node may have accepted it before the answer was lost.
 */
export const DEFINITE_BROADCAST_REFUSALS = [
    'INSUFFICIENT_FUNDS',
    'NONCE_EXPIRED',
    'REPLACEMENT_UNDERPRICED',
    'INVALID_ARGUMENT',
    'CALL_EXCEPTION',
];

export class DonationBroadcastError extends Error {
    readonly code: string;
    readonly definite: boolean;

    constructor(readonly tx: SignedDonation, cause: unknown) {
        const code = String((cause as any)?.code || (cause as any)?.name || 'UNKNOWN_ERROR');
        super(`broadcast failed: ${code}`);
        this.name = 'DonationBroadcastError';
        this.code = code;
        this.definite = DEFINITE_BROADCAST_REFUSALS.includes(code);
    }
}

/** One `eth_getLogs` entry. Mirrors `RpcLog` in src/impact/shelter-logs.ts. */
export interface RpcPayoutLog {
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
    blockHash?: string;
    removed?: boolean;
}

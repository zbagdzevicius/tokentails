import { Injectable } from '@nestjs/common';
import {
    computeAddress,
    encodeBytes32String,
    getBigInt,
    Interface,
    JsonRpcProvider,
    keccak256,
    TransactionReceipt,
    TransactionResponse,
    Wallet,
} from 'ethers';
import { donateRouterInterface, ROUTER_DONATION_TOPIC } from './donate-router';
import { readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';

export { donateRouterInterface, ROUTER_DONATION_TOPIC };

/** The slice of ShelterSplit this backend uses. */
export const SHELTER_SPLIT_ABI = [
    'function donate(string memo) payable',
    'function disburse(uint256 amount, string memo)',
    'function disburseWithMemo(uint256 amount, bytes32 memo)',
    'event NativeDisbursed(address indexed shelter, uint256 amount, string memo)',
    'event Disbursed(address indexed shelter, uint256 amount, string memo)',
    'event NativeDisbursementBatch(uint256 indexed batchId, address indexed payer, uint256 amount, uint256 toShelters, uint256 toTreasury, uint256 sheltersPaid, string memo)',
    'event DisbursementBatch(uint256 indexed batchId, address indexed payer, uint256 amount, uint256 toShelters, uint256 toTreasury, uint256 sheltersPaid, string memo)',
    'function token() view returns (address)',
    'function treasury() view returns (address)',
    'function preview(uint256 amount) view returns (address[] wallets, uint256[] amounts, uint256 toTreasury)',
    'function paused() view returns (bool)',
];

export const shelterSplitInterface = new Interface(SHELTER_SPLIT_ABI);

/** The ERC-20 / TIP-20 slice a token treat needs. */
export const erc20Interface = new Interface([
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
]);

/** How long a token treat waits for its approve to be mined before it gives up (nothing is lost). */
export const TREAT_APPROVE_TIMEOUT_MS = 60000;

// keccak256("NativeDisbursed(address,uint256,string)") and keccak256("Disbursed(address,uint256,string)").
export const NATIVE_DISBURSED_TOPIC = '0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef';
export const DISBURSED_TOPIC = '0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a';
/** One per donate(): `amount` is the whole msg.value, shelters' shares plus the treasury remainder. */
export const NATIVE_BATCH_TOPIC = shelterSplitInterface.getEvent('NativeDisbursementBatch')!.topicHash.toLowerCase();
/** One per disburse(): the token twin of NATIVE_BATCH_TOPIC. `payer` is msg.sender (the router for wallet gifts). */
export const TOKEN_BATCH_TOPIC = shelterSplitInterface.getEvent('DisbursementBatch')!.topicHash.toLowerCase();

/**
 * The `payer` of the split's batch event in a receipt (lowercased), or null. Only logs emitted by
 * `split` count, so another contract cannot fake a batch.
 */
export function batchPayerOf(
    logs: readonly { address: string; topics: readonly string[] }[],
    split: string
): string | null {
    for (const log of logs || []) {
        const topic = String(log?.topics?.[0] || '').toLowerCase();
        if (String(log?.address || '').toLowerCase() !== split.toLowerCase()) {
            continue;
        }
        if ((topic === NATIVE_BATCH_TOPIC || topic === TOKEN_BATCH_TOPIC) && log.topics.length >= 3) {
            return ('0x' + String(log.topics[2]).slice(-40)).toLowerCase();
        }
    }
    return null;
}

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
            // cacheTimeout -1: ethers otherwise reuses an identical RPC answer for 250 ms, so two hot-wallet
            // sends in quick succession (a treat, then a match) read the same pending nonce and the second
            // one is refused (NONCE_EXPIRED). Found by the local donation E2E (e2e-donate/stack.sh).
            provider = new JsonRpcProvider(config.rpcUrl!, config.chainId, { staticNetwork: true, cacheTimeout: -1 });
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
        return this.sendSigned(
            config,
            config.splitAddress!,
            shelterSplitInterface.encodeFunctionData('donate', [memo]),
            value,
            onSigned
        );
    }

    /**
     * A treat paid in the split's token (a SHELTER_RELAY_CHAINS entry with `treat` set): the hot wallet
     * pays `ShelterSplit.disburse(amount, memo)`, or `disburseWithMemo(amount, bytes32 memo)` on Tempo,
     * whose TIP-20 payouts carry the memo. Same sign, store, broadcast steps and errors as sendDonation.
     *
     * The split pulls the token from the hot wallet, so the allowance is checked first. When it is short,
     * the hot wallet approves the split for the chain's daily treat budget (at least one treat) and waits
     * for that approve to be mined. A failure there rejects with a plain error: no treat was signed.
     * On Tempo the network fee is paid in a USD stablecoin: the hot wallet's fee-token preference, else
     * the protocol's pathUSD fallback (docs/BACKEND.md).
     */
    async sendTokenDonation(
        config: ShelterOnchainConfig,
        memo: string,
        onSigned: (tx: SignedDonation) => Promise<void> = async () => undefined
    ): Promise<SignedDonation> {
        const treat = config.treat!;
        const split = config.splitAddress!;
        const owner = hotWalletAddress(config);
        if (!owner) {
            throw new Error('no hot wallet key');
        }
        const token = await this.splitToken(config);
        const [allowance] = erc20Interface.decodeFunctionResult(
            'allowance',
            await this.ethCall(config, token, erc20Interface.encodeFunctionData('allowance', [owner, split]))
        );
        if (getBigInt(allowance) < treat.amountBase) {
            const approveFor = treat.dailyBudgetBase > treat.amountBase ? treat.dailyBudgetBase : treat.amountBase;
            let mined = false;
            try {
                const approve = await this.sendSigned(
                    config,
                    token,
                    erc20Interface.encodeFunctionData('approve', [split, approveFor]),
                    getBigInt(0)
                );
                const receipt = await this.waitForReceipt(config, approve.hash, TREAT_APPROVE_TIMEOUT_MS);
                mined = !!receipt && receipt.status === 1;
            } catch (error: any) {
                // Never a DonationBroadcastError: that would make the caller keep the approve's hash
                // as the treat's. The treat itself was not signed.
                throw new Error(`treat approve failed: ${error?.code || error?.name || 'unknown error'}`);
            }
            if (!mined) {
                throw new Error('treat approve not mined');
            }
        }
        const data = treat.memo32
            ? shelterSplitInterface.encodeFunctionData('disburseWithMemo', [
                  treat.amountBase,
                  encodeBytes32String(memo),
              ])
            : shelterSplitInterface.encodeFunctionData('disburse', [treat.amountBase, memo]);
        return this.sendSigned(config, split, data, getBigInt(0), onSigned);
    }

    private tokens = new Map<string, string>();

    /** ShelterSplit.token(), cached per chain and split (it is immutable). */
    async splitToken(config: ShelterOnchainConfig): Promise<string> {
        const key = `${config.chainId}|${String(config.splitAddress).toLowerCase()}`;
        const known = this.tokens.get(key);
        if (known) {
            return known;
        }
        const [token] = shelterSplitInterface.decodeFunctionResult(
            'token',
            await this.ethCall(config, config.splitAddress!, shelterSplitInterface.encodeFunctionData('token', []))
        );
        this.tokens.set(key, String(token));
        return String(token);
    }

    private decimals = new Map<string, number>();

    /** decimals() of `token` on the config's chain, cached (it is immutable for USDC-style tokens). */
    async tokenDecimals(config: ShelterOnchainConfig, token: string): Promise<number> {
        const key = `${config.chainId}|${token.toLowerCase()}`;
        const known = this.decimals.get(key);
        if (known !== undefined) {
            return known;
        }
        const [value] = erc20Interface.decodeFunctionResult(
            'decimals',
            await this.ethCall(config, token, erc20Interface.encodeFunctionData('decimals', []))
        );
        const n = Number(value);
        this.decimals.set(key, n);
        return n;
    }

    /**
     * Any contract call from the hot wallet, with the same sign, store, broadcast steps and the same
     * errors as sendDonation (a refused broadcast is a DonationBroadcastError whose `definite` follows
     * DEFINITE_BROADCAST_REFUSALS). Used by the relay (router.donateWithAuthorization: the hot wallet
     * pays gas only), the match and the flush keeper. Shares the in-process send queue, so it never
     * races a treat for a nonce.
     *
     * `options.config` defaults to the current SHELTER_* environment, so a caller that only knows
     * `(to, data, valueWei)` can duck-type it.
     */
    async sendContractCall(
        to: string,
        data: string,
        valueWei: bigint = getBigInt(0),
        options: { config?: ShelterOnchainConfig; onSigned?: (tx: SignedDonation) => Promise<void> } = {}
    ): Promise<{ txHash: string; nonce: number; from: string }> {
        const tx = await this.sendSigned(options.config || readShelterConfig(), to, data, valueWei, options.onSigned);
        return { txHash: tx.hash, nonce: tx.nonce, from: tx.from };
    }

    private sendSigned(
        config: ShelterOnchainConfig,
        to: string,
        data: string,
        value: bigint,
        onSigned: (tx: SignedDonation) => Promise<void> = async () => undefined
    ): Promise<SignedDonation> {
        const run = async () => {
            const wallet = new Wallet(config.privateKey!, this.provider(config));
            const request = await wallet.populateTransaction({
                to,
                data,
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

    /**
     * `eth_call` as the hot wallet (or `from`), at `latest`. Resolves with the return data; a revert
     * rejects with the ethers CALL_EXCEPTION, whose `data`/`reason` the relay maps to a 400.
     */
    ethCall(config: ShelterOnchainConfig, to: string, data: string, from?: string | null): Promise<string> {
        return this.provider(config).call({ to, data, ...(from ? { from } : {}) });
    }

    /** Waits for one confirmation of `txHash`, at most `timeoutMs`. Null on timeout. */
    waitForReceipt(
        config: ShelterOnchainConfig,
        txHash: string,
        timeoutMs = 60000
    ): Promise<TransactionReceipt | null> {
        return this.provider(config).waitForTransaction(txHash, 1, timeoutMs);
    }

    /** Raw `eth_getLogs` for the router's RouterDonation events, in JSON-RPC shape. */
    getRouterLogs(config: ShelterOnchainConfig, fromBlock: number, toBlock: number): Promise<RpcPayoutLog[]> {
        return this.provider(config).send('eth_getLogs', [
            {
                address: config.routerAddress,
                topics: [[ROUTER_DONATION_TOPIC]],
                fromBlock: '0x' + fromBlock.toString(16),
                toBlock: '0x' + toBlock.toString(16),
            },
        ]);
    }

    /** The router's RouterDonation logs whose indexed `nonce` (topic 3) is `nonce`, in JSON-RPC shape. */
    getRouterLogsByNonce(
        config: ShelterOnchainConfig,
        nonce: string,
        fromBlock: number,
        toBlock: number
    ): Promise<RpcPayoutLog[]> {
        return this.provider(config).send('eth_getLogs', [
            {
                address: config.routerAddress,
                topics: [ROUTER_DONATION_TOPIC, null, null, nonce],
                fromBlock: '0x' + fromBlock.toString(16),
                toBlock: '0x' + toBlock.toString(16),
            },
        ]);
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

    /** The native (gas) balance of `address` in wei. */
    nativeBalance(config: ShelterOnchainConfig, address: string): Promise<bigint> {
        return this.provider(config).getBalance(address);
    }

    blockNumber(config: ShelterOnchainConfig): Promise<number> {
        return this.provider(config).getBlockNumber();
    }

    /** The unix timestamp (seconds) of block `blockNumber`, or null when the node does not have it yet. */
    async blockTimestamp(config: ShelterOnchainConfig, blockNumber: number): Promise<number | null> {
        const block: { timestamp?: string } | null = await this.provider(config).send('eth_getBlockByNumber', [
            '0x' + blockNumber.toString(16),
            false,
        ]);
        const ts = typeof block?.timestamp === 'string' ? Number.parseInt(block.timestamp, 16) : NaN;
        return Number.isSafeInteger(ts) ? ts : null;
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

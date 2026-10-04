import { Injectable } from '@nestjs/common';
import { JsonRpcProvider } from 'ethers';
import { ReceiptLog } from './crypto-evm';

/** The fields of a receipt the checkout reads. */
export interface CheckoutReceipt {
    status: number | null;
    blockNumber: number;
    from: string;
    to: string | null;
    logs: ReceiptLog[];
}

/**
 * Read-only chain access for the crypto checkout: one ethers provider per chain id and RPC URL. No key
 * is ever loaded here. A thin wrapper, so the service specs replace it with a fake.
 */
@Injectable()
export class CryptoChainReader {
    private providers = new Map<string, JsonRpcProvider>();

    private provider(chainId: number, rpcUrl: string): JsonRpcProvider {
        const key = `${chainId}|${rpcUrl}`;
        let provider = this.providers.get(key);
        if (!provider) {
            provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true, cacheTimeout: -1 });
            this.providers.set(key, provider);
        }
        return provider;
    }

    /** The receipt, or null while the transaction is not mined (or unknown to the node). */
    async receipt(chainId: number, rpcUrl: string, txHash: string): Promise<CheckoutReceipt | null> {
        const receipt = await this.provider(chainId, rpcUrl).getTransactionReceipt(txHash);
        if (!receipt) {
            return null;
        }
        return {
            status: receipt.status,
            blockNumber: receipt.blockNumber,
            from: String(receipt.from || '').toLowerCase(),
            to: receipt.to ? String(receipt.to).toLowerCase() : null,
            logs: receipt.logs.map(log => ({ address: log.address, topics: [...log.topics], data: log.data })),
        };
    }

    blockNumber(chainId: number, rpcUrl: string): Promise<number> {
        return this.provider(chainId, rpcUrl).getBlockNumber();
    }

    /** Unix seconds of `blockNumber`, or null when the node does not have it yet. */
    async blockTime(chainId: number, rpcUrl: string, blockNumber: number): Promise<number | null> {
        const block = await this.provider(chainId, rpcUrl).getBlock(blockNumber);
        return block ? Number(block.timestamp) : null;
    }
}

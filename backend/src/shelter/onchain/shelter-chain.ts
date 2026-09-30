import { Injectable } from '@nestjs/common';
import { Interface, JsonRpcProvider, TransactionReceipt, Wallet } from 'ethers';
import { ShelterOnchainConfig } from './shelter-onchain.config';

/** The slice of ShelterSplit this backend uses. */
export const SHELTER_SPLIT_ABI = [
    'function donate(string memo) payable',
    'function disburse(uint256 amount, string memo)',
    'event NativeDisbursed(address indexed shelter, uint256 amount, string memo)',
    'event Disbursed(address indexed shelter, uint256 amount, string memo)',
];

export const shelterSplitInterface = new Interface(SHELTER_SPLIT_ABI);

// keccak256("NativeDisbursed(address,uint256,string)") and keccak256("Disbursed(address,uint256,string)").
export const NATIVE_DISBURSED_TOPIC = '0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef';
export const DISBURSED_TOPIC = '0x53e1c69daf8c00e0990d33cc076fc3c88a0c480beb39da2bcffa01252f63495a';

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

    /** Calls ShelterSplit.donate(memo) from the hot wallet and resolves with the tx hash once broadcast. */
    sendDonation(config: ShelterOnchainConfig, memo: string, value: bigint): Promise<string> {
        const run = async () => {
            const wallet = new Wallet(config.privateKey!, this.provider(config));
            const tx = await wallet.sendTransaction({
                to: config.splitAddress!,
                data: shelterSplitInterface.encodeFunctionData('donate', [memo]),
                value,
                chainId: config.chainId,
            });
            return tx.hash;
        };
        const result = this.sendQueue.then(run, run);
        this.sendQueue = result.catch(() => undefined);
        return result;
    }

    getReceipt(config: ShelterOnchainConfig, txHash: string): Promise<TransactionReceipt | null> {
        return this.provider(config).getTransactionReceipt(txHash);
    }
}

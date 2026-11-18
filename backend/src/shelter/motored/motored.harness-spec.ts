// Test harness for the Motored × Stripe specs. The name ends in `-spec.ts`, so tsconfig.build.json leaves
// it out of dist and jest does not run it. Mongo models and the chain are fakes: nothing touches a network.
import { shelterSplitInterface } from '../onchain/shelter-chain';
import { MOTORED_SHELTER } from './motored.config';
import { MotoredGiftService } from './motored-gift.service';
import { MotoredStripeService } from './motored-stripe.service';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';

export const M_WH = 'whsec_motored_test';
export const M_KEK = '0123456789abcdef';
/** Anvil test key 1 (any valid key works). */
export const M_FUNDER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const M_T0 = new Date('2026-11-12T12:00:00Z');

/** Motored ready: test mode, Arc testnet shelter, every secret set. */
export const M_ENV: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    MOTORED_STRIPE_WEBHOOK_SECRET: M_WH,
    MOTORED_FUNDER_KEY: M_FUNDER_KEY,
    MOTORED_WALLET_KEK: M_KEK,
    MOTORED_CUSTOMER_SALT: 'motored-customer-salt-spec',
    MOTORED_AMOUNT_SALT: 'motored-amount-salt-spec',
    MOTORED_DAILY_CAP_USD: '50',
    SHELTER_CHAIN_ID: '5042002',
};

/** Production: live webhook, Arc mainnet shelter (test-mode events are ignored there). */
export const M_ENV_PROD: NodeJS.ProcessEnv = {
    ...M_ENV,
    NODE_ENV: 'production',
    SHELTER_CHAIN_ID: '5042',
};

export const WEI_PER_USD = 10n ** 18n;

export interface FakeChain {
    gasPrice: jest.Mock;
    sendContractCall: jest.Mock;
    waitForReceipt: jest.Mock;
    sendDonation: jest.Mock;
    getReceipt: jest.Mock;
    minedNonce: jest.Mock;
    nativeBalance: jest.Mock;
    ethCall: jest.Mock;
}

/** A chain that is ready by default: paused=false, and the split pays 100% to Pink Paw. */
export function fakeChain(): FakeChain {
    return {
        gasPrice: jest.fn(async () => 1000000000n),
        // Like the real chain: sign, call onSigned(tx) so the caller stores the hash BEFORE broadcast, then return.
        sendContractCall: jest.fn(async (_to: string, _data: string, _value: bigint, options: any) => {
            const tx = { hash: '0x' + 'a'.repeat(64), nonce: 1, from: '0xfunder' };
            await options?.onSigned?.(tx);
            return { txHash: tx.hash, nonce: tx.nonce, from: tx.from };
        }),
        waitForReceipt: jest.fn(async () => ({ status: 1 })),
        sendDonation: jest.fn(async (_config: any, _memo: string, _value: bigint, onSigned: any) => {
            const tx = { hash: '0x' + 'b'.repeat(64), nonce: 2, from: '0xwallet' };
            await onSigned?.(tx);
            return tx;
        }),
        getReceipt: jest.fn(async () => null),
        minedNonce: jest.fn(async () => 0),
        nativeBalance: jest.fn(async () => 100n * WEI_PER_USD),
        ethCall: jest.fn(async (_config: any, _to: string, data: string) => {
            if (data.startsWith(shelterSplitInterface.getFunction('paused')!.selector)) {
                return shelterSplitInterface.encodeFunctionResult('paused', [false]);
            }
            return shelterSplitInterface.encodeFunctionResult('preview', [[MOTORED_SHELTER], [WEI_PER_USD], 0n]);
        }),
    };
}

export interface MotoredHarness {
    wallets: any;
    gifts: any;
    chain: FakeChain;
    giftService: MotoredGiftService;
    webhooks: MotoredStripeService;
}

export function motoredHarness(env: NodeJS.ProcessEnv = M_ENV): MotoredHarness {
    const now = () => new Date(M_T0);
    const wallets: any = memoryModel({ unique: [['customerKey'], ['n']], now });
    const gifts: any = memoryModel({ unique: [['paymentKey']], now });
    const chain: FakeChain = fakeChain();
    const giftService = new MotoredGiftService(gifts, wallets, chain as any);
    giftService.env = env;
    const webhooks = new MotoredStripeService(wallets, gifts, giftService);
    webhooks.env = env;
    jest.spyOn(giftService, 'kick').mockImplementation(() => undefined);
    return { wallets, gifts, chain, giftService, webhooks };
}

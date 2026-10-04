import { readFileSync } from 'fs';
import { join } from 'path';
import {
    TOKEN_TAILS_HELD_WALLETS,
    readShelterConfig,
    readRelayChainConfigs,
    readShelterConfigs,
    readTryShelterConfig,
    shelterConfigFor,
} from './shelter-onchain.config';

const KEY_MAIN = 'main-key';
const KEY_TRY = 'try-key';
const ROUTER = '0x' + '11'.repeat(20);
const SPLIT = '0x' + '22'.repeat(20);

const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    SHELTER_CHAIN_ID: '5042',
    SHELTER_DONATE_PRIVATE_KEY: KEY_MAIN,
    SHELTER_RELAY_ENABLED: 'true',
    SHELTER_DONATE_ENABLED: 'true',
    SHELTER_X402_ENABLED: 'true',
    SHELTER_HANDED_OVER: 'true',
    SHELTER_CLAIM_ALLOWED_WALLETS: '0x' + '33'.repeat(20),
    ...extra,
});

describe('readTryShelterConfig (the try-it testnet)', () => {
    it('is null unless SHELTER_TRY_CHAIN_ID names a known testnet other than the main chain', () => {
        expect(readTryShelterConfig(env())).toBeNull();
        expect(readTryShelterConfig(env({ SHELTER_TRY_CHAIN_ID: '8453' }))).toBeNull(); // Base mainnet
        expect(readTryShelterConfig(env({ SHELTER_TRY_CHAIN_ID: 'abc' }))).toBeNull();
        expect(readTryShelterConfig(env({ SHELTER_CHAIN_ID: '5042002', SHELTER_TRY_CHAIN_ID: '5042002' }))).toBeNull();
    });

    it('takes its own router, split and key, never the main hot wallet key, and sends no treats', () => {
        const c = readTryShelterConfig(
            env({
                SHELTER_TRY_CHAIN_ID: '5042002',
                SHELTER_TRY_ROUTER_ADDRESS: ROUTER,
                SHELTER_TRY_SPLIT_ADDRESS: SPLIT,
                SHELTER_TRY_RELAY_ENABLED: 'true',
                SHELTER_TRY_MATCH_ENABLED: 'true',
            })
        );
        expect(c).toMatchObject({
            chainId: 5042002,
            rpcUrl: 'https://rpc.testnet.arc.io',
            relayEnabled: true,
            matchEnabled: true,
            donateEnabled: false,
            x402Enabled: false,
            handedOver: false,
            claimAllowedWallets: [],
            privateKey: null,
        });
        expect(c?.routerAddress?.toLowerCase()).toBe(ROUTER);
        expect(c?.splitAddress?.toLowerCase()).toBe(SPLIT);
        const withKey = readTryShelterConfig(
            env({ SHELTER_TRY_CHAIN_ID: '5042002', SHELTER_TRY_PRIVATE_KEY: KEY_TRY })
        );
        expect(withKey?.privateKey).toBe(KEY_TRY);
        // Relay and match stay off on the testnet unless their own flags say so.
        expect(readTryShelterConfig(env({ SHELTER_TRY_CHAIN_ID: '5042002' }))).toMatchObject({
            relayEnabled: false,
            matchEnabled: false,
        });
    });

    it('routes a chain id to the main or the try-it config, and nothing else', () => {
        const e = env({ SHELTER_TRY_CHAIN_ID: '5042002' });
        expect(readShelterConfigs(e).map(c => c.chainId)).toEqual([5042, 5042002]);
        expect(shelterConfigFor(5042, e)?.chainId).toBe(5042);
        expect(shelterConfigFor(5042002, e)?.chainId).toBe(5042002);
        expect(shelterConfigFor(84532, e)).toBeNull();
        expect(readShelterConfigs(env()).map(c => c.chainId)).toEqual([readShelterConfig(env()).chainId]);
    });
});

describe('readRelayChainConfigs (multi-chain relay, SHELTER_RELAY_CHAINS)', () => {
    const HEX_MAIN = '0x' + 'a1'.repeat(32);
    const HEX_HOT = '0x' + 'b2'.repeat(32);
    const ROUTER_B = '0x' + '55'.repeat(20);

    it('adds nothing by default: production keeps the single Arc config', () => {
        expect(readRelayChainConfigs(env())).toEqual([]);
        expect(readShelterConfigs(env()).map(c => c.chainId)).toEqual([5042]);
        expect(shelterConfigFor(84532, env())).toBeNull();
    });

    it('reads rpc, split, router, key env name and daily budget per chain, after the main and try-it chains', () => {
        const e = env({
            SHELTER_TRY_CHAIN_ID: '5042002',
            SHELTER_RELAY_CHAINS: '84532, 421614, 5042, 5042002, 84532, junk, -1',
            SHELTER_CHAIN_84532_SPLIT_ADDRESS: SPLIT,
            SHELTER_CHAIN_84532_ROUTER_ADDRESS: ROUTER_B,
            SHELTER_CHAIN_84532_ROUTER_FROM_BLOCK: '123',
            SHELTER_CHAIN_84532_KEY_ENV: 'SHELTER_DONATEHOT_KEY',
            SHELTER_DONATEHOT_KEY: HEX_HOT,
            SHELTER_CHAIN_84532_RELAY_ENABLED: 'true',
            SHELTER_CHAIN_84532_RELAY_DAILY_TX: '7',
            SHELTER_CHAIN_421614_RPC_URL: 'https://arb.example/rpc',
        });
        const list = readRelayChainConfigs(e);
        // The main chain and the try-it testnet are never repeated; duplicates and junk are dropped.
        expect(list.map(c => c.chainId)).toEqual([84532, 421614]);
        expect(readShelterConfigs(e).map(c => c.chainId)).toEqual([5042, 5042002, 84532, 421614]);
        const base = list[0];
        expect(base).toMatchObject({
            chainId: 84532,
            rpcUrl: 'https://sepolia.base.org',
            privateKey: HEX_HOT,
            relayEnabled: true,
            relayDailyTx: 7,
            routerFromBlock: 123,
            matchEnabled: false,
            donateEnabled: false,
            x402Enabled: false,
            handedOver: false,
            claimAllowedWallets: [],
        });
        expect(base.routerAddress?.toLowerCase()).toBe(ROUTER_B);
        expect(base.splitAddress?.toLowerCase()).toBe(SPLIT);
        // Unconfigured: off, no key, the chain's own RPC when given.
        expect(list[1]).toMatchObject({
            chainId: 421614,
            rpcUrl: 'https://arb.example/rpc',
            privateKey: null,
            relayEnabled: false,
            routerAddress: null,
            relayDailyTx: 50,
        });
        expect(shelterConfigFor(84532, e)?.privateKey).toBe(HEX_HOT);
        expect(shelterConfigFor(421614, e)?.chainId).toBe(421614);
    });

    it('never lets a testnet sign with the main hot wallet key, and ignores malformed key env names and keys', () => {
        const common = { SHELTER_DONATE_PRIVATE_KEY: HEX_MAIN, SHELTER_RELAY_CHAINS: '84532' };
        expect(
            readRelayChainConfigs(env({ ...common, SHELTER_CHAIN_84532_KEY_ENV: 'SHELTER_DONATE_PRIVATE_KEY' }))[0]
                .privateKey
        ).toBeNull();
        expect(
            readRelayChainConfigs(
                env({ ...common, SHELTER_CHAIN_84532_KEY_ENV: 'lower-case', 'lower-case': HEX_HOT })
            )[0].privateKey
        ).toBeNull();
        expect(
            readRelayChainConfigs(env({ ...common, SHELTER_CHAIN_84532_KEY_ENV: 'HOT', HOT: 'not-a-key' }))[0]
                .privateKey
        ).toBeNull();
        // A mainnet entry may share the main hot wallet (gas on several chains) and follows the handover flag.
        const main = readRelayChainConfigs(
            env({ ...common, SHELTER_RELAY_CHAINS: '8453', SHELTER_CHAIN_8453_KEY_ENV: 'SHELTER_DONATE_PRIVATE_KEY' })
        )[0];
        expect(main).toMatchObject({
            chainId: 8453,
            privateKey: HEX_MAIN,
            handedOver: true,
            rpcUrl: 'https://mainnet.base.org',
        });
        expect(
            readRelayChainConfigs(env({ ...common, SHELTER_HANDED_OVER: 'false', SHELTER_RELAY_CHAINS: '8453' }))[0]
                .handedOver
        ).toBe(false);
    });

    it('knows a public RPC for all six chains, mainnet and testnet', () => {
        const ids = [5042, 5042002, 4217, 42431, 42161, 421614, 43114, 43113, 8453, 84532, 4663, 46630];
        const list = readRelayChainConfigs(env({ SHELTER_CHAIN_ID: '1', SHELTER_RELAY_CHAINS: ids.join(',') }));
        expect(list.map(c => c.chainId)).toEqual(ids);
        for (const c of list) {
            expect(c.rpcUrl).toMatch(/^https:\/\//);
        }
    });
});

describe('TOKEN_TAILS_HELD_WALLETS (wallets Token Tails holds for a shelter)', () => {
    it('matches the client copy in giveMode.ts and is always in config.heldWallets', () => {
        const client = readFileSync(
            join(__dirname, '../../../../client/components/shelter-payouts/giveMode.ts'),
            'utf8'
        ) as string;
        const m = /TOKEN_TAILS_HELD_WALLETS[^=]*=\s*\[([^\]]*)\]/.exec(client);
        expect(m).not.toBeNull();
        const clientList = (m![1].match(/0x[0-9a-fA-F]{40}/g) || []).map(a => a.toLowerCase());
        expect([...TOKEN_TAILS_HELD_WALLETS].sort()).toEqual(clientList.sort());
        const extra = '0x' + '44'.repeat(20);
        const config = readShelterConfig(
            env({ SHELTER_HELD_WALLETS: `${extra.toUpperCase().replace('0X', '0x')}, junk` })
        );
        expect(config.heldWallets).toEqual([...TOKEN_TAILS_HELD_WALLETS, extra]);
    });
});

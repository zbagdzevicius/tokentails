import { readFileSync } from 'fs';
import { join } from 'path';
import {
    TOKEN_TAILS_HELD_WALLETS,
    readShelterConfig,
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

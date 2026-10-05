import { readFileSync } from 'fs';
import { join } from 'path';
import {
    TOKEN_TAILS_HELD_WALLETS,
    decimalToBase,
    explorerTxUrl,
    isTestnetChain,
    publicRpcUrl,
    x402Ready,
    readShelterConfig,
    readRelayChainConfigs,
    readShelterConfigs,
    readTryShelterConfig,
    shelterConfigFor,
    autoChainIds,
    chainList,
    logRpcFor,
    recordedSplit,
} from './shelter-onchain.config';
import { getAddress } from 'ethers';
import { CHAINS, WALLETS } from './wallet.config';

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
        // BE-6: the mainnet main key pasted as the try key is refused (one-wallet plan: same address).
        expect(
            readTryShelterConfig(env({ SHELTER_TRY_CHAIN_ID: '5042002', SHELTER_TRY_PRIVATE_KEY: KEY_MAIN }))
                ?.privateKey
        ).toBeNull();
        // A testnet main chain's key holds test funds only and may serve the try-it testnet.
        expect(
            readTryShelterConfig(
                env({ SHELTER_CHAIN_ID: '84532', SHELTER_TRY_CHAIN_ID: '5042002', SHELTER_TRY_PRIVATE_KEY: KEY_MAIN })
            )?.privateKey
        ).toBe(KEY_MAIN);
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

describe('SHELTER_CHAIN_<id>_TREAT_* (treats on a picked network)', () => {
    const HEX_A = '0x' + 'ab'.repeat(32);
    const HEX_B = '0x' + 'cd'.repeat(32);

    it('is off by default: no treat flag, the main chain amount is not reused', () => {
        const [c] = readRelayChainConfigs(env({ SHELTER_RELAY_CHAINS: '84532' }));
        expect(c.donateEnabled).toBe(false);
        expect(c.treat).toMatchObject({ amountBase: BigInt(10000), dailyBudgetBase: BigInt(1000000), coin: 'USDC' });
        expect(c.amountWei).toBe(BigInt('10000000000000000'));
        expect(readShelterConfig(env()).treat).toBeUndefined();
    });

    it('reads the flag, amount, budget and coin; scales amounts to 18 decimals; Tempo pays with a bytes32 memo', () => {
        const list = readRelayChainConfigs(
            env({
                SHELTER_RELAY_CHAINS: '4217,4663,42161',
                SHELTER_CHAIN_4217_TREAT_ENABLED: 'true',
                SHELTER_CHAIN_4217_TREAT_AMOUNT: '0.05',
                SHELTER_CHAIN_4217_TREAT_DAILY_BUDGET: '2.5',
                SHELTER_CHAIN_4663_TREAT_ENABLED: 'TRUE',
                SHELTER_CHAIN_42161_TREAT_ENABLED: 'yes',
                SHELTER_CHAIN_42161_TREAT_AMOUNT: 'junk',
                SHELTER_CHAIN_42161_TREAT_COIN: 'USD<script>',
            })
        );
        expect(list[0]).toMatchObject({ chainId: 4217, donateEnabled: true });
        expect(list[0].treat).toEqual({
            amountBase: BigInt(50000),
            dailyBudgetBase: BigInt(2500000),
            decimals: 6,
            coin: 'USDC.e',
            memo32: true,
        });
        expect(list[0].amountWei).toBe(BigInt('50000000000000000'));
        expect(list[0].dailyBudgetWei).toBe(BigInt('2500000000000000000'));
        expect(list[1]).toMatchObject({ chainId: 4663, donateEnabled: true });
        expect(list[1].treat).toMatchObject({ coin: 'USDG', memo32: false });
        // Only 'true' turns it on; a malformed amount falls back; a bad coin label is not used.
        expect(list[2]).toMatchObject({ chainId: 42161, donateEnabled: false });
        expect(list[2].treat).toMatchObject({ amountBase: BigInt(10000), coin: 'USDC' });
    });

    it('lets a testnet entry share the main key only when the main chain is a testnet too', () => {
        const common = {
            SHELTER_DONATE_PRIVATE_KEY: HEX_A,
            SHELTER_RELAY_CHAINS: '84532',
            SHELTER_CHAIN_84532_KEY_ENV: 'SHELTER_DONATE_PRIVATE_KEY',
        };
        expect(readRelayChainConfigs(env(common))[0].privateKey).toBeNull();
        expect(readRelayChainConfigs(env({ ...common, SHELTER_CHAIN_ID: '5042002' }))[0].privateKey).toBe(HEX_A);
        expect(
            readRelayChainConfigs(
                env({ ...common, SHELTER_CHAIN_84532_KEY_ENV: 'SHELTER_DONATEHOT_KEY', SHELTER_DONATEHOT_KEY: HEX_B })
            )[0].privateKey
        ).toBe(HEX_B);
    });

    it('links each served chain to its own explorer', () => {
        const h = '0x' + 'e'.repeat(64);
        expect(explorerTxUrl(h, 84532)).toBe(`https://sepolia.basescan.org/tx/${h}`);
        expect(explorerTxUrl(h, 42431)).toBe(`https://explore.testnet.tempo.xyz/tx/${h}`);
        expect(explorerTxUrl(h, 4663)).toBe(`https://robinhoodchain.blockscout.com/tx/${h}`);
        expect(explorerTxUrl(h, 5042)).toBe(`https://explorer.arc.io/tx/${h}`);
    });
});

describe('per-chain x402 and Monad defaults', () => {
    it('reads SHELTER_CHAIN_<id>_X402_ENABLED (default off on an override chain) and _X402_PRICE (default 0.01)', () => {
        const [on, off] = readRelayChainConfigs({
            SHELTER_CHAIN_ID: '5042002',
            SHELTER_AUTO_CHAINS: 'off',
            SHELTER_RELAY_CHAINS: '10143,84532',
            SHELTER_CHAIN_10143_SPLIT_ADDRESS: '0x' + '4'.repeat(40),
            SHELTER_CHAIN_10143_X402_ENABLED: 'true',
            SHELTER_CHAIN_10143_X402_PRICE: '0.05',
            SHELTER_CHAIN_84532_SPLIT_ADDRESS: '0x' + '5'.repeat(40),
            SHELTER_CHAIN_84532_X402_PRICE: 'abc',
        } as any);
        expect(on).toMatchObject({
            chainId: 10143,
            x402Enabled: true,
            x402Price: '0.05',
            rpcUrl: 'https://testnet-rpc.monad.xyz',
        });
        expect(x402Ready(on)).toBe(true);
        expect(off).toMatchObject({ chainId: 84532, x402Enabled: false, x402Price: '0.01' });
        expect(x402Ready(off)).toBe(false);
    });

    it('knows Monad mainnet and testnet RPCs and explorers', () => {
        expect(publicRpcUrl(143)).toBe('https://rpc.monad.xyz');
        expect(publicRpcUrl(10143)).toBe('https://testnet-rpc.monad.xyz');
        expect(explorerTxUrl('0xabc', 143)).toBe('https://monadvision.com/tx/0xabc');
        expect(explorerTxUrl('0xabc', 10143)).toBe('https://testnet.monadvision.com/tx/0xabc');
        expect(isTestnetChain(10143)).toBe(true);
        expect(isTestnetChain(143)).toBe(false);
    });

    it('decimalToBase scales by the coin decimals and refuses what cannot be paid exactly', () => {
        expect(decimalToBase('0.01', 6)).toBe(BigInt(10000));
        expect(decimalToBase('0.01', 18)).toBe(BigInt('10000000000000000'));
        expect(decimalToBase('2', 6)).toBe(BigInt(2000000));
        expect(decimalToBase('0.0000001', 6)).toBeNull();
        expect(decimalToBase('0.0100', 2)).toBe(BigInt(1));
        expect(decimalToBase('x', 6)).toBeNull();
    });
});

describe('zero config: every wallet.config.ts chain of the main chain class', () => {
    // A real-format key: the defaults hand it to the other chains of the main chain's class.
    const HOT = '0x' + '5a'.repeat(32);
    const testnetMain = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
        SHELTER_CHAIN_ID: '5042002',
        SHELTER_DONATE_PRIVATE_KEY: HOT,
        SHELTER_DONATE_ENABLED: 'true',
        ...extra,
    });
    const ids = (e: NodeJS.ProcessEnv) =>
        readRelayChainConfigs(e)
            .map(c => c.chainId)
            .sort((a, b) => a - b);

    it('lists every other chain with a split of the main class, and nothing on a mainnet main chain today', () => {
        expect(ids(testnetMain())).toEqual([10143, 42431, 43113, 46630, 84532, 421614]);
        expect(autoChainIds(5042002).sort((a, b) => a - b)).toEqual([10143, 42431, 43113, 46630, 84532, 421614]);
        // Production: mainnet main chain, no mainnet split recorded yet: nothing changes.
        expect(readRelayChainConfigs(env())).toEqual([]);
        expect(autoChainIds(5042)).toEqual([]);
    });

    it('defaults split, router, treasury and key from wallet.config.ts; on by default', () => {
        const base = readRelayChainConfigs(testnetMain()).find(c => c.chainId === 84532)!;
        const recorded = recordedSplit(84532)!;
        expect(base).toMatchObject({
            splitAddress: getAddress(recorded.address),
            routerAddress: getAddress(recorded.router!),
            routerFromBlock: recorded.routerFromBlock,
            treasuryAddress: getAddress(WALLETS.testnet.treasury!),
            privateKey: HOT,
            donateEnabled: true,
            relayEnabled: false,
            matchEnabled: false,
            splitDeployTx: recorded.tx,
        });
        expect(base.disabledReason).toBeUndefined();
        expect(base.treat!.coin).toBe('USDC');
        // Both are on by default; 'false' is the emergency off.
        expect(base.x402Enabled).toBe(true);
        const off = readRelayChainConfigs(testnetMain({ SHELTER_DONATE_ENABLED: 'false' }));
        const robinhood = off.find(c => c.chainId === 46630)!;
        expect(robinhood).toMatchObject({ x402Enabled: true, donateEnabled: false });
        expect(readRelayChainConfigs(testnetMain({ SHELTER_X402_ENABLED: 'false' }))[0].x402Enabled).toBe(false);
        expect(robinhood.treat!.coin).toBe('mUSDC');
    });

    it('per-chain variables still override; one chain can be switched off', () => {
        const all = readRelayChainConfigs(
            testnetMain({
                SHELTER_CHAIN_84532_SPLIT_ADDRESS: SPLIT,
                SHELTER_CHAIN_43113_TREAT_ENABLED: 'false',
            })
        );
        expect(all.find(c => c.chainId === 84532)).toMatchObject({
            splitAddress: getAddress(SPLIT),
            routerAddress: null,
        });
        expect(all.find(c => c.chainId === 43113)!.donateEnabled).toBe(false);
    });

    it('without the key every chain is listed disabled with its reason', () => {
        const all = readRelayChainConfigs(testnetMain({ SHELTER_DONATE_PRIVATE_KEY: '' }));
        expect(all.every(c => c.privateKey === null && /SHELTER_DONATE_PRIVATE_KEY/.test(c.disabledReason || ''))).toBe(
            true
        );
    });

    it('SHELTER_RELAY_CHAINS-only entries keep their per-chain variables only (no defaults, never cross-class)', () => {
        const [base] = readRelayChainConfigs({
            ...env(),
            SHELTER_DONATE_PRIVATE_KEY: HOT,
            SHELTER_RELAY_CHAINS: '84532',
        });
        expect(base).toMatchObject({ splitAddress: null, routerAddress: null, privateKey: null, donateEnabled: false });
    });

    it('chainList parses lists', () => {
        expect(chainList(' 1, 2,x,0 ')).toEqual([1, 2]);
    });

    it('the RPC, log RPC and explorer tables come from wallet.config.ts', () => {
        for (const c of Object.values(CHAINS)) {
            expect(publicRpcUrl(c.chainId)).toBe(c.rpc);
            expect(explorerTxUrl('0xab', c.chainId)).toBe(`${c.explorer}/tx/0xab`);
        }
        expect(logRpcFor({ chainId: 10143, rpcUrl: 'https://testnet-rpc.monad.xyz' })).toEqual({
            url: 'https://monad-testnet.api.onfinality.io/public',
            maxRange: 10000,
        });
        expect(logRpcFor({ chainId: 10143, rpcUrl: 'https://paid.example/rpc' })).toEqual({
            url: 'https://paid.example/rpc',
            maxRange: null,
        });
    });
});

describe('stale KEY_ENV', () => {
    it('falls back to SHELTER_DONATE_PRIVATE_KEY on a same-class chain instead of closing it', () => {
        const key = '0x' + '11'.repeat(32);
        const out = readRelayChainConfigs({
            SHELTER_CHAIN_ID: '5042002',
            SHELTER_DONATE_PRIVATE_KEY: key,
            SHELTER_RELAY_CHAINS: '421614',
            SHELTER_CHAIN_421614_KEY_ENV: 'SHELTER_DONATEHOT_KEY',
        });
        expect(out.find(c => c.chainId === 421614)?.privateKey).toBe(key);
    });
});

describe('relay chain listed without KEY_ENV', () => {
    it('signs with SHELTER_DONATE_PRIVATE_KEY on a same-class chain even with SHELTER_AUTO_CHAINS=off', () => {
        const key = '0x' + '22'.repeat(32);
        const out = readRelayChainConfigs({
            SHELTER_CHAIN_ID: '5042002',
            SHELTER_DONATE_PRIVATE_KEY: key,
            SHELTER_AUTO_CHAINS: 'off',
            SHELTER_RELAY_CHAINS: '84532',
            SHELTER_CHAIN_84532_SPLIT_ADDRESS: '0x8bf026d3816cb2344d14aa6301fccde3b289878c',
        });
        expect(out.find(c => c.chainId === 84532)?.privateKey).toBe(key);
    });
    it('never lends a mainnet key to a testnet', () => {
        const key = '0x' + '33'.repeat(32);
        const out = readRelayChainConfigs({
            SHELTER_CHAIN_ID: '5042',
            SHELTER_DONATE_PRIVATE_KEY: key,
            SHELTER_RELAY_CHAINS: '84532',
            SHELTER_CHAIN_84532_SPLIT_ADDRESS: '0x8bf026d3816cb2344d14aa6301fccde3b289878c',
        });
        expect(out.find(c => c.chainId === 84532)?.privateKey ?? null).toBeNull();
    });
});

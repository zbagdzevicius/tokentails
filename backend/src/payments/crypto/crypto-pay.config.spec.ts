import { TOKEN_TAILS_HELD_WALLETS } from 'src/shelter/onchain/shelter-onchain.config';
import { EURC_FX_MAX_AGE_DAYS, formatMicro, parsePerUsdMicro, readCryptoPayConfig } from './crypto-pay.config';

const TREASURY = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const SPLIT = '0x1111111111111111111111111111111111111111';
const LOCAL_USDC = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
/** Configured (vetted) RPCs for every mainnet the checkout lists. */
const MAINNET_RPCS = {
    CRYPTO_PAY_RPC_4217: 'http://tempo.example',
    CRYPTO_PAY_RPC_5042: 'http://arc.example',
    CRYPTO_PAY_RPC_8453: 'http://base.example',
    CRYPTO_PAY_RPC_42161: 'http://arbitrum.example',
    CRYPTO_PAY_RPC_43114: 'http://avalanche.example',
    CRYPTO_PAY_RPC_4663: 'http://robinhood.example',
    CRYPTO_PAY_RPC_143: 'http://monad.example',
};

describe('readCryptoPayConfig', () => {
    it('is off with no chain receiving anything by default', () => {
        const cfg = readCryptoPayConfig({ NODE_ENV: 'production', ...MAINNET_RPCS });
        expect(cfg.enabled).toBe(false);
        expect(cfg.network).toBe('mainnet');
        // No treasury address is checked in yet.
        expect(cfg.chains.every(c => c.treasury === null)).toBe(true);
        expect(cfg.shelterShareEnabled).toBe(false);
        // Founder, 2026-10-04: Pink Paw gets 50% of each $5 shelter cat unless the env overrides it.
        expect(cfg.catShelterBps).toBe(5000);
    });

    it('offers every mainnet with no RPC env at all (official RPCs are checked in)', () => {
        const cfg = readCryptoPayConfig({ NODE_ENV: 'production', CRYPTO_PAY_TREASURY: TREASURY });
        expect(cfg.chains.map(c => c.chain.chainId).sort((a, b) => a - b)).toEqual([
            143, 4217, 4663, 5042, 8453, 42161, 43114,
        ]);
        expect(cfg.chains.every(c => c.rpcUrl.startsWith('https://'))).toBe(true);
    });

    it('lists mainnets in production and testnets otherwise, never both', () => {
        const main = readCryptoPayConfig({ NODE_ENV: 'production', CRYPTO_PAY_TREASURY: TREASURY, ...MAINNET_RPCS });
        expect(main.chains.map(c => c.chain.chainId).sort((a, b) => a - b)).toEqual([
            143, 4217, 4663, 5042, 8453, 42161, 43114,
        ]);
        const test = readCryptoPayConfig({ NODE_ENV: 'development', CRYPTO_PAY_TREASURY: TREASURY });
        expect(test.network).toBe('testnet');
        expect(test.chains.length).toBeGreaterThan(0);
        expect(test.chains.every(c => c.chain.testnet)).toBe(true);
    });

    it('never sells on test networks in production unless CRYPTO_PAY_ALLOW_TESTNET_IN_PROD is also set', () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const local = { CRYPTO_PAY_LOCAL_USDC: LOCAL_USDC, CRYPTO_PAY_RPC_31337: 'http://127.0.0.1:8545' };
        const refused = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_NETWORK: 'testnet',
            ...MAINNET_RPCS,
            ...local,
        });
        expect(refused.network).toBe('mainnet');
        expect(refused.chains.every(c => !c.chain.testnet)).toBe(true);
        const allowed = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_NETWORK: 'testnet',
            CRYPTO_PAY_ALLOW_TESTNET_IN_PROD: 'true',
            ...local,
        });
        expect(allowed.network).toBe('testnet');
        expect(allowed.chains.every(c => c.chain.testnet)).toBe(true);
        // The local anvil chain never, even then.
        expect(allowed.chains.some(c => c.chain.chainId === 31337)).toBe(false);
        jest.restoreAllMocks();
    });

    it('takes a per-chain treasury over the shared one, and RPC from CRYPTO_PAY_RPC_<id>, then the funding var, then the checked-in official RPC', () => {
        const other = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
        const cfg = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_TREASURY: TREASURY,
            CRYPTO_PAY_TREASURY_8453: other,
            CRYPTO_PAY_RPC_8453: 'http://base.example',
            RPC_ARC_MAINNET: 'http://arc.example',
        });
        const base = cfg.chains.find(c => c.chain.chainId === 8453)!;
        expect(base.treasury).toBe(other);
        expect(base.rpcUrl).toBe('http://base.example');
        expect(cfg.chains.find(c => c.chain.chainId === 5042)!.rpcUrl).toBe('http://arc.example');
        // Arbitrum has no env RPC: it uses the checked-in official endpoint.
        expect(cfg.chains.find(c => c.chain.chainId === 42161)!.rpcUrl).toBe('https://arb1.arbitrum.io/rpc');
        // A test network may use its public RPC.
        const testnet = readCryptoPayConfig({ NODE_ENV: 'development', CRYPTO_PAY_TREASURY: TREASURY });
        expect(testnet.chains.find(c => c.chain.chainId === 421614)!.rpcUrl).toMatch(/^https:/);
    });

    it('never uses a wallet Token Tails holds for a shelter as a treasury (custody rule)', () => {
        const cfg = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_TREASURY: TOKEN_TAILS_HELD_WALLETS[0],
            ...MAINNET_RPCS,
        });
        expect(cfg.chains.every(c => c.treasury === null)).toBe(true);
        const extra = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_TREASURY: TREASURY,
            SHELTER_HELD_WALLETS: TREASURY.toLowerCase(),
            ...MAINNET_RPCS,
        });
        expect(extra.chains.every(c => c.treasury === null)).toBe(true);
    });

    it('offers the Robinhood testnet mock token (mUSDC) only on that testnet, and never in production', () => {
        const test = readCryptoPayConfig({ NODE_ENV: 'development', CRYPTO_PAY_TREASURY: TREASURY });
        const robinhood = test.chains.find(c => c.chain.chainId === 46630)!;
        expect(robinhood.tokens.map(t => [t.symbol, t.testOnly])).toEqual([['mUSDC', true]]);
        expect(test.chains.find(c => c.chain.chainId === 10143)!.tokens.map(t => t.symbol)).toEqual(['USDC']);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const prodTestnet = readCryptoPayConfig({
            NODE_ENV: 'production',
            CRYPTO_PAY_NETWORK: 'testnet',
            CRYPTO_PAY_ALLOW_TESTNET_IN_PROD: 'true',
            CRYPTO_PAY_TREASURY: TREASURY,
        });
        jest.restoreAllMocks();
        expect(prodTestnet.chains.some(c => c.chain.chainId === 46630)).toBe(false);
        expect(prodTestnet.chains.some(c => c.chain.chainId === 10143)).toBe(true);
        // Robinhood mainnet takes real USDG, priced as a US dollar.
        const main = readCryptoPayConfig({ NODE_ENV: 'production', CRYPTO_PAY_TREASURY: TREASURY });
        const usdg = main.chains.find(c => c.chain.chainId === 4663)!.tokens;
        expect(usdg.map(t => [t.token, t.symbol, t.decimals, !!t.testOnly])).toEqual([['USDC', 'USDG', 6, false]]);
    });

    it('adds the local anvil chain only in testnet mode and only with its token addresses', () => {
        const env = { CRYPTO_PAY_LOCAL_USDC: LOCAL_USDC, CRYPTO_PAY_RPC_31337: 'http://127.0.0.1:8545' };
        expect(
            readCryptoPayConfig({ ...env, NODE_ENV: 'development' }).chains.some(c => c.chain.chainId === 31337)
        ).toBe(true);
        expect(
            readCryptoPayConfig({ ...env, NODE_ENV: 'production' }).chains.some(c => c.chain.chainId === 31337)
        ).toBe(false);
        expect(readCryptoPayConfig({ NODE_ENV: 'development' }).chains.some(c => c.chain.chainId === 31337)).toBe(
            false
        );
    });

    it('defaults the split route to the main shelter split, and parses CRYPTO_PAY_CAT_SPLITS', () => {
        expect(readCryptoPayConfig({ SHELTER_CHAIN_ID: '5042002', SHELTER_SPLIT_ADDRESS: SPLIT }).splits).toEqual([
            { chainId: 5042002, token: 'USDC', address: SPLIT },
        ]);
        expect(
            readCryptoPayConfig({ CRYPTO_PAY_CAT_SPLITS: `8453:EURC:${SPLIT}, 1:XYZ:${SPLIT}, bad` }).splits
        ).toEqual([{ chainId: 8453, token: 'EURC', address: SPLIT }]);
    });

    it('reads the shelter share bps, the handover flag and the order lifetime with safe bounds', () => {
        const cfg = readCryptoPayConfig({
            CRYPTO_PAY_CAT_SHELTER_BPS: '3000',
            SHELTER_HANDED_OVER: 'true',
            CRYPTO_PAY_ORDER_TTL_MIN: '15',
        });
        expect(cfg.catShelterBps).toBe(3000);
        expect(cfg.handedOver).toBe(true);
        expect(cfg.orderTtlMs).toBe(15 * 60000);
        expect(readCryptoPayConfig({ CRYPTO_PAY_CAT_SHELTER_BPS: '10001' }).catShelterBps).toBeNull();
        expect(readCryptoPayConfig({ CRYPTO_PAY_ORDER_TTL_MIN: '1' }).orderTtlMs).toBe(30 * 60000);
    });
});

describe('EURC pricing', () => {
    const NOW = new Date('2026-10-04T12:00:00Z');
    const eurcOn = (env: Record<string, string>) => {
        const cfg = readCryptoPayConfig({ NODE_ENV: 'development', CRYPTO_PAY_TREASURY: TREASURY, ...env }, NOW);
        return { cfg, sold: cfg.chains.some(c => c.tokens.some(t => t.token === 'EURC')) };
    };

    it('is a fixed euro price with no rate set: 1 EURC per USD, no made-up date', () => {
        const { cfg, sold } = eurcOn({});
        expect(sold).toBe(true);
        expect(cfg).toEqual(
            expect.objectContaining({
                fxSource: 'fixed',
                fxAsOf: null,
                eurcEnabled: true,
                eurcPerUsdMicro: BigInt(1000000),
            })
        );
    });

    it('uses a set rate only with a recent date, and stops EURC sales when it is stale, undated or mistyped', () => {
        const fresh = eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.86', CRYPTO_PAY_EURC_FX_DATE: '2026-10-01' });
        expect(fresh.sold).toBe(true);
        expect(fresh.cfg).toEqual(
            expect.objectContaining({ fxSource: 'dated', fxAsOf: '2026-10-01', eurcPerUsdMicro: BigInt(860000) })
        );
        const stale = new Date(NOW.getTime() - (EURC_FX_MAX_AGE_DAYS + 1) * 86400000).toISOString().slice(0, 10);
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.86', CRYPTO_PAY_EURC_FX_DATE: stale }).sold).toBe(false);
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.86' }).sold).toBe(false);
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.086', CRYPTO_PAY_EURC_FX_DATE: '2026-10-01' }).sold).toBe(false);
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: 'abc', CRYPTO_PAY_EURC_FX_DATE: '2026-10-01' }).sold).toBe(false);
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.86', CRYPTO_PAY_EURC_FX_DATE: '2026-11-30' }).sold).toBe(false);
        // USDC is unaffected.
        expect(eurcOn({ CRYPTO_PAY_EURC_PER_USD: '0.86' }).cfg.chains.length).toBeGreaterThan(0);
    });

    it('parses and formats millionths, falling back to 1 EURC per USD', () => {
        expect(parsePerUsdMicro('0.92')).toBe(BigInt(920000));
        expect(parsePerUsdMicro('1')).toBe(BigInt(1000000));
        expect(parsePerUsdMicro('-1')).toBe(BigInt(1000000));
        expect(parsePerUsdMicro('0')).toBe(BigInt(1000000));
        expect(formatMicro(BigInt(920000))).toBe('0.92');
        expect(formatMicro(BigInt(1000000))).toBe('1');
    });
});

describe('BE-4: the checkout treasury is the wallet.config.ts treasury', () => {
    it('a checked-in checkout treasury is always WALLETS.mainnet.treasury (no drift between the two files)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { TREASURY_ADDRESSES } = require('./treasury.public');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WALLETS } = require('src/shelter/onchain/wallet.config');
        for (const id of [5042, 8453, 42161, 43114, 4217, 4663, 143]) {
            const v = TREASURY_ADDRESSES[id];
            if (v !== null) expect(v.toLowerCase()).toBe(String(WALLETS.mainnet.treasury).toLowerCase());
        }
    });
});

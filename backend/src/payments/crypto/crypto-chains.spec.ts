import { getAddress } from 'ethers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TESTNET_CHAIN_IDS } from 'src/shelter/onchain/shelter-onchain.config';
import { CRYPTO_PAY_CHAINS } from './crypto-chains';

/*
 * The checkout's chain list is a copy of funding/framework/tracks/a-build/chains.json (the registry the
 * payouts and donate code read). This pins every chain id, USDC and EURC address and decimal, and that
 * every chains.json network with a USDC or EURC address is offered.
 */
const CHAINS_JSON = join(__dirname, '../../../../funding/framework/tracks/a-build/chains.json');
const registry = JSON.parse(readFileSync(CHAINS_JSON, 'utf8'));
const DEPLOYMENTS_JSON = join(__dirname, '../../../../funding/framework/tracks/a-build/deployments.json');
const deployments: { chainId: number; mock?: boolean; tokenAddress?: string }[] = JSON.parse(
    readFileSync(DEPLOYMENTS_JSON, 'utf8')
);

type Net = {
    chainId: number;
    usdc?: string | null;
    usdcDecimals?: number;
    splitTokens?: Record<string, any>;
    /** The one payout token of a chain without USDC (Robinhood mainnet: USDG). */
    splitToken?: { symbol: string; address: string; decimals: number };
    /** A testnet with no stablecoin: the wave deploys this mock; its address is in deployments.json. */
    mockToken?: { symbol: string; decimals: number; testnetOnly: boolean };
};
const networks: { key: string; network: string; net: Net }[] = [];
for (const [key, family] of Object.entries<any>(registry)) {
    if (key.startsWith('_')) continue;
    for (const [network, net] of Object.entries<Net>(family.networks || {})) {
        networks.push({ key, network, net });
    }
}

const lower = (v: string | null | undefined) => (v ? v.toLowerCase() : v);
const found = (chainId: number) => networks.find(n => n.net.chainId === chainId) as { net: Net & { rpcEnv?: string } };

describe('crypto checkout chains = chains.json', () => {
    it.each(CRYPTO_PAY_CHAINS.map(c => [c.name, c] as const))('%s matches chains.json', (_name, chain) => {
        const found = networks.find(n => n.net.chainId === chain.chainId);
        expect(found).toBeDefined();
        expect(found!.key).toBe(chain.key);
        expect(found!.network === 'testnet').toBe(chain.testnet);
        const usdc = chain.tokens.find(t => t.token === 'USDC');
        const net = found!.net;
        if (net.usdc) {
            expect(lower(usdc?.address)).toBe(lower(net.usdc));
            expect(usdc?.decimals).toBe(net.usdcDecimals);
        } else if (net.splitToken) {
            // A USD stablecoin other than USDC (USDG), priced like USDC.
            expect(usdc?.symbol).toBe(net.splitToken.symbol);
            expect(lower(usdc?.address)).toBe(lower(net.splitToken.address));
            expect(usdc?.decimals).toBe(net.splitToken.decimals);
        } else if (net.mockToken) {
            expect(net.mockToken.testnetOnly && chain.testnet).toBe(true);
            const deployed = deployments.find(d => d.chainId === chain.chainId && d.mock && d.tokenAddress);
            expect(usdc?.symbol).toBe(net.mockToken.symbol);
            expect(lower(usdc?.address)).toBe(lower(deployed?.tokenAddress));
            expect(usdc?.decimals).toBe(net.mockToken.decimals);
            expect(usdc?.testOnly).toBe(true);
        } else {
            expect(usdc).toBeUndefined();
        }
        const eurc = chain.tokens.find(t => t.token === 'EURC');
        const eurcJson = found!.net.splitTokens?.EURC;
        expect(lower(eurc?.address) ?? null).toBe(lower(eurcJson?.address) ?? null);
        if (eurc) expect(eurc.decimals).toBe(eurcJson.decimals);
    });

    it('offers every chains.json network that has a USDC or EURC address', () => {
        const offered = new Set(CRYPTO_PAY_CHAINS.map(c => c.chainId));
        const payable = networks
            .filter(n => n.net.usdc || n.net.splitTokens?.EURC?.address || n.net.splitToken?.address)
            .map(n => n.net.chainId);
        expect(payable.filter(id => !offered.has(id))).toEqual([]);
    });

    it('marks testnets the way the donate code does', () => {
        for (const chain of CRYPTO_PAY_CHAINS) {
            expect(TESTNET_CHAIN_IDS.includes(chain.chainId)).toBe(chain.testnet);
        }
    });

    it('binds Tempo payments by TIP-20 memo and no other chain', () => {
        expect(CRYPTO_PAY_CHAINS.filter(c => c.tip20Memo).map(c => c.key)).toEqual(['tempo', 'tempo']);
    });

    it('offers USDG on Robinhood mainnet only, a mock token on a testnet only and as testOnly, and never MUSD', () => {
        const where = (symbol: string) =>
            CRYPTO_PAY_CHAINS.filter(c => c.tokens.some(t => t.symbol === symbol)).map(c => c.chainId);
        expect(where('USDG')).toEqual([4663]);
        expect(where('mUSDC')).toEqual([46630]);
        expect(where('MUSD')).toEqual([]);
        for (const chain of CRYPTO_PAY_CHAINS) {
            for (const token of chain.tokens) {
                if (token.testOnly) expect(chain.testnet).toBe(true);
                if (!chain.testnet) expect(token.testOnly).toBeUndefined();
            }
        }
    });

    it('offers Robinhood Chain and Monad, mainnet and testnet, with checked-in official RPCs', () => {
        const ids = [4663, 46630, 143, 10143];
        for (const id of ids) {
            const chain = CRYPTO_PAY_CHAINS.find(c => c.chainId === id)!;
            expect(chain.publicRpc).toMatch(/^https:\/\//);
            expect(chain.explorer).toMatch(/^https:\/\//);
            expect(chain.rpcEnv).toBe(found(id).net.rpcEnv);
            expect(chain.tokens.every(t => t.decimals === 6 && /^0x[0-9a-fA-F]{40}$/.test(t.address))).toBe(true);
        }
        expect(CRYPTO_PAY_CHAINS.find(c => c.chainId === 4663)!.confirmations).toBe(12);
        expect(CRYPTO_PAY_CHAINS.find(c => c.chainId === 143)!.confirmations).toBe(3);
    });

    it('stores the Robinhood and Monad token addresses checksummed', () => {
        for (const chain of CRYPTO_PAY_CHAINS.filter(c => c.key === 'robinhood' || c.key === 'monad')) {
            for (const token of chain.tokens) expect(getAddress(token.address)).toBe(token.address);
        }
    });
});

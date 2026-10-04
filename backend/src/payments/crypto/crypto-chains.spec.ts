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

type Net = { chainId: number; usdc?: string | null; usdcDecimals?: number; splitTokens?: Record<string, any> };
const networks: { key: string; network: string; net: Net }[] = [];
for (const [key, family] of Object.entries<any>(registry)) {
    if (key.startsWith('_')) continue;
    for (const [network, net] of Object.entries<Net>(family.networks || {})) {
        networks.push({ key, network, net });
    }
}

const lower = (v: string | null | undefined) => (v ? v.toLowerCase() : v);

describe('crypto checkout chains = chains.json', () => {
    it.each(CRYPTO_PAY_CHAINS.map(c => [c.name, c] as const))('%s matches chains.json', (_name, chain) => {
        const found = networks.find(n => n.net.chainId === chain.chainId);
        expect(found).toBeDefined();
        expect(found!.key).toBe(chain.key);
        expect(found!.network === 'testnet').toBe(chain.testnet);
        const usdc = chain.tokens.find(t => t.token === 'USDC');
        expect(lower(usdc?.address)).toBe(lower(found!.net.usdc));
        expect(usdc?.decimals).toBe(found!.net.usdcDecimals);
        const eurc = chain.tokens.find(t => t.token === 'EURC');
        const eurcJson = found!.net.splitTokens?.EURC;
        expect(lower(eurc?.address) ?? null).toBe(lower(eurcJson?.address) ?? null);
        if (eurc) expect(eurc.decimals).toBe(eurcJson.decimals);
    });

    it('offers every chains.json network that has a USDC or EURC address', () => {
        const offered = new Set(CRYPTO_PAY_CHAINS.map(c => c.chainId));
        const payable = networks.filter(n => n.net.usdc || n.net.splitTokens?.EURC?.address).map(n => n.net.chainId);
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

    it('never offers USDG, MUSD or a mock token', () => {
        const symbols = CRYPTO_PAY_CHAINS.flatMap(c => c.tokens.map(t => t.symbol));
        expect(symbols).not.toEqual(expect.arrayContaining(['USDG']));
        expect(symbols).not.toEqual(expect.arrayContaining(['MUSD']));
        expect(symbols).not.toEqual(expect.arrayContaining(['mUSDC']));
    });
});

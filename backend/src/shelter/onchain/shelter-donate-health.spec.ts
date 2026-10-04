import { getBigInt, Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { erc20Interface, shelterSplitInterface } from './shelter-chain';
import { ShelterDonateService, TREAT_HEALTH_TTL_MS } from './shelter-donate.service';
import { readRelayChainConfigs } from './shelter-onchain.config';
import { withShelterEnv } from './shelter-onchain.fakes-spec';

const NOW = new Date('2026-10-04T12:00:00Z');
const HOT = Wallet.createRandom();
const TOKEN = '0x' + '77'.repeat(20);
const PINK = '0x' + 'e2'.repeat(20);
const ENV = {
    SHELTER_CHAIN_ID: '5042002',
    SHELTER_DONATE_ENABLED: 'true',
    SHELTER_DONATE_PRIVATE_KEY: HOT.privateKey,
    SHELTER_SPLIT_ADDRESS: '0x' + '11'.repeat(20),
};

/** One fake RPC: the split's paused/preview/token, the token balance and the gas balance. */
function fakeChain(state: { paused?: boolean; wallets?: string[]; token?: bigint; gas?: bigint; down?: boolean }) {
    return {
        ethCall: jest.fn(async (_c: any, _to: string, data: string) => {
            if (state.down) throw Object.assign(new Error('down'), { code: 'NETWORK_ERROR' });
            if (data.startsWith(shelterSplitInterface.getFunction('paused')!.selector)) {
                return shelterSplitInterface.encodeFunctionResult('paused', [!!state.paused]);
            }
            if (data.startsWith(shelterSplitInterface.getFunction('preview')!.selector)) {
                const wallets = state.wallets ?? [PINK];
                return shelterSplitInterface.encodeFunctionResult('preview', [wallets, wallets.map(() => 1), 0]);
            }
            if (data.startsWith(erc20Interface.getFunction('balanceOf')!.selector)) {
                return erc20Interface.encodeFunctionResult('balanceOf', [state.token ?? getBigInt(1990000)]);
            }
            throw new Error('unexpected call');
        }),
        splitToken: jest.fn<Promise<string>, any[]>(async () => TOKEN),
        nativeBalance: jest.fn(async () => state.gas ?? getBigInt(10) ** getBigInt(15)),
    };
}

const base = () => readRelayChainConfigs(ENV as NodeJS.ProcessEnv).find(c => c.chainId === 84532)!;
const tempo = () => readRelayChainConfigs(ENV as NodeJS.ProcessEnv).find(c => c.chainId === 42431)!;
const service = (chain: any) => new ShelterDonateService(memoryModel() as any, memoryModel() as any, chain);

describe('treat health on a wallet.config.ts chain', () => {
    it('is fine when the split pays a shelter and the hot wallet holds a treat and gas', async () => {
        await expect(service(fakeChain({})).treatHealth(base(), NOW)).resolves.toBeNull();
    });

    it.each([
        ['paused', { paused: true }, 'the split is paused'],
        ['no shelter', { wallets: [] }, 'the split pays no shelter'],
        ['short token', { token: getBigInt(9999) }, 'the hot wallet holds less than one treat of USDC'],
        ['no gas', { gas: getBigInt(0) }, 'the hot wallet has no gas'],
        ['rpc down', { down: true }, 'the RPC is not answering'],
    ])('names why it is unavailable: %s', async (_name, state, reason) => {
        await expect(service(fakeChain(state as any)).treatHealth(base(), NOW)).resolves.toBe(reason);
    });

    it('does not ask for gas on Tempo (fees are paid in a stablecoin)', async () => {
        await expect(service(fakeChain({ gas: getBigInt(0) })).treatHealth(tempo(), NOW)).resolves.toBeNull();
    });

    it('reuses a verdict for a minute, failures included', async () => {
        const chain = fakeChain({ down: true });
        const s = service(chain);
        await s.treatHealth(base(), NOW);
        const calls = chain.ethCall.mock.calls.length;
        await s.treatHealth(base(), new Date(NOW.getTime() + TREAT_HEALTH_TTL_MS - 1));
        expect(chain.ethCall).toHaveBeenCalledTimes(calls);
        await s.treatHealth(base(), new Date(NOW.getTime() + TREAT_HEALTH_TTL_MS));
        expect(chain.ethCall.mock.calls.length).toBeGreaterThan(calls);
    });

    it('status lists every testnet next to an Arc testnet main chain, an unhealthy one disabled with its reason', async () => {
        withShelterEnv(ENV);
        try {
            const chain = fakeChain({});
            chain.splitToken.mockImplementation(async (c: any) => {
                if (c.chainId === 46630) throw Object.assign(new Error('down'), { code: 'NETWORK_ERROR' });
                return TOKEN;
            });
            const s = service(chain);
            const status = await s.status(NOW);
            expect(status.chains.map(c => c.chainId).sort((a, b) => a - b)).toEqual([
                10143, 42431, 43113, 46630, 84532, 421614, 5042002,
            ]);
            const robinhood = status.chains.find(c => c.chainId === 46630)!;
            expect(robinhood).toMatchObject({ enabled: false, reason: 'the RPC is not answering' });
            expect(status.chains.filter(c => c.enabled)).toHaveLength(6);
        } finally {
            withShelterEnv({});
        }
    });
});

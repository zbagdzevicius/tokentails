import { getBigInt, Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { erc20Interface, shelterSplitInterface } from './shelter-chain';
import { RPC_TIMEOUT_MS, ShelterChain } from './shelter-chain';
import { ShelterDonateService, TREAT_HEALTH_DEADLINE_MS, TREAT_HEALTH_TTL_MS } from './shelter-donate.service';
import { readRelayChainConfigs, readShelterConfig } from './shelter-onchain.config';
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
function fakeChain(state: { paused?: boolean; wallets?: string[]; token?: bigint; gas?: bigint; down?: boolean; price?: bigint }) {
    return {
        gasPrice: jest.fn(async () => state.price ?? null),
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

describe('the main chain on its recorded split (BE-1 / SEC-1: zero config, no SHELTER_SPLIT_ADDRESS)', () => {
    // SHELTER_CHAIN_ID plus the key: the split comes from wallet.config.ts (autoChain) and pays donate() natively.
    const ZERO_CONFIG = {
        SHELTER_CHAIN_ID: '5042002',
        SHELTER_DONATE_ENABLED: 'true',
        SHELTER_DONATE_PRIVATE_KEY: HOT.privateKey,
    };
    const main = () => readShelterConfig(ZERO_CONFIG as NodeJS.ProcessEnv);
    const ONE = getBigInt(10) ** getBigInt(18);

    it('reads a recorded split with no token treat: the native path', () => {
        expect(main()).toMatchObject({ autoChain: true });
        expect(main().treat).toBeUndefined();
        expect(main().splitAddress).toMatch(/^0x[0-9a-f]{40}$/i);
    });

    it('is healthy when the split pays a shelter and the hot wallet holds a treat plus gas', async () => {
        await expect(service(fakeChain({ gas: ONE, price: getBigInt(1e9) })).treatHealth(main(), NOW)).resolves.toBeNull();
    });

    it.each([
        ['less than one treat', { gas: getBigInt(1) }, 'the hot wallet holds less than one treat of USDC'],
        ['a treat but no gas on top', { gas: getBigInt('10000000000000001'), price: getBigInt(1e9) }, 'the hot wallet is low on gas'],
        ['paused', { paused: true, gas: ONE }, 'the split is paused'],
    ])('names why the main chain is unavailable: %s', async (_n, state, reason) => {
        await expect(service(fakeChain(state as any)).treatHealth(main(), NOW)).resolves.toBe(reason);
    });

    it('status keeps the main chain live and POST /shelter/donate without a chainId is not refused as chain-off', async () => {
        withShelterEnv(ZERO_CONFIG);
        try {
            const s = service(fakeChain({ gas: ONE, price: getBigInt(1e9) }));
            const status = await s.status(NOW);
            const m = status.chains.find(c => c.main)!;
            expect(m).toMatchObject({ chainId: 5042002, enabled: true, railState: 'live' });
            expect(m.reason).toBeUndefined();
            expect(status.enabled).toBe(true);
        } finally {
            withShelterEnv({});
        }
    });
});

describe('SEC-4: gas and float', () => {
    it('closes a token chain whose gas covers less than two sends at the current gas price', async () => {
        // 2 sends x 200k gas x 1 gwei = 0.0004 native; 0.0001 is below it
        await expect(
            service(fakeChain({ gas: getBigInt(10) ** getBigInt(14), price: getBigInt(1e9) })).treatHealth(base(), NOW)
        ).resolves.toBe('the hot wallet is low on gas');
    });

    it('never promises more treats today than the hot wallet float pays for', async () => {
        withShelterEnv(ENV);
        try {
            // 0.03 USDC float at 0.01 a treat: 3 treats, whatever the daily budget says
            const s = service(fakeChain({ token: getBigInt(30000) }));
            const status = await s.status(NOW);
            const b = status.chains.find(c => c.chainId === 84532)!;
            expect(b.enabled).toBe(true);
            await s.status(new Date(NOW.getTime() + 1)); // the second read uses the recorded float
            const again = (await s.status(new Date(NOW.getTime() + 2))).chains.find(c => c.chainId === 84532)!;
            expect(again.treatsLeftToday).toBe(3);
        } finally {
            withShelterEnv({});
        }
    });
});

describe('BE-2: a slow or rate-limited RPC never holds the status endpoint', () => {
    it('builds providers with an 8 s timeout, and a 429 fails at once instead of backing off', async () => {
        expect((new ShelterChain().provider(base()) as any)._getConnection().timeout).toBe(RPC_TIMEOUT_MS);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const http = require('http');
        let hits = 0;
        const server = http.createServer((_req: any, res: any) => {
            hits++;
            res.writeHead(429, { 'content-type': 'application/json' });
            res.end('{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"rate limit exceeded"}}');
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        try {
            const url = `http://127.0.0.1:${server.address().port}`;
            const started = Date.now();
            await expect(new ShelterChain().blockNumber({ ...base(), rpcUrl: url })).rejects.toBeTruthy();
            expect(Date.now() - started).toBeLessThan(3000);
            expect(hits).toBe(1);
        } finally {
            server.close();
        }
    });

    it('a health check that never answers reads as "the RPC is not answering" after the deadline', async () => {
        jest.useFakeTimers({ doNotFake: ['performance'] });
        try {
            const hang = { ...fakeChain({}), ethCall: jest.fn(() => new Promise<string>(() => undefined)) };
            const p = service(hang).treatHealth(base(), NOW);
            jest.advanceTimersByTime(TREAT_HEALTH_DEADLINE_MS);
            await expect(p).resolves.toBe('the RPC is not answering');
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('BE-7: USD treat totals after the switch to mainnet', () => {
    it('leaves testnet treats out once the main chain is a mainnet; a testnet main chain still counts them', () => {
        const { usdTreats } = jest.requireActual('./shelter-donate.service');
        const main = usdTreats(5042).chainId.$nin as number[];
        expect(main).toEqual(expect.arrayContaining([5042002, 84532, 421614, 43113, 42431, 10143, 46630]));
        expect(main).not.toContain(5042);
        const test = usdTreats(5042002).chainId.$nin as number[];
        expect(test).not.toContain(5042002);
        expect(test).toContain(46630); // mUSDC is never a dollar
    });
});

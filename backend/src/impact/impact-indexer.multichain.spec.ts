import { Wallet } from 'ethers';
import { shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import { recordedSplit } from 'src/shelter/onchain/shelter-onchain.config';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { cursorIdFor, impactChainConfigs, ImpactIndexerService, unitsForConfig } from './impact-indexer.service';
import { mergeBuckets } from './impact.service';
import { memoryModel } from './memory-model.fakes-spec';
import { RpcLog, to18 } from './shelter-logs';

const NOW = new Date('2026-10-04T12:00:00Z');
const KEY = Wallet.createRandom().privateKey;
const ARC_SPLIT = '0x' + 'a1'.repeat(20);
const PINK = '0x' + 'e2'.repeat(20);

/** Arc testnet main chain, zero config: every wallet.config.ts testnet is indexed too (testnet setup. */
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    SHELTER_CHAIN_ID: '5042002',
    SHELTER_SPLIT_ADDRESS: ARC_SPLIT,
    SHELTER_SPLIT_FROM_BLOCK: '100',
    SHELTER_DONATE_PRIVATE_KEY: KEY,
    ...extra,
});

let logIndex = 0;
function payout(address: string, block: number, amount: bigint, memo = 'tt:page:0000abcd'): RpcLog {
    const { topics, data } = shelterSplitInterface.encodeEventLog('Disbursed', [PINK, amount, memo]);
    return {
        address,
        topics,
        data,
        blockNumber: '0x' + block.toString(16),
        blockHash: '0x' + block.toString(16).padStart(64, '0'),
        transactionHash: '0x' + (++logIndex).toString(16).padStart(64, '0'),
        logIndex: '0x0',
    };
}

/** One fake RPC per chain id; records every eth_getLogs window and the URL it went to. */
function fakeChains(
    logs: Record<number, RpcLog[]>,
    heads: Record<number, number>,
    deployBlocks: Record<number, number>
) {
    const calls: { chainId: number; url: string | null; from: number; to: number }[] = [];
    return {
        calls,
        blockNumber: jest.fn(async (c: any) => heads[c.chainId] ?? 10),
        blockHash: jest.fn(async (_c: any, block: number) => '0x' + block.toString(16).padStart(64, '0')),
        transactionSender: jest.fn(async () => null),
        getReceipt: jest.fn(async (c: any) => ({ blockNumber: deployBlocks[c.chainId] ?? 5, logs: [] })),
        getPayoutLogs: jest.fn(async (c: any, from: number, to: number) => {
            calls.push({ chainId: c.chainId, url: c.rpcUrl, from, to });
            return (logs[c.chainId] || []).filter(l => {
                const b = parseInt(l.blockNumber, 16);
                return b >= from && b <= to && l.address.toLowerCase() === String(c.splitAddress).toLowerCase();
            });
        }),
    };
}

function setup(chain: ReturnType<typeof fakeChains>) {
    const events = memoryModel({
        unique: [['chainId', 'txHash', 'logIndex']],
        now: () => NOW,
        collections: { [JOB_RUNS_COLLECTION]: memoryModel() },
    });
    const cursors = memoryModel();
    const service = new ImpactIndexerService(
        events as any,
        cursors as any,
        memoryModel() as any,
        memoryModel() as any,
        chain as any
    );
    return { service, events, cursors };
}

describe('impactChainConfigs (which chains the indexer reads besides the main one)', () => {
    it('is every configured chain with a split, of the main chain network class only', () => {
        expect(
            impactChainConfigs(env())
                .map(c => c.chainId)
                .sort((a, b) => a - b)
        ).toEqual([10143, 42431, 43113, 46630, 84532, 421614]);
        // A testnet next to a mainnet main chain is never indexed: test money never sums with real money.
        expect(impactChainConfigs(env({ SHELTER_CHAIN_ID: '5042' })).map(c => c.chainId)).toEqual([]);
        expect(impactChainConfigs({ SHELTER_CHAIN_ID: '5042' } as NodeJS.ProcessEnv)).toEqual([]);
    });

    it('reads each split in its own token: mUSDC on Robinhood testnet, an EURC split as EURC', () => {
        const robinhood = impactChainConfigs(env()).find(c => c.chainId === 46630)!;
        expect(unitsForConfig(robinhood).symbol).toBe('mUSDC');
        expect(
            unitsForConfig({ chainId: 5042002, splitAddress: '0x937f13ce28294011567615330dbcb859a06a0bba' })
        ).toMatchObject({ symbol: 'EURC', decimals: 6 });
        expect(unitsForConfig({ chainId: 84532, splitAddress: recordedSplit(84532)!.address }).symbol).toBe('USDC');
    });
});

describe('ImpactIndexerService.indexAll (every configured chain)', () => {
    const monad = recordedSplit(10143)!.address;
    const robinhood = recordedSplit(46630)!.address;
    const base = recordedSplit(84532)!.address;

    it('keeps a cursor per chain, starting at the deploy block read from the recorded deploy tx', async () => {
        const chain = fakeChains(
            {
                5042002: [payout(ARC_SPLIT, 150, BigInt(10000))],
                10143: [payout(monad, 1_050, BigInt(10000)), payout(monad, 1_260, BigInt(20000))],
                46630: [payout(robinhood, 520, BigInt(10000))],
                84532: [payout(base, 3_100, BigInt(10000))],
            },
            { 5042002: 200, 10143: 1_300, 46630: 600, 84532: 3_200 },
            { 10143: 1_000, 46630: 500, 84532: 3_000 }
        );
        const { service, cursors, events } = setup(chain);
        const results = await service.indexAll(NOW, env());
        const by = (chainId: number) => results.find(r => r.cursorId?.startsWith(`${chainId}:`))!;
        expect(results).toHaveLength(7);
        expect(results.every(r => r.state === 'indexed')).toBe(true);
        expect([5042002, 10143, 46630, 84532].map(id => by(id).scannedFrom)).toEqual([100, 1_000, 500, 3_000]);
        expect(events.rows).toHaveLength(5);

        const cursor = (chainId: number, contract: string) =>
            cursors.rows.find(r => r._id === cursorIdFor(chainId, contract))!;
        expect(cursor(10143, monad).fromBlock).toBe(1_000);
        expect(cursor(10143, monad).totals.direct).toEqual({ USDC: to18(BigInt(30000), 6).toString() });
        expect(cursor(46630, robinhood).totals.direct).toEqual({ mUSDC: to18(BigInt(10000), 6).toString() });

        // The readers' sum: USDC adds across chains, the test coin stays under its own symbol.
        const merged = mergeBuckets(cursors.rows.map(r => r.totals));
        expect(merged.direct).toEqual({
            USDC: to18(BigInt(50000), 6).toString(),
            mUSDC: to18(BigInt(10000), 6).toString(),
        });

        // A second run starts from each cursor (minus the reorg depth), never from the deploy again.
        chain.getReceipt.mockClear();
        await service.indexAll(NOW, env());
        expect(chain.getReceipt).not.toHaveBeenCalled();
        expect(events.rows).toHaveLength(5);
    });

    it("reads Monad's logs from its dedicated log RPC in windows the public RPC caps at 100 blocks", async () => {
        const chain = fakeChains(
            { 10143: [payout(monad, 1_250, BigInt(10000))] },
            { 5042002: 100, 10143: 1_300, 46630: 500, 84532: 3_000 },
            { 10143: 1_000, 46630: 500, 84532: 3_000 }
        );
        const { service } = setup(chain);
        await service.indexAll(NOW, env({ SHELTER_LOG_CHUNK: '5000' }));
        const monadCalls = chain.calls.filter(c => c.chainId === 10143);
        expect(monadCalls[0].url).toBe('https://monad-testnet.api.onfinality.io/public');
        // OnFinality takes 10,000 blocks: one window covers 1,000..1,300.
        expect(monadCalls).toHaveLength(1);

        // An operator RPC override drops the dedicated log RPC; the public RPC's 100-block cap applies.
        chain.calls.length = 0;
        const { service: again } = setup(chain);
        await again.indexAll(NOW, env({ SHELTER_CHAIN_10143_LOG_RPC_URL: 'https://testnet-rpc.monad.xyz' }));
        const capped = chain.calls.filter(c => c.chainId === 10143);
        expect(capped.every(c => c.to - c.from + 1 <= 100)).toBe(true);
        expect(capped).toHaveLength(4);
    });

    it('a failing chain never stops the others', async () => {
        const chain = fakeChains(
            { 84532: [payout(base, 3_100, BigInt(10000))] },
            { 5042002: 100, 10143: 1_300, 46630: 600, 84532: 3_200 },
            { 10143: 1_000, 46630: 500, 84532: 3_000 }
        );
        chain.getReceipt.mockImplementation(async (c: any) => {
            if (c.chainId === 10143) throw Object.assign(new Error('down'), { code: 'SERVER_ERROR' });
            return { blockNumber: c.chainId === 46630 ? 500 : 3_000, logs: [] };
        });
        const { service, events } = setup(chain);
        const results = await service.indexAll(NOW, env());
        expect(results.filter(r => r.state === 'error').map(r => r.cursorId!.split(':')[0])).toEqual(['10143']);
        expect(events.rows).toHaveLength(1);
    });
});

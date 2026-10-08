import { Types } from 'mongoose';
import { readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { ImpactIndexerConfig, REORG_DEPTH } from './impact.config';
import { cursorIdFor, decimalSumToString, IMPACT_INDEXER_JOB, ImpactIndexerService } from './impact-indexer.service';
import { memoryModel } from './memory-model.fakes-spec';
import { RpcLog, to18 } from './shelter-logs';
import { shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import { donateRouterInterface } from 'src/shelter/onchain/donate-router';
import { loadShelterLogsFixture } from './shelter-logs.fixture-spec';

// The crons are opt-in per instance (IMPACT_JOBS_ENABLED); these specs exercise them switched on.
const JOBS_ENV = process.env.IMPACT_JOBS_ENABLED;
beforeEach(() => {
    process.env.IMPACT_JOBS_ENABLED = 'true';
});
afterAll(() => {
    if (JOBS_ENV === undefined) delete process.env.IMPACT_JOBS_ENABLED;
    else process.env.IMPACT_JOBS_ENABLED = JOBS_ENV;
});

const fixture = loadShelterLogsFixture();
const NOW = new Date('2026-10-02T12:00:00Z');
const CURSOR_ID = cursorIdFor(fixture.chainId, fixture.contract);

const config = () => ({
    ...readShelterConfig({ SHELTER_NETWORK: 'mainnet' } as NodeJS.ProcessEnv),
    chainId: fixture.chainId,
    splitAddress: fixture.contract,
    rpcUrl: 'https://rpc.example.test',
    // The fixture predates the DonateRouter: the recorded Arc mainnet router (wallet.config.ts, Oct 7)
    // would make the indexer read receipts the fake RPC does not serve. Router specs set their own.
    routerAddress: null,
});
const indexer = (over: Partial<ImpactIndexerConfig> = {}): ImpactIndexerConfig => ({
    fromBlock: fixture.expected.fromBlock,
    chunk: 2000,
    maxChunks: 25,
    pawSenders: fixture.attribution.pawSenders,
    ...over,
});

/**
 * A fake RPC whose chain is `logs`; `getLogs` answers exactly the block range asked for. Block hashes
 * come from `hashes` (seeded from the logs), else a hash derived from the height; blocks above the
 * head, or at and above `unknownFrom` (a lagging node), are unknown (null).
 */
function fakeChain(initial: RpcLog[], head = fixture.expected.toBlock + 20) {
    const hashes = new Map<number, string>();
    for (const log of initial) {
        if (log.blockHash) hashes.set(parseInt(log.blockNumber, 16), String(log.blockHash).toLowerCase());
    }
    const state = {
        logs: [...initial],
        head,
        hashes,
        fail: null as null | ((from: number) => boolean),
        /** A node that answers eth_getLogs with nothing (not indexed yet). */
        emptyLogs: false,
        unknownFrom: null as number | null,
    };
    const senders: Record<string, string> = { ...fixture.attribution.txFrom };
    const chain = {
        state,
        blockNumber: jest.fn(async () => state.head),
        blockHash: jest.fn(async (_config: unknown, block: number) => {
            if (block > state.head || (state.unknownFrom !== null && block >= state.unknownFrom)) return null;
            return state.hashes.get(block) || '0x' + block.toString(16).padStart(64, '0');
        }),
        /** Senders by tx hash, from the fixture; anything else is unknown to the node. */
        senders,
        transactionSender: jest.fn(async (_config: unknown, txHash: string) => senders[txHash] || null),
        getPayoutLogs: jest.fn(async (_config: unknown, from: number, to: number) => {
            if (state.fail?.(from)) {
                throw Object.assign(new Error('rpc down at https://secret.rpc/key'), { code: 'SERVER_ERROR' });
            }
            if (state.emptyLogs) return [];
            return state.logs.filter(log => {
                const block = parseInt(log.blockNumber, 16);
                return block >= from && block <= to;
            });
        }),
    };
    return chain;
}

function setup(logs: RpcLog[] = fixture.logs, head?: number) {
    const jobRuns = memoryModel();
    const clock = { now: NOW };
    const events = memoryModel({
        unique: [['chainId', 'txHash', 'logIndex']],
        now: () => clock.now,
        collections: { [JOB_RUNS_COLLECTION]: jobRuns },
    });
    const cursors = memoryModel();
    const donations = memoryModel();
    const usedTxs = memoryModel();
    for (const { txHash, source } of fixture.attribution.donations) {
        donations.rows.push({ _id: new Types.ObjectId(), txHash, source, status: 'CONFIRMED' });
    }
    for (const txHash of fixture.attribution.x402UsedTxs) {
        usedTxs.rows.push({ _id: new Types.ObjectId(), txHash });
    }
    const chain = fakeChain(logs, head);
    const service = new ImpactIndexerService(
        events as any,
        cursors as any,
        donations as any,
        usedTxs as any,
        chain as any
    );
    const cursor = () => cursors.rows.find(r => r._id === CURSOR_ID)!;
    return { service, events, cursors, donations, usedTxs, chain, jobRuns, cursor, clock };
}

describe('ImpactIndexerService (fake RPC)', () => {
    it('stays idle, with no cursor and no RPC call, while nothing is deployed', async () => {
        const ctx = setup();
        const result = await ctx.service.indexOnce(NOW, { ...config(), splitAddress: null }, indexer());
        expect(result).toEqual({ state: 'not-deployed' });
        expect(ctx.cursors.rows).toHaveLength(0);
        expect(ctx.chain.blockNumber).not.toHaveBeenCalled();

        await expect(ctx.service.indexOnce(NOW, config(), indexer({ fromBlock: null }))).resolves.toEqual({
            state: 'no-from-block',
        });
        expect(ctx.chain.getPayoutLogs).not.toHaveBeenCalled();
    });

    it('indexes the fixture to the parity totals, attributed by tx hash', async () => {
        const ctx = setup();
        const result = await ctx.service.indexOnce(NOW, config(), indexer());

        expect(result).toMatchObject({ state: 'indexed', inserted: fixture.expected.payoutCount, removed: 0 });
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
        const byBucket = Object.fromEntries(
            Object.entries(ctx.cursor().totals as Record<string, Record<string, string>>).map(([b, s]) => [b, s.USDC])
        );
        expect(byBucket).toEqual(fixture.expected.total18ByBucket);
        expect(ctx.cursor()).toMatchObject({
            eventCount: fixture.expected.payoutCount,
            lastScannedBlock: ctx.chain.state.head,
            lastSuccessAt: NOW,
            lastTxHash: fixture.logs[fixture.logs.length - 1].transactionHash,
        });
        expect(ctx.events.rows.find(r => r.bucket === 'paws')!.memo).toBe(fixture.expected.pawMemo);
    });

    it('counts a tt:paws: payout from anyone but a paw sender as direct, and re-attributes a late sender', async () => {
        const paw = fixture.logs.find(log => log.transactionHash === Object.keys(fixture.attribution.txFrom)[0])!;
        const ctx = setup();
        delete ctx.chain.senders[paw.transactionHash];
        await ctx.service.indexOnce(NOW, config(), indexer());
        const row = () => ctx.events.rows.find(r => r.txHash === paw.transactionHash)!;
        expect(row().bucket).toBe('direct');
        expect(row().txFrom).toBeUndefined();

        // A stranger who calls donate('tt:paws:...') is never credited as paws.
        ctx.chain.senders[paw.transactionHash] = '0x' + '9'.repeat(40);
        await ctx.service.indexOnce(NOW, config(), indexer());
        expect(row()).toMatchObject({ bucket: 'direct', txFrom: '0x' + '9'.repeat(40) });

        // The real settlement wallet, known to the node only now: paws on the next run.
        const other = setup();
        delete other.chain.senders[paw.transactionHash];
        await other.service.indexOnce(NOW, config(), indexer());
        other.chain.senders[paw.transactionHash] = fixture.attribution.txFrom[paw.transactionHash];
        await other.service.indexOnce(NOW, config(), indexer());
        expect(other.events.rows.find(r => r.txHash === paw.transactionHash)!.bucket).toBe('paws');
        expect(other.chain.transactionSender.mock.calls.every(([, tx]) => tx === paw.transactionHash)).toBe(true);
    });

    it('reads in SHELTER_LOG_CHUNK chunks: contiguous, non-overlapping, bounded', async () => {
        const ctx = setup();
        await ctx.service.indexOnce(NOW, config(), indexer({ chunk: 50 }));

        const ranges = ctx.chain.getPayoutLogs.mock.calls.map(([, from, to]) => [from, to] as [number, number]);
        const span = ctx.chain.state.head - fixture.expected.fromBlock + 1;
        expect(ranges).toHaveLength(Math.ceil(span / 50));
        expect(ranges[0][0]).toBe(fixture.expected.fromBlock);
        ranges.forEach(([from, to], i) => {
            expect(to - from + 1).toBeLessThanOrEqual(50);
            if (i) expect(from).toBe(ranges[i - 1][1] + 1);
        });
        expect(ranges[ranges.length - 1][1]).toBe(ctx.chain.state.head);
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
    });

    it('stops after IMPACT_INDEXER_MAX_CHUNKS and continues from the cursor next run', async () => {
        const ctx = setup();
        await ctx.service.indexOnce(NOW, config(), indexer({ chunk: 50, maxChunks: 2 }));
        expect(ctx.chain.getPayoutLogs).toHaveBeenCalledTimes(2);
        expect(ctx.cursor().lastScannedBlock).toBe(fixture.expected.fromBlock + 99);

        await ctx.service.indexOnce(NOW, config(), indexer({ chunk: 50, maxChunks: 100 }));
        expect(ctx.chain.getPayoutLogs.mock.calls[2][1]).toBe(fixture.expected.fromBlock + 100 - REORG_DEPTH);
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
    });

    it('re-running over the reorg window adds no rows', async () => {
        const ctx = setup();
        await ctx.service.indexOnce(NOW, config(), indexer());
        const before = JSON.stringify(ctx.cursor().totals);

        const again = await ctx.service.indexOnce(NOW, config(), indexer());
        expect(again).toMatchObject({ inserted: 0, removed: 0, scannedFrom: ctx.chain.state.head - REORG_DEPTH + 1 });
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
        expect(JSON.stringify(ctx.cursor().totals)).toBe(before);
    });

    it('drops a payout that a reorg removed from the window and fixes the totals', async () => {
        const last = fixture.logs[fixture.logs.length - 1];
        const lastBlock = parseInt(last.blockNumber, 16);
        const ctx = setup(fixture.logs, lastBlock + 3);
        await ctx.service.indexOnce(NOW, config(), indexer());
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);

        // The block with the last payout is reorged out; the replacement chain has it 2 blocks later.
        ctx.chain.state.logs = ctx.chain.state.logs.filter(log => log !== last);
        const moved = { ...last, blockNumber: '0x' + (lastBlock + 2).toString(16), blockHash: '0x' + 'e'.repeat(64) };
        ctx.chain.state.logs.push(moved);
        ctx.chain.state.hashes.set(lastBlock + 2, moved.blockHash);
        ctx.chain.state.head = lastBlock + 5;
        await ctx.service.indexOnce(NOW, config(), indexer());
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
        expect(ctx.events.rows.find(r => r.txHash === last.transactionHash && r.logIndex === 2)).toMatchObject({
            blockNumber: lastBlock + 2,
        });

        // A second reorg replaces block lastBlock + 2 with one that has no payout.
        ctx.chain.state.logs = ctx.chain.state.logs.filter(log => log !== moved);
        ctx.chain.state.hashes.set(lastBlock + 2, '0x' + 'f'.repeat(64));
        const result = await ctx.service.indexOnce(NOW, config(), indexer());
        expect(result.removed).toBe(1);
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount - 1);
        expect(ctx.cursor().totals.direct.USDC).toBe('1500000000000000000');
    });

    it('never deletes payouts because a lagging node returns no logs for the rescan window', async () => {
        const last = fixture.logs[fixture.logs.length - 1];
        const lastBlock = parseInt(last.blockNumber, 16);
        const ctx = setup(fixture.logs, lastBlock + 3);
        await ctx.service.indexOnce(NOW, config(), indexer());
        const before = JSON.stringify(ctx.cursor().totals);

        // The node has the blocks (same canonical hashes) but answers eth_getLogs with nothing.
        ctx.chain.state.emptyLogs = true;
        await expect(ctx.service.indexOnce(NOW, config(), indexer())).resolves.toMatchObject({ removed: 0 });
        // The node does not have the blocks at all yet.
        ctx.chain.state.unknownFrom = lastBlock - 5;
        await expect(ctx.service.indexOnce(NOW, config(), indexer())).resolves.toMatchObject({ removed: 0 });

        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
        expect(JSON.stringify(ctx.cursor().totals)).toBe(before);
    });

    it('keeps the progress it made when the RPC fails mid-run, records the error class only, and resumes', async () => {
        const ctx = setup();
        ctx.chain.state.fail = from => from >= fixture.expected.fromBlock + 100;
        const result = await ctx.service.indexOnce(NOW, config(), indexer({ chunk: 100 }));

        expect(result.state).toBe('error');
        expect(ctx.cursor()).toMatchObject({
            lastScannedBlock: fixture.expected.fromBlock + 99,
            lastError: 'SERVER_ERROR',
        });
        expect(JSON.stringify(ctx.cursor())).not.toContain('secret.rpc');
        expect(ctx.cursor().lastSuccessAt).toBeUndefined();

        ctx.chain.state.fail = null;
        const later = new Date(NOW.getTime() + 5 * 60 * 1000);
        await expect(ctx.service.indexOnce(later, config(), indexer({ chunk: 100 }))).resolves.toMatchObject({
            state: 'indexed',
        });
        expect(ctx.events.rows).toHaveLength(fixture.expected.payoutCount);
        expect(ctx.cursor().lastSuccessAt).toEqual(later);
    });

    it('re-attributes a recent direct payout once its donation row has the hash', async () => {
        const ctx = setup();
        const page = fixture.attribution.donations.find(d => d.source === 'page')!;
        ctx.donations.rows.splice(
            ctx.donations.rows.findIndex(r => r.txHash === page.txHash),
            1
        );
        await ctx.service.indexOnce(NOW, config(), indexer());
        expect(ctx.events.rows.find(r => r.txHash === page.txHash)!.bucket).toBe('direct');

        ctx.donations.rows.push({ _id: new Types.ObjectId(), attempts: [{ txHash: page.txHash }], source: 'page' });
        ctx.chain.state.head += 100; // the tx is now outside the reorg window
        await ctx.service.indexOnce(NOW, config(), indexer());
        expect(ctx.events.rows.find(r => r.txHash === page.txHash)!.bucket).toBe('page');
        expect(ctx.cursor().totals.page.USDC).toBe(fixture.expected.total18ByBucket.page);
    });

    it('two instances run the indexer once per tick', async () => {
        const ctx = setup();
        const other = new ImpactIndexerService(
            ctx.events as any,
            ctx.cursors as any,
            ctx.donations as any,
            ctx.usedTxs as any,
            ctx.chain as any
        );
        const runA = jest.spyOn(ctx.service, 'indexOnce').mockResolvedValue({ state: 'indexed' });
        const runB = jest.spyOn(other, 'indexOnce').mockResolvedValue({ state: 'indexed' });

        const outcomes = await Promise.all([ctx.service.cron(), other.cron()]);
        expect(outcomes.sort()).toEqual(['lease-held', 'ran']);
        expect(runA.mock.calls.length + runB.mock.calls.length).toBe(1);
        expect(ctx.jobRuns.rows.find(r => r._id === IMPACT_INDEXER_JOB)).toMatchObject({ status: 'done' });
    });

    it('a cron on an instance without IMPACT_JOBS_ENABLED does nothing, not even take the lease', async () => {
        const ctx = setup();
        const run = jest.spyOn(ctx.service, 'indexOnce');
        for (const value of [undefined, '', 'false', '1']) {
            if (value === undefined) delete process.env.IMPACT_JOBS_ENABLED;
            else process.env.IMPACT_JOBS_ENABLED = value;
            await expect(ctx.service.cron()).resolves.toBe('disabled');
        }
        expect(run).not.toHaveBeenCalled();
        expect(ctx.jobRuns.rows).toHaveLength(0);
    });

    it('parses Decimal128 integer sums and refuses fractions', () => {
        expect(decimalSumToString('3880000000000000000')).toBe('3880000000000000000');
        expect(decimalSumToString('388E+16')).toBe('3880000000000000000');
        expect(() => decimalSumToString('1.5')).toThrow();
    });

    describe('wallet gifts, matches and x402 exact (F2)', () => {
        const ROUTER = '0x4444444444444444444444444444444444444444';
        const HOT = '0x3333333333333333333333333333333333333333';
        const STRANGER = '0x9999999999999999999999999999999999999999';
        const SHELTER = '0x2222222222222222222222222222222222222222';
        const block = fixture.expected.toBlock + 1;
        const tx = (c: string) => '0x' + c.repeat(64);
        const payout = (txHash: string, amount: number, memo: string, logIndex = 0): RpcLog => {
            const event = shelterSplitInterface.encodeEventLog('Disbursed', [SHELTER, amount, memo]);
            return {
                address: fixture.contract,
                topics: event.topics,
                data: event.data,
                blockNumber: '0x' + block.toString(16),
                blockHash: '0x' + block.toString(16).padStart(64, '0'),
                transactionHash: txHash,
                logIndex: '0x' + logIndex.toString(16),
            };
        };
        const batch = (payer: string) => {
            const event = shelterSplitInterface.encodeEventLog('DisbursementBatch', [1, payer, 1, 1, 0, 1, 'x']);
            return { address: fixture.contract, topics: event.topics, data: event.data };
        };
        const DONOR = '0x1212121212121212121212121212121212121212';
        const TEAM = '0x8888888888888888888888888888888888888888';
        const routerGift = (donor: string, memo: string) => {
            const event = donateRouterInterface.encodeEventLog('RouterDonation', [
                donor,
                1,
                1,
                0,
                memo,
                '0x' + '0'.repeat(64),
            ]);
            return { address: ROUTER, topics: event.topics, data: event.data, transactionHash: tx('0'), logIndex: 0 };
        };

        it('buckets router gifts as wallet, recorded matches as match, and adds x402 exact once', async () => {
            const logs = [
                payout(tx('1'), 500000, 'tt:wallet:0a1b2c3d'),
                payout(tx('2'), 500000, 'tt:match:11111111'),
                payout(tx('3'), 700000, 'tt:match:22222222'),
                payout(tx('4'), 300000, 'tt:wallet:deadbeef'),
                payout(tx('5'), 200000, 'for the cats'),
                payout(tx('6'), 100000, 'tt:wallet:0a1b2c3e'),
                payout(tx('7'), 100000, 'tt:flush'),
            ];
            const ctx = setup(logs, block + 5);
            ctx.chain.senders[tx('2')] = HOT;
            ctx.chain.senders[tx('3')] = STRANGER;
            const receipts: Record<string, unknown> = {
                [tx('1')]: { status: 1, logs: [routerGift(DONOR, 'tt:wallet:0a1b2c3d'), batch(ROUTER)] },
                [tx('4')]: { status: 1, logs: [batch(STRANGER)] },
                // donateNative with a memo the donor chose: still a router gift.
                [tx('5')]: { status: 1, logs: [routerGift(DONOR, 'for the cats'), batch(ROUTER)] },
                // A team wallet giving through the router is not a public gift.
                [tx('6')]: { status: 1, logs: [routerGift(TEAM, 'tt:wallet:0a1b2c3e'), batch(ROUTER)] },
                [tx('7')]: { status: 1, logs: [routerGift(ROUTER, 'tt:flush'), batch(ROUTER)] },
            };
            (ctx.chain as any).getReceipt = jest.fn(async (_c: unknown, hash: string) => receipts[hash] || null);
            const matches = memoryModel();
            matches.rows.push({ _id: new Types.ObjectId(), donorTxHash: tx('1'), matchTxHash: tx('2') });
            matches.rows.push({ _id: new Types.ObjectId(), donorTxHash: tx('9'), matchTxHash: tx('3') });
            // x402 exact: one new payment, one duplicate row hash, one already indexed as a split event, one other
            // chain, and two rows not verified on-chain (false, and an older row without the field).
            ctx.usedTxs.rows.push(
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('a'),
                    scheme: 'exact',
                    chainId: fixture.chainId,
                    amountBase: '10000',
                    verifiedOnchain: true,
                },
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('a'),
                    scheme: 'exact',
                    chainId: fixture.chainId,
                    amountBase: '10000',
                    verifiedOnchain: true,
                },
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('1'),
                    scheme: 'exact',
                    chainId: fixture.chainId,
                    amountBase: '500000',
                    verifiedOnchain: true,
                },
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('b'),
                    scheme: 'exact',
                    chainId: 1,
                    amountBase: '999',
                    verifiedOnchain: true,
                },
                // Settled per the facilitator but never read back from the chain: not counted.
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('c'),
                    scheme: 'exact',
                    chainId: fixture.chainId,
                    amountBase: '777777',
                    verifiedOnchain: false,
                },
                {
                    _id: new Types.ObjectId(),
                    txHash: tx('d'),
                    scheme: 'exact',
                    chainId: fixture.chainId,
                    amountBase: '5',
                }
            );
            const service = new ImpactIndexerService(
                ctx.events as any,
                ctx.cursors as any,
                ctx.donations as any,
                ctx.usedTxs as any,
                ctx.chain as any,
                matches as any
            );
            const from = block - 1;
            await service.indexOnce(
                NOW,
                { ...config(), routerAddress: ROUTER, notPublicWallets: [TEAM] },
                indexer({ fromBlock: from, pawSenders: [HOT] })
            );
            const bucketOf = (hash: string) => ctx.events.rows.find(r => r.txHash === hash)!.bucket;
            expect(bucketOf(tx('1'))).toBe('wallet');
            expect(bucketOf(tx('2'))).toBe('match');
            expect(bucketOf(tx('3'))).toBe('direct');
            expect(bucketOf(tx('4'))).toBe('direct');
            expect(bucketOf(tx('5'))).toBe('wallet');
            expect(bucketOf(tx('6'))).toBe('direct');
            expect(bucketOf(tx('7'))).toBe('direct');
            const totals = ctx.cursor().totals;
            expect(totals.wallet.USDC).toBe(to18(BigInt(700000), 6).toString());
            expect(totals.match.USDC).toBe(to18(BigInt(500000), 6).toString());
            expect(totals.x402.USDC).toBe(to18(BigInt(10000), 6).toString());
        });
    });
});

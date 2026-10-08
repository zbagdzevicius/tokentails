import { HttpException } from '@nestjs/common';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { RpcLog } from 'src/impact/shelter-logs';
import { JOB_RUNS_COLLECTION } from 'src/shared/jobs/lease';
import { ShelterPayoutsController } from './payout-index.controller';
import {
    displayMemo,
    isRangeError,
    parsePayoutsQuery,
    PAYOUTS_CACHE_CONTROL,
    PAYOUTS_ERROR,
    payoutCursorId,
    payoutIndexNetworks,
    payoutIndexRpcs,
    payoutIndexTargets,
    PayoutIndexTarget,
    rangeLimitFrom,
    ShelterPayoutIndexService,
    sortKeyOf,
} from './payout-index.service';
import { shelterSplitInterface } from './shelter-chain';
import { CHAINS } from './wallet.config';

const SPLIT = '0x' + 'a1'.repeat(20);
const PINK = '0x' + 'e2'.repeat(20);
const T0 = 1_760_000_000;

const target = (over: Partial<PayoutIndexTarget> = {}): PayoutIndexTarget => ({
    network: 'mainnet',
    chainId: 8453,
    contract: SPLIT,
    symbol: 'USDC',
    decimals: 6,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    deployTx: '0x' + 'dd'.repeat(32),
    fromBlock: null,
    ...over,
});

let txCounter = 0;
function payout(
    block: number,
    amount: bigint,
    opts: { native?: boolean; memo?: string; address?: string } = {}
): RpcLog {
    const { topics, data } = shelterSplitInterface.encodeEventLog(opts.native ? 'NativeDisbursed' : 'Disbursed', [
        PINK,
        amount,
        opts.memo ?? 'tt:page:0000abcd',
    ]);
    return {
        address: opts.address ?? SPLIT,
        topics,
        data,
        blockNumber: '0x' + block.toString(16),
        blockHash: '0x' + block.toString(16).padStart(64, '0'),
        transactionHash: '0x' + (++txCounter).toString(16).padStart(64, '0'),
        logIndex: '0x0',
    };
}

/** A fake chain: logs per block, a head, block i has time T0 + i and hash = its number. */
function fakeChain(logs: RpcLog[], head: number, deployBlock = 1000) {
    const windows: { url: string; from: number; to: number }[] = [];
    const state = { head, logs, cap: null as number | null, hashOverride: new Map<number, string>() };
    return {
        state,
        windows,
        blockNumber: jest.fn(async () => state.head),
        getReceipt: jest.fn(async () => ({ blockNumber: deployBlock, logs: [] })),
        blockTimestamp: jest.fn(async (_c: any, block: number) => (block <= state.head ? T0 + block : null)),
        blockHash: jest.fn(async (_c: any, block: number) =>
            block <= state.head ? state.hashOverride.get(block) ?? '0x' + block.toString(16).padStart(64, '0') : null
        ),
        getPayoutLogs: jest.fn(async (c: any, from: number, to: number) => {
            if (state.cap !== null && to - from + 1 > state.cap) {
                throw Object.assign(new Error('could not coalesce error'), {
                    error: { code: -32614, message: `eth_getLogs is limited to a ${state.cap} range` },
                });
            }
            windows.push({ url: c.rpcUrl, from, to });
            return state.logs.filter(l => {
                const b = parseInt(l.blockNumber, 16);
                return b >= from && b <= to && l.address === String(c.splitAddress).toLowerCase();
            });
        }),
    };
}

function setup(chain: ReturnType<typeof fakeChain>) {
    const logs = memoryModel({
        unique: [['chainId', 'txHash', 'logIndex']],
        collections: { [JOB_RUNS_COLLECTION]: memoryModel() },
    });
    const cursors = memoryModel();
    const service = new ShelterPayoutIndexService(logs as any, cursors as any, chain as any);
    service.sleep = async () => undefined;
    return { service, logs, cursors };
}

const ENV = {} as NodeJS.ProcessEnv;

describe('payout index targets', () => {
    it('lists every recorded mainnet split, Arc EURC included, with its own token units', () => {
        const mainnet = payoutIndexTargets(['mainnet']);
        const expected = Object.values(CHAINS)
            .filter(c => c.network === 'mainnet')
            .reduce((n, c) => n + (c.split ? 1 : 0) + c.otherSplits.length, 0);
        expect(mainnet).toHaveLength(expected);
        expect(new Set(mainnet.map(t => t.chainId))).toEqual(new Set([5042, 8453, 42161, 4663, 43114, 4217, 143]));
        const eurc = mainnet.find(t => t.chainId === 5042 && t.symbol === 'EURC');
        expect(eurc).toMatchObject({ decimals: 6, nativeSymbol: 'USDC', nativeDecimals: 18 });
        expect(mainnet.find(t => t.chainId === 4663)?.symbol).toBe('USDG');
        expect(payoutIndexTargets(['testnet']).every(t => t.network === 'testnet')).toBe(true);
    });

    it("never gives an unlisted chain Arc's units (its gas coin must not add into USDC)", () => {
        const key = '__unlistedTestChain';
        (CHAINS as any)[key] = {
            name: 'New',
            chainId: 999999,
            network: 'mainnet',
            rpc: 'https://rpc.example',
            explorer: 'https://explorer.example',
            token: { symbol: 'USDC', decimals: 6, address: null },
            split: { address: '0x' + 'cc'.repeat(20), token: { symbol: 'USDC', decimals: 6, address: null } },
            otherSplits: [],
        };
        try {
            const t = payoutIndexTargets(['mainnet']).find(x => x.chainId === 999999);
            expect(t).toMatchObject({ symbol: 'USDC', nativeSymbol: 'NATIVE-999999', nativeDecimals: 18 });
        } finally {
            delete (CHAINS as any)[key];
        }
    });

    it('reads SHELTER_PAYOUTS_INDEX_NETWORKS', () => {
        expect(payoutIndexNetworks({} as any)).toEqual(['mainnet', 'testnet']);
        expect(payoutIndexNetworks({ SHELTER_PAYOUTS_INDEX_NETWORKS: 'mainnet' } as any)).toEqual(['mainnet']);
        expect(payoutIndexNetworks({ SHELTER_PAYOUTS_INDEX_NETWORKS: 'bogus' } as any)).toEqual([]);
    });

    it("uses each chain's log RPC and its known eth_getLogs cap", () => {
        expect(payoutIndexRpcs(8453, SPLIT, ENV)?.window).toBe(500);
        // rpc.monad.xyz and rpc1.monad.xyz cap eth_getLogs at 100 blocks; rpc2 takes 10,000 (2026-10-08).
        expect(payoutIndexRpcs(143, SPLIT, ENV)?.logs.rpcUrl).toBe('https://rpc2.monad.xyz');
        expect(payoutIndexRpcs(143, SPLIT, ENV)?.window).toBe(10000);
        expect(payoutIndexRpcs(143, SPLIT, ENV)?.chain.rpcUrl).toBe('https://rpc.monad.xyz');
        expect(payoutIndexRpcs(5042, SPLIT, ENV)?.logs.splitAddress).toBe(SPLIT);
    });

    it('recognises range refusals, not rate limits', () => {
        expect(rangeLimitFrom('eth_getLogs is limited to a 1,000 range')).toBe(1000);
        expect(isRangeError({ error: { message: 'eth_getLogs is limited to a 500 range' } })).toBe(true);
        expect(isRangeError(new Error('query exceeds max block range 100000'))).toBe(true);
        expect(isRangeError(new Error('rate limit exceeded'))).toBe(false);
        expect(isRangeError(new Error('timeout'))).toBe(false);
    });
});

describe('ShelterPayoutIndexService.indexTarget', () => {
    it('backfills from the deploy block in windows the RPC accepts, storing block time and units', async () => {
        const chain = fakeChain([payout(1100, BigInt(1_500_000)), payout(1990, BigInt(10_000))], 2100);
        const { service, logs, cursors } = setup(chain);
        const result = await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(result).toMatchObject({ state: 'indexed', scannedFrom: 1000, scannedTo: 2100, head: 2100, inserted: 2 });
        // Base mainnet: 500-block windows from the deploy block.
        expect(chain.windows.map(w => [w.from, w.to])).toEqual([
            [1000, 1499],
            [1500, 1999],
            [2000, 2100],
        ]);
        const first = logs.rows.find(r => r.blockNumber === 1100)!;
        expect(first).toMatchObject({
            network: 'mainnet',
            chainId: 8453,
            contract: SPLIT,
            kind: 'token',
            amount: '1500000',
            decimals: 6,
            amount18: '1500000000000000000',
            symbol: 'USDC',
            shelter: PINK,
            timestamp: T0 + 1100,
            sortKey: sortKeyOf(T0 + 1100, 8453, 1100, 0),
        });
        const cursor = cursors.rows[0];
        expect(cursor).toMatchObject({
            _id: payoutCursorId(8453, SPLIT),
            fromBlock: 1000,
            lastScannedBlock: 2100,
            lastScannedTime: T0 + 2100,
            head: 2100,
        });
        expect(cursor.lastSuccessAt).toBeInstanceOf(Date);
    });

    it('is idempotent: a rescan of the reorg window adds nothing and keeps the cursor moving forward', async () => {
        const chain = fakeChain([payout(1100, BigInt(5))], 1200);
        const { service, logs, cursors } = setup(chain);
        await service.indexTarget(target(), Date.now() + 60_000, ENV);
        chain.state.head = 1300;
        const again = await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(again.inserted).toBe(0);
        expect(again.scannedFrom).toBe(1200 - 12 + 1);
        expect(logs.rows).toHaveLength(1);
        expect(cursors.rows[0].lastScannedBlock).toBe(1300);
        // A lagging RPC reporting a lower head never moves the cursor back.
        chain.state.head = 1250;
        await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(cursors.rows[0].lastScannedBlock).toBe(1300);
    });

    it('keeps a row the RPC omits while its block is canonical, drops it after a reorg', async () => {
        const log = payout(1150, BigInt(7));
        const chain = fakeChain([log], 1155);
        const { service, logs } = setup(chain);
        await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(logs.rows).toHaveLength(1);
        chain.state.logs = [];
        chain.state.head = 1158;
        await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(logs.rows).toHaveLength(1);
        chain.state.hashOverride.set(1150, '0x' + 'ff'.repeat(32));
        const result = await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(result.removed).toBe(1);
        expect(logs.rows).toHaveLength(0);
    });

    it('shrinks the window to the cap an RPC names', async () => {
        const chain = fakeChain([payout(1201, BigInt(1))], 1400);
        chain.state.cap = 100;
        const { service, logs } = setup(chain);
        const result = await service.indexTarget(
            target({ chainId: 42161, nativeSymbol: 'ETH' }),
            Date.now() + 60_000,
            ENV
        );
        expect(result.state).toBe('indexed');
        expect(chain.windows.every(w => w.to - w.from + 1 <= 100)).toBe(true);
        expect(logs.rows).toHaveLength(1);
    });

    it('stops at the run budget and records no block time mid-backfill', async () => {
        const chain = fakeChain([], 5000);
        const { service, cursors } = setup(chain);
        let t = 0;
        service.clock = () => (t += 1000);
        const result = await service.indexTarget(target(), 3500, ENV);
        expect(result.state).toBe('indexed');
        expect(result.scannedTo).toBeLessThan(5000);
        expect(cursors.rows[0].lastScannedTime).toBeNull();
    });

    it('records the error class, never moving the cursor, when the RPC fails', async () => {
        const chain = fakeChain([], 1200);
        chain.getPayoutLogs.mockRejectedValueOnce(
            Object.assign(new Error('https://secret-rpc/key timeout'), { code: 'TIMEOUT' })
        );
        const { service, cursors } = setup(chain);
        const result = await service.indexTarget(target(), Date.now() + 60_000, ENV);
        expect(result.state).toBe('error');
        expect(cursors.rows[0]).toMatchObject({ lastScannedBlock: null, lastError: 'TIMEOUT' });
        expect(JSON.stringify(cursors.rows[0])).not.toContain('secret-rpc');
    });

    it("reads the head's block time from the log RPC when the chain RPC does not have it yet", async () => {
        // Base Sepolia: the chain RPC (sepolia.base.org) and the log RPC (publicnode) are different URLs.
        const chain = fakeChain([payout(1100, BigInt(1))], 1200);
        const chainUrl = payoutIndexRpcs(84532, SPLIT, ENV)!.chain.rpcUrl;
        chain.blockTimestamp.mockImplementation(async (c: any, block: number) =>
            c.rpcUrl === chainUrl && block > 1150 ? null : T0 + block
        );
        const { service, cursors } = setup(chain);
        const result = await service.indexTarget(
            target({ network: 'testnet', chainId: 84532 }),
            Date.now() + 60_000,
            ENV
        );
        expect(result.state).toBe('indexed');
        expect(cursors.rows[0]).toMatchObject({ lastScannedBlock: 1200, lastScannedTime: T0 + 1200 });
    });

    it('decodes a native payout in the native coin units', async () => {
        const chain = fakeChain([payout(1001, BigInt('2000000000000000000'), { native: true })], 1010);
        const { service, logs } = setup(chain);
        await service.indexTarget(
            target({ chainId: 5042, nativeSymbol: 'USDC', nativeDecimals: 18 }),
            Date.now() + 60_000,
            ENV
        );
        expect(logs.rows[0]).toMatchObject({
            kind: 'native',
            decimals: 18,
            symbol: 'USDC',
            amount18: '2000000000000000000',
        });
    });

    it('indexAll runs every recorded target of the configured networks', async () => {
        const chain = fakeChain([], 1001);
        const { service, cursors } = setup(chain);
        const results = await service.indexAll({ SHELTER_PAYOUTS_INDEX_NETWORKS: 'mainnet' } as any, 60_000);
        expect(results).toHaveLength(payoutIndexTargets(['mainnet']).length);
        expect(results.every(r => r.state === 'indexed')).toBe(true);
        expect(cursors.rows.every(r => r.network === 'mainnet')).toBe(true);
    });
});

describe('ShelterPayoutIndexService.list', () => {
    async function indexed() {
        const chain = fakeChain(
            [
                payout(1100, BigInt(1_000_000)),
                payout(1200, BigInt(2_000_000)),
                payout(1300, BigInt('500000000000000000'), { native: true }),
            ],
            1400
        );
        const ctx = setup(chain);
        await ctx.service.indexTarget(target({ chainId: 5042, nativeSymbol: 'USDC' }), Date.now() + 60_000, ENV);
        const other = fakeChain([payout(1050, BigInt(3_000_000))], 1100);
        const service2 = new ShelterPayoutIndexService(ctx.logs as any, ctx.cursors as any, other as any);
        service2.sleep = async () => undefined;
        await service2.indexTarget(target({ chainId: 4663, symbol: 'USDG' }), Date.now() + 60_000, ENV);
        return ctx;
    }

    it('returns contracts with indexedThrough and totals, per-symbol totals and events newest first', async () => {
        const { service } = await indexed();
        const out = await service.list({ network: 'mainnet', limit: 500 }, Date.parse('2026-10-08T12:00:00Z'));
        expect(out.source).toBe('index');
        expect(out.contracts.map(c => c.chainId)).toEqual([4663, 5042]);
        const arc = out.contracts.find(c => c.chainId === 5042)!;
        expect(arc.indexedThrough).toMatchObject({ block: 1400, time: T0 + 1400 });
        expect(arc.totals).toEqual([
            {
                symbol: 'USDC',
                kind: 'native',
                amount: '500000000000000000',
                decimals: 18,
                amount18: '500000000000000000',
                count: 1,
            },
            {
                symbol: 'USDC',
                kind: 'token',
                amount: '3000000',
                decimals: 6,
                amount18: '3000000000000000000',
                count: 2,
            },
        ]);
        expect(out.totals).toEqual([
            { symbol: 'USDC', amount18: '3500000000000000000', count: 3 },
            { symbol: 'USDG', amount18: '3000000000000000000', count: 1 },
        ]);
        expect(out.chains.map(c => c.chainId)).toEqual([4663, 5042]);
        expect(out.count).toBe(4);
        expect(out.events.map(e => e.blockNumber)).toEqual([1300, 1200, 1100, 1050]);
        expect(Object.keys(out.events[0]).sort()).toEqual(
            [
                'amount',
                'amount18',
                'blockNumber',
                'chainId',
                'contract',
                'decimals',
                'kind',
                'logIndex',
                'memo',
                'memoRaw',
                'shelter',
                'symbol',
                'timestamp',
                'txHash',
            ].sort()
        );
        expect(out.nextCursor).toBeNull();
    });

    it('decodes a Tempo bytes32 memo into memo and keeps the emitted hex as memoRaw', async () => {
        const hex = '0x' + Buffer.from('Catnip Heist campaign').toString('hex').padEnd(64, '0');
        const chain = fakeChain([payout(1100, BigInt(1_000_000), { memo: hex }), payout(1200, BigInt(2))], 1300);
        const { service } = setup(chain);
        await service.indexTarget(target({ chainId: 4217, symbol: 'USDC.e' }), Date.now() + 60_000, ENV);
        const out = await service.list({ network: 'mainnet', limit: 10 }, 1);
        expect(out.events.map(e => [e.memo, e.memoRaw])).toEqual([
            ['tt:page:0000abcd', 'tt:page:0000abcd'],
            ['Catnip Heist campaign', hex],
        ]);
    });

    it('pages with an opaque cursor and filters by chain and address', async () => {
        const { service } = await indexed();
        const page1 = await service.list({ network: 'mainnet', limit: 2 }, 1);
        expect(page1.events).toHaveLength(2);
        expect(page1.nextCursor).toMatch(/^\d{12}:/);
        const page2 = await service.list({ network: 'mainnet', limit: 2, cursor: page1.nextCursor! }, 1);
        expect(page2.events.map(e => e.blockNumber)).toEqual([1100, 1050]);
        expect(page2.nextCursor).toBeNull();
        // Totals never depend on the page.
        expect(page2.totals).toEqual(page1.totals);
        const robin = await service.list({ network: 'mainnet', limit: 10, chainId: 4663 }, 1);
        expect(robin.contracts).toHaveLength(1);
        expect(robin.events.every(e => e.chainId === 4663)).toBe(true);
        const none = service.list({ network: 'mainnet', limit: 10, address: '0x' + '00'.repeat(20) }, 1);
        await expect(none).rejects.toMatchObject({ status: 409 });
    });

    it('answers 409 for a network nothing indexed and 424 when the database fails, never 503', async () => {
        const { service, cursors } = await indexed();
        const err = await service.list({ network: 'testnet', limit: 10 }, 1).catch(e => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toMatchObject({ code: PAYOUTS_ERROR.NOT_INDEXED });
        cursors.find.mockImplementationOnce(() => {
            throw new Error('mongo down');
        });
        const down = await service.list({ network: 'mainnet', limit: 3 }, 2).catch(e => e);
        expect(down.getStatus()).toBe(424);
        expect(down.getResponse()).toMatchObject({ code: PAYOUTS_ERROR.UNAVAILABLE });
    });

    it("never lists a row above its contract's indexedThrough (a reader would count it twice)", async () => {
        // The run writes the row of its last window, then fails reading the head's time: the cursor
        // stays where it was, so the row is not listed until a run gets past it.
        const chain = fakeChain([payout(1150, BigInt(9))], 1155);
        chain.blockTimestamp.mockImplementation(async (_c: any, block: number) => (block === 1155 ? null : T0 + block));
        const { service, logs } = setup(chain);
        const failed = await service.indexTarget(target({ chainId: 5042 }), Date.now() + 60_000, ENV);
        expect(failed.state).toBe('error');
        expect(logs.rows).toHaveLength(1);
        const before = await service.list({ network: 'mainnet', limit: 10 }, 1);
        expect(before.contracts[0]).toMatchObject({ count: 0, totals: [], indexedThrough: { block: null } });
        expect(before.events).toEqual([]);
        expect(before.count).toBe(0);
        chain.blockTimestamp.mockImplementation(async (_c: any, block: number) => T0 + block);
        await service.indexTarget(target({ chainId: 5042 }), Date.now() + 60_000, ENV);
        const after = await service.list({ network: 'mainnet', limit: 10 }, 100_000);
        expect(after.contracts[0]).toMatchObject({ count: 1, indexedThrough: { block: 1155 } });
        expect(after.events.map(e => e.blockNumber)).toEqual([1150]);
    });

    it('serves one answer per query for 30 seconds', async () => {
        const { service, logs } = await indexed();
        const a = await service.list({ network: 'mainnet', limit: 5 }, 1000);
        const calls = logs.aggregate.mock.calls.length;
        const b = await service.list({ network: 'mainnet', limit: 5 }, 20_000);
        expect(b).toBe(a);
        expect(logs.aggregate.mock.calls.length).toBe(calls);
        await service.list({ network: 'mainnet', limit: 5 }, 40_000);
        expect(logs.aggregate.mock.calls.length).toBe(calls + 1);
    });
});

describe('parsePayoutsQuery', () => {
    it('defaults to mainnet and 500 rows, caps the limit and validates every field', () => {
        expect(parsePayoutsQuery({})).toEqual({ network: 'mainnet', limit: 500 });
        expect(
            parsePayoutsQuery({
                network: 'testnet',
                chainId: '5042002',
                address: '0x' + 'AB'.repeat(20),
                limit: '99999',
            })
        ).toEqual({ network: 'testnet', chainId: 5042002, address: '0x' + 'ab'.repeat(20), limit: 2000 });
        expect(parsePayoutsQuery({ network: 'devnet' })).toMatch(/network/);
        expect(parsePayoutsQuery({ chainId: '0' })).toMatch(/chainId/);
        expect(parsePayoutsQuery({ chainId: ['1', '2'] })).toMatch(/chainId/);
        expect(parsePayoutsQuery({ address: '0x12' })).toMatch(/address/);
        expect(parsePayoutsQuery({ limit: '0' })).toMatch(/limit/);
        expect(parsePayoutsQuery({ cursor: 'abc' })).toMatch(/cursor/);
        expect(parsePayoutsQuery({ cursor: sortKeyOf(1, 2, 3, 4) })).toMatchObject({ cursor: sortKeyOf(1, 2, 3, 4) });
    });
});

describe('ShelterPayoutsController', () => {
    const res = () => {
        const headers: Record<string, string> = {};
        return {
            headers,
            setHeader: (k: string, v: string) => (headers[k] = v),
            getHeader: (k: string) => headers[k],
        };
    };

    it('sets the cache headers and an open CORS origin for the public read', async () => {
        const list = jest.fn(async () => ({ events: [] } as any));
        const controller = new ShelterPayoutsController({ list } as any);
        const r = res();
        await controller.payouts({ network: 'mainnet', limit: '10' }, r);
        expect(list).toHaveBeenCalledWith({ network: 'mainnet', limit: 10 });
        expect(r.headers['Cache-Control']).toBe(PAYOUTS_CACHE_CONTROL);
        expect(r.headers['Access-Control-Allow-Origin']).toBe('*');
        const listed = res();
        listed.headers['Access-Control-Allow-Origin'] = 'https://tokentails.com';
        await controller.payouts({}, listed);
        expect(listed.headers['Access-Control-Allow-Origin']).toBe('https://tokentails.com');
    });

    it('answers 400 for a malformed query', async () => {
        const controller = new ShelterPayoutsController({ list: jest.fn() } as any);
        await expect(controller.payouts({ network: 'x' }, res())).rejects.toMatchObject({ status: 400 });
    });
});

describe('displayMemo', () => {
    const b32 = (text: string) => '0x' + Buffer.from(text, 'utf8').toString('hex').padEnd(64, '0');

    it('decodes a bytes32 memo of printable UTF-8, trailing zero bytes stripped', () => {
        expect(displayMemo(b32('Catnip Heist campaign'))).toBe('Catnip Heist campaign');
        expect(displayMemo(b32('tt:treat:arc'))).toBe('tt:treat:arc');
        expect(displayMemo(b32('Pink Paw 🐾'))).toBe('Pink Paw 🐾');
        expect(displayMemo(b32('x'.repeat(32)))).toBe('x'.repeat(32));
        expect(displayMemo(b32('Catnip').toUpperCase().replace('0X', '0x'))).toBe('Catnip');
        // A text ending in a byte like 0xa0 or 0x40 keeps it (zeros are stripped by byte, not by nibble).
        expect(displayMemo(b32('a@'))).toBe('a@');
    });

    it('leaves anything else unchanged', () => {
        expect(displayMemo('Token Tails first payout')).toBe('Token Tails first payout');
        expect(displayMemo('')).toBe('');
        const zero = '0x' + '00'.repeat(32);
        expect(displayMemo(zero)).toBe(zero);
        const hash = '0x' + 'ab'.repeat(32);
        expect(displayMemo(hash)).toBe(hash);
        const control = '0x' + Buffer.from('ab\u0001cd').toString('hex').padEnd(64, '0');
        expect(displayMemo(control)).toBe(control);
        const interiorZero = '0x' + '4100' + '42'.padEnd(60, '0');
        expect(displayMemo(interiorZero)).toBe(interiorZero);
        const badUtf8 = '0x' + 'c328'.padEnd(64, '0');
        expect(displayMemo(badUtf8)).toBe(badUtf8);
        const short = '0x' + Buffer.from('Catnip').toString('hex');
        expect(displayMemo(short)).toBe(short);
    });
});

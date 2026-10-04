import { Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { DecodedRouterDonation, donateRouterInterface, erc20Interface, matchMemo, ROUTER_PATH } from './donate-router';
import { DonationBroadcastError, shelterSplitInterface } from './shelter-chain';
import { readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
import { giftBaseOf, ShelterMatchService } from './shelter-match.service';

const ROUTER = '0x4444444444444444444444444444444444444444';
const SPLIT = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x5555555555555555555555555555555555555555';
const NOW = new Date('2026-10-04T10:00:00Z');
// Throwaway keys made for this spec; they never hold anything.
const HOT = Wallet.createRandom();
const PAWS = '0x7777777777777777777777777777777777777777';
const SHELTER = '0x2222222222222222222222222222222222222222';
const TREASURY = '0x6666666666666666666666666666666666666666';
const TEAM = '0x8888888888888888888888888888888888888888';

const PAWS_ENV = process.env.IMPACT_PAWS_SENDERS;
beforeAll(() => {
    process.env.IMPACT_PAWS_SENDERS = PAWS;
});
afterAll(() => {
    if (PAWS_ENV === undefined) delete process.env.IMPACT_PAWS_SENDERS;
    else process.env.IMPACT_PAWS_SENDERS = PAWS_ENV;
});

function config(over: Partial<ShelterOnchainConfig> = {}): ShelterOnchainConfig {
    return {
        ...readShelterConfig({
            SHELTER_CHAIN_ID: '5042002',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_ROUTER_ADDRESS: ROUTER,
            SHELTER_MATCH_ENABLED: 'true',
            SHELTER_DONATE_PRIVATE_KEY: HOT.privateKey,
        } as NodeJS.ProcessEnv),
        ...over,
    };
}

let txCounter = 0;
const nextTx = () => '0x' + (++txCounter).toString(16).padStart(64, 'd');

function gift(over: Partial<DecodedRouterDonation> = {}): DecodedRouterDonation {
    return {
        donor: '0x' + '12'.repeat(20),
        amount: BigInt(500000),
        batchId: BigInt(1),
        path: ROUTER_PATH.AUTH,
        memo: 'tt:wallet:0a1b2c3d',
        nonce: '0x' + '0'.repeat(64),
        txHash: nextTx(),
        blockNumber: 10,
        logIndex: 0,
        router: ROUTER.toLowerCase(),
        ...over,
    };
}

function setup() {
    const matches = memoryModel({ unique: [['donorTxHash']], now: () => NOW });
    const counters = memoryModel({ unique: [['key']] });
    const scans = memoryModel({ unique: [['key']] });
    let n = 100;
    const signed = async (onSigned: any) => {
        const hash = '0x' + (++n).toString(16).padStart(64, 'b');
        await onSigned?.({ hash, nonce: n, from: HOT.address.toLowerCase() });
        return { hash, nonce: n, from: HOT.address.toLowerCase() };
    };
    const chain = {
        sendDonation: jest.fn(async (_c: any, _memo: string, _value: bigint, onSigned: any) => signed(onSigned)),
        sendContractCall: jest.fn(async (_to: string, _data: string, _v: bigint, opts: any) => {
            const tx = await signed(opts?.onSigned);
            return { txHash: tx.hash, nonce: tx.nonce, from: tx.from };
        }),
        ethCall: jest.fn<Promise<string>, any[]>(async () => '0x'),
        waitForReceipt: jest.fn(async (): Promise<any> => ({ status: 1 })),
        getReceipt: jest.fn(async (): Promise<any> => null),
        minedNonce: jest.fn(async () => 0),
        blockNumber: jest.fn(async () => 100),
        getRouterLogs: jest.fn<Promise<any[]>, any[]>(async () => []),
        blockTimestamp: jest.fn(async (): Promise<number | null> => Math.floor(NOW.getTime() / 1000) - 60),
    };
    // ShelterSplit's preview and treasury are answered separately, so the specs' ethCall mocks see only
    // the token and router reads. `toTreasury` defaults to 0: one shelter at 10000 bps.
    const previewSel = shelterSplitInterface.getFunction('preview')!.selector;
    const treasurySel = shelterSplitInterface.getFunction('treasury')!.selector;
    const split = { wallets: [SHELTER], toTreasury: BigInt(0) };
    const routed = {
        ...chain,
        ethCall: async (...args: any[]) => {
            const data = String(args[2]);
            if (data.startsWith(previewSel)) {
                const amount = shelterSplitInterface.decodeFunctionData('preview', data)[0];
                return shelterSplitInterface.encodeFunctionResult('preview', [
                    split.wallets,
                    split.wallets.map(() => amount - split.toTreasury),
                    split.toTreasury,
                ]);
            }
            if (data.startsWith(treasurySel)) {
                return shelterSplitInterface.encodeFunctionResult('treasury', [TREASURY]);
            }
            return (chain.ethCall as any)(...args);
        },
    };
    const service = new ShelterMatchService(matches as any, counters as any, scans as any, routed as any);
    return { matches, counters, scans, chain, split, service };
}

describe('ShelterMatchService.enqueue', () => {
    it('ignores the hot wallet, paw senders, flushes and other routers', async () => {
        const ctx = setup();
        const c = config();
        await expect(ctx.service.enqueue(gift({ donor: HOT.address.toLowerCase() }), c, NOW)).resolves.toBe('ignored');
        await expect(ctx.service.enqueue(gift({ donor: PAWS }), c, NOW)).resolves.toBe('ignored');
        await expect(ctx.service.enqueue(gift({ path: ROUTER_PATH.FLUSH }), c, NOW)).resolves.toBe('ignored');
        await expect(ctx.service.enqueue(gift({ router: SPLIT.toLowerCase() }), c, NOW)).resolves.toBe('ignored');
        expect(ctx.matches.rows).toHaveLength(0);
    });

    it('records a gift below the minimum as skipped-small, and a replayed log once', async () => {
        const ctx = setup();
        const small = gift({ amount: BigInt(99999) });
        await expect(ctx.service.enqueue(small, config(), NOW)).resolves.toBe('small');
        expect(ctx.matches.rows[0]).toMatchObject({ status: 'skipped-small', giftBase: '99999', matchBase: '0' });
        const g = gift();
        await expect(ctx.service.enqueue(g, config(), NOW)).resolves.toBe('queued');
        await expect(ctx.service.enqueue({ ...g }, config(), NOW)).resolves.toBe('duplicate');
        expect(ctx.matches.rows).toHaveLength(2);
    });

    it('scales a native Arc gift (18 decimals) to USDC base units, and skips native gifts elsewhere', () => {
        const native = { path: ROUTER_PATH.NATIVE, amount: BigInt('250000000000000000') };
        expect(giftBaseOf(native, 5042002)?.toString()).toBe('250000');
        expect(giftBaseOf(native, 84532)).toBeNull();
        expect(giftBaseOf({ path: ROUTER_PATH.AUTH, amount: BigInt(7) }, 84532)?.toString()).toBe('7');
    });
});

describe('ShelterMatchService.sendOne', () => {
    async function queued(ctx: ReturnType<typeof setup>, amount: number, c = config()) {
        const g = gift({ amount: BigInt(amount) });
        await ctx.service.enqueue(g, c, NOW);
        return { g, row: ctx.matches.rows.find(r => r.donorTxHash === g.txHash) as any };
    }

    it('matches 1:1 on Arc through ShelterSplit.donate with an 18-decimal value and the match memo', async () => {
        const ctx = setup();
        const { g, row } = await queued(ctx, 500000);
        await expect(ctx.service.sendOne(row, config(), NOW)).resolves.toBe('sent');
        const [, memo, value] = ctx.chain.sendDonation.mock.calls[0];
        expect(memo).toBe(matchMemo(g.txHash));
        expect(memo).toMatch(/^tt:match:[0-9a-f]{8}$/);
        expect(value.toString()).toBe('500000000000000000');
        expect(row).toMatchObject({ status: 'sent', matchBase: '500000', budgetHeld: true });
        expect(row.matchTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('caps the match at the per-gift amount', async () => {
        const ctx = setup();
        const { row } = await queued(ctx, 5000000);
        await ctx.service.sendOne(row, config(), NOW);
        expect(row.matchBase).toBe('1000000');
    });

    it('stops at the daily budget, then at the pool, as skipped-cap', async () => {
        const ctx = setup();
        const c = config({ matchDailyBase: BigInt(1500000), matchPoolBase: BigInt(10000000) });
        const a = await queued(ctx, 1000000, c);
        const b = await queued(ctx, 1000000, c);
        const d = await queued(ctx, 1000000, c);
        await ctx.service.sendOne(a.row, c, NOW);
        await ctx.service.sendOne(b.row, c, NOW);
        await expect(ctx.service.sendOne(d.row, c, NOW)).resolves.toBe('skipped');
        expect([a.row.matchBase, b.row.matchBase, d.row.status]).toEqual(['1000000', '500000', 'skipped-cap']);

        const ctx2 = setup();
        const c2 = config({ matchPoolBase: BigInt(1200000) });
        const x = await queued(ctx2, 1000000, c2);
        const y = await queued(ctx2, 1000000, c2);
        const z = await queued(ctx2, 1000000, c2);
        await ctx2.service.sendOne(x.row, c2, NOW);
        await ctx2.service.sendOne(y.row, c2, NOW);
        await ctx2.service.sendOne(z.row, c2, NOW);
        expect([x.row.matchBase, y.row.matchBase, z.row.status]).toEqual(['1000000', '200000', 'skipped-cap']);
        await expect(ctx2.service.status(NOW, c2)).resolves.toEqual({
            state: 'exhausted',
            chainId: c2.chainId,
            relay: false,
            perGift: '1',
            dailyLeft: '0.8',
            poolLeft: '0',
        });
    });

    it('never sends twice for the same donor transaction', async () => {
        const ctx = setup();
        const { row } = await queued(ctx, 500000);
        const snapshot = { ...row };
        await ctx.service.sendOne(row, config(), NOW);
        await expect(ctx.service.sendOne(snapshot, config(), NOW)).resolves.toBe('busy');
        expect(ctx.chain.sendDonation).toHaveBeenCalledTimes(1);
        const pool = ctx.counters.rows.find(r => r.key === 'match:pool:5042002');
        expect(pool?.used).toBe(500000);
    });

    it('on other chains approves exactly the match, waits, then disburses with the memo', async () => {
        const ctx = setup();
        const c = config({ chainId: 84532 });
        ctx.chain.ethCall.mockResolvedValue(shelterSplitInterface.encodeFunctionResult('token', [TOKEN]));
        const { g, row } = await queued(ctx, 300000, c);
        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 1 });
        await expect(ctx.service.sendOne(row, c, NOW)).resolves.toBe('sent');
        const [[approveTo, approveData], [disburseTo, disburseData]] = ctx.chain.sendContractCall.mock.calls;
        expect(approveTo).toBe(TOKEN);
        expect(erc20Interface.decodeFunctionData('approve', approveData).map(String)).toEqual([SPLIT, '300000']);
        expect(disburseTo).toBe(SPLIT);
        expect(shelterSplitInterface.decodeFunctionData('disburse', disburseData).map(String)).toEqual([
            '300000',
            matchMemo(g.txHash),
        ]);
        expect(ctx.chain.sendDonation).not.toHaveBeenCalled();
    });

    it('skips a match that would send part to the treasury, without taking budget', async () => {
        const ctx = setup();
        ctx.split.toTreasury = BigInt(1);
        const { row } = await queued(ctx, 500000);
        await expect(ctx.service.sendOne(row, config(), NOW)).resolves.toBe('skipped');
        expect(row).toMatchObject({ status: 'skipped-cap', failedReason: 'treasury-share' });
        expect(ctx.chain.sendDonation).not.toHaveBeenCalled();
        expect(ctx.counters.rows).toHaveLength(0);
    });

    it('outside Arc, does not match a gift whose receipt a reorg removed', async () => {
        const ctx = setup();
        const c = config({ chainId: 84532 });
        const { row } = await queued(ctx, 300000, c);
        ctx.chain.getReceipt.mockResolvedValueOnce(null);
        await expect(ctx.service.sendOne(row, c, NOW)).resolves.toBe('failed');
        expect(row).toMatchObject({ status: 'failed', failedReason: 'donor-missing' });
        expect(ctx.chain.sendContractCall).not.toHaveBeenCalled();
        expect(ctx.counters.rows).toHaveLength(0);
    });

    it('fails a definite refusal and gives the budget back', async () => {
        const ctx = setup();
        ctx.chain.sendDonation.mockRejectedValueOnce(
            new DonationBroadcastError(
                { hash: '0x' + 'f'.repeat(64), nonce: 1, from: 'x' },
                { code: 'INSUFFICIENT_FUNDS' }
            )
        );
        const { row } = await queued(ctx, 500000);
        await expect(ctx.service.sendOne(row, config(), NOW)).resolves.toBe('failed');
        expect(row.status).toBe('failed');
        expect(ctx.counters.rows.every(r => r.used === 0)).toBe(true);
    });
});

describe('ShelterMatchService.runOnce', () => {
    it('scans RouterDonation logs, sends the match, then confirms it by receipt', async () => {
        const ctx = setup();
        const donor = '0x' + '12'.repeat(20);
        const event = donateRouterInterface.encodeEventLog('RouterDonation', [
            donor,
            750000,
            3,
            0,
            'tt:wallet:0a1b2c3d',
            '0x' + '0'.repeat(64),
        ]);
        const donorTx = nextTx();
        ctx.chain.getRouterLogs.mockResolvedValueOnce([
            {
                address: ROUTER,
                topics: event.topics,
                data: event.data,
                blockNumber: '0x5',
                transactionHash: donorTx,
                logIndex: '0x0',
            },
        ]);
        const c = config({ routerFromBlock: 1 });
        const first = await ctx.service.runOnce(NOW, c);
        expect(first).toMatchObject({ scanned: 1, queued: 1, sent: 1 });
        expect(ctx.scans.rows[0]).toMatchObject({ lastBlock: 100 });
        const row = ctx.matches.rows[0];
        expect(row).toMatchObject({ donorTxHash: donorTx, donorFrom: donor, matchBase: '750000', status: 'sent' });

        ctx.chain.getReceipt.mockResolvedValueOnce({ status: 1 });
        ctx.chain.blockNumber.mockResolvedValueOnce(150);
        const second = await ctx.service.runOnce(NOW, c);
        expect(second).toMatchObject({ scanned: 0, confirmed: 1 });
        await expect(ctx.service.byDonor(donorTx)).resolves.toEqual({
            status: 'confirmed',
            matchTxHash: row.matchTxHash,
        });
        // The scan continues from the stored block.
        expect(ctx.chain.getRouterLogs.mock.calls[1][1]).toBe(101);
    });

    it('does not scan or send on mainnet before the handover, and reports awaiting-handover', async () => {
        const ctx = setup();
        const c = config({ chainId: 5042, handedOver: false });
        await ctx.service.runOnce(NOW, c);
        expect(ctx.chain.getRouterLogs).not.toHaveBeenCalled();
        expect(ctx.chain.sendContractCall).not.toHaveBeenCalled();
        // Handed over by flag but no claim service to verify the recipients: still closed.
        await expect(ctx.service.status(NOW, config({ chainId: 5042, handedOver: true }))).resolves.toMatchObject({
            state: 'awaiting-handover',
        });
        await expect(ctx.service.status(NOW, c)).resolves.toMatchObject({ state: 'awaiting-handover' });
        await expect(ctx.service.status(NOW, config({ matchEnabled: false }))).resolves.toMatchObject({ state: 'off' });
        await expect(ctx.service.status(NOW, config())).resolves.toEqual({
            state: 'live',
            chainId: config().chainId,
            relay: false,
            perGift: '1',
            dailyLeft: '2',
            poolLeft: '10',
        });
        // The relay flag reports the gas relay on the same chain, so the page can promise "no gas coin".
        await expect(ctx.service.status(NOW, config({ relayEnabled: true }))).resolves.toMatchObject({ relay: true });
    });

    it('flushes a stray router balance at most once an hour', async () => {
        const ctx = setup();
        ctx.chain.ethCall.mockImplementation(async (_c: any, to: string, data: string) => {
            if (to === ROUTER && data === donateRouterInterface.encodeFunctionData('usdc', [])) {
                return donateRouterInterface.encodeFunctionResult('usdc', [TOKEN]);
            }
            return erc20Interface.encodeFunctionResult('balanceOf', [20000]);
        });
        const c = config();
        const first = await ctx.service.runOnce(NOW, c);
        expect(first.flushTx).toMatch(/^0x/);
        const [to, data] = ctx.chain.sendContractCall.mock.calls[0];
        expect(to).toBe(ROUTER);
        expect(donateRouterInterface.decodeFunctionData('flush', data)[0]).toBe('tt:flush');
        const again = await ctx.service.runOnce(new Date(NOW.getTime() + 30 * 60 * 1000), c);
        expect(again.flushTx).toBeUndefined();
        const later = await ctx.service.runOnce(new Date(NOW.getTime() + 61 * 60 * 1000), c);
        expect(later.flushTx).toMatch(/^0x/);
    });

    it('does not flush dust below 0.01 USDC', async () => {
        const ctx = setup();
        ctx.chain.ethCall.mockImplementation(async (_c: any, to: string) =>
            to === ROUTER
                ? donateRouterInterface.encodeFunctionResult('usdc', [TOKEN])
                : erc20Interface.encodeFunctionResult('balanceOf', [9999])
        );
        await expect(ctx.service.flushIfNeeded(config(), NOW)).resolves.toBeNull();
    });
});

describe('ShelterMatchService exclusions, cursor and age', () => {
    function routerLog(donor: string, amount: number, block: number) {
        const event = donateRouterInterface.encodeEventLog('RouterDonation', [
            donor,
            amount,
            3,
            0,
            'tt:wallet:0a1b2c3d',
            '0x' + '0'.repeat(64),
        ]);
        return {
            address: ROUTER,
            topics: event.topics,
            data: event.data,
            blockNumber: '0x' + block.toString(16),
            transactionHash: nextTx(),
            logIndex: '0x0',
        };
    }

    it('never matches team wallets, the shelter itself (a round trip) or the treasury', async () => {
        const ctx = setup();
        ctx.chain.getRouterLogs.mockResolvedValueOnce([
            routerLog(TEAM, 500000, 5),
            routerLog(SHELTER, 500000, 5),
            routerLog(TREASURY, 500000, 5),
            routerLog('0x' + '12'.repeat(20), 500000, 5),
        ]);
        const c = config({ routerFromBlock: 1, notPublicWallets: [TEAM] });
        const result = await ctx.service.runOnce(NOW, c);
        expect(result).toMatchObject({ scanned: 4, queued: 1, sent: 1 });
        expect(ctx.matches.rows.map(r => r.donorFrom)).toEqual(['0x' + '12'.repeat(20)]);
    });

    it('moves the cursor past gifts made while the match is off, so turning it on pays nothing old', async () => {
        const ctx = setup();
        await ctx.service.runOnce(NOW, config({ matchEnabled: false, routerFromBlock: 1 }));
        expect(ctx.scans.rows[0]).toMatchObject({ lastBlock: 100 });
        expect(ctx.chain.getRouterLogs).not.toHaveBeenCalled();
        ctx.chain.blockNumber.mockResolvedValue(120);
        await ctx.service.runOnce(NOW, config({ routerFromBlock: 1 }));
        expect(ctx.chain.getRouterLogs.mock.calls[0].slice(1)).toEqual([101, 120]);
    });

    it('skips gifts older than a day (first enable with an old SHELTER_ROUTER_FROM_BLOCK)', async () => {
        const ctx = setup();
        ctx.chain.getRouterLogs.mockResolvedValueOnce([routerLog('0x' + '12'.repeat(20), 500000, 5)]);
        ctx.chain.blockTimestamp.mockResolvedValueOnce(Math.floor(NOW.getTime() / 1000) - 2 * 24 * 3600);
        const result = await ctx.service.runOnce(NOW, config({ routerFromBlock: 1 }));
        expect(result).toMatchObject({ scanned: 1, queued: 0 });
        expect(ctx.matches.rows).toHaveLength(0);
    });

    it('stays 12 blocks behind the head outside Arc', async () => {
        const ctx = setup();
        await ctx.service.runOnce(NOW, config({ chainId: 84532, routerFromBlock: 1 }));
        expect(ctx.chain.getRouterLogs.mock.calls[0].slice(1)).toEqual([1, 88]);
    });

    it('lets only one of two instances flush in the same hour', async () => {
        const ctx = setup();
        ctx.chain.ethCall.mockImplementation(async (_c: any, to: string) =>
            to === ROUTER
                ? donateRouterInterface.encodeFunctionResult('usdc', [TOKEN])
                : erc20Interface.encodeFunctionResult('balanceOf', [20000])
        );
        const [a, b] = await Promise.all([
            ctx.service.flushIfNeeded(config(), NOW),
            ctx.service.flushIfNeeded(config(), NOW),
        ]);
        expect([a, b].filter(Boolean)).toHaveLength(1);
        expect(ctx.chain.sendContractCall).toHaveBeenCalledTimes(1);
    });
});

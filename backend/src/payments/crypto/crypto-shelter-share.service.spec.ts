import { Types } from 'mongoose';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { DonationBroadcastError, shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import { readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { erc20PayInterface } from './crypto-evm';
import { readCryptoPayConfig } from './crypto-pay.config';
import {
    CryptoShelterShareService,
    disbursedShelters,
    SHELTER_SHARE_STUCK_MS,
    shareTier,
} from './crypto-shelter-share.service';

/*
 * The treasury-route shelter share keeper: Token Tails' own float, through ShelterSplit.disburse, once
 * per row, settled by receipt; never repeated while its fate is unknown.
 */

const SPLIT = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x3600000000000000000000000000000000000000';
// A throwaway 32-byte value; ShelterChain is faked, nothing is ever signed with it.
const FAKE_KEY = '0x' + 'ab'.repeat(32);
const T0 = new Date('2026-10-04T12:00:00Z');
const MEMO = 'tt:cat:9f2c4e1a7b3d5e60';

/** The split's batch event of a disburse: `toShelters` of `amount` went to shelters, the rest to its treasury. */
function batchReceipt(amount: bigint, toShelters: bigint, memo = MEMO, address = SPLIT) {
    const { topics, data } = shelterSplitInterface.encodeEventLog('DisbursementBatch', [
        1,
        '0x00000000000000000000000000000000000000aa',
        amount,
        toShelters,
        amount - toShelters,
        1,
        memo,
    ]);
    return { status: 1, logs: [{ address, topics, data }] };
}

/** The split's per-shelter event of a disburse. */
function disbursedLog(wallet: string, amount: bigint, memo = MEMO) {
    const { topics, data } = shelterSplitInterface.encodeEventLog('Disbursed', [wallet, amount, memo]);
    return { topics, data };
}

const shelter = readShelterConfig({
    SHELTER_CHAIN_ID: '5042002',
    SHELTER_ARC_RPC_URL: 'http://127.0.0.1:8545',
    SHELTER_SPLIT_ADDRESS: SPLIT,
    SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
});
const cfg = (extra: Record<string, string> = {}) =>
    readCryptoPayConfig({ CRYPTO_PAY_SHELTER_SHARE_ENABLED: 'true', ...extra });

function setup({ allowance = BigInt(0) } = {}) {
    const model: any = memoryModel();
    const calls: { to: string; data: string }[] = [];
    let n = 0;
    const chain = {
        ethCall: jest.fn(async (_c: unknown, to: string, data: string) => {
            if (to === SPLIT) return shelterSplitInterface.encodeFunctionResult('token', [TOKEN]);
            if (data === erc20PayInterface.encodeFunctionData('decimals', []))
                return erc20PayInterface.encodeFunctionResult('decimals', [6]);
            return erc20PayInterface.encodeFunctionResult('allowance', [allowance]);
        }),
        sendContractCall: jest.fn(async (to: string, data: string, _v: bigint, opts: any) => {
            calls.push({ to, data });
            const tx = { hash: '0x' + (++n).toString(16).padStart(64, '0'), nonce: n, from: '0xhot' };
            await opts?.onSigned?.(tx);
            return { txHash: tx.hash, nonce: tx.nonce, from: tx.from };
        }),
        waitForReceipt: jest.fn(async () => ({ status: 1 })),
        getReceipt: jest.fn(async () => null as any),
        minedNonce: jest.fn(async () => 0),
    };
    const service = new CryptoShelterShareService(model, chain as any);
    const addDue = (cents: number, extra: Record<string, unknown> = {}) =>
        model.rows.push({
            _id: new Types.ObjectId(),
            orderId: 'co_9f2c4e1a7b3d5e60',
            shelterShare: {
                route: 'treasury',
                bps: 5000,
                state: 'due',
                evidenceTier: 'pledged',
                amountUsdCents: cents,
                memo: 'tt:cat:9f2c4e1a7b3d5e60',
                attempts: 0,
                ...extra,
            },
        });
    return { service, model, chain, calls, addDue };
}

describe('CryptoShelterShareService', () => {
    it('does nothing unless enabled and the hot wallet, split and RPC are configured', async () => {
        const { service, chain } = setup();
        expect((await service.runOnce(T0, readCryptoPayConfig({}), shelter)).skipped).toBe('disabled');
        expect((await service.runOnce(T0, cfg(), readShelterConfig({}))).skipped).toBe('not-ready');
        expect(chain.sendContractCall).not.toHaveBeenCalled();
    });

    it('approves the split once, then disburses the share with the order memo and stores the hash before broadcast', async () => {
        const { service, model, calls, addDue } = setup();
        addDue(250);
        const run = await service.runOnce(T0, cfg(), shelter);
        expect(run).toEqual({ sent: 1, confirmed: 0, failed: 0, skipped: null });
        expect(calls.map(c => c.to)).toEqual([TOKEN, SPLIT]);
        expect(erc20PayInterface.decodeFunctionData('approve', calls[0].data)[0]).toBe(SPLIT);
        expect(shelterSplitInterface.decodeFunctionData('disburse', calls[1].data)).toEqual([
            BigInt(2500000),
            'tt:cat:9f2c4e1a7b3d5e60',
        ]);
        expect(model.rows[0].shelterShare).toEqual(
            expect.objectContaining({ state: 'sent', sentBase: '2500000', decimals: 6, chainId: 5042002, nonce: 2 })
        );
    });

    it('skips the approve when the allowance covers the share', async () => {
        const { service, calls, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250);
        await service.runOnce(T0, cfg(), shelter);
        expect(calls.map(c => c.to)).toEqual([SPLIT]);
    });

    it('confirms by receipt: on-chain custodial before the handover, shelter-held after', async () => {
        for (const [handedOver, tier] of [
            ['false', 'onchain-custodial'],
            ['true', 'onchain-shelter-held'],
        ]) {
            const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
            addDue(250);
            await service.runOnce(T0, cfg({ SHELTER_HANDED_OVER: handedOver }), shelter);
            chain.getReceipt.mockResolvedValueOnce(batchReceipt(BigInt(2500000), BigInt(2500000)));
            const run = await service.runOnce(T0, cfg({ SHELTER_HANDED_OVER: handedOver }), shelter);
            expect(run.confirmed).toBe(1);
            expect(model.rows[0].shelterShare).toEqual(
                expect.objectContaining({ state: 'confirmed', evidenceTier: tier })
            );
        }
    });

    it('keeps a share sent before the handover custodial when its receipt is read after it', async () => {
        // The E2E case (funding/framework/tracks/a-build/e2e-pay-goal, flow Q2): sent to the held wallet,
        // backend restarted with SHELTER_HANDED_OVER=true, then settled.
        const HELD = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
        const OWN = '0x14dc79964da2c08b23698b3d3cc7ca32193d9955';
        const handed = cfg({ SHELTER_HANDED_OVER: 'true', SHELTER_HELD_WALLETS: HELD });
        for (const [payee, tier] of [
            [HELD, 'onchain-custodial'],
            [OWN, 'onchain-shelter-held'],
        ]) {
            const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
            addDue(250);
            await service.runOnce(T0, cfg(), shelter);
            const receipt = batchReceipt(BigInt(2500000), BigInt(2500000));
            receipt.logs.push({ address: SPLIT, ...disbursedLog(payee, BigInt(2500000)) });
            chain.getReceipt.mockResolvedValueOnce(receipt);
            await service.runOnce(T0, handed, shelter);
            expect(model.rows[0].shelterShare).toEqual(
                expect.objectContaining({ state: 'confirmed', evidenceTier: tier })
            );
        }
    });

    it('reads the paid shelters from the split only, and the tier from them', () => {
        const HELD = '0x00000000000000000000000000000000000000c1';
        const log = { address: SPLIT, ...disbursedLog(HELD, BigInt(1)) };
        expect(disbursedShelters([log], SPLIT, MEMO)).toEqual([HELD]);
        expect(disbursedShelters([log], SPLIT, 'tt:cat:other')).toEqual([]);
        expect(disbursedShelters([{ ...log, address: '0x' + '22'.repeat(20) }], SPLIT, MEMO)).toEqual([]);
        expect(shareTier(false, [], new Set())).toBe('onchain-custodial');
        expect(shareTier(true, [HELD], new Set([HELD]))).toBe('onchain-custodial');
        expect(shareTier(true, ['0x' + '33'.repeat(20)], new Set([HELD]))).toBe('onchain-shelter-held');
    });

    it('records what reached the shelter from the batch event, not what was sent', async () => {
        const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250);
        await service.runOnce(T0, cfg(), shelter);
        // The split pays its shelters 80% and keeps the rest for its own treasury.
        chain.getReceipt.mockResolvedValueOnce(batchReceipt(BigInt(2500000), BigInt(2000000)));
        await service.runOnce(T0, cfg(), shelter);
        expect(model.rows[0].shelterShare).toEqual(
            expect.objectContaining({
                state: 'confirmed',
                sentBase: '2500000',
                amountBase: '2000000',
                amountUsdCents: 200,
            })
        );
    });

    it('marks a mined send without its batch event (another memo, another contract) failed for a person', async () => {
        for (const receipt of [
            { status: 1, logs: [] },
            batchReceipt(BigInt(2500000), BigInt(2500000), 'tt:cat:0000000000000000'),
            batchReceipt(BigInt(2500000), BigInt(2500000), MEMO, TOKEN),
        ]) {
            const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
            addDue(250);
            await service.runOnce(T0, cfg(), shelter);
            chain.getReceipt.mockResolvedValueOnce(receipt);
            const run = await service.runOnce(T0, cfg(), shelter);
            expect(run.failed).toBe(1);
            expect(model.rows[0].shelterShare.state).toBe('failed');
        }
    });

    it('puts a row left sending with no hash (a crash before signing) back to due after a while', async () => {
        const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250, { state: 'sending', lockedAt: T0 });
        chain.sendContractCall.mockRejectedValue(new Error('rpc down'));
        await service.runOnce(new Date(T0.getTime() + 60000), cfg(), shelter);
        expect(model.rows[0].shelterShare.state).toBe('sending');
        await service.runOnce(new Date(T0.getTime() + SHELTER_SHARE_STUCK_MS + 1000), cfg(), shelter);
        // Back to due, taken again by the same run, and put back to due by the refused send.
        expect(model.rows[0].shelterShare.state).toBe('due');
        expect(chain.sendContractCall).toHaveBeenCalledTimes(1);
    });

    it('sends a reverted share again at most twice more, then marks it failed', async () => {
        const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250);
        for (let i = 0; i < 3; i++) {
            await service.runOnce(T0, cfg(), shelter);
            chain.getReceipt.mockResolvedValueOnce({ status: 0 });
        }
        await service.runOnce(T0, cfg(), shelter);
        expect(model.rows[0].shelterShare).toEqual(
            expect.objectContaining({ state: 'failed', attempts: 3, error: 'reverted' })
        );
        expect(chain.sendContractCall).toHaveBeenCalledTimes(3);
    });

    it('never resends a share whose broadcast was ambiguous; a stuck one fails only once its nonce is used', async () => {
        const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250);
        chain.sendContractCall.mockImplementationOnce(async (_to: string, _d: string, _v: bigint, opts: any) => {
            const tx = { hash: '0x' + 'cd'.repeat(32), nonce: 7, from: '0xhot' };
            await opts.onSigned(tx);
            throw new DonationBroadcastError(tx, { code: 'TIMEOUT' });
        });
        await service.runOnce(T0, cfg(), shelter);
        expect(model.rows[0].shelterShare.state).toBe('sent');
        await service.runOnce(new Date(T0.getTime() + 60000), cfg(), shelter);
        expect(chain.sendContractCall).toHaveBeenCalledTimes(1);
        chain.minedNonce.mockResolvedValue(8);
        await service.runOnce(new Date(T0.getTime() + SHELTER_SHARE_STUCK_MS + 1000), cfg(), shelter);
        expect(model.rows[0].shelterShare).toEqual(
            expect.objectContaining({ state: 'failed', error: 'dropped: check by hand' })
        );
    });

    it('puts a share back to due when the node refused it outright, and stops the run', async () => {
        const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
        addDue(250);
        addDue(100);
        chain.sendContractCall.mockRejectedValueOnce(new Error('insufficient funds'));
        const run = await service.runOnce(T0, cfg(), shelter);
        expect(run.sent).toBe(0);
        expect(model.rows.map((r: any) => r.shelterShare.state)).toEqual(['due', 'due']);
        expect(chain.sendContractCall).toHaveBeenCalledTimes(1);
    });
});

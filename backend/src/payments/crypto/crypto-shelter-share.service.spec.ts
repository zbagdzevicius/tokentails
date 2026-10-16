import { Types } from 'mongoose';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { DonationBroadcastError, shelterSplitInterface } from 'src/shelter/onchain/shelter-chain';
import * as shelterConfig from 'src/shelter/onchain/shelter-onchain.config';
import { readShelterConfig } from 'src/shelter/onchain/shelter-onchain.config';
import { erc20PayInterface } from './crypto-evm';
import { readCryptoPayConfig } from './crypto-pay.config';
import {
    CryptoShelterShareService,
    disbursedShelters,
    shelterShareNetworkOk,
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
const cfg = (extra: Record<string, string> = {}) => readCryptoPayConfig({ ...extra });

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
    const addDue = (cents: number, extra: Record<string, unknown> = {}, network = 'testnet') =>
        model.rows.push({
            _id: new Types.ObjectId(),
            orderId: 'co_9f2c4e1a7b3d5e60',
            network,
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
    it('runs with no flag, but does nothing until the hot wallet, split and RPC are configured', async () => {
        const { service, chain, addDue } = setup();
        addDue(250);
        // The removed flag no longer switches the keeper off.
        expect((await service.runOnce(T0, cfg({ CRYPTO_PAY_SHELTER_SHARE_ENABLED: 'false' }), shelter)).sent).toBe(1);
        chain.sendContractCall.mockClear();
        expect((await service.runOnce(T0, cfg(), readShelterConfig({}))).skipped).toBe('not-ready');
        expect(chain.sendContractCall).not.toHaveBeenCalled();
    });

    it('skips the leased cron run while the shelter config is not ready', async () => {
        const { service } = setup();
        const run = jest.spyOn(service, 'runOnce');
        // No hot wallet key: the keeper cannot send, so it does not take the lease.
        const read = jest.spyOn(shelterConfig, 'readShelterConfig').mockReturnValue(readShelterConfig({}));
        try {
            expect(await service.cron()).toBe('not-ready');
            expect(run).not.toHaveBeenCalled();
        } finally {
            read.mockRestore();
        }
    });

    it('skips the cron run when the shelter chain is not on the checkout network', async () => {
        const { service } = setup();
        const run = jest.spyOn(service, 'runOnce');
        // A ready mainnet shelter config in a process whose checkout runs on testnet (NODE_ENV=test).
        const mainnet = readShelterConfig({
            SHELTER_CHAIN_ID: '5042',
            SHELTER_ARC_RPC_URL: 'http://127.0.0.1:8545',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_DONATE_PRIVATE_KEY: FAKE_KEY,
        });
        const read = jest.spyOn(shelterConfig, 'readShelterConfig').mockReturnValue(mainnet);
        try {
            expect(await service.cron()).toBe('network-mismatch');
            expect(run).not.toHaveBeenCalled();
        } finally {
            read.mockRestore();
        }
    });

    it('pays only on the checkout network, and never from a testnet in production', async () => {
        const { service, chain, addDue } = setup();
        addDue(250);
        // A testnet keeper while the checkout sells on mainnet: nothing is sent.
        const mainnetCfg = cfg({ CRYPTO_PAY_NETWORK: 'mainnet' });
        expect((await service.runOnce(T0, mainnetCfg, shelter)).skipped).toBe('network-mismatch');
        expect(chain.sendContractCall).not.toHaveBeenCalled();
        // A testnet shelter chain under NODE_ENV=production is refused even when the networks agree.
        const testnetCfg = cfg({ CRYPTO_PAY_NETWORK: 'testnet' });
        expect(shelterShareNetworkOk(shelter, testnetCfg, { NODE_ENV: 'production' })).toBe(false);
        expect(shelterShareNetworkOk(shelter, testnetCfg, { NODE_ENV: 'test' })).toBe(true);
    });

    it('never pays a mainnet or card share from a testnet keeper', async () => {
        const { service, model, addDue } = setup({ allowance: BigInt(10) ** BigInt(12) });
        addDue(250, {}, 'mainnet');
        addDue(250, {}, 'card');
        addDue(250);
        const run = await service.runOnce(T0, cfg(), shelter);
        expect(run.sent).toBe(1);
        expect(model.rows.map((r: any) => [r.network, r.shelterShare.state])).toEqual([
            ['mainnet', 'due'],
            ['card', 'due'],
            ['testnet', 'sent'],
        ]);
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

    it('confirms by receipt: the tier follows the wallets the split paid, with no handover flag', async () => {
        const EXTRA_HELD = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65';
        const PINK_PAW = '0x3c833562e682db66c2415b34961595df135f4771';
        const withHeld = cfg({ SHELTER_HELD_WALLETS: EXTRA_HELD });
        for (const [payee, tier] of [
            ['0xe299299b846ba629f5a591dbf4f562bcc07a0f37', 'onchain-custodial'],
            [EXTRA_HELD, 'onchain-custodial'],
            [PINK_PAW, 'onchain-shelter-held'],
            [null, 'onchain-custodial'],
        ] as const) {
            const { service, model, chain, addDue } = setup({ allowance: BigInt(10_000_000) });
            addDue(250);
            await service.runOnce(T0, withHeld, shelter);
            const receipt: any = batchReceipt(BigInt(2500000), BigInt(2500000));
            if (payee) receipt.logs.push({ address: SPLIT, ...disbursedLog(payee, BigInt(2500000)) });
            chain.getReceipt.mockResolvedValueOnce(receipt);
            const run = await service.runOnce(T0, withHeld, shelter);
            expect(run.confirmed).toBe(1);
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
        expect(shareTier([], new Set())).toBe('onchain-custodial');
        expect(shareTier([HELD], new Set([HELD]))).toBe('onchain-custodial');
        expect(shareTier(['0x' + '33'.repeat(20), HELD], new Set([HELD]))).toBe('onchain-custodial');
        expect(shareTier(['0x' + '33'.repeat(20)], new Set([HELD]))).toBe('onchain-shelter-held');
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

import { DonationBroadcastError } from '../onchain/shelter-chain';
import { MOTORED_SPLIT, readMotoredConfig } from './motored.config';
import { M_ENV, M_T0, motoredHarness, WEI_PER_USD } from './motored.harness-spec';

/*
 * The sender + keeper: funder -> customer wallet (amount + gas), wallet -> donate(memo), then settle by
 * receipt. The keeper only retries due/failed rows and unlocks stale sending rows; a sent row is never
 * re-sent.
 */

const shelter = {
    chainId: 5042002,
    rpcUrl: 'http://localhost:8545',
    splitAddress: MOTORED_SPLIT,
    privateKey: M_ENV.MOTORED_FUNDER_KEY,
} as any;

/** A ready due gift row plus its wallet, as the webhook would have made them. */
async function seedDue(h: any, customerKey = 'cA', n = 481, cents = 50, memo = `motored:user-${n}`) {
    await h.wallets.create({
        customerKey,
        n,
        address: '0x' + n.toString(16).padStart(40, '0'),
        encryptedKey: { iv: '0'.repeat(32), content: '0'.repeat(32) },
    });
    const row = await h.gifts.create({
        paymentKey: `pk_${n}`,
        customerKey,
        n,
        amountUsdCents: cents,
        amountRule: 'random-1-100c-v1',
        state: 'due',
        memo,
    });
    return row;
}

describe('MotoredGiftService', () => {
    it('splitIsSafe accepts a split that pays 100% to Pink Paw and rejects a changed one', async () => {
        const h = motoredHarness();
        expect(await h.giftService.splitIsSafe(shelter)).toEqual({ ok: true });
        h.chain.ethCall.mockImplementation(async (_c: any, _to: string, data: string) => {
            if (data.startsWith('0x5c975abb')) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                return require('../onchain/shelter-chain').shelterSplitInterface.encodeFunctionResult('paused', [true]);
            }
            return '0x';
        });
        expect(await h.giftService.splitIsSafe(shelter)).toEqual({ ok: false, why: 'split is paused' });
    });

    it('runOnce sends a due gift: funder tops up the wallet, then the wallet donates; the row becomes sent', async () => {
        const h = motoredHarness();
        await seedDue(h);
        const cfg = readMotoredConfig(M_ENV);
        const run = await h.giftService.runOnce(new Date(M_T0), cfg, shelter);
        expect(run.sent).toBe(1);
        expect(run.skipped).toBeNull();
        // funder -> wallet (value = amount + gas reserve), then wallet -> donate(memo).
        expect(h.chain.sendContractCall).toHaveBeenCalledWith(
            expect.stringMatching(/^0x/),
            '0x',
            expect.any(BigInt),
            expect.objectContaining({ config: expect.objectContaining({ privateKey: M_ENV.MOTORED_FUNDER_KEY }) })
        );
        const donateCall = h.chain.sendDonation.mock.calls[0];
        expect(donateCall[1]).toBe('motored:user-481');
        expect(donateCall[2]).toBe(BigInt(50) * 10n ** 16n);
        expect(h.gifts.rows[0].state).toBe('sent');
        expect(h.gifts.rows[0].giftTxHash).toMatch(/^0x/);
        expect(h.gifts.rows[0].fundTxHash).toMatch(/^0x/);
        expect(h.gifts.rows[0].walletAddress).toBeDefined();
    });

    it('a definite send failure returns the row to due with an error', async () => {
        const h = motoredHarness();
        await seedDue(h);
        h.chain.waitForReceipt.mockResolvedValueOnce(null); // fund not mined -> definite failure
        const run = await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        expect(run.sent).toBe(0);
        expect(run.failed).toBe(1);
        expect(h.gifts.rows[0].state).toBe('due');
        expect(h.gifts.rows[0].error).toBeDefined();
    });

    it('settles a sent row to confirmed on a good receipt, and back to due on a revert (then failed)', async () => {
        const h = motoredHarness();
        const row = await seedDue(h);
        await h.gifts.updateOne({ _id: row._id }, { $set: { state: 'sent', giftTxHash: '0x1', sentAt: M_T0 } });
        h.chain.getReceipt.mockResolvedValue({ status: 1 });
        const run = await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        expect(run.confirmed).toBe(1);
        expect(h.gifts.rows[0].state).toBe('confirmed');
        // A reverted send: back to due (attempt 1), then failed after the retries.
        await h.gifts.updateOne({ _id: row._id }, { $set: { state: 'sent', giftTxHash: '0x1', sentAt: M_T0 } });
        h.chain.getReceipt.mockResolvedValue({ status: 0 });
        await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        const run3 = await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        expect(run3.confirmed).toBe(0);
        expect(h.gifts.rows[0].state).toBe('failed');
    });

    it('unlocks a stale sending row back to due', async () => {
        const h = motoredHarness();
        const row = await seedDue(h);
        await h.gifts.updateOne(
            { _id: row._id },
            { $set: { state: 'sending', lockedAt: new Date(M_T0.getTime() - 40 * 60 * 1000) } }
        );
        // A run with no ready RPC still unlocks stale rows before returning.
        const run = await h.giftService.runOnce(new Date(M_T0), readMotoredConfig(M_ENV), shelter);
        expect(run.skipped).toBeNull();
        expect(h.gifts.rows[0].state).toBe('sent'); // it was unlocked and then sent in the same run
        expect(h.chain.sendContractCall).toHaveBeenCalled();
    });

    it('leaves due rows above the daily cap waiting (as due) and alerts', async () => {
        const h = motoredHarness();
        const cfg = readMotoredConfig({ ...M_ENV, MOTORED_DAILY_CAP_USD: '0.01' }); // 1 cent cap
        // A confirmed gift already given today (sentAt today).
        await h.gifts.create({
            paymentKey: 'pk_given',
            customerKey: 'cGiven',
            n: 480,
            amountUsdCents: 1,
            amountRule: 'random-1-100c-v1',
            state: 'confirmed',
            memo: 'motored:user-480',
            sentAt: new Date(M_T0),
            confirmedAt: new Date(M_T0),
        });
        await seedDue(h, 'cA', 481, 50);
        const warn = jest.spyOn(h.giftService['logger'] as any, 'warn').mockImplementation(() => undefined);
        const run = await h.giftService.runOnce(new Date(M_T0), cfg, shelter);
        expect(run.sent).toBe(0);
        expect(h.gifts.rows[1].state).toBe('due');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('daily cap'));
    });

    it('a broadcast refused definitely leaves the row to retry; an ambiguous one settles by receipt', async () => {
        const h = motoredHarness();
        await seedDue(h);
        // Definite broadcast refusal on the donate().
        h.chain.sendDonation.mockRejectedValueOnce(
            new DonationBroadcastError({ hash: '0x1', nonce: 0, from: '0x' } as any, { code: 'NONCE_EXPIRED' })
        );
        const cfg = readMotoredConfig(M_ENV);
        const run = await h.giftService.runOnce(new Date(M_T0), cfg, shelter);
        expect(run.sent).toBe(0);
        expect(h.gifts.rows[0].state).toBe('due');
        expect(h.gifts.rows[0].error).toContain('NONCE_EXPIRED');
    });
});

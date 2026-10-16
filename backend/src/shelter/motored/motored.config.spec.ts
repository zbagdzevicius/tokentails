import {
    amountFor,
    customerKey,
    decryptWalletKey,
    encryptWalletKey,
    motoredGasTerms,
    motoredMemo,
    motoredMissing,
    motoredReady,
    motoredSweepMemo,
    MOTORED_AMOUNT_MAX_CENTS,
    MOTORED_AMOUNT_MIN_CENTS,
    MOTORED_FIRST_CUSTOMER_N,
    paymentKey,
    readMotoredConfig,
} from './motored.config';
import { M_ENV } from './motored.harness-spec';

describe('motored.config', () => {
    it('is ready only when every required secret is set (no _ENABLED flag)', () => {
        expect(motoredReady(M_ENV)).toBe(true);
        expect(motoredMissing(readMotoredConfig({}))).toEqual([
            'MOTORED_STRIPE_WEBHOOK_SECRET',
            'MOTORED_FUNDER_KEY',
            'MOTORED_WALLET_KEK',
            'MOTORED_CUSTOMER_SALT',
            'MOTORED_AMOUNT_SALT',
            'MOTORED_DAILY_CAP_USD',
        ]);
        const oneMissing = { ...M_ENV, MOTORED_DAILY_CAP_USD: '' };
        expect(motoredReady(oneMissing)).toBe(false);
        expect(motoredMissing(readMotoredConfig(oneMissing))).toEqual(['MOTORED_DAILY_CAP_USD']);
    });

    it('derives the customer and payment keys from the salt (no raw ids are ever stored)', () => {
        const a = customerKey('cus_A', M_ENV.MOTORED_CUSTOMER_SALT!);
        const b = customerKey('cus_A', M_ENV.MOTORED_CUSTOMER_SALT!);
        const c = customerKey('cus_B', M_ENV.MOTORED_CUSTOMER_SALT!);
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
        expect(a).not.toBe(c);
        expect(a).not.toContain('cus_A');
        const pk = paymentKey('pi_1', M_ENV.MOTORED_CUSTOMER_SALT!);
        expect(pk).not.toBe(a);
    });

    it('amounts are deterministic whole cents from 1¢ to $1.00 (the row key alone recomputes them)', () => {
        const salt = M_ENV.MOTORED_AMOUNT_SALT!;
        const pk = paymentKey('pi_1', M_ENV.MOTORED_CUSTOMER_SALT!);
        const first = amountFor(pk, salt);
        expect(Number.isInteger(first)).toBe(true);
        expect(first).toBeGreaterThanOrEqual(MOTORED_AMOUNT_MIN_CENTS);
        expect(first).toBeLessThanOrEqual(MOTORED_AMOUNT_MAX_CENTS);
        expect(amountFor(pk, salt)).toBe(first); // deterministic, no Math.random()
        expect(amountFor(paymentKey('pi_2', M_ENV.MOTORED_CUSTOMER_SALT!), salt)).not.toBe(first);
    });

    it('memo helpers keep the on-chain / payouts format', () => {
        expect(motoredMemo(481)).toBe('motored:user-481');
        expect(motoredSweepMemo(481)).toBe('motored:user-481-final');
        expect(MOTORED_FIRST_CUSTOMER_N).toBe(481); // continues after round 3's user-480
    });

    it('gas terms scale the fee cap and gas limit by the live price', () => {
        const gas = motoredGasTerms({ gasPriceWei: 1000000000n, donateEstimate: 60000 });
        expect(gas.feeCapWei).toBe(1500000000n); // 1.5x
        expect(gas.donateGasLimit).toBe(75000); // 1.25x
        expect(gas.fundGasLimit).toBe(21000);
    });

    it('wallet keys round-trip through encryptWalletKey/decryptWalletKey under the KEK', () => {
        const key = '0x' + '12'.repeat(32);
        const enc = encryptWalletKey(key, M_KEK());
        expect(enc.iv).toMatch(/^[0-9a-f]{32}$/);
        expect(enc.content).not.toContain(key);
        expect(decryptWalletKey(enc, M_KEK())).toBe(key);
        expect(decryptWalletKey(enc, 'fedcba9876543210')).not.toBe(key);
    });
});

function M_KEK() {
    return M_ENV.MOTORED_WALLET_KEK!;
}

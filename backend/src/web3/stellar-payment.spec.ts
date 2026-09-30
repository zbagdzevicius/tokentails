import { CurrencyType } from 'src/shared/interfaces/currency.interface';
import {
    checkStellarPayment,
    DEFAULT_STELLAR_TREASURY,
    expectedStellarAsset,
    isStellarTxHash,
    minimumStroops,
    toStroops,
} from './stellar-payment';

describe('stellar-payment helpers', () => {
    it('parses Horizon amounts into exact stroops', () => {
        expect(toStroops('0.1000000')).toBe(1_000_000);
        expect(toStroops('20')).toBe(200_000_000);
        expect(toStroops('0.0000001')).toBe(1);
        expect(toStroops('-5')).toBe(0);
        expect(toStroops('abc')).toBe(0);
    });

    it('accepts only 64-character hex hashes', () => {
        expect(isStellarTxHash('a'.repeat(64))).toBe(true);
        expect(isStellarTxHash('a'.repeat(63))).toBe(false);
        expect(isStellarTxHash({ $ne: null })).toBe(false);
    });

    it('accepts XLM and USDC only', () => {
        expect(expectedStellarAsset(CurrencyType.XLM)).toEqual({ type: 'native' });
        expect(expectedStellarAsset(CurrencyType.USDC)).toMatchObject({ type: 'credit', code: 'USDC' });
        expect(expectedStellarAsset(CurrencyType.USDT)).toBeNull();
    });

    it('prices USDC 1:1 and XLM at the live rate less the tolerance', () => {
        expect(minimumStroops({ type: 'credit', code: 'USDC', issuer: 'I' }, 500)).toBe(50_000_000);
        // $5 at 0.25 USD/XLM = 20 XLM, less 3% = 19.4 XLM.
        expect(minimumStroops({ type: 'native' }, 500, 0.25)).toBe(194_000_000);
        expect(() => minimumStroops({ type: 'native' }, 500, 0)).toThrow();
    });

    it('ignores path payments to other accounts and counts path payments to the treasury', () => {
        const check = checkStellarPayment({
            transaction: { successful: true },
            operations: [
                { type: 'path_payment_strict_send', to: DEFAULT_STELLAR_TREASURY, amount: '3', asset_type: 'native' },
                { type: 'create_account', to: DEFAULT_STELLAR_TREASURY, amount: '100', asset_type: 'native' },
            ],
            destination: DEFAULT_STELLAR_TREASURY,
            asset: { type: 'native' },
            minStroops: toStroops('3'),
        });

        expect(check).toEqual({ ok: true, paidStroops: 30_000_000 });
    });
});

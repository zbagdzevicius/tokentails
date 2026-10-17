import { raveQuote } from './rave-fee';
import { readRaveConfig } from './rave.config';

describe('raveQuote (fee gross-up)', () => {
    const fee = { feePercentBps: 290, feeFixedCents: 30 };
    it.each([
        [1, 134, 34],
        [5, 546, 46],
        [10, 1061, 61],
        [50, 5181, 181],
        [100, 10330, 330],
    ])('$%i covers the fee: %i cents (+%i)', (cats, amount, feeCents) => {
        expect(raveQuote(cats, true, fee)).toEqual({ donationCents: cats * 100, feeCents, amountCents: amount });
    });

    it('charges exactly the donation when the fee is not covered', () => {
        expect(raveQuote(5, false, fee)).toEqual({ donationCents: 500, feeCents: 0, amountCents: 500 });
    });

    it('always leaves at least the donation after Stripe takes its fee', () => {
        for (let cats = 1; cats <= 600; cats += 1) {
            const q = raveQuote(cats, true, fee);
            const stripeFee = Math.round((q.amountCents * 290) / 10000) + 30;
            expect(q.amountCents - stripeFee).toBeGreaterThanOrEqual(q.donationCents);
        }
    });
});

describe('readRaveConfig', () => {
    it('is off by default with the US standard fee', () => {
        const cfg = readRaveConfig({});
        expect(cfg).toMatchObject({
            enabled: false,
            usdcEnabled: false,
            feePercentBps: 290,
            feeFixedCents: 30,
            maxCats: 500,
            dailyCapUsd: 100,
            createdPerHour: 200,
            secretKeyMode: null,
            publishableKey: null,
            webhookSecret: null,
        });
    });

    it('reads key modes without keeping the secret key', () => {
        const cfg = readRaveConfig({
            RAVE_CHECKOUT_ENABLED: 'true',
            STRIPE_SECRET_KEY: 'sk_test_x',
            STRIPE_PUBLISHABLE_KEY: 'pk_test_y',
            RAVE_FEE_PERCENT_BPS: '9999',
            RAVE_MAX_CATS: '3',
        });
        expect(cfg.enabled).toBe(true);
        expect(cfg.secretKeyMode).toBe('test');
        expect(cfg.publishableKeyMode).toBe('test');
        expect(JSON.stringify(cfg)).not.toContain('sk_test_x');
        // Out of range values fall back to the defaults.
        expect(cfg.feePercentBps).toBe(290);
        expect(cfg.maxCats).toBe(500);
    });
});

import Stripe from 'stripe';
import {
    FOUNDER_LEGEND_CAP,
    PAWLEGENDS_SKU_IDS,
    PAWLEGENDS_SKUS,
    PawlegendsCheckoutRequest,
    UNDER_16_MESSAGE,
} from './pawlegends.contracts';
import { pawlegendsCheckoutReady } from './pawlegends-env';
import {
    buildHarness,
    buyAndPay,
    codeOf,
    DEVICE,
    DEVICE2,
    Harness,
    ON_ENV,
    statusOf,
} from './pawlegends-harness.helper-spec';
import { SESSION_TTL_MS } from './pawlegends-stripe.service';

/* POC.md §15 item 15 (checkout half): SKUs, currencies, caps, the under-16 block, seats, the upgrade, 503s. */

const request = (over: Partial<PawlegendsCheckoutRequest> = {}): PawlegendsCheckoutRequest => ({
    sku: 'pl_founder',
    currency: 'eur',
    ageBand: '18+',
    consentVersion: '2026-10-17',
    deviceId: DEVICE,
    email: 'buyer@example.com',
    ...over,
});

const lastParams = (h: Harness) => {
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    return calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams;
};

describe('Pawlegends checkout', () => {
    let h: Harness;
    beforeEach(() => {
        h = buildHarness();
    });

    it.each(PAWLEGENDS_SKU_IDS.flatMap(sku => (['usd', 'eur'] as const).map(currency => [sku, currency] as const)))(
        'completes %s in %s in test mode at the table price, VAT-inclusive',
        async (sku, currency) => {
            if (PAWLEGENDS_SKUS[sku].requiresFounder) await buyAndPay(h, 'pl_founder', { currency });
            const sessionId = await buyAndPay(h, sku, { currency, email: 'cat@example.com' });
            const params = lastParams(h);
            const price = (params.line_items![0] as any).price_data;
            expect(price).toMatchObject({
                currency,
                unit_amount: PAWLEGENDS_SKUS[sku].cents[currency],
                tax_behavior: 'inclusive',
            });
            expect(params.metadata).toMatchObject({
                pawlegends: '1',
                sku,
                currency,
                age_band: '18+',
                terms_version: expect.any(String),
                deferred: '2027-04-30',
            });
            expect(params.success_url).toContain('/pawlegends?checkout=ok&session_id={CHECKOUT_SESSION_ID}');
            const row = (await h.models.purchases.findOne({ sessionId }).lean()) as any;
            expect(row).toMatchObject({ sku, status: 'paid', currency, items: PAWLEGENDS_SKUS[sku].items });
        }
    );

    it('charges the server price and ignores any price in the request', async () => {
        await h.stripe.createCheckout({ ...request(), amount: 1, unit_amount: 1, cents: 1 } as any, ON_ENV);
        const price = (lastParams(h).line_items![0] as any).price_data;
        expect(price.unit_amount).toBe(999);
    });

    it.each([
        ['an unknown sku', { sku: 'pl_free' }],
        ['an unknown currency', { currency: 'gbp' }],
        ['no age band', { ageBand: undefined }],
        ['an old consent version', { consentVersion: '2020-01-01' }],
        ['no device id', { deviceId: 'x' }],
        ['a bad email', { email: 'not-an-email' }],
        ['no email (the band, the cap and the once-only SKUs are kept with it)', { email: undefined }],
    ])('refuses %s with 400', async (_label, over) => {
        expect(await statusOf(h.stripe.createCheckout(request(over as any), ON_ENV))).toBe(400);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('blocks the under-16 band with the parent message, and remembers it for the device', async () => {
        let error: any;
        try {
            await h.stripe.createCheckout(request({ ageBand: 'under16' }), ON_ENV);
        } catch (caught) {
            error = caught;
        }
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ code: 'PAWLEGENDS_UNDER_16', message: UNDER_16_MESSAGE });
        // Answering 18+ next on the same device does not lift it: the stricter answer wins.
        expect(await codeOf(h.stripe.createCheckout(request({ ageBand: '18+' }), ON_ENV))).toBe('PAWLEGENDS_UNDER_16');
        // The band is stored with the email (§8.5): a cleared device id (a new device) does not lift it either.
        expect(await codeOf(h.stripe.createCheckout(request({ ageBand: '18+', deviceId: DEVICE2 }), ON_ENV))).toBe(
            'PAWLEGENDS_UNDER_16'
        );
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('starter cannot be bought twice by the same device or email', async () => {
        await buyAndPay(h, 'pl_starter', { email: 'kit@example.com' });
        expect(await codeOf(h.stripe.createCheckout(request({ sku: 'pl_starter' }), ON_ENV))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
        expect(
            await codeOf(
                h.stripe.createCheckout(
                    request({ sku: 'pl_starter', deviceId: DEVICE2, email: 'kit@example.com' }),
                    ON_ENV
                )
            )
        ).toBe('PAWLEGENDS_ALREADY_OWNED');
        // An open (unpaid) starter session also blocks a second one.
        await h.stripe.createCheckout(request({ sku: 'pl_starter', deviceId: 'device-cccccccc' }), ON_ENV);
        expect(
            await codeOf(h.stripe.createCheckout(request({ sku: 'pl_starter', deviceId: 'device-cccccccc' }), ON_ENV))
        ).toBe('PAWLEGENDS_ALREADY_OWNED');
    });

    it('holds the 16-17 band to €30 per rolling 30 days, counting open sessions', async () => {
        const teen = { ageBand: '16-17' as const };
        await buyAndPay(h, 'pl_founder', teen); // 9.99
        await buyAndPay(h, 'pl_founder_legend_upgrade', teen); // 20.00 → 29.99
        expect(await codeOf(h.stripe.createCheckout(request({ sku: 'pl_starter', ...teen }), ON_ENV))).toBe(
            'PAWLEGENDS_SPEND_CAP'
        );
        // 31 days later the window has rolled.
        h.clock.now = new Date(h.clock.now.getTime() + 31 * 24 * 60 * 60 * 1000);
        expect(await statusOf(h.stripe.createCheckout(request({ sku: 'pl_starter', ...teen }), ON_ENV))).toBe(200);
    });

    it('holds the 18+ band to €200, keyed by email across devices (the strictest match wins)', async () => {
        // Seed €195 of paid purchases for the email on another device.
        await h.models.purchases.create({
            sessionId: 'cs_seed_1',
            sku: 'pl_starter',
            status: 'paid',
            email: 'big@example.com',
            deviceId: DEVICE2,
            currency: 'eur',
            amountCents: 19500,
            capCents: 19500,
            items: [],
        });
        expect(
            await codeOf(h.stripe.createCheckout(request({ sku: 'pl_founder', email: 'big@example.com' }), ON_ENV))
        ).toBe('PAWLEGENDS_SPEND_CAP');
        // The same device without that email has its own, empty ledger.
        expect(await statusOf(h.stripe.createCheckout(request({ sku: 'pl_founder' }), ON_ENV))).toBe(200);
    });

    it('stops Founder Legend at 500 seats (paid and open sessions), and frees an expired hold', async () => {
        await h.models.purchases.docs.push(
            ...Array.from({ length: FOUNDER_LEGEND_CAP - 1 }, (_, i) => ({
                _id: `seed${i}`,
                sessionId: `cs_seed_${i}`,
                sku: 'pl_founder_legend',
                status: 'paid',
                deviceId: `device-seed${String(i).padStart(4, '0')}`,
                currency: 'eur',
                amountCents: 2999,
                capCents: 2999,
                items: [],
                createdAt: h.clock.now,
            }))
        );
        expect(await h.stripe.legendSeatsLeft()).toBe(1);
        await h.stripe.createCheckout(request({ sku: 'pl_founder_legend', deviceId: 'device-lastseat' }), ON_ENV);
        expect(await h.stripe.legendSeatsLeft()).toBe(0);
        expect(
            await codeOf(
                h.stripe.createCheckout(request({ sku: 'pl_founder_legend', email: 'late@example.com' }), ON_ENV)
            )
        ).toBe('PAWLEGENDS_SOLD_OUT');
        // The open session lapses unpaid: its seat is free again.
        h.clock.now = new Date(h.clock.now.getTime() + SESSION_TTL_MS + 11 * 60 * 1000);
        expect(await h.stripe.legendSeatsLeft()).toBe(1);
        expect(await statusOf(h.stripe.createCheckout(request({ sku: 'pl_founder_legend' }), ON_ENV))).toBe(200);
    });

    it('two racing checkouts for the last seat: at most one gets it', async () => {
        await h.models.purchases.docs.push(
            ...Array.from({ length: FOUNDER_LEGEND_CAP - 1 }, (_, i) => ({
                _id: `seed${i}`,
                sessionId: `cs_seed_${i}`,
                sku: 'pl_founder_legend',
                status: 'paid',
                currency: 'eur',
                capCents: 2999,
                createdAt: h.clock.now,
            }))
        );
        const results = await Promise.allSettled([
            h.stripe.createCheckout(request({ sku: 'pl_founder_legend', deviceId: 'device-racer001' }), ON_ENV),
            h.stripe.createCheckout(request({ sku: 'pl_founder_legend', deviceId: 'device-racer002' }), ON_ENV),
        ]);
        expect(results.filter(r => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
        expect(await h.stripe.legendSeatsTaken()).toBeLessThanOrEqual(FOUNDER_LEGEND_CAP);
    });

    it('two concurrent starter checkouts for the same email and device: exactly one session', async () => {
        const results = await Promise.allSettled([
            h.stripe.createCheckout(request({ sku: 'pl_starter' }), ON_ENV),
            h.stripe.createCheckout(request({ sku: 'pl_starter' }), ON_ENV),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(h.stripeClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
        const open = (await h.models.purchases.find({ sku: 'pl_starter' }).lean()) as any[];
        expect(open).toHaveLength(1);
    });

    it('a second Founder Legend seat and the spend cap hold when the device id rotates (same email)', async () => {
        await buyAndPay(h, 'pl_founder_legend', {
            email: 'teen@example.com',
            ageBand: '16-17',
            deviceId: 'device-rot00001',
        });
        for (const deviceId of ['device-rot00002', 'device-rot00003']) {
            expect(
                await codeOf(
                    h.stripe.createCheckout(
                        request({ sku: 'pl_founder_legend', email: 'teen@example.com', ageBand: '16-17', deviceId }),
                        ON_ENV
                    )
                )
            ).toBe('PAWLEGENDS_ALREADY_OWNED');
        }
        // 29.99 paid: a 0.99 starter on yet another device would pass €30.
        expect(
            await codeOf(
                h.stripe.createCheckout(
                    request({
                        sku: 'pl_starter',
                        email: 'teen@example.com',
                        ageBand: '18+',
                        deviceId: 'device-rot00004',
                    }),
                    ON_ENV
                )
            )
        ).toBe('PAWLEGENDS_SPEND_CAP');
        const paid = (await h.models.purchases.find({ email: 'teen@example.com', status: 'paid' }).lean()) as any[];
        expect(paid.reduce((sum, row) => sum + row.capCents, 0)).toBeLessThanOrEqual(3000);
    });

    it('opens Stripe Checkout with the email locked, and keys the account id when the host sends an accesstoken', async () => {
        await h.stripe.createCheckout(request({ sku: 'pl_starter', email: 'Acc@Example.com' }), ON_ENV, 'user-123');
        expect(lastParams(h).customer_email).toBe('acc@example.com');
        const row = (await h.models.purchases.findOne({ sku: 'pl_starter' }).lean()) as any;
        expect(row).toMatchObject({ accountId: 'user-123', email: 'acc@example.com' });
        // Another email on another device, same account: the open starter of the account blocks it.
        expect(
            await codeOf(
                h.stripe.createCheckout(
                    request({ sku: 'pl_starter', email: 'z@example.com', deviceId: DEVICE2 }),
                    ON_ENV,
                    'user-123'
                )
            )
        ).toBe('PAWLEGENDS_ALREADY_OWNED');
    });

    it('the upgrade charges 20.00 and only for Founder owners', async () => {
        expect(await codeOf(h.stripe.createCheckout(request({ sku: 'pl_founder_legend_upgrade' }), ON_ENV))).toBe(
            'PAWLEGENDS_NEEDS_FOUNDER'
        );
        await buyAndPay(h, 'pl_founder', { currency: 'usd' });
        await h.stripe.createCheckout(request({ sku: 'pl_founder_legend_upgrade', currency: 'usd' }), ON_ENV);
        expect((lastParams(h).line_items![0] as any).price_data).toMatchObject({ currency: 'usd', unit_amount: 2000 });
    });

    it('answers 503 for every missing secret, never a flag', async () => {
        const without = (name: string) => ({ ...ON_ENV, [name]: '' });
        for (const name of [
            'PAWLEGENDS_STRIPE_SECRET_KEY',
            'PAWLEGENDS_STRIPE_WEBHOOK_SECRET',
            'PAWLEGENDS_ENTITLEMENT_SECRET',
        ]) {
            expect(await statusOf(h.stripe.createCheckout(request(), without(name)))).toBe(503);
            expect(pawlegendsCheckoutReady(without(name))).toBe(false);
        }
        expect(pawlegendsCheckoutReady(ON_ENV)).toBe(true);
        // The shared STRIPE_SECRET_KEY and the INVALIDATE_CACHE_SECRET-derived key are the documented fallbacks.
        const fallbacks = {
            NODE_ENV: 'test',
            STRIPE_SECRET_KEY: 'sk_test_shared',
            PAWLEGENDS_STRIPE_WEBHOOK_SECRET: 'whsec_x',
            INVALIDATE_CACHE_SECRET: 'shared-secret',
        };
        expect(pawlegendsCheckoutReady(fallbacks)).toBe(true);
        // A live key outside production is not usable (no real money on staging).
        expect(pawlegendsCheckoutReady({ ...ON_ENV, PAWLEGENDS_STRIPE_SECRET_KEY: 'sk_live_x' })).toBe(false);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
        // No `PAWLEGENDS_*_ENABLED` name exists anywhere in the module.
        const fs = await import('fs');
        const path = await import('path');
        const sources = fs
            .readdirSync(__dirname)
            .filter(file => file.endsWith('.ts') && !file.endsWith('spec.ts'))
            .map(file => fs.readFileSync(path.join(__dirname, file), 'utf8'))
            .join('\n');
        expect(sources).not.toMatch(/PAWLEGENDS_[A-Z_]*_ENABLED/);
    });
});

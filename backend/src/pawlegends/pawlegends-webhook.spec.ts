import Stripe from 'stripe';
import { PAWLEGENDS_ITEMS, PAWLEGENDS_SKUS } from './pawlegends.contracts';
import {
    buildHarness,
    buyAndPay,
    completedEvent,
    DEVICE,
    Harness,
    ON_ENV,
    signedEvent,
    statusOf,
} from './pawlegends-harness.helper-spec';
import { verifyPawlegendsToken } from './pawlegends-token';

/* POC.md §15 item 15 (webhook half): signature, grant exactly once, refunds, expiry, entitlements and restore. */

const checkout = async (h: Harness, over: Record<string, unknown> = {}) => {
    const { sessionId } = await h.stripe.createCheckout(
        {
            sku: 'pl_founder',
            currency: 'eur',
            ageBand: '18+',
            consentVersion: '2026-10-17',
            deviceId: DEVICE,
            email: 'buyer@example.com',
            ...over,
        } as any,
        ON_ENV
    );
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    return { sessionId, params: calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams };
};

const deliver = (h: Harness, event: Record<string, unknown>) => {
    const { rawBody, signature } = signedEvent(event);
    return h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
};

describe('Pawlegends webhook', () => {
    let h: Harness;
    beforeEach(() => {
        h = buildHarness();
    });

    it('refuses a bad signature (400) and answers 503 without the webhook secret', async () => {
        const { rawBody } = signedEvent({ id: 'evt_x', type: 'checkout.session.completed', data: { object: {} } });
        expect(await statusOf(Promise.resolve().then(() => h.webhooks.verify(rawBody, 't=1,v1=bad', ON_ENV)))).toBe(
            400
        );
        const forged = signedEvent({ id: 'evt_y', type: 'x', data: { object: {} } }, 'whsec_someone_else');
        expect(
            await statusOf(Promise.resolve().then(() => h.webhooks.verify(forged.rawBody, forged.signature, ON_ENV)))
        ).toBe(400);
        expect(
            await statusOf(
                Promise.resolve().then(() =>
                    h.webhooks.verify(rawBody, 'sig', { ...ON_ENV, PAWLEGENDS_STRIPE_WEBHOOK_SECRET: '' })
                )
            )
        ).toBe(503);
    });

    it('grants exactly once per session, whatever the redeliveries', async () => {
        const { sessionId, params } = await checkout(h, { email: 'cat@example.com' });
        const event = completedEvent(sessionId, params);
        expect(await deliver(h, event)).toBe('processed');
        expect(await deliver(h, event)).toBe('duplicate');
        // The same session under a new event id (Stripe retries, async_payment_succeeded): still one grant.
        expect(await deliver(h, { ...event, id: 'evt_other', type: 'checkout.session.async_payment_succeeded' })).toBe(
            'processed'
        );
        const rows = (await h.models.purchases.find({}).lean()) as any[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            sessionId,
            status: 'paid',
            sku: 'pl_founder',
            email: 'cat@example.com',
            items: PAWLEGENDS_SKUS.pl_founder.items,
            capCents: 999,
        });
        expect(rows[0].holdUntil).toBeUndefined();
    });

    it('ignores unpaid sessions, other products and test events in production', async () => {
        const { sessionId, params } = await checkout(h);
        expect(await deliver(h, completedEvent(sessionId, params, { payment_status: 'unpaid' }))).toBe('ignored');
        expect(await deliver(h, completedEvent(sessionId, params, { metadata: { badcat: '1', sku: 'club' } }))).toBe(
            'ignored'
        );
        const event = completedEvent(sessionId, params);
        const { rawBody, signature } = signedEvent(event);
        const prod = { ...ON_ENV, NODE_ENV: 'production' };
        expect(await h.webhooks.handle(h.webhooks.verify(rawBody, signature, prod), prod)).toBe('ignored');
        const row = (await h.models.purchases.findOne({ sessionId }).lean()) as any;
        expect(row.status).toBe('pending');
    });

    it('holds a session charged another amount for review: no items, no seat, no refund call', async () => {
        const { sessionId, params } = await checkout(h, { sku: 'pl_founder_legend' });
        await deliver(h, completedEvent(sessionId, params, { amount_total: 1 }));
        const row = (await h.models.purchases.findOne({ sessionId }).lean()) as any;
        expect(row).toMatchObject({ status: 'review', items: [] });
        expect(row.voidReason).toContain('charged 1 eur');
        expect(await h.stripe.legendSeatsTaken()).toBe(0);
        const token = await h.account.entitlements({ sessionId }, ON_ENV);
        expect(token.items).toEqual([]);
        // A redelivery does not turn it into a grant.
        await deliver(h, completedEvent(sessionId, params));
        expect(((await h.models.purchases.findOne({ sessionId }).lean()) as any).status).toBe('review');
    });

    it('holds a signed session with no checkout hold (made outside POST /checkout) for review', async () => {
        const params = {
            metadata: { pawlegends: '1', sku: 'pl_founder_legend', currency: 'eur', device: DEVICE },
        } as any;
        const event = completedEvent('cs_test_outside000001', params, { amount_total: 2999, currency: 'eur' });
        expect(await deliver(h, event)).toBe('processed');
        const row = (await h.models.purchases.findOne({ sessionId: 'cs_test_outside000001' }).lean()) as any;
        expect(row).toMatchObject({ status: 'review', items: [], amountCents: 2999 });
        expect(await h.stripe.legendSeatsLeft()).toBe(500);
    });

    it('voids and refunds a second starter for the email Stripe collected, even from another device', async () => {
        await buyAndPay(h, 'pl_starter', { email: 'kit@example.com' });
        // A second checkout typed with another email on another device...
        const second = await checkout(h, {
            sku: 'pl_starter',
            email: 'other@example.com',
            deviceId: 'device-cccccccc',
        });
        // ...but Stripe reports the first buyer's email.
        await deliver(
            h,
            completedEvent(second.sessionId, second.params, { customer_details: { email: 'kit@example.com' } })
        );
        const row = (await h.models.purchases.findOne({ sessionId: second.sessionId }).lean()) as any;
        expect(row).toMatchObject({ status: 'voided', items: [], refundId: expect.stringMatching(/^re_/) });
        expect(h.stripeClient.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_intent: `pi_${second.sessionId}` })
        );
        const paid = (await h.models.purchases.find({ email: 'kit@example.com', status: 'paid' }).lean()) as any[];
        expect(paid).toHaveLength(1);
    });

    it('voids and refunds a paid session that would take the email over its spend cap', async () => {
        await buyAndPay(h, 'pl_founder', { email: 'teen@example.com', ageBand: '16-17' }); // 9.99 of 30.00
        // Another checkout on a new device with another email passes the checkout checks...
        const other = await checkout(h, {
            sku: 'pl_founder_legend',
            ageBand: '16-17',
            email: 'alt@example.com',
            deviceId: 'device-dddddddd',
        });
        // ...but pays with the teen's email: 9.99 + 29.99 is over €30.
        await deliver(
            h,
            completedEvent(other.sessionId, other.params, { customer_details: { email: 'teen@example.com' } })
        );
        const row = (await h.models.purchases.findOne({ sessionId: other.sessionId }).lean()) as any;
        expect(row.status).toBe('voided');
        expect(row.voidReason).toContain('spend cap');
    });

    it('frees the hold of an expired session and never grants a refunded one again', async () => {
        const open = await checkout(h, { sku: 'pl_founder_legend' });
        expect(await h.stripe.legendSeatsTaken()).toBe(1);
        await deliver(h, {
            id: 'evt_expired',
            type: 'checkout.session.expired',
            data: { object: { id: open.sessionId, metadata: open.params.metadata } },
        });
        expect(await h.stripe.legendSeatsTaken()).toBe(0);

        const paid = await buyAndPay(h, 'pl_founder_legend', { deviceId: 'device-refund01' });
        expect(await h.stripe.legendSeatsTaken()).toBe(1);
        await deliver(h, {
            id: 'evt_refund',
            type: 'charge.refunded',
            data: { object: { id: 'ch_1', refunded: true, payment_intent: `pi_${paid}` } },
        });
        expect(await h.stripe.legendSeatsTaken()).toBe(0);
        const row = (await h.models.purchases.findOne({ sessionId: paid }).lean()) as any;
        expect(row.status).toBe('refunded');
        expect((await h.account.entitlements({ sessionId: paid }, ON_ENV)).items).toEqual([]);
    });

    it('a refund under the presale terms keeps the items delivered now (GDD §8.3, terms page)', async () => {
        const paid = await buyAndPay(h, 'pl_founder', { email: 'late@example.com' });
        const { refundId } = await h.stripe.refundUnderTerms(paid, ON_ENV);
        expect(refundId).toMatch(/^re_/);
        expect(h.stripeClient.refunds.create).toHaveBeenCalledWith(
            expect.objectContaining({
                payment_intent: `pi_${paid}`,
                metadata: expect.objectContaining({ pawlegends_terms_refund: '1' }),
            })
        );
        await deliver(h, {
            id: 'evt_terms_refund',
            type: 'charge.refunded',
            data: { object: { id: 'ch_2', refunded: true, payment_intent: `pi_${paid}` } },
        });
        const row = (await h.models.purchases.findOne({ sessionId: paid }).lean()) as any;
        expect(row).toMatchObject({ status: 'refunded', termsRefund: true });
        const token = await h.account.entitlements({ sessionId: paid }, ON_ENV);
        expect(token.items).toEqual([...PAWLEGENDS_SKUS.pl_founder.items].sort());
        expect(token.skus).toEqual([]);
    });

    it('the session id returns a token with the items; a refresh keeps them; restore works on a clean device', async () => {
        const sessionId = await buyAndPay(h, 'pl_founder_legend', { email: 'legend@example.com' });
        const first = await h.account.entitlements({ sessionId }, ON_ENV);
        expect(first.items).toEqual(
            expect.arrayContaining([PAWLEGENDS_ITEMS.legendSkin, PAWLEGENDS_ITEMS.founderFrame])
        );
        expect(verifyPawlegendsToken(first.token, ON_ENV.PAWLEGENDS_ENTITLEMENT_SECRET)?.skus).toEqual([
            'pl_founder_legend',
        ]);
        const refreshed = await h.account.entitlements({ token: first.token }, ON_ENV);
        expect(refreshed.items).toEqual(first.items);
        expect(await statusOf(h.account.entitlements({ token: `${first.token}x` }, ON_ENV))).toBe(401);

        // Restore by email: a single-use link answers a token for every purchase of the email.
        const { devLink } = await h.account.restore('Legend@Example.com', ON_ENV);
        const raw = new URL(devLink!).searchParams.get('restore')!;
        const restored = await h.account.verifyRestore(raw, ON_ENV);
        expect(restored.items).toEqual(first.items);
        expect(await statusOf(h.account.verifyRestore(raw, ON_ENV))).toBe(401);
        // No devLink in production, and the same answer for an address that bought nothing.
        const prod = { ...ON_ENV, NODE_ENV: 'production', SENDGRID_API_KEY: 'SG.spec' };
        expect(await h.account.restore('nobody@example.com', prod)).toEqual({ ok: true });
        // Without SendGrid (and no dev links) restore and notify answer 503 instead of a silent ok.
        const noMail = { ...ON_ENV, NODE_ENV: 'production' };
        expect(await statusOf(h.account.restore('legend@example.com', noMail))).toBe(503);
        expect(await statusOf(h.account.notify('legend@example.com', 'store', noMail))).toBe(503);
    });

    it('notify-me is double opt-in', async () => {
        const { devLink } = await h.account.notify('fan@example.com', 'results', ON_ENV);
        let row = (await h.models.notify.findOne({ email: 'fan@example.com' }).lean()) as any;
        expect(row.confirmedAt).toBeUndefined();
        await h.account.confirmNotify(new URL(devLink!).searchParams.get('notify'));
        row = (await h.models.notify.findOne({ email: 'fan@example.com' }).lean()) as any;
        expect(row.confirmedAt).toBeInstanceOf(Date);
        expect(await statusOf(h.account.notify('nope', 'store', ON_ENV))).toBe(400);
    });
});

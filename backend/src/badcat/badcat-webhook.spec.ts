import {
    buildHarness,
    buy,
    CAT,
    checkoutEvent,
    deliver,
    Harness,
    NOW,
    ON_ENV,
    signedEvent,
    statusOf,
    useEnv,
} from './badcat-harness.helper-spec';
import { verifyEntitlementToken } from './badcat-token';
import { ENTITLEMENT_SECRET } from './badcat-harness.helper-spec';

describe('POST /badcat/stripe/webhook', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    it('answers 400 for a bad or missing signature and writes nothing', async () => {
        const event = checkoutEvent({ id: 'cs_test_bad0001', metadata: { badcat: '1', sku: 'cameo' } });
        const { rawBody } = signedEvent(event, 'whsec_wrong');
        const forged = signedEvent(event, 'whsec_wrong').signature;
        expect(await statusOf(h.controller.webhook({ rawBody } as any, forged))).toBe(400);
        expect(await statusOf(h.controller.webhook({ rawBody } as any, undefined as any))).toBe(400);
        expect(await statusOf(h.controller.webhook({} as any, 't=1,v1=abc'))).toBe(400);
        expect(h.models.webhookEvents.docs).toHaveLength(0);
        expect(h.models.purchases.docs).toHaveLength(0);
    });

    it('answers 503 without the webhook secret, and keeps working while checkout (or Bad Cat) is paused', async () => {
        const event = signedEvent(checkoutEvent({ id: 'cs_test_x0000001' }));
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_STRIPE_WEBHOOK_SECRET: undefined });
        expect(await statusOf(h.controller.webhook({ rawBody: event.rawBody } as any, event.signature))).toBe(503);
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_ENTITLEMENT_SECRET: undefined });
        expect(await statusOf(h.controller.webhook({ rawBody: event.rawBody } as any, event.signature))).toBe(200);
        // Checkout not ready (no entitlement key): a cancellation still lands.
        await buy(h, 'club_monthly', { session: { subscription: 'sub_paused' }, email: 'p@ex.com' });
        expect(
            await deliver(h, {
                id: 'evt_paused_del',
                type: 'customer.subscription.deleted',
                data: { object: { id: 'sub_paused', object: 'subscription', status: 'canceled', items: { data: [] } } },
            })
        ).toEqual({ received: true, outcome: 'processed' });
        expect(h.models.purchases.docs.find(d => d.subscriptionId === 'sub_paused')!.subStatus).toBe('canceled');
    });

    it('is idempotent by event id and by session id', async () => {
        const event = checkoutEvent(
            {
                id: 'cs_test_idem0001',
                amount_total: 499,
                metadata: { badcat: '1', sku: 'cameo', cat: CAT, cat_name: 'Mochi', day: '7', trigger: 'cameo_flow' },
            },
            'evt_test_idem'
        );
        expect(await deliver(h, event)).toEqual({ received: true, outcome: 'processed' });
        expect(await deliver(h, event)).toEqual({ received: true, outcome: 'duplicate' });
        // The same session under a new event id (Stripe resend) adds nothing either.
        expect(await deliver(h, { ...event, id: 'evt_test_idem_2' })).toEqual({ received: true, outcome: 'processed' });
        expect(h.models.purchases.docs).toHaveLength(1);
        expect(h.models.cameos.docs).toHaveLength(1);
    });

    it('forgets the event id when processing fails, so the Stripe retry is processed', async () => {
        const event = checkoutEvent(
            { id: 'cs_test_fail0001', metadata: { badcat: '1', sku: 'cosmetic_hat' } },
            'evt_fail'
        );
        const original = h.models.purchases.updateOne.bind(h.models.purchases);
        (h.models.purchases as any).updateOne = jest.fn(async () => {
            throw new Error('mongo down');
        });
        await expect(deliver(h, event)).rejects.toThrow('mongo down');
        expect(h.models.webhookEvents.docs).toHaveLength(0);
        (h.models.purchases as any).updateOne = original;
        expect((await deliver(h, event)).outcome).toBe('processed');
    });

    it('records the event id only after dispatch: a crash mid-dispatch leaves nothing that blocks the retry', async () => {
        const event = checkoutEvent(
            { id: 'cs_test_crash001', metadata: { badcat: '1', sku: 'cosmetic_hat' } },
            'evt_crash'
        );
        const original = h.models.purchases.updateOne.bind(h.models.purchases);
        let idsDuringDispatch = -1;
        (h.models.purchases as any).updateOne = jest.fn(async (...args: any[]) => {
            idsDuringDispatch = h.models.webhookEvents.docs.length;
            return (original as any)(...args);
        });
        expect((await deliver(h, event)).outcome).toBe('processed');
        expect(idsDuringDispatch).toBe(0);
        expect(h.models.webhookEvents.docs).toHaveLength(1);
        (h.models.purchases as any).updateOne = original;
        expect((await deliver(h, event)).outcome).toBe('duplicate');
        expect(h.models.purchases.docs).toHaveLength(1);
    });

    it('ignores sessions that are not Bad Cat or not paid', async () => {
        expect((await deliver(h, checkoutEvent({ id: 'cs_test_other001', metadata: { sku: 'cameo' } }))).outcome).toBe(
            'ignored'
        );
        expect(
            (
                await deliver(
                    h,
                    checkoutEvent({
                        id: 'cs_test_unpaid01',
                        payment_status: 'unpaid',
                        metadata: { badcat: '1', sku: 'cameo' },
                    })
                )
            ).outcome
        ).toBe('ignored');
        expect(h.models.purchases.docs).toHaveLength(0);
    });

    it('checkout.session.completed: a cameo, a guest star, a gift, a brand request and a subscription', async () => {
        await buy(h, 'cameo', {
            meta: { cat: CAT, cat_name: 'Mochi', day: '6', via: 'fan_code' },
            sessionId: 'cs_test_cameo001',
        });
        await buy(h, 'guest_star', { meta: { cat: CAT, cat_name: 'Mochi', day: '12' }, sessionId: 'cs_test_guest001' });
        await buy(h, 'gift_club_3m', { meta: { gift_for: 'Aunt May' }, sessionId: 'cs_test_gift0001' });
        await buy(h, 'sponsor_day', { meta: { brand_name: 'Purr Co', day: '9' }, sessionId: 'cs_test_brand001' });
        await buy(h, 'club_monthly', {
            session: { subscription: 'sub_test_1', mode: 'subscription' },
            sessionId: 'cs_test_club0001',
        });

        const purchase = (id: string) => h.models.purchases.docs.find(d => d.sessionId === id)!;
        expect(purchase('cs_test_cameo001')).toMatchObject({
            kind: 'one_off',
            sku: 'cameo',
            email: 'buyer@example.com',
            customerId: 'cus_test_1',
            amountTotal: 499,
            status: 'paid',
            meta: { trigger: 'home', from_in_app: 'false', via: 'fan_code' },
        });
        expect(h.models.cameos.docs.map(d => [d.kind, d.dayNo, d.catCode, d.name])).toEqual([
            ['paid', 6, CAT, 'Mochi'],
            ['guest_star', 12, CAT, 'Mochi'],
        ]);
        expect(h.models.gifts.docs).toHaveLength(1);
        expect(h.models.gifts.docs[0]).toMatchObject({
            sku: 'gift_club_3m',
            sessionId: 'cs_test_gift0001',
            giftFor: 'Aunt May',
        });
        expect(h.models.gifts.docs[0].code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
        expect(purchase('cs_test_brand001')).toMatchObject({ queue: 'queued', brand: { name: 'Purr Co' }, dayNo: 9 });
        const club = purchase('cs_test_club0001');
        expect(club).toMatchObject({ kind: 'subscription', subscriptionId: 'sub_test_1', subStatus: 'active' });
        expect(new Date(club.periodEnd).getTime()).toBeGreaterThan(NOW.getTime() + 28 * 86400000);
    });

    it('subscription updated / deleted and invoice.paid move the Club status and period end', async () => {
        await buy(h, 'club_annual', {
            session: { subscription: 'sub_test_9' },
            sessionId: 'cs_test_annual01',
            email: 'cat@ex.com',
        });
        const end = Math.floor(NOW.getTime() / 1000) + 400 * 86400;
        await deliver(h, {
            id: 'evt_sub_upd',
            type: 'customer.subscription.updated',
            data: {
                object: {
                    id: 'sub_test_9',
                    object: 'subscription',
                    status: 'past_due',
                    cancel_at_period_end: true,
                    items: { data: [{ current_period_end: end }] },
                },
            },
        });
        let row = h.models.purchases.docs.find(d => d.subscriptionId === 'sub_test_9')!;
        expect(row).toMatchObject({ subStatus: 'past_due', cancelAtPeriodEnd: true });
        expect(new Date(row.periodEnd).getTime()).toBe(end * 1000);
        expect((await h.account.entitlementsFor('cat@ex.com')).club).toBe(true);

        const renewEnd = end + 365 * 86400;
        await deliver(h, {
            id: 'evt_inv_paid',
            type: 'invoice.paid',
            data: {
                object: {
                    id: 'in_test_1',
                    object: 'invoice',
                    billing_reason: 'subscription_cycle',
                    amount_paid: 3999,
                    currency: 'usd',
                    parent: { subscription_details: { subscription: 'sub_test_9' } },
                    lines: { data: [{ period: { end: renewEnd } }] },
                },
            },
        });
        row = h.models.purchases.docs.find(d => d.sessionId === 'cs_test_annual01')!;
        expect(row.subStatus).toBe('active');
        expect(new Date(row.periodEnd).getTime()).toBe(renewEnd * 1000);
        expect(h.models.purchases.docs.find(d => d.sessionId === 'inv:in_test_1')).toMatchObject({
            kind: 'renewal',
            sku: 'club_annual',
            amountTotal: 3999,
            email: 'cat@ex.com',
        });

        await deliver(h, {
            id: 'evt_sub_del',
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_test_9', object: 'subscription', status: 'canceled', items: { data: [] } } },
        });
        expect(h.models.purchases.docs.find(d => d.sessionId === 'cs_test_annual01')!.subStatus).toBe('canceled');
        expect((await h.account.entitlementsFor('cat@ex.com')).club).toBe(false);
    });

    it('charge.refunded marks a one-off refunded (and drops its SKU from entitlements)', async () => {
        await buy(h, 'cosmetic_hat', { session: { payment_intent: 'pi_test_1' }, email: 'hat@ex.com' });
        expect((await h.account.entitlementsFor('hat@ex.com')).skus).toEqual(['cosmetic_hat']);
        await deliver(h, {
            id: 'evt_refund',
            type: 'charge.refunded',
            data: { object: { id: 'ch_1', object: 'charge', refunded: true, payment_intent: 'pi_test_1' } },
        });
        expect((await h.account.entitlementsFor('hat@ex.com')).skus).toEqual([]);
    });

    it('charge.refunded on a Club subscription: refunded, Club ends, Stripe cancels, out of revenue', async () => {
        await buy(h, 'club_annual', { session: { subscription: 'sub_ref1' }, email: 'ref@ex.com' });
        // The first invoice records its PaymentIntent on the subscription row.
        await deliver(h, {
            id: 'evt_ref_inv',
            type: 'invoice.paid',
            data: {
                object: {
                    id: 'in_ref_1',
                    object: 'invoice',
                    billing_reason: 'subscription_create',
                    parent: { subscription_details: { subscription: 'sub_ref1' } },
                    payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_sub_1' } }] },
                    lines: { data: [] },
                },
            },
        });
        expect((await h.account.entitlementsFor('ref@ex.com')).club).toBe(true);
        expect((await h.admin.stats(30)).revenueCents).toBeGreaterThan(0);
        await deliver(h, {
            id: 'evt_ref_sub',
            type: 'charge.refunded',
            data: {
                object: {
                    id: 'ch_s1',
                    object: 'charge',
                    refunded: true,
                    payment_intent: 'pi_sub_1',
                    customer: 'cus_test_1',
                },
            },
        });
        const row = h.models.purchases.docs.find(d => d.subscriptionId === 'sub_ref1')!;
        expect(row).toMatchObject({ status: 'refunded', subStatus: 'canceled' });
        expect((await h.account.entitlementsFor('ref@ex.com')).club).toBe(false);
        expect(h.stripeClient.subscriptions.cancel).toHaveBeenCalledWith('sub_ref1');
        expect((await h.admin.stats(30)).revenueCents).toBe(0);
        // A later Stripe update (before its cancel lands) never reopens the access.
        await deliver(h, {
            id: 'evt_ref_upd',
            type: 'customer.subscription.updated',
            data: {
                object: {
                    id: 'sub_ref1',
                    object: 'subscription',
                    status: 'active',
                    items: { data: [{ current_period_end: 4102444800 }] },
                },
            },
        });
        expect((await h.account.entitlementsFor('ref@ex.com')).club).toBe(false);
    });

    it('charge.refunded on a founding subscription frees its place (found through Stripe invoice payments)', async () => {
        const before = (await h.controller.status({}, {})).foundingLeft!;
        await buy(h, 'founding', { session: { subscription: 'sub_found1' }, email: 'f@ex.com' });
        expect((await h.controller.status({}, {})).foundingLeft).toBe(before - 1);
        h.stripeClient.invoicePayments.list.mockResolvedValueOnce({ data: [{ invoice: 'in_found_1' }] } as never);
        h.stripeClient.invoices.retrieve.mockResolvedValueOnce({
            id: 'in_found_1',
            parent: { subscription_details: { subscription: 'sub_found1' } },
        } as never);
        expect(
            await deliver(h, {
                id: 'evt_found_ref',
                type: 'charge.refunded',
                data: { object: { id: 'ch_f1', object: 'charge', refunded: true, payment_intent: 'pi_found_1' } },
            })
        ).toEqual({ received: true, outcome: 'processed' });
        expect(h.models.purchases.docs.find(d => d.subscriptionId === 'sub_found1')!.status).toBe('refunded');
        expect((await h.controller.status({}, {})).foundingLeft).toBe(before);
        expect((await h.account.entitlementsFor('f@ex.com')).club).toBe(false);
    });

    it('charge.refunded on a renewal: the renewal is refunded and Club ends now', async () => {
        await buy(h, 'club_monthly', { session: { subscription: 'sub_ren1' }, email: 'ren@ex.com' });
        await deliver(h, {
            id: 'evt_ren_inv',
            type: 'invoice.paid',
            data: {
                object: {
                    id: 'in_ren_2',
                    object: 'invoice',
                    billing_reason: 'subscription_cycle',
                    amount_paid: 499,
                    parent: { subscription_details: { subscription: 'sub_ren1' } },
                    payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_ren_2' } }] },
                    lines: { data: [{ period: { end: 4102444800 } }] },
                },
            },
        });
        await deliver(h, {
            id: 'evt_ren_ref',
            type: 'charge.refunded',
            data: { object: { id: 'ch_r2', object: 'charge', refunded: true, payment_intent: 'pi_ren_2' } },
        });
        expect(h.models.purchases.docs.find(d => d.sessionId === 'inv:in_ren_2')!.status).toBe('refunded');
        expect(
            h.models.purchases.docs.find(d => d.kind === 'subscription' && d.subscriptionId === 'sub_ren1')!.status
        ).toBe('paid');
        expect((await h.account.entitlementsFor('ren@ex.com')).club).toBe(false);
        expect(h.stripeClient.subscriptions.cancel).toHaveBeenCalledWith('sub_ren1');
    });

    it('ignores other event types', async () => {
        expect(
            (await deliver(h, { id: 'evt_other', type: 'payment_intent.created', data: { object: {} } })).outcome
        ).toBe('ignored');
    });

    it('verifies without any Stripe key, so refunds and cancellations still land', async () => {
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_STRIPE_SECRET_KEY: undefined });
        expect(
            (await deliver(h, { id: 'evt_nokey', type: 'payment_intent.created', data: { object: {} } })).outcome
        ).toBe('ignored');
    });

    it('in production ignores test-mode events: a test card never grants real entitlements', async () => {
        restore();
        restore = useEnv({ ...ON_ENV, NODE_ENV: 'production', BADCAT_STRIPE_SECRET_KEY: 'sk_live_spec' });
        const test = checkoutEvent({
            id: 'cs_test_prod0001',
            metadata: { badcat: '1', sku: 'cameo', cat: CAT, day: '7' },
        });
        expect((await deliver(h, test)).outcome).toBe('ignored');
        expect(h.models.purchases.docs).toHaveLength(0);
        const live = checkoutEvent({ id: 'cs_live_prod0001', metadata: { badcat: '1', sku: 'cosmetic_hat' } });
        expect((await deliver(h, { ...live, livemode: true })).outcome).toBe('processed');
        expect(h.models.purchases.docs).toHaveLength(1);
    });
});

describe('POST /badcat/entitlement', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const entitle = (body: any) => h.controller.entitlement(body, {}, {}) as Promise<any>;

    it('is pending until the webhook landed, then returns the token, the gift code and the cameo id', async () => {
        expect(await entitle({ sessionId: 'cs_test_later001' })).toEqual({ ok: false, pending: true });
        await buy(h, 'club_monthly', {
            session: { subscription: 'sub_1' },
            sessionId: 'cs_test_later001',
            email: 'm@ex.com',
        });
        const done = await entitle({ sessionId: 'cs_test_later001' });
        expect(done).toMatchObject({
            ok: true,
            sku: 'club_monthly',
            entitlements: { club: true, plan: 'monthly', maxCats: 5, email: 'm@ex.com' },
        });
        // A scoped token: the entitlements plus the one purchase it speaks for (no verified-email claim).
        expect(verifyEntitlementToken(done.token, ENTITLEMENT_SECRET, { now: NOW.getTime() })).toEqual({
            ...done.entitlements,
            sids: ['cs_test_later001'],
        });

        await buy(h, 'gift_cameo', { sessionId: 'cs_test_giftc001' });
        expect((await entitle({ sessionId: 'cs_test_giftc001' })).gift).toEqual({
            code: expect.any(String),
            sku: 'gift_cameo',
        });

        await buy(h, 'cameo', { meta: { cat: CAT, cat_name: 'Mochi', day: '8' }, sessionId: 'cs_test_cam00001' });
        const cameo = await entitle({ sessionId: 'cs_test_cam00001' });
        expect(cameo.cameoId).toBe(String(h.models.cameos.docs[0]._id));
        expect(cameo.dayNo).toBe(8);
    });

    it('refreshes a token from its email (also an expired one) and refuses a forged one', async () => {
        await buy(h, 'founding', {
            session: { subscription: 'sub_f' },
            email: 'f@ex.com',
            sessionId: 'cs_test_found001',
        });
        const first = await entitle({ sessionId: 'cs_test_found001' });
        expect(first.entitlements.plan).toBe('founding');
        h.clock.now = new Date(NOW.getTime() + 8 * 86400000);
        const refreshed = await entitle({ token: first.token });
        expect(refreshed.entitlements).toMatchObject({ club: true, plan: 'founding' });
        expect(refreshed.entitlements.expiresAt).toBe(h.clock.now.getTime() + 7 * 86400000);
        expect(await statusOf(entitle({ token: `${first.token}x` }))).toBe(401);
        expect(await statusOf(entitle({}))).toBe(400);
        expect(await statusOf(entitle({ sessionId: 'not-a-session' }))).toBe(400);
    });

    it('caps expiresAt at the end of the paid period', async () => {
        await buy(h, 'club_monthly', { session: { subscription: 'sub_c' }, email: 'c@ex.com' });
        const row = h.models.purchases.docs.find(d => d.subscriptionId === 'sub_c')!;
        row.periodEnd = new Date(NOW.getTime() + 2 * 86400000);
        expect((await h.account.entitlementsFor('c@ex.com')).expiresAt).toBe(NOW.getTime() + 2 * 86400000);
    });

    it('answers 503 without BADCAT_ENTITLEMENT_SECRET', async () => {
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_ENTITLEMENT_SECRET: undefined });
        expect(await statusOf(entitle({ sessionId: 'cs_test_later001' }))).toBe(503);
        expect(await statusOf(entitle({ token: 'a.b' }))).toBe(503);
    });
});

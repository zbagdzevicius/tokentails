import Stripe from 'stripe';
import { clubMemo, clubOrderId } from './club-webhook.service';
import { clubHarness, ENV_ON, ENV_PROD, expectClubError, KEY_A, T0, WHSEC } from './club.harness-spec';

/*
 * POST /club/stripe/webhook: its own secret, signature on the raw body, event ids recorded after a successful
 * dispatch, one keeper row per paid invoice. Signatures are made locally with Stripe's test helper.
 */

const sign = (payload: string, secret = WHSEC) => Stripe.webhooks.generateTestHeaderString({ payload, secret });

const event = (id: string, type: string, object: Record<string, unknown>, livemode = false) =>
    ({ id, object: 'event', type, livemode, created: Math.floor(T0.getTime() / 1000), data: { object } } as any);

const invoice = (subId: string, extra: Record<string, unknown> = {}) => ({
    id: `in_${subId}`,
    object: 'invoice',
    amount_paid: 999,
    currency: 'usd',
    billing_reason: 'subscription_create',
    total_taxes: [],
    livemode: false,
    parent: { type: 'subscription_details', subscription_details: { subscription: subId, metadata: { club: '1' } } },
    ...extra,
});

async function paidMember(plan: 'month' | 'year' = 'month', env = ENV_ON) {
    const h = clubHarness(env);
    const { subscriptionId } = await h.service.checkout(
        { plan, email: 'ana@example.com', clientKey: KEY_A },
        undefined,
        T0
    );
    h.activate(subscriptionId);
    return { h, subscriptionId };
}

describe('ClubWebhookService', () => {
    it('is 503 without its secret and 400 on a missing or wrong signature', () => {
        const off = clubHarness({ ...ENV_ON, CLUB_STRIPE_WEBHOOK_SECRET: '' });
        expectClubError(() => off.webhooks.verify(Buffer.from('{}'), 'sig'), 503, 'CLUB_WEBHOOK_UNAVAILABLE');
        const { webhooks } = clubHarness();
        const payload = JSON.stringify(event('evt_1', 'invoice.paid', {}));
        expectClubError(() => webhooks.verify(Buffer.from(payload), undefined), 400, 'CLUB_BAD_SIGNATURE');
        expectClubError(
            () => webhooks.verify(Buffer.from(payload), sign(payload, 'whsec_other')),
            400,
            'CLUB_BAD_SIGNATURE'
        );
        expect(webhooks.verify(Buffer.from(payload), sign(payload)).id).toBe('evt_1');
    });

    it('ignores test-mode events in production', async () => {
        const { h, subscriptionId } = await paidMember();
        h.service.env = ENV_PROD;
        h.webhooks.env = ENV_PROD;
        expect(await h.webhooks.handle(event('evt_t', 'invoice.paid', invoice(subscriptionId)), T0)).toBe('ignored');
        expect(h.checkouts.rows).toHaveLength(0);
    });

    it('skips objects that are not the club’s', async () => {
        const { h, subscriptionId } = await paidMember();
        const other = invoice('sub_otherthing', {
            parent: { subscription_details: { subscription: 'sub_otherthing', metadata: {} } },
        });
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', other), T0)).toBe('ignored');
        expect(
            await h.webhooks.handle(
                event('evt_2', 'customer.subscription.updated', { id: 'sub_otherthing', metadata: {} }),
                T0
            )
        ).toBe('ignored');
        expect(await h.webhooks.handle(event('evt_3', 'charge.refunded', { payment_intent: 'pi_unrelated' }), T0)).toBe(
            'ignored'
        );
        expect(h.checkouts.rows).toHaveLength(0);
        expect(subscriptionId).toBeTruthy();
    });

    it.each([
        ['month', 999, 500],
        ['year', 7900, 3950],
    ] as const)('invoice.paid (%s) writes exactly one share row of half the amount', async (plan, paid, share) => {
        const { h, subscriptionId } = await paidMember(plan);
        const inv = invoice(subscriptionId, { amount_paid: paid });
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0)).toBe('paid');
        expect(h.checkouts.rows).toHaveLength(1);
        const row = h.checkouts.rows[0];
        const orderId = clubOrderId(inv.id);
        expect(orderId).toMatch(/^club_[0-9a-f]{16}$/);
        expect(row).toMatchObject({
            orderId,
            rail: 'card',
            network: 'testnet',
            cardIntent: `pi_${inv.id}`,
            sku: { kind: 'CLUB', plan, subscriptionId },
            status: 'COMPLETE',
            priceUsdCents: paid,
            shelterShare: {
                state: 'due',
                bps: 5000,
                amountUsdCents: share,
                route: 'treasury',
                memo: clubMemo(orderId),
            },
        });
        expect(row.shelterShare.memo).toMatch(/^tt:club:[0-9a-f]{16}$/);
        expect(h.webhooks.kickKeeper).toHaveBeenCalledTimes(1);
        // The member row is active until the item period end.
        expect(h.members.rows[0]).toMatchObject({ subStatus: 'active' });
        // Replayed event: deduped by id. Another event of the same invoice: the unique orderId.
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0)).toBe('duplicate');
        expect(await h.webhooks.handle(event('evt_2', 'invoice.paid', inv), T0)).toBe('duplicate-invoice');
        expect(h.checkouts.rows).toHaveLength(1);
    });

    it('the share base is the whole amount paid, VAT included ("$5 of your $9.99" stays true)', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId, { amount_paid: 999, total_taxes: [{ amount: 173 }] });
        await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0);
        expect(h.checkouts.rows[0].priceUsdCents).toBe(999);
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(500);
    });

    it('a live payment uses network card; a payment whose mode does not match the keeper queues nothing', async () => {
        const { h, subscriptionId } = await paidMember();
        h.subs.get(subscriptionId).livemode = true;
        // Test keeper (Arc testnet), live payment: refused.
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', invoice(subscriptionId), true), T0)).toBe(
            'mode-skipped'
        );
        expect(h.checkouts.rows).toHaveLength(0);
        // Mainnet keeper, live payment.
        h.webhooks.env = { ...ENV_ON, SHELTER_CHAIN_ID: '5042' };
        expect(await h.webhooks.handle(event('evt_2', 'invoice.paid', invoice(subscriptionId), true), T0)).toBe('paid');
        expect(h.checkouts.rows[0].network).toBe('card');
    });

    it('subscription updated or deleted moves subStatus, cancelAtPeriodEnd and periodEnd', async () => {
        const { h, subscriptionId } = await paidMember();
        const later = Math.floor(T0.getTime() / 1000) + 60 * 86400;
        Object.assign(h.subs.get(subscriptionId), {
            cancel_at_period_end: true,
            items: { data: [{ price: { id: 'price_clubmonth01' }, current_period_end: later }] },
        });
        const stale = { id: subscriptionId, metadata: { club: '1' }, status: 'incomplete' };
        expect(await h.webhooks.handle(event('evt_1', 'customer.subscription.updated', stale), T0)).toBe('synced');
        expect(h.members.rows[0]).toMatchObject({
            subStatus: 'active',
            cancelAtPeriodEnd: true,
            periodEnd: new Date(later * 1000),
        });
        h.subs.get(subscriptionId).status = 'canceled';
        expect(await h.webhooks.handle(event('evt_2', 'customer.subscription.deleted', stale), T0)).toBe('synced');
        expect(h.members.rows[0].subStatus).toBe('canceled');
    });

    it('rebuilds a missing member row from the subscription and its customer', async () => {
        const { h, subscriptionId } = await paidMember();
        h.members.rows.splice(0);
        expect(
            await h.webhooks.handle(
                event('evt_1', 'customer.subscription.updated', { id: subscriptionId, metadata: { club: '1' } }),
                T0
            )
        ).toBe('recovered');
        expect(h.members.rows[0]).toMatchObject({
            subscriptionId,
            email: 'ana@example.com',
            subStatus: 'active',
            plan: 'month',
        });
    });

    it('a full refund voids a due share and cancels the subscription at once', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId);
        await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0);
        const charge = {
            id: 'ch_1',
            payment_intent: `pi_${inv.id}`,
            amount: 999,
            amount_refunded: 999,
            refunded: true,
        };
        expect(await h.webhooks.handle(event('evt_2', 'charge.refunded', charge), T0)).toBe('voided');
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'void', reversed: 'refunded' });
        expect(h.stripe.subscriptions.cancel).toHaveBeenCalledWith(subscriptionId);
        expect(h.members.rows[0].subStatus).toBe('canceled');
        // A replay under a new id: nothing more to cancel.
        expect(await h.webhooks.handle(event('evt_3', 'charge.refunded', charge), T0)).toBe('voided');
        expect(h.stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    });

    it('a partial refund shrinks a waiting share to half of what was kept', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId);
        await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0);
        const charge = {
            id: 'ch_1',
            payment_intent: `pi_${inv.id}`,
            amount: 999,
            amount_refunded: 500,
            refunded: false,
        };
        expect(await h.webhooks.handle(event('evt_2', 'charge.refunded', charge), T0)).toBe('reduced');
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'due', amountUsdCents: 250 });
        expect(h.stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('a dispute reverses the share; a share already sent is flagged, not re-sent', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId);
        await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0);
        h.checkouts.rows[0].shelterShare.state = 'sent';
        const dispute = { id: 'dp_1', payment_intent: `pi_${inv.id}`, amount: 999 };
        expect(await h.webhooks.handle(event('evt_2', 'charge.dispute.created', dispute), T0)).toBe('after-payout');
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'sent', reversed: 'disputed' });
        // A dispute ends the membership at once, like a full refund: no renewal to dispute again.
        expect(h.stripe.subscriptions.cancel).toHaveBeenCalledWith(subscriptionId);
        expect(h.members.rows[0].subStatus).toBe('canceled');
    });

    it('a dispute of a share still due voids it', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId);
        await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0);
        const dispute = { id: 'dp_1', payment_intent: `pi_${inv.id}`, amount: 999 };
        expect(await h.webhooks.handle(event('evt_2', 'charge.dispute.created', dispute), T0)).toBe('voided');
        expect(h.checkouts.rows[0].shelterShare).toMatchObject({ state: 'void', reversed: 'disputed' });
    });

    it('an invoice not paid in USD queues no share', async () => {
        const { h, subscriptionId } = await paidMember();
        const inv = invoice(subscriptionId, { currency: 'eur' });
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', inv), T0)).toBe('currency-skipped');
        expect(h.checkouts.rows).toHaveLength(0);
    });

    it('does not record the event id when dispatch throws, so Stripe’s retry runs', async () => {
        const { h, subscriptionId } = await paidMember();
        h.stripe.subscriptions.retrieve.mockRejectedValueOnce(new Error('stripe down'));
        await expect(h.webhooks.handle(event('evt_1', 'invoice.paid', invoice(subscriptionId)), T0)).rejects.toThrow(
            'stripe down'
        );
        expect(h.events.rows).toHaveLength(0);
        expect(h.checkouts.rows).toHaveLength(0);
        expect(await h.webhooks.handle(event('evt_1', 'invoice.paid', invoice(subscriptionId)), T0)).toBe('paid');
        expect(h.events.rows).toHaveLength(1);
    });

    it('invoice.payment_failed only logs', async () => {
        const { h, subscriptionId } = await paidMember();
        expect(
            await h.webhooks.handle(
                event('evt_1', 'invoice.payment_failed', invoice(subscriptionId, { amount_paid: 0 })),
                T0
            )
        ).toBe('logged');
        expect(h.checkouts.rows).toHaveLength(0);
    });
});

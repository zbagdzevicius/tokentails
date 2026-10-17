import Stripe from 'stripe';
import { ENV_ON, expectRaveError, raveHarness, T0, WHSEC } from './rave.harness-spec';

/*
 * POST /rave/stripe/webhook: its own secret, signature checked on the raw body, event ids recorded after
 * a successful dispatch, every write idempotent on the PaymentIntent id. Signatures are made locally with
 * Stripe's test helper and a fake secret; nothing reaches Stripe.
 */

const sign = (payload: string, secret = WHSEC) => Stripe.webhooks.generateTestHeaderString({ payload, secret });

const event = (id: string, type: string, object: Record<string, unknown>) => ({
    id,
    object: 'event',
    type,
    livemode: false,
    created: Math.floor(T0.getTime() / 1000),
    data: { object },
});

describe('RaveWebhookService', () => {
    async function paidSetup() {
        const h = raveHarness();
        const res = await h.service.checkout({ cats: 5, method: 'card', coverFee: true }, T0);
        const intentId = h.orders.rows[0].paymentIntentId;
        return { h, res, intentId };
    }

    it('is 503 without its secret and 400 on a missing or wrong signature', () => {
        const noSecret = raveHarness({ ...ENV_ON, RAVE_STRIPE_WEBHOOK_SECRET: '', STRIPE_WEBHOOK_SECRET: '' });
        expectRaveError(() => noSecret.webhooks.verify(Buffer.from('{}'), 'sig'), 503, 'RAVE_WEBHOOK_UNAVAILABLE');
        const { webhooks } = raveHarness();
        const payload = JSON.stringify(event('evt_1', 'payment_intent.succeeded', {}));
        expectRaveError(() => webhooks.verify(Buffer.from(payload), undefined), 400, 'RAVE_BAD_SIGNATURE');
        expectRaveError(
            () => webhooks.verify(Buffer.from(payload), sign(payload, 'whsec_other')),
            400,
            'RAVE_BAD_SIGNATURE'
        );
        expectRaveError(
            () => webhooks.verify(Buffer.from(payload.replace('evt_1', 'evt_2')), sign(payload)),
            400,
            'RAVE_BAD_SIGNATURE'
        );
        expect(webhooks.verify(Buffer.from(payload), sign(payload)).id).toBe('evt_1');
    });

    it('falls back to STRIPE_WEBHOOK_SECRET when the rave has no secret of its own', () => {
        const shared = raveHarness({
            ...ENV_ON,
            RAVE_STRIPE_WEBHOOK_SECRET: '',
            STRIPE_WEBHOOK_SECRET: 'whsec_shared',
        });
        const payload = JSON.stringify(event('evt_1', 'payment_intent.succeeded', {}));
        expect(shared.webhooks.verify(Buffer.from(payload), sign(payload, 'whsec_shared')).id).toBe('evt_1');
        expectRaveError(() => shared.webhooks.verify(Buffer.from(payload), sign(payload)), 400, 'RAVE_BAD_SIGNATURE');
        // The rave's own secret wins.
        const own = raveHarness({ ...ENV_ON, STRIPE_WEBHOOK_SECRET: 'whsec_shared' });
        expect(own.webhooks.verify(Buffer.from(payload), sign(payload)).id).toBe('evt_1');
    });

    it('works while checkout is not ready, so late payments and refunds are not dropped', () => {
        // Checkout reports not-ready (no keeper key); the webhook only needs its own secret.
        const off = raveHarness({ ...ENV_ON, SHELTER_DONATE_PRIVATE_KEY: '' });
        const payload = JSON.stringify(event('evt_1', 'charge.refunded', {}));
        expect(off.webhooks.verify(payload, sign(payload)).type).toBe('charge.refunded');
    });

    it('re-reads the intent, pays once, and dedupes redeliveries and other events of the same intent', async () => {
        const { h, intentId } = await paidSetup();
        h.pay(intentId);
        // The event body claims nothing useful; the retrieved intent is what counts.
        const stale = { id: intentId, object: 'payment_intent', metadata: { rave: '1' }, status: 'requires_action' };
        const e1 = event('evt_1', 'payment_intent.succeeded', stale) as any;
        expect(await h.webhooks.handle(e1, T0)).toBe('paid');
        expect(h.stripe.paymentIntents.retrieve).toHaveBeenCalledWith(intentId, { expand: ['latest_charge'] });
        expect(await h.webhooks.handle(e1, T0)).toBe('duplicate');
        expect(await h.webhooks.handle(event('evt_2', 'payment_intent.succeeded', stale) as any, T0)).toBe('already');
        expect(h.checkouts.rows).toHaveLength(1);
        expect(h.checkouts.rows[0].shelterShare.amountUsdCents).toBe(500);
        expect(h.events.rows.map((r: any) => r.eventId)).toEqual(['evt_1', 'evt_2']);
    });

    it('records the event only after a successful dispatch, so a failure is retried by Stripe', async () => {
        const { h, intentId } = await paidSetup();
        h.pay(intentId);
        h.stripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error('stripe down'));
        const e = event('evt_9', 'payment_intent.succeeded', { id: intentId, metadata: { rave: '1' } }) as any;
        await expect(h.webhooks.handle(e, T0)).rejects.toThrow('stripe down');
        expect(h.events.rows).toHaveLength(0);
        expect(await h.webhooks.handle(e, T0)).toBe('paid');
        expect(h.checkouts.rows).toHaveLength(1);
    });

    it('ignores intents that are not rave intents (portraits, packs, $5 shelter cats)', async () => {
        const { h } = await paidSetup();
        const other = { id: 'pi_pack', metadata: { userId: 'u1', entityType: 'PACK' } };
        expect(await h.webhooks.handle(event('evt_3', 'payment_intent.succeeded', other) as any, T0)).toBe('ignored');
        expect(
            await h.webhooks.handle(
                event('evt_4', 'charge.refunded', { payment_intent: 'pi_pack', refunded: true }) as any,
                T0
            )
        ).toBe('ignored');
        expect(h.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it('voids an unsent payout on a full refund and on a dispute', async () => {
        const { h, intentId } = await paidSetup();
        h.pay(intentId);
        await h.webhooks.handle(
            event('evt_6', 'payment_intent.succeeded', { id: intentId, metadata: { rave: '1' } }) as any,
            T0
        );
        const refund = { id: 'ch_1', object: 'charge', payment_intent: intentId, refunded: true };
        expect(await h.webhooks.handle(event('evt_7', 'charge.refunded', refund) as any, T0)).toBe('voided');
        expect(h.checkouts.rows[0].shelterShare.state).toBe('void');
        expect(h.orders.rows[0].status).toBe('refunded');

        const d = await paidSetup();
        d.h.pay(d.intentId);
        await d.h.service.markPaid(await d.h.stripe.paymentIntents.retrieve(d.intentId), T0);
        const dispute = { id: 'dp_1', object: 'dispute', payment_intent: { id: d.intentId } };
        expect(await d.h.webhooks.handle(event('evt_8', 'charge.dispute.created', dispute) as any, T0)).toBe('voided');
        expect(d.h.orders.rows[0].status).toBe('disputed');
    });
});

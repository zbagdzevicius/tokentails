import { HttpException } from '@nestjs/common';
import Stripe from 'stripe';
import { amountFor, MOTORED_AMOUNT_MAX_CENTS, MOTORED_AMOUNT_MIN_CENTS, motoredMemo } from './motored.config';
import { M_ENV, M_ENV_PROD, M_T0, M_WH, motoredHarness } from './motored.harness-spec';

/*
 * POST /shelter/motored/stripe: its own secret, signature on the raw body, one gift per real paid order
 * keyed by the payment (idempotent), one wallet per Stripe customer (the same wallet for every order).
 * Signatures are made locally with Stripe's test helper.
 */

const sign = (payload: string, secret = M_WH) => Stripe.webhooks.generateTestHeaderString({ payload, secret });

const event = (id: string, type: string, object: Record<string, unknown>, livemode = false) =>
    ({ id, object: 'event', type, livemode, created: Math.floor(M_T0.getTime() / 1000), data: { object } } as any);

const session = (id: string, customer: string, payment: string, extra: Record<string, unknown> = {}) => ({
    id,
    object: 'checkout.session',
    livemode: false,
    payment_status: 'paid',
    currency: 'usd',
    customer,
    payment_intent: payment,
    ...extra,
});

const charge = (payment: string, extra: Record<string, unknown> = {}) => ({
    id: 'ch_1',
    payment_intent: payment,
    ...extra,
});

describe('MotoredStripeService', () => {
    it('is 503 without its secret and 400 on a missing or wrong signature', () => {
        const off = motoredHarness({ ...M_ENV, MOTORED_STRIPE_WEBHOOK_SECRET: '' });
        expect(() => off.webhooks.verify(Buffer.from('{}'), 'sig')).toThrowError(HttpException);
        const { webhooks } = motoredHarness();
        const payload = JSON.stringify(event('evt_1', 'checkout.session.completed', {}));
        expect(() => webhooks.verify(Buffer.from(payload), undefined)).toThrowError(HttpException);
        expect(() => webhooks.verify(Buffer.from(payload), sign(payload, 'whsec_other'))).toThrowError(HttpException);
        expect(webhooks.verify(Buffer.from(payload), sign(payload)).id).toBe('evt_1');
    });

    it('returns unconfigured while a required secret is missing', async () => {
        const { webhooks } = motoredHarness({ ...M_ENV, MOTORED_FUNDER_KEY: '' });
        expect(await webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_1', 'pi_1')))).toBe(
            'unconfigured'
        );
    });

    it('ignores test-mode events in production', async () => {
        const { webhooks, gifts } = motoredHarness(M_ENV_PROD);
        expect(
            await webhooks.handle(event('evt_t', 'checkout.session.completed', session('cs_1', 'cus_1', 'pi_1')))
        ).toBe('ignored');
        expect(gifts.rows).toHaveLength(0);
    });

    it('a paid order makes one gift of 1¢-$1.00, keyed by the payment, and kicks the keeper', async () => {
        const h = motoredHarness();
        expect(
            await h.webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1')))
        ).toBe('due');
        expect(h.gifts.rows).toHaveLength(1);
        expect(h.wallets.rows).toHaveLength(1);
        const row = h.gifts.rows[0];
        expect(row.memo).toBe(motoredMemo(481));
        expect(row.n).toBe(481);
        expect(row.customerKey).toMatch(/^[0-9a-f]{64}$/);
        expect(row.paymentKey).toMatch(/^[0-9a-f]{64}$/);
        expect(row.amountRule).toBe('random-1-100c-v1');
        expect(row.amountUsdCents).toBeGreaterThanOrEqual(MOTORED_AMOUNT_MIN_CENTS);
        expect(row.amountUsdCents).toBeLessThanOrEqual(MOTORED_AMOUNT_MAX_CENTS);
        expect(row.state).toBe('due');
        expect(h.giftService.kick).toHaveBeenCalledTimes(1);
        // The wallet's key is stored encrypted (no raw key).
        expect(h.wallets.rows[0].encryptedKey.content).not.toContain('0x');
    });

    it('a resent webhook of the same payment adds nothing; a second order of the same customer reuses the wallet', async () => {
        const h = motoredHarness();
        const evt = event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1'));
        expect(await h.webhooks.handle(evt, M_T0)).toBe('due');
        // A replay (Stripe retries under a new event id) hits the unique paymentKey.
        expect(await h.webhooks.handle(event('evt_2', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1')), M_T0)).toBe(
            'duplicate-order'
        );
        expect(h.gifts.rows).toHaveLength(1);
        // A new order of the same customer: the SAME wallet (same n), a new gift.
        expect(await h.webhooks.handle(event('evt_3', 'checkout.session.completed', session('cs_2', 'cus_A', 'pi_2')), M_T0)).toBe(
            'due'
        );
        expect(h.gifts.rows).toHaveLength(2);
        expect(h.wallets.rows).toHaveLength(1);
        expect(h.gifts.rows[1].n).toBe(481);
        expect(h.gifts.rows[1].customerKey).toBe(h.gifts.rows[0].customerKey);
    });

    it('a new customer gets the next free label (continuing after the last event round)', async () => {
        const h = motoredHarness();
        await h.webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1')), M_T0);
        await h.webhooks.handle(event('evt_2', 'checkout.session.completed', session('cs_2', 'cus_B', 'pi_2')), M_T0);
        expect(h.wallets.rows.map((w: any) => w.n)).toEqual([481, 482]);
        expect(h.gifts.rows.map((g: any) => g.memo)).toEqual([motoredMemo(481), motoredMemo(482)]);
    });

    it('skips an unpaid order and a currency other than USD/EUR', async () => {
        const h = motoredHarness();
        expect(
            await h.webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1', { payment_status: 'unpaid' })))
        ).toBe('unpaid');
        expect(
            await h.webhooks.handle(event('evt_2', 'checkout.session.completed', session('cs_2', 'cus_A', 'pi_2', { currency: 'gbp' })))
        ).toBe('currency-skipped');
        expect(h.gifts.rows).toHaveLength(0);
        expect(h.wallets.rows).toHaveLength(0);
    });

    it('records the fixed EUR rate on a EUR order', async () => {
        const h = motoredHarness();
        await h.webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1', { currency: 'eur' })));
        expect(h.gifts.rows[0].eurRate).toBe(1);
        expect(h.gifts.rows[0].amountUsdCents).toBe(amountFor(h.gifts.rows[0].paymentKey, M_ENV.MOTORED_AMOUNT_SALT!));
    });

    it('a refund/dispute of a gift still due voids it; of one already sent marks it reversed', async () => {
        const h = motoredHarness();
        await h.webhooks.handle(event('evt_1', 'checkout.session.completed', session('cs_1', 'cus_A', 'pi_1')), M_T0);
        // Still due -> void.
        expect(await h.webhooks.handle(event('evt_2', 'charge.refunded', charge('pi_1', { refunded: true })), M_T0)).toBe('voided');
        expect(h.gifts.rows[0].state).toBe('void');
        expect(h.gifts.rows[0].reversed).toBe('refunded');
        // A dispute of a gift already sent -> reversed, not clawed back.
        await h.webhooks.handle(event('evt_3', 'checkout.session.completed', session('cs_2', 'cus_B', 'pi_3')), M_T0);
        h.gifts.rows[1].state = 'sent';
        expect(await h.webhooks.handle(event('evt_4', 'charge.dispute.created', charge('pi_3')), M_T0)).toBe('after-payout');
        expect(h.gifts.rows[1].state).toBe('sent');
        expect(h.gifts.rows[1].reversed).toBe('disputed');
        // A refund of an unknown payment is ignored.
        expect(await h.webhooks.handle(event('evt_5', 'charge.refunded', charge('pi_nope')), M_T0)).toBe('ignored');
    });
});

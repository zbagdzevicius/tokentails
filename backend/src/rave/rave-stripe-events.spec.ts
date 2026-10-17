import { ENV_ON, raveHarness, T0 } from './rave.harness-spec';
import {
    RAVE_EVENT_TYPES,
    RAVE_EVENTS_LOOKBACK_S,
    RAVE_EVENTS_MAX_PAGES,
    RAVE_EVENTS_OVERLAP_S,
    RAVE_EVENTS_PAGE,
} from './rave-webhook.service';

/*
 * Confirmation without a webhook secret: RaveWebhookService.pullEvents reads the rave's event types from
 * Stripe's Events API (faked here) and runs them through the same `handle` as the webhook. Bounded pages,
 * oldest first, deduped by event id, the cursor moves only when every page was read.
 */

const ev = (id: string, type: string, object: Record<string, unknown>, created: number) => ({
    id,
    object: 'event',
    type,
    livemode: false,
    created,
    data: { object },
});

const T0S = Math.floor(T0.getTime() / 1000);

/** A fake Events API over `all` (newest first, like Stripe), paged by `starting_after`. */
function fakeEvents(all: any[]) {
    const sorted = () => [...all].sort((a, b) => b.created - a.created);
    return {
        list: jest.fn(async (params: any) => {
            let rows = sorted().filter(e => e.created >= params.created.gte && params.types.includes(e.type));
            if (params.starting_after) rows = rows.slice(rows.findIndex(e => e.id === params.starting_after) + 1);
            return { object: 'list', data: rows.slice(0, params.limit), has_more: rows.length > params.limit };
        }),
    };
}

describe('RaveWebhookService.pullEvents (Events API, no webhook secret)', () => {
    const noSecret = { ...ENV_ON, RAVE_STRIPE_WEBHOOK_SECRET: '' };

    it('confirms a paid order, then its refund, oldest first; a second pull is a no-op', async () => {
        const h = raveHarness(noSecret);
        await h.service.checkout({ cats: 5, method: 'card', coverFee: true }, T0);
        const pi = h.orders.rows[0].paymentIntentId;
        h.pay(pi);
        const events = fakeEvents([
            ev('evt_refund', 'charge.refunded', { payment_intent: pi, refunded: true, amount_refunded: 545 }, T0S + 20),
            ev('evt_paid', 'payment_intent.succeeded', { id: pi, metadata: { rave: '1' } }, T0S + 10),
        ]);
        (h.stripe as any).events = events;
        const out = await h.webhooks.pullEvents(new Date(T0.getTime() + 60_000));
        expect(out).toEqual({ read: 2, handled: 2, drained: true });
        expect(h.orders.rows[0].status).toBe('refunded');
        const [params] = events.list.mock.calls[0];
        expect(params.types).toEqual([...RAVE_EVENT_TYPES]);
        expect(params.created.gte).toBe(T0S + 60 - RAVE_EVENTS_LOOKBACK_S - RAVE_EVENTS_OVERLAP_S);
        expect(params.limit).toBe(RAVE_EVENTS_PAGE);
        // The next pull re-reads the overlap; every event is a recorded duplicate.
        const again = await h.webhooks.pullEvents(new Date(T0.getTime() + 120_000));
        expect(again).toEqual({ read: 2, handled: 0, drained: true });
        expect(events.list.mock.calls[1][0].created.gte).toBe(T0S + 60 - RAVE_EVENTS_OVERLAP_S);
        expect(h.events.rows.map((r: any) => r.eventId).sort()).toEqual(['evt_paid', 'evt_refund']);
    });

    it('reads at most RAVE_EVENTS_MAX_PAGES pages and keeps the cursor when more are left', async () => {
        const h = raveHarness(noSecret);
        const many = Array.from({ length: RAVE_EVENTS_PAGE * RAVE_EVENTS_MAX_PAGES + 5 }, (_, i) =>
            ev(`evt_${i}`, 'payment_intent.canceled', { id: `pi_other_${i}`, metadata: {} }, T0S - 1000 + i)
        );
        const events = fakeEvents(many);
        (h.stripe as any).events = events;
        const out = await h.webhooks.pullEvents(T0);
        expect(events.list).toHaveBeenCalledTimes(RAVE_EVENTS_MAX_PAGES);
        expect(out).toMatchObject({ read: RAVE_EVENTS_PAGE * RAVE_EVENTS_MAX_PAGES, drained: false });
        expect(h.webhooks.eventsCursor).toBeNull();
        // An event that arrives meanwhile, ahead of the window's head.
        many.push(ev('evt_new', 'payment_intent.canceled', { id: 'pi_new', metadata: {} }, T0S + 30));
        // Next run continues after the oldest event read: the 5 left, then the cursor moves to the head only.
        const later = new Date(T0.getTime() + 60_000);
        const next = await h.webhooks.pullEvents(later);
        expect(next).toEqual({ read: 5, handled: 0, drained: true });
        // Events of the rest of the account (no rave metadata) are not stored.
        expect(h.events.rows).toHaveLength(0);
        expect(events.list.mock.calls[RAVE_EVENTS_MAX_PAGES][0].starting_after).toBe(
            `evt_${RAVE_EVENTS_PAGE * RAVE_EVENTS_MAX_PAGES - 1 - (RAVE_EVENTS_PAGE * RAVE_EVENTS_MAX_PAGES - 1) + 5}`
        );
        expect(h.webhooks.eventsCursor).toBe(T0S);
        // Then the event that arrived meanwhile.
        await h.webhooks.pullEvents(new Date(T0.getTime() + 120_000));
        const newest = events.list.mock.calls[events.list.mock.calls.length - 1][0];
        expect(newest.created.gte).toBe(T0S - RAVE_EVENTS_OVERLAP_S);
    });

    it('does nothing without a secret key, and warns once when the key cannot read events', async () => {
        const off = raveHarness({});
        (off.stripe as any).events = { list: jest.fn() };
        expect(await off.webhooks.pullEvents(T0)).toBe('off');
        expect((off.stripe as any).events.list).not.toHaveBeenCalled();

        const h = raveHarness(noSecret);
        const denied = Object.assign(new Error('permission'), { statusCode: 403 });
        (h.stripe as any).events = { list: jest.fn(async () => Promise.reject(denied)) };
        const warn = jest.spyOn((h.webhooks as any).logger, 'warn').mockImplementation(() => undefined);
        await h.webhooks.pullEvents(T0);
        await h.webhooks.pullEvents(T0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(h.webhooks.eventsCursor).toBeNull();
    });

    it('an event that fails is not recorded and holds the cursor back, so the next pull retries it', async () => {
        const h = raveHarness(noSecret);
        await h.service.checkout({ cats: 5, method: 'card', coverFee: true }, T0);
        const pi = h.orders.rows[0].paymentIntentId;
        h.pay(pi);
        (h.stripe as any).events = fakeEvents([
            ev('evt_paid', 'payment_intent.succeeded', { id: pi, metadata: { rave: '1' } }, T0S + 10),
        ]);
        h.stripe.paymentIntents.retrieve.mockRejectedValueOnce(new Error('stripe down'));
        jest.spyOn((h.webhooks as any).logger, 'warn').mockImplementation(() => undefined);
        const now = new Date(T0.getTime() + 60_000);
        expect(await h.webhooks.pullEvents(now)).toEqual({ read: 1, handled: 0, drained: true });
        expect(h.webhooks.eventsCursor).toBe(T0S + 10);
        expect(h.events.rows).toHaveLength(0);
        expect(await h.webhooks.pullEvents(now)).toEqual({ read: 1, handled: 1, drained: true });
        expect(h.orders.rows[0].status).toBe('paid');
        expect(h.webhooks.eventsCursor).toBe(T0S + 60);
    });

    it('the cron runs only in production', async () => {
        const h = raveHarness(noSecret);
        (h.stripe as any).events = fakeEvents([]);
        expect(await h.webhooks.pullEventsCron(T0)).toBe('off');
        expect((h.stripe as any).events.list).not.toHaveBeenCalled();
    });

    it('a pulled payment never rebuilds a missing order (another deployment on the same Stripe account)', async () => {
        const h = raveHarness(noSecret);
        await h.service.checkout({ cats: 5, method: 'card', coverFee: true }, T0);
        const pi = h.orders.rows[0].paymentIntentId;
        h.pay(pi);
        // The order is in another database: this one has none.
        h.orders.rows.length = 0;
        (h.stripe as any).events = fakeEvents([
            ev('evt_paid', 'payment_intent.succeeded', { id: pi, metadata: { rave: '1' } }, T0S + 10),
        ]);
        expect(await h.webhooks.pullEvents(new Date(T0.getTime() + 60_000))).toEqual({
            read: 1,
            handled: 0,
            drained: true,
        });
        expect(h.orders.rows).toHaveLength(0);
        expect(h.checkouts.rows).toHaveLength(0);
        // The pushed webhook (this deployment's own endpoint) still rebuilds it.
        expect(
            await h.webhooks.handle(
                ev('evt_paid_push', 'payment_intent.succeeded', { id: pi, metadata: { rave: '1' } }, T0S + 10) as any,
                T0
            )
        ).toBe('paid');
    });

    it('events of the same second keep Stripe order (payment before its refund)', async () => {
        const h = raveHarness(noSecret);
        await h.service.checkout({ cats: 5, method: 'card', coverFee: true }, T0);
        const pi = h.orders.rows[0].paymentIntentId;
        h.pay(pi);
        const handled: string[] = [];
        const real = h.webhooks.handle.bind(h.webhooks);
        jest.spyOn(h.webhooks, 'handle').mockImplementation(async (e: any, n?: Date, src?: any) => {
            handled.push(e.id);
            return real(e, n, src);
        });
        // Newest first, same second: Stripe lists the refund (later) before the payment.
        (h.stripe as any).events = {
            list: jest.fn(async () => ({
                object: 'list',
                has_more: false,
                data: [
                    ev(
                        'evt_refund',
                        'charge.refunded',
                        { payment_intent: pi, refunded: true, amount_refunded: 545 },
                        T0S + 10
                    ),
                    ev('evt_paid', 'payment_intent.succeeded', { id: pi, metadata: { rave: '1' } }, T0S + 10),
                ],
            })),
        };
        await h.webhooks.pullEvents(new Date(T0.getTime() + 60_000));
        expect(handled).toEqual(['evt_paid', 'evt_refund']);
        expect(h.orders.rows[0].status).toBe('refunded');
    });

    it('the cron takes the jobruns lease first and skips while another instance holds it', async () => {
        const h = raveHarness({ ...noSecret, NODE_ENV: 'production' });
        (h.stripe as any).events = fakeEvents([]);
        let held = false;
        h.webhooks.jobRuns = {
            findOneAndUpdate: jest.fn(async () => {
                if (held) throw Object.assign(new Error('E11000'), { code: 11000 });
                held = true;
                return {};
            }),
            updateOne: jest.fn(async () => ({})),
        };
        jest.spyOn((h.webhooks as any).logger, 'log').mockImplementation(() => undefined);
        expect(await h.webhooks.pullEventsCron(T0)).toBe('ran');
        expect(await h.webhooks.pullEventsCron(T0)).toBe('lease-held');
        expect((h.stripe as any).events.list).toHaveBeenCalledTimes(1);
    });
});

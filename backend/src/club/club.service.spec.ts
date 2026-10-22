import { clubMissing, clubReady, readClubConfig } from './club.config';
import { CLUB_OPEN_TTL_MS, signClubToken, verifyClubToken } from './club-token';
import {
    clubHarness,
    ENV_ON,
    ENV_PROD,
    expectClubError,
    KEY_A,
    KEY_B,
    PRICE_MONTH,
    PRICE_YEAR,
    T0,
} from './club.harness-spec';

/* Tails Club checkout, poll and portal with a fake Stripe: nothing reaches the network. */

const body = (extra: Record<string, unknown> = {}) => ({
    plan: 'month',
    email: 'Ana@Example.com',
    clientKey: KEY_A,
    ...extra,
});

describe('club config', () => {
    it('clubReady is false when any required env is missing', () => {
        expect(clubReady(ENV_ON)).toBe(true);
        for (const name of [
            'STRIPE_SECRET_KEY',
            'STRIPE_CLUB_PRICE_MONTH',
            'STRIPE_CLUB_PRICE_YEAR',
            'CLUB_STRIPE_WEBHOOK_SECRET',
            'CLUB_TOKEN_SECRET',
        ]) {
            expect({ name, ready: clubReady({ ...ENV_ON, [name]: '' }) }).toEqual({ name, ready: false });
        }
        // The publishable key falls back to the rave live key only for a live key in production.
        expect(clubMissing(readClubConfig({ ...ENV_ON, STRIPE_PUBLISHABLE_KEY: '' }))).toEqual([
            'STRIPE_PUBLISHABLE_KEY',
        ]);
        expect(clubReady({ ...ENV_PROD, STRIPE_PUBLISHABLE_KEY: '' })).toBe(true);
        // The token secret falls back to an HMAC of INVALIDATE_CACHE_SECRET.
        expect(clubReady({ ...ENV_ON, CLUB_TOKEN_SECRET: '', INVALIDATE_CACHE_SECRET: 'x' })).toBe(true);
        // SendGrid is not required.
        expect(clubReady({ ...ENV_ON, SENDGRID_API_KEY: '' })).toBe(true);
    });

    it('production takes only a live key, other environments only a test key', () => {
        expect(clubReady({ ...ENV_PROD, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' })).toBe(
            false
        );
        expect(clubReady({ ...ENV_ON, STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_PUBLISHABLE_KEY: 'pk_live_x' })).toBe(
            false
        );
        expect(readClubConfig({ ...ENV_ON, STRIPE_SECRET_KEY: 'sk_live_x' }).secretKeyReason).toBe('mode');
        // A publishable key of the other mode is refused too.
        expect(clubReady({ ...ENV_ON, STRIPE_PUBLISHABLE_KEY: 'pk_live_x' })).toBe(false);
    });
});

describe('ClubService', () => {
    it('status reads both prices from Stripe once per 10 minutes; a failed read closes it', async () => {
        const h = clubHarness();
        expect(await h.service.status(T0)).toEqual({
            enabled: true,
            publishableKey: 'pk_test_club_fake',
            prices: { month: { amount: 999, currency: 'usd' }, year: { amount: 7900, currency: 'usd' } },
            shelterBps: 5000,
        });
        await h.service.status(new Date(T0.getTime() + 9 * 60_000));
        expect(h.stripe.prices.retrieve).toHaveBeenCalledTimes(2);
        await h.service.status(new Date(T0.getTime() + 11 * 60_000));
        expect(h.stripe.prices.retrieve).toHaveBeenCalledTimes(4);

        const broken = clubHarness();
        broken.stripe.prices.retrieve.mockRejectedValueOnce(new Error('down'));
        expect(await broken.service.status(T0)).toEqual({ enabled: false, reason: 'price', shelterBps: 5000 });
        const off = clubHarness({ ...ENV_ON, STRIPE_CLUB_PRICE_YEAR: '' });
        expect(await off.service.status(T0)).toEqual({ enabled: false, reason: 'config', shelterBps: 5000 });
        await expectClubError(off.service.checkout(body(), undefined, T0), 503, 'CLUB_OFF');
    });

    it('a price of the wrong interval or currency closes the club', async () => {
        const h = clubHarness();
        h.prices.get(PRICE_YEAR).recurring.interval = 'month';
        expect((await h.service.status(T0)).enabled).toBe(false);
    });

    it('maps the plan to its price id, uses the clientKey idempotency keys and returns the confirmation secret', async () => {
        const h = clubHarness();
        const res = await h.service.checkout(body({ plan: 'year', catId: 'munis' }), undefined, T0);
        expect(res).toEqual({
            clientSecret: 'pi_sub_test2_secret_fake',
            subscriptionId: 'sub_test2',
            status: 'incomplete',
        });
        expect(h.stripe.customers.create).toHaveBeenCalledWith(
            { email: 'ana@example.com', metadata: { club: '1' } },
            { idempotencyKey: `club:cus:${KEY_A}` }
        );
        const [params, opts] = h.stripe.subscriptions.create.mock.calls[0];
        expect(opts).toEqual({ idempotencyKey: `club:sub:${KEY_A}` });
        expect(params).toMatchObject({
            customer: 'cus_test1',
            items: [{ price: PRICE_YEAR }],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.confirmation_secret'],
            metadata: { club: '1', plan: 'year', catId: 'munis', clientKey: KEY_A },
        });
        expect(params.metadata.userId).toBeUndefined();
        const row = h.members.rows[0];
        expect(row).toMatchObject({
            subscriptionId: 'sub_test2',
            customerId: 'cus_test1',
            email: 'ana@example.com',
            emailCanonical: 'ana@example.com',
            plan: 'year',
            subStatus: 'incomplete',
            clientKey: KEY_A,
            livemode: false,
        });
        expect(row.clientKeyHash).toMatch(/^[0-9a-f]{64}$/);

        await h.service.checkout(body({ clientKey: KEY_B, email: 'b@example.com' }), undefined, T0);
        expect(h.stripe.subscriptions.create.mock.calls[1][0].items).toEqual([{ price: PRICE_MONTH }]);
    });

    it('validates the body', async () => {
        const h = clubHarness();
        await expectClubError(h.service.checkout(body({ plan: 'week' }), undefined, T0), 400, 'CLUB_INVALID');
        await expectClubError(h.service.checkout(body({ email: 'nope' }), undefined, T0), 400, 'CLUB_INVALID');
        await expectClubError(h.service.checkout(body({ clientKey: 'short' }), undefined, T0), 400, 'CLUB_INVALID');
        await expectClubError(h.service.checkout(body({ catId: '../x' }), undefined, T0), 400, 'CLUB_INVALID');
        expect(h.stripe.subscriptions.create).not.toHaveBeenCalled();
    });

    it('the same clientKey returns the same result; another body is keyReused', async () => {
        const h = clubHarness();
        const first = await h.service.checkout(body(), undefined, T0);
        const again = await h.service.checkout(body({ email: 'ana@example.com ' }), undefined, T0);
        expect(again).toEqual(first);
        expect(h.stripe.subscriptions.create).toHaveBeenCalledTimes(1);
        expect(h.members.rows).toHaveLength(1);
        await expectClubError(h.service.checkout(body({ plan: 'year' }), undefined, T0), 409, 'CLUB_KEY_REUSED');
        // A race on the unique index: the loser re-reads the winner's row.
        const race = clubHarness();
        await race.service.checkout(body(), undefined, T0);
        race.members.findOne.mockImplementationOnce(() => ({ lean: async () => null }));
        expect(await race.service.checkout(body(), undefined, T0)).toEqual(first);
    });

    it('an inbox with an active membership gets alreadyMember; an earlier customer is never reused', async () => {
        const h = clubHarness();
        const first = await h.service.checkout(body(), undefined, T0);
        // Not paid yet: a second try (new clientKey) gets its own customer, so typing someone's address never
        // reaches their earlier customer (invoices, receipts, saved cards) through the payer's manage link.
        await h.service.checkout(body({ clientKey: KEY_B, email: 'ana@EXAMPLE.com' }), undefined, T0);
        expect(h.stripe.customers.create).toHaveBeenCalledTimes(2);
        expect(h.stripe.customers.create.mock.calls[1][1]).toEqual({ idempotencyKey: `club:cus:${KEY_B}` });
        expect(h.stripe.subscriptions.create.mock.calls[1][0].customer).not.toBe(
            h.stripe.subscriptions.create.mock.calls[0][0].customer
        );
        h.activate(first.subscriptionId);
        await h.service.getSubscription(first.subscriptionId, KEY_A, T0);
        await expectClubError(
            h.service.checkout(body({ clientKey: '7b0c5f0e-1d2a-4c55-9a51-2f2d0f6a1a03' }), undefined, T0),
            409,
            'CLUB_ALREADY_MEMBER'
        );
    });

    it('pauses checkout above CLUB_INCOMPLETE_PER_15MIN incomplete subscriptions', async () => {
        const h = clubHarness({ ...ENV_ON, CLUB_INCOMPLETE_PER_15MIN: '2' });
        await h.service.checkout(body({ email: 'a1@example.com', clientKey: 'aaaaaaaa-1' }), undefined, T0);
        await h.service.checkout(body({ email: 'a2@example.com', clientKey: 'aaaaaaaa-2' }), undefined, T0);
        await expectClubError(
            h.service.checkout(body({ email: 'a3@example.com', clientKey: 'aaaaaaaa-3' }), undefined, T0),
            503,
            'CLUB_BUSY'
        );
        // 15 minutes later the window has moved on.
        h.clock.now = new Date(T0.getTime() + 16 * 60_000);
        const later = new Date(h.clock.now);
        await h.service.checkout(body({ email: 'a3@example.com', clientKey: 'aaaaaaaa-3' }), undefined, later);
    });

    it('a Stripe failure drops the row and answers 502', async () => {
        const h = clubHarness();
        h.stripe.subscriptions.create.mockRejectedValueOnce(new Error('card_declined'));
        await expectClubError(h.service.checkout(body(), undefined, T0), 502, 'CLUB_STRIPE');
        expect(h.members.rows).toHaveLength(0);
    });

    it('sets userId from a signed-in non-guest accesstoken only', async () => {
        const h = clubHarness();
        h.users.rows.push({ _id: '64b000000000000000000001', firebaseUids: ['uid-1'], email: 'p@example.com' });
        expect(await h.service.optionalUserId('fbgood-token')).toBe('64b000000000000000000001');
        expect(await h.service.optionalUserId('fbguest-token')).toBeUndefined();
        expect(await h.service.optionalUserId('fbbad-token-xx')).toBeUndefined();
        expect(await h.service.optionalUserId(undefined)).toBeUndefined();
        await h.service.checkout(body(), '64b000000000000000000001', T0);
        expect(h.stripe.subscriptions.create.mock.calls[0][0].metadata.userId).toBe('64b000000000000000000001');
        expect(h.members.rows[0].userId).toBe('64b000000000000000000001');
    });

    it('the poll needs the right k and reads Stripe at most every 5 s', async () => {
        const h = clubHarness();
        const { subscriptionId } = await h.service.checkout(body(), undefined, T0);
        await expectClubError(h.service.getSubscription(subscriptionId, KEY_B, T0), 404, 'CLUB_NOT_FOUND');
        await expectClubError(h.service.getSubscription(subscriptionId, undefined, T0), 404, 'CLUB_NOT_FOUND');
        await expectClubError(h.service.getSubscription('sub_unknown01', KEY_A, T0), 404, 'CLUB_NOT_FOUND');

        const v1 = await h.service.getSubscription(subscriptionId, KEY_A, T0);
        expect(v1).toMatchObject({ status: 'incomplete', plan: 'month' });
        expect(v1.manageToken).toBeUndefined();
        expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
        h.activate(subscriptionId);
        // Within 5 s: no second Stripe read, still incomplete.
        const v2 = await h.service.getSubscription(subscriptionId, KEY_A, new Date(T0.getTime() + 3000));
        expect(v2.status).toBe('incomplete');
        expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledTimes(1);
        const v3 = await h.service.getSubscription(subscriptionId, KEY_A, new Date(T0.getTime() + 6000));
        expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledTimes(2);
        expect(v3.status).toBe('active');
        expect(v3.periodEnd).toBe(new Date((Math.floor(T0.getTime() / 1000) + 30 * 86400) * 1000).toISOString());
        // Active: no more Stripe reads, and a manage token.
        await h.service.getSubscription(subscriptionId, KEY_A, new Date(T0.getTime() + 20000));
        expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledTimes(2);
        expect(typeof v3.manageToken).toBe('string');
    });

    it('the manage token is issued only when active; its signature and expiry are checked', async () => {
        const h = clubHarness();
        const { subscriptionId } = await h.service.checkout(body(), undefined, T0);
        h.activate(subscriptionId);
        const { manageToken } = await h.service.getSubscription(subscriptionId, KEY_A, T0);
        const secret = ENV_ON.CLUB_TOKEN_SECRET!;
        expect(verifyClubToken(manageToken, secret, 'manage', T0.getTime())?.sub).toBe(subscriptionId);
        expect(verifyClubToken(manageToken, 'other-secret', 'manage', T0.getTime())).toBeNull();
        expect(verifyClubToken(manageToken, secret, 'open', T0.getTime())).toBeNull();
        expect(verifyClubToken(manageToken, secret, 'manage', T0.getTime() + 31 * 86400_000)).toBeNull();
        const [part, sig] = manageToken!.split('.');
        const forged = Buffer.from(
            JSON.stringify({ t: 'manage', sub: 'sub_someoneelse', exp: T0.getTime() + 1e9 })
        ).toString('base64url');
        expect(verifyClubToken(`${forged}.${sig}`, secret, 'manage', T0.getTime())).toBeNull();
        expect(part).toBeTruthy();

        expect(await h.service.portal({ manageToken }, T0)).toEqual({
            url: 'https://billing.stripe.com/p/session/test_cus_test1',
        });
        expect(h.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
            customer: 'cus_test1',
            return_url: 'https://tokentails.com/#club',
        });
        await expectClubError(h.service.portal({ manageToken: `${forged}.${sig}` }, T0), 403, 'CLUB_BAD_TOKEN');
    });

    it('portal by email always answers sent, emails only a member, at most 3 a day, and never opens the portal', async () => {
        const h = clubHarness();
        expect(await h.service.portal({ email: 'nobody@example.com' }, T0)).toEqual({ sent: true });
        expect(h.sent).toHaveLength(0);
        // An unpaid checkout is not a member: no email.
        const { subscriptionId } = await h.service.checkout(body(), undefined, T0);
        expect(await h.service.portal({ email: 'ana@example.com' }, T0)).toEqual({ sent: true });
        expect(h.sent).toHaveLength(0);
        h.activate(subscriptionId);
        await h.service.getSubscription(subscriptionId, KEY_A, T0);
        expect(await h.service.portal({ email: 'ANA@example.com' }, T0)).toEqual({ sent: true });
        expect(h.sent).toHaveLength(1);
        expect(h.sent[0].to).toBe('ana@example.com');
        const link = /href="([^"]+)"/.exec(h.sent[0].html)![1].replace(/&amp;/g, '&');
        expect(link.startsWith('https://api.tokentails.com/club/portal/open?t=')).toBe(true);
        expect(h.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
        const t = decodeURIComponent(link.split('t=')[1]);
        expect(await h.service.openPortal(t, new Date(T0.getTime() + 60_000))).toBe(
            'https://billing.stripe.com/p/session/test_cus_test1'
        );
        expect(await h.service.openPortal(t, new Date(T0.getTime() + CLUB_OPEN_TTL_MS + 1))).toBeNull();
        // A manage token is not an open token.
        const manage = signClubToken(
            { t: 'manage', sub: subscriptionId, exp: T0.getTime() + 1e6 },
            ENV_ON.CLUB_TOKEN_SECRET!
        );
        expect(await h.service.openPortal(manage, T0)).toBeNull();
        // The per-address daily limit counts requests (3 a day, the unpaid one above included), then silently none.
        await h.service.portal({ email: 'ana@example.com' }, T0);
        expect(h.sent).toHaveLength(2);
        expect(await h.service.portal({ email: 'ana@example.com' }, T0)).toEqual({ sent: true });
        expect(h.sent).toHaveLength(2);
    });

    it('portal by email answers before the email is sent (a member and a stranger take the same time)', async () => {
        const h = clubHarness();
        const { subscriptionId } = await h.service.checkout(body(), undefined, T0);
        h.activate(subscriptionId);
        await h.service.getSubscription(subscriptionId, KEY_A, T0);
        let calls = 0;
        h.service.sendEmail = () => {
            calls++;
            return new Promise<boolean>(() => undefined);
        };
        expect(await h.service.portal({ email: 'ana@example.com' }, T0)).toEqual({ sent: true });
        expect(calls).toBe(1);
    });

    it('portal by email is 503 without SendGrid; the manage token still works', async () => {
        const h = clubHarness({ ...ENV_ON, SENDGRID_API_KEY: '' });
        await expectClubError(h.service.portal({ email: 'ana@example.com' }, T0), 503, 'CLUB_PORTAL_OFF');
        const { subscriptionId } = await h.service.checkout(body(), undefined, T0);
        h.activate(subscriptionId);
        const { manageToken } = await h.service.getSubscription(subscriptionId, KEY_A, T0);
        expect((await h.service.portal({ manageToken }, T0)).url).toContain('billing.stripe.com');
    });
});

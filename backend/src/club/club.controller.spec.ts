import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { CLUB_THROTTLES } from './club.config';
import { ClubController } from './club.controller';
import { clubHarness, ENV_ON, expectClubError, KEY_A, T0 } from './club.harness-spec';

/* Routes, gates and per-IP limits of /club. */

function controller(env: NodeJS.ProcessEnv = ENV_ON) {
    const h = clubHarness(env);
    const ipThrottler: any = { consume: jest.fn(async () => undefined) };
    return { h, ipThrottler, ctl: new ClubController(h.service, h.webhooks, ipThrottler) };
}

const res = () => ({ status: jest.fn(), redirect: jest.fn(), setHeader: jest.fn() });

describe('ClubController', () => {
    it('each route counts its own per-IP limit', async () => {
        const { ctl, ipThrottler } = controller();
        const req = { ip: '1.2.3.4' };
        await ctl.status(req, {});
        const paid = await ctl.checkout(
            { plan: 'month', email: 'ana@example.com', clientKey: KEY_A },
            undefined,
            req,
            {}
        );
        await ctl.subscription(paid.subscriptionId, KEY_A, req, {});
        await ctl.portal({ email: 'nobody@example.com' }, req, res());
        await ctl.portalOpen('bad', req, res());
        const scopes = ipThrottler.consume.mock.calls.map((c: any[]) => [c[0], c[2]]);
        expect(scopes).toEqual([
            ['ClubController.status', CLUB_THROTTLES.status],
            ['ClubController.checkout', CLUB_THROTTLES.checkout],
            ['ClubController.subscription', CLUB_THROTTLES.subscription],
            ['ClubController.portal', CLUB_THROTTLES.portal],
            ['ClubController.portalOpen', CLUB_THROTTLES.portalOpen],
        ]);
        expect(CLUB_THROTTLES).toMatchObject({
            status: { limit: 60, ttl: 60_000 },
            checkout: { limit: 6, ttl: 600_000 },
            subscription: { limit: 30, ttl: 60_000 },
            portal: { limit: 3, ttl: 3_600_000 },
        });
    });

    it('not ready: status says disabled and checkout is 503 before the throttle or any Stripe call', async () => {
        const { h, ctl, ipThrottler } = controller({ ...ENV_ON, STRIPE_CLUB_PRICE_MONTH: '' });
        expect(await ctl.status({}, {})).toEqual({ enabled: false, reason: 'config', shelterBps: 5000 });
        await expectClubError(
            ctl.checkout({ plan: 'month', email: 'a@example.com', clientKey: KEY_A }, undefined, {}, {}),
            503,
            'CLUB_OFF'
        );
        expect(ipThrottler.consume).toHaveBeenCalledTimes(1);
        expect(h.stripe.subscriptions.create).not.toHaveBeenCalled();
    });

    it('portal answers 202 for an email and 200 with a url for a manage token; an expired link redirects to the card', async () => {
        const { h, ctl } = controller();
        const r1 = res();
        expect(await ctl.portal({ email: 'nobody@example.com' }, {}, r1)).toEqual({ sent: true });
        expect(r1.status).toHaveBeenCalledWith(202);
        const paid = await ctl.checkout(
            { plan: 'month', email: 'ana@example.com', clientKey: KEY_A },
            undefined,
            {},
            {}
        );
        h.activate(paid.subscriptionId);
        const { manageToken } = await ctl.subscription(paid.subscriptionId, KEY_A, {}, {});
        const r2 = res();
        expect((await ctl.portal({ manageToken }, {}, r2)) as any).toHaveProperty('url');
        expect(r2.status).toHaveBeenCalledWith(200);
        const r3 = res();
        await ctl.portalOpen('expired', {}, r3);
        expect(r3.redirect).toHaveBeenCalledWith(303, 'https://tokentails.com/?club_portal=expired#club');
    });

    it('checkout passes the user id of an optional signed-in accesstoken', async () => {
        const { h, ctl } = controller();
        h.users.rows.push({ _id: '64b000000000000000000001', firebaseUids: ['uid-1'] });
        await ctl.checkout({ plan: 'month', email: 'ana@example.com', clientKey: KEY_A }, 'fbgood-token', {}, {});
        expect(h.stripe.subscriptions.create.mock.calls[0][0].metadata.userId).toBe('64b000000000000000000001');
    });

    it('/club/me sits behind AppAuthGuard; public routes carry no guard', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ClubController.prototype.me)).toEqual([AppAuthGuard]);
        for (const name of ['status', 'checkout', 'subscription', 'portal', 'portalOpen', 'webhook'] as const) {
            expect(Reflect.getMetadata(GUARDS_METADATA, ClubController.prototype[name])).toBeUndefined();
        }
    });

    it('/club/me links a membership by verified email only', async () => {
        const { h, ctl } = controller();
        const paid = await ctl.checkout(
            { plan: 'year', email: 'Ana@Example.com', clientKey: KEY_A },
            undefined,
            {},
            {}
        );
        h.activate(paid.subscriptionId);
        await ctl.subscription(paid.subscriptionId, KEY_A, {}, {});

        const unverified = { _id: 'u-unverified', email: 'ana@example.com', emailCanonical: 'ana@example.com' };
        expect(await ctl.me({ user: unverified }, {})).toEqual({ club: null });
        expect(h.members.rows[0].userId).toBeUndefined();

        const verified = { ...unverified, _id: 'u-verified', emailVerifiedAt: T0 };
        const out = await ctl.me({ user: verified }, {});
        expect(out.club).toMatchObject({ plan: 'year' });
        expect(typeof out.club!.until).toBe('string');
        expect(h.members.rows[0].userId).toBe('u-verified');
        // Now linked: found by user id even without the email.
        expect((await ctl.me({ user: { _id: 'u-verified' } }, {})).club).toMatchObject({ plan: 'year' });
    });
});

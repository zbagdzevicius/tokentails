import { HttpException } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { RAVE_AD_THROTTLES, RaveAdCheckoutGate, RaveAdsController } from './rave-ads.controller';
import { adsHarness, ENV_ADS, png } from './rave-ads.harness-spec';

/*
 * Routes, gates and limits of /rave/ads. The checkout's readiness check and per-IP limit run in a guard
 * (RaveAdCheckoutGate), before FileInterceptor reads the upload; the readiness check comes first.
 */

const httpContext = (req: any, res: any = {}) =>
    ({ switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any);

function controller(env: NodeJS.ProcessEnv) {
    const h = adsHarness(env);
    const ipThrottler: any = { consume: jest.fn(async () => undefined) };
    return { h, ipThrottler, ctl: new RaveAdsController(h.service, ipThrottler) };
}

const canActivate = (guard: any, permission: number) =>
    new guard().canActivate({ switchToHttp: () => ({ getRequest: () => ({ user: { permission } }) }) } as any);

describe('RaveAdsController', () => {
    it('not ready: status says disabled, the checkout gate is 503 before any throttle; the public list stays readable', async () => {
        const { h, ctl, ipThrottler } = controller({});
        expect(await ctl.status({}, {})).toEqual({ enabled: false, reason: 'stripe' });
        const gate = new RaveAdCheckoutGate(h.service, ipThrottler);
        const next = { handle: jest.fn() };
        const error: any = await gate.intercept(httpContext({ ip: '1.2.3.4' }), next).catch(e => e);
        expect(next.handle).not.toHaveBeenCalled();
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(503);
        expect(ipThrottler.consume).toHaveBeenCalledTimes(1);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
        expect((await ctl.list({}, {})).ads).toEqual([]);
    });

    it('ready: the checkout gate counts the per-IP limit (6 per 10 min), then checkout holds the slot', async () => {
        const { h, ctl, ipThrottler } = controller(ENV_ADS);
        const gate = new RaveAdCheckoutGate(h.service, ipThrottler);
        const next = { handle: jest.fn(() => 'handled') };
        expect(await gate.intercept(httpContext({ ip: '1.2.3.4' }), next as any)).toBe('handled');
        expect(ipThrottler.consume).toHaveBeenCalledWith(
            'RaveAdsController.checkout',
            { ip: '1.2.3.4' },
            RAVE_AD_THROTTLES.checkout,
            {}
        );
        expect(RAVE_AD_THROTTLES.checkout).toEqual({ limit: 6, ttl: 10 * 60_000 });
        const res = await ctl.checkout(
            { slotId: 'moon-2', name: 'Moon Pies', url: 'https://moonpies.example.com', coverFee: 'false' },
            { buffer: await png(900, 300) },
            { ip: '1.2.3.4' }
        );
        expect(res).toMatchObject({ slotId: 'moon-2', amountCents: 10000, status: 'held' });
        expect(h.ads.rows[0].holdIpHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(h.ads.rows[0])).not.toContain('1.2.3.4');
    });

    it('the checkout route runs RaveAdCheckoutGate before the upload interceptor, and no guard', () => {
        const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, RaveAdsController.prototype.checkout);
        expect(interceptors[0]).toBe(RaveAdCheckoutGate);
        expect(interceptors).toHaveLength(2);
        expect(Reflect.getMetadata(GUARDS_METADATA, RaveAdsController.prototype.checkout)).toBeUndefined();
    });

    it('approve, reject and the admin list need a signed-in ADMIN (5)', () => {
        for (const name of ['approve', 'reject', 'adminList', 'adminImage'] as const) {
            const guards = Reflect.getMetadata(GUARDS_METADATA, RaveAdsController.prototype[name]);
            expect(guards).toHaveLength(2);
            expect(guards[0]).toBe(AppAuthGuard);
            expect(canActivate(guards[1], PERMISSION_LEVEL.ADMIN)).toBe(true);
            expect(canActivate(guards[1], PERMISSION_LEVEL.MANAGER)).toBe(false);
        }
        for (const name of ['status', 'list', 'checkout', 'ad'] as const) {
            expect(Reflect.getMetadata(GUARDS_METADATA, RaveAdsController.prototype[name])).toBeUndefined();
        }
    });
});

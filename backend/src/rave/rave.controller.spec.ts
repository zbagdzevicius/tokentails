import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { RAVE_THROTTLES, RaveController } from './rave.controller';
import { ENV_ON, expectRaveError, raveHarness, T0 } from './rave.harness-spec';

/* Routes, gates and limits of /rave. The readiness check comes before the per-IP limit, so a closed route costs nothing. */

function controller(env: NodeJS.ProcessEnv) {
    const h = raveHarness(env);
    const ipThrottler: any = { consume: jest.fn(async () => undefined) };
    return { h, ipThrottler, ctl: new RaveController(h.service, h.webhooks, ipThrottler) };
}

describe('RaveController', () => {
    it('not ready: status says disabled, checkout and usdc-tx are 503 before any throttle or Stripe call', async () => {
        const { h, ctl, ipThrottler } = controller({});
        expect(await ctl.status({}, {})).toEqual({ enabled: false, reason: 'stripe' });
        await expectRaveError(ctl.checkout({ cats: 5 }, {}, {}), 503, 'RAVE_OFF');
        await expectRaveError(ctl.usdcTx('rv_0000000000000001', {}, {}, {}), 503, 'RAVE_OFF');
        expect(ipThrottler.consume).toHaveBeenCalledTimes(1);
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
        // The public list stays readable (empty).
        expect((await ctl.cats({}, {}, {})).orders).toEqual([]);
    });

    it('ready: checkout counts the per-IP limit (6 per 10 min) and returns the client secret', async () => {
        const { ctl, ipThrottler } = controller(ENV_ON);
        const res = await ctl.checkout({ cats: 1, method: 'card', coverFee: true }, { ip: '1.2.3.4' }, {});
        expect(res.amountCents).toBe(134);
        expect(ipThrottler.consume).toHaveBeenCalledWith(
            'RaveController.checkout',
            { ip: '1.2.3.4' },
            RAVE_THROTTLES.checkout,
            {}
        );
        expect(RAVE_THROTTLES.checkout).toEqual({ limit: 6, ttl: 10 * 60_000 });
    });

    it('unknown order ids are 404', async () => {
        const { ctl } = controller(ENV_ON);
        await expectRaveError(ctl.order('rv_ffffffffffffffff', {}, {}), 404, 'RAVE_ORDER_NOT_FOUND');
        await expectRaveError(ctl.order('../etc', {}, {}), 404, 'RAVE_ORDER_NOT_FOUND');
    });

    it('admin routes sit behind AppAuthGuard first', () => {
        for (const name of ['moderate', 'release'] as const) {
            const guards = Reflect.getMetadata(GUARDS_METADATA, RaveController.prototype[name]);
            expect(guards[0]).toBe(AppAuthGuard);
            expect(guards).toHaveLength(2);
        }
        expect(Reflect.getMetadata(GUARDS_METADATA, RaveController.prototype.checkout)).toBeUndefined();
        expect(T0).toBeInstanceOf(Date);
    });
});

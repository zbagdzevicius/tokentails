import { ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ClientIpThrottle, ClientIpThrottlerGuard } from './client-ip-throttler.guard';

class FakeStorage {
    hits = new Map<string, number>();
    async increment(key: string) {
        const totalHits = (this.hits.get(key) || 0) + 1;
        this.hits.set(key, totalHits);
        return { totalHits, timeToExpire: 60 };
    }
}

class Routes {
    @ClientIpThrottle({ limit: 2, ttl: 60000 })
    upload() {
        return true;
    }
}

const BALANCER = '10.0.0.4';

function context(headers: Record<string, string>) {
    const response = { header: jest.fn() };
    return {
        response,
        ctx: {
            getHandler: () => Routes.prototype.upload,
            getClass: () => Routes,
            switchToHttp: () => ({
                getRequest: () => ({ headers, ip: BALANCER, ips: [] }),
                getResponse: () => response,
            }),
        } as any,
    };
}

describe('ClientIpThrottlerGuard', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        process.env = { ...OLD_ENV, NODE_ENV: 'test' };
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('gives two client addresses behind the same req.ip separate buckets', async () => {
        const storage = new FakeStorage();
        const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
        const a = context({ 'cf-connecting-ip': '203.0.113.7' });
        const b = context({ 'cf-connecting-ip': '198.51.100.9' });

        await expect(guard.canActivate(a.ctx)).resolves.toBe(true);
        await expect(guard.canActivate(a.ctx)).resolves.toBe(true);
        await expect(guard.canActivate(b.ctx)).resolves.toBe(true);
        expect([...storage.hits.keys()]).toEqual([
            'client-ip-throttle:Routes.upload:203.0.113.7',
            'client-ip-throttle:Routes.upload:198.51.100.9',
        ]);
    });

    it('applies the limit from @ClientIpThrottle and sets Retry-After', async () => {
        const guard = new ClientIpThrottlerGuard(new FakeStorage() as any, new Reflector());
        const a = context({ 'cf-connecting-ip': '203.0.113.7' });
        await guard.canActivate(a.ctx);
        await guard.canActivate(a.ctx);
        await expect(guard.canActivate(a.ctx)).rejects.toBeInstanceOf(ThrottlerException);
        expect(a.response.header).toHaveBeenCalledWith('Retry-After', 60);
    });

    it('consume() counts a handler-side scope (GET /yourcat/status)', async () => {
        const storage = new FakeStorage();
        const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
        const req = { headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: BALANCER, ips: [] };
        await guard.consume('YourcatController.status', req, { limit: 1, ttl: 60000 });
        await expect(guard.consume('YourcatController.status', req, { limit: 1, ttl: 60000 })).rejects.toBeInstanceOf(
            ThrottlerException
        );
    });

    describe('in production (KI-07)', () => {
        beforeEach(() => {
            process.env = { ...OLD_ENV, NODE_ENV: 'production' };
            delete process.env.CF_ORIGIN_SECRET;
            delete process.env.TRUST_PROXY;
        });

        it('forged distinct cf-connecting-ip headers without proof share one bucket', async () => {
            const storage = new FakeStorage();
            const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
            for (const forged of ['203.0.113.7', '198.51.100.9', '192.0.2.44']) {
                await guard.canActivate(context({ 'cf-connecting-ip': forged }).ctx);
            }
            expect([...storage.hits.entries()]).toEqual([['client-ip-throttle:Routes.upload:untrusted', 3]]);
        });

        it('the shared bucket has its own limit (default limit * 10, or untrustedLimit)', async () => {
            const guard = new ClientIpThrottlerGuard(new FakeStorage() as any, new Reflector());
            const options = { limit: 1, ttl: 60000 };
            for (let i = 0; i < 10; i++) {
                await guard.consume(
                    'S.default',
                    { headers: { 'cf-connecting-ip': `203.0.113.${i + 1}` }, ip: BALANCER, ips: [] },
                    options
                );
            }
            await expect(
                guard.consume(
                    'S.default',
                    { headers: { 'cf-connecting-ip': '203.0.113.99' }, ip: BALANCER, ips: [] },
                    options
                )
            ).rejects.toBeInstanceOf(ThrottlerException);

            const custom = { limit: 1, ttl: 60000, untrustedLimit: 2 };
            const forged = (ip: string) => ({ headers: { 'cf-connecting-ip': ip }, ip: BALANCER, ips: [] });
            await guard.consume('S.custom', forged('203.0.113.1'), custom);
            await guard.consume('S.custom', forged('203.0.113.2'), custom);
            await expect(guard.consume('S.custom', forged('203.0.113.3'), custom)).rejects.toBeInstanceOf(
                ThrottlerException
            );
        });

        it('a proven address (origin secret) keeps its own bucket and the normal limit', async () => {
            process.env.CF_ORIGIN_SECRET = 'origin-secret';
            const storage = new FakeStorage();
            const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
            const proven = (ip: string) => context({ 'cf-connecting-ip': ip, 'x-tt-origin-auth': 'origin-secret' });
            await guard.canActivate(proven('203.0.113.7').ctx);
            await guard.canActivate(proven('198.51.100.9').ctx);
            expect([...storage.hits.keys()]).toEqual([
                'client-ip-throttle:Routes.upload:203.0.113.7',
                'client-ip-throttle:Routes.upload:198.51.100.9',
            ]);
            const a = proven('203.0.113.7');
            await guard.canActivate(a.ctx);
            await expect(guard.canActivate(a.ctx)).rejects.toBeInstanceOf(ThrottlerException);
        });
    });
});

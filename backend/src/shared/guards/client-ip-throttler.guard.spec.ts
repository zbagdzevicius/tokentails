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

    describe('in production, with no proxy env', () => {
        beforeEach(() => {
            process.env = { ...OLD_ENV, NODE_ENV: 'production' };
            delete process.env.TRUST_PROXY;
        });

        it('keys each cf-connecting-ip on its own bucket with the normal limit (no origin secret)', async () => {
            const storage = new FakeStorage();
            const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
            await guard.canActivate(context({ 'cf-connecting-ip': '203.0.113.7' }).ctx);
            await guard.canActivate(context({ 'cf-connecting-ip': '198.51.100.9' }).ctx);
            expect([...storage.hits.keys()]).toEqual([
                'client-ip-throttle:Routes.upload:203.0.113.7',
                'client-ip-throttle:Routes.upload:198.51.100.9',
            ]);
            const a = context({ 'cf-connecting-ip': '203.0.113.7' });
            await guard.canActivate(a.ctx);
            await expect(guard.canActivate(a.ctx)).rejects.toBeInstanceOf(ThrottlerException);
        });

        it('a request with no usable address shares the unknown bucket', async () => {
            const storage = new FakeStorage();
            const guard = new ClientIpThrottlerGuard(storage as any, new Reflector());
            await guard.consume('S.default', { headers: {}, ip: BALANCER, ips: [] }, { limit: 5, ttl: 60000 });
            expect([...storage.hits.keys()]).toEqual(['client-ip-throttle:S.default:unknown']);
        });
    });
});

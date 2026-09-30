import { APP_GUARD, Reflector } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { AppThrottlerGuard, DEFAULT_THROTTLE } from './app-throttler.guard';

// Never read a local env file, so the AppModule test below behaves as on a clean checkout or CI.
jest.mock('dotenv', () => ({ config: jest.fn() }));
// Initializing Firebase needs a real service account; the test only reads module metadata.
jest.mock('src/user/firebase-admin.module', () => ({
    FirebaseAdminModule: { forRoot: () => ({ module: class FirebaseAdminStub {} }) },
}));

class SomeController {
    anyRoute() {
        return 1;
    }
}

function context(req: Record<string, any>, handler: (...args: any[]) => any = SomeController.prototype.anyRoute) {
    return {
        getType: () => 'http',
        getHandler: () => handler,
        getClass: () => SomeController,
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ header: jest.fn() }) }),
    } as any;
}

// Each hit arms a 60 s expiry timer; clearing them lets jest exit right after the run.
const storages: ThrottlerStorageService[] = [];
afterAll(() => storages.forEach(storage => storage.onApplicationShutdown()));

async function createGuard() {
    const storage = new ThrottlerStorageService();
    storages.push(storage);
    const guard = new AppThrottlerGuard([DEFAULT_THROTTLE], storage, new Reflector());
    await guard.onModuleInit();
    return guard;
}

async function hit(guard: AppThrottlerGuard, times: number, req: Record<string, any>) {
    for (let i = 0; i < times; i++) {
        await guard.canActivate(context({ method: 'POST', path: '/x', url: '/x', headers: {}, ...req }));
    }
}

describe('AppThrottlerGuard', () => {
    it('applies the default limit to routes without @Throttle', async () => {
        const guard = await createGuard();
        await hit(guard, DEFAULT_THROTTLE.limit, { ip: '1.1.1.1' });

        await expect(
            guard.canActivate(context({ method: 'POST', path: '/x', url: '/x', headers: {}, ip: '1.1.1.1' }))
        ).rejects.toBeInstanceOf(ThrottlerException);
        // Another client still has its own bucket.
        await expect(
            guard.canActivate(context({ method: 'POST', path: '/x', url: '/x', headers: {}, ip: '2.2.2.2' }))
        ).resolves.toBe(true);
    });

    it('never throttles the GET / health check', async () => {
        const guard = await createGuard();
        for (let i = 0; i < DEFAULT_THROTTLE.limit + 5; i++) {
            await expect(
                guard.canActivate(context({ method: 'GET', path: '/', url: '/', headers: {}, ip: '1.1.1.1' }))
            ).resolves.toBe(true);
        }
    });

    it('tracks the client from req.ips (trust proxy) and ignores raw X-Forwarded-For otherwise', async () => {
        const guard = await createGuard();
        const tracker = (req: Record<string, any>) => (guard as any).getTracker(req);

        await expect(tracker({ ip: '10.0.0.1', ips: ['203.0.113.7', '10.0.0.1'] })).resolves.toBe('203.0.113.7');
        await expect(tracker({ ip: '10.0.0.1', ips: [], headers: { 'x-forwarded-for': '6.6.6.6' } })).resolves.toBe(
            '10.0.0.1'
        );
    });
});

describe('AppModule throttling', () => {
    it('registers AppThrottlerGuard as a global APP_GUARD', () => {
        // Importing the module only evaluates decorators; nothing connects to MongoDB. Some
        // imported modules build API clients and keys at load time, which need these to be set.
        for (const name of ['OPENAI_API_KEY', 'INVALIDATE_CACHE_SECRET']) {
            process.env[name] ??= 'test-placeholder';
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AppModule } = require('src/app.module');
        const providers: any[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) || [];

        expect(providers).toContainEqual({ provide: APP_GUARD, useClass: AppThrottlerGuard });
    });
});

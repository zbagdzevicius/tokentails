import { MODULE_METADATA } from '@nestjs/common/constants';
import { ScheduleModule } from '@nestjs/schedule';
import { SCHEDULER_TYPE } from '@nestjs/schedule/dist/schedule.constants';
import { PartyRelayService } from '../../pawlegends/party/party-relay.service';
import { BACKEND_ROLE, backendRole, checkProductionEnv, productionEnvProblem, servesRelay } from './backend-role';
import { HealthController } from './health.controller';
import { RelayProbeController } from './relay-probe.controller';
import { RelayStatsReporter, relayStatsLine } from './relay-stats.reporter';
import { rootModuleFor } from './root-module';

// Never read a local env file; Firebase Admin needs a real service account. Only metadata is read.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('src/user/firebase-admin.module', () => ({
    FirebaseAdminModule: { forRoot: () => ({ module: class FirebaseAdminStub {} }) },
}));

for (const name of ['OPENAI_API_KEY', 'INVALIDATE_CACHE_SECRET']) {
    process.env[name] ??= 'test-placeholder';
}

const meta = (module: unknown, key: string): any[] => Reflect.getMetadata(key, module as object) || [];
const providerClasses = (module: unknown): any[] =>
    meta(module, MODULE_METADATA.PROVIDERS)
        .map((p: any) => (typeof p === 'function' ? p : p?.useClass))
        .filter(Boolean);
const roleValue = (module: unknown) =>
    meta(module, MODULE_METADATA.PROVIDERS).find((p: any) => p?.provide === BACKEND_ROLE)?.useValue;
const isScheduleImport = (m: any) => m === ScheduleModule || m?.module === ScheduleModule;
/** A provider with any @Cron, @Interval or @Timeout method. */
const hasSchedule = (cls: any): boolean =>
    Object.getOwnPropertyNames(cls.prototype ?? {}).some(
        name =>
            name !== 'constructor' &&
            typeof Object.getOwnPropertyDescriptor(cls.prototype, name)?.value === 'function' &&
            Reflect.getMetadata(SCHEDULER_TYPE, cls.prototype[name]) !== undefined
    );

describe('backendRole', () => {
    it('defaults to all, so DigitalOcean and local dev are unchanged', () => {
        expect(backendRole({})).toBe('all');
        expect(backendRole({ BACKEND_ROLE: '' })).toBe('all');
    });

    it('accepts api and relay, case and space insensitive', () => {
        expect(backendRole({ BACKEND_ROLE: 'api' })).toBe('api');
        expect(backendRole({ BACKEND_ROLE: ' Relay ' })).toBe('relay');
    });

    it('refuses an unknown role instead of guessing', () => {
        expect(() => backendRole({ BACKEND_ROLE: 'worker' })).toThrow(/BACKEND_ROLE/);
    });

    it('serves the relay in all and relay only', () => {
        expect(servesRelay('all')).toBe(true);
        expect(servesRelay('relay')).toBe(true);
        expect(servesRelay('api')).toBe(false);
    });
});

describe('production env check', () => {
    it('flags IS_PROD without NODE_ENV=production', () => {
        expect(productionEnvProblem({ IS_PROD: 'true' })).toMatch(/NODE_ENV/);
        expect(productionEnvProblem({ IS_PROD: 'true', NODE_ENV: 'development' })).toMatch(/testnet/);
    });

    it('is quiet when NODE_ENV=production or IS_PROD is off', () => {
        expect(productionEnvProblem({ IS_PROD: 'true', NODE_ENV: 'production' })).toBeNull();
        expect(productionEnvProblem({})).toBeNull();
        expect(productionEnvProblem({ IS_PROD: 'false' })).toBeNull();
    });

    it('exits in a split role (Google Cloud) and only logs under all (DigitalOcean)', () => {
        for (const [role, exits] of [
            ['api', true],
            ['relay', true],
            ['all', false],
        ] as const) {
            const log = jest.fn();
            const exit = jest.fn();
            checkProductionEnv(role, { IS_PROD: '1' }, log, exit);
            expect(log).toHaveBeenCalledWith(expect.stringContaining('FATAL CONFIG'));
            expect(exit).toHaveBeenCalledTimes(exits ? 1 : 0);
        }
        const exit = jest.fn();
        checkProductionEnv('api', { IS_PROD: '1', NODE_ENV: 'production' }, jest.fn(), exit);
        expect(exit).not.toHaveBeenCalled();
    });
});

describe('root module per role', () => {
    it('all: everything, the relay included (DigitalOcean today)', async () => {
        const root = await rootModuleFor('all');
        const providers = providerClasses(root);
        expect(providers).toContain(PartyRelayService);
        expect(providers.some(hasSchedule)).toBe(true);
        expect(meta(root, MODULE_METADATA.IMPORTS).some(isScheduleImport)).toBe(true);
        expect(meta(root, MODULE_METADATA.CONTROLLERS)).toContain(HealthController);
        expect(roleValue(root)).toBe('all');
    });

    it('api: the same API and crons, never the party relay', async () => {
        const all = await rootModuleFor('all');
        const api = await rootModuleFor('api');
        expect(api).not.toBe(all);
        expect(providerClasses(api)).not.toContain(PartyRelayService);
        // nothing else differs: same controllers, same providers apart from the relay
        expect(meta(api, MODULE_METADATA.CONTROLLERS)).toEqual(meta(all, MODULE_METADATA.CONTROLLERS));
        expect(providerClasses(api)).toEqual(providerClasses(all).filter(p => p !== PartyRelayService));
        expect(meta(api, MODULE_METADATA.IMPORTS).some(isScheduleImport)).toBe(true);
        expect(roleValue(api)).toBe('api');
    });

    it('relay: the relay and health only; no crons, no hot wallet, no Stripe', async () => {
        const relay = await rootModuleFor('relay');
        const providers = providerClasses(relay);
        expect(providers).toContain(PartyRelayService);
        expect(meta(relay, MODULE_METADATA.IMPORTS).some(isScheduleImport)).toBe(false);
        expect(providers.some(hasSchedule)).toBe(false);
        const names = providers.map(p => p.name);
        for (const banned of [/Stripe/, /Donate/, /Shelter/, /Crypto/, /Paw(Settlement)/, /Firebase/, /Web3/]) {
            expect(names.filter(n => banned.test(n))).toEqual([]);
        }
        expect(meta(relay, MODULE_METADATA.CONTROLLERS)).toContain(HealthController);
        expect(roleValue(relay)).toBe('relay');
    });
});

describe('HealthController', () => {
    const res = () => {
        const r: any = { code: 200 };
        r.status = (c: number) => {
            r.code = c;
            return r;
        };
        return r;
    };
    const relay = (up: boolean) => ({ counters: up ? { rooms_live: 2, sockets: 6, loop_delay_p99: 3 } : null } as any);

    it('healthz is up; only the relay role shows relay counters', () => {
        expect(new HealthController('api', { readyState: 1 } as any).healthz()).toMatchObject({
            ok: true,
            role: 'api',
        });
        expect(new HealthController('api', { readyState: 1 } as any).healthz()).not.toHaveProperty('relay');
        expect(new HealthController('all', { readyState: 1 } as any, relay(true)).healthz()).not.toHaveProperty(
            'relay'
        );
        expect(new HealthController('relay', { readyState: 1 } as any, relay(true)).healthz()).toMatchObject({
            relay: { rooms_live: 2, sockets: 6 },
        });
    });

    it('healthz names the Cloud Run revision when there is one', () => {
        const prev = process.env.K_REVISION;
        process.env.K_REVISION = 'tt-api-00042-abc';
        try {
            expect(new HealthController('api', { readyState: 1 } as any).healthz()).toMatchObject({
                revision: 'tt-api-00042-abc',
            });
        } finally {
            if (prev === undefined) delete process.env.K_REVISION;
            else process.env.K_REVISION = prev;
        }
        expect(new HealthController('api', { readyState: 1 } as any).healthz()).not.toHaveProperty('revision');
    });

    it('readyz needs Mongo, a started relay where one is served, and no shutdown in progress', () => {
        const check = (c: HealthController) => {
            const r = res();
            const body = c.readyz(r);
            return { code: r.code, body };
        };
        expect(check(new HealthController('api', { readyState: 1 } as any)).code).toBe(200);
        expect(check(new HealthController('api', { readyState: 0 } as any)).code).toBe(503);
        expect(check(new HealthController('relay', { readyState: 1 } as any, relay(true))).code).toBe(200);
        expect(check(new HealthController('relay', { readyState: 1 } as any, relay(false))).code).toBe(503);
        expect(check(new HealthController('all', { readyState: 1 } as any)).code).toBe(503);
        const stopping = new HealthController('relay', { readyState: 1 } as any, relay(true));
        stopping.beforeApplicationShutdown();
        expect(check(stopping)).toMatchObject({ code: 503, body: { stopping: true } });
    });
});

describe('relay stats line', () => {
    it('is one JSON line with severity, the event name and the counters (no ids)', () => {
        const line = relayStatsLine({ rooms_live: 3, loop_delay_p99: 4.5 }, new Date('2026-11-07T00:00:00Z'));
        expect(JSON.parse(line)).toEqual({
            severity: 'INFO',
            event: 'relay_stats',
            at: '2026-11-07T00:00:00.000Z',
            rooms_live: 3,
            loop_delay_p99: 4.5,
        });
        expect(JSON.parse(relayStatsLine(null))).toMatchObject({ event: 'relay_stats', up: false });
        const reporter = new RelayStatsReporter({ counters: { rooms_live: 1 } } as any);
        const lines: string[] = [];
        reporter.write = (l: string) => lines.push(l);
        reporter.report();
        expect(JSON.parse(lines[0])).toMatchObject({ event: 'relay_stats', rooms_live: 1 });
    });

    it('the relay role registers the reporter and the routing probe', async () => {
        const relay = await rootModuleFor('relay');
        expect(providerClasses(relay)).toContain(RelayStatsReporter);
        expect(meta(relay, MODULE_METADATA.CONTROLLERS)).toContain(RelayProbeController);
        expect(providerClasses(await rootModuleFor('api'))).not.toContain(RelayStatsReporter);
    });
});

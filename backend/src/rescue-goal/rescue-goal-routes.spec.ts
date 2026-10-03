import { HttpException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_GUEST_KEY } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { GUEST_ALLOW_LIST } from 'src/common/guards/guest-allow-list';
import { USER_THROTTLE_KEY, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PLEDGE_USER_THROTTLE, RescueGoalController } from './rescue-goal.controller';

/*
 * Rescue Goals route table (plan G5 acceptance "Route spec: /shelter/:id still reaches
 * ShelterController"). Routes are matched in Nest's registration order: controllers as listed in
 * AppModule, methods in source order, `:param` matching one path segment (Express semantics).
 */

jest.mock('dotenv', () => ({ config: jest.fn() }));

interface Route {
    method: string;
    path: string;
    controller: string;
    handler: string;
    guards: unknown[];
}

let routes: Route[] = [];
let providers: string[] = [];
let controllers: string[] = [];

beforeAll(() => {
    for (const name of ['OPENAI_API_KEY', 'INVALIDATE_CACHE_SECRET']) {
        process.env[name] ??= 'test-placeholder';
    }
    jest.isolateModules(() => {
        jest.doMock('src/user/firebase-admin.module', () => ({
            FirebaseAdminModule: { forRoot: () => ({ module: class FirebaseAdminStub {} }) },
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AppModule } = require('src/app.module');
        providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule).map((p: any) => p?.name);
        const registered: any[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule);
        controllers = registered.map(c => c.name);
        routes = registered.flatMap(controller => {
            const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) || '');
            const proto = controller.prototype;
            return Object.getOwnPropertyNames(proto)
                .filter(key => key !== 'constructor' && typeof proto[key] === 'function')
                .filter(key => Reflect.getMetadata(PATH_METADATA, proto[key]) !== undefined)
                .map(key => {
                    const sub = String(Reflect.getMetadata(PATH_METADATA, proto[key]) || '');
                    const path = ('/' + [prefix, sub].filter(Boolean).join('/'))
                        .replace(/\/+/g, '/')
                        .replace(/(.)\/$/, '$1');
                    return {
                        method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, proto[key])],
                        path,
                        controller: controller.name,
                        handler: key,
                        guards: Reflect.getMetadata(GUARDS_METADATA, proto[key]) || [],
                    };
                });
        });
    });
}, 60000);

function segmentsMatch(pattern: string, path: string) {
    const a = pattern.split('/');
    const b = path.split('/');
    return a.length === b.length && a.every((part, i) => (part.startsWith(':') ? b[i] !== '' : part === b[i]));
}

/** The first route Express would hand the request to. */
function resolve(method: string, path: string) {
    const hit = routes.find(
        route => (route.method === method || route.method === 'ALL') && segmentsMatch(route.path, path)
    );
    return hit ? `${hit.controller}.${hit.handler}` : null;
}

const route = (method: string, path: string) => routes.find(r => r.method === method && r.path === path)!;
const ID = '652f1a2b3c4d5e6f7a8b9c0d';

describe('Rescue Goals routes (AppModule)', () => {
    it('registers the controller and its providers in the one AppModule', () => {
        expect(controllers).toContain('RescueGoalController');
        expect(providers).toEqual(
            expect.arrayContaining([
                'RescueGoalStore',
                'RescueGoalPledgeService',
                'RescueGoalService',
                'UserThrottlerGuard',
            ])
        );
    });

    it('/shelter/:id still reaches ShelterController', () => {
        expect(resolve('GET', `/shelter/${ID}`)).toBe('ShelterController.findOne');
        expect(resolve('PUT', `/shelter/${ID}`)).toMatch(/^ShelterController\./);
        expect(routes.filter(r => r.path.startsWith('/shelter') && r.controller === 'RescueGoalController')).toEqual(
            []
        );
    });

    it('resolves every Rescue Goals path to its own handler', () => {
        expect(resolve('GET', '/rescue-goals')).toBe('RescueGoalController.list');
        expect(resolve('GET', `/rescue-goals/${ID}`)).toBe('RescueGoalController.get');
        expect(resolve('GET', '/rescue-goals/pledges/me')).toBe('RescueGoalController.myGives');
        expect(resolve('GET', '/rescue-goals/admin/goals')).toBe('RescueGoalController.managerList');
        expect(resolve('GET', `/rescue-goals/admin/goals/${ID}`)).toBe('RescueGoalController.managerGet');
        expect(resolve('GET', `/rescue-goals/admin/goals/${ID}/receipt`)).toBe('RescueGoalController.receipt');
        expect(resolve('POST', `/rescue-goals/${ID}/pledge`)).toBe('RescueGoalController.pledge');
        expect(resolve('POST', '/rescue-goals')).toBe('RescueGoalController.create');
        expect(resolve('PUT', `/rescue-goals/${ID}`)).toBe('RescueGoalController.update');
        expect(resolve('POST', `/rescue-goals/${ID}/deliver`)).toBe('RescueGoalController.deliver');
        expect(resolve('POST', `/rescue-goals/${ID}/cancel`)).toBe('RescueGoalController.cancel');
    });

    it('the give route is registered-only, per-user throttled, and not on the guest allow-list', () => {
        const pledge = route('POST', '/rescue-goals/:id/pledge');
        // AppModule is loaded in an isolated registry, so guard classes are compared by name.
        expect(pledge.guards.map((g: any) => g.name)).toEqual([AppAuthGuard.name, UserThrottlerGuard.name]);
        expect(Reflect.getMetadata(USER_THROTTLE_KEY, RescueGoalController.prototype.pledge)).toEqual(
            PLEDGE_USER_THROTTLE
        );
        expect(Reflect.getMetadata(ALLOW_GUEST_KEY, RescueGoalController.prototype.pledge)).toBeUndefined();
        expect(Reflect.getMetadata(ALLOW_GUEST_KEY, RescueGoalController.prototype.myGives)).toBeUndefined();
        expect(Object.keys(GUEST_ALLOW_LIST).filter(key => key.includes('rescue-goals'))).toEqual([]);
    });

    it('public reads need no token; every write and manager read needs AppAuthGuard first', () => {
        expect(route('GET', '/rescue-goals').guards).toEqual([]);
        expect(route('GET', '/rescue-goals/:id').guards).toEqual([]);
        const guarded = routes.filter(r => r.controller === 'RescueGoalController' && r.guards.length);
        expect(guarded).toHaveLength(9);
        expect(guarded.every(r => (r.guards[0] as any).name === AppAuthGuard.name)).toBe(true);
    });

    it('manager routes refuse anyone below MANAGER (4)', () => {
        const managerRoutes = [
            route('GET', '/rescue-goals/admin/goals'),
            route('GET', '/rescue-goals/admin/goals/:id'),
            route('GET', '/rescue-goals/admin/goals/:id/receipt'),
            route('POST', '/rescue-goals'),
            route('PUT', '/rescue-goals/:id'),
            route('POST', '/rescue-goals/:id/deliver'),
            route('POST', '/rescue-goals/:id/cancel'),
        ];
        const ctx = (permission: number) =>
            ({ switchToHttp: () => ({ getRequest: () => ({ user: { permission } }) }) } as any);
        for (const r of managerRoutes) {
            const Permission = r.guards[1] as any;
            expect(new Permission().canActivate(ctx(3))).toBe(false);
            expect(new Permission().canActivate(ctx(4))).toBe(true);
        }
    });

    it('a guest token gets 403 GUEST_FORBIDDEN at the give route, before any handler runs', async () => {
        const request: Record<string, unknown> = {};
        jest.spyOn(AuthGuard('appauth').prototype, 'canActivate').mockImplementation(async function () {
            request.user = { _id: 'g1', isGuest: true };
            return true;
        });
        const ctx = {
            getHandler: () => RescueGoalController.prototype.pledge,
            getClass: () => RescueGoalController,
            switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        } as any;
        let caught: unknown = null;
        try {
            await new AppAuthGuard(new Reflector()).canActivate(ctx);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(HttpException);
        expect((caught as HttpException).getStatus()).toBe(403);
        expect(((caught as HttpException).getResponse() as any).code).toBe('GUEST_FORBIDDEN');
        jest.restoreAllMocks();
    });
});

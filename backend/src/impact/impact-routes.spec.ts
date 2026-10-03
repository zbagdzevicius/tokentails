import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';

/*
 * Route table spec (task 4f): the new impact and shelter-member routes are registered in the one
 * AppModule, and `/shelter/:id` still reaches ShelterController (no new route shadows it). Routes are
 * matched in Nest's registration order: controllers as listed in AppModule, methods in source order,
 * `:param` matching one path segment (Express semantics).
 */

interface Route {
    method: string;
    path: string;
    controller: string;
    handler: string;
    guards: unknown[];
}

let routes: Route[] = [];
let providers: string[] = [];

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
        const controllers: any[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule);
        routes = controllers.flatMap(controller => {
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

const ID = '652f1a2b3c4d5e6f7a8b9c0d';

describe('route table (AppModule)', () => {
    it('registers the new impact services and controllers', () => {
        expect(providers).toEqual(
            expect.arrayContaining([
                'PawSettlementService',
                'ImpactPayoutService',
                'ShelterOutcomeService',
                'PledgeService',
                'ShelterMembersService',
            ])
        );
        expect(routes.map(r => r.controller)).toEqual(expect.arrayContaining(['ImpactAdminController']));
    });

    it('/shelter/:id still reaches ShelterController', () => {
        expect(resolve('GET', `/shelter/${ID}`)).toBe('ShelterController.findOne');
        expect(resolve('PUT', `/shelter/${ID}`)).toBe('ShelterController.update');
        expect(resolve('GET', '/shelter')).toBe('ShelterController.find');
    });

    it('routes the members and the on-chain shelter paths to their handlers', () => {
        expect(resolve('PUT', `/shelter/${ID}/members`)).toBe('ShelterController.changeMembers');
        expect(resolve('GET', `/shelter/${ID}/members`)).toBe('ShelterController.listMembers');
        expect(resolve('GET', '/shelter/donate/status')).toBe('ShelterOnchainController.donateStatus');
    });

    it('routes the impact paths, public and private, without shadowing each other', () => {
        expect(resolve('GET', '/impact')).toBe('ImpactController.latest');
        expect(resolve('GET', '/impact/me')).toBe('ImpactController.me');
        expect(resolve('GET', '/impact/outcomes')).toBe('ImpactController.outcomes');
        expect(resolve('GET', '/impact/outcomes/manage')).toBe('ImpactAdminController.listOutcomes');
        expect(resolve('POST', '/impact/payouts')).toBe('ImpactAdminController.createPayout');
        expect(resolve('POST', '/impact/payouts/p-0123456789ab/confirm')).toBe('ImpactAdminController.confirmPayout');
        expect(resolve('POST', '/impact/payouts/p-0123456789ab/signature')).toBe('ImpactAdminController.signPayout');
        expect(resolve('POST', '/impact/paws/2026-10-01/settle')).toBe('ImpactAdminController.settle');
    });

    it('guards every private impact and member route with AppAuthGuard first', () => {
        const privateRoutes = routes.filter(
            r =>
                r.controller === 'ImpactAdminController' ||
                (r.controller === 'ShelterController' && r.path.endsWith('/members'))
        );
        expect(privateRoutes.length).toBeGreaterThan(15);
        // Compared by name: AppModule was loaded in an isolated module registry.
        privateRoutes.forEach(r =>
            expect({ route: `${r.method} ${r.path}`, first: (r.guards[0] as any)?.name }).toEqual({
                route: `${r.method} ${r.path}`,
                first: AppAuthGuard.name,
            })
        );
        // Members are ADMIN-granted: the second guard is the permission mixin.
        routes.filter(r => r.path.endsWith('/members')).forEach(r => expect(r.guards).toHaveLength(2));
    });
});

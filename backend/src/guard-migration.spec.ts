import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '@nestjs/passport';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { ALLOW_GUEST_KEY } from './common/decorators/allow-guest.decorator';
import { AppAuthGuard } from './common/guards/app-auth.guard';
import { GUEST_ALLOW_LIST } from './common/guards/guest-allow-list';
import { LiveGameUserThrottleGuard } from './user/live-game-throttle.guard';

/*
 * F5.4: one auth guard. `AppAuthGuard` replaced all 71 raw `AuthGuard('appauth')` uses across the 12
 * controllers; guests are denied by default and allowed only on the reviewed allow-list.
 */

// Never read a local env file; Firebase Admin needs a real service account. Only metadata is read.
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('src/user/firebase-admin.module', () => ({
    FirebaseAdminModule: { forRoot: () => ({ module: class FirebaseAdminStub {} }) },
}));

function loadControllers(): any[] {
    for (const name of ['OPENAI_API_KEY', 'INVALIDATE_CACHE_SECRET']) {
        process.env[name] ??= 'test-placeholder';
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('src/app.module');
    return Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) || [];
}

interface IRoute {
    key: string;
    controller: string;
    handler: string;
    guards: any[];
    allowGuest?: { transient: boolean };
}

function routesOf(controllers: any[]): IRoute[] {
    const routes: IRoute[] = [];
    for (const controller of controllers) {
        const base = `${Reflect.getMetadata(PATH_METADATA, controller) ?? ''}`;
        const classGuards = Reflect.getMetadata(GUARDS_METADATA, controller) || [];
        const proto = controller.prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
            const fn = proto[name];
            if (name === 'constructor' || typeof fn !== 'function') continue;
            const method = Reflect.getMetadata(METHOD_METADATA, fn);
            if (method === undefined) continue;
            const path = `/${base}/${Reflect.getMetadata(PATH_METADATA, fn) ?? ''}`
                .replace(/\/+/g, '/')
                .replace(/(.)\/$/, '$1');
            routes.push({
                key: `${RequestMethod[method]} ${path}`,
                controller: controller.name,
                handler: name,
                guards: [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, fn) || [])],
                allowGuest:
                    Reflect.getMetadata(ALLOW_GUEST_KEY, fn) ?? Reflect.getMetadata(ALLOW_GUEST_KEY, controller),
            });
        }
    }
    return routes;
}

describe('F5.4 guard migration (reflection)', () => {
    const controllers = loadControllers();
    const routes = routesOf(controllers);

    it('registers the new staking service in the one AppModule', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AppModule } = require('src/app.module');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CatStakingService } = require('src/cat/cat-staking.service');
        expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule)).toContain(CatStakingService);
    });

    it('finds the routes of every registered controller', () => {
        expect(controllers.length).toBeGreaterThanOrEqual(14);
        expect(routes.filter(route => route.guards.includes(AppAuthGuard)).length).toBeGreaterThanOrEqual(71);
    });

    it('no handler uses the raw appauth guard', () => {
        // `AuthGuard()` with no argument uses `defaultStrategy: 'appauth'` (app.module.ts) and is a
        // different memoised class, so it is checked as well.
        const rawGuards = [AuthGuard('appauth'), AuthGuard(), AuthGuard(undefined)];
        const raw = routes.filter(route => route.guards.some(guard => rawGuards.includes(guard)));
        expect(raw.map(route => `${route.controller}.${route.handler}`)).toEqual([]);
    });

    it('every guarded handler runs AppAuthGuard first, so later guards can read req.user', () => {
        const misordered = routes.filter(route => route.guards.length && route.guards[0] !== AppAuthGuard);
        expect(misordered.map(route => `${route.controller}.${route.handler}`)).toEqual([]);
    });

    it('the @AllowGuest set equals GUEST_ALLOW_LIST, options included', () => {
        const decorated = Object.fromEntries(
            routes.filter(route => route.allowGuest).map(route => [route.key, route.allowGuest])
        );
        const expected = Object.fromEntries(
            Object.entries(GUEST_ALLOW_LIST).map(([key, options]) => [key, { transient: !!options.transient }])
        );
        expect(decorated).toEqual(expected);
    });

    it('every allow-listed route exists and sits behind AppAuthGuard', () => {
        for (const key of Object.keys(GUEST_ALLOW_LIST)) {
            const route = routes.find(r => r.key === key);
            expect({ key, found: !!route, guarded: route?.guards.includes(AppAuthGuard) }).toEqual({
                key,
                found: true,
                guarded: true,
            });
        }
    });

    it('keeps decision #9 closed routes closed to guests', () => {
        const closed = [
            'GET /user/catbassadors/lives/redeem', // spin
            'GET /quest/complete/:quest',
            'GET /cat/adopt/:_id',
            'POST /web3/confirm', // buy
            'POST /web3/confirm-payment',
            'GET /cat/gift/:catId/:userId',
            'POST /ticket',
            'GET /cat/stake/:_id',
            'GET /cat/stake-reward/:_id',
            'GET /cat/redeem/:catCode',
            'GET /user/catbassadors/referralw/:referralId',
            'POST /shelter/donate',
        ];
        for (const key of closed) {
            const route = routes.find(r => r.key === key);
            expect({ key, found: !!route, allowGuest: route?.allowGuest }).toEqual({
                key,
                found: true,
                allowGuest: undefined,
            });
        }
    });
});

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sourceFiles(path) : [path];
    });
}

describe('F5.4 guard migration (source grep)', () => {
    const root = __dirname;
    const scanned = sourceFiles(root)
        .filter(path => /\.(guard|strategy|controller)\.ts$/.test(path))
        .filter(path => !/\.spec\.ts$/.test(path));
    const read = (path: string) => readFileSync(path, 'utf8');
    // Comments may name the old guard; code may not.
    const code = (path: string) =>
        read(path)
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');

    it('scans the guards, strategies and controllers', () => {
        expect(scanned.length).toBeGreaterThanOrEqual(15);
    });

    // `AuthGuard('appauth')`, and `AuthGuard()`, which resolves to the `appauth` default strategy.
    const RAW_APPAUTH = /\bAuthGuard\(\s*(?:['"`]appauth['"`])?\s*\)/;

    it('the raw-guard pattern matches both spellings and not AppAuthGuard', () => {
        ["AuthGuard('appauth')", 'AuthGuard( "appauth" )', 'AuthGuard()', 'AuthGuard( )'].forEach(sample =>
            expect(RAW_APPAUTH.test(sample)).toBe(true)
        );
        ['AppAuthGuard', 'UseGuards(AppAuthGuard)', "AuthGuard('jwt')"].forEach(sample =>
            expect(RAW_APPAUTH.test(sample)).toBe(false)
        );
    });

    it("finds no AuthGuard('appauth') or AuthGuard() outside app-auth.guard.ts", () => {
        const offenders = scanned
            .filter(path => !path.endsWith(join('common', 'guards', 'app-auth.guard.ts')))
            .filter(path => RAW_APPAUTH.test(code(path)))
            .map(path => relative(root, path));
        expect(offenders).toEqual([]);
    });

    it('lists every guard that reads req.user after AppAuthGuard in its @UseGuards', () => {
        // Guards whose source reads the request user, by exported name.
        const readers = scanned
            .filter(path => path.endsWith('.guard.ts') && !path.endsWith('app-auth.guard.ts'))
            .filter(path => /\.user\b|\buser\s*=\s*request\.user|getRequest\(\)\.user/.test(code(path)))
            .flatMap(path => [...code(path).matchAll(/export\s+(?:const|class)\s+(\w+)/g)].map(match => match[1]));
        expect(readers).toEqual(expect.arrayContaining(['PermissionGuard', 'LiveGameUserThrottleGuard']));

        const problems: string[] = [];
        for (const path of scanned.filter(p => p.endsWith('.controller.ts'))) {
            for (const match of code(path).matchAll(/@UseGuards\(([\s\S]*?)\)\s*\n/g)) {
                const args = match[1];
                const firstReader = Math.min(
                    ...readers.map(name => args.search(new RegExp(`\\b${name}\\b`))).filter(index => index >= 0)
                );
                if (!Number.isFinite(firstReader)) continue;
                const auth = args.search(/\bAppAuthGuard\b/);
                if (auth < 0 || auth > firstReader) problems.push(`${relative(root, path)}: @UseGuards(${args})`);
            }
        }
        expect(problems).toEqual([]);
    });
});

describe('LiveGameUserThrottleGuard after AppAuthGuard', () => {
    const context = (user: unknown) =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ user }), getResponse: () => ({ header: jest.fn() }) }),
        } as any);
    const storage = { increment: jest.fn(async () => ({ totalHits: 1, timeToExpire: 60 })) };

    it.each([[undefined], [{}], [{ isGuest: true, transient: true }]])(
        'fails closed without req.user._id (%j)',
        async user => {
            await expect(
                new LiveGameUserThrottleGuard(storage as any).canActivate(context(user))
            ).rejects.toBeInstanceOf(UnauthorizedException);
            expect(storage.increment).not.toHaveBeenCalled();
        }
    );

    it('counts a real user id', async () => {
        await expect(new LiveGameUserThrottleGuard(storage as any).canActivate(context({ _id: 'u1' }))).resolves.toBe(
            true
        );
        expect(storage.increment).toHaveBeenCalledWith('live-game-user:u1', expect.any(Number));
    });
});

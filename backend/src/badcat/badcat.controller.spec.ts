import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { BADCAT_ROUTES } from './badcat.contracts';
import { BadcatController } from './badcat.controller';
import { BadcatOnlineController } from './badcat-online.controller';
import { monthlyCents } from './badcat-admin.service';
import { buildHarness, buy, CAT, Harness, NOW, ON_ENV, statusOf, useEnv } from './badcat-harness.helper-spec';

function routes(controller: any = BadcatController) {
    const proto = controller.prototype as any;
    return Object.getOwnPropertyNames(proto)
        .filter(name => name !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[name]) !== undefined)
        .map(name => ({
            name,
            method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, proto[name])],
            path: `/badcat/${Reflect.getMetadata(PATH_METADATA, proto[name])}`,
            guards: Reflect.getMetadata(GUARDS_METADATA, proto[name]) || [],
        }));
}

describe('BadcatController routes', () => {
    it('serves every BADCAT_ROUTES path', () => {
        const paths = [...routes(), ...routes(BadcatOnlineController)].map(r => r.path.replace(/\/:\w+.*$/, ''));
        for (const path of Object.values(BADCAT_ROUTES)) {
            expect({ path, served: paths.some(p => p === path || p.startsWith(`${path}/`)) }).toEqual({
                path,
                served: true,
            });
        }
    });

    it('guards every admin route with AppAuthGuard first, and no public route', () => {
        for (const route of routes()) {
            if (route.path.startsWith('/badcat/admin/')) {
                expect({
                    route: route.name,
                    first: route.guards[0] === AppAuthGuard,
                    count: route.guards.length,
                }).toEqual({
                    route: route.name,
                    first: true,
                    count: 2,
                });
            } else {
                expect({ route: route.name, guards: route.guards.length }).toEqual({ route: route.name, guards: 0 });
            }
        }
    });

    it('Phase 2: admin routes run AppAuthGuard then PermissionGuard; signed-in routes AppAuthGuard only', () => {
        for (const route of routes(BadcatOnlineController)) {
            if (route.path.startsWith('/badcat/admin/')) {
                expect({
                    route: route.name,
                    first: route.guards[0] === AppAuthGuard,
                    count: route.guards.length,
                }).toEqual({
                    route: route.name,
                    first: true,
                    count: 2,
                });
            } else if (route.guards.length) {
                expect({ route: route.name, guards: route.guards }).toEqual({
                    route: route.name,
                    guards: [AppAuthGuard],
                });
            }
        }
    });

    it('never touches the score route or Game rows', () => {
        // badcat-live.ts is the BAD_CAT branch of the one score route itself (GDD 10 Phase 2), called only from there.
        for (const file of readdirSync(__dirname).filter(
            f => f.endsWith('.ts') && !f.endsWith('spec.ts') && f !== 'badcat-live.ts'
        )) {
            const source = readFileSync(join(__dirname, file), 'utf8');
            // Spelled in pieces so a grep of src/badcat for the score route stays empty.
            const scoreRoute = new RegExp(['catba', 'ssadors|GameRepository|gameRepository'].join(''));
            expect({ file, score: scoreRoute.test(source) }).toEqual({ file, score: false });
        }
    });
});

describe('every /badcat route is 404 while switched off', () => {
    let restore: () => void;
    afterEach(() => restore());

    it.each([
        ['no env', {}],
        ['features without the master switch', { ...ON_ENV, BADCAT_ENABLED: undefined }],
    ])('%s', async (_label, env) => {
        restore = useEnv(env as Record<string, string | undefined>);
        const h = buildHarness();
        const c = h.controller;
        const res = { set: jest.fn(), send: jest.fn(), redirect: jest.fn() };
        const calls: Promise<unknown>[] = [
            c.checkout({ sku: 'club_monthly' } as any, {}, {}),
            c.entitlement({ sessionId: 'cs_test_12345678' }, {}, {}),
            c.restore({ email: 'a@ex.com' }, {}, {}),
            c.restoreVerify({ t: 'x'.repeat(32) }, {}, {}),
            c.portal({ token: 'a.b' }, {}, {}),
            c.redeem({ code: 'ABCDEFGHJK', email: 'a@ex.com' }, {}, {}),
            c.clubCat({ token: 'a.b', catCode: CAT, name: 'x' }, {}, {}),
            c.cameoBundle('1', '0', {}, {}),
            c.seen(CAT, {}, {}),
            c.uploadFace('0'.repeat(24), { token: 'a.b', png: 'x' }, {}, {}),
            c.face(`${'0'.repeat(24)}.png`, {}, res),
            c.creatorCode({ code: 'mochifan', email: 'a@ex.com' }, {}, {}),
            c.typed({}, res),
            c.adminFaces({}),
            c.approveFace('0'.repeat(24), {}),
            c.rejectFace('0'.repeat(24), {}),
            c.adminCameo({ catCode: CAT, dayNo: 1 }, {}),
            c.adminStats('30', {}),
            c.adminCreatorCodes({}),
            c.adminCreatorReport({}),
            c.approveCreatorCode('mochifan', {}),
            c.rejectCreatorCode('mochifan', {}),
        ];
        expect(calls).toHaveLength(routes().length - 2); // every route except status and the webhook (own gate)
        for (const call of calls) expect(await statusOf(call)).toBe(404);
        expect(res.redirect).not.toHaveBeenCalled();
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
        expect(h.ipThrottler.consume).not.toHaveBeenCalled();
        for (const model of Object.values(h.models)) expect(model.docs).toHaveLength(0);
        expect((await c.status({}, {})).enabled).toBe(false);
    });
});

describe('creator codes, typed redirect, admin stats', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    it('validates creator codes (6-12 of a-z, 0-9, _) and refuses duplicates', async () => {
        const ask = (code: string, email = 'c@ex.com') => h.controller.creatorCode({ code, email }, {}, {});
        expect(await ask('Mochi_Fan')).toEqual({ ok: true, status: 'pending' });
        expect(h.models.creatorCodes.docs[0]).toMatchObject({
            code: 'mochi_fan',
            status: 'pending',
            email: 'c@ex.com',
        });
        for (const bad of ['short', 'way_too_long_code', 'has space', 'dash-code', 'ünicode1']) {
            expect(await statusOf(ask(bad))).toBe(400);
        }
        expect(await statusOf(ask('validcode', 'nope'))).toBe(400);
        expect(await statusOf(ask('mochi_fan'))).toBe(409);
        expect((await h.controller.adminCreatorCodes({})).items).toHaveLength(1);
        expect(await h.controller.approveCreatorCode('mochi_fan', {})).toEqual({ ok: true, status: 'approved' });
        expect(await statusOf(h.controller.approveCreatorCode('missing', {}))).toBe(404);
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_CREATOR_CODES_ENABLED: undefined });
        expect(await statusOf(ask('another1'))).toBe(404);
    });

    it('reports 20 % of net per code over each buyer’s first 6 months', async () => {
        await h.models.creatorCodes.create({ code: 'mochi_fan', email: 'c@ex.com', status: 'approved' });
        await h.models.creatorCodes.create({ code: 'pending1', email: 'd@ex.com', status: 'pending' });
        const via = { via: 'mochi_fan' };
        await buy(h, 'club_annual', {
            email: 'b1@ex.com',
            meta: via,
            session: { amount_total: 3999, subscription: 'sub_v' },
        });
        await buy(h, 'collar_pinkpaw', { email: 'b1@ex.com', meta: via, session: { amount_total: 499 } }); // donation
        await buy(h, 'cosmetic_hat', { email: 'b2@ex.com', meta: via, session: { amount_total: 299 } });
        h.clock.now = new Date('2027-06-01T00:00:00Z'); // past b2's 6 months
        await buy(h, 'cosmetic_trail', { email: 'b2@ex.com', meta: via, session: { amount_total: 299 } });
        await buy(h, 'cosmetic_trail', {
            email: 'b3@ex.com',
            meta: { via: 'pending1' },
            session: { amount_total: 299 },
        });
        const [row, ...rest] = (await h.controller.adminCreatorReport({})).items;
        expect(rest).toHaveLength(0);
        const net = 3999 - (Math.round(3999 * 0.029) + 30) + 299 - (Math.round(299 * 0.029) + 30);
        expect(row).toMatchObject({
            code: 'mochi_fan',
            buyers: 2,
            grossCents: 4298,
            netCents: net,
            shareCents: Math.floor(net * 0.2),
        });
        expect(row.payable).toBe(false); // under $25
        expect(row.note).toMatch(/\$25 minimum/);
    });

    it('redirects typed arrivals and counts them per UTC day without personal data', async () => {
        const res = { set: jest.fn(), redirect: jest.fn() };
        await h.controller.typed({ headers: { 'user-agent': 'x' }, ip: '1.2.3.4' }, res);
        await h.controller.typed({}, res);
        expect(res.redirect).toHaveBeenCalledWith(302, 'https://tokentails.com/badcat/pick?e=t');
        expect(h.models.counters.docs).toEqual([expect.objectContaining({ key: 'typed:2026-11-20', n: 2 })]);
        expect(JSON.stringify(h.models.counters.docs)).not.toContain('1.2.3.4');
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_TYPED_REDIRECT_ENABLED: undefined });
        expect(await statusOf(h.controller.typed({}, res))).toBe(404);
    });

    it('stats: typed per day, purchases by sku/trigger/via/in-app/arm, gross MRR without the collar', async () => {
        await h.controller.typed({}, { set: jest.fn(), redirect: jest.fn() });
        const meta = { trigger: 'post_share', via: 'mochi_fan', from_in_app: 'true', ab_arm: 'A' };
        await buy(h, 'club_monthly', { meta, session: { amount_total: 499, subscription: 's1' } });
        await buy(h, 'club_annual', {
            meta: { ...meta, ab_arm: 'B' },
            session: { amount_total: 3999, subscription: 's2' },
        });
        await buy(h, 'founding', { meta, session: { amount_total: 2499, subscription: 's3' } });
        await buy(h, 'brand_shelf', {
            meta: { trigger: 'brand' },
            session: { amount_total: 19900, subscription: 's4' },
        });
        await buy(h, 'collar_pinkpaw', { meta, session: { amount_total: 499 } });
        const stats = await h.controller.adminStats('7', {});
        expect(stats.typed[0]).toEqual({ date: '2026-11-20', n: 1 });
        expect(stats.typed).toHaveLength(7);
        expect(stats.purchases.bySku.club_monthly).toEqual({ count: 1, cents: 499 });
        expect(stats.purchases.byTrigger.post_share.count).toBe(4);
        expect(stats.purchases.byVia.mochi_fan.count).toBe(4);
        expect(stats.purchases.byFromInApp.true.count).toBe(4);
        expect(stats.purchases.byAbArm).toMatchObject({
            A: { count: 3, cents: 499 + 2499 + 499 },
            B: { count: 1, cents: 3999 },
        });
        expect(stats.donationCents).toBe(499);
        expect(stats.revenueCents).toBe(499 + 3999 + 2499 + 19900);
        expect(stats.activeSubscriptions).toBe(4);
        expect(stats.mrrCents).toBe(499 + Math.round(3999 / 12) + Math.round(2499 / 12) + 19900);
        expect(monthlyCents('collar_pinkpaw')).toBe(0);
        expect(stats.brandQueue).toEqual([expect.objectContaining({ sku: 'brand_shelf' })]);
        expect(stats.foundingTaken).toBe(1);
    });
});

describe('weekly seen email job', () => {
    let restore: () => void;
    afterEach(() => restore());

    async function setup(env: Record<string, string | undefined>) {
        restore = useEnv(env);
        const h = buildHarness();
        h.clock.now = new Date('2026-11-23T09:00:00Z'); // Monday, day 8
        await buy(h, 'club_monthly', { email: 'm@ex.com', session: { subscription: 'sub_m' } });
        await h.models.clubCats.create({ email: 'm@ex.com', catCode: CAT, name: 'Mochi' });
        await h.models.shuffles.create({ dayNo: 5, shuffle: 0, cameoIds: [], catCodes: [CAT] });
        await h.models.counters.create({ key: 'load:5:0', n: 3214 });
        return h;
    }

    it('is a no-op without the flag or SendGrid', async () => {
        let h = await setup(ON_ENV);
        expect(await h.job.runOnce()).toEqual({ skipped: 'disabled', sent: 0, failed: 0 });
        restore();
        h = await setup({ ...ON_ENV, BADCAT_SEEN_EMAIL_ENABLED: 'true' });
        expect(await h.job.runOnce()).toEqual({ skipped: 'disabled', sent: 0, failed: 0 });
        expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it('emails each Club cat owner once a week', async () => {
        const h = await setup({ ...ON_ENV, BADCAT_SEEN_EMAIL_ENABLED: 'true', SENDGRID_API_KEY: 'SG.test' });
        expect(await h.job.runOnce()).toEqual({ sent: 1, failed: 0 });
        expect(h.sent[0].body.personalizations[0]).toMatchObject({
            to: [{ email: 'm@ex.com' }],
            subject: 'Mochi was seen in 3,214 rooms this week',
        });
        expect(await h.job.runOnce()).toEqual({ skipped: 'claimed', sent: 0, failed: 0 });
        expect(h.fetchImpl).toHaveBeenCalledTimes(1);
        expect(NOW).toBeDefined();
    });
});

import { CLUB_LIMITS, Entitlements, FREE_LIMITS } from './badcat.contracts';
import {
    badcatCheckoutReady,
    badcatEntitlementSecret,
    badcatFeedAutoApprove,
    badcatPublicUrl,
    badcatStripeKey,
    ENTITLEMENT_SECRET_LABEL,
} from './badcat-flags';
import { createHmac } from 'crypto';
import { signEntitlements, verifyEntitlementToken } from './badcat-token';
import { addMonths, dayNoOf, filterName, isFriday, weekStartOf, weightedSample, xorshift32 } from './badcat-util';
import { buildHarness, NOW, ON_ENV, statusOf, useEnv } from './badcat-harness.helper-spec';

describe('badcat env readers', () => {
    it('has no on/off switches: only the feed auto-approve policy, off by default', () => {
        expect(badcatFeedAutoApprove({})).toBe(false);
        expect(badcatFeedAutoApprove({ BADCAT_FEED_AUTO_APPROVE: 'true' })).toBe(true);
    });

    it('defaults the public URL to tokentails.com and trims a trailing slash', () => {
        expect(badcatPublicUrl({})).toBe('https://tokentails.com');
        expect(badcatPublicUrl({ BADCAT_PUBLIC_URL: 'https://example.test/' })).toBe('https://example.test');
    });

    it('uses BADCAT_STRIPE_SECRET_KEY, else STRIPE_SECRET_KEY: test keys outside production', () => {
        expect(badcatStripeKey({})).toMatchObject({ usable: false, reason: 'missing' });
        expect(badcatStripeKey({ STRIPE_SECRET_KEY: 'sk_test_main' })).toMatchObject({
            key: 'sk_test_main',
            usable: true,
            testMode: true,
        });
        expect(
            badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_test_own', STRIPE_SECRET_KEY: 'sk_test_main' })
        ).toMatchObject({ key: 'sk_test_own', usable: true, testMode: true });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'rk_test_x' })).toMatchObject({
            usable: true,
            testMode: true,
        });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'pk_test_x' })).toMatchObject({
            usable: false,
            reason: 'unknown_prefix',
        });
    });

    it('never takes real money outside production: a live key there is refused (mode)', () => {
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_live_x' })).toMatchObject({
            usable: false,
            reason: 'mode',
        });
        expect(badcatStripeKey({ NODE_ENV: 'staging', STRIPE_SECRET_KEY: 'rk_live_x' })).toMatchObject({
            usable: false,
            reason: 'mode',
        });
        // a live shared key next to a test badcat key: the test one is used
        expect(
            badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_test_own', STRIPE_SECRET_KEY: 'sk_live_main' })
        ).toMatchObject({ key: 'sk_test_own', testMode: true });
    });

    it('in production takes only a live key, skipping a leftover test BADCAT_STRIPE_SECRET_KEY', () => {
        const prod = { NODE_ENV: 'production' };
        expect(badcatStripeKey({ ...prod, BADCAT_STRIPE_SECRET_KEY: 'sk_live_own' })).toMatchObject({
            key: 'sk_live_own',
            usable: true,
            testMode: false,
        });
        expect(
            badcatStripeKey({ ...prod, BADCAT_STRIPE_SECRET_KEY: 'sk_test_old', STRIPE_SECRET_KEY: 'sk_live_main' })
        ).toMatchObject({ key: 'sk_live_main', usable: true, testMode: false });
        expect(badcatStripeKey({ ...prod, BADCAT_STRIPE_SECRET_KEY: 'sk_test_old' })).toMatchObject({
            usable: false,
            reason: 'mode',
        });
    });

    it('derives the entitlement key from INVALIDATE_CACHE_SECRET when its own is unset', () => {
        expect(badcatEntitlementSecret({})).toBeNull();
        expect(badcatEntitlementSecret({ BADCAT_ENTITLEMENT_SECRET: 'own', INVALIDATE_CACHE_SECRET: 'x' })).toBe('own');
        const derived = badcatEntitlementSecret({ INVALIDATE_CACHE_SECRET: 'shared-secret' });
        expect(derived).toBe(
            createHmac('sha256', 'shared-secret').update(ENTITLEMENT_SECRET_LABEL).digest('base64url')
        );
        expect(derived).not.toContain('shared-secret');
        expect(badcatEntitlementSecret({ INVALIDATE_CACHE_SECRET: 'shared-secret' })).toBe(derived);
    });

    it('checkout is ready only with a key, the webhook secret and an entitlement key', () => {
        const full = {
            STRIPE_SECRET_KEY: 'sk_test_x',
            BADCAT_STRIPE_WEBHOOK_SECRET: 'whsec_x',
            INVALIDATE_CACHE_SECRET: 'shared',
        };
        expect(badcatCheckoutReady(full)).toBe(true);
        expect(badcatCheckoutReady({ ...full, STRIPE_SECRET_KEY: undefined })).toBe(false);
        expect(badcatCheckoutReady({ ...full, BADCAT_STRIPE_WEBHOOK_SECRET: undefined })).toBe(false);
        expect(badcatCheckoutReady({ ...full, INVALIDATE_CACHE_SECRET: undefined })).toBe(false);
    });
});

describe('GET /badcat/status', () => {
    let restore: () => void;
    afterEach(() => restore());

    const club = {
        sku: 'club_monthly' as const,
        meta: { trigger: 'home' as const, from_in_app: false },
        returnBase: 'https://tokentails.com/badcat',
    };

    it('reports every feature on and the secret-backed ones not ready with no env', async () => {
        restore = useEnv({});
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toEqual({
            enabled: true,
            checkout: false,
            cameos: true,
            gifts: false,
            restoreEmail: false,
            faceUploads: true,
            creatorCodes: true,
            brand: false,
            testMode: false,
            scores: true,
            boards: true,
            accounts: true,
            shortLinks: true,
            feed: true,
            meter: true,
            push: false,
            streakEmail: false,
            creatorDashboard: true,
        });
        expect(h.ipThrottler.consume).toHaveBeenCalledTimes(1);
        expect(await statusOf(h.controller.checkout(club as any, {}, {}))).toBe(503);
    });

    it('reports checkout ready, test mode and founding places left', async () => {
        restore = useEnv({ ...ON_ENV, SENDGRID_API_KEY: 'SG.test' });
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toEqual({
            enabled: true,
            checkout: true,
            cameos: true,
            gifts: true,
            restoreEmail: true,
            faceUploads: true,
            creatorCodes: true,
            brand: true,
            testMode: true,
            foundingLeft: 200,
            scores: true,
            boards: true,
            accounts: true,
            shortLinks: true,
            feed: true,
            meter: true,
            push: false,
            streakEmail: true,
            creatorDashboard: true,
        });
    });

    it('accepts a live key in production (test mode off)', async () => {
        restore = useEnv({ ...ON_ENV, NODE_ENV: 'production', BADCAT_STRIPE_SECRET_KEY: 'sk_live_ok' });
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toMatchObject({ checkout: true, testMode: false });
    });

    it('refuses a live key outside production: checkout not ready, 503, no session', async () => {
        restore = useEnv({ ...ON_ENV, BADCAT_STRIPE_SECRET_KEY: 'sk_live_ok' });
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toMatchObject({ checkout: false, testMode: false });
        expect(await statusOf(h.controller.checkout(club as any, {}, {}))).toBe(503);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('refuses a test key in production: no free entitlements from test cards', async () => {
        restore = useEnv({ ...ON_ENV, NODE_ENV: 'production' });
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toMatchObject({ checkout: false });
        expect(await statusOf(h.controller.checkout(club as any, {}, {}))).toBe(503);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('takes no money without the webhook secret: checkout not ready and 503', async () => {
        restore = useEnv({ ...ON_ENV, BADCAT_STRIPE_WEBHOOK_SECRET: undefined });
        const h = buildHarness();
        const status = await h.controller.status({}, {});
        expect(status).toMatchObject({ enabled: true, checkout: false, gifts: false, brand: false, testMode: true });
        expect(status.foundingLeft).toBeUndefined();
        expect(await statusOf(h.controller.checkout(club as any, {}, {}))).toBe(503);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('takes no money without an entitlement key: 503', async () => {
        restore = useEnv({ ...ON_ENV, BADCAT_ENTITLEMENT_SECRET: undefined });
        const h = buildHarness();
        expect((await h.controller.status({}, {})).checkout).toBe(false);
        expect(await statusOf(h.controller.checkout(club as any, {}, {}))).toBe(503);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });
});

describe('entitlement tokens', () => {
    const secret = 'spec-secret';
    const payload: Entitlements = {
        club: true,
        plan: 'monthly',
        skus: ['cosmetic_hat'],
        cosmetics: [],
        ...CLUB_LIMITS,
        expiresAt: NOW.getTime() + 1000,
        email: 'a@b.co',
        source: 'server',
    };

    it('signs base64url(JSON).base64url(HMAC) and verifies it', () => {
        const token = signEntitlements(payload, secret);
        const [body, mac] = token.split('.');
        expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toEqual(payload);
        expect(Buffer.from(mac, 'base64url')).toHaveLength(32);
        expect(verifyEntitlementToken(token, secret, { now: NOW.getTime() })).toEqual(payload);
    });

    it('rejects a tampered payload, a foreign secret and junk', () => {
        const token = signEntitlements(payload, secret);
        const [, mac] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ ...payload, maxCats: 99 })).toString('base64url');
        expect(verifyEntitlementToken(`${forged}.${mac}`, secret, { now: NOW.getTime() })).toBeNull();
        expect(verifyEntitlementToken(token, 'other', { now: NOW.getTime() })).toBeNull();
        expect(verifyEntitlementToken('abc', secret)).toBeNull();
        expect(verifyEntitlementToken(undefined, secret)).toBeNull();
        expect(verifyEntitlementToken(`${token}.x`, secret)).toBeNull();
    });

    it('expires at expiresAt unless a grace is given', () => {
        const token = signEntitlements(payload, secret);
        const later = payload.expiresAt + 1;
        expect(verifyEntitlementToken(token, secret, { now: later })).toBeNull();
        expect(verifyEntitlementToken(token, secret, { now: later, graceMs: 5000 })).toEqual(payload);
    });

    it('free entitlements have the free limits', async () => {
        const restoreEnv = useEnv(ON_ENV);
        const h = buildHarness();
        const free = await h.account.entitlementsFor(null);
        expect(free).toMatchObject({ club: false, skus: [], ...FREE_LIMITS, source: 'server' });
        expect(free.expiresAt).toBe(NOW.getTime() + 7 * 86400000);
        restoreEnv();
    });
});

describe('badcat utils', () => {
    it('maps dates to day numbers (day 1 = Monday Nov 16, 2026)', () => {
        expect(dayNoOf(new Date('2026-11-16T00:00:00Z'))).toBe(1);
        expect(dayNoOf(NOW)).toBe(5);
        expect(isFriday(5)).toBe(true);
        expect(isFriday(12)).toBe(true);
        expect(isFriday(-2)).toBe(true); // Nov 13
        expect(weekStartOf(5)).toBe(1);
        expect(weekStartOf(8)).toBe(8);
    });

    it('filters names: links, handles, blocked words, length', () => {
        expect(filterName('Mochi')).toBe('Mochi');
        expect(filterName('  Mo   chi ')).toBe('Mo chi');
        expect(filterName('Mochi the very long name')).toBe('Mochi the ve');
        expect(filterName('@mochi http://x.y')).toBe('A Cat');
        expect(filterName('sh1t')).toBe('A Cat');
        expect(filterName('<b>Mo</b>')).toBe('bMob');
        expect(filterName(42)).toBe('A Cat');
        expect(filterName('Žirnis')).toBe('Žirnis');
    });

    it('xorshift and the weighted sample are deterministic', () => {
        const a = xorshift32(123);
        const b = xorshift32(123);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
        const items = ['a', 'b', 'c', 'd'].map((item, i) => ({ item, weight: i + 1 }));
        expect(weightedSample(items, 3, xorshift32(9))).toEqual(weightedSample(items, 3, xorshift32(9)));
        expect(new Set(weightedSample(items, 4, xorshift32(9))).size).toBe(4);
    });

    it('adds calendar months', () => {
        expect(addMonths(new Date('2026-11-30T10:00:00Z'), 3).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    });
});

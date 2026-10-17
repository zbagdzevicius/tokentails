import { CLUB_LIMITS, Entitlements, FREE_LIMITS } from './badcat.contracts';
import { badcatFlags, badcatPublicUrl, badcatStripeKey } from './badcat-flags';
import { signEntitlements, verifyEntitlementToken } from './badcat-token';
import { addMonths, dayNoOf, filterName, isFriday, weekStartOf, weightedSample, xorshift32 } from './badcat-util';
import { buildHarness, NOW, ON_ENV, statusOf, useEnv } from './badcat-harness.helper-spec';

describe('badcat flags', () => {
    it('every flag is off without env, and every feature needs the master switch', () => {
        expect(Object.values(badcatFlags({}))).toEqual(Object.values(badcatFlags({})).map(() => false));
        const featuresOnly = { ...ON_ENV, BADCAT_ENABLED: undefined } as NodeJS.ProcessEnv;
        expect(Object.values(badcatFlags(featuresOnly)).every(value => value === false)).toBe(true);
        expect(badcatFlags({ BADCAT_ENABLED: '1', BADCAT_CHECKOUT_ENABLED: 'true' }).checkout).toBe(false);
        expect(badcatFlags(ON_ENV).checkout).toBe(true);
    });

    it('defaults the public URL to tokentails.com and trims a trailing slash', () => {
        expect(badcatPublicUrl({})).toBe('https://tokentails.com');
        expect(badcatPublicUrl({ BADCAT_PUBLIC_URL: 'https://example.test/' })).toBe('https://example.test');
    });

    it('uses only BADCAT_STRIPE_SECRET_KEY and refuses a live key without the override', () => {
        expect(badcatStripeKey({ STRIPE_SECRET_KEY: 'sk_test_main' })).toMatchObject({
            usable: false,
            reason: 'missing',
        });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_test_x' })).toMatchObject({
            usable: true,
            testMode: true,
        });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'rk_test_x' })).toMatchObject({
            usable: true,
            testMode: true,
        });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_live_x' })).toMatchObject({
            usable: false,
            reason: 'live_refused',
        });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'rk_live_x' })).toMatchObject({
            usable: false,
            reason: 'live_refused',
        });
        expect(
            badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'sk_live_x', BADCAT_STRIPE_ALLOW_LIVE: 'true' })
        ).toMatchObject({ usable: true, testMode: false });
        expect(badcatStripeKey({ BADCAT_STRIPE_SECRET_KEY: 'pk_test_x' })).toMatchObject({ usable: false });
    });
});

describe('GET /badcat/status', () => {
    let restore: () => void;
    afterEach(() => restore());

    it('answers all false with no env (and without throttling)', async () => {
        restore = useEnv({});
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toEqual({
            enabled: false,
            checkout: false,
            cameos: false,
            gifts: false,
            restoreEmail: false,
            faceUploads: false,
            creatorCodes: false,
            brand: false,
            testMode: false,
        });
        expect(h.ipThrottler.consume).not.toHaveBeenCalled();
    });

    it('reports the flags, test mode and founding places left', async () => {
        restore = useEnv(ON_ENV);
        const h = buildHarness();
        expect(await h.controller.status({}, {})).toEqual({
            enabled: true,
            checkout: true,
            cameos: true,
            gifts: true,
            restoreEmail: false,
            faceUploads: true,
            creatorCodes: true,
            brand: true,
            testMode: true,
            foundingLeft: 200,
            scores: false,
            boards: false,
            accounts: false,
            shortLinks: false,
            feed: false,
            meter: false,
            push: false,
            streakEmail: false,
            creatorDashboard: false,
        });
    });

    it('turns checkout off with a live key, and a live checkout is refused with 503', async () => {
        restore = useEnv({ ...ON_ENV, BADCAT_STRIPE_SECRET_KEY: 'sk_live_nope' });
        const h = buildHarness();
        const status = await h.controller.status({}, {});
        expect(status).toMatchObject({ enabled: true, checkout: false, gifts: false, brand: false, testMode: false });
        expect(status.foundingLeft).toBeUndefined();
        expect(() => h.stripe.stripe()).toThrow();
        expect(
            await statusOf(
                h.controller.checkout(
                    {
                        sku: 'club_monthly',
                        meta: { trigger: 'home', from_in_app: false },
                        returnBase: 'https://tokentails.com/badcat',
                    },
                    {},
                    {}
                )
            )
        ).toBe(503);
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

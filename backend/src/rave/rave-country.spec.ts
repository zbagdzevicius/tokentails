import { ENV_ON, expectRaveError, raveHarness, T0 } from './rave.harness-spec';
import { raveCountryFromRequest, resolveRaveCountry } from './rave-country';
import { RaveController, RAVE_THROTTLES } from './rave.controller';

/*
 * Moon Rave flags: the IP country (Cloudflare `cf-ipcountry`) wins, the picked one is used only when
 * nothing was detected, the public rows carry the code, and GET /rave/countries ranks countries by cats.
 */

const card = (extra: Record<string, unknown> = {}) => ({ cats: 5, method: 'card', coverFee: true, ...extra });

describe('rave country helpers', () => {
    it('reads cf-ipcountry; XX (unknown), T1 (Tor), junk and a missing header are not detected', () => {
        expect(raveCountryFromRequest({ headers: { 'cf-ipcountry': 'LT' } })).toBe('LT');
        expect(raveCountryFromRequest({ headers: { 'cf-ipcountry': ' de ' } })).toBe('DE');
        expect(raveCountryFromRequest({ headers: { 'cf-ipcountry': ['FR'] } })).toBe('FR');
        // Kosovo: user-assigned, but what Cloudflare sends.
        expect(raveCountryFromRequest({ headers: { 'cf-ipcountry': 'XK' } })).toBe('XK');
        for (const value of ['XX', 'T1', 'LTU', '', 'EU']) {
            expect(raveCountryFromRequest({ headers: { 'cf-ipcountry': value } })).toBeNull();
        }
        expect(raveCountryFromRequest({ headers: {} })).toBeNull();
        expect(raveCountryFromRequest(undefined)).toBeNull();
    });

    it('detected wins over picked; picked is used only when nothing was detected; bad picks are invalid', () => {
        expect(resolveRaveCountry('LT', 'de')).toEqual({ country: 'LT', source: 'ip' });
        expect(resolveRaveCountry(null, 'de')).toEqual({ country: 'DE', source: 'picked' });
        expect(resolveRaveCountry('XX', 'pl')).toEqual({ country: 'PL', source: 'picked' });
        expect(resolveRaveCountry(null, undefined)).toBeNull();
        expect(resolveRaveCountry(null, '')).toBeNull();
        expect(resolveRaveCountry(null, null)).toBeNull();
        expect(resolveRaveCountry(null, 'xk')).toEqual({ country: 'XK', source: 'picked' });
        // "No flag" always wins, even over the IP country.
        expect(resolveRaveCountry('LT', 'none')).toBeNull();
        expect(resolveRaveCountry(null, 'NONE')).toBeNull();
        for (const bad of ['ZZ', 'LTU', 5, {}, ['LT']]) {
            expect(resolveRaveCountry(null, bad)).toBe('invalid');
            // Validated even when the IP country wins, so the client contract is the same everywhere.
            expect(resolveRaveCountry('LT', bad)).toBe('invalid');
        }
    });
});

describe('RaveService country', () => {
    it('stores the IP country, else the picked one, and returns it from checkout', async () => {
        const h = raveHarness();
        const a = await h.service.checkout(card({ country: 'de' }), T0, 'LT');
        expect(a).toMatchObject({ country: 'LT', countrySource: 'ip' });
        const b = await h.service.checkout(card({ country: 'de' }), T0, null);
        expect(b).toMatchObject({ country: 'DE', countrySource: 'picked' });
        const c = await h.service.checkout(card(), T0);
        expect(c).toMatchObject({ country: null, countrySource: null });
        expect(h.orders.rows.map((o: any) => [o.country, o.countrySource])).toEqual([
            ['LT', 'ip'],
            ['DE', 'picked'],
            [undefined, undefined],
        ]);
    });

    it('refuses a picked value that is not an ISO alpha-2 code with 400 RAVE_INVALID, before any Stripe call', async () => {
        const h = raveHarness();
        await expectRaveError(h.service.checkout(card({ country: 'Lithuania' }), T0), 400, 'RAVE_INVALID');
        expect(h.stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('a repeat with the same clientKey returns the first order and its country, even from another network', async () => {
        const h = raveHarness();
        const body = card({ clientKey: '11111111-2222-3333' });
        const a = await h.service.checkout(body, T0, 'LT');
        const b = await h.service.checkout({ ...body }, T0, 'DE');
        expect(b.orderId).toBe(a.orderId);
        expect(b.country).toBe('LT');
    });

    async function paid(h: ReturnType<typeof raveHarness>, cats: number, detected: string | null, picked?: string) {
        const res = await h.service.checkout(card({ cats, ...(picked ? { country: picked } : {}) }), T0, detected);
        const row = h.orders.rows.find((o: any) => o.orderId === res.orderId);
        await h.service.markPaid(h.pay(row.paymentIntentId), T0);
        return res;
    }

    it('"none" stores no country, even when the IP country is detected', async () => {
        const h = raveHarness();
        const res = await h.service.checkout(card({ country: 'none' }), T0, 'LT');
        expect(res).toMatchObject({ country: null, countrySource: null });
        expect(h.orders.rows[0].country).toBeUndefined();
    });

    it('public rows carry the country; a hidden order and an unknown one have no field', async () => {
        const h = raveHarness();
        const lt = await paid(h, 5, 'LT');
        await paid(h, 1, null);
        const list = await h.service.listCats({}, T0);
        const byId = new Map(list.orders.map(o => [o.orderId, o]));
        expect(byId.get(lt.orderId)?.country).toBe('LT');
        expect(list.orders.filter(o => !('country' in o))).toHaveLength(1);

        await h.service.moderate(lt.orderId, true, 'mod');
        h.clock.now = new Date(T0.getTime() + 60_000);
        const after = await h.service.listCats({}, h.clock.now);
        expect(after.orders.find(o => o.orderId === lt.orderId)?.country).toBeUndefined();
        // The leaderboard counts the hidden order's cats as unknown.
        const page = await h.service.listCountries(h.clock.now);
        expect(page).toMatchObject({ countries: [], unknownCats: 6, totalCats: 6 });
    });

    it('GET /rave/countries: listed orders grouped by country, most cats first; unpaid and unknown kept apart', async () => {
        const h = raveHarness();
        await paid(h, 5, 'LT');
        await paid(h, 1, 'LT');
        await paid(h, 10, null, 'de');
        await paid(h, 1, 'PL');
        await paid(h, 1, 'AT');
        await paid(h, 5, null);
        // Created but never paid: not listed, not counted.
        await h.service.checkout(card({ cats: 20 }), T0, 'US');

        const page = await h.service.listCountries(T0);
        expect(page).toEqual({
            asOf: T0.toISOString(),
            countries: [
                { country: 'DE', cats: 10, orders: 1 },
                { country: 'LT', cats: 6, orders: 2 },
                { country: 'AT', cats: 1, orders: 1 },
                { country: 'PL', cats: 1, orders: 1 },
            ],
            unknownCats: 5,
            totalCats: 23,
        });
        // Cached like the cats list, and cleared like it when an order changes state.
        h.orders.aggregate.mockClear();
        await h.service.listCountries(T0);
        expect(h.orders.aggregate).not.toHaveBeenCalled();
        await paid(h, 50, 'US');
        expect((await h.service.listCountries(T0)).countries[0]).toEqual({ country: 'US', cats: 50, orders: 1 });
    });

    it('is empty (not an error) while checkout is off', async () => {
        const h = raveHarness({});
        expect(await h.service.listCountries(T0)).toEqual({
            asOf: T0.toISOString(),
            countries: [],
            unknownCats: 0,
            totalCats: 0,
        });
    });
});

describe('RaveController country routes', () => {
    function controller(env: NodeJS.ProcessEnv) {
        const h = raveHarness(env);
        const ipThrottler: any = { consume: jest.fn(async () => undefined) };
        return { h, ipThrottler, ctl: new RaveController(h.service, h.webhooks, ipThrottler) };
    }

    it('GET /rave/geo answers the cf-ipcountry country or null, per-IP limited, never cached publicly', async () => {
        const { ctl, ipThrottler } = controller({});
        expect(await ctl.geo({ headers: { 'cf-ipcountry': 'lt' } }, {})).toEqual({ country: 'LT' });
        expect(await ctl.geo({ headers: { 'cf-ipcountry': 'XX' } }, {})).toEqual({ country: null });
        expect(ipThrottler.consume).toHaveBeenCalledWith(
            'RaveController.geo',
            expect.anything(),
            RAVE_THROTTLES.geo,
            {}
        );
        const headers = Reflect.getMetadata('__headers__', RaveController.prototype.geo);
        expect(headers).toEqual([{ name: 'Cache-Control', value: 'private, no-store' }]);
    });

    it('POST /rave/checkout passes the detected country to the order', async () => {
        const { h, ctl } = controller(ENV_ON);
        const res = await ctl.checkout(card({ country: 'DE' }), { headers: { 'cf-ipcountry': 'LT' } }, {});
        expect(res.country).toBe('LT');
        expect(h.orders.rows[0].countrySource).toBe('ip');
    });

    it('GET /rave/countries is readable while checkout is off', async () => {
        const { ctl, ipThrottler } = controller({});
        expect((await ctl.countries({}, {})).countries).toEqual([]);
        expect(ipThrottler.consume).toHaveBeenCalledWith('RaveController.countries', {}, RAVE_THROTTLES.countries, {});
    });
});

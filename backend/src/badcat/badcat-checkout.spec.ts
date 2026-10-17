import { BADCAT_SKUS, BadcatSku, CheckoutRequest, FOUNDING_CAP, FOUNDING_COUPON_ID } from './badcat.contracts';
import { buildCheckoutParams, validReturnBase } from './badcat-stripe.service';
import { buildHarness, CAT, Harness, ON_ENV, statusOf, TODAY, useEnv } from './badcat-harness.helper-spec';

const BASE = 'https://tokentails.com/badcat';

const request = (sku: BadcatSku, extra: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
    sku,
    meta: { trigger: 'post_share', via: 'MochiFan_1', entry: 'link', from_in_app: true, ab_arm: 'B', session_index: 3 },
    returnBase: BASE,
    ...(BADCAT_SKUS[sku].needsCat ? { catCode: CAT, catName: 'Mochi' } : {}),
    ...(BADCAT_SKUS[sku].needsDay ? { dayNo: TODAY } : {}),
    ...(['brand_shelf', 'sponsor_day', 'sponsor_week'].includes(sku)
        ? { brand: { name: 'Purr Co', url: 'https://purr.example', note: 'tuna can prop' } }
        : {}),
    ...(sku === 'sponsor_week' ? { dayNo: TODAY + 1 } : {}),
    ...extra,
});

describe('POST /badcat/checkout', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const checkout = (req: CheckoutRequest) => h.controller.checkout(req, {}, {});
    const lastParams = () => h.stripeClient.checkout.sessions.create.mock.calls.slice(-1)[0][0] as any;

    it.each(Object.keys(BADCAT_SKUS) as BadcatSku[])('builds the session for %s', async sku => {
        const res = await checkout(request(sku, { email: ' Fan@Example.com ' }));
        expect(res.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
        expect(res.sessionId).toMatch(/^cs_test_/);
        const params = lastParams();
        const def = BADCAT_SKUS[sku];
        expect(params.mode).toBe(def.recurring ? 'subscription' : 'payment');
        expect(params.line_items).toHaveLength(1);
        const price = params.line_items[0].price_data;
        expect(price.currency).toBe('usd');
        expect(price.unit_amount).toBe(sku === 'founding' ? 3999 : def.cents);
        expect(price.recurring).toEqual(def.recurring ? { interval: def.recurring } : undefined);
        expect(price.product_data.name).toBe(def.label);
        expect(params.success_url).toBe(`${BASE}/thanks?session_id={CHECKOUT_SESSION_ID}`);
        expect(params.cancel_url).toBe(BASE);
        expect(params.customer_email).toBe('fan@example.com');
        if (def.recurring) {
            expect(params.customer_creation).toBeUndefined();
            expect(params.subscription_data.metadata).toEqual(params.metadata);
        } else {
            expect(params.customer_creation).toBe('always');
            expect(params.payment_intent_data.metadata).toEqual(params.metadata);
        }
        expect(params.metadata).toMatchObject({
            badcat: '1',
            sku,
            trigger: 'post_share',
            via: 'mochifan_1',
            entry: 'link',
            from_in_app: 'true',
            ab_arm: 'B',
            session_index: '3',
        });
        for (const value of Object.values(params.metadata)) {
            expect(typeof value).toBe('string');
            expect((value as string).length).toBeLessThanOrEqual(500);
        }
        if (def.needsCat) expect(params.metadata).toMatchObject({ cat: CAT, cat_name: 'Mochi' });
        if (def.needsDay) expect(params.metadata.day).toMatch(/^\d+$/);
    });

    it('founding: annual price, the once coupon (created once), renewal text and the cap', async () => {
        await checkout(request('founding'));
        await checkout(request('founding'));
        const params = lastParams();
        expect(params.discounts).toEqual([{ coupon: FOUNDING_COUPON_ID }]);
        expect(params.custom_text.submit.message).toMatch(/\$24\.99.*renews at \$39\.99\/yr/);
        expect(h.stripeClient.coupons.create).toHaveBeenCalledTimes(1);
        expect(h.stripeClient.coupons.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: FOUNDING_COUPON_ID, amount_off: 1500, currency: 'usd', duration: 'once' })
        );
        for (let i = 0; i < FOUNDING_CAP; i++) {
            await h.models.purchases.create({
                sessionId: `cs_f_${i}`,
                kind: 'subscription',
                sku: 'founding',
                status: 'paid',
            });
        }
        expect(await statusOf(checkout(request('founding')))).toBe(409);
        expect((await h.controller.status({}, {})).foundingLeft).toBe(0);
    });

    it('does not set the founding coupon on other subscriptions', async () => {
        await checkout(request('club_annual'));
        expect(lastParams().discounts).toBeUndefined();
        expect(lastParams().custom_text).toBeUndefined();
    });

    it('refuses bad requests with 400 and never calls Stripe', async () => {
        const bad: Partial<CheckoutRequest>[] = [
            { sku: 'nope' as BadcatSku },
            { returnBase: 'https://evil.example/badcat' },
            { returnBase: 'https://tokentails.com.evil.example' },
            { returnBase: 'https://tokentails.com/badcat?x=1' },
            { email: 'not-an-email' },
            { meta: undefined as any },
        ];
        for (const extra of bad) {
            expect(await statusOf(checkout(request('club_monthly', extra)))).toBe(400);
        }
        expect(await statusOf(checkout(request('cameo', { catCode: '!!' })))).toBe(400);
        expect(await statusOf(checkout(request('cameo', { catName: '' })))).toBe(400);
        expect(await statusOf(checkout(request('cameo', { dayNo: TODAY - 2 })))).toBe(400);
        expect(await statusOf(checkout(request('cameo', { dayNo: TODAY + 92 })))).toBe(400);
        expect(await statusOf(checkout(request('guest_star', { dayNo: TODAY + 1 })))).toBe(400); // a Saturday
        expect(await statusOf(checkout(request('sponsor_week', { dayNo: TODAY })))).toBe(400); // not Saturday
        expect(await statusOf(checkout(request('brand_shelf', { brand: { name: '' } })))).toBe(400);
        expect(h.stripeClient.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('filters names and drops unknown meta values', async () => {
        await checkout(
            request('cameo', {
                catName: '@spam www.x.y',
                meta: { trigger: 'hack' as any, via: 'bad code!', from_in_app: 'yes' as any, ab_arm: 'C' as any },
            })
        );
        const meta = lastParams().metadata;
        expect(meta.cat_name).toBe('A Cat');
        expect(meta.trigger).toBe('home');
        expect(meta.via).toBeUndefined();
        expect(meta.from_in_app).toBe('false');
        expect(meta.ab_arm).toBeUndefined();
    });

    it('gates SKU families by their flags (404)', async () => {
        restore();
        restore = useEnv({
            ...ON_ENV,
            BADCAT_CAMEOS_ENABLED: undefined,
            BADCAT_GIFTS_ENABLED: undefined,
            BADCAT_BRAND_ENABLED: undefined,
        });
        for (const sku of [
            'cameo',
            'guest_star',
            'gift_cameo',
            'gift_club_3m',
            'brand_shelf',
            'sponsor_day',
        ] as BadcatSku[]) {
            expect(await statusOf(checkout(request(sku)))).toBe(404);
        }
        expect(await statusOf(checkout(request('club_monthly')))).toBe(200);
    });

    it('accepts localhost return URLs outside production only', () => {
        expect(validReturnBase('http://localhost:5174', { NODE_ENV: 'development' })).toBe('http://localhost:5174');
        expect(validReturnBase('http://localhost:5174/badcat/', { NODE_ENV: 'test' })).toBe(
            'http://localhost:5174/badcat'
        );
        expect(validReturnBase('http://localhost:5174', { NODE_ENV: 'production' })).toBeNull();
        expect(validReturnBase('https://tokentails.com/badcat', { NODE_ENV: 'production' })).toBe(BASE);
        expect(validReturnBase('https://game.example/x', { BADCAT_PUBLIC_URL: 'https://game.example' })).toBe(
            'https://game.example/x'
        );
    });

    it('builds params without an email when none is given', () => {
        const params = buildCheckoutParams(request('cosmetic_hat'), { returnBase: BASE });
        expect(params.customer_email).toBeUndefined();
        expect(params.customer_creation).toBe('always');
    });
});

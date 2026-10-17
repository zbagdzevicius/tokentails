import {
    buildHarness,
    buy,
    CAT,
    deliver,
    Harness,
    NOW,
    ON_ENV,
    statusOf,
    TODAY,
    useEnv,
} from './badcat-harness.helper-spec';
import { FOUNDING_CAP } from './badcat.contracts';

/*
 * Identity rules (review round 1): an email typed in Checkout or in a gift redeem is never trusted. Only a
 * restore magic link proves an email; everything else gets a token scoped to its own purchases.
 */

describe('badcat identity and refunds', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const verifiedToken = async (email: string) => {
        const res = await h.controller.restore({ email }, {}, {});
        const raw = new URL(res.devLink!).searchParams.get('t')!;
        return (await h.controller.restoreVerify({ t: raw }, {}, {})).token;
    };

    it('a gift redeem with a victim email cannot reach the victim (portal, Club cat, cameo upload)', async () => {
        // The victim: a Club member with a Stripe customer and a paid cameo.
        await buy(h, 'club_monthly', {
            email: 'victim@ex.com',
            sessionId: 'cs_test_victim01',
            session: { subscription: 'sub_v', customer: 'cus_victim' },
        });
        await buy(h, 'cameo', {
            email: 'victim@ex.com',
            sessionId: 'cs_test_victim02',
            meta: { cat: CAT, cat_name: 'Vic', day: String(TODAY + 1) },
        });
        const victimCameo = String(h.models.cameos.docs[0]._id);

        // The attacker buys a cheap gift and redeems it with the victim's email.
        await buy(h, 'gift_club_3m', { email: 'attacker@ex.com', sessionId: 'cs_test_attack01' });
        const code = h.models.gifts.docs[0].code;
        const res = await h.controller.redeem({ code, email: 'victim@ex.com' }, {}, {});
        expect(res.ok).toBe(true);
        // Only the gift's own Club, not the victim's plan.
        expect(res.entitlements).toMatchObject({ club: true, plan: 'gift' });

        expect(await statusOf(h.controller.portal({ token: res.token }, {}, {}))).toBe(404);
        expect(h.stripeClient.billingPortal.sessions.create).not.toHaveBeenCalled();
        expect(await statusOf(h.controller.clubCat({ token: res.token, catCode: CAT, name: 'Evil' }, {}, {}))).toBe(
            200
        );
        // ...but it cannot change the row once the victim (verified) set it.
        const victim = await verifiedToken('victim@ex.com');
        await h.controller.clubCat({ token: victim, catCode: CAT, name: 'Mine' }, {}, {});
        expect(await statusOf(h.controller.clubCat({ token: res.token, catCode: CAT, name: 'Evil' }, {}, {}))).toBe(
            403
        );
        expect(h.models.clubCats.docs[0]).toMatchObject({ name: 'Mine' });
        expect(await statusOf(h.cameos.uploadFace(victimCameo, res.token, 'iVBORw0KGgo', process.env))).toBe(403);
        // A refresh keeps the scope (still only the gift).
        const refreshed = (await h.controller.entitlement({ token: res.token }, {}, {})) as any;
        expect(refreshed.entitlements).toMatchObject({ club: true, plan: 'gift' });
        // The verified victim sees the monthly plan.
        const mine = (await h.controller.entitlement({ token: victim }, {}, {})) as any;
        expect(mine.entitlements).toMatchObject({ club: true, plan: 'monthly' });
    });

    it('a cheap purchase with a Club member email does not inherit their Club', async () => {
        await buy(h, 'club_annual', {
            email: 'member@ex.com',
            sessionId: 'cs_test_member01',
            session: { subscription: 'sub_m', customer: 'cus_member' },
        });
        await buy(h, 'cosmetic_hat', {
            email: 'member@ex.com',
            sessionId: 'cs_test_cheap001',
            session: { customer: 'cus_attacker' },
        });
        const done = (await h.controller.entitlement({ sessionId: 'cs_test_cheap001' }, {}, {})) as any;
        expect(done.entitlements).toMatchObject({ club: false, skus: ['cosmetic_hat'] });
        const refreshed = (await h.controller.entitlement({ token: done.token }, {}, {})) as any;
        expect(refreshed.entitlements.club).toBe(false);
        // The portal of a scoped token opens its own purchase's customer only.
        await h.controller.portal({ token: done.token }, {}, {});
        expect(h.stripeClient.billingPortal.sessions.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ customer: 'cus_attacker' })
        );
        // The member's own thanks page and a second purchase on the same device keep both.
        const own = (await h.controller.entitlement({ sessionId: 'cs_test_member01' }, {}, {})) as any;
        expect(own.entitlements).toMatchObject({ club: true, plan: 'annual' });
        await buy(h, 'cosmetic_trail', { email: 'member@ex.com', sessionId: 'cs_test_trail001' });
        const both = (await h.controller.entitlement(
            { sessionId: 'cs_test_trail001', token: own.token },
            {},
            {}
        )) as any;
        expect(both.entitlements).toMatchObject({ club: true, plan: 'annual', skus: ['cosmetic_trail'] });
        // The identity() gate (portal by email, seen email) refuses scoped tokens.
        expect(() => h.account.identity(done.token)).toThrow();
    });

    it('a refund cancels the gift code, ends a redeemed Club gift and hides cameos', async () => {
        await buy(h, 'gift_club_3m', {
            email: 'g@ex.com',
            sessionId: 'cs_test_refgift1',
            session: { payment_intent: 'pi_gift_1' },
        });
        const code = h.models.gifts.docs[0].code;
        await deliver(h, {
            id: 'evt_refund_gift',
            type: 'charge.refunded',
            data: { object: { id: 'ch_g', object: 'charge', refunded: true, payment_intent: 'pi_gift_1' } },
        });
        expect(h.models.gifts.docs[0].canceledAt).toBeDefined();
        expect(await h.controller.redeem({ code, email: 'friend@ex.com' }, {}, {})).toEqual({
            ok: false,
            error: 'refunded',
        });

        // A redeemed Club gift ends when its purchase is refunded.
        await buy(h, 'gift_club_3m', { sessionId: 'cs_test_refgift2', session: { payment_intent: 'pi_gift_2' } });
        const code2 = h.models.gifts.docs[1].code;
        await h.controller.redeem({ code: code2, email: 'friend2@ex.com' }, {}, {});
        expect((await h.account.entitlementsFor('friend2@ex.com')).club).toBe(true);
        await deliver(h, {
            id: 'evt_refund_gift2',
            type: 'charge.refunded',
            data: { object: { id: 'ch_g2', object: 'charge', refunded: true, payment_intent: 'pi_gift_2' } },
        });
        h.clock.now = new Date(NOW.getTime() + 1000);
        expect((await h.account.entitlementsFor('friend2@ex.com')).club).toBe(false);

        // A refunded cameo leaves the pool.
        await buy(h, 'cameo', {
            sessionId: 'cs_test_refcam01',
            meta: { cat: CAT, cat_name: 'Ref', day: String(TODAY) },
            session: { payment_intent: 'pi_cam_1' },
        });
        expect((await h.cameos.build(TODAY, 0)).bundle.spectators.map(s => s.name)).toContain('Ref');
        await deliver(h, {
            id: 'evt_refund_cam',
            type: 'charge.refunded',
            data: { object: { id: 'ch_c', object: 'charge', refunded: true, payment_intent: 'pi_cam_1' } },
        });
        expect(h.models.cameos.docs.find(d => d.sessionId === 'cs_test_refcam01')!.hidden).toBe(true);
        const after = await h.cameos.build(TODAY, 0);
        expect(after.bundle.spectators.map(s => s.name)).not.toContain('Ref');
        expect(after.bundle.fridge.map(s => s.name)).not.toContain('Ref');
    });

    it('the restore devLink needs BADCAT_RESTORE_DEV_LINK=true (a staging server never returns it)', async () => {
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_RESTORE_DEV_LINK: undefined, NODE_ENV: 'staging' });
        expect(await h.controller.restore({ email: 'a@ex.com' }, {}, {})).toEqual({ ok: true });
        restore();
        restore = useEnv({ ...ON_ENV, NODE_ENV: 'production' });
        expect(await h.controller.restore({ email: 'b@ex.com' }, {}, {})).toEqual({ ok: true });
    });

    it('holds founding places for open sessions so they are not oversold', async () => {
        for (let i = 0; i < FOUNDING_CAP - 1; i++) {
            await h.models.purchases.create({
                sessionId: `cs_f_${i}`,
                kind: 'subscription',
                sku: 'founding',
                status: 'paid',
            });
        }
        const req = {
            sku: 'founding' as const,
            returnBase: 'https://tokentails.com/badcat',
            meta: { trigger: 'home' as const, from_in_app: true },
        };
        const first = await h.controller.checkout(req as any, {}, {});
        expect(h.stripeClient.checkout.sessions.create).toHaveBeenLastCalledWith(
            expect.objectContaining({ expires_at: expect.any(Number) })
        );
        expect((await h.controller.status({}, {})).foundingLeft).toBe(0);
        expect(await statusOf(h.controller.checkout(req as any, {}, {}))).toBe(409);
        // The session expires unpaid: the place is free again.
        await deliver(h, {
            id: 'evt_expired',
            type: 'checkout.session.expired',
            data: {
                object: { id: first.sessionId, object: 'checkout.session', metadata: { badcat: '1', sku: 'founding' } },
            },
        });
        expect((await h.controller.status({}, {})).foundingLeft).toBe(1);
    });
});

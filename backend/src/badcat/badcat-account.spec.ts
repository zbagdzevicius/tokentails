import { createHash } from 'crypto';
import { buildHarness, buy, CAT, Harness, NOW, ON_ENV, statusOf, TODAY, useEnv } from './badcat-harness.helper-spec';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('restore by email', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const ask = (email: string) => h.controller.restore({ email }, {}, {});

    it('gives the same answer for a buyer and an unknown email, with a dev link outside production', async () => {
        await buy(h, 'cosmetic_trail', { email: 'buyer@ex.com' });
        const known = await ask('Buyer@Ex.com');
        const unknown = await ask('nobody@ex.com');
        expect(Object.keys(known)).toEqual(Object.keys(unknown));
        expect(known.ok).toBe(true);
        expect(known.devLink).toMatch(/^https:\/\/tokentails\.com\/badcat\/restore\?t=[A-Za-z0-9_-]{32}$/);
        // Only the hash is stored, valid 30 minutes.
        const raw = new URL(known.devLink!).searchParams.get('t')!;
        const row = h.models.restoreTokens.docs.find(d => d.email === 'buyer@ex.com')!;
        expect(row.tokenHash).toBe(sha256(raw));
        expect(JSON.stringify(row)).not.toContain(raw);
        expect(new Date(row.expiresAt).getTime()).toBe(NOW.getTime() + 30 * 60000);
        expect(h.fetchImpl).not.toHaveBeenCalled();
    });

    it('never returns the link in production, and emails only with the flag and SendGrid', async () => {
        restore();
        restore = useEnv({ ...ON_ENV, NODE_ENV: 'production' });
        expect(await ask('a@ex.com')).toEqual({ ok: true });
        expect(h.fetchImpl).not.toHaveBeenCalled();

        restore();
        restore = useEnv({
            ...ON_ENV,
            NODE_ENV: 'production',
            BADCAT_RESTORE_EMAIL_ENABLED: 'true',
            SENDGRID_API_KEY: 'SG.test',
        });
        expect(await ask('b@ex.com')).toEqual({ ok: true });
        expect(h.fetchImpl).toHaveBeenCalledTimes(1);
        expect(h.sent[0].url).toBe('https://api.sendgrid.com/v3/mail/send');
        expect(h.sent[0].body.personalizations[0].to[0].email).toBe('b@ex.com');
        expect(h.sent[0].body.content[0].value).toContain('https://tokentails.com/badcat/restore?t=');

        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_RESTORE_EMAIL_ENABLED: 'true' }); // flag but no SendGrid key
        expect((await ask('c@ex.com')).devLink).toBeDefined();
        expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('limits links per address (same answer) and refuses an invalid email', async () => {
        for (let i = 0; i < 3; i++) expect((await ask('x@ex.com')).devLink).toBeDefined();
        expect(await ask('x@ex.com')).toEqual({ ok: true });
        expect(h.models.restoreTokens.docs).toHaveLength(3);
        expect(await statusOf(ask('nope'))).toBe(400);
        expect(h.ipThrottler.consume).toHaveBeenCalledWith(
            'BadcatController.restore',
            {},
            { limit: 3, ttl: 600000 },
            {}
        );
    });

    it('verifies a link once within 30 minutes', async () => {
        await buy(h, 'club_monthly', { email: 'club@ex.com', session: { subscription: 'sub_r' } });
        const raw = new URL((await ask('club@ex.com')).devLink!).searchParams.get('t')!;
        const verified = await h.controller.restoreVerify({ t: raw }, {}, {});
        expect(verified.entitlements).toMatchObject({ club: true, email: 'club@ex.com' });
        expect(await statusOf(h.controller.restoreVerify({ t: raw }, {}, {}))).toBe(401);

        const late = new URL((await ask('club@ex.com')).devLink!).searchParams.get('t')!;
        h.clock.now = new Date(NOW.getTime() + 31 * 60000);
        expect(await statusOf(h.controller.restoreVerify({ t: late }, {}, {}))).toBe(401);
        expect(await statusOf(h.controller.restoreVerify({ t: 'short' }, {}, {}))).toBe(401);
    });
});

describe('portal, redeem and the Club cat', () => {
    let restore: () => void;
    let h: Harness;
    beforeEach(() => {
        restore = useEnv(ON_ENV);
        h = buildHarness();
    });
    afterEach(() => restore());

    const tokenFor = async (email: string) => (await h.account.issue(email)).token;

    it('portal: the latest customer of the token email', async () => {
        await buy(h, 'club_monthly', { email: 'p@ex.com', session: { subscription: 'sub_p', customer: 'cus_old' } });
        h.clock.now = new Date(NOW.getTime() + 1000);
        await buy(h, 'cosmetic_hat', { email: 'p@ex.com', session: { customer: 'cus_new' } });
        const res = await h.controller.portal({ token: await tokenFor('p@ex.com') }, {}, {});
        expect(res.url).toBe('https://billing.stripe.com/p/session/test_spec');
        expect(h.stripeClient.billingPortal.sessions.create).toHaveBeenCalledWith({
            customer: 'cus_new',
            return_url: 'https://tokentails.com/badcat',
        });
        expect(await statusOf(h.controller.portal({ token: await tokenFor('none@ex.com') }, {}, {}))).toBe(404);
        expect(await statusOf(h.controller.portal({ token: 'x.y' }, {}, {}))).toBe(401);
    });

    it('redeems a Club gift as 3 months of entitlement for the recipient, once', async () => {
        await buy(h, 'gift_club_3m', { email: 'giver@ex.com', sessionId: 'cs_test_gclub001' });
        const code = h.models.gifts.docs[0].code;
        const res = await h.controller.redeem({ code: code.toLowerCase(), email: 'Friend@Ex.com' }, {}, {});
        expect(res).toMatchObject({
            ok: true,
            kind: 'club',
            entitlements: { club: true, plan: 'gift', email: 'friend@ex.com' },
        });
        expect(res.token).toEqual(expect.any(String));
        expect(new Date(h.models.gifts.docs[0].clubUntil).toISOString()).toBe('2027-02-20T12:00:00.000Z');
        // Never a subscription, and the giver gets nothing.
        expect(h.models.purchases.docs.filter(d => d.kind === 'subscription')).toHaveLength(0);
        expect((await h.account.entitlementsFor('giver@ex.com')).club).toBe(false);
        expect(await h.controller.redeem({ code, email: 'other@ex.com' }, {}, {})).toEqual({
            ok: false,
            error: 'already_redeemed',
        });
        // Lapses after 3 months.
        h.clock.now = new Date('2027-02-21T00:00:00Z');
        expect((await h.account.entitlementsFor('friend@ex.com')).club).toBe(false);
    });

    it('redeems a gift cameo into the recipient cameo, once; validates the cat and day', async () => {
        await buy(h, 'gift_cameo', { sessionId: 'cs_test_gcam0001' });
        const code = h.models.gifts.docs[0].code;
        expect(
            await statusOf(h.controller.redeem({ code, email: 'r@ex.com', catName: 'Tom', dayNo: TODAY }, {}, {}))
        ).toBe(400);
        expect(
            await statusOf(
                h.controller.redeem({ code, email: 'r@ex.com', catCode: CAT, catName: 'Tom', dayNo: TODAY - 2 }, {}, {})
            )
        ).toBe(400);
        const res = await h.controller.redeem(
            { code, email: 'r@ex.com', catCode: CAT, catName: 'Tom', dayNo: TODAY + 2 },
            {},
            {}
        );
        expect(res).toMatchObject({ ok: true, kind: 'cameo' });
        expect(h.models.cameos.docs).toHaveLength(1);
        expect(h.models.cameos.docs[0]).toMatchObject({
            kind: 'gift',
            email: 'r@ex.com',
            catCode: CAT,
            name: 'Tom',
            dayNo: TODAY + 2,
        });
        expect(res.cameoId).toBe(String(h.models.cameos.docs[0]._id));
        const again = await h.controller.redeem(
            { code, email: 'r@ex.com', catCode: CAT, catName: 'Tom', dayNo: TODAY + 2 },
            {},
            {}
        );
        expect(again).toEqual({ ok: false, error: 'already_redeemed' });
        expect(h.models.cameos.docs).toHaveLength(1);
    });

    it('refuses concurrent double redeems (one wins)', async () => {
        await buy(h, 'gift_club_3m', { sessionId: 'cs_test_gclub002' });
        const code = h.models.gifts.docs[0].code;
        const results = await Promise.all([
            h.controller.redeem({ code, email: 'a@ex.com' }, {}, {}),
            h.controller.redeem({ code, email: 'b@ex.com' }, {}, {}),
        ]);
        expect(results.filter(r => r.ok)).toHaveLength(1);
        expect(results.filter(r => r.error === 'already_redeemed')).toHaveLength(1);
    });

    it('answers unknown codes and needs the gifts flag', async () => {
        expect(await h.controller.redeem({ code: 'ZZZZZZZZZZ', email: 'a@ex.com' }, {}, {})).toEqual({
            ok: false,
            error: 'unknown_code',
        });
        expect(await h.controller.redeem({ code: '!', email: 'a@ex.com' }, {}, {})).toEqual({
            ok: false,
            error: 'unknown_code',
        });
        expect(await statusOf(h.controller.redeem({ code: 'ZZZZZZZZZZ', email: 'bad' }, {}, {}))).toBe(400);
        restore();
        restore = useEnv({ ...ON_ENV, BADCAT_GIFTS_ENABLED: undefined });
        expect(await statusOf(h.controller.redeem({ code: 'ZZZZZZZZZZ', email: 'a@ex.com' }, {}, {}))).toBe(404);
    });

    it('sets the Club cat for members only', async () => {
        await buy(h, 'club_monthly', { email: 'm@ex.com', session: { subscription: 'sub_m' } });
        const token = await tokenFor('m@ex.com');
        expect(await h.controller.clubCat({ token, catCode: CAT, name: 'Mochi' }, {}, {})).toEqual({ ok: true });
        expect(await h.controller.clubCat({ token, catCode: CAT, name: 'Biscuit' }, {}, {})).toEqual({ ok: true });
        expect(h.models.clubCats.docs).toHaveLength(1);
        expect(h.models.clubCats.docs[0]).toMatchObject({ email: 'm@ex.com', catCode: CAT, name: 'Biscuit' });
        expect(
            await statusOf(
                h.controller.clubCat({ token: await tokenFor('free@ex.com'), catCode: CAT, name: 'x' }, {}, {})
            )
        ).toBe(403);
        expect(await statusOf(h.controller.clubCat({ token, catCode: '??', name: 'x' }, {}, {}))).toBe(400);
        h.clock.now = new Date(NOW.getTime() + 8 * 86400000); // token expired (no grace here)
        expect(await statusOf(h.controller.clubCat({ token, catCode: CAT, name: 'x' }, {}, {}))).toBe(401);
    });
});

import { PawlegendsOfferService } from './pawlegends-offer.service';
import { buildHarness, DEVICE, Harness, ON_ENV, statusOf } from './pawlegends-harness.helper-spec';

/*
 * The offer engine since the Token Tails integration: one "Meet <cat>" card for a featured direct-purchase cat,
 * never in session 1, only on the lobby and results screens, never in app builds, at most one per session and one
 * a day, the same cat not again for 3 days, nothing under 16 or at the spend cap, and only cats the server sells.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const CAT_A = '65a1b2c3d4e5f6a7b8c9d0e1';
const CAT_B = '65a1b2c3d4e5f6a7b8c9d0e2';

describe('Pawlegends offer engine (Meet)', () => {
    let h: Harness;
    beforeEach(() => {
        h = buildHarness();
    });
    const ask = (over: Record<string, unknown> = {}) =>
        h.offers.offer({ deviceId: DEVICE, session: 2, catalogIds: `${CAT_A},${CAT_B}`, ...over }, ON_ENV);
    const later = (ms: number) => (h.clock.now = new Date(h.clock.now.getTime() + ms));

    it('never offers in session 1, whatever else is true', async () => {
        expect(await ask({ session: 1 })).toEqual({ offer: null });
        expect(await ask({ session: 0 })).toEqual({ offer: null });
    });

    it('never offers in app builds, outside the lobby and results, or without featured cats', async () => {
        expect((await ask({ app: true })).offer).toBeNull();
        expect((await ask({ app: 'true' })).offer).toBeNull();
        expect((await ask({ screen: 'match' })).offer).toBeNull();
        expect((await ask({ screen: 'pick' })).offer).toBeNull();
        expect((await ask({ catalogIds: '' })).offer).toBeNull();
        expect((await ask({ catalogIds: 'not-an-id,../packs' })).offer).toBeNull();
        expect((await ask({ screen: 'results' })).offer).toEqual({ kind: 'meet', catalogId: CAT_A });
    });

    it('one card per session and one a day; the same cat waits 3 days, another featured cat may come first', async () => {
        expect((await ask()).offer).toEqual({ kind: 'meet', catalogId: CAT_A });
        await h.offers.seen({ deviceId: DEVICE, kind: 'meet', catalogId: CAT_A, session: 2 });
        expect((await ask()).offer).toBeNull();
        expect((await ask({ session: 3 })).offer).toBeNull(); // same day
        later(21 * HOUR);
        expect((await ask({ session: 3 })).offer).toEqual({ kind: 'meet', catalogId: CAT_B });
        await h.offers.seen({ deviceId: DEVICE, kind: 'meet', catalogId: CAT_B, session: 3 });
        later(3 * DAY);
        expect((await ask({ session: 4 })).offer).toEqual({ kind: 'meet', catalogId: CAT_A });
    });

    it('only cats the server sells on their own', async () => {
        const check = jest.fn(async (id: string) =>
            id === CAT_B
                ? { ok: true as const, cat: { catId: id } as any }
                : { ok: false as const, reason: 'NOT_FOR_SALE' as const }
        );
        const offers = new PawlegendsOfferService(h.store, h.stripe, h.account, { check } as any);
        offers.now = () => h.clock.now;
        expect(
            (await offers.offer({ deviceId: DEVICE, session: 2, catalogIds: `${CAT_A},${CAT_B}` }, ON_ENV)).offer
        ).toEqual({ kind: 'meet', catalogId: CAT_B });
        expect(check).toHaveBeenCalledWith(CAT_A);
    });

    it('a shelter champion card the host puts first (sim v9, after a 3rd match on it) is offered like any featured cat', async () => {
        const LAMBO = '6a30473c1d6649b19b03622b';
        expect((await ask({ catalogIds: `${LAMBO},${CAT_A}`, screen: 'results' })).offer).toEqual({
            kind: 'meet',
            catalogId: LAMBO,
        });
        await h.offers.seen({ deviceId: DEVICE, kind: 'meet', catalogId: LAMBO, session: 2 });
        // Every global cap still applies: one card per session.
        expect((await ask({ catalogIds: `${LAMBO},${CAT_A}` })).offer).toBeNull();
    });

    it('none at the spend cap, and none under 16', async () => {
        await h.models.purchases.create({
            sessionId: 'cs_cap',
            sku: 'pl_founder',
            status: 'paid',
            deviceId: DEVICE,
            currency: 'eur',
            amountCents: 19800,
            capCents: 19800,
            items: [],
        });
        expect((await ask()).offer).toBeNull();
        const young = buildHarness();
        await young.stripe.rememberBand({ deviceId: DEVICE }, 'under16');
        expect(
            (await young.offers.offer({ deviceId: DEVICE, session: 2, catalogIds: CAT_A }, ON_ENV)).offer
        ).toBeNull();
    });

    it('validates its input', async () => {
        expect(await statusOf(h.offers.offer({ deviceId: 'x', session: 2 }, ON_ENV))).toBe(400);
        expect(await statusOf(h.offers.offer({ deviceId: DEVICE, session: -1 }, ON_ENV))).toBe(400);
        expect(await statusOf(h.offers.seen({ deviceId: DEVICE, kind: 'starter', session: 2, catalogId: CAT_A }))).toBe(
            400
        );
        expect(await statusOf(h.offers.seen({ deviceId: DEVICE, kind: 'meet', session: 2, catalogId: 'x' }))).toBe(400);
        // Query strings arrive as strings.
        expect((await h.offers.offer({ deviceId: DEVICE, session: '2', catalogIds: CAT_A }, ON_ENV)).offer?.kind).toBe(
            'meet'
        );
    });
});

import { buildHarness, buyAndPay, DEVICE, Harness, ON_ENV, statusOf } from './pawlegends-harness.helper-spec';

/* POC.md §15 item 16: the offer engine (§8.4). */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Pawlegends offer engine', () => {
    let h: Harness;
    beforeEach(() => {
        h = buildHarness();
    });
    const ask = (over: Record<string, unknown> = {}) =>
        h.offers.offer({ deviceId: DEVICE, session: 2, matches: 1, firstWin: true, ownedCats: 0, ...over }, ON_ENV);
    const later = (ms: number) => (h.clock.now = new Date(h.clock.now.getTime() + ms));

    it('never offers in session 1, whatever else is true', async () => {
        expect(await ask({ session: 1, matches: 9 })).toEqual({ offer: null });
        expect(await ask({ session: 0, matches: 9 })).toEqual({ offer: null });
    });

    it('never offers in app builds or outside the lobby and results', async () => {
        expect((await ask({ app: true })).offer).toBeNull();
        expect((await ask({ screen: 'match' })).offer).toBeNull();
        expect((await ask({ screen: 'pick' })).offer).toBeNull();
        expect((await ask({ screen: 'results' })).offer?.kind).toBe('starter');
    });

    it('rule 1: the starter, from session 2 after the first win, with a genuine 48 h window', async () => {
        expect((await ask({ firstWin: false })).offer).toBeNull();
        const first = await ask();
        expect(first.offer).toEqual({
            kind: 'starter',
            skus: ['pl_starter'],
            endsAt: h.clock.now.getTime() + 48 * HOUR,
        });
        await h.offers.seen({ deviceId: DEVICE, kind: 'starter', session: 2 });
        // The window is fixed by the first show.
        later(10 * HOUR);
        const again = await ask({ session: 3 });
        expect(again.offer?.endsAt).toBe(first.offer!.endsAt);
        // After 48 h it is gone for good.
        later(39 * HOUR);
        expect((await ask({ session: 4 })).offer).toBeNull();
    });

    it('at most one card per session', async () => {
        expect((await ask()).offer?.kind).toBe('starter');
        await h.offers.seen({ deviceId: DEVICE, kind: 'starter', session: 2 });
        expect((await ask({ matches: 5 })).offer).toBeNull();
        expect((await ask({ session: 3, matches: 5 })).offer?.kind).toBe('starter');
    });

    it('rules fire in order: starter first, then Founder after 3 matches, at most every 7 days', async () => {
        expect((await ask({ matches: 3 })).offer?.kind).toBe('starter');
        await buyAndPay(h, 'pl_starter');
        const founder = await ask({ session: 3, matches: 3 });
        expect(founder.offer).toEqual({ kind: 'founder', skus: ['pl_founder', 'pl_founder_legend'], endsAt: null });
        expect((await ask({ session: 3, matches: 2 })).offer).toBeNull();
        await h.offers.seen({ deviceId: DEVICE, kind: 'founder', session: 3 });
        later(6 * DAY);
        expect((await ask({ session: 4, matches: 9 })).offer).toBeNull();
        later(1 * DAY);
        expect((await ask({ session: 5, matches: 9 })).offer?.kind).toBe('founder');
        await buyAndPay(h, 'pl_founder');
        expect((await ask({ session: 6, matches: 9 })).offer).toBeNull();
    });

    it('none at the spend cap', async () => {
        await h.models.purchases.create({
            sessionId: 'cs_cap',
            sku: 'pl_founder',
            status: 'paid',
            deviceId: DEVICE,
            currency: 'eur',
            amountCents: 20000,
            capCents: 20000,
            items: [],
        });
        expect((await ask({ matches: 9 })).offer).toBeNull();
    });

    it('validates its input', async () => {
        expect(await statusOf(h.offers.offer({ deviceId: 'x', session: 2, matches: 1 }, ON_ENV))).toBe(400);
        expect(await statusOf(h.offers.offer({ deviceId: DEVICE, session: -1, matches: 1 }, ON_ENV))).toBe(400);
        expect(await statusOf(h.offers.seen({ deviceId: DEVICE, kind: 'other', session: 2 }))).toBe(400);
        // Query strings arrive as strings.
        expect(
            (await h.offers.offer({ deviceId: DEVICE, session: '2', matches: '1', firstWin: 'true' }, ON_ENV)).offer
                ?.kind
        ).toBe('starter');
    });
});

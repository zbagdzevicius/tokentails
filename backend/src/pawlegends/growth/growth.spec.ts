import Stripe from 'stripe';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { SIM_VERSION } from 'src/vendor/pawlegends-sim';
import { coatSkuOf, STORE_COATS, STORE_TERMS_VERSION } from '../pawlegends-catalog';
import { buildHarness, codeOf, completedEvent, DEVICE, Harness, NOW, ON_ENV, signedEvent } from '../pawlegends-harness.helper-spec';
import { PAWLEGENDS_REPLAY_QUEUE, savePawlegendsMatch } from '../pawlegends-live';
import { ownedItemsOf } from '../pawlegends-season.service';
import { PawlegendsStripeService } from '../pawlegends-stripe.service';
import { PawlegendsWebhookService } from '../pawlegends-webhook.service';
import { applyInviteProgress } from './apply-invite-progress';
import {
    COMEBACK_DAYS,
    creatorLinkLive,
    creatorPayouts,
    FIRST_GIFT_COATS,
    INVITE_COATS,
    INVITE_MATCHES,
    INVITE_MIN_TICKS,
    inviteCodeFrom,
    inviteKindOf,
    inviteLink,
    inviteMatchCounts,
    INVITER_REWARD_CAP,
    normalizeCreatorCode,
    normalizeInviteCode,
    STORE_COAT_IDS,
} from './growth.rules';
import { GrowthService } from './growth.service';

jest.mock('node-fetch', () => jest.fn());

/*
 * Growth (docs/plans/moba/GROWTH.md): invite and comeback codes, creator codes at the web checkout and the
 * first-purchase gift. In-memory models, the harness Stripe fake (no network, test keys only).
 */

const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccc';
const D = 'dddddddddddddddddddddddd';

function growthOf(h?: Harness, users: Record<string, any>[] = []) {
    const now = () => new Date(NOW.getTime());
    const owned = h ? h.models.owned : new MemoryModel([], [{ fields: ['accountId', 'item'] }], now);
    const purchases = h ? h.models.purchases : new MemoryModel([], [{ fields: ['sessionId'] }], now);
    const g = new GrowthService(
        new MemoryModel([], [{ fields: ['accountId'] }, { fields: ['code'] }], now) as any,
        new MemoryModel([], [{ fields: ['inviteeId'] }, { fields: ['deviceId'] }], now) as any,
        new MemoryModel([], [{ fields: ['code'] }], now) as any,
        new MemoryModel([], [{ fields: ['accountId'] }], now) as any,
        new MemoryModel([], [{ fields: ['accountId'] }], now) as any,
        owned as any,
        purchases as any,
        new MemoryModel(users, [], now) as any
    );
    g.now = now;
    let seq = 0;
    // deterministic codes: a different first byte per draw
    g.random = n => Uint8Array.from({ length: n }, (_, i) => (i === 0 ? seq++ : i * 7));
    return g;
}

const fresh = (id: string, over: Record<string, unknown> = {}) => ({ _id: id, createdAt: ago(1), ...over });
const veteran = (id: string, lastDays: number) => ({
    _id: id,
    createdAt: ago(200),
    lastPlayedAt: ago(lastDays),
    pawlegendsMatches: { easy: 40, hard: 3 },
});
const match = (ref: string, over: Record<string, unknown> = {}) => ({ ref, ticks: INVITE_MIN_TICKS + 1, forfeit: false, ...over });

describe('growth rules', () => {
    it('codes: 7 characters, no look-alikes, typed in any case', () => {
        const code = inviteCodeFrom([0, 1, 2, 3, 4, 5, 6]);
        expect(code).toBe('ABCDEFG');
        expect(normalizeInviteCode('abc-defg')).toBe('ABCDEFG');
        expect(normalizeInviteCode('ABCDEF0')).toBeNull();
        expect(normalizeInviteCode('ABCDEFGH')).toBeNull();
        expect(normalizeInviteCode(42)).toBeNull();
        expect(inviteLink('ABCDEFG')).toBe('https://pawlegends.app/?ref=ABCDEFG');
        expect(normalizeCreatorCode('pixel-queen')).toBe('PIXELQUEEN');
        expect(normalizeCreatorCode('x')).toBeNull();
        expect(normalizeCreatorCode('<script>')).toBeNull();
    });
    it('who may accept: new players, and players back after 21 days', () => {
        expect(inviteKindOf({ createdAt: ago(300), matches: {} }, NOW)).toBe('new');
        expect(inviteKindOf({ createdAt: ago(3), matches: { easy: 2 } }, NOW)).toBe('new');
        expect(inviteKindOf({ createdAt: ago(200), lastPlayedAt: ago(COMEBACK_DAYS), matches: { easy: 9 } }, NOW)).toBe(
            'comeback'
        );
        expect(inviteKindOf({ createdAt: ago(200), lastPlayedAt: ago(COMEBACK_DAYS - 1), matches: { easy: 9 } }, NOW)).toBeNull();
        expect(inviteKindOf({ createdAt: ago(200), matches: { easy: 9 } }, NOW)).toBeNull();
    });
    it('a match counts only when it is real: no forfeit, at least a minute', () => {
        expect(inviteMatchCounts(match('r1'))).toBe(true);
        expect(inviteMatchCounts(match('r1', { forfeit: true }))).toBe(false);
        expect(inviteMatchCounts(match('r1', { ticks: INVITE_MIN_TICKS - 1 }))).toBe(false);
        expect(inviteMatchCounts(match(''))).toBe(false);
    });
    it('every reward is a real Rare store coat, and the gift is a fixed choice of 5', () => {
        for (const c of [...INVITE_COATS, ...FIRST_GIFT_COATS]) expect(STORE_COAT_IDS.has(c)).toBe(true);
        expect(FIRST_GIFT_COATS).toHaveLength(5);
        expect(new Set(FIRST_GIFT_COATS).size).toBe(5);
        expect(INVITE_COATS.filter(c => FIRST_GIFT_COATS.includes(c))).toEqual([]);
    });
    it('creator links last 30 days; the payout report sums per code and currency', () => {
        expect(creatorLinkLive(ago(29), NOW)).toBe(true);
        expect(creatorLinkLive(ago(30), NOW)).toBe(false);
        expect(creatorLinkLive(null, NOW)).toBe(false);
        const lines = creatorPayouts(
            [
                { code: 'PIXEL', currency: 'eur', amountCents: 299 },
                { code: 'PIXEL', currency: 'eur', amountCents: 1499 },
                { code: 'PIXEL', currency: 'usd', amountCents: 799 },
                { code: 'BONE', currency: 'usd', amountCents: 199 },
                { code: 'BONE', currency: 'usd', amountCents: 0 },
            ],
            code => (code === 'PIXEL' ? 500 : 1000)
        );
        expect(lines).toEqual([
            { code: 'BONE', orders: 1, gross: { usd: 199 }, shareBps: 1000, payout: { usd: 19 } },
            { code: 'PIXEL', orders: 3, gross: { eur: 1798, usd: 799 }, shareBps: 500, payout: { eur: 89, usd: 39 } },
        ]);
    });
});

describe('invites', () => {
    it('blocks a self-invite, a second invite for the account or the device, and swapped codes', async () => {
        const g = growthOf(undefined, [fresh(A), fresh(B), fresh(C), fresh(D)]);
        const codeA = await g.codeOf(A);
        expect(await g.codeOf(A)).toBe(codeA);
        expect(await codeOf(g.redeem(A, codeA, DEVICE))).toBe('PAWLEGENDS_INVITE_SELF');
        await g.redeem(B, codeA.toLowerCase(), DEVICE);
        // double use: the same account again (same code or another one)
        expect(await codeOf(g.redeem(B, codeA, 'device-cccccccc'))).toBe('PAWLEGENDS_INVITE_USED');
        expect(await codeOf(g.redeem(B, await g.codeOf(C), 'device-cccccccc'))).toBe('PAWLEGENDS_INVITE_USED');
        // the same device under another account
        expect(await codeOf(g.redeem(C, codeA, DEVICE))).toBe('PAWLEGENDS_INVITE_DEVICE');
        // A invited B: B's code cannot invite A back
        expect(await codeOf(g.redeem(A, await g.codeOf(B), 'device-dddddddd'))).toBe('PAWLEGENDS_INVITE_NOT_ELIGIBLE');
        expect(await codeOf(g.redeem(D, 'ZZZZZZZ', 'device-eeeeeeee'))).toBe('PAWLEGENDS_INVITE_UNKNOWN');
        expect(await codeOf(g.redeem(D, 'nope', 'device-eeeeeeee'))).toBe('PAWLEGENDS_INVITE_UNKNOWN');
    });

    it('accepts a friend away 21+ days as a comeback, refuses an active player and a guest', async () => {
        const g = growthOf(undefined, [fresh(A), veteran(B, COMEBACK_DAYS + 1), veteran(C, 3), { _id: D, isGuest: true }]);
        const code = await g.codeOf(A);
        expect((await g.redeem(B, code, undefined)).accepted).toMatchObject({ kind: 'comeback', matches: 0, need: 3 });
        expect(await codeOf(g.redeem(C, code, undefined))).toBe('PAWLEGENDS_INVITE_NOT_ELIGIBLE');
        expect(await codeOf(g.redeem(D, code, undefined))).toBe('PAWLEGENDS_NEED_ACCOUNT');
    });

    it('rewards both players only after 3 verified matches, each side once', async () => {
        const g = growthOf(undefined, [fresh(A), fresh(B)]);
        await g.redeem(B, await g.codeOf(A), DEVICE);
        // nothing to claim yet
        expect((await g.claim(A)).granted).toEqual([]);
        expect((await g.claim(B)).granted).toEqual([]);
        // a forfeit, a short match and a repeated save do not count
        expect(await g.progress(B, match('m1', { forfeit: true }))).toBe('skipped');
        expect(await g.progress(B, match('m1', { ticks: 30 }))).toBe('skipped');
        expect(await g.progress(B, match('m1'))).toBe('counted');
        expect(await g.progress(B, match('m1'))).toBe('skipped');
        expect(await g.progress(B, match('m2'))).toBe('counted');
        // the inviter's own matches never count for the invite
        expect(await g.progress(A, match('m3'))).toBe('skipped');
        let state = await g.state(A);
        expect(state.invited[0]).toMatchObject({ matches: 2, status: 'pending', claimable: false });
        expect((await g.claim(A)).granted).toEqual([]);
        expect(await g.progress(B, match('m3'))).toBe('done');
        expect(await g.progress(B, match('m4'))).toBe('skipped');
        state = await g.state(A);
        expect(state.claimable).toBe(1);
        expect(state.invited[0]).toMatchObject({ matches: INVITE_MATCHES, status: 'done', claimable: true });
        expect((await g.state(B)).accepted).toMatchObject({ status: 'done', claimable: true });

        const [a1, a2] = await Promise.all([g.claim(A), g.claim(A)]);
        expect([...a1.granted, ...a2.granted]).toEqual([INVITE_COATS[0]]);
        expect((await g.claim(B)).granted).toEqual([INVITE_COATS[0]]);
        expect((await g.claim(B)).granted).toEqual([]);
        expect(await ownedItemsOf({ owned: g.owned }, A)).toEqual([INVITE_COATS[0]]);
        expect(await ownedItemsOf({ owned: g.owned }, B)).toEqual([INVITE_COATS[0]]);
        expect((await g.state(A)).claimable).toBe(0);
    });

    it('an invite not finished in 30 days expires; an inviter earns at most 5 coats', async () => {
        const users = [fresh(A), ...Array.from({ length: 7 }, (_, i) => fresh(`f${String(i).padStart(23, '0')}`))];
        const g = growthOf(undefined, users);
        const code = await g.codeOf(A);
        for (let i = 0; i < 7; i++) {
            const id = `f${String(i).padStart(23, '0')}`;
            await g.redeem(id, code, `device-${String(i).padStart(8, '0')}`);
            for (let m = 0; m < INVITE_MATCHES; m++) await g.progress(id, match(`${id}-${m}`));
        }
        const { granted } = await g.claim(A);
        expect(granted).toHaveLength(INVITER_REWARD_CAP);
        expect(new Set(granted).size).toBe(INVITER_REWARD_CAP);
        expect((await g.state(A)).claimable).toBe(0);

        const late = growthOf(undefined, [fresh(A), fresh(B)]);
        await late.redeem(B, await late.codeOf(A), DEVICE);
        late.now = () => new Date(NOW.getTime() + 31 * DAY);
        expect(await late.progress(B, match('x1'), late.now())).toBe('skipped');
        expect((await late.state(A, late.now())).invited[0].status).toBe('expired');
    });

    it('counts only through the /live save, after its Game row, once per save; a failure never fails the save', async () => {
        const users = new FakeUsers();
        const games = new FakeGames();
        const userId = users.add({});
        const g = growthOf(undefined, [fresh(A), fresh(String(userId))]);
        await g.redeem(String(userId), await g.codeOf(A), DEVICE);
        const record = (seed: number) =>
            ({
                v: 1,
                simVersion: SIM_VERSION,
                seed,
                difficulty: 'easy',
                hero: 'clem',
                trick: 'pounce',
                ticks: 14_000,
                inputs: 'AQIDBA==',
                outcome: 'won',
                finalHash: '0badc0de',
            }) as any;
        const deps = {
            users,
            games,
            verify: async () => ({ ok: true as const, outcome: 'won' as const, finalHash: '0badc0de', ticks: 14_000 }),
            queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
            now: () => NOW,
            growth: g,
        };
        await savePawlegendsMatch(deps as any, userId, { pawlegends: record(1) });
        expect(await codeOf(savePawlegendsMatch(deps as any, userId, { pawlegends: record(1) }))).toBe('PAWLEGENDS_DUPLICATE');
        expect((await g.state(String(userId))).accepted?.matches).toBe(1);
        // a broken counter is logged, the save still answers
        const broken = { ...deps, growth: { progress: async () => Promise.reject(new Error('db down')) } };
        await expect(savePawlegendsMatch(broken as any, userId, { pawlegends: record(2) })).resolves.toMatchObject({ outcome: 'won' });
        await expect(applyInviteProgress(undefined, 'x', match('y'))).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------------------------------------------

const ACCOUNT = 'acct-0000000000000001';
const CLEM_SKU = coatSkuOf(STORE_COATS.find(c => c.hero === 'clem')!);
const SAGE_SKU = coatSkuOf(STORE_COATS.find(c => c.hero === 'sage')!);

function storeHarness() {
    const h = buildHarness();
    const growth = growthOf(h);
    const stripe = new PawlegendsStripeService(h.store, growth);
    stripe.createClient = () => h.stripeClient as unknown as Stripe;
    stripe.now = () => new Date(h.clock.now.getTime());
    const webhooks = new PawlegendsWebhookService(h.store, stripe, growth);
    webhooks.now = stripe.now;
    return { ...h, growth, stripe, webhooks };
}
type StoreH = ReturnType<typeof storeHarness>;

const request = (sku: string, over: Record<string, unknown> = {}) => ({
    sku,
    currency: 'eur' as const,
    email: 'buyer@example.com',
    consentVersion: STORE_TERMS_VERSION,
    consent: true,
    deviceId: DEVICE,
    ...over,
});

async function pay(h: StoreH, sku: string, over: Record<string, unknown> = {}) {
    const { sessionId } = await h.stripe.createCheckout(request(sku, over) as any, ON_ENV, ACCOUNT);
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    const params = calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams;
    const event = completedEvent(sessionId, params);
    const { rawBody, signature } = signedEvent(event);
    await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
    return { sessionId, params, event };
}

describe('creator codes at the web checkout', () => {
    it('checks the code, writes it into the Stripe metadata and the purchase row, and keeps it 30 days', async () => {
        const h = storeHarness();
        await h.growth.upsertCreator({ code: 'pixel-queen', name: 'Pixel Queen' });
        expect(await codeOf(h.stripe.createCheckout(request(CLEM_SKU, { creatorCode: 'NOBODY' }) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_CREATOR_UNKNOWN'
        );
        const first = await pay(h, CLEM_SKU, { creatorCode: 'Pixel-Queen' });
        expect(first.params.metadata).toMatchObject({ creator: 'PIXELQUEEN', sku: CLEM_SKU, pawlegends: '1' });
        expect((first.params.payment_intent_data as any).metadata.creator).toBe('PIXELQUEEN');
        const row = (await h.models.purchases.findOne({ sessionId: first.sessionId }).lean()) as any;
        expect(row).toMatchObject({ status: 'paid', creatorCode: 'PIXELQUEEN' });
        // the next order within 30 days is attributed without typing it again
        h.clock.now = new Date(NOW.getTime() + 29 * DAY);
        const second = await pay(h, SAGE_SKU);
        expect(second.params.metadata?.creator).toBe('PIXELQUEEN');
        // after 30 days the link has lapsed
        h.clock.now = new Date(NOW.getTime() + 31 * DAY);
        const third = await pay(h, 'pl_frame_goldpaw');
        expect(third.params.metadata?.creator).toBeUndefined();
        // a creator taken out of the program stops earning at once
        await h.growth.upsertCreator({ code: 'PIXELQUEEN', name: 'Pixel Queen', active: false });
        expect(await codeOf(h.stripe.createCheckout(request('pl_frame_moonlit', { creatorCode: 'PIXELQUEEN' }) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_CREATOR_UNKNOWN'
        );
        const report = await h.growth.report(NOW, new Date(NOW.getTime() + 60 * DAY));
        expect(report.payouts).toEqual([
            { code: 'PIXELQUEEN', orders: 2, gross: { eur: 598 }, shareBps: 2000, payout: { eur: 119 } },
        ]);
    });
    it('admin input is checked', async () => {
        const h = storeHarness();
        expect(await codeOf(h.growth.upsertCreator({ code: 'ok', name: '' }))).toBe('PAWLEGENDS_INVALID');
        expect(await codeOf(h.growth.upsertCreator({ code: 'GOOD', name: 'A', shareBps: 9000 }))).toBe('PAWLEGENDS_INVALID');
        expect(await h.growth.creator('good')).toBeNull();
    });
});

describe('the first-purchase gift', () => {
    it('offers the 5 coats before the first order and grants the chosen one once', async () => {
        const h = storeHarness();
        expect((await h.growth.giftOffer(ACCOUNT)).coats.map(c => c.id)).toEqual(FIRST_GIFT_COATS);
        // not one of the 5, or a coat this very order contains
        expect(await codeOf(h.stripe.createCheckout(request(SAGE_SKU, { giftCoat: 'coat.sage.store_silver_tabby' }) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_GIFT_UNAVAILABLE'
        );
        expect(await codeOf(h.stripe.createCheckout(request(CLEM_SKU, { giftCoat: 'coat.clem.store_calico' }) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_GIFT_UNAVAILABLE'
        );
        const gift = FIRST_GIFT_COATS[1];
        const { sessionId, params, event } = await pay(h, SAGE_SKU, { giftCoat: gift });
        expect(params.metadata?.gift_coat).toBe(gift);
        const owned = await ownedItemsOf(h.store, ACCOUNT);
        expect(owned).toEqual(expect.arrayContaining([gift, 'coat.sage.store_silver_tabby']));
        // a retried delivery under a new event id grants nothing twice
        const { rawBody, signature } = signedEvent({ ...event, id: `${event.id}_retry` });
        await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        expect((await h.models.owned.find({ accountId: ACCOUNT, item: gift }).lean()).length).toBe(1);
        expect(await h.growth.gifts.countDocuments({ accountId: ACCOUNT })).toBe(1);
        // the offer is gone after the first order, and a later order cannot ask for it
        expect(await h.growth.giftOffer(ACCOUNT)).toEqual({ eligible: false, coats: [] });
        expect(await codeOf(h.stripe.createCheckout(request(CLEM_SKU, { giftCoat: FIRST_GIFT_COATS[2] }) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_GIFT_UNAVAILABLE'
        );
        // granted directly again (a second session): refused
        expect(await h.growth.grantGift(ACCOUNT, FIRST_GIFT_COATS[3], 'cs_other_session')).toBe(false);
        const row = (await h.models.purchases.findOne({ sessionId }).lean()) as any;
        expect(row.giftCoat).toBe(gift);
    });
    it('two first orders paid together give one gift', async () => {
        const h = storeHarness();
        const a = await h.stripe.createCheckout(request(SAGE_SKU, { giftCoat: FIRST_GIFT_COATS[0] }) as any, ON_ENV, ACCOUNT);
        const b = await h.stripe.createCheckout(request('pl_frame_bone', { giftCoat: FIRST_GIFT_COATS[1] }) as any, ON_ENV, ACCOUNT);
        const calls = h.stripeClient.checkout.sessions.create.mock.calls;
        for (const [i, s] of [a, b].entries()) {
            const params = calls[i][0] as Stripe.Checkout.SessionCreateParams;
            const { rawBody, signature } = signedEvent(completedEvent(s.sessionId, params));
            await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        }
        const owned = await ownedItemsOf(h.store, ACCOUNT);
        expect(owned.filter(i => FIRST_GIFT_COATS.includes(i))).toEqual([FIRST_GIFT_COATS[0]]);
    });
    it('a refund of the first order takes the gift back with it', async () => {
        const h = storeHarness();
        const { sessionId } = await pay(h, SAGE_SKU, { giftCoat: FIRST_GIFT_COATS[4] });
        expect(await ownedItemsOf(h.store, ACCOUNT)).toContain(FIRST_GIFT_COATS[4]);
        const refund = {
            id: 'evt_refund_gift',
            type: 'charge.refunded',
            data: { object: { id: 'ch_gift', object: 'charge', refunded: true, payment_intent: `pi_${sessionId}`, metadata: {} } },
        };
        const { rawBody, signature } = signedEvent(refund);
        await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        expect(await ownedItemsOf(h.store, ACCOUNT)).not.toContain(FIRST_GIFT_COATS[4]);
    });
});

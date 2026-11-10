import Stripe from 'stripe';
import { FakeGames, FakeUsers } from 'src/user/heist/fake-live-store.helper-spec';
import { ReplayQueue } from 'src/user/heist/replay-queue';
import { FailedReplayCache } from 'src/user/heist/failed-replay-cache';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import { SIM_VERSION } from 'src/vendor/pawlegends-sim';
import {
    CATALOG_SKUS,
    coatSkuOf,
    PASS_PLUS_SKU,
    PASS_SKU,
    PASS_UPGRADE_SKU,
    S1_PLUS_COAT,
    SEASONS,
    seasonTier,
    seasonXpFor,
    STORE_COATS,
    STORE_TERMS_VERSION,
} from './pawlegends-catalog';
import { PAWLEGENDS_SKUS } from './pawlegends.contracts';
import {
    buildHarness,
    codeOf,
    completedEvent,
    DEVICE,
    Harness,
    NOW,
    ON_ENV,
    signedEvent,
} from './pawlegends-harness.helper-spec';
import {
    canonicalRecord,
    PAWLEGENDS_REPLAY_QUEUE,
    pawlegendsDigest,
    savePawlegendsMatch,
    takedownsOf,
} from './pawlegends-live';
import { addSeasonXp, mergeStoreProgress, ownedItemsOf } from './pawlegends-season.service';

jest.mock('node-fetch', () => jest.fn());

/*
 * Store and Legends Pass (docs/plans/moba/STORE-PASS.md): checkout rules, the webhook grant and refund, season XP
 * through the one score writer, claims and the guest merge. Stripe is the harness fake (no network, test keys only).
 */

const ACCOUNT = 'acct-0000000000000001';
const ACCOUNT2 = 'acct-0000000000000002';
const CLEM = coatSkuOf(STORE_COATS.find(c => c.hero === 'clem')!);
const SAGE = coatSkuOf(STORE_COATS.find(c => c.hero === 'sage')!);
const CATS = 'pl_set_cats_s1';

function storeHarness(): Harness {
    const h = buildHarness();
    h.stripe.sellRetired = false;
    return h;
}

const request = (sku: string, over: Record<string, unknown> = {}) => ({
    sku,
    currency: 'eur' as const,
    email: 'buyer@example.com',
    ageBand: '18+' as const,
    consentVersion: STORE_TERMS_VERSION,
    deviceId: DEVICE,
    ...over,
});

async function pay(h: Harness, sku: string, accountId = ACCOUNT, over: Record<string, unknown> = {}) {
    const { sessionId } = await h.stripe.createCheckout(request(sku, over) as any, ON_ENV, accountId);
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    const params = calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams;
    const event = completedEvent(sessionId, params);
    const { rawBody, signature } = signedEvent(event);
    await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
    return { sessionId, params, event };
}

const refundEvent = (paymentIntent: string, id: string) => ({
    id,
    type: 'charge.refunded',
    data: { object: { id: `ch_${id}`, object: 'charge', refunded: true, payment_intent: paymentIntent, metadata: {} } },
});

describe('store catalogue', () => {
    it('prices match the revenue page and every SKU is once per account', () => {
        expect(PAWLEGENDS_SKUS[CLEM].cents).toEqual({ usd: 299, eur: 299 });
        expect(PAWLEGENDS_SKUS.pl_frame_goldpaw.cents).toEqual({ usd: 199, eur: 199 });
        expect(PAWLEGENDS_SKUS[CATS].cents).toEqual({ usd: 1499, eur: 1499 });
        expect(PAWLEGENDS_SKUS[PASS_SKU].cents.usd).toBe(799);
        expect(PAWLEGENDS_SKUS[PASS_PLUS_SKU].cents.usd).toBe(1999);
        expect(PAWLEGENDS_SKUS[PASS_UPGRADE_SKU].cents.usd).toBe(1200);
        for (const def of CATALOG_SKUS) expect(PAWLEGENDS_SKUS[def.sku].oncePerAccount).toBe(true);
        expect(STORE_COATS).toHaveLength(16);
        // a set costs less than its parts (honest savings)
        const parts = PAWLEGENDS_SKUS[CATS].bundleOf!.reduce((n, s) => n + PAWLEGENDS_SKUS[s].cents.usd, 0);
        expect(parts).toBe(1993);
        // the free Treat Track coats the revenue page named are never sold
        const sold = CATALOG_SKUS.flatMap(d => d.items);
        expect(sold).not.toContain('coat.frankie.corndog');
        expect(sold).not.toContain('coat.bravo.opera');
    });
    it('retires the presale SKUs', async () => {
        const h = storeHarness();
        expect(PAWLEGENDS_SKUS.pl_founder.retired).toBe(true);
        expect(
            await codeOf(
                h.stripe.createCheckout(request('pl_founder', { consentVersion: '2026-10-17' }) as any, ON_ENV, ACCOUNT)
            )
        ).toBe('PAWLEGENDS_RETIRED');
    });
    it('XP math and tiers', () => {
        expect(seasonXpFor({ won: true, forfeit: false, takedowns: 3, firstWinToday: true })).toBe(100 + 30 + 150);
        expect(seasonXpFor({ won: false, forfeit: false, takedowns: 40, firstWinToday: true })).toBe(60 + 150);
        expect(seasonXpFor({ won: false, forfeit: true, takedowns: 5, firstWinToday: false })).toBe(20);
        const s1 = SEASONS[0];
        expect(seasonTier(s1, 399)).toBe(0);
        expect(seasonTier(s1, 800, 15)).toBe(17);
        expect(seasonTier(s1, 99999, 15)).toBe(30);
        expect(s1.free).toHaveLength(10);
        expect(s1.premium).toHaveLength(30);
        expect(takedownsOf([{ slot: 0, kills: 2, assists: 3 }], 0)).toBe(5);
        expect(takedownsOf(undefined, 0)).toBe(0);
    });
});

describe('store checkout', () => {
    it('needs a signed-in account and the store consent', async () => {
        const h = storeHarness();
        expect(await codeOf(h.stripe.createCheckout(request(CLEM) as any, ON_ENV, null))).toBe('PAWLEGENDS_SIGN_IN');
        expect(
            await codeOf(
                h.stripe.createCheckout(request(CLEM, { consentVersion: '2026-10-17' }) as any, ON_ENV, ACCOUNT)
            )
        ).toBe('PAWLEGENDS_INVALID');
    });
    it('grants a coat once, by account; a second checkout is refused; another account may buy it', async () => {
        const h = storeHarness();
        const { params } = await pay(h, CLEM);
        expect(params.metadata).toMatchObject({ account: ACCOUNT, terms_version: STORE_TERMS_VERSION });
        expect(await ownedItemsOf(h.store, ACCOUNT)).toEqual(['coat.clem.store_calico']);
        expect(await codeOf(h.stripe.createCheckout(request(CLEM) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
        // same email and device, another account: once per account, not per device
        await pay(h, CLEM, ACCOUNT2);
        expect(await ownedItemsOf(h.store, ACCOUNT2)).toEqual(['coat.clem.store_calico']);
    });
    it('refuses a set while one of its items is owned (singles are sold instead)', async () => {
        const h = storeHarness();
        await pay(h, SAGE);
        expect(await codeOf(h.stripe.createCheckout(request(CATS) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
        // a set bought first blocks its singles
        await pay(h, 'pl_set_dogs_s1', ACCOUNT2);
        expect((await ownedItemsOf(h.store, ACCOUNT2)).length).toBe(8);
        expect(await codeOf(h.stripe.createCheckout(request('pl_frame_bone') as any, ON_ENV, ACCOUNT2))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
    });
    it('two racing checkouts of the same coat: one hold survives', async () => {
        const h = storeHarness();
        const results = await Promise.allSettled([
            h.stripe.createCheckout(request(CLEM) as any, ON_ENV, ACCOUNT),
            h.stripe.createCheckout(request(CLEM) as any, ON_ENV, ACCOUNT),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('the Pass+ upgrade needs the Pass; Pass+ is refused to Pass owners', async () => {
        const h = storeHarness();
        expect(await codeOf(h.stripe.createCheckout(request(PASS_UPGRADE_SKU) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_NEEDS_PASS'
        );
        await pay(h, PASS_SKU);
        expect(await codeOf(h.stripe.createCheckout(request(PASS_PLUS_SKU) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
        await pay(h, PASS_UPGRADE_SKU);
        const me = await h.season.me(ACCOUNT);
        expect(me.season).toMatchObject({ premium: 'plus', skips: 15, tier: 15 });
        expect(me.items).toContain(S1_PLUS_COAT);
    });
});

describe('webhook grant and refund', () => {
    it('a replayed completion grants once', async () => {
        const h = storeHarness();
        const { event } = await pay(h, CLEM);
        const again = { ...event, id: `${event.id}_replay` };
        const { rawBody, signature } = signedEvent(again);
        expect(await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV)).toBe('processed');
        expect(await h.models.owned.countDocuments({ accountId: ACCOUNT })).toBe(1);
    });
    it('a refund revokes the items and downgrades the pass (claimed premium rewards too)', async () => {
        const h = storeHarness();
        const coat = await pay(h, CLEM);
        const pass = await pay(h, PASS_SKU);
        await addSeasonXp(h.store, ACCOUNT, { won: true, forfeit: false, takedowns: 15 }, NOW);
        const claim = await h.season.claim(ACCOUNT, { row: 'p', tier: 1 });
        expect(claim.items).toEqual(['coat.meatball.s1_caramel']);
        for (const [pi, id] of [
            [`pi_${coat.sessionId}`, 'evt_refund_coat'],
            [`pi_${pass.sessionId}`, 'evt_refund_pass'],
        ]) {
            const { rawBody, signature } = signedEvent(refundEvent(pi, id));
            await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        }
        expect(await ownedItemsOf(h.store, ACCOUNT)).toEqual([]);
        const me = await h.season.me(ACCOUNT);
        expect(me.season.premium).toBe('none');
        expect(me.season.claimed).toEqual([]);
    });
    it('a refund whose revoke failed half way is finished by the retried event', async () => {
        const h = storeHarness();
        const coat = await pay(h, CLEM);
        // The first delivery flipped the row and crashed before the revoke (its event id was not recorded).
        await h.models.purchases.updateMany({ sessionId: coat.sessionId }, { $set: { status: 'refunded' } });
        expect(await ownedItemsOf(h.store, ACCOUNT)).not.toEqual([]);
        const { rawBody, signature } = signedEvent(refundEvent(`pi_${coat.sessionId}`, 'evt_refund_retry'));
        expect(await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV)).toBe('processed');
        expect(await ownedItemsOf(h.store, ACCOUNT)).toEqual([]);
    });
    it('refunding the Pass+ upgrade takes back the rewards only its skips reached', async () => {
        const h = storeHarness();
        await pay(h, PASS_SKU);
        const upgrade = await pay(h, PASS_UPGRADE_SKU);
        // 0 XP, tier 15 from the skips: claim every reached reward on both rows.
        const all = await h.season.claim(ACCOUNT, { all: true });
        expect(all.me.season.claimed.length).toBeGreaterThan(15);
        const { rawBody, signature } = signedEvent(refundEvent(`pi_${upgrade.sessionId}`, 'evt_refund_upgrade'));
        await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        const me = await h.season.me(ACCOUNT);
        expect(me.season).toMatchObject({ premium: 'pass', skips: 0, tier: 0, claimed: [] });
        expect(me.items).toEqual([]);
    });
    it('a lost chargeback revokes like a refund; a won one changes nothing', async () => {
        const h = storeHarness();
        const coat = await pay(h, CLEM);
        const pass = await pay(h, PASS_SKU);
        const dispute = (pi: string, id: string, status: string) => ({
            id,
            type: 'charge.dispute.closed',
            data: { object: { id: `dp_${id}`, object: 'dispute', status, payment_intent: pi, metadata: {} } },
        });
        for (const ev of [dispute(`pi_${coat.sessionId}`, 'evt_dp_won', 'won')]) {
            const { rawBody, signature } = signedEvent(ev);
            expect(await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV)).toBe('ignored');
        }
        expect((await ownedItemsOf(h.store, ACCOUNT)).length).toBeGreaterThan(0);
        for (const ev of [
            dispute(`pi_${coat.sessionId}`, 'evt_dp_coat', 'lost'),
            dispute(`pi_${pass.sessionId}`, 'evt_dp_pass', 'lost'),
        ]) {
            const { rawBody, signature } = signedEvent(ev);
            expect(await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV)).toBe('processed');
        }
        expect(await ownedItemsOf(h.store, ACCOUNT)).toEqual([]);
        expect((await h.season.me(ACCOUNT)).season.premium).toBe('none');
        expect(await h.models.purchases.findOne({ sessionId: coat.sessionId }).lean()).toMatchObject({
            status: 'refunded',
            disputeId: 'dp_evt_dp_coat',
        });
    });
});

describe('Legends Pass claims', () => {
    it('free row for anyone, premium row only with the pass; late buyers get every reached premium tier', async () => {
        const h = storeHarness();
        for (let i = 0; i < 4; i++)
            await addSeasonXp(h.store, ACCOUNT, { won: false, forfeit: false, takedowns: 15 }, NOW);
        // 4 losses × (60 + 150 takedown XP) = 840 XP → tier 2: no free reward yet (every third tier)
        expect((await h.season.me(ACCOUNT)).season.tier).toBe(2);
        expect(await codeOf(h.season.claim(ACCOUNT, { row: 'f', tier: 3 }))).toBe('PAWLEGENDS_TIER_LOCKED');
        expect(await codeOf(h.season.claim(ACCOUNT, { row: 'p', tier: 1 }))).toBe('PAWLEGENDS_NEEDS_PASS');
        for (let i = 0; i < 2; i++)
            await addSeasonXp(h.store, ACCOUNT, { won: false, forfeit: false, takedowns: 15 }, NOW);
        expect((await h.season.claim(ACCOUNT, { row: 'f', tier: 3 })).items).toEqual(['coat.clem.s1_honey_tabby']);
        // idempotent
        expect((await h.season.claim(ACCOUNT, { row: 'f', tier: 3 })).items).toEqual([]);
        await pay(h, PASS_SKU);
        const all = await h.season.claim(ACCOUNT, { all: true });
        expect(all.items).toEqual(['coat.meatball.s1_caramel', 'coat.cacklejaw.s1_embers', 'coat.duchess.s1_lavender']);
        expect(all.me.season.claimable).toBe(0);
    });
    it('first win of the UTC day pays once even when two wins save together', async () => {
        const h = storeHarness();
        const [a, b] = await Promise.all([
            addSeasonXp(h.store, ACCOUNT, { won: true, forfeit: false, takedowns: 0 }, NOW),
            addSeasonXp(h.store, ACCOUNT, { won: true, forfeit: false, takedowns: 0 }, NOW),
        ]);
        expect([a!.gained, b!.gained].sort()).toEqual([100, 250]);
        const next = await addSeasonXp(
            h.store,
            ACCOUNT,
            { won: true, forfeit: false, takedowns: 0 },
            new Date(NOW.getTime() + 86400_000)
        );
        expect(next!.gained).toBe(250);
        const capped = await addSeasonXp(
            h.store,
            ACCOUNT,
            { won: true, forfeit: false, takedowns: 0, capped: true },
            NOW
        );
        expect(capped!.gained).toBe(0);
    });
    it('solo saves pay XP 30 times a UTC day, and not faster than the matches last', async () => {
        const h = storeHarness();
        const match = { won: false, forfeit: false, takedowns: 0, soloMs: 600_000 };
        const day = Date.UTC(2026, 10, 12);
        const paid: number[] = [];
        for (let i = 0; i < 31; i++) {
            const gain = await addSeasonXp(h.store, ACCOUNT, match, new Date(day + i * 600_000));
            paid.push(gain!.gained);
        }
        expect(paid.filter(g => g > 0)).toHaveLength(30);
        expect(paid[30]).toBe(0);
        // A new UTC day resets the counter.
        expect((await addSeasonXp(h.store, ACCOUNT, match, new Date(day + 86400_000)))!.gained).toBe(60);
        // Two saves closer together than 80% of the match length: the second pays nothing.
        const h2 = storeHarness();
        const a = await addSeasonXp(h2.store, ACCOUNT, match, new Date(day));
        const b = await addSeasonXp(h2.store, ACCOUNT, match, new Date(day + 60_000));
        const c = await addSeasonXp(h2.store, ACCOUNT, match, new Date(day + 480_000));
        expect([a!.gained, b!.gained, c!.gained]).toEqual([60, 0, 60]);
    });
});

describe('season XP through the one score writer', () => {
    it('a solo save pays XP once; the duplicate pays none', async () => {
        const h = storeHarness();
        const users = new FakeUsers();
        const games = new FakeGames();
        const userId = users.add({});
        const record = {
            v: 1,
            simVersion: SIM_VERSION,
            seed: 7,
            difficulty: 'easy',
            hero: 'clem',
            trick: 'pounce',
            ticks: 14_000,
            inputs: 'AQIDBA==',
            outcome: 'won',
            finalHash: '0badc0de',
        } as any;
        const deps = {
            users,
            games,
            verify: async () => ({
                ok: true as const,
                outcome: 'won' as const,
                finalHash: '0badc0de',
                ticks: 14_000,
                stats: [{ slot: 0, kills: 4, assists: 2 } as any],
            }),
            queue: new ReplayQueue(PAWLEGENDS_REPLAY_QUEUE),
            failures: new FailedReplayCache({ maxEntries: 10, ttlMs: 60_000 }),
            now: () => NOW,
            season: h.season,
        };
        const first = await savePawlegendsMatch(deps as any, userId, { pawlegends: record });
        expect(first.season).toMatchObject({ gained: 100 + 60 + 150, xp: 310 });
        expect(await codeOf(savePawlegendsMatch(deps as any, userId, { pawlegends: record }))).toBe(
            'PAWLEGENDS_DUPLICATE'
        );
        expect((await h.season.me(userId)).season.xp).toBe(310);
        expect(pawlegendsDigest(record)).toBeTruthy();
    });
});

describe('cosmetics never reach the replay', () => {
    it('a look, frame or title in a posted record is not in the canonical record or its digest', () => {
        const base = {
            v: 1,
            simVersion: SIM_VERSION,
            seed: 7,
            difficulty: 'easy',
            hero: 'clem',
            trick: 'pounce',
            ticks: 100,
            inputs: 'AA==',
            outcome: 'won',
            finalHash: 'ab',
        } as any;
        const dressed = { ...base, look: { coat: 'coat.clem.store_calico' }, cosmetics: { frame: 'frame.store.bone' } };
        expect(Object.keys(canonicalRecord(dressed))).not.toEqual(expect.arrayContaining(['look']));
        expect(Object.keys(canonicalRecord(dressed))).not.toContain('cosmetics');
        expect(pawlegendsDigest(dressed)).toBe(pawlegendsDigest(base));
    });
});

describe('guest merge', () => {
    it('moves pass progress and rewards to the account, idempotently', async () => {
        const now = () => NOW;
        const owned = new MemoryModel([], [{ fields: ['accountId', 'item'] }], now);
        const seasons = new MemoryModel([], [{ fields: ['_id'] }], now);
        const models = { owned, seasons } as any;
        await addSeasonXp(models, 'guest', { won: true, forfeit: false, takedowns: 0 }, NOW);
        await owned.create({ accountId: 'guest', item: 'coat.clem.s1_honey_tabby', source: 'pass', claim: 's1:f:3' });
        await seasons.updateOne({ _id: 'guest:s1' }, { $addToSet: { claimed: 'f:3' } });
        await mergeStoreProgress(models, 'guest', 'account');
        await mergeStoreProgress(models, 'guest', 'account');
        expect(await ownedItemsOf(models, 'account')).toEqual(['coat.clem.s1_honey_tabby']);
        const row = (await seasons.findOne({ _id: 'account:s1' }).lean()) as any;
        expect(row).toMatchObject({ xp: 250, claimed: ['f:3'] });
        expect(await seasons.findOne({ _id: 'guest:s1' }).lean()).toBeNull();
    });
});

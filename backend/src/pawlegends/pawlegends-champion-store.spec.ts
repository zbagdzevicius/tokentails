import Stripe from 'stripe';
import { MemoryModel } from 'src/user/guest/memory-model.helper-spec';
import {
    allowedChampions,
    CATALOG_SKUS,
    CHAMP_BUNDLE_SKUS,
    championBundleCents,
    CHAMPION_IDS,
    CHAMPIONS,
    champItem,
    champSkuOf,
    FOUNDERS_BADGE,
    isFreeChampion,
    ROTATION_CATS,
    ROTATION_DOGS,
    ROTATION_EPOCH,
    rotationOf,
    rotationWeek,
    STARTERS,
    STORE_TERMS_VERSION,
    TIER_PRICE,
    WEEK_MS,
    YARN,
    yarnFor,
} from './pawlegends-catalog';
import { PAWLEGENDS_SKUS } from './pawlegends.contracts';
import {
    addYarn,
    championReleaseAt,
    ensureFounders,
    grantFoundersRoster,
    isoWeek,
    ownedChampions,
    RELEASE_ID,
    unlockChampion,
} from './pawlegends-champion-store';
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
import { grantItems, mergeStoreProgress, ownedItemsOf, revokeSession } from './pawlegends-season.service';
import { PartyService, type Member, type Party, type PartyRules } from './party/party.service';

jest.mock('node-fetch', () => jest.fn());

/*
 * Champion store (docs/plans/moba/CHAMPION-STORE.md): starters, the weekly rotation, Yarn, unlocks, the Founders
 * roster, the web purchase with its prorated bundles, and the party pick's server check.
 */

const ACCOUNT = 'acct-0000000000000001';
const ACCOUNT2 = 'acct-0000000000000002';
const AFTER_EPOCH = Date.parse(ROTATION_EPOCH) + 2 * 24 * 3600_000;

/** The harness with the champion store's models (the older specs build it without them). */
function champHarness(): Harness {
    const h = buildHarness();
    const now = () => new Date(h.clock.now.getTime());
    const models = h.models as Record<string, unknown>;
    models.yarn = new MemoryModel([], [{ fields: ['_id'] }], now);
    models.yarnLog = new MemoryModel([], [{ fields: ['accountId', 'ref'] }], now);
    h.stripe.sellRetired = false;
    return h;
}
const store = (h: Harness) => h.store as any;

const request = (sku: string, over: Record<string, unknown> = {}) => ({
    sku,
    currency: 'eur' as const,
    email: 'buyer@example.com',
    ageBand: '18+' as const,
    consentVersion: STORE_TERMS_VERSION,
    consent: true,
    deviceId: DEVICE,
    ...over,
});

async function pay(h: Harness, sku: string, accountId = ACCOUNT) {
    const { sessionId } = await h.stripe.createCheckout(request(sku) as any, ON_ENV, accountId);
    const calls = h.stripeClient.checkout.sessions.create.mock.calls;
    const params = calls[calls.length - 1][0] as Stripe.Checkout.SessionCreateParams;
    const event = completedEvent(sessionId, params);
    const { rawBody, signature } = signedEvent(event);
    await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
    return { sessionId, params, event };
}

const heroesOf = async (h: Harness, account = ACCOUNT) => (await ownedChampions(store(h), account)).map(o => o.hero);

describe('starters and the rotation', () => {
    it('one starter per role, 3 cats and 3 dogs, Clem among them (the guided first match)', () => {
        const starters = CHAMPIONS.filter(c => STARTERS.includes(c.hero));
        expect(starters).toHaveLength(6);
        for (const side of ['cat', 'dog'] as const) {
            const mine = starters.filter(c => c.side === side);
            expect(mine).toHaveLength(3);
        }
        expect(new Set(starters.map(c => c.role)).size).toBe(6);
        expect(STARTERS).toContain('clem');
        expect(CHAMPION_IDS).toHaveLength(20);
    });

    it('every week: 3 cats and 3 dogs, no role twice per species, never a starter', () => {
        for (let w = -14; w < 28; w++) {
            const r = rotationOf(w);
            const defs = r.map(h => CHAMPIONS.find(c => c.hero === h)!);
            expect(defs.filter(d => d.side === 'cat')).toHaveLength(3);
            expect(defs.filter(d => d.side === 'dog')).toHaveLength(3);
            for (const side of ['cat', 'dog'] as const) {
                const roles = defs.filter(d => d.side === side).map(d => d.role);
                expect(new Set(roles).size).toBe(3);
            }
            for (const h of r) expect(STARTERS).not.toContain(h);
        }
    });

    it('every non-starter is free 3 weeks in 7 and never waits more than 2 weeks', () => {
        const cycle = [...ROTATION_CATS, ...ROTATION_DOGS];
        expect(new Set(cycle).size).toBe(14);
        for (const h of cycle) {
            const free = [0, 1, 2, 3, 4, 5, 6].filter(w => rotationOf(w).includes(h));
            expect(free).toHaveLength(3);
            let gap = 0;
            let worst = 0;
            for (let w = 0; w < 21; w++) {
                gap = rotationOf(w).includes(h) ? 0 : gap + 1;
                worst = Math.max(worst, gap);
            }
            expect(worst).toBeLessThanOrEqual(2);
        }
    });

    it('the starters cover all 6 roles; each side has 6 open heroes over 4+ roles every week (5v5 fits)', () => {
        expect(new Set(CHAMPIONS.filter(c => STARTERS.includes(c.hero)).map(c => c.role)).size).toBe(6);
        for (let w = 0; w < 7; w++) {
            const open = allowedChampions([], w).map(h => CHAMPIONS.find(c => c.hero === h)!);
            for (const side of ['cat', 'dog'] as const) {
                const mine = open.filter(c => c.side === side);
                expect(mine).toHaveLength(6);
                expect(new Set(mine.map(c => c.role)).size).toBeGreaterThanOrEqual(4);
            }
        }
    });

    it('matches the design table for week 0 and weeks start on Monday 00:00 UTC', () => {
        expect(rotationOf(0)).toEqual(['meatball', 'pixel', 'aviete', 'domino', 'cacklejaw', 'rocket']);
        expect(rotationOf(6)).toEqual(['lambo', 'stilts', 'bengas', 'howler', 'chili', 'nugget']);
        expect(new Date(ROTATION_EPOCH).getUTCDay()).toBe(1);
        expect(rotationWeek(Date.parse(ROTATION_EPOCH))).toBe(0);
        expect(rotationWeek(Date.parse(ROTATION_EPOCH) - 1)).toBe(-1);
        expect(rotationWeek(Date.parse(ROTATION_EPOCH) + WEEK_MS)).toBe(1);
        expect(isFreeChampion('clem', 0)).toBe(true);
        expect(isFreeChampion('meatball', 0)).toBe(true);
        expect(isFreeChampion('howler', 0)).toBe(false);
    });
});

describe('catalogue', () => {
    it('14 singles by tier, 3 bundles cheaper than their singles, every SKU once per account', () => {
        const singles = CATALOG_SKUS.filter(s => s.kind === 'champion' && !s.bundleOf);
        expect(singles).toHaveLength(14);
        expect(PAWLEGENDS_SKUS[champSkuOf('meatball')].cents.usd).toBe(TIER_PRICE.t1.cents.usd);
        expect(PAWLEGENDS_SKUS[champSkuOf('pixel')].cents.usd).toBe(399);
        expect(PAWLEGENDS_SKUS[champSkuOf('aviete')].cents.usd).toBe(499);
        for (const h of STARTERS) expect(PAWLEGENDS_SKUS[champSkuOf(h)]).toBeUndefined();
        const sum = (sku: string) =>
            PAWLEGENDS_SKUS[sku].bundleOf!.reduce((n, s) => n + PAWLEGENDS_SKUS[s].cents.usd, 0);
        expect(sum('pl_champs_cats_s1')).toBe(2893);
        expect(sum('pl_champs_dogs_s1')).toBe(2893);
        expect(sum('pl_champs_all_s1')).toBe(5786);
        expect(PAWLEGENDS_SKUS.pl_champs_all_s1.cents.usd).toBe(2999);
        for (const sku of CHAMP_BUNDLE_SKUS) expect(PAWLEGENDS_SKUS[sku].oncePerAccount).toBe(true);
    });

    it('prorates a bundle over owned champions, rounded down to .99, never above the singles left', () => {
        const cats = CATALOG_SKUS.find(s => s.sku === 'pl_champs_cats_s1')!;
        expect(championBundleCents(cats, new Set(), 'usd')).toBe(1699);
        // Meatball owned: 1699 × 2594 / 2893 = 1523 → 1499
        expect(championBundleCents(cats, new Set([champItem('meatball')]), 'usd')).toBe(1499);
        const all = new Set(cats.items);
        expect(championBundleCents(cats, all, 'usd')).toBeNull();
        // one left: the bundle never costs more than that single
        const oneLeft = new Set(cats.items.filter(i => i !== champItem('aviete')));
        expect(championBundleCents(cats, oneLeft, 'usd')).toBeLessThanOrEqual(499);
    });

    it('Yarn per match', () => {
        expect(yarnFor({ won: true, forfeit: false, takedowns: 3, firstWinToday: true })).toBe(100 + 6 + 150);
        expect(yarnFor({ won: false, forfeit: false, takedowns: 99, firstWinToday: false })).toBe(60 + 20);
        expect(yarnFor({ won: false, forfeit: true, takedowns: 5, firstWinToday: false })).toBe(YARN.forfeit);
        expect(isoWeek(new Date('2026-11-16T00:00:00Z'))).toBe('2026-W47');
        expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    });
});

describe('Yarn and unlocks', () => {
    it('pays once per save ref, counts milestones and the weekly chest', async () => {
        const h = champHarness();
        const m = (ref: string) => ({ ref, won: false, forfeit: false, takedowns: 0, firstWinToday: false });
        const first = await addYarn(store(h), ACCOUNT, m('g1'), NOW);
        expect(first).toMatchObject({ gained: 60, balance: 60, matches: 1, newPicks: 0 });
        expect(await addYarn(store(h), ACCOUNT, m('g1'), NOW)).toBeNull();
        for (let i = 2; i <= 5; i++) await addYarn(store(h), ACCOUNT, m(`g${i}`), NOW);
        const row = await store(h).yarn.findOne({ _id: ACCOUNT }).lean();
        expect(row).toMatchObject({ matches: 5, picks: 1, picksLeft: 1, balance: 300 });
        for (let i = 6; i <= 9; i++) await addYarn(store(h), ACCOUNT, m(`g${i}`), NOW);
        const tenth = await addYarn(store(h), ACCOUNT, m('g10'), NOW);
        expect(tenth).toMatchObject({ chest: YARN.weeklyChest, gained: 60 + YARN.weeklyChest });
        const eleventh = await addYarn(store(h), ACCOUNT, m('g11'), NOW);
        expect(eleventh?.chest).toBe(0);
    });

    it('unlocks with Yarn atomically and idempotently; refuses starters, owned and short balances', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { balance: 5000 } }, { upsert: true });
        expect(await codeOf(unlockChampion(store(h), ACCOUNT, { hero: 'clem' }))).toBe('PAWLEGENDS_INVALID');
        expect(await codeOf(unlockChampion(store(h), ACCOUNT, { hero: 'nobody' }))).toBe('PAWLEGENDS_INVALID');
        // two taps at once on a 3,500 champion: one spend, one owned row
        const [a, b] = await Promise.all([
            unlockChampion(store(h), ACCOUNT, { hero: 'pixel', requestId: 'req-aaaaaaaa' }),
            unlockChampion(store(h), ACCOUNT, { hero: 'pixel', requestId: 'req-bbbbbbbb' }),
        ]);
        expect([a.unlocked, b.unlocked]).toContain(true);
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(1500);
        expect(await heroesOf(h)).toEqual(['pixel']);
        // a retry answers the same; nothing is spent again
        expect((await unlockChampion(store(h), ACCOUNT, { hero: 'pixel' })).unlocked).toBe(true);
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(1500);
        // 4,800 with 1,500 left: refused, nothing spent, the claim is released
        expect(await codeOf(unlockChampion(store(h), ACCOUNT, { hero: 'aviete' }))).toBe('PAWLEGENDS_NOT_ENOUGH_YARN');
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(1500);
        expect(await store(h).yarnLog.findOne({ accountId: ACCOUNT, ref: 'unlock:aviete' }).lean()).toBeNull();
    });

    it('two different champions racing for one balance never go below zero', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { balance: 3500 } }, { upsert: true });
        const results = await Promise.allSettled([
            unlockChampion(store(h), ACCOUNT, { hero: 'pixel' }),
            unlockChampion(store(h), ACCOUNT, { hero: 'duchess' }),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(0);
        expect(await heroesOf(h)).toHaveLength(1);
    });

    it('a Champion Pick unlocks Tier 1 or 2 only, once per pick', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { picksLeft: 1, picks: 1 } }, { upsert: true });
        expect(await codeOf(unlockChampion(store(h), ACCOUNT, { hero: 'aviete', via: 'pick' }))).toBe(
            'PAWLEGENDS_INVALID'
        );
        expect((await unlockChampion(store(h), ACCOUNT, { hero: 'bravo', via: 'pick' })).via).toBe('pick');
        expect(await codeOf(unlockChampion(store(h), ACCOUNT, { hero: 'nugget', via: 'pick' }))).toBe(
            'PAWLEGENDS_NO_PICK'
        );
        const owned = await ownedChampions(store(h), ACCOUNT);
        expect(owned).toEqual([{ hero: 'bravo', source: 'milestone' }]);
    });

    it('a grant that failed after the spend is finished by the next call, never spent again', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { balance: 4000 } }, { upsert: true });
        const owned = store(h).owned;
        const real = owned.updateOne.bind(owned);
        owned.updateOne = jest.fn().mockRejectedValueOnce(new Error('connection reset'));
        await expect(unlockChampion(store(h), ACCOUNT, { hero: 'pixel' })).rejects.toThrow('connection reset');
        owned.updateOne = real;
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(500);
        expect(await heroesOf(h)).toEqual([]);
        expect((await unlockChampion(store(h), ACCOUNT, { hero: 'pixel' })).unlocked).toBe(true);
        expect(await heroesOf(h)).toEqual(['pixel']);
        expect((await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).balance).toBe(500);
    });

    it('the guest merge adds the guest Yarn and picks once and runs the Founders check again', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne(
            { _id: ACCOUNT },
            { $set: { balance: 700, earned: 900, matches: 6, picks: 1, picksLeft: 1, unlocked: ['meatball'] } },
            { upsert: true }
        );
        await store(h).yarn.updateOne(
            { _id: ACCOUNT2 },
            { $set: { balance: 100, earned: 100, matches: 1, picks: 0, picksLeft: 0, foundersChecked: true } },
            { upsert: true }
        );
        await grantItems(store(h), ACCOUNT2, [champItem('meatball')], 'purchase', { sessionId: 'cs_t' });
        await grantItems(store(h), ACCOUNT, [champItem('meatball')], 'yarn');
        await mergeStoreProgress(store(h), ACCOUNT, ACCOUNT2);
        await mergeStoreProgress(store(h), ACCOUNT, ACCOUNT2);
        const row = await store(h).yarn.findOne({ _id: ACCOUNT2 }).lean();
        expect(row).toMatchObject({ balance: 800, earned: 1000, matches: 7, picks: 1, picksLeft: 1 });
        expect(row.unlocked).toEqual(['meatball']);
        expect(row.foundersChecked).toBeUndefined();
        expect(await store(h).yarn.findOne({ _id: ACCOUNT }).lean()).toBeNull();
        // the guest's Yarn unlock is free: the account's purchase refund never takes it
        await revokeSession(store(h), 'cs_t', NOW);
        expect(await heroesOf(h, ACCOUNT2)).toEqual(['meatball']);
        // the guest's pre-release matches moved to the account: the next check grants the roster
        h.season.foundersEvidence = async id => id === ACCOUNT2;
        await championReleaseAt(store(h), NOW);
        expect((await h.season.champions(ACCOUNT2)).founders).toBe(true);
    });
});

describe('the score hook', () => {
    it('/live: a solo save on a locked hero pays no XP and no Yarn; a starter or owned hero pays both', async () => {
        const h = champHarness();
        h.clock.now = new Date(AFTER_EPOCH);
        const locked = await h.season.addXp(ACCOUNT, {
            won: true,
            forfeit: false,
            takedowns: 2,
            soloMs: 600_000,
            ref: 'd1',
            hero: 'howler',
        });
        expect(locked).toMatchObject({ gained: 0, heroLocked: true });
        expect(await store(h).yarnLog.find({ accountId: ACCOUNT }).lean()).toHaveLength(0);
        const starter = await h.season.addXp(ACCOUNT, {
            won: true,
            forfeit: false,
            takedowns: 2,
            soloMs: 600_000,
            ref: 'd2',
            hero: 'clem',
        });
        expect(starter?.gained).toBeGreaterThan(0);
        expect(starter?.yarn).toMatchObject({ gained: 100 + 4 + 150 });
        // the week's rotation counts from the match's start (Meatball is free in week 0)
        h.clock.now = new Date(AFTER_EPOCH + 3600_000);
        const free = await h.season.addXp(ACCOUNT, {
            won: false,
            forfeit: false,
            takedowns: 0,
            soloMs: 600_000,
            ref: 'd3',
            hero: 'meatball',
        });
        expect(free?.heroLocked).toBeUndefined();
        // a duplicate ref pays no Yarn twice
        const again = await h.season.addXp(ACCOUNT, {
            won: false,
            forfeit: false,
            takedowns: 0,
            ref: 'd3',
            capped: true,
        });
        expect(again?.yarn).toBeUndefined();
    });

    it('a capped party save pays no Yarn', async () => {
        const h = champHarness();
        const r = await h.season.addXp(ACCOUNT, {
            won: true,
            forfeit: false,
            takedowns: 0,
            capped: true,
            ref: 'room:1',
        });
        expect(r?.gained).toBe(0);
        expect(r?.yarn).toBeUndefined();
    });
});

describe('Founders roster', () => {
    it('grants all 20 and the badge to an account with a match before T, once; never after T', async () => {
        const h = champHarness();
        const played = new Map<string, Date>([[ACCOUNT, new Date(NOW.getTime() - 86_400_000)]]);
        const evidence = jest.fn(async (id: string, before: Date) => !!played.get(id) && played.get(id)! < before);
        h.season.foundersEvidence = evidence;
        const t = await championReleaseAt(store(h), NOW);
        expect(t.getTime()).toBe(NOW.getTime());
        // a later call keeps the first T
        expect((await championReleaseAt(store(h), new Date(NOW.getTime() + 999))).getTime()).toBe(NOW.getTime());
        expect((await h.season.champions(ACCOUNT)).founders).toBe(true);
        expect(await heroesOf(h)).toHaveLength(20);
        expect(await ownedItemsOf(store(h), ACCOUNT)).toContain(FOUNDERS_BADGE);
        await h.season.champions(ACCOUNT);
        expect(evidence).toHaveBeenCalledTimes(1);
        // a new player (first match after T) gets starters and the rotation only
        played.set(ACCOUNT2, new Date(NOW.getTime() + 60_000));
        expect((await h.season.champions(ACCOUNT2)).founders).toBe(false);
        expect(await heroesOf(h, ACCOUNT2)).toEqual([]);
        expect(await store(h).yarn.findOne({ _id: RELEASE_ID }).lean()).toBeTruthy();
    });

    it('is idempotent, takes over a bought row and restores a revoked one; the guest merge carries it', async () => {
        const h = champHarness();
        await grantItems(store(h), ACCOUNT, [champItem('pixel')], 'purchase', { sessionId: 'cs_1' });
        await grantItems(store(h), ACCOUNT, [champItem('aviete')], 'purchase', { sessionId: 'cs_2' });
        await store(h).owned.updateOne({ accountId: ACCOUNT, item: champItem('aviete') }, { $set: { revokedAt: NOW } });
        await grantFoundersRoster(store(h), ACCOUNT);
        await grantFoundersRoster(store(h), ACCOUNT);
        const owned = await ownedChampions(store(h), ACCOUNT);
        expect(owned).toHaveLength(20);
        // GDD §8.1 #7: the roster is free, so a refund of the earlier purchase never takes it away
        expect(owned.find(o => o.hero === 'pixel')?.source).toBe('founders');
        expect(owned.find(o => o.hero === 'aviete')?.source).toBe('founders');
        expect(await store(h).owned.find({ accountId: ACCOUNT }).lean()).toHaveLength(21);
        await revokeSession(store(h), 'cs_1', NOW);
        expect(await heroesOf(h)).toContain('pixel');
        await mergeStoreProgress(store(h), ACCOUNT, ACCOUNT2);
        expect(await heroesOf(h, ACCOUNT2)).toHaveLength(20);
        expect(await ownedItemsOf(store(h), ACCOUNT2)).toContain(FOUNDERS_BADGE);
    });

    it('without evidence wired, nothing is granted (local-only players)', async () => {
        const h = champHarness();
        expect(await ensureFounders(store(h), ACCOUNT, undefined, NOW)).toBe(false);
        expect(await heroesOf(h)).toEqual([]);
    });
});

describe('web purchase', () => {
    it('grants a champion, refuses it again, and a refund takes it back', async () => {
        const h = champHarness();
        const { event } = await pay(h, champSkuOf('pixel'));
        expect(await heroesOf(h)).toEqual(['pixel']);
        expect(await codeOf(h.stripe.createCheckout(request(champSkuOf('pixel')) as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
        const pi = (event.data.object as any).payment_intent;
        const refund = {
            id: 'evt_refund_champ',
            type: 'charge.refunded',
            data: { object: { id: 'ch_x', object: 'charge', refunded: true, payment_intent: pi, metadata: {} } },
        };
        const { rawBody, signature } = signedEvent(refund as any);
        await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        expect(await heroesOf(h)).toEqual([]);
    });

    it('a bundle over a Yarn unlock charges the prorated price and never takes over the earned row', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { balance: 2500 } }, { upsert: true });
        await unlockChampion(store(h), ACCOUNT, { hero: 'meatball' });
        const { params, event } = await pay(h, 'pl_champs_cats_s1');
        expect(params.line_items![0].price_data!.unit_amount).toBe(1499);
        const owned = await ownedChampions(store(h), ACCOUNT);
        expect(
            owned.filter(o => ['meatball', 'pixel', 'aviete', 'duchess', 'lambo', 'stilts', 'bengas'].includes(o.hero))
        ).toHaveLength(7);
        expect(owned.find(o => o.hero === 'meatball')?.source).toBe('yarn');
        // the refund takes back the 6 bought ones, never the Yarn unlock
        const pi = (event.data.object as any).payment_intent;
        const refund = {
            id: 'evt_refund_bundle',
            type: 'charge.refunded',
            data: { object: { id: 'ch_y', object: 'charge', refunded: true, payment_intent: pi, metadata: {} } },
        };
        const { rawBody, signature } = signedEvent(refund as any);
        await h.webhooks.handle(h.webhooks.verify(rawBody, signature, ON_ENV), ON_ENV);
        expect(await heroesOf(h)).toEqual(['meatball']);
        // the /me view shows the prorated price
        const view = await h.season.champions(ACCOUNT);
        expect(view.bundles.find(b => b.sku === 'pl_champs_cats_s1')?.cents).toEqual({ usd: 1499, eur: 1499 });
    });

    it('a Yarn unlock waits while an open checkout lists that champion (never charged for one already owned)', async () => {
        const h = champHarness();
        await store(h).yarn.updateOne({ _id: ACCOUNT }, { $set: { balance: 10_000 } }, { upsert: true });
        await h.stripe.createCheckout(request(champSkuOf('pixel')) as any, ON_ENV, ACCOUNT);
        expect(await codeOf(h.season.unlock(ACCOUNT, { hero: 'pixel' }))).toBe('PAWLEGENDS_CHECKOUT_OPEN');
        // another champion is not held
        await expect(h.season.unlock(ACCOUNT, { hero: 'duchess' })).resolves.toMatchObject({ hero: 'duchess' });
        // the hold expires: the unlock goes through
        h.clock.now = new Date(h.clock.now.getTime() + 2 * 3600_000);
        await expect(h.season.unlock(ACCOUNT, { hero: 'pixel' })).resolves.toMatchObject({ hero: 'pixel' });
    });

    it('a bundle whose champions are all owned is refused', async () => {
        const h = champHarness();
        await grantFoundersRoster(store(h), ACCOUNT);
        expect(await codeOf(h.stripe.createCheckout(request('pl_champs_all_s1') as any, ON_ENV, ACCOUNT))).toBe(
            'PAWLEGENDS_ALREADY_OWNED'
        );
    });
});

describe('party pick check', () => {
    const owned = new Map<string, Set<string>>([['acct:a', new Set(['howler'])]]);
    function service(now: number) {
        const rules: PartyRules = {
            heroes: CHAMPION_IDS,
            tricks: ['pounce'],
            difficulties: ['easy'],
            sideOf: h => CHAMPIONS.find(c => c.hero === h)?.side ?? null,
            newbieHero: 'clem',
            allowed: (p: Party, m: Member, hero: string) =>
                isFreeChampion(hero, p.rotationWeek ?? rotationWeek(now)) || !!owned.get(m.identity.key)?.has(hero),
        };
        const started: unknown[] = [];
        const clock = { now };
        const svc = new PartyService(
            rules,
            { changed: () => undefined, send: () => undefined, startMatch: plan => started.push(plan) },
            () => clock.now
        );
        return { svc, started, clock };
    }
    const identity = (key: string) => ({ accountId: key, guestKeyHash: null, key, ticketed: true, guest: false });
    /** A party of two (a party of one plays locally), the leader `leader`, in its pick. */
    const picking = (svc: PartyService, leader: string) => {
        const p = svc.create('m1', identity(leader), 'easy', undefined);
        svc.join(p.code, 'm2', identity('acct:other'), undefined);
        expect(svc.start('m1')).toBe('pick');
        return p;
    };

    it('refuses a locked hover and lock, allows starters, the rotation and owned; auto-lock picks an allowed hero', () => {
        const { svc, clock } = service(AFTER_EPOCH);
        const p = picking(svc, 'acct:b');
        svc.hover('m1', 'howler');
        expect(p.members[0].hero).toBeUndefined();
        svc.hover('m1', 'meatball');
        expect(p.members[0].hero).toBe('meatball');
        svc.lock('m1', 'stilts', 'pounce');
        expect(p.members[0].locked).toBe(false);
        // the timeout locks the hover (allowed)
        clock.now += 60_000;
        svc.tick();
        expect(p.members[0].locked).toBe(true);
        expect(['meatball', ...allowedChampions([], rotationWeek(AFTER_EPOCH))]).toContain(p.members[0].hero);
    });

    it('an owned champion can be locked; the pick keeps its rotation week through a Monday flip', () => {
        const { svc, clock } = service(Date.parse(ROTATION_EPOCH) + WEEK_MS - 5000);
        const p = picking(svc, 'acct:a');
        const week = p.rotationWeek!;
        // a hero free this week, then the week flips mid-pick
        const free = rotationOf(week).find(h => !rotationOf(week + 1).includes(h))!;
        clock.now += 10_000;
        svc.lock('m1', free, 'pounce');
        expect(p.members[0].locked).toBe(true);
        expect(p.members[0].hero).toBe(free);
        expect(svc.heroAllowedFor(p, p.members[0], 'howler')).toBe(true);
        expect(svc.heroAllowedFor(p, p.members[1], 'howler')).toBe(false);
    });

    it('a rematch drops a last hero the member may no longer pick', () => {
        const { svc, clock } = service(Date.parse(ROTATION_EPOCH) + WEEK_MS - 5000);
        const p = picking(svc, 'acct:b');
        const free = rotationOf(0).find(
            h => !rotationOf(1).includes(h) && CHAMPIONS.find(c => c.hero === h)!.side === 'cat'
        )!;
        svc.lock('m1', free, 'pounce');
        svc.lock('m2', 'clem', 'pounce');
        expect(p.phase).toBe('loading');
        p.members.forEach(m => (m.lastHero = m.hero));
        p.phase = 'results';
        clock.now += 10 * 60_000;
        svc.rematch('m1', true);
        expect(p.rotationWeek).toBe(1);
        expect(p.members[0].hero).toBeUndefined();
        expect(p.members[1].hero).toBe('clem');
    });
});

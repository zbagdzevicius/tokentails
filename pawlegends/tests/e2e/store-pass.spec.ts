import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost, received } from './host';

// STORE-PASS.md: the cosmetics store and the Legends Pass, game side, with the mock host standing in for the real one
// (its own sheet, Stripe test mode, GET /pawlegends/me, POST /pawlegends/pass/claim, /live's Season XP). The real
// checkout and grants are covered by the backend specs (pawlegends-store-pass.spec.ts) and the client tests.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'store and pass flow is viewport independent'));

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'clem', trick: 'pounce', difficulty: 'easy', veteran: true };
const SEASON = { id: 's1', xp: 0, tier: 0, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };
const CALICO = 'coat.clem.store_calico';
const SKU = 'pl_coat_clem_calico';

const profileOf = (game: Frame): Promise<Record<string, any>> => game.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}'));

test('store: browse, buy (mock test-mode purchase), owned, equip, seen in a bot match; pass XP after the match and a claim', async ({ context, page, baseURL }) => {
  test.setTimeout(300_000);
  const afterMatch = { ...SEASON, xp: 1210, tier: 3 };
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: VETERAN,
    query: '&speed=64',
    store: { items: [], season: SEASON },
    storeGrants: { [SKU]: { items: [CALICO], season: SEASON } },
    seasonOnSave: { season: { gained: 310, xp: 1210, tier: 3, prevTier: 2 }, store: { items: [CALICO], season: afterMatch } },
    passClaim: { items: [CALICO, 'coat.clem.s1_honey_tabby'], season: { ...afterMatch, claimed: ['f:3'] } },
  });
  const game = await openHost(page);

  // browse: the rail's Store opens one screen with tabs; only the grid scrolls
  await game.locator('.hm-nav [data-a="store"]').click();
  const shop = game.locator('.pl-shop');
  await expect(shop).toBeVisible();
  // Champions · Coats · Frames · Sets · Pass (CHAMPION-STORE.md: the Champions tab sits next to the cosmetics)
  await expect(shop.locator('[data-tab]')).toHaveCount(5);
  await expect(shop).toContainText('Cosmetic only: nothing here changes a match');
  await expect(shop).not.toContainText(/[0-9] Tails|coins/); // XP and prices only (CLAIMS R8)
  await shop.locator('[data-tab="frames"]').click();
  await expect(shop.locator('[data-sel]')).toHaveCount(4);
  await shop.locator('[data-tab="coats"]').click();
  // CARD-SKINS.md: 4 effect coats (Epic $7.99, Legendary $14.99, tier word on the tile) and the 16 Rare coats
  await expect(shop.locator('[data-sel]')).toHaveCount(20);
  await expect(shop.locator('[data-sel][data-rung="LEGENDARY"]')).toHaveCount(2);
  await expect(shop.locator('[data-sel="pl_coat_brutus_thunderpaw"]')).toContainText(/Legendary · (\$|€)14\.99/);
  await shop.locator(`[data-sel="${SKU}"]`).click();
  await expect(shop.locator(`[data-buy="${SKU}"]`)).toContainText(/Buy (\$|€)2\.99/);

  // buy: purchase-intent{sku}; the host answers purchase-result and a fresh `store`
  await shop.locator(`[data-buy="${SKU}"]`).click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'purchase-intent' && m.sku === SKU)).toBe(true);
  await expect(shop.locator(`[data-sel="${SKU}"]`)).toHaveClass(/st-owned/);
  await expect.poll(async () => (await game.evaluate(() => document.documentElement.dataset.items ?? '')).split(',')).toContain(CALICO);
  // the reveal puts it on and an explicit Equip keeps it
  await shop.locator(`[data-equip="${SKU}"]`).click();
  expect((await profileOf(game)).looks?.clem?.coat).toBe(CALICO);
  await shop.locator('[data-a="close"]').click();
  await expect(shop).toHaveCount(0);

  // seen in a bot match: the match starts in that look (item_seen_in_match names the coat and its SKU)
  await game.locator('.pl-btn.big').first().click();
  await game.waitForSelector('html[data-match="live"]');
  await expect
    .poll(async () => (await received(page)).some((m) => m.type === 'analytics' && m.event === 'item_seen_in_match' && (m.props as any)?.item === CALICO && (m.props as any)?.sku === SKU))
    .toBe(true);

  // the save chip shows the Season XP /live paid, then the pass shows the tier and a claim
  await game.waitForSelector('html[data-screen="results"]', { timeout: 240_000 });
  await expect(game.locator('.plc-season')).toContainText('+310');
  await expect(game.locator('.plc-season')).toContainText('Season XP');
  await game.locator('[data-a="home"]').click().catch(() => undefined);
  await game.waitForSelector('html[data-screen="title"]');
  await game.locator('[data-a="collection"]').click();
  await game.locator('.pl-collection [data-a="pass"]').click();
  const pass = game.locator('.pl-pass');
  await expect(pass).toBeVisible();
  await expect(pass.locator('.pass-top [data-tier]')).toHaveAttribute('data-tier', '3');
  await expect(pass).toContainText('season ends 5 Jan 2027');
  await expect(pass.locator('.pc.locked').first()).toBeVisible();
  await pass.locator('[data-a="all"]').click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'pass-claim' && m.all === true)).toBe(true);
  await expect(pass.locator('.pc.claimed')).toHaveCount(1);
  await expect(pass.locator('[data-buy="pl_pass_s1"]')).toBeVisible();
});

test('native app build: no store, no price, no buy button; owned purchases are not drawn, pass free-row rewards are', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: true, store: true },
    signedIn: true,
    profile: VETERAN,
    store: { items: [CALICO, 'coat.clem.s1_honey_tabby'], season: { ...SEASON, xp: 1300, tier: 3, claimed: ['f:3'] } },
  });
  const game = await openHost(page);
  await expect(game.locator('[data-a="store"]')).toHaveCount(0);
  const items = (await game.evaluate(() => document.documentElement.dataset.items ?? '')).split(',');
  expect(items).toContain('coat.clem.s1_honey_tabby');
  expect(items).not.toContain(CALICO);
  await game.locator('[data-a="collection"]').click();
  await game.locator('.pl-collection [data-a="pass"]').click();
  const pass = game.locator('.pl-pass');
  await expect(pass).toBeVisible();
  await expect(pass.locator('[data-buy]')).toHaveCount(0);
  await expect(pass).not.toContainText(/\$|€|buy|web/i);
  await expect(pass.locator('.pc.locked').first()).toBeVisible();
  expect((await received(page)).some((m) => m.type === 'purchase-intent')).toBe(false);
});

async function noPageScroll(game: Frame): Promise<void> {
  const r = await game.evaluate(() => {
    const se = document.scrollingElement!;
    const card = document.querySelector('.pl-shop .card, .pl-pass .card')!.getBoundingClientRect();
    // The card clips its content, so also check the store preview column ends above the buy bar.
    const preview = document.querySelector('.pl-shop .shop-preview')?.getBoundingClientRect();
    const bar = document.querySelector('.pl-shop .shop-bar')?.getBoundingClientRect();
    const overlap = preview && bar ? preview.bottom - bar.top : 0;
    return { sh: se.scrollHeight, ch: se.clientHeight, sw: se.scrollWidth, cw: se.clientWidth, bottom: card.bottom, right: card.right, vh: innerHeight, vw: innerWidth, overlap };
  });
  expect(r.overlap).toBeLessThanOrEqual(1);
  expect(r.sh).toBeLessThanOrEqual(r.ch);
  expect(r.sw).toBeLessThanOrEqual(r.cw);
  expect(r.bottom).toBeLessThanOrEqual(r.vh + 1);
  expect(r.right).toBeLessThanOrEqual(r.vw + 1);
}

test('store and pass screens never scroll the page (only the grid or the tier strip)', async ({ context, page, baseURL }: { context: any; page: Page; baseURL?: string }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: VETERAN, store: { items: [], season: SEASON } });
  const game = await openHost(page);
  for (const [w, h] of [
    [667, 375],
    [844, 390],
    [1440, 900],
    [667, 300],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await game.locator('.hm-nav [data-a="store"]').click();
    await expect(game.locator('.pl-shop')).toBeVisible();
    await noPageScroll(game);
    await game.locator('.pl-shop [data-a="close"]').click();
    await game.locator('[data-a="collection"]').click();
    await game.locator('.pl-collection [data-a="pass"]').click();
    await expect(game.locator('.pl-pass')).toBeVisible();
    await noPageScroll(game);
    await game.locator('.pl-pass [data-a="x"]').click();
    await expect(game.locator('.pl-pass')).toHaveCount(0);
  }
});

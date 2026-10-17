import { expect, test } from '@playwright/test';
import { fakeToken, gattr, mockHost, openHost, received } from './host';

// POC.md §15 item 22 (game side). The mock host stands in for the purchase sheet + Stripe test checkout: it answers
// a purchase intent with `purchase-result{ok}` and a fresh entitlement token, as the real host does after the
// Stripe return (`/pawlegends?checkout=ok`). The real Stripe test-mode run is covered by the backend specs and the
// host's own tests.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'store flow is viewport independent'));

const STARTER = fakeToken(['skin.clem.pink_bow', 'emote.starter'], ['pl_starter']);

test('buy → return → the item renders in the lobby and the next match', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, buyGrants: { pl_starter: STARTER } });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'store')).toBe('1');
  await game.locator('[data-a="store"]').click();
  await expect(game.locator('.pl-store .pl-sku')).toHaveCount(3);
  await game.locator('[data-buy="pl_starter"]').click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'purchase-intent' && m.sku === 'pl_starter')).toBe(true);
  // the host returns ok + a token: the lobby hero wears Pink Bow Clem, the store no longer lists the starter
  await expect.poll(() => gattr(game, 'look')).toBe('clem:skin.clem.pink_bow|-');
  await expect(game.locator('.pl-store [data-buy="pl_starter"]')).toHaveCount(0);
  await expect(game.locator('.pl-store .owned')).toContainText('Starter');
  await game.locator('.pl-store [data-a="close"]').click();
  await game.locator('.pl-btn.big').first().click();
  await game.waitForSelector('html[data-match="live"]');
  await expect.poll(() => gattr(game, 'matchLook')).toBe('skin.clem.pink_bow|-');
});

test('restore in a clean profile: a token from the host dresses the hero at once', async ({ context, page, baseURL }) => {
  const legend = fakeToken(['coat.founder.clem', 'coat.founder.sage', 'coat.founder.brutus', 'coat.founder.cacklejaw', 'frame.founder', 'title.founder', 'skin.clem.dawnblade', 'frame.legend'], ['pl_founder_legend']);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, token: legend });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'look')).toBe('clem:skin.clem.dawnblade|-');
  expect(await gattr(game, 'frame')).toBe('frame.legend');
  await expect(game.locator('.pl-badge')).toContainText('Founder');
  await game.locator('[data-a="store"]').click();
  // Founder Legend owns everything but the starter
  await expect(game.locator('.pl-store [data-buy]')).toHaveCount(1);
  await expect(game.locator('.pl-store [data-buy="pl_starter"]')).toHaveCount(1);
});

test('app builds: no store, no offers, no purchased cosmetics', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: true, store: true },
    token: STARTER,
    profile: { v: 1, sessions: 4, matches: 5, wins: 2, firstWinDone: true },
  });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'isApp')).toBe('1');
  await page.waitForTimeout(800);
  await expect(game.locator('[data-a="store"]')).toHaveCount(0);
  await expect(game.locator('.pl-offer')).toHaveCount(0);
  expect(await gattr(game, 'items')).toBe('');
  expect(await gattr(game, 'look')).toBe('clem:-|-');
});

test('no offer card in session 1; the starter offer from session 2 after a first win, once', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true } });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'store')).toBe('1');
  await page.waitForTimeout(800);
  await expect(game.locator('.pl-offer')).toHaveCount(0);
  // the store button is there from session 1
  await expect(game.locator('[data-a="store"]')).toHaveCount(1);

  // session 2 with a first win (same origin storage, as on tokentails.com)
  await game.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}');
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ ...p, matches: 1, wins: 1, firstWinDone: true }));
  });
  await page.reload();
  const game2 = await openHost(page);
  await expect(game2.locator('.pl-offer[data-offer="starter"]')).toBeVisible();
  await expect(game2.locator('.pl-offer .ends')).toContainText(/This card hides in 4[78] h\. Same price in the store/);
  await game2.locator('.pl-offer [data-a="close"]').click();
  // at most one card per session: going to pick and back shows none
  await game2.locator('[data-a="choose"]').click();
  await game2.locator('[data-a="back"]').click();
  await page.waitForTimeout(500);
  await expect(game2.locator('.pl-offer')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { art, mockHost, openHost, received } from './host';

// GAPS A1 / A6: an old 9-chest Treat Track moves to the 30-chest track with its empty chests paid once; the title's
// Treat Track button opens the chest screen ("pick your next target", N matches to go, postcards, titles); the pick
// screen shows the role label and no lane hint. Nothing here opens an offer.

const V1 = ['emote.wave', 'coat.clem.marmalade', 'coat.sage.midnight', 'coat.brutus.biscuit', 'coat.cacklejaw.spotted', 'coat.clem.snowpaw', 'coat.sage.sunrise', 'coat.brutus.ember', 'coat.cacklejaw.dusk'];

test('an old track migrates once, the chest screen picks a target and a champion title can be worn', async ({ page }) => {
  await page.addInitScript((v1) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 1, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', unlocks: v1 }));
    // 12 chests on the old track: 8 rewards and 4 that opened empty
    localStorage.setItem('tt.pawlegends.treats.v1', JSON.stringify({ v: 1, xp: 12 * 300 + 40, chests: 12 }));
  }, V1);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  const unlocks = (): Promise<string[]> => page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').unlocks ?? []);
  const after = await unlocks();
  expect(after).toEqual(expect.arrayContaining(['postcard.lambo', 'coat.clem.lilac', 'postcard.aviete', 'coat.sage.fern']));
  expect(after).toHaveLength(V1.length + 4);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.treats.v1') ?? '{}').v)).toBe(2);
  // a reload grants nothing more
  await page.reload();
  await page.waitForSelector('html[data-screen="title"]');
  expect(await unlocks()).toHaveLength(V1.length + 4);

  await page.locator('[data-a="collection"]').click();
  const panel = page.locator('.pl-collection');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-togo]')).toContainText('matches to go');
  await expect(panel.locator('[data-postcard="lambo"]')).not.toHaveClass(/locked/);
  await expect(panel.locator('[data-postcard="lambo"]')).toContainText('real Pink Paw cat');
  await expect(panel.locator('[data-postcard="gabe"]')).toHaveClass(/locked/);
  await panel.locator('[data-target="gabe"]').click();
  await expect(panel.locator('[data-next]')).toHaveAttribute('data-next', 'postcard.gabe');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.treats.v1') ?? '{}').target)).toBe('gabe');
  await panel.locator('[data-a="close"]').click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.offer ?? '')).toBe('');
});

test('closing the Treat Track panel on an offer-eligible profile never shows a new offer', async ({ context, page, baseURL }) => {
  const PUMPKIN = '65a1b2c3d4e5f6a7b8c9d0e1';
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    featured: [{ catalogId: PUMPKIN, name: 'Pumpkin', type: 'GRASS', art: art('pumpkin') }],
    offer: { kind: 'meet', catalogId: PUMPKIN },
    profile: { v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true },
  });
  const game = await openHost(page);
  // the host's Meet answer shows once on the title (session 2+), before the panel opens
  await expect(game.locator('.plc-meet')).toHaveCount(1);
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'offer-seen').length).toBe(1);
  await game.locator('[data-a="collection"]').click();
  const panel = game.locator('.pl-collection');
  await expect(panel).toBeVisible();
  await panel.locator('[data-a="close"]').click();
  await expect(panel).toHaveCount(0);
  await game.waitForSelector('html[data-screen="title"]');
  await page.waitForTimeout(300);
  expect((await received(page)).filter((m) => m.type === 'offer-seen').length).toBe(1);
  await expect(game.locator('.plc-meet')).toHaveCount(1);
  expect((await received(page)).some((m) => m.type === 'open-cat' || m.type === 'purchase-intent')).toBe(false);
});

test('the pick screen labels the role and gives no lane hint', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 1, matches: 4, wins: 1, firstWinDone: true, hero: 'lambo' }));
  });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
  await expect(page.locator('.pl-pick .role-label')).toHaveText('Tank');
  await expect(page.locator('.pl-pick .detail')).not.toContainText(/lane/i);
});

import { expect, test } from '@playwright/test';
import { toChampSelect } from './helpers';
import { art, mockHost, openHost, received } from './host';

// Card skins from the player's Token Tails cats are parked (docs/plans/moba/NO-TOKENTAILS.md, 2026-11-12): no "Your
// cards" drawer, no Cards nav item or card peek, no card names on the champion, no locked featured tiles or Preview,
// no showcase bots, and no `?skins=demo` page hook. An older host's roster and featured cats change nothing on screen.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick and lobby panels are viewport independent'));

const CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';
const ROSTER = [
  { id: 'c1', name: 'Pickles', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', art: art('pickles'), sprite: `${CDN}/assets/PICKLES/base.png` },
  { id: 'c2', name: 'Ficus', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', art: art('ficus'), sprite: `${CDN}/assets/FICUS/base.png` },
];
const FEATURED = [{ catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR', art: art('nova'), sprite: `${CDN}/assets/OREO/base.png`, tier: 'RARE' }];
const PLAYED = { v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'lambo', firstPlaySession: 1 };

test('no cards anywhere: Home, the champion select and a saved card look from an older build', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    roster: ROSTER,
    featured: FEATURED,
    profile: { ...PLAYED, looks: { lambo: { coat: 'cat.c2', chroma: null } } },
  });
  const game = await openHost(page);
  await game.waitForSelector('html[data-screen="title"]');
  await page.waitForTimeout(500);
  await expect(game.locator('[data-a="cards"], .lb-peek, .pl-deck')).toHaveCount(0);
  await expect(game.locator('body')).not.toContainText(/Ficus|Pickles|your cats|become skins|token ?tails/i);
  // the saved card look falls back to the hero's own (resolveLook): the champion is named Lambo, never the cat
  await expect(game.locator('.hm-plate-n')).toContainText('Lambo');
  await toChampSelect(game);
  await game.waitForSelector('.pl-pick .cs');
  await expect(game.locator('.cs-looksheet [data-a="deck"], .cs-ls-cards, [data-preview], .champ-owned')).toHaveCount(0);
  await expect(game.locator('.pl-pick')).not.toContainText(/Ficus|Pickles|Nova|Cards dress/);
  expect((await received(page)).some((m) => m.type === 'skin-preview' || m.type === 'open-cat')).toBe(false);
});

test('?skins=demo is gone: a local page shows no demo roster', async ({ page }) => {
  await page.goto('/?skins=demo');
  await page.waitForSelector('html[data-ready="1"]');
  expect(await page.evaluate(() => document.documentElement.dataset.skinDemo ?? '')).toBe('');
  expect(await page.evaluate(() => document.documentElement.dataset.chromas ?? '')).toBe('');
  await expect(page.locator('[data-a="cards"], .lb-peek')).toHaveCount(0);
});

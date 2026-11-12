import { expect, test } from '@playwright/test';
import { gattr, mockHost, openHost } from './host';
import { startFirstMatch, playFromHome } from './helpers';

// UX pass 2: a human hero shows the player's username (the Token Tails profile name the host sends in `session`),
// cleaned and cut to 14 characters; bots keep their persona names, which carry the champion ("Biscuit the Clem").
const PROFILE = { v: 1, sessions: 3, matches: 2, wins: 1, firstWinDone: true, hero: 'clem', side: 'cat' };

test('signed in: the own hero, scoreboard row and HUD portrait carry the username; bots keep champion names', async ({ context, page, baseURL }) => {
  test.setTimeout(120_000);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, name: 'Žygis <b>the Great</b> Pawsome', profile: PROFILE });
  const game = await openHost(page);
  await game.waitForSelector('html[data-screen="title"]');
  await playFromHome(game);
  await game.waitForSelector('html[data-match="live"]');
  await expect.poll(() => gattr(game, 'selfName')).toBe('Žygis bthe Gr…');
  const names = (await gattr(game, 'plateNames')).split('|');
  // the solo player is seat 0 (the cat side)
  const slot = 0;
  expect(names[slot]).toBe('Žygis bthe Gr…');
  // every other seat is a bot: its persona names its champion ("Biscuit the Clem", "Gravy the Brutus")
  const bots = names.filter((_, s) => s !== slot);
  expect(bots).toHaveLength(5);
  for (const n of bots) expect(n).toMatch(/ the /);
  // the scoreboard row (Tab): the username, then the champion
  await page.keyboard.press('Tab');
  await expect(game.locator('.pl-scoreboard tr.me')).toHaveCount(1);
  const row = (await game.locator('.pl-scoreboard tr.me td').first().textContent()) ?? '';
  expect(row).toContain('Žygis bthe Gr…');
  expect(row).toContain('Clem');
  expect(await game.locator('.pl-portrait').getAttribute('aria-label')).toBe('Žygis bthe Gr… · Clem');
});

test('a guest keeps "You" over the own hero (no username, no champion rename)', async ({ page }) => {
  await startFirstMatch(page, '', 'cat');
  expect(await page.evaluate(() => document.documentElement.dataset.selfName)).toBe('');
  const names = (await page.evaluate(() => document.documentElement.dataset.plateNames ?? '')).split('|');
  expect(names[0]).toBe('Clem');
});

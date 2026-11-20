import { expect, test, type Page } from '@playwright/test';
import { serveSilhouettes } from './helpers';
import { limit } from '../unit/cpu-budget';
import { openSettingsFromHome } from './openSettings';

// Home map backdrops (docs/plans/moba/HOME-MAP-BACKDROPS.md, founder Nov 20 "Real map backdrops that rotates"): Home
// shows the champion standing in a real map spot (a picture from pawlegends.app, served from this checkout here), with
// the champion live in 3D on the spot, and moves to the next spot after the stay (?mapbgEvery=2 shortens it from 12 s).
// A panel over Home stops the rotation; a missing picture falls back to the poster.

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

async function seed(page: Page, serve = true): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
  if (serve) await serveSilhouettes(page);
}

const shown = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.dataset.mapBg ?? '');

test('Home stands the champion in a map spot and rotates to the next spot after the stay', async ({ page }) => {
  test.setTimeout(limit(120_000));
  await seed(page);
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/lobby-maps/')) asked.push(r.url());
  });
  await page.goto('/?e2e=1&mapbgEvery=2');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('html')).toHaveAttribute('data-lobby-bg', 'map');
  await expect(page.locator('html')).toHaveAttribute('data-map-bg-ready', '1', { timeout: limit(20_000) });
  const first = await shown(page);
  expect(first).toMatch(/^(crossing|ridge|thicket|quarry|pitch|hearthwood)-0[1-3]-/);
  // the champion is drawn on the spot, wholly on screen
  const box = (await page.evaluate(() => document.documentElement.dataset.heroBox ?? '')).split(',').map(Number);
  const vp = page.viewportSize()!;
  expect(box).toHaveLength(4);
  expect(box[0]).toBeGreaterThanOrEqual(0);
  expect(box[1]).toBeGreaterThanOrEqual(0);
  expect(box[2]).toBeLessThanOrEqual(vp.width);
  expect(box[3]).toBeLessThanOrEqual(vp.height);
  // the picture is web-sized and comes from the art folder, not the game bundle
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((u) => /pawlegends-art\/lobby-maps\/[a-z0-9-]+-(1280|1920)\.webp/.test(u))).toBe(true);
  // after the stay (2 s here) and the fade, the next spot is shown, from another map
  await expect.poll(() => shown(page), { timeout: limit(30_000) }).not.toBe(first);
  const second = await shown(page);
  expect(second.split('-')[0]).not.toBe(first.split('-')[0]);
  // PLAY is still on top of it
  await expect(page.locator('.pl-home .pl-btn.big')).toBeInViewport();
});

test('a panel over Home stops the rotation; ?mapbg= pins one spot', async ({ page }) => {
  test.setTimeout(limit(120_000));
  await seed(page);
  await page.goto('/?e2e=1&mapbg=pitch-02-goal-mouth&mapbgEvery=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('html')).toHaveAttribute('data-map-bg-ready', '1', { timeout: limit(20_000) });
  await page.waitForTimeout(3500);
  expect(await shown(page)).toBe('pitch-02-goal-mouth');
  // Settings over Home (a covering panel), rotating Home: no change while it is open
  await page.goto('/?e2e=1&mapbgEvery=2');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('html')).toHaveAttribute('data-map-bg-ready', '1', { timeout: limit(20_000) });
  await openSettingsFromHome(page);
  const under = await shown(page);
  await page.waitForTimeout(5000);
  expect(await shown(page)).toBe(under);
});

test('reduced motion keeps one spot', async ({ browser }) => {
  test.setTimeout(limit(120_000));
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  try {
    await seed(page);
    await page.goto('/?e2e=1&mapbgEvery=1');
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await expect(page.locator('html')).toHaveAttribute('data-map-bg-ready', '1', { timeout: limit(20_000) });
    const first = await shown(page);
    await page.waitForTimeout(4000);
    expect(await shown(page)).toBe(first);
  } finally {
    await ctx.close();
  }
});

test('pictures that cannot load fall back to the poster', async ({ page }) => {
  test.setTimeout(limit(120_000));
  await seed(page, false);
  await page.route('**/pawlegends-art/silhouettes/**', (r) => r.abort());
  await page.route('**/pawlegends-art/lobby-maps/**', (r) => r.abort());
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('html')).toHaveAttribute('data-lobby-bg', 'poster', { timeout: limit(20_000) });
});

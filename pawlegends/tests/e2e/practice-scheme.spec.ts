/**
 * Practice's map colour chip (ui/mapPick.ts): at 667 × 375 (the smallest phone in landscape) the swatch sits next to
 * the map chips without overlapping them or the action button, a tap steps Random → each of the map's seasons, and the
 * Practice match plays the picked season (html data-map-scheme).
 */
import { expect, test } from '@playwright/test';
import { limit } from '../unit/cpu-budget';

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
type Box = { x: number; y: number; width: number; height: number };
const apart = (a: Box, b: Box): boolean => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

test('Practice map colours: fits 667 × 375 and the match plays the pick', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'phone landscape only');
  test.setTimeout(limit(180_000));
  await page.setViewportSize({ width: 667, height: 375 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
  await page.goto('/?e2e=1&speed=2');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await page.locator('[data-testid="home-play"]').tap();
  await page.locator('[data-testid="mode-practice"]').tap();
  await page.locator('[data-testid="mode-next"]').tap();
  await page.locator('[data-testid="practice-map-crossing"]').tap();
  const chip = page.locator('[data-testid="practice-scheme"]');
  await expect(chip).toHaveAttribute('data-ps', 'random');
  const c = (await chip.boundingBox())!;
  const maps = (await page.locator('[data-testid="practice-maps"]').boundingBox())!;
  const go = (await page.locator('[data-testid="mode-go"]').boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(667);
  expect(c.y + c.height).toBeLessThanOrEqual(375);
  expect(apart(c, maps)).toBe(true);
  expect(apart(c, go)).toBe(true);
  expect(maps.x).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(667);
  await page.screenshot({ path: info.outputPath('practice-scheme-667x375.png') });
  // Random → native → bloom → harvest → frost
  for (const s of ['native', 'bloom', 'harvest', 'frost']) {
    await chip.tap();
    await expect(chip).toHaveAttribute('data-ps', s);
  }
  await page.locator('[data-testid="mode-go"]').tap();
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await page.locator('.cs-lock').first().tap();
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(90_000) });
  expect(await page.evaluate(() => document.documentElement.dataset.mapScheme)).toBe('crossing:frost');
  expect(errors).toEqual([]);
});

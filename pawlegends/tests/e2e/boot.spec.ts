import { expect, test } from '@playwright/test';

// The page boots into the title over the lobby turntable, with no crash overlay and no debug globals.
test('boots to the title screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('.pl-title')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#crash')).toHaveCount(0);
  expect(await page.evaluate(() => 'GAME' in window || '__GAME__' in window)).toBe(false);
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';
import { playFromHome, seedSide } from './helpers';

/**
 * Force update on the web (docs/plans/moba/FORCE-UPDATE.md §5.1, src/meta/clientPolicy.ts): when the live build's
 * `version.json` names another build, an open tab shows "Updating Paw Legends" on the title and reloads to it, once
 * (a CDN that still serves the old build never loops the tab), and never during a pick or a match.
 */

/** Serve a `version.json` that names a newer build than the one under test. */
async function newerBuildLive(page: Page): Promise<void> {
  await page.route('**/version.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({ sha: 'fff9999', simVersion: 27 }) }),
  );
}

function countLoads(page: Page): { n: number } {
  const loads = { n: 0 };
  page.on('load', () => void loads.n++);
  return loads;
}

test('the build serves its own version.json, and an up-to-date tab shows no update card', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');
  const v = await page.evaluate(async () => (await fetch('./version.json', { cache: 'no-store' })).json());
  expect(v).toMatchObject({ sha: expect.stringMatching(/^[0-9a-z]{4,40}$/), simVersion: expect.any(Number) });
  await page.waitForTimeout(1500);
  await expect(page.locator('.pl-update')).toHaveCount(0);
});

test('an outdated tab on the title shows "Updating Paw Legends", reloads once, and does not loop', async ({ page }) => {
  await newerBuildLive(page);
  const loads = countLoads(page);
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');
  const card = page.locator('.pl-update[data-update="soft"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Updating Paw Legends');
  await expect.poll(() => loads.n, { timeout: 15_000 }).toBe(2);
  // the reloaded page is still the "old" build (the route still names fff9999): one reload per 5 minutes, no loop
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForTimeout(7000);
  expect(loads.n).toBe(2);
  await expect(page.locator('.pl-update')).toHaveCount(0);
});

test('never mid-match: Play before the countdown ends keeps the match; no reload in the pick or the match', async ({ page }) => {
  await seedSide(page, 'cat');
  await newerBuildLive(page);
  const loads = countLoads(page);
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');
  await expect(page.locator('.pl-update[data-update="soft"]')).toBeVisible();
  await playFromHome(page);
  await page.waitForSelector('html[data-screen="match"]', { timeout: 30_000 });
  await page.waitForTimeout(8000);
  expect(loads.n).toBe(1);
  expect(await page.evaluate(() => document.documentElement.dataset.screen)).toBe('match');
  await expect(page.locator('.pl-update')).toHaveCount(0);
});

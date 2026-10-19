import { expect, test, type Page } from '@playwright/test';

// GAPS A2 + A3: the results screen grades the match (S/A/B/C, MVP, "Best on your team" on a loss) and offers
// "Run it back" (same hero, trick and difficulty, a new seed) and "Switch cat" (the pick screen, difficulty kept).
// Both stay in the same page (no reload), so the once-a-page-session offer rule cannot show a second card.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'normal', veteran: true };
const data = (page: Page, k: string): Promise<string> => page.evaluate((n) => document.documentElement.dataset[n] ?? '', k);

async function toResults(page: Page): Promise<void> {
  await page.waitForSelector('html[data-screen="results"]', { timeout: 170_000 });
  await page.waitForSelector('.pl-results.actions-in', { timeout: 5_000 });
  const grade = page.locator('.pl-results .pl-grade');
  await expect(grade).toHaveAttribute('data-grade', /^[SABC]$/);
  await expect(grade.locator('[data-mvp]')).toContainText('MVP:');
  const lost = (await page.locator('.pl-results h1').textContent()) === 'Defeat';
  await expect(grade.locator('[data-best]')).toHaveCount(lost ? 1 : 0);
  if (lost) await expect(grade.locator('[data-best]')).toContainText('Best on your team:');
  await expect(page.locator('.pl-results')).not.toContainText(/catnip/i);
}

test('results: Run it back keeps hero, trick and difficulty with a new seed; Switch cat opens the pick screen on the same bots', async ({ page }, info) => {
  test.setTimeout(420_000);
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1&speed=64');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  const pick = await data(page, 'matchPick');
  const seed = await data(page, 'matchSeed');
  expect(pick).toBe('sage,hiss,normal');
  // a marker on this document: a reload or navigation would drop it (and with it the page session)
  await page.evaluate(() => ((window as unknown as { __plStay: number }).__plStay = 1));

  await toResults(page);
  const again = page.locator('[data-a="again"]');
  await expect(again).toContainText('Run it back');
  await expect(again).toContainText('Sage');
  if (info.project.name === 'landscape') await again.tap();
  else await again.click();
  await page.waitForFunction((s) => !!document.documentElement.dataset.matchSeed && document.documentElement.dataset.matchSeed !== s, seed, { timeout: 30_000 });
  await page.waitForSelector('html[data-match="live"]');
  expect(await data(page, 'matchPick')).toBe(pick);
  expect(await page.evaluate(() => (window as unknown as { __plStay?: number }).__plStay)).toBe(1);

  await toResults(page);
  const change = page.locator('[data-a="change"]');
  await expect(change).toContainText('Switch cat');
  if (info.project.name === 'landscape') await change.tap();
  else await change.click();
  await page.waitForSelector('html[data-screen="pick"]');
  await expect(page.locator('.pl-pick [data-d].on')).toHaveAttribute('data-d', 'normal');
  expect(await page.evaluate(() => (window as unknown as { __plStay?: number }).__plStay)).toBe(1);
  // never more than one offer card in the page session (none here: no host checkout)
  expect(await page.locator('.pl-offer, [data-offer]').count()).toBeLessThanOrEqual(1);
});

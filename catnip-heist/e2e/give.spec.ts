import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The rescue win screen offers the one-tap "rescue treat" for Pink Paw. Replays the heist-01
// solution to Results and checks the button (it only navigates; nothing here signs or pays).
const here = dirname(fileURLToPath(import.meta.url));
const SOLUTION = readFileSync(join(here, '../src/levels/heist-01.solution.json'), 'utf8');

// Local view of the QA hook (heist.spec.ts owns the global Window declaration).
type Heist = { screen(): string; loadReplay(json: string): Promise<unknown>; step(n: number): unknown };

// The rail decides whether the link shows (plan G11): only a live backend status does. The preview
// host has no API, so the live case points the runtime config at a mocked status.
const API = 'http://rail.e2e.test';

async function playToResults(page: Page, rail: 'live' | 'pre-launch') {
  if (rail === 'live') {
    await page.addInitScript((apiUrl) => {
      (window as unknown as { __TT_HEIST_CONFIG__: unknown }).__TT_HEIST_CONFIG__ = { apiUrl };
    }, API);
    await page.route(`${API}/shelter/donate/status`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ railState: 'live', amountWei: '10000000000000000', treatsLeftToday: 5 }),
      }),
    );
  }
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!(window as unknown as { __heist?: unknown }).__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
  await page.evaluate((j) => (window as unknown as { __heist: Heist }).__heist.loadReplay(j), SOLUTION);
  await page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.step(100_000));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.screen()), { timeout: 10_000 }).toBe('results');
}

test('rescue win screen shows the Pink Paw rescue-treat button with the rescued cat when the rail is live', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await playToResults(page, 'live');

  const give = page.getByTestId('give-treat');
  await expect(give).toBeVisible();
  await expect(give).toHaveText('Send Pink Paw a rescue treat 🐾');
  await expect(give).toHaveAttribute('target', '_blank');
  const href = (await give.getAttribute('href'))!;
  expect(href.startsWith('/shelter-payouts/give?')).toBe(true);
  const q = new URLSearchParams(href.split('?')[1]);
  expect(q.get('from')).toBe('heist');
  const rescued = await page.locator('.ch-rescue p').first().textContent();
  expect(q.get('cat')).toBeTruthy();
  expect(rescued).toContain(`You rescued ${q.get('cat')}!`);
  expect(errors).toEqual([]);
});

test('before the rail is live the win screen shows "Opens soon" and no give link', async ({ page }) => {
  test.setTimeout(90_000);
  await playToResults(page, 'pre-launch');
  await expect(page.getByTestId('rail-chip')).toHaveText('Opens soon');
  await expect(page.getByTestId('rail-line')).toHaveAttribute('data-rail', 'pre-launch');
  await expect(page.getByTestId('give-treat')).toHaveCount(0);
});

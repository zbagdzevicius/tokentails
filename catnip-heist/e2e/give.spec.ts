import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The rescue win screen offers the one-tap "rescue treat" for Pink Paw. Replays the heist-01
// solution to Results and checks the button (it only navigates; nothing here signs or pays).
const here = dirname(fileURLToPath(import.meta.url));
const SOLUTION = readFileSync(join(here, '../src/levels/heist-01.solution.json'), 'utf8');

// Local view of the QA hook (heist.spec.ts owns the global Window declaration).
type Heist = { screen(): string; loadReplay(json: string): Promise<unknown>; step(n: number): unknown };

test('rescue win screen shows the Pink Paw rescue-treat button with the rescued cat', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!(window as unknown as { __heist?: unknown }).__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
  await page.evaluate((j) => (window as unknown as { __heist: Heist }).__heist.loadReplay(j), SOLUTION);
  await page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.step(100_000));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.screen()), { timeout: 10_000 }).toBe('results');

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

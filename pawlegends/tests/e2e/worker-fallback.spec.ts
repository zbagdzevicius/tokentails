import { expect, test, type Page } from '@playwright/test';
import { attr } from './helpers';

// perf-2: one failed fetch of the sim Worker's module script (a network blip, a stale hashed chunk after a deploy)
// must not reach the crash overlay. The host retries the Worker once, then runs the sim on the main thread.

const WORKER = /local-host\.worker[^/]*\.js(\?.*)?$/;

async function blockWorker(page: Page, times: number): Promise<{ blocked: () => number }> {
  let blocked = 0;
  await page.route(WORKER, async (route) => {
    if (blocked < times) {
      blocked++;
      await route.abort('failed');
    } else await route.continue();
  });
  return { blocked: () => blocked };
}

async function play(page: Page, query = ''): Promise<void> {
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 30_000 });
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
}

test('sim Worker blocked once: the retry starts the match and plays it out, no crash overlay', async ({ page }) => {
  test.setTimeout(240_000);
  const w = await blockWorker(page, 1);
  await play(page, '&speed=64');
  expect(w.blocked()).toBe(1);
  expect(await attr(page, 'simHost')).toBe('worker:1');
  await expect(page.locator('#crash')).toHaveCount(0);
  // the retried Worker runs the whole match to the results screen
  await page.waitForSelector('html[data-screen="results"]', { timeout: 170_000 });
  await expect(page.locator('#crash')).toHaveCount(0);
});

test('sim Worker never loads: the match runs on the inline loop, no crash overlay', async ({ page }) => {
  const w = await blockWorker(page, 99);
  await play(page);
  expect(w.blocked()).toBe(2);
  expect(await attr(page, 'simHost')).toBe('inline:2');
  await expect(page.locator('#crash')).toHaveCount(0);
});

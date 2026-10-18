import type { Page } from '@playwright/test';

export const attr = (page: Page, name: string): Promise<string> => page.evaluate((n) => document.documentElement.dataset[n] ?? '', name);

export async function me(page: Page): Promise<{ x: number; y: number; state: string }> {
  const [x, y, state] = (await attr(page, 'me')).split(',');
  return { x: Number(x), y: Number(y), state };
}

/** Title → first match (one tap). */
export async function startFirstMatch(page: Page, query = ''): Promise<void> {
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // the loading veil takes clicks until it fades (app.ts adds .out on a timer, late under CPU load)
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

export const ops = async (page: Page): Promise<number[]> => (await attr(page, 'ops')).split(',').filter(Boolean).map(Number);

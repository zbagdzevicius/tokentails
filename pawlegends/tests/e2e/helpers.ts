import type { Page } from '@playwright/test';

export const attr = (page: Page, name: string): Promise<string> => page.evaluate((n) => document.documentElement.dataset[n] ?? '', name);

export async function me(page: Page): Promise<{ x: number; y: number; state: string }> {
  const [x, y, state] = (await attr(page, 'me')).split(',');
  return { x: Number(x), y: Number(y), state };
}

/** The local profile key (meta/profile.ts). */
export const PROFILE_KEY = 'tt.pawlegends.profile.v1';

/**
 * Seed a played profile (match 1 complete, so the DOGS tab is open) on `side` before the page loads, once: a reload
 * keeps what the game saved since.
 */
export async function seedSide(page: Page, side: 'cat' | 'dog', extra: Record<string, unknown> = {}): Promise<void> {
  const profile = { v: 1, sessions: 2, matches: 1, wins: 1, firstWinDone: true, hero: side === 'dog' ? 'brutus' : 'clem', side, ...extra };
  await page.addInitScript(
    ([key, json]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, json);
      } catch {
        /* storage blocked */
      }
    },
    [PROFILE_KEY, JSON.stringify(profile)] as const,
  );
}

/**
 * Title → first match (one tap). With `side`, a played profile on that side is seeded first (sim v14: `dog` starts the
 * match as Sir Brutus on the dog side, so the bots fill both teams by species).
 */
export async function startFirstMatch(page: Page, query = '', side?: 'cat' | 'dog'): Promise<void> {
  if (side) await seedSide(page, side);
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // the loading veil takes clicks until it fades (app.ts adds .out on a timer, late under CPU load)
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

export const ops = async (page: Page): Promise<number[]> => (await attr(page, 'ops')).split(',').filter(Boolean).map(Number);

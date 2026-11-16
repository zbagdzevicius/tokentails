import type { Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { playFromHome } from './helpers';

// MATCH-MOMENTS.md e2e helpers (replay.spec.ts, share-card.spec.ts).

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

export async function press(page: Page, touch: boolean, sel: string): Promise<void> {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}

/** A short solo match: Easy at 16x, forfeited at 3:00 (the fastest way to a real results screen with a record), or
 * lost before that on a slow machine. */
export async function forfeitMatch(page: Page, touch: boolean): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1&speed=16');
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  // Forfeit opens at 3:00 of game time. On a loaded machine 16x runs far slower than the clock, and an idle hero can
  // lose before a slow poll sees 3:00: either way ends on a real results screen with a record (wall guard 5 min).
  await page.waitForFunction(
    () => Number(document.documentElement.dataset.tick ?? 0) >= 5450 || document.documentElement.dataset.screen === 'results',
    null,
    { timeout: limit(300_000) },
  );
  if ((await page.evaluate(() => document.documentElement.dataset.screen)) === 'results') {
    await page.waitForSelector('.pl-results.actions-in', { timeout: limit(15_000) });
    return;
  }
  for (let i = 0; i < 6 && !(await page.locator('.pl-menu [data-a="forfeit"]').count()); i++) {
    if (touch) {
      const b = await page.locator('.pl-pause').boundingBox();
      if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await press(page, touch, '.pl-menu [data-a="forfeit"]');
  await press(page, touch, '.pl-menu [data-a="forfeit-yes"]');
  await page.waitForSelector('html[data-screen="results"]', { timeout: limit(30_000) });
  await page.waitForSelector('.pl-results.actions-in', { timeout: limit(15_000) });
}


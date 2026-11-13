import type { Page } from '@playwright/test';
import { playFromHome } from './helpers';

// MATCH-MOMENTS.md e2e helpers (replay.spec.ts, share-card.spec.ts).

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

export async function press(page: Page, touch: boolean, sel: string): Promise<void> {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}

/** A short solo match: Easy at 16x, forfeited at 3:00 (the fastest way to a real results screen with a record). */
export async function forfeitMatch(page: Page, touch: boolean): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), VETERAN);
  await page.goto('/?e2e=1&speed=16');
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5450, null, { timeout: 150_000 });
  for (let i = 0; i < 6 && !(await page.locator('.pl-menu [data-a="forfeit"]').count()); i++) {
    if (touch) {
      const b = await page.locator('.pl-pause').boundingBox();
      if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    } else await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await press(page, touch, '.pl-menu [data-a="forfeit"]');
  await press(page, touch, '.pl-menu [data-a="forfeit-yes"]');
  await page.waitForSelector('html[data-screen="results"]', { timeout: 30_000 });
  await page.waitForSelector('.pl-results.actions-in', { timeout: 15_000 });
}


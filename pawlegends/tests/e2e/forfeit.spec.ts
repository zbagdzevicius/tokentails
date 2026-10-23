import { expect, test, type Page } from '@playwright/test';
import { attr } from './helpers';

// GAPS B2: Forfeit in the pause menu (Esc on desktop, the pause button on touch). From match 4 only, from 3:00 on
// Easy (4:00 on Normal and Hard), never on Rookie. Before its time the button is disabled and names the time; then a
// confirm step; the match ends as a Defeat with reason 'forfeit', 20 Treat XP and no other reward line.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };
const FIRST_SESSION = { v: 1, sessions: 1, matches: 2, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy' };

async function start(page: Page, profile: Record<string, unknown>, query = ''): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), profile);
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

async function openMenu(page: Page, touch: boolean): Promise<void> {
  if (touch) {
    const b = (await page.locator('.pl-pause').boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  } else await page.keyboard.press('Escape');
  await expect(page.locator('.pl-menu')).toBeVisible();
}

async function press(page: Page, touch: boolean, sel: string): Promise<void> {
  const l = page.locator(sel);
  if (touch) await l.tap();
  else await l.click();
}

test('Forfeit: disabled before 3:00 on Easy, then a confirm step, and the match ends as a forfeit with 20 Treat XP', async ({ page }, info) => {
  test.setTimeout(180_000);
  const touch = info.project.name === 'landscape';
  await start(page, VETERAN, '&speed=16');
  expect(await attr(page, 'difficulty')).toBe('easy');
  await openMenu(page, touch);
  const ff = page.locator('.pl-menu [data-a="forfeit"]');
  await expect(ff).toBeDisabled();
  await expect(ff).toHaveText('Forfeit from 3:00');
  await press(page, touch, '.pl-menu [data-a="resume"]');
  await expect(page.locator('.pl-menu')).toHaveCount(0);
  await page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5400, null, { timeout: 120_000 });
  await openMenu(page, touch);
  await expect(ff).toBeEnabled();
  await press(page, touch, '.pl-menu [data-a="forfeit"]');
  await expect(page.locator('.pl-menu')).toContainText('Forfeit this match?');
  await expect(page.locator('.pl-menu')).toContainText('20 Treat XP');
  // Keep playing goes back to the menu; nothing was sent
  await press(page, touch, '.pl-menu [data-a="forfeit-no"]');
  await expect(page.locator('.pl-menu [data-a="resume"]')).toBeVisible();
  await press(page, touch, '.pl-menu [data-a="forfeit"]');
  await press(page, touch, '.pl-menu [data-a="forfeit-yes"]');
  await expect(page.locator('.pl-menu')).toHaveCount(0);
  await expect.poll(() => attr(page, 'endReason'), { timeout: 10_000 }).toBe('forfeit');
  await page.waitForSelector('html[data-screen="results"]', { timeout: 30_000 });
  await expect(page.locator('.pl-results h1')).toHaveText('Defeat');
  await expect(page.locator('.pl-results [data-cause]')).toHaveText('You forfeited the match.');
  await expect(page.locator('.pl-results .pl-treats .head small')).toHaveText('+20 Treat XP');
  await expect(page.locator('.pl-results')).not.toContainText(/catnip/i);
});

test('Forfeit: matches 1–3 have no Forfeit button', async ({ page }, info) => {
  const touch = info.project.name === 'landscape';
  await start(page, FIRST_SESSION);
  await openMenu(page, touch);
  await expect(page.locator('.pl-menu [data-a="leave"]')).toBeVisible();
  await expect(page.locator('.pl-menu [data-a="forfeit"]')).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';

// Lobby redesign (lobby spec §3a), desktop 1280x720 and landscape 844x390: the Play call to action is visible and on
// top, the whole pedestal stays in frame (it was cut off at both sizes), Settings closes on Escape with focus back on
// its button, and the keyboard plays (Enter) into a live match after the stage dolly.

const PLAYED = { v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

async function seed(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
}

const frame = async (page: Page): Promise<number[]> =>
  (await page.evaluate(() => document.documentElement.dataset.lobbyFrame ?? '')).split(',').filter(Boolean).map(Number);

async function onTop(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
}

test('the lobby: Play on top, the whole pedestal in frame, named champion', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-lobby');
  const play = page.locator('.pl-lobby .pl-btn.big');
  await expect(play).toHaveText('Play as Sage');
  await expect(play).toBeInViewport();
  expect(await onTop(page, '.pl-lobby .pl-btn.big')).toBe(true);
  await expect(page.locator('.lb-hero')).toHaveText('Sage');
  // phones read one sub-line; desktop the role and element chips
  await expect(page.locator('.lb-sub')).toHaveText('Marksman · Wind');
  await expect(page.locator('.lb-name')).toHaveAttribute('data-a', 'name');
  // [hero top, pedestal front-bottom, pedestal left, pedestal right] in NDC
  await expect.poll(async () => (await frame(page)).length).toBe(4);
  const [top, bottom, left, right] = await frame(page);
  expect(top).toBeLessThanOrEqual(1);
  expect(bottom).toBeGreaterThanOrEqual(-1);
  expect(left).toBeGreaterThanOrEqual(-1);
  expect(right).toBeLessThanOrEqual(1);
  // no money words on the lobby
  await expect(page.locator('.pl-lobby')).not.toContainText(/\$|€|price|buy|donate/i);
});

test('Settings closes on Escape and gives focus back to its button', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('.pl-lobby');
  await page.locator('[data-a="settings"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pl-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-settings')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-a'))).toBe('settings');
  // the lobby takes clicks again
  expect(await onTop(page, '.pl-lobby .pl-btn.big')).toBe(true);
});

test('keyboard: the bots segment, then Enter plays into a live match', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('.pl-lobby');
  const seg = page.locator('.lb-seg, .lb-locked');
  await expect(seg).toHaveCount(1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-match="live"]', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
});

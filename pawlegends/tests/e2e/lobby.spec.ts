import { expect, test, type Page } from '@playwright/test';

// Home (HOME-MODES.md §4, was the lobby redesign), desktop 1280x720 and landscape 844x390: the round PLAY is visible and on
// top, the whole pedestal stays in frame (it was cut off at both sizes), Settings closes on Escape with focus back on
// its button, and the keyboard plays (Enter → Mode Select → Enter → Enter → LOCK IN) into a live match.

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
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  const play = page.locator('.pl-home .pl-btn.big');
  await expect(play).toHaveAttribute('aria-label', 'Play: choose a mode');
  await expect(play).toHaveText('PLAY');
  await expect(play).toBeInViewport();
  expect(await onTop(page, '.pl-home .pl-btn.big')).toBe(true);
  // Home (HOME-MODES.md §4): the champion's nameplate over the hero, a label (the champion is chosen after PLAY)
  await expect(page.locator('.hm-plate-n')).toHaveText(/^Sage/);
  await expect(page.locator('.hm-plate-s')).toHaveText('Marksman · Wind');
  await expect(page.locator('div.hm-plate')).toHaveCount(1);
  // [hero top, pedestal front-bottom, pedestal left, pedestal right] in NDC
  await expect.poll(async () => (await frame(page)).length).toBe(4);
  const [top, bottom, left, right] = await frame(page);
  expect(top).toBeLessThanOrEqual(1);
  expect(bottom).toBeGreaterThanOrEqual(-1);
  expect(left).toBeGreaterThanOrEqual(-1);
  expect(right).toBeLessThanOrEqual(1);
  // no money words on the lobby
  await expect(page.locator('.pl-home')).not.toContainText(/\$|€|price|buy|donate/i);
});

test('Settings closes on Escape and gives focus back to its button', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('.pl-home');
  await page.locator('[data-a="settings"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pl-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-settings')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-a'))).toBe('settings');
  // the lobby takes clicks again
  expect(await onTop(page, '.pl-home .pl-btn.big')).toBe(true);
});

test('keyboard: M opens Mode Select, Escape closes it; Enter, Enter, Enter, Ctrl+Enter plays', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('.pl-home');
  await page.locator('[data-testid="home-play"]').focus();
  await page.keyboard.press('m');
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'mode');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'variant');
  // the bots difficulty lives on the vs Bots variant
  await expect(page.locator('.ms-seg [data-d]').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.pl-pick'))).toBe(true);
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('html[data-match="live"]', { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
});

// NO-TOKENTAILS.md review: the pick tiles' and seat's element frame and portrait (`cardAttrs` + `.tt-pic`) need
// ui/cards/cards.css in the first load. It used to arrive only through the removed lobby card fan, and without it every
// pick portrait drew blank.
test('the champion select draws the tile and seat portraits on their element frame', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await page.locator('.hm-plate').click();
  await page.waitForSelector('html[data-screen="pick"] .cs-tile[data-h="clem"] .cs-face');
  const looks = await page.evaluate(() => {
    const face = document.querySelector<HTMLElement>('.cs-tile[data-h="clem"] .cs-face')!;
    const pic = face.querySelector<HTMLElement>('.tt-pic');
    return { frame: getComputedStyle(face).backgroundImage, picW: pic ? pic.getBoundingClientRect().width : 0 };
  });
  expect(looks.frame).not.toBe('none');
  expect(looks.picW).toBeGreaterThan(20);
});

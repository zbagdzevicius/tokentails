import { expect, test, type Page } from '@playwright/test';
import { serveSilhouettes, toChampSelect } from './helpers';
import { limit } from '../unit/cpu-budget';

// Home (HOME-MODES.md §4, was the lobby redesign), desktop 1280x720 and landscape 844x390: the round PLAY is visible and on
// top, the 3D hero stays wholly in frame on the poster (HOME-POSTER.md) (founder, Nov 13: Home shows the 3D champion), Settings
// closes on Escape with focus back on its button, and the keyboard plays (Enter → Mode Select → Enter → Enter → LOCK IN)
// into a live match.

const PLAYED = { v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

async function seed(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
  await serveSilhouettes(page);
}


const posterHero = async (page: Page): Promise<number[]> =>
  (await page.evaluate(() => document.documentElement.dataset.posterHero ?? '')).split(',').filter(Boolean).map(Number);

async function onTop(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
}

test('the lobby: Play on top, the 3D hero in frame on the poster, named champion', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  const play = page.locator('.pl-home .pl-btn.big');
  await expect(play).toHaveAttribute('aria-label', 'Play: 3v3 match');
  await expect(play).toHaveText('PLAY');
  await expect(play).toBeInViewport();
  expect(await onTop(page, '.pl-home .pl-btn.big')).toBe(true);
  // Home (HOME-MODES.md §4): the champion's nameplate over the hero, a label (the champion is chosen after PLAY)
  await expect(page.locator('.hm-plate-n')).toHaveText(/^Sage/);
  await expect(page.locator('.hm-plate-s')).toHaveText('Marksman · Wind');
  await expect(page.locator('.hm-plate')).toHaveCount(1);
  // Home shows the 3D hero (founder, Nov 13) on the drawn poster (HOME-POSTER.md, no pedestal), wholly in frame: its
  // drawn box [left, top, right, bottom] in CSS px; the painted stage is hidden and the canvas is visible
  await expect.poll(async () => (await posterHero(page)).length).toBe(4);
  const [left, top, right, bottom] = await posterHero(page);
  const vp = page.viewportSize()!;
  expect(top).toBeGreaterThanOrEqual(0);
  expect(bottom).toBeLessThanOrEqual(vp.height);
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeLessThanOrEqual(vp.width);
  await expect(page.locator('html')).toHaveAttribute('data-lobby-bg', 'poster');
  await expect(page.locator('.pl-stage')).toBeHidden();
  expect(await page.locator('#game-canvas').evaluate((c) => getComputedStyle(c).visibility)).toBe('visible');
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

test('keyboard: M does nothing, Enter plays (the 3v3 champion select), Ctrl+Enter locks in', async ({ page }) => {
  test.setTimeout(limit(120_000));
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('.pl-home');
  await page.locator('[data-testid="home-play"]').focus();
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-testid="mode-select"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // one main queue (MODE-UNLOCKS.md): no party server in this build, so PLAY is the 3v3 champion select vs bots
  await page.keyboard.press('Enter');
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.pl-pick'))).toBe(true);
  await page.keyboard.press('Control+Enter');
  // the match loads its programs behind the veil first: give it the same budget as every other spec's match start (a
  // loaded machine's swiftshader run hit the old 30 s cap in QA flaky-qa, and passed alone)
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(60_000) });
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
});

// NO-TOKENTAILS.md review: the pick tiles' and seat's element frame and portrait (`cardAttrs` + `.tt-pic`) need
// ui/cards/cards.css in the first load. It used to arrive only through the removed lobby card fan, and without it every
// pick portrait drew blank.
test('the champion select draws the tile and seat portraits on their element frame', async ({ page }) => {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await toChampSelect(page);
  await page.waitForSelector('html[data-screen="pick"] .cs-tile[data-h="clem"] .cs-face');
  const looks = await page.evaluate(() => {
    const face = document.querySelector<HTMLElement>('.cs-tile[data-h="clem"] .cs-face')!;
    const pic = face.querySelector<HTMLElement>('.tt-pic');
    return { frame: getComputedStyle(face).backgroundImage, picW: pic ? pic.getBoundingClientRect().width : 0 };
  });
  expect(looks.frame).not.toBe('none');
  expect(looks.picW).toBeGreaterThan(20);
});

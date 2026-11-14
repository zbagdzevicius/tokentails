import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

// Mode unlocking (docs/plans/moba/MODE-UNLOCKS.md, founder ask Nov 14): Mode Select shows never more than 3 big modes
// (Skirmish, Classic and one spotlight); every other mode is a small icon in the "More modes" strip, locked with its
// goal and progress until the player's matches and wins reach it. A finished match that crosses a goal shows "New mode
// unlocked" on the results, a NEW tag on PLAY, and the mode grows into the third tile, preselected. Veterans keep
// everything. Desktop runs at 1440x900, landscape at 844x390. Screenshots: ~/Downloads/paw-legends/modes-highlights/modes/.

const SHOTS = `${homedir()}/Downloads/paw-legends/modes-highlights/modes`;
const WEDNESDAY = Date.parse('2026-11-18T12:00:00Z');
const SATURDAY = Date.parse('2026-11-21T12:00:00Z');

/** A profile, and the page clock moved to `at` (Date.now only; time keeps flowing). */
async function seed(page: Page, profile: Record<string, unknown>, at: number, extra: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ([v, t, more]) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) {
        localStorage.setItem('tt.pawlegends.profile.v1', v as string);
        for (const [k, x] of Object.entries(more as Record<string, string>)) localStorage.setItem(k, x);
      }
      const real = Date.now.bind(Date);
      const off = (t as number) - real();
      Date.now = () => real() + off;
    },
    [JSON.stringify(profile), at, extra] as const,
  );
}

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
});

const touchOf = (name: string): boolean => name === 'landscape';
async function tap(page: Page, sel: string, touch: boolean): Promise<void> {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}
const shot = async (page: Page, step: string): Promise<void> => {
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png` });
};
const settle = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 10_000 });
const bigIds = (page: Page): Promise<string[]> => page.locator('[data-testid="mode-big"] .ms-pick').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mode ?? ''));
const moreIds = (page: Page): Promise<string[]> => page.locator('[data-testid="mode-more"] .ms-pick').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.mode ?? ''));

async function openModes(page: Page, touch: boolean): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  await settle(page);
}

test('a new player sees exactly 3 big modes; the rest are locked icons with their goals, and the play path holds', async ({ page }, info) => {
  const touch = touchOf(info.project.name);
  await seed(page, { v: 1, sessions: 2, matches: 1, wins: 0, hero: 'sage', firstPlaySession: 1 }, WEDNESDAY);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // the nav Ranked item names its goal and the progress
  await expect(page.locator('.hm-nav [data-a="locked"][data-why^="Ranked"]')).toHaveAttribute('data-why', 'Ranked: Finish 10 matches and win 3 (1/10, 0/3).');
  // no Cannon Chaos promo before Cannon Chaos is unlocked
  await expect(page.locator('.hm-slide[data-mode="cannon"]')).toHaveCount(0);
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  await settle(page);
  expect(await bigIds(page)).toEqual(['skirmish', 'classic', 'practice']);
  // the Weekly Twist (offline: the baked rotation) is an event: open, in the strip until 4 matches
  expect(await moreIds(page)).toEqual(['blitz', 'duel', 'onelane', 'cannon', 'ranked', 'twist', 'boss']);
  await expect(page.locator('[data-testid="mode-more"] [data-testid="mode-twist"]')).toHaveAttribute('data-state', 'event');
  const more = page.locator('[data-testid="mode-more"]');
  await expect(more.locator('[data-testid="mode-blitz"]')).toHaveAttribute('data-state', 'live');
  await expect(more.locator('[data-testid="mode-duel"]')).toHaveAttribute('data-state', 'locked');
  await expect(more.locator('[data-testid="mode-duel"]')).toContainText('1/2 matches');
  await expect(more.locator('[data-testid="mode-onelane"]')).toContainText('Win 1 match');
  await expect(more.locator('[data-testid="mode-ranked"]')).toContainText('1/10 matches');
  await expect(more.locator('[data-testid="mode-duel"]')).toHaveAttribute('aria-label', 'Duel, locked. Finish 2 matches (1/2)');
  // one screen: no scroll, every icon inside the viewport and at least 44 px
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const boxes = await page.locator('[data-testid="mode-select"] .ms-pick, [data-testid="mode-next"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: r.width, h: r.height, out: r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight };
    }),
  );
  expect(boxes.every((b) => b.w >= 44 && b.h >= 44 && !b.out)).toBe(true);
  await shot(page, 'new-player-modes');
  // a locked icon shakes and opens its sheet: how to unlock and how far along
  await tap(page, '[data-testid="mode-duel"]', touch);
  const sheet = page.locator('[data-testid="mode-lock-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Duel');
  await expect(sheet.locator('[data-testid="mode-lock-how"]')).toHaveText('Unlocks: finish 2 matches (1/2).');
  await expect(sheet.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '50');
  await shot(page, 'locked-sheet');
  await tap(page, '[data-testid="mode-lock-sheet"] .ms-pop-x', touch);
  await expect(sheet).toBeHidden();
  // the selection did not move to the locked mode
  await expect(page.locator('.ms-pick.on')).toHaveAttribute('data-mode', 'skirmish');
  if (!touch) {
    // arrow keys walk the open modes only (big tiles, then the open icons; locked ones are skipped)
    await page.locator('.ms-pick.on').focus();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      seen.push((await page.locator('.ms-pick.on').getAttribute('data-mode')) ?? '');
    }
    expect(seen).toEqual(['classic', 'practice', 'blitz', 'twist', 'skirmish']);
  }
  // an open strip icon goes down the one play path: mode → variant → champion select
  await tap(page, '[data-testid="mode-blitz"]', touch);
  await expect(page.locator('.ms-pick.on')).toHaveAttribute('data-mode', 'blitz');
  await tap(page, '[data-testid="mode-next"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toHaveAttribute('data-stage', 'variant');
  await tap(page, '[data-testid="variant-bots"]', touch);
  await tap(page, '[data-testid="mode-go"]', touch);
  await page.waitForSelector('html[data-screen="pick"]');
});

test('Boss Weekend takes the third tile for a new player, with its countdown', async ({ page }, info) => {
  const touch = touchOf(info.project.name);
  await seed(page, { v: 1, sessions: 2, matches: 1, wins: 0, hero: 'sage', firstPlaySession: 1 }, SATURDAY);
  await openModes(page, touch);
  expect(await bigIds(page)).toEqual(['skirmish', 'classic', 'boss']);
  await expect(page.locator('[data-testid="mode-big"] .ms-tile:has([data-mode="boss"]) .ms-chip.ev')).toContainText('⏱');
  expect((await moreIds(page))[0]).toBe('practice');
  await expect(page.locator('[data-testid="mode-more"] [data-testid="mode-practice"]')).toHaveAttribute('data-state', 'live');
  await shot(page, 'boss-weekend-modes');
});

test('a veteran keeps every mode: 3 big tiles, every icon open, Ranked live', async ({ page }, info) => {
  const touch = touchOf(info.project.name);
  await seed(page, { v: 1, sessions: 9, matches: 25, wins: 2, firstWinDone: true, hero: 'sage', firstPlaySession: 1 }, WEDNESDAY);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await expect(page.locator('.hm-nav [data-a="ranked"][data-live="1"]')).toBeVisible();
  await expect(page.locator('[data-testid="play-new"]')).toHaveCount(0);
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  await settle(page);
  expect((await bigIds(page)).length).toBe(3);
  await expect(page.locator('[data-testid="mode-select"] .ms-pick[data-state="locked"]')).toHaveCount(0);
  expect(await moreIds(page)).toContain('ranked');
  // the unlocks were written silently and ride the synced profile
  const unlocks = await page.evaluate(() => (JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}') as { unlocks?: string[] }).unlocks ?? []);
  expect(unlocks).toEqual(expect.arrayContaining(['mode.blitz', 'mode.duel', 'mode.onelane', 'mode.cannon', 'mode.ranked']));
  await shot(page, 'veteran-modes');
});

test('a finished match unlocks the next mode: results banner, NEW on PLAY, it grows into the third tile; playing it clears NEW', async ({ page }, info) => {
  test.setTimeout(480_000);
  const touch = touchOf(info.project.name);
  // one match done (Blitz open), no win yet: the next match unlocks Duel (and One Lane Brawl with a win)
  await seed(page, { v: 1, sessions: 2, matches: 1, wins: 0, hero: 'sage', trick: 'hiss', difficulty: 'easy', firstPlaySession: 1 }, WEDNESDAY);
  await page.goto('/?e2e=1&speed=64');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  await tap(page, '[data-testid="mode-skirmish"]', touch);
  await tap(page, '[data-testid="mode-next"]', touch);
  await tap(page, '[data-testid="variant-bots"]', touch);
  await tap(page, '[data-testid="mode-go"]', touch);
  await tap(page, '.pl-pick .cs-lock:not([disabled])', touch);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForSelector('html[data-screen="results"]', { timeout: 200_000 });
  const won = (await page.locator('.pl-results h1').textContent()) === 'Victory!';
  const banner = page.locator('[data-testid="results-mode-unlock"]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('New mode unlocked');
  await expect(banner).toContainText('Duel');
  await page.waitForSelector('.pl-results.actions-in', { timeout: 10_000 });
  await settle(page);
  await banner.scrollIntoViewIfNeeded();
  await shot(page, 'results-unlock-banner');
  await tap(page, '.pl-results [data-a="home"]', touch);
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // the NEW tag on PLAY until Mode Select opens
  await expect(page.locator('[data-testid="play-new"]')).toBeVisible();
  await settle(page);
  await shot(page, 'home-play-new');
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  const fresh = won ? 'onelane' : 'duel';
  const tile = page.locator(`[data-testid="mode-big"] [data-testid="mode-${fresh}"]`);
  await expect(tile).toBeVisible();
  expect(await bigIds(page)).toEqual(['skirmish', 'classic', fresh]);
  await expect(tile).toHaveClass(/\bon\b/);
  await expect(page.locator(`[data-testid="mode-big"] .ms-tile:has([data-mode="${fresh}"]) .ms-chip.new`)).toHaveText('NEW');
  await expect(page.locator('[data-testid="mode-big"] .ms-tile.ms-fresh')).toHaveCount(1);
  await settle(page);
  await shot(page, 'mode-select-new-spotlight');
  // a second open: the animation and the PLAY tag are done, NEW stays until a match of it
  await tap(page, '[data-testid="mode-back"]', touch);
  await expect(page.locator('[data-testid="play-new"]')).toHaveCount(0);
  // play it
  await tap(page, '[data-testid="home-play"]', touch);
  await tap(page, `[data-testid="mode-${fresh}"]`, touch);
  await tap(page, '[data-testid="mode-next"]', touch);
  await tap(page, '[data-testid="variant-bots"]', touch);
  await tap(page, '[data-testid="mode-go"]', touch);
  await tap(page, '.pl-pick .cs-lock:not([disabled])', touch);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForSelector('html[data-screen="results"]', { timeout: 200_000 });
  await page.waitForSelector('.pl-results.actions-in', { timeout: 10_000 });
  await tap(page, '.pl-results [data-a="home"]', touch);
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  // NEW is gone; the mode keeps the third tile only as the last mode chosen
  await expect(page.locator(`.ms-tile:has([data-mode="${fresh}"]) .ms-chip.new`)).toHaveCount(0);
  await expect(page.locator('.ms-tile.ms-fresh')).toHaveCount(0);
  expect((await bigIds(page)).length).toBe(3);
  const l = await page.evaluate(() => localStorage.getItem('pawlegends.modes.new'));
  expect(l ?? '').not.toContain(fresh);
});

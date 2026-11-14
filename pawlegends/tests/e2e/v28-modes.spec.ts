import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

// Sim v28 (docs/plans/moba/V28.md): One Lane Brawl, the Duel and Boss Weekend, each on the one play path (Home → PLAY →
// Mode Select → vs Bots → champion select → LOCK IN). The clock is moved to a Saturday so Boss Weekend is on.
// V28_SHOTS=1 saves each step to ~/Downloads/paw-legends/gaps3/sim28/.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const SHOTS = process.env.V28_SHOTS ? `${homedir()}/Downloads/paw-legends/gaps3/sim28` : '';
const SATURDAY = Date.parse('2026-11-14T12:00:00Z');

async function seed(page: Page): Promise<void> {
  await page.addInitScript(
    ([v, sat]) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v as string);
      // Boss Weekend runs Friday to Monday UTC: shift the page's clock to a Saturday (the flow of time is kept)
      const real = Date.now.bind(Date);
      const off = (sat as number) - real();
      Date.now = () => real() + off;
    },
    [JSON.stringify(PLAYED), SATURDAY],
  );
}

const shot = async (page: Page, step: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize()!;
  await page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png` });
};

async function tap(page: Page, sel: string, touch: boolean): Promise<void> {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}

async function startMode(page: Page, mode: string, touch: boolean): Promise<void> {
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toBeVisible();
  await tap(page, `[data-testid="mode-${mode}"]`, touch);
  await shot(page, `${mode}-1-mode`);
  await tap(page, '[data-testid="mode-next"]', touch);
  await expect(ms).toHaveAttribute('data-stage', 'variant');
  await expect(ms.locator('.ms-var')).toHaveCount(1);
  await tap(page, '[data-testid="mode-go"]', touch);
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await tap(page, '.cs-lock', touch);
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30_000 });
}

test('Mode Select lists One Lane Brawl, the Duel and (on a weekend) Boss Weekend, all playable', async ({ page }, info) => {
  const touch = info.project.name === 'landscape';
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  const ms = page.locator('[data-testid="mode-select"]');
  for (const id of ['onelane', 'duel', 'boss']) {
    await expect(ms.locator(`[data-testid="mode-${id}"]`)).toBeVisible();
    await expect(ms.locator(`[data-testid="mode-${id}"]`)).not.toHaveAttribute('aria-disabled', 'true');
  }
  await expect(ms.locator('[data-testid="mode-duel"]')).toContainText('1v1');
  await shot(page, 'modes');
});

test('on a weekend the Home promo leads with Boss Weekend and opens Mode Select on it', async ({ page }, info) => {
  const touch = info.project.name === 'landscape';
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  const slide = page.locator('.hm-promo .hm-slide').first();
  await expect(slide).toHaveAttribute('data-mode', 'boss');
  await expect(slide).toContainText('Boss Weekend');
  await tap(page, '.hm-promo .hm-slide.on', touch);
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms).toBeVisible();
  await expect(ms.locator('[data-testid="mode-boss"]')).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'promo-boss');
});

test('One Lane Brawl: a live match on the Sunny Lane strip at level 3, no Nap', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const touch = info.project.name === 'landscape';
  await startMode(page, 'onelane', touch);
  await expect(page.locator('.pl-portrait .lvl')).toHaveText('3', { timeout: 15_000 });
  await page.waitForTimeout(1500);
  await shot(page, 'onelane-match');
  expect(errors).toEqual([]);
});

test('Duel: one enemy portrait, no allies in the strip', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const touch = info.project.name === 'landscape';
  await startMode(page, 'duel', touch);
  await expect(page.locator('.pl-strip.ally .pp')).toHaveCount(0);
  await expect(page.locator('.pl-strip.enemy .pp')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await shot(page, 'duel-match');
  expect(errors).toEqual([]);
});

test('Boss Weekend: the boss bar takes the score plate, the boss is the one enemy', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const touch = info.project.name === 'landscape';
  await startMode(page, 'boss', touch);
  const bar = page.locator('.pl-bossbar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Mega Brutus');
  await expect(bar).toContainText('Phase 1');
  await expect(page.locator('.pl-strip.enemy .pp')).toHaveCount(1);
  const plate = (await page.locator('.pl-score').boundingBox())!;
  expect(plate.height).toBeLessThanOrEqual(touch ? 48 : 56);
  await page.waitForTimeout(2000);
  await shot(page, 'boss-match');
  expect(errors).toEqual([]);
});

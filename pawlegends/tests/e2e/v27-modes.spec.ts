import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

// Sim v27 (docs/plans/moba/V27.md): the Practice ground, Cannon Chaos and the Weekly Twist, each on the one play path
// (Home → PLAY → Mode Select → vs Bots → champion select → LOCK IN). Practice: three dummies, Reset / Level +1 /
// Cooldowns in the top plate (the score's place), Leave goes straight Home and saves nothing. V27_SHOTS=1 saves each
// step to ~/Downloads/paw-legends/gaps2/sim27/.

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const SHOTS = process.env.V27_SHOTS ? `${homedir()}/Downloads/paw-legends/gaps2/sim27` : '';

async function seed(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
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
  // vs Bots only
  await expect(ms.locator('.ms-var')).toHaveCount(1);
  await tap(page, '[data-testid="mode-go"]', touch);
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await tap(page, '.cs-lock', touch);
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30_000 });
}

test('Mode Select lists Cannon Chaos and Practice live and the Weekly Twist as the featured timed event', async ({ page }, info) => {
  const touch = info.project.name === 'landscape';
  await seed(page);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  const ms = page.locator('[data-testid="mode-select"]');
  await expect(ms.locator('[data-testid="mode-cannon"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(ms.locator('[data-testid="mode-practice"]')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(ms.locator('[data-testid="mode-twist"]')).toBeVisible();
  await expect(ms.locator('[data-testid="mode-twist"]')).toContainText(/Toy Box|Rapid Paws|Bounty Hunt/);
  await expect(ms).not.toContainText('Coming soon');
  await shot(page, 'modes');
});

test('Practice: dummies, the three controls in the top plate, Level +1 works, Leave goes Home and saves nothing', async ({ page }, info) => {
  test.setTimeout(150_000);
  const touch = info.project.name === 'landscape';
  await startMode(page, 'practice', touch);
  const bar = page.locator('.pl-practice');
  await expect(bar).toBeVisible();
  await expect(bar.locator('button')).toHaveText(['Reset', 'Level +1', 'Cooldowns']);
  // the score's place: no team score in Practice, and the plate is no taller than a normal match's
  await expect(page.locator('.pl-score .team.t0')).toBeHidden();
  const plate = (await page.locator('.pl-score').boundingBox())!;
  expect(plate.height).toBeLessThanOrEqual(touch ? 48 : 56);
  await expect(page.locator('.pl-portrait .lvl')).toHaveText('1');
  await tap(page, '.pl-practice button[data-k="1"]', touch);
  await expect(page.locator('.pl-portrait .lvl')).toHaveText('2', { timeout: 10_000 });
  await tap(page, '.pl-practice button[data-k="0"]', touch);
  await tap(page, '.pl-practice button[data-k="2"]', touch);
  await page.waitForTimeout(800);
  await shot(page, 'practice-match');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').matches);
  // Leave (no Forfeit in Practice) goes straight Home
  if (touch) await tap(page, '.pl-pause', true);
  else await page.keyboard.press('Escape');
  await expect(page.locator('.pl-menu')).toBeVisible();
  await expect(page.locator('.pl-menu [data-a="forfeit"]')).toHaveCount(0);
  await tap(page, '.pl-menu [data-a="leave"]', touch);
  await expect(page.locator('.pl-menu')).toContainText('This match is not saved.');
  await tap(page, '.pl-menu [data-a="leave-yes"]', touch);
  await page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 20_000 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}').matches);
  expect(after).toBe(before);
});

test('Cannon Chaos: a live Crossing match that starts at level 3', async ({ page }, info) => {
  test.setTimeout(150_000);
  const touch = info.project.name === 'landscape';
  await startMode(page, 'cannon', touch);
  await expect(page.locator('.pl-portrait .lvl')).toHaveText('3', { timeout: 15_000 });
  await expect(page.locator('.pl-practice')).toHaveCount(0);
  await page.waitForTimeout(1000);
  await shot(page, 'cannon-match');
});

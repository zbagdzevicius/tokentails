import { expect, test, type Page } from '@playwright/test';

/** Captures navigator.share / clipboard text instead of opening a sheet. */
async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { text?: string }) => {
        w.__shared.push(d.text ?? '');
      },
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);

test('a finished race offers clip, dare, daily, your cat and Pink Paw; the dare link races the ghost', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubShare(page);
  await page.goto('/?bot=1&seed=5&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  const btns = page.locator('.fm-overlay [data-x]');
  await expect(btns).toHaveCount(5);
  await expect(btns.nth(1)).toContainText('Beat');
  await expect(btns.nth(2)).toContainText('Daily Cup');
  await expect(btns.nth(3)).toContainText('YOUR cat');
  await expect(btns.nth(4)).toContainText('Pink Paw');
  await page.screenshot({ path: 'e2e/screens/share-results.png' });

  await btns.nth(1).click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
  const text = (await shared(page))[0];
  expect(text).toContain('#formulameow');
  expect(text).toContain('https://tokentails.com/shelter-payouts');
  const link = text.split('\n').find((l) => l.includes('#g='))!;
  expect(link).toBeTruthy();
  const hash = link.slice(link.indexOf('#'));

  // open the dare: same track and seed, the ghost kart is in the scene
  await page.goto(`/?bot=1&speed=8${hash}`);
  await expect(page.locator('.fm-dare-banner')).toBeVisible({ timeout: 15_000 });
  const ghost = await page.evaluate(() => {
    const fm = (window as unknown as { __fm?: { shell: { stage: { scene: { getObjectByName(n: string): unknown } }; setup: { seed: number } } } }).__fm!;
    return { kart: !!fm.shell.stage.scene.getObjectByName('kart-Tofu'), seed: fm.shell.setup.seed };
  });
  expect(ghost.kart).toBe(true);
  expect(ghost.seed).toBe(5);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/screens/dare-ghost.png' });
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await expect(page.locator('.fm-overlay.on')).toContainText("Tofu's ghost");
  await expect(page.locator('.fm-overlay.on')).toContainText('Rivalry: You');
  expect(errors).toEqual([]);
});

test('the daily route races the Daily Cup and shares a Wordle-style card', async ({ page }) => {
  await stubShare(page);
  await page.goto('/?daily=1&bot=1&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await expect(page.locator('.fm-overlay.on')).toContainText('Daily Cup #1');
  await page.locator('.fm-overlay [data-x="2"]').click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
  expect((await shared(page))[0]).toMatch(/^Formula Meow Daily #1 · \d+(st|nd|rd|th)\/8 · /);
});

test('the cat maker opens from the results and closes', async ({ page }) => {
  await page.goto('/?bot=1&seed=9&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await page.locator('.fm-overlay [data-x="3"]').click();
  await expect(page.locator('.fm-maker')).toBeVisible();
  await expect(page.locator('.fm-maker')).toContainText('stays on this device');
  await page.screenshot({ path: 'e2e/screens/maker.png' });
  await page.locator('.fm-maker [data-act="close"]').click();
  await expect(page.locator('.fm-maker')).toHaveCount(0);
});

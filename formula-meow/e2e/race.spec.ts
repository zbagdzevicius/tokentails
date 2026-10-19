import { expect, test, type Page } from '@playwright/test';

interface Probe {
  tick: number;
  phase: string;
  dist: number;
  lap: number;
  finished: number;
}

async function probe(page: Page): Promise<Probe | null> {
  return page.evaluate(() => {
    const fm = (window as unknown as { __fm?: { shell: { world: { st: { tick: number; phase: string; karts: Array<{ dist: number; lap: number; finished: number }> } } } } }).__fm;
    const w = fm?.shell.world;
    if (!w) return null;
    const k = w.st.karts[5];
    return { tick: w.st.tick, phase: w.st.phase, dist: k.dist, lap: k.lap, finished: k.finished };
  });
}

test('the link opens straight onto the grid and a race runs (no menu first)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?bot=1&seed=3');
  await expect(page.locator('canvas.fm-canvas')).toBeVisible();
  await expect(page.locator('.fm-pos')).toContainText('/8');
  await expect.poll(async () => (await probe(page))?.phase, { timeout: 30_000 }).toBe('race');
  await expect.poll(async () => (await probe(page))?.dist ?? 0, { timeout: 60_000 }).toBeGreaterThan(40);
  await page.screenshot({ path: 'e2e/screens/kitchen-race.png' });
  expect(errors).toEqual([]);
});

test('a full race ends on the results screen with Again and Next track', async ({ page }) => {
  await page.goto('/?bot=1&seed=5&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await expect(page.locator('[data-act="again"]')).toBeVisible();
  await expect(page.locator('[data-act="next"]')).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/results.png' });
  await page.locator('[data-act="next"]').click();
  await expect.poll(async () => (await probe(page))?.tick ?? 999, { timeout: 10_000 }).toBeLessThan(400);
});

test('Neon Rooftops renders at night with the touch controls on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/?track=rooftops&seed=2');
  await expect(page.locator('canvas.fm-canvas')).toBeVisible();
  await page.touchscreen.tap(300, 700);
  await expect(page.locator('.fm-touch.on')).toBeVisible();
  await expect.poll(async () => (await probe(page))?.phase, { timeout: 30_000 }).toBe('race');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screens/rooftops-touch.png' });
  await ctx.close();
});

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

test('a keyboard driver races 20 s with every lane installed and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?seed=11');
  await expect(page.locator('canvas.fm-canvas')).toBeVisible();
  await page.mouse.click(195, 300); // a user gesture unlocks audio (an overlay may sit on the canvas)
  await expect.poll(async () => (await probe(page))?.phase, { timeout: 30_000 }).toBe('race');
  const start = (await probe(page))!;
  await page.keyboard.down('ArrowUp');
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 20_000) {
    const key = i % 3 === 0 ? 'ArrowLeft' : i % 3 === 1 ? 'ArrowRight' : 'Space';
    await page.keyboard.down(key);
    await page.waitForTimeout(350);
    await page.keyboard.up(key);
    await page.waitForTimeout(650);
    i++;
  }
  await page.keyboard.up('ArrowUp');
  const end = (await probe(page))!;
  expect(end.tick).toBeGreaterThan(start.tick);
  expect(end.dist).toBeGreaterThan(start.dist + 20);
  await page.screenshot({ path: 'e2e/screens/keyboard-20s.png' });
  expect(errors).toEqual([]);
});

test('on a phone the grid waits for the first tap, shows the thumbs, and a tap on the countdown is the start press', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/?seed=11');
  await expect(page.locator('canvas.fm-canvas')).toBeVisible();
  await expect(page.locator('.fm-tap.on')).toContainText('TAP TO RACE');
  await expect(page.locator('.fm-touch.ghost .fm-thumbs')).toBeVisible();
  await page.waitForTimeout(2500);
  expect((await probe(page))?.tick).toBe(0);
  await page.screenshot({ path: 'e2e/screens/phone-grid.png' });
  await page.touchscreen.tap(195, 200);
  await expect(page.locator('.fm-tap.on')).toHaveCount(0);
  await expect.poll(async () => (await probe(page))?.tick ?? 0, { timeout: 10_000 }).toBeGreaterThan(30);
  // tap the countdown text near GO: judged as the Pounce Start press (top of the screen counts during the countdown)
  await expect.poll(async () => (await probe(page))?.tick ?? 0, { timeout: 30_000 }).toBeGreaterThan(150);
  await page.touchscreen.tap(195, 300);
  const judged = () => page.evaluate(() => (window as unknown as { __fm: { shell: { world: { st: { karts: Array<{ startJudged: number }> } } } } }).__fm.shell.world.st.karts[5].startJudged);
  await expect.poll(judged, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await probe(page))?.phase, { timeout: 30_000 }).toBe('race');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/screens/phone-race.png' });
  await ctx.close();
});

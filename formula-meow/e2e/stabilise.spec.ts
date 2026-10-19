import { expect, test, type Page } from '@playwright/test';

/** Iteration 2 Stabilise: old links, restarts without leaks, pause and Esc, broken dare links, no console errors. */

type Fm = {
  shell: {
    world: { st: { tick: number; phase: string; karts: Array<{ startJudged: number }> } } | null;
    setup: { seed: number; mode?: string } | null;
    stage: { renderer: { info: { memory: { textures: number; geometries: number } } } };
    restart(): void;
    isPaused: boolean;
  };
};

const fm = (page: Page) => page.evaluate(() => !!(window as unknown as { __fm?: Fm }).__fm);
const tick = (page: Page) => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.tick ?? 0);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('an old v3 dare link opens as a target-time race with the version notice', async ({ page }) => {
  const errors = watchErrors(page);
  // made by v1 (SIM_VERSION 3): Kitchen, seed 5, Kitten, slot 5
  await page.goto('/?bot=1#g=EDPmVy8AAAAFAFADAAgFyFcQXAngBcCpQA&n=Mia');
  await expect(page.locator('body')).toContainText('another version of the game', { timeout: 15_000 });
  await expect.poll(() => fm(page)).toBe(true);
  const setup = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.setup);
  expect(setup?.seed).toBe(5);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('a broken dare link says so (B47)', async ({ page }) => {
  await page.goto('/?bot=1#g=EDPmVy8AAAAF');
  await expect(page.locator('body')).toContainText('That dare link is broken', { timeout: 15_000 });
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(100);
});

test('12 restarts do not leak textures or geometries (B57)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=3');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(120);
  const mem = () => page.evaluate(() => ({ ...(window as unknown as { __fm: Fm }).__fm.shell.stage.renderer.info.memory }));
  // restart once and settle, so every lazily created resource of the first race exists
  await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
  await page.waitForTimeout(2200);
  const first = await mem();
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
    // B61: restart during the countdown, while the programs may still be linking
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2500);
  const after = await mem();
  expect(after.textures).toBeLessThanOrEqual(first.textures + 2);
  expect(after.geometries).toBeLessThanOrEqual(first.geometries + 2);
  expect(errors).toEqual([]);
});

test('Esc pauses and resumes; the pause screen has Resume and Restart, and a hidden tab pauses only once (B34, B38)', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(60);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] [data-act="resume"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] [data-act="restart"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] select')).toHaveCount(0);
  const t0 = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
  await expect.poll(() => tick(page)).toBeGreaterThan(t0);
  // idempotent pause: the hidden-tab path twice in a row leaves it paused
  await page.evaluate(() => {
    const s = (window as unknown as { __fm: { shell: { pause(on: boolean): void } } }).__fm.shell;
    s.pause(true);
    s.pause(true);
  });
  expect(await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.isPaused)).toBe(true);
});

test('the Tracks screen hides the pause panel under it (B46)', async ({ page }) => {
  await page.goto('/?seed=4');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(30);
  await page.locator('.fm-menu-btn').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.locator('.fm-ugc-btn').click();
  await expect(page.locator('[data-screen="tracks"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"]')).toBeHidden();
  await page.locator('[data-screen="tracks"] [data-a="close"]').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
});

test('a resting steer thumb before GO is not an early start (B23)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // not the first race (the first one forgives early presses anyway)
  await ctx.addInitScript(() => {
    localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: {}, slots: { core: { races: 3, unlocked: 0, pounces: 2, drifts: 2, bestTimes: {} } } }));
  });
  const page = await ctx.newPage();
  await page.goto('/?seed=11');
  await page.touchscreen.tap(300, 200); // first tap on the top: arms the countdown
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(10);
  // hold the left thumb down through the countdown (CDP touch: start, then end after GO)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 700, id: 1 }] });
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const judged = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.st.karts[5].startJudged);
  expect(judged).not.toBe(3);
  const events = await page.evaluate(() => (window as unknown as { __fm: { shell: { world: { st: { events: Array<{ type: string; kart: number }> } } } } }).__fm.shell.world.st.events.filter((e) => e.kart === 5).map((e) => e.type));
  expect(events).not.toContain('stall');
  await ctx.close();
});

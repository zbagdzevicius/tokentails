import { expect, test, type Page } from '@playwright/test';
import { startFirstMatch } from './helpers';

// Camera polish 2026-11-06 (founder: "zoomed in a little too much"): the default match camera is ~17% further out
// (desktop 27 × 1.03 m, short landscape phones × 0.75), and the player zoom (wheel, +/−, pinch, the pause-menu and
// Settings slider) changes the camera distance and is remembered across a reload.

const KEY = 'pawlegends.zoom.v2';
/** renderer.ts MOBA_DIST × the old default zoom 0.88 (desktop) and × 0.75 on short landscape phones. */
const OLD = { desktop: 27 * 0.88, landscape: 27 * 0.88 * 0.75 };

const cam = (page: Page): Promise<{ dist: number; target: number }> =>
  page.evaluate(() => {
    const v = (window as unknown as { __plWorld: { view: { gr: { dist: number }; zoomTarget: number } } }).__plWorld.view;
    return { dist: v.gr.dist, target: v.zoomTarget };
  });
const saved = (page: Page): Promise<string | null> => page.evaluate((k) => localStorage.getItem(k), KEY);

test('the default camera is further out than before, +/− and the wheel zoom it, the choice survives a reload', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keys and wheel');
  test.setTimeout(120_000);
  await startFirstMatch(page);
  await expect.poll(async () => (await cam(page)).dist, { timeout: 10000 }).toBeGreaterThan(OLD.desktop * 1.14);
  const d0 = (await cam(page)).dist;
  expect(d0).toBeLessThan(OLD.desktop * 1.21);
  expect(await saved(page)).toBeNull();

  // − twice: further out (a key works like a wheel notch), saved at once
  await page.keyboard.press('Minus');
  await page.keyboard.press('Minus');
  const out = (await cam(page)).target;
  expect(out).toBeGreaterThan(1.03 * 1.15);
  expect(Number(await saved(page))).toBeCloseTo(out, 2);
  await expect.poll(async () => (await cam(page)).dist, { timeout: 5000 }).toBeGreaterThan(d0 * 1.12);

  // + and the wheel: back in
  await page.keyboard.press('Equal');
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await cam(page)).target).toBeLessThan(out);

  // the pause menu's slider moves the live camera
  await page.keyboard.press('Escape');
  const slider = page.locator('.pl-menu input[data-zoom]');
  await expect(slider).toBeVisible();
  await slider.evaluate((el: HTMLInputElement) => {
    el.value = '1.3';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.pl-menu [data-zoom-out]')).toHaveText(`${Math.round((1.3 / 1.03) * 100)}%`);
  expect(Number(await saved(page))).toBeCloseTo(1.3, 2);
  expect((await cam(page)).target).toBeCloseTo(1.3, 2);

  // reload: the next match starts at the saved zoom
  await startFirstMatch(page);
  expect((await cam(page)).target).toBeCloseTo(1.3, 2);
  await expect.poll(async () => (await cam(page)).dist, { timeout: 10000 }).toBeGreaterThan(27 * 1.29);
});

test('Settings has the camera zoom slider, at 100% by default; Reset brings a moved one back', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough');
  await page.addInitScript((k) => localStorage.setItem(k, '1.2'), KEY);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="settings"]').first().click();
  const out = page.locator('.pl-settings [data-zoom-out]');
  await expect(out).toHaveText(`${Math.round((1.2 / 1.03) * 100)}%`);
  await page.locator('.pl-settings [data-zoom-reset]').click();
  await expect(out).toHaveText('100%');
  expect(Number(await saved(page))).toBeCloseTo(1.03, 2);
});

test('phones: the default camera is further out, and a two-finger pinch zooms and is remembered', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch');
  test.setTimeout(120_000);
  await startFirstMatch(page);
  await expect.poll(async () => (await cam(page)).dist, { timeout: 10000 }).toBeGreaterThan(OLD.landscape * 1.14);
  const z0 = (await cam(page)).target;
  // two fingers on the bare field (the first on the joystick half): spread them apart → closer
  const cdp = await page.context().newCDPSession(page);
  const pts = (gap: number) => [
    { x: 400 - gap, y: 210, id: 1 },
    { x: 400 + gap, y: 210, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts(40)[0]] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(40 + i * 5) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await cam(page)).target).toBeLessThan(z0 * 0.8);
  const pinched = (await cam(page)).target;
  await expect.poll(async () => Number(await saved(page))).toBeCloseTo(pinched, 2);
  // the joystick finger let go: no stick is left on screen
  await expect(page.locator('.pl-stick.on')).toHaveCount(0);
});

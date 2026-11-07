import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

// MAP-GAPS A2 + A21: on a 667x375 phone a finger dragged over the minimap scrubs the camera with it and the camera
// goes back to the hero about 0.6 s after the lift; a long press pings Go here without moving the camera; a double
// tap is a move order.
test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

const focus = (page: Page): Promise<{ x: number; z: number }> =>
  page.evaluate(() => {
    const v = (window as unknown as { __plWorld: { view: { gr: { focus: { x: number; z: number } } } } }).__plWorld.view;
    return { x: v.gr.focus.x, z: v.gr.focus.z };
  });

test('touch minimap: drag scrubs, release returns, long press pings without panning, double tap moves', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  await startFirstMatch(page);
  await page.waitForTimeout(1500);
  const home = await focus(page);
  const mm = (await page.locator('.pl-minimap canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const at = (u: number, v: number): [number, number] => [mm.x + mm.width * u, mm.y + mm.height * v];

  // drag from 30% to 70% across: the focus follows the finger (map x 30 → 70 m)
  await touch('touchStart', ...at(0.3, 0.5));
  for (let k = 1; k <= 8; k++) {
    await touch('touchMove', ...at(0.3 + (0.4 * k) / 8, 0.5));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(700);
  const held = await focus(page);
  expect(held.x).toBeGreaterThan(55);
  // still held while the finger is down
  await page.waitForTimeout(800);
  expect((await focus(page)).x).toBeGreaterThan(55);
  await touch('touchEnd');
  // back toward the hero soon after the lift (0.6 s hold, then the ease)
  await expect.poll(async () => Math.abs((await focus(page)).x - home.x), { timeout: 4000 }).toBeLessThan(6);

  // a long press pings and leaves the camera where it was
  await page.waitForTimeout(1200);
  const before = await focus(page);
  await touch('touchStart', ...at(0.6, 0.3));
  await page.waitForTimeout(700);
  await touch('touchEnd');
  await expect.poll(() => attr(page, 'pingsSent')).toBe('1');
  const after = await focus(page);
  expect(Math.abs(after.x - before.x)).toBeLessThan(2);
  expect(Math.abs(after.z - before.z)).toBeLessThan(2);
});

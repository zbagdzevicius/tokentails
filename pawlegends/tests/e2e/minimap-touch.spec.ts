import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

// Feel pass B1 (hold to peek, as in Wild Rift and MLBB): on a 667x375 phone a finger on the minimap centres the
// camera there at once and drags it along while held; the lift brings it back to the hero within 150 ms (plus a frame
// or two). A long press peeks too (pings go through the ping button). MAP-GAPS A21: a double tap is a move order.
test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

const focus = (page: Page): Promise<{ x: number; z: number }> =>
  page.evaluate(() => {
    const v = (window as unknown as { __plWorld: { view: { gr: { focus: { x: number; z: number } } } } }).__plWorld.view;
    return { x: v.gr.focus.x, z: v.gr.focus.z };
  });

const hero = (page: Page): Promise<{ x: number; z: number }> =>
  page.evaluate(() => {
    const v = (window as unknown as { __plWorld: { view: { follow: { x: number; z: number } } } }).__plWorld.view;
    return { x: v.follow.x, z: v.follow.z };
  });
const off = async (page: Page): Promise<number> => {
  const [f, h] = await Promise.all([focus(page), hero(page)]);
  return Math.hypot(f.x - h.x, f.z - h.z);
};

test('touch minimap: hold peeks at once and drags, the lift returns in ~150 ms, double tap moves', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  await startFirstMatch(page);
  await page.waitForTimeout(1500);
  expect(await off(page)).toBeLessThan(0.05);
  const mm = (await page.locator('.pl-minimap canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const at = (u: number, v: number): [number, number] => [mm.x + mm.width * u, mm.y + mm.height * v];

  // the far side of the map: the camera is there at once while the finger holds
  await touch('touchStart', ...at(0.8, 0.25));
  await page.waitForTimeout(120);
  const p1 = await focus(page);
  expect(await off(page)).toBeGreaterThan(15);
  // the finger slides: the view follows it
  for (let k = 1; k <= 6; k++) {
    await touch('touchMove', ...at(0.8 - (0.4 * k) / 6, 0.25 + (0.4 * k) / 6));
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(120);
  const p2 = await focus(page);
  expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeGreaterThan(8);
  // still held after a while (no drift back while the finger is down)
  await page.waitForTimeout(900);
  const p3 = await focus(page);
  expect(Math.hypot(p3.x - p2.x, p3.z - p2.z)).toBeLessThan(0.5);
  await touch('touchEnd');
  const t0 = Date.now();
  await expect.poll(() => off(page), { timeout: 3000, intervals: [30] }).toBeLessThan(0.05);
  // 150 ms ease plus frame and CDP latency under load
  expect(Date.now() - t0).toBeLessThan(900);

  // MAP-GAPS A21: a double tap is a move order there (Op.Move = 1)
  await page.waitForTimeout(400);
  expect((await attr(page, 'ops')).split(',').filter(Boolean).map(Number).at(-1)).not.toBe(1);
  await touch('touchStart', ...at(0.3, 0.6));
  await touch('touchEnd');
  await page.waitForTimeout(120);
  await touch('touchStart', ...at(0.3, 0.6));
  await touch('touchEnd');
  await expect.poll(async () => (await attr(page, 'ops')).split(',').filter(Boolean).map(Number).at(-1)).toBe(1);
});

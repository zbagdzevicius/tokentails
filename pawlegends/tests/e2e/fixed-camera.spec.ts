import { expect, test, type Page } from '@playwright/test';
import { startFirstMatch } from './helpers';

// Feel pass B1 (docs/plans/moba/FEEL-PASS.md): the camera is fixed on the hero, as in Mobile Legends. While the hero
// walks, the hero's screen spot never moves (±2 px of 50% across, 54% down) at 667x375 and 844x390.

/** The own hero's screen px (its interpolated render position projected through the match camera). */
const heroPx = (page: Page): Promise<[number, number] | null> =>
  page.evaluate(() => {
    const v = (window as unknown as { __plWorld: { view: { follow: { x: number; z: number }; gr: { camera: { position: { constructor: new () => { set(x: number, y: number, z: number): { project(c: unknown): { x: number; y: number } } } } } } } } }).__plWorld.view;
    const cam = v.gr.camera;
    const p = new cam.position.constructor().set(v.follow.x, 0, v.follow.z).project(cam);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
  });

/**
 * The own hero MODEL's screen px: where its rig was drawn this frame (after the visual push-apart), so a camera that
 * drifted off the model (a lead, a lag) shows, not only the follow point the camera is built on.
 */
const modelPx = (page: Page): Promise<[number, number] | null> =>
  page.evaluate(() => {
    type P = { x: number; z: number };
    const v = (window as unknown as { __plWorld: { view: { lastMe: { id: number } | null; heroes: { drawnAt(id: number): P | null }; gr: { camera: { position: { constructor: new () => { set(x: number, y: number, z: number): { project(c: unknown): { x: number; y: number } } } } } } } } }).__plWorld.view;
    const at = v.lastMe ? v.heroes.drawnAt(v.lastMe.id) : null;
    if (!at) return null;
    const cam = v.gr.camera;
    const p = new cam.position.constructor().set(at.x, 0, at.z).project(cam);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
  });

for (const [w, h] of [
  [667, 375],
  [844, 390],
] as const) {
  test(`${w}x${h}: the hero holds its screen spot while walking (no drift, no lead)`, async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'touch phone sizes');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: w, height: h });
    await startFirstMatch(page);
    await page.waitForTimeout(800);
    const cdp = await page.context().newCDPSession(page);
    const x0 = w * 0.18;
    const y0 = h * 0.68;
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const start = await page.evaluate(() => {
      const f = (window as unknown as { __plWorld: { view: { follow: { x: number; z: number } } } }).__plWorld.view.follow;
      return { x: f.x, z: f.z };
    });
    await send('touchStart', x0, y0);
    for (let i = 1; i <= 5; i++) await send('touchMove', x0 + i * 12, y0 - i * 8);
    const xs: number[] = [];
    const ys: number[] = [];
    const models: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const s = await heroPx(page);
      if (s) {
        xs.push(s[0]);
        ys.push(s[1]);
      }
      const m = await modelPx(page);
      if (m) models.push(m);
      await page.waitForTimeout(80);
    }
    await send('touchEnd');
    const end = await page.evaluate(() => {
      const f = (window as unknown as { __plWorld: { view: { follow: { x: number; z: number } } } }).__plWorld.view.follow;
      return { x: f.x, z: f.z };
    });
    expect(Math.hypot(end.x - start.x, end.z - start.z), 'the hero walked').toBeGreaterThan(2);
    for (const x of xs) expect(Math.abs(x - w * 0.5)).toBeLessThanOrEqual(2);
    for (const y of ys) expect(Math.abs(y - h * 0.54)).toBeLessThanOrEqual(2);
    // the drawn model too. It sits up to ~1 m off the follow point while the visual push-apart (heroes crowding the
    // fountain) eases out, so: within 32 px of the spot, and never drifting away while walking (a lead or a lag would
    // grow from the first sample as the hero speeds up)
    expect(models.length).toBeGreaterThan(10);
    const offs = models.map(([x, y]) => Math.hypot(x - w * 0.5, y - h * 0.54));
    for (const o of offs) expect(o, `model offsets ${JSON.stringify(offs)}`).toBeLessThanOrEqual(32);
    expect(offs.at(-1)!, `model offsets ${JSON.stringify(offs)}`).toBeLessThanOrEqual(offs[0] + 4);
  });
}

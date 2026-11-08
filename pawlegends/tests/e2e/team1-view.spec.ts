import { expect, test, type Page } from '@playwright/test';
import { me, startFirstMatch } from './helpers';

// MAP-GAPS A24 + feel pass B2: the map is diagonal and each seat sees its own base bottom left, the enemy's top right
// (team 1: turned another 180°): the enemy core projects right of and above its own, the stick pushed right walks
// toward the enemy side (−x for team 1), and the minimap turns too. Solo play has no team-1 human yet (PvP M1b), so
// the view is put on team 1 through the e2e hook.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

type View = { mySlot: number; tricks: unknown[]; setTeam(slot: number, team: 0 | 1, tricks: unknown[]): void; lookAt(x: number, z: number, h: number): void; recentre(): void; gr: { camera: { position: unknown } } };
const seat = (page: Page, team: 0 | 1) =>
  page.evaluate((t) => {
    const v = (window as unknown as { __plWorld: { view: View } }).__plWorld.view;
    v.setTeam(v.mySlot, t as 0 | 1, v.tricks ?? []);
  }, team);
/** Look at mid-map (both cores in front of the camera), or back at the hero. */
const midMap = (page: Page, on: boolean) =>
  page.evaluate((o) => {
    const v = (window as unknown as { __plWorld: { view: View } }).__plWorld.view;
    if (o) v.lookAt(50, -30, 1e9);
    else v.recentre();
  }, on);
type Vec = { set(a: number, b: number, c: number): Vec; project(c: unknown): Vec; x: number; y: number; z: number };
const screenX = (page: Page, x: number, z: number) =>
  page.evaluate(
    ([px, pz]) => {
      const cam = (window as unknown as { __plWorld: { view: { gr: { camera: { position: Vec } } } } }).__plWorld.view.gr.camera;
      const V = cam.position.constructor as unknown as new () => Vec;
      const p = new V().set(px, 0, pz).project(cam);
      return [p.x, p.y, p.z] as [number, number, number];
    },
    [x, z] as const,
  );

async function stickRight(page: Page, ms: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const x0 = 140;
  const y0 = 280;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 3 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 12, y: y0, id: 3 }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('team-1 seat: diagonal view turned 180°, the enemy core top right, the stick pushes toward it', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  await startFirstMatch(page);
  await page.waitForTimeout(800);
  /**
   * Own core `own` and enemy core `foe` (x m, z −30) projected from mid-map. The peek is re-applied and read after two
   * drawn frames on every poll: under load something (a recentre, a seat change) can end it before the projection,
   * which put a core behind the camera (NDC y 1.86).
   */
  const fromMid = async (own: number, foe: number): Promise<string> => {
    await midMap(page, true);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const [o, e] = [await screenX(page, own, -30), await screenX(page, foe, -30)];
    // in front of the camera (NDC z inside the clip range)
    const inView = [o, e].every((p) => Math.abs(p[2]) < 1);
    return `${inView ? 'in view' : 'off view'} ${o[0] < e[0] ? 'left' : 'right'} ${o[1] < e[1] ? 'below' : 'above'}`;
  };
  // team 0: our core (10 m) left of and below theirs (90 m) (NDC y is up), seen from mid-map
  await expect.poll(() => fromMid(10, 90), { timeout: 10_000 }).toBe('in view left below');
  await seat(page, 1);
  await page.waitForTimeout(800);
  // team 1: the enemy core (team 0's, 10 m) projects right of and above our own (90 m)
  await expect.poll(() => fromMid(90, 10), { timeout: 10_000 }).toBe('in view left below');
  await midMap(page, false);
  await page.waitForTimeout(300);
  // the stick pushed screen-right walks the hero toward −x (toward that enemy core's side of the map)
  const a = await me(page);
  await stickRight(page, 900);
  await expect.poll(async () => (await me(page)).x, { timeout: 3000 }).toBeLessThan(a.x - 300);
  await page.screenshot({ path: 'test-results/team1-view/844x390.png' });
});

test('the start shows "Your base: bottom left" for 1.2 s', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch phone');
  await startFirstMatch(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.baseToast ?? ''), { timeout: 15_000 }).toBe('base');
  await expect(page.locator('.pl-basetoast')).toHaveCount(0, { timeout: 5000 });
});

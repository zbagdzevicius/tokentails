import { expect, test, type Page } from '@playwright/test';
import { me, startFirstMatch } from './helpers';

// MAP-GAPS A24: a team-1 seat sees the map turned 180° (its base bottom left, the enemy's top right): the enemy core
// (team 0's, at x = 10 m) projects right of its own (x = 90 m), the stick pushed right walks toward −x, and the
// minimap turns too. Solo play has no team-1 human yet (PvP M1b), so the view is put on team 1 through the e2e hook.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

type View = { mySlot: number; tricks: unknown[]; setTeam(slot: number, team: 0 | 1, tricks: unknown[]): void; gr: { camera: { position: unknown } } };
const seat = (page: Page, team: 0 | 1) =>
  page.evaluate((t) => {
    const v = (window as unknown as { __plWorld: { view: View } }).__plWorld.view;
    v.setTeam(v.mySlot, t as 0 | 1, v.tricks ?? []);
  }, team);
type Vec = { set(a: number, b: number, c: number): Vec; project(c: unknown): Vec; x: number };
const screenX = (page: Page, x: number, z: number) =>
  page.evaluate(
    ([px, pz]) => {
      const cam = (window as unknown as { __plWorld: { view: { gr: { camera: { position: Vec } } } } }).__plWorld.view.gr.camera;
      const V = cam.position.constructor as unknown as new () => Vec;
      return new V().set(px, 0, pz).project(cam).x;
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

test('team-1 seat: camera turned 180°, the enemy core to the right, the stick pushes toward it', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  await startFirstMatch(page);
  await page.waitForTimeout(800);
  // team 0: our core (10 m) left of theirs (90 m)
  expect(await screenX(page, 10, -30)).toBeLessThan(await screenX(page, 90, -30));
  await seat(page, 1);
  await page.waitForTimeout(800);
  // team 1: the enemy core (team 0's, 10 m) projects right of our own (90 m)
  expect(await screenX(page, 10, -30)).toBeGreaterThan(await screenX(page, 90, -30));
  // the stick pushed screen-right walks the hero toward −x (toward that enemy core's side of the map)
  const a = await me(page);
  await stickRight(page, 900);
  await expect.poll(async () => (await me(page)).x, { timeout: 3000 }).toBeLessThan(a.x - 300);
  await page.screenshot({ path: 'test-results/team1-view/844x390.png' });
});

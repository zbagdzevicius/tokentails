import { expect, test, type Page } from '@playwright/test';
import { CROSSING_BEDS } from '../../src/data/fun';
import { minimapPoint, seedSide, startFirstMatch } from './helpers';

/**
 * Sim v24 instant Boing Beds (docs/plans/moba/V21-FUN.md §2.1; founder report 2026-11-12 "these in Blitz are glitchy,
 * they must be better, more sensitive"). 844x390 emulated touch, a Blitz bot match on the cat side: the minimap walks
 * the hero to a spot 4.5 m behind one of its beds, then the touch stick is held toward the bed (re-aimed as a thumb
 * would) or let go on the cushion. Every try must throw the hero to the landing.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

type Pt = { x: number; y: number; id: number };
const W = 844;
const H = 390;

/** The screen px offset from my hero to sim point (x, y) mm, and my sim position. */
const toward = (page: Page, x: number, y: number): Promise<{ sx: number; sy: number; mx: number; my: number; state: string } | null> =>
  page.evaluate(
    ([x, y]) => {
      type E = { fx: number; fy: number; x: number; y: number; state: string };
      type V3 = { project(c: unknown): { x: number; y: number } };
      const v = (window as unknown as { __plWorld: { view: { mySlot: number; frame: { byId: Map<number, E> } | null; gr: { camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } } } } } }).__plWorld.view;
      const m = v.frame?.byId.get(v.mySlot);
      if (!m) return null;
      const cam = v.gr.camera;
      const Vec = cam.position.constructor;
      const a = new Vec(m.fx / 1000, 0.5, -m.fy / 1000).project(cam);
      const b = new Vec(x / 1000, 0.5, -y / 1000).project(cam);
      return { sx: ((b.x - a.x) * innerWidth) / 2, sy: (-(b.y - a.y) * innerHeight) / 2, mx: m.x, my: m.y, state: m.state };
    },
    [x, y] as const,
  );

test('844x390 Blitz: walking onto a Boing Bed with the stick (or letting go on it) throws the hero every time', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: W, height: H });
  await seedSide(page, 'cat', { difficulty: 'easy', hero: 'clem' });
  await startFirstMatch(page, '&speed=1&mode=blitz');
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await page.touchscreen.tap(W * 0.25, H * 0.85);
  const S = { x: Math.round(W * 0.18), y: Math.round(H * 0.72), id: 1 };
  const results: string[] = [];
  let fails = 0;
  let tries = 0;
  for (let i = 0; i < 6; i++) {
    const [bx, by, lx, ly] = CROSSING_BEDS[i % CROSSING_BEDS.length];
    const letGo = i >= 3;
    const tl = Math.hypot(lx - bx, ly - by);
    const ux = (lx - bx) / tl;
    const uy = (ly - by) / tl;
    // a spot 4.5 m behind the bed (the side it throws from), reached by a minimap right-click
    const stx = Math.round(bx - ux * 4500);
    const sty = Math.round(by - uy * 4500);
    let ready = false;
    for (const end = Date.now() + 40_000; Date.now() < end; ) {
      const p = await toward(page, stx, sty);
      if (p && p.state !== 'dead' && Math.hypot(p.mx - stx, p.my - sty) < 900) {
        ready = true;
        break;
      }
      const mp = await minimapPoint(page, stx, sty).catch(() => null);
      if (mp) await page.mouse.click(mp.x, mp.y, { button: 'right' });
      await page.waitForTimeout(1200);
    }
    if (!ready) {
      results.push(`bed ${i % 3}: never reached the staging spot`);
      continue;
    }
    // the bed's 3 s cooldown after a previous throw has run out by now (the walk back took longer)
    tries++;
    let entered = -1;
    let thrown = -1;
    let released = false;
    const t0 = Date.now();
    // the thumb aims 2 m past the bed along its throw (from behind it, straight at the bed), wobbling ±12° per send
    const ax = bx + ux * 2000;
    const ay = by + uy * 2000;
    let k = 0;
    await send('touchStart', [S]);
    while (Date.now() - t0 < 6000) {
      const p = await toward(page, ax, ay);
      if (!p) break;
      const dBed = Math.hypot(p.mx - bx, p.my - by);
      const dLand = Math.hypot(p.mx - lx, p.my - ly);
      if (entered < 0 && dBed <= 1200) entered = Date.now();
      if (dLand < 2500) {
        thrown = Date.now();
        break;
      }
      if (letGo && entered >= 0 && !released) {
        await send('touchEnd', []);
        released = true;
        continue;
      }
      if (!released) {
        const w = (k++ % 2 === 0 ? 1 : -1) * 0.21;
        const a = Math.atan2(p.sy, p.sx) + w;
        await send('touchMove', [{ x: Math.round(S.x + Math.cos(a) * 55), y: Math.round(S.y + Math.sin(a) * 55), id: 1 }]);
      }
      await page.waitForTimeout(60);
    }
    if (!released) await send('touchEnd', []);
    const ok = thrown >= 0;
    if (!ok) fails++;
    results.push(`bed ${i % 3} ${letGo ? 'let go' : 'stick'}: ${ok ? `thrown ${entered >= 0 ? thrown - entered : '?'} ms after entering the disc` : `NOT thrown (entered ${entered >= 0})`}`);
    await page.waitForTimeout(3500);
  }
  console.log(`BOING touch: ${results.join(' | ')}`);
  expect(tries).toBeGreaterThanOrEqual(4);
  expect(fails).toBe(0);
});

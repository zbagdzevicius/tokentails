import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { CROSSING_BEDS } from '../../src/data/fun';
import { minimapPoint, seedSide, simTick, startFirstMatch, waitGameSeconds } from './helpers';

/**
 * Sim v24 instant Boing Beds (docs/plans/moba/V21-FUN.md §2.1; founder report 2026-11-12 "these in Blitz are glitchy,
 * they must be better, more sensitive"). 844x390 emulated touch, a Blitz bot match on the cat side: the minimap walks
 * the hero to a spot 4.5 m behind one of its beds, then the touch stick is held toward the bed (re-aimed as a thumb
 * would) or let go on the cushion. Every try must throw the hero to the landing.
 * Windows are game time (sim ticks, 30 a second), not wall time: on a loaded machine the match runs slower than the
 * clock, and a 6 s wall window once ended before the hero had walked onto any bed.
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
      // from the sim's position, not the drawn one: on a loaded machine the drawn hero trails it by metres, and a thumb
      // aimed from there entered the disc more than 60° off the throw (a walk across it, rightly not thrown)
      const a = new Vec(m.x / 1000, 0.5, -m.y / 1000).project(cam);
      const b = new Vec(x / 1000, 0.5, -y / 1000).project(cam);
      return { sx: ((b.x - a.x) * innerWidth) / 2, sy: (-(b.y - a.y) * innerHeight) / 2, mx: m.x, my: m.y, state: m.state };
    },
    [x, y] as const,
  );

// The Practice ground (sim v27): the same Crossing beds as Blitz, with training dummies that never strike. In a Blitz bot
// match a bot's stun, or the hero auto-attacking a bot on the cushion (which v25 rightly does not launch), decided some
// tries depending on where the bots happened to be (2 of 6 at load 50, Nov 15, 2026); the bed and the stick are what
// this checks.
test('844x390 Crossing beds: walking onto a Boing Bed with the stick (or letting go on it) throws the hero every time', async ({ page }) => {
  test.setTimeout(limit(600_000));
  await page.setViewportSize({ width: W, height: H });
  await seedSide(page, 'cat', { difficulty: 'easy', hero: 'clem' });
  await startFirstMatch(page, '&speed=1&mode=practice');
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
    const walk0 = await simTick(page);
    // 40 s of game time (wall guard 4 min)
    for (const end = Date.now() + limit(240_000); Date.now() < end && (await simTick(page)) - walk0 < 40 * 30; ) {
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
    let released = false;
    const t0 = Date.now();
    // the hero's sim position per snapshot (`window.__plTrack`, ?e2e=1), so a slow poll on a loaded machine cannot miss
    // the throw (a hero that landed and walked back toward the thumb's aim point once read as never thrown)
    const from = await simTick(page);
    const seen = (): Promise<{ entered: number; landed: number }> =>
      page.evaluate(
        ([from, bx, by, lx, ly]) => {
          const t = (window as unknown as { __plTrack?: number[][] }).__plTrack ?? [];
          let entered = -1;
          let landed = -1;
          for (const [tick, x, y] of t) {
            if (tick < from) continue;
            if (entered < 0 && Math.hypot(x - bx, y - by) <= 1200) entered = tick;
            if (Math.hypot(x - lx, y - ly) < 2500) {
              landed = tick;
              break;
            }
          }
          return { entered, landed };
        },
        [from, bx, by, lx, ly] as const,
      );
    // the thumb aims 2 m past the bed along its throw (from behind it, straight at the bed), wobbling ±12° per send
    const ax = bx + ux * 2000;
    const ay = by + uy * 2000;
    let k = 0;
    let hit = { entered: -1, landed: -1 };
    await send('touchStart', [S]);
    // 6 s of game time from the first push of the stick (the harness's own round trips before it are not the bed's);
    // wall guard 2 min, stretched on an overloaded machine
    let tick0 = -1;
    while (Date.now() - t0 < limit(120_000) && (tick0 < 0 || (await simTick(page)) - tick0 < 6 * 30)) {
      hit = await seen();
      if (hit.landed >= 0) break;
      const p = await toward(page, ax, ay);
      // no frame for my hero at this instant (a busy main thread between two frames): look again, do not end the try
      if (!p) {
        await page.waitForTimeout(60);
        continue;
      }
      if (letGo && hit.entered >= 0 && !released) {
        await send('touchEnd', []);
        released = true;
        continue;
      }
      if (!released) {
        const w = (k++ % 2 === 0 ? 1 : -1) * 0.21;
        const a = Math.atan2(p.sy, p.sx) + w;
        await send('touchMove', [{ x: Math.round(S.x + Math.cos(a) * 55), y: Math.round(S.y + Math.sin(a) * 55), id: 1 }]);
        if (tick0 < 0) tick0 = await simTick(page);
      }
      await page.waitForTimeout(60);
    }
    if (hit.landed < 0) hit = await seen();
    // a hero that reached the cushion inside the window still gets its stand (0.5 s after a let-go) and its flight: on a
    // loaded machine the harness's release can come late in the window (seen once at load 140, Nov 16, 2026)
    if (hit.landed < 0 && hit.entered >= 0) {
      if (letGo && !released) {
        await send('touchEnd', []);
        released = true;
      }
      await waitGameSeconds(page, await simTick(page), 2);
      hit = await seen();
    }
    if (!released) await send('touchEnd', []);
    const ok = hit.landed >= 0;
    if (!ok) fails++;
    results.push(`bed ${i % 3} ${letGo ? 'let go' : 'stick'}: ${ok ? `thrown ${hit.entered >= 0 ? Math.round(((hit.landed - hit.entered) * 1000) / 30) : '?'} game ms after entering the disc` : `NOT thrown (entered ${hit.entered >= 0})`}`);
    // past the bed's 3 s cooldown, in game time
    await waitGameSeconds(page, await simTick(page), 3.5);
  }
  console.log(`BOING touch: ${results.join(' | ')}`);
  expect(tries).toBeGreaterThanOrEqual(4);
  expect(fails).toBe(0);
});

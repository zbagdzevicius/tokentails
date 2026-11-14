import { expect, test, type Page } from '@playwright/test';
import { me, minimapPoint, seedSide, startFirstMatch } from './helpers';

/**
 * KITE-FIX (docs/plans/moba/KITE-FIX.md; player report 2026-11-11 "can't both run and attack"), 844x390 emulated
 * touch, rookie bot match as Rocket. Next to an enemy minion: ATK pressed and held, then the stick strafes beside it (one way, then
 * the other, every 600 ms) for 3 s. The hero walks between swings and the swings keep landing; before the fix the
 * held ATK planted it (0.2 m walked in 2.4 s with the stick held away).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

type Pt = { x: number; y: number; id: number };
const W = 844;
const H = 390;

const nearestMinion = (page: Page): Promise<{ d: number; sx: number; sy: number } | null> =>
  page.evaluate(() => {
    type E = { id: number; kind: string; team: number; fx: number; fy: number; state: string };
    type V3 = { project(c: unknown): { x: number; y: number } };
    const v = (window as unknown as { __plWorld: { view: { mySlot: number; myTeam: number; frame: { entities: E[]; byId: Map<number, E> } | null; gr: { camera: { position: { constructor: new (x: number, y: number, z: number) => V3 } } } } } }).__plWorld.view;
    const f = v.frame;
    const m = f?.byId.get(v.mySlot);
    if (!f || !m || m.state === 'dead') return null;
    const cam = v.gr.camera;
    const Vec = cam.position.constructor;
    const scr = (e: E) => new Vec(e.fx / 1000, 0.5, -e.fy / 1000).project(cam);
    const ms = scr(m);
    let best: { d: number; sx: number; sy: number } | null = null;
    for (const e of f.entities) {
      if (e.team === v.myTeam || e.team > 1 || e.state === 'dead' || e.kind !== 'minion') continue;
      const d = Math.hypot(e.fx - m.fx, e.fy - m.fy);
      const s = scr(e);
      // NDC → px (the two axes scale differently on a wide screen)
      // screen px from the hero, y down like the touch points (NDC y is up)
      if (!best || d < best.d) best = { d, sx: ((s.x - ms.x) * innerWidth) / 2, sy: (-(s.y - ms.y) * innerHeight) / 2 };
    }
    return best;
  });

test('844x390: ATK held, the stick strafes beside a minion: the hero walks and the swings keep landing', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: W, height: H });
  await seedSide(page, 'cat', { difficulty: 'rookie', hero: 'rocket' });
  await startFirstMatch(page, '&speed=1');
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await page.touchscreen.tap(W * 0.25, H * 0.85);
  const r = (await page.locator('.pl-tbtn.attack').boundingBox())!;
  const A: Pt = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), id: 2 };
  const S = { x: Math.round(W * 0.18), y: Math.round(H * 0.72), id: 1 };

  /** Walk up Sunny Lane (minimap right-click, then the stick) until an enemy minion stands within `within` mm. */
  let goalX = 30000;
  let guarded = 0;
  const toWave = async (within: number) => {
    const end = Date.now() + 150_000;
    while (Date.now() < end) {
      if ((await me(page)).state === 'dead') {
        goalX = 30000;
        await page.waitForTimeout(1000);
        continue;
      }
      const n = await nearestMinion(page);
      // in reach, and a tap of ATK would hit something now (the field ring: attackPreview; a minion under an untanked
      // enemy tower is skipped on purpose)
      if (n && n.d < within && (await page.evaluate(() => document.documentElement.dataset.atkTarget ?? '')) !== '') return n;
      if (n && n.d < within) {
        // in reach but ATK skips it: it stands under an enemy tower no allied minion tanks (on purpose). Waiting there
        // can last the whole budget (the wave dies under the tower, the next one walks into the same spot), so after
        // 2 s fall back down the lane and meet the next wave in the open (QA flaky-qa: 2 of 3 runs timed out here)
        if (++guarded < 5) {
          await page.waitForTimeout(400);
          continue;
        }
        guarded = 0;
        goalX = Math.max(30000, goalX - 7500);
        const back = await minimapPoint(page, goalX, 52500).catch(() => null);
        if (back) await page.mouse.click(back.x, back.y, { button: 'right' });
        await page.waitForTimeout(1500);
        continue;
      }
      guarded = 0;
      if (n && n.d < 12000) {
        const l = Math.hypot(n.sx, n.sy) || 1;
        await send('touchStart', [S]);
        // toward the minion on screen. QA flaky-qa: this pushed the stick's y the wrong way (S.y - sy), so the walk-in
        // closed only the x gap and drifted off on y; the minion came into reach only when its wave walked into the hero
        await send('touchMove', [{ x: Math.round(S.x + (n.sx / l) * 50), y: Math.round(S.y + (n.sy / l) * 50), id: 1 }]);
        await page.waitForTimeout(250);
        await send('touchEnd', []);
        continue;
      }
      goalX = Math.min(50000, goalX + 2500);
      const p = await minimapPoint(page, goalX, 52500).catch(() => null);
      if (p) await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.waitForTimeout(700);
    }
    return null;
  };

  /** One 3 s strafe with ATK held; null when the phase was not clean (the hero died, no minion stayed). */
  const strafe = async () => {
    const n = await toWave(4500);
    expect(n, 'an enemy minion in reach').not.toBeNull();
    const l = Math.hypot(n!.sx, n!.sy) || 1;
    // stick space (screen px, y down like the touch points): toward the minion is (sx, sy); "beside and a little back" is that turned 105° either way (more
    // than the 90° within which the stick yields to the Attack order instead)
    let tx = n!.sx / l;
    let ty = n!.sy / l;
    const side = (k: 1 | -1): Pt => {
      const c = Math.cos(k * 1.83);
      const s = Math.sin(k * 1.83);
      return { x: Math.round(S.x + (tx * c - ty * s) * 55), y: Math.round(S.y + (tx * s + ty * c) * 55), id: 1 };
    };
    /** One read of the page's telemetry (a single evaluate: swiftshader frames are slow). */
    const read = () =>
      page.evaluate(() => {
        const d = document.documentElement.dataset;
        const [x, y, state] = (d.me ?? '').split(',');
        return { x: Number(x), y: Number(y), state: state ?? '', hits: Number(d.hits ?? 0), kites: Number(d.kites ?? 0), none: Number(d.atkNone ?? 0), hold: d.atkHold ?? '', ops: (d.ops ?? '').split(',').filter(Boolean).map(Number) };
      });
    const r0 = await read();
    // ATK first (held on the minion), then the stick moves the hero between the swings
    await send('touchStart', [A]);
    await page.waitForTimeout(150);
    await send('touchStart', [A, S]);
    await send('touchMove', [A, side(1)]);
    let walked = 0;
    let prev = r0;
    let died = false;
    const trace: string[] = [];
    const t0 = Date.now();
    let k: 1 | -1 = 1;
    let flipAt = t0 + 600;
    let last = r0;
    // the press found a unit (ATK said "nothing in reach" otherwise: not a clean phase)
    await page.waitForTimeout(300);
    const pressed = await read();
    // the unit the press picked is still alive (a minion that died on the first swing leaves no kite: a plain move)
    const pickAlive = await page.evaluate(() => {
      type E = { state: string };
      const id = (JSON.parse(document.documentElement.dataset.atk ?? 'null') as { id: number | null } | null)?.id;
      const f = (window as unknown as { __plWorld: { view: { frame: { byId: Map<number, E> } | null } } }).__plWorld.view.frame;
      const u = id != null ? f?.byId.get(id) : undefined;
      return !!u && u.state !== 'dead';
    });
    while (Date.now() - t0 < 3000) {
      await page.waitForTimeout(100);
      if (Date.now() >= flipAt) {
        k = k === 1 ? -1 : 1;
        flipAt += 600;
        // beside the minion as it is now (the hero has moved)
        const m = await nearestMinion(page);
        if (m) {
          const ml = Math.hypot(m.sx, m.sy) || 1;
          tx = m.sx / ml;
          ty = m.sy / ml;
        }
        await send('touchMove', [A, side(k)]);
      }
      const p = await read();
      if (p.state === 'dead') died = true;
      walked += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      last = p;
      trace.push(`${p.state[0]}${p.ops.slice(-3).join('.')}[${p.hold}]`);
    }
    await send('touchEnd', []);
    const hits = last.hits - r0.hits;
    const kites = last.kites - r0.kites;
    // not clean: the hero died, ATK found nothing to attack (a minion under an untanked tower is skipped on purpose), or
    // the picked minion died before the stick's first order
    const clean = !died && pressed.none === r0.none && pickAlive;
    const wall = Date.now() - t0;
    console.log(`KITE strafe (${wall} ms): walked ${(walked / 1000).toFixed(2)} m, hits ${hits}, kites ${kites}, clean ${clean} (pick alive ${pickAlive}), start d ${(n!.d / 1000).toFixed(1)} m: ${trace.join(' ')}`);
    await page.waitForTimeout(800);
    return clean ? { walked, hits, kites } : null;
  };

  let res: Awaited<ReturnType<typeof strafe>> = null;
  for (let tries = 0; tries < 4 && !res; tries++) res = await strafe();
  expect(res, 'a clean strafe (the hero alive, ATK found a minion)').not.toBeNull();
  // the stick drove the hero with kites, it walked, and the swings went on. Before KITE-FIX the same input sent no
  // kite (ATK re-sent Attack every 350 ms) and the hero stood: 0.2 m in 2.4 s. The bounds are loose on purpose: under a
  // loaded machine swiftshader draws a few frames a second and the lane moves on its own.
  expect(res!.kites).toBeGreaterThan(0);
  expect(res!.walked).toBeGreaterThan(1500);
  expect(res!.hits).toBeGreaterThanOrEqual(1);
});

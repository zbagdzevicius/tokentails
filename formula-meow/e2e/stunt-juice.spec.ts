import { expect, test, type Page } from '@playwright/test';

/**
 * Set pieces, juice lane (iteration 3, docs/plans/formula-meow/SETPIECES.md sections 8–9): the bot drives Kitchen
 * Counter at phone size. Frozen mid-piece (sim speed 0, the render keeps drawing) it checks and screenshots the juice:
 * the tunnel's light streaks, tighter FOV, music low-pass and "TUNNEL RUN!"; the jump's air cam leaning toward the
 * landing ring; the loop's FOV, roll limit and pink/cyan trail with "LOOP-DE-MEOW!"; wall-ride sparks; then the
 * "Stunts" results row. A second run with reduced motion: no streaks, world up and no FOV change in the loop.
 * Screens: e2e/screens/juice-*.png.
 */
type Kart = { lap: number; si: number; d: number; y: number; air: number; su: number; rail: number; gapLaunch: number; airTicks: number; surface: number; branch: number; x: number; z: number; finished: number };
type Piece = { kind: string; i0: number; i1: number; side: number };
type Fm = {
  shell: {
    simSpeed: number;
    world: {
      tick: number;
      cfg: { humans: number[] };
      track: { n: number; pieces: Piece[]; tunnelMask: Uint8Array; halfW: Float64Array; py: Float64Array; px: Float64Array; pz: Float64Array; tx: Float64Array; tz: Float64Array };
      st: { karts: Kart[]; events: Array<{ type: string; kart: number; a?: number; b?: number }> };
    } | null;
    stage: { renderer: { info: { render: { calls: number } } }; scene: { getObjectByName(n: string): { visible: boolean; count: number } | undefined } };
    camera: { stuntFeel: { tunnel: number; air: number; fov: number }; upVector: { y: number }; cam: { fov: number } };
    audio: { tunnelState: { inside: boolean; wanted: boolean } };
    hud: { saying: string | null };
  };
};

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Freeze the race the first frame `cond(k, t, sh)` holds; also record what the HUD said since the last call. */
async function freezeWhen(page: Page, cond: string): Promise<void> {
  await page.waitForFunction(
    (src) => {
      const sh = (window as unknown as { __fm: Fm }).__fm.shell;
      const w = sh.world;
      if (!w) return false;
      const said = ((window as unknown as { __said?: string[] }).__said ??= []);
      const now = sh.hud.saying;
      if (now && said[said.length - 1] !== now) said.push(now);
      const k = w.st.karts[w.cfg.humans[0]];
      const ok = new Function('k', 't', 'sh', `return ${src};`)(k, w.track, sh) as boolean;
      if (ok) sh.simSpeed = 0;
      return ok;
    },
    cond,
    { timeout: 420_000, polling: 'raf' },
  );
}

const resume = (page: Page, speed: number) => page.evaluate((sp) => ((window as unknown as { __fm: Fm }).__fm.shell.simSpeed = sp), speed);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.stage.renderer.info.render.calls);
const said = (page: Page) => page.evaluate(() => (window as unknown as { __said?: string[] }).__said ?? []);

async function start(page: Page, speed: number): Promise<void> {
  await page.goto(`/?track=kitchen&bot=1&seed=7&speed=${speed}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.tick ?? 0), { timeout: 120_000 }).toBeGreaterThan(0);
}

const TUNNEL_DEEP = "t.tunnelMask[k.si] === 1 && ((k.si - t.pieces.find((p) => p.kind === 'tunnel').i0 + t.n) % t.n) > 30";

test('Kitchen Counter: tunnel streaks and low-pass, the air cam, the loop cam and trail, wall sparks, the Stunts row', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors = watchErrors(page);
  const SPEED = 3;
  await start(page, SPEED);

  // the jump: the air cam rises and leans toward the landing ring
  await freezeWhen(page, 'k.gapLaunch > 0 && k.airTicks > 18');
  await page.waitForTimeout(350);
  const air = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.camera.stuntFeel);
  expect(air.air).toBeGreaterThan(0.5);
  expect(air.fov).toBeGreaterThan(1);
  await page.screenshot({ path: 'e2e/screens/juice-jump.png' });
  await resume(page, SPEED);

  // the tunnel: streaks drawn, FOV tighter, the music low-pass on, the call made
  await freezeWhen(page, TUNNEL_DEEP);
  await page.waitForTimeout(450);
  const tn = await page.evaluate(() => {
    const sh = (window as unknown as { __fm: Fm }).__fm.shell;
    const m = sh.stage.scene.getObjectByName('fm-tunnel-streaks');
    return { feel: sh.camera.stuntFeel, audio: sh.audio.tunnelState, streaks: m ? (m.visible ? m.count : 0) : -1 };
  });
  expect(tn.feel.tunnel).toBeGreaterThan(0.9);
  expect(tn.feel.fov).toBeLessThan(-2);
  expect(tn.audio.wanted).toBe(true);
  expect(tn.streaks).toBeGreaterThan(4);
  await page.screenshot({ path: 'e2e/screens/juice-tunnel.png' });
  expect(await calls(page), 'tunnel').toBeLessThanOrEqual(120);
  await resume(page, SPEED);

  // the loop: FOV opens, the up follows the surface, the trail rides it
  await freezeWhen(page, 'k.rail > 0 && k.su > 30');
  await page.waitForTimeout(350);
  const lp = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.camera.stuntFeel);
  expect(lp.fov).toBeGreaterThan(3);
  await page.screenshot({ path: 'e2e/screens/juice-loop.png' });
  expect(await calls(page), 'loop').toBeLessThanOrEqual(120);
  await resume(page, SPEED);
  await page.waitForFunction(() => {
    const sh = (window as unknown as { __fm: Fm }).__fm.shell;
    return !sh.audio.tunnelState.wanted && sh.world!.st.karts[sh.world!.cfg.humans[0]].rail === 0;
  }, null, { timeout: 300_000 });
  const calledOut = await said(page);
  expect(calledOut).toContain('BIG AIR!');
  expect(calledOut).toContain('TUNNEL RUN!');
  expect(calledOut).toContain('LOOP-DE-MEOW!');

  // the wall: set the bot onto the lane on lap 2 (it keeps the racing line), sparks fly
  await page.waitForFunction(
    () => {
      const w = (window as unknown as { __fm: Fm }).__fm.shell.world;
      if (!w) return false;
      const t = w.track;
      const k = w.st.karts[w.cfg.humans[0]];
      const pc = t.pieces.find((p) => p.kind === 'wall')!;
      const into = (k.si - pc.i0 + t.n) % t.n;
      if (k.lap < 2 || into < 30 || into > 50 || k.branch !== -1) return false;
      const d = pc.side * (t.halfW[k.si] + 5.2);
      k.x = t.px[k.si] - t.tz[k.si] * d;
      k.z = t.pz[k.si] + t.tx[k.si] * d;
      k.y = Math.max(k.y, t.py[k.si]) + 2.5;
      return true;
    },
    null,
    { timeout: 420_000, polling: 'raf' },
  );
  await freezeWhen(page, 'k.air === 0 && k.surface === 6 && Math.abs(k.d) > t.halfW[k.si] + 4');
  // let a few frames of sparks out at a crawl, then freeze for the shot
  await resume(page, 0.25);
  await page.waitForTimeout(400);
  await resume(page, 0);
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'e2e/screens/juice-wall.png' });
  await resume(page, 8);

  // the results: the stunt counts sit in the Style row (iteration 4 merge: the Stunts row only adds net catches)
  const style = page.locator('[data-section="style"]');
  await expect(style).toBeVisible({ timeout: 600_000 });
  expect(await style.textContent()).toMatch(/loops|landings|wall rides|tricks|combo/);
  // the results panel scrolls: bring the row into view once the stamp and count-up are done
  await page.waitForTimeout(1500);
  await style.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screens/juice-results.png' });
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no tunnel streaks or FOV change; the loop keeps world up', async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchErrors(page);
    await start(page, 3);
    await freezeWhen(page, TUNNEL_DEEP);
    await page.waitForTimeout(400);
    const tn = await page.evaluate(() => {
      const sh = (window as unknown as { __fm: Fm }).__fm.shell;
      const m = sh.stage.scene.getObjectByName('fm-tunnel-streaks');
      return { fov: sh.camera.stuntFeel.fov, streaks: m ? (m.visible ? m.count : 0) : -1, audio: sh.audio.tunnelState.wanted };
    });
    expect(tn.fov).toBe(0);
    expect(tn.streaks).toBeLessThanOrEqual(0);
    expect(tn.audio).toBe(true);
    await resume(page, 3);
    await freezeWhen(page, 'k.rail > 0 && k.su > 37');
    await page.waitForTimeout(300);
    const up = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.camera.upVector.y);
    expect(up).toBeCloseTo(1, 5);
    await page.screenshot({ path: 'e2e/screens/juice-loop-reduced.png' });
    expect(errors).toEqual([]);
  });
});

/**
 * Iteration 4 (juice lane, F3/F4/F5): the paw TAP! ring stands on Kitchen's lips and lights up as the bot reaches one
 * (one instanced draw call), the final-lap gap chips show, and the bot's close win on seed 7 is stamped
 * "PHOTO FINISH" with the same margin `finishMargin` gives. Screens: e2e/screens/juice4-*.png.
 */
type Fm4 = {
  shell: {
    simSpeed: number;
    world: { tick: number; st: { tick: number; karts: Array<{ lap: number; finished: number }> }; cfg: { humans: number[]; laps?: number }; result(): { places: Array<{ kart: number; time: number | null }> } } | null;
    stage: { renderer: { info: { render: { calls: number } } }; scene: { getObjectByName(n: string): { count: number; visible: boolean; geometry: { getAttribute(n: string): { array: Float32Array } } } | undefined } };
    hud: { fx: { stamped: string; glow: string } };
  };
};

test('iteration 4: the paw TAP! ring lights up on a lip; final-lap gap chips; a photo finish stamp', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await start(page, 3);
  // the ring: one instanced mesh with a ring per lip; freeze the first frame one is hot (the trick window)
  await page.waitForFunction(
    () => {
      const sh = (window as unknown as { __fm: Fm4 }).__fm.shell;
      const m = sh.stage.scene.getObjectByName('paw-rings');
      if (!m || !m.visible) return false;
      const a = m.geometry.getAttribute('aPulse').array;
      for (let i = 0; i < m.count; i++)
        if (a[i] >= 0.99) {
          sh.simSpeed = 0;
          return true;
        }
      return false;
    },
    null,
    { timeout: 300_000, polling: 'raf' },
  );
  await page.waitForTimeout(250);
  const ring = await page.evaluate(() => {
    const sh = (window as unknown as { __fm: Fm4 }).__fm.shell;
    const m = sh.stage.scene.getObjectByName('paw-rings')!;
    return { count: m.count, calls: sh.stage.renderer.info.render.calls };
  });
  expect(ring.count).toBeGreaterThanOrEqual(1);
  expect(ring.calls).toBeLessThanOrEqual(120);
  await page.screenshot({ path: 'e2e/screens/juice4-ring.png' });
  await resume(page, 3);

  // the final lap: the gap chips show the cats ahead and behind
  await expect(page.locator('.fm-gap.on').first()).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('.fm-gap.on').first()).toHaveText(/([+−]\d+\.\d s|SIDE BY SIDE!)$/);

  // the finish: seed 7 is a close win; the stamp carries the margin finishMargin gives
  await expect(page.locator('.fm-stamp.on')).toBeVisible({ timeout: 300_000 });
  const fin = await page.evaluate(() => {
    const sh = (window as unknown as { __fm: Fm4 }).__fm.shell;
    const j = (window as unknown as { __fmJuice: { finishCall: { kind: string; margin?: { margin: number } } | null } }).__fmJuice;
    return { stamp: sh.hud.fx.stamped, call: j.finishCall };
  });
  expect(fin.call?.kind).toBe('photo');
  expect(fin.stamp).toContain('PHOTO FINISH');
  expect(fin.stamp).toContain(`by ${fin.call!.margin!.margin.toFixed(2)} s`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screens/juice4-photo.png' });
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from '@playwright/test';

/**
 * Set pieces, Engine step (SIM_VERSION 8, docs/plans/formula-meow/SETPIECES.md): the bot drives Kitchen Counter
 * through its reference wall ride, jump gap, tunnel and loop at phone size. Each piece is frozen mid-way (the sim speed
 * set to 0, the render keeps drawing) and screenshot to e2e/screens/stunt-*.png; the event log shows the loop ridden
 * and the gap landed with no net catch, the draw calls stay within budget and nothing logs an error. The ai-ugc lane's
 * e2e/setpieces.spec.ts covers all six tracks.
 */
type Kart = { lap: number; y: number; air: number; si: number; d: number; su: number; rail: number; gapLaunch: number; airTicks: number; surface: number; branch: number; x: number; z: number };
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
    stage: { renderer: { info: { render: { calls: number } } } };
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

/** Freeze the race (render keeps going) the first frame `cond(kart, track)` holds; resolves when it did. */
async function freezeWhen(page: Page, cond: string): Promise<void> {
  await page.waitForFunction(
    (src) => {
      const sh = (window as unknown as { __fm: Fm }).__fm.shell;
      const w = sh.world;
      if (!w) return false;
      const k = w.st.karts[w.cfg.humans[0]];
      const ok = new Function('k', 't', `return ${src};`)(k, w.track) as boolean;
      if (ok) sh.simSpeed = 0;
      return ok;
    },
    cond,
    { timeout: 150_000, polling: 'raf' },
  );
}

const resume = (page: Page, speed: number) => page.evaluate((sp) => ((window as unknown as { __fm: Fm }).__fm.shell.simSpeed = sp), speed);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.stage.renderer.info.render.calls);

test('Kitchen Counter: the bot rides the wall lane, jumps the sink gap, runs the tunnel and loops the loop', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const SPEED = 3;
  await page.goto(`/?track=kitchen&bot=1&seed=7&speed=${SPEED}`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.tick ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.track.pieces.map((p) => p.kind).sort())).toEqual(['jump', 'loop', 'tunnel', 'wall']);

  // the bot keeps to the racing line: set it onto the wall lane once it is inside the piece (the magnet holds it)
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
      // a 16 m sideways move in one tick at road height reads as a step the kart cannot climb: drop it in from above
      k.y = Math.max(k.y, t.py[k.si]) + 2.5;
      return true;
    },
    null,
    { timeout: 150_000, polling: 'raf' },
  );
  const shots: Array<[string, string]> = [
    ['wall', 'k.air === 0 && k.surface === 6 && Math.abs(k.d) > t.halfW[k.si] + 4'],
    ['jump', 'k.gapLaunch > 0 && k.airTicks > 20'],
    ['tunnel', "t.tunnelMask[k.si] === 1 && ((k.si - t.pieces.find((p) => p.kind === 'tunnel').i0 + t.n) % t.n) > 40"],
    ['loop-up', 'k.rail > 0 && k.su > 28'],
    ['loop-top', 'k.rail > 0 && k.su > 37'],
  ];
  for (const [name, cond] of shots) {
    await freezeWhen(page, cond);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e/screens/stunt-${name}.png` });
    expect(await calls(page), name).toBeLessThanOrEqual(120);
    await resume(page, SPEED);
  }
  // the loop exits cleanly, the gap was landed, nobody fell into a net or needed the big hand on a piece
  await page.waitForFunction(() => {
    const w = (window as unknown as { __fm: Fm }).__fm.shell.world!;
    const me = w.cfg.humans[0];
    return w.st.events.some((e) => e.kart === me && e.type === 'stuntExit' && e.a === 0 && e.b === 1);
  }, null, { timeout: 30_000 });
  const ev = await page.evaluate(() => {
    const w = (window as unknown as { __fm: Fm }).__fm.shell.world!;
    const me = w.cfg.humans[0];
    const mine = w.st.events.filter((e) => e.kart === me);
    return { land: mine.filter((e) => e.type === 'stuntLand').length, net: w.st.events.filter((e) => e.type === 'netCatch').length, loops: mine.filter((e) => e.type === 'stuntExit' && e.a === 0).length };
  });
  expect(ev.land).toBeGreaterThanOrEqual(1);
  expect(ev.loops).toBeGreaterThanOrEqual(1);
  expect(ev.net).toBe(0);
  expect(errors).toEqual([]);
});

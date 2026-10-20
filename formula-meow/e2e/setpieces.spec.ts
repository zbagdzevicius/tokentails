import { expect, test, type Page } from '@playwright/test';

/**
 * Set pieces on every circuit (iteration 3, ai-ugc lane, SETPIECES.md section 11): the phone bot (`bot=1`, 50cc, phone
 * size) races 3 laps; the event log shows every loop ridden cleanly each lap, every jump landed and no net catch for
 * anyone; screenshots inside a loop and a tunnel (and on a wall lane when the player rides one); draw calls ≤ 120.
 * A circuit whose track lane has not placed its pieces yet is skipped (the tracks lanes add them).
 */
type Ev = { type: string; kart: number; a?: number; b?: number };
type Kart = { lap: number; rail: number; su: number; si: number; surface: number; finished: number; gapLaunch: number; airTicks: number };
type Fm = {
  shell: {
    simSpeed: number;
    world: {
      tick: number;
      laps?: number;
      cfg: { humans: number[] };
      track: { n: number; pieces: Array<{ kind: string; i0: number; gap: number }>; tunnelMask: Uint8Array };
      st: { karts: Kart[]; events: Ev[]; laps: number };
    } | null;
    stage: { renderer: { info: { render: { calls: number } } } };
  };
};

const CIRCUITS = ['kitchen', 'laundry', 'rooftops', 'yarn', 'cafe', 'shelter'];

const fm = (page: Page) => page.evaluate(() => !!(window as unknown as { __fm?: Fm }).__fm?.shell.world);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.stage.renderer.info.render.calls);

/** Freeze the sim the first frame `cond(k, t)` holds for the player; false when the race ends first. */
async function freezeWhen(page: Page, cond: string, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(
      (src) => {
        const sh = (window as unknown as { __fm: Fm }).__fm.shell;
        const w = sh.world;
        if (!w) return false;
        const k = w.st.karts[w.cfg.humans[0]];
        if (k.finished) return true;
        const ok = new Function('k', 't', `return ${src};`)(k, w.track) as boolean;
        if (ok) sh.simSpeed = 0;
        return ok;
      },
      cond,
      { timeout, polling: 'raf' },
    );
  } catch {
    return false;
  }
  return page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.simSpeed === 0);
}

for (const id of CIRCUITS) {
  test(`${id}: the phone bot clears every set piece for 3 laps, nobody falls into a net`, async ({ page }) => {
    test.setTimeout(480_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const SPEED = 4;
    await page.goto(`/?track=${id}&bot=1&seed=7&speed=${SPEED}`);
    await expect.poll(() => fm(page), { timeout: 30_000 }).toBe(true);
    const kinds = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.track.pieces.map((p) => p.kind));
    test.skip(kinds.length === 0, `${id}: no set pieces placed yet (tracks lane)`);

    const shots: Array<[string, string]> = [];
    if (kinds.includes('loop')) shots.push(['loop', 'k.rail > 0 && k.su > 30']);
    if (kinds.includes('tunnel')) shots.push(['tunnel', 't.tunnelMask[k.si] === 1']);
    if (kinds.includes('jump')) shots.push(['jump', 'k.gapLaunch > 0 && k.airTicks > 15']);
    for (const [name, cond] of shots) {
      if (!(await freezeWhen(page, cond, 150_000))) continue;
      await page.waitForTimeout(250);
      await page.screenshot({ path: `e2e/screens/setpieces-${id}-${name}.png` });
      expect(await calls(page), `${id} ${name}`).toBeLessThanOrEqual(120);
      await page.evaluate((sp) => ((window as unknown as { __fm: Fm }).__fm.shell.simSpeed = sp), SPEED);
    }
    // a wall lane, when the bot happens to ride one (it keeps to the racing line; skilled AI ride them)
    if (kinds.includes('wall') && (await freezeWhen(page, 'k.surface === 6', 20_000))) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: `e2e/screens/setpieces-${id}-wall.png` });
      await page.evaluate((sp) => ((window as unknown as { __fm: Fm }).__fm.shell.simSpeed = sp), SPEED);
    }

    // to the flag
    await page.waitForFunction(
      () => {
        const w = (window as unknown as { __fm: Fm }).__fm.shell.world;
        return !!w && w.st.karts[w.cfg.humans[0]].finished > 0;
      },
      null,
      { timeout: 300_000, polling: 500 },
    );
    const r = await page.evaluate(() => {
      const w = (window as unknown as { __fm: Fm }).__fm.shell.world!;
      const me = w.cfg.humans[0];
      const mine = w.st.events.filter((e) => e.kart === me);
      const t = w.track;
      return {
        laps: w.st.laps,
        loops: t.pieces.filter((p) => p.kind === 'loop').length,
        jumps: t.pieces.filter((p) => p.kind === 'jump' && p.gap > 0).length,
        loopExits: mine.filter((e) => e.type === 'stuntExit' && e.a === 0 && e.b === 1).length,
        lands: mine.filter((e) => e.type === 'stuntLand').length,
        nets: w.st.events.filter((e) => e.type === 'netCatch').length,
        respawns: mine.filter((e) => e.type === 'respawn').length,
      };
    });
    expect(r.loopExits, id).toBeGreaterThanOrEqual(r.loops * r.laps);
    expect(r.lands, id).toBeGreaterThanOrEqual(r.jumps * r.laps);
    expect(r.nets, id).toBe(0);
    expect(r.respawns, id).toBe(0);
    expect(errors).toEqual([]);
  });
}

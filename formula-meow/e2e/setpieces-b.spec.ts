import { expect, test, type Page } from '@playwright/test';

/**
 * tracks-B set pieces (SIM_VERSION 8, SETPIECES.md section 12): on Yarn Canyon, Cat Café Chaos and Pink Paw Shelter
 * Sprint the bot drives every piece at phone size; each one is frozen mid-way (sim speed 0, the render keeps drawing)
 * and screenshot to e2e/screens/setpiece-b-<track>-<kind>.png. Draw calls stay within budget, no net catch, no error.
 * The ai-ugc lane's e2e/setpieces.spec.ts covers the event-log checks on all six tracks.
 */
type Kart = { lap: number; air: number; si: number; su: number; rail: number; gapLaunch: number; airTicks: number };
type Piece = { kind: string; i0: number; i1: number };
type Fm = {
  shell: {
    simSpeed: number;
    world: {
      tick: number;
      cfg: { humans: number[] };
      track: { n: number; pieces: Piece[]; tunnelMask: Uint8Array };
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

async function freezeWhen(page: Page, cond: string, arg: number): Promise<void> {
  await page.waitForFunction(
    ([src, a]) => {
      const sh = (window as unknown as { __fm: Fm }).__fm.shell;
      const w = sh.world;
      if (!w) return false;
      const k = w.st.karts[w.cfg.humans[0]];
      const ok = new Function('k', 't', 'pc', `return ${src};`)(k, w.track, w.track.pieces[a as number]) as boolean;
      if (ok) sh.simSpeed = 0;
      return ok;
    },
    [cond, arg] as const,
    { timeout: 150_000, polling: 'raf' },
  );
}

const SHOT: Record<string, string> = {
  loop: 'k.rail === pc.id + 1 && k.su > 30',
  // the run-up: 8–20 m before the lip, the gap and its skin ahead
  approach: 'k.air === 0 && ((pc.i0 - k.si + t.n) % t.n) * (t.length / t.n) > 8 && ((pc.i0 - k.si + t.n) % t.n) * (t.length / t.n) < 20',
  jump: 'k.gapLaunch === pc.id + 1 && k.air > 0 && k.airTicks > 5',
  tunnel: 't.tunnelMask[k.si] === 1 && ((k.si - pc.i0 + t.n) % t.n) > ((pc.i1 - pc.i0 + t.n) % t.n) * 0.45 && ((k.si - pc.i0 + t.n) % t.n) < ((pc.i1 - pc.i0 + t.n) % t.n)',
  wall: 'k.air === 0 && ((k.si - pc.i0 + t.n) % t.n) > ((pc.i1 - pc.i0 + t.n) % t.n) * 0.3 && ((k.si - pc.i0 + t.n) % t.n) < ((pc.i1 - pc.i0 + t.n) % t.n)',
};

for (const track of ['yarn', 'cafe', 'shelter']) {
  test(`${track}: every set piece on screen, draw calls ≤ 120, no net, no error`, async ({ page }) => {
    test.setTimeout(420_000);
    const errors = watchErrors(page);
    const SPEED = 3;
    await page.goto(`/?track=${track}&bot=1&seed=7&speed=${SPEED}`);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.tick ?? 0), { timeout: 90_000 }).toBeGreaterThan(0);
    const pieces = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.track.pieces.map((p, id) => ({ kind: p.kind, id })));
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const pc of pieces) {
      for (const shot of pc.kind === 'jump' ? ['approach', 'jump'] : [pc.kind]) {
        await freezeWhen(page, SHOT[shot], pc.id);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `e2e/screens/setpiece-b-${track}-${shot}.png` });
        expect(await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.stage.renderer.info.render.calls), `${track} ${shot}`).toBeLessThanOrEqual(120);
        await page.evaluate((sp) => ((window as unknown as { __fm: Fm }).__fm.shell.simSpeed = sp), SPEED);
      }
    }
    const nets = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.st.events.filter((e) => e.type === 'netCatch').length);
    expect(nets).toBe(0);
    expect(errors).toEqual([]);
  });
}

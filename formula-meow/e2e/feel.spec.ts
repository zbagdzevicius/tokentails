import { expect, test, type Page } from '@playwright/test';

/**
 * Feel lane (iteration 2): the intro flyover, the six bodies with hats and trails inside the draw-call budget, the
 * big hand's respawn carry, the finish orbit, and the lazy bloom on the high tier. No console errors anywhere.
 */
type Kart = { respawnTicks: number; finished: number; x: number; y: number; z: number; vx: number; vz: number; item: string | null; itemCount: number; rouletteTicks: number };
type Fm = {
  shell: {
    world: { st: { tick: number; phase: string; karts: Kart[]; events: Array<{ tick: number; type: string; kart: number }> } } | null;
    view: { karts: Array<{ info: { kart: { body: number } }; hat: unknown; root: { visible: boolean } }>; shown: Array<{ y: number }>; scene: { getObjectByName(n: string): { visible: boolean; parent: { visible: boolean } | null } | undefined } } | null;
    camera: { mode: string };
    racers: Array<Record<string, unknown>>;
    setup: Record<string, unknown>;
    start(req: Record<string, unknown>): void;
  };
};

const fm = (page: Page) => page.evaluate(() => !!(window as unknown as { __fm?: Fm }).__fm?.shell.world);
const tick = (page: Page) => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.tick ?? 0);
const camMode = (page: Page) => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.camera.mode ?? '');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('the grid opens on the intro flyover; the first key skips it into the chase camera', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=11');
  await expect.poll(() => fm(page), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => camMode(page), { timeout: 10_000 }).toBe('flyover');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'e2e/screens/feel-flyover.png' });
  expect(await tick(page)).toBe(0);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => tick(page), { timeout: 15_000 }).toBeGreaterThan(20);
  await expect.poll(() => camMode(page), { timeout: 10_000 }).toBe('chase');
  expect(errors).toEqual([]);
});

test('all six bodies, eight hats and five trails race inside the 120 draw-call budget', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=7&quality=high');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(30);
  await page.evaluate(() => {
    const s = (window as unknown as { __fm: Fm }).__fm.shell;
    const racers = s.racers.map((r, i) => ({ ...r, kart: { ...(r.kart as object), body: i % 6 }, hat: (i % 8) + 1, trail: (i % 5) + 1 }));
    s.start({ ...s.setup, racers, playerSlot: 5 });
  });
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(330);
  const look = await page.evaluate(() => {
    const v = (window as unknown as { __fm: Fm }).__fm.shell.view!;
    return { bodies: v.karts.map((k) => k.info.kart.body), hats: v.karts.filter((k) => !!k.hat).length };
  });
  expect(new Set(look.bodies).size).toBe(6);
  expect(look.hats).toBe(8);
  const calls = await page.evaluate(() => (window as unknown as { __fmPerf: { calls: number } }).__fmPerf.calls);
  expect(calls).toBeGreaterThan(10);
  expect(calls).toBeLessThanOrEqual(120);
  await page.screenshot({ path: 'e2e/screens/feel-cosmetics.png' });
  expect(errors).toEqual([]);
});

test('the big hand lifts the kart, carries it and sets it down facing forward', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=3&quality=mid');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(330);
  // the sim's respawn path (GDD 3.3): 1.2 s with the kart frozen, then placed back on its sample
  await page.evaluate(() => {
    const w = (window as unknown as { __fm: Fm }).__fm.shell.world!;
    const k = w.st.karts[5];
    k.respawnTicks = 72;
    k.vx = 0;
    k.vz = 0;
    w.st.events.push({ tick: w.st.tick, type: 'respawnStart', kart: 5 });
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as { __fm: Fm }).__fm.shell;
          const hand = s.view!.scene.getObjectByName('respawn-hand');
          const k = s.world!.st.karts[5];
          return k.respawnTicks > 0 && s.view!.karts[5].root.visible && !!hand && !!hand.parent?.visible && s.view!.shown[5].y > k.y + 0.5;
        }),
      // the lift lasts ~0.6 s: poll often (the default back-off to 1 s polls could step right over it)
      { timeout: 10_000, intervals: [50] },
    )
    .toBe(true);
  await page.screenshot({ path: 'e2e/screens/feel-hand.png' });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.st.karts[5].respawnTicks), { timeout: 10_000 }).toBe(0);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => {
    const s = (window as unknown as { __fm: Fm }).__fm.shell;
    const hand = s.view!.scene.getObjectByName('respawn-hand');
    return { handUp: !!hand?.parent?.visible, kartShown: s.view!.karts[5].root.visible };
  });
  expect(after.handUp).toBe(false);
  expect(after.kartShown).toBe(true);
  expect(errors).toEqual([]);
});

test('crossing the line turns the camera into the finish orbit', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=5&speed=8&quality=low');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.karts[5].finished ?? 0), { timeout: 90_000 }).toBe(1);
  await expect.poll(() => camMode(page), { timeout: 5_000 }).toBe('finishOrbit');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screens/feel-finish-orbit.png' });
  expect(errors).toEqual([]);
});

test('the bloom chunk loads lazily and the race renders through it (forced: swiftshader is too slow to earn it)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=9&quality=high&bloom=1');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fmFeel?: { post(): boolean } }).__fmFeel?.post() ?? false), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screens/feel-bloom.png' });
  expect(errors).toEqual([]);
});

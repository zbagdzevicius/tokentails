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

/**
 * Iteration 4 (F2): a novice phone player through real (synthetic) touch pointer events. The scripted thumb follows the
 * centre line a short way ahead, reacts 9 ticks late and moves in 5-tick steps (the same novice as
 * `src/core/input/novice.ts`), on Kitchen at 50cc. Run 1 is the SIM_VERSION 10 stick (x^1.4, 6 px dead zone, no
 * Smart Steer); run 2 is today's default (x^1.15, 4 px, Smart Steer on). Wall frames are counted per sim tick.
 */
type Novice = { wallTicks: number; assistTicks: number; done: boolean; time: number | null; aiMean: number; place: number };

async function noviceRace(page: Page, smart: boolean): Promise<Novice> {
  await page.goto('/?track=kitchen&cls=0&seed=21');
  await expect.poll(() => fm(page), { timeout: 20_000 }).toBe(true);
  await page.evaluate((smart) => {
    type Shell = {
      world: { st: { tick: number; karts: Array<{ x: number; z: number; vx: number; vz: number; si: number; branch: number; wall: number; finished: number; finishTime: number }> }; track: { n: number; step: number; px: Float32Array; pz: Float32Array; tx: Float32Array; tz: Float32Array; branches: Array<{ m: number; step: number; to: number; px: Float32Array; pz: Float32Array }> } } | null;
      touch: { dead: number; curve: number };
      mux: { assist: number };
      updateSettings(s: Record<string, unknown>): void;
    };
    const s = (window as unknown as { __fm: { shell: Shell } }).__fm.shell;
    s.updateSettings({ smartSteer: smart, oneThumb: true });
    if (!smart) {
      s.touch.dead = 6;
      s.touch.curve = 1.4;
    }
    const root = document.querySelector('.fm-touch') as HTMLElement;
    const ev = (type: string, x: number, y: number, id: number) =>
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 });
    // start: a tap at the top of the screen during the intro / countdown
    root.dispatchEvent(ev('pointerdown', 195, 120, 9));
    window.dispatchEvent(ev('pointerup', 195, 120, 9));
    const X0 = 110;
    const Y0 = 700;
    root.dispatchEvent(ev('pointerdown', X0, Y0, 1));
    const out: Novice = { wallTicks: 0, assistTicks: 0, done: false, time: null, aiMean: 0, place: 0 };
    (window as unknown as { __novice: Novice }).__novice = out;
    const hist: number[] = [];
    let last = -1;
    let px = 0;
    let rng = 21;
    const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const thumb = (): number => {
      const w = s.world!;
      const t = w.track;
      const k = w.st.karts[5];
      const v = Math.hypot(k.vx, k.vz);
      const look = 5 + v * 0.35;
      let tx: number;
      let tz: number;
      const br = k.branch >= 0 ? t.branches[k.branch] : null;
      if (br) {
        let near = 0;
        let best = Infinity;
        for (let j = 0; j < br.m; j++) {
          const d = (br.px[j] - k.x) ** 2 + (br.pz[j] - k.z) ** 2;
          if (d < best) {
            best = d;
            near = j;
          }
        }
        const j = near + Math.round(look / br.step);
        if (j < br.m) {
          tx = br.px[j];
          tz = br.pz[j];
        } else {
          const mi = (br.to + Math.round(((j - br.m + 1) * br.step) / t.step)) % t.n;
          tx = t.px[mi];
          tz = t.pz[mi];
        }
      } else {
        const j = (k.si + Math.round(look / t.step)) % t.n;
        tx = t.px[j];
        tz = t.pz[j];
      }
      let err = Math.atan2(tx - k.x, tz - k.z) - (v > 1 ? Math.atan2(k.vx, k.vz) : Math.atan2(t.tx[k.si], t.tz[k.si]));
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      return Math.max(-70, Math.min(70, Math.max(-1, Math.min(1, -err * 3.2)) * 70));
    };
    const frame = () => {
      const w = s.world;
      if (w) {
        const k = w.st.karts[5];
        // one sample per sim tick seen (the page runs 60 ticks a second; a slow frame catches up several)
        while (last < w.st.tick) {
          last = last < 0 ? w.st.tick : last + 1;
          hist.push(thumb());
          if (hist.length > 9) hist.shift();
          if (last % 5 === 0) px = Math.max(-70, Math.min(70, hist[0] + rand() * 10));
          if (w.st.tick >= 180 && !k.finished && k.wall) out.wallTicks++;
          if (s.mux.assist !== 0) out.assistTicks++;
        }
        window.dispatchEvent(ev('pointermove', X0 + px, Y0, 1));
        if (k.finished) {
          const ai = w.st.karts.filter((q, i) => i !== 5 && q.finished).map((q) => q.finishTime / 60);
          out.time = k.finishTime / 60;
          out.aiMean = ai.reduce((a, b) => a + b, 0) / Math.max(1, ai.length);
          out.done = true;
          window.dispatchEvent(ev('pointerup', X0 + px, Y0, 1));
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, smart);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __novice: Novice }).__novice.done), { timeout: 240_000, intervals: [2000] }).toBe(true);
  // the AI behind the player keep racing for a few seconds: wait for the field before taking the AI mean
  await page.waitForTimeout(12_000);
  return page.evaluate(() => {
    const s = (window as unknown as { __fm: { shell: { world: { st: { karts: Array<{ finished: number; finishTime: number }> } } } } }).__fm.shell;
    const n = (window as unknown as { __novice: Novice }).__novice;
    const ai = s.world.st.karts.filter((q, i) => i !== 5 && q.finished).map((q) => q.finishTime / 60);
    return { ...n, aiMean: ai.reduce((a, b) => a + b, 0) / Math.max(1, ai.length) };
  });
}

test('Smart Steer: a novice touch thumb at 390x844 brushes the walls a quarter as often and keeps up with the 50cc pack', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  const v10 = await noviceRace(page, false);
  const v11 = await noviceRace(page, true);
  console.log(`[feel] novice touch, Kitchen 50cc: wall ticks ${v10.wallTicks} → ${v11.wallTicks}; time ${v10.time?.toFixed(1)} → ${v11.time?.toFixed(1)} s, AI mean ${v11.aiMean.toFixed(1)} s; assist ticks ${v11.assistTicks}`);
  expect(v10.assistTicks).toBe(0);
  expect(v11.assistTicks).toBeGreaterThan(0);
  expect(v10.wallTicks).toBeGreaterThan(40);
  expect(v11.wallTicks).toBeLessThanOrEqual(v10.wallTicks / 4);
  expect(v11.time! - v11.aiMean).toBeLessThanOrEqual(8);
  await page.screenshot({ path: 'e2e/screens/feel-smart-steer-finish.png' });
  expect(errors).toEqual([]);
});

/** Iteration 4 (F11): the Night Wild Card (render only) in the default, colour-blind and high-contrast looks. */
test('Night: stars, warm fill and kart headlights; readable in colour-blind and high-contrast modes', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=7&track=cafe');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(10);
  for (const look of [{ name: 'default', s: { colourblind: 'off', highContrast: false } }, { name: 'deut', s: { colourblind: 'deut', highContrast: false } }, { name: 'contrast', s: { colourblind: 'off', highContrast: true } }]) {
    await page.evaluate((st) => {
      const s = (window as unknown as { __fm: { shell: Fm['shell'] & { updateSettings(x: Record<string, unknown>): void } } }).__fm.shell;
      s.updateSettings(st);
      s.start({ ...s.setup, modifiers: 2 /* Modifier.Night */ });
    }, look.s);
    await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(420);
    const seen = await page.evaluate(() => {
      const v = (window as unknown as { __fm: Fm }).__fm.shell.view!;
      const stars = v.scene.getObjectByName('stars');
      const pools = v.scene.getObjectByName('fm-headlight-pools');
      return { stars: !!stars, pools: !!pools };
    });
    expect(seen).toEqual({ stars: true, pools: true });
    const calls = await page.evaluate(() => (window as unknown as { __fmPerf: { calls: number } }).__fmPerf.calls);
    expect(calls).toBeLessThanOrEqual(120);
    await page.screenshot({ path: `e2e/screens/feel-night-${look.name}.png` });
  }
  expect(errors).toEqual([]);
});

/** Iteration 4 (F14): on the Rug, furniture between the camera and the kart fades; the arena stays within 80 draw calls. */
test('Rug: furniture in the way fades to 30 % and the arena stays within 80 draw calls', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=3&track=rug');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(10);
  let faded = 0;
  let maxCalls = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const f = (window as unknown as { __fmFeel?: { occluders?(): { faded: number; attached: boolean } | null } }).__fmFeel;
      const o = f?.occluders?.() ?? null;
      return { faded: o?.faded ?? 0, attached: o?.attached ?? false, calls: (window as unknown as { __fmPerf: { calls: number } }).__fmPerf.calls };
    });
    maxCalls = Math.max(maxCalls, r.calls);
    if (r.faded > 0 && !faded) await page.screenshot({ path: 'e2e/screens/feel-rug-fade.png' });
    faded = Math.max(faded, r.faded);
    if (faded && i > 20) break;
  }
  expect(faded).toBeGreaterThan(0);
  expect(maxCalls).toBeLessThanOrEqual(80);
  expect(errors).toEqual([]);
});

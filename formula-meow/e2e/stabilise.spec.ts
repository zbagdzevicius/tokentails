import { expect, test, type Page } from '@playwright/test';

/** Iteration 2 Stabilise: old links, restarts without leaks, pause and Esc, broken dare links, no console errors. */

type Fm = {
  shell: {
    world: { st: { tick: number; phase: string; karts: Array<{ startJudged: number }> } } | null;
    setup: { seed: number; mode?: string } | null;
    stage: { renderer: { info: { memory: { textures: number; geometries: number } } } };
    restart(): void;
    isPaused: boolean;
  };
};

const fm = (page: Page) => page.evaluate(() => !!(window as unknown as { __fm?: Fm }).__fm);
const tick = (page: Page) => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.tick ?? 0);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('an old v3 dare link opens as a target-time race with the version notice', async ({ page }) => {
  const errors = watchErrors(page);
  // made by v1 (SIM_VERSION 3): Kitchen, seed 5, Kitten, slot 5
  await page.goto('/?bot=1#g=EDPmVy8AAAAFAFADAAgFyFcQXAngBcCpQA&n=Mia');
  await expect(page.locator('body')).toContainText('another version of the game', { timeout: 15_000 });
  await expect.poll(() => fm(page)).toBe(true);
  const setup = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.setup);
  expect(setup?.seed).toBe(5);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test('a broken dare link says so (B47)', async ({ page }) => {
  await page.goto('/?bot=1#g=EDPmVy8AAAAF');
  await expect(page.locator('body')).toContainText('That dare link is broken', { timeout: 15_000 });
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(100);
});

test('12 restarts do not leak textures or geometries (B57)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=3');
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(120);
  // upload every texture the live scene holds first (textures upload on first sight, so the count follows the countdown
  // camera's framing). Pooled effects that leave the scene when idle still swing it by up to 3 (iteration 4 merge:
  // 30, 33, 31, 31, 33 over five batches of 12 restarts, no growth), so the baseline is the larger of two batches.
  const mem = () =>
    page.evaluate(() => {
      type R = { info: { memory: { textures: number; geometries: number } }; initTexture(t: unknown): void };
      type O = { material?: unknown; traverse(f: (o: O) => void): void };
      const sh = (window as unknown as { __fm: { shell: { stage: { renderer: R; scene: O } } } }).__fm.shell;
      const r = sh.stage.renderer;
      const seen = new Set<unknown>();
      const tex = (v: unknown) => {
        if (v && (v as { isTexture?: boolean }).isTexture && !seen.has(v)) {
          seen.add(v);
          r.initTexture(v);
        }
      };
      sh.stage.scene.traverse((o) => {
        for (const m of ([] as unknown[]).concat(o.material ?? [])) {
          const mm = m as Record<string, unknown> & { uniforms?: Record<string, { value: unknown }> };
          for (const k of Object.keys(mm)) tex(mm[k]);
          for (const u of Object.values(mm.uniforms ?? {})) tex(u.value);
        }
      });
      return { ...r.info.memory };
    });
  // restart once and settle, so every lazily created resource of the first race exists
  await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
  await page.waitForTimeout(2200);
  // and a few countdown restarts more: textures upload on first sight, and what the camera sees in the first seconds
  // varies with its framing, so the baseline is taken once that has settled (a leak keeps growing past it)
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2500);
  const warm = await mem();
  const batch = async () => {
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
      // B61: restart during the countdown, while the programs may still be linking
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(2500);
    return mem();
  };
  const b1 = await batch();
  const first = { textures: Math.max(warm.textures, b1.textures), geometries: Math.max(warm.geometries, b1.geometries) };
  // a leak grows with every restart: 12 more must stay within the baseline's swing
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.restart());
    // B61: restart during the countdown, while the programs may still be linking
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2500);
  const after = await mem();
  expect(after.textures).toBeLessThanOrEqual(first.textures + 2);
  expect(after.geometries).toBeLessThanOrEqual(first.geometries + 2);
  expect(errors).toEqual([]);
});

test('a restart frees no program under the new grid, leaves no frozen overlay and links few programs after GO (B61)', async ({ page }) => {
  // every deleteProgram, timed (the shell frees a torn-down race's GPU side RETIRE_MS = 1.5 s later)
  await page.addInitScript(() => {
    const w = window as unknown as { __fmDel: number[] };
    w.__fmDel = [];
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const del = C.prototype.deleteProgram;
      C.prototype.deleteProgram = function (this: WebGLRenderingContext, p: WebGLProgram | null) {
        w.__fmDel.push(performance.now());
        return del.call(this, p);
      };
    }
  });
  const glWarnings: string[] = [];
  page.on('console', (m) => {
    if (/glGetProgramiv|GL_INVALID_VALUE/.test(m.text())) glWarnings.push(m.text());
  });
  await page.goto('/?bot=1&seed=7');
  // past GO with the bot boosting: the old race has speed lines up and its effects built
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(400);
  type Gl = { shell: { restart(): void; camera: { cam: { children: Array<{ renderOrder: number; visible: boolean }> } }; stage: { renderer: { info: { programs: Array<{ id: number }> | null } } } } };
  const t0 = await page.evaluate(() => {
    (window as unknown as { __fm: Gl }).__fm.shell.restart();
    return performance.now();
  });
  await page.waitForTimeout(400);
  // the old race's speed-lines overlay left the camera with the race (it stayed drawn, frozen, for 1.5 s)
  const overlays = await page.evaluate(() => (window as unknown as { __fm: Gl }).__fm.shell.camera.cam.children.filter((c) => c.renderOrder === 999).length);
  expect(overlays).toBe(1);
  await page.waitForTimeout(600);
  // nothing compiled for the new grid was freed straight away (the old effects are retired, not disposed at reset)
  const early = await page.evaluate((from) => (window as unknown as { __fmDel: number[] }).__fmDel.filter((t) => t >= from && t < from + 1000).length, t0);
  expect(early).toBe(0);
  // the grid compile covered the race, in the colour space of the target the frames are drawn into (with bloom on, the
  // scene target: 5 linked late with screen variants only): few programs link after GO (it was ~14, some 20 s in)
  const ids = () => page.evaluate(() => ((window as unknown as { __fm: Gl }).__fm.shell.stage.renderer.info.programs ?? []).map((p) => p.id));
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  const atGo = new Set(await ids());
  await expect.poll(() => tick(page), { timeout: 60_000 }).toBeGreaterThan(200 + 60 * 12);
  const fresh = (await ids()).filter((id) => !atGo.has(id));
  expect(fresh.length).toBeLessThanOrEqual(3);
  expect(glWarnings).toEqual([]);
});

test('Esc pauses and resumes; the pause screen has Resume and Restart, and a hidden tab pauses only once (B34, B38)', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(60);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] [data-act="resume"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] [data-act="restart"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"] select')).toHaveCount(0);
  const t0 = await tick(page);
  await page.waitForTimeout(500);
  expect(await tick(page)).toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
  await expect.poll(() => tick(page)).toBeGreaterThan(t0);
  // idempotent pause: the hidden-tab path twice in a row leaves it paused
  await page.evaluate(() => {
    const s = (window as unknown as { __fm: { shell: { pause(on: boolean): void } } }).__fm.shell;
    s.pause(true);
    s.pause(true);
  });
  expect(await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.isPaused)).toBe(true);
});

test('the Tracks screen hides the pause panel under it (B46)', async ({ page }) => {
  await page.goto('/?seed=4');
  await page.mouse.click(195, 300);
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(30);
  await page.locator('.fm-menu-btn').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.locator('[data-screen="pause"] [data-act="ugc-tracks"]').click();
  await expect(page.locator('[data-screen="tracks"]')).toBeVisible();
  await expect(page.locator('[data-screen="pause"]')).toBeHidden();
  await page.locator('[data-screen="tracks"] [data-a="close"]').click();
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
});

test('a resting steer thumb before GO is not an early start (B23)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // not the first race (the first one forgives early presses anyway)
  await ctx.addInitScript(() => {
    localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: {}, slots: { core: { races: 3, unlocked: 0, pounces: 2, drifts: 2, bestTimes: {} } } }));
  });
  const page = await ctx.newPage();
  await page.goto('/?seed=11');
  await page.touchscreen.tap(300, 200); // first tap on the top: arms the countdown
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(10);
  // hold the left thumb down through the countdown (CDP touch: start, then end after GO)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 700, id: 1 }] });
  await expect.poll(() => tick(page), { timeout: 30_000 }).toBeGreaterThan(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const judged = await page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world!.st.karts[5].startJudged);
  expect(judged).not.toBe(3);
  const events = await page.evaluate(() => (window as unknown as { __fm: { shell: { world: { st: { events: Array<{ type: string; kart: number }> } } } } }).__fm.shell.world.st.events.filter((e) => e.kart === 5).map((e) => e.type));
  expect(events).not.toContain('stall');
  await ctx.close();
});

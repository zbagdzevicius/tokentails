// Iteration 3 final review (`npm run review:v3`, ~5 min on the Metal GPU): the set pieces on all 6 circuits at desktop
// 1440x900 and phone 390x844, frozen mid-piece (loop at the top, wall ride, jump mid-air, tunnel middle), screenshots
// in review/v3/<size>-<track>-<setpiece>.png (gitignored); old dares and track codes; editor stickers in a fresh page.
// Fails on any page error or a frame over 120 draw calls.
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { LEGACY } from './v3-legacy-codes';

const SIZES: Array<{ name: string; opts: BrowserContextOptions }> = [
  { name: '1440x900', opts: { viewport: { width: 1440, height: 900 } } },
  { name: '390x844', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
];
const TRACKS = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe', 'shelter'];
const SPEED = 2;

type Ctx = { page: Page; errors: string[]; close(): Promise<void> };
async function open(browser: Browser, opts: BrowserContextOptions): Promise<Ctx> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  return { page, errors, close: () => ctx.close() };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const sh = (page: Page) => page.evaluate(() => !!(window as any).__fm?.shell.world);
const calls = (page: Page) => page.evaluate(() => (window as any).__fm.shell.stage.renderer.info.render.calls as number);
const setSpeed = (page: Page, s: number) => page.evaluate((v) => ((window as any).__fm.shell.simSpeed = v), s);

/** Freeze the sim the first frame `cond(k, t, p)` holds for the player (p = the first piece of `kind`). */
async function freezeWhen(page: Page, kind: string, cond: string, timeout = 240_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      ([kd, src]) => {
        const s = (window as any).__fm.shell;
        const w = s.world;
        if (!w) return false;
        const k = w.st.karts[w.cfg.humans[0]];
        if (k.finished) return true;
        const p = w.track.pieces.find((q: any) => q.kind === kd);
        const ok = !!p && (new Function('k', 't', 'p', `return ${src};`)(k, w.track, p) as boolean);
        if (ok) s.simSpeed = 0;
        return ok;
      },
      [kind, cond] as const,
      { timeout, polling: 'raf' },
    );
  } catch {
    return false;
  }
  return page.evaluate(() => (window as any).__fm.shell.simSpeed === 0);
}

// `into`: how far (0..1) the player is through the piece's samples
const INTO = '(((k.si - p.i0 + t.n) % t.n) / Math.max(1, (p.i1 - p.i0 + t.n) % t.n))';
const SHOTS: Record<string, string> = Object.fromEntries([
  ['jump', 'k.gapLaunch > 0 && k.airTicks > 22'],
  ['tunnel', `k.branch === -1 && t.tunnelMask[k.si] === 1 && ${INTO} > 0.4 && ${INTO} < 0.7`],
  ['loop', 'k.rail > 0 && k.su > 33 && k.su < 44'],
]);

for (const size of SIZES) {
  for (const id of TRACKS) {
    test(`${size.name} ${id}: every set piece, frozen mid-piece`, async ({ browser }) => {
      test.setTimeout(600_000);
      const c = await open(browser, size.opts);
      const { page } = c;
      await page.goto(`/?track=${id}&bot=1&seed=7&speed=${SPEED}`);
      await expect.poll(() => sh(page), { timeout: 60_000 }).toBe(true);
      const kinds = await page.evaluate(() => (window as any).__fm.shell.world.track.pieces.map((p: any) => p.kind) as string[]);
      const got: string[] = [];
      let peak = 0;
      const snap = async (name: string) => {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `review/v3/${size.name}-${id}-${name}.png` });
        const n = await calls(page);
        peak = Math.max(peak, n);
        expect(n, `${id} ${name} draw calls`).toBeLessThanOrEqual(120);
        got.push(name);
      };
      // in track order, so every shot comes in the first lap or two: Shelter's wall came last, in lap 3, where the bot
      // takes the play-room branch round it
      const order = await page.evaluate(() => {
        const t = (window as any).__fm.shell.world.track;
        return [...t.pieces].sort((a: any, b: any) => a.i0 - b.i0).map((p: any) => p.kind as string);
      });
      for (const kind of [...new Set(order)]) {
        if (kind !== 'wall') {
          if (await freezeWhen(page, kind, SHOTS[kind])) await snap(kind);
          await setSpeed(page, SPEED);
          continue;
        }
        // the wall: the bot keeps the racing line, so set it onto the lane a third of the way in
        const placed = await page
          .waitForFunction(
            () => {
              const w = (window as any).__fm.shell.world;
              if (!w) return false;
              const t = w.track;
              const k = w.st.karts[w.cfg.humans[0]];
              const pc = t.pieces.find((p: any) => p.kind === 'wall');
              const into = ((k.si - pc.i0 + t.n) % t.n) / Math.max(1, (pc.i1 - pc.i0 + t.n) % t.n);
              if (k.rail || k.air || into < 0.2 || into > 0.45 || k.branch !== -1) return false;
              // onto the lane itself (+d is the laneR side), 60 % of its width out: a fixed +5.2 m sat past a narrow
              // lane's wall in its taper (Shelter), so the kart never touched it
              const right = t.laneR[k.si] >= t.laneL[k.si];
              const lane = right ? t.laneR[k.si] : t.laneL[k.si];
              const d = (right ? 1 : -1) * (t.halfW[k.si] + Math.max(1, lane * 0.6));
              k.x = t.px[k.si] - t.tz[k.si] * d;
              k.z = t.pz[k.si] + t.tx[k.si] * d;
              // dropped from 3 m: the lane's curl rises above the road, and a kart set below its ground is a step it
              // cannot climb (B12: pushed back at a fifth of its speed, Laundry)
              k.y = Math.max(k.y, t.py[k.si]) + 3;
              // along the road: the bot's own heading (back toward its racing line) flew it off the lane before it landed
              const v = Math.hypot(k.vx, k.vz);
              k.vx = t.tx[k.si] * v;
              k.vz = t.tz[k.si] * v;
              k.heading = Math.atan2(t.tx[k.si], t.tz[k.si]);
              // a teleport: cut the camera to the kart (its 0.08 s chase from 17 m away flew through the Yarn canyon rock)
              (window as any).__fm.shell.camera.snap(k.x, k.y, k.z, k.heading);
              return true;
            },
            null,
            { timeout: 240_000, polling: 'raf' },
          )
          .then(() => true, () => false);
        if (placed && (await freezeWhen(page, 'wall', 'k.air === 0 && k.surface === 6', 20_000))) {
          await setSpeed(page, 0.25);
          await page.waitForTimeout(500);
          await setSpeed(page, 0);
          await snap('wall');
        }
        await setSpeed(page, SPEED);
      }
      console.log(`${size.name} ${id}: pieces [${kinds.join(', ')}], shots [${got.join(', ')}], peak draw calls ${peak}`);
      expect(got.sort()).toEqual([...new Set(kinds)].sort());
      expect(c.errors).toEqual([]);
      await c.close();
    });
  }
}

test('old dares: SIM_VERSION 7 and 8 open as a target-time race with the notice; 9 races the ghost', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const v of [7, 8] as const) {
    const c = await open(browser, SIZES[1].opts);
    await c.page.goto(`/?bot=1#g=${LEGACY[`dare${v}`]}&n=Mia`);
    await expect(c.page.locator('body')).toContainText('another version of the game', { timeout: 20_000 });
    await expect.poll(() => c.page.evaluate(() => (window as any).__fm?.shell.world?.tick ?? 0), { timeout: 30_000 }).toBeGreaterThan(200);
    expect(await c.page.evaluate(() => (window as any).__fm.shell.setup.track.id)).toBe('kitchen');
    expect(await c.page.evaluate(() => !!(window as any).__fm.shell.stage.scene.getObjectByName('kart-Mia'))).toBe(false);
    expect(c.errors).toEqual([]);
    await c.close();
  }
  const c = await open(browser, SIZES[1].opts);
  await c.page.goto(`/?bot=1#g=${LEGACY.dare9}&n=Mia`);
  await expect(c.page.locator('.fm-dare-banner')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => c.page.evaluate(() => !!(window as any).__fm?.shell.stage.scene.getObjectByName('kart-Mia')), { timeout: 20_000 }).toBe(true);
  expect(c.errors).toEqual([]);
  await c.close();
});

test('old track codes v1 and v2 (no set pieces) still open and race', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const key of ['track_k_0', 'track_k_4', 'track_r_0', 'track_r_4'] as const) {
    const c = await open(browser, SIZES[0].opts);
    await c.page.goto(`/?t=${LEGACY[key]}&bot=1`);
    await expect.poll(() => c.page.evaluate(() => (window as any).__fm?.shell.setup?.track.id ?? null), { timeout: 30_000 }).toMatch(/^u-/);
    await expect(c.page.locator('.fm-ugc-sheet.on')).toHaveCount(0);
    await expect.poll(() => c.page.evaluate(() => (window as any).__fm?.shell.world?.tick ?? 0), { timeout: 40_000 }).toBeGreaterThan(200);
    expect(await c.page.evaluate(() => (window as any).__fm.shell.world.track.pieces.length)).toBe(0);
    expect(c.errors, key).toEqual([]);
    await c.close();
  }
});

/** Drag a stadium across the editor canvas (as e2e/editor.spec.ts). */
async function stadium(page: Page): Promise<void> {
  const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.width * 0.2;
  const h = box.height * 0.36;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) pts.push([cx + r, cy + h - (2 * h * i) / 4]);
  for (let i = 1; i <= 6; i++) pts.push([cx + r * Math.cos((Math.PI * i) / 6), cy - h - r * Math.sin((Math.PI * i) / 6)]);
  for (let i = 1; i <= 4; i++) pts.push([cx - r, cy - h + (2 * h * i) / 4]);
  for (let i = 1; i <= 5; i++) pts.push([cx - r * Math.cos((Math.PI * i) / 6), cy + h + r * Math.sin((Math.PI * i) / 6)]);
  // back to the start: on the 1440x900 canvas the last arc point sits > 40 m (CLOSE_DIST) from the first
  pts.push([cx + r * 0.995, cy + h + 2]);
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
}
type Qa = { x: number; y: number; frac: number; pieces: Array<{ kind: string; s: number }>; ok: boolean; driving: boolean } | null;
const qa = (page: Page, frac: number) => page.evaluate((f) => ((window as any).__fmDoodle?.qa(f) ?? null) as Qa, frac);
async function dropStunt(page: Page, kind: string, frac: number): Promise<void> {
  const b = (await page.locator(`.fm-ed-stunt[data-piece="${kind}"]`).boundingBox())!;
  const to = (await qa(page, frac))!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 4; k++) await page.mouse.move(b.x + b.width / 2 + ((to.x - b.x - b.width / 2) * k) / 4, b.y + b.height / 2 + ((to.y - b.y - b.height / 2) * k) / 4);
  await page.mouse.up();
}

test('editor stickers (loop, tunnel, jump) survive the share link in a fresh browser context', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await open(browser, SIZES[0].opts);
  const { page } = a;
  await page.goto('/?make&seed=4');
  await stadium(page);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 30_000 });
  await page.locator('.fm-ed-tab[data-tab="stickers"]').click();
  const loopAt = (await qa(page, -1))!.frac;
  await dropStunt(page, 'loop', -1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(1);
  await page.locator('.fm-ed-panel [aria-label="Done"]').click();
  await dropStunt(page, 'tunnel', (loopAt + 0.25) % 1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(2);
  await page.locator('.fm-ed-panel [aria-label="Done"]').click();
  await dropStunt(page, 'jump', (loopAt + 0.55) % 1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(3);
  await page.locator('.fm-ed-panel [aria-label="Done"]').click();
  await expect.poll(async () => (await qa(page, 0))?.driving, { timeout: 30_000 }).toBe(false);
  const before = (await qa(page, 0))!;
  const status = await page.locator('.fm-ed-status').textContent();
  await page.screenshot({ path: 'review/v3/1440x900-editor-stickers.png' });
  expect(before.ok, status ?? '').toBe(true);
  await page.locator('.fm-ed-actions .primary').click();
  await expect(page.locator('.fm-ed')).toHaveCount(0);
  const url = page.url();
  const want = before.pieces.map((p) => `${p.kind}@${p.s}`).sort();
  await a.close();

  const b = await open(browser, SIZES[1].opts);
  await b.page.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect.poll(() => b.page.evaluate(() => (window as any).__fm?.shell.world?.track.pieces.length ?? -1), { timeout: 30_000 }).toBe(want.length);
  const def = await b.page.evaluate(() => ((window as any).__fm.shell.setup.track.setPieces ?? []).map((p: any) => `${p.kind}@${p.s}`).sort());
  expect(def).toEqual(want);
  await b.page.waitForTimeout(1500);
  await b.page.screenshot({ path: 'review/v3/390x844-editor-fresh.png' });
  expect(b.errors).toEqual([]);
  await b.close();
});

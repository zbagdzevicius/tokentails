import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedFtueSeen } from './ftue-seed';

const here = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(here, 'screens');
mkdirSync(SCREENS, { recursive: true });
const LEVEL_IDS = ['heist-01', 'heist-02', 'heist-03', 'heist-04', 'heist-05', 'heist-06', 'heist-07', 'heist-08'];
const solutionPath = (id: string) => join(here, `../src/levels/${id}.solution.json`);
const SOLUTION_PATH = solutionPath('heist-01');
const SOLUTION = JSON.parse(readFileSync(SOLUTION_PATH, 'utf8')) as { finalHash: number; catIds: [string, string]; score: number };
const MANIFEST = JSON.parse(readFileSync(join(here, '../public/assets/manifest.json'), 'utf8')) as { cats: { id: string }[] };

type Heist = {
  screen(): string;
  stats(): { calls: number; triangles: number; fps: number; tick: number; screen: string; quality: { tier: 'high' | 'low'; settled: boolean } | null; frame: number };
  getState(): { tick: number; won: boolean; hash: number; score: number; rescued: boolean; coinsCollected: number; activeIndex: number; cats: { id: string; pos: { x: number; y: number } }[] } | null;
  step(n: number, input?: object): unknown;
  loadReplay(json: string, opts?: { speed?: number }): Promise<unknown>;
  yardStats(): { calls: number; triangles: number; cats: number; loaded: number; pendingFrames: number } | null;
  yardReady(): Promise<boolean>;
  renderGameToText(): string;
};
declare global {
  interface Window {
    __heist: Heist;
  }
}

const errors: string[] = [];

async function open(page: Page, query = '') {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  // First-run briefs are covered by ftue.spec.ts; here every level starts playing at once.
  await seedFtueSeen(page);
  await page.goto(`/?qa=1${query}`);
  await page.waitForFunction(() => !!window.__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
}

const screenOf = (page: Page) => page.evaluate(() => window.__heist.screen());
const stateOf = async (page: Page) => (await page.evaluate(() => window.__heist.getState()))!;
const tickOf = async (page: Page) => (await stateOf(page)).tick;

// Headless swiftshader under load can take hundreds of ms per frame, so the tests below never sleep
// and hope: they wait for the signal they need (ticks, drawn frames, a settled quality tier).

/** Resolves once the heist renderer has drawn `n` more frames. */
async function nextFrames(page: Page, n = 2) {
  const f0 = (await page.evaluate(() => window.__heist.stats())).frame;
  await expect.poll(() => page.evaluate(() => window.__heist.stats().frame), { timeout: 30_000 }).toBeGreaterThanOrEqual(f0 + n);
}

/** Resolves once the auto quality probe has picked its tier (it can switch high -> low once). */
async function qualitySettled(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__heist.stats().quality?.settled ?? false), { timeout: 30_000 }).toBe(true);
}
const shot = (page: Page, name: string) => page.screenshot({ path: join(SCREENS, `${name}.png`) });

test('title renders with logo, name and both entry points', async ({ page }) => {
  await open(page);
  expect(await screenOf(page)).toBe('title');
  await expect(page.getByRole('heading', { level: 1, name: /Catnip\s*Heist/i })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Token Tails' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cat Yard/ })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '01-title');
  expect(errors).toEqual([]);
});

test('cat yard renders every breed within the draw-call budget', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByRole('button', { name: /Cat Yard/ }).click();
  await expect.poll(() => screenOf(page)).toBe('yard');
  expect(await page.evaluate(() => window.__heist.yardReady())).toBe(true);
  // Wait for background extrusion to finish so the numbers are the steady state.
  await expect
    .poll(() => page.evaluate(() => window.__heist.yardStats()?.pendingFrames ?? -1), { timeout: 60_000 })
    .toBe(0);
  await page.waitForTimeout(600);
  const st = (await page.evaluate(() => window.__heist.yardStats()))!;
  expect(st.cats).toBe(MANIFEST.cats.length);
  expect(st.loaded).toBe(MANIFEST.cats.length);
  expect(st.calls).toBeGreaterThan(0);
  expect(st.calls).toBeLessThanOrEqual(150);
  expect(st.triangles).toBeLessThanOrEqual(100_000);
  const app = await page.evaluate(() => window.__heist.stats());
  expect(app.screen).toBe('yard');
  expect(app.calls).toBeLessThanOrEqual(150);
  await shot(page, '06-yard');
  await page.getByRole('button', { name: /Back/ }).click();
  await expect.poll(() => screenOf(page)).toBe('title');
  expect(errors).toEqual([]);
});

test('heist starts with the two chosen cats, moves, pauses and resumes', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => screenOf(page)).toBe('pick');
  // Clear the preselected pair, then choose two other breeds.
  const pressed = page.locator('.ch-card[aria-pressed="true"]');
  while ((await pressed.count()) > 0) await pressed.first().click();
  const chosen = MANIFEST.cats.map((c) => c.id).filter((id) => id !== 'bob' && id !== 'oreo').slice(3, 5) as [string, string];
  for (const id of chosen) await page.locator(`.ch-card[data-cat="${id}"]`).click();
  await expect(page.locator('.ch-card[aria-pressed="true"]')).toHaveCount(2);
  await shot(page, '02-pick');
  await page.getByRole('button', { name: 'Start heist' }).click();
  // Crew pick -> level select -> heist.
  await expect.poll(() => screenOf(page)).toBe('levels');
  await page.getByRole('button', { name: 'Start Kibble Corp Warehouse' }).click();
  await expect.poll(() => screenOf(page), { timeout: 45_000 }).toBe('heist');
  const s0 = (await page.evaluate(() => window.__heist.getState()))!;
  expect(s0.cats.map((c) => c.id)).toEqual(chosen);

  // Live keyboard input drives the active cat.
  await page.keyboard.down('KeyD');
  await expect.poll(async () => (await stateOf(page)).cats[0].pos, { timeout: 20_000 }).not.toEqual(s0.cats[0].pos);
  await page.keyboard.up('KeyD');
  // The key-up is in; let a couple of ticks sample it.
  const upTick = await tickOf(page);
  await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(upTick + 1);
  const s1 = await stateOf(page);
  expect(s1.tick).toBeGreaterThan(s0.tick);
  expect(s1.cats[0].pos).not.toEqual(s0.cats[0].pos);
  // Releasing the key stops the cat at once (continuous movement, no finishing the tile).
  await expect.poll(() => tickOf(page), { timeout: 20_000 }).toBeGreaterThan(s1.tick + 6);
  const s1b = await stateOf(page);
  expect(s1b.cats[0].pos).toEqual(s1.cats[0].pos);
  // Swap is edge-triggered.
  await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await page.evaluate(() => window.__heist.getState()))!.activeIndex).toBe(1);

  await nextFrames(page);
  const st = await page.evaluate(() => window.__heist.stats());
  expect(st.calls).toBeGreaterThan(0);
  expect(st.calls).toBeLessThanOrEqual(150);
  expect(st.triangles).toBeLessThanOrEqual(100_000);
  await shot(page, '03-heist');

  await page.keyboard.press('Escape');
  await expect.poll(() => screenOf(page)).toBe('pause');
  const pausedTick = (await page.evaluate(() => window.__heist.getState()))!.tick;
  // Frames keep drawing on the pause screen; the sim must not move while they do.
  await nextFrames(page, 4);
  expect((await page.evaluate(() => window.__heist.getState()))!.tick).toBe(pausedTick);
  await shot(page, '04-pause');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => screenOf(page)).toBe('heist');
  // Losing focus pauses; Escape resumes.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => screenOf(page)).toBe('pause');
  await page.keyboard.press('Escape');
  await expect.poll(() => screenOf(page)).toBe('heist');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await expect.poll(() => screenOf(page)).toBe('title');
  expect(errors).toEqual([]);
});

test('the heist-01 solution replays to Results with the vitest final hash', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const json = readFileSync(SOLUTION_PATH, 'utf8');
  await page.evaluate((j) => window.__heist.loadReplay(j), json);
  expect(await screenOf(page)).toBe('heist');
  // Let it play a moment in real time (a second of ticks), then fast-forward synchronously to the end.
  await expect.poll(() => tickOf(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(30);
  const mid = (await page.evaluate(() => window.__heist.getState()))!;
  expect(mid.tick).toBeGreaterThan(0);
  expect(mid.won).toBe(false);
  await page.evaluate(() => window.__heist.step(1900));
  await nextFrames(page);
  await shot(page, '05b-heist-late');
  await page.evaluate(() => window.__heist.step(100_000));
  const end = (await page.evaluate(() => window.__heist.getState()))!;
  expect(end.won).toBe(true);
  expect(end.rescued).toBe(true);
  expect(end.hash).toBe(SOLUTION.finalHash);
  expect(end.score).toBe(SOLUTION.score);
  await expect.poll(() => screenOf(page), { timeout: 10_000 }).toBe('results');
  await expect(page.locator('.ch-results').getByText(/You rescued/)).toBeVisible();
  // The win screen opens the in-game "Sent to shelters" modal (no navigation away from the game).
  const payouts = page.locator('.ch-results').getByRole('button', { name: 'See shelter payouts' });
  await expect(payouts).toBeVisible();
  await payouts.click();
  const modal = page.getByTestId('payouts-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Sent to shelters' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(payouts).toBeFocused();
  const hex = (SOLUTION.finalHash >>> 0).toString(16);
  await expect(page.locator('.ch-results')).toContainText(new RegExp(hex, 'i'));
  await page.waitForTimeout(500);
  await shot(page, '05-results');
  expect(await page.evaluate(() => window.__heist.renderGameToText())).toContain('won true');
  expect(errors).toEqual([]);
});

test('level select shows 8 heists with only the first unlocked on a fresh profile', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Start heist' }).click();
  await expect.poll(() => screenOf(page)).toBe('levels');
  const cards = page.locator('.ch-lv-card');
  await expect(cards).toHaveCount(8);
  expect(await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.level))).toEqual(LEVEL_IDS);
  expect(await cards.evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled))).toEqual([false, true, true, true, true, true, true, true]);
  await expect(page.locator('.ch-lv-card[data-level="heist-02"]')).toContainText('Win heist 1 to unlock');
  await expect(page.locator('.ch-lv-total')).toContainText('0 / 24');
  await expect(page.getByRole('list', { name: 'Star rules' })).toContainText('Clean and quick');
  await page.waitForTimeout(400);
  await shot(page, '02b-levels');
  // Back returns to the crew pick.
  await page.getByRole('button', { name: 'Back' }).first().click();
  await expect.poll(() => screenOf(page)).toBe('pick');
  expect(errors).toEqual([]);
});

test('every level solution replays to Results with won = true and the recorded hash', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  for (const id of LEVEL_IDS) {
    const json = readFileSync(solutionPath(id), 'utf8');
    const sol = JSON.parse(json) as { finalHash: number; score: number };
    await page.evaluate((j) => window.__heist.loadReplay(j), json);
    expect(await screenOf(page)).toBe('heist');
    await page.evaluate(() => window.__heist.step(100_000));
    const end = (await page.evaluate(() => window.__heist.getState()))!;
    expect(end.won, id).toBe(true);
    expect(end.hash, id).toBe(sol.finalHash);
    expect(end.score, id).toBe(sol.score);
    await expect.poll(() => screenOf(page), { timeout: 10_000 }).toBe('results');
    await expect(page.locator('.ch-results')).toContainText(new RegExp((sol.finalHash >>> 0).toString(16).padStart(8, '0'), 'i'));
    await expect(page.locator('.ch-results')).toContainText(id);
    if (id === 'heist-08') await shot(page, '05c-results-finale');
  }
  // Watching replays earns nothing.
  const prog = await page.evaluate(() => (window.__heist as unknown as { progress(): { levels: Record<string, unknown> } }).progress());
  expect(prog.levels).toEqual({});
  expect(errors).toEqual([]);
});

test('winning level 1 unlocks level 2 and it persists across a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  const sol = JSON.parse(readFileSync(SOLUTION_PATH, 'utf8')) as { catIds: [string, string]; runs: [number, number, number, number][]; finalHash: number };
  type QA = { start(c: [string, string], l: string): Promise<unknown>; freeze(on: boolean): void; step(n: number, i?: object): unknown };
  // Freeze the realtime clock first so no live ticks sneak in before the scripted inputs.
  await page.evaluate(async (ids) => {
    const qa = window.__heist as unknown as QA;
    qa.freeze(true);
    await qa.start(ids, 'heist-01');
  }, sol.catIds);
  expect(await screenOf(page)).toBe('heist');
  expect((await page.evaluate(() => window.__heist.getState()))!.tick).toBe(0);
  // Play the planned inputs live (play mode, not a replay): one QA step per input run.
  await page.evaluate((runs) => {
    const qa = window.__heist as unknown as QA;
    for (const [dx, dy, f, n] of runs) qa.step(n, { dx, dy, swap: !!(f & 1), interact: !!(f & 2), meow: !!(f & 4) });
  }, sol.runs);
  const end = (await page.evaluate(() => window.__heist.getState()))!;
  expect(end.won).toBe(true);
  expect(end.hash).toBe(sol.finalHash);
  await expect.poll(() => screenOf(page), { timeout: 10_000 }).toBe('results');
  await expect(page.locator('.ch-lv-res')).toBeVisible();
  await expect(page.locator('.ch-lv-res')).toContainText('Unlocked: Kennel Row');
  await expect(page.getByRole('button', { name: 'Next level' })).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '05d-results-next');
  const prog = await page.evaluate(() => (window.__heist as unknown as { progress(): { levels: Record<string, { won: boolean; stars: number }> } }).progress());
  expect(prog.levels['heist-01'].won).toBe(true);
  expect(prog.levels['heist-01'].stars).toBe(7);

  await page.reload();
  await page.waitForFunction(() => !!window.__heist && document.getElementById('app')?.dataset.ready === '1');
  await page.evaluate(() => (window.__heist as unknown as { levels(): void }).levels());
  await expect.poll(() => screenOf(page)).toBe('levels');
  const locked = await page.locator('.ch-lv-card').evaluateAll((els) => els.map((e) => (e as HTMLButtonElement).disabled));
  expect(locked).toEqual([false, false, true, true, true, true, true, true]);
  await expect(page.locator('.ch-lv-card[data-level="heist-01"]')).toContainText('Best');
  await expect(page.locator('.ch-lv-card[data-level="heist-01"] .ch-lv-stars .ch-on')).toHaveCount(3);
  // The level select now points at level 2; Next level from Results starts it.
  await expect(page.locator('.ch-lv-card[aria-current="true"]')).toHaveAttribute('data-level', 'heist-02');
  await page.waitForTimeout(400);
  await shot(page, '02c-levels-progress');
  await page.getByRole('button', { name: 'Start Kennel Row' }).click();
  await expect.poll(() => screenOf(page), { timeout: 45_000 }).toBe('heist');
  expect((await page.evaluate(() => window.__heist.renderGameToText())).length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

async function touchChecks(page: Page) {
  // Touch controls are on, big enough and inside the viewport; the idle stick sits bottom-left.
  await expect(page.locator('.ch-touch.ch-on')).toBeVisible();
  const vp = page.viewportSize()!;
  for (const name of ['Swap', 'Meow', 'Act']) {
    const b = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  }
  const stick = (await page.locator('.ch-stick').boundingBox())!;
  expect(stick.x).toBeGreaterThanOrEqual(0);
  expect(stick.y).toBeGreaterThan(vp.height * 0.4);
  expect(stick.x + stick.width / 2).toBeLessThan(vp.width / 2);
  const crew = (await page.locator('.ch-crew').boundingBox())!;
  const overlap = !(stick.x > crew.x + crew.width || stick.x + stick.width < crew.x || stick.y > crew.y + crew.height || stick.y + stick.height < crew.y);
  expect(overlap).toBe(false);
  // Hints use touch wording. Check the text, not .ch-on: on narrow portrait screens the hint hides
  // itself 7 s of wall time after it appears, which a slow run can pass before getting here.
  await expect(page.locator('.ch-hint')).toContainText('joystick');
  await expect(page.locator('.ch-hint')).not.toContainText('WASD');
}

async function dragStick(page: Page) {
  const s0 = (await page.evaluate(() => window.__heist.getState()))!;
  const zone = (await page.locator('.ch-stick-zone').boundingBox())!;
  const x = zone.x + zone.width * 0.5, y = zone.y + zone.height * 0.6;
  await page.evaluate(({ x, y }) => {
    const el = document.querySelector('.ch-stick-zone')!;
    const ev = (type: string, cx: number, cy: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true, cancelable: true, isPrimary: true }));
    ev('pointerdown', x, y);
    ev('pointermove', x + 30, y + 40);
    ev('pointermove', x + 60, y + 80);
    (window as unknown as { __end: () => void }).__end = () => ev('pointerup', x + 60, y + 80);
  }, { x, y });
  // Hold the stick until the active cat has moved (ticks, not wall time, move it).
  await expect.poll(async () => {
    const s = await stateOf(page);
    return s.cats[s.activeIndex].pos;
  }, { timeout: 20_000 }).not.toEqual(s0.cats[s0.activeIndex].pos);
  await page.evaluate(() => (window as unknown as { __end: () => void }).__end());
}

test('touch layout on a phone in landscape', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await open(page);
  await shot(page, '07-phone-title');
  await page.evaluate(() => (window.__heist as unknown as { start(): Promise<unknown> }).start());
  await expect.poll(() => screenOf(page), { timeout: 45_000 }).toBe('heist');
  await nextFrames(page);
  await shot(page, '08-phone-heist');
  // Landscape keeps the hint up (only narrow portrait lets it expire).
  await expect(page.locator('.ch-hint.ch-on')).toBeVisible();
  await touchChecks(page);
  await dragStick(page);
  // The Swap button swaps cats.
  const a0 = (await page.evaluate(() => window.__heist.getState()))!.activeIndex;
  await page.getByRole('button', { name: 'Swap', exact: true }).dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch' });
  await expect.poll(async () => (await page.evaluate(() => window.__heist.getState()))!.activeIndex).toBe(a0 === 0 ? 1 : 0);
  const st = await page.evaluate(() => window.__heist.stats());
  expect(st.calls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('touch layout on a phone in portrait', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await open(page);
  // The portrait hint expires after 7 s of wall time, so record that it was shown instead of racing it.
  await page.evaluate(() => {
    const w = window as unknown as { __hintSeen: boolean };
    w.__hintSeen = false;
    const hint = document.querySelector('.ch-hint')!;
    const check = () => {
      if (hint.classList.contains('ch-on') && getComputedStyle(hint).display !== 'none') w.__hintSeen = true;
    };
    new MutationObserver(check).observe(hint, { attributes: true, attributeFilter: ['class'] });
  });
  await page.evaluate(() => (window.__heist as unknown as { start(): Promise<unknown> }).start());
  await expect.poll(() => screenOf(page), { timeout: 45_000 }).toBe('heist');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hintSeen: boolean }).__hintSeen)).toBe(true);
  await nextFrames(page);
  await shot(page, '09-phone-portrait');
  await touchChecks(page);
  await dragStick(page);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('retrying a run does not leak scene objects or draw calls', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const measure = async () => {
    // Freeze before starting so both runs are measured at tick 0: live ticks move guards in and out
    // of view (frustum culling, alert marks), which changes the draw calls without any leak.
    await page.evaluate(async () => {
      const qa = window.__heist as unknown as { start(): Promise<unknown>; freeze(on: boolean): void };
      qa.freeze(true);
      await qa.start();
    });
    // Compare like with like: the high tier draws the post chain and shadow pass, so a probe that
    // drops to low between the two measurements changes the draw calls too.
    await qualitySettled(page);
    await nextFrames(page);
    return page.evaluate(() => {
      const app = (window.__heist as unknown as { app: { renderer: { scene: { traverse(f: (o: { name: string }) => void): void } } } }).app;
      let cones = 0;
      app.renderer.scene.traverse((o) => {
        if (o.name === 'vision-cones') cones++;
      });
      const st = window.__heist.stats();
      return { cones, calls: st.calls, triangles: st.triangles, tier: st.quality?.tier, tick: st.tick };
    });
  };
  const first = await measure();
  // Retry through the pause menu twice.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => (window.__heist as unknown as { freeze(on: boolean): void }).freeze(false));
    await page.keyboard.press('Escape');
    await expect.poll(() => screenOf(page)).toBe('pause');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => screenOf(page), { timeout: 45_000 }).toBe('heist');
  }
  const again = await measure();
  expect(first.cones).toBe(1);
  expect(again.cones).toBe(1);
  expect(again.tier).toBe(first.tier);
  expect([first.tick, again.tick]).toEqual([0, 0]);
  expect(again.calls).toBe(first.calls);
  // Triangles vary a little with the voxel animation frame; a leak would add a whole cone set per run.
  expect(again.triangles).toBeLessThan(first.triangles * 1.05);
  expect(errors).toEqual([]);
});

test('visiting the Cat Yard many times keeps the game canvas alive', async ({ page }) => {
  test.setTimeout(120_000);
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (/Too many active WebGL contexts|Context Lost/i.test(m.text())) warnings.push(m.text());
  });
  await open(page);
  await page.evaluate(() => (window.__heist as unknown as { start(): Promise<unknown> }).start());
  await page.evaluate(() => (window.__heist as unknown as { app: { toMenu(): void } }).app.toMenu());
  for (let i = 0; i < 18; i++) {
    await page.getByRole('button', { name: /Cat Yard/ }).click();
    await expect.poll(() => screenOf(page)).toBe('yard');
    await page.getByRole('button', { name: /Back/ }).click();
    await expect.poll(() => screenOf(page)).toBe('title');
  }
  await page.evaluate(() => (window.__heist as unknown as { start(): Promise<unknown> }).start());
  const lost = await page.evaluate(() => (window.__heist as unknown as { app: { renderer: { webgl: { getContext(): WebGLRenderingContext } } } }).app.renderer.webgl.getContext().isContextLost());
  expect(lost).toBe(false);
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});

test('a stale ?replay=last falls back to the title', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.evaluate(() => localStorage.setItem('catnip-heist.lastReplay', JSON.stringify({ levelId: 'heist-01', simVersion: -1, seed: 1, catIds: ['bob', 'oreo'], runs: [], ticks: 0, finalHash: 0 })));
  await open(page, '&replay=last');
  expect(await screenOf(page)).toBe('title');
  expect(errors).toEqual([]);
});

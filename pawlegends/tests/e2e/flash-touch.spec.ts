import { expect, test, type Page } from '@playwright/test';
import { trickAim } from '../../src/input/abilities';
import { landing } from '../../src/input/heading';
import { attr, me, startFirstMatch } from './helpers';

/**
 * Founder: "fix flash, it must be initiated into a place automatically on touch in which we are heading to" and "there
 * can't be any friction" (heading.ts). With the joystick held in each of 8 directions, one tap on the Paw Trick
 * (Pounce, Blink 4 m) blinks the hero ~4 m that way at once: the press fires, the jump shows within 2 frames of the
 * next sim tick, and a ghost marker shows the landing. Phone landscape sizes 844×390 and 667×375.
 *
 * Pounce's cooldown is 2 minutes, so each direction is its own match (a fresh page, speed ×1, so the hero barely moves
 * between the press and the blink). The hero first walks (a minimap move order) to open ground at (25 m, 29 m), clear
 * of walls for 5 m in every direction. The blink is read per sim tick from the e2e track of the own hero
 * (`window.__plTrack`, `?e2e=1` only), so a slow frame on a loaded machine (many ticks in one frame) cannot hide it
 * in the running; the frame trace then checks when the drawn hero shows it.
 */

const SPOT = { x: 25000, y: 29000 };
const DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
/** Pounce's blink (data/tricks.ts) and the most a hero runs in one tick (Clem: 5 m/s at 30 Hz, a little over). */
const BLINK_MM = 4000;
const RUN_MM_PER_TICK = 180;
/** One sample per animation frame: [ms, me "x,y,state", tick, aim shown]. */
type Sample = [number, string, string, string];

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate((k) => new Promise<void>((done) => {
    let left = k;
    const f = (): void => (--left <= 0 ? done() : void requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
}

async function walkToSpot(page: Page): Promise<void> {
  const map = (await page.locator('.pl-minimap canvas').boundingBox())!;
  const mx = map.x + (SPOT.x / 100000) * map.width;
  const my = map.y + (1 - SPOT.y / 60000) * map.height;
  // a right-click on the minimap is a move order (the sim paths around the base walls)
  await page.mouse.click(mx, my, { button: 'right' });
  await expect
    .poll(
      async () => {
        const m = await me(page);
        if (Math.hypot(m.x - SPOT.x, m.y - SPOT.y) > 1200 && m.state === 'idle') await page.mouse.click(mx, my, { button: 'right' });
        return Math.hypot(m.x - SPOT.x, m.y - SPOT.y);
      },
      { timeout: 20000, intervals: [100] },
    )
    .toBeLessThan(1200);
}

async function flashOnce(page: Page, dir: number): Promise<void> {
  await startFirstMatch(page);
  expect(await attr(page, 'team')).toBe('0');
  await walkToSpot(page);
  const trick = page.locator('.pl-tbtn.trick');
  await expect(trick).not.toHaveClass(/cooling|locked/);
  const tb = (await trick.boundingBox())!;
  const vp = page.viewportSize()!;
  const a = (dir * Math.PI) / 4;
  const sx = Math.round(vp.width * 0.18);
  const sy = Math.round(vp.height * 0.62);
  const kx = Math.round(sx + Math.cos(a) * 50);
  const ky = Math.round(sy - Math.sin(a) * 50);
  const tx = Math.round(tb.x + tb.width / 2);
  const ty = Math.round(tb.y + tb.height / 2);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts });
  const stick = { x: kx, y: ky, id: 1 };
  // the frame sampler
  await page.evaluate(() => {
    const w = window as unknown as { flashTrace: unknown[]; flashOn: boolean };
    w.flashTrace = [];
    w.flashOn = true;
    const d = document.documentElement.dataset;
    const f = (): void => {
      w.flashTrace.push([performance.now(), d.me ?? '', d.tick ?? '', d.aim ?? '']);
      if (w.flashOn) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  // hold the joystick in direction `dir` (the other thumb) and, in the same breath, tap the trick button once
  await touch('touchStart', [{ x: sx, y: sy, id: 1 }]);
  await touch('touchMove', [stick]);
  const heads0 = (await attr(page, 'heads')).split(',').map(Number);
  const tapAt = await page.evaluate(() => (window as unknown as { flashTrace: unknown[] }).flashTrace.length);
  await touch('touchStart', [stick, { x: tx, y: ty, id: 2 }]);
  await touch('touchEnd', [stick]);
  // at least 8 frames and 45 sim ticks (a loaded machine draws few frames, each covering many ticks)
  const t0 = Number(await attr(page, 'tick'));
  await frames(page, 8);
  await page.waitForFunction((t) => Number(document.documentElement.dataset.tick) >= t + 45, t0, { timeout: 30000 });
  await touch('touchEnd', []);
  const { trace, track } = (await page.evaluate(() => {
    const w = window as unknown as { flashTrace: Sample[]; flashOn: boolean; __plTrack: number[][] };
    w.flashOn = false;
    return { trace: w.flashTrace, track: w.__plTrack.slice() };
  })) as { trace: Sample[]; track: number[][] };
  const heads1 = (await attr(page, 'heads')).split(',').map(Number);
  // the press fired the blink (not the release)
  expect(heads1[0]).toBe(heads0[0] + 1);
  // the blink, read per sim tick (the e2e track of the own hero): the one big step after the tap
  const pressTick = Number(trace[tapAt]?.[2] ?? t0);
  let k = -1;
  for (let i = 1; i < track.length; i++) {
    if (track[i][0] < pressTick - 2) continue;
    if (Math.hypot(track[i][1] - track[i - 1][1], track[i][2] - track[i - 1][2]) > 1500) {
      k = i;
      break;
    }
  }
  const why0 = `${DIRS[dir]}: press frame tick ${pressTick}; track ${JSON.stringify(track.filter((t) => t[0] >= pressTick - 3 && t[0] <= pressTick + 40))}`;
  expect(k, `no blink: ${why0}`).toBeGreaterThan(0);
  const blinkTick = track[k][0];
  const dx = track[k][1] - track[k - 1][1];
  const dy = track[k][2] - track[k - 1][2];
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const along = dx * ux + dy * uy;
  const across = Math.abs(-dx * uy + dy * ux);
  const ticks = Math.max(1, track[k][0] - track[k - 1][0]);
  const why = `${why0}; step ${dx},${dy} over ${ticks} tick(s) at tick ${blinkTick}`;
  // the ghost marker's landing (the client's copy of the sim's wall clip) is where the sim put the hero
  const pre0 = { x: track[k - 1][1], y: track[k - 1][2] };
  const ghost = landing(trickAim('pounce'), pre0, a);
  expect(Math.hypot(ghost.x - track[k][1], ghost.y - track[k][2]), `${why}; ghost ${ghost.x},${ghost.y}`).toBeLessThan(RUN_MM_PER_TICK * ticks + 150);
  // the full 4 m that way (plus at most a run step), not 2.4 m, not toward an enemy
  expect(along, why).toBeGreaterThan(BLINK_MM - 150);
  expect(along, why).toBeLessThan(BLINK_MM + RUN_MM_PER_TICK * ticks + 150);
  expect(across, why).toBeLessThan(250);
  // the press went into the next sim ticks (the command rides the next tick; on a loaded machine the main thread hands
  // the touch over late, so this bound is loose: the frame check below is the tight one)
  expect(blinkTick - pressTick, why).toBeLessThanOrEqual(45);
  // the run goes on from the landing: the hero never walks back toward where it blinked from
  const after = track.filter((t) => t[0] > blinkTick && t[0] <= blinkTick + 30);
  for (const t of after) expect((t[1] - track[k][1]) * ux + (t[2] - track[k][2]) * uy, `${why}; walked back at tick ${t[0]}`).toBeGreaterThan(-200);
  // the drawn hero shows it within 2 frames of the first frame that has reached the blink's tick
  const tick = trace.map((t) => Number(t[2]));
  const pos = trace.map((t) => t[1].split(',').map(Number));
  let next = tapAt;
  while (next < trace.length - 1 && tick[next] < blinkTick) next++;
  const pre = { x: track[k - 1][1], y: track[k - 1][2] };
  let shown = -1;
  for (let i = tapAt; i < trace.length; i++) {
    if ((pos[i][0] - pre.x) * ux + (pos[i][1] - pre.y) * uy > BLINK_MM - 400) {
      shown = i;
      break;
    }
  }
  const whyF = `${why}; frames ${JSON.stringify(trace.slice(tapAt, tapAt + 8))}`;
  expect(shown, whyF).toBeGreaterThanOrEqual(0);
  expect(shown - next, whyF).toBeLessThanOrEqual(2);
  // the ghost landing marker showed with the blink
  expect(trace.slice(tapAt, shown + 2).some((t) => t[3] === '1'), whyF).toBe(true);
}

for (const vp of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test.describe(`flash on touch at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    for (let k = 0; k < 8; k++) {
      test(`joystick ${DIRS[k]} + one tap on Pounce blinks ~4 m ${DIRS[k]}`, async ({ page }) => {
        test.setTimeout(150_000);
        await flashOnce(page, k);
      });
    }
  });
}

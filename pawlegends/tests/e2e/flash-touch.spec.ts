import { expect, test, type Page } from '@playwright/test';
import { trickAim } from '../../src/input/abilities';
import { landing } from '../../src/input/heading';
import { attr, me, ops, startFirstMatch } from './helpers';
import { Op } from '../../src/sim/api';

/**
 * Founder: "fix flash, it must be initiated into a place automatically on touch in which we are heading to" and "there
 * can't be any friction" (heading.ts). With the joystick held in each of 8 directions, one real tap on the Paw Trick
 * (Pounce, Blink 4 m; the trick finger lifts, the stick thumb stays) blinks the hero ~4 m that way at once: the press
 * fires, the jump shows within 2 frames of the next sim tick, a ghost marker shows the landing, and the run goes on
 * along the stick from the landing (never back). Phone landscape sizes 844×390 and 667×375. Two more at 844×390: the
 * stick let go in the same breath as the press (its Stop must not eat the flash), and a tap with no stick held after
 * a run (the press fires, along the way the hero last ran, before the finger lifts).
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
  // MAP-GAPS A6: the minimap draws the map inset 6 px (ui/minimap.ts MM_PAD)
  const pad = 6;
  const mx = map.x + pad + (SPOT.x / 100000) * (map.width - 2 * pad);
  const my = map.y + pad + (1 - SPOT.y / 60000) * (map.height - 2 * pad);
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

interface Shot {
  trace: Sample[];
  track: number[][];
  tapAt: number;
  t0: number;
  heads0: number[];
  heads1: number[];
  /** Sim tick at the press and when the trick finger lifted. */
  pressTick: number;
  liftTick: number;
}

type Touch = (type: string, pts: { x: number; y: number; id: number }[]) => Promise<unknown>;

async function setup(page: Page): Promise<{ touch: Touch; stickAt: (dir: number) => { x: number; y: number; id: number }; base: { x: number; y: number; id: number }; trick: { x: number; y: number; id: number } }> {
  await startFirstMatch(page);
  expect(await attr(page, 'team')).toBe('0');
  await walkToSpot(page);
  const trickEl = page.locator('.pl-tbtn.trick');
  await expect(trickEl).not.toHaveClass(/cooling|locked/);
  const tb = (await trickEl.boundingBox())!;
  const vp = page.viewportSize()!;
  const sx = Math.round(vp.width * 0.18);
  const sy = Math.round(vp.height * 0.62);
  const cdp = await page.context().newCDPSession(page);
  const touch: Touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts });
  const stickAt = (dir: number) => {
    const a = (dir * Math.PI) / 4;
    return { x: Math.round(sx + Math.cos(a) * 50), y: Math.round(sy - Math.sin(a) * 50), id: 1 };
  };
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
  return { touch, stickAt, base: { x: sx, y: sy, id: 1 }, trick: { x: Math.round(tb.x + tb.width / 2), y: Math.round(tb.y + tb.height / 2), id: 2 } };
}

const heads = async (page: Page): Promise<number[]> => (await attr(page, 'heads')).split(',').map(Number);
const tickNow = async (page: Page): Promise<number> => Number(await attr(page, 'tick'));
const traceLen = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { flashTrace: unknown[] }).flashTrace.length);

async function waitTicks(page: Page, n: number): Promise<void> {
  const t0 = await tickNow(page);
  await frames(page, 4);
  await page.waitForFunction((t) => Number(document.documentElement.dataset.tick) >= t, t0 + n, { timeout: 30000 });
}

async function collect(page: Page, partial: Omit<Shot, 'trace' | 'track' | 'heads1'>): Promise<Shot> {
  const { trace, track } = (await page.evaluate(() => {
    const w = window as unknown as { flashTrace: Sample[]; flashOn: boolean; __plTrack: number[][] };
    w.flashOn = false;
    return { trace: w.flashTrace, track: w.__plTrack.slice() };
  })) as { trace: Sample[]; track: number[][] };
  return { ...partial, trace, track, heads1: await heads(page) };
}

/** The blink in the per-tick track: index k of the first tick after the press that jumped > 1.5 m, or -1. */
function blinkIndex(track: number[][], pressTick: number): number {
  for (let i = 1; i < track.length; i++) {
    if (track[i][0] < pressTick - 2) continue;
    if (Math.hypot(track[i][1] - track[i - 1][1], track[i][2] - track[i - 1][2]) > 1500) return i;
  }
  return -1;
}

/**
 * The blink went ~4 m along `a` (rad), the ghost marker matched the sim's landing, the drawn hero showed it within 2
 * frames of the first frame at its tick, and the ghost showed. Returns the blink's index in the track.
 */
function checkBlink(shot: Shot, a: number, label: string): number {
  const { track, trace, tapAt, pressTick } = shot;
  const k = blinkIndex(track, pressTick);
  const why0 = `${label}: press tick ${pressTick}, lift tick ${shot.liftTick}; track ${JSON.stringify(track.filter((t) => t[0] >= pressTick - 3 && t[0] <= pressTick + 40))}`;
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
  expect(Math.hypot(ghost.x - track[k][1], ghost.y - track[k][2]), `${why}; ghost ${ghost.x},${ghost.y}`).toBeLessThan(RUN_MM_PER_TICK * ticks + 300);
  // the full 4 m that way (plus at most a run step), not 2.4 m, not toward an enemy; a wall on the way cuts it short
  // exactly where the sim's clip does (the ghost check above), so the bound is the clipped distance, never under 2.5 m
  const full = (ghost.x - pre0.x) * ux + (ghost.y - pre0.y) * uy;
  expect(full, `${why}; the spot is too close to a wall to test`).toBeGreaterThan(2500);
  expect(along, why).toBeGreaterThan(Math.min(BLINK_MM, full) - 150);
  expect(along, why).toBeLessThan(BLINK_MM + RUN_MM_PER_TICK * ticks + 150);
  expect(across, why).toBeLessThan(300);
  // the press went into the next sim ticks (the command rides the next tick; on a loaded machine the main thread hands
  // the touch over late, so this bound is loose: the frame check below is the tight one)
  expect(blinkTick - pressTick, why).toBeLessThanOrEqual(45);
  // the drawn hero shows it within 2 frames of the first frame that has reached the blink's tick
  const tick = trace.map((t) => Number(t[2]));
  const pos = trace.map((t) => t[1].split(',').map(Number));
  let next = tapAt;
  while (next < trace.length - 1 && tick[next] < blinkTick) next++;
  let shown = -1;
  for (let i = tapAt; i < trace.length; i++) {
    if ((pos[i][0] - pre0.x) * ux + (pos[i][1] - pre0.y) * uy > Math.min(BLINK_MM, full) - 400) {
      shown = i;
      break;
    }
  }
  const whyF = `${why}; frames ${JSON.stringify(trace.slice(tapAt, tapAt + 8))}`;
  expect(shown, whyF).toBeGreaterThanOrEqual(0);
  expect(shown - next, whyF).toBeLessThanOrEqual(2);
  // the ghost landing marker showed with the blink
  expect(trace.slice(tapAt, shown + 2).some((t) => t[3] === '1'), whyF).toBe(true);
  return k;
}

/** Joystick held toward `dir`, one real tap on Pounce (only the trick finger lifts), the stick held on. */
async function flashHeld(page: Page, dir: number): Promise<void> {
  const { touch, stickAt, base, trick } = await setup(page);
  const a = (dir * Math.PI) / 4;
  const stick = stickAt(dir);
  await touch('touchStart', [base]);
  await touch('touchMove', [stick]);
  await waitTicks(page, 6);
  const heads0 = await heads(page);
  const tapAt = await traceLen(page);
  const t0 = await tickNow(page);
  await touch('touchStart', [stick, trick]);
  const pressTick = await tickNow(page);
  // a real tap: the trick finger lifts (touchEnd lists the points that lift), the stick thumb stays down
  await touch('touchEnd', [trick]);
  const liftTick = await tickNow(page);
  await waitTicks(page, 50);
  const shot = await collect(page, { tapAt, t0, heads0, pressTick, liftTick });
  await touch('touchEnd', [stick]);
  // the press fired the blink (one press, one cast out)
  expect(shot.heads1[0]).toBe(heads0[0] + 1);
  expect(shot.heads1[1]).toBeGreaterThanOrEqual(heads0[1] + 1);
  const k = checkBlink(shot, a, DIRS[dir]);
  // the run goes on along the stick from the landing: never back toward where it blinked from, and on by > 1 m
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const land = shot.track[k];
  const after = shot.track.filter((t) => t[0] > land[0] && t[0] <= land[0] + 40);
  let best = 0;
  for (const t of after) {
    const along = (t[1] - land[1]) * ux + (t[2] - land[2]) * uy;
    // (the walk-back bug went ~2 m back; a stick sliding along a wall the blink landed next to may drift a little)
    expect(along, `${DIRS[dir]}: walked back at tick ${t[0]}: ${JSON.stringify(after)}`).toBeGreaterThan(-600);
    best = Math.max(best, along);
  }
  expect(best, `${DIRS[dir]}: the run did not go on from the landing: ${JSON.stringify(after)}`).toBeGreaterThan(1000);
}

for (const vp of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test.describe(`flash on touch at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    for (let k = 0; k < 8; k++) {
      test(`joystick ${DIRS[k]} + one tap on Pounce blinks ~4 m ${DIRS[k]} and runs on`, async ({ page }) => {
        test.setTimeout(150_000);
        await flashHeld(page, k);
      });
    }
  });
}

test.describe('flash on touch at 844x390: the other thumb', () => {
  test.use({ viewport: { width: 844, height: 390 } });
  test('the stick let go in the same breath as the press: the flash still goes, then the hero stops', async ({ page }) => {
    test.setTimeout(150_000);
    const { touch, stickAt, base, trick } = await setup(page);
    const dir = 0;
    const a = (dir * Math.PI) / 4;
    const stick = stickAt(dir);
    await touch('touchStart', [base]);
    await touch('touchMove', [stick]);
    await waitTicks(page, 8);
    const heads0 = await heads(page);
    const tapAt = await traceLen(page);
    const t0 = await tickNow(page);
    // press flash and lift the stick thumb in one go (the stick's Stop lands next to the cast)
    await touch('touchStart', [stick, trick]);
    const pressTick = await tickNow(page);
    await touch('touchEnd', [stick, trick]);
    const liftTick = await tickNow(page);
    await waitTicks(page, 50);
    const shot = await collect(page, { tapAt, t0, heads0, pressTick, liftTick });
    const k = checkBlink(shot, a, 'stick let go');
    // then the hero stops near the landing (the Stop went after the cast, it did not eat it)
    const land = shot.track[k];
    const last = shot.track.at(-1)!;
    expect(Math.hypot(last[1] - land[1], last[2] - land[2]), JSON.stringify(shot.track.slice(k, k + 40))).toBeLessThan(2600);
    expect(await ops(page)).toContain(Op.Stop);
  });
  test('no stick held, after a run: the press fires along the way the hero ran, before the finger lifts', async ({ page }) => {
    test.setTimeout(150_000);
    const { touch, stickAt, base, trick } = await setup(page);
    const dir = 5;
    const a = (dir * Math.PI) / 4;
    await touch('touchStart', [base]);
    await touch('touchMove', [stickAt(dir)]);
    await waitTicks(page, 20);
    await touch('touchEnd', [stickAt(dir)]);
    // the hero stops and stands
    await waitTicks(page, 12);
    const heads0 = await heads(page);
    const tapAt = await traceLen(page);
    const t0 = await tickNow(page);
    await touch('touchStart', [trick]);
    const pressTick = await tickNow(page);
    // the finger stays down a long while: the blink must not wait for it
    await waitTicks(page, 40);
    const liftTick = await tickNow(page);
    await touch('touchEnd', [trick]);
    const shot = await collect(page, { tapAt, t0, heads0, pressTick, liftTick });
    expect(shot.heads1[0]).toBe(heads0[0] + 1);
    const k = checkBlink(shot, a, 'no stick');
    expect(shot.track[k][0], 'the blink waited for the finger to lift').toBeLessThan(liftTick);
  });
  test('the stick pushed into a wall slides the hero along it: the flash goes along the wall, at least 3 m (QA 2026-11-07)', async ({ page }) => {
    test.setTimeout(150_000);
    const { touch, base, trick } = await setup(page);
    // south at a light tilt (18 px: no lane magnet) until the hero meets the wall corner ~4.5 m south of the spot and
    // slides on it south-west (x falls from 25 m to 23.5 m; straight south from there a blink lands 0.5 to 2.8 m)
    const south = { ...base, y: base.y + 18 };
    await touch('touchStart', [base]);
    await touch('touchMove', [south]);
    // watched every frame in the page (a poll from here can miss the slide on a loaded machine)
    const slid = await page.waitForFunction(
      (spotY) => {
        const t = (window as unknown as { __plTrack: number[][] }).__plTrack.slice(-4);
        if (t.length < 4) return null;
        const dx = t[3][1] - t[0][1];
        const dy = t[3][2] - t[0][2];
        if (t[3][2] < spotY - 6000) return 'went past';
        return t[3][2] < spotY - 1000 && dx < -250 && Math.abs(dx) > 0.5 * Math.abs(dy) ? 'sliding' : null;
      },
      SPOT.y,
      { polling: 'raf', timeout: 20000 },
    );
    expect(await slid.jsonValue(), 'the hero walked south without meeting the wall').toBe('sliding');
    const heads0 = await heads(page);
    const tapAt = await traceLen(page);
    const t0 = await tickNow(page);
    await touch('touchStart', [south, trick]);
    const pressTick = await tickNow(page);
    await touch('touchEnd', [trick]);
    const liftTick = await tickNow(page);
    await waitTicks(page, 50);
    const shot = await collect(page, { tapAt, t0, heads0, pressTick, liftTick });
    await touch('touchEnd', [south]);
    expect(shot.heads1[0]).toBe(heads0[0] + 1);
    const k = blinkIndex(shot.track, pressTick);
    const why = `press tick ${pressTick}; track ${JSON.stringify(shot.track.filter((t) => t[0] >= pressTick - 8 && t[0] <= pressTick + 40))}`;
    expect(k, `no blink: ${why}`).toBeGreaterThan(0);
    const dx = shot.track[k][1] - shot.track[k - 1][1];
    const dy = shot.track[k][2] - shot.track[k - 1][2];
    const ticks = Math.max(1, shot.track[k][0] - shot.track[k - 1][0]);
    // a long blink along the wall the hero slides on, not 0.5 to 2.8 m straight into it (the slide is probed 2.4 m
    // ahead, so a 4 m blink along it may be cut a little where the wall ends)
    expect(Math.hypot(dx, dy), why).toBeGreaterThan(3000);
    expect(Math.hypot(dx, dy), why).toBeLessThan(BLINK_MM + RUN_MM_PER_TICK * ticks + 150);
  });
});


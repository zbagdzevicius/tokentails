import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRewind } from './rewind-plan';

/**
 * First run (plan G10 "Heist", decision #72): the brief card on a level's first visit, the ghost-paw
 * route after 20 s without progress (or a tap on the objective), and Rewind 5 s after a detection.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(here, 'screens');
mkdirSync(SCREENS, { recursive: true });

type Run = [number, number, number, number];

/** Ticks [from, to) of a run-length log. */
function sliceRuns(runs: readonly Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let t = 0;
  for (const r of runs) {
    const a = Math.max(from, t);
    const b = Math.min(to, t + r[3]);
    if (b > a) out.push([r[0], r[1], r[2], b - a]);
    t += r[3];
    if (t >= to) break;
  }
  return out;
}

type QA = {
  screen(): string;
  getState(): { tick: number; hash: number; won: boolean; spottedCount: number; cats: { pos: { x: number; y: number } }[] } | null;
  start(catIds?: [string, string], levelId?: string): Promise<unknown>;
  step(n: number, input?: object): unknown;
  freeze(on: boolean): void;
  feed(runs: Run[]): unknown;
  briefOpen(): boolean;
  closeBrief(): void;
  ftue(): { briefs: string[]; rewinds: number; routeTaps: number };
  route(): { shown: string | null; prints: number };
  rewind(): boolean;
  rewindOffered(): boolean;
  log(): { ticks: number; runs: Run[] } | null;
  lastReplay(): { ticks: number; runs: Run[]; finalHash?: number } | null;
  loadReplay(json: string): Promise<unknown>;
  stats(): { frame: number };
};
const qa = <T>(page: Page, fn: (h: QA) => T | Promise<T>) => page.evaluate(fn as never) as Promise<T>;
const errors: string[] = [];

async function open(page: Page) {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!(window as unknown as { __heist?: unknown }).__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
}

async function startLevel1(page: Page) {
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.start(['bob', 'oreo'], 'heist-01'));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.screen()), { timeout: 45_000 }).toBe('heist');
}

const h = (page: Page) => ({
  state: () => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.getState()!),
  route: () => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.route()),
  briefOpen: () => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.briefOpen()),
  frames: () => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.stats().frame),
});

test('a first visit opens on the level brief; the clock waits for it; it shows once per level', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Start heist' }).click();
  await page.getByRole('button', { name: 'Start Kibble Corp Warehouse' }).click();
  const brief = page.getByRole('dialog', { name: 'Kibble Corp Warehouse' });
  await expect(brief).toBeVisible({ timeout: 45_000 });
  await expect(brief).toContainText('Heist 1 of 8');
  await expect(brief).toContainText('The plan');
  await expect(brief).toContainText('Hold the plate and swap to open the door');
  await expect(brief).toContainText('Tap the objective for a route');
  await expect(brief).toContainText('Rewind 5 s');
  await expect(page.getByTestId('heist-brief-go')).toBeFocused();
  // The run has not started: frames draw, the sim stays on tick 0.
  const f0 = await h(page).frames();
  await expect.poll(() => h(page).frames(), { timeout: 30_000 }).toBeGreaterThan(f0 + 3);
  expect((await h(page).state()).tick).toBe(0);
  await page.screenshot({ path: join(SCREENS, 'ftue-01-brief.png') });

  // A move key closes it and is consumed: the cat does not move on that press.
  const pos0 = (await h(page).state()).cats[0].pos;
  await page.keyboard.down('KeyD');
  await expect(brief).toBeHidden();
  await expect.poll(async () => (await h(page).state()).tick, { timeout: 20_000 }).toBeGreaterThan(5);
  expect((await h(page).state()).cats[0].pos).toEqual(pos0);
  await page.keyboard.up('KeyD');
  expect(await qa(page, () => (window as unknown as { __heist: QA }).__heist.ftue().briefs)).toEqual(['heist-01']);

  // Seen: a retry or a reload starts playing at once.
  await page.reload();
  await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
  await startLevel1(page);
  expect(await h(page).briefOpen()).toBe(false);
  await expect.poll(async () => (await h(page).state()).tick, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('ghost paws show a route after 20 s without progress; the objective chip toggles them', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await startLevel1(page);
  await page.getByTestId('heist-brief-go').click();
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.freeze(true));
  const chip = page.getByTestId('heist-objective');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  // 20 s of sim time, standing still.
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.step(599));
  expect((await h(page).route()).shown).toBeNull();
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.step(1));
  const r = await h(page).route();
  expect(r.shown).toBe('idle');
  expect(r.prints).toBeGreaterThan(5);
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toContainText('Follow the paw prints');
  // Only drawn: the cats did not move.
  expect((await h(page).state()).tick).toBe(600);
  const f0 = await h(page).frames();
  await expect.poll(() => h(page).frames(), { timeout: 30_000 }).toBeGreaterThan(f0 + 6);
  await page.screenshot({ path: join(SCREENS, 'ftue-02-ghost-paws.png') });

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  expect((await h(page).route()).shown).toBeNull();
  await page.keyboard.press('KeyH');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  expect((await h(page).route()).shown).toBe('tap');
  expect(errors).toEqual([]);
});

test('Rewind 5 s after a detection restores the earlier state, and the finished run replays to the same win', async ({ page }) => {
  test.setTimeout(180_000);
  // Detection, rewound tick and its hash come from the current sim and solution (not pinned).
  const plan = planRewind('heist-01');
  const SOLUTION = plan.solution;
  await open(page);
  await startLevel1(page);
  await page.getByTestId('heist-brief-go').click();
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.freeze(true));
  const rewind = page.getByTestId('heist-rewind');
  await expect(rewind).toBeHidden();
  await page.evaluate((runs) => (window as unknown as { __heist: QA }).__heist.feed(runs), plan.detourRuns as Run[]);
  const seen = await h(page).state();
  expect(seen.tick).toBe(plan.spottedTick);
  expect(seen.spottedCount).toBe(1);
  await expect(rewind).toBeVisible();
  await page.screenshot({ path: join(SCREENS, 'ftue-03-rewind-offer.png') });

  // R while paused is refused and keeps the offer (it used to throw it away).
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.screen())).toBe('pause');
  await page.keyboard.press('KeyR');
  expect((await h(page).state()).tick).toBe(plan.spottedTick);
  expect(await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.rewindOffered())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.screen())).toBe('heist');
  await expect(rewind).toBeVisible();

  await rewind.click();
  await expect(rewind).toBeHidden();
  const back = await h(page).state();
  expect(back.tick).toBe(plan.rewoundTick);
  expect(back.hash).toBe(plan.rewoundHash);
  expect(back.spottedCount).toBe(0);
  expect((await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.log()))!.ticks).toBe(plan.rewoundTick);

  // Carry on with the plan from there: the heist is won, and the saved log replays to the same win.
  await page.evaluate((runs) => (window as unknown as { __heist: QA }).__heist.feed(runs), sliceRuns(SOLUTION.runs as Run[], plan.rewoundTick, SOLUTION.ticks));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: QA }).__heist.screen()), { timeout: 30_000 }).toBe('results');
  const saved = (await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.lastReplay()))!;
  expect(saved.ticks).toBe(SOLUTION.ticks);
  expect(saved.finalHash).toBe(SOLUTION.finalHash);
  await page.evaluate((json) => (window as unknown as { __heist: QA }).__heist.loadReplay(json), JSON.stringify(saved));
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.step(100_000));
  const replayed = await h(page).state();
  expect(replayed.won).toBe(true);
  expect(replayed.hash).toBe(SOLUTION.finalHash);
  expect(await qa(page, () => (window as unknown as { __heist: QA }).__heist.ftue().rewinds)).toBe(1);
  expect(errors).toEqual([]);
});

test('no rewind on level 4 and later; the brief there has no rewind tip', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.start(['bob', 'oreo'], 'heist-04'));
  const brief = page.getByRole('dialog', { name: 'Counting House' });
  await expect(brief).toBeVisible({ timeout: 45_000 });
  await expect(brief).toContainText('Heist 4 of 8');
  await expect(brief).not.toContainText('Rewind');
  await page.keyboard.press('Enter');
  await expect(brief).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.rewind())).toBe(false);
  expect(errors).toEqual([]);
});

for (const vp of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`the brief's Go! button is inside the card at ${vp.width}x${vp.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await open(page);
    await startLevel1(page);
    const brief = page.getByRole('dialog', { name: 'Kibble Corp Warehouse' });
    await expect(brief).toBeVisible({ timeout: 45_000 });
    const go = page.getByTestId('heist-brief-go');
    await expect(go).toBeVisible();
    // Measure after the card's pop-in (it scales from .9 and slides up 24px) has settled; a loaded
    // runner can otherwise catch it mid-animation.
    await page.waitForFunction(() => {
      const el = document.querySelector('.ch-brief-card');
      return !!el && el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    }, null, { timeout: 10_000 });
    // The card (the dialog's panel) and the button, with the card scrolled to the top as it opens.
    const box = await page.evaluate(() => {
      const card = document.querySelector('.ch-brief-card')!.getBoundingClientRect();
      const btn = document.querySelector('[data-testid="heist-brief-go"]')!.getBoundingClientRect();
      return { cardTop: card.top, cardBottom: card.bottom, top: btn.top, bottom: btn.bottom, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    expect(box.bottom).toBeLessThanOrEqual(box.cardBottom + 0.5);
    expect(box.top).toBeGreaterThanOrEqual(box.cardTop);
    expect(box.cardBottom).toBeLessThanOrEqual(box.vh);
    expect(box.sw).toBeLessThanOrEqual(box.vw);
    await page.screenshot({ path: join(SCREENS, `ftue-brief-${vp.width}x${vp.height}.png`) });
    await go.click();
    await expect(brief).toBeHidden();
  });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the objective chip is named by its objective, a tap shows the route, and its text clears the Route pill', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await startLevel1(page);
    await page.getByTestId('heist-brief-go').tap();
    await page.evaluate(() => (window as unknown as { __heist: QA }).__heist.freeze(true));
    // The accessible name is the chip's content (label and current objective), not a fixed label.
    const chip = page.getByRole('button', { name: /Hold the plate and swap to open the door/ });
    await expect(chip).toHaveAccessibleDescription('Tap to show a route.');
    await chip.tap();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toHaveAccessibleDescription('Route shown; tap to hide it.');
    expect((await h(page).route()).prints).toBeGreaterThan(5);
    const gap = await page.evaluate(() => {
      const text = document.querySelector('[data-testid="heist-objective"] > span[aria-live]')!.getBoundingClientRect();
      const pill = document.querySelector('.ch-obj-route')!.getBoundingClientRect();
      return pill.left - text.right;
    });
    expect(gap).toBeGreaterThanOrEqual(8);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SCREENS, 'ftue-route-390x844.png') });
    expect(errors).toEqual([]);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { attr } from './helpers';

/**
 * POC.md §10 and §15 item 23 (Chromium, project `desktop`):
 * - every hero wears a Legendary card skin (`&skins=legendary`, e2e only), so the cosmetics are in the numbers;
 * - draw calls on Low ≤ 90 (≤ 70 without the §6.9 fallback; the POC heroes ARE the fallback, README "Hero art")
 *   and on Med ≤ 110, at the busiest frame of a real match: the most units alive at once, at least 6 heroes,
 *   24 minions and 4 towers. `?quality=` forces the tier (the governor does not step it down then);
 * - JS heap ≤ 150 MB (`performance.memory.usedJSHeapSize`) after that match;
 * - cold load to the first controllable frame ≤ 6 s on simulated 4G: tests/e2e/perf-load.spec.ts (its own file: it
 *   runs on the GPU, which needs other launch flags);
 * - no `window.__GAME__` or other debug hook in the built files.
 * The draw-call figure is the game's own `data-draws` attribute (renderer.info.render.calls, sampled once a second),
 * read through the `?e2e=1` data attributes; nothing here adds a window global.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'Chromium desktop only (CDP, performance.memory)'));

interface Peak {
  draws: number;
  units: [number, number, number];
  maxDraws: number;
  /** Most heroes, minions and towers alive at once (each on its own). */
  most: [number, number, number];
  samples: number;
}

/** Play the first match at `speed` on a forced tier; sample draws and live units until the results screen. */
async function busiest(page: Page, quality: 'low' | 'med'): Promise<Peak> {
  // GDD §7.2: every hero in a Legendary card skin (foil, glints, the recall flourish): the worst case for cosmetics
  await page.goto(`/?e2e=1&quality=${quality}&speed=6&skins=legendary`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  const peak: Peak = {
    draws: 0,
    units: [0, 0, 0],
    maxDraws: 0,
    most: [0, 0, 0],
    samples: 0,
  };
  let busiestUnits = -1;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if ((await attr(page, 'screen')) === 'results') break;
    expect(await attr(page, 'quality')).toBe(quality);
    const draws = Number(await attr(page, 'draws')) || 0;
    const units = (await attr(page, 'units')).split(',').map(Number) as [number, number, number];
    if (units.length === 3 && draws > 0) {
      peak.samples++;
      peak.maxDraws = Math.max(peak.maxDraws, draws);
      for (let k = 0; k < 3; k++) peak.most[k] = Math.max(peak.most[k], units[k]);
      const n = units[0] + units[1] + units[2];
      if (n > busiestUnits) {
        busiestUnits = n;
        peak.draws = draws;
        peak.units = units;
      }
    }
    await page.waitForTimeout(250);
  }
  return peak;
}

test('draw calls on Low within budget at the busiest frame, and the JS heap ≤ 150 MB', async ({ page }) => {
  test.setTimeout(240_000);
  const p = await busiest(page, 'low');
  console.log(
    `perf low: busiest frame ${p.units.join('/')} heroes/minions/towers at ${p.draws} draws; most at once ${p.most.join('/')}; ` +
      `max ${p.maxDraws} draws over ${p.samples} samples`,
  );
  expect(p.samples).toBeGreaterThan(20);
  // A real match: all 6 heroes, the towers, and a full set of waves (the sim's minion count peaks near 24).
  expect(p.most[0]).toBe(6);
  expect(p.most[1]).toBeGreaterThanOrEqual(20);
  expect(p.most[2]).toBeGreaterThanOrEqual(4);
  expect(p.maxDraws).toBeLessThanOrEqual(90);
  const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1);
  console.log(`perf heap: ${(heap / 1048576).toFixed(1)} MB after a match`);
  expect(heap).toBeGreaterThan(0);
  expect(heap).toBeLessThanOrEqual(150 * 1048576);
});

test('draw calls on Med ≤ 110 at the busiest frame', async ({ page }) => {
  test.setTimeout(240_000);
  const p = await busiest(page, 'med');
  console.log(
    `perf med: busiest frame ${p.units.join('/')} heroes/minions/towers at ${p.draws} draws; most at once ${p.most.join('/')}; ` +
      `max ${p.maxDraws} draws over ${p.samples} samples`,
  );
  expect(p.most[1]).toBeGreaterThanOrEqual(20);
  expect(p.maxDraws).toBeLessThanOrEqual(110);
});

test('?perf=1 shows the device-gate readout in a match; without it there is none', async ({ page }) => {
  const globals = () => page.evaluate(() => Object.keys(window).sort());
  await page.goto('/?e2e=1&quality=low');
  await page.waitForSelector('html[data-screen="title"]');
  await expect(page.locator('.pl-perf')).toHaveCount(0);
  const without = await globals();
  await page.goto('/?e2e=1&quality=low&perf=1');
  await page.waitForSelector('html[data-screen="title"]');
  // Not a debug hook: the readout adds nothing to window.
  expect(await globals()).toEqual(without);
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  const el = page.locator('.pl-perf');
  await expect(el).toContainText(/\d+ fps · low/, { timeout: 5000 });
  await expect(el).toContainText(/p95 \d+\.\d ms · match \d+\.\d/);
  await expect(el).toContainText(/draws \d+ · max \d+/);
  await expect(el).toContainText(/heap \d+ MB/);
  console.log(`perf readout: ${(await el.textContent())?.replace(/\n/g, ' | ')}`);
});

test('the built files carry no debug hooks', async () => {
  const { DEBUG_HOOK_RE } = await import('../../tools/lib/budget-lib.mjs');
  const dist = path.join(ROOT, '.e2e-dist');
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(dist).filter((f) => /\.(js|mjs|html)$/.test(f));
  expect(files.length).toBeGreaterThan(1);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    expect(DEBUG_HOOK_RE.test(text), path.relative(dist, f)).toBe(false);
    // three.js registers its own version as window.__THREE__; any other window.__ global is a debug hook.
    expect(/window\.__(?!THREE__)[A-Za-z]/.test(text), path.relative(dist, f)).toBe(false);
  }
});

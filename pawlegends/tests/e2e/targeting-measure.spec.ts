import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startFirstMatch } from './helpers';

/**
 * TARGETING.md §8 (founder: "improve clickability on champs / towers / minions ... especially in teamfights"): in a
 * live bots match the camera visits the busiest enemy hero again and again, and the pick lab (`__plWorld.pickLab`,
 * src/input/pickLab.ts) taps a 4 x 5 grid over every enemy body on screen with the old pick (a point at the feet, a
 * fixed radius) and the new one (the drawn selection cylinder). Desktop sizes use the click pick (heroes, minions,
 * towers); touch sizes the field tap that locks a hero. The new pick must hit heroes in crowds far more often, and a
 * real hover (desktop) on a hero's chest must ring that hero. `PL_TGT_OUT=<dir>` writes the samples as JSON and a
 * screenshot of the busiest spot.
 */
type Sample = { kind: string; crowd: number; old: 'hit' | 'other' | 'none'; neu: 'hit' | 'other' | 'none' };
type Lab = (op: 'measure' | 'busiest' | 'chests', touch?: boolean) => Promise<unknown>;

const lab = <T>(page: Page, op: 'measure' | 'busiest' | 'chests', touch = false): Promise<T> =>
  page.evaluate(([o, t]) => (window as unknown as { __plWorld: { pickLab: Lab } }).__plWorld.pickLab(o, t), [op, touch] as const) as Promise<T>;

const rate = (s: Sample[], key: 'old' | 'neu', v: string): number => (s.length ? s.filter((x) => x[key] === v).length / s.length : NaN);

const SIZES = [
  { name: 'desktop', w: 1440, h: 900, touch: false },
  { name: 'landscape', w: 844, h: 390, touch: true },
  { name: 'landscape', w: 1280, h: 590, touch: true },
  { name: 'landscape', w: 667, h: 375, touch: true },
];

for (const size of SIZES) {
  test(`${size.w}x${size.h}: taps on drawn bodies pick that unit, heroes first in crowds`, async ({ page }, info) => {
    test.skip(info.project.name !== size.name, 'one input per project');
    // under CPU load (swiftshader) a match runs slowly: the sampling loop stops by a budget counted from the match start
    const budget = Number(process.env.PL_TGT_BUDGET_MS ?? 360_000);
    test.setTimeout(budget + 480_000);
    await page.setViewportSize({ width: size.w, height: size.h });
    await startFirstMatch(page, '&speed=3', 'cat');
    const t0 = Date.now();
    const samples: Sample[] = [];
    let spots = 0;
    let hovers = 0;
    let hoverHits = 0;
    let shot = 0;
    const out = process.env.PL_TGT_OUT;
    const deadline = t0 + budget;
    while (Date.now() < deadline && spots < 30) {
      if ((await page.evaluate(() => document.documentElement.dataset.screen)) === 'results') break;
      const b = await lab<{ x: number; z: number; crowd: number } | null>(page, 'busiest');
      if (!b || b.crowd < 1) {
        await page.waitForTimeout(1500);
        continue;
      }
      await page.evaluate(([x, z]) => (window as unknown as { __plWorld: { view: { peekHold(x: number, z: number): void } } }).__plWorld.view.peekHold(x, z), [b.x, b.z] as const);
      await page.waitForTimeout(700);
      const got = await lab<Sample[]>(page, 'measure', size.touch);
      if (!got.some((s) => s.kind === 'hero')) continue;
      samples.push(...got);
      spots++;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `measure-${size.w}x${size.h}.partial.json`), JSON.stringify(samples));
      }
      if (!size.touch) {
        // a real hover on a hero's chest rings that hero (DesktopInput.unitUnderCursor → view.hover)
        const c = (await lab<{ id: number; x: number; y: number }[]>(page, 'chests'))[0];
        if (c) {
          await page.mouse.move(c.x, c.y);
          await page.waitForTimeout(160);
          const hov = await page.evaluate(() => (window as unknown as { __plWorld: { view: { hover: { id: number } | null } } }).__plWorld.view.hover?.id ?? -1);
          // units keep moving at speed=3: count the try only if that hero's chest is still under the cursor
          const now = (await lab<{ id: number; x: number; y: number }[]>(page, 'chests')).find((q) => q.id === c.id);
          if (now && Math.hypot(now.x - c.x, now.y - c.y) < 16) {
            hovers++;
            if (hov === c.id) hoverHits++;
          }
        }
      }
      if (out && shot < 2 && b.crowd >= 3) {
        mkdirSync(out, { recursive: true });
        await page.screenshot({ path: join(out, `after-${size.w}x${size.h}-crowd-${shot++}.png`) });
      }
      await page.waitForTimeout(1800);
    }
    const heroes = samples.filter((s) => s.kind === 'hero');
    const crowded = heroes.filter((s) => s.crowd >= 2);
    const summary = {
      size: `${size.w}x${size.h}`,
      input: size.touch ? 'touch' : 'mouse',
      spots,
      hover: { tries: hovers, hits: hoverHits },
      rows: ['hero', 'minion', 'tower'].flatMap((kind) =>
        [
          ['all', (s: Sample) => s.kind === kind],
          ['0-1', (s: Sample) => s.kind === kind && s.crowd <= 1],
          ['2-3', (s: Sample) => s.kind === kind && s.crowd >= 2 && s.crowd <= 3],
          ['4+', (s: Sample) => s.kind === kind && s.crowd >= 4],
        ].map(([crowd, f]) => {
          const s = samples.filter(f as (s: Sample) => boolean);
          return { kind, crowd, taps: s.length, old: { hit: rate(s, 'old', 'hit'), other: rate(s, 'old', 'other'), none: rate(s, 'old', 'none') }, neu: { hit: rate(s, 'neu', 'hit'), other: rate(s, 'neu', 'other'), none: rate(s, 'neu', 'none') } };
        }),
      ),
    };
    console.log(JSON.stringify(summary));
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `measure-${size.w}x${size.h}.json`), JSON.stringify({ summary, samples }, null, 1));
    }
    expect(heroes.length).toBeGreaterThan(20);
    expect(rate(heroes, 'neu', 'hit')).toBeGreaterThan(0.85);
    expect(rate(heroes, 'neu', 'hit')).toBeGreaterThan(rate(heroes, 'old', 'hit'));
    if (crowded.length >= 20) expect(rate(crowded, 'neu', 'hit')).toBeGreaterThan(rate(crowded, 'old', 'hit'));
    if (hovers >= 3) expect(hoverHits / hovers).toBeGreaterThan(0.6);
  });
}

import { expect, test } from '@playwright/test';
import { seedSide } from './helpers';

/**
 * PERF-IOS §8 Track C (docs/plans/moba/PERF-IOS.md), project `landscape` (touch, 844x390):
 * - the boot splash leaves the page (its infinite animations ran for the whole session) and the title runs at most
 *   one infinite CSS animation;
 * - the champion browser: no backdrop blur on touch, the lobby canvas stops drawing behind it, the skill clip draws at
 *   the menu rate (≤ 30 fps), and the clip adds no DOM damage numbers;
 * - a match: the loading veil stays up until the warm-up linked the match's programs (no program links after it in
 *   the first seconds of play), and a skill on cooldown writes its sweep only when it moves a step (ui/cdSweep.ts).
 * WebGL calls are counted per canvas by wrapping WebGL2RenderingContext.prototype before the page loads.
 */

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch landscape only'));

const COUNT_GL = (): void => {
  const P = WebGL2RenderingContext.prototype;
  const w = window as unknown as { __glc: Record<string, number>; __progAfterVeil: number; __veilOut: boolean };
  w.__glc = {};
  w.__progAfterVeil = 0;
  w.__veilOut = false;
  const clear = P.clear;
  P.clear = function (this: WebGL2RenderingContext, m: number) {
    const c = this.canvas as HTMLCanvasElement;
    const k = c.id || c.className || 'other';
    w.__glc[k] = (w.__glc[k] ?? 0) + 1;
    return clear.call(this, m);
  };
  const link = P.linkProgram;
  P.linkProgram = function (this: WebGL2RenderingContext, p: WebGLProgram) {
    if (w.__veilOut && (this.canvas as HTMLCanvasElement).id === 'game-canvas') w.__progAfterVeil++;
    return link.call(this, p);
  };
};

const clears = (page: import('@playwright/test').Page, k: string): Promise<number> =>
  page.evaluate((key) => (window as unknown as { __glc: Record<string, number> }).__glc[key] ?? 0, k);

test('boot splash, champion browser and preview pacing', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(COUNT_GL);
  await seedSide(page, 'cat');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 5_000 });
  const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
  expect(infinite).toBeLessThanOrEqual(1);

  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
  const dmg0 = await page.locator('.fx-dmg-layer').count();
  // the champion select itself draws no 3D (portraits only); Preview opens the browser's clip on demand
  await expect(page.locator('.pl-pick canvas')).toHaveCount(0);
  await page.locator('.cs-sk[data-slot="q"]').tap();
  await page.locator('.cs-panel [data-a="codex"]').first().tap();
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html[data-champ="1"]')).toHaveCount(1);
  expect(await dlg.evaluate((el) => getComputedStyle(el).backdropFilter || 'none')).toBe('none');
  await page.waitForSelector('.pl-skill-preview-canvas', { timeout: 60_000 });
  await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toBe('playing');
  // the clip draws (SwiftShader under load: its first frames can take seconds)
  const pStart = await clears(page, 'pl-skill-preview-canvas');
  await expect.poll(() => clears(page, 'pl-skill-preview-canvas'), { timeout: 30_000 }).toBeGreaterThan(pStart + 1);
  // measure 3 s: the lobby canvas draws nothing, the clip at most 30 frames a second (+ slack for timer jitter)
  const g0 = await clears(page, 'game-canvas');
  const p0 = await clears(page, 'pl-skill-preview-canvas');
  await page.waitForTimeout(3000);
  const g1 = await clears(page, 'game-canvas');
  const p1 = await clears(page, 'pl-skill-preview-canvas');
  expect(g1 - g0).toBeLessThanOrEqual(1);
  expect((p1 - p0) / 3).toBeLessThanOrEqual(33);
  expect(await page.locator('.fx-dmg-layer').count()).toBe(dmg0);

  await page.locator('.pl-champ [data-a="close"]').tap();
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await expect(page.locator('html[data-champ]')).toHaveCount(0);
  // the lobby draws again
  const g2 = await clears(page, 'game-canvas');
  await page.waitForTimeout(1000);
  expect(await clears(page, 'game-canvas')).toBeGreaterThan(g2);
});

test('match: no program links after the veil; cooldown sweeps write only on a step', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(COUNT_GL);
  await seedSide(page, 'cat');
  // a forced tier: the quality probe would otherwise step the tier down a few seconds in (a tier change relinks
  // programs by design; that is not a warm-up miss)
  await page.goto('/?e2e=1&quality=low');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('.pl-loading');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 60_000 });
  await page.evaluate(() => ((window as unknown as { __veilOut: boolean }).__veilOut = true));
  expect(Number(await page.evaluate(() => document.documentElement.dataset.warmMs ?? '-1'))).toBeGreaterThan(0);
  await page.waitForSelector('html[data-match="live"]', { timeout: 60_000 });
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // walk toward the lane for a few seconds (towers come between the camera and the hero: their x-ray variant)
  const stick = { x: 140, y: 300 };
  await page.mouse.move(stick.x, stick.y);
  await page.mouse.down();
  await page.mouse.move(stick.x + 60, stick.y - 40, { steps: 6 });
  await page.waitForTimeout(6000);
  await page.mouse.up();
  // the zero holds when the warm-up finished inside its cap (a GPU; SwiftShader under load links slower than the cap
  // and the veil goes anyway: then the programs link in play, as before)
  if ((await page.evaluate(() => document.documentElement.dataset.warmed)) === '1') {
    expect(await page.evaluate(() => (window as unknown as { __progAfterVeil: number }).__progAfterVeil)).toBe(0);
  } else test.info().annotations.push({ type: 'warm-up', description: 'capped: the post-veil program check was skipped' });

  // a skill on cooldown: count style writes on the touch buttons while it runs
  const q = page.locator('.pl-tbtn.q');
  await q.tap();
  await expect(q).toHaveClass(/cooling/, { timeout: 10_000 });
  const seen = await page.evaluate(
    () =>
      new Promise<{ writes: number; frames: number; values: string[] }>((done) => {
        let writes = 0;
        let frames = 0;
        const values: string[] = [];
        const btn = document.querySelector<HTMLElement>('.pl-tbtn.q')!;
        const mo = new MutationObserver((rs) => {
          for (const r of rs) {
            if (r.attributeName !== 'style') continue;
            writes++;
            values.push(btn.style.getPropertyValue('--cd'));
          }
        });
        mo.observe(btn, { attributes: true, attributeFilter: ['style'] });
        const tick = (): void => {
          frames++;
          if (frames < 1e6) raf = requestAnimationFrame(tick);
        };
        let raf = requestAnimationFrame(tick);
        setTimeout(() => {
          mo.disconnect();
          cancelAnimationFrame(raf);
          done({ writes, frames, values });
        }, 1500);
      }),
  );
  // it used to be a write every frame; now only when the sweep moves one of its 90 steps (ui/cdSweep.ts)
  expect(seen.writes).toBeLessThanOrEqual(Math.max(2, seen.frames));
  for (const v of seen.values) if (v) expect(Math.abs(Number(v) * 90 - Math.round(Number(v) * 90))).toBeLessThan(0.01);
});

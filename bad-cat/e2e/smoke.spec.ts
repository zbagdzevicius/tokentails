import { expect, test, type Page } from '@playwright/test';

/** Bad Cat smoke (LANES L8): 390x844 portrait, canvas after the briefing, scripted QA run ends. */

type QaHook = { screen(): string; play(inputs: { dir: number; speed: number; buttons: number }[]): Promise<{ ticks: number; finalHash: number; score: number }> };

async function hasHook(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof (window as unknown as { __BADCAT_QA__?: unknown }).__BADCAT_QA__ === 'object');
}

test('page loads at 390x844 without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await expect(page.locator('#app')).toBeVisible();
  const vp = page.viewportSize();
  expect(vp).toEqual({ width: 390, height: 844 });
  // No horizontal scroll in portrait.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('a canvas exists after the briefing', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(500);
  test.skip(!(await hasHook(page)), 'L5 QA hook (__BADCAT_QA__) not wired yet');
  // Tap through link intro / cat maker skip / briefing until the stage canvas shows.
  for (let i = 0; i < 10 && (await page.locator('canvas').count()) === 0; i++) {
    const btn = page.getByRole('button', { name: /skip|play|start|go|be a bad cat/i }).first();
    if (await btn.count()) await btn.click().catch(() => undefined);
    else await page.mouse.click(195, 700);
    await page.waitForTimeout(400);
  }
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
});

test('__BADCAT_QA__.play(scripted inputs) returns an ended RunResult', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(500);
  test.skip(!(await hasHook(page)), 'L5 QA hook (__BADCAT_QA__) not wired yet');
  const result = await page.evaluate(async () => {
    const qa = (window as unknown as { __BADCAT_QA__: QaHook }).__BADCAT_QA__;
    const inputs: { dir: number; speed: number; buttons: number }[] = [];
    // Trot east 2 s, swat a few times, then idle; the run ends at its tick limit.
    for (let t = 0; t < 60; t++) inputs.push({ dir: 3, speed: 2, buttons: 0 });
    for (let t = 0; t < 30; t++) inputs.push({ dir: 0, speed: 0, buttons: t % 10 === 0 ? 1 : 0 });
    const r = await qa.play(inputs);
    return { ticks: r.ticks, finalHash: r.finalHash, score: r.score };
  });
  expect(result.ticks).toBeGreaterThan(0);
  expect(Number.isInteger(result.finalHash)).toBe(true);
  expect(result.score).toBeGreaterThanOrEqual(0);
});

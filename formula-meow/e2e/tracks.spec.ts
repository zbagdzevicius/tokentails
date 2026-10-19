import { expect, test, type Page } from '@playwright/test';

/** What the tracks lane exposes for QA: the race's track, its dressing, coins, hazards and the renderer's counters. */
async function state(page: Page) {
  return page.evaluate(() => {
    type W = { __fm?: { shell: { world: { tick: number; track: { def: { id: string }; coins: unknown[]; hazards: unknown[]; branches: unknown[] }; st: { karts: Array<{ dist: number; branch: number }> } } | null; stage: { renderer: { info: { render: { calls: number; triangles: number } } } } } }; __fmTracks?: { dressed: string } };
    const w = window as unknown as W;
    const sh = w.__fm?.shell;
    const wd = sh?.world;
    if (!wd) return null;
    return {
      id: wd.track.def.id,
      tick: wd.tick,
      coins: wd.track.coins.length,
      hazards: wd.track.hazards.length,
      branches: wd.track.branches.length,
      dressed: w.__fmTracks?.dressed ?? '',
      calls: sh!.stage.renderer.info.render.calls,
      tris: sh!.stage.renderer.info.render.triangles,
      dist: wd.st.karts[5].dist,
    };
  });
}

const CIRCUITS = ['kitchen', 'laundry', 'rooftops', 'yarn', 'cafe', 'shelter'];

for (const id of CIRCUITS) {
  test(`${id}: loads with its dressing, coins and hazards, races, within 120 draw calls`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`/?track=${id}&bot=1&seed=7&speed=3`);
    await expect.poll(async () => (await state(page))?.dressed, { timeout: 30_000 }).toBe(id);
    const s0 = (await state(page))!;
    expect(s0.coins).toBeGreaterThanOrEqual(9);
    expect(s0.hazards).toBeGreaterThanOrEqual(1);
    expect(s0.branches).toBe(1);
    await expect.poll(async () => (await state(page))?.dist ?? 0, { timeout: 60_000 }).toBeGreaterThan(120);
    const s1 = (await state(page))!;
    // 8 karts at phone size (390×844): the budget is 120 draw calls (ITERATION-2.md)
    expect(s1.calls).toBeLessThanOrEqual(120);
    await page.screenshot({ path: `e2e/screens/track-${id}.png` });
    expect(errors).toEqual([]);
  });
}

test('the battle arena builds its floor, cover and item clusters', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?track=rug&bot=1&seed=3&speed=2');
  await expect.poll(async () => (await state(page))?.dressed, { timeout: 30_000 }).toBe('rug');
  await expect.poll(async () => (await state(page))?.tick ?? 0, { timeout: 30_000 }).toBeGreaterThan(300);
  const s = (await state(page))!;
  expect(s.calls).toBeLessThanOrEqual(120);
  await page.screenshot({ path: 'e2e/screens/track-rug.png' });
  expect(errors).toEqual([]);
});

test('Track Doodle offers the hazard and shortcut stickers and the new themes', async ({ page }) => {
  await page.goto('/?make&seed=4');
  await expect(page.locator('.fm-ed')).toBeVisible();
  await page.locator('.fm-ed-tab[data-tab="stickers"]').click();
  await expect(page.locator('.fm-ed-stk[data-kind="hazard"]')).toBeVisible();
  await expect(page.locator('.fm-ed-stk[data-kind="shortcut"]')).toBeVisible();
  await page.locator('.fm-ed-tab[data-tab="style"]').click();
  for (const label of ['Café', 'Shelter', 'Living room']) await expect(page.locator('.fm-ed-chip', { hasText: label })).toBeVisible();
});

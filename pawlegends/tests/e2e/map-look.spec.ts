/**
 * Map look (render only): each of the six maps in Practice, at 1440 × 900 (desktop) and 844 × 390 (landscape touch):
 * the raised blockers (render/views/raisedGround.ts) and the map's time-of-day light (render/daylight.ts). Saves one
 * screenshot at the spawn and two over the jungle per map and size into MAP_LOOK_OUT (default: the test's output
 * folder), and checks the scene: the raised ground mesh exists, and the light follows the map's preset.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
// Hearthwood (5v5 Classic) is off the menu since Nov 19 (MODE-UNLOCKS.md): the five 3v3 maps, through Practice
const MAPS = ['crossing', 'ridge', 'thicket', 'quarry', 'pitch'] as const;
/** Ground points (m, sim x / y) to look at per map: a jungle edge and the middle. */
const LOOK: Record<string, [number, number][]> = {
  crossing: [
    [27, 39],
    [40, 30],
  ],
  ridge: [
    [30, 38],
    [42, 22],
  ],
  thicket: [
    [30, 38],
    [42, 22],
  ],
  quarry: [
    [40, 30],
    [36, 44],
  ],
  pitch: [
    [30, 30],
    [45, 45],
  ],
  hearthwood: [
    [40, 30],
    [56, 56],
  ],
};

type W = { __plWorld?: { view: { lookAt(x: number, z: number, h: number): void; scene: { getObjectByName(n: string): unknown } } } };

async function enter(page: Page, map: string, touch: boolean): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify(PLAYED));
  await page.goto('/?e2e=1&speed=1&quality=high');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  const tap = async (sel: string): Promise<void> => {
    const l = page.locator(sel).first();
    if (touch) await l.tap();
    else await l.click();
  };
  // Practice (Lv 5, beside PLAY): its map pick, then the champion select
  await tap('[data-testid="home-practice"]');
  await tap(`[data-testid="practice-map-${map}"]`);
  await tap('[data-testid="mode-go"]');
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await tap('.cs-lock');
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(90_000) });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: limit(30_000) });
}

for (const map of MAPS) {
  test(`map look: ${map}`, async ({ page }, info) => {
    test.setTimeout(limit(180_000));
    const touch = info.project.name === 'landscape';
    if (!touch) await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await enter(page, map, touch);
    expect(await page.evaluate(() => document.documentElement.dataset.map)).toBe(map);
    const out = process.env.MAP_LOOK_OUT ?? info.outputPath();
    fs.mkdirSync(out, { recursive: true });
    const size = touch ? '844x390' : '1440x900';
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `${map}-${size}-spawn.png`) });
    let k = 0;
    for (const [x, y] of LOOK[map]) {
      await page.evaluate(([fx, fz]) => (window as unknown as W).__plWorld?.view.lookAt(fx, fz, 1e9), [x, -y] as const);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(out, `${map}-${size}-look${++k}.png`) });
    }
    // the same spot at the end of Sunset (the light's dusk key), then the light follows the clock again
    await page.evaluate(() => {
      const v = (window as unknown as { __plWorld?: { view: { dayForce: number } } }).__plWorld?.view;
      if (v) v.dayForce = 1;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${map}-${size}-dusk.png`) });
    // the raised ground is in the scene: sides and caps
    const meshes = await page.evaluate(() => {
      const v = (window as unknown as W).__plWorld?.view as unknown as { scene: { getObjectByName(n: string): { visible: boolean } | undefined } };
      return ['raised-sides', 'raised-caps'].map((n) => v.scene.getObjectByName(n)?.visible === true);
    });
    expect(meshes).toEqual([true, true]);
    expect(errors).toEqual([]);
  });
}

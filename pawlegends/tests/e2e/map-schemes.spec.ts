/**
 * Map colour schemes (render only, render/mapSchemes.ts): each of the five 3v3 maps in Practice (Hearthwood left the menu
 * with 5v5 Classic, MODE-UNLOCKS.md), at 1440 × 900 and 844 × 390. The session picked a scheme from the match seed at welcome (html
 * data-map-scheme, one of the map's); then every scheme of the map in turn (GameView.setScheme, the same uniforms the
 * welcome sets): one shot at the spawn and one over the jungle each, into MAP_SCHEMES_OUT (default: the test's
 * output folder). The frame must change between schemes (the grade reaches the GPU) and no shader may fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { mapSchemes } from '../../src/render/mapSchemes';

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const MAPS = (process.env.MAP_SCHEMES_MAPS ?? 'crossing,ridge,thicket,quarry,pitch').split(',');
/** A jungle point (m, sim x / y) per map. */
const LOOK: Record<string, [number, number]> = { crossing: [27, 39], ridge: [30, 38], thicket: [30, 38], quarry: [36, 44], pitch: [30, 30], hearthwood: [40, 30] };

type V = { setScheme(id: string | null): void; lookAt(x: number, z: number, h: number): void };
type W = { __plWorld?: { view: V } };

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
  test(`map schemes: ${map}`, async ({ page }, info) => {
    test.setTimeout(limit(240_000));
    const touch = info.project.name === 'landscape';
    if (!touch) await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|program|glsl/i.test(m.text())) errors.push(m.text());
    });
    await enter(page, map, touch);
    const all = mapSchemes(map);
    // the welcome picked one of this map's schemes from the seed
    const picked = await page.evaluate(() => document.documentElement.dataset.mapScheme);
    expect(all.map((s) => s.id)).toContain(picked);
    const out = process.env.MAP_SCHEMES_OUT ?? info.outputPath();
    fs.mkdirSync(out, { recursive: true });
    const size = touch ? '844x390' : '1440x900';
    const shots = new Map<string, Buffer>();
    for (const s of all) {
      await page.evaluate((id) => (window as unknown as W).__plWorld?.view.setScheme(id), s.id);
      await page.evaluate(() => (window as unknown as W).__plWorld?.view.lookAt(0, 0, -1));
      await page.waitForTimeout(700);
      const spawn = await page.screenshot({ path: path.join(out, `${map}-${s.season}-${size}-spawn.png`) });
      shots.set(s.id, spawn);
      const [x, y] = LOOK[map];
      await page.evaluate(([fx, fz]) => (window as unknown as W).__plWorld?.view.lookAt(fx, fz, 1e9), [x, -y] as const);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(out, `${map}-${s.season}-${size}-jungle.png`) });
    }
    // every season draws differently from the native
    const native = shots.get(all[0].id)!;
    for (const s of all.slice(1)) expect(shots.get(s.id)!.equals(native), s.id).toBe(false);
    expect(errors).toEqual([]);
  });
}

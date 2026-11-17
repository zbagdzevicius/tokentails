import { expect, test, type Page } from '@playwright/test';
import { homedir } from 'node:os';
import { playFromHome } from './helpers';
import { limit } from '../unit/cpu-budget';

// FLAGS.md in the match: every seat's flag beside its name on the overhead plates (canvas stamps, checked by eye on
// the screenshots) and on the HUD portrait strip (checked here: one flag per seat, on screen, clear of the other
// portraits). Bots keep their robot badge. Desktop 1440x900 and phone 844x390 landscape.

const SHOTS = `${homedir()}/Downloads/paw-legends/flags-inmatch`;
type Box = { x: number; y: number; width: number; height: number };

async function startMatch(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', veteran: true }));
    // the backend's answer, cached (no backend in e2e): this player is in Lithuania
    localStorage.setItem('pl.flag', JSON.stringify({ cc: 'LT', at: Date.now() }));
  });
  await page.goto('/?e2e=1', { timeout: limit(120_000) });
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(120_000) });
  await playFromHome(page, { timeout: limit(120_000) });
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(240_000) });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), undefined, { timeout: limit(120_000) });
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

for (const [w, h, project] of [
  [1440, 900, 'desktop'],
  [844, 390, 'landscape'],
] as const) {
  test(`${w}x${h}: a flag beside every seat in the match (strip and plates)`, async ({ page }, info) => {
    test.skip(info.project.name !== project, `${project} only`);
    test.setTimeout(limit(480_000));
    await startMatch(page, w, h);
    // the plates at the start, while the team still stands together on the fountain
    await page.screenshot({ path: `${SHOTS}/${w}x${h}-start.png` });
    const flags = (await page.evaluate(() => document.documentElement.dataset.matchFlags ?? '')).split(',');
    expect(flags).toContain('LT');
    // the strip: each other seat's portrait carries its own flag
    const strip = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.pl-strip .pp')].map((pp) => {
        const r = pp.getBoundingClientRect();
        const cc = pp.querySelector<HTMLElement>('.pl-cc');
        const c = cc?.getBoundingClientRect();
        const shown = pp.offsetParent !== null && getComputedStyle(pp).display !== 'none';
        return { slot: Number(pp.dataset.slot), ai: pp.dataset.ai === '1', shown, cc: cc?.dataset.cc ?? null, pp: { x: r.x, y: r.y, width: r.width, height: r.height }, flag: c ? { x: c.x, y: c.y, width: c.width, height: c.height } : null };
      }),
    );
    expect(strip.length).toBeGreaterThanOrEqual(2);
    for (const s of strip) {
      expect(s.cc).toBe(flags[s.slot]);
      if (!s.shown || !s.flag) continue;
      // on screen, small, and clear of every other portrait
      expect(s.flag.x).toBeGreaterThanOrEqual(0);
      expect(s.flag.y).toBeGreaterThanOrEqual(0);
      expect(s.flag.x + s.flag.width).toBeLessThanOrEqual(w + 0.5);
      expect(s.flag.y + s.flag.height).toBeLessThanOrEqual(h + 0.5);
      expect(s.flag.height).toBeLessThanOrEqual(18);
      for (const o of strip) if (o.slot !== s.slot && o.shown) expect(overlaps(s.flag, o.pp), `flag ${s.slot} over portrait ${o.slot}`).toBe(false);
    }
    // bots keep their robot badge
    expect(strip.some((s) => s.ai)).toBe(true);
    // a close crop of the strip (allies and enemies), then the screen a few seconds in
    const shown = strip.filter((s) => s.shown).map((s) => s.pp);
    if (shown.length) {
      const x0 = Math.max(0, Math.min(...shown.map((b) => b.x)) - 12);
      const y0 = Math.max(0, Math.min(...shown.map((b) => b.y)) - 12);
      const x1 = Math.min(w, Math.max(...shown.map((b) => b.x + b.width)) + 12);
      const y1 = Math.min(h, Math.max(...shown.map((b) => b.y + b.height)) + 12);
      await page.screenshot({ path: `${SHOTS}/${w}x${h}-strip.png`, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
    }
    await page.waitForTimeout(6_000);
    await page.screenshot({ path: `${SHOTS}/${w}x${h}-match.png` });
  });
}

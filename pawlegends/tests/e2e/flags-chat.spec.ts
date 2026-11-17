import { expect, test, type Page } from '@playwright/test';
import { homedir } from 'node:os';
import { playFromHome } from './helpers';
import { limit } from '../unit/cpu-budget';

// FLAGS.md and MATCH-CHAT.md (round 7): in a bot match every seat shows a flag (the player's own country, a seeded one
// for each bot) on the scoreboard; the chat drawer has Mute all and fits the screen. Desktop 1440x900, phones 1280x590,
// 844x390 and 667x375 landscape.

const SHOTS = `${homedir()}/Downloads/paw-legends/s7/social`;
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

const box = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((s) => {
    const e = document.querySelector<HTMLElement>(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);

for (const [w, h, project] of [
  [1440, 900, 'desktop'],
  [1280, 590, 'landscape'],
  [844, 390, 'landscape'],
  [667, 375, 'landscape'],
] as const) {
  test(`${w}x${h}: flags on every seat, the chat drawer with Mute all fits`, async ({ page }, info) => {
    test.skip(info.project.name !== project, `${project} only`);
    test.setTimeout(limit(480_000));
    await startMatch(page, w, h);
    const flags = (await page.evaluate(() => document.documentElement.dataset.matchFlags ?? '')).split(',');
    expect(flags.length).toBeGreaterThanOrEqual(2);
    // the player's own flag, and every bot seat a real two-letter flag
    expect(flags).toContain('LT');
    for (const f of flags) expect(f).toMatch(/^[A-Z]{2}$/);
    // the scoreboard shows them
    const score = (await box(page, '.pl-score'))!;
    if (project === 'landscape') await page.touchscreen.tap(score.x + score.width / 2, score.y + score.height / 2);
    else await page.keyboard.down('Tab');
    await expect(page.locator('.pl-scoreboard.on')).toBeVisible();
    expect(await page.locator('.pl-scoreboard.on .pl-cc[data-cc]').count()).toBe(flags.length);
    await page.screenshot({ path: `${SHOTS}/${w}x${h}-scoreboard-flags.png` });
    if (project === 'landscape') {
      const card = (await box(page, '.pl-scoreboard .card'))!;
      await page.touchscreen.tap(card.x + card.width / 2, card.y + card.height / 2);
    } else await page.keyboard.up('Tab');
    await expect(page.locator('.pl-scoreboard.on')).toHaveCount(0);
    // the chat drawer: Mute all in the head, everything on screen
    const drawer = page.locator('[data-testid="chat-drawer"]');
    if (project === 'landscape') {
      // a fresh ticker line to tap; retried, since a line can re-render or fade before the tap on a slow machine
      await expect(async () => {
        await page.evaluate(() => (window as unknown as { __plChat: { debugLine(s: number, t: string): void } }).__plChat.debugLine(1, 'nice'));
        await page.locator('[data-testid="chat-ticker"] .cl-row').last().tap({ timeout: limit(5_000) });
        await expect(drawer).toBeVisible({ timeout: limit(3_000) });
      }).toPass({ timeout: limit(120_000) });
    } else await page.keyboard.press('Enter');
    await expect(drawer).toBeVisible();
    const mall = drawer.locator('[data-testid="chat-mute-all"]');
    await expect(mall).toBeVisible();
    const d = (await box(page, '[data-testid="chat-drawer"]'))!;
    expect(d.x).toBeGreaterThanOrEqual(0);
    expect(d.y).toBeGreaterThanOrEqual(0);
    expect(d.x + d.width).toBeLessThanOrEqual(w + 0.5);
    expect(d.y + d.height).toBeLessThanOrEqual(h + 0.5);
    const head = await page.evaluate(() => {
      const e = document.querySelector<HTMLElement>('.pl-chatdrawer .cd-head')!;
      return { sw: e.scrollWidth, cw: e.clientWidth };
    });
    expect(head.sw).toBeLessThanOrEqual(head.cw + 1);
    await page.screenshot({ path: `${SHOTS}/${w}x${h}-chat-drawer.png` });
    if (project === 'landscape') await mall.tap();
    else await mall.click();
    await expect(mall).toHaveAttribute('aria-pressed', 'true');
  });
}

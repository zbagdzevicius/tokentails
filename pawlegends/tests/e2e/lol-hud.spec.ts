import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

// LoL pass, lane B: the hextech HUD. The score plate keeps today's phone footprint (the rail sits under it), the
// ability bar shows keycaps and a decimal under 1 s with one ready flash per cooldown end, the kill feed stays in its
// corner, the Nap channel bar comes and goes with the nap, Tab / a tap opens the scoreboard, and the VICTORY / DEFEAT
// crest is the only centre text. Screenshots: test-results/lol-hud/*.png.

const SHOTS = 'test-results/lol-hud';
type Box = { x: number; y: number; width: number; height: number };
const box = (page: Page, sel: string): Promise<Box | null> =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);

type HudHandle = { kill(a: unknown, b: unknown, good: boolean): void; note(t: string): void; crest(won: boolean): void };
const hud = (page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => ((window as unknown as { __plHud: Record<string, (...x: unknown[]) => void> }).__plHud[f as keyof HudHandle] as (...x: unknown[]) => void)(...(a as unknown[])), [fn, args] as const);

// feel pass B3: the score is one 24 px strip, at most 220 px wide, centred at the top
for (const s of [
  { w: 844, h: 390, maxW: 220, maxH: 24.5 },
  { w: 667, h: 375, maxW: 220, maxH: 24.5 },
] as const) {
  test(`${s.w}x${s.h}: the score plate keeps its footprint, a tap opens the scoreboard, the feed stays in its corner`, async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'touch sizes');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: s.w, height: s.h });
    await startFirstMatch(page, '&speed=3');
    const score = (await box(page, '.pl-score'))!;
    expect(Math.abs(score.x + score.width / 2 - s.w / 2)).toBeLessThanOrEqual(2);
    expect(score.width).toBeLessThanOrEqual(s.maxW);
    expect(score.height).toBeLessThanOrEqual(s.maxH);
    // tap the score: the scoreboard (with the talents column), tap it: closed
    await page.touchscreen.tap(score.x + score.width / 2, score.y + score.height / 2);
    await expect(page.locator('.pl-scoreboard.on .card.lol')).toBeVisible();
    await expect(page.locator('.pl-scoreboard.on th', { hasText: 'Talents' }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-scoreboard.png` });
    const card = (await box(page, '.pl-scoreboard .card'))!;
    await page.touchscreen.tap(card.x + card.width / 2, card.y + card.height / 2);
    await expect(page.locator('.pl-scoreboard.on')).toHaveCount(0);
    // the kill feed: portraits only, two rows, right of x 525 and above y 170 at 667 × 375
    await hud(page, 'kill', { name: 'You', rel: 'self', hero: 'clem' }, { name: 'Sir Brutus', rel: 'enemy', hero: 'brutus' }, true);
    await hud(page, 'kill', { name: 'A tower', rel: 'enemy' }, { name: 'Sage', rel: 'ally', hero: 'sage' }, false);
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.pl-feed-row')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, r: r.right, b: r.bottom, names: [...e.querySelectorAll('b')].some((b) => getComputedStyle(b).display !== 'none') };
      }),
    );
    // feel pass B3: two rows, right of the top-left minimap, in the top band, left of the strip
    expect(rows.length).toBe(2);
    const mm = (await box(page, '.pl-minimap'))!;
    for (const r of rows) {
      expect(r.names, 'no names on touch').toBe(false);
      expect(r.r - r.x).toBeLessThanOrEqual(120);
      expect(r.x).toBeGreaterThanOrEqual(mm.x + mm.width);
      expect(r.b).toBeLessThanOrEqual(70);
      expect(r.r).toBeLessThanOrEqual(score.x);
    }
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-feed.png` });
  });
}

test('desktop: keycaps, a decimal under 1 s and one ready flash, the Nap bar, Tab scoreboard, the crest', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await startFirstMatch(page, '&speed=2');
  // keycaps under Q W E R D B
  const caps = await page.locator('.pl-slot kbd').evaluateAll((els) => els.map((e) => [e.textContent, getComputedStyle(e).display]));
  expect(caps.length).toBe(6);
  for (const [, d] of caps) expect(d).not.toBe('none');
  // Nap a little way out of the fountain: the channel bar comes up, drains, and goes when the nap ends or breaks
  await page.waitForTimeout(4000);
  await page.mouse.click(1100, 400, { button: 'right' });
  await page.waitForTimeout(2500);
  await page.keyboard.press('s');
  await page.keyboard.press('b');
  await expect(page.locator('.lol-nap.on')).toBeVisible({ timeout: 10_000 });
  const fills: number[] = [];
  for (let i = 0; i < 4; i++) {
    fills.push(Number(await page.locator('.lol-nap').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--left'))));
    await page.waitForTimeout(150);
  }
  for (let i = 1; i < fills.length; i++) expect(fills[i]).toBeLessThanOrEqual(fills[i - 1]);
  await expect(page.locator('.lol-nap')).toContainText('Napping');
  await page.screenshot({ path: `${SHOTS}/1440x900-nap.png` });
  await expect(page.locator('.lol-nap.on')).toHaveCount(0, { timeout: 10_000 });
  // Q on cooldown: a decimal under 1 s, then exactly one ready flash for it
  const before = Number((await attr(page, 'cdFlash')) || 0);
  await page.mouse.move(900, 400);
  await page.keyboard.press('q');
  await expect(page.locator('.pl-slot[data-i="0"].cooling')).toBeVisible({ timeout: 5_000 });
  await expect.poll(async () => (await page.locator('.pl-slot[data-i="0"] .num').textContent()) ?? '', { timeout: 20_000, intervals: [30] }).toMatch(/^0\.\d$/);
  await expect.poll(async () => Number((await attr(page, 'cdFlash')) || 0), { timeout: 10_000 }).toBe(before + 1);
  await page.waitForTimeout(600);
  expect(Number((await attr(page, 'cdFlash')) || 0)).toBe(before + 1);
  // Tab holds the scoreboard open
  await page.keyboard.down('Tab');
  await expect(page.locator('.pl-scoreboard.on .card.lol')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/1440x900-scoreboard.png` });
  await page.keyboard.up('Tab');
  await expect(page.locator('.pl-scoreboard.on')).toHaveCount(0);
  // the crest: the only centre-screen words, after the core falls
  await hud(page, 'crest', true);
  await expect(page.locator('.pl-crest')).toHaveText('VICTORY');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/1440x900-crest.png` });
});

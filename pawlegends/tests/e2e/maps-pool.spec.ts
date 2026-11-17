/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §9 G6): Practice picks each 3v3 pool map from Mode Select's map chips and plays
 * it for 60 game seconds, on desktop and at 844 × 390 with touch: the map is bound, the objective chip names it, the
 * hero walks (right-click on desktop, the stick on touch), and nothing throws.
 */
import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { me, simTick, waitGameSeconds } from './helpers';

const PLAYED = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };
const OBJ: Record<string, string> = { ridge: 'mill', thicket: 'shrines', quarry: 'gems', pitch: 'goal' };
const CHIP: Record<string, RegExp> = { ridge: /Fish Mill/, thicket: /Paw Shrine/, quarry: /Gems|Surge/, pitch: /Goals/ };

async function touchDrag(page: Page, x0: number, y0: number, x1: number, y1: number, hold = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8) });
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const map of ['ridge', 'thicket', 'quarry', 'pitch']) {
  test(`Practice on ${map}: picked from the map chips, plays 60 s`, async ({ page }, info) => {
    test.setTimeout(limit(240_000));
    const touch = info.project.name === 'landscape';
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript((v) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
    }, JSON.stringify(PLAYED));
    await page.goto('/?e2e=1&speed=2');
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    const tap = async (sel: string): Promise<void> => {
      const l = page.locator(sel).first();
      if (touch) await l.tap();
      else await l.click();
    };
    await tap('[data-testid="home-play"]');
    await tap('[data-testid="mode-practice"]');
    await tap('[data-testid="mode-next"]');
    await expect(page.locator('[data-testid="practice-maps"] button')).toHaveCount(6);
    await tap(`[data-testid="practice-map-${map}"]`);
    await expect(page.locator(`[data-testid="practice-map-${map}"]`)).toHaveAttribute('aria-checked', 'true');
    await tap('[data-testid="mode-go"]');
    await page.waitForSelector('html[data-screen="pick"] .cs');
    await tap('.cs-lock');
    await page.waitForSelector('html[data-match="live"]', { timeout: limit(90_000) });
    await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: limit(30_000) });
    expect(await page.evaluate(() => document.documentElement.dataset.map)).toBe(map);
    const a = await me(page);
    if (touch) await touchDrag(page, 150, 250, 230, 230, 1500);
    else await page.mouse.click(900, 250, { button: 'right' });
    await expect.poll(async () => Math.abs((await me(page)).x - a.x) + Math.abs((await me(page)).y - a.y), { timeout: limit(15_000) }).toBeGreaterThan(800);
    const from = await simTick(page);
    await waitGameSeconds(page, from, 60);
    expect((await simTick(page)) - from).toBeGreaterThanOrEqual(60 * 30);
    // the objective reaches the client (the snapshot's obj trailer); desktop also shows it on the objective chip
    const kind = await page.evaluate(() => (window as unknown as { __plWorld?: { view: { frame: { latest: { obj?: { kind: string } } } | null } } }).__plWorld?.view.frame?.latest.obj?.kind ?? '');
    expect(kind).toBe(OBJ[map]);
    if (!touch) await expect(page.locator('body')).toContainText(CHIP[map]);
    expect(errors).toEqual([]);
  });
}

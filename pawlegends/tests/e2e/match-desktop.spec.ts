import { expect, test } from '@playwright/test';
import { FOUNTAIN } from '../../src/data/map';
import { attr, me, ops, startFirstMatch } from './helpers';

const fromFountain = (p: { x: number; y: number }) => Math.hypot(p.x - FOUNTAIN.x, p.y - FOUNTAIN.y);

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop controls'));

// POC.md §15 item 18.
test('RMB moves, Q quick-casts, hold shows the indicator, B naps, S stops', async ({ page }) => {
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  const a = await me(page);
  await page.mouse.click(900, 260, { button: 'right' });
  await expect.poll(async () => (await me(page)).x, { timeout: 15000 }).toBeGreaterThan(a.x + 1500);
  expect(await ops(page)).toContain(1);

  await page.mouse.move(800, 300);
  await page.keyboard.down('q');
  await expect.poll(() => attr(page, 'aim')).toBe('1');
  await page.keyboard.up('q');
  await expect.poll(() => attr(page, 'aim')).toBe('');
  expect(await ops(page)).toContain(4);

  await page.keyboard.press('s');
  await page.keyboard.press('b');
  await expect.poll(async () => (await ops(page)).slice(-2)).toEqual([6, 7]);
});

test('B: Nap channels, then the hero is back at the fountain, idle', async ({ page }) => {
  await startFirstMatch(page);
  await page.mouse.click(1000, 300, { button: 'right' });
  await expect.poll(async () => fromFountain(await me(page)), { timeout: 20000 }).toBeGreaterThan(9000);
  await page.keyboard.press('s');
  await page.keyboard.press('b');
  await expect.poll(async () => (await me(page)).state, { timeout: 5000 }).toBe('napping');
  // 4 s channel (POC.md §6.1), then home.
  await expect.poll(async () => fromFountain(await me(page)), { timeout: 15000 }).toBeLessThan(FOUNTAIN.radius);
  await expect.poll(async () => (await me(page)).state, { timeout: 5000 }).toBe('idle');
});

test('A + LMB attack-moves, and the attack lands', async ({ page }) => {
  test.setTimeout(120_000);
  await startFirstMatch(page, '&speed=4');
  // Re-issue each poll: under load the first A + click can land before the match view takes input.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('a');
        await page.mouse.click(900, 300);
        return (await ops(page)).some((o) => o === 2 || o === 3);
      },
      { timeout: 15000, intervals: [500] },
    )
    .toBe(true);
  // Keep attack-moving into the lane: the hero stops for the first enemy it meets and hits it.
  await expect
    .poll(
      async () => {
        const foe = (await attr(page, 'foeMinion')).split(',').map(Number);
        const self = (await attr(page, 'meScreen')).split(',').map(Number);
        const x = foe.length >= 2 ? foe[0] : self.length === 2 ? self[0] + 260 : 760;
        const y = foe.length >= 2 ? foe[1] : self.length === 2 ? self[1] : 360;
        await page.mouse.move(x, y);
        await page.keyboard.press('a');
        await page.mouse.click(x, y);
        return Number(await attr(page, 'hits'));
      },
      { timeout: 90000, intervals: [1000] },
    )
    .toBeGreaterThan(0);
});

test('an out-of-range point cast walks in first (Sage W)', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.evaluate(() => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, matches: 1, hero: 'sage' })));
  await page.reload();
  await page.locator('[data-a="choose"]').click();
  await page.locator('[data-h="sage"]').click();
  await page.locator('[data-a="start"]').click();
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // Past the gate barrier (it drops at 0:10), so nothing but range stands between Sage and the point.
  const start = await me(page);
  // Re-issue the move each poll: the first right-click can land before the match view takes input.
  await expect
    .poll(
      async () => {
        await page.mouse.click(900, 360, { button: 'right' });
        return (await me(page)).x;
      },
      { timeout: 30000, intervals: [1000] },
    )
    .toBeGreaterThan(start.x + 6000);
  await page.keyboard.press('s');
  await page.mouse.move(1180, 360);
  await page.keyboard.down('w');
  await page.keyboard.up('w');
  const castsBefore = Number(await attr(page, 'casts'));
  await expect.poll(() => attr(page, 'walkin')).toBe('1');
  await expect.poll(async () => (await ops(page)).at(-1)).toBe(1);
  // In range: the walk-in clears and the W cast goes out.
  await expect.poll(() => attr(page, 'walkin'), { timeout: 20000 }).toBe('');
  await expect.poll(async () => Number(await attr(page, 'casts')), { timeout: 5000 }).toBeGreaterThan(castsBefore);
  expect((await ops(page)).at(-1)).toBe(4);
});

test('an Easy match finishes and the results screen shows', async ({ page }) => {
  test.setTimeout(90_000);
  await startFirstMatch(page, '&speed=64');
  await page.waitForSelector('html[data-screen="results"]', { timeout: 80_000 });
  await expect(page.locator('.pl-results h1')).toHaveText(/Victory!|Defeat/);
  await page.locator('[data-a="again"]').click();
  await page.waitForSelector('html[data-match="live"]');
});

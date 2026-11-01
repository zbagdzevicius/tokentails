import { expect, test, type Page } from '@playwright/test';
import { FOUNTAIN } from '../../src/data/map';
import { attr, me, ops, startFirstMatch } from './helpers';

const fromFountain = (p: { x: number; y: number }) => Math.hypot(p.x - FOUNTAIN.x, p.y - FOUNTAIN.y);

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop controls'));

/** Settings → "Quick cast" (press casts at once) before the page loads. */
const quickCast = (page: Page) => page.addInitScript(() => localStorage.setItem('pawlegends.castMode', 'quick'));

// POC.md §15 item 18.
test('RMB moves, Q casts on release (holding shows the range), B naps, S stops', async ({ page }) => {
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  const a = await me(page);
  await page.mouse.click(900, 260, { button: 'right' });
  await expect.poll(async () => (await me(page)).x, { timeout: 15000 }).toBeGreaterThan(a.x + 1500);
  expect(await ops(page)).toContain(1);

  // cast on release is the default: holding Q shows the indicator and the attack range ring, the release casts
  await page.mouse.move(800, 300);
  await page.keyboard.down('q');
  await expect.poll(() => attr(page, 'aim')).toBe('1');
  await expect.poll(() => attr(page, 'atkRing')).not.toBe('');
  expect(await ops(page)).not.toContain(4);
  await page.keyboard.up('q');
  await expect.poll(() => ops(page)).toContain(4);
  await expect.poll(() => attr(page, 'aim')).toBe('');
  await expect.poll(() => attr(page, 'atkRing')).toBe('');

  await page.keyboard.press('s');
  await page.keyboard.press('b');
  await expect.poll(async () => (await ops(page)).slice(-2)).toEqual([6, 7]);
});

test('Quick cast (Settings): the key press alone casts, with no hold', async ({ page }) => {
  await quickCast(page);
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  await page.mouse.move(800, 300);
  await page.keyboard.down('q');
  await expect.poll(() => ops(page)).toContain(4);
  await page.keyboard.up('q');
  await expect.poll(() => attr(page, 'aim')).toBe('');
});

test('A armed shows the basic attack range ring (range + body, from hero data); Esc disarms it', async ({ page }) => {
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  await page.mouse.move(800, 300);
  await expect
    .poll(
      async () => {
        await page.keyboard.press('a');
        return attr(page, 'atkRing');
      },
      { timeout: 10000, intervals: [300] },
    )
    .toMatch(/^[1-9]\d*\.\d\d$/);
  await page.keyboard.press('Escape');
  await expect.poll(() => attr(page, 'atkRing')).toBe('');
});

test('trackpad mode: left-click moves', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pawlegends.trackpad', 'on'));
  await startFirstMatch(page);
  const a = await me(page);
  // Re-issue each poll: the first click can land before the match view takes input.
  await expect
    .poll(
      async () => {
        await page.mouse.click(900, 260);
        return (await me(page)).x;
      },
      { timeout: 15000, intervals: [500] },
    )
    .toBeGreaterThan(a.x + 1500);
  expect(await ops(page)).toContain(1);
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

test('an out-of-range point cast walks in first (Sage W, cast on release; quick cast clamps to the range)', async ({ page }) => {
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

// Brawl readability: the game's own cursor on the canvas (input/cursor.ts), with A armed showing the crosshair.
test('the canvas wears the game cursor; A arms the attack-move crosshair, Esc drops it', async ({ page }) => {
  await startFirstMatch(page);
  const canvas = page.locator('#game-canvas');
  await page.mouse.move(700, 300);
  await expect.poll(() => canvas.getAttribute('data-cursor')).toMatch(/^(normal|enemy|ally)$/);
  expect(await canvas.evaluate((c) => (c as HTMLElement).style.cursor)).toContain('data:image/svg+xml');
  await page.keyboard.press('a');
  await expect.poll(() => canvas.getAttribute('data-cursor')).toBe('attackMove');
  await page.keyboard.press('Escape');
  await expect.poll(() => canvas.getAttribute('data-cursor')).not.toBe('attackMove');
});

// Desktop skill tooltips: hovering a slot shows its card (name, key, numbers) and previews its range; never a cast.
test('hovering a slot shows its card and range, the portrait shows the basic attack; leaving clears both', async ({ page }) => {
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  const tip = page.locator('.pl-slot-tip.on');
  const opsBefore = (await ops(page)).length;
  const q = page.locator('.pl-slot[data-i="0"]');
  const name = ((await q.getAttribute('aria-label')) ?? '').split(':')[0];
  expect(name.length).toBeGreaterThan(1);
  await q.hover();
  await expect(tip).toBeVisible();
  await expect(tip.locator('.nm')).toHaveText(name);
  await expect(tip.locator('kbd')).toHaveText('Q');
  await expect(tip).toContainText('Cooldown');
  await expect(tip).toContainText('Rank 1 of 4');
  await expect.poll(() => attr(page, 'slotTip')).toBe('0');
  await expect.poll(() => attr(page, 'aim')).toBe('1');
  // the ultimate is locked at level 1 and says when it unlocks
  await page.locator('.pl-slot[data-i="3"]').hover();
  await expect(tip).toContainText('Unlocks at level 4');
  // inside the viewport and clear of the minimap, at 1280x720 and 1920x1080
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    for (const i of [0, 3, 4, 5]) {
      await page.mouse.move(10, 10);
      await expect(tip).toHaveCount(0);
      await page.locator(`.pl-slot[data-i="${i}"]`).hover();
      await expect(tip).toBeVisible();
      const b = (await tip.boundingBox())!;
      const map = (await page.locator('.pl-minimap').boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(size.width);
      expect(b.y + b.height).toBeLessThanOrEqual(size.height);
      const overlap = b.x < map.x + map.width && b.x + b.width > map.x && b.y < map.y + map.height && b.y + b.height > map.y;
      expect(overlap, `slot ${i} at ${size.width}`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  // the portrait: the passive and the basic attack, with the attack range ring
  await page.locator('.pl-portrait').hover();
  await expect(tip).toContainText('Attack speed');
  await expect.poll(() => attr(page, 'atkRing')).not.toBe('');
  await page.mouse.move(640, 300);
  await expect(tip).toHaveCount(0);
  await expect.poll(() => attr(page, 'slotTip')).toBe('');
  await expect.poll(() => attr(page, 'aim')).toBe('');
  await expect.poll(() => attr(page, 'atkRing')).toBe('');
  // hovering never cast anything
  expect((await ops(page)).slice(opsBefore)).not.toContain(4);
  // the pause menu hides the card
  await page.locator('.pl-slot[data-i="1"]').hover();
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-menu')).toBeVisible();
  await expect(tip).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { startFirstMatch } from './helpers';

/**
 * UX pass 2, the left-handed mirror (Settings): the button arc sits bottom-left, so the camera's lane lead flips with
 * it (render/gameView.ts lead()) and the hero walks right of centre. Before, the hero stood under R or E in nearly
 * every sample while walking east at 844x390 and 667x375. A held stick east for ~9 s, the hero's feet point and its
 * plate (html[data-me-screen]) never under a button.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

for (const size of [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
]) {
  test(`${size.w}x${size.h} left-handed: walking east, the hero is never under a button`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: size.w, height: size.h });
    await page.addInitScript(() => localStorage.setItem('pawlegends.leftHanded', '1'));
    await startFirstMatch(page, '', 'cat');
    await expect(page.locator('.pl-touch.lefty')).toHaveCount(1);
    // the stick takes the right half in the mirror
    const sx = size.w * 0.72;
    const sy = size.h * 0.6;
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', sx, sy);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', sx + i * 10, sy - i * 2);
      await page.waitForTimeout(30);
    }
    const under: string[] = [];
    for (let k = 0; k < 10; k++) {
      await touch('touchMove', sx + 60 + (k % 2), sy - 12);
      await page.waitForTimeout(900);
      const hit = await page.evaluate(() => {
        const [x, y] = (document.documentElement.dataset.meScreen ?? '').split(',').map(Number);
        if (!Number.isFinite(x)) return '';
        // the hero's body ~ 25 px either side of its feet point, the plate ~ 70 px above
        return [...document.querySelectorAll('.pl-tbtn')]
          .filter((b) => {
            const q = b.getBoundingClientRect();
            return q.width > 0 && x + 25 > q.left && x - 25 < q.right && y + 10 > q.top && y - 70 < q.bottom;
          })
          .map((b) => `${(b as HTMLElement).dataset.b}@${Math.round(x)},${Math.round(y)}`)
          .join(',');
      });
      if (hit) under.push(hit);
    }
    await touch('touchEnd', 0, 0);
    await page.screenshot({ path: `test-results/lefty-view-${size.w}x${size.h}.png` });
    expect(under, under.join(' | ')).toEqual([]);
  });
}

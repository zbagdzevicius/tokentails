import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The boot loading screen (src/boot/comicBoot.js, index.html #boot): nine comic panels of our champions, the logo in
// the middle, progress at the bottom. The game's JS is held back, so the loader stays up to be looked at; the panel
// pictures (pawlegends.app/pawlegends-art/loading) are served from the repo, or blocked for the CSS-only version.

const ART = join(import.meta.dirname, '..', '..', '..', 'pawlegends-web', 'public', 'pawlegends-art', 'loading');
const SHOTS = process.env.BOOT_COMIC_SHOTS ?? join(import.meta.dirname, '..', '..', 'test-results', 'boot-comic');
const SIZES = [
  { name: 'phone-844x390', width: 844, height: 390 },
  { name: 'phone-667x375', width: 667, height: 375 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'ultrawide-2560x1080', width: 2560, height: 1080 },
  { name: 'portrait-390x844', width: 390, height: 844 },
];

async function holdGame(page: Page, art: 'serve' | 'block'): Promise<void> {
  // the game's module chunks never arrive: #boot stays on screen
  await page.route(/\/build\/.*\.js(\?.*)?$/, (route) => route.abort());
  await page.route('https://pawlegends.app/pawlegends-art/loading/**', (route) => {
    if (art === 'block') return route.abort();
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({ path: join(ART, name), contentType: 'image/webp' });
  });
}

test.describe('boot comic loading screen', () => {
  test.beforeEach(({ browserName }, info) => test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'one run is enough'));
  mkdirSync(SHOTS, { recursive: true });

  for (const size of SIZES) {
    test(`panels, logo and progress at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const asked: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/pawlegends-art/loading/')) asked.push(r.url());
      });
      await holdGame(page, 'serve');
      await page.goto('/');
      const panels = page.locator('#boot .cm > b');
      await expect(panels).toHaveCount(9);
      await expect(page.locator('#boot .cm > b.in')).toHaveCount(9);
      expect(await page.locator('#boot .cm > b.cat').count()).toBeGreaterThanOrEqual(4);
      expect(await page.locator('#boot .cm > b.dog').count()).toBeGreaterThanOrEqual(4);
      expect(new Set(asked).size).toBe(9);
      for (const u of asked) expect(u).toMatch(/\/pawlegends-art\/loading\/[a-z]+-(640|1280)\.webp\?r=\d+$/);
      // the logo and the bar sit inside the screen; the bar under the logo
      const logo = await page.locator('#boot .cm-logo').boundingBox();
      const bar = await page.locator('#boot .cm-bar').boundingBox();
      expect(logo && bar).toBeTruthy();
      if (logo && bar) {
        expect(logo.x).toBeGreaterThanOrEqual(0);
        expect(logo.x + logo.width).toBeLessThanOrEqual(size.width);
        expect(logo.y).toBeGreaterThanOrEqual(0);
        expect(bar.y + bar.height).toBeLessThanOrEqual(size.height);
        expect(bar.y).toBeGreaterThan(logo.y + logo.height * 0.8);
      }
      await expect(page.locator('#boot .cm-pct')).toHaveText(/^\d{1,3}%$/);
      // let the pictures fade in and the bar move
      await page.waitForTimeout(2000);
      expect(Number((await page.locator('#boot .cm-pct').textContent())?.replace('%', ''))).toBeGreaterThan(10);
      await page.screenshot({ path: join(SHOTS, `${size.name}.png`) });
    });
  }

  test('offline (pictures blocked): the brand-coloured CSS panels alone', async ({ page }) => {
    for (const size of [SIZES[0], SIZES[2], SIZES[4]]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await holdGame(page, 'block');
      await page.goto('/');
      await expect(page.locator('#boot .cm > b')).toHaveCount(9);
      await page.waitForTimeout(600);
      await expect(page.locator('#boot .cm > b.in')).toHaveCount(0);
      // every panel box is painted (its fallback colours), none is the bare page background
      const painted = await page.locator('#boot .cm s').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage.includes('radial-gradient')));
      expect(painted).toEqual(Array(9).fill(true));
      await expect(page.locator('#boot .cm-logo')).toBeVisible();
      await page.screenshot({ path: join(SHOTS, `offline-${size.name}.png`) });
    }
  });

  test('reduced motion: no ken-burns, no logo bounce', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await holdGame(page, 'serve');
    await page.goto('/');
    await expect(page.locator('#boot .cm > b.in')).toHaveCount(9);
    const names = await page.locator('#boot .cm img, #boot .cm-logo').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names.every((n) => n === 'none')).toBe(true);
  });
});

import { expect, test, type Page } from '@playwright/test';

async function trackId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const fm = (window as unknown as { __fm?: { shell: { setup: { track: { id: string; name: string } } | null } } }).__fm;
    return fm?.shell.setup?.track.id ?? null;
  });
}

/** Drag a closed ellipse across the editor canvas. */
async function doodle(page: Page): Promise<void> {
  const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width * 0.34;
  const ry = box.height * 0.3;
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2 * 0.97;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * (1 + 0.15 * Math.sin(3 * a)));
  }
  await page.mouse.up();
}

test('Track Doodle: draw a loop, it validates, race it, share link and remix', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?make&seed=4');
  await expect(page.locator('.fm-ed')).toBeVisible();
  await expect(page.locator('.fm-ed-status')).toContainText('doodle');
  await doodle(page);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 10_000 });
  await page.screenshot({ path: 'e2e/screens/editor-doodle.png' });

  // stickers: drag a boost pad from the tray onto the road (the start line is on the road)
  await page.locator('.fm-ed-tab[data-tab="style"]').click();
  await page.locator('.fm-ed-field input').first().fill('Zoomies Loop');
  await page.locator('.fm-ed-field input').first().press('Enter');
  await expect(page.locator('.fm-ed-title')).toHaveText('Zoomies Loop');

  await page.locator('.fm-ed-actions .primary').click();
  await expect(page.locator('.fm-ed')).toHaveCount(0);
  // the banner shows on the grid (until shortly after GO)
  await expect(page.locator('.fm-ugc-banner.on')).toContainText('Zoomies Loop');
  await page.screenshot({ path: 'e2e/screens/ugc-race.png' });
  await expect.poll(() => trackId(page)).toMatch(/^u-/);
  expect(page.url()).toMatch(/\?t=[A-Za-z0-9_-]{40,}/);

  // the link alone (a fresh page) opens the same track
  const url = page.url();
  const id = await trackId(page);
  await page.goto('about:blank');
  await page.goto(url);
  await expect.poll(() => trackId(page), { timeout: 20_000 }).toBe(id);

  // saved on the device, listed in the Tracks sheet (paused)
  await page.locator('.fm-menu-btn').click();
  await expect(page.locator('[data-screen="pause"] [data-act="ugc-tracks"]')).toBeVisible();
  await page.locator('[data-screen="pause"] [data-act="ugc-tracks"]').click();
  await expect(page.locator('.fm-ugc-list')).toContainText('Zoomies Loop');
  await page.locator('[data-a="remix"]').click();
  await expect(page.locator('.fm-ed')).toBeVisible();
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable');
  expect(errors).toEqual([]);
});

test('a broken track link says so and races Kitchen', async ({ page }) => {
  await page.goto('/?t=AAAAbrokenAAAA&seed=2');
  await expect(page.locator('.fm-ugc-sheet.on')).toContainText('This track link is broken');
  await expect.poll(() => trackId(page)).toBe('kitchen');
  await page.getByRole('button', { name: 'Race Kitchen' }).click();
  await expect(page.locator('.fm-ugc-sheet.on')).toHaveCount(0);
});

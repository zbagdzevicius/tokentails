import { expect, test } from '@playwright/test';
import { forfeitMatch, press } from './moments-helpers';

// MATCH-MOMENTS.md §3: the results' Share card opens the 1200x630 Legend Moment card in a sheet that fits the screen,
// with Save image, Copy link and Share; Esc closes it. The card never shows a price or the store.

test('share card: opens from the results at 1200x630, fits the screen, links and closes', async ({ page, context }, info) => {
  test.setTimeout(300_000);
  const touch = info.project.name === 'landscape';
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
  await forfeitMatch(page, touch);
  // the strip's button is on screen beside Run it back (the column's is further down on phones)
  await press(page, touch, '[data-testid="results-card-strip"]');
  const sheet = page.locator('.mm-share');
  await expect(sheet).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.shareCard)).toBe('open');
  const canvas = page.locator('[data-testid="share-card-canvas"]');
  expect(await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1200, 630]);
  // drawn: not a blank canvas (the left edge is the rose cat side)
  const px = await canvas.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(4, 300, 1, 1).data));
  expect(px[0]).toBeGreaterThan(150);
  // the champion picture arrives (same-origin splash)
  await expect(canvas).toHaveAttribute('data-art', '1', { timeout: 15_000 });
  // the sheet and its buttons fit the viewport
  const vp = page.viewportSize()!;
  for (const sel of ['[data-testid="share-card-save"]', '[data-testid="share-card-link"]', '[data-testid="share-card-share"]', '.mm-share-pic']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.y + b.height, sel).toBeLessThanOrEqual(vp.height);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(vp.width);
  }
  await expect(sheet).not.toContainText(/\$|€|price|store|buy/i);
  await press(page, touch, '[data-testid="share-card-link"]');
  await expect(page.locator('.mm-share-note')).toHaveText('Link copied.');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // the column's button opens it again
  await page.locator('[data-testid="results-card"]').scrollIntoViewIfNeeded();
  await press(page, touch, '[data-testid="results-card"]');
  await expect(sheet).toBeVisible();
  await press(page, touch, '.mm-share [data-s="close"]');
  await expect(sheet).toHaveCount(0);
});

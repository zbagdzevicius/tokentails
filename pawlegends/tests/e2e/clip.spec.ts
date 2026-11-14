import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { forfeitMatch, press } from './moments-helpers';

// SHARE-PUSH.md §1: the replay bar's Clip records a short video at the chosen framing and opens the clip sheet; the
// Legend Moment card's Video clip finds the moment and records it on its own. Screenshots to
// ~/Downloads/paw-legends/gaps3/share-push/ with CLIP_SHOTS=1.

const SHOTS = process.env.CLIP_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'gaps3', 'share-push') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const videoSize = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="clip-video"]').evaluate(async (v: HTMLVideoElement) => {
    const b = await (await fetch(v.src)).blob();
    return { size: b.size, type: b.type };
  });

test('clip: the Legend Moment card records a vertical clip; Record again records a 10 s wide one', async ({ page }, info) => {
  test.setTimeout(480_000);
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await forfeitMatch(page, touch);

  // the Legend Moment card offers the clip
  await press(page, touch, '[data-testid="results-card-strip"]');
  await expect(page.locator('[data-testid="share-card-clip-vertical"]')).toBeVisible({ timeout: 20_000 });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `card-${info.project.name}.png`) });
  await press(page, touch, '[data-testid="share-card-clip-vertical"]');
  await expect(page.locator('.mm-share')).toHaveCount(0);
  await page.waitForFunction(() => document.documentElement.dataset.clip === 'recording', null, { timeout: 180_000 });
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `recording-${info.project.name}.png`) });
  const sheet = page.locator('[data-testid="clip-sheet"]');
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.clip)).toBe('done');
  await expect(sheet.locator('.mm-clip-card')).toHaveAttribute('data-framing', 'vertical');
  await expect(sheet).toContainText('Vertical 9:16');
  const v1 = await videoSize(page);
  if (SHOTS) {
    const bytes = await page.locator('[data-testid="clip-video"]').evaluate(async (v: HTMLVideoElement) => Array.from(new Uint8Array(await (await fetch(v.src)).arrayBuffer())));
    writeFileSync(join(SHOTS, `clip-vertical-${info.project.name}.${v1.type.includes('mp4') ? 'mp4' : 'webm'}`), Buffer.from(bytes));
  }
  expect(v1.size).toBeGreaterThan(10_000);
  expect(v1.type).toMatch(/^video\/(mp4|webm)/);
  // the sheet and its buttons fit the screen
  const vp = page.viewportSize()!;
  for (const sel of ['[data-testid="clip-share"]', '[data-testid="clip-save"]']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.y + b.height, sel).toBeLessThanOrEqual(vp.height);
  }
  await expect(sheet).not.toContainText(/\$|€|price|store|buy/i);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `sheet-${info.project.name}.png`) });
  // Save video downloads the file
  const dl = page.waitForEvent('download');
  await press(page, touch, '[data-testid="clip-save"]');
  expect((await dl).suggestedFilename()).toMatch(/^paw-legends-clip-\d{8}\.(mp4|webm)$/);

  // Record again (the Legend Moment ran to the end of this forfeited match): the panel over the Replay over card;
  // Record rewinds to the last 10 s and records a wide clip
  await press(page, touch, '[data-testid="clip-again"]');
  await expect(sheet).toHaveCount(0);
  const panel = page.locator('[data-testid="clip-panel"]');
  await expect(panel).toBeVisible();
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `panel-${info.project.name}.png`) });
  await press(page, touch, '[data-testid="clip-wide"]');
  await press(page, touch, '.mm-clippanel [data-len="10"]');
  await press(page, touch, '[data-testid="clip-record"]');
  await expect(panel).toBeHidden();
  await page.waitForFunction(() => document.documentElement.dataset.clip === 'recording', null, { timeout: 60_000 });
  // the speeds are locked while it records
  await expect(page.locator('.mm-bar [data-speed="4"]')).toBeDisabled();
  await expect(sheet).toBeVisible({ timeout: 40_000 });
  await expect(sheet.locator('.mm-clip-card')).toHaveAttribute('data-framing', 'wide');
  // 10 s, or less when a slow test machine reaches the replay's end first
  await expect(sheet).toContainText(/\b([4-9]|1[01]) s · Wide 16:9/);
  expect((await videoSize(page)).size).toBeGreaterThan(10_000);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // the wide clip ran to the end of the replay: Back on the Replay over card
  await press(page, touch, '.mm-end [data-r="exit"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.clip ?? '')).toBe('');
  expect(errors).toEqual([]);
});

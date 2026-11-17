import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { attr } from './helpers';
import { forfeitMatch, press } from './moments-helpers';
import { limit } from '../unit/cpu-budget';

// HIGHLIGHTS.md §8 items 10-15: a short solo match → the results' highlights strip (skeletons, then cards); a card
// opens the viewer on its highlight with the director camera and ends on the highlight's card; Clip it records that
// highlight; the chip row opens without growing the bar; N jumps; the Montage records 3-5 highlights in one video; a
// device without a recorder gets no Clip or Montage. Screenshots to ~/Downloads/paw-legends/modes-highlights/highlights/
// with HL_SHOTS=1. Desktop 1440x900 and phone landscape 844x390.

const SHOTS = process.env.HL_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'modes-highlights', 'highlights') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only');
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
});

const shot = async (page: Page, name: string, project: string): Promise<void> => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}-${project}.png`) });
};

const videoOf = (page: Page) =>
  page.locator('[data-testid="clip-video"]').evaluate(async (v: HTMLVideoElement) => {
    const b = await (await fetch(v.src)).blob();
    // the duration of a MediaRecorder WebM is only known after a seek to the end
    const dur = await new Promise<number>((res) => {
      const el = document.createElement('video');
      el.muted = true;
      el.preload = 'metadata';
      el.src = v.src;
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration)) return res(el.duration);
        el.currentTime = 1e6;
        el.ontimeupdate = () => {
          el.ontimeupdate = null;
          res(el.duration);
        };
      };
      el.onerror = () => res(-1);
      setTimeout(() => res(-2), 8000);
    });
    return { size: b.size, type: b.type, dur };
  });

/** The results strip: skeletons first, then the cards (or the fallback). */
async function stripReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="hl-strip"]')).toBeVisible({ timeout: limit(20_000) });
  await page.waitForFunction(() => document.documentElement.dataset.hl === 'ready' || (document.documentElement.dataset.hl ?? '').startsWith('fallback'), null, { timeout: limit(60_000) });
  expect(await attr(page, 'hl')).toBe('ready');
  expect(Number(await attr(page, 'hlCount'))).toBeGreaterThanOrEqual(1);
}

test('highlights: results strip, a card opens its highlight with the director, Clip it records it, the chip row and N', async ({ page }, info) => {
  test.setTimeout(limit(600_000));
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (touch) {
    // §8 item 14: a browser that cannot record: the cards still open the viewer, no Clip and no Montage
    await page.addInitScript(() => {
      delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    });
  }
  // the skeleton cards show while the Worker scans
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('.pl-hl-sk')) (window as unknown as { __sk?: boolean }).__sk = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await forfeitMatch(page, touch);
  await stripReady(page);
  expect(await page.evaluate(() => (window as unknown as { __sk?: boolean }).__sk === true)).toBe(true);
  const cards = page.locator('[data-testid="hl-card"]');
  expect(await cards.count()).toBeGreaterThanOrEqual(1);
  expect(await cards.count()).toBeLessThanOrEqual(4);
  // titles fit, bots are named honestly, nothing implies a human opponent
  const text = (await page.locator('[data-testid="hl-strip"]').innerText()).toLowerCase();
  expect(text).not.toContain('player');
  expect(text).not.toMatch(/\$|€|price|buy/);
  if (touch) {
    await expect(page.locator('[data-testid="hl-clip"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="hl-montage"]')).toHaveCount(0);
  } else await expect(page.locator('[data-testid="hl-clip"]').first()).toBeVisible();
  // the strip fits the screen width (one scrolling row, no page growth sideways)
  const vp = page.viewportSize()!;
  const strip = (await page.locator('[data-testid="hl-strip"]').boundingBox())!;
  expect(strip.x + strip.width).toBeLessThanOrEqual(vp.width + 1);
  await page.locator('[data-testid="hl-strip"]').scrollIntoViewIfNeeded();
  await shot(page, 'results-strip', info.project.name);

  // a card: the viewer opens on that highlight, the director camera on, and it ends on the highlight's card
  const id = await cards.first().getAttribute('data-hl-card');
  await press(page, touch, '[data-testid="hl-card"]');
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: limit(90_000) });
  expect(await attr(page, 'replayCam')).toBe('director');
  expect(await attr(page, 'replayHlAt')).toBe(id);
  const start = Number(id!.split(':')[1]);
  await expect.poll(async () => Number(await attr(page, 'replayTick')), { timeout: limit(10_000) }).toBeGreaterThanOrEqual(start - 30);
  const end = page.locator('[data-testid="replay-hl-end"]');
  await expect(end).toBeVisible({ timeout: limit(60_000) });
  await shot(page, 'highlight-end-card', info.project.name);
  if (touch) await expect(page.locator('[data-testid="replay-hl-clip"]')).toHaveCount(0);
  else {
    // Clip it: that highlight, 6-20 s, in the clip sheet
    await press(page, touch, '[data-testid="replay-hl-clip"]');
    await page.waitForFunction(() => document.documentElement.dataset.clip === 'recording', null, { timeout: limit(60_000) });
    const sheet = page.locator('[data-testid="clip-sheet"]');
    await expect(sheet).toBeVisible({ timeout: limit(60_000) });
    await expect(sheet).toContainText('Your highlight');
    const meta = await sheet.locator('.mm-clip-meta').innerText();
    const secs = Number(/^(\d+) s/.exec(meta)?.[1]);
    expect(secs).toBeGreaterThanOrEqual(5);
    expect(secs).toBeLessThanOrEqual(21);
    const v = await videoOf(page);
    expect(v.size).toBeGreaterThan(10_000);
    expect(v.type).toMatch(/^video\/(mp4|webm)/);
    if (SHOTS) {
      const bytes = await page.locator('[data-testid="clip-video"]').evaluate(async (el: HTMLVideoElement) => Array.from(new Uint8Array(await (await fetch(el.src)).arrayBuffer())));
      writeFileSync(join(SHOTS, `highlight-clip-${info.project.name}.${v.type.includes('mp4') ? 'mp4' : 'webm'}`), Buffer.from(bytes));
    }
    const dl = page.waitForEvent('download');
    await press(page, touch, '[data-testid="clip-save"]');
    expect((await dl).suggestedFilename()).toMatch(/^paw-legends-highlight-\d{8}\.(mp4|webm)$/);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }

  // Watch full match: the director lets go; the chip row opens and closes without changing the bar's height
  if (await end.isVisible()) await press(page, touch, '[data-testid="replay-hl-full"]');
  else await press(page, touch, '[data-testid="replay-play"]');
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing' || document.documentElement.dataset.replay === 'paused', null, { timeout: limit(60_000) });
  const hlBtn = page.locator('[data-testid="replay-highlights"]');
  await expect(hlBtn).toBeEnabled({ timeout: limit(120_000) });
  const before = (await page.locator('.mm-bar').boundingBox())!;
  await press(page, touch, '[data-testid="replay-highlights"]');
  const row = page.locator('[data-testid="replay-hl-row"]');
  await expect(row).toBeVisible();
  const after = (await page.locator('.mm-bar').boundingBox())!;
  expect(after.height).toBe(before.height);
  const rowBox = (await row.boundingBox())!;
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(after.y + 1);
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(vp.width + 1);
  // the seek bar draws the highlight bands
  expect(await page.locator('.mm-band').count()).toBeGreaterThanOrEqual(1);
  await shot(page, 'chip-row', info.project.name);
  // a chip: the director on its highlight
  await press(page, touch, '.mm-chip[data-hl]');
  await page.waitForFunction(() => document.documentElement.dataset.replayCam === 'director', null, { timeout: limit(60_000) });
  // free cam ends the director
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: limit(60_000) });
  await press(page, touch, '[data-testid="replay-cam"]');
  expect(await attr(page, 'replayCam')).toBe('free');
  await press(page, touch, '[data-testid="replay-cam"]');
  if (!touch) {
    // N: the next highlight with the director
    await page.locator('.mm-bar').click({ position: { x: 4, y: 4 } }).catch(() => undefined);
    await page.keyboard.press('n');
    await page.waitForFunction(() => document.documentElement.dataset.replayCam === 'director', null, { timeout: limit(60_000) });
  }
  // close the row again: the bar's height never changed
  if (await row.isVisible()) await press(page, touch, '[data-testid="replay-highlights"]');
  await expect(row).toBeHidden();
  expect((await page.locator('.mm-bar').boundingBox())!.height).toBe(before.height);
  await press(page, touch, '.mm-bar [data-r="exit"]');
  // gaps5 polish 2: back on the results it came from, the strip drawn again from the cached reel (a second card works)
  await page.waitForSelector('html[data-screen="results"]', { timeout: limit(30_000) });
  await stripReady(page);
  await expect(page.locator('[data-testid="hl-card"]').first()).toBeVisible();
  await shot(page, 'back-to-results', info.project.name);
  // the reel is cached on the history row
  const cached = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('tt.pawlegends.history.v1') ?? '[]') as { highlights?: { list: unknown[] } }[];
    return rows[0]?.highlights?.list.length ?? 0;
  });
  expect(cached).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('highlights: the Montage records 3-5 highlights in one 20-30 s video', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the recorder test runs on desktop');
  test.setTimeout(limit(600_000));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await forfeitMatch(page, false);
  await stripReady(page);
  const mont = page.locator('[data-testid="hl-montage"]');
  test.skip((await mont.count()) === 0, 'this match found fewer than 3 highlights (no montage)');
  await press(page, false, '[data-testid="hl-montage"]');
  await page.waitForFunction(() => document.documentElement.dataset.montage === 'recording', null, { timeout: limit(90_000) });
  await shot(page, 'montage-recording', info.project.name);
  // the montage's own seeks (one per segment) never cancel it
  const seen = new Set<string>();
  const sheet = page.locator('[data-testid="clip-sheet"]');
  for (let i = 0; i < 240 && !(await sheet.isVisible()); i++) {
    const at = await attr(page, 'replayHlAt');
    if (at) seen.add(at);
    await page.waitForTimeout(500);
  }
  await expect(sheet).toBeVisible({ timeout: limit(10_000) });
  expect(seen.size).toBeGreaterThanOrEqual(3);
  await expect(sheet).toContainText('Your montage');
  const v = await videoOf(page);
  expect(v.size).toBeGreaterThan(50_000);
  const meta = await sheet.locator('.mm-clip-meta').innerText();
  const secs = Number(/^(\d+) s/.exec(meta)?.[1]);
  // 20-30 s of highlights plus the opening and end cards and the wipes
  expect(secs).toBeGreaterThanOrEqual(20);
  expect(secs).toBeLessThanOrEqual(36);
  if (SHOTS) {
    const bytes = await page.locator('[data-testid="clip-video"]').evaluate(async (el: HTMLVideoElement) => Array.from(new Uint8Array(await (await fetch(el.src)).arrayBuffer())));
    writeFileSync(join(SHOTS, `montage-${info.project.name}.${v.type.includes('mp4') ? 'mp4' : 'webm'}`), Buffer.from(bytes));
    await page.waitForTimeout(600);
    await shot(page, 'montage-sheet', info.project.name);
  }
  const dl = page.waitForEvent('download');
  await press(page, false, '[data-testid="clip-save"]');
  expect((await dl).suggestedFilename()).toMatch(/^paw-legends-montage-\d{8}\.(mp4|webm)$/);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await attr(page, 'montage')).toBe('');
  // gaps5 polish 2: leaving the replay after the Montage goes back to the results, not Home
  await press(page, false, '.mm-bar [data-r="exit"]');
  await page.waitForSelector('html[data-screen="results"]', { timeout: limit(30_000) });
  await stripReady(page);
  expect(errors).toEqual([]);
});

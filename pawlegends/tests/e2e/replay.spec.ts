import { expect, test } from '@playwright/test';
import { attr } from './helpers';
import { forfeitMatch, press } from './moments-helpers';

// MATCH-MOMENTS.md §1, §2, §4: the load-in toast names the lane and role; after a match the results offer Watch
// replay; the viewer re-runs the stored inputs (the scout reaches the saved end hash), plays at 1x/2x/4x, seeks, has a
// free camera and exits to Home; Match history (the Treat Track's profile entry) lists the match with Watch.

test('replay: lane toast at load-in, Watch replay from the results, speeds, seek, free camera, exit; History lists the match', async ({ page }, info) => {
  test.setTimeout(420_000);
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // record the load-in toast's lane line the moment it shows (it lives 1.2 s)
    new MutationObserver(() => {
      const t = document.querySelector<HTMLElement>('.pl-basetoast');
      if (t?.dataset.lane) (window as unknown as { __lane?: string }).__lane = t.dataset.lane;
    }).observe(document, { childList: true, subtree: true });
  });
  await forfeitMatch(page, touch);
  expect(await page.evaluate(() => (window as unknown as { __lane?: string }).__lane)).toBe('Sunny Lane · marksman');

  const watch = page.locator('[data-testid="results-replay"]');
  await expect(watch).toBeVisible();
  await press(page, touch, '[data-testid="results-replay"]');
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: 60_000 });
  expect(await attr(page, 'screen')).toBe('match');
  const bar = page.locator('.mm-bar');
  await expect(bar).toBeVisible();
  // the bar stays on screen and inside the viewport
  const box = (await bar.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  // no input reaches a replay: the touch controls are hidden
  if (touch) await expect(page.locator('.pl-replaying .pl-touch')).toBeHidden();

  // the play head moves; 4x is faster than 1x
  await expect.poll(async () => Number(await attr(page, 'replayTick')), { timeout: 20_000 }).toBeGreaterThan(30);
  await press(page, touch, '.mm-bar [data-speed="4"]');
  expect(await attr(page, 'replaySpeed')).toBe('4');
  // the scout re-ran the whole match and reached the saved end state hash
  await expect.poll(() => attr(page, 'replayOk'), { timeout: 120_000 }).toBe('true');
  await press(page, touch, '.mm-bar [data-speed="1"]');

  // pause holds the play head
  await press(page, touch, '[data-testid="replay-play"]');
  expect(await attr(page, 'replay')).toBe('paused');
  // (a snapshot already in flight from the Worker may still land)
  await page.waitForTimeout(400);
  const held = Number(await attr(page, 'replayTick'));
  await page.waitForTimeout(800);
  expect(Number(await attr(page, 'replayTick'))).toBe(held);
  await press(page, touch, '[data-testid="replay-play"]');

  // seek to the middle: the view is rebuilt there
  const total = Number(await page.locator('[data-testid="replay-seek"]').getAttribute('aria-valuemax'));
  const tr = (await page.locator('[data-testid="replay-seek"]').boundingBox())!;
  if (touch) await page.touchscreen.tap(tr.x + tr.width * 0.5, tr.y + tr.height / 2);
  else await page.mouse.click(tr.x + tr.width * 0.5, tr.y + tr.height / 2);
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: 60_000 });
  const at = Number(await attr(page, 'replayTick'));
  expect(at).toBeGreaterThan(total * 0.4);
  expect(await page.locator('.pl-match').count()).toBe(1);

  // free camera on and off
  await press(page, touch, '[data-testid="replay-cam"]');
  expect(await attr(page, 'replayCam')).toBe('free');
  await expect(page.locator('.mm-drag')).toBeVisible();
  await press(page, touch, '[data-testid="replay-cam"]');
  expect(await attr(page, 'replayCam')).toBe('follow');

  // exit: back to Home, nothing of the viewer left
  await press(page, touch, '.mm-bar [data-r="exit"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: 20_000 });
  await expect(page.locator('.mm-bar, .mm-veil, .pl-match')).toHaveCount(0);
  expect(await attr(page, 'replay')).toBe('');

  // History: the profile entry (Treat Track) → Match history lists the match with Watch
  await press(page, touch, '[data-testid="home-profile"]');
  await press(page, touch, '[data-testid="open-history"]');
  const hist = page.locator('[data-testid="match-history"]');
  await expect(hist).toBeVisible();
  await expect(hist.locator('.mh-row')).toHaveCount(1);
  await expect(hist.locator('.mh-row').first()).toContainText('Sage');
  await expect(hist.locator('.mh-row').first()).toContainText('Defeat');
  await expect(hist.locator('.mh-watch')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(hist).toHaveCount(0);
  expect(errors).toEqual([]);
});

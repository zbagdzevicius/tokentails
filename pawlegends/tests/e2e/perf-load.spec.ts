import { expect, test } from '@playwright/test';

/**
 * POC.md §10 and §15 item 23: cold load to the first controllable frame (the match is live and the hero answers)
 * ≤ 6 s on simulated 4G. CDP throttling: 9 Mbps down, 9 Mbps up, 170 ms RTT (the WebPageTest 4G profile), cache off,
 * from a fresh browser context; the one tap on "Play as Clem" is part of it.
 *
 * It runs on the machine's GPU where there is one (Metal through ANGLE on macOS): the other specs use SwiftShader, a
 * CPU rasteriser that spends ~4 s compiling the match's shaders, which no player's device does. Elsewhere (a Linux
 * CI box without a GPU) it falls back to the project's SwiftShader flags. Chromium only (CDP).
 */
if (process.platform === 'darwin') test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } });

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'Chromium desktop only (CDP)'));

test('cold load to the first controllable frame ≤ 6 s on simulated 4G', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const bps = (9 * 1000 * 1000) / 8;
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 170,
    downloadThroughput: bps,
    uploadThroughput: bps,
  });
  const t0 = Date.now();
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-btn.big');
  const shown = Date.now() - t0;
  // A player taps as soon as the button is there (no wait for its entrance animation to settle).
  await page.locator('.pl-btn.big').first().dispatchEvent('click');
  const title = Date.now() - t0;
  await page.waitForFunction(() => document.documentElement.dataset.match === 'live' && !!document.documentElement.dataset.me);
  const ms = Date.now() - t0;
  const bytes = await page.evaluate(() =>
    performance.getEntriesByType('resource').reduce((s, e) => s + ((e as PerformanceResourceTiming).transferSize || 0), 0),
  );
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c?.getExtension('WEBGL_debug_renderer_info');
    return d && c ? String(c.getParameter(d.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log(
    `perf cold load (4G, ${gl}): title shown at ${shown} ms, tapped at ${title} ms, first controllable frame at ${ms} ms, ${(bytes / 1024).toFixed(0)} KB transferred`,
  );
  expect(ms).toBeLessThanOrEqual(6000);
});

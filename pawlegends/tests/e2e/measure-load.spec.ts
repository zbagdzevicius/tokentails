import { expect, test } from '@playwright/test';
import { appendFileSync } from 'node:fs';

/**
 * Time to first match from a cold load (docs/plans/moba/BENCHMARKS.md; PARITY §7 "link tap to in-match ≤ 20 s").
 * Runs only with PAWLEGENDS_MEASURE=1 (tools/measure.mjs --browser sets it): fresh context, cache off, then the one tap
 * on the big Play button, until the match is live and the own hero answers (the same end point as perf-load.spec.ts).
 *
 * Network: `none` (the machine's own link to the local preview server) and `4g` (9 Mbps, 170 ms RTT, the WebPageTest
 * 4G profile). The `landscape` project (844×390 touch) also slows the CPU 4× (a mid-range phone). Each row is appended
 * as one JSON line to PAWLEGENDS_MEASURE_LOAD_OUT.
 */
if (process.platform === 'darwin') test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } });

const RUNS = Number(process.env.PAWLEGENDS_MEASURE_RUNS ?? 3);

test.beforeEach(({}, info) => {
  test.skip(process.env.PAWLEGENDS_MEASURE !== '1', 'measurement run only (tools/measure.mjs --browser)');
  test.skip(info.project.name === 'webkit', 'Chromium only (CDP)');
});

for (const net of ['none', '4g'] as const) {
  test(`cold load to first match (${net})`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const phone = info.project.name === 'landscape';
    for (let run = 0; run < RUNS; run++) {
      const ctx = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (net === '4g') {
        const bps = (9 * 1000 * 1000) / 8;
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: bps, uploadThroughput: bps });
      }
      if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      await page.goto('/?e2e=1');
      await page.waitForSelector('html[data-screen="title"] .pl-btn.big');
      const titleMs = Date.now() - t0;
      await page.locator('.pl-btn.big').first().dispatchEvent('click');
      await page.waitForFunction(() => document.documentElement.dataset.match === 'live' && !!document.documentElement.dataset.me, undefined, { timeout: 120_000 });
      const matchMs = Date.now() - t0;
      const bytes = await page.evaluate(() =>
        performance.getEntriesByType('resource').reduce((s, e) => s + ((e as PerformanceResourceTiming).transferSize || 0), 0),
      );
      const row = { project: info.project.name, net, cpu: phone ? 4 : 1, run, titleMs, matchMs, kb: Math.round(bytes / 1024) };
      console.log(`measure load ${JSON.stringify(row)}`);
      if (process.env.PAWLEGENDS_MEASURE_LOAD_OUT) appendFileSync(process.env.PAWLEGENDS_MEASURE_LOAD_OUT, `${JSON.stringify(row)}\n`);
      expect(matchMs).toBeGreaterThan(0);
      await ctx.close();
    }
  });
}

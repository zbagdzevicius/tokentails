/**
 * DEV: screenshots and update timings of the tower lab (tower-lab.html, V21-FUN §4 damage states), one per band.
 * Needs `npm run dev` (or any Vite server). Usage: node tools/tower-lab-shots.mjs <base url> <out dir> [side=cat|dog]
 * Env: TIER (med), W / H (px), GPU=1 (the machine's GPU, headed) else SwiftShader, THROTTLE=4 (CDP CPU slowdown, a
 * rough phone JS profile). Writes <band>-<side>.png and prints
 * JSON timings (the per-frame GameView.update in ms with the band's tower in view, and the live particle count).
 * Playwright's own launch uses a throwaway profile that `browser.close()` removes; it closes in `finally` and on a signal.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base, outDir, side = 'cat'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(process.env.GPU === '1' ? { headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const stop = () => void browser.close().finally(() => process.exit(130));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const w = Number(process.env.W ?? 640);
  const h = Number(process.env.H ?? 400);
  const tier = process.env.TIER ?? 'med';
  const page = await browser.newPage({ viewport: { width: w + 20, height: h + 120 } });
  if (process.env.THROTTLE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const rows = [];
  for (const band of ['0', '1', '2', '3', '4', '5', 'all']) {
    await page.goto(`${base}/tower-lab.html?band=${band}&side=${side}&tier=${tier}&w=${w}&h=${h}&capture=1`);
    await page.waitForFunction(() => window.__towerlab, null, { timeout: 60000 });
    await page.evaluate(() => window.__towerlab.ready);
    // warm-up (programs link, the fire fills its column), then a timed second
    await page.evaluate(() => window.__towerlab.advance(2.5));
    await page.evaluate(() => window.__towerlab.resetStats());
    await page.evaluate(() => window.__towerlab.advance(1));
    const bb = await page.locator('#app').boundingBox();
    await page.screenshot({ path: `${outDir}/${band}-${side}.png`, clip: bb, timeout: 60000 });
    const s = await page.evaluate(() => window.__towerlab.stats());
    rows.push({ band, avgMs: +s.avgMs.toFixed(2), maxMs: +s.maxMs.toFixed(1), particles: s.particles, stages: s.stages.join(','), fire: s.fire, tier: `${s.tier}/${s.vfxTier}` });
  }
  console.log(JSON.stringify({ rows, errors: errors.slice(0, 10) }, null, 1));
} finally {
  await browser.close();
}

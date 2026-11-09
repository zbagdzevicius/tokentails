/**
 * DEV: screenshots and perf numbers of the skill preview player (src/ui/preview/skillPreview.ts) through the lab page.
 * Needs `npm run dev` (or any Vite server); usage: node tools/skill-preview-shots.mjs <base url> <out dir> hero:slot[@ms] ...
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base, outDir, ...items] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
// GPU=1: the machine's GPU (Metal ANGLE, headed) for real frame costs; else SwiftShader (CI)
const browser = await chromium.launch(process.env.GPU === '1' ? { headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const w = process.env.W ?? 480;
const h = process.env.H ?? 300;
const tier = process.env.TIER ?? 'med';
const [h0, s0] = items[0].split('@')[0].split(':');
await page.goto(`${base}/skill-preview.html?hero=${h0}&slot=${s0}&tier=${tier}&w=${w}&h=${h}&capture=1`);
await page.waitForFunction(() => window.__preview, null, { timeout: 60000 });
await page.evaluate(() => window.__preview.ready);
const rows = [];
for (const it of items) {
  const [hs, ms] = it.split('@');
  const [hero, slot] = hs.split(':');
  const t0 = Date.now();
  await page.evaluate(([a, b]) => window.__preview.set(a, b), [hero, slot]);
  const setMs = Date.now() - t0;
  const adv = Date.now();
  await page.evaluate((sec) => window.__preview.advance(sec), Number(ms ?? 1500) / 1000);
  const advMs = Date.now() - adv;
  { const bb = await page.locator('#box').boundingBox(); await page.screenshot({ path: `${outDir}/${hero}-${slot}.png`, clip: bb, timeout: 60000 }); }
  const s = await page.evaluate(() => window.__preview.stats());
  rows.push({ hero, slot, setMs, advMs, casts: s.casts, loops: s.loops, avgMs: +s.avgMs.toFixed(2), maxMs: +s.maxMs.toFixed(1), firstFrameMs: Math.round(s.firstFrameMs), frames: s.frames });
}
// dispose: the GL context goes away
const disposed = await page.evaluate(() => {
  const c = window.__preview.canvas;
  window.__preview.dispose();
  return { inDom: document.body.contains(c), boxChildren: document.getElementById('box').children.length };
});
console.log(JSON.stringify({ rows, disposed, errors: errors.slice(0, 10) }, null, 1));
await browser.close();

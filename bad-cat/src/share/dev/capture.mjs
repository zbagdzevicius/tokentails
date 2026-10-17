/**
 * Acceptance capture (not shipped): opens the share dev page on the running dev server, exports every clip format
 * and card, and saves them to bad-cat/test-results/w2-share/. Usage (from bad-cat/):
 *   node src/share/dev/capture.mjs [--base=http://localhost:5174] [--query=only=pov,cards] [--out=test-results/w2-share]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg('base', 'http://localhost:5174');
const query = arg('query', '');
const out = resolve(arg('out', 'test-results/w2-share'));
const headless = arg('headless', '1') !== '0';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const ext = (m) => (m.includes('mp4') ? 'mp4' : m.includes('webm') ? 'webm' : m.includes('gif') ? 'gif' : m.includes('jpeg') ? 'jpg' : 'png');
const summary = {};
const allLog = [];
const timeoutMs = Number(arg('timeout', String(15 * 60_000)));
await page.goto(`${base}/src/share/dev/index.html${query ? `?${query}` : ''}`);
await page.click('#go');
const t0 = Date.now();
let seenLog = 0;
const saved = new Set();
for (;;) {
  const st = await page.evaluate(() => ({ done: window.__shareDone === true, log: window.__shareLog ?? [], names: Object.keys(window.__share ?? {}) }));
  for (; seenLog < st.log.length; seenLog++) {
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${st.log[seenLog]}`);
    allLog.push(st.log[seenLog]);
  }
  for (const name of st.names) {
    if (saved.has(name)) continue;
    const f = await page.evaluate((n) => window.__share[n], name);
    const file = join(out, `${name}.${ext(f.mime)}`);
    writeFileSync(file, Buffer.from(f.b64, 'base64'));
    summary[name] = { file, mime: f.mime, bytes: f.bytes, ...(f.meta ?? {}) };
    saved.add(name);
  }
  if (st.done || Date.now() - t0 > timeoutMs) break;
  await new Promise((r) => setTimeout(r, 1000));
}
let prev = {};
try {
  prev = JSON.parse((await import('node:fs')).readFileSync(join(out, 'summary.json'), 'utf8')).files ?? {};
} catch {
  /* first run */
}
writeFileSync(join(out, 'summary.json'), JSON.stringify({ log: allLog, files: { ...prev, ...summary } }, null, 2));
await browser.close();

#!/usr/bin/env node
/**
 * Renders public/og.jpg (1200×630, JPEG ~120 KB) from the live scene: the hero shot in `?og=1` mode (title, no
 * live number, no chrome). Never a frame of the meme video.
 *
 *   npm run dev            # in another terminal (port 5180)
 *   PLAYWRIGHT=/path/to/playwright node scripts/og.mjs [http://127.0.0.1:5180/]
 *
 * Playwright is not a dependency of this package; point PLAYWRIGHT at any install (or run it from
 * a directory where `playwright` resolves).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5180/';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og.jpg');
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`${base}?og=1&shot=hero&auto=0&mute=1&quality=high`);
await page.waitForFunction(() => window.__raveReady === true, null, { timeout: 60_000 });
await page.waitForTimeout(Number(process.env.OG_WAIT_MS ?? 9000)); // let lasers and the crowd settle
await page.screenshot({ path: out, type: 'jpeg', quality: Number(process.env.OG_QUALITY ?? 72) });
await browser.close();
console.log(`wrote ${out}`);

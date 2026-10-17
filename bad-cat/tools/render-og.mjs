#!/usr/bin/env node
/**
 * npm run og (GDD 6.6, 7.4): pre-renders the OG images into public/og/ (copied into every build):
 *   og/d/<n>.png   days 1..N, 1200 x 630, room still + title band ("Kitchen #18 · Breakfast Heist · can your cat wreck it?")
 *   og/s/<i>.png   one per shell (fallback for days past N, see og-pages.mjs)
 *   og/glass.png, og/pick.png (picker thumbnails grid), og/r.png (player room), og/c.png (cat card)
 *
 * Starts its own Vite dev server on 5175 (next free up to 5179; never 5174) serving tools/og.html, drives it in
 * Playwright chromium (software WebGL), writes only changed files. Exits 0 with a warning when no browser is installed.
 *
 *   node tools/render-og.mjs [--days N] [--only d|s|static] [--out public/og]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PKG_ROOT } from './lib/vite-load.mjs';
import { argValue } from './lib/args.mjs';

const outDir = path.resolve(PKG_ROOT, argValue('--out') ?? 'public/og');
const only = argValue('--only');

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  console.warn('warning: @playwright/test is not installed; OG images skipped');
  process.exit(0);
}

const { createServer } = await import('vite');
let server = null;
let port = 0;
for (const p of [5175, 5176, 5177, 5178, 5179]) {
  try {
    server = await createServer({
      root: PKG_ROOT,
      configFile: path.join(PKG_ROOT, 'vite.config.ts'),
      logLevel: 'error',
      server: { port: p, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
    });
    await server.listen();
    port = p;
    break;
  } catch {
    await server?.close().catch(() => undefined);
    server = null;
  }
}
if (!server) {
  console.error('no free port in 5175..5179');
  process.exit(1);
}

let browser = null;
let wrote = 0;
let same = 0;
try {
  try {
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  } catch (err) {
    console.warn(`warning: Playwright chromium is not available (${String(err?.message ?? err).split('\n')[0]}); OG images skipped. Install with: npx playwright install chromium`);
    process.exitCode = 0;
  }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.warn(`page error: ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/tools/og.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ogReady === true, null, { timeout: 60_000 });
    const today = await page.evaluate(async () => {
      const { content } = await import('/src/content/index.ts');
      return content.dayNoFor(new Date());
    });
    const days = Math.max(1, Number(argValue('--days') ?? Math.max(63, today + 30)) | 0);
    const save = (rel, b64) => {
      const file = path.join(outDir, rel);
      const buf = Buffer.from(b64, 'base64');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) same++;
      else {
        fs.writeFileSync(file, buf);
        wrote++;
      }
    };
    const t0 = Date.now();
    if (!only || only === 'static') {
      for (const k of ['glass', 'pick', 'r', 'c']) save(`${k}.png`, await page.evaluate((key) => window.__og[key](), k));
    }
    if (!only || only === 's') {
      const shells = await page.evaluate(() => window.__og.shells());
      for (const s of shells) save(`s/${s.i}.png`, await page.evaluate((i) => window.__og.shell(i), s.i));
    }
    if (!only || only === 'd') {
      for (let n = 1; n <= days; n++) {
        save(`d/${n}.png`, await page.evaluate((d) => window.__og.day(d), n));
        if (n % 20 === 0) console.log(`  day ${n}/${days}`);
      }
    }
    console.log(`og: ${wrote} written, ${same} unchanged in ${path.relative(PKG_ROOT, outDir)}/ (days 1..${days}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}

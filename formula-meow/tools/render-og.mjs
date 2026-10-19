#!/usr/bin/env node
/**
 * npm run og (GDD 8.3, 16): renders the OG images into public/og/ (copied into every build) from the real game:
 *   og/og.png  1200×630, Kaunas Neon Rooftops mid-race, "FORMULA MEOW"
 *   og/r.png   the same race with "BEAT MY CAT" (dare links)
 *   og/d.png   Kitchen Counter GP with "DAILY CUP" (daily links)
 *
 * Starts its own Vite dev server on 5176..5179 (never 5175, the dev port), drives it in Playwright Chromium with
 * software WebGL. Exits 0 with a warning when no browser is installed. Writes only changed files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og');

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
for (const p of [5176, 5177, 5178, 5179]) {
  try {
    server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'error', server: { port: p, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
    await server.listen();
    port = p;
    break;
  } catch {
    await server?.close().catch(() => undefined);
    server = null;
  }
}
if (!server) {
  console.error('no free port in 5176..5179');
  process.exit(1);
}

const SHOTS = [
  { file: 'og.png', query: '?track=rooftops&seed=3&bot=1', title: 'FORMULA MEOW', sub: '8 cats · drift · boost · beat real shelter cats' },
  { file: 'r.png', query: '?track=rooftops&seed=8&bot=1', title: 'BEAT MY CAT', sub: 'A friend sent you their ghost. Race it.' },
  { file: 'd.png', query: '?track=kitchen&seed=4&bot=1', title: 'DAILY CUP', sub: 'One race a day · same track for everyone' },
];

let browser = null;
let wrote = 0;
try {
  try {
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  } catch (err) {
    console.warn(`warning: Playwright chromium is not available (${String(err?.message ?? err).split('\n')[0]}); OG images skipped`);
    process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(`http://127.0.0.1:${port}/${s.query}`);
    await page.waitForFunction(() => {
      const w = window.__fm?.shell?.world;
      return !!w && w.st.tick > 60 * 9;
    }, null, { timeout: 120_000 });
    await page.evaluate(({ title, sub }) => {
      const st = document.createElement('style');
      st.textContent = `.fm-hud,.fm-touch,.fm-menu-btn,.fm-overlay,.fm-dare-banner{display:none!important}
        .og-band{position:fixed;left:0;right:0;bottom:0;padding:26px 48px 34px;background:linear-gradient(transparent,rgba(26,18,56,.92) 38%);
        font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff3dc;z-index:99}
        .og-band b{display:block;font-size:104px;font-weight:900;line-height:1;letter-spacing:-1px;color:#ff3ea5;-webkit-text-stroke:5px #1a1238;paint-order:stroke fill}
        .og-band span{display:block;font-size:38px;font-weight:800;margin-top:10px}
        .og-tag{position:fixed;top:28px;right:36px;background:#ffd27a;color:#1a1238;font:900 30px system-ui,sans-serif;padding:10px 20px;border-radius:999px;z-index:99}`;
      document.head.appendChild(st);
      const band = document.createElement('div');
      band.className = 'og-band';
      band.innerHTML = `<b></b><span></span>`;
      band.querySelector('b').textContent = title;
      band.querySelector('span').textContent = sub;
      document.body.appendChild(band);
      const tag = document.createElement('div');
      tag.className = 'og-tag';
      tag.textContent = 'tokentails.com/meow-race';
      document.body.appendChild(tag);
    }, s);
    await page.waitForTimeout(400);
    const png = await page.screenshot({ type: 'png' });
    const file = path.join(OUT, s.file);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(png)) {
      fs.writeFileSync(file, png);
      wrote++;
    }
    await page.close();
  }
  console.log(`og: ${wrote} image(s) written to ${OUT}`);
} finally {
  await browser?.close();
  await server.close();
}

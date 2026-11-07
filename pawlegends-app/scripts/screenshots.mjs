#!/usr/bin/env node
/**
 * App Store screenshots from the app's own web bundle (`www/`, built by scripts/build-web.mjs), so they show exactly
 * what the app runs (guideline 2.3). iPhone 6.9" landscape: 2868 x 1320 (956 x 440 points at 3x), touch controls on.
 *
 *   node scripts/screenshots.mjs          writes fastlane/screenshots/en-US/<n>_<name>.png (deliver uploads them)
 *
 * Uses Playwright from ../pawlegends (already a dev dependency there). Review each shot before `fastlane metadata`;
 * Apple wants real gameplay, no device frames needed.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { APP_DIR, REPO_DIR } from './lib/app-config.mjs';

const require = createRequire(join(REPO_DIR, 'pawlegends/package.json'));
const { chromium } = require('@playwright/test');

const www = join(APP_DIR, 'www');
if (!existsSync(join(www, 'index.html'))) throw new Error('screenshots: build the bundle first (npm run build:web)');
const out = join(APP_DIR, 'fastlane/screenshots/en-US');
mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(www, path);
  if (!file.startsWith(www) || !existsSync(file) || statSync(file).isDirectory()) file = join(www, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [];
async function page(profile) {
  const ctx = await browser.newContext({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  if (profile) {
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ['tt.pawlegends.profile.v1', JSON.stringify(profile)]);
  }
  const p = await ctx.newPage();
  await p.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('html[data-screen="title"]', { timeout: 60000 });
  await p.waitForTimeout(1500);
  return p;
}
async function shoot(p, name) {
  const file = join(out, `${shots.length + 1}_${name}.png`);
  await p.screenshot({ path: file, animations: 'disabled' });
  shots.push(file);
}
async function drag(p, x0, y0, x1, y1, ms) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8, id: 1 }] });
  await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  const played = { v: 1, sessions: 3, matches: 4, wins: 3, firstWinDone: true, hero: 'clem', side: 'cat' };
  const title = await page(played);
  await shoot(title, 'title');
  await title.context().close();

  const match = await page(null);
  await match.locator('.pl-btn.big').first().click();
  await match.waitForSelector('html[data-match="live"]', { timeout: 60000 });
  await match.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30000 });
  await match.waitForTimeout(4000);
  await shoot(match, 'match-start');
  // walk up the lane toward the first fight
  await drag(match, 150, 300, 230, 250, 12000);
  await match.waitForTimeout(8000);
  await shoot(match, 'lane-fight');
  await drag(match, 150, 300, 230, 260, 10000);
  await match.waitForTimeout(6000);
  await shoot(match, 'teamfight');
} finally {
  await browser.close();
  server.close();
}
console.log(`screenshots: ${shots.length} shots (2868 x 1320) in ${out}`);

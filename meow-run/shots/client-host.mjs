// The site build, hosted like tokentails.com: node shots/client-host.mjs [port]   (default 5190)
// Serves ../client/public statically (run `npm run build:client` first) plus the Next rewrite from
// client/next.config.js (`/meow-run` -> `/meowrun-game/index.html`, `/meow-run/*` -> `/meowrun-game/*`, query kept),
// then checks in Chromium:
//   1. /meowrun-game/index.html boots under the /meowrun-game/ base, every request is 2xx, 10 s of real play;
//   2. /meow-run (the site route) boots, and links it makes point at /meow-run (not at /meowrun-game/);
//   3. /meow-run?c=<code> opens the challenge card and /meow-run?t=<code> the trail overlay.
// Exits 1 on any failed check, failed request, page error or console error.
import { chromium } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBot } from './bot.mjs';

const PORT = +(process.argv[2] || 5190);
const ROOT = fileURLToPath(new URL('../../client/public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let path = decodeURIComponent(u.pathname);
  if (path === '/meow-run' || path === '/meow-run/') path = '/meowrun-game/index.html';
  else if (path.startsWith('/meow-run/')) path = '/meowrun-game/' + path.slice('/meow-run/'.length);
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const b = await chromium.launch({ args: gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const errs = [];
const fails = [];
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
async function page(tag) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag}: ${String(e).slice(0, 300)}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text().slice(0, 300)}`); });
  p.on('response', (r) => { if (r.status() >= 400) errs.push(`${tag}: HTTP ${r.status()} ${r.url()}`); });
  p.on('requestfailed', (r) => errs.push(`${tag}: request failed ${r.url()}`));
  return p;
}
const boot = (p) => p.waitForFunction(() => window.__meow?.dev && window.__meowUgc?.share && window.__meowUgc?.trails, null, { timeout: 30000 });
const waitFor = async (p, fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};

// 1. the built index under its own base, 10 s of real play from the title
const p1 = await page('index');
await p1.goto(`${BASE}/meowrun-game/index.html`);
await boot(p1);
await p1.waitForTimeout(1200);
const assets = await p1.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map((e) => e.getAttribute('src') || e.getAttribute('href')));
check('built assets use the /meowrun-game/ base', assets.filter((a) => a.includes('build/')).every((a) => a.startsWith('/meowrun-game/build/')), assets);
check('title on the built index', (await p1.evaluate(() => document.body.dataset.screen)) === 'title');
const bot = await createBot(p1, { mobile: false, W: 1280, H: 720 });
await bot.install();
await p1.evaluate(() => { window.__meow.dev.unlockAll(); window.__meow.dev.jump('meadow', 0); });
await waitFor(p1, () => window.__meow.mode === 'play', 5000);
const s0 = await p1.evaluate(() => window.__meow.P.s);
await bot.playUntil(() => false, { maxMs: 10000 });
const st = await p1.evaluate(() => ({ mode: window.__meow.mode, s: Math.round(window.__meow.P.s), hearts: window.__meow.G.hearts }));
check('10 s of play on the built index', st.mode === 'play' && st.s - s0 > 150, st);
await p1.screenshot({ path: 'shots/host-index.png' });
// a challenge code and a trail code to open on the site route
const codes = await p1.evaluate(async () => {
  const h = window.__meowUgc.share;
  const samples = [];
  for (let i = 0; i <= 6 * 30; i++) samples.push({ s: (21 * i) / 6, x: 1.2 * Math.sin(i / 8), y: 0, flags: 0 });
  const c = await h.encode({ v: 1, stage: 'meadow', score: 123456, name: 'Host', look: '000000', chain: 3, ghost: h.packGhost(samples, 6) });
  const t = window.__meowUgc.trails.encode(window.__meowUgc.trails.random(7));
  return { c, t };
});

// 2 + 3. the site route with ?c=, then ?t=
const p2 = await page('route-c');
await p2.goto(`${BASE}/meow-run?from=picker&c=${codes.c}`);
await boot(p2);
check('/meow-run?c= opens the challenge card', await waitFor(p2, () => document.querySelector('.share-chal h2')?.textContent === 'Host challenges you!', 6000));
check('?c= consumed, other params and the path kept', await p2.evaluate(() => location.pathname === '/meow-run' && location.search === '?from=picker'));
const linkBase = await p2.evaluate(() => window.__meowUgc.trails.link('x'));
check('links made on the site route point at /meow-run', linkBase.startsWith(`http://127.0.0.1:${PORT}/meow-run?`), linkBase);
await p2.screenshot({ path: 'shots/host-challenge.png' });
await p2.click('#shareChalPlay');
check('the challenge plays from the site route', await waitFor(p2, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'meadow', 5000));
await p2.waitForTimeout(2500);
const g = await p2.evaluate(() => window.__meowUgc.share.ghost());
check('the ghost races on the site route', g.active, g);
const p3 = await page('route-t');
await p3.goto(`${BASE}/meow-run?t=${encodeURIComponent(codes.t)}`);
await boot(p3);
check('/meow-run?t= opens the trail overlay', await waitFor(p3, () => !!document.getElementById('trailsLinkPlay'), 6000));
await p3.click('#trailsLinkPlay');
check('the trail plays from the site route', await waitFor(p3, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 5000));
check('same trail code', (await p3.evaluate(() => window.__meowUgc.trails.current())) === codes.t);
await p3.screenshot({ path: 'shots/host-trail.png' });

console.log('ERRORS', errs.length, errs.slice(0, 8));
console.log(fails.length || errs.length ? `CLIENT HOST FAILED: ${fails.join(', ')}` : 'CLIENT HOST OK');
await b.close();
server.close();
process.exit(fails.length || errs.length ? 1 : 0);

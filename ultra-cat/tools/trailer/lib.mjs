// Trailer capture helpers: a private vite dev server, a headless Chromium page with the virtual clock and the director,
// and frame-stepped recording (one 1/60 s step, one CDP screenshot, piped to ffmpeg as lossless-ish H.264).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..'); // ultra-cat/
export const BUILD = path.join(HERE, 'build');
export const FOOTAGE = path.join(BUILD, 'footage');
export const PORT = Number(process.env.TRAILER_PORT ?? 6231);
if (PORT === 5177) throw new Error('5177 is the shared dev port; the trailer runs its own server');
export const BASE = `http://127.0.0.1:${PORT}`;
const SHIM = fs.readFileSync(path.join(HERE, 'clock-shim.js'), 'utf8');
const DIRECTOR = fs.readFileSync(path.join(HERE, 'page.js'), 'utf8');

export const ASPECTS = {
  '16x9': { viewport: { width: 960, height: 540 }, dpr: 2, size: [1920, 1080], touch: false },
  '9x16': { viewport: { width: 432, height: 768 }, dpr: 2.5, size: [1080, 1920], touch: true },
};

// HUD pieces that never belong in a trailer frame (timer, pause, hints, objective list, arrows, tutorial)
const HUD_CSS = `#timer,#pauseBtn,#hint,#objTrack,#wantedArrow,#fishArrow,#threatArrow,#tut,.bars{display:none!important}
#title,#map,#cats,#intro,#results,#pause,#settings,#confirm,#toast{display:none!important} body{cursor:none!important}`;
const CLEAN_CSS = `.hud,#touch,#pops,#wet{display:none!important}`;
// Per-aspect trailer look. 16:9 (the trailer): no DAMAGE/HITS counter, money pops or game banners, so the trailer cards
// are the only copy and the counter never visibly resets at a cut (a shot can bring a piece back with L.show).
// 9:16 (how to play): the HUD and pops stay (they are the lesson), only the banners go (the cards carry the copy).
// Both: the white screen flash is dimmed, so an ULTRA or a boss hit never washes the whole frame out.
const TAKE_CSS = {
  '16x9': `#dmg,#combo,#cbar,#zap,#pops,#banner{visibility:hidden!important}`,
  '9x16': `#banner{visibility:hidden!important}`,
};
const FLASH_CSS = `#flash{filter:opacity(0.3)}`;

let server = null;
async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
export async function startServer() {
  if (await up(BASE + '/')) return;
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await up(BASE + '/')) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite did not start on ' + BASE);
}
export function stopServer() {
  server?.kill('SIGTERM');
  server = null;
}

let browser = null;
export async function getBrowser() {
  // headless Chromium on macOS renders WebGL on the GPU through ANGLE/Metal; swiftshader is the fallback elsewhere
  if (!browser) browser = await chromium.launch({ headless: true, args: process.env.TRAILER_SWIFTSHADER ? ['--use-gl=angle', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-swiftshader'] });
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

/** A fresh page (clean save, muted) with the game loaded, all cities and cats unlocked, the clock frozen. */
export async function openGame(aspect, { seed = 1 } = {}) {
  const a = ASPECTS[aspect];
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: a.viewport, deviceScaleFactor: a.dpr, hasTouch: a.touch, isMobile: a.touch });
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(DIRECTOR);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !!(window.__ultra && window.__ultra.dev), null, { timeout: 60_000 });
  await page.evaluate(() => window.__dir.init());
  await page.addStyleTag({ content: HUD_CSS + FLASH_CSS + TAKE_CSS[aspect] });
  await page.evaluate(
    ({ seed, dpr }) => {
      const u = window.__ultra;
      u.dev.unlockAll();
      // full resolution on touch too (the game caps phones at 1.5x)
      window.__dir.M.engine.renderer.setPixelRatio(dpr);
      window.__dir.M.engine.renderer.setSize(innerWidth, innerHeight);
      window.__cap.freeze();
      window.__cap.seed(seed);
    },
    { seed, dpr: a.dpr },
  );
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors, aspect: a, aspectId: aspect, close: () => ctx.close() };
}

/** Hide the whole HUD (clean frames for the loop and stills) or bring it back. */
export async function clean(o, on = true) {
  await o.page.evaluate(
    ({ css, on }) => {
      let el = document.getElementById('__clean');
      if (!el) {
        el = document.createElement('style');
        el.id = '__clean';
        document.head.appendChild(el);
      }
      el.textContent = on ? css : '';
    },
    { css: CLEAN_CSS, on },
  );
}

/** Bring HUD pieces hidden by TAKE_CSS back for this take (CSS selector list), e.g. the combo in the frenzy. */
export async function show(o, sel) {
  await o.page.evaluate((sel) => {
    let el = document.getElementById('__show');
    if (!el) {
      el = document.createElement('style');
      el.id = '__show';
      document.head.appendChild(el);
    }
    el.textContent = sel ? `${sel}{visibility:visible!important}` : '';
  }, sel);
}

/** Jump into a level with a cat, past the intro swoop, the clock still frozen. Returns after `settle` frames. */
export async function jump(o, level, cat, { seed = 1, settle = 2 } = {}) {
  await o.page.evaluate(
    ({ level, cat, seed }) => {
      window.__cap.seed(seed);
      window.__dir.bot = null;
      window.__dir.cam = null;
      window.__ultra.dev.jump(level, cat);
      window.__ultra.game.intro = 1;
      // the "RAMPAGE!" banner of the level start is not trailer material
      const b = document.getElementById('banner');
      if (b) for (const a of b.getAnimations()) a.cancel();
    },
    { level, cat, seed },
  );
  await sim(o, settle);
}

/** Step n frames without capturing. */
export async function sim(o, n) {
  await o.page.evaluate((n) => window.__dir.frame(n), n);
}

export async function ev(o, fn, arg) {
  return o.page.evaluate(fn, arg);
}

/**
 * Record `frames` frames to build/footage/<name>-<aspect>.mp4 (+ .json with the events logged per take frame).
 * `perFrame(i)` (node side, optional) runs before each frame.
 */
export async function record(o, name, frames, { perFrame } = {}) {
  const { page, cdp } = o;
  const [W, H] = o.aspect.size;
  fs.mkdirSync(FOOTAGE, { recursive: true });
  const file = path.join(FOOTAGE, `${name}-${o.aspectId}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-', '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-r', '60', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await page.evaluate(() => {
    window.__dir.f = 0;
    window.__dir.log = [];
  });
  const states = [];
  for (let i = 0; i < frames; i++) {
    if (perFrame) await perFrame(i);
    const st = await page.evaluate(() => {
      window.__dir.frame(1);
      const u = window.__ultra;
      return { m: u.mode, dmg: Math.round(u.G.damage), c: u.G.combo, u: Math.round(u.G.ultra), ut: +u.G.ultraT.toFixed(2) };
    });
    states.push(st);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    const buf = Buffer.from(shot.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  const log = await page.evaluate(() => window.__dir.log);
  fs.writeFileSync(file.replace(/\.mp4$/, '.json'), JSON.stringify({ frames, log, states }));
  return { file, log, states };
}

/** One still frame as PNG (no clock step). */
export async function still(o, file) {
  const shot = await o.cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
}

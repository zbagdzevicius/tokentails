// Trailer capture helpers (from ultra-cat/tools/trailer/lib.mjs): a private vite dev server, a headless Chromium page
// with the virtual clock and the director, and frame-stepped recording (one 1/60 s step, one CDP screenshot, piped to
// ffmpeg as near-lossless H.264).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..'); // meow-run/
export const BUILD = path.join(HERE, 'build');
export const FOOTAGE = path.join(BUILD, 'footage');
export const PORT = Number(process.env.TRAILER_PORT ?? 6241);
if (PORT === 5178 || PORT === 5177) throw new Error(`${PORT} is a shared dev port; the trailer runs its own server`);
export const BASE = `http://127.0.0.1:${PORT}`;
const SHIM = fs.readFileSync(path.join(HERE, 'clock-shim.js'), 'utf8');
const DIRECTOR = fs.readFileSync(path.join(HERE, 'page.js'), 'utf8');

export const ASPECTS = {
  '16x9': { viewport: { width: 960, height: 540 }, dpr: 2, size: [1920, 1080], touch: false },
  '9x16': { viewport: { width: 432, height: 768 }, dpr: 2.5, size: [1080, 1920], touch: true },
};

// never in a trailer frame: menus, the pause button, the coach cards, the cutscene skip, the cursor
const BASE_CSS = `#title,#select,#pause,#settings,#results,#cutSkip,#pauseBtn{display:none!important}
body{cursor:none!important}`;
// 16:9 (the trailer): no score, progress bar, hearts, bells or key prompts, so the cards are the only copy and no
// counter visibly resets at a cut. Callouts ("CLOSE ONE!", "NOM NOM!") and the score pops stay: they are the juice.
// A shot can bring a piece back with L.show (the fish combo keeps its multiplier).
// 9:16 (how to play): the touch HUD stays (hearts, bells, score, PUFF meter), but the comic callouts, the in-game
// prompt banner ("SWIPE UP - JUMP!") and the tutorial coach card go: the trailer captions carry each lesson once (two
// banners saying the same thing crowded the top third), and the coach card kept showing its first tip.
const TAKE_CSS = {
  '16x9': `#coach,#hearts,#bells,#portrait,#prog,#distPill,#score,#mult,#prompt,#meter,#abilityBtn,#incoming{visibility:hidden!important}`,
  '9x16': `#coach,#callouts,#prompt{visibility:hidden!important}`,
};
// clean frames (loop, stills, end card): nothing but the picture
const CLEAN_CSS = `#hearts,#bells,#portrait,#prog,#distPill,#score,#mult,#prompt,#meter,#abilityBtn,#incoming,#popups,#callouts,#vignette,#flash,#__finger{visibility:hidden!important}`;

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

/** A fresh page (clean save, muted, HIGH quality) with the game loaded, every stage unlocked, the clock frozen. */
export async function openGame(aspect, { seed = 1 } = {}) {
  const a = ASPECTS[aspect];
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: a.viewport, deviceScaleFactor: a.dpr, hasTouch: a.touch, isMobile: a.touch });
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
      // muted (the soundtrack is rendered offline), HIGH quality, every stage open
      localStorage.setItem('meowrun.save', JSON.stringify({ v: 1, unlockAll: true, settings: { master: 0, music: 0, sfx: 0, quality: 'high', reducedMotion: false, shake: 1 } }));
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
  await page.waitForFunction(() => !!(window.__meow && window.__meow.dev), null, { timeout: 60_000 });
  await page.evaluate(() => window.__dir.init());
  await page.addStyleTag({ content: BASE_CSS + TAKE_CSS[aspect] });
  await page.evaluate(
    ({ seed, dpr }) => {
      const m = window.__meow;
      m.dev.unlockAll();
      m.quality.set('high');
      window.__dir.dpr = dpr;
      window.__dir.fixRes();
      window.__cap.freeze();
      window.__cap.seed(seed);
    },
    { seed, dpr: a.dpr },
  );
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors, aspect: a, aspectId: aspect, close: () => ctx.close() };
}

function styleTag(o, id, css) {
  return o.page.evaluate(
    ({ id, css }) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = css;
    },
    { id, css },
  );
}
/** Hide every HUD piece (clean frames for the loop, stills and end card) or bring them back. */
export const clean = (o, on = true) => styleTag(o, '__clean', on ? CLEAN_CSS : '');
/** Bring HUD pieces hidden by TAKE_CSS back for this take (CSS selector list). */
export const show = (o, sel) => styleTag(o, '__show', sel ? `${sel}{visibility:visible!important}` : '');
/** Extra CSS for one take. */
export const css = (o, text) => styleTag(o, '__css', text ?? '');

/**
 * Start a stage at track position `s` (u; or a fraction 0..1 with `frac`), the clock frozen, the bot and camera
 * cleared. Returns { s, finishS } after `settle` frames.
 */
export async function jump(o, stage, s, { seed = 1, settle = 2, frac = false } = {}) {
  const r = await o.page.evaluate(
    ({ stage, s, seed, frac }) => {
      window.__cap.seed(seed);
      const D = window.__dir;
      D.bot = null;
      D.cam = null;
      D.camState = null;
      return D.start(stage, s, frac);
    },
    { stage, s, seed, frac },
  );
  await sim(o, settle);
  return r;
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
      const m = window.__meow;
      const P = m.P;
      return { m: m.mode, s: +P.s.toFixed(1), x: +P.x.toFixed(2), y: +P.y.toFixed(2), pm: P.mode, k: m.game.track?.kindAt(P.s), h: m.G.hearts, b: m.G.bells.filter(Boolean).length, mu: m.G.mult };
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

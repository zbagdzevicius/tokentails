// Trailer capture, group B: shared helpers (browser, virtual clock, frame-stepped recording to H.264).
// Capture-only: the game build is untouched; hooks used are the ones the e2e/review specs already use (window.__fm,
// __fmModes, __fmDoodle) plus a runtime simSpeed and the shell's accumulator, set from page JS.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BUILD = path.join(HERE, 'build');
export const OUT_B = path.join(BUILD, 'footage', 'B');
export const PORT = Number(process.env.TRAILER_B_PORT ?? 6212);
export const BASE = `http://127.0.0.1:${PORT}`;
export const Q = '&quality=high&bloom=1';
const SHIM = fs.readFileSync(path.join(HERE, 'clock-shim-b.js'), 'utf8');

/** page-side helpers: quantised one-sim-step frames, exact fast-forward, per-tick hooks on the world */
const HELPERS = `(() => {
  const DT = 1 / 60;
  window.__capB = {
    q() {
      const s = window.__fm && window.__fm.shell;
      if (s) s.acc = Math.round(s.acc / DT * 1e6) / 1e6 * DT + 1e-9;
    },
    frame(n = 1) { window.__cap.step(n, () => this.q()); },
    tick() { const w = window.__fm && window.__fm.shell.world; return w ? w.st.tick : -1; },
    me() { const w = window.__fm.shell.world; return w.st.karts[w.cfg.humans[0]]; },
    /** fast-forward (frozen, up to 8 sim steps per frame) to exactly tick T; returns the tick reached */
    toTick(T) {
      const s = window.__fm.shell;
      let guard = 0;
      let stall = 0;
      while (s.world && s.world.st.tick < T && guard++ < 20000 && stall < 30) {
        const t0 = s.world.st.tick;
        s.simSpeed = Math.max(1, Math.min(8, T - t0));
        this.frame();
        stall = s.world && s.world.st.tick === t0 ? stall + 1 : 0;
      }
      s.simSpeed = 1;
      return this.tick();
    },
    /** wrap the current world's step: fn(world) runs after every sim tick (probes, item gives at exact ticks) */
    onTick(fn) {
      const w = window.__fm.shell.world;
      if (!w.__origStep) { w.__origStep = w.step.bind(w); w.__hooks = []; w.step = (inp) => { const r = w.__origStep(inp); for (const h of w.__hooks) h(w); return r; }; }
      w.__hooks.push(fn);
    },
  };
})();`;

export const HIDE_DOM_CSS = 'body *:not(.fm-canvas){visibility:hidden!important} .fm-canvas{visibility:visible!important} body{cursor:none!important}';

let browser = null;
export async function getBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = null;
}

export const ASPECTS = {
  '16x9': { viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, size: [1920, 1080] },
  '9x16': { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, size: [1080, 1920] },
};
export const EDITOR_ASPECTS = {
  '16x9': { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, size: [1920, 1080] },
  '9x16': { viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, size: [1080, 1920] },
};

/**
 * Open a fresh context (clean storage, muted, no touch). `ls` presets localStorage keys (already prefixed).
 */
export async function openPage(aspect, url, { editor = false, ls = {} } = {}) {
  const a = (editor ? EDITOR_ASPECTS : ASPECTS)[aspect];
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: a.viewport, deviceScaleFactor: a.deviceScaleFactor, hasTouch: false, isMobile: false });
  const preset = { ...ls };
  await ctx.addInitScript((p) => {
    try {
      for (const [k, v] of Object.entries(p)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
    } catch {}
  }, preset);
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(HELPERS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(BASE + url);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors, aspect: a, close: () => ctx.close() };
}

export async function hideDom(page, extra = '') {
  await page.addStyleTag({ content: HIDE_DOM_CSS + extra });
  await page.evaluate(() => window.__fm?.shell.hud.setVisible(false));
}

export async function waitWorld(page, timeout = 60_000) {
  await page.waitForFunction(() => !!window.__fm?.shell.world, null, { timeout });
}

/** keep the render at full resolution (the DPR governor may have stepped down while loading in real time) */
export async function fullRes(page) {
  return page.evaluate(() => {
    const s = window.__fm?.shell;
    if (!s) return null;
    const want = Math.min(2, window.devicePixelRatio || 1);
    if (s.stage.dpr !== want) {
      s.stage.dpr = want;
      s.stage.renderer.setPixelRatio(want);
      s.onResize();
    }
    return s.stage.dpr;
  });
}

/**
 * Record `frames` frames: before each, `perFrame(i)` (optional, in node) may act; each frame is one virtual 1/60 s
 * step, then a CDP screenshot piped to ffmpeg. Returns the per-frame manifest.
 */
export async function record(o, file, frames, { perFrame, stepFn } = {}) {
  const { page, cdp } = o;
  const [W, H] = o.aspect.size;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-', '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '10', '-profile:v', 'high', '-r', '60', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  const manifest = [];
  for (let i = 0; i < frames; i++) {
    if (perFrame) await perFrame(i);
    const info = await page.evaluate(
      (custom) => {
        const s = window.__fm?.shell;
        const w = s?.world;
        const t0 = w ? w.st.tick : -1;
        const n0 = w ? w.st.events.length : 0;
        if (custom) new Function(custom)();
        else window.__capB.frame();
        const w2 = s?.world;
        if (!w2) return { tick: -1 };
        const k = w2.st.karts[w2.cfg.humans[0]];
        const ev = w2 === w ? w2.st.events.slice(n0).map((e) => [e.type, e.kart, e.a ?? null, e.b ?? null, e.tick]) : [];
        return { tick: w2.st.tick, d: w2 === w ? w2.st.tick - t0 : null, si: k.si, rail: k.rail, air: k.air, surface: k.surface, ev };
      },
      stepFn ?? null,
    );
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
    const buf = Buffer.from(shot.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    manifest.push({ f: i, ...info });
  }
  ff.stdin.end();
  await done;
  fs.writeFileSync(file.replace(/\.mp4$/, '.json'), JSON.stringify(manifest));
  return manifest;
}

export function readAnchors() {
  try {
    return JSON.parse(fs.readFileSync(path.join(BUILD, 'anchors-B.json'), 'utf8'));
  } catch {
    return {};
  }
}
export function writeAnchor(id, v) {
  const a = readAnchors();
  a[id] = v;
  fs.writeFileSync(path.join(BUILD, 'anchors-B.json'), JSON.stringify(a, null, 2));
}

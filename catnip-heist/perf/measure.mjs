#!/usr/bin/env node
/**
 * Catnip Heist performance harness. Builds the game (optional), serves it with `vite preview` on a
 * free port (never 4173 / 5199 / 4391), drives it with Playwright + the Chrome DevTools Protocol and
 * prints one JSON document with load, runtime, heap and (optionally) CPU-profile metrics.
 *
 *   node perf/measure.mjs --build                      # rebuild perf/.dist, then the default run
 *   node perf/measure.mjs --quick                      # heist-01, heist-08, yard, title; desktop; 4x; 5 s
 *   node perf/measure.mjs --gpu=metal --out=perf/out/metal.json
 *   node perf/measure.mjs --only=runtime --scenes=heist-08 --viewports=phone --throttle=6 --quality=low
 *   node perf/measure.mjs --profile                    # adds CPU-profile hotspots (unminified build)
 *   node perf/measure.mjs --screens                    # (re)writes perf/ref/*.png and stops
 *   node perf/measure.mjs --md perf/out/metal.json     # prints markdown tables for a saved result
 *
 * Flags (all optional):
 *   --build                rebuild perf/.dist (and perf/.dist-prof with --profile) first
 *   --gpu=swiftshader|metal  WebGL backend. swiftshader (default) matches e2e/CI; metal uses the
 *                          host GPU through ANGLE (much closer to a real device's GPU cost)
 *   --only=load,runtime,heap,profile   sections to run (default load,runtime,heap)
 *   --scenes=title,heist-01..heist-08,yard   runtime scenes (default all ten)
 *   --viewports=desktop,phone          desktop 1280x720 @1x, phone 390x844 @3x touch (default both)
 *   --throttle=4,6                      CPU slowdown(s) for runtime (Emulation.setCPUThrottlingRate)
 *   --load-throttle=1,4,6               CPU slowdown(s) for load runs
 *   --quality=high,low                  forced tiers (?quality=)
 *   --seconds=8                         runtime measuring window per config
 *   --heap-seconds=60                   heap-growth window
 *   --heap=heist-08:desktop:4:high,yard:desktop:4:high   heap-growth configs
 *   --profile                           also collect CPU profiles (implies the prof build)
 *   --out=<file>                        also write the JSON there
 *   --port=<n>                          preview port (default: a free one)
 *
 * The page is instrumented with an init script (no source changes): a requestAnimationFrame
 * wrapper (frame interval + JS time per frame), a WebGL wrapper (draw calls, triangles, live GL
 * objects, shader compile/link/status time, upload time, sync stalls), a long-task observer, and,
 * on the heist screen, timers around the renderer's subsystems (reached through window.__heist.app).
 * JS per frame is the CPU-side cost; frame interval minus JS is what the GPU / compositor adds.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, cpus, totalmem } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const VITE = join(pkg, 'node_modules/.bin/vite');
const DIST = join(here, '.dist');
const DIST_PROF = join(here, '.dist-prof');
const LEVELS = ['heist-01', 'heist-02', 'heist-03', 'heist-04', 'heist-05', 'heist-06', 'heist-07', 'heist-08'];
const ALL_SCENES = ['title', ...LEVELS, 'yard'];
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const list = (name, def) => opt(name, def).split(',').map((s) => s.trim()).filter(Boolean);

if (flag('md')) {
  const file = argv[argv.indexOf('--md') + 1];
  process.stdout.write(toMarkdown(JSON.parse(readFileSync(file, 'utf8'))));
  process.exit(0);
}

const quick = flag('quick');
const screensMode = flag('screens') || flag('compare-screens');
const cfg = {
  // Reference screenshots default to the host GPU (fast; compare on the same machine).
  gpu: opt('gpu', screensMode ? 'metal' : 'swiftshader'),
  only: new Set(list('only', flag('profile') ? 'load,runtime,heap,profile' : 'load,runtime,heap')),
  scenes: list('scenes', quick ? 'title,heist-01,heist-08,yard' : ALL_SCENES.join(',')),
  viewports: list('viewports', quick ? 'desktop' : 'desktop,phone'),
  throttle: list('throttle', quick ? '4' : '4,6').map(Number),
  loadThrottle: list('load-throttle', quick ? '4' : '1,4,6').map(Number),
  quality: list('quality', 'high,low'),
  seconds: Number(opt('seconds', quick ? '5' : '8')),
  heapSeconds: Number(opt('heap-seconds', quick ? '20' : '60')),
  heap: list('heap', quick ? 'heist-01:desktop:4:high' : 'heist-08:desktop:4:high,heist-08:phone:6:low,yard:desktop:4:high,title:desktop:4:high'),
  out: opt('out', ''),
  port: Number(opt('port', '0')),
};
if (flag('profile')) cfg.only.add('profile');
const log = (...a) => process.stderr.write(`[perf] ${a.join(' ')}\n`);

// ---------------------------------------------------------------------------------------------
// Build + server
// ---------------------------------------------------------------------------------------------

function build(outDir, minify) {
  log(`vite build -> ${relative(pkg, outDir)}${minify ? '' : ' (unminified)'}`);
  const args = ['build', '--outDir', outDir, '--emptyOutDir', ...(minify ? [] : ['--minify', 'false'])];
  const r = spawnSync(VITE, args, { cwd: pkg, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`vite build failed:\n${r.stdout}\n${r.stderr}`);
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ([4173, 5199, 4391, 5173].includes(p) ? freePort().then(res, rej) : res(p)));
    });
  });
}

async function serve(outDir) {
  const port = cfg.port || (await freePort());
  const child = spawn(VITE, ['preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: pkg, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url + '/');
      if (r.ok) return { url, close: () => child.kill('SIGTERM') };
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`vite preview exited: ${err}`);
    await sleep(100);
  }
  child.kill('SIGTERM');
  throw new Error('vite preview did not start');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function bundleStats(dir) {
  const files = walk(dir).map((p) => {
    const buf = readFileSync(p);
    const rel = relative(dir, p);
    const ext = rel.split('.').pop();
    const kind = ext === 'js' ? 'js' : ext === 'css' ? 'css' : ext === 'html' ? 'html' : rel.startsWith('assets/') ? 'assets' : 'other';
    const gz = ['js', 'css', 'html', 'json', 'svg'].includes(ext) ? gzipSync(buf, { level: 9 }).length : buf.length;
    return { path: rel, kind, bytes: buf.length, gzip: gz };
  });
  const by = {};
  for (const f of files) {
    const b = (by[f.kind] ??= { files: 0, bytes: 0, gzip: 0 });
    b.files++;
    b.bytes += f.bytes;
    b.gzip += f.gzip;
  }
  // Largest assets by folder (cats / dogs / images...).
  const folders = {};
  for (const f of files.filter((f) => f.kind === 'assets')) {
    const k = f.path.split('/').slice(0, 2).join('/');
    const b = (folders[k] ??= { files: 0, bytes: 0 });
    b.files++;
    b.bytes += f.bytes;
  }
  const js = files.filter((f) => f.kind === 'js').sort((a, b) => b.bytes - a.bytes);
  return { byKind: by, assetFolders: folders, js, total: files.reduce((s, f) => s + f.bytes, 0) };
}

/** Line ranges of each source module in an unminified bundle (rolldown //#region comments). */
function regionMap(dir) {
  const map = new Map();
  for (const f of walk(join(dir, 'build')).filter((p) => p.endsWith('.js'))) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const ranges = [];
    let cur = null;
    lines.forEach((l, i) => {
      if (l.startsWith('//#region ')) cur = { mod: l.slice(10).replace(/^\0/, ''), from: i, to: lines.length };
      else if (l.startsWith('//#endregion') && cur) {
        cur.to = i;
        ranges.push(cur);
        cur = null;
      } else if (cur && /^\* Copyright 2010-\d+ Three\.js Authors/.test(l) && !cur.mod.startsWith('node_modules/three')) {
        // Rolldown hoists three.core.js into the first module that imports three without a region
        // of its own: split it off.
        ranges.push({ ...cur, to: i - 3 });
        cur = { mod: 'node_modules/three/build/three.core.js', from: i - 2, to: lines.length, parentMod: cur.mod };
      }
    });
    map.set(f.split('/').pop(), ranges);
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Page instrumentation (runs before any page script)
// ---------------------------------------------------------------------------------------------

const INIT = String.raw`(() => {
  if (window.__perf) return;
  const P = (window.__perf = { rec: false, frames: [], longtasks: [], ctx: [], sub: {}, t0: performance.now() });
  // --- rAF: frame timestamps + JS time spent in rAF callbacks per frame ---
  const nraf = window.requestAnimationFrame.bind(window);
  let curTs = -1, curJs = 0, curN = 0;
  const close = () => { if (curTs >= 0 && P.rec) P.frames.push([curTs, curJs, curN]); };
  window.requestAnimationFrame = function (cb) {
    return nraf(function (ts) {
      if (ts !== curTs) { close(); curTs = ts; curJs = 0; curN = 0; }
      const t0 = performance.now();
      try { cb(ts); } finally { curJs += performance.now() - t0; curN++; }
    });
  };
  // A recorder of our own so every displayed frame is counted even if the app skips one.
  const tick = () => { window.requestAnimationFrame(tick); };
  window.requestAnimationFrame(tick);
  // --- long tasks ---
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
  } catch {}
  // --- WebGL ---
  const TIMED_SHADER = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog', 'validateProgram'];
  const TIMED_UPLOAD = ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'bufferData', 'bufferSubData', 'generateMipmap'];
  const SYNC = ['getError', 'readPixels', 'finish', 'clientWaitSync', 'getBufferSubData'];
  const LIVE = { Texture: 'textures', Buffer: 'buffers', Program: 'programs', Framebuffer: 'framebuffers', Renderbuffer: 'renderbuffers', VertexArray: 'vaos', Shader: 'shaders' };
  function wrapGL(gl, canvas) {
    if (gl.__perf) return;
    const s = { id: P.ctx.length, created: performance.now(), canvas: canvas.width + 'x' + canvas.height, draws: 0, tris: 0, instances: 0, links: 0, compiles: 0, shaderMs: 0, uploadMs: 0, uploadBytes: 0, sync: 0, syncMs: 0, firstDraw: -1, live: {}, uploadHist: {} };
    for (const k of Object.values(LIVE)) s.live[k] = 0;
    gl.__perf = s;
    P.ctx.push(s);
    const TRI = gl.TRIANGLES, STRIP = gl.TRIANGLE_STRIP;
    const tri = (mode, count, inst) => { s.draws++; if (s.firstDraw < 0) s.firstDraw = performance.now(); s.instances += inst; if (mode === TRI) s.tris += (count / 3) * inst; else if (mode === STRIP) s.tris += Math.max(0, count - 2) * inst; };
    const de = gl.drawElements, da = gl.drawArrays, dei = gl.drawElementsInstanced, dai = gl.drawArraysInstanced;
    gl.drawElements = function (m, c, t, o) { tri(m, c, 1); return de.call(this, m, c, t, o); };
    gl.drawArrays = function (m, f, c) { tri(m, c, 1); return da.call(this, m, f, c); };
    if (dei) gl.drawElementsInstanced = function (m, c, t, o, n) { tri(m, c, n); return dei.call(this, m, c, t, o, n); };
    if (dai) gl.drawArraysInstanced = function (m, f, c, n) { tri(m, c, n); return dai.call(this, m, f, c, n); };
    for (const name of TIMED_SHADER) {
      const f = gl[name]; if (!f) continue;
      gl[name] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { s.shaderMs += performance.now() - t; if (name === 'linkProgram') s.links++; if (name === 'compileShader') s.compiles++; } };
    }
    for (const name of TIMED_UPLOAD) {
      const f = gl[name]; if (!f) continue;
      gl[name] = function () {
        const t = performance.now();
        try { return f.apply(this, arguments); } finally {
          s.uploadMs += performance.now() - t;
          for (const a of arguments) {
            if (a && typeof a === 'object') {
              const b = typeof a.byteLength === 'number' ? a.byteLength : a.width && a.height ? a.width * a.height * 4 : 0;
              s.uploadBytes += b;
              // While recording: which upload sizes repeat every frame (dynamic buffers re-sent whole).
              if (P.rec) { const k = name + ':' + b; s.uploadHist[k] = (s.uploadHist[k] || 0) + 1; }
              break;
            }
          }
        }
      };
    }
    for (const name of SYNC) {
      const f = gl[name]; if (!f) continue;
      gl[name] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { s.sync++; s.syncMs += performance.now() - t; } };
    }
    for (const [k, key] of Object.entries(LIVE)) {
      const c = gl['create' + k], d = gl['delete' + k];
      if (c) gl['create' + k] = function () { const o = c.apply(this, arguments); if (o) s.live[key]++; return o; };
      if (d) gl['delete' + k] = function (o) { if (o) s.live[key]--; return d.apply(this, arguments); };
    }
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const c = gc.call(this, type, attrs);
    if (c && /webgl/.test(String(type))) wrapGL(c, this);
    return c;
  };
  // --- heist subsystem timers (installed on demand once the heist renderer exists) ---
  P.probe = function () {
    const app = window.__heist && window.__heist.app;
    if (!app) return false;
    const T = P.sub;
    const wrap = (obj, name, label) => {
      if (!obj) return;
      const f = obj[name];
      if (typeof f !== 'function' || f.__p) return;
      const w = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { const d = performance.now() - t; const e = T[label] || (T[label] = { ms: 0, n: 0 }); if (P.rec) { e.ms += d; e.n++; } } };
      w.__p = 1;
      obj[name] = w;
    };
    const proto = (o) => (o ? Object.getPrototypeOf(o) : null);
    const r = app.renderer;
    if (r) {
      wrap(proto(r), 'update', 'renderer.update (all render JS)');
      wrap(proto(r), 'draw', 'renderer.draw (three + post)');
      wrap(r.webgl, 'render', 'three WebGLRenderer.render (per pass)');
      wrap(proto(r.post), 'render', 'post.render (bloom + grade)');
      wrap(proto(r.cones), 'update', 'cones.update (vision fans)');
      wrap(proto(r.level), 'update', 'level.update (props)');
      for (const c of r.cats || []) wrap(proto(c), 'update', 'cat views update');
      for (const g of (r.guards ? r.guards.values() : [])) wrap(proto(g), 'update', 'guard views update');
      wrap(proto(r.particles), 'update', 'particles.update');
      wrap(proto(r.backdrop), 'update', 'backdrop.update');
      wrap(proto(r.waves), 'update', 'meow waves update');
      wrap(proto(r.iso), 'update', 'camera.update');
    }
    const s = app.getSession && app.getSession();
    if (s) wrap(proto(s), 'advance', 'session.advance (sim ticks)');
    if (app.ui) wrap(app.ui, 'updateHUD', 'ui.updateHUD');
    return true;
  };
  P.snap = function () {
    return P.ctx.map((s) => ({ id: s.id, draws: s.draws, tris: s.tris, links: s.links, compiles: s.compiles, shaderMs: s.shaderMs, uploadMs: s.uploadMs, uploadBytes: s.uploadBytes, sync: s.sync, syncMs: s.syncMs, firstDraw: s.firstDraw, live: Object.assign({}, s.live), canvas: s.canvas }));
  };
})();`;

// ---------------------------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------------------------

function browserArgs(gpu) {
  if (gpu === 'metal') return ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'];
  return ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
}

function chromiumPath() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const c = [
    join(cache, 'chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    join(cache, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  ];
  return process.env.PW_CHROMIUM ?? c.find((p) => existsSync(p));
}

async function newPage(browser, vp, { init = true } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[vp], reducedMotion: 'no-preference' });
  if (init) await context.addInitScript(INIT);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, errors };
}

async function waitReady(page, timeout = 120_000) {
  return page.waitForFunction(() => !!window.__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout, polling: 'raf' });
}

async function heapMB(cdp, gc = false) {
  if (gc) await cdp.send('HeapProfiler.collectGarbage');
  const h = await cdp.send('Runtime.getHeapUsage');
  return +(h.usedSize / 1048576).toFixed(2);
}

const solution = (id) => JSON.parse(readFileSync(join(pkg, 'src/levels', `${id}.solution.json`), 'utf8'));

/** Open a scene and leave it running live. Returns once it is on screen and settled. */
async function openScene(page, url, scene, quality) {
  const q = `?qa=1&quality=${quality}`;
  if (scene === 'yard') {
    await page.goto(`${url}/${q}&screen=yard`);
    await waitReady(page);
    await page.evaluate(() => window.__heist.yardReady());
    await page.waitForFunction(() => (window.__heist.yardStats()?.pendingFrames ?? 1) === 0, null, { timeout: 180_000, polling: 500 });
    return;
  }
  await page.goto(`${url}/${q}`);
  await waitReady(page);
  if (scene === 'title') return;
  const sol = solution(scene);
  await page.evaluate(async ({ sol }) => {
    await window.__heist.loadReplay(sol, { speed: 1 });
    // Mid-level: guards on their beats, doors / plates in play, a few coins taken.
    window.__heist.step(Math.floor(sol.ticks * 0.35));
  }, { sol });
}

/** Keep a heist replay looping (restart when it reaches Results) for long windows. */
async function keepLooping(page, scene) {
  if (!scene.startsWith('heist')) return;
  const sol = solution(scene);
  await page.evaluate((sol) => {
    const P = window.__perf;
    clearInterval(P.loop);
    P.loop = setInterval(() => {
      const s = window.__heist.screen();
      if (s === 'results') window.__heist.loadReplay(sol, { speed: 1 }).then(() => P.probe());
    }, 250);
  }, sol);
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function r1(x) {
  return Math.round(x * 10) / 10;
}
function r2(x) {
  return Math.round(x * 100) / 100;
}

/** Measure a live window of `seconds` on an already-open scene. */
async function measureWindow(page, cdp, seconds, { scene, trace = false, profile = false } = {}) {
  await page.evaluate(() => window.__perf.probe());
  const heap0 = await heapMB(cdp);
  let traceEvents = null;
  if (trace) {
    traceEvents = [];
    cdp.on('Tracing.dataCollected', (e) => traceEvents.push(...e.value.filter((v) => /GC|Scavenge|MarkCompact/i.test(v.name) && v.ph === 'X')));
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  }
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  }
  const snap0 = await page.evaluate(() => {
    const P = window.__perf;
    P.frames.length = 0;
    for (const k of Object.keys(P.sub)) delete P.sub[k];
    for (const c of P.ctx) c.uploadHist = {};
    P.rec = true;
    P.w0 = performance.now();
    P.lt0 = P.longtasks.length;
    return P.snap();
  });
  const heapSamples = [];
  const tEnd = Date.now() + seconds * 1000;
  while (Date.now() < tEnd) {
    await sleep(Math.min(5000, Math.max(0, tEnd - Date.now())));
    heapSamples.push(await heapMB(cdp));
  }
  const res = await page.evaluate(() => {
    const P = window.__perf;
    P.rec = false;
    const w = performance.now() - P.w0;
    const h = window.__heist;
    const st = h.stats();
    const app = h.app;
    const info = app.renderer?.webgl?.info;
    const ys = h.yardStats();
    return {
      windowMs: w,
      frames: P.frames.slice(),
      longtasks: P.longtasks.slice(P.lt0),
      sub: JSON.parse(JSON.stringify(P.sub)),
      snap: P.snap(),
      uploadHist: P.ctx.map((c) => c.uploadHist),
      stats: st,
      yard: ys,
      memory: info && (st.screen === 'heist' || st.screen === 'results') ? { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 } : null,
      tick: h.getState()?.tick ?? null,
      screen: h.screen(),
    };
  });
  let profileData = null;
  let allocData = null;
  if (profile) {
    profileData = (await cdp.send('Profiler.stop')).profile;
    await cdp.send('Profiler.disable');
    allocData = (await cdp.send('HeapProfiler.stopSampling')).profile;
  }
  let gc = null;
  if (trace) {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end');
    await done;
    // Top-level GC pauses on the renderer main thread (MinorGC / MajorGC timeline events).
    const pauses = traceEvents.filter((e) => e.name === 'MinorGC' || e.name === 'MajorGC').map((e) => ({ name: e.name, ms: e.dur / 1000 }));
    const ms = pauses.map((p) => p.ms).sort((a, b) => a - b);
    // p95 over all pauses lands on a major GC once there are fewer than ~40 pauses in the window
    // (two majors are 5% of 40), so minor pauses get their own p95 / max as well.
    const minorMs = pauses.filter((p) => p.name === 'MinorGC').map((p) => p.ms).sort((a, b) => a - b);
    gc = {
      count: pauses.length,
      minor: pauses.filter((p) => p.name === 'MinorGC').length,
      major: pauses.filter((p) => p.name === 'MajorGC').length,
      totalMs: r1(ms.reduce((a, b) => a + b, 0)),
      p95Ms: r2(pct(ms, 95)),
      maxMs: r2(ms[ms.length - 1] ?? 0),
      minorP95Ms: r2(pct(minorMs, 95)),
      minorMaxMs: r2(minorMs[minorMs.length - 1] ?? 0),
      perMinute: r1((pauses.length / res.windowMs) * 60000),
    };
  }
  const heap1 = await heapMB(cdp);

  // Frames: [ts, jsMs, callbacks]. Interval = ts delta.
  const fr = res.frames;
  const iv = [];
  for (let i = 1; i < fr.length; i++) iv.push(fr[i][0] - fr[i - 1][0]);
  const js = fr.slice(1).map((f) => f[1]);
  const ivs = [...iv].sort((a, b) => a - b);
  const jss = [...js].sort((a, b) => a - b);
  const n = Math.max(1, iv.length);
  // Per-frame averages of counters use the frames recorded in the window.
  const nF = Math.max(1, fr.length);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const frameMs = sum(iv) / n;
  const jsMs = sum(js) / n;
  // GL deltas over the window, per context; the busiest context is the scene's.
  const d = res.snap.map((s) => {
    const a = snap0.find((x) => x.id === s.id) ?? { draws: 0, tris: 0, links: 0, compiles: 0, shaderMs: 0, uploadMs: 0, uploadBytes: 0, sync: 0, syncMs: 0 };
    return { id: s.id, draws: s.draws - a.draws, tris: s.tris - a.tris, links: s.links - a.links, shaderMs: s.shaderMs - a.shaderMs, uploadMs: s.uploadMs - a.uploadMs, uploadBytes: s.uploadBytes - a.uploadBytes, sync: s.sync - a.sync, syncMs: s.syncMs - a.syncMs, live: s.live };
  });
  const main = d.reduce((a, b) => (b.draws > (a?.draws ?? -1) ? b : a), null);
  const lt = res.longtasks;
  const sub = {};
  for (const [k, v] of Object.entries(res.sub)) sub[k] = { msPerFrame: r2(v.ms / nF), calls: v.n };
  return {
    windowS: r1(res.windowMs / 1000),
    frames: iv.length,
    fps: r1(1000 / Math.max(1e-6, frameMs)),
    frameMs: { mean: r2(frameMs), p50: r2(pct(ivs, 50)), p95: r2(pct(ivs, 95)), p99: r2(pct(ivs, 99)), max: r2(ivs[ivs.length - 1] ?? 0) },
    jsMs: { mean: r2(jsMs), p50: r2(pct(jss, 50)), p95: r2(pct(jss, 95)), p99: r2(pct(jss, 99)) },
    // What the frame costs beyond JS in rAF: GPU (SwiftShader runs it on the CPU), compositing, idle.
    nonJsMs: r2(Math.max(0, frameMs - jsMs)),
    longTasks: { count: lt.length, totalMs: r1(sum(lt.map((l) => l[1]))), blockingMs: r1(sum(lt.map((l) => Math.max(0, l[1] - 50)))), maxMs: r1(Math.max(0, ...lt.map((l) => l[1]))) },
    drawCalls: main ? r1(main.draws / nF) : 0,
    triangles: main ? Math.round(main.tris / nF) : 0,
    renderer: { calls: res.stats.calls, triangles: res.stats.triangles, quality: res.stats.quality, screen: res.screen },
    memory: res.memory,
    gl: main ? { live: main.live, contexts: d.length, perContext: d.map((x) => ({ id: x.id, drawsPerFrame: r1(x.draws / nF), ...x.live })), linksInWindow: d.reduce((a, b) => a + b.links, 0), shaderMsInWindow: r1(d.reduce((a, b) => a + b.shaderMs, 0)), uploadMsPerFrame: r2(main.uploadMs / nF), uploadKBPerFrame: r1(main.uploadBytes / nF / 1024), syncCallsPerFrame: r1(main.sync / nF), topUploads: Object.entries(res.uploadHist[main.id] ?? {}).map(([k, c]) => { const [fn, b] = k.split(':'); return { fn, bytes: Number(b), perFrame: r2(c / nF), kBPerFrame: r1((Number(b) * c) / nF / 1024) }; }).sort((a, b) => b.kBPerFrame - a.kBPerFrame).slice(0, 8) } : null,
    heapMB: { start: heap0, end: heap1, peak: Math.max(heap0, heap1, ...heapSamples), samples: heapSamples },
    gc,
    sub,
    yard: res.yard,
    tickEnd: res.tick,
    _profile: profileData,
    _alloc: allocData,
  };
}

// ---------------------------------------------------------------------------------------------
// CPU profile analysis
// ---------------------------------------------------------------------------------------------

function analyseProfile(profile, regions, top = 25) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const regionOf = (cf) => {
    const rs = regions.get(cf.url.split('/').pop().split('?')[0]);
    if (rs) for (const r of rs) if (cf.lineNumber >= r.from && cf.lineNumber <= r.to) return r;
    return null;
  };
  const modOf = (cf) => {
    if (!cf.url) return cf.functionName.startsWith('(') ? cf.functionName : '(native)';
    return regionOf(cf)?.mod ?? cf.url.split('/').pop().split('?')[0];
  };
  // "~L" = line inside the module in the unminified bundle (types stripped, so close to the source).
  const lineOf = (cf) => {
    const r = cf.url ? regionOf(cf) : null;
    return r ? ` ~L${cf.lineNumber - r.from}` : '';
  };
  const self = new Map();
  const incl = new Map();
  const modSelf = new Map();
  const modIncl = new Map();
  const callers = new Map();
  let total = 0;
  const dts = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (dts[i + 1] ?? dts[i] ?? 0) / 1000;
    total += dt;
    let id = profile.samples[i];
    const n0 = byId.get(id);
    const key = (n) => `${n.callFrame.functionName || '(anonymous)'} @ ${modOf(n.callFrame)}${lineOf(n.callFrame)}`;
    // Callers of each self-time function (first non-native parent), to explain the hot leaves.
    {
      let pid = parent.get(id);
      while (pid !== undefined && !byId.get(pid).callFrame.url && byId.get(pid).callFrame.functionName !== '(root)') pid = parent.get(pid);
      if (pid !== undefined) {
        const k0 = key(n0);
        const pk = key(byId.get(pid));
        const m = callers.get(k0) ?? new Map();
        m.set(pk, (m.get(pk) ?? 0) + dt);
        callers.set(k0, m);
      }
    }
    self.set(key(n0), (self.get(key(n0)) ?? 0) + dt);
    modSelf.set(modOf(n0.callFrame), (modSelf.get(modOf(n0.callFrame)) ?? 0) + dt);
    const seenF = new Set();
    const seenM = new Set();
    while (id !== undefined) {
      const n = byId.get(id);
      const k = key(n);
      if (!seenF.has(k)) {
        seenF.add(k);
        incl.set(k, (incl.get(k) ?? 0) + dt);
      }
      const m = modOf(n.callFrame);
      if (!seenM.has(m)) {
        seenM.add(m);
        modIncl.set(m, (modIncl.get(m) ?? 0) + dt);
      }
      id = parent.get(id);
    }
  }
  const idle = (self.get('(idle) @ (idle)') ?? 0);
  const busy = Math.max(1e-6, total - idle);
  const rows = (m, skip) => [...m.entries()].filter(([k]) => !skip(k)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ name: k, ms: r1(v), pctBusy: r1((v / busy) * 100) }));
  const special = (k) => /^\((root|idle|program)\)/.test(k);
  return {
    totalMs: r1(total),
    busyMs: r1(busy),
    idleMs: r1(idle),
    gcMs: r1(self.get('(garbage collector) @ (garbage collector)') ?? 0),
    programMs: r1(self.get('(program) @ (program)') ?? 0),
    selfTop: rows(self, (k) => special(k)).map((r) => ({ ...r, callers: [...(callers.get(r.name) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${r1(v)} ms)`) })),
    inclusiveTop: rows(incl, special),
    modulesSelf: rows(modSelf, (k) => /^\((root|idle)\)/.test(k)),
    modulesInclusive: rows(modIncl, (k) => /^\((root|idle|program)\)/.test(k)),
  };
}

/** Sampling heap profile (objects collected by GC included) -> allocation rate by function. */
function analyseAlloc(profile, regions, windowMs, top = 15) {
  if (!profile) return null;
  const modOf = (cf) => {
    if (!cf.url) return '(native)';
    const rs = regions?.get(cf.url.split('/').pop().split('?')[0]);
    if (!rs) return cf.url.split('/').pop();
    for (const r of rs) if (cf.lineNumber >= r.from && cf.lineNumber <= r.to) return r.mod;
    return '?';
  };
  const self = new Map();
  const mods = new Map();
  let total = 0;
  const visit = (n) => {
    const cf = n.callFrame;
    const k = `${cf.functionName || '(anonymous)'} @ ${modOf(cf)}`;
    self.set(k, (self.get(k) ?? 0) + n.selfSize);
    mods.set(modOf(cf), (mods.get(modOf(cf)) ?? 0) + n.selfSize);
    total += n.selfSize;
    for (const c of n.children ?? []) visit(c);
  };
  visit(profile.head);
  const perS = (b) => r2(b / 1048576 / (windowMs / 1000));
  const rows = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => ({ name: k, MBperS: perS(v), pct: r1((v / Math.max(1, total)) * 100) }));
  return { totalMBperS: perS(total), top: rows(self), modules: rows(mods) };
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

async function measureLoad(browser, url, vp, throttle, quality, { profile = false, regions = null } = {}) {
  const { context, page, cdp, errors } = await newPage(browser, vp);
  const reqs = [];
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const types = new Map();
  cdp.on('Network.requestWillBeSent', (e) => types.set(e.requestId, { type: e.type, url: e.request.url }));
  cdp.on('Network.loadingFinished', (e) => reqs.push({ ...(types.get(e.requestId) ?? {}), bytes: e.encodedDataLength, at: e.timestamp }));
  // Same-origin page first so the profiler / throttling survive the navigation into the app. It is
  // a tiny routed page, not a real file: the old start page (/assets/manifest.json) made Chromium
  // lay out and, on SwiftShader, software-raster the JSON as text, which kept the renderer busy
  // into the measured navigation. Once the manifest was minified to one 54 kB line that cost
  // about 70 ms more (4x) and showed up as a later DOMContentLoaded and title (2026-09-30).
  const blank = `${url}/__perf-blank`;
  await page.route(blank, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' }));
  await page.goto(blank);
  await page.unroute(blank);
  reqs.length = 0;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
  }
  const wall0 = Date.now();
  await page.goto(`${url}/?qa=1&quality=${quality}`, { waitUntil: 'commit' });
  const readyH = await page.waitForFunction(() => {
    const ok = !!window.__heist && document.getElementById('app')?.dataset.ready === '1' && [...document.querySelectorAll('button')].some((b) => /^\s*Play\s*$/.test(b.textContent || '') && b.offsetParent !== null);
    return ok ? performance.now() : false;
  }, null, { timeout: 180_000, polling: 'raf' });
  const titleInteractive = await readyH.jsonValue();
  const reqTitle = reqs.length;
  const bytesTitle = reqs.reduce((a, r) => a + r.bytes, 0);
  // Title diorama: first frame drawn by its GL context, and its settle.
  const titleInfo = await page.evaluate(() => {
    const P = window.__perf;
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
    return {
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      loadEvent: nav?.loadEventEnd ?? null,
      fcp: paint['first-contentful-paint'] ?? null,
      dioramaFirstDraw: P.ctx[0]?.firstDraw ?? null,
      snap: P.snap(),
      longtasks: P.longtasks.slice(),
    };
  });
  // Wait until the diorama has drawn at least once (it may lag the Play button).
  await page.waitForFunction(() => window.__perf.ctx.some((c) => c.firstDraw > 0), null, { timeout: 60_000, polling: 100 }).catch(() => null);
  const dioramaFirstDraw = await page.evaluate(() => Math.min(...window.__perf.ctx.filter((c) => c.firstDraw > 0).map((c) => c.firstDraw)));
  const heapTitle = await heapMB(cdp, true);
  // First heist (cold: renderer, level geometry, cat + guard sheets, shader compile).
  const heist = await page.evaluate(async () => {
    const P = window.__perf;
    const s0 = P.snap();
    const lt0 = P.longtasks.length;
    const t0 = performance.now();
    await window.__heist.start(undefined, 'heist-01');
    const t1 = performance.now();
    // The first real frame is drawn inside start(); wait for one more displayed frame too.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const t2 = performance.now();
    return { ms: t1 - t0, nextFrameMs: t2 - t0, s0, s1: P.snap(), lt: P.longtasks.slice(lt0) };
  });
  const reqHeist = reqs.length - reqTitle;
  const bytesHeist = reqs.reduce((a, r) => a + r.bytes, 0) - bytesTitle;
  // Second, warm heist start (renderer + programs reused, new level + guard sheets).
  const heist2 = await page.evaluate(async () => {
    const P = window.__perf;
    const s0 = P.snap();
    const t0 = performance.now();
    await window.__heist.start(undefined, 'heist-08');
    return { ms: performance.now() - t0, s0, s1: P.snap() };
  });
  const heapHeist = await heapMB(cdp, true);
  let prof = null;
  if (profile) {
    const raw = (await cdp.send('Profiler.stop')).profile;
    mkdirSync(join(here, 'out/profiles'), { recursive: true });
    writeFileSync(join(here, `out/profiles/load-${vp}-${throttle}x-${quality}.cpuprofile`), JSON.stringify(raw));
    prof = analyseProfile(raw, regions, 30);
    await cdp.send('Profiler.disable');
  }
  // Cat Yard from the title, cold (58 sheets voxelised, time-sliced).
  await page.evaluate(() => window.__heist.app.toMenu(true));
  const yard = await page.evaluate(async () => {
    const P = window.__perf;
    const s0 = P.snap();
    const lt0 = P.longtasks.length;
    const t0 = performance.now();
    window.__heist.app.openYard();
    await window.__heist.yardReady();
    const tReady = performance.now() - t0;
    while ((window.__heist.yardStats()?.pendingFrames ?? 1) > 0) await new Promise((r) => setTimeout(r, 50));
    return { readyMs: tReady, allFramesMs: performance.now() - t0, s0, s1: P.snap(), lt: P.longtasks.slice(lt0) };
  });
  const heapYard = await heapMB(cdp, true);
  const glDelta = (a, b) => {
    const o = { links: 0, shaderMs: 0, uploadMs: 0, uploadMB: 0, contexts: b.length };
    for (const s of b) {
      const p = a.find((x) => x.id === s.id);
      o.links += s.links - (p?.links ?? 0);
      o.shaderMs += s.shaderMs - (p?.shaderMs ?? 0);
      o.uploadMs += s.uploadMs - (p?.uploadMs ?? 0);
      o.uploadMB += (s.uploadBytes - (p?.uploadBytes ?? 0)) / 1048576;
    }
    return { links: o.links, shaderMs: r1(o.shaderMs), uploadMs: r1(o.uploadMs), uploadMB: r2(o.uploadMB), contexts: o.contexts };
  };
  const ltSum = (lt) => ({ count: lt.length, totalMs: r1(lt.reduce((a, l) => a + l[1], 0)), blockingMs: r1(lt.reduce((a, l) => a + Math.max(0, l[1] - 50), 0)), maxMs: r1(Math.max(0, ...lt.map((l) => l[1]))) });
  const byType = {};
  for (const r of reqs) {
    const t = (byType[r.type ?? 'Other'] ??= { n: 0, kB: 0 });
    t.n++;
    t.kB = r1(t.kB + r.bytes / 1024);
  }
  await context.close();
  return {
    viewport: vp,
    throttle,
    quality,
    wallS: r1((Date.now() - wall0) / 1000),
    fcpMs: r1(titleInfo.fcp ?? 0),
    domContentLoadedMs: r1(titleInfo.domContentLoaded ?? 0),
    titleInteractiveMs: r1(titleInteractive),
    dioramaFirstDrawMs: r1(dioramaFirstDraw),
    titleRequests: reqTitle,
    titleKB: r1(bytesTitle / 1024),
    titleGL: glDelta([], titleInfo.snap),
    titleLongTasks: ltSum(titleInfo.longtasks),
    heapTitleMB: heapTitle,
    firstHeistMs: r1(heist.ms),
    firstHeistNextFrameMs: r1(heist.nextFrameMs),
    firstHeistRequests: reqHeist,
    firstHeistKB: r1(bytesHeist / 1024),
    firstHeistGL: glDelta(heist.s0, heist.s1),
    firstHeistLongTasks: ltSum(heist.lt),
    secondHeistMs: r1(heist2.ms),
    secondHeistGL: glDelta(heist2.s0, heist2.s1),
    heapHeistMB: heapHeist,
    yardReadyMs: r1(yard.readyMs),
    yardAllFramesMs: r1(yard.allFramesMs),
    yardGL: glDelta(yard.s0, yard.s1),
    yardLongTasks: ltSum(yard.lt),
    heapYardMB: heapYard,
    requests: { total: reqs.length, kB: r1(reqs.reduce((a, r) => a + r.bytes, 0) / 1024), byType },
    errors,
    profile: prof,
  };
}

async function measureRuntime(browser, url, scene, vp, throttle, quality, { seconds, trace = false, profile = false, regions = null, loop = false, saveDir = null }) {
  const { context, page, cdp, errors } = await newPage(browser, vp);
  try {
    await openScene(page, url, scene, quality);
    if (loop) await keepLooping(page, scene);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await sleep(1500); // warm-up under throttle (first frames, any lazy work)
    const m = await measureWindow(page, cdp, seconds, { scene, trace, profile });
    const prof = m._profile ? analyseProfile(m._profile, regions, 20) : null;
    if (m._profile && saveDir) {
      const base = join(saveDir, `${scene}-${vp}-${throttle}x-${quality}`);
      writeFileSync(`${base}.cpuprofile`, JSON.stringify(m._profile));
      if (m._alloc) writeFileSync(`${base}.heapprofile`, JSON.stringify(m._alloc));
    }
    if (prof) prof.alloc = analyseAlloc(m._alloc, regions, m.windowS * 1000);
    delete m._profile;
    delete m._alloc;
    return { scene, viewport: vp, throttle, quality, ...m, profile: prof, errors };
  } catch (e) {
    return { scene, viewport: vp, throttle, quality, error: String(e).slice(0, 400), errors };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Reference screenshots (fake clock: frame timing is identical run to run)
// ---------------------------------------------------------------------------------------------

async function screenshots(browser, url, dir) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  const shoot = async (name, vp, fn) => {
    const t0 = Date.now();
    const context = await browser.newContext({ ...VIEWPORTS[vp], reducedMotion: 'no-preference' });
    const page = await context.newPage();
    // Fake clock from the first script on: rAF, timers and performance.now only move when we say,
    // so every capture has seen the same number of 16 ms frames once it is loaded.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    // Seeded Math.random (particles, sparkles) so captures repeat.
    await context.addInitScript(() => {
      let s = 0x2f6b1d3;
      Math.random = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0), ((s >>> 0) % 1e9) / 1e9);
    });
    const until = async (pred, arg, max = 2000, frames = 1) => {
      for (let i = 0; i < max; i++) {
        if (await page.evaluate(pred, arg).catch(() => false)) return;
        // Loading is real I/O: give it real time, and let only a few frames run per poll.
        await sleep(40);
        await page.clock.runFor(17 * frames);
      }
      throw new Error(`${name}: condition not met`);
    };
    // One frame at a time, with real time in between, so the GPU never falls a long queue behind.
    const settle = async (ms) => {
      for (let t = 0; t < ms; t += 17) {
        await page.clock.runFor(17);
        await sleep(cfg.gpu === 'metal' ? 5 : 60);
      }
    };
    try {
      await fn(page, until, settle);
      const path = join(dir, `${name}.png`);
      await page.screenshot({ path, timeout: 180_000, animations: 'disabled', caret: 'hide' });
      out.push({ name, path: relative(pkg, path), s: r1((Date.now() - t0) / 1000) });
      log(`screen ${name} ${r1((Date.now() - t0) / 1000)} s`);
    } finally {
      await context.close();
    }
  };
  const ready = () => !!window.__heist && document.getElementById('app')?.dataset.ready === '1';
  const q = '?qa=1&quality=high&seed=1';
  const heistAt = (level, frac) => async (page, until, settle) => {
    await page.goto(`${url}/${q}`);
    await until(ready);
    const sol = solution(level);
    await page.evaluate((sol) => {
      window.__heist.freeze(true);
      window.__heist.loadReplay(sol, { speed: 1 }).then(() => (window.__perfLoaded = true));
    }, sol);
    await until(() => window.__perfLoaded === true);
    await page.evaluate(({ n }) => {
      window.__heist.freeze(true);
      window.__heist.step(n);
      // Loading took a variable number of frames: restart the renderer's animation clock.
      const r = window.__heist.app.renderer;
      if (r) {
        r.time = 0;
        r.lastNow = 0;
      }
    }, { n: Math.floor(sol.ticks * frac) });
    await settle(500);
  };
  await shoot('title', 'desktop', async (page, until, settle) => {
    await page.goto(`${url}/${q}`);
    await until(ready);
    await settle(1000);
  });
  await shoot('heist-01-start', 'desktop', heistAt('heist-01', 0));
  await shoot('heist-01-start-phone', 'phone', heistAt('heist-01', 0));
  await shoot('heist-05-mid', 'desktop', heistAt('heist-05', 0.5));
  await shoot('results', 'desktop', async (page, until, settle) => {
    await heistAt('heist-01', 0)(page, until, async () => {});
    await page.evaluate(() => window.__heist.step(100000));
    await settle(1800);
    await until(() => window.__heist.screen() === 'results');
    await settle(700);
  });
  await shoot('yard', 'desktop', async (page, until, settle) => {
    await page.goto(`${url}/${q}&screen=yard`);
    await until(ready);
    await until(() => (window.__heist.yardStats()?.pendingFrames ?? 1) === 0, undefined, 3000, 6);
    await settle(1000);
  });
  return out;
}

/** Per-image difference against perf/ref (sharp): mean abs channel diff and share of changed pixels. */
async function compareScreens(dir, refDir) {
  const sharp = (await import('sharp')).default;
  const res = [];
  for (const f of readdirSync(refDir).filter((f) => f.endsWith('.png'))) {
    const b = join(dir, f);
    if (!existsSync(b)) {
      res.push({ name: f, missing: true });
      continue;
    }
    const [A, B] = await Promise.all([join(refDir, f), b].map((p) => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
    if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
      res.push({ name: f, sizeMismatch: true });
      continue;
    }
    let sum = 0;
    let changed = 0;
    const px = A.info.width * A.info.height;
    for (let i = 0; i < A.data.length; i += 3) {
      const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
      sum += d;
      if (d > 48) changed++;
    }
    res.push({ name: f, meanAbsDiff: r2(sum / (px * 3)), changedPct: r2((changed / px) * 100) });
  }
  return res;
}

// ---------------------------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------------------------

function toMarkdown(R) {
  const L = [];
  const t = (head, rows) => {
    L.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`);
    for (const r of rows) L.push(`| ${r.join(' | ')} |`);
    L.push('');
  };
  L.push(`Run: ${R.meta.date}, ${R.meta.gpuRenderer}, Chromium ${R.meta.chrome}, host ${R.meta.host}.`, '');
  if (R.bundle) {
    L.push('### Bundle', '');
    t(['Kind', 'Files', 'Bytes', 'Gzip'], Object.entries(R.bundle.byKind).map(([k, v]) => [k, v.files, `${r1(v.bytes / 1024)} kB`, `${r1(v.gzip / 1024)} kB`]));
    t(['Asset folder', 'Files', 'Bytes'], Object.entries(R.bundle.assetFolders).map(([k, v]) => [k, v.files, `${r1(v.bytes / 1024)} kB`]));
  }
  if (R.load?.length) {
    L.push('### Load', '');
    t(
      ['Viewport', 'CPU', 'Tier', 'FCP', 'Title interactive', 'Diorama 1st frame', 'Title req / kB', 'Title shader ms (links)', 'Title TBT', 'First heist', 'Heist req / kB', 'Heist shader ms (links)', 'Heist TBT', '2nd heist', 'Yard ready / all sheets', 'Yard TBT', 'Heap title / heist / yard MB'],
      R.load.map((l) => [l.viewport, `${l.throttle}x`, l.quality, l.fcpMs ? `${l.fcpMs} ms` : 'n/a', `${l.titleInteractiveMs} ms`, `${l.dioramaFirstDrawMs} ms`, `${l.titleRequests} / ${l.titleKB}`, `${l.titleGL.shaderMs} (${l.titleGL.links})`, `${l.titleLongTasks.blockingMs} ms`, `${l.firstHeistMs} ms`, `${l.firstHeistRequests} / ${l.firstHeistKB}`, `${l.firstHeistGL.shaderMs} (${l.firstHeistGL.links})`, `${l.firstHeistLongTasks.blockingMs} ms`, `${l.secondHeistMs} ms`, `${l.yardReadyMs} / ${l.yardAllFramesMs} ms`, `${l.yardLongTasks.blockingMs} ms`, `${l.heapTitleMB} / ${l.heapHeistMB} / ${l.heapYardMB}`]),
    );
  }
  if (R.runtime?.length) {
    L.push('### Runtime', '');
    t(
      ['Scene', 'Viewport', 'CPU', 'Tier', 'fps', 'p50 / p95 / p99 ms', 'JS/frame p50 / p95', 'non-JS ms', 'Long tasks (TBT)', 'Draws', 'Tris', 'Geo / Tex / Prog', 'Heap MB'],
      R.runtime.map((r) =>
        r.error
          ? [r.scene, r.viewport, `${r.throttle}x`, r.quality, 'ERROR', r.error.slice(0, 60), '', '', '', '', '', '', '']
          : [r.scene, r.viewport, `${r.throttle}x`, r.quality, r.fps, `${r.frameMs.p50} / ${r.frameMs.p95} / ${r.frameMs.p99}`, `${r.jsMs.p50} / ${r.jsMs.p95}`, r.nonJsMs, `${r.longTasks.count} (${r.longTasks.blockingMs} ms)`, r.drawCalls, r.triangles, r.memory ? `${r.memory.geometries} / ${r.memory.textures} / ${r.memory.programs}` : r.gl ? `buf ${r.gl.live.buffers} / tex ${r.gl.live.textures} / prog ${r.gl.live.programs}` : '', r.heapMB.end],
      ),
    );
    const subs = R.runtime.filter((r) => r.sub && Object.keys(r.sub).length);
    if (subs.length) {
      const keys = [...new Set(subs.flatMap((r) => Object.keys(r.sub)))];
      L.push('### Heist JS per frame by subsystem (ms)', '');
      t(['Scene', 'Viewport', 'CPU', 'Tier', ...keys], subs.map((r) => [r.scene, r.viewport, `${r.throttle}x`, r.quality, ...keys.map((k) => r.sub[k]?.msPerFrame ?? '')]));
    }
  }
  if (R.heap?.length) {
    L.push('### Heap and GC over a long window', '');
    t(
      ['Scene', 'Viewport', 'CPU', 'Tier', 'Window', 'fps', 'Heap start / end / peak MB', 'Retained growth (after GC)', 'GC pauses (minor / major)', 'GC total / p95 / max ms'],
      R.heap.map((h) => (h.error ? [h.scene, h.viewport, `${h.throttle}x`, h.quality, 'ERROR', h.error.slice(0, 60), '', '', '', ''] : [h.scene, h.viewport, `${h.throttle}x`, h.quality, `${h.windowS} s`, h.fps, `${h.heapMB.start} / ${h.heapMB.end} / ${h.heapMB.peak}`, `${h.retainedGrowthMB} MB`, h.gc ? `${h.gc.count} (${h.gc.minor} / ${h.gc.major})` : '', h.gc ? `${h.gc.totalMs} / ${h.gc.p95Ms} / ${h.gc.maxMs}` : ''])),
    );
  }
  const profs = [...(R.profile?.load ? [['load (title + heist-01 + heist-08)', R.profile.load]] : []), ...Object.entries(R.profile?.runtime ?? {})];
  for (const [name, p] of profs) {
    if (!p) continue;
    L.push(`### CPU profile: ${name}`, '', `busy ${p.busyMs} ms of ${p.totalMs} ms, GC ${p.gcMs} ms, (program) ${p.programMs} ms`, '');
    t(['Self (top 12)', 'ms', '% busy', 'Top caller'], p.selfTop.slice(0, 12).map((x) => [`\`${x.name}\``, x.ms, x.pctBusy, x.callers?.[0] ? `\`${x.callers[0]}\`` : '']));
    t(['Module inclusive (top 12)', 'ms', '% busy'], p.modulesInclusive.slice(0, 12).map((x) => [`\`${x.name}\``, x.ms, x.pctBusy]));
    if (p.alloc) {
      L.push(`Allocation: ${p.alloc.totalMBperS} MB/s sampled (including objects already collected).`, '');
      t(['Allocating function (top 8)', 'MB/s', '%'], p.alloc.top.slice(0, 8).map((x) => [`\`${x.name}\``, x.MBperS, x.pct]));
    }
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  const wantProf = cfg.only.has('profile');
  if (flag('build') || !existsSync(join(DIST, 'index.html'))) build(DIST, true);
  if (wantProf && (flag('build') || !existsSync(join(DIST_PROF, 'index.html')))) build(DIST_PROF, false);
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: browserArgs(cfg.gpu), headless: true });
  const server = await serve(DIST);
  const result = { meta: {}, bundle: bundleStats(DIST), load: [], runtime: [], heap: [], profile: null };
  try {
    {
      const p = await browser.newPage();
      await p.goto(server.url + '/assets/manifest.json');
      result.meta = await p.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const e = gl?.getExtension('WEBGL_debug_renderer_info');
        return { gpuRenderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown', ua: navigator.userAgent };
      });
      await p.close();
      const rev = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: pkg, encoding: 'utf8' }).stdout.trim();
      const dirty = spawnSync('git', ['status', '--porcelain', '--', 'src'], { cwd: pkg, encoding: 'utf8' }).stdout.trim() ? '+dirty src' : '';
      Object.assign(result.meta, { date: new Date().toISOString(), gpu: cfg.gpu, chrome: browser.version(), host: `${cpus()[0]?.model} x${cpus().length}, ${Math.round(totalmem() / 2 ** 30)} GB`, git: `${rev}${dirty}`, config: { ...cfg, only: [...cfg.only] } });
    }
    if (flag('screens') || flag('compare-screens')) {
      // --screens rewrites perf/ref; --compare-screens captures into perf/out/screens and diffs.
      const REF = join(here, 'ref');
      const dir = flag('screens') ? REF : join(here, 'out/screens');
      result.screens = await screenshots(browser, server.url, dir);
      if (flag('compare-screens')) result.screenDiff = await compareScreens(dir, REF);
      console.log(JSON.stringify({ screens: result.screens, diff: result.screenDiff }, null, 2));
      await browser.close();
      return;
    }
    if (cfg.only.has('load')) {
      for (const vp of cfg.viewports)
        for (const th of cfg.loadThrottle)
          for (const q of cfg.quality) {
            log(`load ${vp} ${th}x ${q}`);
            try {
              result.load.push(await measureLoad(browser, server.url, vp, th, q));
            } catch (e) {
              result.load.push({ viewport: vp, throttle: th, quality: q, error: String(e).slice(0, 400) });
            }
          }
    }
    if (cfg.only.has('runtime')) {
      for (const scene of cfg.scenes)
        for (const vp of cfg.viewports)
          for (const th of cfg.throttle)
            for (const q of cfg.quality) {
              log(`runtime ${scene} ${vp} ${th}x ${q}`);
              result.runtime.push(await measureRuntime(browser, server.url, scene, vp, th, q, { seconds: cfg.seconds }));
            }
    }
    if (cfg.only.has('heap')) {
      for (const spec of cfg.heap) {
        const [scene, vp, th, q] = spec.split(':');
        log(`heap ${spec} (${cfg.heapSeconds} s)`);
        const { context, page, cdp } = await newPage(browser, vp);
        try {
          await openScene(page, server.url, scene, q);
          await keepLooping(page, scene);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(th) });
          await sleep(1500);
          const g0 = await heapMB(cdp, true);
          const m = await measureWindow(page, cdp, cfg.heapSeconds, { scene, trace: true });
          delete m._profile;
          delete m._alloc;
          const g1 = await heapMB(cdp, true);
          result.heap.push({ scene, viewport: vp, throttle: Number(th), quality: q, ...m, heapAfterGC: { start: g0, end: g1 }, retainedGrowthMB: r2(g1 - g0) });
        } catch (e) {
          result.heap.push({ scene, viewport: vp, throttle: Number(th), quality: q, error: String(e).slice(0, 400) });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    server.close();
  }
  if (wantProf) {
    const regions = regionMap(DIST_PROF);
    // Raw profiles for DevTools (Performance / Memory panels): perf/out/profiles/*.cpuprofile|heapprofile.
    const saveDir = join(here, 'out/profiles');
    mkdirSync(saveDir, { recursive: true });
    const prof = await serve(DIST_PROF);
    try {
      result.profile = { load: null, runtime: {} };
      log('profile load desktop 4x high');
      const l = await measureLoad(browser, prof.url, 'desktop', 4, 'high', { profile: true, regions });
      result.profile.load = l.profile;
      result.profile.loadRun = { ...l, profile: undefined };
      for (const scene of cfg.scenes.filter((s) => ['title', 'heist-01', 'heist-05', 'heist-08', 'yard'].includes(s))) {
        for (const q of cfg.quality) {
          log(`profile runtime ${scene} desktop 4x ${q}`);
          const r = await measureRuntime(browser, prof.url, scene, 'desktop', 4, q, { seconds: Math.max(5, cfg.seconds), profile: true, regions, saveDir });
          result.profile.runtime[`${scene} desktop 4x ${q}`] = r.profile ?? { error: r.error };
          result.profile.runtime[`${scene} desktop 4x ${q}`].jsMs = r.jsMs;
          result.profile.runtime[`${scene} desktop 4x ${q}`].sub = r.sub;
        }
      }
    } finally {
      prof.close();
    }
  }
  await browser.close();
  const json = JSON.stringify(result, null, 1);
  if (cfg.out) {
    const file = cfg.out.startsWith('/') ? cfg.out : join(process.cwd(), cfg.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, json);
    log(`wrote ${cfg.out}`);
  }
  process.stdout.write(json + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Pawlegends iOS thermal harness (docs/plans/moba/PERF-IOS.md §1). Not part of the game bundle.
// 1. cd pawlegends && npx vite build --outDir /tmp/pl-perf && npx vite preview --outDir /tmp/pl-perf --host 127.0.0.1 --port 4471 --strictPort
// 2. node docs/plans/moba/benchmarks/perf-ios-measure.mjs <chromium|webkit> [query, e.g. quality=low] [label]
//    env: GPU=1 (Chromium on the real GPU), THROTTLE=4 (Chromium CPU slowdown, default 4), UNCAP=1 (no vsync),
//    MID_WAIT=60000 (ms between match windows). Writes $OUT_DIR/pl-perf-<label>.json (default /tmp).

import { createRequire } from 'node:module';
import fs from 'node:fs';
const req = createRequire(new URL('../../../../pawlegends/package.json', import.meta.url));
const pw = req('@playwright/test');

const BROWSER = process.argv[2] ?? 'chromium';
const QUERY = process.argv[3] ?? '';
const LABEL = process.argv[4] ?? BROWSER;
const THROTTLE = Number(process.env.THROTTLE ?? (BROWSER === 'chromium' ? 4 : 1));
const GPU = process.env.GPU === '1';
const BASE = `http://127.0.0.1:${process.env.PORT ?? 4471}/`;
const OUT = `${process.env.OUT_DIR ?? '/tmp'}/pl-perf-${LABEL}.json`;

const INSTR = () => {
  const S = (window.__perfS = {
    frames: 0, frameMs: [], rafCbs: 0, gl: { draws: 0, tris: 0, fbBinds: 0, texCreated: 0, texDeleted: 0, programs: 0, texUploads: 0, texUploadPx: 0, clears: 0, bufferUploads: 0 },
    c2d: new Map(), c2dCalls: 0, c2dShadowBlurSets: 0, mut: { html: 0, body: 0, nodesAdded: 0 }, audio: {}, timers: { setTimeout: 0, setInterval: 0, live: 0 },
    heap: { samples: 0, up: 0, drops: 0, last: 0, first: 0 }, longtasks: [], canvases: new Set(), t0: performance.now(),
  });
  const realRaf = window.requestAnimationFrame.bind(window);
  let frameStart = -1, frameJs = 0, lastTick = -1;
  window.requestAnimationFrame = (cb) => realRaf((t) => {
    if (t !== lastTick) { if (lastTick >= 0) { S.frameMs.push(frameJs); if (S.gl.draws > (S.drawsAtTick || 0)) { S.drawn = (S.drawn || 0) + 1; S.drawnJs = (S.drawnJs || 0) + frameJs; } } S.drawsAtTick = S.gl.draws; frameJs = 0; lastTick = t; S.frames++;
      const m = performance.memory; if (m) { const u = m.usedJSHeapSize; if (S.heap.last) { const d = u - S.heap.last; if (d > 0) S.heap.up += d; else if (d < -262144) S.heap.drops++; } else S.heap.first = u; S.heap.last = u; S.heap.samples++; } }
    S.rafCbs++;
    const a = performance.now();
    try { cb(t); } finally { frameJs += performance.now() - a; }
  });
  for (const Ctx of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Ctx) continue;
    const P = Ctx.prototype;
    const wrap = (name, fn) => { const o = P[name]; if (!o) return; P[name] = function (...a) { fn.call(this, a); return o.apply(this, a); }; };
    const tri = (mode, count, inst = 1) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? count - 2 : 0) * inst;
    wrap('drawElements', (a) => { S.gl.draws++; const t = tri(a[0], a[1]); S.gl.tris += t; if (S.fbOn) { S.gl.offDraws = (S.gl.offDraws||0)+1; S.gl.offTris = (S.gl.offTris||0)+t; } });
    // iteration 2 (PERF-IOS §8.1): non-indexed draws count toward the shadow pass too (the hero meshes are non-indexed)
    wrap('drawArrays', (a) => { S.gl.draws++; const t = tri(a[0], a[2]); S.gl.tris += t; if (S.fbOn) { S.gl.offDraws = (S.gl.offDraws||0)+1; S.gl.offTris = (S.gl.offTris||0)+t; } });
    wrap('drawElementsInstanced', (a) => { S.gl.draws++; const t = tri(a[0], a[1], a[4]); S.gl.tris += t; if (S.fbOn) { S.gl.offDraws = (S.gl.offDraws||0)+1; S.gl.offTris = (S.gl.offTris||0)+t; } });
    wrap('drawArraysInstanced', (a) => { S.gl.draws++; const t = tri(a[0], a[2], a[3]); S.gl.tris += t; if (S.fbOn) { S.gl.offDraws = (S.gl.offDraws||0)+1; S.gl.offTris = (S.gl.offTris||0)+t; } });
    wrap('bindFramebuffer', (a) => { S.fbOn = !!a[1]; if (a[1]) S.gl.fbBinds++; });
    wrap('createTexture', () => S.gl.texCreated++);
    wrap('deleteTexture', () => S.gl.texDeleted++);
    wrap('createProgram', () => S.gl.programs++);
    wrap('clear', () => S.gl.clears++);
    wrap('texImage2D', (a) => { S.gl.texUploads++; if (typeof a[3] === 'number' && typeof a[4] === 'number') S.gl.texUploadPx += a[3] * a[4]; else if (a[5] && a[5].width) S.gl.texUploadPx += a[5].width * a[5].height; });
    wrap('texSubImage2D', () => S.gl.texUploads++);
    wrap('bufferData', () => S.gl.bufferUploads++);
    wrap('bufferSubData', () => S.gl.bufferUploads++);
  }
  const oGet = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...r) { const c = oGet.call(this, type, ...r); if (c) { this.__ctxType = type; S.canvases.add(this); } return c; };
  const C2 = CanvasRenderingContext2D.prototype;
  const lab = (cv) => cv.__lab ??= (cv.id || cv.className || (cv.parentElement && (cv.parentElement.className || cv.parentElement.tagName)) || 'detached');
  for (const m of ['clearRect', 'fillRect', 'fillText', 'strokeText', 'drawImage', 'fill', 'stroke', 'arc', 'beginPath', 'save', 'restore', 'measureText', 'roundRect', 'createLinearGradient', 'createRadialGradient']) {
    const o = C2[m]; if (!o) continue;
    C2[m] = function (...a) { S.c2dCalls++; const _t0 = performance.now(); try { const cv = this.canvas; if (cv) { const k = lab(cv); let e = S.c2d.get(k); if (!e) S.c2d.set(k, (e = { clears: 0, calls: 0, w: 0, h: 0, inDom: false })); e.calls++; if (m === 'clearRect') e.clears++; e.w = cv.width; e.h = cv.height; } return o.apply(this, a); } finally { S.c2dMs = (S.c2dMs||0) + performance.now() - _t0; } };
  }
  const sb = Object.getOwnPropertyDescriptor(C2, 'shadowBlur');
  if (sb && sb.set) Object.defineProperty(C2, 'shadowBlur', { get: sb.get, set(v) { if (v > 0) S.c2dShadowBlurSets++; sb.set.call(this, v); }, configurable: true });
  const AC = window.BaseAudioContext || window.AudioContext || window.webkitAudioContext;
  if (AC) for (const m of Object.getOwnPropertyNames(AC.prototype)) if (m.startsWith('create') && typeof AC.prototype[m] === 'function') { const o = AC.prototype[m]; AC.prototype[m] = function (...a) { S.audio[m] = (S.audio[m] ?? 0) + 1; return o.apply(this, a); }; }
  const oST = window.setTimeout, oSI = window.setInterval;
  window.setTimeout = function (...a) { S.timers.setTimeout++; return oST.apply(this, a); };
  window.setInterval = function (...a) { S.timers.setInterval++; S.timers.live++; return oSI.apply(this, a); };
  const mo = new MutationObserver((rs) => { for (const r of rs) { if (r.target === document.documentElement) S.mut.html++; else S.mut.body++; if (r.addedNodes) S.mut.nodesAdded += r.addedNodes.length; } });
  const go = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) go(); else addEventListener('DOMContentLoaded', go);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.longtasks.push(e.duration); }).observe({ type: 'longtask', buffered: true }); } catch {}
  window.__perfReset = () => {
    const keep = { canvases: S.canvases };
    Object.assign(S, { drawn: 0, drawnJs: 0, drawsAtTick: 0, frames: 0, frameMs: [], rafCbs: 0, gl: { draws: 0, tris: 0, fbBinds: 0, texCreated: 0, texDeleted: 0, programs: 0, texUploads: 0, texUploadPx: 0, clears: 0, bufferUploads: 0 }, c2d: new Map(), c2dCalls: 0, c2dMs: 0, c2dShadowBlurSets: 0, mut: { html: 0, body: 0, nodesAdded: 0 }, audio: {}, timers: { setTimeout: 0, setInterval: 0, live: S.timers.live }, heap: { samples: 0, up: 0, drops: 0, last: 0, first: 0 }, longtasks: [], t0: performance.now() }, keep);
  };
  window.__perfRead = () => {
    const secs = (performance.now() - S.t0) / 1000;
    const fm = S.frameMs.slice().sort((a, b) => a - b);
    const q = (p) => (fm.length ? fm[Math.min(fm.length - 1, Math.floor(p * fm.length))] : 0);
    const cvs = [...S.canvases].map((c) => ({ type: c.__ctxType, lab: c.__lab || c.id || c.className || (c.parentElement && c.parentElement.className) || 'detached', w: c.width, h: c.height, inDom: document.contains(c), cssW: c.clientWidth, cssH: c.clientHeight }));
    const anims = document.getAnimations ? document.getAnimations() : [];
    const props = {};
    let infinite = 0, running = 0, paintAnims = 0;
    const paintNames = new Set();
    for (const a of anims) {
      if (a.playState !== 'running') continue; running++;
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}; if (t.iterations === Infinity) infinite++;
      const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
      let paint = false;
      for (const k of kf) for (const p of Object.keys(k)) { if (['offset', 'easing', 'composite', 'computedOffset'].includes(p)) continue; props[p] = (props[p] ?? 0) + 1; if (!['transform', 'opacity', 'translate', 'scale', 'rotate'].includes(p)) paint = true; }
      if (paint) { paintAnims++; paintNames.add(a.animationName || (a.id) || '?'); }
    }
    const per = (n) => +(n / secs).toFixed(1);
    const c2d = {}; for (const [k, v] of S.c2d) c2d[k] = { redrawsPerS: per(v.clears), callsPerS: per(v.calls), px: v.w * v.h };
    const audio = {}; let audioTotal = 0; for (const [k, v] of Object.entries(S.audio)) { audio[k] = per(v); audioTotal += v; }
    let backdrop = 0, filters = 0, boxShadowEls = 0;
    // computed-style sweep of visible elements (cheap enough once a window)
    for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue; if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) backdrop++; if (cs.filter && cs.filter !== 'none') filters++; if (cs.boxShadow && cs.boxShadow !== 'none') boxShadowEls++; }
    return {
      secs: +secs.toFixed(1), fps: per(S.frames), drawnFps: per(S.drawn || 0), drawnJsMs: +((S.drawnJs || 0) / Math.max(1, S.drawn || 0)).toFixed(2),
      perDrawn: { draws: +(S.gl.draws / Math.max(1, S.drawn || 0)).toFixed(1), tris: Math.round(S.gl.tris / Math.max(1, S.drawn || 0)), offTris: Math.round((S.gl.offTris || 0) / Math.max(1, S.drawn || 0)), trisPerS: Math.round(S.gl.tris / secs), drawsPerS: Math.round(S.gl.draws / secs) }, rafCbsPerFrame: +(S.rafCbs / Math.max(1, S.frames)).toFixed(2),
      jsMs: { mean: +(fm.reduce((a, b) => a + b, 0) / Math.max(1, fm.length)).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +(fm[fm.length - 1] ?? 0).toFixed(1) },
      gl: { drawsPerFrame: +(S.gl.draws / Math.max(1, S.frames)).toFixed(1), trisPerFrame: Math.round(S.gl.tris / Math.max(1, S.frames)), offDrawsPerFrame: +((S.gl.offDraws||0) / Math.max(1, S.frames)).toFixed(1), offTrisPerFrame: Math.round((S.gl.offTris||0) / Math.max(1, S.frames)), offscreenBindsPerFrame: +(S.gl.fbBinds / Math.max(1, S.frames)).toFixed(2), clearsPerFrame: +(S.gl.clears / Math.max(1, S.frames)).toFixed(2), texCreatedPerS: per(S.gl.texCreated), texDeletedPerS: per(S.gl.texDeleted), texUploadsPerS: per(S.gl.texUploads), texUploadMpxPerS: +(S.gl.texUploadPx / 1e6 / secs).toFixed(2), bufferUploadsPerFrame: +(S.gl.bufferUploads / Math.max(1, S.frames)).toFixed(1), programsCreated: S.gl.programs },
      canvases: cvs, c2d, c2dCallsPerS: per(S.c2dCalls), c2dMsPerFrame: +((S.c2dMs||0) / Math.max(1, S.frames)).toFixed(2), c2dShadowBlurPerS: per(S.c2dShadowBlurSets),
      mutPerS: { html: per(S.mut.html), body: per(S.mut.body), nodesAdded: per(S.mut.nodesAdded) },
      audioNodesPerS: per(audioTotal), audio,
      timersPerS: { setTimeout: per(S.timers.setTimeout), setInterval: per(S.timers.setInterval) }, liveIntervalsCreated: S.timers.live,
      heap: performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), allocMBPerS: +(S.heap.up / 1048576 / secs).toFixed(2), gcDropsPerS: per(S.heap.drops) } : null,
      longtasks: { n: S.longtasks.length, totalMs: Math.round(S.longtasks.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...S.longtasks)) },
      css: { running, infinite, paintAnims, paintNames: [...paintNames].slice(0, 25), props, backdropFilterEls: backdrop, filterEls: filters, boxShadowEls },
      dpr: devicePixelRatio, phone: document.documentElement.dataset.phone, perfStep: document.documentElement.dataset.perfStep, quality: document.documentElement.dataset.quality, screen: document.documentElement.dataset.screen, draws: document.documentElement.dataset.draws, hidden: document.hidden, ua: navigator.userAgent,
    };
  };
};

const launchArgs = BROWSER === 'chromium' ? (GPU ? [...(process.env.UNCAP === '1' ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []), '--enable-precise-memory-info', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] : ['--enable-precise-memory-info', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']) : [];
const browser = await pw[BROWSER].launch({ args: launchArgs, headless: true });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: BROWSER === 'chromium', hasTouch: true });
const profile = { v: 1, sessions: 4, matches: 3, wins: 2, firstWinDone: true, hero: 'clem', side: 'cat' };
await ctx.addInitScript(([k, j]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, j); } catch {} }, ['tt.pawlegends.profile.v1', JSON.stringify(profile)]);
await ctx.addInitScript(INSTR);
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(String(e)));
let cdp = null;
if (BROWSER === 'chromium') {
  cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
const metrics = async () => {
  if (!cdp) return null;
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
};
const wait = (ms) => page.waitForTimeout(ms);
const results = { browser: BROWSER, label: LABEL, throttle: THROTTLE, gpu: GPU, query: QUERY, windows: {} };

async function windowed(name, ms, during) {
  await page.evaluate(() => window.__perfReset());
  const m0 = await metrics();
  let paints = 0;
  let layerCount = 0;
  if (cdp) {
    await cdp.send('LayerTree.enable').catch(() => {});
    cdp.on('LayerTree.layerPainted', () => paints++);
    cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layerCount = e.layers.length; });
  }
  if (during) await during(ms); else await wait(ms);
  const r = await page.evaluate(() => window.__perfRead());
  const m1 = await metrics();
  if (m0 && m1) {
    const d = (k) => m1[k] - m0[k];
    const s = r.secs;
    r.cdp = {
      scriptMsPerS: +((d('ScriptDuration') * 1000) / s).toFixed(1), taskMsPerS: +((d('TaskDuration') * 1000) / s).toFixed(1),
      layoutsPerS: +(d('LayoutCount') / s).toFixed(1), layoutMsPerS: +((d('LayoutDuration') * 1000) / s).toFixed(2),
      styleRecalcsPerS: +(d('RecalcStyleCount') / s).toFixed(1), styleMsPerS: +((d('RecalcStyleDuration') * 1000) / s).toFixed(2),
      heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1), nodes: m1.Nodes, listeners: m1.JSEventListeners,
    };
    r.cdp.layerPaintsPerS = +(paints / s).toFixed(1);
    r.cdp.compositedLayers = layerCount;
    await cdp.send('LayerTree.disable').catch(() => {});
    cdp.removeAllListeners('LayerTree.layerPainted');
    cdp.removeAllListeners('LayerTree.layerTreeDidChange');
  }
  results.windows[name] = r;
  console.log(name, JSON.stringify({ drawnFps: r.drawnFps, perDrawn: r.perDrawn, phone: r.phone, fps: r.fps, js: r.jsMs, c2dMs: r.c2dMsPerFrame, draws: r.gl.drawsPerFrame, tris: r.gl.trisPerFrame, offDraws: r.gl.offDrawsPerFrame, offTris: r.gl.offTrisPerFrame, fb: r.gl.offscreenBindsPerFrame, c2d: r.c2d, mut: r.mutPerS, audio: r.audioNodesPerS, heap: r.heap, cdp: r.cdp, q: r.quality }));
}

async function holdStick(ms) {
  // joystick: the left zone, dragged up-right (towards the enemy side), held
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await page.mouse.move(140, 300);
      await page.mouse.down();
      await page.mouse.move(175, 280, { steps: 4 });
      await page.mouse.move(210, 262, { steps: 4 });
      const left = Math.min(6000, end - Date.now());
      if (left > 0) await wait(left);
      await page.mouse.up();
      // tap attack now and then
      const atk = await page.locator('.pl-tbtn.attack').boundingBox().catch(() => null);
      if (atk) await page.mouse.click(atk.x + atk.width / 2, atk.y + atk.height / 2);
    } catch { await wait(500); }
  }
}

await page.goto(`${BASE}?${QUERY}`);
await page.waitForSelector('html[data-screen="title"]', { timeout: 60000 });
await wait(4000); // the probe decides the tier in ~2.6 s
await windowed('lobby-title', 10000);

await page.locator('.pl-btn.big').first().click();
await page.waitForSelector('html[data-match="live"]', { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30000 }).catch(() => {});
const units = async () => page.evaluate(() => document.documentElement.dataset.draws);
await windowed('match-early', 15000, holdStick);
const MID = Number(process.env.MID_WAIT ?? 30000);
await holdStick(MID);
await windowed('match-mid', 15000, holdStick);
await holdStick(MID);
await windowed('match-late', 15000, holdStick);
// paused (the touch pause button)
await page.evaluate(() => document.querySelector('.pl-pause')?.click());
await wait(800);
await windowed('match-paused', 8000);
await page.keyboard.press('Escape').catch(() => {});
// hidden: another tab in front
if (BROWSER === 'chromium') {
  const p2 = await ctx.newPage();
  await p2.goto('about:blank');
  await p2.bringToFront();
  await wait(500);
  results.hiddenState = await page.evaluate(() => document.visibilityState);
  await windowed('match-hidden', 8000);
  await page.bringToFront();
  await p2.close();
}
results.errors = logs.slice(0, 10);
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('wrote', OUT, 'hidden', results.hiddenState);
await browser.close();

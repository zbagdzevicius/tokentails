// Pawlegends iOS perf, iteration 2 deep probe (docs/plans/moba/PERF-IOS.md §8). Not part of the game bundle.
// Extends perf-ios-measure.mjs with: every WebGL call counted (programs bound, blended draws, uniforms), GPU time per
// frame (EXT_disjoint_timer_query_webgl2 when exposed), hitches with their time in the match (rAF gaps, long tasks,
// programs linked after the loading veil, shader-call stalls), live audio sources, DOM mutation targets, the champion
// browser's live skill preview, and in Chromium a CPU profile (self time by source file, via the build's source maps)
// and a sampling heap profile (allocation sites, incl. objects already collected).
//
// 1. cd pawlegends && npx vite build --sourcemap --outDir <dir> && npx vite preview --outDir <dir> --host 127.0.0.1 --port 4471 --strictPort
// 2. BUILD_DIR=<dir> PORT=4471 GPU=1 node docs/plans/moba/benchmarks/perf-ios-probe2.mjs <chromium|webkit> <label>
//    env: THROTTLE (Chromium CPU slowdown, default 4), PROFILE=0 (no CPU/heap profiles), MID_WAIT (ms between match
//    windows, default 45000), SKIP_BROWSER=1 (no champion browser step), OUT_DIR (default /tmp). Writes $OUT_DIR/pl-probe2-<label>.json.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const req = createRequire(new URL('../../../../pawlegends/package.json', import.meta.url));
const pw = req('@playwright/test');
let TM = null;
try { TM = req('@jridgewell/trace-mapping'); } catch { TM = null; }

const BROWSER = process.argv[2] ?? 'chromium';
const LABEL = process.argv[3] ?? BROWSER;
const THROTTLE = Number(process.env.THROTTLE ?? (BROWSER === 'chromium' ? 4 : 1));
const GPU = process.env.GPU === '1';
const PROFILE = process.env.PROFILE !== '0' && BROWSER === 'chromium';
const PORT = process.env.PORT ?? 4471;
const BASE = `http://127.0.0.1:${PORT}/`;
const BUILD_DIR = process.env.BUILD_DIR ?? '';
const OUT = `${process.env.OUT_DIR ?? '/tmp'}/pl-probe2-${LABEL}.json`;
const MID = Number(process.env.MID_WAIT ?? 45000);

const INSTR = () => {
  const now = () => performance.now();
  const fresh = () => ({
    t0: now(), frames: 0, drawn: 0, drawnJs: 0, frameMs: [], gaps: [], gl: {}, glCalls: 0, draws: 0, tris: 0, offDraws: 0, offTris: 0,
    blendDraws: 0, blendTris: 0, progSwitch: 0, progsSeen: new Set(), uniforms: 0, shaderMs: 0, shaderSlow: [], progLog: [],
    c2d: new Map(), c2dMs: 0, mut: new Map(), mutN: 0, audio: {}, audioStarts: 0, audioLiveMax: 0, gpu: [], longtasks: [],
    heap: { up: 0, drops: 0, last: 0 }, other: {}, disjoint: 0, progNames: [],
  });
  const S = (window.__p2 = fresh());
  S.audioLive = 0; S.liveAt = 0; S.programsTotal = 0; S.game = null;
  const realRaf = window.requestAnimationFrame.bind(window);
  let frameJs = 0, lastTick = -1, drawsAtTick = 0, q = null, pending = [], ext = null, gl0 = null;
  window.requestAnimationFrame = (cb) => realRaf((t) => {
    if (t !== lastTick) {
      if (lastTick >= 0) {
        S.frameMs.push(frameJs);
        if (S.draws > drawsAtTick) { S.drawn++; S.drawnJs += frameJs; }
        const gap = t - lastTick; if (gap > 50) S.gaps.push([Math.round(t - S.liveAt), Math.round(gap)]);
      }
      drawsAtTick = S.draws; frameJs = 0; lastTick = t; S.frames++;
      const m = performance.memory; if (m) { const u = m.usedJSHeapSize; if (S.heap.last) { const d = u - S.heap.last; if (d > 0) S.heap.up += d; else if (d < -262144) S.heap.drops++; } S.heap.last = u; }
      // GPU timer: one TIME_ELAPSED query around each tick's callbacks on the game context
      if (gl0 && ext) {
        if (q) { try { O.endQuery.call(gl0, ext.TIME_ELAPSED_EXT); pending.push(q); } catch {} q = null; }
        while (pending.length && O.getQueryParameter.call(gl0, pending[0], gl0.QUERY_RESULT_AVAILABLE)) {
          const pq = pending.shift(); const disjoint = O.getParameter.call(gl0, ext.GPU_DISJOINT_EXT);
          if (disjoint) S.disjoint++; S.gpu.push(O.getQueryParameter.call(gl0, pq, gl0.QUERY_RESULT) / 1e6); O.deleteQuery.call(gl0, pq);
        }
        if (pending.length < 8) { q = O.createQuery.call(gl0); O.beginQuery.call(gl0, ext.TIME_ELAPSED_EXT, q); }
      }
    }
    const a = now();
    try { cb(t); } finally { frameJs += now() - a; }
  });
  const O = {};
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  const tri = (mode, count, inst = 1) => (mode === 4 ? count / 3 : mode === 5 || mode === 6 ? count - 2 : 0) * inst;
  if (P) {
    let fbOn = false, blend = false, prog = null;
    for (const name of Object.getOwnPropertyNames(P)) {
      const d = Object.getOwnPropertyDescriptor(P, name);
      if (!d || typeof d.value !== 'function' || name === 'constructor') continue;
      const o = d.value; O[name] = o;
      const shader = name === 'compileShader' || name === 'linkProgram' || name === 'getProgramParameter' || name === 'getShaderParameter';
      const isDraw = name === 'drawElements' || name === 'drawElementsInstanced' || name === 'drawArrays' || name === 'drawArraysInstanced';
      P[name] = function (...a) {
        if (this !== gl0 && this.canvas && this.canvas.id === 'game-canvas') { gl0 = this; S.game = this; ext = O.getExtension.call(this, 'EXT_disjoint_timer_query_webgl2'); q = null; pending = []; }
        const mine = this === gl0;
        if (!mine && isDraw) { const k = (this.canvas && (this.canvas.className || this.canvas.id)) || 'offscreen'; const e = S.other[k] || (S.other[k] = { draws: 0, tris: 0 }); e.draws++; e.tris += name === 'drawElements' ? tri(a[0], a[1]) : name === 'drawElementsInstanced' ? tri(a[0], a[1], a[4]) : name === 'drawArrays' ? tri(a[0], a[2]) : tri(a[0], a[2], a[3]); }
        if (mine) {
          S.glCalls++; S.gl[name] = (S.gl[name] || 0) + 1;
          if (isDraw) {
            const t = name === 'drawElements' ? tri(a[0], a[1]) : name === 'drawElementsInstanced' ? tri(a[0], a[1], a[4]) : name === 'drawArrays' ? tri(a[0], a[2]) : tri(a[0], a[2], a[3]);
            S.draws++; S.tris += t; if (fbOn) { S.offDraws++; S.offTris += t; } else if (blend) { S.blendDraws++; S.blendTris += t; }
          } else if (name === 'bindFramebuffer') fbOn = !!a[1];
          else if (name === 'enable' && a[0] === 0x0be2) blend = true;
          else if (name === 'disable' && a[0] === 0x0be2) blend = false;
          else if (name === 'useProgram') { if (a[0] !== prog) S.progSwitch++; prog = a[0]; S.progsSeen.add(a[0]); }
          else if (name.startsWith('uniform')) S.uniforms++;
          else if (name === 'createProgram') { S.programsTotal++; S.progLog.push(Math.round(now() - S.liveAt)); }
          else if (name === 'shaderSource' && S.liveAt) { const src = String(a[1]); const m = (re) => (re.exec(src) || [])[1]; const tag = [m(/#define SHADER_TYPE (\w+)/), m(/#define SHADER_NAME ([^\n]+)/)].filter(Boolean).join(':') || src.slice(0, 40).replace(/\s+/g, ' '); const fl = ['USE_INSTANCING', 'USE_SKINNING', 'USE_SHADOWMAP', 'DEPTH_PACKING', 'USE_MAP', 'FLAT_SHADED', 'USE_COLOR', 'DOUBLE_SIDED'].filter((d) => src.includes('#define ' + d)).join(','); if (S.progNames.length < 80) S.progNames.push([Math.round(now() - S.liveAt), tag + (fl ? ' [' + fl + ']' : '')]); }
        }
        if (shader) {
          const t0 = now();
          try { return o.apply(this, a); } finally { const dt = now() - t0; if (mine) { S.shaderMs += dt; if (dt > 4) S.shaderSlow.push([Math.round(t0 - S.liveAt), +dt.toFixed(1), name]); } }
        }
        return o.apply(this, a);
      };
    }
  }
  const C2 = CanvasRenderingContext2D.prototype;
  const lab = (cv) => cv.__lab ??= (cv.className || cv.id || (cv.parentElement && cv.parentElement.className) || 'detached');
  for (const m of Object.getOwnPropertyNames(C2)) {
    const d = Object.getOwnPropertyDescriptor(C2, m); if (!d || typeof d.value !== 'function' || m === 'constructor') continue;
    const o = d.value;
    C2[m] = function (...a) { const t0 = now(); try { return o.apply(this, a); } finally { const cv = this.canvas; if (cv) { const k = lab(cv); let e = S.c2d.get(k); if (!e) S.c2d.set(k, (e = { calls: 0, clears: 0, ms: 0, w: 0, h: 0 })); e.calls++; if (m === 'clearRect') e.clears++; e.ms += now() - t0; e.w = cv.width; e.h = cv.height; } } };
  }
  const AC = window.BaseAudioContext || window.AudioContext;
  if (AC) for (const m of Object.getOwnPropertyNames(AC.prototype)) if (m.startsWith('create') && typeof AC.prototype[m] === 'function') { const o = AC.prototype[m]; AC.prototype[m] = function (...a) { S.audio[m] = (S.audio[m] ?? 0) + 1; return o.apply(this, a); }; }
  const SN = window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype;
  if (SN) { const o = SN.start; SN.start = function (...a) { S.audioStarts++; S.audioLive++; if (S.audioLive > S.audioLiveMax) S.audioLiveMax = S.audioLive; this.addEventListener('ended', () => { S.audioLive--; }, { once: true }); return o.apply(this, a); }; }
  const key = (el) => { if (!el || el.nodeType !== 1) return el && el.parentElement ? key(el.parentElement) + '>#text' : '?'; const c = (el.getAttribute('class') || '').trim().split(/\s+/)[0]; return el.tagName.toLowerCase() + (c ? '.' + c : ''); };
  const mo = new MutationObserver((rs) => { for (const r of rs) { const k = key(r.target) + ':' + r.type + (r.attributeName ? '@' + r.attributeName : ''); window.__p2.mut.set(k, (window.__p2.mut.get(k) || 0) + 1); window.__p2.mutN++; } });
  const go = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) go(); else addEventListener('DOMContentLoaded', go);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p2.longtasks.push([Math.round(e.startTime - S.liveAt), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch {}
  window.__p2markLive = () => { S.liveAt = now(); S.progLog.length = 0; S.shaderSlow.length = 0; S.progNames.length = 0; };
  window.__p2reset = () => { const keep = { audioLive: S.audioLive, liveAt: S.liveAt, programsTotal: S.programsTotal, game: S.game }; Object.assign(S, fresh(), keep); };
  window.__p2read = () => {
    const secs = (now() - S.t0) / 1000;
    const per = (n) => +(n / secs).toFixed(1);
    const fm = S.frameMs.slice().sort((a, b) => a - b);
    const qq = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
    const gpu = S.gpu.slice().sort((a, b) => a - b);
    const dn = Math.max(1, S.drawn);
    const topGl = Object.entries(S.gl).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, +(v / dn).toFixed(1)]);
    const c2d = {}; for (const [k, v] of S.c2d) c2d[k] = { callsPerS: per(v.calls), redrawsPerS: per(v.clears), msPerS: +(v.ms / secs).toFixed(2), px: v.w * v.h, w: v.w, h: v.h };
    const audio = {}; let at = 0; for (const [k, v] of Object.entries(S.audio)) { audio[k] = per(v); at += v; }
    const mut = [...S.mut.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, per(v)]);
    const cvs = [...document.querySelectorAll('canvas')].map((c) => ({ cls: c.className || c.id, w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }));
    const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running') : [];
    return {
      secs: +secs.toFixed(1), fps: per(S.frames), drawnFps: per(S.drawn), drawnJsMs: +(S.drawnJs / dn).toFixed(2),
      jsMs: { mean: +(fm.reduce((a, b) => a + b, 0) / Math.max(1, fm.length)).toFixed(2), p50: +qq(fm, 0.5).toFixed(2), p95: +qq(fm, 0.95).toFixed(2), max: +(fm[fm.length - 1] ?? 0).toFixed(1) },
      perDrawn: { glCalls: +(S.glCalls / dn).toFixed(0), draws: +(S.draws / dn).toFixed(1), tris: Math.round(S.tris / dn), shadowDraws: +(S.offDraws / dn).toFixed(1), shadowTris: Math.round(S.offTris / dn), blendDraws: +(S.blendDraws / dn).toFixed(1), blendTris: Math.round(S.blendTris / dn), progSwitches: +(S.progSwitch / dn).toFixed(1), uniforms: +(S.uniforms / dn).toFixed(0) },
      programsBound: S.progsSeen.size, programsTotal: S.programsTotal, topGl,
      otherContexts: Object.fromEntries(Object.entries(S.other).map(([k, v]) => [k, { drawsPerS: per(v.draws), trisPerS: Math.round(v.tris / secs) }])),
      gpuMs: gpu.length ? { n: gpu.length, disjoint: S.disjoint, p50: +qq(gpu, 0.5).toFixed(2), p95: +qq(gpu, 0.95).toFixed(2) } : null,
      shaderMs: +S.shaderMs.toFixed(1), progNames: S.progNames.slice(0, 40), shaderSlow: S.shaderSlow.slice(0, 20), progLog: S.progLog.slice(0, 60),
      gaps: S.gaps.slice(0, 40), longtasks: { n: S.longtasks.length, totalMs: S.longtasks.reduce((a, b) => a + b[1], 0), max: Math.max(0, ...S.longtasks.map((x) => x[1])), list: S.longtasks.slice(0, 30) },
      c2d, canvases: cvs, audioNodesPerS: per(at), audio, audioStartsPerS: per(S.audioStarts), audioLiveMax: S.audioLiveMax,
      mutPerS: per(S.mutN), mutTop: mut, cssAnims: anims.length, cssInfinite: anims.filter((a) => a.effect?.getTiming?.().iterations === Infinity).length,
      heap: performance.memory ? { usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), allocMBPerS: +(S.heap.up / 1048576 / secs).toFixed(2), gcPerS: per(S.heap.drops) } : null,
      phone: document.documentElement.dataset.phone, quality: document.documentElement.dataset.quality, perfStep: document.documentElement.dataset.perfStep, dmgNodes: document.querySelectorAll('.fx-dmg').length, domNodes: document.getElementsByTagName('*').length,
    };
  };
};

// ---------------------------------------------------------------------------------------------- source maps → category
const maps = new Map();
function mapFor(url) {
  if (!TM || !BUILD_DIR || !url.startsWith(BASE)) return null;
  if (maps.has(url)) return maps.get(url);
  let m = null;
  try { m = new TM.TraceMap(fs.readFileSync(path.join(BUILD_DIR, url.slice(BASE.length).split('?')[0] + '.map'), 'utf8')); } catch { m = null; }
  maps.set(url, m);
  return m;
}
function origin(cf) {
  const m = cf.url ? mapFor(cf.url) : null;
  if (!m) return { src: cf.url ? cf.url.replace(BASE, '') : cf.functionName || '(native)', line: cf.lineNumber + 1, fn: cf.functionName };
  const o = TM.originalPositionFor(m, { line: cf.lineNumber + 1, column: Math.max(0, cf.columnNumber) });
  return { src: (o.source || '?').replace(/^.*?(node_modules\/|src\/)/, '$1'), line: o.line, fn: o.name || cf.functionName };
}
function category(o, fn) {
  const s = o.src;
  if (fn === '(garbage collector)') return 'GC';
  if (fn === '(idle)') return 'idle';
  if (fn === '(program)' || fn === '(root)') return 'browser (style/layout/paint/compositor glue)';
  if (!o.src || o.src === fn || o.src === '(native)' || /^(P|C2|AC)\.<computed>$|^(SN\.start|key|tri|now|get memory|window\.requestAnimationFrame|window\.__p2read|window\.__p2reset|go)$/.test(fn)) {
    if (/^(P|C2|AC)\.<computed>$|^(SN\.start|key|tri|now|get memory|window\.requestAnimationFrame|window\.__p2read|window\.__p2reset)$/.test(fn)) return 'instrumentation (probe)';
    if (/^(uniform|bind|buffer|draw|tex|use|enable|disable|blend|depth|clear|viewport|scissor|active|frontFace|polygonOffset|vertexAttrib|getQuery|getUniform|color|stencil|cullFace|readPixels|invalidate)/.test(fn)) return 'WebGL calls (native)';
    if (/^(set |get )?(fillStyle|strokeStyle|font|textAlign|textBaseline|lineWidth|globalAlpha|shadow)|^(fill|stroke|arc|moveTo|lineTo|beginPath|closePath|save|restore|setTransform|measureText|drawImage|clearRect|fillRect|strokeRect|fillText|strokeText|roundRect|quadraticCurveTo|bezierCurveTo|rect|clip|translate|scale|rotate|createLinearGradient|createRadialGradient|addColorStop)$/.test(fn)) return 'canvas 2D calls (native)';
    if (/^(create|connect|disconnect|start|stop|setValueAtTime|linearRampToValueAtTime|exponentialRampToValueAtTime|setTargetAtTime|cancelScheduledValues)/.test(fn)) return 'audio (native)';
    if (/^(get |set )?(clientHeight|clientWidth|getBoundingClientRect|offset|scroll|innerHTML|textContent|className|setProperty|getPropertyValue|toggle|querySelector|querySelectorAll|contains|getAttribute|setAttribute|removeAttribute|appendChild|remove|insertBefore|style|dataset|getComputedStyle|classList)/.test(fn)) return 'DOM API (native)';
    if (fn === 'postMessage' || fn === 'structuredClone') return 'host/net (worker messages)';
    if (fn === 'hypot' || fn === 'sort' || fn === 'join' || fn === 'set' || fn === 'get') return 'JS builtins';
    return 'other native';
  }
  if (s.includes('node_modules/three')) {
    if (/getParameters|getProgramCacheKey|getProgramCacheKeyParameters|getProgramCacheKeyBooleans|getProgram\b|needsProgramChange|getChannel/.test(o.fn || '') || /WebGLPrograms/.test(s)) return 'three: program keys';
    if (/WebGLUniforms|setValue|upload/.test((o.fn || '') + s)) return 'three: uniforms';
    if (/WebGLShadowMap/.test(s)) return 'three: shadow pass';
    if (/Matrix4|Vector3|Quaternion|Object3D|Frustum|Sphere|Box3|Matrix3/.test(s)) return 'three: scene graph/matrices/culling';
    return 'three: render submit';
  }
  if (s.startsWith('src/sim/')) return 'sim (main thread)';
  if (s === 'src/render/interp.ts') return 'interp (SnapBuffer)';
  if (s === 'src/ui/overhead.ts') return 'overhead canvas';
  if (s === 'src/ui/minimap.ts') return 'minimap';
  if (s.startsWith('src/ui/preview') || s.startsWith('src/ui/champBrowser')) return 'champion browser + preview';
  if (s.startsWith('src/ui/')) return 'HUD/UI DOM';
  if (s.startsWith('src/audio/')) return 'audio';
  if (s.startsWith('src/render/skillfx/') || s === 'src/render/identity.ts' || s.startsWith('src/render/fx/fun') || s === 'src/render/fx/natureFx.ts') return 'identity VFX';
  if (s.startsWith('src/render/fx/') || s.startsWith('src/render/effects') || s === 'src/render/juice.ts' || s === 'src/render/telegraph.ts') return 'VFX/telegraphs';
  if (s.startsWith('src/render/views/')) return 'views (heroes/minions/towers/map)';
  if (s.startsWith('src/render/anim/') || s.startsWith('src/render/moves')) return 'animation';
  if (s.startsWith('src/render/')) return 'render (gameView, camera, other)';
  if (s.startsWith('src/host/') || s.startsWith('src/net/')) return 'host/net (worker messages)';
  if (s.startsWith('src/app/')) return 'app/matchSession';
  if (s.startsWith('src/input/')) return 'input';
  if (s.startsWith('src/')) return 'other src';
  return 'other: ' + s.split('/').slice(0, 2).join('/');
}
function summarizeCpu(profile, secs, drawn) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dts = profile.timeDeltas; const samples = profile.samples;
  for (let i = 0; i < samples.length; i++) self.set(samples[i], (self.get(samples[i]) || 0) + (dts[i + 1] ?? 0) / 1000);
  const cat = {}; const fns = {};
  for (const [id, ms] of self) {
    const n = byId.get(id); const o = origin(n.callFrame); const c = category(o, n.callFrame.functionName);
    cat[c] = (cat[c] || 0) + ms;
    const k = `${o.fn || '(anon)'} ${o.src}:${o.line}`; fns[k] = (fns[k] || 0) + ms;
  }
  const r = (x) => +x.toFixed(2);
  const busy = Object.entries(cat).filter(([k]) => k !== 'idle').reduce((a, b) => a + b[1], 0);
  return {
    busyMsPerS: r(busy / secs), busyMsPerDrawn: r(busy / Math.max(1, drawn)),
    byCategory: Object.entries(cat).filter(([k]) => k !== 'idle').sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, msPerS: r(v / secs), msPerDrawn: r(v / Math.max(1, drawn)) })),
    topFns: Object.entries(fns).filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, r(v / secs)]),
  };
}
function summarizeHeap(prof, secs) {
  const sites = {}; const cats = {}; let total = 0;
  const walk = (n, stack) => {
    const o = origin(n.callFrame);
    if (n.selfSize) {
      total += n.selfSize;
      // attribute to the nearest frame in src/ (the game's own call site), else the frame itself
      let at = o; for (let i = stack.length - 1; i >= 0 && !at.src.startsWith('src/'); i--) at = stack[i];
      if (!at.src.startsWith('src/')) at = o;
      const k = `${o.fn || '(anon)'} ${o.src}:${o.line}` + (at !== o ? ` <- ${at.fn || '(anon)'} ${at.src}:${at.line}` : '');
      sites[k] = (sites[k] || 0) + n.selfSize;
      const c = category(at, n.callFrame.functionName); cats[c] = (cats[c] || 0) + n.selfSize;
    }
    stack.push(o); for (const ch of n.children || []) walk(ch, stack); stack.pop();
  };
  walk(prof.head, []);
  const kb = (b) => +(b / 1024 / secs).toFixed(0);
  return {
    sampledMBPerS: +(total / 1048576 / secs).toFixed(2),
    byCategoryKBs: Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => [k, kb(v)]),
    topSitesKBs: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, kb(v)]),
  };
}

// ------------------------------------------------------------------------------------------------------------- run
const launchArgs = BROWSER === 'chromium' ? (GPU ? ['--enable-precise-memory-info', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl-draft-extensions'] : ['--enable-precise-memory-info', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']) : [];
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
const metrics = async () => (cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])) : null);
const wait = (ms) => page.waitForTimeout(ms);
const results = { browser: BROWSER, label: LABEL, throttle: THROTTLE, gpu: GPU, base: BASE, windows: {} };

async function windowed(name, ms, during, prof = '') {
  await page.evaluate(() => window.__p2reset());
  const m0 = await metrics();
  let paints = 0, layers = 0;
  if (cdp) {
    await cdp.send('LayerTree.enable').catch(() => {});
    cdp.on('LayerTree.layerPainted', () => paints++);
    cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) layers = e.layers.length; });
    if (prof === 'cpu' && PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
    if (prof === 'heap' && PROFILE) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  }
  if (during) await during(ms); else await wait(ms);
  const r = await page.evaluate(() => window.__p2read());
  if (cdp && prof === 'cpu' && PROFILE) { const { profile: p } = await cdp.send('Profiler.stop'); r.cpu = summarizeCpu(p, r.secs, r.drawnFps * r.secs); }
  if (cdp && prof === 'heap' && PROFILE) { const { profile: p } = await cdp.send('HeapProfiler.stopSampling'); r.alloc = summarizeHeap(p, r.secs); }
  const m1 = await metrics();
  if (m0 && m1) {
    const d = (k) => m1[k] - m0[k]; const s = r.secs;
    r.cdp = { scriptMsPerS: +((d('ScriptDuration') * 1000) / s).toFixed(1), taskMsPerS: +((d('TaskDuration') * 1000) / s).toFixed(1), layoutsPerS: +(d('LayoutCount') / s).toFixed(1), layoutMsPerS: +((d('LayoutDuration') * 1000) / s).toFixed(2), styleRecalcsPerS: +(d('RecalcStyleCount') / s).toFixed(1), styleMsPerS: +((d('RecalcStyleDuration') * 1000) / s).toFixed(2), heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1), nodes: m1.Nodes, layerPaintsPerS: +(paints / s).toFixed(1), compositedLayers: layers };
    await cdp.send('LayerTree.disable').catch(() => {});
    cdp.removeAllListeners('LayerTree.layerPainted'); cdp.removeAllListeners('LayerTree.layerTreeDidChange');
  }
  results.windows[name] = r;
  console.log(name, JSON.stringify({ drawnFps: r.drawnFps, js: r.drawnJsMs, perDrawn: r.perDrawn, gpu: r.gpuMs, heap: r.heap, cdp: r.cdp, audio: r.audioNodesPerS, cpuBusy: r.cpu?.busyMsPerS, alloc: r.alloc?.sampledMBPerS }));
}

const tap = async (sel) => { const b = await page.locator(sel).boundingBox().catch(() => null); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
async function fight(ms) {
  const end = Date.now() + ms;
  let k = 0;
  while (Date.now() < end) {
    try {
      await page.mouse.move(140, 300); await page.mouse.down();
      await page.mouse.move(175, 280, { steps: 4 }); await page.mouse.move(210, 262, { steps: 4 });
      const left = Math.min(4000, end - Date.now()); if (left > 0) await wait(left);
      await page.mouse.up();
      await tap('.pl-tbtn.attack');
      await tap(['.pl-tbtn.q', '.pl-tbtn.w', '.pl-tbtn.e', '.pl-tbtn.r'][k++ % 4]);
    } catch { await wait(500); }
  }
}

await page.goto(BASE);
await page.waitForSelector('html[data-screen="title"]', { timeout: 90000 });
await wait(4000);
await windowed('lobby', 10000, null, 'cpu');

// champion browser with the live skill preview (absent on builds before the browser). SKIP_BROWSER=1 skips it: in
// Chromium the GPU timer queries on the game context stop resolving after the preview's context was lost.
if (process.env.SKIP_BROWSER !== '1') try {
  await page.click('[data-a="choose"]', { timeout: 5000 });
  await page.waitForSelector('[data-info]', { timeout: 10000 });
  await page.locator('[data-info]').first().click({ force: true });
  await page.waitForSelector('.pl-skill-preview-canvas', { timeout: 20000 });
  await wait(3000);
  await windowed('browser-preview', 10000, null, 'cpu');
  await page.click('.pl-champ [data-a="close"]').catch(() => {});
  await wait(500);
  await page.click('[data-a="back"]').catch(() => {});
  await page.waitForSelector('html[data-screen="title"]', { timeout: 10000 });
} catch (e) { results.browserSkipped = String(e).slice(0, 160); await page.goto(BASE); await page.waitForSelector('html[data-screen="title"]', { timeout: 90000 }); }
await wait(1000);

await page.locator('.pl-btn.big').first().click();
await page.waitForSelector('html[data-match="live"]', { timeout: 90000 });
await page.evaluate(() => window.__p2markLive());
await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: 30000 }).catch(() => {});
// whole-match hitch log: reset once here and read the accumulated log at the end (the windows below reset counters,
// so the hitch log is kept by a separate copy)
const hitch = { gaps: [], longtasks: [], progLog: [], shaderSlow: [], progNames: [] };
const grab = async () => { const r = await page.evaluate(() => ({ g: window.__p2.gaps.slice(), l: window.__p2.longtasks.slice(), p: window.__p2.progLog.slice(), s: window.__p2.shaderSlow.slice(), n: window.__p2.progNames.slice() })); hitch.gaps.push(...r.g); hitch.longtasks.push(...r.l); hitch.progLog.push(...r.p); hitch.shaderSlow.push(...r.s); hitch.progNames.push(...r.n); };
await windowed('match-early', 15000, fight); await grab();
await page.evaluate(() => window.__p2reset()); await fight(MID); await grab();
await windowed('match-mid', 15000, fight, 'cpu'); await grab();
await page.evaluate(() => window.__p2reset()); await fight(MID); await grab();
await windowed('match-late', 15000, fight, 'heap'); await grab();
await windowed('match-late2', 15000, fight, 'cpu'); await grab();
results.hitches = hitch;
results.programsTotal = await page.evaluate(() => window.__p2.programsTotal);
await tap('.pl-pause');
await wait(800);
if (!(await page.evaluate(() => document.querySelector('.pl-screen.menu, .pl-menu, [data-a="resume"]')))) await page.keyboard.press('Escape').catch(() => {});
await wait(500);
await windowed('match-paused', 8000);
results.errors = logs.slice(0, 10);
fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('wrote', OUT, 'programs', results.programsTotal, 'gaps>50ms', hitch.gaps.length, 'progs after live', hitch.progLog.length);
await browser.close();

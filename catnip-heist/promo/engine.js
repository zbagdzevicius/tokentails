// Catnip Heist showreel engine.
// Deterministic canvas renderer: same t -> same pixels. See ENGINE.md for the scene API.
//
//   window.__ready        Promise, resolves when assets + scenes are loaded
//   window.__render(t)    synchronous draw of time t (seconds). Missing clip frames fall back.
//   window.__frame(t)     async: draws t with every clip frame decoded (exact). Used by render.mjs.
//   window.__renderTo(t, url)  __frame(t) then PUT the PNG to url (render.mjs server).
//   window.__hash(t)      async: sha-256 of the pixels at t (determinism checks).
//   window.__info()       loaded assets, warnings, scene errors.
//   window.E              the helper library (handy in devtools).

const W = 1920, H = 1080, FPS = 60, DURATION = 15;
const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4, BEATS = 32, BARS = 8;
const EPS = 1e-6;
const TAU = Math.PI * 2;

const params = new URLSearchParams(location.search);
const MODE = params.has('play') ? 'play' : 'render';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.__opaque = true;

const config = {
  motionBlur: +(params.get('mb') || 0),      // sub-frame samples (0/1 = off)
  shutter: +(params.get('shutter') || 0.5),  // fraction of a frame the shutter is open (0.5 = 180 deg)
  grain: params.has('grain') ? +params.get('grain') : 0.05,
  vignette: params.has('vignette') ? +params.get('vignette') : 0.35,
  post: params.get('post') !== '0',          // ?post=0 disables engine post FX
  previewQuality: +(params.get('pq') || (MODE === 'play' ? 0.5 : 1)), // clip decode scale
  cacheMB: +(params.get('cacheMB') || (MODE === 'play' ? 1200 : 1600)),
};

const warnings = [];
const errors = [];
const warn = (m) => { if (!warnings.includes(m)) { warnings.push(m); console.warn('[engine]', m); } };

// ---------------------------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------------------------
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
const remap = (v, a, b, c, d, clampIt = true) => {
  let t = invLerp(a, b, v);
  if (clampIt) t = clamp01(t);
  return c + (d - c) * t;
};
const fract = (v) => v - Math.floor(v);
const mod = (a, n) => ((a % n) + n) % n;
const smoothstep = (a, b, v) => { const t = clamp01(invLerp(a, b, v)); return t * t * (3 - 2 * t); };
const smootherstep = (a, b, v) => { const t = clamp01(invLerp(a, b, v)); return t * t * t * (t * (t * 6 - 15) + 10); };
const pingpong = (t, len = 1) => { const m = mod(t, len * 2); return m > len ? len * 2 - m : m; };
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const dist = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);
const deg = (d) => (d * Math.PI) / 180;
const step = (edge, v) => (v >= edge ? 1 : 0);
const quantize = (v, q) => Math.round(v / q) * q;

// ---------------------------------------------------------------------------------------------
// Easing (Penner set + extras). All take t in 0..1 and return ~0..1.
// ---------------------------------------------------------------------------------------------
const PI = Math.PI;
function bounceOut(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}
function elasticOut(t, amp = 1, period = 0.3) {
  if (t <= 0) return 0; if (t >= 1) return 1;
  const a = Math.max(1, amp), s = (period / TAU) * Math.asin(1 / a);
  return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * TAU) / period) + 1;
}
function elasticIn(t, amp = 1, period = 0.3) { return 1 - elasticOut(1 - t, amp, period); }
function elasticInOut(t, amp = 1, period = 0.45) {
  return t < 0.5 ? elasticIn(t * 2, amp, period) / 2 : 0.5 + elasticOut(t * 2 - 1, amp, period) / 2;
}
const backIn = (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t;
const backOut = (t, s = 1.70158) => { const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
const backInOut = (t, s = 1.70158) => {
  const c = s * 1.525;
  return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
};
// Damped spring on normalized progress t (0..1). freq = oscillations over the span, damp = decay.
function spring(t, freq = 2.5, damp = 7) {
  if (t <= 0) return 0; if (t >= 1) return 1;
  return 1 - Math.exp(-damp * t) * Math.cos(TAU * freq * t);
}
// cubic-bezier(x1, y1, x2, y2) like CSS. Returns an easing function.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u;
  const sy = (u) => ((ay * u + by) * u + cy) * u;
  const dsx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (t) => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const x = sx(u) - t; const d = dsx(u);
      if (Math.abs(x) < 1e-6) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= x / d;
    }
    let lo = 0, hi = 1; u = t;
    for (let i = 0; i < 30; i++) { const x = sx(u); if (Math.abs(x - t) < 1e-6) break; if (x < t) lo = u; else hi = u; u = (lo + hi) / 2; }
    return sy(u);
  };
}
const Ease = {
  linear: (t) => t,
  quadIn: (t) => t * t, quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicIn: (t) => t * t * t, cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quartIn: (t) => t ** 4, quartOut: (t) => 1 - Math.pow(1 - t, 4),
  quartInOut: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  quintIn: (t) => t ** 5, quintOut: (t) => 1 - Math.pow(1 - t, 5),
  quintInOut: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  sineIn: (t) => 1 - Math.cos((t * PI) / 2), sineOut: (t) => Math.sin((t * PI) / 2),
  sineInOut: (t) => -(Math.cos(PI * t) - 1) / 2,
  expoIn: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  circIn: (t) => 1 - Math.sqrt(1 - t * t), circOut: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  circInOut: (t) => (t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2),
  backIn, backOut, backInOut,
  elasticIn, elasticOut, elasticInOut,
  bounceOut, bounceIn: (t) => 1 - bounceOut(1 - t),
  bounceInOut: (t) => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2),
  spring,
  // Motion-design staples
  snap: bezier(0.9, 0, 0.1, 1),        // very hard in-out (whip pans)
  punch: bezier(0.2, 1.6, 0.4, 1),     // fast overshoot
  anticipate: (t) => (t < 0.2 ? -0.12 * Math.sin((t / 0.2) * PI) : Ease.expoOut((t - 0.2) / 0.8)),
  steps: (n) => (t) => Math.floor(clamp01(t) * n) / n,
};
function ease(e) {
  if (typeof e === 'function') return e;
  if (!e) return Ease.linear;
  const f = Ease[e];
  if (!f) { warn(`unknown easing "${e}"`); return Ease.linear; }
  return f;
}

// ---------------------------------------------------------------------------------------------
// Deterministic random + noise
// ---------------------------------------------------------------------------------------------
function hash32(a) {
  a |= 0; a ^= a >>> 16; a = Math.imul(a, 0x7feb352d); a ^= a >>> 15; a = Math.imul(a, 0x846ca68b); a ^= a >>> 16;
  return a >>> 0;
}
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function hashN(...args) {
  let h = 0x9e3779b9;
  for (const v of args) {
    const x = typeof v === 'number' ? (Number.isInteger(v) ? v : Math.floor(v * 1e6)) : strHash(String(v));
    h = hash32(h ^ hash32((x + 0x632be5ab) | 0));
  }
  return h;
}
// rand(seed, ...more) -> [0,1). Any number of numeric/string keys.
const rand = (...a) => hashN(...a) / 4294967296;
const randRange = (a, b, ...seed) => a + (b - a) * rand(...seed);
const randInt = (a, b, ...seed) => a + Math.floor((b - a + 1) * rand(...seed));
const randSigned = (...seed) => rand(...seed) * 2 - 1;
const pick = (arr, ...seed) => arr[Math.floor(rand(...seed) * arr.length) % arr.length];
// Sequential generator (mulberry32). Deterministic when created fresh each frame.
function rng(seed) {
  let a = hashN(seed);
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  return next;
}
const fade5 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// All noise returns roughly -1..1.
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(randSigned(seed, i), randSigned(seed, i + 1), u);
}
function perlin1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const g0 = randSigned(seed, i), g1 = randSigned(seed, i + 1);
  return lerp(g0 * f, g1 * (f - 1), fade5(f)) * 2;
}
function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = randSigned(seed, ix, iy), b = randSigned(seed, ix + 1, iy);
  const c = randSigned(seed, ix, iy + 1), d = randSigned(seed, ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function perlin2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (i, j, dx, dy) => { const a = rand(seed, i, j) * TAU; return Math.cos(a) * dx + Math.sin(a) * dy; };
  const u = fade5(fx), v = fade5(fy);
  return lerp(lerp(g(ix, iy, fx, fy), g(ix + 1, iy, fx - 1, fy), u),
    lerp(g(ix, iy + 1, fx, fy - 1), g(ix + 1, iy + 1, fx - 1, fy - 1), u), v) * 1.414;
}
function fbm1(x, seed = 0, oct = 4, lac = 2, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * perlin1(x * f, seed + o * 17); n += a; a *= gain; f *= lac; }
  return s / n;
}
function fbm2(x, y, seed = 0, oct = 4, lac = 2, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * perlin2(x * f, y * f, seed + o * 17); n += a; a *= gain; f *= lac; }
  return s / n;
}

// ---------------------------------------------------------------------------------------------
// Timeline / beat helpers
// ---------------------------------------------------------------------------------------------
// Progress of lt through [a,b], clamped 0..1, optionally eased.
const seg = (lt, a, b, e) => { const p = clamp01((lt - a) / (b - a)); return e ? ease(e)(p) : p; };
// Same with a,b in beats.
const segB = (lt, a, b, e) => seg(lt, a * BEAT, b * BEAT, e);
const beatAt = (i) => i * BEAT;
const barAt = (i) => i * BAR;
const beatOf = (t) => t / BEAT;
const beatIndex = (t) => Math.floor(t / BEAT + EPS);
const barIndex = (t) => Math.floor(t / BAR + EPS);
const beatPhase = (t) => fract(t / BEAT + EPS);
// Exponential decay envelope that starts at hitTime (1 at the hit, 0 before it).
const env = (t, hit, decay = 0.15) => (t + EPS < hit ? 0 : Math.exp(-(t - hit) / decay));
// Attack/decay envelope: ramps up over `attack` seconds ending at hit, then decays.
const envAD = (t, hit, attack = 0.05, decay = 0.2) =>
  t < hit - attack ? 0 : t < hit ? Ease.quadIn((t - (hit - attack)) / attack) : Math.exp(-(t - hit) / decay);
// Sum of envelopes at several hit times.
const envs = (t, hits, decay = 0.15) => hits.reduce((s, h) => s + env(t, h, decay), 0);
// Pulse on a regular grid (default every beat).
function pulse(t, { every = BEAT, offset = 0, decay = 0.12 } = {}) {
  const k = Math.floor((t - offset) / every + EPS);
  if (k < 0) return 0;
  return env(t, offset + k * every, decay);
}
// Trapezoid visibility window: 0 before a, ramps up over fi, 1, ramps down over fo, 0 after b.
const win = (t, a, b, fi = 0, fo = 0) =>
  t < a || t >= b ? 0 : Math.min(fi > 0 ? clamp01((t - a) / fi) : 1, fo > 0 ? clamp01((b - t) / fo) : 1);
// Keyframes: keys = [[time, value, easeIntoThisKey?], ...]; value may be a number or array.
function keys(t, ks) {
  if (!ks.length) return 0;
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, e] = ks[i];
    if (t < t1) {
      const [t0, v0] = ks[i - 1];
      const p = ease(e)((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? lerpArr(v0, v1, p) : lerp(v0, v1, p);
    }
  }
  return ks[ks.length - 1][1];
}
// Which shot are we in? cuts = sorted start times. Returns {i, t0, t1, lt, p} (i = -1 before first).
function shot(t, cuts, end = Infinity) {
  let i = -1;
  for (let k = 0; k < cuts.length; k++) if (t + EPS >= cuts[k]) i = k;
  const t0 = i < 0 ? -Infinity : cuts[i];
  const t1 = i + 1 < cuts.length ? cuts[i + 1] : end;
  return { i, t0, t1, lt: t - t0, p: Number.isFinite(t1 - t0) ? clamp01((t - t0) / (t1 - t0)) : 0 };
}
// Hold time on N fps (animate "on twos", pixel-art cadence).
const stutter = (t, fps = 12) => Math.floor(t * fps + EPS) / fps;
// Staggered progress for item i of n: each item animates for `dur`, starts spread over `spread`.
const stagger = (lt, i, n, { start = 0, spread = 0.3, dur = 0.3, e } = {}) =>
  seg(lt, start + (n > 1 ? (i / (n - 1)) * spread : 0), start + (n > 1 ? (i / (n - 1)) * spread : 0) + dur, e);

// Cues (assets/audio/cues.json). Synthetic grid when missing.
let cues = [];
const cueTypes = {};
function setCues(list) {
  cues = list.filter((c) => typeof c.t === 'number').sort((a, b) => a.t - b.t);
  for (const k of Object.keys(cueTypes)) delete cueTypes[k];
  for (const c of cues) (cueTypes[c.type] ||= []).push(c.t);
}
const cuesOf = (type) => (type ? cueTypes[type] || [] : cues.map((c) => c.t));
function lastCue(t, type) {
  const arr = Array.isArray(type) ? type.flatMap(cuesOf).sort((a, b) => a - b) : cuesOf(type);
  let lo = 0, hi = arr.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t + EPS) { ans = arr[m]; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function nextCue(t, type) { const arr = cuesOf(type); for (const c of arr) if (c > t + EPS) return c; return null; }
const cueEnv = (t, type, decay = 0.12) => { const c = lastCue(t, type); return c == null ? 0 : env(t, c, decay); };
const cuesIn = (a, b, type) => cuesOf(type).filter((c) => c >= a - EPS && c < b - EPS);

// ---------------------------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------------------------
const DEFAULT_PALETTE = {
  night: '#0d0616', plum: '#301934', violet: '#4b0082', grape: '#6f2da8', lavender: '#9966cc',
  coin: '#ffc93c', cream: '#fcecbb', ember: '#c1260f', rust: '#ee642a', pink: '#ff7aa2', mint: '#d5f4e5',
  sky: '#c4e2fc', lilac: '#f0c5fd', outline: '#2a0f1f', catnip: '#9be15d', catnipDeep: '#5fbf3a',
  catnipGlow: '#b6f36a', conePatrol: '#ffc62e', coneAlert: '#ff2e22', alertRed: '#ff3b2e',
  vaultOpen: '#7cff9a', rescueFlash: '#fff3d0', meowRing: '#b6f36a', bg: '#0d0616', accent: '#9be15d',
  gold: '#ffc93c', alert: '#ff2e22', text: '#fcecbb', textDim: '#9966cc', white: '#ffffff', black: '#000000',
};
const palette = { ...DEFAULT_PALETTE };
function hexToRgb(c) {
  if (Array.isArray(c)) return c;
  if (palette[c]) c = palette[c];
  let h = String(c).replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const rgba = (c, a = 1) => { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${clamp01(a)})`; };
const mix = (a, b, t) => rgbToHex(lerpArr(hexToRgb(a), hexToRgb(b), clamp01(t)));
const shade = (c, amt) => (amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt));
const hsl = (h, s, l, a = 1) => `hsla(${h},${s * 100}%,${l * 100}%,${a})`;
const col = (name) => palette[name] || name;

// ---------------------------------------------------------------------------------------------
// Offscreen canvas pool + context reset
// ---------------------------------------------------------------------------------------------
const pool = new Map();
function resetCtx(c) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.lineWidth = 1; c.lineCap = 'butt'; c.lineJoin = 'miter'; c.miterLimit = 10; c.setLineDash([]); c.lineDashOffset = 0;
  c.textAlign = 'start'; c.textBaseline = 'alphabetic'; c.letterSpacing = '0px'; c.font = '10px sans-serif';
  c.fillStyle = '#000'; c.strokeStyle = '#000';
}
// surface(key, w, h, {clear}) -> OffscreenCanvas with .ctx; same key returns the same canvas.
function surface(key, w = W, h = H, { clear = true } = {}) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  let s = pool.get(key);
  if (!s || s.width !== w || s.height !== h) {
    s = new OffscreenCanvas(w, h);
    s.ctx = s.getContext('2d');
    pool.set(key, s);
  }
  if (clear) { resetCtx(s.ctx); s.ctx.clearRect(0, 0, w, h); }
  s.ctx.__opaque = false;
  return s;
}
let layerDepth = 0;
// Draw fn into an offscreen layer (inherits current transform), optionally post-process it,
// then composite with alpha / blend / filter. o.post(layerCtx, layerCanvas) runs in screen space.
function layer(c, fn, o = {}) {
  const L = surface('__layer' + layerDepth++, o.w || c.canvas.width, o.h || c.canvas.height);
  try {
    L.ctx.setTransform(c.getTransform());
    fn(L.ctx, L);
    if (o.post) { L.ctx.setTransform(1, 0, 0, 1, 0, 0); o.post(L.ctx, L); }
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha *= o.alpha ?? 1;
    if (o.blend) c.globalCompositeOperation = o.blend;
    if (o.filter) c.filter = o.filter;
    c.drawImage(L, o.x || 0, o.y || 0);
    c.restore();
  } finally { layerDepth--; }
  return L;
}
// Copy what is currently on c into a pool canvas (identity space).
function snapshot(c, key = '__snap', region) {
  const r = region || { x: 0, y: 0, w: c.canvas.width, h: c.canvas.height };
  const s = surface(key, r.w, r.h);
  s.ctx.drawImage(c.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------
const assets = { clips: {}, clipList: [], sprites: null, cats: [], dogs: [], images: {}, sheets: new Map(), fontFamily: 'Cat Paw', audio: false };
const FONTS = {
  display: '"Cat Paw", "Arial Black", Impact, sans-serif',
  ui: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  heavy: '"Arial Black", "Helvetica Neue", Impact, sans-serif',
  condensed: '"Avenir Next Condensed", "Helvetica Neue", Arial Narrow, sans-serif',
  mono: '"SF Mono", Menlo, Monaco, monospace',
};

async function fetchJSON(url) {
  try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); }
  catch { return null; }
}
async function loadBitmap(url, scale = 1) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const blob = await r.blob();
  if (scale === 1) return createImageBitmap(blob);
  const probe = await createImageBitmap(blob);
  const w = Math.max(1, Math.round(probe.width * scale)), h = Math.max(1, Math.round(probe.height * scale));
  probe.close();
  return createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
}

// ----- clip frame cache (LRU by bytes) -----
const frameCache = new Map(); // key "clip#idx" -> {bmp, bytes, used}
const pending = new Map();    // key -> Promise
const badFrames = new Set();
let cacheBytes = 0, useTick = 0;
let misses = new Set();
let usedThisFrame = new Set();
const fkey = (name, idx) => name + '#' + idx;
function frameUrl(meta, idx) {
  const n = idx + 1;
  if (meta.pattern) return meta.pattern.replace(/%0(\d)d/, (_, d) => String(n).padStart(+d, '0'));
  return `${meta.dir}/${String(n).padStart(4, '0')}.${meta.ext || 'jpg'}`;
}
function requestFrame(name, idx) {
  const key = fkey(name, idx);
  if (frameCache.has(key) || badFrames.has(key)) return Promise.resolve();
  if (pending.has(key)) return pending.get(key);
  const meta = assets.clips[name];
  const p = loadBitmap(frameUrl(meta, idx), config.previewQuality)
    .then((bmp) => {
      const bytes = bmp.width * bmp.height * 4;
      frameCache.set(key, { bmp, bytes, used: ++useTick });
      cacheBytes += bytes;
    })
    .catch((e) => { badFrames.add(key); warn(`clip frame missing: ${e.message}`); })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
function evictCache() {
  const budget = config.cacheMB * 1024 * 1024;
  if (cacheBytes <= budget) return;
  const entries = [...frameCache.entries()].filter(([k]) => !usedThisFrame.has(k)).sort((a, b) => a[1].used - b[1].used);
  for (const [k, v] of entries) {
    if (cacheBytes <= budget * 0.85) break;
    if (k.endsWith('#0')) continue; // keep first frames as fallbacks
    v.bmp.close(); frameCache.delete(k); cacheBytes -= v.bytes;
  }
}
function getFrame(name, idx) {
  const key = fkey(name, idx);
  usedThisFrame.add(key);
  const hit = frameCache.get(key);
  if (hit) { hit.used = ++useTick; return hit.bmp; }
  if (!badFrames.has(key)) { misses.add(key); if (MODE === 'play') requestFrame(name, idx); }
  // nearest loaded fallback (only visible in realtime preview / when a file is missing)
  for (let d = 1; d < 60; d++) {
    const a = frameCache.get(fkey(name, idx - d)); if (a) return a.bmp;
    const b = frameCache.get(fkey(name, idx + d)); if (b) return b.bmp;
  }
  return null;
}

async function loadAssets() {
  // Sprites
  const sj = await fetchJSON('assets/sprites/sprites.json');
  if (sj) {
    assets.sprites = sj;
    assets.cats = sj.cats || [];
    assets.dogs = sj.dogs || [];
    if (sj.palette) Object.assign(palette, sj.palette);
    if (sj.fontFamily) assets.fontFamily = sj.fontFamily;
    const sheets = [...assets.cats, ...assets.dogs];
    await Promise.all(sheets.map(async (s) => {
      try { assets.sheets.set(s.sheet, await loadBitmap(s.sheet)); }
      catch (e) { warn(`sprite sheet missing: ${s.sheet}`); }
    }));
    const imgs = { ...(sj.icons || {}), ...(sj.images || {}) };
    await Promise.all(Object.entries(imgs).map(async ([k, p]) => {
      try { assets.images[k] = await loadBitmap(p); } catch { warn(`image missing: ${k} (${p})`); }
    }));
  } else warn('assets/sprites/sprites.json missing: sprites/images draw as placeholders');
  // Font
  const fontPath = sj?.font || 'assets/sprites/catpaw.woff2';
  try {
    const ff = new FontFace(assets.fontFamily, `url(${fontPath})`);
    await ff.load(); document.fonts.add(ff);
    FONTS.display = `"${assets.fontFamily}", "Arial Black", Impact, sans-serif`;
  } catch { warn(`font missing: ${fontPath} (display text falls back to Arial Black)`); }
  // warm up system fonts so the first rendered frame matches later ones
  for (const f of Object.values(FONTS)) { ctx.font = `64px ${f}`; ctx.measureText('WARM'); }
  await document.fonts.ready;
  // Clips
  const cj = await fetchJSON('assets/clips/clips.json');
  if (Array.isArray(cj)) {
    assets.clipList = cj;
    for (const c of cj) assets.clips[c.name] = { fps: 30, ...c };
    await Promise.all(cj.map((c) => requestFrame(c.name, 0)));
  } else warn('assets/clips/clips.json missing: drawClip shows placeholders');
  // Cues
  const cu = await fetchJSON('assets/audio/cues.json');
  const list = Array.isArray(cu) ? cu : Array.isArray(cu?.cues) ? cu.cues : null;
  if (list) setCues(list);
  else {
    warn('assets/audio/cues.json missing: using a synthetic 128 BPM grid');
    const syn = [];
    for (let i = 0; i < BEATS; i++) { syn.push({ t: i * BEAT, type: 'kick' }); if (i % 2 === 1) syn.push({ t: i * BEAT, type: 'snare' }); }
    for (let i = 0; i < BEATS * 2; i++) syn.push({ t: i * BEAT / 2, type: 'hat' });
    for (let b = 0; b < BARS; b++) syn.push({ t: b * BAR, type: 'impact' });
    setCues(syn);
    assets.cuesSynthetic = true;
  }
  // Audio presence (for preview)
  try { const r = await fetch('assets/audio/track.wav', { method: 'HEAD' }); assets.audio = r.ok; } catch { assets.audio = false; }
  if (!assets.audio) warn('assets/audio/track.wav missing');
  buildTextures();
}

// ---------------------------------------------------------------------------------------------
// Prebuilt textures (grain tiles, scanline pattern)
// ---------------------------------------------------------------------------------------------
const tex = { grain: [], scan: null };
function buildTextures() {
  for (let k = 0; k < 8; k++) {
    const c = new OffscreenCanvas(256, 256); const x = c.getContext('2d');
    const id = x.createImageData(256, 256); const r = rng('grain' + k);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = clamp(Math.round(128 + ((r() + r() + r()) / 3 - 0.5) * 2 * 150), 0, 255);
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    x.putImageData(id, 0, 0); tex.grain.push(c);
  }
}

// ---------------------------------------------------------------------------------------------
// Drawing: images, sprites, clips
// ---------------------------------------------------------------------------------------------
function placeholder(c, x, y, w, h, label, t = 0) {
  c.save();
  c.fillStyle = '#1a0f24'; c.fillRect(x, y, w, h);
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.strokeStyle = 'rgba(255,0,255,.35)'; c.lineWidth = Math.max(2, w / 80);
  const s = Math.max(24, w / 12), off = (t * 120) % (s * 2);
  for (let k = -h; k < w + h; k += s * 2) { c.beginPath(); c.moveTo(x + k + off, y); c.lineTo(x + k + off - h, y + h); c.stroke(); }
  c.strokeStyle = '#ff00ff'; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  c.fillStyle = '#ff9bff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${Math.max(12, Math.min(48, w / 14))}px ${FONTS.mono}`;
  c.fillText(label, x + w / 2, y + h / 2);
  c.restore();
}
// cover(sw, sh, dw, dh, fx, fy, zoom) -> source rect {sx, sy, sw, sh} filling dw x dh.
function cover(sw, sh, dw, dh, fx = 0.5, fy = 0.5, zoom = 1) {
  const s = Math.max(dw / sw, dh / sh) * zoom;
  const vw = dw / s, vh = dh / s;
  let sx = (sw - vw) * fx, sy = (sh - vh) * fy;
  if (vw <= sw) sx = clamp(sx, 0, sw - vw);
  if (vh <= sh) sy = clamp(sy, 0, sh - vh);
  return { sx, sy, sw: vw, sh: vh };
}
// contain(sw, sh, dx, dy, dw, dh) -> dest rect {x, y, w, h} fitting inside.
function contain(sw, sh, dx, dy, dw, dh) {
  const s = Math.min(dw / sw, dh / sh); const w = sw * s, h = sh * s;
  return { x: dx + (dw - w) / 2, y: dy + (dh - h) / 2, w, h };
}
const img = (name) => assets.images[name] || null;
// drawImg(ctx, nameOrBitmap, x, y, {w, h, scale, anchor:[.5,.5], rot, alpha, smooth})
function drawImg(c, im, x, y, o = {}) {
  const b = typeof im === 'string' ? img(im) : im;
  const bw = b ? b.width : 64, bh = b ? b.height : 64;
  const w = o.w ?? (o.h ? (bw * o.h) / bh : bw * (o.scale ?? 1));
  const h = o.h ?? (o.w ? (bh * o.w) / bw : bh * (o.scale ?? 1));
  const [ax, ay] = o.anchor || [0.5, 0.5];
  c.save();
  c.translate(x, y); if (o.rot) c.rotate(o.rot);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  c.imageSmoothingEnabled = o.smooth ?? true;
  if (b) c.drawImage(b, -w * ax, -h * ay, w, h);
  else placeholder(c, -w * ax, -h * ay, w, h, String(im));
  c.restore();
}

function sheetOf(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  return assets.cats.find((c) => c.id === s) || assets.dogs.find((c) => c.id === s) || null;
}
function spriteRow(sheet, rowName) {
  const s = sheetOf(sheet); if (!s) return null;
  if (rowName == null) return s.rows[0];
  const up = String(rowName).toUpperCase();
  return s.rows.find((r) => r.name.toUpperCase() === up) || s.rows[0];
}
// drawSprite(ctx, sheetOrId, rowName, frameIndex, x, y, scale=4, opts)
// opts: anchor 'center'(bounds center, default) | 'feet' | [ax, ay] (0..1 of the 48px cell),
//       flip, rot, sx, sy, alpha, clamp (no loop), snap (round position), tint {color, amount},
//       silhouette color, outline {color, px}, blend
function drawSprite(c, sheet, rowName, frameIndex, x, y, scale = 4, o = {}) {
  const s = sheetOf(sheet);
  const bmp = s && assets.sheets.get(s.sheet);
  const fs = s?.frame || assets.sprites?.frame || 48;
  if (!s || !bmp) { placeholder(c, x - (fs * scale) / 2, y - (fs * scale) / 2, fs * scale, fs * scale, String(sheet?.id || sheet)); return; }
  const row = spriteRow(s, rowName);
  const n = Math.max(1, row.frames);
  let f = Math.floor(frameIndex + EPS);
  f = o.clamp ? clamp(f, 0, n - 1) : mod(f, n);
  const cols = s.cols || Math.floor(bmp.width / fs);
  const sx = (f % cols) * fs, sy = (row.row + Math.floor(f / cols)) * fs;
  const b = row.bounds;
  let ax = fs / 2, ay = fs / 2;
  if (Array.isArray(o.anchor)) { ax = o.anchor[0] * fs; ay = o.anchor[1] * fs; }
  else if (b) { ax = (b.minX + b.maxX + 1) / 2; ay = o.anchor === 'feet' ? b.maxY + 1 : (b.minY + b.maxY + 1) / 2; }
  let src = bmp, srcX = sx, srcY = sy;
  const needFx = o.tint || o.silhouette;
  if (needFx) {
    const T = surface('__spritefx', fs, fs);
    T.ctx.drawImage(bmp, sx, sy, fs, fs, 0, 0, fs, fs);
    T.ctx.globalCompositeOperation = o.silhouette ? 'source-in' : 'source-atop';
    T.ctx.globalAlpha = o.silhouette ? 1 : clamp01(o.tint.amount ?? 1);
    T.ctx.fillStyle = col(o.silhouette || o.tint.color || '#fff');
    T.ctx.fillRect(0, 0, fs, fs);
    src = T; srcX = 0; srcY = 0;
  }
  c.save();
  c.translate(o.snap ? Math.round(x) : x, o.snap ? Math.round(y) : y);
  if (o.rot) c.rotate(o.rot);
  c.scale(scale * (o.flip ? -1 : 1) * (o.sx ?? 1), scale * (o.sy ?? 1));
  c.imageSmoothingEnabled = false;
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (o.blend) c.globalCompositeOperation = o.blend;
  if (o.outline) {
    const O = surface('__spriteol', fs, fs);
    O.ctx.drawImage(bmp, sx, sy, fs, fs, 0, 0, fs, fs);
    O.ctx.globalCompositeOperation = 'source-in'; O.ctx.fillStyle = col(o.outline.color || '#000'); O.ctx.fillRect(0, 0, fs, fs);
    const px = o.outline.px ?? 1;
    for (const [dx, dy] of [[-px, 0], [px, 0], [0, -px], [0, px], [-px, -px], [px, px], [-px, px], [px, -px]])
      c.drawImage(O, 0, 0, fs, fs, -ax + dx, -ay + dy, fs, fs);
  }
  c.drawImage(src, srcX, srcY, fs, fs, -ax, -ay, fs, fs);
  c.restore();
}
const spriteFrame = (t, fps = 12) => Math.floor(t * fps + EPS);

const clipInfo = (name) => assets.clips[name] || null;
const clipDur = (name) => { const m = clipInfo(name); return m ? m.frames / (m.fps || 30) : 0; };
// Clip time for a 1-based file number (0001.jpg = 1) as used in clips.json descriptions.
const clipFrameTime = (name, fileNumber) => (fileNumber - 1 + 0.001) / (clipInfo(name)?.fps || 30);
// drawClip(ctx, clipName, clipTime, dx, dy, dw, dh, opts)
// opts: fit 'cover'(default)|'contain'|'stretch', fx, fy (focus 0..1), zoom, crop [x,y,w,h] (0..1),
//       loop, alpha, smooth, speed (multiplies clipTime)
function drawClip(c, name, clipTime, dx = 0, dy = 0, dw = W, dh = H, o = {}) {
  const meta = clipInfo(name);
  const ct = clipTime * (o.speed ?? 1);
  if (!meta) { placeholder(c, dx, dy, dw, dh, `clip "${name}" ${ct.toFixed(2)}s`, ct); return -1; }
  const n = meta.frames;
  let idx = Math.floor(ct * (meta.fps || 30) + EPS);
  idx = o.loop ? mod(idx, n) : clamp(idx, 0, n - 1);
  const bmp = getFrame(name, idx);
  if (!bmp) { placeholder(c, dx, dy, dw, dh, `${name} #${idx + 1}`, ct); return idx; }
  const bw = bmp.width, bh = bmp.height;
  const cr = o.crop || [0, 0, 1, 1];
  const rx = cr[0] * bw, ry = cr[1] * bh, rw = cr[2] * bw, rh = cr[3] * bh;
  c.save();
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  c.imageSmoothingEnabled = o.smooth ?? true;
  c.imageSmoothingQuality = 'high';
  if (o.fit === 'stretch') c.drawImage(bmp, rx, ry, rw, rh, dx, dy, dw, dh);
  else if (o.fit === 'contain') { const r = contain(rw, rh, dx, dy, dw, dh); c.drawImage(bmp, rx, ry, rw, rh, r.x, r.y, r.w, r.h); }
  else {
    const s = cover(rw, rh, dw, dh, o.fx ?? 0.5, o.fy ?? 0.5, o.zoom ?? 1);
    c.drawImage(bmp, rx + s.sx, ry + s.sy, s.sw, s.sh, dx, dy, dw, dh);
  }
  c.restore();
  return idx;
}

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------
function fontStr(o) {
  const fam = FONTS[o.font || 'display'] || o.font;
  return `${o.italic ? 'italic ' : ''}${o.weight || 'normal'} ${o.size || 64}px ${fam}`;
}
function layoutText(c, str, o) {
  c.font = fontStr(o); c.letterSpacing = '0px';
  const size = o.size || 64;
  const tr = (o.tracking || 0) * size;
  const xs = [], ws = [];
  for (let i = 0; i < str.length; i++) {
    xs.push(c.measureText(str.slice(0, i)).width + i * tr);
    ws.push(c.measureText(str[i]).width);
  }
  const width = str.length ? c.measureText(str).width + (str.length - 1) * tr : 0;
  return { xs, ws, width, tr };
}
// measureText(ctx, str, opts) -> width in px (with tracking)
function measureText(c, str, o = {}) { c.save(); const w = layoutText(c, String(str), o).width; c.restore(); return w; }
// drawText(ctx, str, x, y, opts) -> {width, height, left}
// opts: size, font ('display'|'ui'|'heavy'|'condensed'|'mono'|CSS family), weight, italic, color,
//   align 'center'|'left'|'right' (default center), baseline (default 'middle'), tracking (em),
//   alpha, stroke color, strokeWidth, strokeOnly, shadow {color, blur, x, y}, glow {color, blur},
//   extrude {depth, dx, dy, color, dark}, blend,
//   perChar(info) -> {x, y, rot, scale, sx, sy, alpha, color, stroke, skip} | false
//     info = {ch, i, n, cx, w, width}  (cx = char center relative to string start)
function drawText(c, str, x, y, o = {}) {
  str = String(str);
  c.save();
  const L = layoutText(c, str, o);
  const align = o.align || 'center';
  const left = align === 'center' ? x - L.width / 2 : align === 'right' ? x - L.width : x;
  c.textAlign = 'center'; c.textBaseline = o.baseline || 'middle';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (o.blend) c.globalCompositeOperation = o.blend;
  const n = str.length;
  const chars = [];
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    const cx = L.xs[i] + L.ws[i] / 2;
    const tf = o.perChar ? o.perChar({ ch, i, n, cx, w: L.ws[i], width: L.width }) : null;
    if (tf === false || tf?.skip || ch === ' ') continue;
    chars.push({ ch, px: left + cx, tf: tf || {} });
  }
  const passes = [];
  const ex = o.extrude;
  if (ex && ex.depth > 0) {
    const d = Math.ceil(ex.depth);
    for (let k = d; k >= 1; k--) passes.push({ ox: (ex.dx ?? 0.7) * k, oy: (ex.dy ?? 1) * k, fill: ex.dark ? shade(col(ex.color || '#000'), -(ex.dark * k) / d) : col(ex.color || '#000'), extr: true });
  }
  if (o.stroke && o.strokeWidth) passes.push({ ox: 0, oy: 0, stroke: col(o.stroke), lw: o.strokeWidth });
  if (!o.strokeOnly) passes.push({ ox: 0, oy: 0, fill: null, face: true });
  for (const ps of passes) {
    for (const { ch, px, tf } of chars) {
      c.save();
      c.translate(px + (tf.x || 0) + ps.ox, y + (tf.y || 0) + ps.oy);
      if (tf.rot) c.rotate(tf.rot);
      const sc = tf.scale ?? 1;
      if (sc !== 1 || tf.sx != null || tf.sy != null) c.scale(sc * (tf.sx ?? 1), sc * (tf.sy ?? 1));
      if (tf.alpha != null) c.globalAlpha *= clamp01(tf.alpha);
      if (ps.stroke) {
        c.lineJoin = 'round'; c.lineWidth = ps.lw; c.strokeStyle = tf.stroke ? col(tf.stroke) : ps.stroke;
        c.strokeText(ch, 0, 0);
      } else {
        if (ps.face) {
          c.fillStyle = col(tf.color || o.color || '#fff');
          const sh = o.glow || o.shadow;
          if (sh) { c.shadowColor = col(sh.color || '#000'); c.shadowBlur = sh.blur ?? 20; c.shadowOffsetX = sh.x || 0; c.shadowOffsetY = sh.y || 0; }
        } else c.fillStyle = ps.fill;
        c.fillText(ch, 0, 0);
      }
      c.restore();
    }
  }
  c.restore();
  return { width: L.width, height: o.size || 64, left };
}
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@!?/<>*+=';
// scramble(str, p, seed) -> decoding text: chars resolve left->right as p goes 0..1, rest random.
function scramble(str, p, seed = 0, charset = GLYPHS) {
  const n = str.length; let out = '';
  const fr = E.frame >> 1;
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    const th = (i + rand(seed, i) * 3) / (n + 3);
    out += ch === ' ' || p >= 1 || th < p ? ch : charset[Math.floor(rand(seed, i, fr) * charset.length)];
  }
  return out;
}
const typewriter = (str, p) => str.slice(0, Math.floor(clamp01(p) * str.length + EPS));

// ---------------------------------------------------------------------------------------------
// Paths / masks
// ---------------------------------------------------------------------------------------------
const path = {
  rect: (c, x, y, w, h) => c.rect(x, y, w, h),
  roundRect: (c, x, y, w, h, r = 16) => c.roundRect(x, y, w, h, r),
  circle: (c, x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, Math.max(0, r), 0, TAU); },
  ellipse: (c, x, y, rx, ry, rot = 0) => c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU),
  poly: (c, pts) => {
    const P = Array.isArray(pts[0]) ? pts : pts.reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []);
    P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  },
  diamond: (c, x, y, w, h = w) => { c.moveTo(x, y - h / 2); c.lineTo(x + w / 2, y); c.lineTo(x, y + h / 2); c.lineTo(x - w / 2, y); c.closePath(); },
  star: (c, x, y, r, inner = 0.5, points = 5, rot = -PI / 2) => {
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i * PI) / points, rr = i % 2 ? r * inner : r;
      i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  },
  // Half-plane: everything with dot(p - (cx,cy), dir(angle)) <= d
  halfPlane: (c, angle, d, cx = W / 2, cy = H / 2) => {
    const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx, B = 5000;
    const lx = cx + dx * d, ly = cy + dy * d;
    c.moveTo(lx + nx * B, ly + ny * B); c.lineTo(lx - nx * B, ly - ny * B);
    c.lineTo(lx - nx * B - dx * B, ly - ny * B - dy * B); c.lineTo(lx + nx * B - dx * B, ly + ny * B - dy * B); c.closePath();
  },
};
// mask(ctx, pathFn(ctx), drawFn(ctx), {invert}) : clip drawing to a path.
function mask(c, pathFn, drawFn, o = {}) {
  c.save(); c.beginPath();
  if (o.invert) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.rect(-10, -10, c.canvas.width + 20, c.canvas.height + 20); c.restore(); }
  pathFn(c);
  c.clip(o.invert ? 'evenodd' : 'nonzero');
  drawFn(c);
  c.restore();
}
// Linear wipe reveal: p 0..1, angle = direction the edge travels (0 = left->right).
function wipe(c, p, drawFn, { angle = 0, cx = W / 2, cy = H / 2, w = W, h = H } = {}) {
  if (p <= 0) return; if (p >= 1) { drawFn(c); return; }
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const ext = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
  mask(c, (cc) => path.halfPlane(cc, angle, lerp(-ext, ext, p), cx, cy), drawFn);
}
// Iris (circle) reveal.
function iris(c, p, drawFn, { cx = W / 2, cy = H / 2, r = Math.hypot(W, H) / 2 } = {}) {
  if (p <= 0) return; mask(c, (cc) => path.circle(cc, cx, cy, p * r), drawFn);
}
// Diamond (iso) reveal.
function diamondReveal(c, p, drawFn, { cx = W / 2, cy = H / 2, size = W + H, aspect = 1 } = {}) {
  if (p <= 0) return; mask(c, (cc) => path.diamond(cc, cx, cy, p * size, p * size * aspect), drawFn);
}
// Parallelogram strips across a rect, for diagonal panel layouts.
// slices(n, {angle (skew, rad), gap, x, y, w, h}) -> [{pts:[[x,y]x4], cx, cy, x0, x1}]
function slices(n, { angle = deg(15), gap = 0, x = 0, y = 0, w = W, h = H } = {}) {
  const s = Math.tan(angle) * h, out = [];
  for (let i = 0; i < n; i++) {
    let x0 = x + (i * w) / n + gap / 2, x1 = x + ((i + 1) * w) / n - gap / 2;
    const e0 = i === 0 ? -Math.abs(s) : 0, e1 = i === n - 1 ? Math.abs(s) : 0;
    const pts = [[x0 + s / 2 + e0, y], [x1 + s / 2 + e1, y], [x1 - s / 2 + e1, y + h], [x0 - s / 2 + e0, y + h]];
    out.push({ pts, cx: (x0 + x1) / 2, cy: y + h / 2, x0, x1 });
  }
  return out;
}
// Pixel dissolve: cells appear as p goes 0..1. order 'random' | 'radial' | 'left' | fn(i,j,cols,rows)->0..1
function pixelDissolve(c, p, drawFn, { cell = 24, seed = 1, order = 'random', mix: m = 0.5, x = 0, y = 0, w = W, h = H, cx = W / 2, cy = H / 2 } = {}) {
  if (p <= 0) return; if (p >= 1) { drawFn(c); return; }
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), maxD = Math.hypot(w, h) / 2;
  mask(c, (cc) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = x + i * cell, py = y + j * cell;
      let th = rand(seed, i, j);
      if (order === 'radial') th = lerp(Math.hypot(px + cell / 2 - cx, py + cell / 2 - cy) / maxD, th, m);
      else if (order === 'left') th = lerp(i / cols, th, m);
      else if (typeof order === 'function') th = order(i, j, cols, rows);
      if (th < p) cc.rect(px, py, cell + 0.5, cell + 0.5);
    }
  }, drawFn);
}
// Gradient alpha mask (soft wipe): draws fn into a layer and multiplies alpha by a linear gradient.
function fadeMask(c, drawFn, { x0 = 0, y0 = 0, x1 = W, y1 = 0, stops = [[0, 1], [1, 0]] } = {}) {
  layer(c, drawFn, {
    post: (lc) => {
      const g = lc.createLinearGradient(x0, y0, x1, y1);
      for (const [o, a] of stops) g.addColorStop(clamp01(o), `rgba(0,0,0,${clamp01(a)})`);
      lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = g; lc.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Camera / shake / motion
// ---------------------------------------------------------------------------------------------
// shake(t, amp, freq, seed) -> {x, y, r} smooth noise offset
function shake(t, amp = 10, freq = 18, seed = 1) {
  return { x: perlin1(t * freq, seed) * amp, y: perlin1(t * freq, seed + 101) * amp, r: perlin1(t * freq, seed + 202) * amp * 0.0012 };
}
// camera(ctx, {x, y, zoom, rot, cx, cy, shake, shakeFreq, seed, t}, fn)
function camera(c, cam, fn) {
  const cx = cam.cx ?? W / 2, cy = cam.cy ?? H / 2;
  const sh = cam.shake ? shake(cam.t ?? E.t, cam.shake, cam.shakeFreq ?? 18, cam.seed ?? 7) : { x: 0, y: 0, r: 0 };
  c.save();
  c.translate(cx + (cam.x || 0) + sh.x, cy + (cam.y || 0) + sh.y);
  c.rotate((cam.rot || 0) + sh.r);
  const z = cam.zoom ?? 1; c.scale(z * (cam.sx ?? 1), z * (cam.sy ?? 1));
  c.translate(-cx, -cy);
  fn(c);
  c.restore();
}
// smear(ctx, t, fn(ctx, tt, k), {dt, samples, alpha, falloff}): onion-skin trail of fn sampled back in time.
function smear(c, t, fn, { dt = 1 / 30, samples = 6, alpha = 0.6, falloff = 1.6 } = {}) {
  for (let k = samples - 1; k >= 1; k--) {
    c.save(); c.globalAlpha *= alpha * Math.pow(1 - k / samples, falloff);
    fn(c, t - (k * dt) / (samples - 1), k); c.restore();
  }
  fn(c, t, 0);
}
// dirBlur(ctx, fn(ctx), dx, dy, samples): directional smear of a static draw along a vector.
function dirBlur(c, fn, dx, dy, samples = 6, alpha = 0.5) {
  for (let k = samples - 1; k >= 1; k--) {
    c.save(); c.globalAlpha *= alpha * (1 - k / samples); c.translate((dx * k) / (samples - 1), (dy * k) / (samples - 1)); fn(c); c.restore();
  }
  fn(c);
}
// squash(vx, vy, k) -> {rot, sx, sy}: stretch along the velocity (px/s) for cartoon smear.
function squash(vx, vy, k = 0.0006, max = 0.8) {
  const v = Math.hypot(vx, vy), s = Math.min(max, v * k);
  return { rot: Math.atan2(vy, vx), sx: 1 + s, sy: 1 / (1 + s) };
}
// Velocity of a scalar function by finite difference (px/s).
const vel = (fn, t, h = 1 / 240) => (fn(t + h) - fn(t - h)) / (2 * h);

// ---------------------------------------------------------------------------------------------
// Particles (pure functions of t)
// ---------------------------------------------------------------------------------------------
// particles(seed, count, t, fn(p)) : p = {i, n, u, t, seed, r(k)} with r(k) a stable random per particle.
function particles(seed, count, t, fn) {
  for (let i = 0; i < count; i++) {
    const p = { i, n: count, u: count > 1 ? i / (count - 1) : 0, t, seed, r: (k = 0) => rand(seed, i, k) };
    fn(p, i);
  }
}
// Closed-form motion with gravity g (px/s^2, +y down) and linear drag k (1/s).
function ballistic(x0, y0, vx, vy, g, k, a) {
  if (k < 1e-4) return [x0 + vx * a, y0 + vy * a + 0.5 * g * a * a];
  const e = (1 - Math.exp(-k * a)) / k;
  return [x0 + vx * e, y0 + (g / k) * a + (vy - g / k) * e];
}
const range2 = (v, r) => (Array.isArray(v) ? lerp(v[0], v[1], r) : v);
// burst({seed, count, t, t0, x, y, speed:[a,b], angle:[a,b], gravity, drag, life:[a,b], size:[a,b], spin, delay})
//  -> alive particles [{i, x, y, age, life, p (0..1 of life), alpha, size, rot, r(k)}]
function burst(o) {
  const { seed = 1, count = 40, t, t0 = 0, x = W / 2, y = H / 2, speed = [300, 900], angle = [0, TAU], gravity = 900, drag = 1.5, life = [0.6, 1.2], size = [4, 12], spin = 6, delay = 0 } = o;
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = (k) => rand(seed, i, k);
    const born = t0 + r(9) * delay;
    const age = t - born, lf = range2(life, r(1));
    if (age < 0 || age > lf) continue;
    const a = range2(angle, r(2)), sp = range2(speed, r(3));
    const [px, py] = ballistic(x, y, Math.cos(a) * sp, Math.sin(a) * sp, gravity, drag, age);
    const pp = age / lf;
    out.push({ i, x: px, y: py, age, life: lf, p: pp, alpha: 1 - pp, size: range2(size, r(4)), rot: (r(5) - 0.5) * spin * age + r(6) * TAU, r, angle: a });
  }
  return out;
}
// stream({seed, rate, t, t0, t1, life:[a,b], x, y, spawn(r)->{x,y,vx,vy}, gravity, drag}) : continuous emitter.
function stream(o) {
  const { seed = 1, rate = 60, t, t0 = 0, t1 = Infinity, life = [0.5, 1], gravity = 0, drag = 0, spawn } = o;
  const maxLife = Array.isArray(life) ? Math.max(...life) : life;
  const out = [];
  const iFirst = Math.max(0, Math.floor((t - t0 - maxLife) * rate));
  const iLast = Math.floor((Math.min(t, t1) - t0) * rate);
  for (let i = iFirst; i <= iLast; i++) {
    const r = (k) => rand(seed, i, k);
    const born = t0 + (i + r(8)) / rate;
    const age = t - born, lf = range2(life, r(1));
    if (age < 0 || age > lf || born > t1) continue;
    const s = spawn ? spawn(r, i) : { x: o.x ?? W / 2, y: o.y ?? H / 2, vx: (r(2) - 0.5) * 400, vy: (r(3) - 0.5) * 400 };
    const [px, py] = ballistic(s.x, s.y, s.vx || 0, s.vy || 0, gravity, drag, age);
    out.push({ i, x: px, y: py, age, life: lf, p: age / lf, alpha: 1 - age / lf, r, ...s, x0: s.x, y0: s.y, x: px, y: py });
  }
  return out;
}
// Quadratic bezier / arc helpers for "fly into the counter" motions.
const bezier2 = (p0, c, p1, u) => [lerp(lerp(p0[0], c[0], u), lerp(c[0], p1[0], u), u), lerp(lerp(p0[1], c[1], u), lerp(c[1], p1[1], u), u)];
const arcTo = (p0, p1, u, height = -200) => bezier2(p0, [(p0[0] + p1[0]) / 2, Math.min(p0[1], p1[1]) + height], p1, u);

// ---------------------------------------------------------------------------------------------
// Shapes / graphic elements
// ---------------------------------------------------------------------------------------------
// shockwave(ctx, x, y, p, {radius, width, color, rings, gap, ease, fill})
function shockwave(c, x, y, p, { radius = 500, width = 40, color = '#fff', rings = 1, gap = 0.15, ease: e = 'expoOut', alpha = 1, fill = null } = {}) {
  c.save();
  for (let k = 0; k < rings; k++) {
    const q = clamp01((p - k * gap) / (1 - k * gap * 0.5));
    if (q <= 0 || q >= 1) continue;
    const r = ease(e)(q) * radius * (1 - k * 0.12);
    if (fill) { c.globalAlpha = alpha * (1 - q) * 0.25; c.fillStyle = col(fill); c.beginPath(); path.circle(c, x, y, r); c.fill(); }
    c.globalAlpha = alpha * Math.pow(1 - q, 1.2);
    c.strokeStyle = col(color); c.lineWidth = Math.max(0.5, width * Math.pow(1 - q, 1.5));
    c.beginPath(); path.circle(c, x, y, r); c.stroke();
  }
  c.restore();
}
// speedLines(ctx, t, {cx, cy, count, inner, outer, width:[a,b], color, alpha, seed, fps})  radial anime lines
function speedLines(c, t, { cx = W / 2, cy = H / 2, count = 90, inner = 320, outer = 1500, width = [2, 14], color = '#fff', alpha = 0.8, seed = 3, fps = 24, jitter = 0.35 } = {}) {
  const fr = Math.floor(t * fps + EPS);
  c.save(); c.fillStyle = col(color);
  for (let i = 0; i < count; i++) {
    const r = (k) => rand(seed, i, fr, k);
    if (r(0) < 0.3) continue;
    const a = (i / count) * TAU + (r(1) - 0.5) * 0.08;
    const r0 = inner * (1 + (r(2) - 0.3) * jitter), wd = range2(width, r(3)) / 2;
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    c.globalAlpha = alpha * (0.4 + 0.6 * r(4));
    c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0);
    c.lineTo(cx + ca * outer + nx * wd, cy + sa * outer + ny * wd); c.lineTo(cx + ca * outer - nx * wd, cy + sa * outer - ny * wd); c.closePath(); c.fill();
  }
  c.restore();
}
// speedLinesDir(ctx, t, {angle, count, speed, length:[a,b], width:[a,b], color, alpha, seed, x,y,w,h}) parallel streaks
function speedLinesDir(c, t, { angle = 0, count = 40, speed = 4000, length = [200, 700], width = [2, 6], color = '#fff', alpha = 0.6, seed = 5, x = 0, y = 0, w = W, h = H } = {}) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.translate(x + w / 2, y + h / 2); c.rotate(angle);
  const span = Math.hypot(w, h);
  c.fillStyle = col(color);
  for (let i = 0; i < count; i++) {
    const r = (k) => rand(seed, i, k);
    const len = range2(length, r(1)), wd = range2(width, r(2));
    const off = r(3) * span, lane = (r(4) - 0.5) * span;
    const px = mod(off + t * speed * (0.6 + r(5) * 0.8), span + len) - span / 2 - len;
    c.globalAlpha = alpha * (0.3 + 0.7 * r(6));
    c.fillRect(px, lane - wd / 2, len, wd);
  }
  c.restore();
}
// star(ctx, x, y, r, {inner, points, rot, fill, stroke, lineWidth})
function star(c, x, y, r, { inner = 0.5, points = 5, rot = -PI / 2, fill = '#ffc93c', stroke = null, lineWidth = 6 } = {}) {
  c.save(); c.beginPath(); path.star(c, x, y, r, inner, points, rot);
  if (fill) { c.fillStyle = col(fill); c.fill(); }
  if (stroke) { c.lineJoin = 'round'; c.lineWidth = lineWidth; c.strokeStyle = col(stroke); c.stroke(); }
  c.restore();
}
// Iso diamond grid. isoGrid(ctx, {cx, cy, tile, cols, rows, color, lineWidth, alpha, fill(i,j)->color|null, reveal 0..1})
function isoToScreen(i, j, { cx = W / 2, cy = H / 2, tile = 96, cols = 12, rows = 12 } = {}) {
  const hw = tile / 2, hh = tile / 4;
  const ii = i - cols / 2, jj = j - rows / 2;
  return [cx + (ii - jj) * hw, cy + (ii + jj) * hh];
}
function isoGrid(c, o = {}) {
  const { tile = 96, cols = 12, rows = 12, color = '#9966cc', lineWidth = 2, alpha = 1, fill = null, reveal = 1, cx = W / 2, cy = H / 2, seed = 4 } = o;
  const hw = tile / 2, hh = tile / 4, maxD = Math.hypot(cols, rows) / 2;
  c.save(); c.globalAlpha *= alpha; c.lineWidth = lineWidth; c.strokeStyle = col(color); c.lineJoin = 'round';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = Math.hypot(i - cols / 2 + 0.5, j - rows / 2 + 0.5) / maxD;
    const th = d * 0.8 + rand(seed, i, j) * 0.2;
    if (th > reveal) continue;
    const [x, y] = isoToScreen(i + 0.5, j + 0.5, { cx, cy, tile, cols, rows });
    c.beginPath(); c.moveTo(x, y - hh); c.lineTo(x + hw, y); c.lineTo(x, y + hh); c.lineTo(x - hw, y); c.closePath();
    const f = fill && fill(i, j);
    if (f) { c.fillStyle = col(f); c.fill(); }
    c.stroke();
  }
  c.restore();
}
// Vision cone (guard dog). cone(ctx, x, y, angle, spread, length, {color, alpha, rings})
function cone(c, x, y, angle, spread = deg(50), length = 600, { color = '#ffc62e', alpha = 0.35, edge = 0.9 } = {}) {
  c.save();
  const g = c.createRadialGradient(x, y, 0, x, y, length);
  g.addColorStop(0, rgba(color, alpha)); g.addColorStop(edge, rgba(color, alpha * 0.5)); g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g; c.beginPath(); c.moveTo(x, y); c.arc(x, y, length, angle - spread / 2, angle + spread / 2); c.closePath(); c.fill();
  c.restore();
}

// ---------------------------------------------------------------------------------------------
// Post / FX (operate on what is already drawn on ctx, in screen space)
// ---------------------------------------------------------------------------------------------
// glitch(ctx, {amount 0..1, seed, slices, maxShift, blocks, region {x,y,w,h}, colors})
function glitch(c, o = {}) {
  const amount = o.amount ?? 0.5; if (amount <= 0) return;
  const seed = o.seed ?? (E.frame >> 1);
  const r = o.region || { x: 0, y: 0, w: c.canvas.width, h: c.canvas.height };
  const S = snapshot(c, '__glitch', r);
  const R = rng('glitch' + seed);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  const n = o.slices ?? Math.round(4 + amount * 18);
  const maxShift = (o.maxShift ?? 120) * amount;
  for (let i = 0; i < n; i++) {
    const sh = Math.max(2, R() * R() * r.h * 0.18 * (0.3 + amount));
    const sy = R() * (r.h - sh);
    const dx = (R() * 2 - 1) * maxShift;
    c.drawImage(S, 0, sy, r.w, sh, r.x + dx, r.y + sy, r.w, sh);
    if (R() < 0.25 * amount) { // channel-tinted slice
      c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.5;
      c.fillStyle = R() < 0.5 ? '#ff0044' : '#00e5ff';
      c.fillRect(r.x + dx, r.y + sy, r.w, sh);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
  }
  if (o.blocks !== false) {
    const colors = o.colors || ['#9be15d', '#ff2e22', '#ffffff', '#00e5ff'];
    const nb = Math.round(amount * 10);
    for (let i = 0; i < nb; i++) {
      c.globalAlpha = 0.35 + R() * 0.5; c.fillStyle = colors[Math.floor(R() * colors.length)];
      c.globalCompositeOperation = R() < 0.5 ? 'difference' : 'source-over';
      c.fillRect(r.x + R() * r.w, r.y + R() * r.h, 8 + R() * 220 * amount, 2 + R() * 26 * amount);
    }
  }
  c.restore();
}
// rgbSplit(ctx, amount px, {angle, region, opaque}) : chromatic aberration by channel offset.
function rgbSplit(c, amount = 6, o = {}) {
  if (!amount) return;
  const r = o.region || { x: 0, y: 0, w: c.canvas.width, h: c.canvas.height };
  const opaque = o.opaque ?? !!c.__opaque;
  const S = snapshot(c, '__rgbsrc', r);
  const C = surface('__rgbch', r.w, r.h);
  const a = o.angle ?? 0, dx = Math.cos(a) * amount, dy = Math.sin(a) * amount;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  if (opaque) { c.fillStyle = '#000'; c.fillRect(r.x, r.y, r.w, r.h); } else c.clearRect(r.x, r.y, r.w, r.h);
  const chans = [['#ff0000', dx, dy], ['#00ff00', 0, 0], ['#0000ff', -dx, -dy]];
  for (const [cc, ox, oy] of chans) {
    C.ctx.globalCompositeOperation = 'source-over'; C.ctx.clearRect(0, 0, r.w, r.h); C.ctx.drawImage(S, 0, 0);
    C.ctx.globalCompositeOperation = 'multiply'; C.ctx.fillStyle = cc; C.ctx.fillRect(0, 0, r.w, r.h);
    if (!opaque) { C.ctx.globalCompositeOperation = 'destination-in'; C.ctx.drawImage(S, 0, 0); }
    c.globalCompositeOperation = 'lighter';
    c.drawImage(C, r.x + ox, r.y + oy);
  }
  c.restore();
}
// Radial chromatic aberration (stronger at edges): scales R/B channels around a center.
function rgbZoom(c, amount = 0.006, { cx = W / 2, cy = H / 2 } = {}) {
  if (!amount) return;
  const S = snapshot(c, '__rgbsrc'); const C = surface('__rgbch', W, H);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  for (const [cc, s] of [['#ff0000', 1 + amount], ['#00ff00', 1], ['#0000ff', 1 - amount]]) {
    C.ctx.globalCompositeOperation = 'source-over'; C.ctx.clearRect(0, 0, W, H);
    C.ctx.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); C.ctx.drawImage(S, 0, 0); C.ctx.setTransform(1, 0, 0, 1, 0, 0);
    C.ctx.globalCompositeOperation = 'multiply'; C.ctx.fillStyle = cc; C.ctx.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter'; c.drawImage(C, 0, 0);
  }
  c.restore();
}
// zoomBlur(ctx, {cx, cy, strength, samples}) : radial blur of the current canvas.
function zoomBlur(c, { cx = W / 2, cy = H / 2, strength = 0.08, samples = 8 } = {}) {
  if (strength <= 0) return;
  const S = snapshot(c, '__zb');
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  for (let k = 1; k < samples; k++) {
    const s = 1 + (strength * k) / (samples - 1);
    c.globalAlpha = 1 / (k + 1);
    c.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); c.drawImage(S, 0, 0);
  }
  c.restore();
}
// pixelate(ctx, size, region) : blocky mosaic of the current canvas.
function pixelate(c, size = 16, region) {
  if (size <= 1) return;
  const r = region || { x: 0, y: 0, w: c.canvas.width, h: c.canvas.height };
  const sw = Math.max(1, Math.round(r.w / size)), shh = Math.max(1, Math.round(r.h / size));
  const S = surface('__pix', sw, shh);
  S.ctx.imageSmoothingEnabled = true; S.ctx.drawImage(c.canvas, r.x, r.y, r.w, r.h, 0, 0, sw, shh);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
  c.clearRect(r.x, r.y, r.w, r.h); c.drawImage(S, 0, 0, sw, shh, r.x, r.y, r.w, r.h);
  c.restore();
}
// scanlines(ctx, {alpha, spacing, thickness, offset, color})
function scanlines(c, { alpha = 0.16, spacing = 4, thickness = 2, offset = 0, color = '#000' } = {}) {
  const key = `${spacing}|${thickness}|${color}`;
  if (!tex.scan || tex.scanKey !== key) {
    const p = new OffscreenCanvas(4, spacing); const x = p.getContext('2d');
    x.fillStyle = col(color); x.fillRect(0, 0, 4, thickness); tex.scan = p; tex.scanKey = key;
  }
  const pat = c.createPattern(tex.scan, 'repeat');
  pat.setTransform(new DOMMatrix().translate(0, mod(offset, spacing)));
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha; c.fillStyle = pat; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
}
// vignette(ctx, strength, {inner, color})
function vignette(c, strength = 0.4, { inner = 0.45, color = '#000' } = {}) {
  if (strength <= 0) return;
  const w = c.canvas.width, h = c.canvas.height;
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * inner, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, clamp01(strength)));
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
}
// grain(ctx, amount, seed, {blend, scale}) : film grain from prebuilt seeded tiles.
function grain(c, amount = 0.06, seed = E.frame, { blend = 'overlay', scale = 1 } = {}) {
  if (amount <= 0 || !tex.grain.length) return;
  const tile = tex.grain[mod(seed, tex.grain.length)];
  const pat = c.createPattern(tile, 'repeat');
  pat.setTransform(new DOMMatrix().translate(Math.floor(rand('gx', seed) * 256), Math.floor(rand('gy', seed) * 256)).scale(scale));
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = blend; c.globalAlpha = clamp01(amount);
  c.fillStyle = pat; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
}
// flash(ctx, a, color, blend)
function flash(c, a = 1, color = '#fff', blend = 'source-over') {
  if (a <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = clamp01(a); c.globalCompositeOperation = blend;
  c.fillStyle = col(color); c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
}
// lightLeak(ctx, t, {seed, intensity, colors, speed}) : drifting warm blobs, screen blended.
function lightLeak(c, t, { seed = 1, intensity = 0.5, colors = ['#ff7a1a', '#ffc93c', '#ff2e6e'], speed = 0.35, blobs = 3 } = {}) {
  if (intensity <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < blobs; i++) {
    const x = W * (0.5 + 0.6 * perlin1(t * speed + i * 7.3, seed + i));
    const y = H * (0.5 + 0.6 * perlin1(t * speed * 0.8 + i * 3.1, seed + i + 50));
    const r = W * (0.35 + 0.25 * (perlin1(t * speed * 0.5, seed + i + 90) + 1) / 2);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const cc = colors[i % colors.length];
    g.addColorStop(0, rgba(cc, intensity)); g.addColorStop(0.5, rgba(cc, intensity * 0.35)); g.addColorStop(1, rgba(cc, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  c.restore();
}
// crt(ctx, t, {scan, roll, flicker, vignette, tint, tintAlpha}) : security-cam look in one call.
function crt(c, t, { scan = 0.22, roll = 0.08, flicker = 0.05, vignette: vg = 0.55, tint = null, tintAlpha = 0.12 } = {}) {
  scanlines(c, { alpha: scan, spacing: 4, thickness: 2, offset: t * 30 });
  if (roll > 0) {
    const y = mod(t * 260, H + 300) - 150;
    const g = c.createLinearGradient(0, y - 150, 0, y + 150);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${roll})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = g; c.fillRect(0, y - 150, W, 300); c.restore();
  }
  if (tint) flash(c, tintAlpha, tint, 'color');
  if (flicker > 0) flash(c, flicker * (0.5 + 0.5 * noise1(t * 40, 99)), '#000');
  vignette(c, vg, { inner: 0.3 });
}
// Security-cam HUD bits: recDot, timecode string
const timecode = (t, fps = 30) => {
  const s = Math.floor(t), f = Math.floor((t - s) * fps + EPS);
  const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  return [hh, mm, ss, f].map((v) => String(v).padStart(2, '0')).join(':');
};

// ---------------------------------------------------------------------------------------------
// Scenes + frame rendering
// ---------------------------------------------------------------------------------------------
const SCENE_FILES = ['s1', 's2', 's3', 's4'];
const SCENE_RANGES = { s1: [0, BAR * 2], s2: [BAR * 2, BAR * 4], s3: [BAR * 4, BAR * 6], s4: [BAR * 6, DURATION] };
const scenes = [];
async function loadScenes() {
  const bust = Date.now();
  for (const name of SCENE_FILES) {
    const url = `./scenes/${name}.js`;
    let exists = false;
    try { exists = (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok; } catch {}
    const [ds, de] = SCENE_RANGES[name];
    if (!exists) { warn(`scene ${name} missing`); continue; }
    try {
      const mod_ = await import(`${url}?v=${bust}`);
      const s = mod_.default || {};
      const sc = { name, start: s.start ?? ds, end: s.end ?? de, draw: s.draw, fx: s.fx, init: s.init };
      if (typeof sc.draw !== 'function') throw new Error('default export has no draw()');
      if (sc.init) await sc.init(E);
      scenes.push(sc);
    } catch (e) {
      const msg = `scene ${name} failed to load: ${e.message}`;
      errors.push(msg); console.error(msg);
      scenes.push({ name, start: ds, end: de, broken: msg, draw: (c) => errorBox(c, msg) });
    }
  }
}
function errorBox(c, msg) {
  c.save(); resetCtx(c);
  c.fillStyle = 'rgba(160,0,0,.85)'; c.fillRect(40, 40, W - 80, 120);
  c.fillStyle = '#fff'; c.font = `28px ${FONTS.mono}`; c.textBaseline = 'middle';
  c.fillText(msg.slice(0, 110), 70, 100);
  c.restore();
}
const isActive = (s, t) => t + EPS >= s.start && t + EPS < s.end;
const activeScenes = (t) => scenes.filter((s) => isActive(s, t));

function collectFx(t) {
  const fx = { shake: 0, shakeFreq: 18, aberration: 0, aberrationAngle: 0, flash: 0, flashColor: '#fff', glitch: 0, zoom: 1, rot: 0, motionBlur: 0, invert: 0, grain: null, vignette: null, pixelate: 0 };
  for (const s of activeScenes(t)) {
    if (!s.fx) continue;
    let f;
    try { f = s.fx(t, t - s.start, E); } catch (e) { reportError(s, e); continue; }
    if (!f) continue;
    fx.shake += f.shake || 0;
    if (f.shakeFreq) fx.shakeFreq = f.shakeFreq;
    fx.aberration += f.aberration || 0;
    if (f.aberrationAngle != null) fx.aberrationAngle = f.aberrationAngle;
    if ((f.flash || 0) > fx.flash) { fx.flash = f.flash; if (f.flashColor) fx.flashColor = f.flashColor; }
    fx.glitch = Math.max(fx.glitch, f.glitch || 0);
    fx.zoom *= f.zoom ?? 1;
    fx.rot += f.rot || 0;
    fx.motionBlur = Math.max(fx.motionBlur, f.motionBlur || 0);
    if (f.cut != null) fx.cut = Math.max(fx.cut ?? -Infinity, f.cut);
    fx.invert = Math.max(fx.invert, f.invert || 0);
    fx.pixelate = Math.max(fx.pixelate, f.pixelate || 0);
    if (f.grain != null) fx.grain = f.grain;
    if (f.vignette != null) fx.vignette = f.vignette;
  }
  return fx;
}
const reported = new Set();
function reportError(s, e) {
  const msg = `${s.name}: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`;
  if (!reported.has(msg)) { reported.add(msg); errors.push(msg); console.error('[scene]', msg); }
  return msg;
}

function drawScenes(c, t) {
  resetCtx(c);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const fx = collectFx(t);
  const sh = fx.shake ? shake(t, fx.shake, fx.shakeFreq, 11) : { x: 0, y: 0, r: 0 };
  const over = fx.shake ? 1 + (fx.shake * 2.2) / W : 1; // overscan so shake never shows edges
  c.translate(W / 2 + sh.x, H / 2 + sh.y); c.rotate(sh.r + fx.rot); c.scale(fx.zoom * over, fx.zoom * over); c.translate(-W / 2, -H / 2);
  const base = c.getTransform();
  for (const s of scenes) {
    if (!isActive(s, t)) continue;
    c.save();
    resetCtx(c); c.setTransform(base);
    try { s.draw(c, t, t - s.start, E); }
    catch (e) { const m = reportError(s, e); c.restore(); c.save(); errorBox(c, m); }
    c.restore();
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

function renderFrame(t, c = ctx) {
  misses = new Set(); usedThisFrame = new Set();
  E.t = t; E.frame = Math.round(t * FPS);
  const fx = collectFx(t);
  const samples = Math.max(config.motionBlur | 0, fx.motionBlur | 0);
  if (samples > 1) {
    const A = surface('__acc'), S = surface('__sub');
    S.ctx.__opaque = true;
    const span = config.shutter / FPS;
    // The shutter never straddles a hard cut: sub-samples are clamped to the latest 16th-note grid
    // line (or scene-declared fx.cut) inside the shutter window, so every beat frame is sharp.
    const g16 = BEAT / 4;
    let cut = Math.floor((t + EPS) / g16) * g16;
    if (fx.cut != null && fx.cut <= t + EPS && fx.cut > cut) cut = fx.cut;
    const floorT = cut > t - span - EPS ? cut : -Infinity;
    for (let k = 0; k < samples; k++) {
      const tt = Math.max(floorT, t - span * (1 - k / (samples - 1)));
      E.t = tt;
      drawScenes(S.ctx, tt);
      A.ctx.globalAlpha = 1 / (k + 1); A.ctx.drawImage(S, 0, 0);
    }
    E.t = t;
    resetCtx(c); c.drawImage(A, 0, 0);
  } else drawScenes(c, t);
  // global post
  resetCtx(c);
  if (fx.pixelate > 1) pixelate(c, fx.pixelate);
  if (fx.glitch > 0) glitch(c, { amount: fx.glitch });
  if (fx.aberration > 0) rgbSplit(c, fx.aberration, { angle: fx.aberrationAngle, opaque: true });
  if (config.post) vignette(c, fx.vignette ?? config.vignette);
  if (fx.invert > 0) flash(c, fx.invert, '#fff', 'difference');
  if (fx.flash > 0) flash(c, fx.flash, fx.flashColor);
  if (config.post) grain(c, fx.grain ?? config.grain, E.frame);
  return { misses: misses.size };
}

async function frameExact(t) {
  for (let pass = 0; pass < 8; pass++) {
    renderFrame(t);
    if (!misses.size) break;
    await Promise.all([...misses].map((k) => { const i = k.lastIndexOf('#'); return requestFrame(k.slice(0, i), +k.slice(i + 1)); }));
  }
  // prefetch the next frames of every clip used (awaited implicitly next call)
  for (const k of usedThisFrame) {
    const i = k.lastIndexOf('#'); const name = k.slice(0, i), idx = +k.slice(i + 1);
    const n = assets.clips[name]?.frames || 0;
    for (let d = 1; d <= 2; d++) if (idx + d < n) requestFrame(name, idx + d);
  }
  evictCache();
}

// ---------------------------------------------------------------------------------------------
// The helper object handed to scenes
// ---------------------------------------------------------------------------------------------
const E = {
  // constants
  W, H, FPS, DURATION, BPM, BEAT, BAR, BEATS, BARS, TAU, PI, EPS, mode: MODE, config,
  t: 0, frame: 0,
  // math
  clamp, clamp01, lerp, invLerp, remap, fract, mod, smoothstep, smootherstep, pingpong, lerpArr, dist, deg, step, quantize,
  // easing
  Ease, ease, bezier, spring, ...Ease,
  // random / noise
  rand, randRange, randInt, randSigned, pick, rng, hash: hashN, noise1, noise2, perlin1, perlin2, fbm1, fbm2,
  // timeline
  seg, segB, beatAt, barAt, beatOf, beatIndex, barIndex, beatPhase, env, envAD, envs, pulse, win, keys, shot, stutter, stagger,
  cues: () => cues, cuesOf, lastCue, nextCue, cueEnv, cuesIn,
  // color
  palette, hexToRgb, rgbToHex, rgba, mix, shade, hsl, col,
  // canvas utils
  pool: { get: surface }, surface, layer, snapshot, resetCtx,
  // assets
  assets, FONTS, img, drawImg, sheetOf, spriteRow, drawSprite, spriteFrame, clipInfo, clipDur, clipFrameTime, drawClip, cover, contain, placeholder,
  cat: (id) => assets.cats.find((c) => c.id === id) || null,
  dog: (id) => assets.dogs.find((c) => c.id === id) || null,
  get cats() { return assets.cats; }, get dogs() { return assets.dogs; },
  // text
  drawText, measureText, fontStr, scramble, typewriter, GLYPHS,
  // masks
  path, mask, wipe, iris, diamondReveal, slices, pixelDissolve, fadeMask,
  // camera / motion
  shake, camera, smear, dirBlur, squash, vel,
  // particles
  particles, ballistic, burst, stream, bezier2, arcTo,
  // shapes
  shockwave, speedLines, speedLinesDir, star, isoGrid, isoToScreen, cone,
  // fx
  glitch, rgbSplit, chromatic: rgbSplit, rgbZoom, zoomBlur, pixelate, scanlines, vignette, grain, flash, lightLeak, crt, timecode,
};
window.E = E;

// ---------------------------------------------------------------------------------------------
// Boot + public API
// ---------------------------------------------------------------------------------------------
window.__render = (t) => renderFrame(t);
window.__frame = async (t) => { await frameExact(t); return true; };
window.__renderTo = async (t, url) => {
  await frameExact(t);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const r = await fetch(url, { method: 'PUT', body: blob });
  if (!r.ok) throw new Error(`upload failed ${r.status}`);
  return blob.size;
};
window.__hash = async (t) => {
  await frameExact(t);
  const d = ctx.getImageData(0, 0, W, H).data;
  const h = await crypto.subtle.digest('SHA-256', d);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
window.__info = () => ({
  mode: MODE, config,
  scenes: scenes.map((s) => ({ name: s.name, start: s.start, end: s.end, broken: !!s.broken, fx: !!s.fx })),
  clips: assets.clipList.map((c) => ({ name: c.name, frames: c.frames, fps: c.fps })),
  cats: assets.cats.length, dogs: assets.dogs.length, images: Object.keys(assets.images),
  font: assets.fontFamily, cues: cues.length, cuesSynthetic: !!assets.cuesSynthetic, audio: assets.audio,
  cacheMB: Math.round(cacheBytes / 1048576), cachedFrames: frameCache.size,
  warnings: [...warnings], errors: [...errors],
});

window.__ready = (async () => {
  await loadAssets();
  await loadScenes();
  if (MODE === 'play') startPlayer();
  else if (params.has('t')) await frameExact(+params.get('t'));
  else renderFrame(0);
  return window.__info();
})();

// ---------------------------------------------------------------------------------------------
// Realtime preview (index.html?play=1)
// ---------------------------------------------------------------------------------------------
function startPlayer() {
  document.body.classList.add('play', 'paused');
  const audio = document.getElementById('a');
  const $ = (id) => document.getElementById(id);
  const scrub = $('scrub');
  const ticks = $('ticks');
  for (let i = 0; i <= BEATS; i++) { const el = document.createElement('i'); el.style.left = `${(i / BEATS) * 100}%`; if (i % 4 === 0) el.className = 'bar'; ticks.appendChild(el); }
  const from = +(params.get('from') || 0), to = +(params.get('to') || DURATION);
  let t = +(params.get('t') || from), playing = false, loop = true, clock0 = 0, t0 = 0, useAudio = assets.audio;
  let lastFrameTs = performance.now(), fpsAvg = 60;
  audio.addEventListener('error', () => { useAudio = false; });
  const setT = (v) => { t = clamp(v, 0, DURATION - 1 / FPS); if (playing) { t0 = t; clock0 = performance.now(); if (useAudio) audio.currentTime = t; } };
  const play = () => {
    if (playing) return; playing = true; document.body.classList.remove('paused');
    t0 = t; clock0 = performance.now();
    if (useAudio) { audio.currentTime = t; audio.play().catch(() => { useAudio = false; }); }
  };
  const pause = () => { playing = false; document.body.classList.add('paused'); audio.pause(); frameExact(t); };
  const toggle = () => (playing ? pause() : play());
  canvas.addEventListener('click', toggle);
  scrub.addEventListener('input', () => { setT(+scrub.value); if (!playing) frameExact(t); });
  addEventListener('keydown', (e) => {
    const stepT = e.shiftKey ? BEAT : 1 / FPS;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight') { setT(Math.round((t + stepT) * FPS) / FPS); if (!playing) frameExact(t); }
    else if (e.code === 'ArrowLeft') { setT(Math.round((t - stepT) * FPS) / FPS); if (!playing) frameExact(t); }
    else if (e.code === 'Home') { setT(from); if (!playing) frameExact(t); }
    else if (e.code === 'KeyL') loop = !loop;
    else if (e.code === 'KeyM') audio.muted = !audio.muted;
    else if (e.code === 'KeyH') document.body.classList.toggle('nohud');
  });
  const hud = () => {
    const f = Math.round(t * FPS);
    $('tc').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}`;
    $('fr').textContent = f;
    $('bb').textContent = `${barIndex(t) + 1}.${(beatIndex(t) % 4) + 1}`;
    $('sc').textContent = activeScenes(t).map((s) => s.name).join('+') || '-';
    $('st').textContent = `${fpsAvg.toFixed(0)} fps · cache ${frameCache.size}f ${Math.round(cacheBytes / 1048576)}MB${errors.length ? ` · ${errors.length} errors (see console)` : ''}${loop ? ' · loop' : ''}`;
    scrub.value = t;
  };
  const tick = (now) => {
    fpsAvg = lerp(fpsAvg, 1000 / Math.max(1, now - lastFrameTs), 0.1); lastFrameTs = now;
    if (playing) {
      t = useAudio && !audio.paused ? audio.currentTime : t0 + (now - clock0) / 1000;
      if (t >= to) { if (loop) { setT(from); } else { t = to - 1 / FPS; pause(); } }
      renderFrame(t);
      // lookahead prefetch for clips on screen
      for (const k of usedThisFrame) {
        const i = k.lastIndexOf('#'); const name = k.slice(0, i), idx = +k.slice(i + 1);
        const n = assets.clips[name]?.frames || 0;
        for (let d = 1; d <= 10; d++) if (idx + d < n && pending.size < 12) requestFrame(name, idx + d);
      }
      evictCache();
    }
    hud();
    requestAnimationFrame(tick);
  };
  frameExact(t).then(() => requestAnimationFrame(tick));
}

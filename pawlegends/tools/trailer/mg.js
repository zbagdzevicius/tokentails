/**
 * Trailer motion graphics compositor (storyboard §2 kinetic type, S04-S05 photo match cut, S27 end card, flashes).
 * Deterministic and frame-stepped: `render*(f)` draws frame f of a cut on a canvas from the timeline in
 * mg-timeline.mjs, with nothing time-based (no rAF, no clock, no Math.random). Loaded by type.html; type.mjs drives it
 * in Playwright and saves transparent PNGs. Fredoka (the game's OFL font, public/assets/fonts) is the only face.
 *
 * Layers: overlay (alpha: type, the zooming photo card, end-card graphics, flashes) and plate (opaque: the S04 photo
 * card over the blurred turntable, the end-card background built from the captured lobby frames).
 */
import { ASPECTS, BEAT_FRAMES, COLORS as C, GABE, post, timeline } from './mg-timeline.mjs';

// ---------------------------------------------------------------- easing

const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const ease = {
  linear: (t) => clamp01(t),
  in: (t) => clamp01(t) ** 3,
  out: (t) => 1 - (1 - clamp01(t)) ** 3,
  inOut: (t) => {
    t = clamp01(t);
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  },
  quintOut: (t) => 1 - (1 - clamp01(t)) ** 5,
  /** easeOutBack (overshoot s): 0 -> ~1.1 -> 1. */
  back: (t, s = 1.7) => {
    t = clamp01(t) - 1;
    return 1 + (s + 1) * t * t * t + s * t * t;
  },
};
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * SLAM in (8 frames): scale `from` (1.60) -> 0.94 by +5 (out) -> 1.00 by +8 (inOut); opacity over +0..+2. A wide
 * 9:16 line starts at 1.25 so the overshoot never leaves the frame.
 */
export function slamState(t, from = 1.6) {
  if (t < 0) return null;
  const s = t < 5 ? lerp(from, 0.94, ease.out(t / 5)) : t < 8 ? lerp(0.94, 1, ease.inOut((t - 5) / 3)) : 1;
  return { s, a: clamp01((t + 1) / 3), rot: 0 };
}

/** POP in (6 frames): scale 0 -> ~1.1 -> 1 (easeOutBack 1.7), rotation -4° -> 0. */
export function popState(t) {
  if (t < 0) return null;
  return { s: Math.max(0, ease.back(t / 6, 1.7)), a: clamp01((t + 1) / 2), rot: (-4 * (1 - ease.out(t / 6)) * Math.PI) / 180 };
}

/** OUT (4 frames): scale 1 -> 1.06, opacity 1 -> 0 (in). Returns a multiplier pair or null once gone. */
export function outState(out, f) {
  if (!out) return { s: 1, a: 1, wipe: 0 };
  if (out.hard) return f >= out.at ? null : { s: 1, a: 1, wipe: 0 };
  const t = f - out.at;
  if (t < 0) return { s: 1, a: 1, wipe: 0 };
  if (t >= 4) return null;
  // v2 mask wipe: the type is cut away along a 12° diagonal, left to right, at full opacity (a sharp exit)
  if (out.wipe) return { s: 1 + 0.02 * ease.in((t + 1) / 4), a: 1, wipe: ease.inOut((t + 1) / 4) };
  const e = ease.in((t + 1) / 4);
  return { s: 1 + 0.06 * e, a: 1 - e, wipe: 0 };
}

/** The slam's shake-on-land (v2): a 2 px kick on +5 that rings out by +9. */
export function landOffset(t, k = 1) {
  if (t < 5 || t > 9) return { x: 0, y: 0 };
  const e = 2 * k * (1 - (t - 5) / 4);
  return { x: e * Math.sin((t - 5) * 2.4 + 0.6), y: e * Math.cos((t - 5) * 2.9) };
}

// ---------------------------------------------------------------- type

const FONT = 'Fredoka';
/** Names keep the game's decomposed ė (Fredoka has e + U+0307, no precomposed glyph). */
const disp = (t) => t.normalize('NFD');
let CAP = 0.7;

export function measureCap(ctx) {
  ctx.font = `700 1000px ${FONT}`;
  const m = ctx.measureText('H');
  CAP = m.actualBoundingBoxAscent / 1000 || 0.7;
  return CAP;
}

function setFont(ctx, size, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.letterSpacing = `${(-0.01 * size).toFixed(2)}px`;
  ctx.textBaseline = 'alphabetic';
}

function textWidth(ctx, text, size, weight = 700) {
  setFont(ctx, size, weight);
  return ctx.measureText(disp(text)).width;
}

/**
 * The trailer type style: cream fill, cocoa outer stroke, hard toon drop shadow in pinkDark. (x, y) is the left of
 * the run's baseline-centre: y is the vertical centre of the cap height.
 */
function drawRun(ctx, text, x, y, size, o = {}) {
  const { fill = C.cream, stroke = C.cocoa, sw = 10, shadow = C.pinkDark, sy = 8, weight = 700, outline = false } = o;
  setFont(ctx, size, weight);
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const t = disp(text);
  const by = y + (CAP * size) / 2;
  if (outline) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = sw * 0.6;
    ctx.strokeText(t, x, by);
    return;
  }
  if (shadow && sy) {
    ctx.fillStyle = shadow;
    ctx.strokeStyle = shadow;
    ctx.lineWidth = sw * 2;
    ctx.strokeText(t, x, by + sy);
    ctx.fillText(t, x, by + sy);
  }
  if (stroke && sw) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = sw * 2;
    ctx.strokeText(t, x, by);
  }
  ctx.fillStyle = fill;
  ctx.fillText(t, x, by);
}

// ---------------------------------------------------------------- compositor

export class Compositor {
  /**
   * @param {HTMLCanvasElement} canvas  the output canvas (W x H of the aspect)
   * @param {{cut: string, aspect: string, copy: object, assets: {photo?: CanvasImageSource, bg05?: CanvasImageSource}}} o
   */
  constructor(canvas, { cut, aspect, copy, assets = {} }) {
    this.cut = String(cut);
    this.aspect = aspect;
    this.v = aspect === '9x16';
    this.W = ASPECTS[aspect].W;
    this.H = ASPECTS[aspect].H;
    this.canvas = canvas;
    canvas.width = this.W;
    canvas.height = this.H;
    this.ctx = canvas.getContext('2d');
    this.copy = copy;
    this.els = timeline(this.cut, aspect, copy);
    this.post = post(this.cut);
    this.assets = assets;
    this.acc = document.createElement('canvas');
    this.acc.width = this.W;
    this.acc.height = this.H;
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.W;
    this.tmp.height = this.H;
    /** Type scale: strokes and shadows shrink with the 9:16 type (0.85x). */
    this.k = this.v ? 0.85 : 1;
    measureCap(this.ctx);
    this.layouts = new Map();
    if (assets.photo) this.prepCard();
  }

  // ------------------------------------------------ helpers

  /**
   * Draw `fn(ctx, sub)` with a 180° shutter: `n` sub-frames across [f, f + 0.5], averaged in float (premultiplied),
   * then written once with a ±1 level dither: an 8-bit running sum posterises smooth gradients into contour bands.
   */
  blurred(ctx, n, fn) {
    if (n <= 1) return fn(ctx, 0);
    const tmp = this.tmp.getContext('2d', { willReadFrequently: true });
    const N = this.W * this.H * 4;
    if (!this.accF || this.accF.length !== N) this.accF = new Float32Array(N);
    const A = this.accF;
    A.fill(0);
    for (let i = 0; i < n; i++) {
      tmp.setTransform(1, 0, 0, 1, 0, 0);
      tmp.clearRect(0, 0, this.W, this.H);
      fn(tmp, (i / n) * 0.5);
      const d = tmp.getImageData(0, 0, this.W, this.H).data;
      for (let k = 0; k < N; k += 4) {
        const a = d[k + 3];
        if (!a) continue;
        A[k] += d[k] * a;
        A[k + 1] += d[k + 1] * a;
        A[k + 2] += d[k + 2] * a;
        A[k + 3] += a;
      }
    }
    const out = tmp.createImageData(this.W, this.H);
    const o = out.data;
    let x = 0x9e3779b9;
    for (let k = 0; k < N; k += 4) {
      const a = A[k + 3];
      if (a <= 0) continue;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const dn = ((x >>> 0) & 0xff) / 255 - 0.5;
      o[k] = A[k] / a + dn;
      o[k + 1] = A[k + 1] / a + dn;
      o[k + 2] = A[k + 2] / a + dn;
      o[k + 3] = a / n + dn;
    }
    tmp.setTransform(1, 0, 0, 1, 0, 0);
    tmp.putImageData(out, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.tmp, 0, 0);
    ctx.restore();
  }

  /** SLAM start scale: 1.25 for a 9:16 line wider than 700 px (its overshoot stays in the frame), else 1.60. */
  slamFrom(width) {
    return this.v && width > 700 ? 1.25 : 1.6;
  }

  /** Lines layout: per line width and the fitted size (never wider than the element's max width). */
  layoutLines(e) {
    if (this.layouts.has(e.id)) return this.layouts.get(e.id);
    const maxW = e.maxW ?? (this.v ? 920 : e.id === 'L1' ? 500 : 1728);
    let size = e.size;
    const widest = () => Math.max(...e.lines.map((l) => textWidth(this.ctx, l, size)));
    while (widest() > maxW) size *= 0.97;
    const L = { size, widths: e.lines.map((l) => textWidth(this.ctx, l, size)), lh: size * 1.06 };
    this.layouts.set(e.id, L);
    return L;
  }

  /** Words layout: every word's final box (one line, or one row per word with `rows`). */
  layoutWords(e) {
    if (this.layouts.has(e.id)) return this.layouts.get(e.id);
    const maxW = e.maxW ?? (this.v ? 920 : e.id === 'L1' ? 500 : 1728);
    let size = e.size;
    let L;
    for (let guard = 0; guard < 60; guard++) {
      const ws = e.words.map((w) => textWidth(this.ctx, w.t, size));
      // a word space plus both outer strokes, so stroked words never touch
      const space = textWidth(this.ctx, ' ', size) + 20 * this.k + (e.gap ?? 0);
      if (e.rows) {
        const lh = size * 1.06;
        const top = e.y - ((e.words.length - 1) * lh) / 2;
        L = { size, boxes: ws.map((w, i) => ({ x: e.x - w / 2, y: top + i * lh, w })) };
        if (Math.max(...ws) <= maxW) break;
      } else {
        const total = ws.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
        let x = e.x - total / 2;
        L = { size, boxes: ws.map((w) => { const b = { x, y: e.y, w }; x += w + space; return b; }) };
        if (total <= maxW) break;
      }
      size *= 0.97;
    }
    this.layouts.set(e.id, L);
    return L;
  }

  /** One styled text run, transformed about its own centre. */
  drawTransformed(ctx, text, box, size, st, o = {}) {
    if (!st || st.s <= 0.001 || st.a <= 0.001) return;
    const cx = box.x + box.w / 2;
    ctx.save();
    ctx.globalAlpha = st.a;
    ctx.translate(cx, box.y);
    ctx.rotate(st.rot || 0);
    ctx.scale(st.s, st.s);
    // the stroke and the toon shadow grow with the type (big 9:16 lines keep the same weight of outline)
    drawRun(ctx, text, -box.w / 2, 0, size, { sw: Math.max(10 * this.k, size * 0.07), sy: Math.max(8 * this.k, size * 0.055), ...o });
    ctx.restore();
  }

  // ------------------------------------------------ kinetic type

  /** Clip to what the mask wipe has not cut yet (x right of a 12° line through the block) and the landing kick. */
  enter(ctx, e, o, t, box) {
    ctx.save();
    if (e.land) {
      const d = landOffset(t, this.k);
      ctx.translate(d.x, d.y);
    }
    if (o.wipe > 0) {
      const k = Math.tan((12 * Math.PI) / 180);
      const x0 = lerp(box.x0 - 160, box.x1 + 160, o.wipe);
      const top = -this.H;
      const bot = 2 * this.H;
      ctx.beginPath();
      ctx.moveTo(x0 + (top - box.cy) * k, top);
      ctx.lineTo(this.W * 3, top);
      ctx.lineTo(this.W * 3, bot);
      ctx.lineTo(x0 + (bot - box.cy) * k, bot);
      ctx.closePath();
      ctx.clip();
    }
  }

  drawLine(ctx, e, f) {
    const o = outState(e.out, f);
    if (!o) return;
    const t = f - e.in;
    if (t < 0) return;
    const LL = this.layoutLines(e);
    const wMax = Math.max(...LL.widths);
    this.enter(ctx, e, o, t, { x0: e.x - wMax / 2, x1: e.x + wMax / 2, cy: e.y });
    this.drawLineInner(ctx, e, f, o, t);
    ctx.restore();
  }

  drawLineInner(ctx, e, f, o, t) {
    const L = this.layoutLines(e);
    const top = e.y - ((e.lines.length - 1) * L.lh) / 2;
    const from = this.slamFrom(Math.max(...L.widths));
    const draw = (c, sub) => {
      const st = e.anim === 'slam' ? slamState(t + sub, from) : popState(t + sub);
      if (!st) return;
      e.lines.forEach((line, i) => {
        const box = { x: e.x - L.widths[i] / 2, y: top + i * L.lh, w: L.widths[i] };
        // the group scales about the block centre, so multi-line slams stay locked together
        const gy = (box.y - e.y) * (st.s * o.s - 1);
        this.drawTransformed(c, line, { ...box, y: box.y + gy }, L.size, { s: st.s * o.s, a: st.a * o.a, rot: st.rot }, e.color ? { fill: C[e.color] } : {});
      });
    };
    if (e.scrim) this.scrim(ctx, e.x, e.y, (e.lines.length - 1) * L.lh + CAP * L.size, Math.max(...L.widths), clamp01((t + 1) / 4) * o.a, e.scrimA);
    // motion blur on +0..+2 only; from +3 the line is drawn once, whole (fill, stroke and shadow at one opacity)
    this.blurred(ctx, e.anim === 'slam' && t <= 2 ? 8 : 1, draw);
  }

  drawWords(ctx, e, f) {
    const o = outState(e.out, f);
    if (!o) return;
    const first = Math.min(...e.words.map((w) => w.in));
    if (f < first) return;
    const LW = this.layoutWords(e);
    const x0 = Math.min(...LW.boxes.map((b) => b.x));
    const x1 = Math.max(...LW.boxes.map((b) => b.x + b.w));
    // the landing kick follows the last word that slammed
    const lastIn = Math.max(...e.words.filter((w) => w.in <= f).map((w) => w.in));
    this.enter(ctx, e, o, f - lastIn, { x0, x1, cy: e.y });
    this.drawWordsInner(ctx, e, f, o);
    ctx.restore();
  }

  drawWordsInner(ctx, e, f, o) {
    const L = this.layoutWords(e);
    // `flow`: the words shown so far sit centred; each new word slides the line over 6 frames
    let shift = 0;
    if (e.flow && !e.rows) {
      const shown = e.words.filter((w) => f >= w.in).length;
      const span = (n) => (n ? L.boxes[n - 1].x + L.boxes[n - 1].w - L.boxes[0].x : 0);
      const full = span(e.words.length);
      const off = (n) => (full - span(n)) / 2;
      const last = e.words[shown - 1];
      const prev = shown > 1 ? off(shown - 1) : off(shown);
      shift = last ? lerp(prev, off(shown), ease.out((f - last.in) / 6)) : 0;
    }
    if (e.scrim) {
      const shown = e.words.filter((w) => f >= w.in);
      if (shown.length) {
        const first = Math.min(...shown.map((w) => w.in));
        const bx = L.boxes.slice(0, e.words.length);
        const h = e.rows ? (e.words.length - 1) * L.size * 1.06 + CAP * L.size : CAP * L.size;
        const w = e.rows ? Math.max(...bx.map((b) => b.w)) : bx[shown.length - 1].x + bx[shown.length - 1].w - bx[0].x;
        this.scrim(ctx, e.x, e.rows ? (bx[0].y + bx[bx.length - 1].y) / 2 : e.y, h, w, clamp01((f - first + 1) / 4) * o.a, e.scrimA);
      }
    }
    e.words.forEach((w, i) => {
      const t = f - w.in;
      if (t < 0) return;
      const box = { ...L.boxes[i], x: L.boxes[i].x + shift };
      const fill = w.color ? C[w.color] : C.cream;
      const from = this.slamFrom(box.w);
      const anim = w.anim ?? e.anim;
      const draw = (c, sub) => {
        const st = anim === 'slam' ? slamState(t + sub, from) : popState(t + sub);
        if (!st) return;
        this.drawTransformed(c, w.t, box, L.size, { s: st.s * o.s, a: st.a * o.a, rot: st.rot }, { fill });
      };
      this.blurred(ctx, anim === 'slam' && t <= 2 ? 8 : 1, draw);
    });
  }

  /** A soft dark plate behind type over busy footage (`strength` at its centre, default 30 %, feathered out). */
  scrim(ctx, cx, cy, h, w, a, strength = 0.3) {
    if (a <= 0) return;
    const padX = 120 * this.k;
    const hh = h / 2 + 60 * this.k;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.filter = `blur(${Math.round(40 * this.k)}px)`;
    ctx.fillStyle = `rgba(30, 16, 24, ${strength})`;
    const x0 = Math.max(-60, cx - w / 2 - padX);
    const x1 = Math.min(this.W + 60, cx + w / 2 + padX);
    ctx.fillRect(x0, cy - hh * 0.7, x1 - x0, hh * 1.4);
    ctx.filter = 'none';
    ctx.restore();
  }

  // ------------------------------------------------ S04-S05: the photo card and the match cut

  card() {
    const v = this.v;
    return { cx: v ? 540 : 1180, cy: v ? 1200 : 540, pw: v ? 540 : 405, ph: v ? 720 : 540, border: v ? 30 : 24, radius: 18, tilt: (-3 * Math.PI) / 180 };
  }

  /** The polaroid (photo + white border) at native size. */
  prepCard() {
    const k = this.card();
    const cw = k.pw + k.border * 2;
    const ch = k.ph + k.border * 2;
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const c = cv.getContext('2d');
    c.fillStyle = '#FFFFFF';
    roundRect(c, 0, 0, cw, ch, k.radius);
    c.fill();
    c.save();
    roundRect(c, k.border, k.border, k.pw, k.ph, 5);
    c.clip();
    c.drawImage(this.assets.photo, k.border, k.border, k.pw, k.ph);
    c.restore();
    this.cardCanvas = cv;
    // the eyes, in card-local pixels from the card centre
    const sx = k.pw / GABE.photo.w;
    this.eyeOff = { x: (GABE.photo.eyes.x - GABE.photo.w / 2) * sx, y: (GABE.photo.eyes.y - GABE.photo.h / 2) * sx };
  }

  drawCardAt(ctx, img, cx, cy, s, rot, shadow = true) {
    const w = img.width;
    const h = img.height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    if (shadow) {
      ctx.shadowColor = 'rgba(40, 20, 30, 0.45)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 16;
    }
    ctx.drawImage(img, -w / 2, -h / 2);
    ctx.restore();
  }

  /**
   * The world behind the card and Gabė (S04-S05): the drop's bridge (S06) softly out of focus under a dark, pink
   * tinted wash, pushing in through the photo beat, faster through the whip, and slowly on through S05. One blur at the
   * final scale (no upscaled blurred plate: no banding).
   */
  drawBg(ctx, t) {
    const { W, H } = this;
    const p = clamp01((t - 120) / 59);
    const q = ease.in(clamp01((t - 180) / 6));
    const r = clamp01((t - 186) / 53);
    ctx.fillStyle = C.cocoa;
    ctx.fillRect(0, 0, W, H);
    const bg = this.bgFrame ?? this.assets.bg05;
    if (bg) {
      const s = (1.03 + 0.02 * p) * (1 + 0.25 * q) * (1 + 0.04 * r);
      ctx.save();
      ctx.filter = `blur(${Math.round(12 * this.k)}px)`;
      ctx.translate(W / 2 - 30 * p, H / 2);
      ctx.scale(s, s);
      ctx.drawImage(bg, -W / 2, -H / 2, W, H);
      ctx.restore();
      ctx.filter = 'none';
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(242, 162, 184, 0.08)';
    ctx.fillRect(0, 0, W, H);
  }

  /** The card at time `t`: 0.94 -> 1.10 with parallax, then (f180-185) the whip-zoom onto Gabė's eyes. */
  drawCard(ctx, t) {
    const p = clamp01((t - 120) / 59);
    const q = ease.in(clamp01((t - 180) / 6));
    const k = this.card();
    const s0 = lerp(0.94, 1.1, ease.inOut(p));
    const cx0 = k.cx + 40 * this.k * p;
    if (q <= 0) {
      this.drawCardAt(ctx, this.cardCanvas, cx0, k.cy, s0, k.tilt);
      return;
    }
    const target = GABE.screenEyes[this.aspect];
    const rot0 = k.tilt;
    const eye0 = {
      x: cx0 + Math.cos(rot0) * this.eyeOff.x * s0 - Math.sin(rot0) * this.eyeOff.y * s0,
      y: k.cy + Math.sin(rot0) * this.eyeOff.x * s0 + Math.cos(rot0) * this.eyeOff.y * s0,
    };
    // the end scale puts the photo's pupils at the model's pupil spacing on screen, the eyes on the model's eyes
    const sEnd = GABE.screenSpacing[this.aspect] / (GABE.photo.spacing * (k.pw / GABE.photo.w));
    const s = lerp(s0, sEnd, q);
    const rot = lerp(rot0, 0, q);
    const ex = lerp(eye0.x, target.x, q);
    const ey = lerp(eye0.y, target.y, q);
    const cx = ex - (Math.cos(rot) * this.eyeOff.x * s - Math.sin(rot) * this.eyeOff.y * s);
    const cy = ey - (Math.sin(rot) * this.eyeOff.x * s + Math.cos(rot) * this.eyeOff.y * s);
    this.drawCardAt(ctx, this.cardCanvas, cx, cy, s, rot, false);
  }

  /** The S04 picture at time `t`: the world and the card. */
  drawPhotoAt(ctx, t) {
    this.drawBg(ctx, t);
    this.drawCard(ctx, t);
  }

  /** A frame captured on the green key colour (S05, S27), keyed to alpha with the green spill removed. */
  keyed(img) {
    const cv = this.keyCanvas ?? (this.keyCanvas = document.createElement('canvas'));
    cv.width = this.W;
    cv.height = this.H;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, this.W, this.H);
    c.drawImage(img, 0, 0, this.W, this.H);
    const im = c.getImageData(0, 0, this.W, this.H);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const m = Math.max(r, b);
      const gn = g - m;
      if (gn <= 0) continue;
      // fully keyed far from the subject, a soft ramp over the anti-aliased edge; the edge's green is pulled to neutral
      d[i + 3] = Math.round(255 * clamp01(1 - (gn - 30) / 120));
      d[i + 1] = m;
    }
    c.putImageData(im, 0, 0);
    return cv;
  }

  /**
   * Plate for S04-S05 (f120-239): the card over the world; on f180-185 the card whip-zooms onto Gabė's eyes (16
   * sub-frames, 180° shutter, float accumulation) and luma-dissolves into her champion (the photo's bright bed edge
   * and border go first) over the same world; from f186 the champion alone, pushing in and turning.
   */
  renderPhotoPlate(ctx, f) {
    if (f < 180) this.drawPhotoAt(ctx, f);
    else {
      this.drawBg(ctx, f);
      const u = clamp01((f - 179) / 6);
      if (this.fgFrame) {
        ctx.save();
        ctx.globalAlpha = f >= 186 ? 1 : ease.inOut(u);
        ctx.drawImage(this.keyed(this.fgFrame), 0, 0);
        ctx.restore();
      }
      if (f <= 185) {
        const L = this.layer ?? (this.layer = document.createElement('canvas'));
        L.width = this.W;
        L.height = this.H;
        const lc = L.getContext('2d', { willReadFrequently: true });
        lc.clearRect(0, 0, this.W, this.H);
        this.blurred(lc, 16, (c, sub) => this.drawCard(c, f + sub));
        const im = lc.getImageData(0, 0, this.W, this.H);
        const d = im.data;
        // bright first (the bed edge, the border), the whole card fading under it, gone by f185
        const T = 1.05 - 1.4 * u;
        const fade = 1 - ease.inOut(clamp01((f - 180) / 5));
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          d[i + 3] = Math.round(d[i + 3] * fade * clamp01((T - luma) / 0.25 + 0.6));
        }
        lc.putImageData(im, 0, 0);
        ctx.drawImage(L, 0, 0);
      }
    }
    this.dither(ctx, f);
  }

  /** ±2 levels of deterministic noise per channel: smooth gradients never posterise after the 8-bit encode. */
  dither(ctx, f) {
    const img = ctx.getImageData(0, 0, this.W, this.H);
    const d = img.data;
    let x = (f * 2654435761) >>> 0 || 1;
    for (let i = 0; i < d.length; i += 4) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      const n = ((x & 0xff) / 255 - 0.5) * 4;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------------------------------ end card

  /**
   * Plate: the end card's own background (a plum-to-cocoa gradient, a pink glow from the bottom 30 %, slow drifting
   * bokeh so the card is never a still) with the two lobby stands keyed over it, blurred 6 px and darkened 25 %, so
   * they live behind the type without competing with it.
   */
  renderEndPlate(ctx, img, f = 0, fg = null) {
    const { W, H } = this;
    const e = this.els.find((x) => x.kind === 'endcard');
    const t = e ? f - e.logo : 0;
    // v3: the last gameplay frame (the winners over the rubble), blurred and darkened, pushing in slowly; a warm dark
    // wash at the top for the logo; the eight-hero line-up (S40, keyed) over the lower part, rising in on the slam
    ctx.fillStyle = '#2a1430';
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const z = 1.06 + 0.03 * clamp01(t / 200);
      ctx.save();
      ctx.filter = `blur(${Math.round(14 * this.k)}px) saturate(1.15)`;
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      ctx.restore();
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(30, 10, 36, 0.5)';
      ctx.fillRect(0, 0, W, H);
    }
    const L = this.endLayout();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(40, 12, 46, 0.55)');
    g.addColorStop(this.v ? 0.6 : 0.62, 'rgba(40, 12, 46, 0.25)');
    g.addColorStop(1, 'rgba(40, 12, 46, 0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const cx = this.endCx();
    const rg = ctx.createRadialGradient(cx, L.logoY, 0, cx, L.logoY, Math.max(W, H) * 0.5);
    rg.addColorStop(0, 'rgba(242, 120, 170, 0.32)');
    rg.addColorStop(1, 'rgba(40, 10, 50, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    if (fg) {
      // the line-up rises 6 % of the height into place over 10 frames after the slam (ease out), then idles
      const u = ease.out(clamp01((t - 2) / 10));
      ctx.save();
      ctx.globalAlpha = u;
      ctx.drawImage(this.keyed(fg), 0, (1 - u) * 0.06 * H);
      ctx.restore();
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20, 5, 25, 0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    this.dither(ctx, f);
  }

  /** A flat paw print (the plate's drifting prints). */
  drawPawFlat(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.3);
    ctx.scale(s / 48, s / 48);
    ctx.translate(-24, -24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(24, 31, 10, 8, 0, 0, Math.PI * 2);
    for (const [px, py] of [[12, 20], [20, 13], [28, 13], [36, 20]]) {
      ctx.moveTo(px + 4.5, py);
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  /** The end card's centre line (9:16: the type column x 80-940, clear of the platforms' right-side rail). */
  endCx() {
    return this.v ? 510 : this.W / 2;
  }

  /** End-card layout: 16:9 per the storyboard (logo y 420, pill y 640, sub 740, URL 820); 9:16 lockup ~80 % wide. */
  endLayout() {
    return this.v
      ? { logoY: 500, logoW: 800, ctaY: 730, pw: 680, ph: 156, subY: 872, sub: 72, urlY: 985, url: 64, creditX: null, creditY: 1760, credit: 38 }
      : { logoY: 230, logoW: 980, ctaY: 432, pw: 620, ph: 138, subY: 552, sub: 60, urlY: 648, url: 62, creditX: 1880, creditY: 1052, credit: 30 };
  }

  logoLayout() {
    if (this.logoL) return this.logoL;
    // v3: the lockup fills logoW (about half the 16:9 frame, three quarters of the 9:16 one)
    const capPx = this.v ? 300 : 340;
    let size = capPx / CAP;
    const a = this.copy?.LOGOa ?? 'Paw';
    const b = this.copy?.LOGOb ?? 'legends';
    let L;
    for (let guard = 0; guard < 60; guard++) {
      const wa = textWidth(this.ctx, a, size);
      const wb = textWidth(this.ctx, b, size);
      const paw = CAP * size * 1.15;
      const gap = size * 0.12;
      const total = paw + gap + wa + wb;
      L = { size, wa, wb, paw, gap, total };
      if (total <= this.endLayout().logoW) break;
      size *= 0.97;
    }
    this.logoL = L;
    return L;
  }

  drawPaw(ctx, x, y, s) {
    // src/ui/icons.ts `paw` (48x48 viewBox), drawn at size s with the toon stroke and shadow
    const shapes = (c) => {
      c.beginPath();
      c.ellipse(24, 31, 10, 8, 0, 0, Math.PI * 2);
      for (const [px, py] of [[12, 20], [20, 13], [28, 13], [36, 20]]) {
        c.moveTo(px + 4.5, py);
        c.arc(px, py, 4.5, 0, Math.PI * 2);
      }
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.scale(s / 48, s / 48);
    ctx.translate(-24, -24);
    const k = 48 / s;
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.translate(0, 8 * this.k * k);
    shapes(ctx);
    ctx.fillStyle = C.pinkDark;
    ctx.strokeStyle = C.pinkDark;
    ctx.lineWidth = 20 * this.k * k;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    shapes(ctx);
    ctx.strokeStyle = C.cocoa;
    ctx.lineWidth = 20 * this.k * k;
    ctx.stroke();
    ctx.fillStyle = C.pinkDeep;
    ctx.fill();
    ctx.restore();
  }

  drawLogo(ctx, e, f) {
    const t = f - e.logo;
    const st = slamState(t);
    if (!st) return;
    const L = this.logoLayout();
    const cx = this.endCx();
    const cy = this.endLayout().logoY;
    const tb = f - e.bump;
    const bump = tb < 0 || tb > 10 ? 0 : tb < 3 ? ease.out(tb / 3) : 1 - ease.inOut((tb - 3) / 7);
    const draw = (c, sub) => {
      const s2 = slamState(t + sub);
      const s = s2.s * (1 + 0.05 * bump);
      c.save();
      c.globalAlpha = s2.a;
      c.translate(cx, cy);
      c.scale(s, s);
      let x = -L.total / 2;
      this.drawPaw(c, x + L.paw / 2, -L.paw * 0.06, L.paw);
      x += L.paw + L.gap;
      const sw = 14 * this.k;
      const sy = 11 * this.k;
      drawRun(c, this.copy?.LOGOa ?? 'Paw', x, 0, L.size, { sw, sy });
      drawRun(c, this.copy?.LOGOb ?? 'legends', x + L.wa, 0, L.size, { fill: C.pinkDeep, sw, sy });
      c.restore();
    };
    // a hard slam: one smeared frame, then sharp
    this.blurred(ctx, t <= 0 ? 6 : 1, draw);
    // the landing: a shockwave ring and gold sparkles (frames +5..+24)
    if (t >= 5 && t <= 24) {
      const p = (t - 5) / 19;
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.strokeStyle = t % 2 ? C.gold : C.pinkDeep;
      ctx.lineWidth = 18 * (1 - p) + 3;
      ctx.beginPath();
      // centred on the logo, sized to stay inside the title-safe area (never clipped by the frame edge)
      const rMax = Math.min(L.total * 0.62, this.W * 0.45);
      const r = lerp(L.total * 0.3, rMax, ease.out(p));
      const ry = Math.min(r * 0.3, cy - 0.06 * this.H);
      ctx.ellipse(cx, cy - L.size * CAP * 0.05, r, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      SPARKS.forEach((sp, i) => {
        const q = clamp01((t - 5 - sp.d) / 14);
        if (q <= 0 || q >= 1) return;
        const ang = sp.a;
        const dist = L.total * (0.38 + 0.3 * ease.out(q)) * sp.r;
        const x = cx + Math.cos(ang) * dist;
        const y = cy + Math.sin(ang) * Math.min(dist * 0.4, cy - 0.06 * this.H);
        star(ctx, x, y, sp.s * this.k * (q < 0.3 ? q / 0.3 : 1 - (q - 0.3) / 0.7), i % 3 === 0 ? C.cream : C.gold);
      });
    }
  }

  drawCta(ctx, e, f) {
    const t = f - e.cta;
    const st = popState(t);
    if (!st) return;
    const EL = this.endLayout();
    const pw = EL.pw;
    const ph = EL.ph;
    const cx = this.endCx();
    const cy = EL.ctaY;
    // a beat pulse on every beat to the fade (1.00 -> 1.06 -> 1.00 every 30 frames)
    let pulse = 1;
    if (f >= e.pulse[0] && f < e.pulse[1]) {
      const u = ((f - e.pulse[0]) % BEAT_FRAMES) / BEAT_FRAMES;
      pulse = 1 + 0.06 * (u < 0.15 ? ease.out(u / 0.15) : 1 - ease.inOut((u - 0.15) / 0.85));
    }
    const s = st.s * pulse;
    ctx.save();
    ctx.globalAlpha = st.a;
    ctx.translate(cx, cy);
    ctx.rotate(st.rot);
    ctx.scale(s, s);
    // pill: pinkDark bottom shadow, pink body, cocoa rim (the game's .pl-btn shape)
    ctx.fillStyle = C.pinkDark;
    roundRect(ctx, -pw / 2, -ph / 2 + 3 * 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = C.pink;
    roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
    ctx.fill();
    ctx.lineWidth = 6 * this.k;
    ctx.strokeStyle = C.cocoa;
    ctx.stroke();
    // a light sweep across the pill every two beats
    const ts = f >= e.pulse[0] ? (f - e.pulse[0]) % (BEAT_FRAMES * 2) : -1;
    if (ts >= 0 && ts < 18) {
      ctx.save();
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.clip();
      const x = lerp(-pw * 0.8, pw * 0.8, ease.inOut(ts / 18));
      const g = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.transform(1, 0, -0.35, 1, 0, 0);
      ctx.fillRect(-pw, -ph, pw * 2, ph * 2);
      ctx.restore();
    }
    const size = ph * 0.53;
    const text = this.copy?.CTA ?? 'PLAY FREE';
    const w = textWidth(ctx, text, size);
    drawRun(ctx, text, -w / 2, 0, size, { sw: 6 * this.k, sy: 0, shadow: null });
    ctx.restore();
  }

  /** A dark rounded pill behind an end-card line (cream type on cocoa: legible over any plate). */
  pill(ctx, cx, cy, w, h, a = 1) {
    ctx.save();
    ctx.globalAlpha = 0.86 * a;
    ctx.fillStyle = '#2b1622';
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.globalAlpha = 0.9 * a;
    ctx.lineWidth = 3 * this.k;
    ctx.strokeStyle = C.pinkDeep;
    ctx.stroke();
    ctx.restore();
  }

  drawEndText(ctx, e, f) {
    const cx = this.endCx();
    const EL = this.endLayout();
    // "No download": cream on a dark pill, popped in
    const ps = popState(f - e.sub);
    if (ps) {
      const text = this.copy?.SUB ?? 'No download';
      const w = textWidth(ctx, text, EL.sub, 700);
      ctx.save();
      ctx.translate(cx, EL.subY);
      ctx.scale(ps.s, ps.s);
      this.pill(ctx, 0, 0, w + EL.sub * 1.2, EL.sub * 1.45, ps.a);
      ctx.restore();
      this.drawTransformed(ctx, text, { x: cx - w / 2, y: EL.subY, w }, EL.sub, ps, { weight: 700, sw: 6, sy: 0, fill: C.cream });
    }
    // URL: cream on a dark pill, typed on
    if (f >= e.url[0]) {
      const full = this.copy?.URL ?? 'tokentails.com/pawlegends';
      const n = Math.min(full.length, Math.ceil(((f - e.url[0] + 1) / (e.url[1] - e.url[0] + 1)) * full.length));
      const size = EL.url;
      const w = textWidth(ctx, full, size, 700);
      const x = cx - w / 2;
      const a = clamp01((f - e.url[0] + 1) / 4);
      this.pill(ctx, cx, EL.urlY, w + size * 1.3, size * 1.55, a);
      const shown = full.slice(0, n);
      drawRun(ctx, shown, x, EL.urlY, size, { weight: 700, sw: 6, sy: 0, fill: C.cream, shadow: null });
      if (f <= e.url[1] + 6) {
        const cw = textWidth(ctx, shown, size, 700);
        ctx.fillStyle = C.pinkDeep;
        ctx.fillRect(x + cw + 6, EL.urlY - size * 0.42, 6, size * 0.84);
      }
    }
    // credit
    if (f >= e.credit) {
      const a = 0.9 * clamp01((f - e.credit + 1) / 6);
      const size = EL.credit;
      const text = this.copy?.CREDIT ?? '© Token Tails';
      const w = textWidth(ctx, text, size, 600);
      const x = EL.creditX === null ? cx - w / 2 : EL.creditX - w;
      ctx.save();
      ctx.globalAlpha = a;
      drawRun(ctx, text, x, EL.creditY, size, { weight: 600, sw: 5, sy: 0, shadow: null });
      ctx.restore();
    }
  }

  /** The end: a linear fade to black over the last frames (never via cocoa, never a 1-frame snap). */
  drawFade(ctx, e, f) {
    if (f < e.fade[0]) return;
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = clamp01((f - e.fade[0] + 1) / (e.fade[1] - e.fade[0] + 1));
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
  }

  /** The skin flips (S22): a burst of gold and cream sparkles around the hero on the beat (the bloom is the edit's). */
  drawSparkles(ctx, f) {
    if (!this.post.sparkles) return;
    for (const at of [1230, 1260, 1290]) {
      const t = f - at;
      if (t < 0 || t > 14) continue;
      const cx = this.W / 2;
      const cy = this.H * (this.v ? 0.5 : 0.5);
      const R = this.v ? 420 : 380;
      SPARKS.forEach((sp, i) => {
        const q = clamp01((t - (sp.d % 3)) / 12);
        if (q <= 0 || q >= 1) return;
        const ang = sp.a + at;
        const dist = R * (0.55 + 0.45 * ease.out(q)) * sp.r;
        star(ctx, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist * 0.9, sp.s * 1.3 * this.k * (q < 0.25 ? q / 0.25 : 1 - (q - 0.25) / 0.75), i % 3 === 0 ? C.cream : i % 3 === 1 ? C.gold : C.pink);
      });
    }
  }

  // ------------------------------------------------ entry points

  /** Overlay (transparent) for frame f. Returns true when anything was drawn. */
  renderOverlay(f) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    for (const e of this.els) {
      if (e.kind === 'line') this.drawLine(ctx, e, f);
      else if (e.kind === 'words') this.drawWords(ctx, e, f);
      else if (e.kind === 'black' && e.at.includes(f)) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.W, this.H);
      } else if (e.kind === 'endcard' && f >= e.logo && f < e.end) {
        this.drawLogo(ctx, e, f);
        this.drawCta(ctx, e, f);
        this.drawEndText(ctx, e, f);
        this.drawFade(ctx, e, f);
      }
    }
    this.drawSparkles(ctx, f);
  }

  /** Plate (opaque) for frame f, or false. `endImg` is the captured lobby frame for the end card. */
  renderPlate(f, endImg = null, fgImg = null) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const photo = this.els.find((e) => e.kind === 'photo');
    if (photo && f >= photo.in && f < photo.out && this.cardCanvas) {
      this.bgFrame = endImg;
      this.fgFrame = fgImg;
      this.renderPhotoPlate(ctx, f);
      return true;
    }
    const end = this.els.find((e) => e.kind === 'endcard');
    if (end && f >= end.logo && f < end.end) {
      this.renderEndPlate(ctx, endImg, f, fgImg);
      return true;
    }
    return false;
  }
}

/** Deterministic sparkle set for the logo landing. */
const SPARKS = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1), r: 0.85 + ((i * 37) % 10) / 30, s: 16 + ((i * 53) % 4) * 6, d: (i * 7) % 5 }));

function star(ctx, x, y, r, color) {
  if (r <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = C.cocoa;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

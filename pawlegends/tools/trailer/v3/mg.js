/**
 * Trailer v3 motion graphics (browser canvas; type.mjs drives it in Playwright and saves transparent PNGs). Pure and
 * frame-stepped: `render(f)` draws frame f of a cut from timeline.mjs. Fredoka (the game's OFL font) only.
 *
 * Slam: the whole word at 118 % settling to 100 % in 6 frames, opacity in over 2 frames: one sharp copy per frame (no
 * ghost glyphs). Exit: a 12° mask wipe over 4 frames, left to right. The end card: "Paw" + "legends" (the title
 * screen's colours), PLAY FREE · No download on a pill, the URL, the credit; held sharp to the last frame.
 */
import { ASPECTS, COLORS as C, endCard, typeEls } from './timeline.mjs';

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeInOut = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const FONT = 'Fredoka';
/** The decomposed ė (Fredoka has e + U+0307, no precomposed glyph). */
const disp = (t) => t.normalize('NFD');

/** Slam scale and alpha `t` frames after the in-frame (null before it). */
export function slam(t) {
  if (t < 0) return null;
  // v3.1: opaque from the first frame (a half-alpha first frame read as a ghost copy of the word)
  return { s: 1 + SLAM_OVER * (1 - easeOut(t / 6)), a: 1 };
}

/** The slam starts this much larger (118 %). */
export const SLAM_OVER = 0.18;
/** Title-safe margin (share of the frame width): every word, at its 118 % slam size too, stays inside it. */
export const TITLE_SAFE = 0.05;
/** Wipe progress (0 = whole, 1 = gone) `t` frames after the out-frame. */
export function wipe(t) {
  if (t < 0) return 0;
  return t >= 3 ? 1 : easeInOut((t + 1) / 4);
}

const STYLE = {
  cat: { fill: C.rose, stroke: C.cocoa, shadow: C.roseDeep },
  dog: { fill: C.navy, stroke: C.cream, shadow: '#0E1F4A' },
  plain: { fill: C.cream, stroke: C.cocoa, shadow: '#2A1A14' },
  gold: { fill: C.gold, stroke: C.cocoa, shadow: '#2A1A14' },
};

export class Compositor {
  constructor(canvas, { cut, aspect, copy }) {
    this.canvas = canvas;
    this.cut = String(cut);
    this.aspect = aspect;
    this.copy = copy;
    const { W, H } = ASPECTS[aspect];
    this.W = W;
    this.H = H;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.els = typeEls(cut, aspect, copy).map((e) => ({ ...e }));
    this.end = endCard(cut);
    // px per "1080 p" unit: the type is specified against a 1080-high landscape frame; 9:16 is laid out in its own px
    this.k = 1;
    for (const e of this.els) this.fitSafe(e);
  }

  /** v3.1: shrink and shift a word so its box at the 118 % slam size stays inside the title-safe area. */
  fitSafe(e) {
    const ctx = this.ctx;
    const lim = this.W * (1 - 2 * TITLE_SAFE);
    for (let i = 0; i < 4; i++) {
      ctx.font = `700 ${e.size}px ${FONT}`;
      const full = (ctx.measureText(disp(e.text)).width + e.size * 0.24 + Math.max(6, e.size * 0.085) * 2) * (1 + SLAM_OVER);
      if (full <= lim) {
        const half = full / 2;
        const cx = Math.min(this.W * (1 - TITLE_SAFE) - half, Math.max(this.W * TITLE_SAFE + half, e.x * this.W));
        e.x = cx / this.W;
        return;
      }
      e.size = Math.floor((e.size * lim) / full);
    }
  }

  /** The text box of an element at full size (for the QC: never over a hero). */
  box(e) {
    const ctx = this.ctx;
    ctx.font = `700 ${e.size}px ${FONT}`;
    const w = ctx.measureText(disp(e.text)).width;
    const h = e.size * 0.78;
    return { x0: e.x * this.W - w / 2 - e.size * 0.12, x1: e.x * this.W + w / 2 + e.size * 0.12, y0: e.y * this.H - h / 2 - e.size * 0.1, y1: e.y * this.H + h / 2 + e.size * 0.18 };
  }

  drawWord(e, f) {
    const st = slam(f - e.in);
    if (!st) return;
    const wp = wipe(f - e.out);
    if (wp >= 1) return;
    const ctx = this.ctx;
    const s = STYLE[e.style] ?? STYLE.plain;
    const size = e.size;
    ctx.save();
    if (wp > 0) {
      // the 12° mask wipe: everything left of a slanted edge sweeping across the word is cut away
      const b = this.box(e);
      const span = b.x1 - b.x0 + size;
      const edge = b.x0 - size * 0.5 + span * wp;
      const slope = Math.tan((12 * Math.PI) / 180) * (b.y1 - b.y0);
      ctx.beginPath();
      ctx.moveTo(edge + slope, b.y0 - size);
      ctx.lineTo(this.W + 10, b.y0 - size);
      ctx.lineTo(this.W + 10, b.y1 + size);
      ctx.lineTo(edge - slope, b.y1 + size);
      ctx.closePath();
      ctx.clip();
    }
    ctx.globalAlpha = st.a;
    ctx.translate(e.x * this.W, e.y * this.H);
    ctx.scale(st.s, st.s);
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.letterSpacing = `${(-0.01 * size).toFixed(2)}px`;
    const t = disp(e.text);
    const sw = Math.max(6, size * 0.085);
    const dy = size * 0.06;
    // hard toon drop shadow, outline, fill
    ctx.fillStyle = s.shadow;
    ctx.strokeStyle = s.shadow;
    ctx.lineWidth = sw * 2;
    ctx.strokeText(t, 0, dy + size * 0.05);
    ctx.fillText(t, 0, dy + size * 0.05);
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = sw * 2;
    ctx.strokeText(t, 0, 0);
    ctx.fillStyle = s.fill;
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }

  drawEnd(f) {
    const e = this.end;
    if (f < e.logo) return;
    const ctx = this.ctx;
    const v = this.aspect === '9x16';
    const W = this.W;
    const H = this.H;
    const c = this.copy;
    // logo: "Paw" cream + "legends" pink, about 55 % (16:9) / 80 % (9:16) of the width
    const target = W * (v ? 0.8 : 0.55);
    ctx.font = `700 200px ${FONT}`;
    const wa = ctx.measureText(c.LOGOa).width;
    const wb = ctx.measureText(c.LOGOb).width;
    const size = (200 * target) / (wa + wb);
    const st = slam(f - e.logo);
    const cy = H * (v ? 0.36 : 0.38);
    ctx.save();
    ctx.translate(W / 2, cy);
    ctx.scale(st.s, st.s);
    ctx.globalAlpha = st.a;
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    const A = (wa * size) / 200;
    const B = (wb * size) / 200;
    const x0 = -(A + B) / 2;
    const sw = size * 0.075;
    for (const [txt, x, fill] of [[c.LOGOa, x0, C.cream], [c.LOGOb, x0 + A, C.pinkDeep]]) {
      ctx.fillStyle = '#2A1A14';
      ctx.strokeStyle = '#2A1A14';
      ctx.lineWidth = sw * 2;
      ctx.strokeText(txt, x, size * 0.09);
      ctx.fillText(txt, x, size * 0.09);
      ctx.strokeStyle = C.cocoa;
      ctx.strokeText(txt, x, 0);
      ctx.fillStyle = fill;
      ctx.fillText(txt, x, 0);
    }
    ctx.restore();
    // CTA pill
    const pill = (text, y, fs, f0, bg, fg, padX = 0.9) => {
      const sp = slam(f - f0);
      if (!sp) return;
      ctx.save();
      ctx.font = `700 ${fs}px ${FONT}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + fs * padX * 2;
      const ph = fs * 1.6;
      ctx.translate(W / 2, y);
      ctx.scale(sp.s, sp.s);
      ctx.globalAlpha = sp.a;
      if (bg) {
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
        ctx.fill();
      }
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, fs * 0.04);
      ctx.restore();
    };
    pill(`${c.CTA} · ${c.SUB}`, H * (v ? 0.5 : 0.6), v ? 58 : 54, e.cta, C.cream, C.cocoa);
    pill(c.URL, H * (v ? 0.81 : 0.73), v ? 52 : 46, e.url, 'rgba(42,26,20,0.82)', C.cream);
    pill(c.CREDIT, H * (v ? 0.87 : 0.9), v ? 30 : 28, e.credit, null, 'rgba(255,248,238,0.9)');
  }

  render(f) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    for (const e of this.els) this.drawWord(e, f);
    this.drawEnd(f);
  }

  /** Boxes of the words on screen at frame f (QC). */
  boxes(f) {
    // at the slam's scale on that frame (the QC checks the word as drawn)
    return this.els.filter((e) => f >= e.in && f < e.out + 4).map((e) => {
      const b = this.box(e);
      const k = slam(f - e.in)?.s ?? 1;
      const cx = e.x * this.W;
      const cy = e.y * this.H;
      return { id: e.id, text: e.text, x0: cx + (b.x0 - cx) * k, x1: cx + (b.x1 - cx) * k, y0: cy + (b.y0 - cy) * k, y1: cy + (b.y1 - cy) * k };
    });
  }
}

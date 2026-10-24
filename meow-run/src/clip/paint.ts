// Canvas painters for the clip (browser canvas, no DOM reads): the watermark, the stage tag and the end card.
// Everything is procedural (paths and text); the static overlay is drawn once per render into its own canvas.
import { WATERMARK } from '../ugc/sharekit';
import { watermarkBox } from './layout';

export const FONT = `ui-rounded, 'SF Pro Rounded', Nunito, 'Arial Rounded MT Bold', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const INK = '#2a1c14';
const CREAM = '#fff7ea';
const GOLD = '#ffc21a';
const GOLD2 = '#ffe066';
const ROSE = '#ff4f7b';
const ORANGE = '#ff8a2a';

/** A paw print centred at (x, y), `s` = overall size. */
export function paw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill = CREAM, stroke = INK): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.beginPath();
  ctx.ellipse(0, s * 0.16, s * 0.27, s * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const toes: [number, number][] = [
    [-0.33, -0.1],
    [-0.12, -0.3],
    [0.12, -0.3],
    [0.33, -0.1],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx * s, ty * s, s * 0.105, s * 0.13, tx * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** outlined text (ink outline, then fill) */
function inked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, line: number): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Shrink the font until `text` fits `maxW` (returns the size used). */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 8 && ctx.measureText(text).width > maxW) {
    s = Math.floor(s * 0.92);
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

/**
 * The static overlay for a w x h clip: the watermark (paw + WATERMARK, bottom-right, 75% alpha) and the stage tag
 * (top-left). Drawn once; the compositor stamps it on every frame.
 */
export function overlayCanvas(w: number, h: number, stageName: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const b = watermarkBox(w, h);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.font = `900 ${b.font}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const base = b.bottom - b.font * 0.22;
  inked(ctx, WATERMARK, b.right, base, CREAM, Math.max(2, b.font * 0.2));
  const tw = ctx.measureText(WATERMARK).width;
  paw(ctx, b.right - tw - b.icon * 0.75, base - b.font * 0.36, b.icon, GOLD, INK);
  ctx.restore();

  // stage tag: a cream pill with a rose "replay" dot
  const fs = Math.max(10, Math.round(Math.min(h * 0.03, w * 0.036)));
  const m = Math.round(fs * 0.9);
  ctx.font = `900 ${fs}px ${FONT}`;
  const label = stageName.toUpperCase();
  const lw = ctx.measureText(label).width;
  const ph = Math.round(fs * 1.7);
  const pw = Math.round(lw + fs * 2.6);
  ctx.save();
  ctx.globalAlpha = 0.9;
  roundRect(ctx, m, m, pw, ph, ph / 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = Math.max(2, fs * 0.16);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(m + fs * 0.95, m + ph / 2, fs * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = ROSE;
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, m + fs * 1.7, m + ph / 2 + fs * 0.05);
  ctx.restore();
  return c;
}

export interface CardData {
  name: string;
  score: string;
  /** stage name, or "Endless - 1,234 m" */
  line: string;
  /** style rank ('' = none) */
  rank: string;
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/**
 * The end card at time t (0..dur s): the last frame dimmed behind a cream card with the cat's look, the name, the
 * score, the stage or distance, the style rank, "Can you beat me?" and the watermark.
 */
export function drawEndCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: CanvasImageSource | null,
  d: CardData,
  t: number,
  calm: boolean,
  drawPortrait: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => void,
): void {
  const k = calm ? 1 : Math.min(1, t / 0.32);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  if (bg) {
    const z = calm ? 1 : 1 + 0.04 * Math.min(1, t / 1.2);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bg, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
    ctx.globalAlpha = 1;
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(255,176,58,0.18)');
  vg.addColorStop(1, 'rgba(42,28,20,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // sun rays behind the card (slow turn)
  if (!calm) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(t * 0.35);
    ctx.globalAlpha = 0.12 * k;
    ctx.fillStyle = GOLD2;
    const R = Math.max(w, h);
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, -R * 0.12);
      ctx.lineTo(R, R * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // card unit: 16:9 fills most of the height, 9:16 most of the width
  const u = Math.min(w / 82, h / 96);
  const cw = Math.min(w * 0.92, 74 * u);
  const ch = Math.min(h * 0.94, 88 * u);
  const s = calm ? 1 : 0.82 + 0.18 * easeOutBack(k);
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.rotate(calm ? 0 : (1 - k) * -0.08);
  ctx.globalAlpha = Math.min(1, k * 1.6);
  // card
  roundRect(ctx, -cw / 2, -ch / 2 + 1.6 * u, cw, ch, 6 * u);
  ctx.fillStyle = INK;
  ctx.fill();
  roundRect(ctx, -cw / 2, -ch / 2, cw, ch, 6 * u);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 1.1 * u;
  ctx.strokeStyle = INK;
  ctx.stroke();

  let y = -ch / 2 + 4 * u;
  // portrait in a circle
  const ps = 25 * u;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, y + ps / 2, ps / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe2b0';
  ctx.fill();
  ctx.clip();
  drawPortrait(ctx, -ps / 2, y, ps);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, y + ps / 2, ps / 2, 0, Math.PI * 2);
  ctx.lineWidth = 0.9 * u;
  ctx.strokeStyle = INK;
  ctx.stroke();
  y += ps + 2.5 * u;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const inner = cw - 8 * u;
  fit(ctx, d.name, 900, Math.round(6 * u), inner);
  ctx.fillStyle = INK;
  ctx.fillText(d.name, 0, y);
  y += 7.2 * u;

  fit(ctx, d.score, 900, Math.round(12.5 * u), inner);
  inked(ctx, d.score, 0, y, GOLD, Math.max(2, 1.2 * u));
  y += 13.5 * u;

  fit(ctx, d.line, 800, Math.round(4.6 * u), inner);
  ctx.fillStyle = '#4a3326';
  ctx.fillText(d.line, 0, y);
  y += 6.2 * u;

  if (d.rank) {
    const txt = `STYLE ${d.rank}`;
    ctx.font = `900 ${Math.round(4.2 * u)}px ${FONT}`;
    const rw = ctx.measureText(txt).width + 5 * u;
    roundRect(ctx, -rw / 2, y - 0.6 * u, rw, 6.2 * u, 3.1 * u);
    ctx.fillStyle = ORANGE;
    ctx.fill();
    ctx.lineWidth = 0.6 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.fillText(txt, 0, y + 0.4 * u);
    y += 7.6 * u;
  } else y += 1.4 * u;

  const beat = 'Can you beat me?';
  fit(ctx, beat, 900, Math.round(7 * u), inner);
  // a little wobble on the call to action
  ctx.save();
  ctx.translate(0, y);
  ctx.rotate(calm ? 0 : Math.sin(t * 9) * 0.025);
  inked(ctx, beat, 0, 0, ROSE, Math.max(2, 0.9 * u));
  ctx.restore();

  // footer: paw + watermark
  const fy = ch / 2 - 7.2 * u;
  ctx.font = `900 ${Math.round(3.8 * u)}px ${FONT}`;
  const ww = ctx.measureText(WATERMARK).width;
  paw(ctx, -ww / 2 - 3 * u, fy + 2 * u, 4.2 * u, GOLD, INK);
  ctx.fillStyle = INK;
  ctx.fillText(WATERMARK, 1.2 * u, fy);
  ctx.restore();
}

/** Fallback portrait when no look painter is registered: Mochi's paw on a warm disc. */
export function fallbackPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  paw(ctx, x + size / 2, y + size * 0.54, size * 0.62, ORANGE, INK);
}

// ---------------------------------------------------------------- the hype layer (what the DOM HUD showed)
const TIER_COLORS = ['#fff7ea', '#7ccf5a', '#4cc3ff', '#ffc21a', '#ff8a2a', '#ff4f7b', '#c77dff'];
const TIER_NAMES = ['', 'NICE!', 'PAWSOME!', 'CLAW-SOME!', 'FUR-OCIOUS!', 'NINE LIVES!', 'CAT-ASTROPHIC!'];
const POP_TONE: Record<string, string> = { trick: '#ffe066', bank: '#9fe8ff', style: '#b8f59a', bad: '#ff9ab3' };
const tierColor = (t: number) => TIER_COLORS[Math.max(0, Math.min(6, Math.floor(t) || 0))];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerpK = (a: number, b: number, u: number) => a + (b - a) * clamp01(u);
/** keyframe sampler: [time 0..1, value][] */
function kf(frames: readonly (readonly [number, number])[], u: number): number {
  if (u <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) if (u <= frames[i][0]) return lerpK(frames[i - 1][1], frames[i][1], (u - frames[i - 1][0]) / (frames[i][0] - frames[i - 1][0]));
  return frames[frames.length - 1][1];
}
const STAMP_SCALE = [[0, 2.6], [0.1, 0.9], [0.18, 1.06], [0.26, 1], [0.8, 1], [1, 0.94]] as const;
const STAMP_ALPHA = [[0, 0], [0.1, 1], [0.8, 1], [1, 0]] as const;
const POP_SCALE = [[0, 0.2], [0.14, 1.18], [0.26, 1], [0.78, 1], [1, 0.9]] as const;
const POP_ALPHA = [[0, 0], [0.14, 1], [0.78, 1], [1, 0]] as const;

export interface HypeView {
  score: number;
  combo: number;
  comboTier: number;
  stamp: { text: string; sub: string; tier: number; kind: string } | null;
  stampAge: number;
  pops: { text: string; tone: string }[];
  popAges: number[];
  callout: { text: string; tone: string } | null;
  calloutAge: number;
}

/** The hype layer for one clip frame: the score counter (top right), the combo pill under it, trick popups, the tier
 *  or rank stamp (upper centre) and a core callout. Sizes follow the frame's short edge. */
export function drawHype(ctx: CanvasRenderingContext2D, w: number, h: number, v: HypeView, calm: boolean): void {
  const u = Math.min(w, h) / 100;
  const tall = h > w;
  ctx.save();
  ctx.textBaseline = 'top';
  // ---- score
  let y = 3 * u;
  if (Number.isFinite(v.score)) {
    ctx.textAlign = 'right';
    const s = Math.round(v.score).toLocaleString('en-US');
    ctx.font = `italic 900 ${Math.round(7.6 * u)}px ${FONT}`;
    inked(ctx, s, w - 3.4 * u, y, CREAM, Math.max(2, 1.3 * u));
    y += 9.8 * u;
  }
  // ---- combo pill
  if (v.combo >= 2) {
    const col = tierColor(v.comboTier);
    ctx.font = `italic 900 ${Math.round(4.4 * u)}px ${FONT}`;
    const num = String(v.combo);
    const nw = ctx.measureText(num).width;
    ctx.font = `italic 900 ${Math.round(2.5 * u)}px ${FONT}`;
    const lw = ctx.measureText('COMBO').width;
    const ph = 6.4 * u;
    const pw = lw + nw + 5 * u;
    const x1 = w - 3.4 * u;
    ctx.save();
    ctx.translate(x1 - pw / 2, y + ph / 2);
    ctx.rotate(-0.035);
    roundRect(ctx, -pw / 2, -ph / 2 + 0.5 * u, pw, ph, ph / 2);
    ctx.fillStyle = INK;
    ctx.fill();
    roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = Math.max(2, 0.5 * u);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('COMBO', -pw / 2 + 2 * u, 0.2 * u);
    ctx.font = `italic 900 ${Math.round(4.4 * u)}px ${FONT}`;
    ctx.fillText(num, -pw / 2 + 3 * u + lw, 0.3 * u);
    ctx.restore();
    y += ph + 1.2 * u;
    if (v.comboTier > 0) {
      ctx.textAlign = 'right';
      ctx.font = `italic 900 ${Math.round(2.9 * u)}px ${FONT}`;
      inked(ctx, TIER_NAMES[Math.min(6, v.comboTier)], x1, y, col, Math.max(2, 0.6 * u));
      y += 4 * u;
    }
  }
  // ---- popups (newest on top, under the meter)
  y += 1.2 * u;
  ctx.textAlign = 'right';
  for (let i = 0; i < v.pops.length; i++) {
    const p = v.pops[i];
    const age = v.popAges[i] / 1.5;
    const a = calm ? kf(STAMP_ALPHA, age) : kf([[0, 0], [0.12, 1], [0.75, 1], [1, 0]], age);
    const dx = calm ? 0 : (1 - clamp01(age / 0.12)) * 4 * u;
    ctx.globalAlpha = a;
    ctx.font = `italic 900 ${Math.round(3.7 * u)}px ${FONT}`;
    inked(ctx, p.text, w - 3.4 * u + dx, y + i * 5 * u, POP_TONE[p.tone] ?? CREAM, Math.max(2, 0.75 * u));
  }
  ctx.globalAlpha = 1;
  // ---- stamp
  if (v.stamp) {
    const rank = v.stamp.kind === 'rank';
    const life = rank ? 1.9 : 1.15;
    const k = v.stampAge / life;
    const sc = calm ? 1 : kf(STAMP_SCALE, k);
    const a = kf(STAMP_ALPHA, k);
    const cx = w / 2;
    const cy = h * (tall ? 0.25 : 0.27) - (calm ? 0 : clamp01((k - 0.8) / 0.2) * 2.5 * u);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.rotate(-0.065);
    const size = fit(ctx, v.stamp.text, 900, Math.round((rank ? 12 : 10) * u), w * 0.84);
    ctx.font = `italic 900 ${size}px ${FONT}`;
    const tw = ctx.measureText(v.stamp.text).width;
    const col = tierColor(v.stamp.tier);
    // the ink plate (a skewed quad) and a colour sheen
    const pw = tw + 5 * u;
    const ph = size * 1.25;
    ctx.beginPath();
    ctx.moveTo(-pw / 2 + pw * 0.03, -ph / 2 + ph * 0.12);
    ctx.lineTo(pw / 2 - pw * 0.03, -ph / 2);
    ctx.lineTo(pw / 2, ph / 2 - ph * 0.14);
    ctx.lineTo(-pw / 2 + pw * 0.06, ph / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(42,28,20,0.9)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    ctx.fillText(v.stamp.text, 0, size * 0.12);
    inked(ctx, v.stamp.text, 0, 0, col, Math.max(3, size * 0.16));
    if (v.stamp.sub) {
      const ss = fit(ctx, v.stamp.sub, 900, Math.round(3.4 * u), w * 0.86);
      ctx.font = `italic 900 ${ss}px ${FONT}`;
      inked(ctx, v.stamp.sub, 0, ph / 2 + ss * 0.9, CREAM, Math.max(2, ss * 0.2));
    }
    ctx.restore();
  }
  // ---- a core callout ("CLOSE ONE!", "NOM NOM!"): an orange starburst, lower when a stamp shows
  if (v.callout) {
    const k = v.calloutAge / 1.25;
    const sc = calm ? 1 : kf(POP_SCALE, k);
    const a = kf(POP_ALPHA, k);
    const cx = w / 2;
    const cy = h * (v.stamp ? (tall ? 0.4 : 0.47) : tall ? 0.33 : 0.36) - (calm ? 0 : clamp01((k - 0.78) / 0.22) * 4 * u);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.rotate(-0.1);
    const size = fit(ctx, v.callout.text, 900, Math.round(7 * u), w * 0.8);
    ctx.font = `italic 900 ${size}px ${FONT}`;
    const tw = ctx.measureText(v.callout.text).width;
    const bw = tw * 1.28;
    const bh = bw / 2.3;
    const burst = v.callout.tone === 'bad' ? '#6b2a4a' : v.callout.tone === 'info' ? '#2fa8e8' : ORANGE;
    ctx.globalAlpha = a * 0.85;
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const r = i % 2 ? 0.62 : 1;
      const px = Math.cos(ang) * (bw / 2) * r;
      const py = Math.sin(ang) * (bh / 2) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = burst;
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fill = v.callout.tone === 'bad' ? '#ff6b8f' : v.callout.tone === 'info' ? CREAM : GOLD2;
    inked(ctx, v.callout.text, 0, 0, fill, Math.max(3, size * 0.15));
    ctx.restore();
  }
  ctx.restore();
}

// PHOTO lane: photo frames and the watermark. PURE (node-importable; painters only take a 2D context argument).
// A frame is painted OVER the photo at full size (the live overlay canvas and the exported PNG use the same painter),
// so what the player frames is exactly what they get. Sizes scale with u = 1% of the image's short edge.
import { STICKER_FONT } from './stickers';

export type FrameId = 'none' | 'polaroid' | 'comic' | 'film' | 'postcard' | 'badge';
export const FRAMES: readonly FrameId[] = ['none', 'polaroid', 'comic', 'film', 'postcard', 'badge'];
export const FRAME_LABEL: Record<FrameId, string> = { none: 'NONE', polaroid: 'POLAROID', comic: 'COMIC', film: 'FILM', postcard: 'POSTCARD', badge: 'BADGE' };
export const isFrameId = (v: unknown): v is FrameId => typeof v === 'string' && (FRAMES as readonly string[]).includes(v);

export interface FrameInfo {
  /** polaroid caption (the player's name or 'Mochi') */
  caption: string;
  /** postcard: 'Greetings from <stageName>' */
  stageName: string;
}

const INK = '#2a1c14';
const CREAM = '#fff7ea';
const font = (px: number, style = '') => `${style ? `${style} ` : ''}900 ${Math.max(1, px).toFixed(1)}px ${STICKER_FONT}`;
const unit = (w: number, h: number) => Math.min(w, h) / 100;

/** the border each frame paints (px), for placing the watermark clear of it */
export function frameInsets(id: FrameId, w: number, h: number): { l: number; t: number; r: number; b: number } {
  const u = unit(w, h);
  switch (id) {
    case 'polaroid':
      return { l: 4 * u, t: 4 * u, r: 4 * u, b: 16 * u };
    case 'comic':
      return { l: 6 * u, t: 6 * u, r: 6 * u, b: 6 * u };
    case 'film':
      return w >= h ? { l: 0, t: 10 * u, r: 0, b: 10 * u } : { l: 10 * u, t: 0, r: 10 * u, b: 0 };
    case 'postcard':
      return { l: 3.5 * u, t: 3.5 * u, r: 3.5 * u, b: 3.5 * u };
    default:
      return { l: 0, t: 0, r: 0, b: 0 };
  }
}

/** a border band: the outer rect minus the inner rect, filled */
function band(ctx: CanvasRenderingContext2D, w: number, h: number, l: number, t: number, r: number, b: number, fill: string | CanvasGradient | CanvasPattern): void {
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(l, t, w - l - r, h - t - b);
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, px: number, style = ''): number {
  let size = px;
  ctx.font = font(size, style);
  const m = ctx.measureText(text).width;
  if (m > maxW && m > 0) size = Math.max(4, (size * maxW) / m);
  ctx.font = font(size, style);
  return size;
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: string, lw: number): void {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function polaroid(ctx: CanvasRenderingContext2D, w: number, h: number, info: FrameInfo): void {
  const u = unit(w, h);
  const ins = frameInsets('polaroid', w, h);
  band(ctx, w, h, ins.l, ins.t, ins.r, ins.b, CREAM);
  // inner edge shade
  ctx.strokeStyle = 'rgba(42,28,20,.28)';
  ctx.lineWidth = Math.max(1, 0.35 * u);
  ctx.strokeRect(ins.l, ins.t, w - ins.l - ins.r, h - ins.t - ins.b);
  // washi tape at the top
  ctx.save();
  ctx.translate(w / 2, ins.t * 0.6);
  ctx.rotate(-0.05);
  ctx.fillStyle = 'rgba(255,111,160,.72)';
  ctx.fillRect(-11 * u, -2.6 * u, 22 * u, 5.2 * u);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = -10; i < 11; i += 4) ctx.fillRect(i * u, -2.6 * u, 1.4 * u, 5.2 * u);
  ctx.restore();
  // caption (handwritten feel: italic, slightly tilted)
  const cap = info.caption || 'Mochi';
  ctx.save();
  ctx.translate(w / 2, h - ins.b / 2 - 0.6 * u);
  ctx.rotate(-0.02);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, cap, w * 0.6, 8 * u, 'italic');
  ctx.fillStyle = INK;
  ctx.fillText(cap, 0, 0);
  ctx.restore();
}

function comic(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(w, h);
  const T = 6 * u;
  band(ctx, w, h, T, T, T, T, '#ffe066');
  // halftone: dots shrink towards the picture
  const g = 1.7 * u;
  ctx.fillStyle = '#ff4f7b';
  ctx.beginPath();
  for (let y = g / 2; y < h; y += g) {
    const inBandY = y < T || y > h - T;
    for (let x = ((Math.round(y / g) % 2) * g) / 2 + g / 2; x < w; x += g) {
      if (!inBandY && x > T && x < w - T) continue;
      const d = Math.min(x, y, w - x, h - y);
      const r = g * 0.46 * (1 - Math.min(1, d / T)) + g * 0.06;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1 * u;
  ctx.strokeRect(T, T, w - 2 * T, h - 2 * T);
  ctx.lineWidth = 0.9 * u;
  ctx.strokeRect(0.45 * u, 0.45 * u, w - 0.9 * u, h - 0.9 * u);
  // burst in the top-left corner
  const cx = T + 13 * u;
  const cy = T + 9 * u;
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? 9 * u : 15 * u;
    const a = (i * Math.PI) / n;
    const px = cx + Math.cos(a) * r * 1.35;
    const py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 0.8 * u;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, 'PURR-FECT!', 21 * u, 5.4 * u);
  outlinedText(ctx, 'PURR-FECT!', 0, 0, '#ff8a2a', INK, 0.9 * u);
  ctx.restore();
}

function film(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(w, h);
  const land = w >= h;
  const T = 10 * u;
  const ins = frameInsets('film', w, h);
  band(ctx, w, h, ins.l, ins.t, ins.r, ins.b, '#17110d');
  const len = land ? w : h;
  const step = 6.5 * u;
  const hw = 3.4 * u;
  const hh = 2.6 * u;
  ctx.fillStyle = '#f3e3c6';
  for (let p = step / 2; p < len; p += step) {
    for (const side of [0, 1]) {
      const c = side ? (land ? h : w) - T * 0.32 : T * 0.32;
      if (land) roundRect(ctx, p - hw / 2, c - hh / 2, hw, hh, 0.6 * u);
      else roundRect(ctx, c - hh / 2, p - hw / 2, hh, hw, 0.6 * u);
    }
  }
  ctx.fill();
  // edge print
  ctx.fillStyle = '#ffb03a';
  ctx.textBaseline = 'middle';
  ctx.font = font(2.6 * u);
  const label = 'MEOW 400  ▸ 07   MOCHI FILM CO.  ▸ 08';
  if (land) {
    ctx.textAlign = 'left';
    ctx.fillText(label, 4 * u, T * 0.74);
    ctx.fillText(label, w * 0.52, h - T * 0.74);
  } else {
    ctx.save();
    ctx.translate(T * 0.74, 4 * u);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function postcard(ctx: CanvasRenderingContext2D, w: number, h: number, info: FrameInfo): void {
  const u = unit(w, h);
  const B = 3.5 * u;
  band(ctx, w, h, B, B, B, B, '#fffdf6');
  ctx.strokeStyle = 'rgba(42,28,20,.35)';
  ctx.lineWidth = Math.max(1, 0.3 * u);
  ctx.strokeRect(B, B, w - 2 * B, h - 2 * B);
  // stamp, top right
  const sw = 16 * u;
  const sh = 20 * u;
  const sx = w - B - 3 * u - sw;
  const sy = B + 3 * u;
  ctx.save();
  ctx.translate(sx + sw / 2, sy + sh / 2);
  ctx.rotate(0.06);
  ctx.translate(-sw / 2, -sh / 2);
  // perforated edge
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(0, 0, sw, sh);
  ctx.fillStyle = 'rgba(42,28,20,.22)';
  const pr = 0.9 * u;
  ctx.beginPath();
  for (let x = pr; x < sw; x += pr * 2.6) {
    ctx.moveTo(x + pr, 0);
    ctx.arc(x, 0, pr, 0, Math.PI * 2);
    ctx.moveTo(x + pr, sh);
    ctx.arc(x, sh, pr, 0, Math.PI * 2);
  }
  for (let y = pr; y < sh; y += pr * 2.6) {
    ctx.moveTo(pr, y);
    ctx.arc(0, y, pr, 0, Math.PI * 2);
    ctx.moveTo(sw + pr, y);
    ctx.arc(sw, y, pr, 0, Math.PI * 2);
  }
  ctx.fill();
  const ix = 1.6 * u;
  const grad = ctx.createLinearGradient(0, ix, 0, sh - ix);
  grad.addColorStop(0, '#4cc3ff');
  grad.addColorStop(1, '#ffb03a');
  ctx.fillStyle = grad;
  ctx.fillRect(ix, ix, sw - 2 * ix, sh - 2 * ix);
  // a paw on the stamp
  ctx.fillStyle = CREAM;
  const px = sw / 2;
  const py = sh * 0.56;
  ctx.beginPath();
  ctx.ellipse(px, py + 1.2 * u, 3.4 * u, 2.8 * u, 0, 0, Math.PI * 2);
  for (const [dx, dy] of [[-3.4, -1.6], [-1.2, -3.6], [1.2, -3.6], [3.4, -1.6]]) {
    ctx.moveTo(px + dx * u + 1.2 * u, py + dy * u);
    ctx.ellipse(px + dx * u, py + dy * u, 1.2 * u, 1.5 * u, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = font(3.2 * u);
  ctx.fillText('5¢', ix + 1 * u, ix + 0.8 * u);
  ctx.restore();
  // postmark rings and waves over the stamp's corner
  ctx.save();
  ctx.strokeStyle = 'rgba(42,28,20,.55)';
  ctx.lineWidth = 0.45 * u;
  const mx = sx - 1 * u;
  const my = sy + sh * 0.7;
  ctx.beginPath();
  ctx.arc(mx, my, 6.5 * u, 0, Math.PI * 2);
  ctx.moveTo(mx + 5 * u, my);
  ctx.arc(mx, my, 5 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const yy = my - 3 * u + k * 2 * u;
    ctx.moveTo(mx + 7 * u, yy);
    for (let x = 0; x <= 16; x++) ctx.lineTo(mx + 7 * u + x * u, yy + Math.sin(x * 0.9) * 0.6 * u);
  }
  ctx.stroke();
  ctx.font = font(1.7 * u);
  ctx.fillStyle = 'rgba(42,28,20,.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MEOW RUN', mx, my - 1.4 * u);
  ctx.fillText('POST', mx, my + 1.4 * u);
  ctx.restore();
  // "Greetings from" + the stage name, bottom left
  const name = (info.stageName || 'Meow Run').toUpperCase();
  const left = B + 4 * u;
  const maxW = w - 2 * B - 8 * u;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const big = fitText(ctx, name, maxW, Math.min(14 * u, w * 0.11));
  const baseY = h - B - 4 * u;
  ctx.fillStyle = 'rgba(42,28,20,.55)';
  ctx.fillText(name, left + 0.9 * u, baseY + 0.9 * u);
  const g = ctx.createLinearGradient(0, baseY - big, 0, baseY);
  g.addColorStop(0, '#ffe066');
  g.addColorStop(1, '#ff8a2a');
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, big * 0.12);
  ctx.strokeText(name, left, baseY);
  ctx.fillStyle = g;
  ctx.fillText(name, left, baseY);
  ctx.font = font(Math.max(10, big * 0.38), 'italic');
  outlinedText(ctx, 'Greetings from', left + 0.5 * u, baseY - big * 0.98, CREAM, INK, Math.max(2, big * 0.07));
  ctx.restore();
}

function badge(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const u = unit(w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4 * u;
  ctx.strokeRect(0.7 * u, 0.7 * u, w - 1.4 * u, h - 1.4 * u);
  const r = 12 * u;
  const cx = 3 * u + r;
  const cy = 3 * u + r;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  // scalloped rim
  ctx.beginPath();
  const n = 18;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i * Math.PI) / n;
    const rr = i % 2 ? r * 0.93 : r;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(rr, 0);
  }
  ctx.closePath();
  ctx.fillStyle = '#ff8a2a';
  ctx.fill();
  ctx.lineWidth = 0.8 * u;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#ffc21a';
  ctx.fill();
  ctx.lineWidth = 0.6 * u;
  ctx.setLineDash([1.2 * u, 0.9 * u]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(5.6 * u);
  outlinedText(ctx, 'MEOW', 0, -2.6 * u, CREAM, INK, 1 * u);
  outlinedText(ctx, 'RUN', 0, 3.4 * u, CREAM, INK, 1 * u);
  // tiny paws on the rim
  ctx.fillStyle = INK;
  for (const a of [-0.9, 0.9]) {
    const px = Math.sin(a) * r * 0.64;
    const py = Math.cos(a) * r * 0.64;
    ctx.beginPath();
    ctx.arc(px, py, 0.9 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** paint a frame over a w x h photo */
export function drawFrame(ctx: CanvasRenderingContext2D, id: FrameId, w: number, h: number, info: FrameInfo): void {
  if (w < 2 || h < 2) return;
  ctx.save();
  switch (id) {
    case 'polaroid':
      polaroid(ctx, w, h, info);
      break;
    case 'comic':
      comic(ctx, w, h);
      break;
    case 'film':
      film(ctx, w, h);
      break;
    case 'postcard':
      postcard(ctx, w, h, info);
      break;
    case 'badge':
      badge(ctx, w, h);
      break;
    default:
      break;
  }
  ctx.restore();
}

/** the watermark, bottom right (clear of the frame; inside the polaroid's caption strip) */
export function drawWatermark(ctx: CanvasRenderingContext2D, frame: FrameId, w: number, h: number, text: string): void {
  const u = unit(w, h);
  const ins = frameInsets(frame, w, h);
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(Math.max(9, 2.7 * u));
  if (frame === 'polaroid') {
    ctx.fillStyle = 'rgba(42,28,20,.55)';
    ctx.fillText(text, w - ins.r - 1 * u, h - 2.2 * u);
  } else {
    const x = w - ins.r - 2.2 * u;
    const y = h - ins.b - 2.2 * u;
    ctx.globalAlpha = 0.92;
    outlinedText(ctx, text, x, y, CREAM, 'rgba(42,28,20,.85)', Math.max(2, 0.7 * u));
  }
  ctx.restore();
}

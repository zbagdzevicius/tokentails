// PHOTO lane: stickers. PURE (node-importable; the painters only take a CanvasRenderingContext2D argument).
// Every sticker is one list of shapes in a 100 x 100 box centred on 0,0. The same list renders as inline SVG (the
// draggable sticker on screen) and onto a canvas (the exported PNG), so the photo matches what the player placed.
// Placement is normalised: x, y are 0..1 of the image, size is a fraction of the image's short edge.

export type StickerId = 'paw' | 'heart' | 'star' | 'fish' | 'sparkle' | 'meow' | 'shades' | 'crown' | 'bell' | 'bow' | 'yarn' | 'zoom';

type Shape =
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'text'; x: number; y: number; text: string; size: number; fill: string; stroke?: string; sw?: number; rot?: number };

export interface StickerDef {
  id: StickerId;
  label: string;
  shapes: readonly Shape[];
}

const INK = '#2a1c14';
export const STICKER_FONT = "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Arial Rounded MT Bold', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function starPath(points: number, ro: number, ri: number, cx = 0, cy = 0, rot = -Math.PI / 2): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = rot + (i * Math.PI) / points;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  return `${d}Z`;
}

export const STICKERS: readonly StickerDef[] = [
  {
    id: 'paw',
    label: 'Paw',
    shapes: [
      { t: 'path', d: 'M0 2 C 20 2 30 22 26 33 C 22 44 8 40 0 40 C -8 40 -22 44 -26 33 C -30 22 -20 2 0 2 Z', fill: '#ff9a3c', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: -30, cy: -10, rx: 10, ry: 13, rot: -0.45, fill: '#ff9a3c', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: -11, cy: -27, rx: 10, ry: 14, rot: -0.12, fill: '#ff9a3c', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: 11, cy: -27, rx: 10, ry: 14, rot: 0.12, fill: '#ff9a3c', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: 30, cy: -10, rx: 10, ry: 13, rot: 0.45, fill: '#ff9a3c', stroke: INK, sw: 5 },
      { t: 'path', d: 'M0 12 C 12 12 17 22 15 28 C 12 34 5 31 0 31 C -5 31 -12 34 -15 28 C -17 22 -12 12 0 12 Z', fill: '#ffb3c8' },
    ],
  },
  {
    id: 'heart',
    label: 'Heart',
    shapes: [
      { t: 'path', d: 'M0 40 C -38 14 -46 -6 -40 -22 C -34 -38 -12 -42 0 -24 C 12 -42 34 -38 40 -22 C 46 -6 38 14 0 40 Z', fill: '#ff2f4f', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-28 -20 C -26 -28 -18 -31 -12 -28', fill: 'none', stroke: '#fff', sw: 5 },
    ],
  },
  {
    id: 'star',
    label: 'Star',
    shapes: [
      { t: 'path', d: starPath(5, 46, 20), fill: '#ffc21a', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: -8, cy: 2, rx: 3.5, ry: 5, fill: INK },
      { t: 'ellipse', cx: 8, cy: 2, rx: 3.5, ry: 5, fill: INK },
      { t: 'path', d: 'M-6 12 Q 0 17 6 12', fill: 'none', stroke: INK, sw: 3.5 },
    ],
  },
  {
    id: 'fish',
    label: 'Fish',
    shapes: [
      { t: 'path', d: 'M-42 0 Q -14 -30 18 -12 L 42 -26 L 37 0 L 42 26 L 18 12 Q -14 30 -42 0 Z', fill: '#7fd0ff', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-4 -16 Q 4 0 -4 16', fill: 'none', stroke: INK, sw: 3.5 },
      { t: 'ellipse', cx: -24, cy: -4, rx: 4.5, ry: 4.5, fill: INK },
    ],
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    shapes: [
      { t: 'path', d: 'M-6 -44 Q -3 -6 -44 -2 Q -3 2 -6 40 Q 0 2 38 -2 Q 0 -6 -6 -44 Z', fill: '#fff6a8', stroke: INK, sw: 4.5 },
      { t: 'path', d: 'M30 16 Q 32 30 44 31 Q 32 33 30 46 Q 28 33 16 31 Q 28 30 30 16 Z', fill: '#ffe066', stroke: INK, sw: 3.5 },
      { t: 'path', d: 'M28 -40 Q 29 -32 36 -31 Q 29 -30 28 -22 Q 27 -30 20 -31 Q 27 -32 28 -40 Z', fill: '#fff', stroke: INK, sw: 3 },
    ],
  },
  {
    id: 'meow',
    label: 'MEOW! bubble',
    shapes: [
      { t: 'path', d: 'M-44 -26 Q -44 -38 -32 -38 L 32 -38 Q 44 -38 44 -26 L 44 10 Q 44 22 32 22 L -2 22 L -20 40 L -16 22 L -32 22 Q -44 22 -44 10 Z', fill: '#fff7ea', stroke: INK, sw: 5 },
      { t: 'text', x: 0, y: -8, text: 'MEOW!', size: 25, fill: '#ff4f7b', stroke: INK, sw: 2.5, rot: -0.06 },
    ],
  },
  {
    id: 'shades',
    label: 'Sunglasses',
    shapes: [
      { t: 'path', d: 'M-46 -12 L 46 -12', fill: 'none', stroke: INK, sw: 6 },
      { t: 'path', d: 'M-44 -12 L -6 -12 Q -6 16 -24 16 Q -42 16 -44 -12 Z', fill: '#24324a', stroke: INK, sw: 5 },
      { t: 'path', d: 'M44 -12 L 6 -12 Q 6 16 24 16 Q 42 16 44 -12 Z', fill: '#24324a', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-36 -6 L -26 -6 M 14 -6 L 24 -6', fill: 'none', stroke: '#9fe3ff', sw: 3.5 },
    ],
  },
  {
    id: 'crown',
    label: 'Crown',
    shapes: [
      { t: 'path', d: 'M-40 24 L -44 -18 L -22 2 L 0 -32 L 22 2 L 44 -18 L 40 24 Z', fill: '#ffc21a', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-40 24 L 40 24 L 40 34 L -40 34 Z', fill: '#ffb000', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: 0, cy: 12, rx: 6, ry: 7, fill: '#ff4f7b', stroke: INK, sw: 3 },
      { t: 'ellipse', cx: -22, cy: 14, rx: 4.5, ry: 4.5, fill: '#4cc3ff', stroke: INK, sw: 3 },
      { t: 'ellipse', cx: 22, cy: 14, rx: 4.5, ry: 4.5, fill: '#7ccf5a', stroke: INK, sw: 3 },
    ],
  },
  {
    id: 'bell',
    label: 'Bell',
    shapes: [
      { t: 'path', d: 'M-30 18 Q -30 -30 0 -32 Q 30 -30 30 18 L 38 26 L -38 26 Z', fill: '#ffc21a', stroke: INK, sw: 5 },
      { t: 'ellipse', cx: 0, cy: 32, rx: 8, ry: 8, fill: '#c98a00', stroke: INK, sw: 4 },
      { t: 'path', d: 'M-14 -40 Q 0 -30 14 -40 L 10 -30 Q 0 -26 -10 -30 Z', fill: '#ff4f7b', stroke: INK, sw: 4 },
      { t: 'path', d: 'M-16 -12 Q -18 4 -16 12', fill: 'none', stroke: '#fff3b0', sw: 5 },
    ],
  },
  {
    id: 'bow',
    label: 'Bow',
    shapes: [
      { t: 'path', d: 'M0 0 L -40 -24 Q -46 0 -40 24 Z', fill: '#ff6fa0', stroke: INK, sw: 5 },
      { t: 'path', d: 'M0 0 L 40 -24 Q 46 0 40 24 Z', fill: '#ff6fa0', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-6 4 L -16 40 L -6 34 L 0 42 L 4 6 Z', fill: '#ff4f7b', stroke: INK, sw: 4 },
      { t: 'ellipse', cx: 0, cy: 0, rx: 11, ry: 13, fill: '#ff4f7b', stroke: INK, sw: 5 },
    ],
  },
  {
    id: 'yarn',
    label: 'Yarn ball',
    shapes: [
      { t: 'path', d: 'M30 30 Q 40 40 46 36', fill: 'none', stroke: '#b56cff', sw: 5 },
      { t: 'ellipse', cx: 0, cy: 0, rx: 36, ry: 36, fill: '#b56cff', stroke: INK, sw: 5 },
      { t: 'path', d: 'M-30 -18 Q 0 -6 22 -30 M -34 4 Q 0 14 34 -6 M -22 28 Q 6 26 30 18 M -10 -34 Q 10 0 -4 34', fill: 'none', stroke: '#e3c2ff', sw: 3.5 },
    ],
  },
  {
    id: 'zoom',
    label: 'ZOOM! burst',
    shapes: [
      { t: 'path', d: starPath(12, 48, 32, 0, 0, 0), fill: '#ffe066', stroke: INK, sw: 4.5 },
      { t: 'text', x: 0, y: 1, text: 'ZOOM!', size: 21, fill: '#ff8a2a', stroke: INK, sw: 2.5, rot: -0.12 },
    ],
  },
];

export const STICKER_IDS: readonly StickerId[] = STICKERS.map((s) => s.id);
export const stickerDef = (id: string): StickerDef | undefined => STICKERS.find((s) => s.id === id);

// ---------------------------------------------------------------- SVG
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const paint = (fill?: string, stroke?: string, sw?: number) =>
  `fill="${fill ?? 'none'}"${stroke ? ` stroke="${stroke}" stroke-width="${sw ?? 1}" stroke-linejoin="round" stroke-linecap="round"` : ''}`;

/** inline SVG markup for a sticker (viewBox -50 -50 100 100, fills its box) */
export function stickerSvg(def: StickerDef): string {
  let body = '';
  for (const s of def.shapes) {
    if (s.t === 'path') body += `<path d="${s.d}" ${paint(s.fill, s.stroke, s.sw)}/>`;
    else if (s.t === 'ellipse')
      body += `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${s.rot ? ` transform="rotate(${((s.rot * 180) / Math.PI).toFixed(2)} ${s.cx} ${s.cy})"` : ''} ${paint(s.fill, s.stroke, s.sw)}/>`;
    else
      body += `<text x="${s.x}" y="${s.y}" font-size="${s.size}" font-weight="900" font-family="${esc(STICKER_FONT)}" text-anchor="middle" dominant-baseline="central"${
        s.rot ? ` transform="rotate(${((s.rot * 180) / Math.PI).toFixed(2)} ${s.x} ${s.y})"` : ''
      } fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 1}" paint-order="stroke" stroke-linejoin="round"` : ''}>${esc(s.text)}</text>`;
  }
  return `<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

// ---------------------------------------------------------------- canvas
const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

/** draw a sticker centred at (x, y), `size` px across, rotated `rot` radians */
export function drawSticker(ctx: CanvasRenderingContext2D, def: StickerDef, x: number, y: number, size: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const k = size / 100;
  ctx.scale(k, k);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of def.shapes) {
    if (s.t === 'path') {
      const p = path2d(s.d);
      if (s.fill && s.fill !== 'none') {
        ctx.fillStyle = s.fill;
        ctx.fill(p);
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.sw ?? 1;
        ctx.stroke(p);
      }
    } else if (s.t === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.rot ?? 0, 0, Math.PI * 2);
      if (s.fill && s.fill !== 'none') {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.sw ?? 1;
        ctx.stroke();
      }
    } else {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.rot) ctx.rotate(s.rot);
      ctx.font = `900 ${s.size}px ${STICKER_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = (s.sw ?? 1) * 2; // paint-order stroke: half of it hides under the fill, like the SVG
        ctx.strokeText(s.text, 0, 0);
      }
      ctx.fillStyle = s.fill;
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- placement maths
export const MAX_STICKERS = 12;
export const SIZE_MIN = 0.06;
export const SIZE_MAX = 0.7;
export const SIZE_START = 0.2;
export const SIZE_STEP = 1.18;

/** a placed sticker: x, y = 0..1 of the image, size = fraction of the short edge, rot = radians */
export interface Placed {
  uid: number;
  id: StickerId;
  x: number;
  y: number;
  size: number;
  rot: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clampSize = (s: number) => clamp(Number.isFinite(s) ? s : SIZE_START, SIZE_MIN, SIZE_MAX);

/** normalised -> pixels for an image of w x h */
export function toPx(p: Pick<Placed, 'x' | 'y' | 'size'>, w: number, h: number): { x: number; y: number; size: number } {
  return { x: p.x * w, y: p.y * h, size: p.size * Math.min(w, h) };
}
/** pixels -> normalised (clamped to the image) */
export function fromPx(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return { x: w > 0 ? clamp(x / w, 0, 1) : 0.5, y: h > 0 ? clamp(y / h, 0, 1) : 0.5 };
}
/** pixel size -> normalised size (clamped) */
export const sizeFromPx = (px: number, w: number, h: number) => clampSize(px / Math.max(1, Math.min(w, h)));

/** where a new sticker goes: the centre, nudged so stacked adds stay visible */
export function spawnSpot(count: number): { x: number; y: number } {
  const a = count * 2.4;
  const r = count ? 0.06 + 0.012 * count : 0;
  return { x: clamp(0.5 + Math.cos(a) * r, 0.08, 0.92), y: clamp(0.45 + Math.sin(a) * r * 0.8, 0.08, 0.92) };
}

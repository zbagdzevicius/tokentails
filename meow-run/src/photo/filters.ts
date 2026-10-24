// PHOTO lane: photo filters. PURE (node-importable): no document, window or engine imports.
// The live view uses a CSS filter on the renderer canvas (FILTER_CSS); the exported PNG runs applyFilter on the
// grabbed pixels. CSS filter functions are linear colour matrices in sRGB (Filter Effects Level 1), so warm and noir
// are built from the exact same matrices and clamped after every step like the browser does: the export matches the
// screen. Dreamy adds a soft glow (quarter-res blur, screen-blended) and the pink edge lift of the live overlay.

export type FilterId = 'none' | 'warm' | 'noir' | 'dreamy' | 'pixel';
export const FILTERS: readonly FilterId[] = ['none', 'warm', 'noir', 'dreamy', 'pixel'];
export const FILTER_LABEL: Record<FilterId, string> = { none: 'NONE', warm: 'WARM', noir: 'NOIR', dreamy: 'DREAMY', pixel: 'PIXEL' };

/** the live CSS filter on renderer.domElement (pixel is done with the pixel ratio instead) */
export const FILTER_CSS: Record<FilterId, string> = {
  none: '',
  warm: 'sepia(.28) saturate(1.35) hue-rotate(-8deg) brightness(1.04)',
  noir: 'grayscale(1) contrast(1.35) brightness(.95)',
  dreamy: 'saturate(1.25) brightness(1.08) contrast(.92) blur(.5px)',
  pixel: '',
};

/** live pixel filter: renderer pixel ratio (the canvas is upscaled with image-rendering: pixelated) */
export const PIXEL_RATIO = 0.22;
/** export pixel filter: nearest downscale to 1/PIXEL_BLOCK, then nearest upscale */
export const PIXEL_BLOCK = 8;

/** Dreamy pink lift: an ellipse (75% x 75% of the image) centred at 50% 45%, clear inside 40%, PINK_A at the rim. */
export const PINK = [255, 170, 210] as const;
export const PINK_A = 0.38;
export const PINK_IN = 0.3;
export const PINK_CX = 0.5;
export const PINK_CY = 0.45;
export const PINK_R = 0.75;
/** the same lift as a CSS background for the live overlay div */
export const PINK_CSS = `radial-gradient(ellipse ${PINK_R * 100}% ${PINK_R * 100}% at ${PINK_CX * 100}% ${PINK_CY * 100}%, rgba(${PINK.join(',')},0) ${PINK_IN * 100}%, rgba(${PINK.join(',')},${PINK_A}) 100%)`;
/** pink alpha at normalised image coordinates (0..1) */
export function pinkAlpha(nx: number, ny: number): number {
  const dx = (nx - PINK_CX) / PINK_R;
  const dy = (ny - PINK_CY) / PINK_R;
  const d = Math.sqrt(dx * dx + dy * dy);
  return PINK_A * Math.max(0, Math.min(1, (d - PINK_IN) / (1 - PINK_IN)));
}
/** dreamy glow strength (screen blend of the blurred copy) */
export const GLOW = 0.42;

// ---------------------------------------------------------------- colour matrices (CSS Filter Effects, sRGB)
/** a 3x3 row-major matrix plus an offset (0..1 units) */
interface Op {
  m: number[];
  o: number[];
}
const mat = (m: number[], o = [0, 0, 0]): Op => ({ m, o });
function sepia(a: number): Op {
  const k = 1 - a;
  return mat([0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]);
}
function grayscale(a: number): Op {
  const k = 1 - a;
  return mat([0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k]);
}
function saturate(s: number): Op {
  return mat([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]);
}
function hueRotate(deg: number): Op {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return mat([
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]);
}
const brightness = (b: number): Op => mat([b, 0, 0, 0, b, 0, 0, 0, b]);
const contrast = (c: number): Op => mat([c, 0, 0, 0, c, 0, 0, 0, c], [0.5 - 0.5 * c, 0.5 - 0.5 * c, 0.5 - 0.5 * c]);

/** the colour steps of each filter, in CSS order (blur and the pink overlay are handled separately) */
export const FILTER_OPS: Record<FilterId, readonly Op[]> = {
  none: [],
  warm: [sepia(0.28), saturate(1.35), hueRotate(-8), brightness(1.04)],
  noir: [grayscale(1), contrast(1.35), brightness(0.95)],
  dreamy: [saturate(1.25), brightness(1.08), contrast(0.92)],
  pixel: [],
};

export interface Img {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** apply colour ops in place (each step clamped to 0..1, like chained CSS filter functions) */
function applyOps(img: Img, ops: readonly Op[]): void {
  if (!ops.length) return;
  const d = img.data;
  const n = img.width * img.height * 4;
  for (let i = 0; i < n; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    for (let k = 0; k < ops.length; k++) {
      const m = ops[k].m;
      const o = ops[k].o;
      const r2 = clamp01(m[0] * r + m[1] * g + m[2] * b + o[0]);
      const g2 = clamp01(m[3] * r + m[4] * g + m[5] * b + o[1]);
      const b2 = clamp01(m[6] * r + m[7] * g + m[8] * b + o[2]);
      r = r2;
      g = g2;
      b = b2;
    }
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
}

/** pixel art: nearest downscale to 1/block (the sample at each block's centre), then nearest upscale */
function pixelate(img: Img, block: number): void {
  const B = Math.max(1, Math.round(block));
  if (B <= 1) return;
  const { data: d, width: w, height: h } = img;
  for (let by = 0; by < h; by += B) {
    const sy = Math.min(h - 1, by + (B >> 1));
    for (let bx = 0; bx < w; bx += B) {
      const sx = Math.min(w - 1, bx + (B >> 1));
      const si = (sy * w + sx) * 4;
      const r = d[si];
      const g = d[si + 1];
      const b = d[si + 2];
      const a = d[si + 3];
      const ey = Math.min(h, by + B);
      const ex = Math.min(w, bx + B);
      for (let y = by; y < ey; y++) {
        let i = (y * w + bx) * 4;
        for (let x = bx; x < ex; x++, i += 4) {
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = a;
        }
      }
    }
  }
}

/** box blur (separable, radius r) of a 3-channel float image in place */
function boxBlur3(src: Float32Array, w: number, h: number, r: number): void {
  if (r < 1 || w < 1 || h < 1) return;
  const tmp = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[(y * w + Math.max(0, Math.min(w - 1, k))) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = acc / win;
        const out = Math.max(0, x - r);
        const inn = Math.min(w - 1, x + r + 1);
        acc += src[(y * w + inn) * 3 + c] - src[(y * w + out) * 3 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.max(0, Math.min(h - 1, k)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        src[(y * w + x) * 3 + c] = acc / win;
        const out = Math.max(0, y - r);
        const inn = Math.min(h - 1, y + r + 1);
        acc += tmp[(inn * w + x) * 3 + c] - tmp[(out * w + x) * 3 + c];
      }
    }
  }
}

/** dreamy: a quarter-res blurred copy screen-blended on top (GLOW), then the pink edge lift */
function dreamy(img: Img): void {
  const { data: d, width: w, height: h } = img;
  const qw = Math.max(1, Math.ceil(w / 4));
  const qh = Math.max(1, Math.ceil(h / 4));
  const q = new Float32Array(qw * qh * 3);
  const cnt = new Float32Array(qw * qh);
  for (let y = 0; y < h; y++) {
    const qy = y >> 2;
    for (let x = 0; x < w; x++) {
      const qi = qy * qw + (x >> 2);
      const i = (y * w + x) * 4;
      q[qi * 3] += d[i];
      q[qi * 3 + 1] += d[i + 1];
      q[qi * 3 + 2] += d[i + 2];
      cnt[qi]++;
    }
  }
  for (let i = 0; i < qw * qh; i++) {
    const c = cnt[i] || 1;
    q[i * 3] /= c * 255;
    q[i * 3 + 1] /= c * 255;
    q[i * 3 + 2] /= c * 255;
  }
  boxBlur3(q, qw, qh, Math.max(1, Math.round(Math.min(qw, qh) / 60)));
  boxBlur3(q, qw, qh, Math.max(1, Math.round(Math.min(qw, qh) / 60)));
  for (let y = 0; y < h; y++) {
    // bilinear sample of the quarter-res glow
    const fy = Math.max(0, Math.min(qh - 1, (y + 0.5) / 4 - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(qh - 1, y0 + 1);
    const ty = fy - y0;
    const ny = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(qw - 1, (x + 0.5) / 4 - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(qw - 1, x0 + 1);
      const tx = fx - x0;
      const a = pinkAlpha((x + 0.5) / w, ny);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const g00 = q[(y0 * qw + x0) * 3 + c];
        const g10 = q[(y0 * qw + x1) * 3 + c];
        const g01 = q[(y1 * qw + x0) * 3 + c];
        const g11 = q[(y1 * qw + x1) * 3 + c];
        const gl = (g00 * (1 - tx) + g10 * tx) * (1 - ty) + (g01 * (1 - tx) + g11 * tx) * ty;
        const base = d[i + c] / 255;
        const scr = 1 - (1 - base) * (1 - gl * GLOW);
        const out = scr * (1 - a) + (PINK[c] / 255) * a;
        d[i + c] = clamp01(out) * 255;
      }
    }
  }
}

/**
 * Apply a filter to RGBA pixels in place (the exported photo). `pixelBlock` = the pixel filter's block size in image
 * pixels (default PIXEL_BLOCK; the shutter passes the size that matches the live view).
 */
export function applyFilter(img: Img, id: FilterId, opts: { pixelBlock?: number } = {}): void {
  if (!img.width || !img.height) return;
  switch (id) {
    case 'warm':
    case 'noir':
      applyOps(img, FILTER_OPS[id]);
      return;
    case 'dreamy':
      applyOps(img, FILTER_OPS.dreamy);
      dreamy(img);
      return;
    case 'pixel':
      pixelate(img, opts.pixelBlock ?? PIXEL_BLOCK);
      return;
    default:
      return;
  }
}

/** export block size that matches the live pixel view: one live pixel = 1 / PIXEL_RATIO css px */
export function matchingPixelBlock(imageWidth: number, cssWidth: number): number {
  if (!(cssWidth > 0) || !(imageWidth > 0)) return PIXEL_BLOCK;
  return Math.max(2, Math.round(imageWidth / cssWidth / PIXEL_RATIO));
}

export const isFilterId = (v: unknown): v is FilterId => typeof v === 'string' && (FILTERS as readonly string[]).includes(v);

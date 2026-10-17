/**
 * Face decal maths and canvas work (GDD 6.1 step 2).
 *
 * The crop is a square in working-photo pixels; the face oval is inscribed in it (OVAL_RX × OVAL_RY of the
 * side). Because the square is clamped inside the photo, the oval is always inside the photo too.
 * Pure helpers (crop maths, featherAlpha, ringMedianColour) are Node-testable; canvas helpers only run in a
 * browser.
 */

import { FUR_CHIPS, nearestChip } from './body-colour';

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Decal side in pixels (GDD: 256 × 256). */
export const DECAL_SIZE = 256;
/** Oval radii as a fraction of the crop side (slightly taller than wide, like a cat face). */
export const OVAL_RX = 0.45;
export const OVAL_RY = 0.49;
/** Feather band as a fraction of the oval radius. */
export const FEATHER = 0.14;
/** Smallest crop side in photo pixels (or the photo's short side if that is smaller). */
export const MIN_CROP_PX = 40;
/** Initial crop: centred, this fraction of the short side. */
export const INITIAL_FRACTION = 0.62;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Pre-placed crop at the centre of the photo. */
export function initialCrop(imgW: number, imgH: number): Crop {
  const side = Math.max(1, Math.round(Math.min(imgW, imgH) * INITIAL_FRACTION));
  return clampCrop({ x: (imgW - side) / 2, y: (imgH - side) / 2, w: side, h: side }, imgW, imgH);
}

/** Keeps the crop square, between MIN_CROP_PX and the short side, and fully inside the photo. */
export function clampCrop(c: Crop, imgW: number, imgH: number): Crop {
  const maxSide = Math.max(1, Math.min(imgW, imgH));
  const minSide = Math.min(MIN_CROP_PX, maxSide);
  const side = clamp(Number.isFinite(c.w) ? c.w : maxSide, minSide, maxSide);
  const cx = (Number.isFinite(c.x) ? c.x : 0) + (Number.isFinite(c.w) ? c.w : side) / 2;
  const cy = (Number.isFinite(c.y) ? c.y : 0) + (Number.isFinite(c.h) ? c.h : side) / 2;
  const x = clamp(cx - side / 2, 0, imgW - side);
  const y = clamp(cy - side / 2, 0, imgH - side);
  return { x, y, w: side, h: side };
}

/** Moves the crop by (dx, dy) photo pixels, then clamps. */
export function dragCrop(c: Crop, dx: number, dy: number, imgW: number, imgH: number): Crop {
  return clampCrop({ x: c.x + dx, y: c.y + dy, w: c.w, h: c.h }, imgW, imgH);
}

/**
 * Scales the crop side by `scale` (pinch: > 1 grows the oval) around its centre, then clamps.
 * The centre stays put unless clamping pushes it.
 */
export function pinchCrop(c: Crop, scale: number, imgW: number, imgH: number): Crop {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const maxSide = Math.max(1, Math.min(imgW, imgH));
  const minSide = Math.min(MIN_CROP_PX, maxSide);
  const side = clamp(c.w * s, minSide, maxSide);
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  return clampCrop({ x: cx - side / 2, y: cy - side / 2, w: side, h: side }, imgW, imgH);
}

/** Oval distance of pixel (px, py) in a size × size square: 0 at the centre, 1 on the oval edge. */
export function ovalDistance(px: number, py: number, size: number): number {
  const nx = (px + 0.5 - size / 2) / (size * OVAL_RX);
  const ny = (py + 0.5 - size / 2) / (size * OVAL_RY);
  return Math.sqrt(nx * nx + ny * ny);
}

/** Alpha 0..255 of the feathered oval mask at pixel (px, py) of a size × size decal. */
export function featherAlpha(px: number, py: number, size: number): number {
  const d = ovalDistance(px, py, size);
  const inner = 1 - FEATHER;
  if (d <= inner) return 255;
  if (d >= 1) return 0;
  const t = (1 - d) / FEATHER; // 1 at inner edge, 0 at outer
  return Math.round(255 * t * t * (3 - 2 * t));
}

/**
 * Median colour (0xRRGGBB) of the crop's outer ring: pixels whose oval distance is in [0.72, 1.0], i.e. the fur
 * around the face. Per-channel median via histograms (deterministic). Transparent pixels (alpha < 128) are
 * ignored. Falls back to every opaque pixel if the ring is empty, and to mid grey if nothing is opaque.
 */
export function ringMedianColour(pixels: Uint8ClampedArray, w: number, h: number): number {
  const hr = new Uint32Array(256);
  const hg = new Uint32Array(256);
  const hb = new Uint32Array(256);
  let n = 0;
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  const collect = (ring: boolean): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (pixels[i + 3] < 128) continue;
        if (ring) {
          const d = ovalDistance(x - ox, y - oy, size);
          if (d < 0.72 || d > 1) continue;
        }
        hr[pixels[i]]++;
        hg[pixels[i + 1]]++;
        hb[pixels[i + 2]]++;
        n++;
      }
    }
  };
  collect(true);
  if (n === 0) collect(false);
  if (n === 0) return 0x808080;
  const median = (hist: Uint32Array): number => {
    const half = Math.floor((n - 1) / 2);
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc > half) return v;
    }
    return 255;
  };
  return (median(hr) << 16) | (median(hg) << 8) | median(hb);
}

/** Hue (degrees) and saturation (0..1) of an RGB triple. */
export function hueSat(r: number, g: number, b: number): [number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const sat = mx === 0 ? 0 : d / mx;
  if (d === 0) return [0, 0];
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, sat];
}

/** Cat coats are greys or warm (red / orange / brown / cream) hues; saturated greens, blues, purples are background. */
export function isCoatPixel(r: number, g: number, b: number): boolean {
  const [h, s] = hueSat(r, g, b);
  if (s < 0.28) return true;
  return h <= 60 || h >= 340;
}

/**
 * Fur colour from inside the face oval (cheeks and forehead, d 0.3..0.85; the eyes and nose sit nearer the
 * centre, the background outside), ignoring non-coat pixels (saturated green/blue/purple), median per channel.
 * Falls back to every opaque pixel, then mid grey.
 */
export function faceFurColour(pixels: Uint8ClampedArray, w: number, h: number): number {
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  const take = (inner: number, outer: number, coatOnly: boolean): number | null => {
    const hr = new Uint32Array(256);
    const hg = new Uint32Array(256);
    const hb = new Uint32Array(256);
    let n = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (pixels[i + 3] < 128) continue;
        const d = ovalDistance(x - ox, y - oy, size);
        if (d < inner || d > outer) continue;
        if (coatOnly && !isCoatPixel(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
        hr[pixels[i]]++;
        hg[pixels[i + 1]]++;
        hb[pixels[i + 2]]++;
        n++;
      }
    if (n < 8) return null;
    const median = (hist: Uint32Array): number => {
      const half = Math.floor((n - 1) / 2);
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc > half) return v;
      }
      return 255;
    };
    return (median(hr) << 16) | (median(hg) << 8) | median(hb);
  };
  return take(0.3, 0.85, true) ?? take(0, 1, true) ?? take(0, 1, false) ?? 0x808080;
}

/**
 * How much of a decal pixel to keep (0..1): the photo background (a saturated green lawn, a blue blanket) is faded
 * out toward the oval's edge, where it shows; the face middle (eyes may be green or blue) is always kept. Round 2:
 * a green patch sat on the 3D cat's face.
 */
export function backgroundKeep(r: number, g: number, b: number, dist: number): number {
  if (dist < 0.5 || isCoatPixel(r, g, b)) return 1;
  // 0.5 -> 1 (kept), 0.7 and beyond -> 0
  const t = (dist - 0.5) / 0.2;
  return t >= 1 ? 0 : 1 - t;
}

// --------------------------------------------------------------------------------------------- browser only

type Source = ImageBitmap | HTMLCanvasElement;

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 256 × 256 canvas of the crop with the feathered oval alpha. */
export function cropToDecal(src: Source, crop: Crop): HTMLCanvasElement {
  const out = newCanvas(DECAL_SIZE, DECAL_SIZE);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, DECAL_SIZE, DECAL_SIZE);
  try {
    const img = ctx.getImageData(0, 0, DECAL_SIZE, DECAL_SIZE);
    const d = img.data;
    for (let y = 0; y < DECAL_SIZE; y++) {
      for (let x = 0; x < DECAL_SIZE; x++) {
        const i = (y * DECAL_SIZE + x) * 4;
        const keep = backgroundKeep(d[i], d[i + 1], d[i + 2], ovalDistance(x, y, DECAL_SIZE));
        d[i + 3] = (d[i + 3] * featherAlpha(x, y, DECAL_SIZE) * keep) / 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    // Tainted or unsupported: fall back to a hard-edged oval clip.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.ellipse(DECAL_SIZE / 2, DECAL_SIZE / 2, DECAL_SIZE * OVAL_RX, DECAL_SIZE * OVAL_RY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  return out;
}

/**
 * Fur colour of the photo, snapped to the nearest coat chip (FUR_CHIPS) so a green background or a blue blanket
 * never becomes a green cat. Sampled inside the face oval on a small 64 × 64 copy of the crop.
 */
export function sampleFurColour(src: Source, crop: Crop): number | null {
  try {
    const c = newCanvas(64, 64);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, 64, 64);
    return FUR_CHIPS[nearestChip(faceFurColour(ctx.getImageData(0, 0, 64, 64).data, 64, 64))].rgb;
  } catch {
    return null;
  }
}

/** canvas → Blob, with a toDataURL fallback for old engines. */
export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const viaDataUrl = (): void => {
      try {
        const url = c.toDataURL(type, quality);
        const comma = url.indexOf(',');
        const bin = atob(url.slice(comma + 1));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: url.slice(5, url.indexOf(';')) || type }));
      } catch {
        resolve(null);
      }
    };
    try {
      if (typeof c.toBlob !== 'function') return viaDataUrl();
      c.toBlob((b) => (b ? resolve(b) : viaDataUrl()), type, quality);
    } catch {
      viaDataUrl();
    }
  });
}

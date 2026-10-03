/**
 * Raster helpers for the art pipeline (plan G7): RGBA buffers, extrusion to the runtime grid, tile
 * cells, edge SSIM. Images are `{ width, height, data }` with `data` a tightly packed RGBA
 * `Uint8Array`/`Buffer`.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

export { sharp };

export async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export function blank(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function clone(img) {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

/**
 * Lossless PNG. `palette: true` writes an indexed PNG (only valid when the image already has at
 * most 256 colours, which every palette-snapped output does); the pixels decode back exactly.
 * Compression is fixed so the bytes are stable for one sharp/libvips version.
 */
export async function writePng(img, file, { palette = false } = {}) {
  return pngPipeline(img, palette).toFile(file);
}

/** The bytes `writePng` would write, so a gate can compare a rebuild with the file on disk. */
export async function encodePng(img, { palette = false } = {}) {
  return pngPipeline(img, palette).toBuffer();
}

function pngPipeline(img, palette) {
  const pipeline = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
  const options = palette
    ? { palette: true, colours: 256, dither: 0, effort: 10, compressionLevel: 9 }
    : { compressionLevel: 9, adaptiveFiltering: false };
  return pipeline.png(options);
}

/** The PNG bytes of an image (used for posters and the contact sheets). */
export function toSharp(img) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
}

/**
 * The runtime extrude profile: what `tile-extruder --margin 0 --spacing 0` produced for every
 * sheet the scenes load with `addTilesetImage(key, key, 32, 32, 1, 2)`. Each authored tile gets a
 * one-pixel border that repeats its own edge pixels, so bilinear sampling at the tile edge reads
 * the tile itself and never its neighbour.
 */
export const EXTRUDE_PROFILES = {
  "standard-32": { tileWidth: 32, tileHeight: 32, extrusion: 1, margin: 1, spacing: 2 },
  // ENDLESS (combined.png): the same grid maths, but 210 columns by 11 rows, so the profile carries
  // its own name and its own expected size (7140 x 374) for the gate (decision on scope, plan G7).
  "combined-32": { tileWidth: 32, tileHeight: 32, extrusion: 1, margin: 1, spacing: 2 },
};

export function extrude(src, { tileWidth, tileHeight, extrusion }) {
  const cols = Math.floor(src.width / tileWidth);
  const rows = Math.floor(src.height / tileHeight);
  const cellW = tileWidth + 2 * extrusion;
  const cellH = tileHeight + 2 * extrusion;
  const out = blank(cols * cellW, rows * cellH);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      for (let y = -extrusion; y < tileHeight + extrusion; y++) {
        const sy = row * tileHeight + Math.min(tileHeight - 1, Math.max(0, y));
        const dy = row * cellH + extrusion + y;
        for (let x = -extrusion; x < tileWidth + extrusion; x++) {
          const sx = col * tileWidth + Math.min(tileWidth - 1, Math.max(0, x));
          const dx = col * cellW + extrusion + x;
          const si = (sy * src.width + sx) * 4;
          const di = (dy * out.width + dx) * 4;
          out.data[di] = src.data[si];
          out.data[di + 1] = src.data[si + 1];
          out.data[di + 2] = src.data[si + 2];
          out.data[di + 3] = src.data[si + 3];
        }
      }
    }
  }
  return out;
}

/** The expected runtime size of an extruded sheet. */
export function extrudedSize(cols, rows, profile) {
  const p = EXTRUDE_PROFILES[profile];
  return {
    width: 2 * p.margin + cols * p.tileWidth + (cols - 1) * p.spacing,
    height: 2 * p.margin + rows * p.tileHeight + (rows - 1) * p.spacing,
  };
}

/** Pixel-exact equality of two images, ignoring the colour of fully transparent pixels. */
export function samePixels(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] !== b.data[i + 3]) return false;
    if (a.data[i + 3] === 0) continue;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) return false;
  }
  return true;
}

/** Count of pixels whose alpha differs between two equal-size images. */
export function alphaMaskDiff(a, b) {
  let diff = 0;
  for (let i = 3; i < a.data.length; i += 4) if ((a.data[i] > 0) !== (b.data[i] > 0)) diff++;
  return diff;
}

/** Pixels of one tile cell of an UNEXTRUDED sheet (tile index is 0-based). */
export function tileCell(img, index, tile = 32) {
  const cols = Math.floor(img.width / tile);
  const x0 = (index % cols) * tile;
  const y0 = Math.floor(index / cols) * tile;
  const out = blank(tile, tile);
  for (let y = 0; y < tile; y++) {
    const si = ((y0 + y) * img.width + x0) * 4;
    out.data.set(img.data.subarray(si, si + tile * 4), y * tile * 4);
  }
  return out;
}

export function putCell(img, index, cell, tile = 32) {
  const cols = Math.floor(img.width / tile);
  const x0 = (index % cols) * tile;
  const y0 = Math.floor(index / cols) * tile;
  for (let y = 0; y < tile; y++) {
    img.data.set(cell.data.subarray(y * tile * 4, (y + 1) * tile * 4), ((y0 + y) * img.width + x0) * 4);
  }
}

/** Nearest-neighbour resample to an exact size (no filtering, pixel art stays crisp). */
export function resizeNearest(img, width, height) {
  const out = blank(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      const si = (sy * img.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** Source-over composite of `top` onto `base` (same size), in place on `base`. */
export function compositeOver(base, top) {
  const b = base.data;
  const t = top.data;
  for (let i = 0; i < b.length; i += 4) {
    const a = t[i + 3] / 255;
    if (a === 0) continue;
    const ba = b[i + 3] / 255;
    const oa = a + ba * (1 - a);
    for (let c = 0; c < 3; c++) b[i + c] = Math.round((t[i + c] * a + b[i + c] * ba * (1 - a)) / (oa || 1));
    b[i + 3] = Math.round(oa * 255);
  }
  return base;
}

/** Horizontal mirror-wrap: the image followed by its mirror, so it tiles seamlessly on X. */
export function mirrorWrapX(img) {
  const out = blank(img.width * 2, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const si = (y * img.width + x) * 4;
      const d1 = (y * out.width + x) * 4;
      const d2 = (y * out.width + (out.width - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) {
        out.data[d1 + c] = img.data[si + c];
        out.data[d2 + c] = img.data[si + c];
      }
    }
  }
  return out;
}

/** Distinct opaque colours (packed RGB) of an image. */
export function distinctColours(img) {
  const set = new Set();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    set.add((img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2]);
  }
  return set;
}

function grey(img) {
  const g = new Float64Array(img.width * img.height);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    const a = img.data[i + 3] / 255;
    g[p] = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) * a;
  }
  // Min-max normalise: edge structure is compared, not the grade (a night pass darkens on purpose).
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of g) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let p = 0; p < g.length; p++) g[p] = ((g[p] - lo) / span) * 255;
  return g;
}

/** A 3 x 3 binomial blur (sigma about 0.85): the usual pre-smoothing before an edge operator. */
function smooth(g, w, h) {
  const out = new Float64Array(w * h);
  const k = [1, 2, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let wsum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const wt = k[dx + 1] * k[dy + 1];
          sum += g[yy * w + xx] * wt;
          wsum += wt;
        }
      }
      out[y * w + x] = sum / wsum;
    }
  }
  return out;
}

function sobel(g, w, h) {
  const out = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (dx, dy) => g[(y + dy) * w + x + dx];
      const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
      const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
      out[y * w + x] = Math.min(255, Math.hypot(gx, gy) / 4);
    }
  }
  return out;
}

/**
 * Edge SSIM (the G6 dusk-plate gate): mean SSIM over 8 x 8 windows of the Sobel edge maps of the
 * two images (equal size), each min-max normalised and pre-smoothed with a 3 x 3 binomial kernel
 * (as Canny does) so single-pixel snapping speckle is not counted as structure. 1 means identical
 * edge structure.
 */
export function edgeSsim(a, b, win = 8) {
  if (a.width !== b.width || a.height !== b.height) throw new Error("edgeSsim: size mismatch");
  const w = a.width;
  const h = a.height;
  const ea = sobel(smooth(grey(a), w, h), w, h);
  const eb = sobel(smooth(grey(b), w, h), w, h);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  let total = 0;
  let n = 0;
  for (let y0 = 0; y0 + win <= h; y0 += win) {
    for (let x0 = 0; x0 + win <= w; x0 += win) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let y = y0; y < y0 + win; y++) {
        for (let x = x0; x < x0 + win; x++) {
          const va = ea[y * w + x];
          const vb = eb[y * w + x];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const N = win * win;
      const ma = sa / N;
      const mb = sb / N;
      const va = saa / N - ma * ma;
      const vb = sbb / N - mb * mb;
      const cov = sab / N - ma * mb;
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n ? total / n : 1;
}

/** The authored tiles of an extruded runtime sheet: the inverse of `extrude`. */
export function unextrude(sheet, { tileWidth, tileHeight, margin, spacing }) {
  const cols = Math.round((sheet.width - 2 * margin + spacing) / (tileWidth + spacing));
  const rows = Math.round((sheet.height - 2 * margin + spacing) / (tileHeight + spacing));
  const out = blank(cols * tileWidth, rows * tileHeight);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = margin + col * (tileWidth + spacing);
      const sy = margin + row * (tileHeight + spacing);
      for (let y = 0; y < tileHeight; y++) {
        const si = ((sy + y) * sheet.width + sx) * 4;
        out.data.set(sheet.data.subarray(si, si + tileWidth * 4), ((row * tileHeight + y) * out.width + col * tileWidth) * 4);
      }
    }
  }
  return { image: out, cols, rows };
}

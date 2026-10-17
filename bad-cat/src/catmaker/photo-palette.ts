/**
 * Photo palette (GDD 6.1 step 3, full version): k-means with k = 3 over the coat pixels around the face crop and the
 * body below it. Deterministic: the first centroid is the median-luma colour, every next one the colour farthest
 * from the centroids so far (ties: the lowest index), centroids are integer channel means, and the clusters come
 * back sorted by size (ties: darker first). Pure and Node-testable; the canvas sampler at the bottom is browser only.
 */
import { colourDistance, luma } from './body-colour';
import { isCoatPixel, ovalDistance, type Crop } from './face-decal';

export interface PaletteCluster {
  rgb: number; // 0xRRGGBB centroid
  count: number;
  share: number; // 0..1 of the sampled pixels
}

export interface KmeansResult {
  clusters: PaletteCluster[];
  /** Cluster index (into `clusters`) per input colour. */
  assign: Uint8Array;
  iterations: number;
  converged: boolean;
}

export const PALETTE_K = 3;
export const KMEANS_MAX_ITER = 32;

const ch = (c: number): [number, number, number] => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

/** k-means over RGB888 colours. Deterministic for the same input order. */
export function kmeans(colours: ArrayLike<number>, k = PALETTE_K, maxIter = KMEANS_MAX_ITER): KmeansResult {
  const n = colours.length;
  if (n === 0) return { clusters: [], assign: new Uint8Array(0), iterations: 0, converged: true };
  const kk = Math.max(1, Math.min(k, 255));

  // --- deterministic farthest-point init
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => luma(colours[a]) - luma(colours[b]) || a - b);
  const cent: number[] = [colours[order[(n - 1) >> 1]]];
  const minD = new Float64Array(n);
  for (let i = 0; i < n; i++) minD[i] = colourDistance(colours[i], cent[0]);
  while (cent.length < kk) {
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < n; i++)
      if (minD[i] > bestD) {
        bestD = minD[i];
        best = i;
      }
    if (best < 0) break; // fewer distinct colours than k
    const c = colours[best];
    cent.push(c);
    for (let i = 0; i < n; i++) {
      const d = colourDistance(colours[i], c);
      if (d < minD[i]) minD[i] = d;
    }
  }

  // --- Lloyd iterations
  const m = cent.length;
  const assign = new Uint8Array(n);
  let iterations = 0;
  let converged = false;
  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;
    let changed = it === 0;
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < m; j++) {
        const d = colourDistance(colours[i], cent[j]);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      if (assign[i] !== bi) {
        assign[i] = bi;
        changed = true;
      }
    }
    const sr = new Float64Array(m);
    const sg = new Float64Array(m);
    const sb = new Float64Array(m);
    const cnt = new Uint32Array(m);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = ch(colours[i]);
      const j = assign[i];
      sr[j] += r;
      sg[j] += g;
      sb[j] += b;
      cnt[j]++;
    }
    for (let j = 0; j < m; j++) {
      if (!cnt[j]) continue; // empty cluster keeps its centroid
      cent[j] = (Math.round(sr[j] / cnt[j]) << 16) | (Math.round(sg[j] / cnt[j]) << 8) | Math.round(sb[j] / cnt[j]);
    }
    if (!changed) {
      converged = true;
      break;
    }
  }

  const counts = new Uint32Array(m);
  for (let i = 0; i < n; i++) counts[assign[i]]++;
  const idx = Array.from({ length: m }, (_, j) => j)
    .filter((j) => counts[j] > 0)
    .sort((a, b) => counts[b] - counts[a] || luma(cent[a]) - luma(cent[b]) || a - b);
  const remap = new Uint8Array(m);
  idx.forEach((j, r) => (remap[j] = r));
  for (let i = 0; i < n; i++) assign[i] = remap[assign[i]];
  return {
    clusters: idx.map((j) => ({ rgb: cent[j], count: counts[j], share: counts[j] / n })),
    assign,
    iterations,
    converged,
  };
}

/** Opaque pixels of an RGBA buffer as RGB888 colours (optionally coat-like pixels only, with a fallback to all). */
export function pixelColours(pixels: Uint8ClampedArray, w: number, h: number, coatOnly = true, skip?: (x: number, y: number) => boolean): number[] {
  const take = (coat: boolean): number[] => {
    const out: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (skip?.(x, y)) continue;
        const i = (y * w + x) * 4;
        if (pixels[i + 3] < 128) continue;
        if (coat && !isCoatPixel(pixels[i], pixels[i + 1], pixels[i + 2])) continue;
        out.push((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
      }
    return out;
  };
  const a = coatOnly ? take(true) : [];
  return a.length >= 16 ? a : take(false);
}

// ------------------------------------------------------------------------------------------ sampling region

/** Side of the square analysis sample (pixels). */
export const SAMPLE_SIZE = 48;

/**
 * The analysis region for a face crop: the head (crop widened by 30 % each side) and the body below it (down to
 * 1.2 crop heights under the crop), clamped to the photo. Pure.
 */
export function coatRegion(crop: Crop, imgW: number, imgH: number): Crop {
  const x0 = Math.max(0, Math.round(crop.x - crop.w * 0.3));
  const x1 = Math.min(imgW, Math.round(crop.x + crop.w * 1.3));
  const y0 = Math.max(0, Math.round(crop.y - crop.h * 0.1));
  const y1 = Math.min(imgH, Math.round(crop.y + crop.h * 2.2));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Where the face (eyes, nose) sits in the SAMPLE_SIZE grid of `coatRegion`, so the palette can skip it. */
export function faceSkip(crop: Crop, region: Crop, size = SAMPLE_SIZE): (x: number, y: number) => boolean {
  const kx = region.w / size;
  const ky = region.h / size;
  return (x, y) => {
    const px = region.x + (x + 0.5) * kx - crop.x;
    const py = region.y + (y + 0.5) * ky - crop.y;
    if (px < 0 || py < 0 || px >= crop.w || py >= crop.h) return false;
    return ovalDistance((px / crop.w) * 64 - 0.5, (py / crop.h) * 64 - 0.5, 64) < 0.55;
  };
}

/** Browser only: RGBA SAMPLE_SIZE² sample of the coat region of a photo. Null when the canvas is unreadable. */
export function sampleCoat(src: CanvasImageSource & { width: number; height: number }, crop: Crop): { pixels: Uint8ClampedArray; region: Crop } | null {
  try {
    const region = coatRegion(crop, src.width, src.height);
    const c = document.createElement('canvas');
    c.width = SAMPLE_SIZE;
    c.height = SAMPLE_SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return { pixels: ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, region };
  } catch {
    return null;
  }
}

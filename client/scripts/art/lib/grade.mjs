/**
 * The night grade (plan G7): a deterministic per-pixel OKLab transform followed by a palette snap.
 * The alpha channel is never touched, so every tile keeps its exact silhouette.
 */
import { makeSnapper, oklabToRgb, rgbToOklab } from "./color.mjs";

/** One graded colour, before snapping. */
export function gradeColour([r, g, b], { l = 1, lift = 0, chroma = 1, tint }) {
  const [L, A, B] = rgbToOklab([r, g, b]);
  let nl = Math.max(0, Math.min(1, L * l + lift));
  let na = A * chroma;
  let nb = B * chroma;
  if (tint && tint.amount > 0) {
    const rad = (tint.hue * Math.PI) / 180;
    const ta = Math.cos(rad) * tint.chroma;
    const tb = Math.sin(rad) * tint.chroma;
    na = na * (1 - tint.amount) + ta * tint.amount;
    nb = nb * (1 - tint.amount) + tb * tint.amount;
  }
  return oklabToRgb([nl, na, nb]);
}

/**
 * Grades and snaps an RGBA image in place. `gradeFor(index)` may return a different grade per
 * pixel (hazard tiles); `alphaThreshold` binarises alpha for pixel art (0 keeps alpha as is).
 */
export function gradeImage(img, paletteHexes, gradeFor, { alphaThreshold = 0 } = {}) {
  const snap = makeSnapper(paletteHexes);
  const memo = new Map();
  const d = img.data;
  for (let p = 0, i = 0; i < d.length; p++, i += 4) {
    if (alphaThreshold) d[i + 3] = d[i + 3] >= alphaThreshold ? 255 : 0;
    if (d[i + 3] === 0) {
      d[i] = d[i + 1] = d[i + 2] = 0;
      continue;
    }
    const grade = gradeFor(p);
    let cache = memo.get(grade);
    if (!cache) memo.set(grade, (cache = new Map()));
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let out = cache.get(key);
    if (!out) {
      const graded = gradeColour([d[i], d[i + 1], d[i + 2]], grade);
      out = snap(graded[0], graded[1], graded[2]);
      cache.set(key, out);
    }
    d[i] = out[0];
    d[i + 1] = out[1];
    d[i + 2] = out[2];
  }
  return img;
}

/**
 * Parallax plates from the landing hero (plan G7 bullet 4; decision #46: derived programmatically
 * now, artist cleanup later). The G6 dusk pipeline: downscale to the hero's art grid, grade,
 * quantise to the look palette (hard), and an edge-SSIM gate against the ungraded source.
 *
 * - far: `hero-bg` sky. Below the mountain ridge each column repeats its last sky pixel, so the
 *   far plate never shows a second copy of the mountains when the mid plate scrolls past it.
 * - mid: `hero-bg` mountains, below the ridge found per column (the first run of low-saturation,
 *   cool pixels under the horizon glow).
 * - near: `hero-ground` ruins and foliage (it ships with alpha); the central altar and steps, which
 *   read as a floor and would compete with real platforms, are replaced by the flanks' foliage
 *   under a ragged bush line (no rectangular hole, no straight alpha edge).
 * - fog: generated, a low band of the set's own ramp with a seeded wobble and stepped alpha.
 *
 * Every layer is mirror-wrapped on X so the runtime can tile it seamlessly.
 */
import { contrastRatio, hexToRgb, luminance, makeSnapper, oklabToOklch, oklabToRgb, oklchToOklab, rgbToOklab } from "./color.mjs";
import { blank, clone, compositeOver, edgeSsim, mirrorWrapX, readRgba, sharp } from "./raster.mjs";

async function readScaled(file, width, height) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** The hero's front range: dark (OKLab L < 0.42) and blue-violet (hue 235-295). */
function isFrontRange(r, g, b) {
  const [L, , h] = oklabToOklch(rgbToOklab([r, g, b]));
  return L < 0.42 && h > 235 && h < 295;
}

/** Per column, the first row (from 50% down) where the hero's dark front range starts. */
export function findRidge(img) {
  const ridge = new Int32Array(img.width);
  const start = Math.floor(img.height * 0.5);
  for (let x = 0; x < img.width; x++) {
    let y = start;
    for (; y < img.height - 3; y++) {
      let hits = 0;
      for (let k = 0; k < 3; k++) {
        const i = ((y + k) * img.width + x) * 4;
        if (isFrontRange(img.data[i], img.data[i + 1], img.data[i + 2])) hits++;
      }
      if (hits === 3) break;
    }
    ridge[x] = y;
  }
  // Smooth single-column spikes (stars and webp noise) with a 7-wide median.
  const out = new Int32Array(img.width);
  for (let x = 0; x < img.width; x++) {
    const w = [];
    for (let k = -3; k <= 3; k++) w.push(ridge[Math.min(img.width - 1, Math.max(0, x + k))]);
    w.sort((a, b) => a - b);
    out[x] = w[3];
  }
  return out;
}

/** The signed hue step from `from` to `to` whose path avoids the yellow-green band (95-150). */
export function hueStep(from, to) {
  const short = ((to - from + 540) % 360) - 180;
  const long = short > 0 ? short - 360 : short + 360;
  const crosses = (d) => {
    for (let k = 1; k < 16; k++) {
      const h = (from + (d * k) / 16 + 360) % 360;
      if (h > 95 && h < 150) return true;
    }
    return false;
  };
  if (!crosses(short)) return short;
  if (!crosses(long)) return long;
  return 0;
}

/** The plate grade: tame the warm horizon by `warm`, scale lightness, pull toward the set hue. */
export function plateGrade(set, band) {
  const lScale = band === "sky" ? set.sky.l : set.ground.l;
  const warmKeep = band === "sky" ? set.sky.warm : Math.min(1, set.sky.warm + 0.2);
  return ([r, g, b]) => {
    let [L, C, h] = oklabToOklch(rgbToOklab([r, g, b]));
    if (h > 5 && h < 110) {
      // The warm horizon turns toward the set hue, never through yellow-green (a sunset pulled
      // toward violet through green reads as a sickly blob).
      C *= 0.6 + 0.4 * warmKeep;
      h = (h + hueStep(h, set.hue) * (1 - warmKeep) * 0.7 + 360) % 360;
    }
    L = Math.max(0, Math.min(1, L * lScale));
    let [, a, bb] = oklchToOklab([L, C, h]);
    const rad = (set.hue * Math.PI) / 180;
    a = a * (1 - set.tint) + Math.cos(rad) * 0.06 * set.tint;
    bb = bb * (1 - set.tint) + Math.sin(rad) * 0.06 * set.tint;
    return oklabToRgb([L, a, bb]);
  };
}

function applyGrade(img, grade, snap) {
  const memo = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      continue;
    }
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    let out = memo.get(key);
    if (!out) {
      const g = grade([img.data[i], img.data[i + 1], img.data[i + 2]]);
      out = snap(g[0], g[1], g[2]);
      memo.set(key, out);
    }
    img.data[i] = out[0];
    img.data[i + 1] = out[1];
    img.data[i + 2] = out[2];
  }
  return img;
}

function binariseAlpha(img, threshold = 128) {
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= threshold ? 255 : 0;
  return img;
}

/** The ungraded geometry of every layer at native resolution (shared by all sets). */
export async function plateGeometry(clientDir, native) {
  const { width, height } = native;
  const bg = await readScaled(`${clientDir}/public/landing/hero-bg.webp`, width, height);
  const ground = binariseAlpha(await readScaled(`${clientDir}/public/landing/hero-ground.webp`, width, height));
  const ridge = findRidge(bg);

  // Below the ridge the far plate holds one flat colour (the mean of the pixels just above the
  // ridge), so a parallax offset never shows a second copy of the front range or vertical smears.
  let acc = [0, 0, 0];
  for (let x = 0; x < width; x++) {
    const i = (Math.max(0, ridge[x] - 2) * width + x) * 4;
    acc = [acc[0] + bg.data[i], acc[1] + bg.data[i + 1], acc[2] + bg.data[i + 2]];
  }
  const fill = acc.map((v) => Math.round(v / width));
  const far = clone(bg);
  const mid = blank(width, height);
  for (let x = 0; x < width; x++) {
    for (let y = ridge[x]; y < height; y++) {
      const i = (y * width + x) * 4;
      mid.data.set(bg.data.subarray(i, i + 4), i);
      far.data.set([fill[0], fill[1], fill[2], 255], i);
    }
  }

  // The altar and steps (the central block under 60% height) read as a floor, so they go; the
  // gap is refilled with the hero's own foliage under a ragged, seeded bush line. Cutting them out
  // left a rectangular hole with vertical alpha walls that the runtime crop check
  // (look/plateCheck.ts) rejects (task 6d review, finding 1). The refill is a run of translated
  // (never mirrored) flank windows joined by dithered crossfades, so it shows no hard colour seam
  // and no kaleidoscope axis (task 6d re-review, finding 1).
  const near = clone(ground);
  const x0 = Math.floor(width * 0.22);
  const x1 = Math.ceil(width * 0.78);
  const y0 = Math.floor(height * 0.6);
  // The bush line rises a few rows above the cut row, so it overlaps the hills behind the stage:
  // a gap between them would leave the cut row as a straight horizontal alpha edge.
  const top = bushLine(x1 - x0, y0 - 6, Math.floor(height * 0.03), 0x6d0e);
  // Taper the bush line up to the cut row next to each flank, so the refill meets the flanks'
  // foliage without a vertical alpha wall.
  const taper = Math.floor((x1 - x0) * 0.12);
  for (let d = 0; d < taper; d++) {
    const t = (d / taper) ** 2 * (3 - 2 * (d / taper));
    for (const k of [d, x1 - x0 - 1 - d]) top[k] = Math.round(y0 + (top[k] - y0) * t);
  }
  const plan = refillPlan({ x0, x1, width, seed: 0x5ea3 });
  for (let x = x0 - REFILL_FADE; x < x1 + REFILL_FADE; x++) {
    const inside = x >= x0 && x < x1;
    const rowTop = inside ? Math.min(y0, top[x - x0]) : y0;
    for (let y = rowTop; y < height; y++) {
      const i = (y * width + x) * 4;
      if (inside && y < top[x - x0]) {
        near.data[i + 3] = 0;
        continue;
      }
      const sx = plan.source(x, y);
      // Outside the gap the original flank shows through (sx === x); a clear flank pixel stays clear.
      if (sx === x && !inside) continue;
      if (!inside && ground.data[i + 3] === 0) continue;
      near.data.set(ground.data.subarray((y * width + sx) * 4, (y * width + sx) * 4 + 4), i);
      near.data[i + 3] = 255;
    }
  }
  return { far, mid, near, ridge, refill: { x0: x0 - REFILL_FADE, x1: x1 + REFILL_FADE } };
}

/**
 * A ragged bush line for `n` columns around row `base`: two seeded swells of up to `amp` rows plus
 * per-column jitter of 1-3 rows in runs of 1-3 columns, so no stretch of columns ends on one row.
 */
export function bushLine(n, base, amp, seed) {
  const rand = seeded(seed);
  const swells = Array.from({ length: 2 }, () => ({ f: 2 + Math.floor(rand() * 4), p: rand() * Math.PI * 2 }));
  const out = new Int32Array(n);
  let jitter = 0;
  let left = 0;
  let previous = -1;
  for (let x = 0; x < n; x++) {
    if (left-- <= 0) {
      jitter = 1 + Math.floor(rand() * 3) * (rand() < 0.5 ? -1 : 1);
      left = Math.floor(rand() * 3);
    }
    let y = base;
    for (const s of swells) y += Math.sin((x / n) * Math.PI * s.f + s.p) * amp * 0.5;
    let row = Math.round(y + jitter);
    // Never repeat the previous column's row for long: a flat run is what the crop gate flags.
    if (row === previous && x % 4 === 3) row += 1;
    out[x] = row;
    previous = row;
  }
  return out;
}

/** Width in art px of each dithered crossfade between refill windows (and into the flanks). */
export const REFILL_FADE = 40;

/** The 8 x 8 Bayer matrix, as thresholds in (0, 1). */
const BAYER8 = (() => {
  const m = [[0]];
  let out = m;
  for (let n = 1; n < 8; n *= 2) {
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = out[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    out = next;
  }
  return out.map((row) => row.map((v) => (v + 0.5) / 64));
})();

/**
 * How the altar gap [x0, x1) is refilled: a few windows of flank columns, each copied as-is
 * (translated, never mirrored, so no symmetry axis), alternating between the right and the left
 * flank, at seeded offsets and seeded joint positions. Neighbouring windows, and the first and last
 * window with the flank beside the gap, meet in a `REFILL_FADE`-wide ordered-dither crossfade, so a
 * brightness or colour difference between two windows is spread over the fade instead of a seam.
 * `source(x, y)` returns the source column for plate pixel (x, y); `x` itself outside the fades
 * on either side of the gap (the flank shows through).
 */
export function refillPlan({ x0, x1, width, seed, windows = 6 }) {
  const rand = seeded(seed);
  const n = x1 - x0;
  const half = REFILL_FADE / 2;
  const flanks = [
    { start: x1, width: width - x1 },
    { start: 0, width: x0 },
  ];
  // Joints (relative to x0). The outer two sit half a fade outside the gap, so the fade into each
  // flank never picks the altar; the inner ones are jittered by up to 1/6 of a window.
  const joints = [-half];
  for (let k = 1; k < windows; k++) joints.push(Math.round((k * n) / windows + (rand() - 0.5) * (n / windows / 3)));
  joints.push(n + half);
  const segments = [];
  for (let k = 0; k < windows; k++) {
    const from = joints[k] - half;
    const span = joints[k + 1] + half - from;
    const flank = flanks[k % 2];
    if (span > flank.width) throw new Error(`refill window ${k} is ${span} columns, wider than its flank (${flank.width})`);
    const offset = flank.start + Math.floor(rand() * (flank.width - span + 1));
    segments.push({ from, offset });
  }
  // Per-joint pattern offsets, so the dither bands do not line up row for row.
  const shifts = joints.map(() => [Math.floor(rand() * 8), Math.floor(rand() * 8)]);
  const column = (k, d) => (k < 0 || k >= windows ? x0 + d : segments[k].offset + (d - segments[k].from));
  return {
    joints,
    segments,
    source(x, y) {
      const d = x - x0;
      for (let j = 0; j < joints.length; j++) {
        const lo = joints[j] - half;
        if (d < lo || d >= joints[j] + half) continue;
        const t = (d - lo + 0.5) / REFILL_FADE;
        const [sx, sy] = shifts[j];
        const next = t > BAYER8[(y + sy) % 8][(d + sx) % 8];
        return column(next ? j : j - 1, d);
      }
      if (d < joints[0] || d >= joints[windows]) return x;
      let k = 0;
      while (k + 1 < windows && d >= joints[k + 1]) k++;
      return column(k, d);
    },
  };
}

function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fog band: stepped alpha (pixel-art friendly), a seeded wobble, one colour from the set ramp. */
export function fogLayer(width, height, hex, seed) {
  const img = blank(width, height);
  const [r, g, b] = hexToRgb(hex);
  const rand = seeded(seed);
  const waves = Array.from({ length: 3 }, () => ({ f: 1 + Math.floor(rand() * 4), p: rand() * Math.PI * 2, a: 4 + rand() * 6 }));
  const steps = [0, 40, 72, 104];
  // Per-column jitter on the top edge: the smooth waves alone left flat stretches of 28-90
  // columns at their crests and troughs (task 6d review, finding 1).
  const fogJitter = Array.from(bushLine(width, 0, 0, seed ^ 0xf06), (v) => v * 1.5);
  for (let x = 0; x < width; x++) {
    // Integer frequencies over the width keep the left and right edges continuous.
    let top = height * 0.7 + fogJitter[x];
    for (const w of waves) top += Math.sin((x / width) * Math.PI * 2 * w.f + w.p) * w.a;
    for (let y = 0; y < height; y++) {
      const depth = (y - top) / (height - top);
      if (depth <= 0) continue;
      const level = Math.min(steps.length - 1, 1 + Math.floor(depth * (steps.length - 1)));
      const i = (y * width + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = steps[level];
    }
  }
  return img;
}

/** One plate set, graded and snapped, plus its gate measurements. */
export async function buildPlateSet(geometry, set, paletteHexes, setRamp, seed) {
  const snap = makeSnapper(paletteHexes);
  const identity = (r, g, b) => [r, g, b];
  const grades = {
    far: plateGrade(set, "sky"),
    mid: plateGrade(set, "ground"),
    near: plateGrade({ ...set, ground: { l: set.ground.l * 0.8 } }, "ground"),
  };
  const layers = {};
  const ssim = {};
  for (const name of ["far", "mid", "near"]) {
    // The gate compares the quantised plate with the same grade unquantised: quantising must keep
    // the edge structure (the grade itself darkens on purpose and is reviewed on the previews).
    const reference = applyGrade(clone(geometry[name]), grades[name], identity);
    layers[name] = applyGrade(clone(geometry[name]), grades[name], snap);
    ssim[name] = edgeSsim(reference, layers[name]);
  }
  layers.fog = fogLayer(geometry.far.width, geometry.far.height, setRamp[3], seed);
  const { far, mid, near, fog } = layers;
  const composite = clone(far);
  compositeOver(composite, mid);
  compositeOver(composite, near);
  compositeOver(composite, fog);
  return { layers, ssim, composite, wrapped: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, mirrorWrapX(v)])) };
}

/**
 * The plate band behind gameplay: rows 40-100% of the composite. The contrast gate uses its p90,
 * the band's bright end (a sunset glow, a lit horizon), not the mean (task 6d review, finding 6).
 */
export function bandLuminance(composite) {
  const ls = [];
  const y0 = Math.floor(composite.height * 0.4);
  for (let y = y0; y < composite.height; y++) {
    for (let x = 0; x < composite.width; x++) {
      const i = (y * composite.width + x) * 4;
      ls.push(luminance([composite.data[i], composite.data[i + 1], composite.data[i + 2]]));
    }
  }
  ls.sort((a, b) => a - b);
  const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
  return { mean, p90: ls[Math.floor(ls.length * 0.9)], p50: ls[Math.floor(ls.length * 0.5)] };
}

export { contrastRatio, readRgba };

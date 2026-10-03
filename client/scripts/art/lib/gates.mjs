/**
 * The art gates (plan G7): palette membership, unchanged indices, the 3:1 collidable contrast gate
 * read from the Tiled layers, the hazard silhouette rule. Pure functions over decoded images.
 */
import { contrastRatio, luminance, paletteSet, rgbToOklab } from "./color.mjs";
import { gidUsage } from "./tiled.mjs";

/** Layers whose tiles the player stands on or bounces off. */
export const COLLIDABLE_LAYERS = ["blocks", "platforms", "jumper"];

/** Colours of `img` outside the palette (packed RGB -> pixel count), opaque pixels only. */
export function offPalette(img, paletteHexes) {
  const allowed = paletteSet(paletteHexes);
  const off = new Map();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    if (!allowed.has(key)) off.set(key, (off.get(key) ?? 0) + 1);
  }
  return off;
}

/** Mean relative luminance of a cell's opaque pixels, or null for an empty cell. */
export function cellLuminance(cell) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < cell.data.length; i += 4) {
    if (cell.data[i + 3] < 128) continue;
    sum += luminance([cell.data[i], cell.data[i + 1], cell.data[i + 2]]);
    n++;
  }
  return n ? sum / n : null;
}

/**
 * Collidable and hazard gids of the sheet tileset (firstgid 1, `tileCount` tiles) across maps.
 * Returns `{ collidable: Set<gid>, hazards: Set<gid> }`.
 */
export function gameplayGids(maps, tileCount, hazardGids) {
  const collidable = new Set();
  const hazards = new Set();
  const hazardSet = new Set(hazardGids);
  for (const map of maps) {
    const firstgid = (map.tilesets ?? []).find((t) => t.firstgid === 1) ? 1 : null;
    if (firstgid === null) continue;
    const usage = gidUsage(map);
    for (const layer of COLLIDABLE_LAYERS) {
      for (const gid of usage[layer]?.keys() ?? []) {
        if (gid < 1 || gid > tileCount) continue;
        if (hazardSet.has(gid)) hazards.add(gid);
        else collidable.add(gid);
      }
    }
  }
  return { collidable, hazards };
}

/** The sides of a tile that face open air in more than `share` of its placements (top, left, right). */
export function openSides(entry, share = 0.5) {
  if (!entry || !entry.n) return [];
  return ["top", "left", "right"].filter((side) => entry[side] / entry.n > share);
}

/**
 * The lit-edge pixels of a 32 x 32 cell (indices into the cell): per column the first opaque pixel
 * from the top when `top` is open, per row the first from the left or right when that side is open.
 */
export function rimPixels(cell, sides) {
  const { width, height, data } = cell;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= 128;
  const out = new Set();
  if (sides.includes("top")) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) if (opaque(x, y)) { out.add(y * width + x); break; }
  if (sides.includes("left")) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (opaque(x, y)) { out.add(y * width + x); break; }
  if (sides.includes("right")) for (let y = 0; y < height; y++) for (let x = width - 1; x >= 0; x--) if (opaque(x, y)) { out.add(y * width + x); break; }
  return [...out];
}

/** Mean relative luminance of the given pixels of a cell, or null when there are none. */
export function pixelsLuminance(cell, pixels) {
  if (!pixels.length) return null;
  let sum = 0;
  for (const p of pixels) sum += luminance([cell.data[p * 4], cell.data[p * 4 + 1], cell.data[p * 4 + 2]]);
  return sum / pixels.length;
}

/**
 * The contrast gate against the plate band's bright end (`bandLum`: p90 of the band, so tiles over a
 * sunset glow are measured against the glow). A collidable tile is measured on its lit edge (the
 * sides that face open air in the maps, `sidesOf(gid)`); a tile that is never at an open edge sits
 * inside terrain and is counted as `interior`, not measured. A hazard is measured on its whole cell
 * (its silhouette is the signal). `cellAt(gid)` returns the night cell.
 */
export function contrastGate({ gids, cellAt, bandLum, min = 3, sidesOf = () => ["top", "left", "right"] }) {
  const failures = [];
  let worst = Infinity;
  let interior = 0;
  const check = (gid, kind) => {
    const cell = cellAt(gid);
    if (!cell) return;
    let lum;
    if (kind === "hazard") lum = cellLuminance(cell);
    else {
      const sides = sidesOf(gid);
      if (!sides.length) {
        interior++;
        return;
      }
      lum = pixelsLuminance(cell, rimPixels(cell, sides));
    }
    if (lum === null) return;
    const ratio = contrastRatio(lum, bandLum);
    worst = Math.min(worst, ratio);
    if (ratio < min) failures.push({ gid, kind, ratio: Number(ratio.toFixed(2)) });
  };
  for (const gid of gids.collidable) check(gid, "collidable");
  for (const gid of gids.hazards) check(gid, "hazard");
  return { failures, interior, worst: Number.isFinite(worst) ? Number(worst.toFixed(2)) : null };
}

/** Alpha above this counts as opaque (the runtime's `ALPHA_OPAQUE` in look/plateCheck.ts). */
export const ALPHA_OPAQUE = 8;

/**
 * The runtime crop check (client/components/Phaser/look/plateCheck.ts, `straightCropRun`), ported:
 * the longest run of neighbouring columns whose lowest opaque row is the same row above the plate's
 * last two rows. With `from: "top"` the same for the highest opaque row below the first two rows
 * (a flat top edge reads as a cut just as much). Keep in step with plateCheck.ts.
 */
export function straightEdgeRun(img, { from = "bottom" } = {}) {
  const { width, height, data } = img;
  let best = 0;
  let run = 0;
  let previous = -2;
  for (let x = 0; x < width; x++) {
    let edge = -1;
    if (from === "bottom") {
      for (let y = height - 1; y >= 0; y--) if (data[(y * width + x) * 4 + 3] > ALPHA_OPAQUE) { edge = y; break; }
    } else {
      for (let y = 0; y < height; y++) if (data[(y * width + x) * 4 + 3] > ALPHA_OPAQUE) { edge = y; break; }
    }
    const inside = from === "bottom" ? edge >= 0 && edge < height - 2 : edge > 1;
    if (inside && edge === previous) run++;
    else run = inside ? 1 : 0;
    previous = inside ? edge : -2;
    if (run > best) best = run;
  }
  return best;
}

/** The run length that counts as a crop: 16 art px, or 2% of a wide plate (plateCheck.ts `minCropRun`). */
export const minCropRun = (width) => Math.max(16, Math.round(width * 0.02));

/**
 * The longest vertical alpha wall: per column boundary (x, x + 1), the longest run of rows where one
 * side is opaque and the other clear. A cut-out block leaves a wall as tall as the cut.
 */
export function verticalWallRun(img) {
  const { width, height, data } = img;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > ALPHA_OPAQUE;
  let best = 0;
  for (let x = 0; x + 1 < width; x++) {
    let run = 0;
    for (let y = 0; y < height; y++) {
      if (opaque(x, y) !== opaque(x + 1, y)) {
        run++;
        if (run > best) best = run;
      } else run = 0;
    }
  }
  return best;
}

/**
 * The longest horizontal alpha edge: per row boundary (y, y + 1), the longest run of columns where
 * one row is opaque and the other clear. Catches a straight cut anywhere inside the plate, not only
 * at a column's lowest or highest opaque pixel.
 */
export function horizontalEdgeRun(img) {
  const { width, height, data } = img;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > ALPHA_OPAQUE;
  let best = 0;
  for (let y = 0; y + 1 < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      if (opaque(x, y) !== opaque(x, y + 1)) {
        run++;
        if (run > best) best = run;
      } else run = 0;
    }
  }
  return best;
}

/**
 * The strongest hard colour seam in columns [from, to): per column boundary and per window of
 * `rows` rows (stepped by `step`), the difference of the mean OKLab lightness of the `band` columns
 * on either side, over rows where all of them are opaque (a window needs 90% such rows). A hard
 * seam between two pasted windows is a step in that mean along a tall stretch; a dithered crossfade
 * spreads it over the fade. The alpha gates above miss it: a seam is fully opaque (task 6d
 * re-review, finding 1). Returns `{ value, x, y }` (`value` 0 when nothing qualifies).
 */
export function colourSeam(img, { from = 0, to = img.width, band = 4, rows = 48, step = 8 } = {}) {
  const { width, height, data } = img;
  const memo = new Map();
  const L = new Float32Array(width * height);
  const opaque = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] <= ALPHA_OPAQUE) continue;
    opaque[p] = 1;
    const key = (data[p * 4] << 16) | (data[p * 4 + 1] << 8) | data[p * 4 + 2];
    let l = memo.get(key);
    if (l === undefined) {
      l = rgbToOklab([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]])[0];
      memo.set(key, l);
    }
    L[p] = l;
  }
  let best = { value: 0, x: -1, y: -1 };
  for (let x = Math.max(band - 1, from); x + band < Math.min(width, to); x++) {
    for (let y0 = 0; y0 + rows <= height; y0 += step) {
      let left = 0;
      let right = 0;
      let n = 0;
      for (let y = y0; y < y0 + rows; y++) {
        const row = y * width;
        let ok = true;
        for (let k = 0; k < band && ok; k++) ok = opaque[row + x - k] === 1 && opaque[row + x + 1 + k] === 1;
        if (!ok) continue;
        for (let k = 0; k < band; k++) {
          left += L[row + x - k];
          right += L[row + x + 1 + k];
        }
        n++;
      }
      if (n < rows * 0.9) continue;
      const value = Math.abs(left - right) / (n * band);
      if (value > best.value) best = { value, x, y: y0 };
    }
  }
  return best;
}

#!/usr/bin/env node
/**
 * Catnip art exporter (plan G8, decision #56: the botanical sprig).
 *
 * The only source of the catnip art is the hand-authored pixel masters in `client/art/catnip/`
 * (`catnip-16.txt`, `catnip-24.txt`, `catnip-32.txt`, `catnip-64.txt`, one palette character per
 * pixel, colours in `palette.json`). Every raster below is derived from one master by an INTEGER
 * nearest-neighbour upscale and nothing else: no resampling filter, no fractional scale, so no
 * pixel row is ever dropped or blended.
 *
 *   node scripts/art/catnip-export.mjs           # write every output
 *   node scripts/art/catnip-export.mjs --check   # exit 1 if any output differs from its master
 *   node scripts/art/catnip-export.mjs --sheet <png>  # also write a 16/24/32 contact sheet
 *
 * Outputs:
 * - `client/public/catnip/catnip-v2-{16,24,32,48,64,72,96,128,144,192,288}.png`: the versioned names code uses (the
 *   F12 asset rule: new art gets versioned names, cached forever by the CDN's second pass).
 * - Legacy names, overwritten in place for installed native builds and old caches (the F12 rule
 *   allows it only because `client/__test__/catnip-art.test.ts` pins their hashes):
 *   `client/public/logo/catnip.webp` (320 px, lossless) and
 *   `client/public/catnip-chaos/items/catnip-coin.png` (32 px).
 * - Catnip Heist copies: `catnip-heist/public/assets/images/catnip.webp` (96 px, the UI icon) and
 *   `catnip-heist/public/assets/images/catnip-16.png` (the 16 px voxel source).
 *
 * Uploading to the CDN is a deferred manual step (cdn-sync), never done here.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLIENT = resolve(HERE, "..", "..");
export const REPO = resolve(CLIENT, "..");
export const ART_DIR = join(CLIENT, "art", "catnip");
export const MASTER_SIZES = [16, 24, 32, 64];

/**
 * Every output: where it goes, which master it comes from, the integer factor and the format.
 * Paths are repo-relative so the test and the docs can print them.
 */
export const OUTPUTS = [
  { path: "client/public/catnip/catnip-v2-16.png", master: 16, scale: 1, format: "png" },
  { path: "client/public/catnip/catnip-v2-24.png", master: 24, scale: 1, format: "png" },
  { path: "client/public/catnip/catnip-v2-32.png", master: 32, scale: 1, format: "png" },
  { path: "client/public/catnip/catnip-v2-48.png", master: 24, scale: 2, format: "png" },
  { path: "client/public/catnip/catnip-v2-64.png", master: 64, scale: 1, format: "png" },
  { path: "client/public/catnip/catnip-v2-96.png", master: 32, scale: 3, format: "png" },
  // The 2x and 3x files of CatnipIcon's srcSet (components/shared/CatnipIcon.tsx): each density
  // gets a file drawn at exactly size x density pixels.
  { path: "client/public/catnip/catnip-v2-72.png", master: 24, scale: 3, format: "png" },
  { path: "client/public/catnip/catnip-v2-128.png", master: 64, scale: 2, format: "png" },
  { path: "client/public/catnip/catnip-v2-144.png", master: 24, scale: 6, format: "png" },
  { path: "client/public/catnip/catnip-v2-192.png", master: 64, scale: 3, format: "png" },
  { path: "client/public/catnip/catnip-v2-288.png", master: 32, scale: 9, format: "png" },
  { path: "client/public/logo/catnip.webp", master: 64, scale: 5, format: "webp", legacy: true },
  { path: "client/public/catnip-chaos/items/catnip-coin.png", master: 32, scale: 1, format: "png", legacy: true },
  { path: "catnip-heist/public/assets/images/catnip.webp", master: 32, scale: 3, format: "webp", legacy: true },
  { path: "catnip-heist/public/assets/images/catnip-16.png", master: 16, scale: 1, format: "png" },
];

/** Paths of the pre-sprig (cannabis-leaf) rasters, kept only as overwritten, hash-pinned names. */
export const LEGACY_PATHS = OUTPUTS.filter((o) => o.legacy).map((o) => o.path);

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`palette: bad colour ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function readPalette(dir = ART_DIR) {
  const raw = JSON.parse(readFileSync(join(dir, "palette.json"), "utf8"));
  const colors = {};
  for (const [ch, hex] of Object.entries(raw.colors)) {
    if (ch.length !== 1 || ch === ".") throw new Error(`palette: key "${ch}" must be one character other than "."`);
    colors[ch] = hexToRgb(hex);
  }
  return colors;
}

/** Parses one master into `{ size, rows }`, validating shape and characters. */
export function readMaster(size, dir = ART_DIR, palette = readPalette(dir)) {
  const file = join(dir, `catnip-${size}.txt`);
  const rows = readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter((r) => r.length > 0);
  if (rows.length !== size) throw new Error(`${relative(REPO, file)}: ${rows.length} rows, expected ${size}`);
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`${relative(REPO, file)}:${y + 1}: ${row.length} columns, expected ${size}`);
    for (const ch of row) {
      if (ch !== "." && !palette[ch]) throw new Error(`${relative(REPO, file)}:${y + 1}: unknown pixel "${ch}"`);
    }
  });
  return { size, rows };
}

/** RGBA pixels of a master upscaled by an integer factor (nearest neighbour). */
export function rasterize(master, scale, palette) {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`scale must be a positive integer, got ${scale}`);
  const w = master.size * scale;
  const buf = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) {
    const row = master.rows[Math.floor(y / scale)];
    for (let x = 0; x < w; x++) {
      const ch = row[Math.floor(x / scale)];
      if (ch === ".") continue;
      const [r, g, b] = palette[ch];
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return { data: buf, width: w, height: w };
}

/**
 * The encoded bytes of one output. Deterministic for a given sharp/libvips version: after a sharp
 * upgrade a re-export may change the bytes (never the pixels), so update the test pins with it.
 */
export async function encode(output, masters, palette) {
  const { data, width, height } = rasterize(masters[output.master], output.scale, palette);
  const img = sharp(data, { raw: { width, height, channels: 4 } });
  if (output.format === "webp") {
    return img.webp({ lossless: true, effort: 6 }).toBuffer();
  }
  return img.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
}

export function loadMasters(dir = ART_DIR) {
  const palette = readPalette(dir);
  const masters = {};
  for (const size of MASTER_SIZES) masters[size] = readMaster(size, dir, palette);
  return { palette, masters };
}

/** A 16/24/32 side-by-side sheet (each master at 8x, 4x... to the same 256 px cell) on night and cream. */
export async function contactSheet(masters, palette, outFile) {
  const cell = 192;
  const sizes = [16, 24, 32];
  const backgrounds = ["#0b0820", "#fcecbb"];
  const tiles = [];
  for (const row of backgrounds.keys()) {
    for (const [col, size] of sizes.entries()) {
      const scale = Math.floor(cell / size);
      const { data, width, height } = rasterize(masters[size], scale, palette);
      tiles.push({
        input: await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(),
        left: 16 + col * (cell + 16) + Math.floor((cell - width) / 2),
        top: 16 + row * (cell + 16) + Math.floor((cell - height) / 2),
      });
      // The actual size, 1:1, in the corner: what a player sees on a 1x screen.
      const one = rasterize(masters[size], 1, palette);
      tiles.push({
        input: await sharp(one.data, { raw: { width: one.width, height: one.height, channels: 4 } }).png().toBuffer(),
        left: 16 + col * (cell + 16) + 4,
        top: 16 + row * (cell + 16) + 4,
      });
    }
  }
  const width = 16 + sizes.length * (cell + 16);
  const height = 16 + backgrounds.length * (cell + 16);
  const base = sharp({ create: { width, height, channels: 4, background: "#ffffff" } });
  const bands = backgrounds.map((bg, row) => ({
    input: { create: { width, height: cell + 16, channels: 4, background: bg } },
    left: 0,
    top: 8 + row * (cell + 16),
  }));
  await base.composite([...bands, ...tiles]).png().toFile(outFile);
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const sheetAt = args.indexOf("--sheet");
  const { palette, masters } = loadMasters();
  const drift = [];
  for (const output of OUTPUTS) {
    const bytes = await encode(output, masters, palette);
    const file = join(REPO, output.path);
    if (check) {
      if (!existsSync(file) || !readFileSync(file).equals(bytes)) drift.push(output.path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    // The sha256 is the pin for client/__test__/catnip-art.test.ts (regenerate after a sharp upgrade).
    console.log(`wrote ${output.path} (${output.master}px x${output.scale}) sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
  }
  if (sheetAt >= 0 && args[sheetAt + 1]) {
    await contactSheet(masters, palette, resolve(args[sheetAt + 1]));
    console.log(`contact sheet: ${args[sheetAt + 1]}`);
  }
  if (check) {
    if (drift.length) {
      console.error(`catnip art out of date (run node scripts/art/catnip-export.mjs):\n  ${drift.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`catnip art up to date (${OUTPUTS.length} files)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

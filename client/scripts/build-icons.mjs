#!/usr/bin/env node
/**
 * Builds the one Token Tails icon set (plan G14 "Icons and meta", decisions #45, #93, #95).
 *
 *   node scripts/build-icons.mjs          write every icon, the favicon, the OG card and the
 *                                         Capacitor inputs
 *   node scripts/build-icons.mjs --check  exit 1 if any committed output is missing or stale (CI)
 *
 * `--check` compares decoded pixels, not bytes: libvips resamples and encodes slightly differently
 * per platform (macOS arm64 vs the Linux CI runner), so byte equality only holds on the machine
 * that wrote the files. See `sameImage` for what must match exactly and what is tolerated.
 *
 * Source: `resources/source/logo.png`, the 1200x1300 RGBA pixel-art bust (not square, so every
 * output pads it onto a square first). Outputs:
 *
 * - `public/icons/icon-{48..512}.png`: transparent `any` icons (manifest, `<link rel="icon">`).
 * - `public/icons/icon-maskable-{192,512}.png`: night #0b0820 plate, the bust inside the 80% safe
 *   circle, for Android adaptive launchers.
 * - `public/icons/apple-touch-icon.png`: 180x180 on night (iOS paints transparency black).
 * - `public/icons/icon-16.png`, `icon-32.png` and `public/favicon.ico` (16, 32, 48): the 16 and 32
 *   frames are hand-authored pixel matrices below, because a 1203 px bust scaled to 16 px is mush.
 *   An artist's frames replace the matrices later (deferred, plan G14 dependencies).
 * - `public/logo/og-v2-1200x630.jpg`: the landing share card at the 1200x630 Open Graph size.
 * - `resources/logo.png`: the square, transparent bust for `npm run app:assets` (Capacitor "easy
 *   mode": icons flattened on the night background, night splash, see package.json).
 * - `resources/store/app-store-1024.png`: the opaque 1024 App Store icon, no alpha channel.
 *
 * Native icons and splashes are generated locally with `npm run app:assets` and ship with the next
 * store submission (decision #95); this script never touches `android/` or `ios/`.
 *
 * `sharp` is an explicit devDependency, pinned to the version `@capacitor/assets` already installs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "resources", "source", "logo.png");
const OG_SOURCE = join(root, "public", "logo", "ogg.jpg");

/** Night-900 (design/tokens.ts THEME_COLOR); kept literal so this script has no TS loader. */
export const NIGHT = "#0b0820";
export const ANY_SIZES = [48, 72, 96, 128, 192, 256, 384, 512];
export const MASKABLE_SIZES = [192, 512];
export const OG_SIZE = { width: 1200, height: 630 };

/** Palette of the hand-authored favicon frames, sampled from the logo. `.` is transparent. */
export const PALETTE = {
  K: "#100010", // outline
  M: "#b83060", // magenta rim
  W: "#f8f8ec", // cream fur
  G: "#a8adb8", // grey shade
  P: "#ff5a8c", // pink ear and tongue
  Y: "#f8c000", // coin
  O: "#e88a10", // coin shade
};

/**
 * 16x16: the head, ears and a coin at the chin (the logo's bust reduced to what reads at 16 px).
 */
export const FRAME_16 = [
  "................",
  ".MM..........MM.",
  ".MWK........KWM.",
  ".MPWK......KWPM.",
  ".MPWWKKKKKKWWPM.",
  ".MWWWWWWWWWWWWM.",
  "KWWWWWWWWWWWWWWK",
  "KWWKKWWWWWWKKWWK",
  "KWWKKWWWWWWKKWWK",
  "KWMWWWWKKWWWWMWK",
  "KGWWWWKPPKWWWWGK",
  ".KGWWWWKKWWWWGK.",
  "..KGGWWWWWWGGK..",
  "...KKGYYYYGKK...",
  "....KYYOOYYK....",
  ".....KKKKKK.....",
];

/**
 * 32x32, authored as the left half and mirrored (the logo is symmetric): rimmed ears, eyes with a
 * highlight, blush, an "w" mouth with tongue, and the coin with its face.
 */
const HALF_32 = [
  "................",
  "..MMM...........",
  ".MKKKM..........",
  ".MKWWKM.........",
  ".MKGWWKM........",
  ".MKGPWWKM.......",
  ".MKGPPWWKMMMMMMM",
  ".MKGPPWWWKKKKKKK",
  ".MKGPPWWWWWWWWWW",
  ".MKGPWWWWWWWWWWW",
  ".MKGWWWWWWWWWWWW",
  "MKGWWWWWWWWWWWWW",
  "MKGWWWWKKKKWWWWW",
  "MKGWWWKKWWKKWWWW",
  "MKGWWWKKWKKKWWWW",
  "MKGWWWKKKKKKWWWW",
  "MKGWWWWKMMKWWWWW",
  "KKWWWWWWWWWWWWWW",
  "KWWWWWWWWWWWWKKK",
  "KGWWWWWWWWWWWWKK",
  "KGWWWWWWWKWWWWWK",
  "MKGWWWWWWWKWWWKP",
  "MKGGWWWWWWWKKKPP",
  ".MKGGGWWWWWWWWKK",
  "..MKKGGWWWKKKKKK",
  "...MKKGWWKYYYYYY",
  "....MKGWKYYYKYYY",
  "....MKGWKYYYKYYY",
  "....MKGWKOYYYYKY",
  "....MKGWKOYYYYYK",
  ".....MKGKKOOYYYY",
  ".....MKKKKKKKKKK",
];

const mirror = (row) => row + [...row].reverse().join("");
export const FRAME_32 = HALF_32.map(mirror);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Validates a matrix: square, `size` rows of `size` known palette keys. */
export function validateFrame(rows, size) {
  if (rows.length !== size) throw new Error(`frame ${size}: ${rows.length} rows`);
  rows.forEach((row, y) => {
    if (row.length !== size) throw new Error(`frame ${size}: row ${y} has ${row.length} columns`);
    for (const ch of row) {
      if (ch !== "." && !(ch in PALETTE)) throw new Error(`frame ${size}: unknown colour "${ch}" in row ${y}`);
    }
  });
  return rows;
}

/** A pixel matrix as raw RGBA. */
export function frameToRgba(rows) {
  const size = rows.length;
  const data = Buffer.alloc(size * size * 4);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const i = (y * size + x) * 4;
      if (ch === ".") return;
      const [r, g, b] = hexToRgb(PALETTE[ch]);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    });
  });
  return data;
}

async function frameToPng(rows) {
  const size = validateFrame(rows, rows.length).length;
  return sharp(frameToRgba(rows), { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Packs PNG images into one `.ico` (PNG-compressed entries, supported by every current browser).
 * `images` is `[{ size, png }]`; a size of 256 is written as 0, as the format requires.
 */
export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/**
 * The trimmed bust centred on a transparent square. The bust is cut off at the bottom, so it sits
 * on the square's bottom edge rather than floating; `scale` is its height as a share of the side.
 */
async function squareBust(side, { scale = 0.94, background = null, lift = 0 } = {}) {
  const trimmed = await sharp(SOURCE).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const height = Math.round(side * scale);
  const width = Math.round((trimmed.info.width / trimmed.info.height) * height);
  const resized = await sharp(trimmed.data)
    .resize(width, height, { kernel: side >= 256 ? "lanczos3" : "mitchell" })
    .toBuffer();
  // `lift` raises the bust off the bottom edge by that share of the side. Repeating the bottom row
  // instead is not an option: the coin's rim runs through it and would smear into a stripe.
  const liftPx = Math.round(side * lift);
  const bust = resized;
  const canvas = sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: bust, left: Math.round((side - width) / 2), top: side - height - liftPx }]);
  return canvas.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Maskable: the head and the gold coin (the parts a launcher must not crop) inside the central 80%
 * safe circle. The coin runs to the source's bottom edge, so a bust on the edge always loses it
 * (review 6b: at 0.74 the coin fell out); this one is shorter and lifted, its flat base under the
 * coin, which the launcher mask crops or leaves on the night plate.
 */
export const MASKABLE_BUST = Object.freeze({ scale: 0.64, lift: 0.12 });
const maskable = (side) => squareBust(side, { ...MASKABLE_BUST, background: NIGHT });

/** Every output as `{ path, build }`, so `--check` and the write share one list. */
export function outputs() {
  const out = [];
  const add = (path, build) => out.push({ path, build });
  for (const size of ANY_SIZES) add(`public/icons/icon-${size}.png`, () => squareBust(size));
  for (const size of MASKABLE_SIZES) add(`public/icons/icon-maskable-${size}.png`, () => maskable(size));
  add("public/icons/apple-touch-icon.png", async () =>
    sharp(await squareBust(180, { scale: 0.86, background: NIGHT })).removeAlpha().png().toBuffer()
  );
  add("public/icons/icon-16.png", () => frameToPng(FRAME_16));
  add("public/icons/icon-32.png", () => frameToPng(FRAME_32));
  add("public/favicon.ico", async () =>
    encodeIco([
      { size: 16, png: await frameToPng(FRAME_16) },
      { size: 32, png: await frameToPng(FRAME_32) },
      { size: 48, png: await squareBust(48) },
    ])
  );
  add("public/logo/og-v2-1200x630.jpg", () =>
    sharp(OG_SOURCE)
      .resize(OG_SIZE.width, OG_SIZE.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
  );
  // Capacitor easy mode input: square and transparent; app:assets flattens it on night.
  add("resources/logo.png", () => squareBust(1024, { scale: 0.86 }));
  // App Store: opaque, no alpha channel (Apple rejects icons with one).
  add("resources/store/app-store-1024.png", async () =>
    sharp(await squareBust(1024, { scale: 0.86, background: NIGHT }))
      .flatten({ background: NIGHT })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer()
  );
  return out;
}

/**
 * Cross-platform noise allowed by `--check`, on alpha-premultiplied 0-255 samples (the colour of a
 * fully transparent pixel is meaningless, so it is weighted out). Measured macOS arm64 vs Linux
 * with sharp 0.32.6: PNG max 6 / mean 0.16, the mozjpeg OG card max 16 / mean 0.42. A real change
 * (another source, scale, lift or background) moves the mean far past this bound.
 */
export const PIXEL_TOLERANCE = Object.freeze({ max: 32, mean: 1 });

async function decode(buf) {
  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { format: meta.format, channels: meta.channels, width: info.width, height: info.height, data };
}

/**
 * True when two encoded images are the same picture: equal format, size and channel count (so an
 * alpha channel cannot appear on the App Store icon), and premultiplied samples within `tolerance`.
 */
export async function samePicture(a, b, tolerance = PIXEL_TOLERANCE) {
  if (a.equals(b)) return true;
  const [x, y] = await Promise.all([decode(a), decode(b)]);
  if (x.format !== y.format || x.channels !== y.channels || x.width !== y.width || x.height !== y.height) {
    return false;
  }
  let max = 0;
  let sum = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const ax = x.data[i + 3];
    const ay = y.data[i + 3];
    for (let c = 0; c < 4; c++) {
      const d = c === 3 ? Math.abs(ax - ay) : Math.abs((x.data[i + c] * ax - y.data[i + c] * ay) / 255);
      sum += d;
      if (d > max) max = d;
    }
  }
  return max <= tolerance.max && sum / x.data.length <= tolerance.mean;
}

/** The `[{ size, png }]` entries of an `.ico` written by `encodeIco`. */
export function decodeIco(buf) {
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const entry = 6 + i * 16;
    const size = buf.readUInt8(entry) || 256;
    const offset = buf.readUInt32LE(entry + 12);
    return { size, png: buf.subarray(offset, offset + buf.readUInt32LE(entry + 8)) };
  });
}

/** `--check` comparison for one output; see `samePicture`. */
export async function sameImage(path, committed, generated) {
  if (committed.equals(generated)) return true;
  if (!path.endsWith(".ico")) return samePicture(committed, generated);
  const a = decodeIco(committed);
  const b = decodeIco(generated);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].size !== b[i].size || !(await samePicture(a[i].png, b[i].png))) return false;
  }
  return true;
}

async function main() {
  const check = process.argv.includes("--check");
  if (!existsSync(SOURCE)) {
    console.error(`build-icons: missing source ${relative(root, SOURCE)}`);
    process.exit(1);
  }
  validateFrame(FRAME_16, 16);
  validateFrame(FRAME_32, 32);
  const stale = [];
  for (const { path, build } of outputs()) {
    const file = join(root, path);
    const data = await build();
    if (check) {
      if (!existsSync(file) || !(await sameImage(path, readFileSync(file), data))) stale.push(path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
    console.log(`build-icons: wrote ${path} (${data.length} bytes)`);
  }
  if (check && stale.length) {
    console.error(`build-icons: stale or missing, run \`node scripts/build-icons.mjs\`:\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  if (check) console.log("build-icons: icons up to date");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

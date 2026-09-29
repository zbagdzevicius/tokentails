#!/usr/bin/env node
// Imports the 2D source art from ../cat-assets and ../client/public into public/assets
// and writes public/assets/manifest.json (see AssetManifest in src/types.ts).
//
// Source folders are read-only. Re-run with `npm run import-assets` whenever the art changes.
import { mkdir, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..');
const CAT_ASSETS = join(repo, 'cat-assets');
const CLIENT_PUBLIC = join(repo, 'client', 'public');
const OUT = join(root, 'public', 'assets');

const FRAME = 48;
const CAT_ROWS = ['SLEEP', 'DIGGING', 'GROOMING', 'HIT', 'IDLE', 'JUMPING', 'LOAF', 'RUNNING', 'SITTING', 'WALKING'];
const DOG_ROWS = ['CROUCHED', 'DAMAGE', 'DEAD', 'JUMPING', 'LYING', 'RUNNING', 'SITTING', 'SNIFFING', 'WALKING'];
const SKIP_CATS = new Set(['test-char']);
/** A tile counts as a frame when it has at least this many visible pixels (guards against stray dots). */
const MIN_PIXELS = 4;

const NAME_OVERRIDES = {
  raccon: 'Raccoon',
  savanhan: 'Savannah',
  'solo-survivor': 'Solo Survivor',
  peachies: 'Peachies',
};

function prettyName(id) {
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Detect frames per row by scanning tiles left to right. Frames are the contiguous run of
 * non-empty tiles starting at column 0. Also returns the union bounding box of the opaque
 * pixels of each row (tile-local pixel coords, inclusive) so the runtime can anchor feet.
 */
async function analyseSheet(file, rowNames) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cols = Math.floor(info.width / FRAME);
  const rowsInSheet = Math.floor(info.height / FRAME);
  const rows = [];
  for (let r = 0; r < rowNames.length; r++) {
    let frames = 0;
    let minX = FRAME, minY = FRAME, maxX = -1, maxY = -1;
    let gapSeen = false;
    for (let c = 0; c < cols && r < rowsInSheet; c++) {
      let count = 0;
      let tMinX = FRAME, tMinY = FRAME, tMaxX = -1, tMaxY = -1;
      for (let y = 0; y < FRAME; y++) {
        const py = r * FRAME + y;
        for (let x = 0; x < FRAME; x++) {
          const px = c * FRAME + x;
          const a = data[(py * info.width + px) * 4 + 3];
          if (a > 0) {
            count++;
            if (x < tMinX) tMinX = x;
            if (y < tMinY) tMinY = y;
            if (x > tMaxX) tMaxX = x;
            if (y > tMaxY) tMaxY = y;
          }
        }
      }
      if (count >= MIN_PIXELS) {
        if (gapSeen) {
          console.warn(`  ! ${file}: row ${rowNames[r]} has a frame after an empty tile at col ${c}; ignored`);
          continue;
        }
        frames++;
        minX = Math.min(minX, tMinX);
        minY = Math.min(minY, tMinY);
        maxX = Math.max(maxX, tMaxX);
        maxY = Math.max(maxY, tMaxY);
      } else {
        gapSeen = true;
      }
    }
    rows.push({
      name: rowNames[r],
      frames,
      bounds: frames > 0 ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: FRAME - 1, maxY: FRAME - 1 },
    });
  }
  return { rows, width: info.width, height: info.height, cols };
}

async function toPng(src, dest, size) {
  let img = sharp(src);
  if (size) img = img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  await img.png().toFile(dest);
}

async function main() {
  if (!existsSync(CAT_ASSETS)) throw new Error(`cat-assets not found at ${CAT_ASSETS}`);
  await rm(OUT, { recursive: true, force: true });
  for (const d of ['cats', 'dogs', 'images', 'icons', 'fonts']) await mkdir(join(OUT, d), { recursive: true });

  // Cats
  const catFiles = (await readdir(join(CAT_ASSETS, 'cats'))).filter((f) => f.endsWith('.png')).sort();
  const cats = [];
  for (const f of catFiles) {
    const id = f.replace(/\.png$/, '');
    if (SKIP_CATS.has(id)) continue;
    const src = join(CAT_ASSETS, 'cats', f);
    const { rows, width, height } = await analyseSheet(src, CAT_ROWS);
    if (width !== 720 || height !== 480) console.warn(`  ! cat ${id} is ${width}x${height}, expected 720x480`);
    await copyFile(src, join(OUT, 'cats', `${id}.png`));
    cats.push({ id, name: prettyName(id), sheet: `cats/${id}.png`, cols: Math.floor(width / FRAME), rows });
  }

  // Dogs (guards)
  const dogDir = join(CAT_ASSETS, 'dogs', 'combined-spritesheets');
  const dogFiles = (await readdir(dogDir)).filter((f) => f.endsWith('.png')).sort();
  const dogs = [];
  for (const f of dogFiles) {
    const id = f.replace(/\.png$/, '');
    const src = join(dogDir, f);
    const { rows, width } = await analyseSheet(src, DOG_ROWS);
    await copyFile(src, join(OUT, 'dogs', `${id}.png`));
    dogs.push({ id, name: prettyName(id), sheet: `dogs/${id}.png`, cols: Math.floor(width / FRAME), rows });
  }

  // Brand images (webp -> png so they can be voxelized / used as textures everywhere)
  const images = {};
  for (const key of ['coin', 'catnip', 'heart', 'paw']) {
    await toPng(join(CLIENT_PUBLIC, 'logo', `${key}.webp`), join(OUT, 'images', `${key}.png`));
    images[key] = `images/${key}.png`;
  }
  await toPng(join(CLIENT_PUBLIC, 'logo', 'logo-text.webp'), join(OUT, 'images', 'logo.png'));
  images.logo = 'images/logo.png';

  // Element icons (optional)
  const icons = {};
  const iconDir = join(CAT_ASSETS, 'game-assets', 'assets');
  if (existsSync(iconDir)) {
    for (const f of (await readdir(iconDir)).filter((x) => x.endsWith('.png')).sort()) {
      const id = f.replace(/\.png$/, '');
      await copyFile(join(iconDir, f), join(OUT, 'icons', f));
      icons[id] = `icons/${f}`;
    }
  }

  // Font
  let font;
  const fontSrc = join(CLIENT_PUBLIC, 'font.woff2');
  if (existsSync(fontSrc)) {
    await copyFile(fontSrc, join(OUT, 'fonts', 'catpaw.woff2'));
    font = 'fonts/catpaw.woff2';
  }

  const manifest = { version: 1, frame: FRAME, cats, dogs, images, icons, font };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

  const short = (e) => e.rows.map((r) => `${r.name[0]}${r.frames}`).join(' ');
  console.log(`cats: ${cats.length}, dogs: ${dogs.length}, icons: ${Object.keys(icons).length}`);
  for (const c of cats.slice(0, 3)) console.log(`  ${c.id}: ${short(c)}`);
  for (const d of dogs) console.log(`  dog ${d.id}: ${short(d)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

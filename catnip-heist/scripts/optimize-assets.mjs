#!/usr/bin/env node
// Lossless size pass over public/assets (run by import-assets.mjs; also runnable on its own with
// `npm run optimize-assets`). Every output decodes to exactly the same pixels as its input:
//
// - Sprite sheets and icons (cats/, dogs/, icons/): re-encoded as a palette PNG when the sheet has
//   at most 256 distinct visible colours (pixel art always does), otherwise as a max-effort
//   truecolour PNG; a file is only replaced when the result is smaller and decodes identically.
// - Brand images (images/*.png): converted to lossless WebP (about half the bytes) and the manifest
//   points at the .webp. images/paw.png stays as well, for the favicon in index.html.
// - manifest.json is written without indentation.
//
// "Identical" means the same alpha everywhere and the same RGB wherever alpha > 0 (the colour of a
// fully transparent pixel is not observable: canvas getImageData returns it as 0,0,0,0).
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(here, '..', 'public', 'assets');
/** Brand images that keep their PNG next to the WebP (referenced outside the manifest). */
const KEEP_PNG = new Set(['paw']);

async function rgba(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

function samePixels(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false;
    if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) return false;
  }
  return true;
}

function visibleColours(data, stopAt) {
  const set = new Set();
  for (let i = 0; i < data.length; i += 4) {
    set.add(data[i + 3] ? data.readUInt32LE(i) : 0);
    if (set.size > stopAt) break;
  }
  return set.size;
}

/** Smallest PNG encoding of `buf` that decodes to the same pixels (or `buf` itself). */
export async function smallestPng(buf) {
  const { data, info } = await rgba(buf);
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  const cands = [await sharp(data, raw).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer()];
  if (visibleColours(data, 256) <= 256) {
    cands.push(await sharp(data, raw).png({ palette: true, colours: 256, quality: 100, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer());
  }
  let best = buf;
  for (const c of cands) {
    if (c.length >= best.length) continue;
    if (samePixels(data, (await rgba(c)).data)) best = c;
  }
  return best;
}

/** Lossless WebP of `buf`, verified pixel-exact; null when the encoder could not match it. */
export async function losslessWebp(buf) {
  const { data, info } = await rgba(buf);
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
  return samePixels(data, (await rgba(out)).data) ? out : null;
}

export async function optimizeAssets(dir = DEFAULT_OUT, { quiet = false } = {}) {
  const say = quiet ? () => undefined : (...a) => console.log(...a);
  let before = 0;
  let after = 0;
  for (const sub of ['cats', 'dogs', 'icons']) {
    const d = join(dir, sub);
    if (!existsSync(d)) continue;
    for (const f of (await readdir(d)).filter((x) => x.endsWith('.png')).sort()) {
      const file = join(d, f);
      const buf = await readFile(file);
      const best = await smallestPng(buf);
      before += buf.length;
      after += best.length;
      if (best !== buf) await writeFile(file, best);
    }
  }
  say(`sheets + icons: ${(before / 1024).toFixed(0)} kB -> ${(after / 1024).toFixed(0)} kB`);

  const manifestFile = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  let ib = 0;
  let ia = 0;
  for (const [key, rel] of Object.entries(manifest.images ?? {})) {
    if (!rel.endsWith('.png')) continue;
    const png = join(dir, rel);
    const buf = await readFile(png);
    const webp = await losslessWebp(buf);
    if (!webp || webp.length >= buf.length) continue;
    const webpRel = rel.replace(/\.png$/, '.webp');
    await writeFile(join(dir, webpRel), webp);
    manifest.images[key] = webpRel;
    if (!KEEP_PNG.has(key)) await rm(png);
    ib += buf.length;
    ia += webp.length;
  }
  if (ib) say(`brand images: ${(ib / 1024).toFixed(0)} kB PNG -> ${(ia / 1024).toFixed(0)} kB lossless WebP`);
  await writeFile(manifestFile, JSON.stringify(manifest));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  optimizeAssets(process.argv[2] ? resolve(process.argv[2]) : DEFAULT_OUT).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

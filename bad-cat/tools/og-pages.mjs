#!/usr/bin/env node
/**
 * npm run og:pages -- <outDir>   (GDD 6.6, 7.4; run after `vite build`, e.g. after build:client)
 *
 * Writes into the build folder:
 *   d/<n>.html for days 1..N   the built index.html with that day's <title>, description, og:* and twitter:* tags
 *   r, c, pick, glass, maker, thanks, redeem, restore .html   static tags per link shell
 *   index.html                 generic tags (rewritten in place, idempotent)
 * Every page loads the same JS bundle. OG images are absolute: <BADCAT_PUBLIC_URL><asset path>og/...; a day without
 * its own og/d/<n>.png uses its shell's og/s/<shell>.png, then og/pick.png.
 *
 * Options: --days N (default max(63, today + 180)), --public-url (default BADCAT_PUBLIC_URL or https://tokentails.com),
 * --asset-path (default BADCAT_BASE when absolute, else /badcat-game/), --page-path (default /badcat/).
 */
import fs from 'node:fs';
import path from 'node:path';
import { viteLoader } from './lib/vite-load.mjs';
import { argValue, positionals } from './lib/args.mjs';
import { INDEX_META, STATIC_PAGES, dayOgDescription, dayOgTitle, joinUrl, pageHtml, publicOrigin } from './lib/og-meta.mjs';

const outArg = positionals(['--days', '--public-url', '--asset-path', '--page-path'])[0];
if (!outArg) {
  console.error('usage: node tools/og-pages.mjs <outDir> [--days N]');
  process.exit(2);
}
const outDir = path.resolve(outArg);
const indexFile = path.join(outDir, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error(`no ${indexFile}: run a vite build into it first`);
  process.exit(2);
}

const origin = publicOrigin(argValue('--public-url') ?? process.env.BADCAT_PUBLIC_URL);
const envBase = (process.env.BADCAT_BASE ?? '').trim();
const assetPath = argValue('--asset-path') ?? (envBase.startsWith('/') ? envBase : '/badcat-game/');
const pagePath = argValue('--page-path') ?? '/badcat/';
const assetUrl = (p) => joinUrl(joinUrl(origin, assetPath), p);
const pageUrl = (p) => (p ? joinUrl(joinUrl(origin, pagePath), p) : joinUrl(origin, pagePath).replace(/\/$/, ''));
const has = (rel) => fs.existsSync(path.join(outDir, rel));

const v = await viteLoader();
let written = 0;
let missingImages = 0;
try {
  const content = await v.load('/src/content/index.ts');
  const today = content.dayNoFor(new Date());
  const days = Math.max(1, Number(argValue('--days') ?? Math.max(63, today + 180)) | 0);
  // The template is the build's own index.html; strip a previous run's block so the tags never pile up.
  const template = fs.readFileSync(indexFile, 'utf8');
  const write = (rel, html) => {
    const file = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) fs.writeFileSync(file, html);
    written++;
  };
  const image = (rel) => {
    if (!has(`og/${rel}`)) missingImages++;
    return assetUrl(`og/${rel}`);
  };

  for (let n = 1; n <= days; n++) {
    const entry = content.dailyEntry(n);
    const img = has(`og/d/${n}.png`) ? `d/${n}.png` : has(`og/s/${entry.shell}.png`) ? `s/${entry.shell}.png` : 'pick.png';
    const title = dayOgTitle(entry);
    write(`d/${n}.html`, pageHtml(template, { title, description: dayOgDescription(entry), url: pageUrl(`d/${n}`), image: image(img), imageAlt: `${entry.label}: the room before the cat gets in` }, 1));
  }
  for (const p of STATIC_PAGES) write(p.file, pageHtml(template, { ...p, url: pageUrl(p.path), image: image(p.image) }, 0));
  write('index.html', pageHtml(template, { ...INDEX_META, url: pageUrl(''), image: image(INDEX_META.image) }, 0));
  console.log(`og:pages: ${written} pages in ${outDir} (days 1..${days}, ${STATIC_PAGES.length} link shells, index); images under ${assetUrl('og/')}`);
  if (missingImages) console.warn(`warning: ${missingImages} pages point at an OG image not in ${outDir}/og (run npm run og before the build)`);
} finally {
  await v.close();
}

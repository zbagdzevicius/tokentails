#!/usr/bin/env node
/**
 * node tools/og-pages.mjs <outDir>   (GDD 8.3; run after `vite build`, part of `npm run build:client`)
 *
 * Writes the link shells into the build folder. Every page loads the same bundle; only the tags differ:
 *   index.html  /meow-race           generic tags (rewritten in place, idempotent)
 *   r.html      /meow-race/r#...     "Beat my cat in Formula Meow" (dare links; the ghost rides in the hash)
 *   d.html      /meow-race/d/<n>     "Formula Meow Daily Cup"
 * OG images are absolute: <MEOW_PUBLIC_URL><MEOW_BASE>og/<file>.png (defaults https://tokentails.com, /formula-meow-game/).
 */
import fs from 'node:fs';
import path from 'node:path';

const outArg = process.argv[2];
if (!outArg) {
  console.error('usage: node tools/og-pages.mjs <outDir>');
  process.exit(2);
}
const outDir = path.resolve(outArg);
const indexFile = path.join(outDir, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error(`no ${indexFile}: run a vite build into it first`);
  process.exit(2);
}

const origin = (process.env.MEOW_PUBLIC_URL || 'https://tokentails.com').replace(/\/+$/, '');
const base = `/${(process.env.MEOW_BASE || '/formula-meow-game/').split('/').filter(Boolean).join('/')}/`;
const page = (p) => `${origin}/meow-race${p}`;
const image = (f) => `${origin}${base}og/${f}`;

export const PAGES = [
  {
    file: 'index.html',
    title: 'Formula Meow',
    description: 'An 8-cat kart race on your phone. Drift, boost and beat real shelter cats from Pink Paw. No download.',
    url: page(''),
    image: image('og.png'),
  },
  {
    file: 'r.html',
    title: 'Beat my cat in Formula Meow',
    description: 'A friend sent you their ghost. Race it on your phone, no download.',
    url: page('/r'),
    image: image('r.png'),
  },
  {
    file: 'd.html',
    title: 'Formula Meow Daily Cup',
    description: 'One race a day: the same track and seed for everyone. Race it and share your card.',
    url: page('/d'),
    image: image('d.png'),
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function pageHtml(template, p) {
  let html = template
    .replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->\s*/g, '')
    .replace(/\s*<title>[\s\S]*?<\/title>/, '')
    .replace(/\s*<meta\s+(name|property)="(description|og:[a-z:_]+|twitter:[a-z:_]+)"[^>]*>/g, '');
  const tags = [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(p.url)}" />`,
    `<meta property="og:image" content="${esc(p.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${esc(p.image)}" />`,
  ];
  const block = `<!-- og:start -->\n    ${tags.join('\n    ')}\n    <!-- og:end -->\n    `;
  return html.replace(/(<meta name="format-detection"[^>]*>\s*)/, `$1${block}`);
}

const template = fs.readFileSync(indexFile, 'utf8');
let written = 0;
for (const p of PAGES) {
  const html = pageHtml(template, p);
  const file = path.join(outDir, p.file);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) {
    fs.writeFileSync(file, html);
    written++;
  }
}
const missing = ['og.png', 'r.png', 'd.png'].filter((f) => !fs.existsSync(path.join(outDir, 'og', f)));
console.log(`og:pages: ${written} page(s) written in ${outDir}`);
if (missing.length) console.warn(`warning: missing OG images in ${outDir}/og: ${missing.join(', ')} (run npm run og before the build)`);

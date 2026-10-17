#!/usr/bin/env node
/**
 * npm run budget (after `npm run build`): gzip size of every JS/CSS file in dist/ and the first-load JS (the entry
 * script and its modulepreloads in dist/index.html, i.e. entry + three + runtime; share, clip, editor, mediabunny,
 * encoder and gif chunks are lazy and excluded). Exit 1 when first-load JS > 450 KB gzip.
 *
 *   node tools/budget.mjs [distDir] [--limit 450]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PKG_ROOT } from './lib/vite-load.mjs';
import { argValue, positionals } from './lib/args.mjs';
import { BUDGET_KB, baseOf, distPath, firstLoadAssets, kb, summarize } from './lib/budget-lib.mjs';

const dist = path.resolve(PKG_ROOT, positionals(['--limit'])[0] ?? 'dist');
const limitKb = Number(argValue('--limit') ?? BUDGET_KB);
const indexFile = path.join(dist, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error(`no ${indexFile}: run npm run build first`);
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = walk(dist)
  .filter((f) => /\.(js|css)$/.test(f) && !/(^|\/)(sw)\.js$/.test(path.relative(dist, f)))
  .map((f) => {
    const buf = fs.readFileSync(f);
    return { file: path.relative(dist, f).split(path.sep).join('/'), raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });
const urls = firstLoadAssets(fs.readFileSync(indexFile, 'utf8'));
const base = baseOf(urls);
const first = urls.map((u) => distPath(u, base));
const missing = first.filter((f) => !files.some((x) => x.file === f));
const s = summarize(files, first, limitKb);

console.log(`${'file'.padEnd(48)} ${'raw'.padStart(10)} ${'gzip'.padStart(10)}  load`);
for (const r of s.rows) console.log(`${r.file.padEnd(48)} ${kb(r.raw).padStart(10)} ${kb(r.gzip).padStart(10)}  ${r.firstLoad ? 'FIRST' : r.lazy ? 'lazy' : 'later'}`);
console.log(`\nfirst-load JS ${kb(s.firstJs)} gzip (budget ${limitKb} KB), first-load CSS ${kb(s.firstCss)}`);
if (missing.length) console.warn(`warning: index.html references files not in ${dist}: ${missing.join(', ')}`);
if (s.lazyLeak.length) console.warn(`warning: lazy chunks are preloaded by index.html: ${s.lazyLeak.join(', ')}`);
if (s.over) {
  console.error(`FAIL: first-load JS is ${kb(s.firstJs - s.limit)} over budget`);
  process.exit(1);
}
console.log('budget ok');

#!/usr/bin/env node
/**
 * npm run budget (after `npm run build`), POC.md §10:
 * - first-load JS (entry + three, from dist/index.html) <= 450 KB gzip
 * - the whole output dir <= 10 MB (the committed client/public/pawlegends-game/ must fit)
 * - no debug hooks (window.__GAME__) in any shipped JS (§15 item 23)
 * Exit 1 on any failure.
 *
 *   node tools/budget.mjs [distDir] [--limit 450] [--total-mb 10]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { argValue, positionals } from './lib/args.mjs';
import { BUDGET_KB, DEBUG_HOOK_RE, TOTAL_MB, baseOf, distPath, firstLoadAssets, kb, mb, summarize } from './lib/budget-lib.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(PKG_ROOT, positionals(['--limit', '--total-mb'])[0] ?? 'dist');
const limitKb = Number(argValue('--limit') ?? BUDGET_KB);
const totalMb = Number(argValue('--total-mb') ?? TOTAL_MB);
const indexFile = path.join(dist, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error(`no ${indexFile}: run npm run build first`);
  process.exit(2);
}

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const all = walk(dist);
const totalBytes = all.reduce((s, f) => s + fs.statSync(f).size, 0);
const files = all
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => {
    const buf = fs.readFileSync(f);
    return { file: path.relative(dist, f).split(path.sep).join('/'), raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length, buf };
  });
const urls = firstLoadAssets(fs.readFileSync(indexFile, 'utf8'));
const base = baseOf(urls);
const first = urls.map((u) => distPath(u, base));
const missing = first.filter((f) => !files.some((x) => x.file === f));
const s = summarize(files.map(({ buf: _b, ...f }) => f), first, limitKb, totalBytes, totalMb);
const hooks = files.filter((f) => f.file.endsWith('.js') && DEBUG_HOOK_RE.test(f.buf.toString('utf8'))).map((f) => f.file);

console.log(`${'file'.padEnd(48)} ${'raw'.padStart(10)} ${'gzip'.padStart(10)}  load`);
for (const r of s.rows) console.log(`${r.file.padEnd(48)} ${kb(r.raw).padStart(10)} ${kb(r.gzip).padStart(10)}  ${r.firstLoad ? 'FIRST' : r.lazy ? 'lazy' : 'later'}`);
console.log(`\nfirst-load JS ${kb(s.firstJs)} gzip (budget ${limitKb} KB), first-load CSS ${kb(s.firstCss)}`);
console.log(`output total ${mb(totalBytes)} in ${all.length} files (budget ${totalMb} MB)`);
if (missing.length) console.warn(`warning: index.html references files not in ${dist}: ${missing.join(', ')}`);
if (s.lazyLeak.length) console.warn(`warning: lazy chunks are preloaded by index.html: ${s.lazyLeak.join(', ')}`);
let failed = false;
if (s.over) {
  console.error(`FAIL: first-load JS is ${kb(s.firstJs - s.limit)} over budget`);
  failed = true;
}
if (s.totalOver) {
  console.error(`FAIL: output is ${mb(totalBytes - s.totalLimit)} over the ${totalMb} MB budget`);
  failed = true;
}
if (hooks.length) {
  console.error(`FAIL: debug hooks in shipped JS: ${hooks.join(', ')}`);
  failed = true;
}
if (failed) process.exit(1);
console.log('budget ok');

#!/usr/bin/env node
// Size budget: npm run budget (after npm run build). Lists every JS/CSS file in dist/ (raw and gzip, KB = 1000 bytes
// like Vite prints) and fails when the main JS (the entry <script> in dist/index.html) or the CSS goes over its cap.
// Measured 2026-10-24: main JS 1,042.6 KB raw / 318.2 KB gzip; CSS 45.3 KB raw / 10.0 KB gzip.
// Raise a cap only with a reason and record the new measurement here.
//
//   node tools/budget.mjs [distDir]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const CAPS = {
  mainJs: { raw: 1150, gzip: 350 },
  css: { raw: 60, gzip: 14 }, // all CSS files together
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(ROOT, process.argv[2] ?? 'dist');
const indexFile = path.join(dist, 'index.html');
if (!fs.existsSync(indexFile)) {
  console.error(`no ${indexFile}: run npm run build first`);
  process.exit(2);
}

const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = walk(dist)
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => {
    const buf = fs.readFileSync(f);
    return { file: path.relative(dist, f).split(path.sep).join('/'), raw: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
  });

const html = fs.readFileSync(indexFile, 'utf8');
const entrySrc = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
if (!entrySrc) {
  console.error('no module entry <script> in dist/index.html');
  process.exit(2);
}
const entryFile = entrySrc.replace(/^(\.\/|\/)/, '').replace(/^.*?(build\/)/, '$1');
const main = files.find((f) => f.file === entryFile);
if (!main) {
  console.error(`entry ${entrySrc} not found in ${dist}`);
  process.exit(2);
}
const css = files.filter((f) => f.file.endsWith('.css')).reduce((a, f) => ({ raw: a.raw + f.raw, gzip: a.gzip + f.gzip }), { raw: 0, gzip: 0 });

console.log(`${'file'.padEnd(36)} ${'raw'.padStart(11)} ${'gzip'.padStart(10)}`);
for (const f of files) console.log(`${f.file.padEnd(36)} ${kb(f.raw).padStart(11)} ${kb(f.gzip).padStart(10)}${f === main ? '  MAIN' : ''}`);
console.log('');

const fails = [];
const check = (label, v, cap) => {
  const line = `${label.padEnd(10)} ${kb(v.raw)} raw (cap ${cap.raw} KB), ${kb(v.gzip)} gzip (cap ${cap.gzip} KB)`;
  console.log(line);
  if (v.raw > cap.raw * 1000) fails.push(`${label} raw ${kb(v.raw)} > ${cap.raw} KB`);
  if (v.gzip > cap.gzip * 1000) fails.push(`${label} gzip ${kb(v.gzip)} > ${cap.gzip} KB`);
};
check('main JS', main, CAPS.mainJs);
check('CSS', css, CAPS.css);

if (fails.length) {
  console.error(`\nFAIL: ${fails.join('; ')}`);
  process.exit(1);
}
console.log('\nbudget ok');

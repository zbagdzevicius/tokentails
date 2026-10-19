#!/usr/bin/env node
/**
 * Bundle budget (iteration 2): the JavaScript a first visit downloads before the race can start (the entry script
 * plus every chunk the HTML preloads) must stay at or under 450 kB gzip. Lazy chunks (editor, clip encoder, menus,
 * podium, post-processing, track dressing) do not count. Fails the build when over.
 *
 *   node tools/budget.mjs [distDir] [limitKB]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = resolve(process.argv[2] ?? 'dist');
const limit = Number(process.argv[3] ?? 450) * 1000;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const refs = new Set();
for (const m of html.matchAll(/<script[^>]+type="module"[^>]*src="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)) refs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]*rel="modulepreload"/g)) refs.add(m[1]);
if (!refs.size) {
  console.error('budget: no entry script found in index.html');
  process.exit(1);
}
let total = 0;
const rows = [];
for (const ref of refs) {
  const rel = ref.replace(/^\.?\//, '').replace(/^.*?(build\/)/, '$1');
  const file = [join(dist, rel), join(dist, ref)].find((f) => existsSync(f));
  if (!file) {
    console.error(`budget: ${ref} is referenced by index.html but missing from ${dist}`);
    process.exit(1);
  }
  const gz = gzipSync(readFileSync(file), { level: 9 }).length;
  total += gz;
  rows.push(`  ${(gz / 1000).toFixed(1).padStart(7)} kB  ${rel}`);
}
console.log(`initial JS (gzip):\n${rows.join('\n')}\n  ${(total / 1000).toFixed(1).padStart(7)} kB  total (budget ${(limit / 1000).toFixed(0)} kB)`);
if (total > limit) {
  console.error(`budget: initial JS is ${(total / 1000).toFixed(1)} kB gzip, over the ${(limit / 1000).toFixed(0)} kB budget`);
  process.exit(1);
}

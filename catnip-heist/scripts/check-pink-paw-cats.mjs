#!/usr/bin/env node
// Checks that the four Pink Paw cats the Heist ships as local copies (src/ui/pink-paw.ts, photos
// from 3 Oct 2026) are still at the shelter. A copy cannot know when a cat is adopted or dies, so
// run this before recording a demo or cutting a build: it exits 1 if any of them is ADOPTED or
// HEAVEN (or missing) in GET /cat/sale. Usage: npm run check:pink-paw [-- --api https://api.tokentails.com]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const argApi = process.argv.indexOf('--api');
const api = (argApi > 0 ? process.argv[argApi + 1] : process.env.PINK_PAW_API) || 'https://api.tokentails.com';
const src = readFileSync(fileURLToPath(new URL('../src/ui/pink-paw.ts', import.meta.url)), 'utf8');
const shipped = [...src.matchAll(/\{ id: '([0-9a-f]{24})', name: '([^']+)'/g)].map((m) => ({ id: m[1], name: m[2] }));
if (!shipped.length) {
  console.error('check-pink-paw-cats: no cats found in src/ui/pink-paw.ts');
  process.exit(2);
}

const res = await fetch(`${api}/cat/sale`);
if (!res.ok) {
  console.error(`check-pink-paw-cats: ${api}/cat/sale returned HTTP ${res.status}`);
  process.exit(2);
}
const body = await res.json();
const all = Object.values(body && typeof body === 'object' ? body : {}).flat();
let bad = 0;
for (const c of shipped) {
  const live = all.find((x) => x && x._id === c.id);
  const status = live?.blessing?.status ?? 'MISSING';
  const ok = status !== 'ADOPTED' && status !== 'HEAVEN' && status !== 'MISSING';
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(8)} ${status}`);
}
if (bad) {
  console.error(`check-pink-paw-cats: ${bad} shipped cat(s) are no longer at the shelter; replace them in src/ui/pink-paw.ts and public/assets/images/pink-paw/.`);
  process.exit(1);
}

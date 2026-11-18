import { takeOf, scan } from '../scenes.mjs';
const [mode, variant, a, b] = process.argv.slice(2);
const tot = {};
for (let s = +a; s <= +b; s++) {
  const r = await scan(takeOf({ mode, variant, seed: s }));
  const c = {};
  for (const m of r.moments) { const k = m.sub ? m.type + ':' + m.sub : m.type; c[k] = (c[k] ?? 0) + 1; tot[k] = (tot[k] ?? 0) + 1; }
  console.log(s, (r.endTick/1800).toFixed(1), r.picks.join(','), JSON.stringify(c));
}
console.log('TOTAL', JSON.stringify(tot));

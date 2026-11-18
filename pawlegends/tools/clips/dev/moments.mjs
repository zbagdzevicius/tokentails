#!/usr/bin/env node
// List the moments of one type for a spec (same take as record.mjs): node tools/clips/dev/moments.mjs specs.json id type [n]
import { readFileSync } from 'node:fs';
import { takeOf, scan, best } from '../scenes.mjs';
const [f, id, type, n = 6] = process.argv.slice(2);
let specs = JSON.parse(readFileSync(f, 'utf8')); specs = Array.isArray(specs) ? specs : [specs];
const spec = specs.find((s) => s.id === id) ?? specs[0];
const sc = await scan(takeOf(spec));
console.log(`seed ${spec.seed} end ${(sc.endTick / 30).toFixed(0)}s`);
for (let i = 0; i < +n; i++) { const m = best(sc, type, { pick: i }); if (!m) break; console.log(i, m.type, m.sub ?? '', 't=' + m.t, 'score=' + m.score, 'slots=' + JSON.stringify(m.slots), 'x,y=' + m.x + ',' + m.y, m.note ?? ''); }

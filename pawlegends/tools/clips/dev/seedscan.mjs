#!/usr/bin/env node
// Rank seeds for one moment type with a spec's picks: node tools/clips/dev/seedscan.mjs specs.json id type from-to
import { readFileSync } from 'node:fs';
import { takeOf, scan, best } from '../scenes.mjs';
const [f, id, type, range] = process.argv.slice(2);
let specs = JSON.parse(readFileSync(f, 'utf8')); specs = Array.isArray(specs) ? specs : [specs];
const spec = specs.find((s) => s.id === id);
const [a, b] = range.split('-').map(Number);
const rows = [];
for (let s = a; s <= b; s++) { const sc = await scan(takeOf({ ...spec, seed: s })); const m = best(sc, type); if (m) rows.push([s, m.score, m.t, m.sub ?? '', JSON.stringify(m.slots), m.note ?? '']); }
rows.sort((x, y) => y[1] - x[1]); for (const r of rows.slice(0, 8)) console.log(r.join(' | '));

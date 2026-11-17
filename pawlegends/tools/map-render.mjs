#!/usr/bin/env node
/**
 * Sim v34 (V34-MAPS.md): top-down SVG of each 3v3 pool map from the sim's own data (nav walls, structures, camps,
 * bushes, the objective). node tools/map-render.mjs <outDir> [crossing ridge thicket quarry pitch]. y is drawn north up.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { importSim } from './lib/sim-bundle.mjs';

const [out = '.', ...ids] = process.argv.slice(2);
const maps = ids.length ? ids : ['crossing', 'ridge', 'thicket', 'quarry', 'pitch'];
mkdirSync(out, { recursive: true });
const lib = await importSim('tools/lib/map-render-entry.ts');
const S = 10; // px per metre
const C = { ground: '#3f6d3a', lane: '#c9a46a', wall: '#1d2b22', bush: '#2a8a3f', cat: '#ffb547', dog: '#5aa9ff', neutral: '#d8d0ff', obj: '#ff4fa3', crate: '#9a6b3c', goal: '#ffffff' };
for (const id of maps) {
  const d = lib.mapData(id);
  const W = (d.width / 1000) * S;
  const H = (d.height / 1000) * S;
  const cell = (d.width / d.nx / 1000) * S;
  const fy = (y) => H - (y / 1000) * S;
  const fx = (x) => (x / 1000) * S;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Top-down map of ${d.name}">`;
  s += `<rect width="${W}" height="${H}" fill="${C.wall}"/>`;
  // walkable ground, run-length per row
  for (let j = 0; j < d.ny; j++) {
    let i = 0;
    while (i < d.nx) {
      if (d.walls[j * d.nx + i]) { i++; continue; }
      let k = i;
      while (k < d.nx && !d.walls[j * d.nx + k]) k++;
      s += `<rect x="${i * cell}" y="${H - (j + 1) * cell}" width="${(k - i) * cell + 0.5}" height="${cell + 0.5}" fill="${C.ground}"/>`;
      i = k;
    }
  }
  for (const pts of d.lanes) {
    const full = [...pts, ...[...pts].reverse().map(([x, y]) => [d.width - x, y])];
    s += `<polyline points="${full.map(([x, y]) => `${fx(x)},${fy(y)}`).join(' ')}" fill="none" stroke="${C.lane}" stroke-width="${S * 2.2}" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;
  }
  for (const b of d.bushes) s += `<rect x="${fx(b.x - b.w / 2)}" y="${fy(b.y + b.h / 2)}" width="${(b.w / 1000) * S}" height="${(b.h / 1000) * S}" rx="${S * 0.6}" fill="${C.bush}" opacity="0.9"/>`;
  for (const c of d.crates) for (const [x0, x1] of [[c[0], c[2]], [d.width - c[2], d.width - c[0]]]) s += `<rect x="${fx(x0)}" y="${fy(c[3])}" width="${fx(x1 - x0)}" height="${((c[3] - c[1]) / 1000) * S}" fill="${C.crate}" stroke="#000" stroke-opacity=".4"/>`;
  if (d.goalMouth) {
    const g = d.goalMouth;
    for (const [x0, x1, col] of [[g[0], g[2], C.cat], [d.width - g[2], d.width - g[0], C.dog]]) s += `<rect x="${fx(x0)}" y="${fy(g[3])}" width="${fx(x1 - x0)}" height="${((g[3] - g[1]) / 1000) * S}" fill="none" stroke="${col}" stroke-width="4" stroke-dasharray="6 4"/>`;
  }
  const o = d.objective;
  if (o) {
    if (o.kind === 'shrines') for (const [x, col] of [[o.x, C.cat], [d.width - o.x, C.dog]]) s += `<circle cx="${fx(x)}" cy="${fy(o.y)}" r="${(o.r / 1000) * S}" fill="${col}" opacity=".35" stroke="${C.obj}" stroke-width="3"/>`;
    else if (o.kind === 'goal') s += `<circle cx="${fx(o.x)}" cy="${fy(o.y)}" r="${S * 1.2}" fill="#fff" stroke="${C.obj}" stroke-width="3"/>`;
    else s += `<circle cx="${fx(o.x)}" cy="${fy(o.y)}" r="${Math.max(S * 1.5, (o.r / 1000) * S)}" fill="${C.obj}" opacity=".45" stroke="${C.obj}" stroke-width="3"/>`;
  }
  for (const c of d.camps) s += `<circle cx="${fx(c.x)}" cy="${fy(c.y)}" r="${S * 0.9}" fill="${C.neutral}" stroke="#000" stroke-width="2"/>`;
  if (!d.objective || d.objective.kind === 'mill' || d.objective.kind === 'shrines') s += `<circle cx="${fx(d.pudding.x)}" cy="${fy(d.pudding.y)}" r="${S * 0.6}" fill="#c58bff" stroke="#000"/>`;
  for (const e of d.entities) {
    const col = e.team === 0 ? C.cat : e.team === 1 ? C.dog : C.neutral;
    const x = fx(e.x), y = fy(e.y);
    if (e.kind === 'core') s += `<rect x="${x - S * 1.6}" y="${y - S * 1.6}" width="${S * 3.2}" height="${S * 3.2}" fill="${col}" stroke="#000" stroke-width="2" transform="rotate(45 ${x} ${y})"/>`;
    else if (e.kind === 'tower') s += `<rect x="${x - S * 0.9}" y="${y - S * 0.9}" width="${S * 1.8}" height="${S * 1.8}" fill="${col}" stroke="#000" stroke-width="2"/>`;
    else if (e.kind === 'fountain') s += `<circle cx="${x}" cy="${y}" r="${S * 1.4}" fill="none" stroke="${col}" stroke-width="3"/>`;
    else if (e.kind === 'camp') s += `<circle cx="${x}" cy="${y}" r="${S * 0.5}" fill="${C.neutral}" stroke="#000"/>`;
    else if (e.kind === 'pudding') s += `<circle cx="${x}" cy="${y}" r="${S * 1.1}" fill="#c58bff" stroke="#000" stroke-width="2"/>`;
  }
  s += '</svg>';
  writeFileSync(`${out}/${id}.svg`, s);
  console.log(`${id}: ${d.name} -> ${out}/${id}.svg (${d.entities.length} structures/camps)`);
}

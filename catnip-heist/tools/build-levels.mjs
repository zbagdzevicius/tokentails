#!/usr/bin/env node
/**
 * Level builder: turns the readable level sources in tools/levels/<id>.mjs into src/levels/<id>.json.
 *
 *   node tools/build-levels.mjs              # every level in tools/levels/
 *   node tools/build-levels.mjs heist-03     # just one
 *   npm run build-level                      # same as the first line
 *
 * Then re-plan the solutions with `npm run solve` (tools/solver.ts).
 *
 * A level source default-exports an object:
 *   {
 *     id: 'heist-03', title: 'Heist 03: ...', name: 'Twin Locks', intro: '...', idea: '...',
 *     map: [ '#####', ... ],             // ASCII, every row the same length (see legend)
 *     doors: { A: { id: 'door-lab' }, V: { id: 'door-vault' } },   // door letters in map order of ids
 *     links: { a: ['A', 'D'] },          // optional: plate letter -> door letters (default: its own letter)
 *     guards: [ { id, sprite, waypoints: ['@', '%'] | [{x,y}], speed, sniffTicks, visionTiles, facing?, turns? } ],
 *     crate: { catId: 'siamese', catName: 'Mochi' },
 *     key: 'key-vault',                  // optional id for the 'k' tile
 *     meta: { parTicks, meowRadiusTiles, investigateTicks, maxCoins, twoCatRequired, objectives?, hints?, tutorial? },
 *   }
 *
 * Map legend (entity letters become floor tiles):
 *   1 2      cat spawns                 $  catnip coin       k  key          C  crate (shelter cat)
 *   E        exit portal tile           +  checkpoint
 *   V        vault door (needs the key)
 *   A D F G H J L M N P Q S T U W X Y Z   plate doors; the same letter in lower case is a plate that
 *            holds every door with that letter open (override with `links`)
 *   3-9 @ % & * = ~ ^ ! ?   named points (floor) that guard waypoints can refer to by character
 * Terrain: # wall, ' ' void, b box (cover), . floor, r rug (cosmetic floor).
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DOOR_LETTERS = 'ADFGHJLMNPQSTUWXYZ';
const POINT_CHARS = '3456789@%&*=~^!?';

export function buildLevel(src) {
  const map = src.map;
  const W = map[0].length;
  const tiles = [];
  const found = {};
  const coins = [];
  const exitTiles = [];
  const checkpoints = [];
  const points = {};
  map.forEach((row, y) => {
    if (row.length !== W) throw new Error(`${src.id}: row ${y} has length ${row.length}, expected ${W}: "${row}"`);
    let out = '';
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if ('#. br'.includes(ch)) {
        out += ch;
        continue;
      }
      out += '.';
      const t = { x, y };
      if (ch === '$') coins.push(t);
      else if (ch === 'E') exitTiles.push(t);
      else if (ch === '+') checkpoints.push(t);
      else if (POINT_CHARS.includes(ch)) {
        if (points[ch]) throw new Error(`${src.id}: point "${ch}" appears twice`);
        points[ch] = t;
      } else if ('12kCV'.includes(ch) || DOOR_LETTERS.includes(ch) || DOOR_LETTERS.toLowerCase().includes(ch)) (found[ch] ??= []).push(t);
      else throw new Error(`${src.id}: unknown map character "${ch}" at (${x},${y})`);
    }
    tiles.push(out);
  });
  const one = (ch) => {
    const l = found[ch];
    if (!l || l.length !== 1) throw new Error(`${src.id}: expected exactly one "${ch}"`);
    return l[0];
  };
  const wallAt = (x, y) => y < 0 || y >= map.length || x < 0 || x >= W || !'.r'.includes(tiles[y][x]);
  const axisOf = (t) => (wallAt(t.x - 1, t.y) && wallAt(t.x + 1, t.y) ? 'h' : 'v');

  // Doors, in the order of the `doors` table. A letter used on several tiles gives several doors.
  const doors = [];
  const doorIdsByLetter = {};
  for (const [letter, d] of Object.entries(src.doors ?? {})) {
    const at = found[letter] ?? [];
    if (!at.length) throw new Error(`${src.id}: door letter "${letter}" is not on the map`);
    doorIdsByLetter[letter] = [];
    at.forEach((t, i) => {
      const id = at.length === 1 ? d.id : `${d.id}-${i + 1}`;
      doorIdsByLetter[letter].push(id);
      doors.push({ id, tile: t, kind: letter === 'V' ? 'VAULT' : 'PLATE', axis: d.axis ?? axisOf(t) });
    });
  }
  for (const ch of Object.keys(found))
    if ((DOOR_LETTERS.includes(ch) || ch === 'V') && !doorIdsByLetter[ch]) throw new Error(`${src.id}: door "${ch}" has no entry in doors`);
  const plates = [];
  const plateLetters = [...new Set([...Object.keys(src.doors ?? {}).map((l) => l.toLowerCase()), ...Object.keys(src.links ?? {})])];
  for (const pl of plateLetters) {
    if (pl === 'v') continue;
    const at = found[pl] ?? [];
    const targets = (src.links?.[pl] ?? [pl.toUpperCase()]).flatMap((L) => {
      const ids = doorIdsByLetter[L];
      if (!ids) throw new Error(`${src.id}: plate "${pl}" links to unknown door "${L}"`);
      return ids;
    });
    at.forEach((t, i) => plates.push({ id: `plate-${pl}${i + 1}`, tile: t, doors: targets }));
  }
  for (const ch of Object.keys(found))
    if (DOOR_LETTERS.toLowerCase().includes(ch) && !plateLetters.includes(ch)) throw new Error(`${src.id}: plate "${ch}" has no door`);

  const pt = (w) => {
    if (typeof w === 'string') {
      const p = points[w];
      if (!p) throw new Error(`${src.id}: waypoint "${w}" is not on the map`);
      return { x: p.x, y: p.y };
    }
    return { x: w.x, y: w.y };
  };
  const guards = src.guards.map((g) => {
    const out = { id: g.id, sprite: g.sprite, waypoints: g.waypoints.map(pt), speed: g.speed, sniffTicks: g.sniffTicks, visionTiles: g.visionTiles };
    if (g.facing) out.facing = g.facing;
    if (g.turns) out.turns = g.turns;
    return out;
  });

  return {
    id: src.id,
    tiles,
    catSpawns: [one('1'), one('2')],
    guards,
    coins: coins.map((t, i) => ({ id: `coin-${String(i + 1).padStart(2, '0')}`, tile: t })),
    key: found['k'] ? { id: src.key ?? 'key-vault', tile: one('k') } : null,
    doors,
    plates,
    crate: { id: 'crate', tile: one('C'), catId: src.crate.catId, catName: src.crate.catName },
    exit: { id: 'exit', tiles: exitTiles },
    checkpoints: checkpoints.map((t, i) => ({ id: `cp-${i + 1}`, tile: t })),
    meta: { title: src.title, ...src.meta, name: src.name, intro: src.intro, idea: src.idea },
  };
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, 'levels');
  const want = process.argv.slice(2);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()
    .filter((f) => !want.length || want.includes(f.replace(/\.mjs$/, '')));
  if (!files.length) throw new Error(`no level sources match ${want.join(' ')}`);
  for (const f of files) {
    const src = (await import(pathToFileURL(join(dir, f)).href)).default;
    const level = buildLevel(src);
    const out = join(here, '..', 'src', 'levels', `${level.id}.json`);
    writeFileSync(out, JSON.stringify(level, null, 2) + '\n');
    console.log(
      `wrote src/levels/${level.id}.json: ${level.tiles[0].length}x${level.tiles.length}, ${level.coins.length} coins, ${level.guards.length} guards, ${level.doors.length} doors, ${level.checkpoints.length} checkpoints`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

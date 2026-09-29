/**
 * Text rendering of a sim state (for QA hooks such as renderGameToText, tests and the solver).
 *
 * Legend: # wall, b box, . floor, D/d plate door closed/open, V/v vault door closed/open,
 * P/p plate up/down, $ coin, K key, C crate, E exit, + checkpoint, 1/2 cats (upper-case = active
 * is shown with *), G guard (arrow shows facing: > < v ^), ' vision.
 */
import type { LevelDef, SimState } from '../types';
import { tileOf } from './grid';
import { visibleTiles } from './sim';

export function renderAscii(level: LevelDef, s: SimState, withVision = true): string {
  const g: string[][] = level.tiles.map((row) => row.split('').map((ch) => (ch === 'r' ? '.' : ch)));
  const put = (x: number, y: number, ch: string) => {
    if (y >= 0 && y < g.length && x >= 0 && x < g[y].length) g[y][x] = ch;
  };
  if (withVision)
    for (const gd of s.guards) for (const t of visibleTiles(level, gd, s.doorsOpen)) put(t.x, t.y, "'");
  level.checkpoints.forEach((cp) => put(cp.tile.x, cp.tile.y, '+'));
  level.exit.tiles.forEach((t) => put(t.x, t.y, 'E'));
  level.plates.forEach((p, i) => put(p.tile.x, p.tile.y, s.platesDown[i] ? 'p' : 'P'));
  level.doors.forEach((d, i) =>
    put(d.tile.x, d.tile.y, d.kind === 'VAULT' ? (s.doorsOpen[i] ? 'v' : 'V') : s.doorsOpen[i] ? 'd' : 'D'),
  );
  s.coins.forEach((co) => !co.taken && put(co.tile.x, co.tile.y, '$'));
  if (level.key && !s.keyTaken) put(level.key.tile.x, level.key.tile.y, 'K');
  put(level.crate.tile.x, level.crate.tile.y, s.rescued ? 'c' : 'C');
  for (const gd of s.guards) {
    const t = tileOf(gd.pos);
    const f = gd.facing;
    put(t.x, t.y, f.x > 0 ? '>' : f.x < 0 ? '<' : f.y > 0 ? 'v' : '^');
  }
  s.cats.forEach((cat, i) => {
    const t = tileOf(cat.pos);
    put(t.x, t.y, String(i + 1));
  });
  const head =
    `tick ${s.tick} active ${s.activeIndex + 1} coins ${s.coinsCollected}/${s.coins.length} key ${s.hasKey ? 'held' : s.keyTaken ? 'used' : 'no'}` +
    ` rescued ${s.rescued} won ${s.won} spotted ${s.spottedCount} score ${s.score} hash ${s.hash.toString(16)}` +
    `\nguards: ${s.guards.map((x) => `${x.id}:${x.mode}`).join(' ')}`;
  return head + '\n' + g.map((r) => r.join('')).join('\n');
}

/**
 * Soft-lock check with full knowledge of the level: can the current objective still be reached at
 * all from where the two cats stand (plate doors need the partner on a plate in its own region)?
 * Used to tell "the player gave up" apart from "the run could not be finished without a restart".
 */
import type { LevelDef, SimState } from '../../src/types';
import { T_FLOOR, compileLevel, tileOf } from '../../src/sim/grid';
import { buildRegions, doorEdges, jointSearch } from './nav';

export function isSoftLocked(level: LevelDef, s: SimState): boolean {
  if (s.won) return false;
  const c = compileLevel(level);
  const vaultOpen = (d: number) => s.doorsOpen[d] || s.hasKey;
  const passable = (i: number) => {
    if (c.terrain[i] !== T_FLOOR || i === c.crateIdx) return false;
    const d = c.doorAt[i];
    if (d > 0 && level.doors[d - 1].kind === 'VAULT') return vaultOpen(d - 1);
    return true;
  };
  const plateDoorAt = (i: number) => c.doorAt[i] > 0 && level.doors[c.doorAt[i] - 1].kind === 'PLATE';
  const regions = buildRegions(c, passable, plateDoorAt);
  const edges = doorEdges(c, level, regions, () => true, () => true);
  const regionOfCat = (k: 0 | 1) => {
    const t = tileOf(s.cats[k].pos);
    const i = t.y * c.w + t.x;
    if (regions.id[i] >= 0) return regions.id[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (t.y + dy) * c.w + t.x + dx;
      if (regions.id[j] >= 0) return regions.id[j];
    }
    return -1;
  };
  const plateRegion = (p: number) => regions.id[level.plates[p].tile.y * c.w + level.plates[p].tile.x];
  const idx = (t: { x: number; y: number }) => t.y * c.w + t.x;
  let goal: (r0: number, r1: number) => boolean;
  if (level.key && !s.keyTaken) {
    const r = regions.id[idx(level.key.tile)];
    goal = (a, b) => a === r || b === r;
  } else if (!s.rescued) {
    const rs = new Set<number>();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const r = regions.id[(level.crate.tile.y + dy) * c.w + level.crate.tile.x + dx];
        if (r >= 0) rs.add(r);
      }
    goal = (a, b) => rs.has(a) || rs.has(b);
  } else {
    const rs = new Set(level.exit.tiles.map((t) => regions.id[idx(t)]));
    goal = (a, b) => rs.has(a) && rs.has(b);
  }
  return jointSearch([regionOfCat(0), regionOfCat(1)], edges, plateRegion, goal) === null;
}

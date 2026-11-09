/**
 * MAP-GAPS A14: the client's copy of the nav grid (input side): the static walls plus the footprints of the standing
 * towers and cores as the snapshot shows them, covered and freed the way the sim does (sim/units/tower.ts
 * coverStructures / onStructureDestroyed, the same coverDisc and radii). `input/heading.ts` (the flash ghost) and
 * `input/orders.ts` (goals, the joystick slide) read it. It only shapes the command the client sends; commands are
 * recorded and replayed as sent, so determinism is untouched.
 */
import { RADIUS } from '../data/map';
import { coverDisc, createGrid, type NavGrid } from '../sim/map/grid';

let grid: NavGrid | null = null;
const covered = new Map<number, { x: number; y: number; r: number }>();

/** The client grid (walls plus the standing structures last synced). */
export function clientGrid(): NavGrid {
  grid ??= createGrid();
  return grid;
}

/** A new match: no structure is covered until the first snapshot syncs them. */
export function resetStructures(): void {
  grid = null;
  covered.clear();
}

/** Ids of the structures covered now (tests). */
export const coveredStructures = (): number[] => [...covered.keys()].sort((a, b) => a - b);

/**
 * Sync with a snapshot's entities (sim mm): every live tower and core covers its footprint at its sim radius; one
 * that died or left the list frees it.
 */
export function syncStructures(entities: readonly { id: number; kind: string; x: number; y: number; state?: string; hp?: number }[]): void {
  const g = clientGrid();
  // PERF-IOS §8 Track B: runs every frame; one reused set and no entry arrays
  const live = liveScratch;
  if (live.size) live.clear();
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.kind !== 'tower' && e.kind !== 'core') continue;
    if (e.state === 'dead' || (e.hp !== undefined && e.hp <= 0)) continue;
    live.add(e.id);
    if (covered.has(e.id)) continue;
    const r = e.kind === 'core' ? RADIUS.core : RADIUS.tower;
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    coverDisc(g, x, y, r, 1);
    covered.set(e.id, { x, y, r });
  }
  if (covered.size > live.size) {
    syncGrid = g;
    covered.forEach(freeGone);
    syncGrid = null;
  }
}
const liveScratch = new Set<number>();
let syncGrid: NavGrid | null = null;
const freeGone = (c: { x: number; y: number; r: number }, id: number): void => {
  if (liveScratch.has(id) || !syncGrid) return;
  coverDisc(syncGrid, c.x, c.y, c.r, -1);
  covered.delete(id);
};

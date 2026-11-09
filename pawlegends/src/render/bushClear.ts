/**
 * MAP-GAPS A20: a bush with an allied hero or minion in it is "cleared": everything inside it is already visible to
 * us (an ally in a bush sees the whole bush), so the 3D bush and its minimap mark tint lighter. Snapshot data only.
 * Render and UI only.
 */
import { BUSHES } from '../data/map';
import { bushAt } from '../sim/map/brush';

/** Bush count, both sides, on Purrhaven Crossing (sim/map/brush.ts bushAt order: Purrhaven side, then Woof's). */
export const BUSH_COUNT = BUSHES.length * 2;
/** Sim v19: the bound map's bush count (Hearthwood: 30). */
export const bushCount = (): number => BUSHES.length * 2;

/** Per bush (bushAt order): does an allied hero or minion stand in it? */
export function clearedBushes(entities: readonly { kind: string; team: number; state: string; fx?: number; fy?: number; x: number; y: number }[], myTeam: number, out: boolean[] = []): boolean[] {
  out.length = bushCount();
  out.fill(false);
  for (const e of entities) {
    if (e.team !== myTeam || e.state === 'dead' || (e.kind !== 'hero' && e.kind !== 'minion')) continue;
    const k = bushAt(Math.round(e.fx ?? e.x), Math.round(e.fy ?? e.y));
    if (k >= 0) out[k] = true;
  }
  return out;
}

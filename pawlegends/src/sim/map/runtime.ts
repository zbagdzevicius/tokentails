/**
 * Sim v18 (docs/plans/moba/MAP-5V5.md §3.1): the map runtime. Every map-dependent table the sim reads (data/map.ts,
 * the timeline, limits, Pudding's numbers, the Frenzy spots, the entity id ranges, the slot counts, the nav grid size,
 * lane paths, camp homes) is a live binding that `bindMap` points at one map. The sim is single-threaded and every
 * entry point binds its match's map first (`bindWorld`), so two matches on different maps can run side by side in one
 * process (the backend referee, a client with a replay open): each call re-points the bindings it needs.
 *
 * Crossing's tables are exactly the v17 ones, so a Crossing match hashes as in v17 (gate G1).
 */
import { CROSSING, setMapData, type MapDef } from '../../data/map';
import { HEARTHWOOD } from '../../data/maps/hearthwood';
import { CROSSING_TIMELINE, CROSSING_TIMELINE_BY, HEARTHWOOD_TIMELINE, HEARTHWOOD_TIMELINE_BY, setTimeline } from '../../data/timeline';
import { setLimits } from '../../data/limits';
import { CROSSING_PUDDING, HEARTHWOOD_PUDDING, setPudding } from '../../data/pudding';
import { CROSSING_FRENZY_SPOTS, HEARTHWOOD_FRENZY_SPOTS, setFrenzySpots } from '../../data/pickups';
import { MAP_IDS, setSlots, type MapId } from '../api';
import { ENTITY_CAP, rebindRange, type World } from '../world';
import { rebindGrid } from './grid';
import { rebindLanes } from './lanes';
import { rebindCamps } from '../units/camp';

export const MAP_DEFS: readonly MapDef[] = Object.freeze([CROSSING, HEARTHWOOD]);

let active = 0;

/** MAP_IDS index of `id` (an unknown id throws). */
export function mapIndex(id: MapId | undefined): number {
  const i = MAP_IDS.indexOf(id ?? 'crossing');
  if (i < 0) throw new RangeError(`unknown map ${String(id)}`);
  return i;
}

/** Point every live binding at map `index` (MAP_IDS). A no-op when it is bound already. */
export function bindMap(index: number): void {
  if (index === active) return;
  active = index;
  const d = MAP_DEFS[index];
  setMapData(d);
  const hearth = d.id === 'hearthwood';
  setTimeline(hearth ? HEARTHWOOD_TIMELINE : CROSSING_TIMELINE, hearth ? HEARTHWOOD_TIMELINE_BY : CROSSING_TIMELINE_BY);
  setLimits(d.id);
  setPudding(hearth ? HEARTHWOOD_PUDDING : CROSSING_PUDDING);
  setFrenzySpots(hearth ? HEARTHWOOD_FRENZY_SPOTS : CROSSING_FRENZY_SPOTS);
  rebindRange();
  setSlots(d.CAPS.heroesPerTeam, ENTITY_CAP);
  rebindGrid();
  rebindLanes();
  rebindCamps();
}

/** Bind the map of world `w` (every sim entry point that takes a match calls this first). */
export const bindWorld = (w: World): void => bindMap(w.map);

/** The map bound now (MAP_IDS index). */
export const activeMap = (): number => active;

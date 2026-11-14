/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §3.1): the map runtime. Every map-dependent table the sim reads (data/map.ts,
 * the timeline, limits, Pudding's numbers, the Frenzy spots, the entity id ranges, the slot counts, the nav grid size,
 * lane paths, camp homes) is a live binding that `bindMap` points at one map. The sim is single-threaded and every
 * entry point binds its match's map first (`bindWorld`), so two matches on different maps can run side by side in one
 * process (the backend referee, a client with a replay open): each call re-points the bindings it needs.
 *
 * Crossing's tables are exactly the v18 ones, so a Crossing match hashes as in v18 (gate G1).
 */
import { CROSSING, CROSSING_STRIP, setMapData, type MapDef } from '../../data/map';
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
import { mutOf } from '../mutator';

export const MAP_DEFS: readonly MapDef[] = Object.freeze([CROSSING, HEARTHWOOD]);
/** Sim v28 (V28.md §2): each map's Sunny Lane strip variant (null: the map has none, its full playfield is bound). */
const STRIP_DEFS: readonly (MapDef | null)[] = Object.freeze([CROSSING_STRIP, null]);

/** The bound map: index × 2 + strip. */
let active = 0;

/** MAP_IDS index of `id` (an unknown id throws). */
export function mapIndex(id: MapId | undefined): number {
  const i = MAP_IDS.indexOf(id ?? 'crossing');
  if (i < 0) throw new RangeError(`unknown map ${String(id)}`);
  return i;
}

/**
 * Point every live binding at map `index` (MAP_IDS). A no-op when it is bound already. Sim v28: `strip` 1 binds the
 * map's Sunny Lane strip variant (data/map.ts CROSSING_STRIP; a map without one binds as itself).
 */
export function bindMap(index: number, strip = 0): void {
  const s = strip === 1 && STRIP_DEFS[index] !== null ? 1 : 0;
  const key = index * 2 + s;
  if (key === active) return;
  active = key;
  const d = s === 1 ? STRIP_DEFS[index]! : MAP_DEFS[index];
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

/** Bind the map of world `w` (every sim entry point that takes a match calls this first). Sim v28: its mutator's strip. */
export const bindWorld = (w: World): void => bindMap(w.map, mutOf(w).strip ? 1 : 0);

/** The map bound now (MAP_IDS index). */
export const activeMap = (): number => active >> 1;
/** Sim v28: the bound map and variant, for `bindKey` to restore. */
export const activeKey = (): number => active;
export const bindKey = (key: number): void => bindMap(key >> 1, key & 1);

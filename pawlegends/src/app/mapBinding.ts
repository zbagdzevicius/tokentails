/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §8): the match's map on the main thread. The sim keeps its map tables as live
 * bindings (src/sim/map/runtime.ts); a local match runs the sim in a Worker, so the main thread (the render, the
 * input's nav and aim checks, the minimap) binds the same map itself before it builds anything, and goes back to
 * Purrhaven Crossing when the match ends. Also sets the fixed camera's yaw for the map (Crossing −38°, Hearthwood 0°).
 */
import type { MapId, Mutator } from '../sim/api';
import { MUTATOR_RULES } from '../data/mutators';
import { bindMap, mapIndex } from '../sim/map/runtime';
import { mapInfo, type MapInfo } from '../sim/map/info';
import { setMapYaw } from '../render/coords';

let current: MapId = 'crossing';

/**
 * Bind `map` for the main thread (render, input, minimap) and set its camera yaw. Sim v28: a mutator that plays the
 * Sunny Lane strip (data/mutators.ts `strip`) binds the strip variant, so the forest and the minimap match its walls.
 */
export function useMap(map: MapId | undefined, mutator?: Mutator): MapInfo {
  const id: MapId = map === 'hearthwood' ? 'hearthwood' : 'crossing';
  const info = mapInfo(id);
  bindMap(mapIndex(id), mutator && MUTATOR_RULES[mutator]?.strip ? 1 : 0);
  setMapYaw(info.camera.yawDeg);
  current = id;
  return info;
}

/** The map the main thread has bound now. */
export const currentMap = (): MapId => current;
/** True while a Hearthwood (5v5 Classic) match is bound. */
export const isClassic = (): boolean => current === 'hearthwood';

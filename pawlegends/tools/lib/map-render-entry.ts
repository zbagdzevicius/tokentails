/**
 * Sim v34 (V34-MAPS.md): data for the top-down map renders (tools/map-render.mjs): one match created on `map`, its nav
 * walls, structures, camps and the map's bushes, walls, objective, goal mouth and crates. Read-only.
 */
import type { MapId } from '../../src/sim/api';
import { createMatch, fillPicks, snapshot, type MatchHandle } from '../../src/sim/index';
import { ACTIVE_MAP, MAP } from '../../src/data/map';
import { NX, NY } from '../../src/sim/map/grid';

export function mapData(map: MapId) {
  const { picks, tricks } = fillPicks(7, 'clem', 'pounce', map);
  const m = createMatch({ seed: 7, picks, tricks, difficulty: 'normal', map }) as MatchHandle;
  const snap = snapshot(m, 0);
  const d = ACTIVE_MAP;
  return {
    id: d.id,
    name: d.name,
    blurb: d.blurb ?? '',
    width: MAP.width,
    height: MAP.height,
    nx: NX,
    ny: NY,
    walls: Array.from(m.grid.walls),
    entities: snap.entities.filter((e) => e.kind !== 'hero' && e.kind !== 'minion').map((e) => ({ kind: e.kind, team: e.team, variant: e.variant, x: e.x, y: e.y })),
    bushes: d.BUSHES.flatMap((b) => [b, { ...b, x: MAP.width - b.x }]),
    lanes: d.LANES.map((l) => d.LANE_WAYPOINTS[l]),
    objective: d.objective ?? null,
    camps: d.CAMPS.map((c) => ({ x: c.x, y: c.y, side: c.side })),
    pudding: d.PUDDING_SPOT,
    goalMouth: d.goalMouth ?? null,
    crates: d.crates ?? [],
    laneNames: d.laneNames ?? [],
  };
}

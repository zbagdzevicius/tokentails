/**
 * Party rematch on a new map (founder, Nov 18): the second party match drew the new 3v3 pool map, but the drawn hero
 * bumped into the first match's walls, because the prediction walker (net/predict-path.ts) built its wall grid once
 * per page and the input grid (input/navMirror.ts) could outlive the map it was built for. Both now follow the map
 * bound for the match (app/mapBinding.ts useMap → sim bindMap).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MAP, NAV } from '../../src/data/map';
import { clientGrid, resetStructures } from '../../src/input/navMirror';
import { gridPlanner } from '../../src/net/predict-path';
import { MAP_IDS, type MapId } from '../../src/sim/api';
import { createGrid, NX, NY } from '../../src/sim/map/grid';
import { bindMap, mapIndex } from '../../src/sim/map/runtime';
import { findPath } from '../../src/sim/nav/astar';

const bind = (id: MapId): void => bindMap(mapIndex(id));

/** The sim's A* on a freshly built grid of the map bound now (what the sim's hero walks). */
function reference(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
  const outX = new Int32Array(NAV.maxPathPoints);
  const outY = new Int32Array(NAV.maxPathPoints);
  const r = findPath(createGrid(), sx, sy, tx, ty, outX, outY, 0);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < r.count; i++) pts.push({ x: outX[i], y: outY[i] });
  return pts;
}

/** A spread of start and goal pairs over the bound map (a fixed lattice, the same every run). */
function pairs(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const W = MAP.width;
  const H = MAP.height;
  for (let i = 1; i <= 5; i++)
    for (let j = 1; j <= 5; j++) out.push([Math.round((W * i) / 6), Math.round((H * j) / 6), Math.round(W - (W * j) / 6), Math.round((H * i) / 6)]);
  return out;
}

afterEach(() => {
  bind('crossing');
  resetStructures();
});

describe('the client grids follow the match map', () => {
  const others = MAP_IDS.filter((m) => m !== 'crossing');

  it.each(others)('a second match on %s walks its own walls, not the first match’s', (next) => {
    bind('crossing');
    // the first match: the walker plans (and builds its grid) on Crossing
    for (const [sx, sy, tx, ty] of pairs()) gridPlanner(sx, sy, tx, ty);
    clientGrid();
    // the second match binds the new map (MatchSession → useMap) and walks there
    bind(next);
    for (const [sx, sy, tx, ty] of pairs()) expect(gridPlanner(sx, sy, tx, ty)).toEqual(reference(sx, sy, tx, ty));
    // the input grid (goals, the joystick slide, the flash ghost) is the new map's, even without a reset
    const g = clientGrid();
    expect(g.walls.length).toBe(NX * NY);
    expect(Array.from(g.walls)).toEqual(Array.from(createGrid().walls));
  });

  it('back on the first map, the walker uses its walls again', () => {
    bind('ridge');
    for (const [sx, sy, tx, ty] of pairs()) gridPlanner(sx, sy, tx, ty);
    bind('crossing');
    for (const [sx, sy, tx, ty] of pairs()) expect(gridPlanner(sx, sy, tx, ty)).toEqual(reference(sx, sy, tx, ty));
  });

  it('the maps differ where it matters (the check above is not vacuous)', () => {
    bind('crossing');
    const a = Array.from(createGrid().walls);
    const ny = NY;
    bind('ridge');
    const b = Array.from(createGrid().walls);
    expect(a.length !== b.length || ny !== NY || a.some((v, i) => v !== b[i])).toBe(true);
  });
});

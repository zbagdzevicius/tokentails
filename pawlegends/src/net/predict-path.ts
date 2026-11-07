/**
 * The walker's planner for party prediction (predict.ts): the sim's own A* (nav/astar.ts) on the client's wall grid,
 * so the drawn hero turns the corners the sim's hero will turn and stops where its path stops (a goal in a hedge
 * snaps, an unreachable one ends at the nearest point). Static walls only: a structure's footprint is not in it, so
 * around a tower the drawn hero may cut a corner the sim walks around, and the walker's correction takes it back.
 */
import { MAP, NAV } from '../data/map';
import { findPath } from '../sim/nav/astar';
import { createGrid, type NavGrid } from '../sim/map/grid';
import type { Planner } from './predict';

let walls: NavGrid | null = null;
const outX = new Int32Array(NAV.maxPathPoints);
const outY = new Int32Array(NAV.maxPathPoints);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const gridPlanner: Planner = (sx, sy, tx, ty) => {
  walls ??= createGrid();
  const r = findPath(
    walls,
    Math.round(clamp(sx, 0, MAP.width)),
    Math.round(clamp(sy, 0, MAP.height)),
    Math.round(clamp(tx, 0, MAP.width)),
    Math.round(clamp(ty, 0, MAP.height)),
    outX,
    outY,
    0,
  );
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < r.count; i++) pts.push({ x: outX[i], y: outY[i] });
  return pts;
};

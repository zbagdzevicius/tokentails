/**
 * Screen <-> world maths (pure, unit-tested): the Room Maker's pick ray against the heightmap's top surfaces,
 * world -> screen projection of a cell (projectWorld) and the edge arrow that points at a human whose head is off
 * screen (GDD 11.1: "if anything ever crops the human, an edge arrow points to them").
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { CELL_M, type Level } from '../../types';
import { cellX, cellZ, levelY } from '../space';

/** Client px -> NDC for an element rect. */
export function clientToNdc(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    y: -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
  };
}

/** World ray (origin, unit direction) through an NDC point of a camera. */
export function ndcRay(cam: PerspectiveCamera, ndcX: number, ndcY: number): { origin: Vector3; dir: Vector3 } {
  cam.updateMatrixWorld(true);
  const origin = new Vector3().setFromMatrixPosition(cam.matrixWorld);
  const p = new Vector3(ndcX, ndcY, 0.5).unproject(cam);
  return { origin, dir: p.sub(origin).normalize() };
}

/**
 * First grid cell whose top surface the ray reaches (heightmap march, 1 cm steps inside the room box). The ray
 * hits a cell when it is at or below that cell's surface height while over it; side faces count as the cell's top
 * (clicking the front of a counter picks the counter). null outside the room.
 */
export function pickHeightmap(
  origin: Vector3,
  dir: Vector3,
  levels: ArrayLike<number>,
  w: number,
  d: number,
): { x: number; z: number; level: Level } | null {
  const hw = (w * CELL_M) / 2;
  const hd = (d * CELL_M) / 2;
  const top = levelY(3) + 0.05;
  // clip the ray to the room box [-hw, hw] x [0, top] x [-hd, hd]
  let t0 = 0;
  let t1 = 1e3;
  const slab = (o: number, v: number, lo: number, hi: number): boolean => {
    if (Math.abs(v) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / v;
    let b = (hi - o) / v;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(origin.x, dir.x, -hw, hw) || !slab(origin.y, dir.y, -0.01, top) || !slab(origin.z, dir.z, -hd, hd)) return null;
  const step = 0.01;
  const p = new Vector3();
  for (let t = t0; t <= t1 + step; t += step) {
    p.copy(origin).addScaledVector(dir, t);
    const x = Math.floor(p.x / CELL_M + w / 2);
    const z = Math.floor(p.z / CELL_M + d / 2);
    if (x < 0 || z < 0 || x >= w || z >= d) continue;
    const lv = levels[z * w + x] ?? 0;
    if (p.y <= levelY(lv) + 1e-4) return { x, z, level: lv as Level };
  }
  return null;
}

/** Screen position (0..1, y down) of a cell centre at a level; onScreen false outside the view or behind it. */
export function projectCell(cam: PerspectiveCamera, x: number, z: number, level: number, w: number, d: number): { x: number; y: number; onScreen: boolean } {
  cam.updateMatrixWorld(true);
  const p = new Vector3(cellX(x, w), levelY(level), cellZ(z, d));
  return projectPoint(cam, p);
}

export function projectPoint(cam: PerspectiveCamera, world: Vector3): { x: number; y: number; onScreen: boolean } {
  const v = world.clone().project(cam);
  const behind = v.z > 1;
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, onScreen: !behind && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1 };
}

/**
 * Edge arrow for a point at NDC (x, y, z) (z > 1 = behind the camera): null when on screen, else the arrow's NDC
 * position on the screen border (inset by `margin`) along the line from the centre, and its screen angle
 * (radians, 0 = pointing right, counter-clockwise; `aspect` = w / h corrects the angle to pixels).
 */
export function edgeArrow(ndc: { x: number; y: number; z: number }, aspect: number, margin = 0.12): { x: number; y: number; angle: number } | null {
  let x = ndc.x;
  let y = ndc.y;
  const behind = ndc.z > 1;
  if (!behind && Math.abs(x) <= 1 && Math.abs(y) <= 1) return null;
  if (behind) {
    x = -x;
    y = -y;
  }
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) y = -1;
  const lim = 1 - margin;
  const k = lim / Math.max(Math.abs(x), Math.abs(y));
  const ax = x * k;
  const ay = y * k;
  return { x: ax, y: ay, angle: Math.atan2(y, x * aspect) };
}

/**
 * Shared pieces for the sim v13 dogs' skill FX (skillfx/nugget, marshmallow, bravo, chili, howler): one pooled mesh
 * spawn, scratch vectors, the facing / aim helpers and a render-side variety hash. Everything is pooled: nothing
 * allocates per event or per frame. Render only (never the sim RNG: render-no-sim-rng.test).
 */
import type { FxCtx, MeshFxKind, MeshFxSpawn, Relation3, V3Out } from '../anim/types';

export const P: V3Out = { x: 0, y: 0, z: 0 };
export const Q: V3Out = { x: 0, y: 0, z: 0 };
export const F: V3Out = { x: 0, y: 0, z: 0 };
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 1, color: 0, rim: 0, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };

/** Spawn one mesh effect. `p0` is the arc (crescent / arc kinds; 0 = a full turn), `delay` holds it back (s). */
export function mesh(
  fx: FxCtx,
  kind: MeshFxKind,
  x: number,
  z: number,
  sx: number,
  life: number,
  color: number,
  rim: number,
  rel: Relation3,
  o: { yaw?: number; y?: number; sz?: number; sy?: number; p0?: number; p1?: number; p2?: number; p3?: number; delay?: number } = {},
): number {
  S.x = x;
  S.z = z;
  S.y = o.y ?? 0.06;
  S.yaw = o.yaw ?? 0;
  S.sx = sx;
  S.sy = o.sy ?? 1;
  S.sz = o.sz ?? sx;
  S.life = life;
  S.color = color;
  S.rim = rim;
  S.rel = rel;
  S.p0 = o.p0 ?? (kind === 'crescent' || kind === 'arc' ? Math.PI * 2 : 0);
  S.p1 = o.p1 ?? 0;
  S.p2 = o.p2 ?? 0;
  S.p3 = o.p3 ?? 1;
  S.delay = o.delay ?? 0;
  return fx.mesh.spawn(kind, S);
}

/** Ground yaw (rad, mesh FX convention) of a unit ground direction (dx, dz). */
export const yawOf = (dx: number, dz: number): number => Math.atan2(-dz, dx);

/** Unit ground direction from the hero at P toward a sim aim point (mm), into F; false when it is on top of him. */
export function aimDir(ax: number, ay: number): boolean {
  const dx = ax / 1000 - P.x;
  const dz = -ay / 1000 - P.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.05) return false;
  F.x = dx / l;
  F.z = dz / l;
  return true;
}

/** The hero's drawn facing into F (falls back to +X). */
export function faceOf(fx: FxCtx, id: number): void {
  if (!fx.facing?.(id, F)) {
    F.x = 1;
    F.z = 0;
  }
}

let seed = 0x51ed27;
/** Render-side variety in [0, 1) (an LCG: replays look alike; never the sim RNG). */
export function vary(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

/** Arc of an ability cone in rad from its `arc` number (1/4096 of a turn). */
export const arcRad = (arc: number | undefined, fallback = 853): number => ((arc ?? fallback) / 4096) * Math.PI * 2;

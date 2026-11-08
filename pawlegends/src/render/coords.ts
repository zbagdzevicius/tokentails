/**
 * Sim → three.js coordinates. The sim is integer mm with +y north (POC.md §4.2); three.js world units are metres,
 * X = x / 1000, Z = −y / 1000 (north is −Z), Y up. IsoRig convention: the camera sits at focus + (sin yaw · cos pitch,
 * sin pitch, cos yaw · cos pitch) · d; screen-right on the ground is (cos yaw, 0, −sin yaw) and screen-up is
 * (−sin yaw, 0, −cos yaw).
 */
import { PITCH } from './camera/frame';

export const MM = 1000;
export const toX = (xMm: number): number => xMm / MM;
export const toZ = (yMm: number): number => -yMm / MM;
/** Sim facing (1/4096 turn, 0 = +x, counter-clockwise seen from above) → three.js rotation.y. */
export const toYaw = (facing: number): number => (facing / 4096) * Math.PI * 2;

/**
 * Feel pass B2 (docs/plans/moba/FEEL-PASS.md): the map reads diagonally, as in LoL, Wild Rift and MLBB. The ground
 * yaw is −38°: sim +x (Purrhaven → Woof) points up and to the right on screen, so a team-0 seat sees its own base
 * bottom left and the enemy's top right, the base-to-base line about 31° above the horizontal at the 52° pitch.
 * Sunny Lane runs along the upper-left side, Puddle along the lower-right.
 */
export const CAMERA_YAW = (-38 * Math.PI) / 180;

/**
 * A team-1 seat sees the map turned another 180° (its base bottom left, the enemy's top right, as every MOBA shows
 * the red side): the camera, the stick and drag aims, the yaw-baked effects and the minimap all read this.
 */
let viewYaw = CAMERA_YAW;
/** The camera yaw now: CAMERA_YAW, or + π for a team-1 seat. */
export const cameraYaw = (): number => viewYaw;
/** Turn the view for `team` (1: another 180°). */
export function setViewTeam(team: number): void {
  viewYaw = team === 1 ? CAMERA_YAW + Math.PI : CAMERA_YAW;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The tilted camera squashes the ground's depth axis on screen by sin(pitch): 1 m of ground straight up the screen
 * shows as sin(52°) ≈ 0.79 of 1 m across it. screenToSim undoes it, so a thumb angle lands on the same screen angle.
 */
const GROUND_SQUASH = Math.sin(PITCH);

/**
 * A screen vector (dx right, dy UP, any unit) → the sim direction (x east, y north) it points along on the ground:
 * the up part is stretched by 1/sin(pitch) (the tilt's ground projection), then rotated by the view yaw (feel pass
 * B2; this replaces the old ±1 team flip). Only the direction is meant: the length is in ground units of `dx`. Writes
 * `out`.
 */
export function screenToSim(dx: number, dy: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(viewYaw);
  const s = Math.sin(viewYaw);
  const gy = dy / GROUND_SQUASH;
  out.x = dx * c - gy * s;
  out.y = dx * s + gy * c;
  return out;
}

/** The inverse of screenToSim: a sim direction (x east, y north) → the screen vector (right, UP) it shows as. */
export function simToScreen(x: number, y: number, out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const c = Math.cos(viewYaw);
  const s = Math.sin(viewYaw);
  out.x = x * c + y * s;
  out.y = (-x * s + y * c) * GROUND_SQUASH;
  return out;
}

/** Screen-right on the ground (three.js X / Z, unit length) for the current view. */
export function screenRightXZ(out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  out.x = Math.cos(viewYaw);
  out.z = -Math.sin(viewYaw);
  return out;
}

/** The ground direction toward the camera (three.js X / Z, unit length) for the current view. */
export function towardCameraXZ(out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  out.x = Math.sin(viewYaw);
  out.z = Math.cos(viewYaw);
  return out;
}

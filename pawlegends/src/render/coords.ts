/**
 * Sim → three.js coordinates. The sim is integer mm with +y north (POC.md §4.2); three.js world units are metres,
 * X = x / 1000, Z = −y / 1000 (north is −Z), Y up. With camera yaw 0 (IsoRig convention) screen-right is +X and
 * screen-up is −Z, so the map reads as drawn in POC.md §5: Purrhaven left, Woof right, Sunny Lane on top.
 */
export const MM = 1000;
export const toX = (xMm: number): number => xMm / MM;
export const toZ = (yMm: number): number => -yMm / MM;
/** Sim facing (1/4096 turn, 0 = +x, counter-clockwise seen from above) → three.js rotation.y. */
export const toYaw = (facing: number): number => (facing / 4096) * Math.PI * 2;
/** Camera yaw that puts sim +x right and sim +y up on screen. */
export const CAMERA_YAW = 0;

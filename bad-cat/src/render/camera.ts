/**
 * Gameplay camera (GDD 11.1). Perspective, vertical FOV ~48°, looking at the room from the open (south) side;
 * the distance is solved from the room's bounds.
 * - 3:4 stage and wider (desktop, tablets): the whole room, pitch 52°, back wall (window, clock) included.
 * - Phone portrait (aspect < PORTRAIT_ASPECT): an 8-cell-wide window over the full depth, pitch 56°, slid
 *   along x to follow the cat (the renderer eases it), so the cat is ~1.5× bigger on a 390 × 844 phone.
 * Pure maths on a PerspectiveCamera (no WebGL), unit-tested at 9:16 and 3:4.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { CELL_M } from '../types';

/** Below this aspect (w / h) the live camera frames a window that follows the cat instead of the whole room. */
export const PORTRAIT_ASPECT = 0.7;
/** Width of that window in cells. */
export const PORTRAIT_WINDOW_CELLS = 8.5; // review round 1: 8 cut the cat at the Kitchen's right edge
/**
 * Portrait pitch and vertical placement (round 3): steeper than the 52° room view and lower on screen, so the
 * room's depth fills the band above the touch controls instead of leaving ~27 % of a 390 × 844 phone empty.
 */
export const PORTRAIT_PITCH_DEG = 66;
/** Round 2 (QA): -0.12 left a ~140 px empty band over the room on a 390 × 844 phone; -0.03 lifts it under the HUD. */
export const PORTRAIT_CENTER_Y = -0.03;

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** highest point to keep on screen (wall top / human head) */
  top: number;
  /** lowest point (plinth bottom), default 0 */
  bottom?: number;
}

export interface FitOptions {
  fovDeg?: number;
  pitchDeg?: number;
  /** NDC margin kept free at the screen edges (0..0.3) */
  margin?: number;
  /** where the room's screen-space centre should sit vertically, in NDC (+ = up) */
  centerY?: number;
  /** yaw offset of the view (radians), for a slow drift */
  yaw?: number;
  /** extra world points that must stay on screen too (the human's head) */
  extra?: Vector3[];
}

export interface CameraPose {
  fov: number;
  position: Vector3;
  target: Vector3;
}

const _v = new Vector3();

/** The 12 corner points of the room's box that must stay on screen. */
export function boundsPoints(b: RoomBounds): Vector3[] {
  const y0 = b.bottom ?? 0;
  const pts: Vector3[] = [];
  for (const x of [b.minX, b.maxX])
    for (const z of [b.minZ, b.maxZ])
      for (const y of [y0, b.top]) pts.push(new Vector3(x, y, z));
  return pts;
}

/** Screen-space (NDC) bounding box of the points for a camera pose. */
export function ndcBox(cam: PerspectiveCamera, pts: Vector3[]): { minX: number; maxX: number; minY: number; maxY: number } {
  cam.updateMatrixWorld(true);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    _v.copy(p).project(cam);
    minX = Math.min(minX, _v.x);
    maxX = Math.max(maxX, _v.x);
    minY = Math.min(minY, _v.y);
    maxY = Math.max(maxY, _v.y);
  }
  return { minX, maxX, minY, maxY };
}

function place(cam: PerspectiveCamera, target: Vector3, dist: number, pitch: number, yaw: number): void {
  cam.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  cam.lookAt(target);
}

/**
 * Solve the camera distance (binary search) and target offset so every bounds point projects inside
 * [-1 + margin, 1 - margin] on both axes, with the room's screen-box centred horizontally and at
 * `centerY` vertically (clamped so it still fits).
 */
export function fitRoomCamera(aspect: number, b: RoomBounds, o: FitOptions = {}): CameraPose {
  const fov = o.fovDeg ?? 48;
  const pitch = ((o.pitchDeg ?? 52) * Math.PI) / 180;
  const yaw = o.yaw ?? 0;
  const margin = o.margin ?? 0.04;
  const cam = new PerspectiveCamera(fov, Math.max(0.1, aspect), 0.05, 200);
  const pts = boundsPoints(b).concat(o.extra ?? []);
  const target = new Vector3((b.minX + b.maxX) / 2, ((b.bottom ?? 0) + b.top) * 0.3, (b.minZ + b.maxZ) / 2);
  const lim = 1 - margin;
  let dist = 8;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 1;
    let hi = 80;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      place(cam, target, mid, pitch, yaw);
      const bx = ndcBox(cam, pts);
      const w = (bx.maxX - bx.minX) / 2;
      const h = (bx.maxY - bx.minY) / 2;
      if (w <= lim && h <= lim) hi = mid;
      else lo = mid;
    }
    dist = hi;
    place(cam, target, dist, pitch, yaw);
    const bx = ndcBox(cam, pts);
    // re-centre: shift the target along the camera's right/up axes by the NDC error
    const h = (bx.maxY - bx.minY) / 2;
    const want = Math.max(-lim + h, Math.min(lim - h, o.centerY ?? 0));
    const errX = (bx.minX + bx.maxX) / 2;
    const errY = (bx.minY + bx.maxY) / 2 - want;
    const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
    const depth = cam.position.distanceTo(target);
    const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    target.addScaledVector(right, errX * tanV * cam.aspect * depth);
    target.addScaledVector(up, errY * tanV * depth);
  }
  place(cam, target, dist, pitch, yaw);
  return { fov, position: cam.position.clone(), target: target.clone() };
}

/** Apply a pose to a camera (with an optional pitch kick in degrees for breaks). */
export function applyPose(cam: PerspectiveCamera, pose: CameraPose, kickDeg = 0): void {
  if (cam.fov !== pose.fov) {
    cam.fov = pose.fov;
    cam.updateProjectionMatrix();
  }
  cam.position.copy(pose.position);
  if (kickDeg) {
    const t = pose.target.clone();
    const dist = cam.position.distanceTo(t);
    t.y -= Math.tan((kickDeg * Math.PI) / 180) * dist;
    cam.lookAt(t);
  } else cam.lookAt(pose.target);
}

/**
 * Live pose for the whole room (aspect >= PORTRAIT_ASPECT): floor footprint + 0.3 m, the human's head and the
 * back wall's top (window and clock) all on screen.
 */
export function roomPose(aspect: number, halfW: number, halfD: number, head: Vector3 | readonly Vector3[] | null): CameraPose {
  const extra: Vector3[] = [new Vector3(-halfW * 0.5, 2.4, -halfD), new Vector3(halfW * 0.5, 2.4, -halfD)];
  for (const h of heads(head)) extra.push(h.clone());
  return fitRoomCamera(
    aspect,
    { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD, top: 0.3, bottom: 0 },
    { fovDeg: 48, pitchDeg: 52, margin: 0.04, centerY: 0, extra },
  );
}

function heads(h: Vector3 | readonly Vector3[] | null): readonly Vector3[] {
  if (!h) return [];
  return Array.isArray(h) ? (h as readonly Vector3[]) : [h as Vector3];
}

/**
 * Club streamer layout (GDD 8): a clean 16:9 stage with the whole room centred (never the phone window), a little
 * more margin for the DOM's dare QR, every human's head on screen.
 */
export function streamerPose(aspect: number, halfW: number, halfD: number, head: Vector3 | readonly Vector3[] | null): CameraPose {
  const extra: Vector3[] = [new Vector3(-halfW * 0.5, 2.4, -halfD), new Vector3(halfW * 0.5, 2.4, -halfD)];
  for (const h of heads(head)) extra.push(h.clone());
  return fitRoomCamera(
    aspect,
    { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD, top: 0.3, bottom: 0 },
    { fovDeg: 44, pitchDeg: 50, margin: 0.08, centerY: 0, extra },
  );
}

/**
 * Room Maker (GDD 6.4): the whole room from a steep 70° pitch, so cells behind tall furniture (the Kitchen back
 * counter, the floor behind the island) stay tappable through `pickCell`. No head framing: nobody is home yet.
 */
export function editorPose(aspect: number, halfW: number, halfD: number): CameraPose {
  return fitRoomCamera(
    aspect,
    { minX: -halfW, maxX: halfW, minZ: -halfD, maxZ: halfD, top: 0.3, bottom: 0 },
    { fovDeg: 44, pitchDeg: EDITOR_PITCH_DEG, margin: 0.06, centerY: 0 },
  );
}
export const EDITOR_PITCH_DEG = 70;

/**
 * Live pose for phone portrait: a PORTRAIT_WINDOW_CELLS-wide window centred on x = 0 over the room's full depth
 * (the human's head kept in, at x = 0 so the pose stays a pure x-translation). The renderer slides it by the
 * cat's (eased, clamped) x: see `portraitShiftLimit`.
 */
export function portraitPose(aspect: number, halfD: number, head: Vector3 | readonly Vector3[] | null): CameraPose {
  const hw = (PORTRAIT_WINDOW_CELLS * CELL_M) / 2;
  const extra: Vector3[] = heads(head).map((h) => new Vector3(0, h.y, h.z));
  return fitRoomCamera(
    aspect,
    { minX: -hw, maxX: hw, minZ: -halfD, maxZ: halfD, top: 0.3, bottom: 0 },
    { fovDeg: 48, pitchDeg: PORTRAIT_PITCH_DEG, margin: 0.02, centerY: PORTRAIT_CENTER_Y, extra },
  );
}

/** The cat keeps at least this much room (m) to the portrait window's edge: 0.75 cells (round 3). */
export const PORTRAIT_CAT_MARGIN = 1 * CELL_M; // review round 1: was 0.75 cells, the cat's tail left the frame
/** A nearby Must-Wreck target keeps this much (m) to the edge when the window can pan to it. */
export const PORTRAIT_TARGET_MARGIN = 0.5 * CELL_M;

/**
 * Portrait window x shift (pure, tested). Centred on the cat and clamped to the room (±lim), but the cat always
 * keeps PORTRAIT_CAT_MARGIN to the window edge (it may show a sliver outside the room at the walls), then pans,
 * while the cat stays in, to include nearby targets (`targetsX`, nearest first is not needed: all that fit).
 */
export function portraitShift(catX: number, lim: number, targetsX: readonly number[] = []): number {
  const hw = (PORTRAIT_WINDOW_CELLS * CELL_M) / 2;
  let lo = catX + PORTRAIT_CAT_MARGIN - hw;
  let hi = catX - PORTRAIT_CAT_MARGIN + hw;
  let want = Math.max(lo, Math.min(hi, Math.max(-lim, Math.min(lim, catX))));
  for (const tx of targetsX) {
    const tlo = Math.max(lo, tx + PORTRAIT_TARGET_MARGIN - hw);
    const thi = Math.min(hi, tx - PORTRAIT_TARGET_MARGIN + hw);
    if (tlo > thi) continue; // cannot keep both: the cat wins
    lo = tlo;
    hi = thi;
    want = Math.max(lo, Math.min(hi, want));
  }
  return want;
}

/** How far (m) the portrait window may slide from the room centre and still stay inside the room. */
export function portraitShiftLimit(halfW: number): number {
  return Math.max(0, halfW - (PORTRAIT_WINDOW_CELLS * CELL_M) / 2);
}

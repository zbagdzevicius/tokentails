/**
 * Clip camera (GDD 7.3, 11.1): a close follow camera with push-ins, used only in the clip pass.
 * - closeUp: the match-cut pose. The cat turns to the camera and its face quad fills FACE_RECT of the
 *   720 × 1280 frame (no camera solve: the rect and the pose are both fixed).
 * - focusProp >= 0: the cat and the target in one frame, slow push-in (`push` 0..1).
 * - focusProp = -1: the cat alone (caught runs: the cuddle).
 * Pure maths, unit-tested against FACE_RECT.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { CLIP_H, CLIP_W, FACE_RECT, type ClipShot } from '../types';
import type { CameraPose } from './camera';
import { CAT_SCALE, FACE_QUAD_W } from './cat-rig';

export const CLIP_FOV = 35;
/** Width of the cat's face quad in metres (cat-rig.ts, after the toy scale). */
export const FACE_W = FACE_QUAD_W * CAT_SCALE;
/** Direction the close-up camera looks from (toward the open, south side, a little to the right and above). */
export const CLOSEUP_DIR = new Vector3(0.22, 0.16, 1).normalize();

/** NDC of the FACE_RECT centre. */
export function faceRectNdc(): { x: number; y: number; wFrac: number } {
  const cx = FACE_RECT.x + FACE_RECT.w / 2;
  const cy = FACE_RECT.y + FACE_RECT.h / 2;
  return { x: (cx / CLIP_W) * 2 - 1, y: 1 - (cy / CLIP_H) * 2, wFrac: FACE_RECT.w / CLIP_W };
}

/** Camera distance at which a face quad of FACE_W fills FACE_RECT's width. */
export function closeUpDistance(aspect = CLIP_W / CLIP_H, fovDeg = CLIP_FOV): number {
  const tanH = Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect;
  return FACE_W / faceRectNdc().wFrac / (2 * tanH);
}

/**
 * Close-up pose for a face centred at `face` (world) looking along CLOSEUP_DIR back at the camera.
 * push 0 = slightly wider (motion in the first second), 1 = exactly FACE_RECT.
 */
export function closeUpPose(face: Vector3, push: number, aspect = CLIP_W / CLIP_H): CameraPose {
  const d = closeUpDistance(aspect) * (1 + 0.14 * (1 - Math.max(0, Math.min(1, push))));
  const position = face.clone().addScaledVector(CLOSEUP_DIR, d);
  // aim below the face so the face lands at the rect's NDC y (the rect sits above centre)
  const tanV = Math.tan(((CLIP_FOV / 2) * Math.PI) / 180);
  const fwd = face.clone().sub(position).normalize();
  const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, fwd).normalize();
  const ndc = faceRectNdc();
  // round 2 (QA): before the match cut the face sits a little lower, so the 0-2 s caption stays off the ears; at the
  // match cut (push 1) it is exactly FACE_RECT
  const lower = OPENER_FACE_DROP * (1 - Math.max(0, Math.min(1, push)));
  const target = face.clone().addScaledVector(up, -(ndc.y - lower) * tanV * d).addScaledVector(right, -ndc.x * tanV * aspect * d);
  return { fov: CLIP_FOV, position, target };
}

/** NDC drop of the face before the match cut (0.12 NDC ≈ 77 px of 1280). */
export const OPENER_FACE_DROP = 0.12;

/** Closest the follow camera may sit to the cat (m): round 2 (QA) had 9 s of the cat's fur filling the frame. */
export const FOLLOW_MIN_CAT_DIST = 1.15;

/**
 * Round 2 (QA): the 0.6 s cut to the human as he turns: his head and shoulders from the room's open side, a little
 * above, the cat's side of the room behind the camera.
 */
export function humanCutPose(head: Vector3, toward: Vector3, aspect = CLIP_W / CLIP_H): CameraPose {
  const dir = toward.clone().sub(head).setY(0);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  dir.normalize().add(new Vector3(0, 0.45, 0)).normalize();
  const d = 1.25 / Math.max(0.5, Math.min(1, aspect * 1.6));
  const target = head.clone().add(new Vector3(0, -0.25, 0));
  return { fov: CLIP_FOV, position: target.clone().addScaledVector(dir, d), target };
}

/** Follow-shot fit box in NDC (round 3: the crash must land well inside the frame, not at its edge). */
export const FOLLOW_FIT_X = 0.55;
export const FOLLOW_FIT_Y = 0.45;
/** Closest the follow camera gets (m): close enough to read the cat, far enough to see the crash land. */
export const FOLLOW_MIN_DIST = 1.6;
/**
 * Farthest the follow camera backs out to bring the human in (m). The cat and the crime always fit; the human only
 * pulls the camera back up to this (review round 1: a wide room shot left the cat at ~4 % of the frame).
 */
export const FOLLOW_MAX_DIST = 2.5;
/** The push-in is a FOV narrowing (6 % at push 1), so the fit points stay in frame. */
export const FOLLOW_PUSH_FOV = 0.06;

/**
 * Two-shot of the cat and the focus prop (or the cat alone). `extra` world points must stay in frame too: the
 * prop's landing point (prop + pushDir × 0.4 m at the landing level) and the human's head when he turns inside
 * the clip window. Everything fits inside ±FOLLOW_FIT_X / ±FOLLOW_FIT_Y NDC at push 0; the push narrows the FOV
 * by FOLLOW_PUSH_FOV (it never moves the camera, so nothing slides out).
 */
export function followPose(
  cat: Vector3,
  prop: Vector3 | null,
  push: number,
  aspect = CLIP_W / CLIP_H,
  extra: readonly Vector3[] = [],
  optional: readonly Vector3[] = [],
): CameraPose {
  const p = Math.max(0, Math.min(1, push));
  const core = prop ? [cat.clone().add(new Vector3(0, 0.25, 0)), cat.clone().add(new Vector3(0, -0.05, 0)), prop.clone().add(new Vector3(0, 0.3, 0)), prop.clone()] : [cat.clone().add(new Vector3(0, 0.3, 0)), cat.clone().add(new Vector3(0, -0.05, 0))];
  for (const e of extra) core.push(e.clone());
  if (optional.length) {
    // the human may pull the camera back only up to FOLLOW_MAX_DIST; past that the cat and the crime win
    const all = fitPose(core, optional, aspect);
    if (all.d <= FOLLOW_MAX_DIST) return { fov: CLIP_FOV * (1 - FOLLOW_PUSH_FOV * p), position: all.position, target: all.target };
    const own = fitPose(core, [], aspect);
    if (own.d >= FOLLOW_MAX_DIST) return { fov: CLIP_FOV * (1 - FOLLOW_PUSH_FOV * p), position: own.position, target: own.target };
    // between: the cat and the crime framed as before, backed out to FOLLOW_MAX_DIST (the human's head may sit at
    // or past the frame edge; his "hm?" and the eye meter still read)
    const dir = new Vector3(0.15, 0.8, 1).normalize();
    return { fov: CLIP_FOV * (1 - FOLLOW_PUSH_FOV * p), position: own.target.clone().addScaledVector(dir, FOLLOW_MAX_DIST), target: own.target };
  }
  const f = fitPose(core, [], aspect);
  return { fov: CLIP_FOV * (1 - FOLLOW_PUSH_FOV * p), position: f.position, target: f.target };
}

/** Direction the follow / crime cameras look from (toward the open south side, above). */
const FOLLOW_DIR = new Vector3(0.15, 0.8, 1).normalize();

/** The closest pose (along the follow direction) that fits every point inside the FOLLOW_FIT box. */
function fitPose(core: readonly Vector3[], extra: readonly Vector3[], aspect: number): { d: number; position: Vector3; target: Vector3 } {
  return fitPoints([...core, ...extra], aspect, FOLLOW_FIT_X, FOLLOW_FIT_Y);
}

/** The closest pose along FOLLOW_DIR whose frame holds every point inside ±fitX / ±fitY NDC (d >= FOLLOW_MIN_DIST). */
function fitPoints(points: readonly Vector3[], aspect: number, fitX: number, fitY: number): { d: number; position: Vector3; target: Vector3 } {
  const pts = points.map((q) => q.clone());
  // aim at the middle of everything that must be seen
  const mid = new Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const q of pts) {
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
    minZ = Math.min(minZ, q.z);
    maxZ = Math.max(maxZ, q.z);
  }
  mid.set((minX + maxX) / 2, (minY + maxY) / 2 + 0.03, (minZ + maxZ) / 2);
  const dir = new Vector3(0.15, 0.8, 1).normalize();
  const cam = new PerspectiveCamera(CLIP_FOV, aspect, 0.01, 50);
  const fits = (d: number) => {
    cam.position.copy(mid).addScaledVector(dir, d);
    cam.lookAt(mid);
    cam.updateMatrixWorld(true);
    for (const q of pts) {
      const v = q.clone().project(cam);
      if (Math.abs(v.x) > fitX || Math.abs(v.y) > fitY || v.z > 1) return false;
    }
    return true;
  };
  let lo = 0.6;
  let hi = 20;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) / 2;
    if (fits(m)) hi = m;
    else lo = m;
  }
  const d = Math.max(FOLLOW_MIN_DIST, hi);
  return { d, position: mid.clone().addScaledVector(dir, d), target: mid };
}

// ------------------------------------------------------------------------------------------------------------
// Round 3 (virality review): the crime has to read. From 2 s to 11 s the camera frames a box around the cat and the
// target, never the whole room; 9–11 s is a 2-shot of the falling object and the human.
// ------------------------------------------------------------------------------------------------------------

/** Widest the cat-plus-target box gets (m): a cat farther than this from the target is pulled in toward it. */
export const CRIME_BOX_W = 1.6;
/** Visual height of a target used for framing (m): the core points are the prop's base and this far above it. */
export const TARGET_VIS_H = 0.3;
/** Farthest the crime-box camera sits from its aim point (m): a TARGET_VIS_H target stays >= 25 % of frame height. */
export const CRIME_MAX_DIST = 2.6;
/** Crime-box fit (NDC): wider than the follow fit, so a cat right next to the target keeps the shot tight. */
export const CRIME_FIT_X = 0.75;
export const CRIME_FIT_Y = 0.6;
/** How far (m) the aim may sit from the target's centre when the camera is at CRIME_MAX_DIST (target stays framed). */
const CRIME_AIM_SLACK = 0.28;

/** The cat point pulled toward the prop so the two never sit more than CRIME_BOX_W apart (horizontally). */
export function crimeBoxCat(cat: Vector3, prop: Vector3): Vector3 {
  const off = cat.clone().sub(prop);
  const flat = new Vector3(off.x, 0, off.z);
  const max = CRIME_BOX_W - 0.2;
  if (flat.length() > max) flat.setLength(max);
  return new Vector3(prop.x + flat.x, cat.y, prop.z + flat.z);
}

/**
 * Locked crime-box pose: the target (base and TARGET_VIS_H above), the cat (pulled within CRIME_BOX_W) and `extra`
 * points (the landing spot) fit inside ±CRIME_FIT; the distance is capped at CRIME_MAX_DIST, and when the cap bites
 * the aim slides toward the target, so the target always wins over a far-away cat.
 */
export function crimePose(cat: Vector3, prop: Vector3, push: number, aspect = CLIP_W / CLIP_H, extra: readonly Vector3[] = []): CameraPose {
  const p = Math.max(0, Math.min(1, push));
  const c = crimeBoxCat(cat, prop);
  const tgt = prop.clone().add(new Vector3(0, TARGET_VIS_H / 2, 0));
  const pts = [prop.clone(), prop.clone().add(new Vector3(0, TARGET_VIS_H, 0)), c.clone().add(new Vector3(0, 0.25, 0)), c.clone().add(new Vector3(0, -0.05, 0))];
  for (const e of extra) if (e.distanceTo(prop) <= CRIME_BOX_W) pts.push(e.clone());
  const f = fitPoints(pts, aspect, CRIME_FIT_X, CRIME_FIT_Y);
  const fov = CLIP_FOV * (1 - FOLLOW_PUSH_FOV * p);
  if (f.d <= CRIME_MAX_DIST) {
    const d = Math.max(FOLLOW_MIN_DIST, f.d);
    return { fov, position: f.target.clone().addScaledVector(FOLLOW_DIR, d), target: f.target };
  }
  const off = f.target.clone().sub(tgt);
  if (off.length() > CRIME_AIM_SLACK) off.setLength(CRIME_AIM_SLACK);
  const aim = tgt.clone().add(off);
  return { fov, position: aim.clone().addScaledVector(FOLLOW_DIR, CRIME_MAX_DIST), target: aim };
}

/** 9–11 s: the falling object and the human's head and shoulders in one frame (his double-take). */
export function twoShotPose(prop: Vector3, head: Vector3, aspect = CLIP_W / CLIP_H): CameraPose {
  const pts = [prop.clone(), prop.clone().add(new Vector3(0, TARGET_VIS_H, 0)), head.clone().add(new Vector3(0, 0.12, 0)), head.clone().add(new Vector3(0, -0.35, 0))];
  const f = fitPoints(pts, aspect, FOLLOW_FIT_X, FOLLOW_FIT_Y);
  const d = Math.max(FOLLOW_MIN_DIST, f.d);
  return { fov: CLIP_FOV, position: f.target.clone().addScaledVector(FOLLOW_DIR, d), target: f.target };
}

/** Screen-space box of an axis-aligned world box seen from `pose`: width and height as fractions of the frame. */
export function screenBox(pose: CameraPose, min: Vector3, max: Vector3, aspect = CLIP_W / CLIP_H): { w: number; h: number } {
  const cam = new PerspectiveCamera(pose.fov, aspect, 0.01, 50);
  cam.position.copy(pose.position);
  cam.lookAt(pose.target);
  cam.updateMatrixWorld(true);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const v = new Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).project(cam);
    if (v.z > 1) return { w: 0, h: 0 };
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const c = (a: number) => Math.max(-1, Math.min(1, a));
  return { w: (c(x1) - c(x0)) / 2, h: (c(y1) - c(y0)) / 2 };
}

/** Screen-space box of an axis-aligned world box as a fraction of the frame area (0..1). */
export function screenAreaFrac(pose: CameraPose, min: Vector3, max: Vector3, aspect = CLIP_W / CLIP_H): number {
  const b = screenBox(pose, min, max, aspect);
  return b.w * b.h;
}

/** Grid view for the occlusion test (SimState.grid has these fields). */
export interface OcclusionGrid {
  w: number;
  d: number;
  level: ArrayLike<number>;
  occludes: ArrayLike<number>;
}

/**
 * Round 3 (virality): true when the segment from the camera to `subject` passes through a cell with occludes = 1
 * below that cell's surface (tall furniture between the lens and the cat). The subject's own cell and the cells
 * next to it are skipped (the cat stands on or beside furniture all the time).
 */
export function cellOccluded(from: Vector3, subject: Vector3, g: OcclusionGrid, cellM: number, surface: (level: number) => number): boolean {
  const toCell = (wx: number, wz: number): [number, number] => [Math.floor(wx / cellM + g.w / 2), Math.floor(wz / cellM + g.d / 2)];
  const [sx, sz] = toCell(subject.x, subject.z);
  const len = from.distanceTo(subject);
  const steps = Math.max(2, Math.ceil(len / (cellM * 0.25)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = from.clone().lerp(subject, t);
    const [x, z] = toCell(p.x, p.z);
    if (x < 0 || z < 0 || x >= g.w || z >= g.d) continue;
    if (Math.abs(x - sx) <= 1 && Math.abs(z - sz) <= 1) continue;
    const k = z * g.w + x;
    if (g.occludes[k] && p.y < surface(g.level[k] ?? 0)) return true;
  }
  return false;
}

/**
 * A pose with a clear (cell) line of sight to `subject`: the pose itself when clear, else the first of a few
 * orbits around the aim point (yaw, then higher) that is clear, else null (the caller falls back to its mesh test).
 */
export function unoccludedPose(pose: CameraPose, subject: Vector3, g: OcclusionGrid, cellM: number, surface: (level: number) => number): CameraPose | null {
  if (!cellOccluded(pose.position, subject, g, cellM, surface)) return pose;
  const off = pose.position.clone().sub(pose.target);
  const dist = off.length();
  const tries: [number, number][] = [[0.45, 0], [-0.45, 0], [0, 0.35], [0.8, 0.2], [-0.8, 0.2], [0, 0.7]];
  for (const [yaw, lift] of tries) {
    const o = off.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw);
    o.y += lift * dist;
    o.setLength(dist);
    const position = pose.target.clone().add(o);
    if (!cellOccluded(position, subject, g, cellM, surface)) return { ...pose, position };
  }
  return null;
}

/** `aspect`: the clip's output aspect (720 × 1280 by default; the IRL-vs-game split is 720 × 640). */
/** `optional` points (the turning human's head) may pull the camera back only up to FOLLOW_MAX_DIST. */
export function clipPose(
  shot: ClipShot,
  catFace: Vector3,
  catBody: Vector3,
  prop: Vector3 | null,
  extra: readonly Vector3[] = [],
  aspect = CLIP_W / CLIP_H,
  optional: readonly Vector3[] = [],
): CameraPose {
  if (shot.closeUp) return closeUpPose(catFace, shot.push, aspect);
  if (shot.crimeBox && prop) return crimePose(catBody, prop, shot.push, aspect, extra);
  return followPose(catBody, shot.focusProp >= 0 ? prop : null, shot.push, aspect, extra, optional);
}

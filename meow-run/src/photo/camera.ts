// PHOTO lane: the photo-mode orbit camera (camera override while the photo screen is open).
// Frame dt is 0 while paused, so it keeps its own clock (performance.now). Controls: drag = orbit, wheel / pinch =
// distance, right mouse / two fingers / WASD (+Q/E) = pan the target, arrows = orbit, roll from the CAMERA tab.
// The camera never ends up inside a prop or an actor (a ray from Mochi to the camera against the small meshes around
// her pulls it in front of the first hit), and Mochi is framed in the part of the screen the controls leave free.
import * as THREE from 'three';
import { setCameraOverride } from '../core/camera';
import { camera, scene } from '../core/engine';
import { kittenRig, P } from '../core/player';
import { game, prefs } from '../core/state';
import { newFrame } from '../core/track';
import {
  clampDist,
  clampPan,
  clampPitch,
  clampRoll,
  DEG,
  GROUND_CLEAR,
  lerpOrbit,
  newOrbit,
  orbitOffset,
  PRESETS,
  TARGET_UP,
  wrapYaw,
  type PresetId,
} from './orbit';

export const orbit = newOrbit();
let goal: { yaw: number; pitch: number; dist: number } | null = null;
let last = 0;
let active = false;
const held = new Set<string>();

const tgt = new THREE.Vector3();
const off = new THREE.Vector3();
const pos = new THREE.Vector3();
const d = new THREE.Vector3();
const surf = new THREE.Vector3();
const camR = new THREE.Vector3();
const camU = new THREE.Vector3();
const camF = new THREE.Vector3();
const fa = newFrame();
const fb = newFrame();
const FOV_LAND = 50;
const FOV_PORTRAIT = 64;
const DEG2 = Math.PI / 180;

// ---------------------------------------------------------------- framing: where Mochi sits on screen (NDC)
let fnx = 0;
let fny = 0;
/** put the orbit target at (nx, ny) in NDC instead of the screen centre (the free area beside the controls) */
export function setFraming(nx: number, ny: number): void {
  fnx = Number.isFinite(nx) ? Math.max(-0.7, Math.min(0.7, nx)) : 0;
  fny = Number.isFinite(ny) ? Math.max(-0.7, Math.min(0.7, ny)) : 0;
}
const lookAt = new THREE.Vector3();
const flatR = new THREE.Vector3();

// ---------------------------------------------------------------- collision: the small meshes around Mochi
const boxes: THREE.Box3[] = [];
const ray = new THREE.Ray();
const hit = new THREE.Vector3();
const bsize = new THREE.Vector3();
/** clearance kept in front of a hit, and the closest the camera is pulled in */
const CAM_PAD = 0.3;
const CAM_MIN = 1.2;
function isUnder(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
/** snapshot the world boxes of the props and actors (the run is paused, so they do not move) */
function collectBoxes(): void {
  boxes.length = 0;
  const rig = kittenRig()?.root ?? null;
  scene.updateMatrixWorld();
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || !m.geometry) return;
    if (rig && isUnder(m, rig)) return;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (!Array.isArray(mat) && mat && mat.transparent && mat.opacity < 0.5) return;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox) return;
    const b = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
    b.getSize(bsize);
    const big = Math.max(bsize.x, bsize.y, bsize.z);
    // the terrain, the path ribbon and the sky are huge; specks do not matter
    if (big > 9 || big < 0.25 || boxes.length > 1500) return;
    boxes.push(b.expandByScalar(0.12));
  });
}
/** the camera position pulled in front of the first prop between the target and it */
function avoidProps(target: THREE.Vector3, p: THREE.Vector3): void {
  if (!boxes.length) return;
  const len = d.subVectors(p, target).length();
  if (len < CAM_MIN) return;
  ray.origin.copy(target);
  ray.direction.copy(d).multiplyScalar(1 / len);
  let best = len;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.containsPoint(target)) continue;
    if (!ray.intersectBox(b, hit)) continue;
    const t = hit.distanceTo(target);
    if (t < best) best = t;
  }
  if (best < len) p.copy(target).addScaledVector(ray.direction, Math.max(CAM_MIN, best - CAM_PAD));
}

/** keep the camera GROUND_CLEAR above the track surface under it */
function groundClamp(p: THREE.Vector3): void {
  const track = game.track;
  if (!track || track.length < 2) return;
  track.sample(P.s, fa);
  const s1 = P.s + d.subVectors(p, fa.pos).dot(fa.fwd);
  track.sample(s1, fb);
  const x1 = d.subVectors(p, fb.pos).dot(fb.right);
  track.toWorld(s1, x1, 0, surf);
  const h = d.subVectors(p, surf).dot(fb.up);
  if (h < GROUND_CLEAR) p.addScaledVector(fb.up, GROUND_CLEAR - h);
}

function step(cam: THREE.PerspectiveCamera): void {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  // keyboard: arrows orbit, WASD pan (camera-relative, flat), Q/E down/up, Z/X zoom
  if (held.size) {
    const k = dt;
    if (held.has('ArrowLeft')) orbit.yaw = wrapYaw(orbit.yaw - 1.6 * k);
    if (held.has('ArrowRight')) orbit.yaw = wrapYaw(orbit.yaw + 1.6 * k);
    if (held.has('ArrowUp')) orbit.pitch = clampPitch(orbit.pitch + 1.1 * k);
    if (held.has('ArrowDown')) orbit.pitch = clampPitch(orbit.pitch - 1.1 * k);
    if (held.has('KeyZ')) orbit.dist = clampDist(orbit.dist * Math.exp(-1.4 * k));
    if (held.has('KeyX')) orbit.dist = clampDist(orbit.dist * Math.exp(1.4 * k));
    cam.getWorldDirection(camF);
    camF.y = 0;
    if (camF.lengthSq() < 1e-6) camF.set(0, 0, 1);
    camF.normalize();
    camR.set(-camF.z, 0, camF.x); // camera right on the ground plane
    const v = 3.2 * k * Math.max(0.6, orbit.dist / 4.2);
    if (held.has('KeyW')) orbit.pan.addScaledVector(camF, v);
    if (held.has('KeyS')) orbit.pan.addScaledVector(camF, -v);
    if (held.has('KeyD')) orbit.pan.addScaledVector(camR, v);
    if (held.has('KeyA')) orbit.pan.addScaledVector(camR, -v);
    if (held.has('KeyE')) orbit.pan.y += v;
    if (held.has('KeyQ')) orbit.pan.y -= v;
    clampPan(orbit.pan);
    if (held.size) goal = null;
  }
  if (goal) {
    lerpOrbit(orbit, goal, prefs.reducedMotion ? 1 : 1 - Math.exp(-9 * dt));
    if (Math.abs(wrapYaw(goal.yaw - orbit.yaw)) < 0.002 && Math.abs(goal.pitch - orbit.pitch) < 0.002 && Math.abs(goal.dist - orbit.dist) < 0.005) goal = null;
  }
  tgt.copy(P.world.pos).addScaledVector(P.world.up, TARGET_UP).add(orbit.pan);
  orbitOffset(orbit, P.world.fwd, off);
  pos.copy(tgt).add(off);
  avoidProps(tgt, pos);
  groundClamp(pos);
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  const fov = cam.aspect < 1 ? FOV_PORTRAIT : FOV_LAND;
  if (Math.abs(cam.fov - fov) > 0.01) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  // frame Mochi at (fnx, fny): look the other way by that much of the view
  lookAt.copy(tgt);
  if (fnx || fny) {
    const tanV = Math.tan((cam.fov * DEG2) / 2);
    const tanH = tanV * cam.aspect;
    const D = cam.position.distanceTo(tgt);
    d.subVectors(tgt, cam.position);
    d.y = 0;
    if (d.lengthSq() > 1e-8) {
      d.normalize();
      flatR.set(-d.z, 0, d.x);
      lookAt.addScaledVector(flatR, -fnx * tanH * D);
    }
    lookAt.y -= fny * tanV * D;
  }
  cam.lookAt(lookAt);
  if (orbit.roll) cam.rotateZ(orbit.roll);
}

function onKey(e: KeyboardEvent): void {
  if (!active) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  if (/^(Arrow(Left|Right|Up|Down)|Key[WASDQEZX])$/.test(e.code)) {
    if (e.type === 'keydown') held.add(e.code);
    else held.delete(e.code);
    e.preventDefault();
  }
}
const clearHeld = () => held.clear();

/** take the camera (photo screen open): starts at the hero view (3/4 front of Mochi's face) */
export function startCamera(): void {
  if (active) return;
  active = true;
  collectBoxes();
  resetView();
  goal = null;
  last = performance.now();
  held.clear();
  setCameraOverride(step);
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  addEventListener('blur', clearHeld);
}
/** give the camera back to the game */
export function stopCamera(): void {
  if (!active) return;
  active = false;
  held.clear();
  goal = null;
  setCameraOverride(null);
  boxes.length = 0;
  removeEventListener('keydown', onKey);
  removeEventListener('keyup', onKey);
  removeEventListener('blur', clearHeld);
}

export function resetView(): void {
  const h = PRESETS.hero;
  orbit.yaw = h.yaw;
  orbit.pitch = h.pitch;
  orbit.dist = h.dist;
  orbit.roll = 0;
  orbit.pan.set(0, 0, 0);
}
/** ease to a named view (instant with calm mode) and recentre on Mochi */
export function goPreset(id: PresetId): void {
  goal = { ...PRESETS[id] };
  orbit.pan.set(0, 0, 0);
  orbit.roll = 0;
}

/** relative moves (radians, units): drag, wheel, test hooks */
export function orbitBy(dYaw: number, dPitch: number, dDistMul = 1): void {
  goal = null;
  orbit.yaw = wrapYaw(orbit.yaw + dYaw);
  orbit.pitch = clampPitch(orbit.pitch + dPitch);
  orbit.dist = clampDist(orbit.dist * dDistMul);
}
export function setDist(v: number): void {
  goal = null;
  orbit.dist = clampDist(v);
}
export function setRoll(rad: number): void {
  orbit.roll = clampRoll(rad);
}
/** pan in screen space: dx, dy in css px of drag */
export function panScreen(dx: number, dy: number): void {
  goal = null;
  camera.updateMatrixWorld();
  camR.setFromMatrixColumn(camera.matrixWorld, 0);
  camU.setFromMatrixColumn(camera.matrixWorld, 1);
  const k = (orbit.dist * 1.1) / Math.max(320, Math.min(innerWidth, innerHeight));
  orbit.pan.addScaledVector(camR, -dx * k).addScaledVector(camU, dy * k);
  clampPan(orbit.pan);
}

// ---------------------------------------------------------------- pointer gestures on the photo layer
interface Ptr {
  x: number;
  y: number;
  button: number;
}
const ptrs = new Map<number, Ptr>();
let pinchD = 0;
let pinchX = 0;
let pinchY = 0;

function pair(): [Ptr, Ptr] | null {
  if (ptrs.size < 2) return null;
  const it = ptrs.values();
  return [it.next().value as Ptr, it.next().value as Ptr];
}
function startPinch(): void {
  const p = pair();
  if (!p) return;
  pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  pinchX = (p[0].x + p[1].x) / 2;
  pinchY = (p[0].y + p[1].y) / 2;
}

/** wire orbit / pan / zoom gestures to a full-screen element; returns an unbind */
export function bindGestures(el: HTMLElement, onTap?: () => void): () => void {
  let moved = 0;
  const down = (e: PointerEvent) => {
    if (ptrs.size >= 2) return;
    el.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
    moved = 0;
    if (ptrs.size === 2) startPinch();
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size >= 2) {
      const q = pair();
      if (!q) return;
      const nd = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
      const cx = (q[0].x + q[1].x) / 2;
      const cy = (q[0].y + q[1].y) / 2;
      if (pinchD > 10 && nd > 10) setDist(orbit.dist * (pinchD / nd));
      panScreen(cx - pinchX, cy - pinchY);
      pinchD = nd;
      pinchX = cx;
      pinchY = cy;
      return;
    }
    if (p.button === 2 || p.button === 1 || e.shiftKey) panScreen(dx, dy);
    else {
      // by fraction of the screen, not pixels: a swipe across a third of the screen turns about 70 degrees in both
      // orientations (a landscape phone used to turn twice as far and land inside things)
      const kx = (1.15 * Math.PI) / Math.max(360, Math.min(1000, innerWidth));
      const ky = Math.PI / Math.max(360, Math.min(1000, innerHeight));
      orbitBy(dx * kx, dy * ky);
    }
  };
  const up = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 1) {
      // the remaining finger continues as an orbit from where it is
      pinchD = 0;
    }
    if (!ptrs.size && moved < 6 && e.type === 'pointerup') onTap?.();
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 0.05 : 0.0016;
    if (e.ctrlKey) setDist(orbit.dist * Math.exp(e.deltaY * k * 2.5)); // trackpad pinch
    else setDist(orbit.dist * Math.exp(e.deltaY * k));
  };
  const menu = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', menu);
  return () => {
    ptrs.clear();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', menu);
  };
}

/** test-hook view of the orbit (degrees) */
export const orbitState = () => ({ yaw: orbit.yaw / DEG, pitch: orbit.pitch / DEG, dist: orbit.dist, roll: orbit.roll / DEG });

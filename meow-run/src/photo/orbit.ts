// PHOTO lane: orbit camera maths. PURE (three maths only, node-importable).
// Yaw 0 = in front of Mochi looking at her face (she faces `fwd`), +yaw swings towards her right. Pitch is measured
// from the horizontal plane. The pan offset moves the look target, at most PAN_MAX from Mochi.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const PITCH_MIN = -10 * DEG;
export const PITCH_MAX = 75 * DEG;
export const DIST_MIN = 1.6;
export const DIST_MAX = 14;
export const PAN_MAX = 6;
export const ROLL_MAX = 25 * DEG;
/** the orbit target sits this far above Mochi's feet */
export const TARGET_UP = 0.55;
/** keep the camera this far above the track surface under it */
export const GROUND_CLEAR = 0.3;

export interface Orbit {
  yaw: number;
  pitch: number;
  dist: number;
  roll: number;
  /** pan offset of the target (world units) */
  pan: THREE.Vector3;
}

export const clampPitch = (p: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Number.isFinite(p) ? p : 0));
export const clampDist = (d: number) => Math.max(DIST_MIN, Math.min(DIST_MAX, Number.isFinite(d) ? d : 4.2));
export const clampRoll = (r: number) => Math.max(-ROLL_MAX, Math.min(ROLL_MAX, Number.isFinite(r) ? r : 0));
/** wrap to -PI..PI */
export function wrapYaw(y: number): number {
  if (!Number.isFinite(y)) return 0;
  const t = (y + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}
export function clampPan(v: THREE.Vector3): THREE.Vector3 {
  const l = v.length();
  if (l > PAN_MAX) v.multiplyScalar(PAN_MAX / l);
  return v;
}

/** named starting views (the CAMERA tab presets) */
export const PRESETS = {
  /** 3/4 front of Mochi's face */
  hero: { yaw: 35 * DEG, pitch: 12 * DEG, dist: 4.2 },
  front: { yaw: 0, pitch: 6 * DEG, dist: 3.4 },
  side: { yaw: 90 * DEG, pitch: 8 * DEG, dist: 4.6 },
  low: { yaw: 22 * DEG, pitch: -8 * DEG, dist: 3 },
  top: { yaw: 20 * DEG, pitch: 70 * DEG, dist: 6.5 },
  wide: { yaw: 150 * DEG, pitch: 18 * DEG, dist: 11 },
} as const;
export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function newOrbit(): Orbit {
  return { ...PRESETS.hero, roll: 0, pan: new THREE.Vector3() };
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

/**
 * Flat basis from Mochi's facing: fwd projected on the horizontal plane (world y up), right = fwd x up.
 * Writes into outF / outR; falls back to +z when she faces straight up or down.
 */
export function flatBasis(fwd: THREE.Vector3, outF: THREE.Vector3, outR: THREE.Vector3): void {
  outF.set(fwd.x, 0, fwd.z);
  if (outF.lengthSq() < 1e-6) outF.set(0, 0, 1);
  outF.normalize();
  // right = fwd x up: a +z runner's right is world -x (LANES.md coordinates)
  outR.set(-outF.z, 0, outF.x);
}

/** camera offset from the target for an orbit (world units, y up). Allocation-free. */
export function orbitOffset(o: Pick<Orbit, 'yaw' | 'pitch' | 'dist'>, fwd: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  flatBasis(fwd, _f, _r);
  const cp = Math.cos(o.pitch);
  const h = o.dist * cp;
  out.set(0, 0, 0)
    .addScaledVector(_f, Math.cos(o.yaw) * h)
    .addScaledVector(_r, Math.sin(o.yaw) * h);
  out.y += o.dist * Math.sin(o.pitch);
  return out;
}

/** ease one orbit towards another (preset transitions); k = 0..1 per call */
export function lerpOrbit(o: Orbit, to: { yaw: number; pitch: number; dist: number }, k: number): void {
  const dy = wrapYaw(to.yaw - o.yaw);
  o.yaw = wrapYaw(o.yaw + dy * k);
  o.pitch += (to.pitch - o.pitch) * k;
  o.dist += (to.dist - o.dist) * k;
}

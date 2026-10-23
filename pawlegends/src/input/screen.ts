/** Screen ↔ ground helpers for the input layer (render-side maths; results become integer mm at the command). */
import * as THREE from 'three';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Ground point (metres, three.js X/Z) under a client pixel, or null when the ray misses the ground. */
export function groundAt(camera: THREE.Camera, canvas: HTMLElement, cx: number, cy: number, out = new THREE.Vector3()): THREE.Vector3 | null {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  if (!_ray.ray.intersectPlane(_plane, _hit)) return null;
  return out.copy(_hit);
}

/** Client pixel of a world point; `on` is false behind the camera. */
export function project(camera: THREE.Camera, canvas: HTMLElement, x: number, y: number, z: number): { x: number; y: number; on: boolean } {
  const r = canvas.getBoundingClientRect();
  _v.set(x, y, z).project(camera);
  return { x: r.left + (_v.x * 0.5 + 0.5) * r.width, y: r.top + (-_v.y * 0.5 + 0.5) * r.height, on: _v.z < 1 && _v.z > -1 };
}

/** metres (three.js) → sim mm. */
export const toSimX = (X: number): number => Math.round(X * 1000);
export const toSimY = (Z: number): number => Math.round(-Z * 1000);

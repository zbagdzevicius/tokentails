// The city instance and destruction helpers every lane uses. FROZEN.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { City, FLOOR, type Building } from '../world/city';
import { St } from './bodies';
import { scene } from './engine';
import { events } from './events';
import { burst } from './fx';
import { segValueMul } from './scoring';
import { C, G, touched, W } from './state';

export { FLOOR, type Building };
export const city = new City(scene);

const v1 = new THREE.Vector3();

// segments landing make dust
city.segs.onLand = (i, speed) => {
  if (Math.random() < 0.5) {
    const p = i * 3;
    burst(city.segs.pos[p], 1, city.segs.pos[p + 2], speed > 30 ? 3 : 1);
  }
  if (speed > 25 && Math.random() < 0.3) A.crash(0.6);
};

/** Horizontal distance from a point to a building footprint. */
export function distB(b: Building, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - b.x) - b.hx);
  const dz = Math.max(0, Math.abs(z - b.z) - b.hz);
  return Math.hypot(dx, dz);
}

/** $ per segment multiplier for building bi right now. */
export function valMul(bi: number): number {
  return segValueMul(G.elapsed, bi === W.bi);
}

/** Count a building as wrecked the first time it loses a floor. */
export function markTouched(bi: number): void {
  if (touched.has(bi)) return;
  touched.add(bi);
  G.buildings++;
  events.emit('buildingWrecked', { index: bi, total: G.buildings });
}

export type Push = (sx: number, sy: number, sz: number, out: THREE.Vector3) => void;

/**
 * Smash segments of every building within r of (x,z) whose centre height sits in [y0, y1]. Each gets velocity from
 * `push(segX, segY, segZ, out)`; everything above loses support. Returns raw $ millions (pass it to score()).
 */
export function smash(x: number, z: number, r: number, y0: number, y1: number, push: Push): number {
  let m = 0;
  const segs = city.segs;
  for (let bi = 0; bi < city.buildings.length; bi++) {
    const b = city.buildings[bi];
    if (distB(b, x, z) > r) continue;
    let low = -1;
    let n = 0;
    for (let k = 0; k < b.count; k++) {
      const i = b.first + k;
      if (segs.state[i] !== St.Static) continue;
      const cy = FLOOR * (k + 0.5);
      if (cy < y0 || cy > y1) continue;
      if (low < 0) low = k;
      push(segs.pos[i * 3], cy, segs.pos[i * 3 + 2], v1);
      segs.launch(i, v1.x, v1.y, v1.z, 5);
      n++;
    }
    if (low < 0) continue;
    // everything above the hit band falls with a weak shove
    for (let k = low; k < b.count; k++) {
      const i = b.first + k;
      if (segs.state[i] === St.Static) {
        push(segs.pos[i * 3], FLOOR * (k + 0.5), segs.pos[i * 3 + 2], v1);
        n += city.knock(i, v1.x * 0.3, 4, v1.z * 0.3);
        break;
      }
    }
    m += n * b.value * valMul(bi);
    markTouched(bi);
    burst(Math.max(b.x - b.hx, Math.min(b.x + b.hx, x)), y0 + 4, Math.max(b.z - b.hz, Math.min(b.z + b.hz, z)), 3, 0xd6d0c6);
  }
  if (m > 0) A.crash(Math.min(2.5, m));
  return m;
}

/** Radial push helper for smash(): away from (x,z) at `out` speed with `up` lift. */
export function radial(x: number, z: number, out: number, up: number, upRand = 0): Push {
  return (sx, _sy, sz, o) => {
    const dx = sx - x;
    const dz = sz - z;
    const d = Math.hypot(dx, dz) || 1;
    o.set((dx / d) * out, up + Math.random() * upRand, (dz / d) * out);
  };
}

export function staticSegs(b: Building): number {
  let n = 0;
  for (let k = 0; k < b.count; k++) if (city.segs.state[b.first + k] === St.Static) n++;
  return n;
}

export function destroyedPct(): number {
  let gone = 0;
  for (let i = 0; i < city.segs.n; i++) if (city.segs.state[i] !== St.Static) gone++;
  return city.totalSegs ? (gone / city.totalSegs) * 100 : 0;
}

/** A random inner street intersection, at least 160 from `farFrom` when possible. Allocates: not for hot loops. */
export function randomIntersection(farFrom?: THREE.Vector3): THREE.Vector3 {
  const n = city.n;
  for (let t = 0; t < 30; t++) {
    const p = new THREE.Vector3(city.streetAt(1 + Math.floor(Math.random() * (n - 1))), 0, city.streetAt(1 + Math.floor(Math.random() * (n - 1))));
    if (!farFrom || p.distanceTo(farFrom) > 160) return p;
  }
  return new THREE.Vector3(city.streetAt(2), 0, city.streetAt(2));
}

/** Distance from the cat on the ground plane. */
export const distCat = (x: number, z: number) => Math.hypot(x - C.pos.x, z - C.pos.z);

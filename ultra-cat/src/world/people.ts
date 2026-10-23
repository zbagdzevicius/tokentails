// Tiny screaming citizens that flee the cat. FROZEN core world file.
import * as THREE from 'three';
import * as A from '../audio/sfx';
import { scene } from '../core/engine';
import { C, CAPS, game } from '../core/state';
import { city } from '../core/world';

const MAXP = CAPS.people;
export const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.8, 1.6, 2, 6), new THREE.MeshStandardMaterial({ roughness: 1 }), MAXP);
people.frustumCulled = false;
scene.add(people);
const pPos = new Float32Array(MAXP * 3);
const pVel = new Float32Array(MAXP * 3);
const pPhase = new Float32Array(MAXP);
let count: number = MAXP;
const col = new THREE.Color();
const m = new THREE.Matrix4();
const tiltM = new THREE.Matrix4().makeRotationX(0.35);

export function placePeople(): void {
  count = Math.min(MAXP, game.level.people);
  people.count = count;
  const N = city.n;
  const HALF = city.half;
  const STREET = city.street;
  col.set(0);
  for (let i = 0; i < count; i++) {
    const street = Math.floor(Math.random() * (N + 1));
    const along = (Math.random() - 0.5) * 2 * HALF;
    const off = (Math.random() < 0.5 ? -1 : 1) * (STREET / 2 - 2 - Math.random() * 4);
    const vertical = Math.random() < 0.5;
    const s = city.streetAt(street) + off;
    pPos[i * 3] = vertical ? s : along;
    pPos[i * 3 + 1] = 0;
    pPos[i * 3 + 2] = vertical ? along : s;
    pVel.fill(0, i * 3, i * 3 + 3);
    pPhase[i] = Math.random() * 10;
    people.setColorAt(i, col.setHSL(Math.random(), 0.6, 0.45 + Math.random() * 0.2));
  }
  if (people.instanceColor) people.instanceColor.needsUpdate = true;
}

/** Make everyone within r of (x,z) hop with vertical speed vy (+ random up to vyRand). */
export function startlePeople(x: number, z: number, r: number, vy: number, vyRand = 0): void {
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    if (Math.hypot(pPos[p] - x, pPos[p + 2] - z) < r && pPos[p + 1] < 1) pVel[p + 1] = vy + Math.random() * vyRand;
  }
}

let screamT = 0;
export function updatePeople(dt: number, t: number): void {
  let scared = 0;
  const BLOCK = city.block;
  const HALF = city.half;
  const lot = (BLOCK - city.street) / 2;
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const dx = pPos[p] - C.pos.x;
    const dz = pPos[p + 2] - C.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let vx = pVel[p];
    let vz = pVel[p + 2];
    if (d < 120) {
      scared++;
      const sp = 13;
      vx += ((dx / d) * sp - vx) * dt * 3;
      vz += ((dz / d) * sp - vz) * dt * 3;
    } else {
      vx *= 1 - dt;
      vz *= 1 - dt;
    }
    pPos[p] += vx * dt;
    pPos[p + 2] += vz * dt;
    pVel[p + 1] -= 50 * dt;
    pPos[p + 1] = Math.max(0, pPos[p + 1] + pVel[p + 1] * dt);
    if (pPos[p + 1] === 0) pVel[p + 1] = 0;
    // stay on the streets: shove out of block interiors
    const lx = ((((pPos[p] + HALF) % BLOCK) + BLOCK) % BLOCK) - BLOCK / 2;
    const lz = ((((pPos[p + 2] + HALF) % BLOCK) + BLOCK) % BLOCK) - BLOCK / 2;
    if (Math.abs(lx) < lot && Math.abs(lz) < lot) {
      if (lot - Math.abs(lx) < lot - Math.abs(lz)) pPos[p] += Math.sign(lx) * lot - lx;
      else pPos[p + 2] += Math.sign(lz) * lot - lz;
    }
    const lim = HALF - 2;
    pPos[p] = Math.max(-lim, Math.min(lim, pPos[p]));
    pPos[p + 2] = Math.max(-lim, Math.min(lim, pPos[p + 2]));
    pVel[p] = vx;
    pVel[p + 2] = vz;
    const running = Math.hypot(vx, vz) > 3;
    const bob = running ? Math.abs(Math.sin(t * 14 + pPhase[i])) * 0.8 : 0;
    m.makeRotationY(Math.atan2(vx, vz));
    if (running) m.multiply(tiltM);
    m.setPosition(pPos[p], pPos[p + 1] + 1.6 + bob, pPos[p + 2]);
    people.setMatrixAt(i, m);
  }
  people.instanceMatrix.needsUpdate = true;
  screamT -= dt;
  if (scared > 10 && screamT < 0 && game.mode === 'play') {
    A.scream();
    screamT = 0.4 + Math.random() * 1.2;
  }
}

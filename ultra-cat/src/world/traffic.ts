// Street traffic (taxis to punt). FROZEN core world file. Colours come from the city theme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as A from '../audio/sfx';
import { BodySet, St } from '../core/bodies';
import { scene } from '../core/engine';
import { burst } from '../core/fx';
import { score } from '../core/score';
import { C, CAPS, G, game } from '../core/state';
import { city } from '../core/world';

// taxis: body + cabin + roof sign, vertex coloured so the instance colour only tints the body
function taxiGeo(): THREE.BufferGeometry {
  const part = (w: number, h: number, l: number, y: number, z: number, c: number) => {
    const g = new THREE.BoxGeometry(w, h, l).translate(0, y, z);
    const col = new THREE.Color(c);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  return mergeGeometries([part(3.4, 1.8, 7.4, 0.4, 0, 0xffffff), part(3.0, 1.4, 3.8, 2.0, -0.3, 0x30343a), part(1.4, 0.6, 0.6, 3.0, -0.3, 0xffffff)]);
}

export const cars = new BodySet(taxiGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), CAPS.cars);
scene.add(cars.mesh);
const carAxis = new Uint8Array(CAPS.cars);
const carDir = new Int8Array(CAPS.cars);
const carSpeed = new Float32Array(CAPS.cars);
const carLane = new Float32Array(CAPS.cars);
const col = new THREE.Color();
const v2 = new THREE.Vector3();

cars.onLand = (i, speed) => {
  if (speed > 18) {
    A.crash(0.4);
    burst(cars.pos[i * 3], 1, cars.pos[i * 3 + 2], 2, 0xdddddd);
  }
};

/** Launch car i if it is still on the road or resting. Counts a punted taxi (and scores) the first time. */
export function launchCar(i: number, vx: number, vy: number, vz: number): boolean {
  const s = cars.state[i];
  if (s !== St.Kinematic && s !== St.Resting) return false;
  cars.launch(i, vx, vy, vz, 9);
  if (s === St.Kinematic) {
    G.taxis++;
    score(0.04, v2.fromArray(cars.pos, i * 3), 'TAXI ');
  }
  return true;
}

/** Launch every car within r of (x,z); vel(dx, dz, d, out) gives the velocity. */
export function launchCarsNear(x: number, z: number, r: number, vel: (dx: number, dz: number, d: number, out: THREE.Vector3) => void): number {
  let n = 0;
  for (let i = 0; i < cars.n; i++) {
    const p = i * 3;
    const dx = cars.pos[p] - x;
    const dz = cars.pos[p + 2] - z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < r) {
      vel(dx, dz, d, v2);
      if (launchCar(i, v2.x, v2.y, v2.z)) n++;
    }
  }
  return n;
}

export function placeCars(): void {
  const N = city.n;
  const HALF = city.half;
  const theme = game.level.world.theme;
  const count = Math.min(CAPS.cars, game.level.cars);
  cars.n = 0;
  for (let i = 0; i < count; i++) {
    carAxis[i] = Math.random() < 0.5 ? 0 : 1;
    carDir[i] = Math.random() < 0.5 ? -1 : 1;
    carLane[i] = carDir[i] * 4.5;
    carSpeed[i] = 16 + Math.random() * 10;
    const s = city.streetAt(Math.floor(Math.random() * (N + 1)));
    const along = (Math.random() - 0.5) * 2 * (HALF - 10);
    const x = carAxis[i] === 0 ? s + carLane[i] : along;
    const z = carAxis[i] === 0 ? along : s + carLane[i];
    const taxi = Math.random() < theme.taxiShare;
    cars.add(x, 0.5, z, 1, 1, 1, col.set(taxi ? theme.taxiColor : theme.carColors[i % theme.carColors.length]), carAxis[i] === 0 ? (carDir[i] > 0 ? 0 : Math.PI) : carDir[i] > 0 ? Math.PI / 2 : -Math.PI / 2);
    cars.state[i] = St.Kinematic;
  }
  cars.mesh.count = cars.n;
  if (cars.mesh.instanceColor) cars.mesh.instanceColor.needsUpdate = true;
}

export function updateCars(dt: number): void {
  const flee = 90;
  const N = city.n;
  const HALF = city.half;
  const BLOCK = city.block;
  for (let i = 0; i < cars.n; i++) {
    if (cars.state[i] !== St.Kinematic) continue;
    const p = i * 3;
    const near = Math.hypot(cars.pos[p] - C.pos.x, cars.pos[p + 2] - C.pos.z) < flee;
    const sp = carSpeed[i] * (near ? 1.8 : 1) * dt * carDir[i];
    const a = carAxis[i] === 0 ? 2 : 0; // index of the moving coordinate
    const before = cars.pos[p + a];
    cars.pos[p + a] += sp;
    const after = cars.pos[p + a];
    // crossing an intersection: maybe turn
    for (let k = 1; k < N; k++) {
      const s = city.streetAt(k);
      if ((before - s) * (after - s) <= 0 && Math.random() < 0.35) {
        const newAxis = carAxis[i] ^ 1;
        carAxis[i] = newAxis;
        carDir[i] = Math.random() < 0.5 ? -1 : 1;
        carLane[i] = carDir[i] * 4.5;
        if (newAxis === 0) cars.pos[p] = s + carLane[i];
        else cars.pos[p + 2] = s + carLane[i];
        break;
      }
    }
    const lim = HALF - 6;
    if (Math.abs(cars.pos[p + (carAxis[i] === 0 ? 2 : 0)]) > lim) {
      carDir[i] = -carDir[i] as -1 | 1;
      carLane[i] = -carLane[i];
      const fixed = carAxis[i] === 0 ? 0 : 2;
      cars.pos[p + fixed] = Math.round((cars.pos[p + fixed] + HALF) / BLOCK) * BLOCK - HALF + carLane[i];
      cars.pos[p + (carAxis[i] === 0 ? 2 : 0)] = Math.sign(cars.pos[p + (carAxis[i] === 0 ? 2 : 0)]) * (lim - 1);
    }
    const yaw = carAxis[i] === 0 ? (carDir[i] > 0 ? 0 : Math.PI) : carDir[i] > 0 ? Math.PI / 2 : -Math.PI / 2;
    cars.rot[i * 4] = 0;
    cars.rot[i * 4 + 1] = Math.sin(yaw / 2);
    cars.rot[i * 4 + 2] = 0;
    cars.rot[i * 4 + 3] = Math.cos(yaw / 2);
    cars.write(i);
  }
  cars.step(dt);
}

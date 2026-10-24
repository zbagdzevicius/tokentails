// STYLE lane: the trick rotation as a post-transform of the kitten rig (nothing in src/cat changes). Core places
// kittenRig().root every frame (updatePlayerVisual) before the frame hooks run; this hook post-multiplies the root
// quaternion by the spin (about the rig's local up) and the corkscrew roll (about its local forward), pivoting at body
// height 0.45 u so she turns around her middle, not her feet. After a landing the leftover angle unwinds in ~0.1 s.
import * as THREE from 'three';
import { kittenRig } from '../core/player';

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const PIVOT = new THREE.Vector3(0, 0.45, 0);
const qSpin = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
const qT = new THREE.Quaternion();
const tmp = new THREE.Vector3();
const TAU = Math.PI * 2;

let residSpin = 0;
let residRoll = 0;
/** extra visual-only turns (the test hook's trick()) */
let demoTurns = 0;
let demoDone = 0;

const wrap = (a: number) => {
  const r = a % TAU;
  return r > Math.PI ? r - TAU : r < -Math.PI ? r + TAU : r;
};

/** touchdown: whatever angle is left unwinds the short way */
export function settleSpin(spin: number, roll: number): void {
  residSpin = wrap(spin);
  residRoll = wrap(roll);
}

/** visual-only turns (the test hook's trick(), so a forced trick also reads on screen) */
export function demoSpin(turns: number): void {
  demoTurns = turns;
  demoDone = 0;
}

export function resetSpin(): void {
  residSpin = residRoll = 0;
  demoTurns = demoDone = 0;
}

/** something is turning right now */
export const spinVisualActive = (): boolean => residSpin !== 0 || residRoll !== 0 || demoDone < demoTurns;

/** every frame (dt scaled by slow-mo): apply spin + roll (radians) from the trick tracker */
export function applySpin(dt: number, spin: number, roll: number, spinTime: number): void {
  if (dt > 0) {
    const k = Math.exp(-dt * 34);
    residSpin = Math.abs(residSpin) < 0.01 ? 0 : residSpin * k;
    residRoll = Math.abs(residRoll) < 0.01 ? 0 : residRoll * k;
    if (demoDone < demoTurns) demoDone = Math.min(demoTurns, demoDone + dt / spinTime);
  }
  const a = spin + residSpin + (demoDone < demoTurns ? demoDone * TAU : 0);
  const r = roll + residRoll;
  if (a === 0 && r === 0) return;
  const rig = kittenRig();
  if (!rig) return;
  const root = rig.root;
  qSpin.setFromAxisAngle(UP, a);
  qRoll.setFromAxisAngle(FWD, r);
  qT.multiplyQuaternions(qSpin, qRoll);
  // keep the pivot (local 0, 0.45, 0) where it was: p' = p + R (C - qT C)
  tmp.copy(PIVOT).applyQuaternion(qT);
  tmp.subVectors(PIVOT, tmp).applyQuaternion(root.quaternion);
  root.position.add(tmp);
  root.quaternion.multiply(qT);
}

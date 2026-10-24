// STYLE lane: the finish flourish. On finishLine: three confetti waves in six colours (core fx), and (unless reduced
// motion) a camera swing through setCameraOverride for SWING_TIME (2.15 s) of sim time from the finish line: from the
// chase camera out to Mochi's left while she brakes, then onto a close 3/4 front of her victory pose by SWING_ARRIVE
// (1.0 s; she turns round to her left to face back down the track, so the camera on her left sees her face all the
// way round), held until the release. The override is released to null before the 2.2 s run-out ends; after stageEnd the camera is never
// touched (the cottage cutscene owns it). The slow-mo, rank stamp and sting are started by index.ts.
import * as THREE from 'three';
import { setCameraOverride } from '../core/camera';
import { burst } from '../core/fx';
import { P } from '../core/player';
import { game } from '../core/state';
import { SWING_TIME, swingPose, type SwingPose } from './rank';

const CONFETTI = [0xff4f7b, 0xffc21a, 0x4cc3ff, 0x7ccf5a, 0xc77dff, 0xff8a2a];
const WAVES_MS = [0, 260, 540];

let confettiAt = -1;
let wave = 0;
let swingT = -1;
let side = 1;
let portrait = false;
const pose: SwingPose = { angle: 0, dist: 0, height: 0, look: 0, blend: 0 };
const off0 = new THREE.Vector3();
const look0 = new THREE.Vector3();
const off = new THREE.Vector3();
const lk = new THREE.Vector3();
const dir = new THREE.Vector3();
const at = new THREE.Vector3();
const DEG = Math.PI / 180;
let fov0 = 60;

function confettiWave(i: number): void {
  const W = P.world;
  at.copy(W.pos).addScaledVector(W.up, 1.5 + i * 0.3).addScaledVector(W.fwd, 1.2 + P.speed * 0.15);
  for (let c = 0; c < CONFETTI.length; c++) burst(at, 9, CONFETTI[c], 7 + i * 1.5, 1.3, 0.16, 5, 1.1);
}

/** start the confetti (always) */
export function startConfetti(): void {
  confettiAt = performance.now();
  wave = 0;
}

/** every frame (real time): fire the due confetti waves */
export function tickConfetti(now: number): void {
  if (confettiAt < 0) return;
  if (game.mode !== 'finish' && game.mode !== 'over') {
    confettiAt = -1;
    return;
  }
  while (wave < WAVES_MS.length && now - confettiAt >= WAVES_MS[wave]) confettiWave(wave++);
  if (wave >= WAVES_MS.length) confettiAt = -1;
}

function swingCam(cam: THREE.PerspectiveCamera, dt: number): void {
  // still installed after the run-out: nobody else owns the camera, give it back
  if (game.mode !== 'finish' || swingT < 0) {
    swingT = -1;
    setCameraOverride(null);
    return;
  }
  swingT += dt;
  if (swingT >= SWING_TIME) {
    swingT = -1;
    setCameraOverride(null);
    return;
  }
  swingPose(swingT, pose);
  const W = P.world;
  const a = pose.angle * DEG * side;
  const d = pose.dist * (portrait ? 1.35 : 1);
  const h = pose.height + (portrait ? 0.7 : 0);
  off.copy(W.fwd).multiplyScalar(-Math.cos(a) * d).addScaledVector(W.right, Math.sin(a) * d).addScaledVector(W.up, h);
  off.lerp(off0, 1 - pose.blend);
  cam.position.copy(W.pos).add(off);
  lk.copy(W.up).multiplyScalar(pose.look).lerp(look0, 1 - pose.blend).add(W.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(lk);
  const want = (fov0 + (52 * (portrait ? 1.3 : 1) - fov0) * pose.blend);
  if (Math.abs(cam.fov - want) > 0.05) {
    cam.fov = want;
    cam.updateProjectionMatrix();
  }
}

/** take the camera for the swing (from the camera's current pose) */
export function startSwing(cam: THREE.PerspectiveCamera): void {
  portrait = cam.aspect < 1;
  // her left (she turns round to her left), unless she hugs the left edge
  side = P.x < -2.5 ? 1 : -1;
  off0.copy(cam.position).sub(P.world.pos);
  cam.getWorldDirection(dir);
  look0.copy(cam.position).addScaledVector(dir, 10).sub(P.world.pos);
  fov0 = cam.fov;
  swingT = 0;
  setCameraOverride(swingCam);
}

/** stageEnd / quit / a new run: forget the swing WITHOUT touching the camera */
export function forgetSwing(): void {
  swingT = -1;
  confettiAt = -1;
}

export const swinging = (): boolean => swingT >= 0;

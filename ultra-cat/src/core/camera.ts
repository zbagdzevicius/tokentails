// Gameplay / title camera. FROZEN.
import * as THREE from 'three';
import { fx } from './fx';
import { camera, sun } from './engine';
import { C, G, game, P } from './state';

const v1 = new THREE.Vector3();
const play = new THREE.Vector3();
const street = new THREE.Vector3();
const streetLook = new THREE.Vector3();
const look = new THREE.Vector3();
let camOff = 0.45;
/** A boss asks for a wider shot that frames it with the cat: `want` 0..1 is set every frame and decays here. */
export const camFocus = { x: 0, z: 0, want: 0, w: 0 };
let fovBase = 55;

export function updateCamera(dt: number): void {
  const mode = game.mode;
  // gameplay camera trails the cat heading
  if (mode === 'play' && !C.air) {
    let d = C.heading - game.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    game.camYaw += d * Math.min(1, dt * (C.speed > 2 ? (G.ultraT > 0 ? 1.4 : 2.2) : 0.6));
  }
  if (mode === 'play') game.intro = Math.min(1, game.intro + dt * 0.8);
  const intro = game.intro;
  const k = intro * intro * (3 - 2 * intro);
  const camYaw = game.camYaw;
  const s = P.scale;
  // the cat sits in the lower third, the street ahead shows above it; a yaw offset gives a 3/4 view of the face
  const ult = G.ultraT > 0 && !!game.ability?.camWide;
  const ahead = ult ? 70 : 85;
  const tgt = v1.set(C.pos.x + Math.sin(camYaw) * ahead, (ult ? 30 : 45) * (camera.aspect < 1 ? 0.2 : 1) * s + C.y * 0.6, C.pos.z + Math.cos(camYaw) * ahead);
  const pull = mode === 'over' ? Math.min(1, (performance.now() - game.overAt) / 1600) : 0; // end-of-round pull-back
  // portrait phones: pull back, widen the FOV and centre the cat so the city still shows around it
  const tall = camera.aspect < 1;
  camFocus.w += (camFocus.want - camFocus.w) * Math.min(1, dt * 2.5);
  camFocus.want = 0;
  const bw = mode === 'play' || mode === 'over' ? camFocus.w : 0;
  if (bw > 0.001) {
    // look between the cat and the boss
    tgt.x += (camFocus.x - tgt.x) * 0.45 * bw;
    tgt.z += (camFocus.z - tgt.z) * 0.45 * bw;
  }
  const back = ((ult ? 120 : 110) * s + pull * 90 + bw * 70) * (tall ? 1.3 : 1);
  camOff += ((ult ? (tall ? 0.5 : 0.8) : tall ? 0.18 : 0.45) - camOff) * Math.min(1, dt * 3); // swing wider during the laser so the beams run across the screen
  const cy = camYaw + camOff;
  play.set(C.pos.x - Math.sin(cy) * back, (ult ? 115 : 105) * s + C.y * 0.5 + pull * 80 + bw * 60, C.pos.z - Math.cos(cy) * back);
  // title: street level, in front of the cat, looking up (the reference video's shot)
  const t0 = performance.now() / 1000;
  street.set(C.pos.x + Math.sin(C.heading) * 95 * s + Math.sin(t0 * 0.3) * 8, 5, C.pos.z + Math.cos(C.heading) * 95 * s);
  streetLook.set(C.pos.x, 40 * s, C.pos.z);
  camera.position.lerpVectors(street, play, k);
  look.lerpVectors(streetLook, tgt, k);
  const tr = G.trauma * G.trauma;
  camera.position.x += (Math.random() - 0.5) * tr * 6;
  camera.position.y += (Math.random() - 0.5) * tr * 6;
  camera.position.z += (Math.random() - 0.5) * tr * 6;
  camera.lookAt(look);
  // FOV: wider while zooming, a punch on pounce landings
  const zooming = mode === 'play' && C.speed > P.walk + 5;
  fovBase += ((zooming ? 63 : 55) + (camera.aspect < 1 ? 16 : 0) - fovBase) * Math.min(1, dt * 4);
  fx.fov = Math.max(0, fx.fov - dt * 4);
  camera.fov = fovBase + Math.sin(fx.fov * Math.PI) * 7;
  camera.updateProjectionMatrix();
  G.trauma = Math.max(0, G.trauma - dt * 1.6);
  sun.position.set(C.pos.x + 80, 160, C.pos.z + 50);
  sun.target.position.set(C.pos.x, 0, C.pos.z);
}

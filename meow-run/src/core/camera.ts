// Camera rig. FROZEN.
// Third person behind the kitten: the camera sits ON the track a few u behind the player (so it follows bends and
// never swings into cliffs that line the path), looks ahead around bends, lags smoothly and kicks its FOV on boosts.
// The sun and its shadow box follow the player. Cutscenes take over with setCameraOverride.
import * as THREE from 'three';
import { camera, sun, sunDir } from './engine';
import { events } from './events';
import { P } from './player';
import { game, prefs } from './state';
import { newFrame } from './track';

export const CAM = {
  back: 7.2, // u behind along the track
  height: 3.1, // above the surface
  lookAhead: 13,
  lookHeight: 1.1,
  baseFov: 60,
  fovPerSpeed: 0.45, // + per u/s over 18
  lagPos: 7,
  lagLook: 10,
};

type Override = (cam: THREE.PerspectiveCamera, dt: number, t: number) => void;
let override: Override | null = null;
/** Hand the camera to a cutscene (meta-ui) or a set piece; null gives it back. */
export function setCameraOverride(fn: Override | null): void {
  override = fn;
  snap = true;
}

let kick = 0;
let shakeAmt = 0;
/** extra FOV degrees that decay (boosts, pounce) */
export function fovKick(deg: number): void {
  if (!prefs.reducedMotion) kick = Math.max(kick, deg);
}
let punch = 0;
/** a quick punch-in (FOV degrees narrower, decaying): the slow-mo beat */
export function fovPunch(deg: number): void {
  if (!prefs.reducedMotion) punch = Math.max(punch, deg);
}
/** screen shake 0..1 */
export function shake(amount: number): void {
  if (!prefs.reducedMotion) shakeAmt = Math.max(shakeAmt, amount * prefs.shake);
}
events.on('boost', (e) => fovKick(6 + (e.mul - 1) * 12));
events.on('pounce', () => fovKick(4));
events.on('bigHit', (e) => shake(e.strength));

/** a short framing beat (a chase reveal): pull the camera back and up for `seconds`, then ease home */
let pullBack = 0;
let pullUp = 0;
let pullT = 0;
let pullK = 0;
export function cameraPull(back: number, up: number, seconds: number): void {
  pullBack = back;
  pullUp = up;
  pullT = seconds;
}
events.on('stageStart', () => (pullT = pullK = 0));
events.on('respawn', () => (pullT = pullK = 0));

let snap = true;
/** jump the camera to its target next frame (stage start, respawn) */
export function snapCamera(): void {
  snap = true;
}
events.on('stageStart', snapCamera);
events.on('respawn', snapCamera);

const fc = newFrame();
const fl = newFrame();
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
const look = new THREE.Vector3();
const upV = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
let attractS = 0;
/** the s the title attract camera is looking at (scenery streaming) */
export const attractFocus = () => attractS + 12;

/** 0..1 eased: how much the wall-run framing applies (closer camera, rolled off the cliff face) */
let wallK = 0;
let wallBank = 0;
const rollQ = new THREE.Quaternion();
const fwdFlat = new THREE.Vector3();

export function updateCamera(dt: number, t: number): void {
  const track = game.track;
  if (override) {
    override(camera, dt, t);
    return;
  }
  if (!track || track.length < 2) return;
  let s: number;
  let x = 0;
  let y = 0;
  if (game.mode === 'title') {
    // attract mode: a slow fly along the first stretch of the stage
    attractS = (attractS + dt * 9) % Math.max(20, Math.min(track.length - 30, 420));
    s = attractS + 12;
  } else {
    s = P.s;
    x = P.x;
    y = P.y;
  }
  const portrait = camera.aspect < 1;
  // claw wall-run: pull in (0.7x) so the kitten and the face beside her read; framing eases in and out
  const onWall = game.mode !== 'title' && track.kindAt(s + 4) === 'wall';
  if (onWall) track.sample(s + 6, fl);
  const wantWall = onWall && Math.abs(fl.bank) > 0.3 ? 1 : 0;
  if (wantWall) wallBank = fl.bank;
  wallK += (wantWall - wallK) * Math.min(1, dt * (snap ? 60 : 2.6));
  // phones in portrait: further back and higher, looking further ahead, so Mochi sits low and the road ahead fills
  // the screen, and wide things beside the path (the dog) stay in frame
  // the position lag trails the target by about speed / lagPos; win half of that back so Mochi stays readable
  const lagComp = game.mode === 'title' ? 0 : (0.5 * Math.max(0, P.speed)) / CAM.lagPos;
  if (pullT > 0) pullT = Math.max(0, pullT - dt);
  pullK += ((pullT > 0 && game.mode === 'play' ? 1 : 0) - pullK) * Math.min(1, dt * (pullT > 0 ? 3.2 : 1.8));
  const back = CAM.back * (1 - 0.3 * wallK) - lagComp + pullBack * pullK;
  const height = (CAM.height + (portrait ? 1.7 : 0)) * (1 - 0.2 * wallK) + pullUp * pullK;
  const lookH = CAM.lookHeight + (portrait ? 3.4 : 0);
  track.sample(s - back, fc);
  track.sample(s + CAM.lookAhead, fl);
  // on the wall, sit out over the open side (away from the face) so the drop shows beside her
  const off = -Math.sign(wallBank) * 1.6 * wallK;
  const camX = x * 0.55 + off;
  wantPos.copy(fc.pos).addScaledVector(fc.right, camX).addScaledVector(fc.up, height + y * 0.55);
  // never below the surface under the camera (gaps: stay level with the player's side of the chasm)
  wantLook.copy(fl.pos).addScaledVector(fl.right, x * 0.35).addScaledVector(fl.up, lookH + y * 0.5);
  // blend the look target towards the player so jumps read
  if (game.mode !== 'title') wantLook.lerp(P.world.pos, portrait ? 0.12 : 0.3).addScaledVector(fc.up, 0.4);
  if (snap) {
    camera.position.copy(wantPos);
    look.copy(wantLook);
    snap = false;
  } else {
    camera.position.lerp(wantPos, 1 - Math.exp(-CAM.lagPos * dt));
    look.lerp(wantLook, 1 - Math.exp(-CAM.lagLook * dt));
  }
  // lean with banked track (half the bank), never upside down. On a wall-run only ~20 degrees of roll: the horizon
  // stays nearly level, so the face reads as a steep tilted plane beside the kitten rather than as a floor.
  upV.copy(WORLD_UP).lerp(fc.up, 0.5).normalize();
  if (wallK > 0.001) {
    fwdFlat.copy(fc.fwd).normalize();
    const roll = Math.max(-0.38, Math.min(0.38, wallBank * 0.33));
    rollQ.setFromAxisAngle(fwdFlat, roll);
    const wallUp = fwdFlat.set(0, 1, 0).applyQuaternion(rollQ);
    upV.lerp(wallUp, wallK).normalize();
  }
  camera.up.copy(upV);
  camera.lookAt(look);
  if (shakeAmt > 0) {
    const a = shakeAmt * 0.35;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
  }
  kick = Math.max(0, kick - dt * 10);
  punch = Math.max(0, punch - dt * 5);
  const speedFov = prefs.reducedMotion ? 0 : Math.max(0, P.speed - 18) * CAM.fovPerSpeed;
  // portrait: a taller vertical FOV keeps more of the path's width in view
  const fov = (CAM.baseFov + speedFov + kick - punch) * (portrait ? 1.38 : 1);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // sun + shadow box centred on the player
  const c = game.mode === 'title' ? fc.pos : P.world.pos;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sunDir.normalize(), 120);
  sun.target.updateMatrixWorld();
}

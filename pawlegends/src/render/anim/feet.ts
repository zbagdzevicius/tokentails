/**
 * Feet (ANIM-SPEC §5, phase P4): the turn-in-place shuffle and start / stop leans. An idle turn over 35° at under
 * 0.35 m/s plays a 0.25 s two-step; a start gets a push-off lean, a hard stop a braking lean with overshoot.
 * `lockFeet` (pinFeet below): while a clip that sets it lunges the body (root fwd / side), each thigh is turned so its
 * foot stays on the spot it would stand on without the lunge, so a planted stance no longer skates. No allocation.
 */
import * as THREE from 'three';
import { BONE_INDEX as I } from '../chars/skeleton';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const add = (q: THREE.Quaternion, x: number, y: number, z: number): void => {
  q.multiply(_q.setFromEuler(_e.set(x, y, z, 'XYZ')));
};

export const SHUFFLE = Object.freeze({ turn: (35 * Math.PI) / 180, maxSpeed: 0.35, dur: 0.25 });

export class Feet {
  private acc = 0;
  private t = 1;
  private side = 1;
  private lean = 0;
  private leanV = 0;
  private prevSpeed = 0;

  /** Feed the frame's yaw change (rad), ground speed (m/s) and dt; apply to the layer buffers. */
  apply(q: THREE.Quaternion[], dyaw: number, speed: number, dt: number): void {
    if (!(dt > 0)) return;
    if (speed < SHUFFLE.maxSpeed) {
      this.acc += dyaw;
      if (Math.abs(this.acc) > SHUFFLE.turn && this.t >= 1) {
        this.side = this.acc > 0 ? 1 : -1;
        this.acc = 0;
        this.t = 0;
      }
    } else this.acc = 0;
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / SHUFFLE.dur);
      const a = Math.sin(this.t * Math.PI * 2);
      const b = Math.max(0, Math.sin(this.t * Math.PI * 2));
      add(q[this.side > 0 ? I.thighL : I.thighR], -0.35 * b, 0, 0);
      add(q[this.side > 0 ? I.kneeL : I.kneeR], 0.6 * b, 0, 0);
      add(q[this.side > 0 ? I.thighR : I.thighL], -0.35 * Math.max(0, -a), 0, 0);
      add(q[this.side > 0 ? I.kneeR : I.kneeL], 0.6 * Math.max(0, -a), 0, 0);
    }
    // push-off / braking lean from the speed change (a damped spring)
    const accel = (speed - this.prevSpeed) / dt;
    this.prevSpeed = speed;
    const target = Math.max(-0.18, Math.min(0.18, accel * 0.012));
    this.leanV += (-(this.lean - target) * 120 - this.leanV * 14) * Math.min(dt, 1 / 30);
    this.lean += this.leanV * Math.min(dt, 1 / 30);
    add(q[I.body], this.lean, 0, 0);
  }
}

const _H = new THREE.Vector3();
const _F = new THREE.Vector3();
const _T = new THREE.Vector3();
const _S = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const LEGS = [
  [I.thighL, I.footL],
  [I.thighR, I.footR],
] as const;

/**
 * Pin both feet against the root's horizontal lunge (`fwd`, `side` m in the mover's parent space, +X forward) with
 * weight `k` (0..1): each thigh turns so the hip → foot line points at where the foot stood before the lunge. The leg
 * keeps its knee bend (an aim, not a full two-bone solve), which removes most of the slide for the ≤ 0.3 m root lunges
 * the caps allow. Off in the air (`up` > 0.08 m). Call after the mover is written. No allocation.
 */
export function pinFeet(bones: readonly THREE.Object3D[], mover: THREE.Object3D, fwd: number, side: number, up: number, k: number): void {
  if (k <= 0.01 || up > 0.08 || Math.abs(fwd) + Math.abs(side) < 0.01) return;
  const parent = mover.parent;
  if (!parent) return;
  mover.updateMatrixWorld(true);
  // the lunge in world space
  parent.getWorldQuaternion(_pq);
  _S.set(fwd * k, 0, side * k).applyQuaternion(_pq);
  for (let l = 0; l < 2; l++) {
    const thigh = bones[LEGS[l][0]];
    const foot = bones[LEGS[l][1]];
    const hips = thigh.parent;
    if (!hips) continue;
    _H.setFromMatrixPosition(thigh.matrixWorld);
    _F.setFromMatrixPosition(foot.matrixWorld);
    _T.copy(_F).sub(_S);
    _F.sub(_H);
    _T.sub(_H);
    const lf = _F.length();
    const lt = _T.length();
    if (lf < 1e-4 || lt < 1e-4) continue;
    _qw.setFromUnitVectors(_F.multiplyScalar(1 / lf), _T.multiplyScalar(1 / lt));
    // world delta → the thigh's parent space: q_local' = P⁻¹ · q_world · P · q_local
    hips.getWorldQuaternion(_pq);
    _pqi.copy(_pq).invert();
    thigh.quaternion.premultiply(_pqi.multiply(_qw).multiply(_pq));
  }
}

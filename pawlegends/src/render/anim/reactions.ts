/**
 * Hit reactions (ANIM-SPEC §14 shared victim reactions): a separate reaction slot, so a hit never cancels the caster's
 * own follow-through. Directional: the push comes from the hit direction (object space: +x forward, +z the hero's
 * right). Light = an additive flinch (0.2 s); heavy = stagger, head snap; knock = a backward tumble warped onto the sim
 * knockback ticks (reduce motion: a slide with a lean); pull = a forward stumble; the victim shake (§6). Continuous
 * states (stun, root, charm, fear, slow) are gait variants and held poses (motion.ts). No allocation per frame.
 */
import * as THREE from 'three';
import { BONE_INDEX as I } from '../chars/skeleton';
import { KNOCK_TICKS, TICK_S } from './timing';
import type { RootState } from './root';
import type { ReactKind } from './types';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const add = (q: THREE.Quaternion, x: number, y: number, z: number): void => {
  if (x === 0 && y === 0 && z === 0) return;
  q.multiply(_q.setFromEuler(_e.set(x, y, z, 'XYZ')));
};

const KIND: Readonly<Record<ReactKind, number>> = Object.freeze({ light: 1, heavy: 2, knock: 3, pull: 4, stun: 5, root: 6, charm: 7, fear: 8, slow: 9 });

export class Reactions {
  private kind = 0;
  private t = 1;
  private dur = 0.2;
  /** Push direction (object space, unit): where the body is shoved toward. */
  private px = -1;
  private pz = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private time = 0;
  reduced = false;

  /** Start a reaction; (dirX, dirZ) = the push direction in object space. */
  start(kind: ReactKind, dirX: number, dirZ: number, ticks?: number): void {
    const k = KIND[kind];
    // a light flinch never cuts a knock or a stagger in progress
    if (this.kind >= 2 && this.kind <= 4 && this.t < 1 && k < this.kind) return;
    const l = Math.hypot(dirX, dirZ);
    this.px = l > 1e-4 ? dirX / l : -1;
    this.pz = l > 1e-4 ? dirZ / l : 0;
    this.kind = k;
    this.t = 0;
    this.dur = k === 1 ? 0.2 : k === 2 ? 0.32 : k === 3 || k === 4 ? (ticks ?? KNOCK_TICKS) * TICK_S + 0.12 : 0.3;
  }

  /** Victim shake (§6): side jitter of `amp` m for `ms`. */
  shake(ms: number, amp: number): void {
    if (this.reduced) return;
    this.shakeT = Math.max(this.shakeT, ms / 1000);
    this.shakeAmp = amp;
  }

  clear(): void {
    this.kind = 0;
    this.t = 1;
    this.shakeT = 0;
  }

  get active(): boolean {
    return this.t < 1 || this.shakeT > 0;
  }

  /** Apply on top of the layer buffers and the root. */
  apply(q: THREE.Quaternion[], root: RootState, dt: number): void {
    this.time += dt;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      root.side += Math.sin(this.time * 95) * this.shakeAmp;
      root.fwd += Math.cos(this.time * 77) * this.shakeAmp * 0.5;
    }
    if (this.t >= 1 || this.kind === 0) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    const u = this.t;
    // the push in the character's frame: back (−x) / right (+z)
    const back = -this.px;
    const right = this.pz;
    switch (this.kind) {
      case 1: {
        const k = Math.sin(u * Math.PI) * (1 - u * 0.3);
        add(q[I.chest], -0.32 * k * back + 0.12 * k * (1 - Math.abs(back)), 0, 0.3 * k * right);
        add(q[I.head], -0.32 * k * back, 0, 0.2 * k * right);
        add(q[I.earL], 0, 0, -0.35 * k);
        add(q[I.earR], 0, 0, 0.35 * k);
        root.fwd += -0.05 * k * back;
        root.side += 0.05 * k * right;
        return;
      }
      case 2: {
        const k = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
        const s = k * k * (3 - 2 * k);
        add(q[I.chest], -0.45 * s * back, 0, 0.35 * s * right);
        add(q[I.head], -0.6 * s * back, 0.2 * s * right, 0.25 * s * right);
        add(q[I.hips], -0.15 * s * back, 0, 0);
        add(q[I.kneeL], 0.35 * s, 0, 0);
        add(q[I.kneeR], 0.35 * s, 0, 0);
        add(q[I.earL], -0.4 * s, 0, -0.4 * s);
        add(q[I.earR], -0.4 * s, 0, 0.4 * s);
        root.fwd += -0.12 * s * back;
        root.side += 0.12 * s * right;
        return;
      }
      case 3: {
        // knock: a backward tumble over the sim's knockback ticks, then the landing squash (root.ts)
        const air = Math.min(1, u / 0.8);
        if (this.reduced) {
          root.pitch += -0.05 * Math.sin(air * Math.PI) * back;
          root.roll += 0.04 * Math.sin(air * Math.PI) * right;
        } else {
          root.up += 0.4 * Math.sin(air * Math.PI);
          root.pitch += -air * back;
          root.roll += air * right * 0.5;
        }
        add(q[I.chest], 0.4 * Math.sin(air * Math.PI), 0, 0);
        add(q[I.thighL], -0.6 * Math.sin(air * Math.PI), 0, 0);
        add(q[I.thighR], -0.6 * Math.sin(air * Math.PI), 0, 0);
        add(q[I.kneeL], 1.0 * Math.sin(air * Math.PI), 0, 0);
        add(q[I.kneeR], 1.0 * Math.sin(air * Math.PI), 0, 0);
        return;
      }
      case 4: {
        const k = Math.sin(u * Math.PI);
        add(q[I.chest], 0.45 * k, 0, 0);
        add(q[I.head], 0.2 * k, 0, 0);
        add(q[I.shoulderL], -0.6 * k, 0, 0.3 * k);
        add(q[I.shoulderR], -0.6 * k, 0, -0.3 * k);
        root.fwd += 0.1 * k;
        return;
      }
      default:
        return;
    }
  }
}

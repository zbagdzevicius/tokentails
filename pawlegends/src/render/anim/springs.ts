/**
 * Secondary motion (ANIM-SPEC §5): damped spring chains for the tail and the ears, driven by the body, not by a sine.
 * Per joint and axis:  θ'' = −k(θ − lag·θparent) − c·θ' − α·a_local − β·ω_yaw − γ·ω_body
 * Inputs: the root's planar acceleration (object space), the yaw rate and the root's pitch / roll rates, so a dash
 * streams the tail back, a turn whips it out and a flip throws it round. Fixed substeps (120 Hz, ≤ 4 a frame on Med and
 * High; 60 Hz, 1 step on Low). Output: Euler offsets (x, y) per joint, added on the bones. No allocation per step.
 */
import type { SpringTuning } from './types';

export interface SpringInput {
  /** Planar acceleration in object space (m/s²): x forward, z side. */
  ax: number;
  az: number;
  /** Yaw rate (rad/s), body pitch / roll rates (rad/s). */
  yawRate: number;
  pitchRate: number;
  rollRate: number;
}

/** A chain of `n` joints, two axes each (x: up / down, y: side). */
export class SpringChain {
  readonly n: number;
  /** Offsets (rad): [x0, y0, x1, y1, ...]. */
  readonly theta: Float32Array;
  private readonly vel: Float32Array;
  k = 140;
  c = 12;
  lag = 0.6;
  /** Gains: acceleration, yaw rate, body rate. */
  alpha = 0.035;
  beta = 0.09;
  gamma = 0.05;
  /** Clamp per joint (rad). */
  limit = 1.1;
  /** A held bias on the x axis (ears back on a dash, tail low when timid). */
  biasX = 0;

  constructor(n: number) {
    this.n = n;
    this.theta = new Float32Array(n * 2);
    this.vel = new Float32Array(n * 2);
  }

  tune(t: { k: number; c: number; lag: number }): void {
    this.k = t.k;
    this.c = t.c;
    this.lag = t.lag;
  }

  reset(): void {
    this.theta.fill(0);
    this.vel.fill(0);
  }

  /** Advance by dt with `hz` substeps (max `maxSteps`). */
  step(dt: number, inp: SpringInput, hz: number, maxSteps: number): void {
    if (!(dt > 0)) return;
    let steps = Math.ceil(dt * hz);
    if (steps > maxSteps) steps = maxSteps;
    if (steps < 1) steps = 1;
    const h = Math.min(dt, maxSteps / hz) / steps;
    const th = this.theta;
    const v = this.vel;
    const fx = -this.alpha * inp.ax - this.gamma * inp.pitchRate;
    const fy = -this.alpha * inp.az - this.beta * inp.yawRate - this.gamma * inp.rollRate;
    for (let s = 0; s < steps; s++) {
      for (let j = 0; j < this.n; j++) {
        const ix = j * 2;
        const px = j > 0 ? th[ix - 2] : 0;
        const py = j > 0 ? th[ix - 1] : 0;
        // the drive grows down the chain (the tip whips more)
        const g = 0.6 + (0.8 * j) / Math.max(1, this.n - 1);
        const axx = -this.k * (th[ix] - this.biasX - this.lag * px) - this.c * v[ix] + fx * g * this.k;
        const ayy = -this.k * (th[ix + 1] - this.lag * py) - this.c * v[ix + 1] + fy * g * this.k;
        v[ix] += axx * h;
        v[ix + 1] += ayy * h;
        th[ix] += v[ix] * h;
        th[ix + 1] += v[ix + 1] * h;
        if (th[ix] > this.limit) (th[ix] = this.limit), (v[ix] = 0);
        else if (th[ix] < -this.limit) (th[ix] = -this.limit), (v[ix] = 0);
        if (th[ix + 1] > this.limit) (th[ix + 1] = this.limit), (v[ix + 1] = 0);
        else if (th[ix + 1] < -this.limit) (th[ix + 1] = -this.limit), (v[ix + 1] = 0);
      }
    }
  }
}

export const DEFAULT_SPRINGS: SpringTuning = Object.freeze({
  tail: Object.freeze({ k: 140, c: 12, lag: 0.55 }),
  ears: Object.freeze({ k: 160, c: 12, lag: 0 }),
});

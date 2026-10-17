// Ported from Pink Paw Knight (swordcat) at commit 7714dcb: src/player/SwordcatModel.js (gait layer, turn lean, swing arcs, flinch, squash spring) and KittenBuilder.js setPose blending (TypeScript rewrite, not a copy)
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
/**
 * The character animator: a held base pose blended between PPK pose snapshots (smoothstep slerp), then layers on
 * top: gait (thigh / knee / foot swing from a phase that advances with ground distance, so feet do not slide; hip
 * bounce; counter-swinging arms), turn lean from the yaw rate, the per-hero attack arc, cast, hit flinch, stun wobble,
 * idle life (breath, head drift, tail sway, ear twitch, blinks) and a volume-keeping squash spring on the body bone.
 * Render only: every input comes from interpolated snapshots and render events.
 */
import * as THREE from 'three';
import { BONE_INDEX as I, BONE_NAMES, type BoneName, type Rig, type Snapshot } from './skeleton';
import type { MotionProfile } from './specs';

export type CharState = 'idle' | 'moving' | 'dead' | 'napping' | 'stunned' | 'feared' | 'blocking' | 'channel';

export interface MotionInput {
  state: CharState;
  /** Ground speed (m/s). */
  speed: number;
  /** Character height (m): stride and gait rate scale with it. */
  height: number;
  /** Signed yaw rate (rad/s), for the turn lean. */
  yawRate: number;
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const add = (q: THREE.Quaternion, x: number, y = 0, z = 0): void => {
  if (x === 0 && y === 0 && z === 0) return;
  q.multiply(_q.setFromEuler(_e.set(x, y, z, 'XYZ')));
};

/** Volume-keeping squash spring (PPK `squash.kick`). */
class Squash {
  x = 0;
  v = 0;
  kick(a: number): void {
    this.v += a;
  }
  step(dt: number): number {
    const h = Math.min(dt, 1 / 30);
    this.v += (-260 * this.x - 18 * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }
}

export class Animator {
  private from: Snapshot;
  private to: Snapshot;
  private blendT = 1;
  private blendDur = 0.2;
  private target = '';
  private q = BONE_NAMES.map(() => new THREE.Quaternion());
  private p = BONE_NAMES.map(() => new THREE.Vector3());
  private time = Math.random() * 10;
  private phase = 0;
  private walk = 0;
  private lean = 0;
  private swingT = 1;
  private swingN = 0;
  private castT = 1;
  private hitT = 1;
  private hitK = 0;
  private popT = 1;
  private blinkT = 2 + Math.random() * 3;
  private earT = 3 + Math.random() * 4;
  private earSide = 1;
  private squash = new Squash();
  /** Override of the base pose for a short time (aim before a shot, cast pose). */
  private hold: { name: string; t: number } | null = null;
  /** A held mood pose in place of the idle (lobby results: 'cheer' on a win, 'sad' on a loss), or null. */
  mood: string | null = null;
  private moodT = 0;

  constructor(
    readonly rig: Rig,
    readonly profile: MotionProfile,
  ) {
    this.from = this.to = rig.snapshot(profile.idle);
    this.target = profile.idle;
  }

  /** Attack swing (render event). */
  swing(): void {
    this.swingT = 0;
    this.swingN = (this.swingN + 1) % 3;
    if (this.profile.attack === 'shoot' && this.profile.aim) this.hold = { name: this.profile.aim, t: 0.38 };
  }
  cast(): void {
    this.castT = 0;
    this.hold = { name: this.profile.cast, t: 0.5 };
    this.squash.kick(2.2);
  }
  hit(heavy = false): void {
    this.hitT = 0;
    this.hitK = heavy ? 1 : 0.7;
    this.squash.kick(heavy ? -3.2 : -2.2);
  }
  /** An emote (render only, e.g. the "Starter" wave): hold `name` for `t` seconds, with a small hop. */
  emote(name: string, t = 1.4): void {
    this.hold = { name, t };
    this.squash.kick(2.6);
  }
  /** Respawn pop (squash, then a short cheer). */
  respawn(): void {
    this.popT = 0;
    this.hold = { name: 'cheer', t: 0.7 };
    this.squash.kick(4);
  }

  private setTarget(name: string, dur: number): void {
    if (name === this.target) return;
    // blend from wherever the base pose is now
    const cur: Snapshot = { name: 'blend', q: this.q.map((q) => q.clone()), p: this.p.map((p) => p.clone()), weapon: this.to.weapon };
    this.composeBase(cur.q, cur.p);
    this.from = cur;
    this.to = this.rig.snapshot(name);
    this.target = name;
    this.blendT = 0;
    this.blendDur = Math.max(1e-3, dur);
  }

  private composeBase(q: THREE.Quaternion[], p: THREE.Vector3[]): void {
    const k = smooth(this.blendT);
    for (let i = 0; i < q.length; i++) {
      q[i].copy(this.from.q[i]).slerp(this.to.q[i], k);
      p[i].copy(this.from.p[i]).lerp(this.to.p[i], k);
    }
  }

  update(dt: number, inp: MotionInput): void {
    this.time += dt;
    const st = inp.state;
    const dead = st === 'dead';
    // ---- base pose
    if (this.hold) {
      this.hold.t -= dt;
      if (this.hold.t <= 0 || dead) this.hold = null;
    }
    let want = this.mood ?? this.profile.idle;
    let dur = this.mood ? 0.35 : 0.2;
    if (dead) {
      want = 'faint';
      dur = 0.35;
    } else if (st === 'napping') {
      want = 'nap';
      dur = 0.4;
    } else if (st === 'feared') want = 'cower';
    else if (st === 'blocking') want = 'block';
    else if (this.hold) {
      want = this.hold.name;
      dur = 0.12;
    } else if (st === 'channel') want = this.profile.cast;
    else if (st === 'moving') want = this.profile.run;
    this.setTarget(want, dur);
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    const q = this.q;
    const p = this.p;
    this.composeBase(q, p);
    if (this.to.weapon.mode === 'hidden') {
      // keep the hero's own grip for poses without a sword spec
      const idle = this.rig.snapshot(this.profile.idle);
      q[I.weapon].copy(idle.q[I.weapon]);
      p[I.weapon].copy(idle.p[I.weapon]);
    }

    // ---- gait (PPK _layerGait): phase by distance over stride, so the feet keep pace with the ground
    const moving = !dead && st !== 'napping' && inp.speed > 0.35;
    this.walk += ((moving ? 1 : 0) - this.walk) * Math.min(1, dt * 10);
    const stride = this.profile.stride * inp.height * 0.5;
    this.phase += moving ? (inp.speed * dt * Math.PI) / Math.max(0.2, stride) : 0;
    const w = this.walk;
    if (w > 0.01) {
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      add(q[I.thighL], -s * 0.75 * w);
      add(q[I.thighR], s * 0.75 * w);
      add(q[I.kneeL], Math.max(0, c) * 0.9 * w);
      add(q[I.kneeR], Math.max(0, -c) * 0.9 * w);
      add(q[I.footL], s * 0.3 * w);
      add(q[I.footR], -s * 0.3 * w);
      p[I.hips].y += Math.abs(c) * 0.025 * w - 0.012 * w;
      add(q[I.hips], 0, s * 0.12 * w);
      add(q[I.chest], 0.08 * w, -s * 0.16 * w);
      add(q[I.body], 0.1 * w);
      // free arms counter-swing (an arm holding a two-paw grip only bobs)
      add(q[I.shoulderL], s * 0.45 * w);
      add(q[I.shoulderR], -s * 0.35 * w);
      add(q[I.head], -0.08 * w, s * 0.06 * w);
      for (let i = 0; i < 6; i++) add(q[I[`tail${i}` as BoneName]], 0, Math.sin(this.phase * 0.5 - i * 0.5) * 0.1 * w);
    }
    // ---- turn lean (yaw rate)
    const leanT = dead ? 0 : Math.max(-0.25, Math.min(0.25, -inp.yawRate * 0.04));
    this.lean += (leanT - this.lean) * Math.min(1, dt * 8);
    add(q[I.body], 0, 0, this.lean * (0.4 + w));

    // ---- attack arc (melee: a longer swing with a held anticipation beat, so it reads at gameplay zoom)
    if (!dead && this.swingT < 1) {
      const dur = this.profile.attack === 'shoot' ? 0.5 : 0.42;
      this.swingT = Math.min(1, this.swingT + dt / dur);
      this.attackLayer(this.swingT);
    }
    // ---- cast: arms up and a hop of the chest
    if (!dead && this.castT < 1) {
      this.castT = Math.min(1, this.castT + dt / 0.5);
      const k = Math.sin(this.castT * Math.PI);
      add(q[I.chest], -0.2 * k);
      add(q[I.head], -0.25 * k);
      p[I.body].y += 0.04 * k;
    }
    // ---- hit flinch
    if (this.hitT < 1) {
      this.hitT = Math.min(1, this.hitT + dt / 0.28);
      const k = Math.sin(this.hitT * Math.PI) * this.hitK;
      add(q[I.chest], -0.3 * k, 0, 0.12 * k);
      add(q[I.head], -0.35 * k);
      add(q[I.earL], 0, 0, -0.4 * k);
      add(q[I.earR], 0, 0, 0.4 * k);
    }
    // ---- stunned: dizzy head circles
    if (st === 'stunned') {
      add(q[I.head], Math.sin(this.time * 7) * 0.18, 0, Math.cos(this.time * 7) * 0.18);
      add(q[I.chest], 0, 0, Math.sin(this.time * 3.5) * 0.08);
    }
    // ---- idle life (PPK Kitten.animate): breath, head drift, tail sway, ear twitch, blink
    if (!dead) {
      const br = Math.sin(this.time * 2.1);
      add(q[I.chest], br * 0.025);
      add(q[I.head], Math.sin(this.time * 0.7) * 0.04, Math.sin(this.time * 0.45) * 0.08 * (1 - w));
      for (let i = 0; i < 6; i++) add(q[I[`tail${i}` as BoneName]], Math.sin(this.time * 1.6 - i * 0.6) * 0.05, Math.sin(this.time * 1.1 - i * 0.7) * 0.12);
      this.earT -= dt;
      if (this.earT < 0) {
        this.earT = 2.5 + Math.random() * 5;
        this.earSide = Math.random() < 0.5 ? -1 : 1;
      }
      const tw = this.earT < 0.25 ? Math.sin((this.earT / 0.25) * Math.PI) * 0.35 : 0;
      add(q[this.earSide > 0 ? I.earL : I.earR], -tw, 0, 0);
    }
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    const lid = dead || st === 'napping' ? 0.12 : this.blinkT < 0 ? 0.15 : 1;

    // ---- mood: a victory hop every ~1.4 s while cheering
    if (this.mood === 'cheer' && !dead) {
      this.moodT += dt;
      if (this.moodT > 1.4) {
        this.moodT = 0;
        this.squash.kick(3);
        this.castT = 0;
      }
    } else this.moodT = 0;
    // ---- respawn pop + squash spring
    this.popT = Math.min(1, this.popT + dt * 3);
    const sq = this.squash.step(dt) * 0.08;
    const pop = this.popT < 1 ? Math.min(1, 0.25 + this.popT * 1.2) : 1;
    // ---- write the bones
    const b = this.rig.bones;
    for (let i = 0; i < b.length; i++) {
      b[i].quaternion.copy(q[i]);
      b[i].position.copy(p[i]);
    }
    const sy = (1 + sq) * pop;
    const sx = pop / Math.sqrt(Math.max(0.3, 1 + sq));
    b[I.body].scale.set(sx, sy, sx);
    b[I.eyeL].scale.set(1, lid, 1);
    b[I.eyeR].scale.set(1, lid, 1);
  }

  /** Per-hero attack arc on top of the held pose, t 0..1 (wind-up, strike, settle). */
  private attackLayer(t: number): void {
    const q = this.q;
    // wind-up to t 0.24, hold the coil to 0.44 (~80 ms at 0.42 s), strike to 0.64, settle; arcs ~1.35× PPK's
    const wind = t < 0.24 ? smooth(t / 0.24) : t < 0.44 ? 1 : 1 - smooth((t - 0.44) / 0.2);
    const strike = t < 0.44 ? 0 : t < 0.64 ? smooth((t - 0.44) / 0.2) : 1 - smooth((t - 0.64) / 0.36);
    const k = this.profile.attack === 'shoot' ? 1 : 1.35;
    const wk = wind * k;
    const sk = strike * k;
    switch (this.profile.attack) {
      case 'slash': {
        // PPK VIS slash 1 → 2 → 3: right-to-left, left-to-right, overhead
        const dir = this.swingN === 1 ? -1 : 1;
        if (this.swingN === 2) {
          add(q[I.shoulderR], -1.6 * wk + 1.1 * sk);
          add(q[I.chest], -0.15 * wk + 0.3 * sk);
        } else {
          add(q[I.chest], 0, dir * (0.55 * wk - 0.9 * sk));
          add(q[I.shoulderR], -0.9 * wk - 0.5 * sk, 0, dir * (-0.4 * wk + 0.7 * sk));
          add(q[I.elbowR], -0.4 * wk + 0.2 * sk);
        }
        add(q[I.hips], 0, dir * 0.2 * sk);
        break;
      }
      case 'shoot': {
        // the draw is the held 'aim' pose; the release snaps the string paw back and the bow arm kicks
        const rel = t > 0.6 ? smooth((t - 0.6) / 0.12) * (1 - smooth((t - 0.75) / 0.25)) : 0;
        add(q[I.shoulderR], 0.5 * rel, 0, -0.4 * rel);
        add(q[I.shoulderL], -0.15 * rel);
        add(q[I.chest], 0.05 * rel);
        break;
      }
      case 'bash': {
        // shield bash: the shield arm thrusts forward, the body drives into it
        add(q[I.shoulderL], -0.8 * sk + 0.3 * wk, 0, 0.2 * sk);
        add(q[I.elbowL], 0.4 * sk);
        add(q[I.chest], -0.1 * wk + 0.25 * sk, 0.3 * wk - 0.4 * sk);
        add(q[I.shoulderR], -0.9 * wk + 0.6 * sk);
        add(q[I.body], 0.12 * sk);
        break;
      }
      case 'claw': {
        // riposte thrust, alternating paws
        const L = this.swingN % 2 === 0;
        add(q[L ? I.shoulderL : I.shoulderR], 0.5 * wk - 1.2 * sk);
        add(q[L ? I.elbowL : I.elbowR], -0.6 * wk + 0.5 * sk);
        add(q[I.chest], 0.25 * sk, (L ? -1 : 1) * 0.35 * sk);
        add(q[I.body], 0.15 * sk);
        break;
      }
      case 'paw': {
        add(q[I.shoulderR], -1.2 * wk + 0.6 * sk);
        add(q[I.chest], 0.2 * sk);
        break;
      }
    }
  }
}

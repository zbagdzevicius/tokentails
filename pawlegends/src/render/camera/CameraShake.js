// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/camera/CameraShake.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/camera/CameraShake.js  (owner: camera) — trauma model (tech.md §9.5; Eiserloh "juicing"):
// events ADD trauma (0..1), the offset is trauma^1.5 × smooth noise, trauma decays linearly. Mostly rotational
// (pitch, yaw, roll applied in camera space AFTER lookAt) plus a few centimetres of positional jolt: every add()
// starts a short downward "thump" (∝ √trauma, ~0.15 s) so even a light hit (0.15) reads as a tiny jolt and a heavy
// hit (0.35) as a clear thump. The positional part is ≤ 8 cm, well inside the spring arm's wall margin.
// The juice table (GAME_DESIGN §8.2 / config JUICE) gives the trauma values; settings.shake (0..1) scales it all.

/** Smooth, zero-mean noise in about [-1, 1] (two incommensurate sines per channel). */
export function shakeNoise(t, k) {
  return Math.sin(t * 31 + k * 17.3) * 0.6 + Math.sin(t * 57 + k * 5.1) * 0.4;
}

/** trauma → intensity exponent (1.5: small trauma still reads; 2 made 0.15 invisible) */
export const SHAKE_POW = 1.5;
/** duration of the per-hit positional thump (s) */
export const KICK_TIME = 0.15;

export class CameraShake {
  /**
   * @param {{ decay?: number, pitch?: number, yaw?: number, roll?: number, pos?: number, kick?: number }} [opts]
   *   decay = trauma lost per second; pitch/yaw/roll = max angles (rad) at trauma 1; pos = max noise offset (m) at
   *   trauma 1; kick = thump depth (m) for trauma 1 (scaled by √trauma).
   */
  constructor({ decay = 1.4, pitch = 0.12, yaw = 0.12, roll = 0.1, pos = 0.05, kick = 0.08 } = {}) {
    this.trauma = 0;
    this.t = 0;
    this.decay = decay;
    this.max = { pitch, yaw, roll, pos, kick };
    /** per-hit thump: amplitude (m) and time since it started (s) */
    this.kickAmp = 0;
    this.kickT = KICK_TIME;
    /** last applied offsets (rad / m), for tests and debug */
    this.offset = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0 };
  }

  /** Add trauma (clamped to 1). Negative / NaN values are ignored. Starts a thump (the bigger one wins). */
  add(x) {
    if (!(x > 0)) return this;
    this.trauma = Math.min(1, this.trauma + x);
    const amp = this.max.kick * Math.sqrt(Math.min(1, x));
    const left = this.kickT < KICK_TIME ? this.kickAmp * (1 - this.kickT / KICK_TIME) : 0;
    if (amp >= left) { this.kickAmp = amp; this.kickT = 0; }
    return this;
  }

  reset() {
    this.trauma = 0; this.kickAmp = 0; this.kickT = KICK_TIME;
    const o = this.offset; o.pitch = o.yaw = o.roll = o.x = o.y = 0;
    return this;
  }

  /** Current intensity (trauma^1.5). */
  get intensity() { return Math.pow(this.trauma, SHAKE_POW); }

  /**
   * Advance by `dt` and compute this frame's offsets (scaled by `scale`, the shake setting). Returns the offset.
   * @param {number} dt @param {number} [scale]
   */
  step(dt, scale = 1) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    this.kickT = Math.min(KICK_TIME, this.kickT + dt);
    const sc = Math.max(0, scale), s = this.intensity * sc, o = this.offset;
    // thump: fast dip and spring back (sin over KICK_TIME, front-loaded)
    const u = this.kickT / KICK_TIME;
    const kick = u < 1 ? this.kickAmp * Math.sin(Math.PI * Math.sqrt(u)) * sc : 0;
    if (s === 0 && kick === 0) { o.pitch = o.yaw = o.roll = o.x = o.y = 0; return o; }
    const m = this.max;
    o.pitch = m.pitch * s * shakeNoise(this.t, 1);
    o.yaw = m.yaw * s * shakeNoise(this.t, 2);
    o.roll = m.roll * s * shakeNoise(this.t, 3);
    o.x = m.pos * s * shakeNoise(this.t, 4);
    o.y = m.pos * s * shakeNoise(this.t, 5) - kick;
    return o;
  }

  /**
   * Step, then rotate / nudge `cam` in its local frame (call after lookAt). `mix` (CONTROLS_SPEC §2.5, the iso rig):
   * { rotMul, transMul, rotMaxDeg, transMax } — rotations ×0.5 (≤ 1.2°), screen-plane translation ×2 (≤ 0.35 m).
   */
  apply(cam, dt, scale = 1, mix = null) {
    const o = this.step(dt, scale);
    if (o.pitch === 0 && o.yaw === 0 && o.roll === 0 && o.x === 0 && o.y === 0) return;
    if (mix) {
      const rm = mix.rotMul ?? 1, rMax = ((mix.rotMaxDeg ?? 90) * Math.PI) / 180, tm = mix.transMul ?? 1, tMax = mix.transMax ?? 1;
      const cl = (v, m) => (v > m ? m : v < -m ? -m : v);
      cam.rotateX(cl(o.pitch * rm, rMax)); cam.rotateY(cl(o.yaw * rm, rMax)); cam.rotateZ(cl(o.roll * rm, rMax));
      if (o.x) cam.translateX(cl(o.x * tm, tMax));
      if (o.y) cam.translateY(cl(o.y * tm, tMax));
      return;
    }
    cam.rotateX(o.pitch); cam.rotateY(o.yaw); cam.rotateZ(o.roll);
    if (o.x) cam.translateX(o.x);
    if (o.y) cam.translateY(o.y);
  }
}

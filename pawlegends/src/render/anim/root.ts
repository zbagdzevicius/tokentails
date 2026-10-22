/**
 * Root motion (ANIM-SPEC §4.5): the summed root channels of the playing clips, capped, calmed under reduce motion and
 * written to the character's `mover` group (object → mover → inner). The mover pivots at the centre of mass
 * (comY = 0.45 × height), so flips and rolls turn about the belly; rotation order yaw → pitch → roll, in turns.
 * Object space faces +X: pitch is about Z (a front flip is +), roll about X, yaw about Y. The sim position never moves:
 * rings, bars, telegraphs and the pick box stay on the hitbox; the shadow follows the mesh, so height reads.
 *
 * Squash and stretch (volume kept): dash / blink stretch along the motion from the interpolated speed, landing squash
 * with a spring overshoot, and a hit squash along the hit direction. No allocation per frame.
 */
import type * as THREE from 'three';

export const ROOT_CAPS = Object.freeze({
  /** |fwd|, |side| (m); a dead hero may be flung further. */
  horiz: 0.3,
  horizDead: 0.6,
  /** up (m): the Lambo E apex; 1.2 m for every other clip (checked by root.test.ts). */
  upMax: 1.75,
  upClip: 1.2,
  /** Dash stretch along the motion (and the volume-kept thinning across it). */
  stretch: 1.2,
  thin: 0.88,
  /** Speed (m/s) where the dash stretch starts and where it is full. */
  stretchFrom: 7,
  stretchFull: 18,
});

export const COM_SHARE = 0.45;
const TAU = Math.PI * 2;

/** A volume-keeping squash spring (landing, hits). */
class Spring {
  x = 0;
  v = 0;
  step(dt: number, k: number, c: number): number {
    const h = dt > 1 / 30 ? 1 / 30 : dt;
    this.v += (-k * this.x - c * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }
}

export class RootState {
  /** Summed channels this frame (fwd, side, up m; yaw, pitch, roll turns; sx, sy factors). */
  fwd = 0;
  side = 0;
  up = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  sx = 1;
  sy = 1;
  /** Extra mover yaw (rad) from a clip's `dir`. */
  dirYaw = 0;
  dead = false;
  /** Previous frame's rotation (turns) for the springs' body rate. */
  prevPitch = 0;
  prevRoll = 0;
  pitchRate = 0;
  rollRate = 0;
  private land = new Spring();
  private hit = new Spring();
  private hitX = 1;
  private hitZ = 0;
  private wasUp = 0;
  /** Velocity (object space, m/s) for the dash stretch. */
  velX = 0;
  velZ = 0;

  reset(): void {
    this.fwd = this.side = this.up = this.yaw = this.pitch = this.roll = 0;
    this.sx = this.sy = 1;
    this.dirYaw = 0;
  }

  /** A landing squash (0.7 × 1.2 at k = 1). */
  landKick(k = 1): void {
    this.land.v -= 9 * k;
  }

  /** A hit squash along (dx, dz) in object space. */
  hitKick(dx: number, dz: number, k = 1): void {
    const l = Math.hypot(dx, dz) || 1;
    this.hitX = dx / l;
    this.hitZ = dz / l;
    this.hit.v -= 6 * k;
  }

  /** Write the summed channels to the mover (after the layer stack summed them this frame). */
  apply(mover: THREE.Object3D, inner: THREE.Object3D, height: number, dt: number): void {
    const cap = this.dead ? ROOT_CAPS.horizDead : ROOT_CAPS.horiz;
    const fwd = this.fwd > cap ? cap : this.fwd < -cap ? -cap : this.fwd;
    const side = this.side > cap ? cap : this.side < -cap ? -cap : this.side;
    const up = this.up < 0 ? 0 : this.up > ROOT_CAPS.upMax ? ROOT_CAPS.upMax : this.up;
    // landing: the root came down from a height → a squash with overshoot
    if (this.wasUp > 0.12 && up <= 0.02) this.landKick(Math.min(1.4, 0.5 + this.wasUp));
    this.wasUp = up;
    const ls = this.land.step(dt, 240, 16);
    const hs = this.hit.step(dt, 300, 22);
    const dtSafe = dt > 1e-4 ? dt : 1e-4;
    // rates from the shortest turn difference (a whole-turn wrap is no motion)
    const dp = this.pitch - this.prevPitch;
    const dr = this.roll - this.prevRoll;
    this.pitchRate = ((dp - Math.round(dp)) * TAU) / dtSafe;
    this.rollRate = ((dr - Math.round(dr)) * TAU) / dtSafe;
    this.prevPitch = this.pitch;
    this.prevRoll = this.roll;
    // dash stretch along the velocity (object space)
    const sp = Math.hypot(this.velX, this.velZ);
    const st = sp <= ROOT_CAPS.stretchFrom ? 0 : Math.min(1, (sp - ROOT_CAPS.stretchFrom) / (ROOT_CAPS.stretchFull - ROOT_CAPS.stretchFrom));
    const ax = sp > 1e-3 ? Math.abs(this.velX) / sp : 1;
    const az = sp > 1e-3 ? Math.abs(this.velZ) / sp : 0;
    const along = 1 + (ROOT_CAPS.stretch - 1) * st;
    const thin = 1 + (ROOT_CAPS.thin - 1) * st;
    // land spring: x < 0 is squash (sy down, wide)
    const sqY = 1 + ls * 0.85;
    const hitK = 1 + hs * 0.6;
    let sx = this.sx * (ax * along + (1 - ax)) * (1 / Math.sqrt(sqY));
    let sz = (az * along + (1 - az)) * (1 / Math.sqrt(sqY));
    let sy = this.sy * thin * sqY;
    // hit squash along the hit direction
    sx *= 1 + (hitK - 1) * Math.abs(this.hitX);
    sz *= 1 + (hitK - 1) * Math.abs(this.hitZ);
    // volume: an authored sy without sx thins the body across
    if (this.sx === 1 && this.sy !== 1) {
      const k = 1 / Math.sqrt(this.sy);
      sx *= k;
      sz *= k;
    } else if (this.sy === 1 && this.sx !== 1) {
      const k = 1 / Math.sqrt(this.sx);
      sy *= k;
      sz *= k;
    }
    sx = clampS(sx);
    sy = clampS(sy);
    sz = clampS(sz);
    const comY = COM_SHARE * height;
    mover.position.set(fwd, comY * sy + up, side);
    mover.rotation.set(this.roll * TAU, this.yaw * TAU + this.dirYaw, -this.pitch * TAU, 'YZX');
    mover.scale.set(sx, sy, sz);
    inner.position.y = -comY;
  }
}

const clampS = (s: number): number => (s < 0.45 ? 0.45 : s > 1.6 ? 1.6 : s);

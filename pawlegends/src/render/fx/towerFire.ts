/**
 * V21-FUN §4: the fire on a burning tower or core and the smoulder on fresh rubble (render only). Emitted into the
 * pooled particles (render/fx/Particles.js: one instanced draw per pool), straight through its shared spec: no option
 * objects, no arrays, nothing allocated per frame. Rates per quality tier come from views/towerDamage.ts (Low: half,
 * no embers, shorter smoke). A structure outside the camera's view emits nothing (its state is kept by towerView).
 *
 * Fire is fire: the flames and embers are the same colours for both teams; the smoke is tinted 10% toward the
 * structure's style at the base (cat: pink-grey; dog: brown-grey).
 */
import * as THREE from 'three';
import { FADE, GROW, SHAPE } from './Particles.js';
import { FIRE, fireRates, type FireRates } from '../views/towerDamage';
import type { QualityTier } from '../quality';

/** The part of Particles this uses (tests pass a counting stub). */
export interface FireSink {
  rng: () => number;
  begin(): FireSpec;
  emit(additive: boolean): unknown;
}
/** Particles.js spec fields this writes. */
export interface FireSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size0: number;
  size1: number;
  grow: number;
  fade: number;
  rot: number;
  spin: number;
  gravity: number;
  drag: number;
  r: number;
  g: number;
  b: number;
  a: number;
  intensity: number;
  shape: number;
  stretch: number;
}

/** Linear-light colours (Particles takes linear r, g, b). */
const lin = (hex: number): [number, number, number] => {
  const c = new THREE.Color().setHex(hex);
  return [c.r, c.g, c.b];
};
const SMOKE_CAT = lin(0x8a7890);
const SMOKE_DOG = lin(0x857865);
const SMOKE_DARK = lin(0x3e3a3d);
const FLAME_OUT = lin(0xff8a1e);
const FLAME_CORE = lin(0xffe14a);
const FLAME_RED = lin(0xe8401a);
const EMBER = lin(0xf7bc3c);
const DUST = lin(0x5e5652);

export class TowerFire {
  /** The VFX tier (gameView: the settings' vfxTier, which the governor drops to Low). */
  tier: QualityTier = 'med';
  /** Emitted so far, per kind (tests, the perf readout). */
  readonly count = { smoke: 0, flame: 0, ember: 0, smoulder: 0 };
  private readonly rates: FireRates = { smoke: 0, flame: 0, ember: 0, smokeLife: 0 };
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private haveView = false;
  /** Counts the flame licks (every third crowns the roof). */
  private lick = 0;
  /** The camera's ground position (m): the flames favour the side that faces it. */
  private camX = 0;
  private camZ = 1e6;

  constructor(private readonly p: FireSink) {}

  /** The camera this frame: structures outside its view emit nothing. Without a call every structure emits. */
  view(camera: THREE.Camera): void {
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.camX = camera.position.x;
    this.camZ = camera.position.z;
    this.haveView = true;
  }

  /** Is a structure of this height (m) at (x, z) in view? */
  inView(x: number, z: number, height: number): boolean {
    if (!this.haveView) return true;
    this.sphere.center.set(x, height * 0.55, z);
    this.sphere.radius = height * 0.75 + 1.5;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /**
   * One frame of fire on a structure at state `stage` (2 burning, 3 blazing): `acc` holds its emit accumulators
   * (smoke, flame, ember, smoulder), kept on the structure record. `dog`: the dog style (the smoke tint). `girth`:
   * the model's half-width (m): the flames lick out of its walls and eaves, not inside the roof.
   */
  burn(x: number, z: number, height: number, stage: number, dog: boolean, core: boolean, acc: Float32Array, dt: number, girth = 1.4): void {
    if (stage < 2) return;
    if (!this.inView(x, z, height)) {
      acc[0] = acc[1] = acc[2] = 0;
      return;
    }
    const r = fireRates(stage, this.tier, this.rates);
    const k = core ? FIRE.core : 1;
    const top = height * (core ? 0.8 : 0.9);
    // the flames' band: the upper walls and the eaves (towers), the upper half (core)
    const fy0 = height * (core ? 0.35 : 0.5);
    const fy1 = height * (core ? 0.75 : 0.72);
    const blaze = stage >= 3;
    const rng = this.p.rng;
    // smoke column: soft puffs that rise, drift and grow
    let n = this.take(acc, 0, r.smoke * dt);
    for (let i = 0; i < n; i++) {
      const s = this.p.begin();
      const a = rng() * 6.283;
      const j = 0.35 * k * rng();
      s.x = x + Math.cos(a) * j;
      s.y = top + 0.2;
      s.z = z + Math.sin(a) * j;
      s.vx = 0.25 + (rng() - 0.5) * 0.3;
      s.vy = (blaze ? 1.9 : 1.4) + rng() * 0.5;
      s.vz = (rng() - 0.5) * 0.3;
      s.life = r.smokeLife * (0.85 + rng() * 0.3) * (blaze ? 1.2 : 1);
      s.size0 = (0.55 + rng() * 0.25) * k;
      s.size1 = s.size0 * (blaze ? 3.2 : 2.6);
      s.grow = GROW.OUT;
      s.fade = FADE.IN_OUT;
      s.rot = rng() * 6.283;
      s.spin = (rng() - 0.5) * 0.6;
      s.drag = 0.25;
      const c = blaze ? SMOKE_DARK : dog ? SMOKE_DOG : SMOKE_CAT;
      s.r = c[0];
      s.g = c[1];
      s.b = c[2];
      s.a = blaze ? 0.62 : 0.5;
      s.shape = SHAPE.PUFF;
      this.p.emit(false);
    }
    this.count.smoke += n;
    // flame licks out of the walls and eaves: short, bright, rising, on the side facing the camera (behind the walls
    // they would be hidden)
    n = this.take(acc, 1, r.flame * dt);
    const face = n > 0 ? Math.atan2(this.camZ - z, this.camX - x) : 0;
    for (let i = 0; i < n; i++) {
      // every third lick crowns the roof; the rest lick out of the eaves and upper walls
      this.lick = (this.lick + 1) % 3;
      const crown = this.lick === 0;
      const a = face + (rng() - 0.5) * 2.5;
      const j = crown ? girth * 0.35 * rng() : girth * (0.92 + rng() * 0.18);
      const px = x + Math.cos(a) * j;
      const py = crown ? top - 0.5 * k : fy0 + (fy1 - fy0) * rng();
      const pz = z + Math.sin(a) * j;
      const vx = Math.cos(a) * (crown ? 0.1 : 0.35);
      const vy = 1.4 + rng() * 1.2;
      const vz = Math.sin(a) * (crown ? 0.1 : 0.35);
      const life = FIRE.flameLife * (0.7 + rng() * 0.5);
      const size = (blaze ? 1.75 : 1.3) * (core ? 1.25 : 1) * (0.8 + rng() * 0.4);
      const rot = (rng() - 0.5) * 0.35;
      const spin = (rng() - 0.5) * 0.8;
      // the body: a teardrop pointing up (the particles' DROPLET), normal-blended (an additive orange washes out to
      // white on the pale cat walls), then its yellow core on the same spot, additive, so it glows
      for (let layer = 0; layer < 2; layer++) {
        const glow = layer === 1;
        const s = this.p.begin();
        s.x = px;
        s.y = py + (glow ? 0.05 : 0);
        s.z = pz;
        s.vx = vx;
        s.vy = vy;
        s.vz = vz;
        s.life = life * (glow ? 0.85 : 1);
        s.size0 = size * (glow ? 0.5 : 1);
        s.size1 = s.size0 * 0.3;
        s.grow = GROW.LINEAR;
        s.fade = FADE.HOLD;
        s.rot = rot;
        s.spin = spin;
        const c = glow ? FLAME_CORE : (i & 1) === 0 ? FLAME_OUT : FLAME_RED;
        s.r = c[0];
        s.g = c[1];
        s.b = c[2];
        if (glow) s.intensity = 1.05;
        else s.a = 0.94;
        s.shape = SHAPE.DROPLET;
        this.p.emit(glow);
      }
    }
    this.count.flame += n;
    // embers (none on Low): tiny sparks thrown up and sideways
    n = this.take(acc, 2, r.ember * dt);
    for (let i = 0; i < n; i++) {
      const s = this.p.begin();
      const a = rng() * 6.283;
      s.x = x + Math.cos(a) * girth;
      s.y = fy1;
      s.z = z + Math.sin(a) * girth;
      s.vx = Math.cos(a) * (0.6 + rng() * 0.9);
      s.vy = 2.6 + rng() * 1.6;
      s.vz = Math.sin(a) * (0.6 + rng() * 0.9);
      s.life = FIRE.emberLife * (0.7 + rng() * 0.6);
      s.size0 = 0.07 + rng() * 0.05;
      s.size1 = s.size0 * 0.5;
      s.grow = GROW.LINEAR;
      s.fade = FADE.TWINKLE;
      s.gravity = 1.5;
      s.drag = 0.6;
      s.r = EMBER[0];
      s.g = EMBER[1];
      s.b = EMBER[2];
      s.intensity = 2.6;
      s.shape = SHAPE.SPARK;
      s.stretch = 1.6;
      this.p.emit(true);
    }
    this.count.ember += n;
  }

  /** One frame of smoulder on a fallen structure's rubble at (x, z): thin grey puffs (FIRE.smoulder a second). */
  smoulder(x: number, z: number, acc: Float32Array, dt: number): void {
    if (!this.inView(x, z, 2)) return;
    const n = this.take(acc, 3, FIRE.smoulder * (this.tier === 'low' ? 0.5 : 1) * dt);
    const rng = this.p.rng;
    for (let i = 0; i < n; i++) {
      const s = this.p.begin();
      s.x = x + (rng() - 0.5) * 2.4;
      s.y = 0.45;
      s.z = z + (rng() - 0.5) * 2.4;
      s.vx = 0.2;
      s.vy = 0.8 + rng() * 0.4;
      s.vz = 0;
      s.life = 1.6 + rng() * 0.5;
      s.size0 = 0.6 + rng() * 0.25;
      s.size1 = s.size0 * 2.6;
      s.grow = GROW.OUT;
      s.fade = FADE.IN_OUT;
      s.rot = rng() * 6.283;
      s.drag = 0.4;
      s.r = DUST[0];
      s.g = DUST[1];
      s.b = DUST[2];
      s.a = 0.55;
      s.shape = SHAPE.PUFF;
      this.p.emit(false);
    }
    this.count.smoulder += n;
  }

  /** Whole particles due on accumulator `i` after adding `add` (at most FIRE.perFrame). */
  private take(acc: Float32Array, i: number, add: number): number {
    let v = acc[i] + add;
    let n = Math.floor(v);
    v -= n;
    if (n > FIRE.perFrame) n = FIRE.perFrame;
    acc[i] = v;
    return n;
  }
}

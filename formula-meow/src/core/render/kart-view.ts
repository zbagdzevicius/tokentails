/**
 * One kart on screen (GDD 7, 11; feel lane): a procedural low-poly body (six bodies, kart-bodies.ts), two wheel axles
 * that spin, steer and counter-steer in drifts, the cat driver (copied bad-cat rig), its hat (hats.ts), an outline on
 * the body, and a boost flame (hidden: the juice lane draws the flames). Reads interpolated sim state and race events;
 * never writes the sim.
 *
 * Animation (render only, ITERATION-2.md "Kart and cat animation"):
 *  - lean 0.28 rad in a drift with the head leaning in 0.4; a gentle lean with the steer otherwise
 *  - squash and stretch: boost (z 1.12, y 0.92), hop (y 1.15), a 0.3 landing squash after more than 0.5 s of air
 *  - suspension bob ±0.03 m with speed; front wheels counter-steer in a drift
 *  - hits: spin (two turns), cucumber leap (a full barrel roll, paws up), wobble (rocking, ears flinch), Laser Dot
 *    chase (the head tracks the dot)
 *  - celebrate: a fist pump on an overtake; finish poses by place (1st both paws and the tail up, 2nd–3rd a wave,
 *    4th+ head down and a shake); tricks pick one of three poses (barrel roll, superman, spin)
 *  - items: a cough before a hairball, a throw swipe for the rest, ducking into the Cardboard Box, running on the roof
 *    during Zoomies
 */
import { AdditiveBlending, ConeGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { KartState, RaceEvent, RacerInfo } from '../../types';
import { GeoBuilder } from './geo';
import { toonMaterial } from './toon';
import { buildCatRig, disposeCatRig, poseCat, setCatGhost, type CatRig } from './cat-rig';
import { OUTLINE_NAME, outlineFor } from './cat-outline';
import { disposeMaterial } from '../track/mesh';
import { SEAT_Y, bodyGeo, bodyIdOf } from './kart-bodies';
import { buildHat, disposeHat, spinHat } from './hats';

/** scratch for the set-piece basis (SIM_VERSION 8) */
const _bu = new Vector3();
const _bf = new Vector3();
const _br = new Vector3();
const _bm = new Matrix4();

export const WHEEL_R = 0.38;
const CAT_IN_KART = 1.75;
const KART_SCALE = 0.84;
const TAU = Math.PI * 2;

/** Animation numbers (ITERATION-2.md). */
export const ANIM = {
  driftLean: 0.28,
  headLean: 0.4,
  steerLean: 0.1,
  boostStretch: { z: 1.12, y: 0.92 },
  hopStretch: 1.15,
  landSquash: 0.3,
  /** seconds of air before a landing squashes */
  landAir: 0.5,
  bob: 0.03,
  counterSteer: 0.35,
  steerWheel: 0.4,
  /** finish poses and celebrations last this long (s) */
  fistPump: 0.55,
  trickTime: 0.6,
  cough: 0.35,
  throwTime: 0.32,
  flinch: 0.4,
} as const;

/** Ease out-in bump 0 → 1 → 0 over u in 0..1. */
const bump = (u: number): number => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI));
const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export type FinishPose = 'none' | 'win' | 'wave' | 'sulk';

export class KartView {
  readonly root = new Group();
  /** visual body (lean, squash) */
  readonly body = new Group();
  readonly front: Mesh;
  readonly rear: Mesh;
  readonly frontPivot = new Group();
  readonly cat: CatRig;
  readonly flame: Mesh;
  readonly hat: Object3D | null;
  /** render-only animation state */
  private wheelAngle = 0;
  private squash = 0;
  private squashAmp = 0;
  private airTime = 0;
  private lastAir = 0;
  private lean = 0;
  private headLean = 0;
  private spinAngle = 0;
  private stretch = 0;
  private time = 0;
  private bobPhase = 0;
  /** timers (s) counting down from their start; 0 = off */
  private pump = 0;
  private cough = 0;
  private throwT = 0;
  private flinch = 0;
  private trickT = 0;
  private trickPose = 0;
  private tricks = 0;
  private finish: FinishPose = 'none';
  private finishT = 0;
  /** the Laser Dot world point the head tracks while chasing (null: none) */
  private dotX = 0;
  private dotZ = 0;
  private dotOn = false;
  private readonly seatY: number;
  /** the kart's own toon material (body + axles) */
  private readonly mat;
  /** current near-camera fade (B59), 1 = solid */
  private fade = 1;

  constructor(readonly info: RacerInfo) {
    this.root.name = `kart-${info.name}`;
    this.root.scale.setScalar(KART_SCALE);
    this.root.add(this.body);
    const mat = toonMaterial({ vertexColors: true });
    this.mat = mat;
    const bodyMesh = new Mesh(bodyGeo(info.kart).build(), mat);
    bodyMesh.castShadow = false;
    bodyMesh.add(outlineFor(bodyMesh));
    this.body.add(bodyMesh);

    this.front = new Mesh(axleGeo(info.kart.paint[1], 0.82).build(), mat);
    this.rear = new Mesh(axleGeo(info.kart.paint[1], 0.88).build(), mat);
    this.frontPivot.position.set(0, WHEEL_R, 0.95);
    this.frontPivot.add(this.front);
    this.rear.position.set(0, WHEEL_R, -0.85);
    this.body.add(this.frontPivot, this.rear);

    this.cat = buildCatRig(info.cat);
    this.cat.root.scale.setScalar(CAT_IN_KART);
    this.seatY = SEAT_Y[bodyIdOf(info.kart)];
    this.cat.root.position.set(0, this.seatY, -0.05);
    this.body.add(this.cat.root);
    this.hat = buildHat(info.hat);
    if (this.hat) this.cat.head.add(this.hat);
    // [integrator] this view draws the hat (and race-view the trail): the progression lane's fallbacks stand down
    this.root.userData.cosmetics = true;

    const flameGeo = new ConeGeometry(0.22, 1.1, 8);
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.55);
    this.flame = new Mesh(flameGeo, new MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.flame.position.set(0, 0.45, -1.3);
    this.flame.visible = false;
    this.body.add(this.flame);
  }

  get object(): Object3D {
    return this.root;
  }

  /** Faded out next to the camera (B59): its flames, trails and puffs are skipped too. */
  get fadedOut(): boolean {
    return this.fade === 0;
  }

  setGhost(opacity: number): void {
    setCatGhost(this.cat, opacity);
    const own = new Set<unknown>([this.cat.fur, this.cat.faceMat, this.cat.detailMat]); // per-cat, already faded
    this.body.traverse((o) => {
      const m = o as Mesh;
      // the outline material is shared by every cat: hide the ghost's outline instead of fading the shared one
      if (o.name === OUTLINE_NAME) {
        o.visible = opacity >= 1;
        return;
      }
      if (m.isMesh && m.material && !Array.isArray(m.material) && !own.has(m.material)) {
        // materials may be shared with the real karts: fade a private copy (once)
        if (!m.userData.ghostMat) {
          m.material = m.material.clone();
          m.userData.ghostMat = true;
        }
        m.material.transparent = opacity < 1;
        m.material.opacity = opacity;
      }
    });
  }

  /** Race events that start an animation (the feel lane routes the JuiceBus here). */
  onEvent(e: RaceEvent): void {
    switch (e.type) {
      case 'overtake':
        this.pump = ANIM.fistPump;
        break;
      case 'trick':
        this.trickT = ANIM.trickTime;
        this.trickPose = this.tricks++ % 3;
        break;
      case 'itemUse':
        if (e.item === 'hairball') this.cough = ANIM.cough;
        else if (e.item !== 'box' && e.item !== 'zoomies' && e.item !== 'catnip') this.throwT = ANIM.throwTime;
        break;
      case 'hit':
        if (e.a === 2) this.flinch = ANIM.flinch; // wobble: the bell, a wall, a bump
        break;
      case 'wall':
        if (e.a === 2) this.flinch = ANIM.flinch;
        break;
      case 'finish':
        this.setFinish((e.a ?? 8) === 1 ? 'win' : (e.a ?? 8) <= 3 ? 'wave' : 'sulk');
        break;
    }
  }

  /** Finish pose (also used by the podium and the garage). */
  setFinish(p: FinishPose): void {
    this.finish = p;
    this.finishT = 0;
  }

  /** The Laser Dot's position for the head to track (call each frame while chasing; `null` stops it). */
  lookAtDot(x: number | null, z = 0): void {
    this.dotOn = x != null;
    if (x != null) {
      this.dotX = x;
      this.dotZ = z;
    }
  }

  /**
   * Pose from interpolated state. `pos`/`heading` are interpolated; `k` is the latest sim state (timers, flags).
   * `pitch`/`roll` come from the track surface. `dt` is real seconds since the last frame (render clock).
   */
  /**
   * `basis` (SIM_VERSION 8 set pieces): when given, the kart sits on a bent surface (a loop's ribbon, a curled wall
   * lane): its root takes that up / forward instead of the heading (pitch and roll are then 0).
   */
  update(k: KartState, x: number, y: number, z: number, heading: number, pitch: number, roll: number, speed: number, dt: number, topSpeed: number, basis: { ux?: number; uy?: number; uz?: number; fx?: number; fy?: number; fz?: number } | null = null): void {
    this.time += dt;
    const fast = Math.min(1, speed / topSpeed);
    // B58: no per-frame arrays
    if (this.pump > 0) this.pump = Math.max(0, this.pump - dt);
    if (this.cough > 0) this.cough = Math.max(0, this.cough - dt);
    if (this.throwT > 0) this.throwT = Math.max(0, this.throwT - dt);
    if (this.flinch > 0) this.flinch = Math.max(0, this.flinch - dt);
    if (this.trickT > 0) this.trickT = Math.max(0, this.trickT - dt);
    if (this.finish !== 'none') this.finishT += dt;

    // --- whole kart: hop, spin-out, trick yaw ---------------------------------------------------------------------
    if (k.spinTicks > 0) this.spinAngle += dt * 11;
    else this.spinAngle *= Math.max(0, 1 - dt * 10);
    const hopU = k.hopTicks > 0 ? 1 - k.hopTicks / 9 : 0;
    const hop = k.hopTicks > 0 ? Math.sin(hopU * Math.PI) * 0.25 : 0;
    // suspension bob: small bumps with speed, none in the air
    this.bobPhase += dt * (4 + speed * 0.9);
    const bob = k.air ? 0 : (Math.sin(this.bobPhase) * 0.6 + Math.sin(this.bobPhase * 2.3) * 0.4) * ANIM.bob * Math.min(1, speed / 6);
    const trickU = this.trickT > 0 ? 1 - this.trickT / ANIM.trickTime : 0;
    const trickYaw = this.trickT > 0 && this.trickPose === 2 ? smooth(trickU) * TAU : 0;
    if (basis && basis.ux !== undefined) {
      _bu.set(basis.ux, basis.uy!, basis.uz!);
      _bf.set(basis.fx!, basis.fy!, basis.fz!);
      _br.crossVectors(_bu, _bf).normalize();
      _bf.crossVectors(_br, _bu).normalize();
      _bm.makeBasis(_br, _bu, _bf);
      this.root.quaternion.setFromRotationMatrix(_bm);
      if (this.spinAngle + trickYaw !== 0) this.root.rotateY(this.spinAngle + trickYaw);
      this.root.position.set(x + _bu.x * (hop + bob), y + _bu.y * (hop + bob), z + _bu.z * (hop + bob));
    } else {
      this.root.position.set(x, y + hop + bob, z);
      this.root.rotation.set(0, heading + this.spinAngle + trickYaw, 0);
    }

    // --- body: lean, pitch, squash and stretch, barrel rolls -------------------------------------------------------
    const leanTarget = k.driftDir !== 0 ? k.driftDir * ANIM.driftLean : k.steer * ANIM.steerLean * Math.min(1, speed / 10);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 10);
    const headTarget = k.driftDir !== 0 ? -k.driftDir * ANIM.headLean : -k.steer * 0.2;
    this.headLean += (headTarget - this.headLean) * Math.min(1, dt * 8);
    // landing squash after a long jump
    if (k.air) this.airTime += dt;
    if (this.lastAir && !k.air) {
      if (this.airTime > ANIM.landAir) this.squashAmp = 1;
      else if (this.airTime > 0.15) this.squashAmp = 0.4;
      else this.squashAmp = 0;
      if (this.squashAmp > 0) this.squash = 1;
      this.airTime = 0;
    }
    this.lastAir = k.air;
    this.squash = Math.max(0, this.squash - dt * 4.5);
    // squash at once on touchdown, spring back through a small stretch
    const su = this.squash;
    const sq = ANIM.landSquash * this.squashAmp * (su > 0.3 ? (su - 0.3) / 0.7 : -0.25 * Math.sin((su / 0.3) * Math.PI));
    // boost stretch eases in and out
    this.stretch += ((k.boostTicks > 0 ? 1 : 0) - this.stretch) * Math.min(1, dt * 9);
    const sz = 1 + (ANIM.boostStretch.z - 1) * this.stretch;
    let sy = 1 + (ANIM.boostStretch.y - 1) * this.stretch;
    if (k.hopTicks > 0) sy *= 1 + (ANIM.hopStretch - 1) * Math.sin(hopU * Math.PI);
    sy *= 1 - sq;
    const sxz = 1 + sq * 0.5;
    let rollExtra = 0;
    if (k.leapTicks > 0) rollExtra = smooth(1 - k.leapTicks / 54) * TAU; // a full barrel roll over the 0.9 s leap
    else if (this.trickT > 0 && this.trickPose === 0) rollExtra = smooth(trickU) * TAU;
    let wob = 0;
    if (k.wobbleTicks > 0) wob = Math.sin(this.time * 26) * 0.16 * Math.min(1, k.wobbleTicks / 20);
    const superman = this.trickT > 0 && this.trickPose === 1 ? bump(trickU) : 0;
    this.body.rotation.set(pitch + (k.air ? -0.12 : 0) - superman * 0.25, 0, roll + this.lean + rollExtra + wob);
    this.body.scale.set(sxz, sy, sz * sxz);
    this.body.position.y = rollExtra !== 0 ? Math.sin(rollExtra / 2) * 0.5 : 0;

    // --- wheels: spin with speed; front steers, counter-steers in a drift -------------------------------------------
    this.wheelAngle += (speed * dt) / WHEEL_R;
    this.front.rotation.x = this.wheelAngle;
    this.rear.rotation.x = this.wheelAngle;
    const steerY = k.driftDir !== 0 ? k.driftDir * ANIM.counterSteer : -k.steer * ANIM.steerWheel;
    this.frontPivot.rotation.y += (steerY - this.frontPivot.rotation.y) * Math.min(1, dt * 14);

    // core flame (the juice lane draws the real flames and keeps this hidden)
    const boosting = k.boostTicks > 0;
    this.flame.visible = false;
    if (boosting) this.flame.scale.set(1, 1, 0.8 + 0.35 * Math.sin(this.time * 60));

    // --- the cat ------------------------------------------------------------------------------------------------------
    this.poseDriver(k, fast);
    spinHat(this.hat, speed, dt);
  }

  private poseDriver(k: KartState, fast: number): void {
    const cat = this.cat;
    const zoom = k.autoTicks > 0;
    const boxed = k.shieldTicks > 0;
    // seat, box duck, Zoomies roof run
    const seatY = this.seatY + (zoom ? 0.62 : 0) - (boxed ? 0.32 : 0);
    cat.root.position.y += (seatY - cat.root.position.y) * 0.3;
    cat.root.position.z = zoom ? -0.25 : -0.05;
    const leap = k.leapTicks > 0;
    let headYaw = -k.steer * 0.32 + this.headLean;
    let headPitch = -0.05 * fast;
    if (this.dotOn) {
      // the Laser Dot: the head snaps toward it (relative to the kart's facing)
      const p = this.root.position;
      const a = Math.atan2(this.dotX - p.x, this.dotZ - p.z) - this.root.rotation.y;
      headYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(Math.sin(a), Math.cos(a))));
      headPitch = 0.35;
    }
    const coughU = this.cough > 0 ? 1 - this.cough / ANIM.cough : 0;
    headPitch += bump(coughU) * 0.55;
    if (this.flinch > 0) {
      const u = 1 - this.flinch / ANIM.flinch;
      headPitch += bump(u) * 0.35;
      headYaw += Math.sin(u * 30) * 0.15 * (1 - u);
    }
    let lid: 'open' | 'half' | 'closed' | undefined = k.spinTicks > 0 || leap || this.flinch > 0.2 ? 'closed' : k.boostTicks > 0 ? 'half' : undefined;
    // finish poses
    const f = this.finish;
    if (f === 'win') lid = 'closed';
    if (f === 'sulk') {
      lid = 'half';
      headPitch += 0.4;
      headYaw += Math.sin(this.finishT * 9) * 0.35 * Math.max(0, 1 - this.finishT / 3);
    }
    poseCat(cat, {
      T: this.time * 30,
      act: leap ? 3 : 0,
      actP: leap ? 1 - k.leapTicks / 54 : 0,
      moving: zoom ? 2 : 0,
      phase: this.time * 16,
      blink: Math.sin(this.time * 1.7 + this.root.id) > 0.985,
      headYaw,
      headPitch,
      loaf: 0,
      sit: zoom ? 0 : 1,
      lid,
    });
    if (!zoom) {
      for (let i = 0; i < cat.tail.length; i++) {
        cat.tail[i].rotation.x = 0.2 + (1 - fast) * 0.5 - i * 0.1 * fast;
        cat.tail[i].rotation.y = Math.sin(this.time * (6 + 10 * fast) + i) * (0.15 + 0.25 * fast);
      }
    }
    // paws: leap (arms up), superman, fist pump, throw swipe, wave / both up at the finish
    const L = cat.legs[0];
    const R = cat.legs[1];
    const up = -2.7; // paw straight up (relative, on top of the sit pose)
    if (leap) {
      L.rotation.x = R.rotation.x = up;
      L.rotation.z = 0.4;
      R.rotation.z = -0.4;
    }
    const superman = this.trickT > 0 && this.trickPose === 1 ? bump(1 - this.trickT / ANIM.trickTime) : 0;
    if (superman > 0) L.rotation.x = R.rotation.x = -1.6 * superman + L.rotation.x * (1 - superman);
    if (this.pump > 0) R.rotation.x = up * bump(1 - this.pump / ANIM.fistPump) + R.rotation.x * (1 - bump(1 - this.pump / ANIM.fistPump));
    if (this.throwT > 0) {
      const u = 1 - this.throwT / ANIM.throwTime;
      R.rotation.x += -2.2 * bump(u);
      R.rotation.z = 0.6 * Math.sin(u * Math.PI * 2);
    }
    if (f === 'win') {
      const b = Math.abs(Math.sin(this.finishT * 7)) * 0.25;
      L.rotation.x = R.rotation.x = up - b;
      L.rotation.z = 0.35;
      R.rotation.z = -0.35;
      cat.tail[0].rotation.x = -0.6; // tail up
    } else if (f === 'wave') {
      R.rotation.x = up + 0.3;
      R.rotation.z = -0.3 + Math.sin(this.finishT * 12) * 0.45;
    }
  }

  /**
   * Fade a kart that is close to the camera (B59: rivals 5–7 m from the lens filled a corner of the screen):
   * 0 hides it, 1 is solid. Only the kart's own materials change (the outline is shared, so it is hidden instead).
   * Faded karts still write depth, so a half-faded kart reads as one soft shape instead of an x-ray of its parts.
   */
  setFade(f: number): void {
    // remapped so the first third of the fade is fully hidden: a big see-through kart filling the bottom of the screen
    // read worse than no kart at all
    const g = Math.max(0, Math.min(1, (f - 0.35) / 0.65));
    const e = g * g * (3 - 2 * g);
    const v = e < 0.02 ? 0 : e > 0.98 ? 1 : Math.round(e * 20) / 20;
    // the race view sets `visible` each frame (respawn): only ever hide here
    if (v === 0) this.root.visible = false;
    if (v === this.fade) return;
    const was = this.fade;
    this.fade = v;
    if (v === 0) return;
    const solid = v >= 1;
    if (solid !== was >= 1 || was === 0) {
      this.body.traverse((o) => {
        if (o.name === OUTLINE_NAME) o.visible = solid;
      });
    }
    for (const m of [this.mat, this.cat.fur, this.cat.faceMat, this.cat.detailMat] as Array<{ transparent: boolean; opacity: number; depthWrite: boolean; needsUpdate: boolean }>) {
      if (m.transparent === solid) {
        m.transparent = !solid;
        m.needsUpdate = true;
      }
      m.opacity = v;
      m.depthWrite = true;
    }
    if (this.hat) this.hat.visible = solid || v > 0.6;
  }

  /** Free everything this kart owns (B57: materials and the flame leaked on every restart). */
  dispose(): void {
    disposeHat(this.hat);
    disposeCatRig(this.cat);
    const mats = new Set<unknown>();
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (o.name !== OUTLINE_NAME) m.geometry.dispose();
      if (!Array.isArray(m.material)) mats.add(m.material);
    });
    for (const m of mats) disposeMaterial(m as Parameters<typeof disposeMaterial>[0]);
  }
}

function axleGeo(hub: number, width: number): GeoBuilder {
  const g = new GeoBuilder();
  for (const s of [-1, 1]) {
    g.cyl(WHEEL_R, WHEEL_R, 0.32, 10, 0x2a2430, { x: s * width, rz: Math.PI / 2 }, { vary: 0.08 });
    g.cyl(WHEEL_R * 0.5, WHEEL_R * 0.5, 0.34, 6, hub, { x: s * width, rz: Math.PI / 2 }, { vary: 0 });
  }
  return g;
}

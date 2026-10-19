/**
 * One kart on screen (GDD 7, 11): a procedural low-poly body (Tuna Can, Shoebox or Sardine F1, looks only), two
 * wheel axles that spin and steer, the cat driver (copied bad-cat rig, sitting, leaning into turns, tail as a
 * flag), an outline on the body, and a boost flame. Reads interpolated sim state; never writes the sim.
 */
import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { KartState, RacerInfo } from '../../types';
import { GeoBuilder } from './geo';
import { toonMaterial } from './toon';
import { buildCatRig, disposeCatRig, poseCat, setCatGhost, type CatRig } from './cat-rig';
import { OUTLINE_NAME, outlineFor } from './cat-outline';
import { shadeHex } from './palette';

export const WHEEL_R = 0.38;
const CAT_IN_KART = 1.75;
const KART_SCALE = 0.84;

function bodyGeo(look: RacerInfo['kart']): GeoBuilder {
  const [p0, p1, p2] = look.paint;
  const g = new GeoBuilder();
  const dark = 0x2a1a22;
  switch (look.body % 3) {
    case 0: {
      // Tuna Can: a squat round can with a ring pull spoiler
      g.cyl(0.78, 0.82, 0.62, 12, p0, { y: 0.48, rx: Math.PI / 2, sy: 1.6, sz: 0.62 });
      g.cyl(0.8, 0.8, 0.12, 12, p1, { y: 0.48, z: 0.96, rx: Math.PI / 2, sz: 0.62 });
      g.cyl(0.8, 0.8, 0.12, 12, p1, { y: 0.48, z: -0.96, rx: Math.PI / 2, sz: 0.62 });
      g.box(1.2, 0.08, 0.5, p2, { y: 0.95, z: -0.95 });
      g.torus(0.22, 0.05, p1, { y: 1.08, z: -0.95, rx: Math.PI / 2 }, undefined, 4, 10);
      g.box(0.9, 0.12, 0.6, dark, { y: 0.78, z: 0.15 }); // seat
      break;
    }
    case 1: {
      // Shoebox: a cardboard box kart with flaps
      g.boxUp(1.5, 0.55, 2.1, p0, { y: 0.2 });
      g.box(1.52, 0.1, 0.5, p1, { y: 0.78, z: 0.8, rx: -0.5 });
      g.box(0.5, 0.06, 1.2, p1, { x: 0.95, y: 0.72, z: -0.2, rz: -0.6 });
      g.box(0.5, 0.06, 1.2, p1, { x: -0.95, y: 0.72, z: -0.2, rz: 0.6 });
      g.box(1.0, 0.12, 0.7, dark, { y: 0.77, z: 0.0 });
      break;
    }
    default: {
      // Sardine F1: long fish nose, front and rear wings
      g.box(0.8, 0.42, 2.3, p0, { y: 0.45, z: 0.1 });
      g.cone(0.36, 1.0, 6, p0, { y: 0.42, z: 1.7, rx: Math.PI / 2, sx: 1.1, sz: 0.7 });
      g.box(1.7, 0.08, 0.45, p1, { y: 0.3, z: 1.95 });
      g.box(1.5, 0.1, 0.5, p2, { y: 1.05, z: -1.05 });
      g.box(0.08, 0.5, 0.4, p2, { x: 0.65, y: 0.8, z: -1.05 });
      g.box(0.08, 0.5, 0.4, p2, { x: -0.65, y: 0.8, z: -1.05 });
      // fish tail fin
      g.cone(0.4, 0.6, 3, p1, { y: 0.7, z: -1.45, rx: -Math.PI / 2, sx: 0.25 });
      g.box(0.9, 0.12, 0.6, dark, { y: 0.7, z: -0.1 });
      break;
    }
  }
  // side pods + bumper (shared look language)
  g.box(1.8, 0.16, 0.3, shadeHex(p0, 0.7), { y: 0.25, z: 1.25 });
  g.box(0.25, 0.25, 1.2, shadeHex(p0, 0.8), { x: 0.85, y: 0.32, z: 0.0 });
  g.box(0.25, 0.25, 1.2, shadeHex(p0, 0.8), { x: -0.85, y: 0.32, z: 0.0 });
  // steering wheel
  g.torus(0.16, 0.035, dark, { y: 0.98, z: 0.55, rx: -0.9 }, undefined, 4, 10);
  g.cyl(0.03, 0.03, 0.3, 4, dark, { y: 0.88, z: 0.5, rx: -0.9 });
  // exhaust pipes
  g.cyl(0.08, 0.1, 0.4, 6, 0x9a92b8, { x: 0.35, y: 0.45, z: -1.15, rx: Math.PI / 2 });
  g.cyl(0.08, 0.1, 0.4, 6, 0x9a92b8, { x: -0.35, y: 0.45, z: -1.15, rx: Math.PI / 2 });
  return g;
}

function axleGeo(hub: number, width: number): GeoBuilder {
  const g = new GeoBuilder();
  for (const s of [-1, 1]) {
    g.cyl(WHEEL_R, WHEEL_R, 0.32, 10, 0x2a2430, { x: s * width, rz: Math.PI / 2 }, { vary: 0.08 });
    g.cyl(WHEEL_R * 0.5, WHEEL_R * 0.5, 0.34, 6, hub, { x: s * width, rz: Math.PI / 2 }, { vary: 0 });
  }
  return g;
}

export class KartView {
  readonly root = new Group();
  /** visual body (lean, squash) */
  readonly body = new Group();
  readonly front: Mesh;
  readonly rear: Mesh;
  readonly frontPivot = new Group();
  readonly cat: CatRig;
  readonly flame: Mesh;
  /** render-only animation state */
  private wheelAngle = 0;
  private squash = 0;
  private lastAir = 0;
  private lean = 0;
  private spinAngle = 0;
  private time = 0;

  constructor(readonly info: RacerInfo) {
    this.root.name = `kart-${info.name}`;
    // toy scale: the karts read ~1.8 m long, matching the 0.9 m contact circles (GDD 3.2)
    this.root.scale.setScalar(KART_SCALE);
    this.root.add(this.body);
    const mat = toonMaterial({ vertexColors: true });
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
    this.cat.root.position.set(0, 0.45, -0.05);
    this.body.add(this.cat.root);

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

  setGhost(opacity: number): void {
    setCatGhost(this.cat, opacity);
    const own = new Set<unknown>([this.cat.fur, this.cat.faceMat, this.cat.detailMat]); // per-cat, already faded
    this.body.traverse((o) => {
      const m = o as Mesh;
      // the outline material is shared by every cat: hide the ghost's outline instead of fading the shared one
      if (o.name === OUTLINE_NAME) {
        o.visible = false;
        return;
      }
      if (m.isMesh && m.material && !Array.isArray(m.material) && !own.has(m.material)) {
        // materials may be shared with the real karts: fade a private copy (once)
        if (!m.userData.ghostMat) {
          m.material = m.material.clone();
          m.userData.ghostMat = true;
        }
        m.material.transparent = true;
        m.material.opacity = opacity;
      }
    });
  }

  /**
   * Pose from interpolated state. `pos`/`heading` are interpolated; `k` is the latest sim state (timers, flags).
   * `pitch`/`roll` come from the track surface. `dt` is real seconds since the last frame (render clock).
   */
  update(k: KartState, x: number, y: number, z: number, heading: number, pitch: number, roll: number, speed: number, dt: number, topSpeed: number): void {
    this.time += dt;
    // spin-out: two full turns over the spin time, cucumber leap: a scared stretch
    if (k.spinTicks > 0) this.spinAngle += dt * 11;
    else this.spinAngle *= Math.max(0, 1 - dt * 10);
    const hop = k.hopTicks > 0 ? Math.sin((1 - k.hopTicks / 9) * Math.PI) * 0.25 : 0;
    this.root.position.set(x, y + hop, z);
    this.root.rotation.set(0, heading + this.spinAngle, 0);
    // lean into turns / drifts, pitch with the slope
    const leanTarget = k.driftDir !== 0 ? k.driftDir * 0.16 : k.steer * 0.08 * Math.min(1, speed / 10);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 10);
    // landing squash
    if (this.lastAir && !k.air) this.squash = 1;
    this.lastAir = k.air;
    this.squash = Math.max(0, this.squash - dt * 7);
    const sq = Math.sin(this.squash * Math.PI) * 0.18;
    this.body.rotation.set(pitch + (k.air ? -0.12 : 0), 0, roll + this.lean);
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    if (k.leapTicks > 0) this.body.position.y = Math.sin(this.time * 40) * 0.05;
    else this.body.position.y = 0;

    // wheels
    this.wheelAngle += (speed * dt) / WHEEL_R;
    this.front.rotation.x = this.wheelAngle;
    this.rear.rotation.x = this.wheelAngle;
    this.frontPivot.rotation.y = -k.steer * 0.4;

    // flame
    const boosting = k.boostTicks > 0;
    this.flame.visible = boosting;
    if (boosting) {
      const f = 0.8 + 0.35 * Math.sin(this.time * 60) + (k.boostLevel > 1.32 ? 0.4 : 0);
      this.flame.scale.set(1, 1, f);
      (this.flame.material as MeshBasicMaterial).color.setHex(k.autoTicks > 0 ? 0xff3ea5 : k.boostLevel >= 1.35 ? 0x5ad8ff : 0xffb03a);
    }

    // cat: sitting, head leans into the turn, tail streams back with speed
    const fast = Math.min(1, speed / topSpeed);
    poseCat(this.cat, {
      T: this.time * 30,
      act: k.leapTicks > 0 ? 3 : 0,
      actP: k.leapTicks > 0 ? 1 - k.leapTicks / 54 : 0,
      moving: 0,
      phase: 0,
      blink: Math.sin(this.time * 1.7) > 0.985,
      headYaw: -k.steer * 0.32 - this.lean * 0.8,
      headPitch: -0.05 * fast,
      loaf: 0,
      sit: 1,
      lid: k.spinTicks > 0 || k.leapTicks > 0 ? 'closed' : k.boostTicks > 0 ? 'half' : undefined,
    });
    for (let i = 0; i < this.cat.tail.length; i++) {
      this.cat.tail[i].rotation.x = 0.2 + (1 - fast) * 0.5 - i * 0.1 * fast;
      this.cat.tail[i].rotation.y = Math.sin(this.time * (6 + 10 * fast) + i) * (0.15 + 0.25 * fast);
    }
  }

  dispose(): void {
    disposeCatRig(this.cat);
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

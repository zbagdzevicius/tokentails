// Mochi: the orange-and-white kitten. A procedural toon rig built from primitives (pattern from ultra-cat's
// cats/model.ts, rescaled to game units: ~1.15 u to the ear tips). Core places root at the player every frame
// (local +z forward, +y up, +x = runner's left); animate() drives every pose from the PlayerView:
// run (bound gait), jump, pounce somersault, slide, landing squash, the tail-vault pole, claws on walls,
// sitting on the puff cloud, surfing the leaf, hit, wet shake, and a victory wave at the finish.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getQuality } from '../core/engine';
import { events } from '../core/events';
import { P } from '../core/player';
import { game } from '../core/state';
import type { KittenRig, PlayerView } from '../core/types';
import { approach, easeOut, flipAngle, gait, hump, newGait, poleCurve, smooth, springWobble, strideRate, tailCurve, type TailPose } from './anim';
import { buildLeaf, buildPuffCloud } from './puff';
import { canvasTex, flat, geo, outline, part, prng, setOutlines, SPHERE, SPHERE_LO, toon } from './toon';

export const MOCHI = {
  orange: 0xf7953a,
  orangeDark: 0xcf5f1c,
  white: 0xfff7ec,
  pink: 0xffa0b4,
  nose: 0xff7a92,
  eye: 0x2a1a14,
};
const HIP_Y = 0.42;
const TAIL_N = 16;
const TAIL_BASE: [number, number, number] = [0, 0.1, -0.31];

function paintFur(g: CanvasRenderingContext2D, w: number, h: number): void {
  const R = prng(7);
  g.fillStyle = '#f7953a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,200,120,0.22)' : 'rgba(190,90,20,0.14)';
    g.fillRect(R() * w, R() * h, 2, 5);
  }
  // bold wavy tabby stripes on the back half (top of the sphere), thinner toward the sides
  g.fillStyle = '#cf5f1c';
  for (let s = 0; s < 12; s++) {
    const x0 = (s / 12) * w + R() * 8;
    const sw = 9 + R() * 7;
    g.beginPath();
    g.moveTo(x0, 0);
    for (let y = 0; y <= h * 0.62; y += 10) g.lineTo(x0 + Math.sin(y * 0.06 + s) * 7, y);
    for (let y = Math.floor(h * 0.62); y >= 0; y -= 10) g.lineTo(x0 + sw * (1 - y / (h * 0.75)) + Math.sin(y * 0.06 + s) * 7, y);
    g.closePath();
    g.fill();
  }
  // white tummy band at the bottom
  const grad = g.createLinearGradient(0, h * 0.62, 0, h * 0.78);
  grad.addColorStop(0, 'rgba(255,247,236,0)');
  grad.addColorStop(1, 'rgba(255,247,236,1)');
  g.fillStyle = grad;
  g.fillRect(0, h * 0.62, w, h * 0.38);
}

function paintHead(g: CanvasRenderingContext2D, w: number, h: number): void {
  const R = prng(9);
  g.fillStyle = '#f7953a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,200,120,0.22)' : 'rgba(190,90,20,0.12)';
    g.fillRect(R() * w, R() * h, 2, 5);
  }
  g.fillStyle = '#cf5f1c';
  // the tabby "M" on the forehead (u = 0.25 is the front of a three.js sphere)
  const stripe = (cx: number, y0: number, y1: number, wd: number) => {
    g.beginPath();
    g.moveTo(cx - wd / 2, y0);
    g.quadraticCurveTo(cx + wd * 0.4, (y0 + y1) / 2, cx, y1);
    g.quadraticCurveTo(cx + wd * 0.9, (y0 + y1) / 2, cx + wd / 2, y0);
    g.closePath();
    g.fill();
  };
  for (let i = -1; i <= 1; i++) stripe(w * 0.25 + i * 20, h * 0.04, h * (i === 0 ? 0.36 : 0.3), 12);
  // bold stripes over the crown and down the back of the head (what the chase camera sees)
  for (let i = -3; i <= 3; i++) stripe(w * 0.75 + i * 26, 0, h * (0.52 - Math.abs(i) * 0.04), 16);
  for (const side of [-1, 1]) {
    // cheek stripes
    for (let k = 0; k < 2; k++) {
      g.fillRect(w * 0.25 + side * (70 + k * 14) - 4, h * (0.45 + k * 0.07), 26, 5);
    }
  }
  const grad = g.createLinearGradient(0, h * 0.62, 0, h * 0.78);
  grad.addColorStop(0, 'rgba(255,247,236,0)');
  grad.addColorStop(1, 'rgba(255,247,236,1)');
  g.fillStyle = grad;
  g.fillRect(0, h * 0.62, w, h * 0.38);
}

function paintBlob(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(40,30,20,0.55)');
  r.addColorStop(0.6, 'rgba(40,30,20,0.3)');
  r.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
}

interface Leg {
  pivot: THREE.Group;
  knee: THREE.Group;
  claws: THREE.Mesh;
  paw: THREE.Mesh;
}

/** Smoothed pose channels (every frame each one eases toward its target). */
const CH = ['hipY', 'pitch', 'roll', 'yaw', 'sx', 'sy', 'sz', 'fl', 'fr', 'bl', 'br', 'splay', 'knee', 'headPitch', 'headYaw', 'headRoll', 'ears', 'tLift', 'tCurl', 'tSway', 'tBend', 'tYaw', 'tLen', 'eyeOpen', 'mouth'] as const;
type Ch = (typeof CH)[number];
type Pose = Record<Ch, number>;
const restPose = (): Pose => ({
  hipY: HIP_Y,
  pitch: 0,
  roll: 0,
  yaw: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  fl: 0,
  fr: 0,
  bl: 0,
  br: 0,
  splay: 0,
  knee: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  ears: 0,
  tLift: 1.15,
  tCurl: 0.05,
  tSway: 0.1,
  tBend: 0,
  tYaw: 0,
  tLen: 0.78,
  eyeOpen: 1,
  mouth: 0,
});

// module temps (no per-frame allocation)
const G0 = newGait();
const pts = new Float32Array(TAIL_N * 3);
const ptsB = new Float32Array(TAIL_N * 3);
const tailPose: TailPose = { lift: 1, curl: 0, sway: 0, phase: 0, length: 0.78, bend: 0, yaw0: 0 };
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const sc = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const plantW = new THREE.Vector3();
const plantL: [number, number, number] = [0, 0, 0];
const tipRest: [number, number, number] = [0, 0, 0];
const furWet = new THREE.Color(0xc9d4e6);
const furDry = new THREE.Color(0xffffff);

export class Mochi implements KittenRig {
  root = new THREE.Group();
  hip = new THREE.Group();
  head = new THREE.Group();
  neck = new THREE.Group();
  legs: Leg[] = [];
  ears: THREE.Group[] = [];
  eyes: THREE.Mesh[] = [];
  mouth: THREE.Mesh;
  tail: THREE.InstancedMesh;
  tailOutline: THREE.InstancedMesh;
  blob: THREE.Mesh;
  cloud = buildPuffCloud();
  leaf = buildLeaf();
  furMat: THREE.MeshToonMaterial;

  private pose = restPose();
  private tgt = restPose();
  private phase = 0;
  private lastLand = 99;
  private squash = 0;
  private squashT = 9;
  private blinkT = 2;
  private moodT = 9;
  private mood = '';
  private chase = false;
  private lookBackT = 9;
  /** a quick look back at the camera (close shaves, bells): her face reads at gameplay distance */
  private glanceT = 9;
  private flickT = 9;
  private finishT = 0;
  private plantS = 0;
  private plantX = 0;
  private vaultWas = false;
  private cloudHop = 0;
  private lastY = 0;
  private wetK = 0;
  private offs: (() => void)[] = [];
  /** world-space helpers for the juice lane (updated in animate) */
  readonly pawW = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  readonly tailTipW = new THREE.Vector3();
  /** the little rain cloud that follows a wet kitten (world position; scale 0 when dry) */
  readonly stormW = new THREE.Vector3();
  storm = new THREE.Group();
  /** the current pose name (tests / debugging) */
  state = 'run';

  constructor() {
    const S = SPHERE();
    const fur = toon('mochiFur', 0xffffff, { map: canvasTex('mochiFur', 512, 256, paintFur) }).clone();
    fur.userData.shared = false;
    this.furMat = fur;
    const orange = toon('mochiOrange', MOCHI.orange);
    const white = toon('mochiWhite', MOCHI.white);
    const pink = toon('mochiPink', MOCHI.pink);
    const nose = toon('mochiNose', MOCHI.nose);
    const eyeMat = flat('mochiEye', MOCHI.eye);
    const hiMat = flat('mochiEyeHi', 0xffffff);
    this.root.add(this.hip);
    this.hip.position.y = HIP_Y;

    // ---- body ----
    const torso = part(S, fur, this.hip, [0, 0, -0.03], [0.25, 0.23, 0.35]);
    outline(torso, 0.06);
    part(S, white, this.hip, [0, -0.08, 0.02], [0.2, 0.15, 0.29]); // tummy
    const bib = part(S, white, this.hip, [0, 0.03, 0.22], [0.17, 0.19, 0.13]);
    outline(bib, 0.06);
    for (const side of [-1, 1]) {
      const h = part(S, fur, this.hip, [side * 0.13, -0.02, -0.2], [0.12, 0.15, 0.15]); // haunches
      outline(h, 0.08);
    }

    // ---- head ----
    this.neck.position.set(0, 0.2, 0.25);
    this.hip.add(this.neck);
    this.neck.add(this.head);
    const headMat = toon('mochiHead', 0xffffff, { map: canvasTex('mochiHead', 512, 256, paintHead) });
    const skull = part(S, headMat, this.head, [0, 0.14, 0.03], [0.34, 0.29, 0.3]);
    outline(skull, 0.05);
    for (const side of [-1, 1]) {
      part(S, white, this.head, [side * 0.09, 0.03, 0.25], [0.12, 0.09, 0.085]); // muzzle cheeks
      part(SPHERE_LO(), toon('mochiBlush', 0xff9fb2), this.head, [side * 0.21, 0.08, 0.2], [0.055, 0.03, 0.025], false);
      // cheek fluff tufts poking out at the sides (reads from behind)
      const tuft = part(S, fur, this.head, [side * 0.31, 0.03, -0.01], [0.09, 0.07, 0.1]);
      tuft.rotation.z = side * 0.6;
    }
    part(S, white, this.head, [0, -0.02, 0.21], [0.1, 0.07, 0.09]); // chin
    part(S, nose, this.head, [0, 0.105, 0.335], [0.04, 0.028, 0.025], false);
    this.mouth = part(S, flat('mochiMouth', 0x6a1f2a), this.head, [0, 0.0, 0.31], [0.04, 0.0, 0.02], false);
    for (const side of [-1, 1]) {
      // big kitten eyes with two highlights
      const e = part(S, eyeMat, this.head, [side * 0.13, 0.165, 0.285], [0.085, 0.105, 0.06], false);
      this.eyes.push(e);
      part(S, hiMat, e, [0.3, 0.35, 0.75], [0.36, 0.3, 0.3], false);
      part(S, hiMat, e, [-0.25, -0.4, 0.8], [0.16, 0.14, 0.2], false);
      // ears
      const ear = new THREE.Group();
      ear.position.set(side * 0.18, 0.35, -0.01);
      ear.rotation.z = -side * 0.32;
      this.head.add(ear);
      const outer = part(geo('mochiEar', () => new THREE.ConeGeometry(0.105, 0.24, 4).rotateY(Math.PI / 4).translate(0, 0.1, 0)), orange, ear, [0, 0, 0], [1, 1, 0.55]);
      outline(outer, 0.1);
      part(geo('mochiEarIn', () => new THREE.ConeGeometry(0.065, 0.16, 4).rotateY(Math.PI / 4).translate(0, 0.08, 0)), pink, ear, [0, 0, 0.03], [1, 1, 0.5], false);
      this.ears.push(ear);
      // whiskers
      for (let w = 0; w < 2; w++) {
        const wh = part(geo('whisker', () => new THREE.CylinderGeometry(0.004, 0.004, 0.22, 3).rotateZ(Math.PI / 2)), flat('whisker', 0xffffff), this.head, [side * 0.24, 0.05 + w * 0.035, 0.27], [1, 1, 1], false);
        wh.rotation.z = side * (w - 0.5) * 0.3;
        wh.rotation.y = -side * 0.25;
      }
    }

    // ---- legs: hip pivot -> upper leg -> knee -> lower leg + paw ----
    const upperGeo = geo('mochiUpper', () => new THREE.CylinderGeometry(0.06, 0.055, 0.16, 8).translate(0, -0.08, 0));
    const lowerGeo = geo('mochiLower', () => new THREE.CylinderGeometry(0.052, 0.048, 0.15, 8).translate(0, -0.075, 0));
    const clawGeo = geo('mochiClaws', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = -1; i <= 1; i++) {
        const c = new THREE.ConeGeometry(0.014, 0.07, 4).rotateX(Math.PI / 2 + 0.5);
        c.translate(i * 0.03, -0.02, 0.08);
        parts.push(c);
      }
      return mergeGeometries(parts)!;
    });
    const clawMat = flat('claw', 0xffffff);
    const legDefs: [boolean, number][] = [
      [true, 1],
      [true, -1],
      [false, 1],
      [false, -1],
    ];
    for (const [front, side] of legDefs) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (front ? 0.1 : 0.12), -0.09, front ? 0.18 : -0.2);
      this.hip.add(pivot);
      part(upperGeo, front ? fur : fur, pivot, [0, 0, 0]);
      const knee = new THREE.Group();
      knee.position.y = -0.15;
      pivot.add(knee);
      part(lowerGeo, front ? white : fur, knee, [0, 0, 0]);
      const paw = part(S, white, knee, [0, -0.15, 0.025], [0.065, 0.045, 0.085]);
      outline(paw, 0.12);
      const claws = part(clawGeo, clawMat, knee, [0, -0.15, 0], [1, 1, 1], false);
      claws.visible = false;
      this.legs.push({ pivot, knee, claws, paw });
    }

    // ---- tail: one instanced chain (striped, white tip) that can also stretch into the vault pole ----
    const tailMat = toon('mochiTail', 0xffffff);
    this.tail = new THREE.InstancedMesh(SPHERE_LO(), tailMat, TAIL_N);
    this.tail.castShadow = true;
    this.tail.frustumCulled = false;
    const cA = new THREE.Color(MOCHI.orange);
    const cB = new THREE.Color(MOCHI.orangeDark);
    const cW = new THREE.Color(MOCHI.white);
    for (let i = 0; i < TAIL_N; i++) this.tail.setColorAt(i, i >= TAIL_N - 3 ? cW : i % 3 === 2 ? cB : cA);
    this.tail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hip.add(this.tail);
    this.tailOutline = new THREE.InstancedMesh(geo('sphereLoOut', () => new THREE.SphereGeometry(1.16, 12, 9)), flat('outline3a2416', 0x3a2416, THREE.BackSide), TAIL_N);
    this.tailOutline.instanceMatrix = this.tail.instanceMatrix;
    this.tailOutline.frustumCulled = false;
    this.tailOutline.userData.outline = true;
    this.hip.add(this.tailOutline);

    // ---- attachments ----
    this.root.add(this.cloud.root, this.leaf.root);
    // a tiny grumpy rain cloud for the wet gag
    const grey = toon('storm', 0x9aa6ba);
    const greyD = toon('stormD', 0x7d889c);
    const sp: [number, number, number, number][] = [
      [0, 0, 0, 0.22],
      [0.2, -0.03, 0.02, 0.17],
      [-0.2, -0.02, -0.01, 0.18],
      [0.08, 0.1, -0.05, 0.16],
    ];
    for (const [x, y, z, r] of sp) {
      const m = part(S, y > 0.05 ? grey : x === 0 ? grey : greyD, this.storm, [x, y, z], [r * 1.2, r * 0.9, r]);
      outline(m, 0.08, 0x4a5262);
    }
    this.storm.position.set(0, 1.5, 0.05);
    this.storm.visible = false;
    this.root.add(this.storm);
    this.cloud.root.visible = false;
    this.leaf.root.visible = false;
    this.blob = new THREE.Mesh(
      geo('blob', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ map: canvasTex('blob', 64, 64, paintBlob), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.blob.scale.set(0.75, 1, 1.05);
    this.blob.renderOrder = 1;
    this.root.add(this.blob);

    setOutlines(this.root, getQuality() === 'high');
    this.offs.push(
      events.on('qualityChange', (e) => setOutlines(this.root, e.quality === 'high')),
      events.on('react', (e) => {
        this.mood = e.mood;
        this.moodT = 0;
      }),
      events.on('chase', (e) => {
        this.chase = e.on;
        this.lookBackT = 1.2;
      }),
      events.on('nearMiss', () => (this.glanceT = 0)),
      events.on('bell', () => (this.glanceT = 0)),
      events.on('react', (e) => {
        if (e.mood === 'nom') this.flickT = 0;
      }),
      events.on('stageStart', () => {
        this.chase = false;
        this.finishT = 0;
      }),
    );
  }

  dispose(): void {
    for (const f of this.offs) f();
    this.offs.length = 0;
    this.furMat.dispose();
    (this.blob.material as THREE.Material).dispose();
    this.tail.dispose();
  }

  animate(dt: number, t: number, p: Readonly<PlayerView>): void {
    const d = Math.min(0.05, Math.max(0, dt));
    const T = this.tgt;
    const Q = this.pose;
    // ---- one-shot detection ----
    if (p.sinceLand < this.lastLand && p.sinceLand < 0.1) {
      this.squash = Math.min(1, 0.25 + p.landImpact / 26);
      this.squashT = 0;
    }
    this.lastLand = p.sinceLand;
    this.squashT += d;
    this.moodT += d;
    this.lookBackT += d;
    this.glanceT += d;
    this.flickT += d;

    // ---- defaults: the run cycle ----
    const run = p.mode === 'finish' ? Math.max(0, p.speed) : p.speed;
    const wall = p.surface === 'wall' && p.grounded;
    this.phase = (this.phase + d * strideRate(run) * (wall ? 1.35 : 1)) % 1000;
    const amp = Math.min(1, run / 12) * (wall ? 1.1 : 1);
    gait(this.phase, amp, G0);
    T.hipY = HIP_Y + G0.bob;
    T.pitch = G0.pitch;
    T.roll = p.lean * 0.28;
    T.yaw = -p.lean * 0.12;
    T.sx = 1;
    T.sy = 1 - G0.stretch * 0.04 * amp;
    T.sz = 1 + G0.stretch * 0.06 * amp;
    T.fl = G0.fl;
    T.fr = G0.fr;
    T.bl = G0.bl;
    T.br = G0.br;
    T.splay = 0;
    T.knee = 0.25 * amp;
    T.headPitch = -G0.pitch * 0.8 + 0.05;
    T.headYaw = -p.lean * 0.35;
    T.headRoll = p.lean * 0.1;
    T.ears = 0.15 * amp;
    T.tLift = 0.7 - amp * 0.2;
    T.tCurl = 0.09;
    T.tSway = 0.08 + amp * 0.05;
    T.tBend = 0.02 - p.lean * 0.04;
    T.tYaw = 0.95;
    T.tLen = 0.78;
    T.eyeOpen = 1;
    T.mouth = 0;
    let spin = 0;
    let rate = 16;
    let state = 'run';
    let showCloud = false;
    let showLeaf = false;
    let pole = 0; // 0 = normal tail, 1 = fully planted pole
    let pounceK = 0;

    if (p.mode === 'finish') this.finishT += d;
    else this.finishT = 0;

    // ---- states ----
    if (p.ability === 'cloud') {
      state = 'cloud';
      showCloud = true;
      const hop = Math.max(0, p.y - P.base);
      T.hipY = 0.27 + Math.sin(t * 2.3) * 0.02;
      T.pitch = -0.55;
      T.fl = 0.5;
      T.fr = 0.5;
      T.bl = -1.35;
      T.br = -1.35;
      T.knee = 0.1;
      T.splay = 0.12;
      T.headPitch = 0.42 + Math.sin(t * 1.3) * 0.05;
      T.headYaw = -p.lean * 0.5 + Math.sin(t * 0.7) * 0.2;
      T.tLift = -0.35;
      T.tCurl = 0.05;
      T.tBend = 0.16;
      T.tSway = 0.04;
      T.ears = 0;
      T.roll = p.lean * 0.18;
      T.yaw = 0;
      if (hop > 0.12 || !p.grounded) {
        // wheee: paws in the air
        T.fl = -2.5 + Math.sin(t * 14) * 0.15;
        T.fr = -2.5 - Math.sin(t * 14) * 0.15;
        T.mouth = 1;
        T.tLift = 0.6;
      }
      this.cloudHop = Math.max(0, this.cloudHop - d * 3);
      if (p.grounded && this.lastY > P.base + 0.05) this.cloudHop = 1;
      this.cloud.root.position.y = -hop - 0.24;
      this.cloud.animate(d, t, hump(1 - this.cloudHop), p.lean, p.speed);
    } else if (p.ability === 'vault') {
      state = 'vault';
      if (!this.vaultWas) {
        this.plantS = P.arc.s0 + 0.4;
        this.plantX = p.x;
      }
      const u = p.abilityT;
      pole = u < 0.06 ? smooth(u / 0.06) : u < 0.42 ? 1 : 1 - easeOut((u - 0.42) / 0.16);
      if (u < 0.45) {
        // swinging up on the pole: stretched out, paws forward, nose up
        T.pitch = -0.45 + u * 0.6;
        T.fl = -1.3;
        T.fr = -1.15;
        T.bl = 1.2;
        T.br = 1.1;
        T.sz = 1.15;
        T.sy = 0.92;
        T.headPitch = 0.25;
        T.ears = 0.8;
        T.mouth = 0.7;
      } else if (u < 0.82) {
        // tucked somersault over the top
        state = 'vault-flip';
        spin = flipAngle((u - 0.45) / 0.37, 1);
        T.fl = 1.2;
        T.fr = 1.2;
        T.bl = -1.4;
        T.br = -1.4;
        T.knee = 1;
        T.sx = 0.92;
        T.sy = 0.9;
        T.sz = 0.88;
        T.headPitch = 0.5;
        T.tCurl = 0.4;
        T.tLift = -0.4;
        rate = 30;
      } else {
        // reaching for the landing
        T.pitch = 0.15;
        T.fl = -0.7;
        T.fr = -0.6;
        T.bl = 0.4;
        T.br = 0.35;
        T.tLift = 1.2;
        T.mouth = 0.4;
      }
      T.eyeOpen = 1.15;
    } else if (p.surface === 'river' && p.mode === 'run') {
      state = 'surf';
      showLeaf = true;
      const sway = Math.sin(t * 2.6) * 0.1;
      T.yaw = 0.55;
      T.headYaw = -0.5 - p.lean * 0.3;
      T.roll = sway + p.lean * 0.38;
      T.pitch = 0.05;
      T.hipY = 0.36 + Math.sin(t * 4.2) * 0.02;
      T.fl = -0.45;
      T.fr = -0.35;
      T.bl = 0.45;
      T.br = 0.4;
      T.splay = 0.22;
      T.knee = 0.45;
      T.tLift = 0.85;
      T.tBend = -(sway + p.lean * 0.3) * 0.35;
      T.tSway = 0.18;
      T.ears = 0.3;
      T.headRoll = -sway * 0.6;
      if (!p.grounded) {
        T.fl = -1;
        T.fr = -1;
        T.mouth = 0.6;
      }
      this.leaf.root.position.y = -p.y + 0.02;
      this.leaf.root.rotation.y = 0.3;
      this.leaf.animate(d, t, p.lean, p.speed);
    } else if (p.sliding) {
      state = 'slide';
      T.hipY = 0.22;
      T.pitch = -0.08;
      T.fl = -1.5;
      T.fr = -1.45;
      T.bl = 1.5;
      T.br = 1.45;
      T.knee = 0;
      T.sx = 1.05;
      T.sy = 0.78;
      T.sz = 1.15;
      T.headPitch = -0.15;
      T.ears = 0.9;
      T.tLift = 0.05;
      T.tCurl = -0.01;
      T.tSway = 0.25;
      T.mouth = 0.3;
      rate = 24;
    } else if (!p.grounded) {
      state = 'air';
      pounceK = p.sincePounce < 0.42 ? 1 : 0;
      if (pounceK) {
        state = 'pounce';
        spin = flipAngle(p.sincePounce, 0.42);
        T.fl = 1.1;
        T.fr = 1.1;
        T.bl = -1.3;
        T.br = -1.3;
        T.knee = 1.1;
        T.sx = 0.92;
        T.sy = 0.88;
        T.sz = 0.86;
        T.headPitch = 0.55;
        T.tCurl = 0.42;
        T.tLift = -0.5;
        T.mouth = 0.8;
        rate = 34;
      } else if (p.vy > 0) {
        const k = Math.min(1, p.vy / 14);
        T.pitch = -0.3 * k;
        T.fl = -1.0;
        T.fr = -0.85;
        T.bl = 0.95;
        T.br = 0.85;
        T.knee = 0.2;
        T.sy = 1 + 0.12 * k;
        T.sx = 1 - 0.06 * k;
        T.sz = 1 - 0.05 * k;
        T.tLift = 0.35;
        T.tCurl = 0.08;
        T.headPitch = 0.15;
        T.ears = 0.4;
      } else {
        const k = Math.min(1, -p.vy / 20);
        T.pitch = 0.12 * k;
        T.fl = -0.55;
        T.fr = -0.5;
        T.bl = 0.25;
        T.br = 0.2;
        T.knee = 0.3;
        T.sy = 1 + 0.1 * k;
        T.sx = 1 - 0.05 * k;
        T.tLift = 1.3;
        T.tCurl = 0.02;
        T.ears = 0.3 + 0.6 * k;
        T.headPitch = -0.1;
      }
      rate = 18;
    } else if (wall) {
      state = 'wall';
      T.hipY = 0.36 + G0.bob;
      T.pitch = 0.12 + G0.pitch;
      T.ears = 0.7;
      T.tLift = 0.55;
      T.tSway = 0.16;
      T.headPitch = -0.1;
      T.mouth = 0.25;
    }

    if (state === 'slide' || state === 'pounce' || state === 'vault' || state === 'vault-flip' || state === 'cloud') T.tYaw = 0;
    else if (state === 'surf') T.tYaw = 0.2;

    // victory: slow down, turn round to the camera, sit up and wave
    if (p.mode === 'finish' && p.speed < 6) {
      state = 'victory';
      const k = smooth(this.finishT / 0.9);
      const hopK = hump(((this.finishT * 1.4) % 1) * 1.6);
      T.yaw = Math.PI * k;
      T.hipY = 0.47 + hopK * 0.14 * k;
      T.pitch = -0.85 * k;
      T.bl = -0.9 * k;
      T.br = -0.9 * k;
      T.fl = -2.4 * k + Math.sin(t * 13) * 0.35 * k;
      T.fr = -0.4 * k;
      T.headPitch = 0.6 * k;
      T.headYaw = Math.sin(t * 2) * 0.15;
      T.headRoll = Math.sin(t * 2.6) * 0.15;
      T.tLift = 1.3;
      T.tSway = 0.25;
      T.mouth = 0.6;
      T.eyeOpen = 0.3; // happy ^^ squint
      T.roll = 0;
    }

    // hit flinch
    if (p.sinceHit < 0.55 && p.mode !== 'finish') {
      const k = hump(p.sinceHit / 0.55);
      state = 'hit';
      T.pitch -= 0.6 * k;
      T.fl = -1.6 * k + T.fl * (1 - k);
      T.fr = -1.4 * k + T.fr * (1 - k);
      T.splay = 0.4 * k;
      T.ears = 1;
      T.eyeOpen = 0.12;
      T.mouth = 1;
      T.roll += Math.sin(t * 40) * 0.2 * k;
      rate = 30;
    }

    // wet: soggy, shivering shakes in bursts
    this.wetK += ((p.wet > 0 ? 1 : 0) - this.wetK) * approach(p.wet > 0 ? 8 : 1.5, d);
    if (this.wetK > 0.02) {
      const burst = (t % 0.85) < 0.32 ? 1 : 0;
      T.sx *= 1 - 0.1 * this.wetK;
      T.ears = Math.max(T.ears, 1 * this.wetK);
      T.tLift -= 0.5 * this.wetK;
      if (burst && p.wet > 0) {
        T.headYaw += Math.sin(t * 62) * 0.5;
        T.roll += Math.sin(t * 58) * 0.18;
        T.eyeOpen = 0.15;
      }
      if (state === 'run') state = 'wet';
    }
    this.furMat.color.copy(furDry).lerp(furWet, this.wetK * 0.8);
    this.storm.visible = this.wetK > 0.03;
    if (this.storm.visible) {
      const k = this.wetK;
      this.storm.scale.setScalar(k * (1 + Math.sin(t * 6) * 0.04));
      this.storm.position.set(Math.sin(t * 2.2) * 0.06, 1.45 + Math.sin(t * 3.1) * 0.04, 0.1);
      this.storm.rotation.z = Math.sin(t * 2.7) * 0.08;
    }

    // landing squash (spring)
    if (this.squashT < 0.5) {
      const w = springWobble(this.squashT, 3.2, 9) * this.squash;
      T.sy -= w * 0.32;
      T.sx += w * 0.18;
      T.sz += w * 0.12;
      T.hipY -= Math.max(0, w) * 0.12;
    }

    // a peek back at the chaser now and then
    if (this.chase && p.mode === 'run' && state === 'run') {
      if (this.lookBackT > 2.6) this.lookBackT = 0;
      if (this.lookBackT < 0.55) {
        const k = hump(this.lookBackT / 0.55);
        T.headYaw += 1.7 * k;
        T.headRoll += 0.2 * k;
        T.eyeOpen = 1.35;
        T.mouth = Math.max(T.mouth, 0.8 * k);
        T.ears = 0.9;
      }
    }

    // chases: ears pinned back
    if (this.chase && p.mode !== 'finish') T.ears = Math.max(T.ears, 0.95);
    // a cheeky glance back at the camera with big eyes (CLOSE ONE!, bells)
    if (this.glanceT < 0.42 && p.mode !== 'finish' && state !== 'victory') {
      const k = hump(this.glanceT / 0.42);
      T.headYaw += 2.1 * k * (p.x > 0 ? -1 : 1);
      T.headPitch += 0.25 * k;
      T.eyeOpen = 1.45;
      T.mouth = Math.max(T.mouth, 0.7 * k);
      T.ears = Math.min(T.ears, 0.2);
    }
    // a happy tail flick on NOM NOM
    if (this.flickT < 0.45) {
      const k = hump(this.flickT / 0.45);
      T.tLift += 0.6 * k;
      T.tSway += 0.5 * k;
      T.tCurl += 0.3 * k;
    }

    // mood (portrait reactions mirrored on the face)
    if (this.moodT < 0.7) {
      if (this.mood === 'nom' || this.mood === 'happy' || this.mood === 'wow') T.eyeOpen = Math.min(T.eyeOpen, this.mood === 'wow' ? 1.3 : 0.3);
      if (this.mood === 'wow') T.mouth = Math.max(T.mouth, 0.7);
      if (this.mood === 'scared') {
        T.eyeOpen = 1.35;
        T.ears = 1;
      }
    }

    // blink
    this.blinkT -= d;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 2.5;
    if (this.blinkT < 0.09) T.eyeOpen = Math.min(T.eyeOpen, 0.08);

    // ---- ease every channel toward its target ----
    const k = approach(rate, d);
    for (let i = 0; i < CH.length; i++) {
      const c = CH[i];
      Q[c] += (T[c] - Q[c]) * (c === 'eyeOpen' ? approach(30, d) : c === 'yaw' && state === 'victory' ? approach(5, d) : k);
    }
    if (d === 0) {
      // paused or a cutscene poke: snap
      for (let i = 0; i < CH.length; i++) Q[CH[i]] = T[CH[i]];
    }

    // ---- apply ----
    const hip = this.hip;
    hip.position.y = Q.hipY;
    hip.rotation.set(Q.pitch + spin, Q.yaw, Q.roll, 'YXZ');
    hip.scale.set(Q.sx, Q.sy, Q.sz);
    this.neck.rotation.set(Q.headPitch, Q.headYaw, Q.headRoll, 'YXZ');
    const L = this.legs;
    L[0].pivot.rotation.set(Q.fl, 0, -Q.splay);
    L[1].pivot.rotation.set(Q.fr, 0, Q.splay);
    L[2].pivot.rotation.set(Q.bl, 0, -Q.splay * 0.7);
    L[3].pivot.rotation.set(Q.br, 0, Q.splay * 0.7);
    // knees bend against the swing so paws plant flat
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const sw = L[i].pivot.rotation.x;
      L[i].knee.rotation.x = front ? Math.max(0, sw) * 0.9 + Q.knee * 0.6 : -Math.max(0, -sw) * 0.4 - Q.knee * 0.3 + Math.max(0, sw) * 0.5;
      L[i].claws.visible = state === 'wall' && front;
    }
    for (let i = 0; i < 2; i++) {
      const ear = this.ears[i];
      const side = i === 0 ? -1 : 1;
      const flick = Math.sin(t * 2.9 + i * 2) > 0.985 ? 0.35 : 0;
      ear.rotation.set(-Q.ears * 0.9 - flick, 0, -side * (0.32 + Q.ears * 0.35));
    }
    const eo = Math.max(0.06, Q.eyeOpen);
    for (const e of this.eyes) e.scale.set(0.085 * (eo > 1 ? 1 + (eo - 1) * 0.5 : 1), 0.105 * eo, 0.06);
    const mo = Math.max(0, Q.mouth);
    this.mouth.scale.set(0.035 + mo * 0.015, mo * 0.05, 0.02);
    this.mouth.visible = mo > 0.05;

    // ---- tail ----
    tailPose.lift = Q.tLift;
    tailPose.curl = Q.tCurl;
    tailPose.sway = Q.tSway;
    tailPose.bend = Q.tBend;
    tailPose.length = Q.tLen;
    tailPose.yaw0 = Q.tYaw;
    tailPose.phase = t * 5.5;
    tailCurve(TAIL_BASE, TAIL_N, tailPose, pts);
    this.vaultWas = p.ability === 'vault';
    if (pole > 0.001 && game.track) {
      // plant point in hip space
      this.root.updateMatrixWorld(true);
      game.track.toWorld(this.plantS, this.plantX, 0, plantW);
      hip.worldToLocal(plantW);
      plantL[0] = plantW.x;
      plantL[1] = plantW.y;
      plantL[2] = plantW.z;
      const n3 = (TAIL_N - 1) * 3;
      tipRest[0] = pts[n3];
      tipRest[1] = pts[n3 + 1];
      tipRest[2] = pts[n3 + 2];
      const u = p.abilityT;
      poleCurve(TAIL_BASE, plantL, TAIL_N, u > 0.42 ? 0.18 * Math.max(0, 1 - (u - 0.42) * 4) : 0.05, t, ptsB);
      for (let i = 0; i < TAIL_N * 3; i++) pts[i] += (ptsB[i] - pts[i]) * pole;
    }
    let thick = 1;
    if (pole > 0) thick = 1 + pole * 0.35;
    for (let i = 0; i < TAIL_N; i++) {
      const j = i < TAIL_N - 1 ? i : i - 1;
      v1.set(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]);
      v2.set(pts[j * 3 + 3], pts[j * 3 + 4], pts[j * 3 + 5]);
      const segLen = v1.distanceTo(v2);
      v2.sub(v1);
      if (v2.lengthSq() < 1e-8) v2.set(0, 0, -1);
      v2.normalize();
      q.setFromUnitVectors(Z, v2);
      const kk = i / (TAIL_N - 1);
      const r = (0.068 - kk * 0.02) * thick * (kk > 0.82 ? 1.08 : 1);
      sc.set(r, r, Math.max(r * 1.35, segLen * 0.85));
      v1.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      m4.compose(v1, q, sc);
      this.tail.setMatrixAt(i, m4);
    }
    this.tail.instanceMatrix.needsUpdate = true;

    // ---- attachments, shadow ----
    this.cloud.root.visible = showCloud;
    this.leaf.root.visible = showLeaf;
    const overFloor = p.surface !== 'gap' && p.surface !== 'cloud' && p.ability !== 'cloud';
    this.blob.visible = overFloor && p.y < 6;
    if (this.blob.visible) {
      this.blob.position.y = -p.y + 0.03;
      const s = 1 / (1 + p.y * 0.35);
      this.blob.scale.set(0.8 * s, 1, 1.1 * s);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s * 1.1);
    }
    this.lastY = p.y;
    this.state = state;

    // world helpers for the juice
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) this.legs[i].paw.getWorldPosition(this.pawW[i]);
    v1.set(pts[(TAIL_N - 1) * 3], pts[(TAIL_N - 1) * 3 + 1], pts[(TAIL_N - 1) * 3 + 2]);
    this.tailTipW.copy(v1).applyMatrix4(hip.matrixWorld);
    this.storm.getWorldPosition(this.stormW);
  }
}

export function buildMochi(): KittenRig {
  return new Mochi();
}

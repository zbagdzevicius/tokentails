// Mochi: the orange-and-white kitten. A procedural toon rig built from primitives (pattern from ultra-cat's
// cats/model.ts, rescaled to game units: ~1.15 u to the ear tips). Core places root at the player every frame
// (local +z forward, +y up, +x = runner's left); animate() drives every pose from the PlayerView:
// run (bound gait), jump, pounce somersault, slide, landing squash, the tail-vault pole, claws on walls,
// sitting on the puff cloud, surfing the leaf, hit, wet shake, and a victory wave at the finish.
// Iteration 2 (WARDROBE lane): every rig wears a Look (fur colour + pattern textures, eyes, a hat, a scarf, a trail
// FX), holds photo poses (setPose, ITERATION2.md contract) and can be a translucent ghost (challenge links).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getQuality } from '../core/engine';
import { events } from '../core/events';
import { P } from '../core/player';
import { game } from '../core/state';
import type { KittenRig, PlayerView } from '../core/types';
import { ugc, type PoseId } from '../ugc/contract';
import { furColors, itemAt, itemId, patternId } from '../wardrobe/catalog';
import { DEFAULT_LOOK, type Look } from '../wardrobe/look';
import { normalizeLook } from '../wardrobe/unlocks';
import { approach, easeOut, flipAngle, gait, hump, newGait, poleCurve, smooth, springWobble, strideRate, tailCurve, type TailPose } from './anim';
import { buildHat, buildScarf, type Dress } from './dress';
import { acquireFurTex, furTexKey, releaseFurTex } from './furtex';
import { CH, HIP_Y, poseTargets, restPose } from './poses';
import { buildLeaf, buildPuffCloud } from './puff';
import { canvasTex, flat, geo, outline, part, setOutlines, SPHERE, SPHERE_LO, toon, toonRamp } from './toon';
import { TrailEmitter, type TrailMode } from './trailfx';

export const MOCHI = {
  orange: 0xf7953a,
  orangeDark: 0xcf5f1c,
  white: 0xfff7ec,
  pink: 0xffa0b4,
  nose: 0xff7a92,
  eye: 0x2a1a14,
};
const TAIL_N = 16;
const TAIL_BASE: [number, number, number] = [0, 0.1, -0.31];
const GHOST_OPACITY = 0.38;
/** rig.state names of the held poses (no per-frame string building) */
const POSE_STATE: Record<PoseId, string> = { sit: 'pose-sit', wave: 'pose-wave', loaf: 'pose-loaf', stretch: 'pose-stretch', leap: 'pose-leap', proud: 'pose-proud' };

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
  lower: THREE.Mesh;
}

export interface MochiOpts {
  /** a challenger's ghost: translucent, no shadow, no outlines, no FX, no global event subscriptions */
  ghost?: boolean;
  /**
   * when the trail FX shows: 'play' (default: only while the run is live), 'always' (the title runner, at speed),
   * 'ambient' (a slow halo while she rests: the Wardrobe preview)
   */
  fx?: 'play' | 'always' | 'ambient';
}

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
const fxFwd = new THREE.Vector3();
const fxUp = new THREE.Vector3();
const fxRight = new THREE.Vector3();
const tmpCol = new THREE.Color();

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
  /** the look this rig wears (normalised to the catalogue; ownership is the Wardrobe's job) */
  look: Look = { ...DEFAULT_LOOK };
  readonly ghost: boolean;

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
  // ---- look state
  private headMat: THREE.MeshToonMaterial;
  private bellyMat: THREE.MeshToonMaterial;
  private earMat: THREE.MeshToonMaterial;
  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private pupils: THREE.Mesh[] = [];
  private sparkles: THREE.Mesh[] = [];
  /** materials this rig owns (clones, never the shared toon() cache); disposed with the rig */
  private ownMats = new Map<THREE.Material, THREE.Material>();
  private ownedSet = new Set<THREE.Material>();
  private texKey = '';
  private hat: Dress | null = null;
  private scarf: Dress | null = null;
  private fxId = 'none';
  private fxColors: readonly number[] = [];
  private fxMode: TrailMode | 'play' | 'always';
  private trail = new TrailEmitter();
  private poseId: PoseId | null = null;
  /** the body's eased yaw about the rig's up (radians; PI = facing back down the track in the victory pose) */
  get facingYaw(): number {
    return this.pose.yaw;
  }
  /** world-space helpers for the juice lane (updated in animate) */
  readonly pawW = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  readonly tailTipW = new THREE.Vector3();
  /** the little rain cloud that follows a wet kitten (world position; scale 0 when dry) */
  readonly stormW = new THREE.Vector3();
  storm = new THREE.Group();
  /** the current pose name (tests / debugging) */
  state = 'run';

  constructor(look: Partial<Look> = ugc.currentLook(), opts: MochiOpts = {}) {
    this.ghost = !!opts.ghost;
    this.fxMode = opts.fx === 'ambient' ? 'ambient' : opts.fx === 'always' ? 'always' : 'play';
    const L = normalizeLook(look);
    const S = SPHERE();
    const tex = acquireFurTex(L.fur, L.pattern);
    this.texKey = furTexKey(L.fur, L.pattern);
    const fur = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), map: tex.fur });
    this.furMat = this.adopt(fur);
    this.headMat = this.adopt(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp(), map: tex.head }));
    this.earMat = this.own(toon('mochiOrange', MOCHI.orange)) as THREE.MeshToonMaterial;
    this.bellyMat = this.own(toon('mochiWhite', MOCHI.white)) as THREE.MeshToonMaterial;
    const white = this.bellyMat;
    const orange = this.earMat;
    const pink = toon('mochiPink', MOCHI.pink);
    const nose = toon('mochiNose', MOCHI.nose);
    const hiMat = flat('mochiEyeHi', 0xffffff);
    const pupilMat = flat('mochiPupil', 0x120b08);
    const sparkMat = flat('mochiSpark', 0xffd84a);
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
    const skull = part(S, this.headMat, this.head, [0, 0.14, 0.03], [0.34, 0.29, 0.3]);
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
      // big kitten eyes with two highlights (an iris colour + slit pupil for the Wardrobe eyes)
      const eyeMat = this.adopt(flat('mochiEye', MOCHI.eye).clone()) as THREE.MeshBasicMaterial;
      this.eyeMats.push(eyeMat);
      const e = part(S, eyeMat, this.head, [side * 0.13, 0.165, 0.285], [0.085, 0.105, 0.06], false);
      this.eyes.push(e);
      const pupil = part(S, pupilMat, e, [0, -0.04, 0.6], [0.36, 0.66, 0.44], false);
      pupil.visible = false;
      this.pupils.push(pupil);
      part(S, hiMat, e, [0.3, 0.35, 0.75], [0.36, 0.3, 0.3], false);
      part(S, hiMat, e, [-0.25, -0.4, 0.8], [0.16, 0.14, 0.2], false);
      const spark = part(geo('mochiSparkGeo', () => new THREE.OctahedronGeometry(1, 0)), sparkMat, e, [-0.28, 0.3, 0.86], [0.2, 0.3, 0.12], false);
      spark.visible = false;
      this.sparkles.push(spark);
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
      part(upperGeo, fur, pivot, [0, 0, 0]);
      const knee = new THREE.Group();
      knee.position.y = -0.15;
      pivot.add(knee);
      const lower = part(lowerGeo, front ? white : fur, knee, [0, 0, 0]);
      const paw = part(S, white, knee, [0, -0.15, 0.025], [0.065, 0.045, 0.085]);
      outline(paw, 0.12);
      const claws = part(clawGeo, clawMat, knee, [0, -0.15, 0], [1, 1, 1], false);
      claws.visible = false;
      this.legs.push({ pivot, knee, claws, paw, lower });
    }

    // ---- tail: one instanced chain (striped, white tip) that can also stretch into the vault pole ----
    const tailMat = this.own(toon('mochiTail', 0xffffff));
    this.tail = new THREE.InstancedMesh(SPHERE_LO(), tailMat, TAIL_N);
    this.tail.castShadow = true;
    this.tail.frustumCulled = false;
    for (let i = 0; i < TAIL_N; i++) this.tail.setColorAt(i, tmpCol.setHex(MOCHI.orange));
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

    this.applyLook(L); // the texture pair is already ours (texKey), so this only sets colours and accessories
    if (this.ghost) return;
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
        this.trail.reset();
      }),
    );
  }

  /** a per-rig clone of a shared material (the toon() cache is never mutated) */
  private own(m: THREE.Material): THREE.Material {
    let c = this.ownMats.get(m);
    if (!c) {
      c = m.clone();
      c.userData = { ...c.userData, shared: false };
      this.ownMats.set(m, c);
      this.ownedSet.add(c);
    }
    return c;
  }
  /** take ownership of a material this rig created */
  private adopt<M extends THREE.Material>(m: M): M {
    m.userData.shared = false;
    this.ownMats.set(m, m);
    this.ownedSet.add(m);
    return m;
  }

  /** wear a look (fur + pattern textures, belly, ears, tail bands, eyes, hat, scarf, trail FX). Cheap to repeat. */
  applyLook(look: Partial<Look>): void {
    const L = normalizeLook(look);
    this.look = L;
    // fur + pattern textures (shared per pair, reference counted)
    const key = furTexKey(L.fur, L.pattern);
    if (key !== this.texKey) {
      const t = acquireFurTex(L.fur, L.pattern);
      this.furMat.map = t.fur;
      this.headMat.map = t.head;
      if (this.texKey) releaseFurTex(this.texKey);
      this.texKey = key;
    }
    const c = furColors(L.fur);
    const pat = patternId(L.pattern);
    this.bellyMat.color.setHex(c.belly);
    this.earMat.color.setHex(c.base);
    // socks and tuxedo: all four lower legs in the belly colour
    const socks = pat === 'socks' || pat === 'tuxedo';
    for (let i = 2; i < 4; i++) this.legs[i].lower.material = socks ? this.bellyMat : this.furMat;
    // tail bands
    for (let i = 0; i < TAIL_N; i++) {
      const tip = i >= TAIL_N - 3;
      let hex = c.base;
      if (pat === 'tabby') hex = tip ? c.belly : i % 3 === 2 ? c.dark : c.base;
      else if (pat === 'spots') hex = tip ? c.base : i % 5 === 3 ? c.dark : c.base;
      else if (pat === 'patches') hex = tip ? c.belly : i >= 5 && i < 9 ? c.dark : c.base;
      else if (pat === 'socks' || pat === 'tuxedo') hex = tip ? c.belly : c.base;
      this.tail.setColorAt(i, tmpCol.setHex(hex));
    }
    if (this.tail.instanceColor) this.tail.instanceColor.needsUpdate = true;
    // eyes
    const eyes = itemAt('eyes', L.eyes);
    const classicEyes = L.eyes === 0;
    for (let i = 0; i < 2; i++) {
      // eyes[0] sits at -x (the runner's right eye) -> iris colour 1; eyes[1] is the left eye -> colour 0
      this.eyeMats[i].color.setHex(eyes.colors[i === 1 ? 0 : 1] ?? MOCHI.eye);
      this.pupils[i].visible = !classicEyes;
      this.sparkles[i].visible = itemId('eyes', L.eyes) === 'starry';
    }
    // hat + scarf
    if (this.hat) this.head.remove(this.hat.obj);
    if (this.scarf) this.hip.remove(this.scarf.obj);
    this.hat = buildHat(itemId('hat', L.hat), itemAt('hat', L.hat).colors);
    this.scarf = buildScarf(itemId('scarf', L.scarf), itemAt('scarf', L.scarf).colors);
    if (this.hat) this.head.add(this.hat.obj);
    if (this.scarf) this.hip.add(this.scarf.obj);
    // trail FX
    this.fxId = this.ghost ? 'none' : itemId('fx', L.fx);
    this.fxColors = itemAt('fx', L.fx).colors;
    this.trail.reset();
    if (this.ghost) this.ghostify();
    else setOutlines(this.root, getQuality() === 'high');
  }

  /** translucent ghost: every material becomes a per-rig transparent clone; no outlines, shadows or blob */
  private ghostify(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (o.userData.outline) {
        o.visible = false;
        return;
      }
      o.castShadow = false;
      if (!m.isMesh || !m.material) return;
      const src = m.material as THREE.Material;
      const own = this.ownedSet.has(src) ? src : this.own(src);
      if (own !== src) m.material = own;
      own.transparent = true;
      own.opacity = GHOST_OPACITY;
      own.depthWrite = false;
    });
    this.blob.visible = false;
  }

  /** a held photo pose (sit, wave, loaf, stretch, leap, proud) over the gameplay animation; null = back to normal */
  setPose(id: PoseId | null): void {
    this.poseId = id;
  }
  get heldPose(): PoseId | null {
    return this.poseId;
  }

  dispose(): void {
    for (const f of this.offs) f();
    this.offs.length = 0;
    if (this.texKey) releaseFurTex(this.texKey);
    this.texKey = '';
    for (const m of this.ownedSet) m.dispose();
    this.ownMats.clear();
    this.ownedSet.clear();
    (this.blob.material as THREE.Material).dispose();
    this.tail.dispose();
  }

  animate(dt: number, t: number, p: Readonly<PlayerView>): void {
    const d = Math.min(0.05, Math.max(0, dt));
    const T = this.tgt;
    // a ghost reads only the view it is given (p.base if the view carries one), never the player's state
    const base = this.ghost ? ((p as { base?: number }).base ?? 0) : P.base;
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
      const hop = Math.max(0, p.y - base);
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
      if (p.grounded && this.lastY > base + 0.05) this.cloudHop = 1;
      this.cloud.root.position.y = -hop - 0.24;
      this.cloud.animate(d, t, hump(1 - this.cloudHop), p.lean, p.speed);
    } else if (p.ability === 'vault') {
      state = 'vault';
      if (!this.vaultWas) {
        this.plantS = (this.ghost ? p.s : P.arc.s0) + 0.4;
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
    // (by time too: a fast finish still turns round for the camera's 3/4 front, see style/finish.ts)
    if (p.mode === 'finish' && (p.speed < 6 || this.finishT > 0.55)) {
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
      // big bright eyes and an open smile (the half-closed squint read as sleepy on the share card and in clips)
      T.mouth = 0.5;
      T.eyeOpen = 1.15;
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

    // a held photo pose overrides every gameplay channel and hides the pole; she keeps standing on the puff cloud or
    // the leaf board she rides (a pose on the river without the leaf looked like walking on water)
    if (this.poseId) {
      poseTargets(this.poseId, t, T);
      state = POSE_STATE[this.poseId];
      pole = 0;
      spin = 0;
      rate = 9;
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
    if (d === 0 && !this.poseId) {
      // paused or a cutscene poke: snap (a held pose keeps easing on the real dt photo mode passes)
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

    // accessories that move (propeller, scarf tails, cape) and the cosmetic trail
    const spd = this.poseId ? 0 : Math.max(0, p.speed);
    if (d > 0) {
      this.hat?.anim?.(d, t, spd);
      this.scarf?.anim?.(d, t, spd);
    }
    if (this.fxId !== 'none' && d > 0) {
      const mode = this.fxMode;
      const live = game.mode === 'play' || game.mode === 'finish';
      const run = (mode === 'always' || (mode === 'play' && live)) && spd > 5 && !this.poseId;
      if (run || mode === 'ambient') {
        const e = this.root.matrixWorld.elements;
        fxRight.set(e[0], e[1], e[2]).normalize().negate();
        fxUp.set(e[4], e[5], e[6]).normalize();
        fxFwd.set(e[8], e[9], e[10]).normalize();
        if (mode === 'ambient') {
          this.root.getWorldPosition(v1);
          this.trail.step(this.fxId, this.fxColors, d, t, v1, fxFwd, fxUp, fxRight, 0, 'ambient');
        } else this.trail.step(this.fxId, this.fxColors, d, t, this.tailTipW, fxFwd, fxUp, fxRight, spd, 'run');
      }
    }
  }
}

/** the player's kitten (core, the cottage cutscene, photo mode): Mochi in the equipped look */
export function buildMochi(): KittenRig {
  return new Mochi(ugc.currentLook());
}

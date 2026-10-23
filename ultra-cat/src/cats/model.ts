import * as THREE from 'three';
import type { CatRig } from '../core/types';

// The kaiju cats: chunky cats built from primitives, one parameterised builder (`new Cat(look)`).
// Local +z is forward, feet on y = 0. Owned by the CATS lane; implements CatRig (core/types.ts).

type Painter = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTexture(paint: Painter): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  paint(c.getContext('2d')!, 512, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function furNoise(g: CanvasRenderingContext2D, light: string, dark: string, n = 4000): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? light : dark;
    g.fillRect(Math.random() * 512, Math.random() * 256, 2, 6);
  }
}

function bellyBand(g: CanvasRenderingContext2D, rgb: string): void {
  // pale belly band at the bottom of the sphere
  const grad = g.createLinearGradient(0, 170, 0, 256);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(1, `rgba(${rgb},1)`);
  g.fillStyle = grad;
  g.fillRect(0, 170, 512, 86);
}

/** Marmalade: the POC orange tabby, unchanged. */
const paintTabby: Painter = (g) => {
  g.fillStyle = '#f08a2c';
  g.fillRect(0, 0, 512, 256);
  furNoise(g, 'rgba(255,190,110,0.25)', 'rgba(170,80,20,0.18)');
  // wavy stripes, vertical in texture space so they wrap around the body
  g.fillStyle = '#b5521a';
  for (let s = 0; s < 14; s++) {
    const x0 = (s / 14) * 512 + Math.random() * 10;
    const w = 8 + Math.random() * 10;
    g.beginPath();
    g.moveTo(x0, 0);
    for (let y = 0; y <= 256; y += 16) g.lineTo(x0 + Math.sin(y * 0.05 + s) * 8, y);
    for (let y = 256; y >= 0; y -= 16) g.lineTo(x0 + w + Math.sin(y * 0.05 + s) * 8, y);
    g.closePath();
    g.fill();
  }
  bellyBand(g, '255,236,205');
};

/** Big Biscuit: a white loaf with big marmalade patches on the back. */
const paintChonk: Painter = (g) => {
  g.fillStyle = '#fff4e6';
  g.fillRect(0, 0, 512, 256);
  furNoise(g, 'rgba(255,255,255,0.35)', 'rgba(210,180,150,0.14)', 3000);
  const blob = (x: number, y: number, rx: number, ry: number) => {
    for (const ox of [-512, 0, 512]) {
      g.beginPath();
      g.ellipse(x + ox, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  g.fillStyle = '#f29a40';
  blob(60, 40, 70, 46);
  blob(200, 70, 56, 52);
  blob(330, 30, 90, 40);
  blob(450, 85, 50, 40);
  g.fillStyle = '#d97a24'; // faint stripes inside the patches
  for (let s = 0; s < 9; s++) {
    const x = s * 57 + 10;
    g.fillRect(x, 10 + (s % 3) * 12, 9, 50);
  }
  bellyBand(g, '255,250,244');
};

/** Midnight: glossy black with a cold blue-violet sheen. */
const paintShadow: Painter = (g) => {
  g.fillStyle = '#2b2836';
  g.fillRect(0, 0, 512, 256);
  furNoise(g, 'rgba(150,140,200,0.18)', 'rgba(0,0,0,0.3)', 5000);
  const sheen = g.createLinearGradient(0, 30, 0, 120);
  sheen.addColorStop(0, 'rgba(140,130,200,0)');
  sheen.addColorStop(0.5, 'rgba(140,130,200,0.18)');
  sheen.addColorStop(1, 'rgba(140,130,200,0)');
  g.fillStyle = sheen;
  g.fillRect(0, 30, 512, 90);
};

/** Duchess: cream body that darkens toward the points. */
const paintSiamese: Painter = (g) => {
  g.fillStyle = '#f2e3c8';
  g.fillRect(0, 0, 512, 256);
  furNoise(g, 'rgba(255,250,236,0.3)', 'rgba(170,130,90,0.12)', 3000);
  // the sphere is stretched along z, so the cat's front and rear sit near u = 0.25 and 0.75: shade both ends
  for (const cx of [128, 384]) {
    const r = g.createRadialGradient(cx, 128, 10, cx, 128, 150);
    r.addColorStop(0, 'rgba(120,80,50,0.55)');
    r.addColorStop(1, 'rgba(120,80,50,0)');
    g.fillStyle = r;
    g.fillRect(cx - 160, 0, 320, 256);
  }
  // darker saddle along the spine
  const s = g.createLinearGradient(0, 0, 0, 80);
  s.addColorStop(0, 'rgba(150,110,70,0.35)');
  s.addColorStop(1, 'rgba(150,110,70,0)');
  g.fillStyle = s;
  g.fillRect(0, 0, 512, 80);
  bellyBand(g, '255,248,236');
};

export interface CatLook {
  paint: Painter;
  muzzle: number; // cheeks
  bib: number | null; // chest fluff (null = muzzle colour)
  socks: number; // paws
  leg: number | null; // leg colour (null = fur texture)
  ear: number | null; // outer ear (null = fur texture)
  earInner: number;
  earScale: number;
  tail: number | null; // tail colour (null = fur texture)
  tailTip: number;
  mask: number | null; // Siamese face mask
  nose: number;
  body: [number, number, number]; // body sphere radii
  bodyY: number;
  chest: [number, number, number]; // chest fluff radii
  head: [number, number, number]; // head group position
  headScale: number;
  headShape: [number, number, number];
  legLen: number;
  legR: number;
  hipX: number;
  hipZ: [number, number]; // front, back
  haunch: number; // haunch sphere scale
  tailN: number;
  tailR: number;
  tailTaper: number;
  tailStep: [number, number]; // y, -z per segment
  tailLift: number; // base x rotation per segment (negative curls up)
  sclera: number;
  eyeScale: [number, number, number];
  pupilScale: [number, number]; // normal width, height
  slit: boolean; // narrow vertical pupils at rest
  crossEyed: number; // pupils drift toward the nose (Siamese derp)
  lids: boolean; // sleepy half lids (lifted during ULTRA)
  glow: number; // ULTRA eye glow / pupil colour
  aura: number | null; // body emissive during ULTRA
  whisker: number;
  roughness: number;
}

const TABBY: CatLook = {
  paint: paintTabby,
  muzzle: 0xffeccd,
  bib: null,
  socks: 0xffeccd,
  leg: null,
  ear: null,
  earInner: 0xff8fa8,
  earScale: 1,
  tail: null,
  tailTip: 0x9c4515,
  mask: null,
  nose: 0xff8fa8,
  body: [13, 12, 22],
  bodyY: 26,
  chest: [9, 9, 8],
  head: [0, 40, 21],
  headScale: 1,
  headShape: [13.5, 11.5, 11.5],
  legLen: 20,
  legR: 1,
  hipX: 7.5,
  hipZ: [13, -12],
  haunch: 1,
  tailN: 15,
  tailR: 3.5,
  tailTaper: 0.11,
  tailStep: [1.3, 2.2],
  tailLift: -0.11,
  sclera: 0xffffff,
  eyeScale: [5.4, 6, 3.9],
  pupilScale: [3, 3.9],
  slit: false,
  crossEyed: 0,
  lids: false,
  glow: 0xff2050,
  aura: null,
  whisker: 0xffffff,
  roughness: 0.9,
};

export const LOOKS = {
  tabby: TABBY,
  /** Big Biscuit: a wide white-orange loaf, tiny head, stubby legs, sleepy eyes. */
  chonk: {
    ...TABBY,
    paint: paintChonk,
    muzzle: 0xffffff,
    socks: 0xffffff,
    leg: 0xfff4e6,
    tailTip: 0xf29a40,
    body: [19, 15, 23],
    bodyY: 20,
    chest: [13, 10, 9],
    head: [0, 31, 22],
    headScale: 0.68,
    legLen: 9,
    legR: 1.25,
    hipX: 11,
    hipZ: [13, -12],
    haunch: 1.25,
    tailN: 9,
    tailR: 4.2,
    tailTaper: 0.12,
    tailStep: [1.0, 2.6],
    tailLift: -0.05,
    eyeScale: [5.2, 5.4, 3.9],
    pupilScale: [2.6, 3.2],
    lids: true,
    glow: 0xffa020,
    aura: 0x5a2a00,
  } as CatLook,
  /** Midnight: sleek black panther-ish cat, big yellow eyes, long thin tail. */
  shadow: {
    ...TABBY,
    paint: paintShadow,
    muzzle: 0x3a3646,
    socks: 0x2e2b38,
    leg: 0x2b2836,
    earInner: 0x5a3a55,
    earScale: 1.25,
    tailTip: 0x101016,
    nose: 0x3a2a35,
    body: [10.5, 10.5, 23],
    bodyY: 29,
    chest: [7, 8, 7],
    head: [0, 43, 22],
    headScale: 0.92,
    headShape: [12.5, 11.5, 12],
    legLen: 24,
    legR: 0.75,
    hipX: 6,
    hipZ: [14, -13],
    haunch: 0.85,
    tailN: 22,
    tailR: 2.2,
    tailTaper: 0.055,
    tailStep: [1.4, 2.3],
    tailLift: -0.085,
    sclera: 0xffd21a,
    eyeScale: [5.8, 6.4, 3.9],
    pupilScale: [1.2, 4.6],
    slit: true,
    glow: 0xb070ff,
    aura: 0x2a1060,
    whisker: 0x8a86a0,
    roughness: 0.55,
  } as CatLook,
  /** Duchess: cream Siamese with dark brown points and crossed blue eyes. */
  siamese: {
    ...TABBY,
    paint: paintSiamese,
    muzzle: 0x4a3020,
    bib: 0xfbf1de,
    socks: 0x3c2618,
    leg: 0x8a6448,
    ear: 0x3c2618,
    earInner: 0x6a4a3a,
    earScale: 1.3,
    tail: 0x4a3020,
    tailTip: 0x2e1c12,
    mask: 0x5a3a26,
    nose: 0x2e1c12,
    body: [12, 11.5, 22],
    bodyY: 27,
    chest: [8, 8.5, 7.5],
    head: [0, 41.5, 21],
    headScale: 0.95,
    headShape: [12.5, 11.5, 12],
    legLen: 21,
    legR: 0.85,
    hipX: 7,
    tailN: 17,
    tailR: 2.8,
    tailTaper: 0.08,
    sclera: 0x5ec4ff,
    eyeScale: [5.6, 5, 3.9],
    pupilScale: [2.4, 3.2],
    crossEyed: 1.4,
    glow: 0x60e0ff,
    aura: null,
    whisker: 0xf2e3c8,
    roughness: 0.8,
  } as CatLook,
};

export interface Leg {
  pivot: THREE.Group;
  front: boolean;
  side: number;
}

export class Cat implements CatRig {
  root = new THREE.Group();
  body = new THREE.Group(); // bobs and leans
  head = new THREE.Group();
  legs: Leg[] = [];
  tail: THREE.Object3D[] = [];
  pupils: THREE.Mesh[] = [];
  eyeGlow: THREE.Mesh[] = [];
  lids: THREE.Mesh[] = [];
  mouth!: THREE.Mesh;
  earL!: THREE.Group;
  earR!: THREE.Group;
  pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  furMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;

  walkPhase = 0;
  swipe = 0; // 1 -> 0 while a swipe plays
  swipeSide = 1;
  shake = 0; // wet-cat shake
  squash = 0;
  scare = 0; // startled by a cucumber: puffed fur, arched back, hop
  ultra = false;
  look = 0; // -1 left .. 1 right: pupils glance toward the latest hit
  private lookS = 0;
  private ultraS = 0; // smoothed 0..1 ultra pose
  private pupilBase: number[] = [];
  private tailFluff: THREE.Mesh[] = []; // each segment's own sphere (scaling the chained groups would compound)

  constructor(readonly lk: CatLook = TABBY) {
    const L = lk;
    const fur = new THREE.MeshStandardMaterial({ map: canvasTexture(L.paint), roughness: L.roughness });
    this.furMat = fur;
    const solid = (c: number, r = L.roughness) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const muzzle = solid(L.muzzle);
    const socks = L.socks === L.muzzle ? muzzle : solid(L.socks);
    const pink = solid(L.earInner, 0.6);
    const nose = solid(L.nose, 0.6);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const sclera = L.sclera === 0xffffff ? white : new THREE.MeshStandardMaterial({ color: L.sclera, roughness: 0.2, emissive: L.sclera, emissiveIntensity: 0.25 });
    const legMat = L.leg === null ? fur : solid(L.leg);
    const earMat = L.ear === null ? fur : solid(L.ear);
    const tailMat = L.tail === null ? fur : solid(L.tail);
    const sph = new THREE.SphereGeometry(1, 28, 20);
    this.glowMat = new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0, depthWrite: false });

    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: [number, number, number], s: [number, number, number] = [1, 1, 1]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...p);
      m.scale.set(...s);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    this.root.add(this.body);
    mk(sph, fur, this.body, [0, L.bodyY, 0], L.body);
    mk(sph, L.bib === null ? muzzle : solid(L.bib), this.body, [0, L.bodyY - 2, L.body[2] - 8], L.chest); // chest fluff

    // head
    this.head.position.set(...L.head);
    this.head.scale.setScalar(L.headScale);
    this.body.add(this.head);
    mk(sph, fur, this.head, [0, 2, 0], L.headShape);
    if (L.mask !== null) mk(sph, solid(L.mask), this.head, [0, 0.5, 6.2], [8.6, 8.2, 6]); // Siamese face mask
    mk(sph, muzzle, this.head, [-4.2, -2.2, 8.5], [5.2, 4.2, 3.8]); // cheeks / muzzle
    mk(sph, muzzle, this.head, [4.2, -2.2, 8.5], [5.2, 4.2, 3.8]);
    mk(sph, nose, this.head, [0, 0.4, 11.4], [1.6, 1.1, 1]);
    this.mouth = mk(sph, new THREE.MeshStandardMaterial({ color: 0x5a2a20 }), this.head, [0, -3.6, 11.2], [1.4, 0.9, 0.6]);
    const lidGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const wMat = new THREE.MeshBasicMaterial({ color: L.whisker });
    const whiskerGeo = new THREE.CylinderGeometry(0.12, 0.12, 12, 4);
    const earGeo = new THREE.ConeGeometry(4.6, 9, 4);
    const earInGeo = new THREE.ConeGeometry(2.8, 6, 4);
    const [ex, ey, ez] = L.eyeScale;
    for (const side of [-1, 1]) {
      // big googly eyes that bulge past the head outline, so they read from the 3/4 gameplay camera
      const eye = mk(sph, sclera, this.head, [side * 6.4, 4, 8.6], L.eyeScale);
      eye.castShadow = false;
      // slightly mismatched pupils: the derp is the point
      const px = side * 6.6 + (side > 0 ? 0.7 : -0.4) - side * L.crossEyed;
      const p = mk(sph, this.pupilMat, this.head, [px, 3.6 + (side > 0 ? 0.6 : -0.3), 8.6 + ez * 0.9], [L.pupilScale[0], L.pupilScale[1], 1.2]);
      this.pupils.push(p);
      this.pupilBase.push(p.position.x);
      mk(sph, white, this.head, [side * 6.4 + 1.2, 4 + ey * 0.3, 8.6 + ez * 1.1], [0.9, 0.9, 0.45]);
      if (L.lids) {
        // sleepy upper lid: a fur cap over the top of the eye, rotated down over it
        const lid = mk(lidGeo, fur, this.head, [side * 6.4, 4, 8.6], [ex * 1.08, ey * 1.08, ez * 1.12]);
        lid.rotation.x = 0.9;
        this.lids.push(lid);
      }
      const glow = new THREE.Mesh(sph, this.glowMat);
      glow.position.set(side * 6.4, 3.8, 8.6 + ez * 0.87);
      glow.scale.set(6.5, 6.5, 2.5);
      this.head.add(glow);
      this.eyeGlow.push(glow);
      // ears
      const ear = new THREE.Group();
      ear.position.set(side * 7.5, 11, -1);
      ear.rotation.z = -side * 0.35;
      ear.scale.setScalar(L.earScale);
      this.head.add(ear);
      mk(earGeo, earMat, ear, [0, 3.5, 0]).rotation.y = Math.PI / 4;
      mk(earInGeo, pink, ear, [0, 3, 1.2]).rotation.y = Math.PI / 4;
      if (side < 0) this.earL = ear;
      else this.earR = ear;
      // whiskers
      for (let w = 0; w < 3; w++) {
        const wh = new THREE.Mesh(whiskerGeo, wMat);
        wh.position.set(side * 10, -3 + w * 1.1, 9);
        wh.rotation.z = Math.PI / 2 + side * (w - 1) * 0.18;
        wh.rotation.y = side * 0.25;
        this.head.add(wh);
      }
    }

    // legs: pivot at the hip, leg hangs down to the ground
    const LL = L.legLen;
    const legGeo = new THREE.CylinderGeometry(3.6 * L.legR, 3.2 * L.legR, LL, 12);
    for (const [front, side] of [[true, -1], [true, 1], [false, -1], [false, 1]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(side * L.hipX, LL + 1, front ? L.hipZ[0] : L.hipZ[1]);
      this.body.add(pivot);
      mk(legGeo, legMat, pivot, [0, -LL / 2, 0]);
      mk(sph, socks, pivot, [0, -LL + 0.5, 1.2], [4.6 * L.legR, 3, 5.6 * L.legR]); // paw
      if (!front) mk(sph, fur, pivot, [0, -2, -1], [6 * L.haunch, 8 * L.haunch, 7 * L.haunch]); // haunch
      this.legs.push({ pivot, front, side });
    }

    // tail: chain of tightly overlapping spheres so it reads as one fluffy rope, not beads
    let parent: THREE.Object3D = this.body;
    let pos: [number, number, number] = [0, L.bodyY + (L.body[1] * 5) / 12, -(L.body[2] - 2)];
    const N = L.tailN;
    const tipMat = solid(L.tailTip);
    for (let i = 0; i < N; i++) {
      const seg = new THREE.Group();
      seg.position.set(...pos);
      parent.add(seg);
      const r = L.tailR - i * L.tailTaper;
      this.tailFluff.push(mk(sph, i >= N - 2 ? tipMat : tailMat, seg, [0, 0, 0], [r, r, r * 1.3]));
      this.tail.push(seg);
      parent = seg;
      pos = [0, L.tailStep[0], -L.tailStep[1]];
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = false;
    });
  }

  /** speed in world units per second, airborne true during a pounce */
  animate(dt: number, time: number, speed: number, airborne: boolean): void {
    const L = this.lk;
    this.ultraS += ((this.ultra ? 1 : 0) - this.ultraS) * Math.min(1, dt * 8);
    const u = this.ultraS;
    const sc = this.scare;
    const puff = sc > 0 ? Math.min(1, sc * 2) : 0; // fur stands up, then settles
    this.walkPhase += dt * (speed * 0.16 + (speed > 1 ? 2 : 0));
    const stride = Math.min(1, speed / 30) * 0.65;
    const flop = L === LOOKS.chonk && airborne && this.ultra; // superman belly flop
    for (const leg of this.legs) {
      const off = (leg.front ? 0 : Math.PI) + (leg.side > 0 ? Math.PI : 0); // diagonal gait
      let rx = Math.sin(this.walkPhase + off) * stride;
      let rz = 0;
      if (airborne) rx = leg.front ? -1.1 : 0.9;
      if (flop) {
        rx = leg.front ? -1.5 : 1.4;
        rz = leg.side * 0.7;
      }
      if (puff > 0) {
        // stiff, splayed legs: the classic Halloween cat
        rx *= 1 - puff;
        rz += leg.side * 0.22 * puff;
      }
      if (leg.front && leg.side === this.swipeSide && this.swipe > 0) {
        // swat: raise and fling forward
        const k = Math.sin(this.swipe * Math.PI);
        rx = -2.3 * k;
        rz = -leg.side * 0.6 * k;
      }
      leg.pivot.rotation.x = rx;
      leg.pivot.rotation.z = rz;
    }
    const bob = Math.abs(Math.sin(this.walkPhase)) * stride * 2.5;
    this.body.position.y = bob - this.squash * 8 + Math.sin(Math.min(1, sc) * Math.PI) * 6 + puff * 3;
    const fluff = 1 + puff * 0.14;
    this.body.scale.set((1 + this.squash * 0.25) * fluff, (1 - this.squash * 0.25) * (1 + puff * 0.18), (1 + this.squash * 0.1) * (1 - puff * 0.06));
    this.body.rotation.z = Math.sin(this.walkPhase) * stride * 0.04 + (this.swipe > 0 ? this.swipeSide * 0.12 * Math.sin(this.swipe * Math.PI) : 0);
    this.body.rotation.x = flop ? 0.15 : airborne ? -0.25 : 0;
    if (this.shake > 0) {
      this.body.rotation.z += Math.sin(time * 60) * 0.12 * this.shake;
      this.head.rotation.y = Math.sin(time * 70) * 0.4 * this.shake;
    } else {
      this.head.rotation.y = Math.sin(time * 0.7) * 0.25 * (1 - u * 0.7);
    }
    // ULTRA head pose: the tabby looks down the laser, Duchess throws her head back to yowl
    const yowl = L === LOOKS.siamese ? u : 0;
    this.head.rotation.x = this.ultra ? (yowl > 0 ? -0.28 * yowl + Math.sin(time * 30) * 0.03 : 0.18) : Math.sin(time * 1.1) * 0.06;
    this.head.rotation.z = Math.sin(time * 0.9) * 0.08;
    // mouth: a wide-open yowl, a small "o" on a scare
    const open = Math.max(yowl * (0.8 + Math.sin(time * 18) * 0.2), puff * 0.6, L === LOOKS.chonk ? u * 0.5 : 0);
    this.mouth.scale.set(1.4 + open * 1.8, 0.9 + open * 3.2, 0.6 + open * 0.4);
    this.mouth.position.y = -3.6 - open * 1.4;
    const twitch = Math.sin(time * 3.1) > 0.97 ? 0.4 : 0;
    const flat = Math.max(puff, L === LOOKS.shadow ? u : 0); // ears pinned back
    this.earL.rotation.x = -twitch - flat * 0.9;
    this.earR.rotation.x = (Math.sin(time * 2.3) > 0.98 ? -0.4 : 0) - flat * 0.9;
    const N = this.tail.length;
    for (let i = 0; i < N; i++) {
      const seg = this.tail[i];
      seg.rotation.y = Math.sin(time * 2.2 - i * 0.3) * 0.13 * (1 - puff);
      // a puffed tail shoots straight up; Midnight's streams straight back while dashing
      seg.rotation.x = L.tailLift + Math.sin(time * 1.4 - i * 0.24) * 0.036 - puff * (i === 0 ? 0.9 : 0.02) + (L === LOOKS.shadow ? u * 0.08 : 0);
      const r = this.lk.tailR - i * this.lk.tailTaper;
      const f = r * (1 + puff * 0.7); // bottle-brush tail
      this.tailFluff[i].scale.set(f, f, r * 1.3);
    }
    const glow = this.ultra ? 0.85 + Math.sin(time * 40) * 0.15 : 0;
    this.glowMat.opacity = glow;
    if (L.aura !== null) {
      this.furMat.emissive.setHex(L.aura);
      this.furMat.emissiveIntensity = u * (0.7 + Math.sin(time * 12) * 0.3);
    }
    this.pupilMat.color.setHex(this.ultra ? L.glow : 0x111111);
    for (let i = 0; i < this.lids.length; i++) this.lids[i].rotation.x = 0.9 - Math.max(u, puff) * 1.5; // eyes snap open
    this.lookS += (this.look - this.lookS) * Math.min(1, dt * 8);
    this.look *= Math.max(0, 1 - dt * 0.8);
    const pw = L.pupilScale[0];
    const ph = L.pupilScale[1];
    for (let i = 0; i < this.pupils.length; i++) {
      const p = this.pupils[i];
      // slit pupils when lasering (or always, for Midnight); saucers when scared
      const w = puff > 0 ? pw * (1 + puff * 0.6) : this.ultra ? Math.min(pw, 1.3) : pw;
      p.scale.x = L.slit && puff <= 0 ? pw * (this.ultra ? 0.6 : 1) : w;
      p.scale.y = ph * (1 + puff * 0.2);
      p.position.x = this.pupilBase[i] + this.lookS * 1.6 + Math.sin(time * 9 + i * 2) * 0.35; // a nervous wobble
    }

    this.swipe = Math.max(0, this.swipe - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.squash = Math.max(0, this.squash - dt * 3);
    this.scare = Math.max(0, this.scare - dt * 1.5);
  }

  /** world position of each eye */
  eyes(out: THREE.Vector3[]): void {
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < this.eyeGlow.length; i++) this.eyeGlow[i].getWorldPosition(out[i]);
  }
}

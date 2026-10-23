// The ending at Grandma Cat's cottage (META-UI lane). 12 s or less, any key or tap skips it.
//   A  (0 - 3.2 s)  outside at sunset: a crane shot from Mochi's face round to the path ahead (the cottage).
//   B  (3.6 - 10.6) inside: the door swings open, Mochi trots to the dinner bowl, "Home for dinner!",
//                   the camera drifts up to Grandma's portrait and the bells hanging on the door.
//   then the results card sits over the cozy room while the camera slowly breathes.
// Everything is procedural (primitives + canvas textures). The room is built far from the track and torn down on the
// next stageLoad / stageStart. Emits setPiece { id: 'ending', phase: 'start' | 'end' } for the audio jingle.
import * as THREE from 'three';
import { setCameraOverride } from '../core/camera';
import { hemi, scene, sun } from '../core/engine';
import { events } from '../core/events';
import { P } from '../core/player';
import { actors, kittenFactory } from '../core/registry';
import type { ActorRig, KittenRig, PlayerView } from '../core/types';
import { drawPortrait } from './portrait';

export const CUT = { exterior: 3.2, fadeOut: 0.4, interior: 7.6 };
const END = CUT.exterior + CUT.fadeOut + CUT.interior;
const ORIGIN = new THREE.Vector3(0, -800, 0);

// ---------------------------------------------------------------- materials / textures
let gradient: THREE.DataTexture | null = null;
function toonGrad(): THREE.DataTexture {
  if (gradient) return gradient;
  const d = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  disposables.push(gradient);
  return gradient;
}
const disposables: { dispose(): void }[] = [];
function mat(color: number, opts: { map?: THREE.Texture; emissive?: number; side?: THREE.Side } = {}): THREE.Material {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGrad(), map: opts.map ?? null, side: opts.side ?? THREE.FrontSide });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  disposables.push(m);
  return m;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  if (c) draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  disposables.push(t);
  return t;
}
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  disposables.push(geo);
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

function drawGrandma(c: CanvasRenderingContext2D, w: number, h: number): void {
  // ornate golden frame
  c.fillStyle = '#c8901c';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffd25a';
  c.fillRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  c.fillStyle = '#8a5a14';
  c.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.84);
  const g = c.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h / 2, w * 0.6);
  g.addColorStop(0, '#9fd0b8');
  g.addColorStop(1, '#3f7a64');
  c.fillStyle = g;
  c.fillRect(w * 0.13, h * 0.11, w * 0.74, h * 0.78);
  const u = w / 100;
  c.save();
  c.translate(w / 2, h * 0.58);
  c.lineWidth = 2.2 * u;
  c.strokeStyle = '#2a1c14';
  c.lineJoin = 'round';
  // shawl / shoulders
  c.fillStyle = '#b44a6a';
  c.beginPath();
  c.ellipse(0, 30 * u, 34 * u, 20 * u, 0, Math.PI, 0);
  c.fill();
  c.stroke();
  // ears
  for (const s of [-1, 1]) {
    c.fillStyle = '#9aa0aa';
    c.beginPath();
    c.moveTo(s * 25 * u, -14 * u);
    c.lineTo(s * 23 * u, -38 * u);
    c.lineTo(s * 6 * u, -24 * u);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // head
  c.fillStyle = '#9aa0aa';
  c.beginPath();
  c.ellipse(0, 0, 29 * u, 25 * u, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = '#f2f0ea';
  c.beginPath();
  c.ellipse(0, 10 * u, 17 * u, 12 * u, 0, 0, Math.PI * 2);
  c.fill();
  // glasses + kind closed eyes
  c.strokeStyle = '#2a1c14';
  c.lineWidth = 1.8 * u;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * 11 * u, -3 * u, 7 * u, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(s * 11 * u, -1 * u, 3.5 * u, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-4 * u, -3 * u);
  c.lineTo(4 * u, -3 * u);
  c.stroke();
  c.fillStyle = '#ff8fab';
  c.beginPath();
  c.moveTo(-3 * u, 6 * u);
  c.lineTo(3 * u, 6 * u);
  c.lineTo(0, 9 * u);
  c.fill();
  c.beginPath();
  c.moveTo(-5 * u, 12 * u);
  c.quadraticCurveTo(-2.5 * u, 15 * u, 0, 12 * u);
  c.quadraticCurveTo(2.5 * u, 15 * u, 5 * u, 12 * u);
  c.stroke();
  // a little bow
  c.fillStyle = '#ff4f7b';
  c.beginPath();
  c.ellipse(-14 * u, -24 * u, 6 * u, 4 * u, -0.5, 0, Math.PI * 2);
  c.ellipse(-4 * u, -27 * u, 6 * u, 4 * u, 0.4, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- fallback grandma (if cat-audio has no actor yet)
function fallbackGrandma(): ActorRig {
  const root = new THREE.Group();
  const grey = mat(0x9aa0aa);
  const white = mat(0xf2f0ea);
  const shawl = mat(0xb44a6a);
  const body = mesh(new THREE.SphereGeometry(0.55, 18, 14), grey, 0, 0.55, 0);
  body.scale.set(1, 1.1, 0.9);
  const chest = mesh(new THREE.SphereGeometry(0.36, 14, 10), white, 0, 0.65, 0.3);
  const sh = mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 20), shawl, 0, 0.95, 0);
  sh.rotation.x = Math.PI / 2;
  const head = new THREE.Group();
  head.position.set(0, 1.25, 0.05);
  head.add(mesh(new THREE.SphereGeometry(0.38, 18, 14), grey));
  const muz = mesh(new THREE.SphereGeometry(0.17, 12, 10), white, 0, -0.08, 0.3);
  head.add(muz);
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.28, 4), grey, s * 0.22, 0.32, 0);
    ear.rotation.z = -s * 0.3;
    head.add(ear);
    const lens = mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), mat(0x2a1c14), s * 0.13, 0.05, 0.34);
    head.add(lens);
  }
  const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.35, 4, 8), grey, 0.45, 0.85, 0.15);
  root.add(body, chest, sh, head, arm);
  return {
    root,
    animate(_dt, t, st) {
      head.rotation.z = Math.sin(t * 1.4) * 0.08;
      arm.rotation.z = st.action === 'wave' ? 2.4 + Math.sin(t * 9) * 0.35 : 0.3;
      arm.position.y = st.action === 'wave' ? 1.15 : 0.85;
    },
  };
}

// ---------------------------------------------------------------- the room
interface Room {
  group: THREE.Group;
  door: THREE.Group;
  bells: THREE.Group;
  bowlFood: THREE.Object3D;
  kitten: KittenRig | null;
  kittenAlt: THREE.Object3D | null;
  grandma: ActorRig | null;
  lamp: THREE.PointLight;
}

function buildRoom(bellCount: number): Room {
  const g = new THREE.Group();
  g.position.copy(ORIGIN);
  const W = 12;
  const D = 10;
  const H = 4.6;
  // floor planks
  const floorTex = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#b5703e';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#a8653a' : '#bd7a46';
      c.fillRect(0, (i * h) / 8, w, h / 8 - 4);
      c.fillStyle = '#7a4424';
      c.fillRect(((i * 137) % w) | 0, (i * h) / 8, 4, h / 8);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(W, D), mat(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  // walls with wainscot (one canvas texture)
  const wallTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#fbe4c0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,170,120,.35)';
    for (let x = 0; x < w; x += 32) for (let y = 0; y < h * 0.62; y += 32) {
      c.beginPath();
      c.arc(x + 16, y + 16, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#7fae7a';
    c.fillRect(0, h * 0.66, w, h * 0.34);
    c.fillStyle = '#5f8e5a';
    for (let x = 0; x < w; x += 32) c.fillRect(x, h * 0.68, 3, h * 0.32);
    c.fillStyle = '#4a3326';
    c.fillRect(0, h * 0.64, w, 6);
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(3, 1);
  const wallM = mat(0xffffff, { map: wallTex, side: THREE.DoubleSide });
  const back = mesh(new THREE.PlaneGeometry(W, H), wallM, 0, H / 2, -D / 2);
  const left = mesh(new THREE.PlaneGeometry(D, H), wallM, -W / 2, H / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = mesh(new THREE.PlaneGeometry(D, H), wallM, W / 2, H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  const front = mesh(new THREE.PlaneGeometry(W, H), wallM, 0, H / 2, D / 2);
  front.rotation.y = Math.PI;
  const ceil = mesh(new THREE.PlaneGeometry(W, D), mat(0xe8c9a0, { side: THREE.DoubleSide }), 0, H, 0);
  ceil.rotation.x = Math.PI / 2;
  g.add(back, left, right, front, ceil);
  const beamM = mat(0x6b3f22);
  for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, D), beamM, i * 2.4, H - 0.15, 0));

  // the door in the left wall, hinged at its back edge
  const door = new THREE.Group();
  door.position.set(-W / 2 + 0.05, 0, 1.6);
  const doorM = mat(0x4f9a5a);
  const slab = mesh(new THREE.BoxGeometry(0.12, 2.6, 1.5), doorM, 0, 1.3, -0.75);
  const trim = mat(0xffd25a);
  const knob = mesh(new THREE.SphereGeometry(0.07, 10, 8), trim, 0.1, 1.25, -1.3);
  const panel = mesh(new THREE.BoxGeometry(0.14, 0.7, 0.9), mat(0x3f8a4a), 0, 1.85, -0.75);
  door.add(slab, knob, panel);
  // the bells on a ribbon on the door, as many as were collected (at least one so the shot reads)
  const bells = new THREE.Group();
  bells.position.set(0.12, 2.25, -0.75);
  const ribbon = mesh(new THREE.BoxGeometry(0.02, 0.06, 1.1), mat(0xff4f7b), 0, 0.05, 0);
  bells.add(ribbon);
  const bellM = mat(0xffc21a, { emissive: 0x4a3000 });
  const bellGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const n = Math.max(1, bellCount);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    b.position.set(0.02, -0.04 - (i % 2) * 0.08, -0.5 + (i / Math.max(1, n - 1)) * 1.0);
    b.add(mesh(bellGeo, bellM));
    const string = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4), mat(0x2a1c14), 0, 0.08, 0);
    b.add(string);
    bells.add(b);
  }
  door.add(bells);
  // a glowing doorway behind the door (sunset outside)
  const glow = mesh(new THREE.PlaneGeometry(1.5, 2.6), new THREE.MeshBasicMaterial({ color: 0xffb46b }), -W / 2 + 0.02, 1.3, 0.85);
  disposables.push(glow.material as THREE.Material);
  glow.rotation.y = Math.PI / 2;
  g.add(door, glow);

  // window with a sunset on the back wall
  const winTex = canvasTex(256, 192, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#6a5acd');
    gr.addColorStop(0.55, '#ff9a6b');
    gr.addColorStop(1, '#ffd38a');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffe9a0';
    c.beginPath();
    c.arc(w * 0.6, h * 0.72, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6f8f4a';
    c.beginPath();
    c.moveTo(0, h);
    c.quadraticCurveTo(w * 0.3, h * 0.66, w * 0.6, h * 0.86);
    c.quadraticCurveTo(w * 0.8, h * 0.96, w, h * 0.8);
    c.lineTo(w, h);
    c.fill();
    c.strokeStyle = '#6b3f22';
    c.lineWidth = 12;
    c.strokeRect(0, 0, w, h);
    c.beginPath();
    c.moveTo(w / 2, 0);
    c.lineTo(w / 2, h);
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
  });
  const win = mesh(new THREE.PlaneGeometry(1.8, 1.35), new THREE.MeshBasicMaterial({ map: winTex }), 3.3, 2.4, -D / 2 + 0.03);
  disposables.push(win.material as THREE.Material);
  g.add(win);
  // curtains
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.4, 1.8, 0.08), mat(0xff7a9a), 3.3 + s * 1.05, 2.4, -D / 2 + 0.1));

  // Grandma's portrait above the table
  const portraitTex = canvasTex(256, 320, drawGrandma);
  const portrait = mesh(new THREE.PlaneGeometry(1.3, 1.62), new THREE.MeshBasicMaterial({ map: portraitTex }), -0.6, 2.75, -D / 2 + 0.04);
  disposables.push(portrait.material as THREE.Material);
  g.add(portrait);
  // a small Mochi photo next to it
  const mochiTex = canvasTex(160, 160, (c, w, h) => drawPortrait(c, w, h, 'happy', 0.4));
  const photo = mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: mochiTex }), 0.75, 2.45, -D / 2 + 0.04);
  disposables.push(photo.material as THREE.Material);
  g.add(photo);

  // table with the dinner bowl, cloth, a candle
  const wood = mat(0x8a5230);
  const table = new THREE.Group();
  table.position.set(-0.4, 0, -3.2);
  table.add(mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 28), wood, 0, 0.9, 0));
  table.add(mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.04, 28), mat(0xfff1d6), 0, 0.96, 0));
  table.add(mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 10), wood, 0, 0.45, 0));
  table.add(mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.06, 18), wood, 0, 0.03, 0));
  const candle = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), mat(0xfff7ea), 0.6, 1.13, -0.3);
  const flame = mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36a }), 0.6, 1.33, -0.3);
  disposables.push(flame.material as THREE.Material);
  flame.scale.y = 1.8;
  table.add(candle, flame);
  g.add(table);
  // the bowl sits on the floor by the table (kitten-height)
  const bowl = new THREE.Group();
  bowl.position.set(1.0, 0, -1.6);
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.32, 0), new THREE.Vector2(0.4, 0.08), new THREE.Vector2(0.42, 0.22), new THREE.Vector2(0.36, 0.22), new THREE.Vector2(0.3, 0.1), new THREE.Vector2(0, 0.1)];
  bowl.add(mesh(new THREE.LatheGeometry(pts, 24), mat(0xff4f7b)));
  const food = new THREE.Group();
  food.add(mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9874a), 0, 0.1, 0));
  const fishM = mat(0x7fd0ff);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group();
    f.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), fishM));
    (f.children[0] as THREE.Mesh).scale.set(1.6, 0.6, 0.5);
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.12, 4), fishM, -0.22, 0, 0);
    tail.rotation.z = Math.PI / 2;
    f.add(tail);
    f.position.set(Math.cos(i * 2.1) * 0.14, 0.32, Math.sin(i * 2.1) * 0.14);
    f.rotation.set(0.3, i * 2.1, 0.4);
    food.add(f);
  }
  bowl.add(food);
  // a name tag on the bowl
  g.add(bowl);
  // rug
  const rug = mesh(new THREE.CircleGeometry(2.2, 32), mat(0xd9483b), 0.4, 0.01, -1.0);
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.3, 1, 1);
  const rug2 = mesh(new THREE.RingGeometry(1.7, 1.9, 32), mat(0xffd25a), 0.4, 0.015, -1.0);
  rug2.rotation.x = -Math.PI / 2;
  rug2.scale.set(1.3, 1, 1);
  g.add(rug, rug2);
  // armchair + grandma
  const chair = new THREE.Group();
  chair.position.set(-2.75, 0, -3.25);
  chair.rotation.y = 0.55;
  const cm = mat(0x6a6ad0);
  chair.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 1.3), cm, 0, 0.35, 0));
  chair.add(mesh(new THREE.BoxGeometry(1.5, 1.3, 0.3), cm, 0, 0.95, -0.55));
  for (const s of [-1, 1]) chair.add(mesh(new THREE.BoxGeometry(0.25, 0.75, 1.3), cm, s * 0.75, 0.6, 0));
  g.add(chair);
  let grandma: ActorRig | null = null;
  try {
    grandma = actors.has('grandma') ? actors.get('grandma').build() : fallbackGrandma();
  } catch {
    grandma = fallbackGrandma();
  }
  grandma.root.position.set(0, 0.6, 0.05);
  chair.add(grandma.root);
  // a bookshelf + a potted plant to fill the corner
  const shelf = new THREE.Group();
  shelf.position.set(-4.2, 0, -4.6);
  shelf.add(mesh(new THREE.BoxGeometry(1.8, 2.4, 0.6), wood, 0, 1.2, 0));
  const bookCols = [0xff4f7b, 0x4cc3ff, 0xffc21a, 0x7ccf5a, 0xb44a6a, 0xff8a2a];
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 6; i++) shelf.add(mesh(new THREE.BoxGeometry(0.2, 0.5 + ((i * 7 + r) % 3) * 0.08, 0.4), mat(bookCols[(i + r) % 6]), -0.6 + i * 0.24, 0.5 + r * 0.72, 0.12));
  g.add(shelf);
  const pot = mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), mat(0xc9603a), 5.2, 0.25, -4.4);
  const leaves = mesh(new THREE.IcosahedronGeometry(0.6, 1), mat(0x4f9a3c), 5.2, 0.95, -4.4);
  g.add(pot, leaves);
  // a warm hanging lamp
  const lamp = new THREE.PointLight(0xffc98a, 30, 14, 1.6);
  lamp.position.set(0, 3.4, -1.2);
  const shade = mesh(new THREE.ConeGeometry(0.45, 0.4, 16, 1, true), mat(0xffd25a, { emissive: 0x6a4a10, side: THREE.DoubleSide }), 0, 3.6, -1.2);
  const bulb = mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }), 0, 3.42, -1.2);
  disposables.push(bulb.material as THREE.Material);
  g.add(lamp, shade, bulb);
  const fill = new THREE.PointLight(0xffa070, 10, 12, 1.6);
  fill.position.set(-4.5, 1.6, 1.2);
  g.add(fill);

  // the kitten
  let kitten: KittenRig | null = null;
  let kittenAlt: THREE.Object3D | null = null;
  const f = kittenFactory();
  try {
    if (f) {
      kitten = f();
      g.add(kitten.root);
    }
  } catch (err) {
    console.warn('cutscene kitten failed', err);
    kitten = null;
  }
  if (!kitten) {
    kittenAlt = mesh(new THREE.CapsuleGeometry(0.3, 0.4, 4, 8), mat(0xff9a3c), 0, 0.5, 0);
    g.add(kittenAlt);
  }
  return { group: g, door, bells, bowlFood: food, kitten, kittenAlt, grandma, lamp };
}

// ---------------------------------------------------------------- playback
const view: PlayerView = {
  s: 0,
  x: 0,
  y: 0,
  vy: 0,
  speed: 0,
  mode: 'run',
  surface: 'ground',
  grounded: true,
  sliding: false,
  sinceLand: 9,
  sinceJump: 9,
  sincePounce: 9,
  sinceHit: 9,
  landImpact: 0,
  airTime: 0,
  lean: 0,
  invuln: 0,
  wet: 0,
  ability: null,
  abilityT: 0,
  world: { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(-1, 0, 0) },
};

let room: Room | null = null;
let time = 0;
let onDone: (() => void) | null = null;
let doneFired = false;
let interior = false;
let saved: { sun: number; hemi: number; fog: THREE.Fog | THREE.FogExp2 | null; bg: THREE.Color | THREE.Texture | null } | null = null;
let fadeEl: HTMLElement | null = null;
let captionEl: HTMLElement | null = null;
let captionSecond = false;
let bellText = '';
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const extK = new THREE.Vector3();
const extF = new THREE.Vector3();
const extR = new THREE.Vector3();
const BG = new THREE.Color(0x2a1c14);
const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** the kitten's path inside: from the doorway to the bowl */
const DOOR_P = new THREE.Vector3(-5.6, 0, 0.85);
const BOWL_P = new THREE.Vector3(0.35, 0, -1.25);

function enterInterior(): void {
  if (interior || !room) return;
  interior = true;
  scene.add(room.group);
  saved = { sun: sun.intensity, hemi: hemi.intensity, fog: scene.fog, bg: scene.background as THREE.Color | THREE.Texture | null };
  scene.fog = null;
  scene.background = BG;
}

function override(cam: THREE.PerspectiveCamera, dt: number, t: number): void {
  time += dt;
  const T = time;
  if (fadeEl) fadeEl.classList.toggle('on', (T > CUT.exterior - 0.1 && T < CUT.exterior + CUT.fadeOut + 0.05) || (T > END - 0.2 && T < END + 0.15 && !doneFired));
  if (T < CUT.exterior + CUT.fadeOut * 0.6 && !interior) {
    // ---- A: exterior crane, front of Mochi round to behind her, looking down the path at the cottage
    extK.copy(P.world.pos);
    extF.copy(P.world.fwd).setY(0).normalize();
    extR.crossVectors(extF, view.world.up).normalize();
    // behind Mochi's shoulder, a slow crane up that looks past her down the path to the cottage
    const k = smooth(0, CUT.exterior + 0.4, T);
    tmpA.copy(extK).addScaledVector(extF, -4.2).addScaledVector(extR, -1.7);
    tmpA.y += 1.3;
    tmpB.copy(extK).addScaledVector(extF, -7.5).addScaledVector(extR, -0.6);
    tmpB.y += 3.6;
    camPos.lerpVectors(tmpA, tmpB, k);
    tmpA.copy(extK).addScaledVector(extF, 6);
    tmpA.y += 1.4;
    tmpB.copy(extK).addScaledVector(extF, 34);
    tmpB.y += 3.2;
    camLook.lerpVectors(tmpA, tmpB, k);
    cam.position.copy(camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(camLook);
    setFov(cam, 50);
    return;
  }
  enterInterior();
  if (!room) return;
  // the theme may relight the world every frame: keep the room cozy
  sun.intensity = 0.25;
  hemi.intensity = 0.55;
  scene.fog = null;
  const ti = T - CUT.exterior - CUT.fadeOut; // interior time
  // door swings open, then closes behind Mochi
  room.door.rotation.y = -1.45 * smooth(0, 0.6, ti) * (1 - smooth(2.6, 3.4, ti));
  // the bells jingle
  for (let i = 1; i < room.bells.children.length; i++) room.bells.children[i].rotation.x = Math.sin(t * 9 + i) * 0.35 * (1 - smooth(3, 5.5, ti) * 0.7);
  // Mochi trots in to the bowl and eats
  const walk = smooth(0.35, 2.6, ti);
  tmpA.lerpVectors(DOOR_P, BOWL_P, walk);
  const kRoot = room.kitten?.root ?? room.kittenAlt;
  const eating = walk >= 0.98 && ti < 5.8;
  const waving = walk >= 0.98 && !eating;
  if (kRoot) {
    kRoot.position.copy(tmpA);
    const dx = BOWL_P.x - DOOR_P.x;
    const dz = BOWL_P.z - DOOR_P.z;
    // walking: along the path; eating: nose in the bowl; waving: the victory pose turns her round to the camera
    kRoot.rotation.y = waving ? Math.atan2(-2.25, -4.85) : walk < 0.98 ? Math.atan2(dx, dz) : Math.atan2(0.65, -0.35);
    kRoot.rotation.x = eating ? Math.max(0, Math.sin(t * 10)) * 0.07 : 0;
  }
  if (room.kitten) {
    const moving = walk > 0.01 && walk < 0.98;
    view.speed = moving ? 9 : 0;
    view.mode = waving ? 'finish' : 'run';
    view.grounded = true;
    view.world.pos.copy(tmpA);
    room.kitten.animate(dt, t, view);
  }
  room.bowlFood.scale.setScalar(1 - smooth(3.2, 6.5, ti) * 0.55);
  room.grandma?.animate(dt, t, { speed: 0, action: ti > 2.4 && ti < 5.6 ? 'wave' : 'sit' });
  room.lamp.intensity = 30 + Math.sin(t * 7) * 1.2;
  if (captionEl) {
    const second = ti > 5.75;
    if (second !== captionSecond) {
      captionSecond = second;
      captionEl.textContent = second ? bellText : 'Home for dinner!';
    }
    captionEl.classList.toggle('on', (ti > 2.4 && ti < 5.55) || (ti > 5.95 && ti < 7.5));
  }
  // camera: a shot through the room following Mochi, then up to the portrait, then over to the door bells
  const o = ORIGIN;
  if (ti < 2.8) {
    camPos.set(1.8, 1.7, 3.4).add(o);
    tmpA.copy(kRoot ? kRoot.position : BOWL_P).add(o);
    tmpA.y += 0.5;
    camLook.lerp(tmpA, ti < 0.05 ? 1 : 1 - Math.exp(-6 * dt));
  } else if (ti < 4.6) {
    // the close-up: the look target rides on Mochi's head (no lag), and the camera stops a little further out and
    // higher, so her head and ears stay well inside the frame while the camera swings round
    const k = smooth(2.8, 3.8, ti);
    tmpA.set(1.8, 1.7, 3.4);
    tmpB.set(2.85, 1.6, -2.2);
    camPos.lerpVectors(tmpA, tmpB, k).add(o);
    const ry = kRoot ? kRoot.rotation.y : 0;
    tmpA.copy(kRoot ? kRoot.position : BOWL_P);
    tmpA.x += Math.sin(ry) * 0.3;
    tmpA.z += Math.cos(ry) * 0.3;
    tmpA.y += 0.62;
    tmpA.add(o);
    camLook.lerp(tmpA, 1 - Math.exp(-12 * dt));
  } else if (ti < 6.0) {
    const k = smooth(4.6, 5.6, ti);
    tmpA.set(2.85, 1.6, -2.2);
    tmpB.set(0.4, 2.1, 0.8);
    camPos.lerpVectors(tmpA, tmpB, k).add(o);
    tmpA.set(-1.1, 2.2, -5).add(o);
    camLook.lerp(tmpA, 1 - Math.exp(-4 * dt));
  } else if (ti <= 7.6) {
    const k = smooth(6.0, 7.2, ti);
    tmpA.set(0.4, 2.1, 0.8);
    tmpB.set(-3.4, 2.0, 0.2);
    camPos.lerpVectors(tmpA, tmpB, k).add(o);
    tmpA.set(-5.9, 2.2, 0.85).add(o);
    camLook.lerp(tmpA, 1 - Math.exp(-4 * dt));
  } else {
    // results: a slow breathing wide shot of the room (Mochi, Grandma, the portrait)
    const b = ti - 7.6;
    const kk = smooth(0, 1.6, b);
    tmpA.set(-3.4, 2.0, 0.2);
    tmpB.set(2.6 + Math.sin(b * 0.25) * 0.5, 2.3, 3.6);
    camPos.lerpVectors(tmpA, tmpB, kk).add(o);
    tmpA.set(-0.6, 1.3, -2.4).add(o);
    camLook.lerp(tmpA, 1 - Math.exp(-2.5 * dt));
  }
  cam.position.copy(camPos);
  cam.up.set(0, 1, 0);
  cam.lookAt(camLook);
  setFov(cam, cam.aspect < 1 ? 70 : 52);
  if (T >= END && !doneFired) finish();
}

function setFov(cam: THREE.PerspectiveCamera, fov: number): void {
  if (Math.abs(cam.fov - fov) > 0.01) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

function finish(): void {
  if (doneFired) return;
  doneFired = true;
  captionEl?.classList.remove('on');
  fadeEl?.classList.remove('on');
  events.emit('setPiece', { id: 'ending', phase: 'end' });
  const cb = onDone;
  onDone = null;
  cb?.();
}

/** Play the ending. done() runs once at the end (or on skip). */
export function playEnding(bellCount: number, done: () => void): void {
  stopEnding();
  fadeEl = document.getElementById('fade');
  captionEl = document.getElementById('cutCaption');
  room = buildRoom(bellCount);
  captionSecond = false;
  bellText = bellCount >= 7 ? 'All 7 bells on the door!' : bellCount > 0 ? `${bellCount}/7 bells on the door` : 'Next time: find the bells!';
  if (captionEl) captionEl.textContent = 'Home for dinner!';
  time = 0;
  doneFired = false;
  interior = false;
  onDone = done;
  camLook.copy(P.world.pos);
  setCameraOverride(override);
  events.emit('setPiece', { id: 'ending', phase: 'start' });
}

/** Any key / tap: jump to the final cozy shot and the results. */
export function skipEnding(): void {
  // the first second can't be skipped: a player still mashing keys across the finish line keeps the cutscene
  if (!room || doneFired || time < 1) return;
  if (!interior) enterInterior();
  time = END + 0.01;
  // settle the scene in its final pose
  const kRoot = room.kitten?.root ?? room.kittenAlt;
  if (kRoot) kRoot.position.copy(BOWL_P);
  // land straight on the cozy results shot (no swing from the exterior look target)
  camLook.set(-0.6, 1.3, -2.4).add(ORIGIN);
  fadeEl?.classList.remove('on');
  finish();
  time = END + 2;
}

export const endingActive = () => !!room;

/** Tear down the room and give the camera back (next stage start / load). */
export function stopEnding(): void {
  if (room) {
    scene.remove(room.group);
    room.kitten?.dispose?.();
    room.grandma?.dispose?.();
    room = null;
  }
  for (const d of disposables) d.dispose();
  disposables.length = 0;
  gradient = null;
  if (saved) {
    sun.intensity = saved.sun;
    hemi.intensity = saved.hemi;
    scene.fog = saved.fog;
    scene.background = saved.bg;
    saved = null;
  }
  interior = false;
  onDone = null;
  fadeEl?.classList.remove('on');
  captionEl?.classList.remove('on');
  setCameraOverride(null);
}

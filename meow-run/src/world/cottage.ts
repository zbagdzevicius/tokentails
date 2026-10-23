// Finish-line dressing (WORLD-ART).
//  - every campaign stage: a garden plateau past the end of the run-out so the view never ends in the void
//  - sunset (stage.ending): Grandma Cat's cottage at the end of the path, a garden gate with a HOME sign at the
//    finish line, picket fence, stepping stones, lanterns, flower boxes, glowing windows and a fish weathervane.
// `cottage` (exported) tells meta-ui's cutscene where things are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { spawnParticle } from '../core/fx';
import { newFrame, type Track } from '../core/track';
import type { Palette } from './palette';
import { seeded } from './noise';

/** Where the cottage is (world space). active = the current stage has the ending cottage. */
export const cottage = {
  active: false,
  /** house centre on the ground */
  pos: new THREE.Vector3(),
  /** unit vector the front door faces (back toward the arriving kitten) */
  front: new THREE.Vector3(0, 0, -1),
  /** ground point just outside the front door */
  door: new THREE.Vector3(),
  /** the garden gate on the path (= the finish line) */
  gate: new THREE.Vector3(),
  /** rotation.y that makes an object's local +z face `front` */
  yaw: 0,
  /** chimney top (smoke) */
  chimney: new THREE.Vector3(),
};

type Part = THREE.BufferGeometry;
function painted(g: THREE.BufferGeometry, hex: number): Part {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  n.deleteAttribute('normal');
  n.computeVertexNormals();
  const c = new THREE.Color(hex);
  const arr = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r;
    arr[i + 1] = c.g;
    arr[i + 2] = c.b;
  }
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}
function box(list: Part[], w: number, h: number, d: number, hex: number, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0): void {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  list.push(painted(g, hex));
}
function cyl(list: Part[], r0: number, r1: number, h: number, seg: number, hex: number, x: number, y: number, z: number): void {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  g.translate(x, y + h / 2, z);
  list.push(painted(g, hex));
}
function ball(list: Part[], r: number, hex: number, x: number, y: number, z: number, detail = 0): void {
  list.push(painted(new THREE.IcosahedronGeometry(r, detail).translate(x, y, z), hex));
}
function mesh(list: Part[], mat: THREE.Material, shadows: boolean): THREE.Mesh | null {
  if (!list.length) return null;
  const g = mergeGeometries(list, false) as THREE.BufferGeometry;
  for (const p of list) p.dispose();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#8a5a34';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#a8744a';
  for (let i = 0; i < 4; i++) g.fillRect(0, 6 + i * 24, 256, 10);
  g.strokeStyle = '#5a3a20';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 88);
  g.font = 'bold 54px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff4dc';
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface FinishDressing {
  group: THREE.Group;
  dispose(): void;
  /** per-frame (smoke) */
  update(dt: number, t: number): void;
}

const fr = newFrame();
const m4 = new THREE.Matrix4();
const xa = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** an upright frame at track s: returns a matrix whose local +z = path forward (flattened), +x = runner's left */
function uprightAt(track: Track, s: number, x: number, out: THREE.Matrix4): THREE.Matrix4 {
  track.sample(s, fr);
  const f = new THREE.Vector3(fr.fwd.x, 0, fr.fwd.z).normalize();
  xa.crossVectors(UP, f); // runner's left
  out.makeBasis(xa, UP, f);
  const p = fr.pos.clone().addScaledVector(fr.right, x);
  out.setPosition(p);
  return out;
}

export function buildFinish(track: Track, finishS: number, p: Palette, ending: boolean, groundMat: THREE.Material, low: boolean): FinishDressing {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: true });
  disposables.push(solid, glow);
  const end = track.length;
  track.sample(end, fr);
  const endY = fr.pos.y;
  const shadows = !low;

  // ---------- garden plateau past the end of the path (and a rock skirt down to the valley)
  {
    const centreS = end + 22;
    uprightAt(track, centreS, 0, m4);
    const disc = new THREE.CircleGeometry(70, 40).rotateX(-Math.PI / 2);
    const n = disc.attributes.position.count;
    const colA = new Float32Array(n * 3);
    const c = new THREE.Color();
    const c2 = new THREE.Color(p.grassB);
    for (let i = 0; i < n; i++) {
      const x = disc.attributes.position.getX(i);
      const z = disc.attributes.position.getZ(i);
      c.setHex(p.grassA).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.1) * Math.cos(z * 0.13));
      colA[i * 3] = c.r;
      colA[i * 3 + 1] = c.g;
      colA[i * 3 + 2] = c.b;
      // gentle mound so the edge rolls away
      const r = Math.hypot(x, z);
      disc.attributes.position.setY(i, -0.12 - Math.max(0, r - 30) * Math.max(0, r - 30) * 0.012);
    }
    disc.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    const uv = disc.attributes.uv;
    for (let i = 0; i < n; i++) uv.setXY(i, disc.attributes.position.getX(i) / 7, disc.attributes.position.getZ(i) / 7);
    disc.computeVertexNormals();
    const dm = new THREE.Mesh(disc, groundMat);
    dm.applyMatrix4(m4);
    dm.position.y = endY;
    dm.receiveShadow = shadows;
    group.add(dm);
    disposables.push(disc);
  }

  if (!ending) {
    // the finish arch itself is a set piece ('finish', SETPIECES lane); the world only adds the plateau
    cottage.active = false;
    return {
      group,
      update() {},
      dispose() {
        group.removeFromParent();
        for (const d of disposables) d.dispose();
      },
    };
  }

  // ---------- Grandma Cat's cottage
  const houseS = end + 16; // the path's run-out ends at `end`; the house sits just beyond it
  const parts: Part[] = [];
  const glowParts: Part[] = [];
  // local frame: +z = toward the runner (front), so build with the door on +z then rotate 180 about y
  const W = 9;
  const D = 7;
  const H = 4.2;
  box(parts, W + 0.6, 0.7, D + 0.6, 0xb8a58a, 0, 0.25, 0); // stone footing
  box(parts, W, H, D, 0xf4e6c8, 0, 0.6 + H / 2, 0); // plaster walls
  // half-timber frame on the front and sides
  const beam = 0x6a4428;
  for (const x of [-W / 2, -1.6, 1.6, W / 2]) box(parts, 0.28, H, 0.2, beam, x, 0.6 + H / 2, D / 2 + 0.05);
  box(parts, W + 0.1, 0.3, 0.22, beam, 0, 0.6 + H - 0.1, D / 2 + 0.05);
  box(parts, W + 0.1, 0.25, 0.22, beam, 0, 0.75, D / 2 + 0.05);
  for (const sx of [-1, 1]) {
    box(parts, 0.2, H, 0.28, beam, sx * (W / 2 + 0.05), 0.6 + H / 2, -D / 2);
    box(parts, 0.2, 0.3, D + 0.1, beam, sx * (W / 2 + 0.05), 0.6 + H - 0.1, 0);
    box(parts, 0.18, 3.6, 0.2, beam, sx * (W / 2 - 1.1), 2.6, D / 2 + 0.06, 0, sx * 0.62);
  }
  // gable roof (ridge along x), with overhang; tiles as stacked strips
  const roofC = 0xb5523b;
  const roofD = 0x8e3b2a;
  const rh = 3.2;
  const slope = Math.atan2(rh, D / 2 + 0.6);
  const rl = Math.hypot(rh, D / 2 + 0.9);
  for (const sz of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6;
      const z = sz * (D / 2 + 0.9) * (1 - t);
      const y = 0.6 + H + rh * t;
      box(parts, W + 1.4, 0.22, rl / 6 + 0.12, k % 2 ? roofC : 0xc25e44, 0, y - 0.05, z, 0, 0, sz * slope);
    }
  }
  box(parts, W + 1.6, 0.35, 0.5, roofD, 0, 0.6 + H + rh + 0.05, 0);
  // gable ends (triangles)
  for (const sx of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const x = sx * (W / 2);
    const y0 = 0.6 + H;
    const verts = sx > 0 ? [x, y0, D / 2, x, y0, -D / 2, x, y0 + rh, 0] : [x, y0, -D / 2, x, y0, D / 2, x, y0 + rh, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    parts.push(painted(g, 0xf4e6c8));
    ball(glowParts, 0.55, 0xffd27a, sx * (W / 2 + 0.02), y0 + 1.2, 0, 1);
  }
  // chimney
  box(parts, 1.1, 3.4, 1.1, 0xa04a36, 2.6, 0.6 + H + 2.4, -1.2);
  box(parts, 1.4, 0.3, 1.4, 0x7a3828, 2.6, 0.6 + H + 4.15, -1.2);
  // door with frame, knob and a little awning
  box(parts, 1.9, 3.0, 0.2, 0xf8f2e2, 0, 0.6 + 1.5, D / 2 + 0.1);
  box(parts, 1.5, 2.7, 0.22, 0x3f8f7a, 0, 0.6 + 1.35, D / 2 + 0.14);
  ball(parts, 0.1, 0xffd166, 0.5, 2.0, D / 2 + 0.3);
  box(parts, 2.4, 0.18, 1.1, roofC, 0, 0.6 + 3.25, D / 2 + 0.55, 0, 0, -0.35);
  // windows (glowing) with frames, shutters and flower boxes
  for (const sx of [-1, 1]) {
    const x = sx * 2.9;
    box(glowParts, 1.4, 1.3, 0.1, 0xffd27a, x, 2.75, D / 2 + 0.08);
    box(parts, 1.6, 0.14, 0.18, 0xf8f2e2, x, 3.45, D / 2 + 0.1);
    box(parts, 1.6, 0.14, 0.18, 0xf8f2e2, x, 2.05, D / 2 + 0.1);
    box(parts, 0.1, 1.3, 0.18, 0xf8f2e2, x, 2.75, D / 2 + 0.12);
    box(parts, 1.4, 0.1, 0.16, 0xf8f2e2, x, 2.75, D / 2 + 0.12);
    for (const k of [-1, 1]) box(parts, 0.55, 1.5, 0.1, 0x3f8f7a, x + k * 1.05, 2.75, D / 2 + 0.1);
    box(parts, 1.6, 0.4, 0.45, 0x8a5a34, x, 1.85, D / 2 + 0.3);
    const fc = [0xff6b8a, 0xffd166, 0xff9ec7, 0xffffff];
    for (let i = 0; i < 6; i++) ball(parts, 0.17, fc[i % fc.length], x - 0.65 + i * 0.26, 2.15, D / 2 + 0.35);
  }
  // fish weathervane on the ridge
  cyl(parts, 0.04, 0.04, 1.4, 4, 0x444444, -2.8, 0.6 + H + rh, 0);
  {
    const g = new THREE.SphereGeometry(0.35, 8, 6).scale(1.6, 0.7, 0.25).translate(-2.8, 0.6 + H + rh + 1.4, 0);
    parts.push(painted(g, 0xffb347));
    const tail = new THREE.ConeGeometry(0.3, 0.5, 3).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-2.8 - 0.75, 0.6 + H + rh + 1.4, 0);
    parts.push(painted(tail, 0xffb347));
  }
  // porch steps + doormat
  box(parts, 2.6, 0.3, 1.0, 0xb8a58a, 0, 0.15, D / 2 + 0.8);
  box(parts, 1.4, 0.04, 0.8, 0xc0392b, 0, 0.32, D / 2 + 0.8);
  // garden tree and bushes beside the house
  ball(parts, 2.2, p.leafA, -W / 2 - 3.6, 4.6, -1.5, 1);
  ball(parts, 1.6, p.leafB, -W / 2 - 2.6, 5.6, -0.6, 1);
  cyl(parts, 0.3, 0.4, 3.6, 6, p.trunk, -W / 2 - 3.4, 0, -1.3);
  for (const [x, z, r] of [
    [-W / 2 - 0.6, D / 2 + 0.6, 0.8],
    [W / 2 + 0.7, D / 2 + 0.4, 0.9],
    [W / 2 + 1.6, -1, 1.1],
  ])
    ball(parts, r, p.bush, x, r * 0.6, z, 1);
  const house = mesh(parts, solid, shadows);
  if (house) house.receiveShadow = false; // overlapping roof strips would self-shadow in blotches
  const houseGlow = mesh(glowParts, glow, false);

  // place: centre at houseS on the path line, door facing back down the path
  track.sample(Math.min(houseS, track.length), fr);
  const fwd = new THREE.Vector3(fr.fwd.x, 0, fr.fwd.z).normalize();
  const centre = fr.pos.clone().addScaledVector(fwd, houseS - track.length + D / 2 + 1);
  centre.y = endY - 0.1;
  const yaw = Math.atan2(-fwd.x, -fwd.z); // local +z -> -fwd
  for (const m of [house, houseGlow]) {
    if (!m) continue;
    m.position.copy(centre);
    m.rotation.y = yaw;
    group.add(m);
    disposables.push(m.geometry);
  }
  cottage.active = true;
  cottage.pos.copy(centre);
  cottage.front.copy(fwd).negate();
  cottage.yaw = yaw;
  cottage.door.copy(centre).addScaledVector(cottage.front, D / 2 + 1.4);
  cottage.chimney.set(2.6, 0.6 + H + 4.4, -1.2).applyAxisAngle(UP, yaw).add(centre);

  // ---------- garden: gate at the finish line, fence, stepping stones, lanterns
  const g2: Part[] = [];
  const glow2: Part[] = [];
  track.sample(finishS, fr);
  const hw = fr.width / 2;
  const gx = hw + 1.8;
  for (const sx of [-1, 1]) {
    box(g2, 0.7, 4.6, 0.7, 0xc9b79a, sx * gx, 2.3, 0); // stone gate posts
    box(g2, 0.9, 0.3, 0.9, 0xa8967a, sx * gx, 4.7, 0);
    // open picket gate leaves swung against the fence
    for (let i = 0; i < 4; i++) box(g2, 0.18, 1.5, 0.08, 0xfdf8ec, sx * (gx - 0.6), 0.85, 0.35 + i * 0.32, 0, 0, 0);
    box(g2, 0.1, 0.12, 1.3, 0xfdf8ec, sx * (gx - 0.6), 1.3, 0.85);
    // lantern
    cyl(g2, 0.06, 0.06, 0.6, 4, 0x333333, sx * gx, 4.85, 0);
    box(glow2, 0.4, 0.5, 0.4, 0xffd27a, sx * gx, 5.7, 0);
    box(g2, 0.55, 0.12, 0.55, 0x333333, sx * gx, 6.0, 0);
  }
  // arch beam with the HOME sign
  box(g2, gx * 2 + 1.0, 0.4, 0.4, 0x8a5a34, 0, 6.35, 0);
  const signTex = signTexture('HOME');
  const signMat = new THREE.MeshLambertMaterial({ map: signTex });
  disposables.push(signTex, signMat);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), signMat);
  // cat ears on the sign
  for (const sx of [-1, 1]) {
    const e = new THREE.ConeGeometry(0.32, 0.5, 3).translate(sx * 1.2, 7.55, 0);
    g2.push(painted(e, 0x8a5a34));
  }
  const gate = mesh(g2, solid, shadows);
  const gateGlow = mesh(glow2, glow, false);
  uprightAt(track, finishS, 0, m4);
  for (const m of [gate, gateGlow]) {
    if (!m) continue;
    m.applyMatrix4(m4);
    group.add(m);
    disposables.push(m.geometry);
  }
  // the sign faces the arriving runner (-forward)
  sign.position.set(0, 7.05, -0.25).applyMatrix4(m4);
  sign.quaternion.setFromRotationMatrix(m4).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
  group.add(sign);
  disposables.push(sign.geometry);
  cottage.gate.setFromMatrixPosition(m4);

  // picket fence along both sides of the garden path, stepping stones, flowers
  const fence: Part[] = [];
  const rnd = seeded(8);
  for (let s = finishS + 1.5; s < track.length + 8; s += 0.9) {
    for (const sx of [-1, 1]) {
      const ss = Math.min(s, track.length);
      track.sample(ss, fr);
      const ext = s - ss;
      const p0 = fr.pos.clone().addScaledVector(fr.right, sx * (fr.width / 2 + 1.8)).addScaledVector(new THREE.Vector3(fr.fwd.x, 0, fr.fwd.z).normalize(), ext);
      const g = new THREE.BoxGeometry(0.16, 1.2, 0.08);
      g.translate(0, 0.6, 0);
      g.rotateY(Math.atan2(fr.fwd.x, fr.fwd.z));
      g.translate(p0.x, p0.y - 0.1, p0.z);
      fence.push(painted(g, 0xfdf8ec));
      if (rnd() < 0.5) {
        const fc = p.flowers[Math.floor(rnd() * p.flowers.length)];
        const f = new THREE.IcosahedronGeometry(0.16, 0).translate(p0.x + (rnd() - 0.5) * 0.8, p0.y + 0.25, p0.z + (rnd() - 0.5) * 0.8);
        fence.push(painted(f, fc));
      }
    }
  }
  // rails
  for (const sx of [-1, 1])
    for (const hy of [0.45, 0.95]) {
      for (let s = finishS + 1.5; s < track.length; s += 4) {
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        track.toWorld(s, sx * (hw + 1.8), 0, a);
        track.toWorld(Math.min(track.length, s + 4), sx * (hw + 1.8), 0, b);
        a.y += hy - 0.1;
        b.y += hy - 0.1;
        const len = a.distanceTo(b);
        if (len < 0.05) continue;
        const g = new THREE.BoxGeometry(0.06, 0.1, len);
        g.lookAt(new THREE.Vector3().subVectors(b, a));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        fence.push(painted(g, 0xf1ead8));
      }
    }
  // stepping stones from the end of the path to the porch
  const stones = Math.max(2, Math.round(centre.distanceTo(fr.pos) / 1.6));
  track.sample(track.length, fr);
  for (let i = 0; i < stones; i++) {
    const t = (i + 0.5) / stones;
    const pt = new THREE.Vector3().lerpVectors(fr.pos, cottage.door, t);
    const g = new THREE.CylinderGeometry(0.55 + rnd() * 0.15, 0.6, 0.12, 7).translate(pt.x + (i % 2 ? 0.35 : -0.35), endY - 0.02, pt.z);
    fence.push(painted(g, 0xd8cdb8));
  }
  const fm = mesh(fence, solid, shadows);
  if (fm) {
    group.add(fm);
    disposables.push(fm.geometry);
  }

  let smokeT = 0;
  return {
    group,
    update(dt) {
      smokeT += dt;
      if (smokeT > 0.22) {
        smokeT = 0;
        spawnParticle(cottage.chimney.x + (Math.random() - 0.5) * 0.4, cottage.chimney.y, cottage.chimney.z, 0.3 + Math.random() * 0.3, 1.4, 0.2, 3.4, 0.9 + Math.random() * 0.6, 0xf2ece6, -0.25);
      }
    },
    dispose() {
      cottage.active = false;
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}

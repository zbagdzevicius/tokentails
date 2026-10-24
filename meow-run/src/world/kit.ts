// Shared scenery geometry + materials per theme (WORLD-ART). Built once per theme palette, reused by every chunk
// (geometry.userData.shared = true so core never disposes them). Low-poly toon shapes with baked vertex colours.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemeId } from '../core/types';
import { hash1, seeded } from './noise';
import type { Palette } from './palette';
import { dirtTexture, grassDetail, rockDetail } from './textures';

const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();

/** add a colour attribute from fn(x, y, z) -> hex (or blend of two) */
function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, c: THREE.Color) => void): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** strip to position/normal/color, non-indexed (flat-shaded look when normals are recomputed) */
function clean(geo: THREE.BufferGeometry, flat = false): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (flat) {
    g.deleteAttribute('normal');
    g.computeVertexNormals();
  }
  return g;
}

function jitter(geo: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
  // jitter shared vertex positions consistently (by rounded position) so the blob stays closed
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.round(x * 97) * 0.13 + Math.round(y * 89) * 0.71 + Math.round(z * 83) * 0.37 + seed;
    pos.setXYZ(i, x + (hash1(k) - 0.5) * amt, y + (hash1(k + 9) - 0.5) * amt, z + (hash1(k + 19) - 0.5) * amt);
  }
  return geo;
}

function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map((x) => clean(x)), false) as THREE.BufferGeometry;
  for (const x of list) x.dispose();
  g.userData.shared = true;
  g.computeBoundingSphere();
  return g;
}

function hexLerp(a: number, b: number, t: number, out: THREE.Color): THREE.Color {
  tmpC2.setHex(b);
  return out.setHex(a).lerp(tmpC2, Math.max(0, Math.min(1, t)));
}

// ------------------------------------------------------------------ shapes
function tuft(p: Palette): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const rnd = seeded(3);
  const base = new THREE.Color(p.grassA).multiplyScalar(0.92);
  const tip = new THREE.Color(p.grassB).lerp(new THREE.Color(0xffffcc), 0.3);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.6;
    const r = 0.06 + rnd() * 0.12;
    const h = 0.32 + rnd() * 0.35;
    const lean = 0.12 + rnd() * 0.18;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const px = -Math.sin(a) * 0.055;
    const pz = Math.cos(a) * 0.055;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.userData.shared = true;
  g.computeBoundingSphere();
  return g;
}

function blob(r: number, x: number, y: number, z: number, detail: number, seed: number, sy = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  jitter(g, r * 0.22, seed);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return g;
}

function bush(p: Palette): THREE.BufferGeometry {
  const parts = [blob(0.85, 0, 0.55, 0, 1, 1, 0.85), blob(0.65, 0.7, 0.45, 0.2, 1, 2, 0.85), blob(0.6, -0.6, 0.42, -0.25, 1, 3, 0.85), blob(0.55, 0.1, 0.9, -0.4, 1, 4, 0.85)];
  for (const g of parts)
    paint(g, (_x, y, _z, c) => {
      hexLerp(p.leafDark, p.bush, y / 1.1, c);
      if (y > 1.05) c.lerp(tmpC.setHex(p.leafB), 0.5);
    });
  return merged(parts);
}

function tree(p: Palette, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 6).translate(0, 1.6, 0);
  paint(trunk, (_x, y, _z, c) => hexLerp(p.trunk, 0x5a3a24, 1 - y / 3.2, c));
  const parts: THREE.BufferGeometry[] = [trunk];
  const blobs: [number, number, number, number][] = [
    [1.7, 0, 3.9, 0],
    [1.25, 1.2, 3.4, 0.3],
    [1.2, -1.1, 3.5, -0.4],
    [1.15, 0.2, 3.3, 1.15],
    [1.1, -0.3, 3.4, -1.1],
    [1.15, 0.3, 5.0, 0.1],
  ];
  for (const [r, x, y, z] of blobs) {
    const g = blob(r * (0.9 + rnd() * 0.2), x, y, z, 1, seed * 7 + x, 0.9);
    paint(g, (_x, yy, _z, c) => {
      hexLerp(p.leafDark, p.leafA, (yy - 2.4) / 2.2, c);
      if (yy > 4.6) c.lerp(tmpC.setHex(p.leafB), Math.min(1, (yy - 4.6) / 1.2));
    });
    parts.push(g);
  }
  return merged(parts);
}

function bamboo(p: Palette): THREE.BufferGeometry {
  const rnd = seeded(21);
  const parts: THREE.BufferGeometry[] = [];
  const stalk = new THREE.Color(p.bamboo);
  const node = new THREE.Color(p.bamboo).multiplyScalar(0.62);
  for (let i = 0; i < 7; i++) {
    const h = 5 + rnd() * 4;
    const r = 0.07 + rnd() * 0.05;
    const g = new THREE.CylinderGeometry(r * 0.8, r, h, 5, Math.round(h / 0.9));
    g.translate(0, h / 2, 0);
    const lx = (rnd() - 0.5) * 0.12;
    const lz = (rnd() - 0.5) * 0.12;
    const ox = (rnd() - 0.5) * 1.3;
    const oz = (rnd() - 0.5) * 1.3;
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      pos.setXYZ(k, pos.getX(k) + ox + lx * y, y, pos.getZ(k) + oz + lz * y);
    }
    paint(g, (_x, y, _z, c) => {
      const f = (y / 0.9) % 1;
      c.copy(f < 0.12 ? node : stalk);
      c.multiplyScalar(0.85 + 0.25 * (y / h));
    });
    parts.push(g);
    // leaf sprays near the top
    for (let k = 0; k < 4; k++) {
      const ly = h * (0.6 + rnd() * 0.4);
      const leaf = new THREE.ConeGeometry(0.16, 1.1, 3);
      leaf.rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.6);
      leaf.rotateY(rnd() * Math.PI * 2);
      leaf.translate(ox + lx * ly, ly, oz + lz * ly);
      paint(leaf, (_x, _y, _z, c) => hexLerp(p.leafA, p.leafB, rnd(), c));
      parts.push(leaf);
    }
  }
  return merged(parts);
}

function boulder(p: Palette): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  jitter(g, 0.35, 7);
  g.scale(1.2, 0.75, 1);
  g.translate(0, 0.45, 0);
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  paint(ng, (_x, y, _z, c) => hexLerp(p.rockB, p.rockC, (y + 0.3) / 1.4, c).lerp(tmpC.setHex(0x9a9a92), 0.35));
  const out = clean(ng, true);
  out.userData.shared = true;
  out.computeBoundingSphere();
  return out;
}

function flower(): THREE.BufferGeometry {
  const head = new THREE.IcosahedronGeometry(0.11, 0).translate(0, 0.32, 0);
  paint(head, (_x, _y, _z, c) => c.setHex(0xffffff));
  const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.3, 3).translate(0, 0.15, 0);
  paint(stem, (_x, _y, _z, c) => c.setHex(0x4a8a30));
  return merged([head, stem]);
}

/** a sandstone mesa / pillar: unit height (scaled per instance), strata bands and a grassy cap */
function pillar(p: Palette): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.8, 1.0, 1, 9, 6);
  body.translate(0, 0.5, 0);
  jitter(body, 0.09, 4);
  const bands = [p.rockA, p.rockC, p.rockB, p.rockA, p.rockC, p.rockB, p.rockA];
  const nb = body.index ? body.toNonIndexed() : body;
  if (nb !== body) body.dispose();
  paint(nb, (_x, y, _z, c) => {
    const i = Math.min(bands.length - 1, Math.max(0, Math.floor(y * 6.5)));
    c.setHex(bands[i]);
    if (y < 0.3) c.multiplyScalar(0.8 + y * 0.6);
  });
  const cap = new THREE.CylinderGeometry(0.86, 0.82, 0.04, 9, 1);
  cap.translate(0, 1.0, 0);
  const nc = cap.index ? cap.toNonIndexed() : cap;
  if (nc !== cap) cap.dispose();
  paint(nc, (_x, _y, _z, c) => c.setHex(p.grassA));
  const g = mergeGeometries([clean(nb, true), clean(nc, true)], false) as THREE.BufferGeometry;
  g.userData.shared = true;
  g.computeBoundingSphere();
  return g;
}

/** one puffy cumulus (unit size), white tops and shaded bellies */
function cloud(p: Palette, seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 2.4 + (rnd() - 0.5) * 0.3;
    const r = 0.45 + rnd() * 0.35 + (1 - Math.abs(x) / 1.4) * 0.35;
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, r * 0.55 + rnd() * 0.15, (rnd() - 0.5) * 0.5);
    parts.push(g);
  }
  const top = new THREE.IcosahedronGeometry(0.75, 2).translate((rnd() - 0.5) * 0.6, 0.95, 0);
  parts.push(top);
  for (const g of parts) {
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) < 0.1) pos.setY(k, 0.1 + (pos.getY(k) - 0.1) * 0.25);
    paint(g, (_x, y, _z, c) => hexLerp(p.cloudShade, p.cloud, (y - 0.05) / 0.9, c));
  }
  return merged(parts);
}

// ------------------------------------------------------------------ kit per theme
export interface Kit {
  tuft: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  trees: THREE.BufferGeometry[];
  bamboo: THREE.BufferGeometry;
  boulder: THREE.BufferGeometry;
  flower: THREE.BufferGeometry;
  pillar: THREE.BufferGeometry;
  clouds: THREE.BufferGeometry[];
  /** plank (unit width along x), post, rope segment (unit length along y) */
  plank: THREE.BufferGeometry;
  post: THREE.BufferGeometry;
  rope: THREE.BufferGeometry;
  // materials
  ground: THREE.MeshLambertMaterial;
  rock: THREE.MeshLambertMaterial;
  dirt: THREE.MeshLambertMaterial;
  wallPath: THREE.MeshLambertMaterial;
  veg: THREE.MeshLambertMaterial;
  vegSway: THREE.MeshLambertMaterial;
  grass: THREE.MeshLambertMaterial;
  solid: THREE.MeshLambertMaterial;
  cloudMat: THREE.MeshLambertMaterial;
  wood: THREE.MeshLambertMaterial;
  ropeMat: THREE.MeshLambertMaterial;
  textures: THREE.Texture[];
  /** shared sway clock (seconds) */
  time: { value: number };
}

const kits = new Map<ThemeId, Kit>();

function sway(mat: THREE.MeshLambertMaterial, time: { value: number }, amt: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sw = (sin(uTime * 1.6 + ip.x * 0.23 + ip.y * 0.19) + 0.4 * sin(uTime * 3.1 + ip.x * 0.5)) * ${amt.toFixed(3)} * max(0.0, position.y);
        transformed.x += sw;
        transformed.z += sw * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => `sway${amt}`;
}

export function getKit(id: ThemeId, p: Palette): Kit {
  const have = kits.get(id);
  if (have) return have;
  const time = { value: 0 };
  const grassTex = grassDetail();
  const rockTex = rockDetail();
  const dirtTex = dirtTexture(p);
  const wallTex = dirtTexture(p, true);
  const ground = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassTex });
  const rock = new THREE.MeshLambertMaterial({ vertexColors: true, map: rockTex });
  const dirt = new THREE.MeshLambertMaterial({ map: dirtTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const wallPath = new THREE.MeshLambertMaterial({ map: wallTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const veg = new THREE.MeshLambertMaterial({ vertexColors: true });
  const vegSway = new THREE.MeshLambertMaterial({ vertexColors: true });
  sway(vegSway, time, 0.012);
  const grass = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  sway(grass, time, 0.1);
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: new THREE.Color(p.cloud).multiplyScalar(0.45) });
  const wood = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ropeMat = new THREE.MeshLambertMaterial({ color: 0xd8c08a });
  const plank = new THREE.BoxGeometry(1, 0.14, 0.46);
  paint(plank, (_x, y, _z, c) => c.setHex(y > 0 ? 0xa9784a : 0x7a5234));
  plank.userData.shared = true;
  const post = new THREE.CylinderGeometry(0.11, 0.13, 1, 6).translate(0, 0.5, 0);
  paint(post, (_x, y, _z, c) => c.setHex(y > 0.9 ? 0xb08050 : 0x8a5f3a));
  post.userData.shared = true;
  const rope = new THREE.CylinderGeometry(0.035, 0.035, 1, 4).translate(0, 0.5, 0);
  rope.userData.shared = true;
  const kit: Kit = {
    tuft: tuft(p),
    bush: bush(p),
    trees: [tree(p, 1), tree(p, 2), tree(p, 3)],
    bamboo: bamboo(p),
    boulder: boulder(p),
    flower: flower(),
    pillar: pillar(p),
    clouds: [cloud(p, 1), cloud(p, 2), cloud(p, 3), cloud(p, 4)],
    plank,
    post,
    rope,
    ground,
    rock,
    dirt,
    wallPath,
    veg,
    vegSway,
    grass,
    solid,
    cloudMat,
    wood,
    ropeMat,
    textures: [grassTex, rockTex, dirtTex, wallTex],
    time,
  };
  kits.set(id, kit);
  return kit;
}

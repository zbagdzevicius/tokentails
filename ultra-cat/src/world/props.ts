// City decor and breakable props. Owned by the CAMPAIGN lane.
//  - Decor: static, non-breakable dressing (lot slabs, lawns, water, runway marks, piers). Batched into a handful of
//    InstancedMeshes per build and added to the city's per-build group (disposed on rebuild).
//  - Props: breakable set pieces (cranes, jets, neon signs, radar dishes, house roofs, hedges). Pooled BodySets that
//    live for the whole session; each build resets them. A prop is a group of parts that all fly at once when hit.
//    Anchored props sit on a building segment and break the moment that segment leaves St.Static, so nothing ever
//    floats in the air after the floors under it fall. Hit logic runs in campaign/runtime.ts.
import * as THREE from 'three';
import { BodySet } from '../core/bodies';

// ---------- shared geometry ----------
/** Gable roof: a triangular prism in the unit box, ridge along z. */
function gableGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  s.lineTo(0.5, -0.5);
  s.lineTo(0, 0.5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.computeVertexNormals();
  return g;
}

/** Arched (hangar) roof: a half cylinder in the unit box, axis along z. */
function archGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2); // axis along z, the half disc faces +y
  g.scale(1, 2, 1); // radius 0.5 -> height 1 (y from 0 to 1)
  g.translate(0, -0.5, 0);
  return g;
}

/** Disc (dish, round lawn): a flat cylinder in the unit box. */
function discGeo(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
}

// ---------- static decor ----------
type Shape = 'box' | 'disc';
const SHAPES: Shape[] = ['box', 'disc'];

/** Collects static decor during a build and flushes it into a few instanced meshes. Build time only (allocates). */
export class Decor {
  private items: { shape: Shape; glow: boolean; x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number; yaw: number }[] = [];

  reset(): void {
    this.items.length = 0;
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0): void {
    this.items.push({ shape: 'box', glow: false, x, y, z, sx, sy, sz, c: color, yaw });
  }

  /** Unlit (always bright) box: runway lights, neon strips. */
  glowBox(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0): void {
    this.items.push({ shape: 'box', glow: true, x, y, z, sx, sy, sz, c: color, yaw });
  }

  disc(x: number, y: number, z: number, d: number, h: number, color: number): void {
    this.items.push({ shape: 'disc', glow: false, x, y, z, sx: d, sy: h, sz: d, c: color, yaw: 0 });
  }

  /** Build the instanced meshes into `into` (the city's per-build group). */
  flush(into: THREE.Group): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    for (const shape of SHAPES) {
      for (const glow of [false, true]) {
        const list = this.items.filter((it) => it.shape === shape && it.glow === glow);
        if (!list.length) continue;
        const geo = shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) : discGeo();
        const mat = glow ? new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((it, i) => {
          m.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(0, it.yaw, 0)), s.set(it.sx, it.sy, it.sz));
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, col.setHex(it.c));
        });
        mesh.receiveShadow = !glow;
        mesh.castShadow = false;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        into.add(mesh);
      }
    }
    this.items.length = 0;
  }
}

// ---------- water ----------
/** Shared clock for the animated water shader (campaign/runtime.ts advances it). */
export const waterClock = { value: 0 };

/** Animated harbour / pool water: a gentle moving sparkle pattern on a flat plane. */
export function waterMaterial(color: number, foam: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.15, transparent: false });
  const uFoam = { value: new THREE.Color(foam) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterClock;
    sh.uniforms.uFoam = uFoam;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uTime; uniform vec3 uFoam;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wv = sin(vWP.x * 0.045 + uTime * 0.9) + sin(vWP.z * 0.06 - uTime * 1.3) + sin((vWP.x + vWP.z) * 0.11 + uTime * 2.1) * 0.5;
        float ripple = sin(vWP.x * 0.31 + vWP.z * 0.17 + uTime * 2.6 + wv * 2.0);
        float glint = smoothstep(0.93, 1.0, ripple) * smoothstep(0.4, 1.6, wv);
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + 0.05 * wv), uFoam, glint * 0.4);`,
      );
  };
  return mat;
}

// ---------- breakable props ----------
export type PropSet = 'box' | 'glow' | 'gable' | 'arch' | 'disc';
const SET_IDS: Record<PropSet, number> = { box: 0, glow: 1, gable: 2, arch: 3, disc: 4 };

export interface PropGroup {
  x: number;
  z: number;
  r: number; // hit radius on the ground plane
  top: number; // height of the highest part
  value: number; // raw $M when broken
  label: string; // money pop prefix ("CRANE ")
  anchor: number; // segment index it sits on (-1 = stands on the ground)
  trample: boolean; // breaks just by walking into it (hedges, fences, small stuff)
  spin: number; // rad/s yaw spin around (x, z) while intact (radar dishes)
  kind: string; // reaction when broken: '' | 'splash' (soaks a nearby cat) | 'fire' | 'spark' (neon)
  broken: boolean;
  p0: number; // first part
  pn: number; // part count
}

const PART_CAP = 3200;

export class Props {
  readonly sets: BodySet[];
  groups: PropGroup[] = [];
  /** part -> set id / body index; local offsets + base rotation for spinners */
  partSet = new Uint8Array(PART_CAP);
  partIdx = new Int32Array(PART_CAP);
  partLx = new Float32Array(PART_CAP);
  partLz = new Float32Array(PART_CAP);
  partQ = new Float32Array(PART_CAP * 4);
  parts = 0;
  spinners: PropGroup[] = [];
  private cur: PropGroup | null = null;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private col = new THREE.Color();

  constructor(parent: THREE.Group) {
    const std = (rough = 0.7) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0.1 });
    this.sets = [
      new BodySet(new THREE.BoxGeometry(1, 1, 1), std(), 1700),
      new BodySet(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1400),
      new BodySet(gableGeo(), std(0.85), 700),
      new BodySet(archGeo(), std(0.5), 160),
      new BodySet(discGeo(), std(0.4), 160),
    ];
    this.sets[1].mesh.castShadow = false;
    for (const s of this.sets) parent.add(s.mesh);
  }

  set(name: PropSet): BodySet {
    return this.sets[SET_IDS[name]];
  }

  reset(): void {
    for (const s of this.sets) {
      s.n = 0;
      s.mesh.count = 0;
    }
    this.groups.length = 0;
    this.spinners.length = 0;
    this.parts = 0;
    this.cur = null;
  }

  /** Room left for `n` more parts of a set (layouts check before starting a big prop). */
  room(name: PropSet, n: number): boolean {
    const s = this.set(name);
    return s.n + n <= s.cap && this.parts + n <= PART_CAP;
  }

  /** Start a prop group. Add parts with part(), close with end(). */
  begin(x: number, z: number, r: number, value: number, label: string, opts: { anchor?: number; trample?: boolean; spin?: number; kind?: string } = {}): PropGroup {
    const g: PropGroup = { x, z, r, top: 0, value, label, anchor: opts.anchor ?? -1, trample: !!opts.trample, spin: opts.spin ?? 0, kind: opts.kind ?? '', broken: false, p0: this.parts, pn: 0 };
    this.cur = g;
    return g;
  }

  /** Add one part (centre position, full size, colour, yaw / pitch / roll in radians). Returns false when a pool is full. */
  part(name: PropSet, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, yaw = 0, pitch = 0, roll = 0): boolean {
    const g = this.cur;
    const s = this.set(name);
    if (!g || s.n >= s.cap || this.parts >= PART_CAP) return false;
    const i = s.add(x, y, z, sx, sy, sz, this.col.setHex(color), yaw);
    if (pitch || roll) {
      this.q.setFromEuler(this.e.set(pitch, yaw, roll, 'YXZ'));
      s.rot[i * 4] = this.q.x;
      s.rot[i * 4 + 1] = this.q.y;
      s.rot[i * 4 + 2] = this.q.z;
      s.rot[i * 4 + 3] = this.q.w;
      s.write(i);
    }
    const p = this.parts++;
    this.partSet[p] = SET_IDS[name];
    this.partIdx[p] = i;
    this.partLx[p] = x - g.x;
    this.partLz[p] = z - g.z;
    this.partQ[p * 4] = s.rot[i * 4];
    this.partQ[p * 4 + 1] = s.rot[i * 4 + 1];
    this.partQ[p * 4 + 2] = s.rot[i * 4 + 2];
    this.partQ[p * 4 + 3] = s.rot[i * 4 + 3];
    g.pn++;
    g.top = Math.max(g.top, y + sy / 2);
    return true;
  }

  end(): void {
    const g = this.cur;
    this.cur = null;
    if (!g || g.pn === 0) return;
    this.groups.push(g);
    if (g.spin) this.spinners.push(g);
  }

  /** After a build: upload every pool. */
  finish(): void {
    for (const s of this.sets) {
      s.mesh.count = s.n;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    }
  }
}

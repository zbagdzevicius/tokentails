/**
 * Procedural low-poly character kit (POC.md §6.9 fallback: models built at runtime, one draw call each).
 *
 * A model is a set of primitives merged into ONE BufferGeometry with per-vertex colour, a part id and a pivot.
 * The rig material rotates each part around its pivot in the vertex shader (legs walk, head nods, tail wags,
 * weapon swings), so a whole hero animates in a single draw call with no skeleton. Models face +X, stand on y = 0,
 * 1 unit = 1 m.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const Part = Object.freeze({
  Body: 0,
  Head: 1,
  LegFL: 2,
  LegFR: 3,
  LegBL: 4,
  LegBR: 5,
  Tail: 6,
  Weapon: 7,
  Off: 8,
} as const);

type V3 = readonly [number, number, number];

export interface PrimOpts {
  at?: V3;
  scale?: V3;
  rot?: V3;
  part?: number;
  pivot?: V3;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Collects coloured primitives and merges them. */
export class ModelBuilder {
  private geos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: number, o: PrimOpts = {}): this {
    const g = geo;
    g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    _e.set(...(o.rot ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _s.set(...(o.scale ?? [1, 1, 1]));
    _p.set(...(o.at ?? [0, 0, 0]));
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.getAttribute('position').count;
    _c.setHex(color, THREE.SRGBColorSpace);
    const col = new Float32Array(n * 3);
    const part = new Float32Array(n);
    const piv = new Float32Array(n * 3);
    const pv = o.pivot ?? [0, 0, 0];
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      part[i] = o.part ?? 0;
      piv[i * 3] = pv[0];
      piv[i * 3 + 1] = pv[1];
      piv[i * 3 + 2] = pv[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    if (g.index) {
      this.geos.push(g.toNonIndexed());
      g.dispose();
    } else this.geos.push(g);
    return this;
  }

  sphere(r: number, color: number, o: PrimOpts = {}, seg = 12): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), color, o);
  }

  box(w: number, h: number, d: number, color: number, o: PrimOpts = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }

  cyl(rTop: number, rBottom: number, h: number, color: number, o: PrimOpts = {}, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, o);
  }

  cone(r: number, h: number, color: number, o: PrimOpts = {}, seg = 8): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, o);
  }

  capsule(r: number, len: number, color: number, o: PrimOpts = {}): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), color, o);
  }

  torus(r: number, tube: number, color: number, o: PrimOpts = {}, arc = Math.PI * 2): this {
    return this.add(new THREE.TorusGeometry(r, tube, 6, 18, arc), color, o);
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.geos, false);
    for (const x of this.geos) x.dispose();
    this.geos = [];
    if (!g) throw new Error('model merge failed');
    g.computeBoundingSphere();
    return g;
  }
}

export interface RigUniforms {
  uTime: { value: number };
  uPhase: { value: number };
  uWalk: { value: number };
  uSwing: { value: number };
  uCast: { value: number };
  uFlashK: { value: number };
  uFlash: { value: THREE.Color };
  uOpacity: { value: number };
}

const RIG_PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
uniform float uTime, uPhase, uWalk, uSwing, uCast;
mat3 plRz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 plRy(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 plRx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 plPart(float p){
  float sw = sin(uPhase) * uWalk * 0.75;
  if (p < 0.5) return mat3(1.0);
  if (p < 1.5) return plRz(sin(uTime * 2.1) * 0.05 + uSwing * -0.18 + uCast * 0.22 + uWalk * sin(uPhase * 2.0) * 0.04);
  if (p < 2.5) return plRz(sw);
  if (p < 3.5) return plRz(-sw);
  if (p < 4.5) return plRz(-sw);
  if (p < 5.5) return plRz(sw);
  if (p < 6.5) return plRy(sin(uTime * 3.2 + uPhase * 0.5) * (0.35 + uWalk * 0.25)) * plRz(0.15 * sin(uTime * 1.7));
  if (p < 7.5) return plRz(mix(0.25 + sin(uTime * 1.9) * 0.06, -1.9, uSwing) + uCast * 1.4 + uWalk * sin(uPhase) * 0.18);
  return plRx(uCast * 0.9 + uSwing * 0.3);
}
`;

let compiled = 0;

/** A rig material: vertex colours, toon lighting (installToon), per-part rotation and a hit flash. */
export function rigMaterial(): THREE.MeshLambertMaterial & { userData: { rig: RigUniforms } } {
  const rig: RigUniforms = {
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uWalk: { value: 0 },
    uSwing: { value: 0 },
    uCast: { value: 0 },
    uFlashK: { value: 0 },
    uFlash: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 1 },
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { rig: RigUniforms } };
  m.userData.rig = rig;
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, rig);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RIG_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 plR = plPart(aPart);\nobjectNormal = plR * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = plR * (transformed - aPivot) + aPivot;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlash;\nuniform float uFlashK;\nuniform float uOpacity;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);\ngl_FragColor.a *= uOpacity;');
  };
  m.customProgramCacheKey = () => 'pl-rig-v1';
  return m;
}

/** Programs compiled so far (tests, perf). */
export const rigCompileCount = (): number => compiled;

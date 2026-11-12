/**
 * Procedural low-poly part kit for props and structures (towers, core, fountain, rats, Pudding, siege carts) and the
 * instanced upright minion shader. Characters (heroes, minions' bodies, Companion Kittens) are built by render/chars/.
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

  /** No primitive added yet (`build` would have nothing to merge). */
  get empty(): boolean {
    return this.geos.length === 0;
  }

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
  /** V21-FUN §4: crack strength 0..1 (towers and cores only; 0 elsewhere and on a clean structure). */
  uDmg: { value: number };
  /** V21-FUN §4: ember glow inside the cracks 0..1 (a burning structure). */
  uEmber: { value: number };
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

/**
 * V21-FUN §4: the damage cracks of a tower or core, drawn in the fragment shader (no texture): the edges of a
 * cellular pattern on the walls (object space, so they stay put on the model), more cells cracking as `uDmg` grows,
 * darkened, and glowing ember orange inside while `uEmber` is up (a flicker on uTime). Free on a clean structure (one
 * uniform branch); only the tower and core materials compile it.
 */
const CRACK_PARS = /* glsl */ `
uniform float uDmg, uEmber, uTime;
varying vec3 vPlObj;
vec2 plH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float plCrack(vec3 o, float amt){
  vec2 p = vec2(o.x + o.z * 0.73, o.y * 0.8) * 1.25;
  // a little wobble so the edges read as broken stone, not tiles
  p += (plH2(floor(p * 3.0)) - 0.5) * 0.12;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 c1 = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + plH2(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; c1 = i + g; } else if (d < d2) d2 = d;
  }
  float edge = sqrt(d2) - sqrt(d1);
  float w = 0.07 + 0.07 * amt;
  float line = 1.0 - smoothstep(w * 0.3, w, edge);
  // a few cells' edges crack (more as the damage grows): broken runs, not a tiled wall; the base cracks first
  float keep = step(plH2(c1 * 1.37 + 3.1).x, amt * (0.62 - 0.14 * clamp(o.y * 0.2, 0.0, 1.0)));
  return line * keep;
}
`;

/** A rig material: vertex colours, toon lighting (installToon), per-part rotation and a hit flash. */
export function rigMaterial(opts: { cracks?: boolean } = {}): THREE.MeshLambertMaterial & { userData: { rig: RigUniforms } } {
  const cracks = opts.cracks === true;
  const rig: RigUniforms = {
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uWalk: { value: 0 },
    uSwing: { value: 0 },
    uCast: { value: 0 },
    uFlashK: { value: 0 },
    uFlash: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 1 },
    uDmg: { value: 0 },
    uEmber: { value: 0 },
  };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { rig: RigUniforms } };
  m.userData.rig = rig;
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, rig);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RIG_PARS}${cracks ? 'varying vec3 vPlObj;\n' : ''}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 plR = plPart(aPart);\nobjectNormal = plR * objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${cracks ? 'vPlObj = transformed;\n' : ''}transformed = plR * (transformed - aPivot) + aPivot;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec3 uFlash;\nuniform float uFlashK;\nuniform float uOpacity;${cracks ? `\n${CRACK_PARS}` : ''}`);
    if (cracks)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat plCk = 0.0;\nif (uDmg > 0.001) plCk = plCrack(vPlObj, uDmg);\ndiffuseColor.rgb *= 1.0 - 0.86 * plCk;')
        .replace(
          '#include <opaque_fragment>',
          '#include <opaque_fragment>\ngl_FragColor.rgb += plCk * uEmber * vec3(1.3, 0.5, 0.1) * (0.7 + 0.3 * sin(uTime * 9.0 + vPlObj.y * 3.0));\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);\ngl_FragColor.a *= uOpacity;',
        );
    else shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uFlash, uFlashK);\ngl_FragColor.a *= uOpacity;');
  };
  m.customProgramCacheKey = () => (cracks ? 'pl-rig-v1-dmg' : 'pl-rig-v1');
  return m;
}

/** The crack chunk of the tower / core shader (tests: it compiles into the material only when asked). */
export const RIG_CRACK_GLSL = CRACK_PARS;

const UPRIGHT_PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 aAnim;
uniform float uTime;
mat3 plRz(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 plRy(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 plRx(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
// aAnim: x walk phase, y walk weight, z weapon arm (minionInstances.ts minionArm: < 0 cocked back, 1 the strike on the
// contact, > 1 the overshoot, back to 0 on the follow-through), w hit (1 decaying) plus 2 × the own-hit flash (0..8)
varying float vPlFlash;
mat3 plUpright(float p){
  float hw = mod(aAnim.w, 2.0);
  vPlFlash = floor(aAnim.w * 0.5) / 8.0;
  float s = sin(aAnim.x) * aAnim.y;
  float sw = aAnim.z;
  float idle = sin(uTime * 2.1 + aAnim.x * 0.3);
  if (p < 0.5) return mat3(1.0);
  if (p < 1.5) return plRz(idle * 0.04 - sw * 0.2 - hw * 0.35 + aAnim.y * sin(aAnim.x * 2.0) * 0.05);
  if (p < 2.5) return plRz(-s * 0.8) * plRx(-0.08 - hw * 0.5);
  if (p < 3.5) return plRz(s * 0.7 + sw * 2.1) * plRx(0.08 + hw * 0.5);
  if (p < 4.5) return plRz(s * 0.7);
  if (p < 5.5) return plRz(-s * 0.7);
  return plRy(sin(uTime * 3.2 + aAnim.x * 0.5) * (0.3 + aAnim.y * 0.3));
}
`;

/**
 * The upright minion material (kitten squires, pup guards, siege carts): instanced, with the body-part rotation driven
 * by a per-copy `aAnim` attribute (walk phase, walk weight, swing, hit), so every minion of a wave walks on its own
 * cycle in one draw call per team and variant. Parts follow chars/index.ts `UPRIGHT_PART`.
 */
export function uprightMaterial(): THREE.MeshLambertMaterial & { userData: { rig: { uTime: { value: number } } } } {
  const rig = { uTime: { value: 0 } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { userData: { rig: { uTime: { value: number } } } };
  m.userData.rig = rig;
  m.onBeforeCompile = (shader) => {
    compiled++;
    Object.assign(shader.uniforms, rig);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${UPRIGHT_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nmat3 plR = plUpright(aPart);\nobjectNormal = plR * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = plR * (transformed - aPivot) + aPivot;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPlFlash;')
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\nfloat plEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));\ngl_FragColor.rgb *= 1.0 - 0.5 * smoothstep(0.62, 0.92, plEdge);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), vPlFlash * 0.75);',
      );
  };
  m.customProgramCacheKey = () => 'pl-rig-v3';
  return m;
}

/** Programs compiled so far (tests, perf). */
export const rigCompileCount = (): number => compiled;

/**
 * PERF-IOS §8 Track B: shadow-pass depth materials per mesh kind. three.js draws every caster without its own
 * `customDepthMaterial` with ONE shared MeshDepthMaterial, and a skinned hero, an instanced minion and a plain tower
 * each need a different program variant of it (an instanced mesh with per-instance colours another), so it re-derived its program key (getParameters + the key string) at
 * every switch: ~4 times per shadow update. Skinned and instanced casters get their own depth material (same settings
 * as three's default), so no material changes variant on a steady frame. Shared by every view, never disposed.
 */
const depthMats: Partial<Record<'skinned' | 'instanced' | 'instanced-color', THREE.MeshDepthMaterial>> = {};
export function casterDepthMaterial(kind: 'skinned' | 'instanced' | 'instanced-color'): THREE.MeshDepthMaterial {
  let m = depthMats[kind];
  if (!m) {
    m = new THREE.MeshDepthMaterial();
    m.name = `shadow-depth-${kind}`;
    depthMats[kind] = m;
  }
  return m;
}

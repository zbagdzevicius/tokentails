/**
 * Living pass P1: slow cloud shadows drifting over the ground (render only). A fragment darken from scrolling value
 * noise in world xz, patched onto the ground-type materials only (the painted playfield, the outer grass, the river
 * banks): units, structures, telegraphs, decals and the water are separate meshes and never darken. Blobs are about
 * 13–25 m across and drift ~0.6 m/s along the breeze. At most 6 % darker (High), 3 % (Med), off on Low with the same
 * program (`uCloud` 0 skips the noise in a uniform branch).
 */
import * as THREE from 'three';
import type { Ambient } from '../../ambient';
import { WIND } from './wind';

export const CLOUD = Object.freeze({
  /** Darken at full cover (High desktop). */
  high: 0.06,
  /** High on a phone (subtle on the small screen). */
  highPhone: 0.045,
  /** Med. */
  med: 0.03,
  /** Drift (m/s) at ambient speed 1 (reduce motion: 0.5). */
  drift: 0.6,
  /**
   * Noise cell (m): blobs come out about 0.7–1.4 of it. 18 m, not the plan's 28: the match camera shows ~18 × 12 m, and
   * a 30 m blob covered the whole view (read as a lighting change, not a passing cloud).
   */
  cell: 18,
});

export interface CloudUniforms {
  uCloud: { value: number };
  /** Drift offset (m, world xz). */
  uCloudOff: { value: THREE.Vector2 };
}

export function cloudUniforms(): CloudUniforms {
  return { uCloud: { value: 0 }, uCloudOff: { value: new THREE.Vector2() } };
}

/** The cloud darken at full cover for an ambient level (never above CLOUD.high). */
export function cloudDarken(a: Pick<Ambient, 'level' | 'phone'>): number {
  if (a.level === 0) return 0;
  if (a.level === 1) return CLOUD.med;
  return a.phone ? CLOUD.highPhone : CLOUD.high;
}

/** Cloud cover 0..1 from a noise value (the shader's own shaping: soft-edged blobs over about 40 % of the ground). */
export function cloudCover(n: number): number {
  const t = Math.max(0, Math.min(1, (n - 0.52) / (0.78 - 0.52)));
  return t * t * (3 - 2 * t);
}

const VPARS = /* glsl */ `
varying vec2 vPlCloud;
`;
const FPARS = /* glsl */ `
varying vec2 vPlCloud;
uniform float uCloud;
uniform vec2 uCloudOff;
float plCH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float plCN(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(plCH(i), plCH(i + vec2(1.0, 0.0)), f.x), mix(plCH(i + vec2(0.0, 1.0)), plCH(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
const FBODY = /* glsl */ `
  if (uCloud > 0.0) {
    vec2 plCp = (vPlCloud - uCloudOff) / ${CLOUD.cell.toFixed(1)};
    float plCv = plCN(plCp) * 0.72 + plCN(plCp * 2.3 + 17.0) * 0.28;
    gl_FragColor.rgb *= 1.0 - uCloud * smoothstep(0.52, 0.78, plCv);
  }
`;

export const CLOUD_GLSL = Object.freeze({ fpars: FPARS, fbody: FBODY });

type Patchable = THREE.Material & { onBeforeCompile: THREE.Material['onBeforeCompile'] };

/** Chains the cloud darken onto `mat` (a Lambert ground material) and bumps its program cache key. */
export function patchCloudShadow<M extends Patchable>(mat: M, u: CloudUniforms): M {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VPARS}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlCloud = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FPARS}`).replace('#include <dithering_fragment>', `${FBODY}\n#include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => `${key}-cloud1`;
  return mat;
}

/** Per-frame step: the darken for the tier and the drift along the breeze (CPU: a few uniform writes). */
export function stepClouds(u: CloudUniforms, a: Pick<Ambient, 'level' | 'phone' | 'speed'>, dt: number): void {
  u.uCloud.value = cloudDarken(a);
  if (u.uCloud.value <= 0) return;
  const d = dt * CLOUD.drift * a.speed;
  const o = u.uCloudOff.value;
  o.x = (o.x + WIND.dir[0] * d) % (CLOUD.cell * 512);
  o.y = (o.y + WIND.dir[1] * d) % (CLOUD.cell * 512);
}

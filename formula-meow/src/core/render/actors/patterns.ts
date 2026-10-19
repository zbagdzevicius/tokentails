// Copied from bad-cat/src/render/actors/patterns.ts at 4889ed41 (copy, never import; adapted for formula-meow).
/**
 * Coat patterns (GDD 6.1, 11.1): seven procedural masks in cat space (object space of the rest pose, metres, origin
 * on the ground under the body centre, +z toward the head, y up). Each mask returns two weights:
 *   sec = how much of the secondary colour covers the base, ter = how much of the tertiary colour covers that.
 * The colour is mix(mix(base, secondary, sec), tertiary, ter). The GLSL in `PATTERN_GLSL` is a line-by-line copy
 * of `patternMask` so the Node tests describe what the shader draws. Pure (no WebGL).
 *
 * Coat colours by pattern (cat maker convention): solid = base; tabby = base + darker stripes (secondary) + cream
 * underside (tertiary); tuxedo = black base + white bib, belly, socks (tertiary); bicolor = base on top, white
 * below (tertiary); calico = white (tertiary) with orange (base) and black (secondary) patches; colorpoint = cream
 * base with dark points on the face, ears, legs and tail (secondary); tortie = black base mottled with orange
 * (secondary), no white.
 */
import type { Pattern } from '../../../types';

export const PATTERN_ORDER: readonly Pattern[] = ['solid', 'tabby', 'tuxedo', 'bicolor', 'calico', 'colorpoint', 'tortie'];

function fract(v: number): number {
  return v - Math.floor(v);
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function step(edge: number, x: number): number {
  return x < edge ? 0 : 1;
}
function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}
function hash3(x: number, y: number, z: number): number {
  return fract(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453);
}
/** Value noise (same as `bcNoise` in the shader). */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hash3(ix + a, iy + b, iz + c);
  const a = mix(mix(h(0, 0, 0), h(1, 0, 0), fx), mix(h(0, 1, 0), h(1, 1, 0), fx), fy);
  const b = mix(mix(h(0, 0, 1), h(1, 0, 1), fx), mix(h(0, 1, 1), h(1, 1, 1), fx), fy);
  return mix(a, b, fz);
}

export interface PatternWeights {
  sec: number;
  ter: number;
}

/** Mask weights for pattern index `pat` (PATTERN_ORDER) at cat-space point (x, y, z). */
export function patternMask(pat: number, x: number, y: number, z: number): PatternWeights {
  const n = noise3(x * 22, y * 22, z * 22);
  const ax = Math.abs(x);
  // shared regions
  const belly = smoothstep(0.115, 0.075, y + n * 0.02) * step(-0.2, z);
  const chest = smoothstep(0.05, 0.12, z) * smoothstep(0.22, 0.12, y) * smoothstep(0.07, 0.03, ax);
  const paws = smoothstep(0.03, 0.015, y);
  const under = Math.max(belly, chest, paws);
  // head region (the head sits forward and up: z > 0.12, y > 0.19)
  const head = smoothstep(0.1, 0.14, z) * smoothstep(0.18, 0.21, y);
  const tail = smoothstep(-0.12, -0.16, z) * smoothstep(0.1, 0.14, y);
  if (pat === 1) {
    // tabby: mackerel stripes over the back and sides, rings on legs and tail, cream underside
    const s = Math.sin(z * 120 + ax * 30 + y * 25 + n * 3);
    const mask = smoothstep(0.2, 0.7, s) * (1 - belly) * (1 - chest * 0.85);
    const legRing = smoothstep(0.3, 0.8, Math.sin(y * 120 + n * 2)) * step(y, 0.09) * 0.8;
    return { sec: Math.max(mask * 0.85, legRing), ter: Math.max(belly * 0.8, chest * 0.7) * 0.6 };
  }
  if (pat === 2) {
    // tuxedo: white bib from the chin down the chest, white belly and socks, a white chin tip
    const bib = smoothstep(0.04, 0.1, z) * smoothstep(0.26, 0.16, y) * smoothstep(0.075 + n * 0.01, 0.035, ax);
    const socks = smoothstep(0.05, 0.035, y + (n - 0.5) * 0.01);
    return { sec: 0, ter: Math.max(bib, belly, socks) };
  }
  if (pat === 3) {
    // bicolor: base on the back and head, white from the flanks down, a white blaze between the eyes
    const low = smoothstep(0.14, 0.11, y + (n - 0.5) * 0.05);
    const blaze = head * smoothstep(0.028, 0.014, ax) * smoothstep(0.2, 0.24, y);
    return { sec: 0, ter: Math.max(low, chest, blaze) };
  }
  if (pat === 4) {
    // calico: white body with big orange (base) and black (secondary) patches; white underside
    const p1 = smoothstep(0.5, 0.56, noise3(x * 9, y * 9, z * 9));
    const p2 = smoothstep(0.55, 0.6, noise3(x * 9 + 17, y * 9 + 17, z * 9 + 17));
    // ter covers what is neither patch: express as base/sec/ter weights
    const sec = p2 * (1 - p1 * 0.5);
    const ter = Math.max((1 - p1) * (1 - sec), under);
    return { sec, ter };
  }
  if (pat === 5) {
    // colorpoint: dark points on the face/ears, legs, tail; a faint shading on the back
    const legs = smoothstep(0.09, 0.04, y);
    const ears = smoothstep(0.29, 0.32, y);
    const face = head * smoothstep(0.16, 0.2, z);
    const back = smoothstep(0.17, 0.23, y) * (1 - head) * 0.25;
    return { sec: Math.max(legs, ears, face, tail, back), ter: 0 };
  }
  if (pat === 6) {
    // tortie: black base mottled with orange (secondary), fine and coarse noise
    const m = smoothstep(0.4, 0.62, noise3(x * 14, y * 14, z * 14) * 0.7 + n * 0.3);
    const fleck = smoothstep(0.72, 0.8, noise3(x * 40, y * 40, z * 40)) * 0.8;
    return { sec: Math.max(m, fleck), ter: 0 };
  }
  // solid: a lighter belly is applied separately (render-side only, no weight)
  return { sec: 0, ter: 0 };
}

/**
 * GLSL of the masks (needs `uBase`, `uSec`, `uTer` vec3 and `bcPat()` int in scope, and `vCat`). Same formulas
 * as `patternMask`.
 */
export const PATTERN_GLSL = /* glsl */ `
float bcHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float bcNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(bcHash(i), bcHash(i + vec3(1,0,0)), f.x), mix(bcHash(i + vec3(0,1,0)), bcHash(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(bcHash(i + vec3(0,0,1)), bcHash(i + vec3(1,0,1)), f.x), mix(bcHash(i + vec3(0,1,1)), bcHash(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}
vec2 bcMask(int pat, vec3 p) {
  float n = bcNoise(p * 22.0);
  float ax = abs(p.x);
  float belly = smoothstep(0.115, 0.075, p.y + n * 0.02) * step(-0.2, p.z);
  float chest = smoothstep(0.05, 0.12, p.z) * smoothstep(0.22, 0.12, p.y) * smoothstep(0.07, 0.03, ax);
  float paws = smoothstep(0.03, 0.015, p.y);
  float under = max(belly, max(chest, paws));
  float head = smoothstep(0.1, 0.14, p.z) * smoothstep(0.18, 0.21, p.y);
  float tail = smoothstep(-0.12, -0.16, p.z) * smoothstep(0.1, 0.14, p.y);
  if (pat == 1) {
    float s = sin(p.z * 120.0 + ax * 30.0 + p.y * 25.0 + n * 3.0);
    float mask = smoothstep(0.2, 0.7, s) * (1.0 - belly) * (1.0 - chest * 0.85);
    float legRing = smoothstep(0.3, 0.8, sin(p.y * 120.0 + n * 2.0)) * step(p.y, 0.09) * 0.8;
    return vec2(max(mask * 0.85, legRing), max(belly * 0.8, chest * 0.7) * 0.6);
  } else if (pat == 2) {
    float bib = smoothstep(0.04, 0.1, p.z) * smoothstep(0.26, 0.16, p.y) * smoothstep(0.075 + n * 0.01, 0.035, ax);
    float socks = smoothstep(0.05, 0.035, p.y + (n - 0.5) * 0.01);
    return vec2(0.0, max(bib, max(belly, socks)));
  } else if (pat == 3) {
    float low = smoothstep(0.14, 0.11, p.y + (n - 0.5) * 0.05);
    float blaze = head * smoothstep(0.028, 0.014, ax) * smoothstep(0.2, 0.24, p.y);
    return vec2(0.0, max(low, max(chest, blaze)));
  } else if (pat == 4) {
    float p1 = smoothstep(0.5, 0.56, bcNoise(p * 9.0));
    float p2 = smoothstep(0.55, 0.6, bcNoise(p * 9.0 + 17.0));
    float sec = p2 * (1.0 - p1 * 0.5);
    return vec2(sec, max((1.0 - p1) * (1.0 - sec), under));
  } else if (pat == 5) {
    float legs = smoothstep(0.09, 0.04, p.y);
    float ears = smoothstep(0.29, 0.32, p.y);
    float face = head * smoothstep(0.16, 0.2, p.z);
    float back = smoothstep(0.17, 0.23, p.y) * (1.0 - head) * 0.25;
    return vec2(max(max(legs, ears), max(max(face, tail), back)), 0.0);
  } else if (pat == 6) {
    float m = smoothstep(0.4, 0.62, bcNoise(p * 14.0) * 0.7 + n * 0.3);
    float fleck = smoothstep(0.72, 0.8, bcNoise(p * 40.0)) * 0.8;
    return vec2(max(m, fleck), 0.0);
  }
  return vec2(0.0);
}
vec3 bcFur() {
  vec3 p = vCat;
  int pat = bcPat();
  vec2 w = bcMask(pat, p);
  vec3 c = mix(mix(uBase, uSec, w.x), uTer, w.y);
  if (pat == 0) {
    float belly = smoothstep(0.115, 0.075, p.y) * step(-0.2, p.z);
    c = mix(uBase, uBase * 1.12 + 0.02, belly * 0.6);
  }
  return c;
}
`;

/** Sample points over the cat (back, flank, belly, chest, paws, head, ears, tail) for tests and the pattern guess. */
export const PATTERN_SAMPLES: readonly [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let iz = -6; iz <= 6; iz++)
    for (let iy = 0; iy <= 8; iy++)
      for (const x of [-0.07, -0.02, 0, 0.03, 0.08]) out.push([x, 0.01 + iy * 0.04, iz * 0.025]);
  return out;
})();

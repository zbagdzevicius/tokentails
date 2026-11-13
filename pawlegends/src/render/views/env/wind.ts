/**
 * Living pass P1: wind in the foliage (render only). One vertex patch chained onto a scenery material's own
 * `onBeforeCompile` (the canopy / bush cuts of mapView and hearthwoodView), so the trees, crowns, hedge and bushes sway
 * in one shared breeze with slow gusts that travel across the map.
 *
 * Each vertex sways by `aPart` cm (the ModelBuilder part id, which scenery meshes do not use otherwise; 0 = rigid: rocks,
 * trunks' bases, posts) times its height above `aPivot.y` over `WIND.span` m, so a tree bends from above its trunk and a
 * bush from its base, rigid at the ground. The phase is a hash of the pivot (a merged tree or bush) or of the instance's
 * position (the instanced far forest), so every tree is out of step. Tiers switch it with a uniform only (`uWindAmp` 0
 * on Low): the program never changes, nothing links after the loading veil.
 *
 * The displacement is added right after `#include <begin_vertex>`, before the cut's `vFW = …` line, so the dithered
 * canopy / bush cut stays on the moved leaves.
 */
import type * as THREE from 'three';
import type { Ambient } from '../../ambient';

export const WIND = Object.freeze({
  /** Sway at the top of a crown (cm, `aPart`): merged forest and outcrop crowns. */
  treeCm: 5,
  /** The far forest (outside the playfield, never over a fight). */
  farCm: 6,
  /** A Catnip Bush (cm at full weight; its top reaches about 0.75 of it: under 3 cm, inside its own outline). */
  bushCm: 3,
  /** The edge hedge. */
  hedgeCm: 2.5,
  /** Height (m) over which the weight ramps from 0 at the pivot to 1. */
  span: 2,
  /** Main direction of the breeze (map xz in three.js world: x, z), unit length. */
  dir: [0.86, 0.51] as const,
});

export interface WindUniforms {
  /** Wind clock (s): advanced by dt × the ambient speed, so a speed change never jumps the phase. */
  uWindT: { value: number };
  /** Amplitude 0..1 (0 on Low: no sway, same program). */
  uWindAmp: { value: number };
}

export function windUniforms(): WindUniforms {
  return { uWindT: { value: 0 }, uWindAmp: { value: 0 } };
}

/** The wind amplitude for an ambient level (0 on Low; `motion` already carries Med 0.7 and reduce motion 0.3). */
export function windAmp(a: Pick<Ambient, 'level' | 'motion'>): number {
  return a.level === 0 ? 0 : a.motion;
}

/** The share of a vertex's sway at height `y` (m) over its pivot height `py` (the shader's own formula). */
export function windWeight(y: number, py: number, span: number = WIND.span): number {
  return Math.max(0, Math.min(1, (y - py) / span));
}

const PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
uniform float uWindT, uWindAmp;
`;

const BODY = /* glsl */ `
  if (uWindAmp > 0.0 && aPart > 0.0) {
#ifdef USE_INSTANCING
    vec2 plWp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
    vec2 plWp = (modelMatrix * vec4(aPivot, 1.0)).xz;
#endif
    float plWk = aPart * 0.01 * uWindAmp * clamp((transformed.y - aPivot.y) / ${WIND.span.toFixed(2)}, 0.0, 1.0);
    float plPh = fract(sin(dot(floor(plWp * 4.0), vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
    // gusts roll across the map with the breeze; each plant swings on two out-of-step sines
    float plG = 0.62 + 0.38 * sin(uWindT * 0.42 - dot(plWp, vec2(${WIND.dir[0]}, ${WIND.dir[1]})) * 0.09);
    float plS = (sin(uWindT * 1.7 + plPh) * 0.72 + sin(uWindT * 2.9 + plPh * 1.7) * 0.28) * plG + 0.25 * plG;
    float plC = sin(uWindT * 1.13 + plPh * 0.6) * 0.3;
    vec3 plD = vec3(${WIND.dir[0]}, 0.0, ${WIND.dir[1]}) * plS + vec3(-${WIND.dir[1]}, 0.0, ${WIND.dir[0]}) * plC;
#ifdef USE_INSTANCING
    mat3 plIm = mat3(instanceMatrix);
    plD = (plD * plIm) / max(dot(plIm[0], plIm[0]), 1e-4);
#endif
    transformed += plD * plWk;
  }
`;

/** The vertex chunk (tests: the guard and the order relative to the cut line). */
export const WIND_GLSL = Object.freeze({ pars: PARS, body: BODY });

type Patchable = THREE.Material & { onBeforeCompile: THREE.Material['onBeforeCompile'] };

/**
 * Chains the wind onto `mat`'s own `onBeforeCompile` (after it, so the cut's lines are in place) and bumps its
 * program cache key (`<key>-wind1`). Returns the material.
 */
export function patchWind<M extends Patchable>(mat: M, u: WindUniforms): M {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${PARS}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${BODY}`);
  };
  mat.customProgramCacheKey = () => `${key}-wind1`;
  return mat;
}

/** Per-frame step (CPU: two uniform writes). */
export function stepWind(u: WindUniforms, a: Pick<Ambient, 'level' | 'motion' | 'speed'>, dt: number): void {
  u.uWindAmp.value = windAmp(a);
  if (u.uWindAmp.value > 0) u.uWindT.value = (u.uWindT.value + dt * a.speed) % 3600;
}

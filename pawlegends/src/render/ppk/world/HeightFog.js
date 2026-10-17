// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/world/HeightFog.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/world/HeightFog.js  (owner: world) — art.md §9.2 height fog / ground mist: FogExp2 distance fog that is
// greener and thicker near the ground. Shared uniforms (`HFOG`) are written by Env every frame; every material
// with fog gets the same chunk replacements through `withHeightFog(mat)` (Env patches the whole scene, and
// registers itself as a characters material patcher). Node-safe (three maths only).
//
// CONTROLS_SPEC §4.1 focus fog: the vertex chunk keeps the whole world position (`varying vec3 vFogW`, the old
// `vFogH` is `vFogW.y`). The fog distance is `mix(lens depth, horizontal distance from uFogFocus − uFogClear (× uFogTopMul),
// uFogMode)`: mode 0 = today's lens fog (cutscenes, presets, Meme Cam, `?cam=classic`), mode 1 = focus fog (the
// three-quarter top-down play camera: the stage around her is clear, the screen edges are misty). Density keeps its
// meaning, so every preset / contribute() / Golden Hour multiplier stays valid.
//
// For shaders that do their own fog maths (fx/shaders.js `fxFog`, fx/Horde.js): `patchFogVarying(shader)` swaps the
// fog chunks for the vFogW versions and declares `hfogFactor(vec3 w, float viewDepth)` (= `HFOG_GLSL`) after
// `<fog_pars_fragment>`; call `hfogFactor(vFogW, vFogDepth)` instead of the exp² of vFogDepth.
//
// ART_WARM_SPEC §2.4 [X5] / PERF §8.2: `withHeightFog` also delivers the shared `ENV_U` uniforms and, in lit programs
// only (where `<lights_fragment_begin>` is included), adds her warm glow pool and the 4 lamp pools before
// `<opaque_fragment>` from the world position `vFogW` it already provides (no inverse view matrix):
//   outgoingLight += diffuse × (uGlowCol × g² × 0.6 + uLampCol × Σ l² × uLampStr),  g, l = 1 − smoothstep(0, r, d)
// One hook, so world Lambert, the actors' toon, grass and water all get warm pools with no light-count change and no
// recompile. Program cache key suffix: the constant `|hfog3`.
import * as THREE from 'three';
import { ENV_U } from './tone.js';

/** Shared uniforms (same objects in every patched program, so one write updates all). */
export const HFOG = {
  uFogLow: { value: new THREE.Color('#EED6A6') },          // WA W1: the meadow_day row, never grey
  uFogBase: { value: 0 },
  uFogFalloff: { value: 0.6 },
  uFogLowMix: { value: 0.6 },
  /** §4.1 focus fog: the point the fog is measured from (her focus), lens ↔ focus mix, clear radius, distance gain */
  uFogFocus: { value: new THREE.Vector3() },
  uFogMode: { value: 0 },
  uFogClear: { value: 5 },
  uFogTopMul: { value: 1.5 },
};

/** Height-fog look constants (shared by the GLSL and the JS mirror `fogFactor`). */
export const HFOG_LOOK = Object.freeze({ low: 0.7, high: 1.15 });

const V_PARS = '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vFogW;\n#endif';
// world position from the view-space position: (mv − T) · V = Rᵀ·R·world (exact for a rigid view matrix)
const V_MAIN = '#include <fog_vertex>\n#ifdef USE_FOG\nvFogW = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;\n#endif';

/**
 * The fog factor helper (fragment). Needs `<fog_pars_fragment>` before it (fogColor, fogDensity / fogNear, fogFar).
 * `w` = world position (vFogW), `viewDepth` = the lens depth (vFogDepth). Returns the final 0..1 mix toward the fog.
 */
export const HFOG_GLSL = /* glsl */`
uniform vec3 uFogLow; uniform float uFogBase, uFogFalloff, uFogLowMix;
uniform vec3 uFogFocus; uniform float uFogMode, uFogClear, uFogTopMul;
float hfogHeight(vec3 w) { return exp( - max( w.y - uFogBase, 0.0 ) * uFogFalloff ); }
float hfogFactor(vec3 w, float viewDepth) {
  float dFocus = max( length( w.xz - uFogFocus.xz ) - uFogClear, 0.0 ) * uFogTopMul;
  float dEff = mix( viewDepth, dFocus, uFogMode );
  #ifdef FOG_EXP2
    float hfDist = 1.0 - exp( - fogDensity * fogDensity * dEff * dEff );
  #else
    float hfDist = smoothstep( fogNear, fogFar, dEff );
  #endif
  return clamp( hfDist * mix( ${HFOG_LOOK.low.toFixed(2)}, ${HFOG_LOOK.high.toFixed(2)}, hfogHeight( w ) ), 0.0, 1.0 );
}
vec3 hfogColor(vec3 w) { return mix( fogColor, uFogLow, hfogHeight( w ) * uFogLowMix ); }
`;

const F_PARS = '#include <fog_pars_fragment>\n#ifdef USE_FOG\nvarying vec3 vFogW;\n' + HFOG_GLSL + '\n#endif';
const F_MAIN = `#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hfogColor( vFogW ), hfogFactor( vFogW, vFogDepth ) );
#endif`;

/**
 * For shaders with their own fog maths: swap `<fog_pars_vertex>` / `<fog_vertex>` / `<fog_pars_fragment>` for the
 * vFogW versions (+ HFOG_GLSL) and add the HFOG uniforms. `<fog_fragment>` is left alone. Works on an
 * onBeforeCompile `shader` or on a ShaderMaterial (its vertexShader / fragmentShader / uniforms). Idempotent.
 * @template T @param {T & {vertexShader: string, fragmentShader: string, uniforms: object}} shader @returns {T}
 */
export function patchFogVarying(shader) {
  if (!shader || shader.fragmentShader.includes('varying vec3 vFogW')) return shader;
  shader.uniforms ??= {};
  Object.assign(shader.uniforms, HFOG);
  shader.vertexShader = shader.vertexShader.replace('#include <fog_pars_vertex>', V_PARS).replace('#include <fog_vertex>', V_MAIN);
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_pars_fragment>', F_PARS);
  return shader;
}

/** Apply the height-fog chunk replacements to shader sources (for custom ShaderMaterials). */
export function patchHeightFogShader(shader) {
  patchFogVarying(shader);
  shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', F_MAIN);
  return shader;
}

/** Glow + lamp pools (lit programs only; needs vFogW, i.e. USE_FOG). Vertical distance counts half (pools spread). */
export const GLOW_GLSL_PARS = /* glsl */`
#ifdef USE_FOG
uniform vec4 uGlow; uniform vec3 uGlowCol; uniform vec4 uLamps[ 4 ]; uniform vec3 uLampCol; uniform float uLampStr;
float hfogPool(vec3 w, vec4 p) { vec3 d = w - p.xyz; d.y *= 0.5; float l = 1.0 - smoothstep(0.0, max(p.w, 1e-3), length(d)); return l * l * step(0.001, p.w); }
#endif
`;
export const GLOW_GLSL = /* glsl */`
#ifdef USE_FOG
{
  float hfL = hfogPool(vFogW, uLamps[ 0 ]) + hfogPool(vFogW, uLamps[ 1 ]) + hfogPool(vFogW, uLamps[ 2 ]) + hfogPool(vFogW, uLamps[ 3 ]);
  outgoingLight += diffuseColor.rgb * (uGlowCol * hfogPool(vFogW, uGlow) * 0.6 + uLampCol * hfL * uLampStr);
}
#endif
#include <opaque_fragment>`;

/**
 * Add the warm glow / lamp pools to a lit onBeforeCompile `shader` (after patchHeightFogShader). Unlit programs
 * (Basic, Sprite, Points, fx ShaderMaterials) are left alone. Idempotent.
 */
export function patchGlow(shader) {
  if (!shader?.fragmentShader || shader.fragmentShader.includes('hfogPool(')) return shader;
  const fs = shader.fragmentShader;
  if (!fs.includes('#include <lights_fragment_begin>') || !fs.includes('#include <opaque_fragment>') || !fs.includes('varying vec3 vFogW')) return shader;
  shader.uniforms ??= {};
  Object.assign(shader.uniforms, ENV_U);
  shader.fragmentShader = fs.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>' + GLOW_GLSL_PARS)
    .replace('#include <opaque_fragment>', GLOW_GLSL);
  return shader;
}

/**
 * Patch a material in place (idempotent). Keeps any existing onBeforeCompile and composes the program cache key,
 * so differently-patched materials never share a program. Opt out with `mat.userData.noHeightFog = true`.
 * @template {THREE.Material} M @param {M} mat @returns {M}
 */
export function withHeightFog(mat) {
  if (!mat || mat.userData?.hfog || mat.userData?.noHeightFog || mat.fog === false) return mat;
  const prev = mat.onBeforeCompile;
  const hadCustom = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile') || mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey;
  const prevKey = hadCustom ? String(mat.customProgramCacheKey()) : '';
  mat.onBeforeCompile = function (shader, renderer) {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(this, shader, renderer);
    patchHeightFogShader(shader);
    patchGlow(shader);
  };
  mat.customProgramCacheKey = () => prevKey + '|hfog3';
  mat.userData.hfog = true;
  mat.needsUpdate = true;          // recompiles if it was already compiled; harmless otherwise
  return mat;
}

/**
 * JS mirror of `hfogFactor` (pure; tests, `env.fogAt`, the fog audit). EXP2 only.
 * @param {{density:number, mode:number, clear:number, topMul:number, base?:number, falloff?:number,
 *          focus:{x:number, z:number}, viewDepth?:number}} f
 * @param {{x:number, y:number, z:number}} w world point
 */
export function fogFactor(f, w) {
  const dFocus = Math.max(Math.hypot(w.x - f.focus.x, w.z - f.focus.z) - f.clear, 0) * f.topMul;
  const dEff = (f.viewDepth ?? 0) * (1 - f.mode) + dFocus * f.mode;
  const dist = 1 - Math.exp(-f.density * f.density * dEff * dEff);
  const h = Math.exp(-Math.max(w.y - (f.base ?? 0), 0) * (f.falloff ?? 0.6));
  return Math.min(1, Math.max(0, dist * (HFOG_LOOK.low + (HFOG_LOOK.high - HFOG_LOOK.low) * h)));
}

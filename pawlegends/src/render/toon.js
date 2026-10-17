// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/toon.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/toon.js  (owner: core) — global toon lighting (ART_WARM_SPEC §4.1). Pure string patches on THREE.ShaderChunk.
// Game.js installs it once before the first compile (S1); idempotent. Reaches every `lights: true` material (Lambert,
// Phong, Standard, Physical, Toon shadow + grade); Basic / Matcap / Sprite / Points and fx ShaderMaterials are untouched.
import * as THREE from 'three';
import { RENDER } from './ppk/core/config.js';
const T = RENDER.toon;  // { band: [0, 0.07], step: [0.42, 0.50, 0.86], shadow: [0.38, 0.62], sat: 1.12 }
const f = (x) => x.toFixed(3);
export const TOON_GLSL = /* glsl */`
#ifndef TOON_GLSL
#define TOON_GLSL 1
float toonRamp(float d){ return smoothstep(${f(T.band[0])}, ${f(T.band[1])}, d)
  * mix(${f(T.step[2])}, 1.0, smoothstep(${f(T.step[0])}, ${f(T.step[1])}, d)); }
float toonShadow(float s){ return smoothstep(${f(T.shadow[0])}, ${f(T.shadow[1])}, s); }
vec3 toonGrade(vec3 c){ float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(vec3(l), c, ${f(T.sat)}); }
#endif
`;
/** The chunks installToon patches (each contains 'toon' afterwards). */
export const TOON_KEYS = ['lights_pars_begin', 'lights_lambert_pars_fragment', 'lights_physical_pars_fragment',
  'lights_fragment_begin', 'opaque_fragment'];
/**
 * Patch THREE.ShaderChunk once (a second call is a no-op). @returns {boolean} true when every TOON_KEYS chunk carries
 * the toon terms (false = three version drift; a warning names the chunk).
 */
export function installToon() {
  const C = THREE.ShaderChunk;
  if (C.lights_pars_begin.includes('TOON_GLSL')) return true;
  C.lights_pars_begin = TOON_GLSL + C.lights_pars_begin;          // fragment-only host, before every RE_Direct
  const DOT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
  const TOON = 'float dotNL = toonRamp( dot( geometryNormal, directLight.direction ) );';
  C.lights_lambert_pars_fragment = C.lights_lambert_pars_fragment.replace(DOT, TOON);
  C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(DOT, TOON);   // RE_Direct_Physical only
  const SH = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  C.lights_fragment_begin = C.lights_fragment_begin.replace(`? ${SH} :`, `? toonShadow( ${SH} ) :`);
  C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
    '#ifdef TOON_GLSL\n\toutgoingLight = toonGrade( outgoingLight );\n#endif\ngl_FragColor = vec4( outgoingLight, diffuseColor.a );');
  let ok = true;
  for (const k of TOON_KEYS) if (!/toon/i.test(C[k])) { ok = false; console.warn(`[toon] chunk ${k} did not patch (three version drift?)`); }
  return ok;
}

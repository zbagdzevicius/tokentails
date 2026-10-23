// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/world/tone.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/world/tone.js  (owner: world) — ART_WARM_SPEC §2.4 global warm tokens and the live shared uniforms (`ENV_U`).
// Its own module so HeightFog (which delivers ENV_U to every patched material) and Env (which writes it) share one
// object without an import cycle. Env re-exports both. Node-safe (three maths only).
import * as THREE from 'three';

/**
 * ART §2.4 global tokens (world owns, everyone imports). Shadows are tinted, never black; the hull ink is warm brown.
 */
export const TONE = Object.freeze({
  rimDay: '#FFE6B8', rimNight: '#FFD08A', rimHush: '#F6E6FF',
  ink: '#4A2A1E',
  blob: '#5A4E7A', blobA: 0.35,
  telegraph: '#FF8A3D',
  sparkle: Object.freeze(['#FFF1C4', '#FFD57A']), holy: '#FFE3A3',
  lantern: '#FFC46B', fire: '#FF8A3D',
});

/**
 * ART §2.4 / PERF §8.2 live shared uniform objects. Env writes `.value` on every preset change and per frame; every
 * patched material holds these same objects (no recompile when they change). `uGlow` = (x, y, z, radius) of her warm
 * pool (player may write the position; Env writes it when nobody else does), `uLamps[4]` = (x, y, z, radius) of the
 * 4 lamps nearest the iso focus (radius 0 = off), `uLampStr` 0 by day.
 */
export const ENV_U = {
  uRim: { value: new THREE.Color(TONE.rimDay) }, uRimK: { value: 0.38 }, uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
  uGlow: { value: new THREE.Vector4(0, -999, 0, 3.5) }, uGlowCol: { value: new THREE.Color(TONE.lantern) },
  uLamps: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uLampCol: { value: new THREE.Color(TONE.lantern) }, uLampStr: { value: 0 },
};

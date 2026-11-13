/**
 * Living pass P1: the "living" scenery material (render only): the base banners' cloth waves, the Hearthwood lily pads
 * bob and turn, and the toad camp's pond ripples, all in the banner mesh's own draw (no extra draw on any tier).
 *
 * The kind rides in the ModelBuilder part id (`aPart`), the anchor in its pivot (`aPivot`):
 *   0 static (poles, finials), 1 cloth (pinned at the pole: `aPivot` on the pole, the cloth hangs toward +x),
 *   2 bob (a lily pad round its centre), 3 pond (ripples round `aPivot`, radius `POND_R`).
 * Off on Low with the same program (`uLiveAmp` 0: every kind is static).
 */
import * as THREE from 'three';
import type { Ambient } from '../../ambient';
import { POND_GLSL } from './waterLife';

export const LIVE_KIND = Object.freeze({ still: 0, cloth: 1, bob: 2, pond: 3 } as const);

export const BANNER = Object.freeze({
  /** Cloth width from the pole (m) and the wave at its free edge (m, across the cloth). */
  width: 1.2,
  wave: 0.13,
  /** Wave number along the cloth (rad/m) and speed (rad/s). */
  k: 3.2,
  speed: 3.4,
  /** Lily pads: bob (m), turn (rad), drift (m). */
  bob: 0.01,
  turn: 0.12,
  drift: 0.05,
  /** The toad pond radius (m). */
  pondR: 1.6,
});

export interface LivingUniforms {
  uLiveT: { value: number };
  uLiveAmp: { value: number };
}

export function livingUniforms(): LivingUniforms {
  return { uLiveT: { value: 0 }, uLiveAmp: { value: 0 } };
}

/** The cloth's sideways offset (m) at `along` m from the pole, time `t`, phase `ph` (the shader's own formula). */
export function clothWave(along: number, t: number, ph: number, amp: number): number {
  const w = Math.max(0, Math.min(1, along / BANNER.width));
  return Math.sin(t * BANNER.speed - along * BANNER.k + ph) * BANNER.wave * w * w * amp;
}

const VPARS = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
uniform float uLiveT, uLiveAmp;
varying float vPlLk;
varying vec3 vPlLp;
varying vec3 vPlLc;
float plLph(vec3 p){ return fract(sin(dot(floor(p.xz * 4.0), vec2(12.9898, 78.233))) * 43758.5453) * 6.2832; }
`;
// cloth: a travelling wave across the cloth, pinned at the pole (weight² from it); the normal tilts with the slope so
// the flat-shaded cloth catches the light as it waves
const VNORMAL = /* glsl */ `
  float plLs = 0.0;
  float plLz = 0.0;
  if (uLiveAmp > 0.0 && aPart > 0.5 && aPart < 1.5) {
    float plLa = max(position.x - aPivot.x, 0.0);
    float plLw = clamp(plLa / ${BANNER.width.toFixed(2)}, 0.0, 1.0);
    float plLph0 = uLiveT * ${BANNER.speed.toFixed(2)} - plLa * ${BANNER.k.toFixed(2)} + plLph(aPivot);
    float plLg = 0.75 + 0.25 * sin(uLiveT * 0.5 + plLph(aPivot) * 0.7);
    plLz = sin(plLph0) * ${BANNER.wave.toFixed(3)} * plLw * plLw * uLiveAmp * plLg;
    plLs = -cos(plLph0) * ${BANNER.k.toFixed(2)} * ${BANNER.wave.toFixed(3)} * plLw * plLw * uLiveAmp * plLg;
    objectNormal = normalize(objectNormal + vec3(-plLs * objectNormal.z, 0.0, 0.0));
  }
`;
const VBODY = /* glsl */ `
  vPlLk = aPart;
  vPlLc = aPivot;
  if (uLiveAmp > 0.0) {
    if (aPart > 0.5 && aPart < 1.5) {
      transformed.z += plLz;
      // the free edge pulls in a little as the cloth waves (it does not stretch)
      transformed.x -= abs(plLz) * 0.25 * clamp((position.x - aPivot.x) / ${BANNER.width.toFixed(2)}, 0.0, 1.0);
    } else if (aPart > 1.5 && aPart < 2.5) {
      float plLp0 = plLph(aPivot);
      float plLr = sin(uLiveT * 0.37 + plLp0) * ${BANNER.turn.toFixed(3)} * uLiveAmp;
      vec2 plLd = transformed.xz - aPivot.xz;
      float c = cos(plLr);
      float s = sin(plLr);
      transformed.xz = aPivot.xz + vec2(c * plLd.x - s * plLd.y, s * plLd.x + c * plLd.y);
      transformed.xz += vec2(sin(uLiveT * 0.23 + plLp0 * 1.3), cos(uLiveT * 0.19 + plLp0)) * ${BANNER.drift.toFixed(3)} * uLiveAmp;
      transformed.y += sin(uLiveT * 1.3 + plLp0 * 2.0) * ${BANNER.bob.toFixed(3)} * uLiveAmp;
    }
  }
  vPlLp = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;
const FPARS = /* glsl */ `
uniform float uLiveT, uLiveAmp;
varying float vPlLk;
varying vec3 vPlLp;
varying vec3 vPlLc;
${POND_GLSL}
`;
const FBODY = /* glsl */ `
  if (uLiveAmp > 0.0 && vPlLk > 2.5) gl_FragColor.rgb = plPond(gl_FragColor.rgb, vPlLp.xz, vPlLc.xz, ${BANNER.pondR.toFixed(2)}, uLiveT, uLiveAmp);
`;

export const LIVING_GLSL = Object.freeze({ vpars: VPARS, vnormal: VNORMAL, vbody: VBODY, fpars: FPARS, fbody: FBODY });

/** A vertex-colour Lambert material that animates the living kinds (banner cloth, lily pads, pond). */
export function livingMaterial(u: LivingUniforms, key: string): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VPARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${VNORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VBODY}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FPARS}`).replace('#include <dithering_fragment>', `${FBODY}\n#include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** The living amplitude for an ambient level (0 on Low). */
export function livingAmp(a: Pick<Ambient, 'level' | 'motion'>): number {
  return a.level === 0 ? 0 : a.motion;
}

/** Per-frame step (CPU: two uniform writes). */
export function stepLiving(u: LivingUniforms, a: Pick<Ambient, 'level' | 'motion' | 'speed'>, dt: number): void {
  u.uLiveAmp.value = livingAmp(a);
  if (u.uLiveAmp.value > 0) u.uLiveT.value = (u.uLiveT.value + dt * a.speed) % 3600;
}

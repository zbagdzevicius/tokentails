/**
 * L-WORLD: shared GLSL snippets and the uniform block every world shader reads.
 */
import { Color, Vector3 } from 'three';

/** Uniforms shared by reference between all world materials (updated once per frame). */
export function createShared() {
  return {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uKick: { value: 0 },
    uHat: { value: 0 },
    uEnergy: { value: 0.6 },
    /** 1 while in a drop section (eased). */
    uDrop: { value: 0 },
    /** Linear RGB × strength of the current flash. */
    uFlash: { value: new Color(0, 0, 0) },
    uFogColor: { value: new Color() },
    uFogDensity: { value: 0.014 },
    uMoonCenter: { value: new Vector3() },
    uMoonRadius: { value: 70 },
    uMoonColor: { value: new Color() },
    uMoonGlow: { value: new Color() },
    /** 0..1 how "alive" the motion is (0.4 with prefers-reduced-motion). */
    uMotion: { value: 1 },
  };
}
export type SharedUniforms = ReturnType<typeof createShared>;

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
float fbm2(vec2 p) {
  return 0.6 * vnoise(p) + 0.4 * vnoise(p * 2.07 + vec2(5.2, 1.3));
}
`;

/** Shared uniform declarations (names match createShared). */
export const SHARED_DECL = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uKick;
uniform float uHat;
uniform float uEnergy;
uniform float uDrop;
uniform vec3 uFlash;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uMoonCenter;
uniform float uMoonRadius;
uniform vec3 uMoonColor;
uniform vec3 uMoonGlow;
uniform float uMotion;
`;

/** Exp2 fog matching scene.fog (FogExp2). */
export const FOG = /* glsl */ `
vec3 applyFog(vec3 col, float dist) {
  float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

/** Output: tone mapping + colour space (no-ops when rendering into the HDR composer target). */
export const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// River water (WORLD-ART): a stylised toon shader. Turquoise depth gradient from the banks, flowing streaks along
// the run, a foamy wobbling edge line and sparkles. Geometry carries uv = (lateral x in u, track s) and `hw`
// (half width) so the pattern is in world units and never stretches. LOW quality drops the sparkle and one octave.
import * as THREE from 'three';
import type { Palette } from './palette';

const vert = /* glsl */ `
attribute float hw;
varying vec2 vP;
varying float vHw;
#include <common>
#include <fog_pars_vertex>
void main() {
  vP = uv;
  vHw = hw;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec2 vP;
varying float vHw;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float x = vP.x;
  float s = vP.y;
  float dEdge = vHw - abs(x);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.4, 4.5, dEdge));
  // broad flowing tone + streaks moving with the run
  float n = vn(vec2(x * 0.35, s * 0.06 - uTime * 0.7));
  col = mix(col, uShallow, (n - 0.4) * 0.5);
  float st = vn(vec2(x * 2.2 + sin(s * 0.05) * 1.5, s * 0.12 - uTime * 1.6));
#ifndef LOW
  st = st * 0.7 + 0.3 * vn(vec2(x * 4.1, s * 0.3 - uTime * 2.6));
#endif
  float streak = smoothstep(0.64, 0.68, st) * (1.0 - smoothstep(0.7, 0.75, st));
  col = mix(col, uFoam, streak * 0.75);
  col = mix(col, uDeep * 0.8, smoothstep(0.25, 0.15, st) * 0.25 * smoothstep(1.0, 3.0, dEdge));
  // foam rim along the banks
  float fw = 0.55 + 0.9 * vn(vec2(s * 0.45 - uTime * 1.3, x * 0.7));
  float rim = 1.0 - smoothstep(fw * 0.6, fw * 1.25, dEdge);
  float rimLine = smoothstep(0.08, 0.0, abs(dEdge - fw * 1.6 - 0.25 * sin(s * 0.7 + uTime * 2.0))) * 0.6;
  col = mix(col, uFoam, clamp(rim + rimLine, 0.0, 1.0) * 0.92);
#ifndef LOW
  float sp = vn(vec2(x * 6.0, s * 3.0 - uTime * 5.0));
  col += vec3(1.0) * smoothstep(0.93, 0.99, sp) * 0.45 * smoothstep(1.0, 3.0, dEdge);
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function waterMaterial(p: Palette, low: boolean, time: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    fog: true,
    defines: low ? { LOW: 1 } : {},
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uDeep: { value: new THREE.Color(p.waterDeep) },
      uShallow: { value: new THREE.Color(p.waterShallow) },
      uFoam: { value: new THREE.Color(p.foam) },
      // the clock object is shared with the theme, so one write animates every chunk
      uTime: time,
    },
  });
}

/**
 * Lobby backdrop: one large plane behind the turntable with a cheap shader (one draw call). A two-stop gradient,
 * a soft glow behind the hero, a vignette and slow drifting bokeh from hashed cells. `uTint` is the worn card's
 * element colour, else the hero colour. Low tier or reduced motion freezes `uTime` (a still picture).
 *
 * Render only: nothing here reaches the sim.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Uniform colours are linear (THREE.Color); the colour-space chunk writes them out as sRGB. No tone mapping.
const FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uTint;
uniform vec3 uBase;
uniform float uTime;
uniform float uBokeh;
uniform vec2 uGlow;
uniform float uAspect;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// one layer of soft discs: each cell holds at most one disc that drifts up and sways
float bokeh(vec2 uv, float scale, float speed, float seed) {
  vec2 p = uv * vec2(scale * uAspect, scale);
  p.y -= uTime * speed;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash(cell + seed);
  if (h < 0.55) return 0.0;
  vec2 c = vec2(0.25 + 0.5 * hash(cell + seed + 3.1), 0.25 + 0.5 * hash(cell + seed + 7.7));
  c.x += 0.12 * sin(uTime * 0.4 + h * 6.28);
  float r = 0.10 + 0.16 * hash(cell + seed + 1.3);
  float d = length(f - c);
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + h) + h * 12.0);
  return smoothstep(r, r * 0.35, d) * tw;
}

void main() {
  vec2 uv = vUv;
  // vertical gradient: deep plum at the floor, the tint mixed in towards the top
  // (the tint stays an accent: a pale element such as Star must not wash the whole frame out)
  vec3 top = uBase * 1.55 + uTint * 0.07;
  vec3 col = mix(uBase * 0.7, top, smoothstep(0.0, 0.95, uv.y));
  // soft glow around the hero
  vec2 g = (uv - uGlow) * vec2(uAspect, 1.0);
  float glow = exp(-dot(g, g) * 9.0);
  col += uTint * glow * 0.26;
  // bokeh in two depths (skipped at strength 0: Low tier, a uniform branch, so no per-pixel cost)
  if (uBokeh > 0.001) {
    float b = bokeh(uv, 7.0, 0.018, 0.0) * 0.55 + bokeh(uv + 0.37, 4.0, 0.010, 11.0) * 0.35;
    col += mix(vec3(1.0, 0.95, 0.88), uTint, 0.55) * b * uBokeh * (0.35 + 0.65 * uv.y);
  }
  // vignette
  vec2 v = (uv - 0.5) * vec2(1.25, 1.0);
  col *= 1.0 - smoothstep(0.32, 0.85, length(v)) * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface Backdrop {
  readonly mesh: THREE.Mesh;
  /** Tint towards this colour (eased). */
  setTint(hex: number): void;
  /** Bokeh strength 0..1 (Low tier: dimmer). */
  setBokeh(k: number): void;
  /** Advance; `frozen` keeps the picture still (Low tier or reduced motion). */
  update(dt: number, frozen: boolean): void;
  dispose(): void;
}

/** Plane size (m): wide enough to fill a 21:9 frame at the farthest lobby camera. */
const W = 90;
const H = 44;

export function createBackdrop(): Backdrop {
  const target = new THREE.Color(0xff9f6b);
  const uniforms = {
    uTint: { value: new THREE.Color(0xff9f6b) },
    uBase: { value: new THREE.Color(0x2b1d2e) },
    uTime: { value: 0 },
    uBokeh: { value: 1 },
    // the hero stands a little right of the plane's centre; the glow sits behind it
    uGlow: { value: new THREE.Vector2(0.5, 0.42) },
    uAspect: { value: W / H },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  mesh.name = 'lobby-backdrop';
  mesh.position.set(0, 6, -14);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    setTint(hex) {
      target.setHex(hex);
    },
    setBokeh(k) {
      uniforms.uBokeh.value = Math.max(0, Math.min(1, k));
    },
    update(dt, frozen) {
      if (!frozen) uniforms.uTime.value += dt;
      uniforms.uTint.value.lerp(target, Math.min(1, dt * 3));
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

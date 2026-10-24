// Anime speed lines at the screen edges: one full-screen quad (clip-space vertex shader, no camera maths) drawn
// last with a procedural streak pattern. Strength follows speed, boosts, the pounce, the vault and the cloud ride.
// STYLE (iteration 2): the combo tier adds strength (+0.25 x tier / 6) and from tier 3 the lines turn gold.
import * as THREE from 'three';
import { scene } from '../core/engine';
import { addFrameHook } from '../core/loop';
import { P } from '../core/player';
import { game, prefs } from '../core/state';
import { isGoldTier, speedLineStrength, styleLineBoost } from './strength';

let mesh: THREE.Mesh | null = null;
let level = 0;
let styleTier = 0;
let gold = 0;
const GOLD = new THREE.Color(0xffcf3a);
const WHITE = new THREE.Color(0xffffff);
const CLOUD = new THREE.Color(0xeaf6ff);

/** STYLE: the current combo tier 0..6 (0 = no chain) */
export function setSpeedLineTier(tier: number): void {
  styleTier = tier;
}

export function initSpeedLines(): void {
  if (mesh) return;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uAspect: { value: 1 }, uTint: { value: new THREE.Color(0xffffff) }, uGold: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform float uAmt; uniform float uAspect; uniform vec3 uTint; uniform float uGold;
      float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(p) / (0.5 * length(vec2(uAspect, 1.0)));
        float a = atan(p.y, p.x) / 6.28318 + 0.5;
        const float N = 90.0;
        float bin = floor(a * N);
        float f = fract(a * N);
        float rnd = h(bin);
        float rnd2 = h(bin + 31.7);
        // only some bins carry a line at any moment, and each line is thin and tapered
        float on = step(0.45, h(bin + floor(uTime * (3.0 + rnd * 4.0) + rnd2 * 9.0)));
        float width = 0.12 + rnd * 0.18;
        float line = smoothstep(width, 0.0, abs(f - 0.5));
        // a streak travels outward along r
        float head = fract(uTime * (1.6 + rnd2 * 1.8) + rnd);
        float pos = mix(0.55, 1.15, head);
        float len = 0.18 + rnd * 0.22;
        float streak = smoothstep(pos - len, pos - len * 0.4, r) * smoothstep(pos + 0.02, pos - 0.05, r);
        // gold (high combo): never fainter than 0.5, brighter, and a warm glow at the head of each streak
        float amt = max(uAmt, 0.5 * uGold);
        float edge = smoothstep(0.42 + (1.0 - amt) * 0.25 - uGold * 0.1, 0.95, r);
        float alpha = line * streak * edge * on * amt * 0.85 * (1.0 + uGold * 0.6);
        if (alpha < 0.004) discard;
        vec3 col = mix(uTint, vec3(1.0, 0.98, 0.85), uGold * smoothstep(pos - len * 0.35, pos, r) * 0.6);
        gl_FragColor = vec4(col, min(1.0, alpha));
      }`,
  });
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  mesh.visible = false;
  mesh.geometry.userData.shared = true;
  scene.add(mesh);
  addFrameHook((dt, t) => {
    if (!mesh) return;
    const live = game.mode === 'play' || game.mode === 'finish';
    const want = live ? Math.min(1, speedLineStrength(P, prefs.reducedMotion) + styleLineBoost(styleTier, prefs.reducedMotion)) : 0;
    const wantGold = live && isGoldTier(styleTier) ? 1 : 0;
    if (dt > 0) gold += (wantGold - gold) * (1 - Math.exp(-4 * dt));
    else if (!live) gold = 0;
    if (dt > 0) level += (want - level) * (1 - Math.exp(-(want > level ? 10 : 3) * dt));
    else if (!live) level = 0;
    mesh.visible = level > 0.02 || gold > 0.05;
    const u = mat.uniforms;
    u.uAmt.value = Math.min(1, level);
    u.uTime.value = t;
    u.uAspect.value = innerWidth / Math.max(1, innerHeight);
    u.uGold.value = gold;
    (u.uTint.value as THREE.Color).copy(P.ability === 'cloud' ? CLOUD : WHITE).lerp(GOLD, gold);
  });
}

/** current smoothed strength (tests, other juice) */
export const speedLineLevel = () => level;

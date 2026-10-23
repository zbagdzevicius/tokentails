// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/Shockwaves.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/Shockwaves.js  (owner: fx) — M2 ground impacts: expanding shockwave walls (pug_slam r 2.5 / 0.4 s, Cacklejaw's
// Laugh Quake 8 m/s → 7 m, belly flops, boss slams) and glowing ground cracks (Grizzlechop's Overhead Slam crack line,
// 4 m forward, lingering 0.5 s). GAME_DESIGN §10.3, §11.2–§11.3, art.md §11 ("shield slam with a red shockwave ring").
//
// Visuals only: the wall's radius follows `shockRadius` (linear, the same constant speed the enemies' hit ring uses), so
// what she sees is exactly what can hit her: jump the 0.3 m band or roll through it. Pooled (6 rings, 4 cracks); each
// visible one is one draw call, idle ones cost nothing. The ring's base hugs the terrain (per-vertex ground offsets
// re-sampled every frame for the current radius), so it never floats over a dip or sinks into a slope.
import * as THREE from 'three';
import { FOG_FACTOR, NOISE, OUTPUT, fogUniforms, fxShaderMaterial } from '../ppk/fx/shaders.js';
import { SHAPE, FADE, GROW } from './Particles.js';
import { FX_COLORS } from '../ppk/fx/palette.js';

/** Radius of a shockwave at time t (linear expansion r0 → r1 over dur; pure, unit-tested). */
export function shockRadius(t, r0, r1, dur) {
  if (!(dur > 0)) return r1;
  const u = Math.min(1, Math.max(0, t / dur));
  return r0 + (r1 - r0) * u;
}

/** Wall opacity over its life: quick rise, full while expanding, fades over `tail` after reaching r1 (pure). */
export function shockAlpha(t, dur, tail = 0.18) {
  if (t < 0) return 0;
  const rise = Math.min(1, t / 0.05);
  if (t <= dur) return rise;
  return Math.max(0, 1 - (t - dur) / Math.max(0.01, tail));
}

/** Peak additive intensity of a shockwave wall (pawlegends: 1.6 and up washed bright ground to white). */
export const SHOCK_MAX_INTENSITY = 0.85;

/** Normalise shockwave options (pure). Speed (m/s) wins over dur when both are given. */
export function normalizeShock(o = {}) {
  const r1 = Math.max(0.3, +o.r1 || +o.r || 2.5);
  const r0 = Math.max(0.05, Math.min(r1 * 0.9, Number.isFinite(+o.r0) && o.r0 != null ? +o.r0 : 0.3));
  let dur = Number.isFinite(+o.dur) && o.dur > 0 ? +o.dur : 0.4;
  if (Number.isFinite(+o.speed) && o.speed > 0) dur = (r1 - r0) / o.speed;
  const height = Math.max(0.05, Number.isFinite(+o.height) && o.height > 0 ? +o.height : 0.3);
  // pawlegends (trailer review): capped, so an additive wall never blows the pale plaza or the river out to white
  const intensity = Math.min(SHOCK_MAX_INTENSITY, Number.isFinite(+o.intensity) ? +o.intensity : 1.6);
  return { r0, r1, dur, height, color: o.color ?? '#FF5A36', intensity, dust: o.dust !== false, tail: o.tail ?? 0.18 };
}

const SEG = 72;

const RING_VERT = /* glsl */`
attribute float aBase;   // ground offset at this vertex (m, relative to the centre)
uniform float uR, uH;
varying vec2 vUv;
varying float vAng;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vAng = uv.x;
  vec3 p = vec3( position.x * uR, aBase + uv.y * uH, position.z * uR );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const RING_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI, uA, uTime, uSeed;
varying vec2 vUv;
varying float vAng;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  float v = clamp( vUv.y, 0.0, 1.0 );
  // a ragged top edge (the wave front tears the air), brightest just above the ground
  float edge = 0.78 + 0.22 * fxNoise( vec2( vAng * 46.0 + uSeed, uTime * 6.0 ) );
  float body = ( 1.0 - smoothstep( edge - 0.25, edge, v ) ) * ( 0.45 + 0.55 * ( 1.0 - v ) );
  float rim = ( 1.0 - smoothstep( 0.0, 0.08, abs( v - edge + 0.06 ) ) ) * 0.8;
  float streak = 0.7 + 0.3 * fxNoise( vec2( vAng * 90.0 + uSeed * 3.0, v * 3.0 - uTime * 9.0 ) );
  float a = ( body * streak + rim ) * uA * smoothstep( 0.0, 0.06, v );
  if ( a < 0.003 ) discard;
  vec3 col = mix( uColor, vec3( 1.0, 0.95, 0.88 ), rim * 0.6 + ( 1.0 - v ) * 0.15 );
  gl_FragColor = vec4( col * uI * a * ( 1.0 - fxFog() ), 1.0 );
  ${OUTPUT}
}`;

const CRACK_VERT = /* glsl */`
attribute vec2 aCrack;   // x = 0..1 along, y = -1..1 across
varying vec2 vC;
#include <fog_pars_vertex>
void main() {
  vC = aCrack;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const CRACK_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uI, uA, uReveal, uSeed;
varying vec2 vC;
#include <fog_pars_fragment>
${FOG_FACTOR}
${NOISE}
void main() {
  float along = vC.x;
  if ( along > uReveal ) discard;
  // a zig-zag crack line with a couple of side forks
  float zig = ( fxNoise( vec2( along * 9.0 + uSeed, 0.5 ) ) - 0.5 ) * 0.9 + ( fxNoise( vec2( along * 31.0 + uSeed, 3.1 ) ) - 0.5 ) * 0.25;
  float d = abs( vC.y - zig );
  float fork = abs( vC.y - zig - ( fract( along * 3.0 + uSeed ) - 0.15 ) * 1.2 * step( 0.55, fxNoise( vec2( floor( along * 3.0 ) + uSeed, 7.0 ) ) ) );
  d = min( d, fork + 0.06 + 0.4 * fract( along * 3.0 + uSeed ) );
  float taper = smoothstep( 0.0, 0.08, along ) * ( 1.0 - smoothstep( max( uReveal - 0.06, 0.0 ), uReveal, along ) * 0.6 ) * ( 1.0 - smoothstep( 0.9, 1.0, along ) * 0.7 );
  float w = 0.24 * taper + 0.04;
  float core = 1.0 - smoothstep( w * 0.35, w, d );
  float glow = exp( -d * d * 9.0 ) * 0.7 * taper;
  float a = max( core, glow ) * uA;
  if ( a < 0.004 ) discard;
  vec3 ink = vec3( 0.06, 0.035, 0.025 );
  vec3 col = mix( uColor * uI, ink, smoothstep( 0.6, 1.0, core ) * 0.35 );
  col = mix( col, fxFogColor(), fxFog() * 0.6 );
  gl_FragColor = vec4( col, a );
  ${OUTPUT}
}`;

function ringGeometry() {
  const g = new THREE.BufferGeometry();
  const n = (SEG + 1) * 2;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), base = new Float32Array(n);
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([s, 0, c], j * 3);
      uv.set([i / SEG, k], j * 2);
    }
    if (i < SEG) { const a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aBase', new THREE.BufferAttribute(base, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}

const CSEG = 24;
function crackGeometry() {
  const g = new THREE.BufferGeometry();
  const n = (CSEG + 1) * 2;
  const pos = new Float32Array(n * 3), cr = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i <= CSEG; i++) {
    for (let k = 0; k < 2; k++) cr.set([i / CSEG, k ? 1 : -1], (i * 2 + k) * 2);
    if (i < CSEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCrack', new THREE.BufferAttribute(cr, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}

class ShockRing {
  constructor() {
    this.material = fxShaderMaterial({
      name: 'fx.shock.ring', vertexShader: RING_VERT, fragmentShader: RING_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uR: { value: 1 }, uH: { value: 0.3 }, uColor: { value: new THREE.Color() }, uI: { value: 1 }, uA: { value: 0 },
        uTime: { value: 0 }, uSeed: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(ringGeometry(), this.material);
    this.mesh.name = 'fx.shock.ring';
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false;
    this.o = null; this.t = 0; this.dustT = 0;
  }
}

class Crack {
  constructor() {
    this.material = fxShaderMaterial({
      name: 'fx.shock.crack', vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, fog: true,
      uniforms: { ...fogUniforms(), uColor: { value: new THREE.Color() }, uI: { value: 2 }, uA: { value: 0 }, uReveal: { value: 0 }, uSeed: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(crackGeometry(), this.material);
    this.mesh.name = 'fx.shock.crack';
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
    this.t = 0; this.life = 1; this.travel = 0.12; this.I = 2.2;
  }
}

const _c = new THREE.Color();
const _p = new THREE.Vector3();

export class Shockwaves {
  /** @param {any} ctx @param {{ particles: any, groundY: (x:number, z:number, fb:number) => number, rng: () => number }} o */
  constructor(ctx, { particles, groundY, rng }) {
    this.ctx = ctx; this.particles = particles; this.groundY = groundY; this.rng = rng;
    this.rings = []; this.cracks = [];
    this.started = 0; this.crackCount = 0;     // counts (tests / smoke)
  }

  init(scene) {
    for (let i = 0; i < 6; i++) { const r = new ShockRing(); this.rings.push(r); scene.add(r.mesh); }
    for (let i = 0; i < 4; i++) { const c = new Crack(); this.cracks.push(c); scene.add(c.mesh); }
  }

  get active() { return this.rings.filter((r) => r.mesh.visible).length; }
  get activeCracks() { return this.cracks.filter((c) => c.mesh.visible).length; }

  /**
   * Start an expanding shockwave wall at `pos` (ground centre). Options: r0, r1 (or r), dur or speed (m/s), height (0.3),
   * color ('#FF5A36'), intensity, dust (true). Returns the normalised options (radius timing for the caller).
   */
  start(pos, opts = {}) {
    const o = normalizeShock(opts);
    let r = this.rings.find((x) => !x.mesh.visible);
    if (!r) r = this.rings.reduce((m, x) => (x.t > m.t ? x : m));
    r.o = o; r.t = 0; r.dustT = 0;
    r.cx = pos.x; r.cz = pos.z;
    r.mesh.position.set(pos.x, this.groundY(pos.x, pos.z, pos.y), pos.z);
    const u = r.material.uniforms;
    u.uColor.value.set(o.color); u.uI.value = o.intensity; u.uH.value = o.height; u.uR.value = o.r0; u.uA.value = 0;
    u.uSeed.value = this.rng() * 50;
    this._fitBase(r, o.r0);
    r.mesh.visible = true;
    this.started++;
    return o;
  }

  /**
   * A glowing ground crack from `pos` along `dir` (XZ). Options: length (4), width (0.9), life (0.5 + travel),
   * color ('#FF7A3A'), travel (s for the crack to run its length, 0.12).
   */
  crack(pos, dir, opts = {}) {
    let c = this.cracks.find((x) => !x.mesh.visible);
    if (!c) c = this.cracks.reduce((m, x) => (x.t > m.t ? x : m));
    const L = Math.max(0.5, opts.length ?? 4), W = Math.max(0.2, opts.width ?? 0.9);
    let dx = dir?.x ?? 0, dz = dir?.z ?? 1;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const sx = -dz, sz = dx;
    const P = c.mesh.geometry.getAttribute('position'), A = P.array;
    for (let i = 0; i <= CSEG; i++) {
      const a = (i / CSEG) * L;
      for (let k = 0; k < 2; k++) {
        const s = (k ? 1 : -1) * W * 0.5;
        const x = pos.x + dx * a + sx * s, z = pos.z + dz * a + sz * s;
        const j = (i * 2 + k) * 3;
        A[j] = x; A[j + 1] = this.groundY(x, z, pos.y) + 0.035; A[j + 2] = z;
      }
    }
    P.needsUpdate = true;
    c.t = 0; c.travel = Math.max(0.02, opts.travel ?? 0.12); c.life = c.travel + Math.max(0.1, opts.life ?? 0.5) + 0.25;
    const u = c.material.uniforms;
    c.I = opts.intensity ?? 2.2;
    u.uColor.value.set(opts.color ?? '#FF7A3A'); u.uI.value = c.I; u.uA.value = 1; u.uReveal.value = 0; u.uSeed.value = this.rng() * 40;
    c.mesh.visible = true;
    this.crackCount++;
    // chips kick up along the line as it runs
    for (let k = 0; k < 3; k++) {
      const a = L * (0.25 + 0.3 * k);
      _p.set(pos.x + dx * a, 0, pos.z + dz * a); _p.y = this.groundY(_p.x, _p.z, pos.y) + 0.1;
      this.particles.burst(_p, { n: 4, shape: SHAPE.SHARD, color: FX_COLORS.sand, tint: 0.15, size: [0.05, 0.09], life: [0.45, 0.7], speed: [1.5, 2.8],
        up: 2.4, spread: Math.PI, gravity: 12, drag: 0.5, spin: 10, fade: FADE.HOLD, floor: true });
    }
    return c;
  }

  _fitBase(r, radius) {
    const g = r.mesh.geometry, B = g.getAttribute('aBase'), arr = B.array, y0 = r.mesh.position.y;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = r.cx + Math.sin(a) * radius, z = r.cz + Math.cos(a) * radius;
      const off = this.groundY(x, z, y0) - y0;
      arr[i * 2] = off; arr[i * 2 + 1] = off;
    }
    B.needsUpdate = true;
  }

  render(dt, time) {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      const o = r.o;
      r.t += dt;
      if (r.t >= o.dur + o.tail) { r.mesh.visible = false; continue; }
      const rad = shockRadius(r.t, o.r0, o.r1, o.dur);
      const u = r.material.uniforms;
      u.uR.value = rad; u.uA.value = shockAlpha(r.t, o.dur, o.tail); u.uTime.value = time;
      if (dt > 0) this._fitBase(r, rad);
      // dust thrown up along the wave front
      if (o.dust && r.t <= o.dur && dt > 0 && (r.dustT -= dt) <= 0) {
        r.dustT = 0.07;
        _p.set(r.cx, r.mesh.position.y, r.cz);
        const n = Math.min(12, Math.max(4, Math.ceil(rad * 1.8)));
        this.particles.ring(_p, { n, r0: rad, speed: [0.6, 1.4], up: 0.6, y: 0.08, size: [0.18, 0.3], sizeEnd: 2.2, life: [0.35, 0.55],
          color: FX_COLORS.sandLight, alpha: 0.55, tint: 0.08, drag: 3, fade: FADE.LINEAR, floor: true });
      }
    }
    for (const c of this.cracks) {
      if (!c.mesh.visible) continue;
      c.t += dt;
      if (c.t >= c.life) { c.mesh.visible = false; continue; }
      const u = c.material.uniforms;
      u.uReveal.value = Math.min(1, c.t / c.travel);
      u.uA.value = Math.min(1, (c.life - c.t) / 0.25);
      u.uI.value = c.I * (0.65 + 0.35 * Math.max(0, 1 - c.t / c.life));
    }
  }

  /** A flash ring sprite + debris + dust ring: the "thud" under a slam (helper for FX.burst 'slam'). */
  thud(pos, S = 1, color = '#FFE0C8') {
    const P = this.particles;
    _p.copy(pos); _p.y += 0.15;
    P.single(_p, { shape: SHAPE.RING, color, intensity: 1.6, size0: 0.4 * S, size1: 2.6 * S, life: 0.25, grow: GROW.OUT, alpha: 0.8 });
    P.ring(pos, { n: Math.round(14 * S), r0: 0.4 * S, speed: [2.2 * S, 3.6 * S], up: 0.5, y: 0.1, size: [0.26, 0.4], sizeEnd: 2.4, life: [0.5, 0.75],
      color: FX_COLORS.sandPale, alpha: 0.75, tint: 0.1, drag: 3.2, fade: FADE.HOLD, floor: true });
    P.burst(_p, { n: Math.round(8 * S), shape: SHAPE.SHARD, color: FX_COLORS.sandDust, tint: 0.2, size: [0.07, 0.13], life: [0.55, 0.85], speed: [2.0, 4.0],
      up: 3.0, spread: Math.PI, gravity: 13, drag: 0.4, spin: 9, fade: FADE.HOLD, floor: true, jitter: 0.3 * S });
  }

  clear() {
    for (const r of this.rings) r.mesh.visible = false;
    for (const c of this.cracks) c.mesh.visible = false;
  }

  dispose() {
    for (const r of this.rings) { r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.material.dispose(); }
    for (const c of this.cracks) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); c.material.dispose(); }
    this.rings.length = 0; this.cracks.length = 0;
  }
}

/** The colour per named slam style (enemies may pass `style` instead of a colour). */
export const SLAM_COLORS = Object.freeze({ red: '#FF5A36', boss: '#FF7A3A', jeer: '#B07CFF', goo: '#7FD38A', gold: '#FFD34D', white: '#F4F8FF' });

/** Resolve a colour option: a SLAM_COLORS key, any THREE colour string, or the default (pure). */
export function slamColor(c, fallback = SLAM_COLORS.red) {
  if (c == null) return fallback;
  if (typeof c === 'string' && SLAM_COLORS[c]) return SLAM_COLORS[c];
  try { _c.set(c); return c; } catch { return fallback; }
}

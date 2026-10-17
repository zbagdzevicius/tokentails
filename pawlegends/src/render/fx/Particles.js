// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/Particles.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/Particles.js  (owner: fx) — pooled, CPU-simulated billboard particles (tech.md §18: "pooled, 1 InstancedMesh
// per material, ≤ 2000"). Two pools: `add` (additive, HDR so bloom catches sparkles, stars, sparks, glints) and `alpha`
// (normal blending: puffs, dust, feathers, droplets, hearts). Each pool is ONE instanced draw call; dead particles are
// swap-removed so the live set stays contiguous (instanceCount = live). No allocations per frame.
import * as THREE from 'three';
import { FOG_FACTOR, SHAPES, OUTPUT, fogUniforms, fxShaderMaterial } from '../ppk/fx/shaders.js';
import { setColor } from '../ppk/fx/util.js';

/** Sprite shapes (fxShape in shaders.js). */
export const SHAPE = Object.freeze({ SOFT: 0, PUFF: 1, STAR4: 2, STAR5: 3, RING: 4, SPARK: 5, HEART: 6, FEATHER: 7, DROPLET: 8, SHARD: 9, STAR8: 10, FISH: 11, CONFETTI: 12, PLUS: 13 });
/** Alpha-over-life curves. */
export const FADE = Object.freeze({ LINEAR: 0, POP: 1, HOLD: 2, TWINKLE: 3, IN_OUT: 4 });
/** Size-over-life curves (size0 → size1). */
export const GROW = Object.freeze({ LINEAR: 0, OUT: 1, BACK: 2, PULSE: 3 });

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iCol;      // rgb (HDR allowed), alpha
attribute vec4 iPar;      // size (m), stretch (≥ 1 → velocity aligned), rotation (rad), shape id
attribute vec3 iDir;      // world velocity (for stretched sparks)
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( iPos, 1.0 );
  vec2 corner = position.xy * 2.0;          // quad is ±0.5 → ±1
  vUv = corner;
  float size = iPar.x * 0.5;
  vec2 c;
  if ( iPar.y > 1.001 ) {
    vec3 vd = ( modelViewMatrix * vec4( iDir, 0.0 ) ).xyz;
    float l = length( vd.xy );
    vec2 ax = l > 1e-5 ? vd.xy / l : vec2( 0.0, 1.0 );
    vec2 ay = vec2( -ax.y, ax.x );
    c = ax * corner.y * iPar.y + ay * corner.x;
  } else {
    // CONFETTI (shape 12): iPar.y (0..1) is the paper's flip, squashing its width before the spin (ART §8.6)
    vec2 k = abs( iPar.w - 12.0 ) < 0.5 ? vec2( corner.x * max( 0.08, iPar.y ), corner.y ) : corner;
    float cs = cos( iPar.z ), sn = sin( iPar.z );
    c = vec2( cs * k.x - sn * k.y, sn * k.x + cs * k.y );
  }
  mvPosition.xy += c * size;
  // never fill the lens: fade sprites that are almost touching the camera
  vCol = iCol;
  vCol.a *= smoothstep( 0.15, 0.7 + iPar.x * 2.5, -mvPosition.z );   // bigger sprites fade out further from the lens
  vShape = iPar.w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = (additive) => /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
#include <fog_pars_fragment>
${FOG_FACTOR}
${SHAPES}
void main() {
  vec2 sh = fxShape( vShape, vUv );
  float a = sh.x * vCol.a;
  if ( a < 0.004 ) discard;
  vec3 col = vCol.rgb * sh.y;
  float f = fxFog();
  ${additive ? 'gl_FragColor = vec4( col * a * ( 1.0 - f ), 1.0 );' : 'gl_FragColor = vec4( mix( col, fxFogColor(), f ), a );'}
  ${OUTPUT}
}`;

let _quad = null;
function quadGeometry() {
  if (_quad) return _quad;
  _quad = new THREE.PlaneGeometry(1, 1);
  return _quad;
}

/** Reusable spawn descriptor (avoid allocating per particle). */
export function particleSpec() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, size0: 0.2, size1: 0.2, grow: GROW.LINEAR, rot: 0, spin: 0,
    gravity: 0, drag: 0, r: 1, g: 1, b: 1, a: 1, intensity: 1, shape: SHAPE.SOFT, stretch: 1, fade: FADE.LINEAR, floor: -Infinity, bounce: 0.3 };
}

/** One pool = one instanced mesh. */
export class ParticlePool {
  /** @param {{ capacity: number, additive: boolean, name: string, renderOrder?: number }} o */
  constructor({ capacity, additive, name, renderOrder = 5 }) {
    const n = (this.capacity = capacity);
    this.additive = additive;
    this.limit = capacity;
    this.count = 0;
    // simulation state (struct of arrays)
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size0 = new Float32Array(n); this.size1 = new Float32Array(n); this.grow = new Uint8Array(n);
    this.rot = new Float32Array(n); this.spin = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.col = new Float32Array(n * 4); this.shape = new Float32Array(n); this.stretch = new Float32Array(n);
    this.fade = new Uint8Array(n); this.floor = new Float32Array(n); this.bounce = new Float32Array(n);
    this.seed = new Float32Array(n);   // per-particle phase (the confetti flip)
    /** Low tier: confetti stays flat, no flip (ART §8.6) */
    this.flat = false;
    // GPU attributes
    const g = new THREE.InstancedBufferGeometry();
    const q = quadGeometry();
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aDir = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar); g.setAttribute('iDir', this.aDir);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: `fx.particles.${name}`, vertexShader: VERT, fragmentShader: FRAG(additive), uniforms: fogUniforms(), fog: true,
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = `fx.particles.${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
  }

  /** Spawn one particle from a spec; returns its slot or -1 when the pool is at its quality limit. */
  spawn(s) {
    if (this.count >= this.limit) return -1;
    const i = this.count++, i3 = i * 3, i4 = i * 4;
    this.pos[i3] = s.x; this.pos[i3 + 1] = s.y; this.pos[i3 + 2] = s.z;
    this.vel[i3] = s.vx; this.vel[i3 + 1] = s.vy; this.vel[i3 + 2] = s.vz;
    this.age[i] = 0; this.life[i] = Math.max(0.016, s.life);
    this.size0[i] = s.size0; this.size1[i] = s.size1; this.grow[i] = s.grow;
    this.rot[i] = s.rot; this.spin[i] = s.spin; this.grav[i] = s.gravity; this.drag[i] = s.drag;
    const k = s.intensity;
    this.col[i4] = s.r * k; this.col[i4 + 1] = s.g * k; this.col[i4 + 2] = s.b * k; this.col[i4 + 3] = s.a;
    this.shape[i] = s.shape; this.stretch[i] = s.stretch; this.fade[i] = s.fade; this.floor[i] = s.floor; this.bounce[i] = s.bounce;
    this.seed[i] = (i * 0.618034 + s.rot * 0.1591549) % 1;
    return i;
  }

  _kill(i) {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3, l3 = last * 3, i4 = i * 4, l4 = last * 4;
    for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[l3 + k]; this.vel[i3 + k] = this.vel[l3 + k]; }
    for (let k = 0; k < 4; k++) this.col[i4 + k] = this.col[l4 + k];
    this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.size0[i] = this.size0[last]; this.size1[i] = this.size1[last];
    this.grow[i] = this.grow[last]; this.rot[i] = this.rot[last]; this.spin[i] = this.spin[last]; this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last]; this.shape[i] = this.shape[last]; this.stretch[i] = this.stretch[last]; this.fade[i] = this.fade[last];
    this.floor[i] = this.floor[last]; this.bounce[i] = this.bounce[last]; this.seed[i] = this.seed[last];
  }

  /** Advance the simulation by dt and upload the live set. */
  update(dt) {
    const P = this.pos, V = this.vel, aP = this.aPos.array, aC = this.aCol.array, aR = this.aPar.array, aD = this.aDir.array;
    let i = 0;
    while (i < this.count) {
      const age = (this.age[i] += dt), life = this.life[i];
      if (age >= life) { this._kill(i); continue; }
      const i3 = i * 3, i4 = i * 4;
      if (dt > 0) {
        V[i3 + 1] -= this.grav[i] * dt;
        const d = this.drag[i];
        if (d > 0) { const k = Math.exp(-d * dt); V[i3] *= k; V[i3 + 1] *= k; V[i3 + 2] *= k; }
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        if (P[i3 + 1] < this.floor[i]) {
          P[i3 + 1] = this.floor[i];
          const b = this.bounce[i];
          V[i3 + 1] = Math.abs(V[i3 + 1]) * b; V[i3] *= 0.6; V[i3 + 2] *= 0.6; this.spin[i] *= 0.5;
        }
        this.rot[i] += this.spin[i] * dt;
      }
      const u = age / life;
      // size curve
      let gs;
      switch (this.grow[i]) {
        case GROW.OUT: gs = 1 - (1 - u) * (1 - u) * (1 - u); break;
        case GROW.BACK: { const t = u - 1; gs = 1 + 2.70158 * t * t * t + 1.70158 * t * t; break; }
        case GROW.PULSE: gs = Math.sin(Math.min(1, u * 1.15) * Math.PI); break;
        default: gs = u;
      }
      const size = this.size0[i] + (this.size1[i] - this.size0[i]) * gs;
      // alpha curve
      let fa;
      switch (this.fade[i]) {
        case FADE.POP: fa = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88; break;
        case FADE.HOLD: fa = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45; break;
        case FADE.TWINKLE: fa = (1 - u) * (0.55 + 0.45 * Math.sin(age * 31 + i * 1.7)); break;
        case FADE.IN_OUT: fa = Math.sin(u * Math.PI); break;
        default: fa = 1 - u;
      }
      aP[i3] = P[i3]; aP[i3 + 1] = P[i3 + 1]; aP[i3 + 2] = P[i3 + 2];
      aD[i3] = V[i3]; aD[i3 + 1] = V[i3 + 1]; aD[i3 + 2] = V[i3 + 2];
      const C = this.col;
      aC[i4] = C[i4]; aC[i4 + 1] = C[i4 + 1]; aC[i4 + 2] = C[i4 + 2]; aC[i4 + 3] = C[i4 + 3] * (fa < 0 ? 0 : fa);
      let st = this.stretch[i];
      if (this.shape[i] === SHAPE.CONFETTI) st = this.flat ? 1 : Math.abs(Math.cos(age * 9 + this.seed[i] * 6.2831853));
      else if (st > 1) { const sp = Math.hypot(V[i3], V[i3 + 1], V[i3 + 2]); st = 1 + (st - 1) * Math.min(1, sp / 6); if (st < 1.01) st = 1.01; }
      aR[i4] = size > 0 ? size : 0; aR[i4 + 1] = st; aR[i4 + 2] = this.rot[i]; aR[i4 + 3] = this.shape[i];
      i++;
    }
    const n = this.count;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) { upload(this.aPos, n * 3); upload(this.aCol, n * 4); upload(this.aPar, n * 4); upload(this.aDir, n * 3); }
  }

  clear() { this.count = 0; this.geometry.instanceCount = 0; this.mesh.visible = false; }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

const _c = new THREE.Color();
const _d = new THREE.Vector3();

/**
 * The particle manager: two pools plus emitter helpers used by bursts, juice and holy fx.
 * `rng` is fx's own forked stream (visual variety stays deterministic in ?test runs).
 */
export class Particles {
  /** @param {{ rng: () => number, groundY?: (x:number, z:number, fb:number) => number }} o */
  constructor({ rng, groundY = null }) {
    this.rng = rng;
    this.groundY = groundY;
    this.add = new ParticlePool({ capacity: 1200, additive: true, name: 'add', renderOrder: 7 });
    this.alpha = new ParticlePool({ capacity: 800, additive: false, name: 'alpha', renderOrder: 6 });
    this.spec = particleSpec();
    /** PERF `perf.particleScale` / ART §8.6 "Low tier: counts ×0.5": every burst count is scaled by this */
    this.countScale = 1;
  }

  /** Quality tier switches: the burst count multiplier and flat confetti (Low). */
  setTier({ countScale = 1, flat = false } = {}) {
    this.countScale = Math.max(0.1, Math.min(1, countScale));
    this.add.flat = this.alpha.flat = !!flat;
  }

  /** A burst count under the tier's scale (never below 1 for a requested burst). */
  scaled(n) { return n > 0 ? Math.max(1, Math.round(n * this.countScale)) : 0; }

  attach(scene) { scene.add(this.alpha.mesh, this.add.mesh); }

  /** Quality cap: `total` particles split 60 / 40 between the additive and alpha pools. */
  setBudget(total) {
    const t = Math.max(100, total | 0);
    this.add.limit = Math.min(this.add.capacity, Math.round(t * 0.6));
    this.alpha.limit = Math.min(this.alpha.capacity, Math.round(t * 0.4));
  }

  get live() { return this.add.count + this.alpha.count; }

  update(dt) { this.add.update(dt); this.alpha.update(dt); }

  clear() { this.add.clear(); this.alpha.clear(); }

  dispose() { this.add.dispose(); this.alpha.dispose(); }

  /** Reset and return the shared spec (fill it, then call `emit`). */
  begin() {
    const s = this.spec;
    s.vx = s.vy = s.vz = 0; s.rot = 0; s.spin = 0; s.gravity = 0; s.drag = 0; s.a = 1; s.intensity = 1; s.stretch = 1;
    s.grow = GROW.LINEAR; s.fade = FADE.LINEAR; s.floor = -Infinity; s.bounce = 0.3; s.shape = SHAPE.SOFT;
    return s;
  }

  emit(additive) { return (additive ? this.add : this.alpha).spawn(this.spec); }

  /** Random unit vector inside a cone around `dir` (half-angle `spread` rad; spread ≥ π = sphere), into `out`. */
  randDir(out, dir, spread) {
    const r = this.rng;
    if (!dir || spread >= Math.PI) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      return out.set(Math.cos(a) * s, u, Math.sin(a) * s);
    }
    const cosMax = Math.cos(spread), z = cosMax + (1 - cosMax) * r(), s = Math.sqrt(Math.max(0, 1 - z * z)), a = r() * Math.PI * 2;
    // basis around dir
    const dx = dir.x, dy = dir.y, dz = dir.z;
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) { ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const cx = Math.cos(a) * s, cy = Math.sin(a) * s;
    return out.set(ux * cx + vx * cy + dx * z, uy * cx + vy * cy + dy * z, uz * cx + vz * cy + dz * z).normalize();
  }

  /**
   * Generic burst: `n` particles from `pos`, speed range, cone around `dir`.
   * @param {object} o  { additive, n, shape, color, intensity, size:[a,b], sizeEnd (mul), life:[a,b], speed:[a,b], dir, spread,
   *                      gravity, drag, spin, stretch, fade, grow, jitter (m), up (added vy), floor (bool),
   *                      exact (true: ignore the tier's count scale) }
   */
  burst(pos, o) {
    const r = this.rng, n = o.exact ? (o.n ?? 6) : this.scaled(o.n ?? 6);
    setColor(_c, o.color ?? 0xffffff);
    const floorY = o.floor ? (this.groundY?.(pos.x, pos.z, pos.y - 10) ?? -Infinity) + (o.floorLift ?? 0.02) : -Infinity;
    for (let k = 0; k < n; k++) {
      const s = this.begin();
      const j = o.jitter ?? 0;
      s.x = pos.x + (r() * 2 - 1) * j; s.y = pos.y + (r() * 2 - 1) * j * (o.jitterY ?? 1); s.z = pos.z + (r() * 2 - 1) * j;
      this.randDir(_d, o.dir, o.spread ?? Math.PI);
      const sp = range(r, o.speed ?? [1, 2]);
      s.vx = _d.x * sp; s.vy = _d.y * sp + (o.up ?? 0); s.vz = _d.z * sp;
      if (o.flat) { s.vy = (o.up ?? 0) + (r() * 2 - 1) * 0.2; }
      s.life = range(r, o.life ?? [0.3, 0.5]);
      s.size0 = range(r, o.size ?? [0.1, 0.2]); s.size1 = s.size0 * (o.sizeEnd ?? 1);
      s.grow = o.grow ?? GROW.LINEAR; s.fade = o.fade ?? FADE.LINEAR;
      s.rot = r() * Math.PI * 2; s.spin = (r() * 2 - 1) * (o.spin ?? 0);
      s.gravity = o.gravity ?? 0; s.drag = o.drag ?? 0;
      s.r = _c.r; s.g = _c.g; s.b = _c.b; s.a = o.alpha ?? 1; s.intensity = o.intensity ?? 1;
      if (o.tint) { const t = (r() * 2 - 1) * o.tint; s.r *= 1 + t; s.g *= 1 + t; s.b *= 1 + t; }
      s.shape = o.shape ?? SHAPE.SOFT; s.stretch = o.stretch ?? 1;
      s.floor = floorY; s.bounce = o.bounce ?? 0.3;
      this.emit(!!o.additive);
    }
  }

  /** A single sprite that stays put (flashes, rings). */
  single(pos, o) {
    setColor(_c, o.color ?? 0xffffff);
    const s = this.begin();
    s.x = pos.x; s.y = pos.y; s.z = pos.z;
    s.vx = o.vx ?? 0; s.vy = o.vy ?? 0; s.vz = o.vz ?? 0;
    s.life = o.life ?? 0.2; s.size0 = o.size0 ?? 0.5; s.size1 = o.size1 ?? s.size0;
    s.grow = o.grow ?? GROW.OUT; s.fade = o.fade ?? FADE.LINEAR; s.rot = o.rot ?? 0; s.spin = o.spin ?? 0;
    s.r = _c.r; s.g = _c.g; s.b = _c.b; s.a = o.alpha ?? 1; s.intensity = o.intensity ?? 1;
    s.shape = o.shape ?? SHAPE.SOFT; s.stretch = 1;
    return this.emit(o.additive !== false);
  }

  /** `n` sprites on a horizontal ring of radius r0 moving outward (dust rings, shockwaves). */
  ring(pos, o) {
    const r = this.rng, n = this.scaled(o.n ?? 10);
    setColor(_c, o.color ?? 0xffffff);
    const floorY = o.floor ? (this.groundY?.(pos.x, pos.z, pos.y - 10) ?? -Infinity) + 0.02 : -Infinity;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.3, ca = Math.sin(a), sa = Math.cos(a);
      const s = this.begin();
      const r0 = o.r0 ?? 0.2, sp = range(r, o.speed ?? [2, 3]);
      s.x = pos.x + ca * r0; s.y = pos.y + (o.y ?? 0.05); s.z = pos.z + sa * r0;
      s.vx = ca * sp; s.vy = o.up ?? 0.3; s.vz = sa * sp;
      s.life = range(r, o.life ?? [0.4, 0.6]); s.size0 = range(r, o.size ?? [0.25, 0.35]); s.size1 = s.size0 * (o.sizeEnd ?? 2);
      s.grow = GROW.OUT; s.fade = o.fade ?? FADE.LINEAR; s.drag = o.drag ?? 3.5; s.gravity = o.gravity ?? 0;
      s.rot = r() * 6.283; s.spin = (r() * 2 - 1) * (o.spin ?? 1);
      s.r = _c.r; s.g = _c.g; s.b = _c.b; s.a = o.alpha ?? 0.8; s.intensity = o.intensity ?? 1;
      if (o.tint) { const t = (r() * 2 - 1) * o.tint; s.r *= 1 + t; s.g *= 1 + t; s.b *= 1 + t; }
      s.shape = o.shape ?? SHAPE.PUFF; s.floor = floorY;
      this.emit(!!o.additive);
    }
  }
}

function range(r, v) { return Array.isArray(v) ? v[0] + (v[1] - v[0]) * r() : v; }

/** Mark the first `count` floats of a dynamic attribute for upload. */
export function upload(attr, count) {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, count);
  attr.needsUpdate = true;
}

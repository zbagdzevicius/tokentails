// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/Marks.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/Marks.js  (owner: fx) — one instanced batch of camera-facing marks that are rebuilt every frame from live state:
// telegraph glints / stars / "!" / "!!" / swirls / glows, dizzy stars, holy halos. One draw call for all of them.
// Marks may be HDR (colour > 1) so bloom picks up glints. Shapes 0–11 are the shared particle shapes (shaders.js);
// 20+ are mark-only shapes with an ink outline for readability against bright fog (art.md §13 ink #3A2A1F).
import * as THREE from 'three';
import { FOG_FACTOR, SHAPES, OUTPUT, fogUniforms, fxShaderMaterial } from './shaders.js';
import { upload } from '../../fx/Particles.js';

export const MARK = Object.freeze({ SOFT: 0, STAR4: 2, STAR5: 3, RING: 4, STAR8: 10, EXCL: 20, EXCL2: 21, SWIRL: 22, HALO: 23 });

/** Screen-space limits: a mark never covers more than `maxFrac` of the screen height, and fades in over `nearFade`
 *  (view depth, m) so a glint / "!" on an enemy right in front of the lens never swallows the frame. */
export const MARK_SCREEN = Object.freeze({ maxFrac: 0.06, nearFade: [0.35, 1.6] });

/** CPU mirror of the vertex-shader cap (pure; unit-tested). `p11` = projectionMatrix[1][1]. */
export function capMarkSize(size, depth, p11, aspect = 1, maxFrac = MARK_SCREEN.maxFrac) {
  return Math.min(size, (2 * maxFrac * Math.max(1e-3, depth)) / (p11 * Math.max(1, aspect)));
}

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec4 iPar;     // size, phase/rotation, shape, pattern (0 none, 1 stripes, 2 dots)
attribute float iAspect; // height / width
uniform float uMaxFrac;   // cap on a mark's projected height (fraction of the screen height)
uniform vec2 uNearFade;   // view-depth range (m) over which marks fade in from the camera
uniform float uViewH;     // viewport height (CSS px) for constant-screen-size marks (size < 0 = −px)
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vPar;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4( iPos, 1.0 );
  vec2 corner = position.xy * 2.0;
  vUv = corner;
  float shape = iPar.z;
  float size = iPar.x, fade = 1.0;
  if ( size < 0.0 ) {                              // CONTROLS_SPEC §8.2.3: a constant screen size (px), never capped
    float depth = max( 1e-3, -mvPosition.z );
    size = projectionMatrix[2][3] < -0.5 ? -size * 2.0 * depth / ( projectionMatrix[1][1] * max( uViewH, 1.0 ) * max( 1.0, iAspect ) )
                                         : -size * 2.0 / ( projectionMatrix[1][1] * max( uViewH, 1.0 ) );
  } else if ( projectionMatrix[2][3] < -0.5 ) {    // perspective: marks are world-sized, so cap them on screen
    float depth = max( 1e-3, -mvPosition.z );
    // halos and jeer rings are meant to read big (silhouette rims / shock rings): looser cap
    float frac = ( shape > 22.5 || abs( shape - 4.0 ) < 0.5 ) ? uMaxFrac * 4.0 : uMaxFrac;
    float capSize = 2.0 * frac * depth / ( projectionMatrix[1][1] * max( 1.0, iAspect ) );
    size = min( size, capSize );
    fade = smoothstep( uNearFade.x, uNearFade.y, depth );
  }
  float rot = shape < 19.5 ? iPar.y : 0.0;   // "!", swirl and halo stay upright (the swirl spins in the fragment)
  float cs = cos( rot ), sn = sin( rot );
  vec2 c = vec2( cs * corner.x - sn * corner.y, sn * corner.x + cs * corner.y );
  c.y *= iAspect;
  mvPosition.xy += c * size * 0.5;
  vCol = vec4( iCol.rgb, iCol.a * fade );
  vPar = iPar.yzw;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
varying vec2 vUv;
varying vec4 vCol;
varying vec3 vPar;     // phase, shape, pattern
#include <fog_pars_fragment>
${FOG_FACTOR}
${SHAPES}
float sdBox( vec2 p, vec2 b ) { vec2 d = abs( p ) - b; return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 ); }
// "!" in a [-1, 1] box: tapered bar + dot
float sdExcl( vec2 p ) {
  vec2 q = p - vec2( 0.0, 0.22 );
  float w = 0.17 + 0.07 * clamp( q.y / 0.62, 0.0, 1.0 );
  float bar = sdBox( q, vec2( w, 0.56 ) ) - 0.06;
  float dot_ = length( p - vec2( 0.0, -0.66 ) ) - 0.17;
  return min( bar, dot_ );
}
void main() {
  float shape = vPar.y, pattern = vPar.z;
  vec3 col = vCol.rgb;
  float a;
  vec3 ink = vec3( 0.045, 0.025, 0.017 );
  if ( shape < 19.5 ) {
    vec2 sh = fxShape( shape, vUv );
    a = sh.x;
    col *= sh.y;
  } else if ( shape < 21.5 ) {                       // EXCL / EXCL2 with an ink outline
    float sd;
    if ( shape < 20.5 ) sd = sdExcl( vUv * vec2( 1.0, 1.0 ) );
    else {
      vec2 p = vUv;
      float jag = sin( p.y * 26.0 ) * 0.025;        // jagged edge for the unblockable "!!"
      float s1 = sdExcl( ( p - vec2( -0.42, 0.0 ) ) * vec2( 1.7, 1.0 ) * mat2( 0.99, -0.12, 0.12, 0.99 ) ) / 1.7;
      float s2 = sdExcl( ( p - vec2( 0.42, 0.0 ) ) * vec2( 1.7, 1.0 ) * mat2( 0.99, 0.12, -0.12, 0.99 ) ) / 1.7;
      sd = min( s1, s2 ) + jag;
    }
    float fill = fxAA( sd, 0.03 );
    float outline = fxAA( sd - 0.13, 0.03 );
    a = outline;
    col = mix( ink, col, fill );
    if ( pattern > 0.5 && pattern < 1.5 ) col *= mix( 1.0, 0.55, fill * step( 0.5, fract( ( vUv.x + vUv.y ) * 3.5 ) ) );
  } else if ( shape < 22.5 ) {                       // SWIRL (grab)
    float r = length( vUv ), ang = atan( vUv.y, vUv.x );
    float band = fract( ang / 6.2831853 * 3.0 + r * 2.2 - vPar.x );
    float arm = 1.0 - smoothstep( 0.0, 0.32, abs( band - 0.5 ) * 2.0 * ( 0.6 + r ) );
    a = arm * ( 1.0 - smoothstep( 0.78, 1.0, r ) ) * smoothstep( 0.08, 0.3, r );
    a = max( a, exp( -r * r * 14.0 ) * 0.7 );
  } else {                                           // HALO: soft vertical glow (holy aura fallback / red body glow)
    vec2 p = vUv;
    float d2 = p.x * p.x + p.y * p.y;
    a = exp( -d2 * 3.2 ) * ( 1.0 - smoothstep( 0.75, 1.0, sqrt( d2 ) ) );
  }
  if ( shape < 19.5 && pattern > 1.5 ) {             // dots overlay (gold, colour-blind patterns)
    vec2 g = fract( vUv * 3.0 ) - 0.5;
    col = mix( col, col * 0.45, ( 1.0 - smoothstep( 0.16, 0.22, length( g ) ) ) * step( 0.2, a ) );
  }
  a *= vCol.a;
  if ( a < 0.004 ) discard;
  col = mix( col, fxFogColor(), fxFog() * 0.4 );
  gl_FragColor = vec4( col, a );
  ${OUTPUT}
}`;

export class Marks {
  /**
   * @param {number} [capacity]
   * @param {{ overlay?: boolean, name?: string }} [opts] overlay: drawn on top of everything (depthTest off,
   *   renderOrder 10): the iso telegraph glints and "!" (CONTROLS_SPEC §8.2.3)
   */
  constructor(capacity = 96, opts = {}) {
    this.capacity = capacity;
    this.count = 0;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aAsp = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar); g.setAttribute('iAspect', this.aAsp);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = fxShaderMaterial({
      name: 'fx.marks', vertexShader: VERT, fragmentShader: FRAG, fog: true,
      uniforms: { ...fogUniforms(), uMaxFrac: { value: MARK_SCREEN.maxFrac }, uNearFade: { value: new THREE.Vector2(...MARK_SCREEN.nearFade) },
        uViewH: { value: 720 } },
      transparent: true, depthWrite: false, depthTest: !opts.overlay,
    });
    if (opts.overlay) this.material.name = 'fx.marks.overlay';
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = opts.name ?? (opts.overlay ? 'fx.marks.overlay' : 'fx.marks');
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = opts.overlay ? 10 : 9;
    this.mesh.visible = false;
    this._tmp = new THREE.Color();
  }

  /** Start a frame (marks are rebuilt every frame). `viewH` = the viewport height in CSS px (pixel-sized marks). */
  begin(viewH) { this.count = 0; if (viewH > 0) this.material.uniforms.uViewH.value = viewH; }

  /**
   * Add one mark. `color` is a THREE.Color (linear; HDR via `intensity`). `size` in metres, or NEGATIVE for a
   * constant on-screen height in CSS px (−28 = a 28 px glint at any distance and zoom).
   * @returns {number} slot or -1 when full
   */
  push(x, y, z, size, shape, color, intensity = 1, alpha = 1, phase = 0, pattern = 0, aspect = 1) {
    if (this.count >= this.capacity || !(alpha > 0.002) || !(size !== 0) || !Number.isFinite(size)) return -1;
    const i = this.count++, i3 = i * 3, i4 = i * 4;
    const P = this.aPos.array, C = this.aCol.array, R = this.aPar.array;
    P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z;
    C[i4] = color.r * intensity; C[i4 + 1] = color.g * intensity; C[i4 + 2] = color.b * intensity; C[i4 + 3] = alpha;
    R[i4] = size; R[i4 + 1] = phase; R[i4 + 2] = shape; R[i4 + 3] = pattern;
    this.aAsp.array[i] = aspect;
    return i;
  }

  /** Upload the frame's marks. */
  end() {
    const n = this.count;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) { upload(this.aPos, n * 3); upload(this.aCol, n * 4); upload(this.aPar, n * 4); upload(this.aAsp, n); }
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
